use crate::db::DbPool;
use crate::email::{send_class_reminder_email, EmailConfig};
use chrono::Utc;
use chrono_tz::America::New_York;
use rusqlite::params;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

/// Minimum seconds between reminder checks (30 minutes).
const COOLDOWN_SECS: u64 = 30 * 60;

/// Epoch-seconds timestamp of the last completed reminder check.
static LAST_CHECK_TIME: AtomicU64 = AtomicU64::new(0);

/// Prevents overlapping async reminder tasks.
static REMINDER_CHECK_RUNNING: AtomicBool = AtomicBool::new(false);

struct ReminderTarget {
    session_id: i64,
    session_title: String,
    friendly_date: String,
    start_time: Option<String>,
    end_time: Option<String>,
    location: String,
    location_address: Option<String>,
    host_name: Option<String>,
    materials_needed: Option<String>,
    supplies: Vec<(String, Option<String>)>,
    cost_amount: Option<f64>,
    cost_details: Option<String>,
    notes: Option<String>,
    user_id: i64,
    user_email: String,
    user_name: String,
}

fn now_epoch_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Calculate tomorrow's date in Eastern time (handles EST/EDT automatically).
fn tomorrow_eastern() -> String {
    let now_eastern = Utc::now().with_timezone(&New_York);
    let tomorrow = now_eastern.date_naive() + chrono::Duration::days(1);
    tomorrow.format("%Y-%m-%d").to_string()
}

// ── Recipient helpers ──
// Each is self-contained: prepares its own statement, collects into Vec,
// and drops the statement before returning, avoiding borrow checker issues.

/// Tier 1: Parents who confirmed an RSVP for this session.
fn confirmed_rsvp_parents(conn: &rusqlite::Connection, session_id: i64) -> Vec<(i64, String, String)> {
    let mut stmt = match conn.prepare(
        "SELECT DISTINCT u.id, u.email, u.display_name
         FROM rsvps r
         JOIN users u ON r.parent_id = u.id
         WHERE r.session_id = ?1
           AND r.status = 'confirmed'
           AND u.active = 1",
    ) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[reminders] RSVP query error for session {}: {}", session_id, e);
            return Vec::new();
        }
    };
    let result = match stmt.query_map(params![session_id], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
    }) {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(e) => {
            eprintln!("[reminders] RSVP fetch error for session {}: {}", session_id, e);
            Vec::new()
        }
    };
    result
}

/// Tier 2: Parents of students in linked class groups + group teachers.
fn group_members_for_session(conn: &rusqlite::Connection, session_id: i64) -> Vec<(i64, String, String)> {
    let mut stmt = match conn.prepare(
        "SELECT DISTINCT u.id, u.email, u.display_name
         FROM class_session_groups csg
         JOIN class_group_members cgm ON csg.group_id = cgm.group_id
         JOIN student_parents sp ON cgm.student_id = sp.student_id
         JOIN users u ON sp.user_id = u.id
         WHERE csg.session_id = ?1 AND u.active = 1
         UNION
         SELECT DISTINCT u.id, u.email, u.display_name
         FROM class_session_groups csg
         JOIN class_group_teachers cgt ON csg.group_id = cgt.group_id
         JOIN users u ON cgt.user_id = u.id
         WHERE csg.session_id = ?1 AND u.active = 1",
    ) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[reminders] Group members query error for session {}: {}", session_id, e);
            return Vec::new();
        }
    };
    let result = match stmt.query_map(params![session_id, session_id], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
    }) {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(e) => {
            eprintln!("[reminders] Group members fetch error for session {}: {}", session_id, e);
            Vec::new()
        }
    };
    result
}

/// Tier 3: All active members (true fallback for unscoped events).
fn all_active_members(conn: &rusqlite::Connection, session_id: i64) -> Vec<(i64, String, String)> {
    let mut stmt = match conn.prepare(
        "SELECT u.id, u.email, u.display_name FROM users u WHERE u.active = 1",
    ) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[reminders] All-members query error for session {}: {}", session_id, e);
            return Vec::new();
        }
    };
    let result = match stmt.query_map([], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
    }) {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(e) => {
            eprintln!("[reminders] All-members fetch error for session {}: {}", session_id, e);
            Vec::new()
        }
    };
    result
}

/// Tier 2 → Tier 3 fallthrough: try group members, else all active members.
fn group_or_all_members(conn: &rusqlite::Connection, session_id: i64) -> Vec<(i64, String, String)> {
    let group = group_members_for_session(conn, session_id);
    if !group.is_empty() {
        group
    } else {
        all_active_members(conn, session_id)
    }
}

