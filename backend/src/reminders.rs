use crate::db::DbPool;
use crate::email::{send_class_reminder_email, EmailConfig};
use rusqlite::params;
use std::sync::atomic::{AtomicBool, Ordering};

// Static flag to track if we've already checked today (in-process)
static REMINDER_CHECK_TODAY: AtomicBool = AtomicBool::new(false);

struct ReminderTarget {
    session_id: i64,
    session_title: String,
    friendly_date: String,
    start_time: Option<String>,
    end_time: Option<String>,
    location: String,
    parent_id: i64,
    parent_email: String,
    parent_name: String,
}

/// Send reminder emails for sessions happening tomorrow.
/// Returns the number of emails sent.
pub async fn send_upcoming_reminders(db: DbPool, email_config: EmailConfig, push_config: Option<crate::push::PushConfig>) -> usize {
    // ── Phase 1: Gather all data from DB (synchronous, no .await) ──
    let (targets, session_ids) = {
        let conn = match db.get() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[reminders] DB pool error: {}", e);
                return 0;
            }
        };

        // Find sessions happening tomorrow that haven't had reminders sent
        // Join session_types to know if the session is rsvpable
        let mut stmt = match conn.prepare(
            "SELECT cs.id, cs.title, cs.session_date, cs.start_time, cs.end_time,
                    COALESCE(cs.location_name, cs.host_address, 'TBD') as location,
                    COALESCE(st.rsvpable, 1) as rsvpable,
                    cs.host_id
             FROM class_sessions cs
             LEFT JOIN session_types st ON cs.session_type_id = st.id
             WHERE cs.session_date = date('now', '+1 day')
               AND cs.reminder_sent = 0
               AND cs.status = 'open'",
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
            host_id: Option<i64>,
        }

        let sessions: Vec<SessionInfo> = match stmt.query_map([], |row| {
            Ok(SessionInfo {
                id: row.get(0)?,
                title: row.get(1)?,
                session_date: row.get(2)?,
                start_time: row.get(3)?,
                end_time: row.get(4)?,
                location: row.get(5)?,
                host_id: row.get(7)?,
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
            println!("[reminders] No sessions tomorrow needing reminders.");
            return 0;
        }

        let mut targets: Vec<ReminderTarget> = Vec::new();
        let mut session_ids: Vec<i64> = Vec::new();

        for session in &sessions {
            session_ids.push(session.id);

            // Check if this session has any confirmed RSVPs
            let rsvp_count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM rsvps WHERE session_id = ?1 AND status = 'confirmed'",
                    params![session.id],
                    |row| row.get(0),
                )
                .unwrap_or(0);

            let recipients: Vec<(i64, String, String)> = if rsvp_count > 0 {
                // Session has RSVPs — only send to confirmed RSVP parents
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
                        eprintln!("[reminders] RSVP query error for session {}: {}", session.id, e);
                        continue;
                    }
                };
                let result: Vec<_> = match stmt.query_map(params![session.id], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
                }) {
                    Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
                    Err(e) => {
                        eprintln!("[reminders] RSVP fetch error for session {}: {}", session.id, e);
                        continue;
                    }
                };
                result
            } else {
                // No RSVPs — send to all active members
                let mut stmt = match conn.prepare(
                    "SELECT u.id, u.email, u.display_name
                     FROM users u
                     WHERE u.active = 1",
                ) {
                    Ok(s) => s,
                    Err(e) => {
                        eprintln!("[reminders] All-members query error for session {}: {}", session.id, e);
                        continue;
                    }
                };
                let result: Vec<_> = match stmt.query_map([], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
                }) {
                    Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
                    Err(e) => {
                        eprintln!("[reminders] All-members fetch error for session {}: {}", session.id, e);
                        continue;
                    }
                };
                result
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

            let friendly_date = format_friendly_date(&session.session_date);

            for (uid, email, name) in final_recipients {
                targets.push(ReminderTarget {
                    session_id: session.id,
                    session_title: session.title.clone(),
                    friendly_date: friendly_date.clone(),
                    start_time: session.start_time.clone(),
                    end_time: session.end_time.clone(),
                    location: session.location.clone(),
                    parent_id: uid,
                    parent_email: email,
                    parent_name: name,
                });
            }
        }

        (targets, session_ids)
    };
    // conn is dropped here — safe to .await below

    if targets.is_empty() {
        // Mark sessions as reminder-sent even if no RSVPs
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
            &target.parent_email,
            &target.parent_name,
            &target.session_title,
            &target.friendly_date,
            target.start_time.as_deref(),
            target.end_time.as_deref(),
            &target.location,
            target.session_id,
        )
        .await
        {
            Ok(()) => {
                total_sent += 1;
                println!(
                    "[reminders] Sent reminder to {} for '{}'",
                    target.parent_email, target.session_title
                );
            }
            Err(e) => {
                eprintln!(
                    "[reminders] Failed to send to {} for '{}': {}",
                    target.parent_email, target.session_title, e
                );
            }
        }
    }

    // ── Phase 2b: Send push notifications ──
    if let Some(ref cfg) = push_config {
        for target in &targets {
            crate::push::send_push_to_user(
                db.clone(), cfg.clone(), target.parent_id, "reminders",
                &format!("Reminder: {} — Tomorrow", target.session_title),
                &format!("{} at {}", target.friendly_date, target.start_time.as_deref().unwrap_or("TBD")),
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

/// Check if reminders should be sent today (on first request of the day).
/// This is designed to work reliably with Fly.io's auto-stop behavior.
///
/// Uses a two-layer approach:
/// 1. In-process flag (REMINDER_CHECK_TODAY) for quick checks within a single instance
/// 2. Database tracking (app_settings table) to ensure checks survive machine restarts
///
/// On the first API request of each day, spawns an async task to send reminders.
pub fn check_reminders_if_needed(db: DbPool, email_config: EmailConfig, push_config: Option<crate::push::PushConfig>) {
    // Quick check: have we already tried to check today in THIS process?
    if REMINDER_CHECK_TODAY.load(Ordering::Relaxed) {
        return;
    }

    // Synchronous DB check: has the app already checked today?
    let should_check = {
        let conn = match db.get() {
            Ok(c) => c,
            Err(_) => return, // DB error, skip
        };

        let today = {
            use std::time::SystemTime;
            let now = SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap_or_default();
            let secs = now.as_secs();
            // Calculate days since epoch for date comparison
            let days_since_epoch = secs / 86400;
            days_since_epoch
        };

        // Get the last check date stored in DB
        let last_check: Option<String> = conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = 'last_reminder_check'",
                [],
                |row| row.get(0),
            )
            .ok();

        let should_check = match last_check {
            None => {
                // Never checked before
                true
            }
            Some(stored_days_str) => {
                // Parse the stored days-since-epoch value and compare
                stored_days_str
                    .parse::<u64>()
                    .map(|stored_days| stored_days < today)
                    .unwrap_or(true)
            }
        };

        should_check
    };

    if !should_check {
        // Already checked today (in DB)
        REMINDER_CHECK_TODAY.store(true, Ordering::Relaxed);
        return;
    }

    // Mark that we've initiated a check today (to prevent multiple simultaneous checks)
    REMINDER_CHECK_TODAY.store(true, Ordering::Relaxed);

    // Update the DB with today's date
    {
        let today = {
            use std::time::SystemTime;
            let now = SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap_or_default();
            let secs = now.as_secs();
            let days_since_epoch = secs / 86400;
            days_since_epoch.to_string()
        };

        if let Ok(conn) = db.get() {
            let _ = conn.execute(
                "INSERT INTO app_settings (key, value) VALUES ('last_reminder_check', ?1)
                 ON CONFLICT(key) DO UPDATE SET value = ?1",
                params![today],
            );
        }
    }

    // Spawn async task to send reminders (non-blocking)
    println!("[reminders] Spawning reminder check task for today's sessions...");
    tokio::spawn(async move {
        let sent = send_upcoming_reminders(db, email_config, push_config).await;
        println!(
            "[reminders] Daily reminder check completed. {} emails sent.",
            sent
        );
    });
}
