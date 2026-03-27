use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, HeaderValue, StatusCode},
    response::Response,
    Json,
};
use rusqlite::params;
use crate::auth::RequireAuth;
use crate::errors::AppError;
use crate::AppState;

// ── Calendar (iCal) ──

/// Returns the user's personal calendar URL (generates token if needed)
pub async fn get_calendar_url(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    // Check if user already has a token
    let existing: Option<String> = conn.query_row(
        "SELECT calendar_token FROM users WHERE id = ?1",
        params![user.id],
        |row| row.get(0),
    ).unwrap_or(None);

    let token = if let Some(t) = existing {
        t
    } else {
        // Generate a new token
        let token = uuid::Uuid::new_v4().to_string();
        conn.execute("UPDATE users SET calendar_token = ?1 WHERE id = ?2", params![token, user.id])?;
        token
    };

    Ok(Json(serde_json::json!({ "token": token })))
}

/// Serves the iCal feed — public endpoint, auth via token in URL
pub async fn calendar_ics_by_token(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<Response, AppError> {
    let conn = state.db.get()?;

    // Strip .ics extension if present
    let token = token.strip_suffix(".ics").unwrap_or(&token);

    let user_id: i64 = conn.query_row(
        "SELECT id FROM users WHERE calendar_token = ?1 AND active = 1",
        params![token],
        |row| row.get(0),
    ).map_err(|_| AppError::NotFound("Invalid calendar token".to_string()))?;

    // All sessions, with a flag for whether user is hosting or has RSVP'd a child
    let mut stmt = conn.prepare(
        "SELECT DISTINCT cs.id, cs.title, cs.session_date, cs.start_time, cs.end_time,
                COALESCE(cs.location_name, cs.host_address, '') as location, cs.notes,
                CASE WHEN cs.host_id = ?1 THEN 1
                     WHEN EXISTS (SELECT 1 FROM rsvps r JOIN student_parents sp ON r.student_id = sp.student_id WHERE r.session_id = cs.id AND sp.user_id = ?1) THEN 2
                     ELSE 0 END as involvement
         FROM class_sessions cs
         ORDER BY cs.session_date ASC",
    )?;

    let mut ics = String::from(concat!(
        "BEGIN:VCALENDAR\r\n",
        "VERSION:2.0\r\n",
        "PRODID:-//WLPC//Preschool Co-op//EN\r\n",
        "CALSCALE:GREGORIAN\r\n",
        "METHOD:PUBLISH\r\n",
        "X-WR-CALNAME:WLPC Sessions\r\n",
        "X-WR-TIMEZONE:America/New_York\r\n",
        "REFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n",
        "X-PUBLISHED-TTL:PT1H\r\n",
        "BEGIN:VTIMEZONE\r\n",
        "TZID:America/New_York\r\n",
        "BEGIN:STANDARD\r\n",
        "DTSTART:19701101T020000\r\n",
        "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU\r\n",
        "TZOFFSETFROM:-0400\r\n",
        "TZOFFSETTO:-0500\r\n",
        "TZNAME:EST\r\n",
        "END:STANDARD\r\n",
        "BEGIN:DAYLIGHT\r\n",
        "DTSTART:19700308T020000\r\n",
        "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU\r\n",
        "TZOFFSETFROM:-0500\r\n",
        "TZOFFSETTO:-0400\r\n",
        "TZNAME:EDT\r\n",
        "END:DAYLIGHT\r\n",
        "END:VTIMEZONE\r\n",
    ));

    let rows = stmt.query_map(params![user_id], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, i64>(7)?,
        ))
    })?;

    for row in rows {
        if let Ok((id, title, date, start_time, end_time, location, notes, involvement)) = row {
            // Prefix title based on involvement: 1=hosting, 2=RSVP'd
            let display_title = match involvement {
                1 => format!("[Hosting] {}", title),
                2 => format!("[RSVP'd] {}", title),
                _ => title.clone(),
            };
            let date_clean = date.replace('-', "");
            let dtstart = if let Some(ref st) = start_time {
                format!("{}T{}00", date_clean, st.replace(':', ""))
            } else {
                date_clean.clone()
            };
            let dtend = if let Some(ref et) = end_time {
                format!("{}T{}00", date_clean, et.replace(':', ""))
            } else if start_time.is_some() {
                format!("{}T{}00", date_clean, start_time.as_ref().map(|s| {
                    let parts: Vec<&str> = s.split(':').collect();
                    let h: u32 = parts.first().and_then(|p| p.parse().ok()).unwrap_or(9) + 1;
                    let m = parts.get(1).unwrap_or(&"00");
                    format!("{:02}{}", h, m)
                }).unwrap_or_else(|| "1000".to_string()))
            } else {
                date_clean.clone()
            };

            let dtstamp = chrono::Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
            ics.push_str("BEGIN:VEVENT\r\n");
            ics.push_str(&format!("UID:session-{}@westernloudouncoop.org\r\n", id));
            ics.push_str(&format!("DTSTAMP:{}\r\n", dtstamp));
            if start_time.is_some() {
                ics.push_str(&format!("DTSTART;TZID=America/New_York:{}\r\n", dtstart));
                ics.push_str(&format!("DTEND;TZID=America/New_York:{}\r\n", dtend));
            } else {
                ics.push_str(&format!("DTSTART;VALUE=DATE:{}\r\n", dtstart));
            }
            ics.push_str(&format!("SUMMARY:{}\r\n", display_title.replace(',', "\\,")));
            if !location.is_empty() {
                ics.push_str(&format!("LOCATION:{}\r\n", location.replace(',', "\\,")));
            }
            if let Some(n) = notes {
                ics.push_str(&format!("DESCRIPTION:{}\r\n", n.replace('\n', "\\n").replace(',', "\\,")));
            }
            ics.push_str("END:VEVENT\r\n");
        }
    }

    ics.push_str("END:VCALENDAR\r\n");

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, HeaderValue::from_static("text/calendar; charset=utf-8"))
        .body(Body::from(ics))
        .unwrap())
}