/// Send reminder emails/push for sessions happening tomorrow (Eastern time).
/// Uses `reminder_sent` flag per session to prevent duplicates.
/// Returns the number of notifications sent.
pub async fn send_upcoming_reminders(db: DbPool, email_config: EmailConfig, push_config: Option<crate::push::PushConfig>) -> usize {
    let tomorrow = tomorrow_eastern();
    println!("[reminders] Checking for sessions on {} (tomorrow Eastern)", tomorrow);

    // ── Phase 1: Gather all data from DB (synchronous, no .await) ──
    let (targets, session_ids) = {
        let conn = match db.get() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[reminders] DB pool error: {}", e);
                return 0;
            }
        };

        // Find sessions happening tomorrow that haven't had reminders sent.
        // Include both 'open' (unclaimed) and 'claimed' (hosted) sessions.
        // Exclude holidays and completed/closed sessions.
        let mut stmt = match conn.prepare(
            "SELECT cs.id, cs.title, cs.session_date, cs.start_time, cs.end_time,
                    COALESCE(cs.location_name, cs.host_address, 'TBD') as location,
                    COALESCE(st.rsvpable, 1) as rsvpable,
                    cs.host_id,
                    cs.materials_needed,
                    COALESCE(cs.location_address, cs.host_address) as full_address,
                    cs.cost_amount,
                    cs.cost_details,
                    cs.notes,
                    u.display_name as host_name
             FROM class_sessions cs
             LEFT JOIN session_types st ON cs.session_type_id = st.id
             LEFT JOIN users u ON cs.host_id = u.id
             WHERE cs.session_date = ?1
               AND cs.reminder_sent = 0
               AND cs.status IN ('open', 'claimed')
               AND (st.name IS NULL OR st.name != 'holiday')",
        ) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[reminders] Query prep error: {}", e);
                return 0;
            }
        };

        struct SessionInfo {
            id: i64,
            title: String,
            session_date: String,
            start_time: Option<String>,
            end_time: Option<String>,
            location: String,
            rsvpable: bool,
            host_id: Option<i64>,
            materials_needed: Option<String>,
            location_address: Option<String>,
            cost_amount: Option<f64>,
            cost_details: Option<String>,
            notes: Option<String>,
            host_name: Option<String>,
        }

        let sessions: Vec<SessionInfo> = match stmt.query_map(params![tomorrow], |row| {
            Ok(SessionInfo {
                id: row.get(0)?,
                title: row.get(1)?,
                session_date: row.get(2)?,
                start_time: row.get(3)?,
                end_time: row.get(4)?,
                location: row.get(5)?,
                rsvpable: row.get::<_, i32>(6)? != 0,
                host_id: row.get(7)?,
                materials_needed: row.get(8)?,
                location_address: row.get(9)?,
                cost_amount: row.get(10)?,
                cost_details: row.get(11)?,
                notes: row.get(12)?,
                host_name: row.get(13)?,
            })
        }) {
            Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
            Err(e) => {
                eprintln!("[reminders] Query error: {}", e);
                return 0;
            }
        };
        drop(stmt);

        if sessions.is_empty() {
            return 0;
        }

        println!("[reminders] Found {} session(s) needing reminders.", sessions.len());

        let mut targets: Vec<ReminderTarget> = Vec::new();
        let mut session_ids: Vec<i64> = Vec::new();

        for session in &sessions {
            session_ids.push(session.id);

            // Determine recipients using a three-tier cascade:
            //   1. If rsvpable and confirmed RSVPs exist → RSVP'd parents
            //   2. If session linked to class groups → group parents + teachers
            //   3. Fallback → all active members
            let recipients = if session.rsvpable {
                let rsvp_recipients = confirmed_rsvp_parents(&conn, session.id);
                if !rsvp_recipients.is_empty() {
                    rsvp_recipients
                } else {
                    group_or_all_members(&conn, session.id)
                }
            } else {
                group_or_all_members(&conn, session.id)
            };

            // Always include the host if assigned and not already in the list
            let mut final_recipients = recipients;
            if let Some(host_id) = session.host_id {
                if !final_recipients.iter().any(|(id, _, _)| *id == host_id) {
                    if let Ok(host) = conn.query_row(
                        "SELECT u.id, u.email, u.display_name FROM users u WHERE u.id = ?1 AND u.active = 1",
                        params![host_id],
                        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?)),
                    ) {
                        final_recipients.push(host);
                    }
                }
            }

            // Query supplies for this session
            let supplies: Vec<(String, Option<String>)> = {
                match conn.prepare(
                    "SELECT item_name, quantity FROM session_supplies WHERE session_id = ?1",
                ) {
                    Ok(mut supply_stmt) => {
                        match supply_stmt.query_map(params![session.id], |row| {
                            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
                        }) {
                            Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
                            Err(_) => Vec::new(),
                        }
                    }
                    Err(_) => Vec::new(),
                }
            };

            let friendly_date = format_friendly_date(&session.session_date);

            for (uid, email, name) in final_recipients {
                targets.push(ReminderTarget {
                    session_id: session.id,
                    session_title: session.title.clone(),
                    friendly_date: friendly_date.clone(),
                    start_time: session.start_time.clone(),
                    end_time: session.end_time.clone(),
                    location: session.location.clone(),
                    location_address: session.location_address.clone(),
                    host_name: session.host_name.clone(),
                    materials_needed: session.materials_needed.clone(),
                    supplies: supplies.clone(),
                    cost_amount: session.cost_amount,
                    cost_details: session.cost_details.clone(),
                    notes: session.notes.clone(),
                    user_id: uid,
                    user_email: email,
                    user_name: name,
                });
            }
        }

        (targets, session_ids)
    };
    // conn is dropped here — safe to .await below

    if targets.is_empty() {
        // Mark sessions as reminder-sent even if no recipients
        if let Ok(conn) = db.get() {
            for id in &session_ids {
                let _ = conn.execute(
                    "UPDATE class_sessions SET reminder_sent = 1 WHERE id = ?1",
                    params![id],
                );
            }
        }
        println!("[reminders] Sessions found but no recipients to notify.");
        return 0;
    }

    // ── Phase 2: Send emails (async) ──
    let mut total_sent = 0;
    for target in &targets {
        match send_class_reminder_email(
            &email_config,
            &target.user_email,
            &target.user_name,
            &target.session_title,
            &target.friendly_date,
            target.start_time.as_deref(),
            target.end_time.as_deref(),
            &target.location,
            target.location_address.as_deref(),
            target.host_name.as_deref(),
            target.materials_needed.as_deref(),
            &target.supplies,
            target.cost_amount,
            target.cost_details.as_deref(),
            target.notes.as_deref(),
            target.session_id,
        )
        .await
        {
            Ok(()) => {
                total_sent += 1;
                println!(
                    "[reminders] Sent reminder to {} for '{}'",
                    target.user_email, target.session_title
                );
            }
            Err(e) => {
                eprintln!(
                    "[reminders] Failed to send to {} for '{}': {}",
                    target.user_email, target.session_title, e
                );
            }
        }
    }

    // ── Phase 2b: Send push notifications ──
    if let Some(ref cfg) = push_config {
        for target in &targets {
            // Build a concise but informative push body
            let mut parts = vec![target.friendly_date.clone()];
            if let Some(ref t) = target.start_time {
                parts[0] = format!("{} at {}", parts[0], t);
            }
            if let Some(ref addr) = target.location_address {
                parts.push(addr.clone());
            } else if target.location != "TBD" {
                parts.push(target.location.clone());
            }
            if let Some(ref materials) = target.materials_needed {
                if !materials.is_empty() {
                    let short = if materials.chars().count() > 60 {
                        let truncated: String = materials.chars().take(57).collect();
                        format!("{}...", truncated)
                    } else {
                        materials.clone()
                    };
                    parts.push(format!("Bring: {}", short));
                }
            }
            let push_body = parts.join(" · ");

            crate::push::send_push_to_user(
                db.clone(), cfg.clone(), target.user_id, "reminders",
                &format!("Reminder: {} — Tomorrow", target.session_title),
                &push_body,
                &format!("/sessions/{}", target.session_id),
            ).await;
        }
    }

    // ── Phase 3: Mark sessions as reminder-sent ──
    if let Ok(conn) = db.get() {
        for id in &session_ids {
            let _ = conn.execute(
                "UPDATE class_sessions SET reminder_sent = 1 WHERE id = ?1",
                params![id],
            );
        }
    }

    println!("[reminders] Total reminders sent: {}", total_sent);
    total_sent
}

fn format_friendly_date(date_str: &str) -> String {
    if let Some((year, rest)) = date_str.split_once('-') {
        if let Some((month, day)) = rest.split_once('-') {
            let month_name = match month {
                "01" => "January",
                "02" => "February",
                "03" => "March",
                "04" => "April",
                "05" => "May",
                "06" => "June",
                "07" => "July",
                "08" => "August",
                "09" => "September",
                "10" => "October",
                "11" => "November",
                "12" => "December",
                _ => month,
            };
            let day_num = day.trim_start_matches('0');
            return format!("{} {}, {}", month_name, day_num, year);
        }
    }
    date_str.to_string()
}

/// Called from the request logger middleware on every `/api/` request.
///
/// Uses a 30-minute cooldown so we're not querying the DB on every request,
/// but still responsive enough that reminders go out promptly when the app
/// wakes up. The `reminder_sent` flag per session is the real dedup mechanism.
///
/// On first request after app startup, the cooldown is 0, so it runs immediately.
pub fn check_reminders_if_needed(db: DbPool, email_config: EmailConfig, push_config: Option<crate::push::PushConfig>) {
    let now = now_epoch_secs();
    let last = LAST_CHECK_TIME.load(Ordering::Relaxed);

    // Cooldown: skip if we checked recently
    if last > 0 && now.saturating_sub(last) < COOLDOWN_SECS {
        return;
    }

    // Prevent overlapping async tasks
    if REMINDER_CHECK_RUNNING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        return;
    }

    // Update the last-check timestamp now (before spawning) so other requests
    // see the cooldown immediately
    LAST_CHECK_TIME.store(now, Ordering::Relaxed);

    tokio::spawn(async move {
        let sent = send_upcoming_reminders(db, email_config, push_config).await;
        if sent > 0 {
            println!("[reminders] Reminder check completed. {} notifications sent.", sent);
        }
        REMINDER_CHECK_RUNNING.store(false, Ordering::SeqCst);
    });
}
