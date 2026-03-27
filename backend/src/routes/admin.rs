use axum::{
    extract::{Path, State},
    Json,
};
use rusqlite::params;

use crate::auth::RequireAdmin;
use crate::errors::AppError;
use crate::models::*;
use crate::sanitize::{sanitize_html, sanitize_text, validate_required};
use crate::AppState;

// ── Invites ──

pub async fn create_invite(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Json(req): Json<CreateInviteRequest>,
) -> Result<Json<Invite>, AppError> {
    // Validate role
    if !["teacher", "parent"].contains(&req.role.as_str()) {
        return Err(AppError::BadRequest("Role must be 'teacher' or 'parent'".to_string()));
    }

    // Email is required for email-based invites
    let email = req.email.as_ref()
        .ok_or_else(|| AppError::BadRequest("Email is required to send an invite".to_string()))?
        .trim().to_lowercase();

    if email.is_empty() {
        return Err(AppError::BadRequest("Email is required to send an invite".to_string()));
    }

    let code = uuid::Uuid::new_v4().to_string()[..8].to_string();

    // Default expiry: 7 days
    let expires_at = req.expires_at.clone().unwrap_or_else(|| {
        chrono::Utc::now()
            .checked_add_signed(chrono::Duration::days(7))
            .unwrap()
            .format("%Y-%m-%dT%H:%M:%S")
            .to_string()
    });

    let invite = {
        let conn = state.db.get()?;
        conn.execute(
            "INSERT INTO invites (code, role, email, expires_at) VALUES (?1, ?2, ?3, ?4)",
            params![code, req.role, email, expires_at],
        )?;

        let id = conn.last_insert_rowid();
        let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();

        Invite {
            id,
            code: code.clone(),
            role: req.role.clone(),
            email: Some(email.clone()),
            used_by: None,
            created_at: now,
            expires_at: Some(expires_at),
        }
    };

    // Send invite email
    let config = &state.email_config;
    let _ = crate::email::send_invite_email(config, &email, &code, &req.role).await;

    Ok(Json(invite))
}

pub async fn list_invites(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<Vec<Invite>>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, code, role, email, used_by, created_at, expires_at FROM invites ORDER BY created_at DESC",
    )?;

    let invites: Vec<Invite> = stmt
        .query_map([], |row| {
            Ok(Invite {
                id: row.get(0)?,
                code: row.get(1)?,
                role: row.get(2)?,
                email: row.get(3)?,
                used_by: row.get(4)?,
                created_at: row.get(5)?,
                expires_at: row.get(6)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(invites))
}

// ── User Management ──

pub async fn list_users(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<Vec<UserResponse>>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, email, display_name, role, active, phone, address, preferred_contact, created_at FROM users ORDER BY created_at",
    )?;

    let users: Vec<UserResponse> = stmt
        .query_map([], |row| {
            Ok(UserResponse {
                id: row.get(0)?,
                email: row.get(1)?,
                display_name: row.get(2)?,
                role: row.get(3)?,
                active: row.get(4)?,
                phone: row.get(5)?,
                address: row.get(6)?,
                preferred_contact: row.get(7)?,
                created_at: row.get(8)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(users))
}

#[derive(serde::Deserialize)]
pub struct UpdateUserRequest {
    pub role: Option<String>,
    pub active: Option<bool>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub preferred_contact: Option<String>,
}

pub async fn update_user(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateUserRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    if let Some(role) = req.role {
        if !["admin", "teacher", "parent"].contains(&role.as_str()) {
            return Err(AppError::BadRequest("Invalid role".to_string()));
        }
        conn.execute("UPDATE users SET role = ?1 WHERE id = ?2", params![role, id])?;
    }
    if let Some(active) = req.active {
        conn.execute("UPDATE users SET active = ?1 WHERE id = ?2", params![active, id])?;
    }
    if let Some(phone) = req.phone {
        conn.execute("UPDATE users SET phone = ?1 WHERE id = ?2", params![phone, id])?;
    }
    if let Some(address) = req.address {
        conn.execute("UPDATE users SET address = ?1 WHERE id = ?2", params![address, id])?;
    }
    if let Some(preferred_contact) = req.preferred_contact {
        conn.execute("UPDATE users SET preferred_contact = ?1 WHERE id = ?2", params![preferred_contact, id])?;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn delete_user(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Prevent admin from deleting themselves
    if admin.id == id {
        return Err(AppError::BadRequest("You cannot delete your own account".to_string()));
    }

    let conn = state.db.get()?;

    // Clean up all foreign key references to this user before deletion.
    // Tables with ON DELETE CASCADE (student_parents, lesson_plan_collaborators,
    // password_reset_tokens) are handled automatically by SQLite.

    // Nullify references where we want to keep the content
    conn.execute("UPDATE posts SET author_id = (SELECT id FROM users WHERE role = 'admin' LIMIT 1) WHERE author_id = ?1", params![id])?;
    conn.execute("UPDATE post_comments SET author_id = (SELECT id FROM users WHERE role = 'admin' LIMIT 1) WHERE author_id = ?1", params![id])?;
    conn.execute("UPDATE lesson_plans SET author_id = (SELECT id FROM users WHERE role = 'admin' LIMIT 1) WHERE author_id = ?1", params![id])?;
    conn.execute("UPDATE files SET uploader_id = (SELECT id FROM users WHERE role = 'admin' LIMIT 1) WHERE uploader_id = ?1", params![id])?;
    conn.execute("UPDATE milestones SET recorded_by = (SELECT id FROM users WHERE role = 'admin' LIMIT 1) WHERE recorded_by = ?1", params![id])?;

    // Nullify nullable references
    conn.execute("UPDATE invites SET used_by = NULL WHERE used_by = ?1", params![id])?;
    conn.execute("UPDATE events SET created_by = NULL WHERE created_by = ?1", params![id])?;
    conn.execute("UPDATE class_sessions SET host_id = NULL, status = 'open' WHERE host_id = ?1", params![id])?;
    conn.execute("UPDATE class_sessions SET created_by = NULL WHERE created_by = ?1", params![id])?;
    conn.execute("UPDATE announcements SET created_by = NULL WHERE created_by = ?1", params![id])?;

    // Remove RSVPs submitted by this user
    conn.execute("DELETE FROM rsvps WHERE parent_id = ?1", params![id])?;

    // Delete students that belong only to this parent (no other parent linked)
    conn.execute(
        "DELETE FROM students WHERE id IN (
            SELECT sp.student_id FROM student_parents sp
            WHERE sp.user_id = ?1
            AND NOT EXISTS (
                SELECT 1 FROM student_parents sp2
                WHERE sp2.student_id = sp.student_id AND sp2.user_id != ?1
            )
        )",
        params![id],
    )?;

    // Remove the user (cascades handle student_parents, lesson_plan_collaborators, password_reset_tokens)
    conn.execute("DELETE FROM users WHERE id = ?1", params![id])?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Students ──

pub async fn create_student(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Json(req): Json<CreateStudentRequest>,
) -> Result<Json<Student>, AppError> {
    let conn = state.db.get()?;
    let first_name = validate_required(&req.first_name, "first_name")?;
    let first_name = sanitize_text(&first_name);
    let last_name = validate_required(&req.last_name, "last_name")?;
    let last_name = sanitize_text(&last_name);
    let allergies = req.allergies.clone().unwrap_or_default();
    let dietary = req.dietary_restrictions.clone().unwrap_or_default();
    conn.execute(
        "INSERT INTO students (first_name, last_name, date_of_birth, notes, allergies, dietary_restrictions) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![first_name, last_name, req.date_of_birth, req.notes, allergies, dietary],
    )?;

    let id = conn.last_insert_rowid();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();

    Ok(Json(Student {
        id,
        first_name,
        last_name,
        date_of_birth: req.date_of_birth,
        notes: req.notes,
        allergies,
        dietary_restrictions: dietary,
        enrolled: true,
        created_at: now,
    }))
}

pub async fn update_student(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateStudentRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    if let Some(first_name) = req.first_name {
        conn.execute("UPDATE students SET first_name = ?1 WHERE id = ?2", params![first_name, id])?;
    }
    if let Some(last_name) = req.last_name {
        conn.execute("UPDATE students SET last_name = ?1 WHERE id = ?2", params![last_name, id])?;
    }
    if let Some(date_of_birth) = req.date_of_birth {
        conn.execute("UPDATE students SET date_of_birth = ?1 WHERE id = ?2", params![date_of_birth, id])?;
    }
    if let Some(notes) = req.notes {
        conn.execute("UPDATE students SET notes = ?1 WHERE id = ?2", params![notes, id])?;
    }
    if let Some(allergies) = req.allergies {
        conn.execute("UPDATE students SET allergies = ?1 WHERE id = ?2", params![allergies, id])?;
    }
    if let Some(dietary) = req.dietary_restrictions {
        conn.execute("UPDATE students SET dietary_restrictions = ?1 WHERE id = ?2", params![dietary, id])?;
    }
    if let Some(enrolled) = req.enrolled {
        conn.execute("UPDATE students SET enrolled = ?1 WHERE id = ?2", params![enrolled, id])?;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn delete_student(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    conn.execute("DELETE FROM students WHERE id = ?1", params![id])?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Student-Parent Linking ──

pub async fn link_parent(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Json(req): Json<LinkParentRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    conn.execute(
        "INSERT OR IGNORE INTO student_parents (student_id, user_id) VALUES (?1, ?2)",
        params![req.student_id, req.user_id],
    )?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn unlink_parent(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path((student_id, user_id)): Path<(i64, i64)>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    conn.execute(
        "DELETE FROM student_parents WHERE student_id = ?1 AND user_id = ?2",
        params![student_id, user_id],
    )?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Events ──

pub async fn create_event(
    RequireAdmin(user): RequireAdmin,
    State(state): State<AppState>,
    Json(req): Json<CreateEventRequest>,
) -> Result<Json<Event>, AppError> {
    let conn = state.db.get()?;
    let title = validate_required(&req.title, "title")?;
    let title = sanitize_text(&title);
    conn.execute(
        "INSERT INTO events (title, description, event_date, start_time, end_time, event_type, created_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![title, req.description, req.event_date, req.start_time, req.end_time, req.event_type, user.id],
    )?;

    let id = conn.last_insert_rowid();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();

    Ok(Json(Event {
        id,
        title,
        description: req.description,
        event_date: req.event_date,
        start_time: req.start_time,
        end_time: req.end_time,
        event_type: req.event_type,
        created_by: Some(user.id),
        created_at: now,
    }))
}

pub async fn update_event(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateEventRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    if let Some(title) = req.title {
        conn.execute("UPDATE events SET title = ?1 WHERE id = ?2", params![title, id])?;
    }
    if let Some(description) = req.description {
        conn.execute("UPDATE events SET description = ?1 WHERE id = ?2", params![description, id])?;
    }
    if let Some(event_date) = req.event_date {
        conn.execute("UPDATE events SET event_date = ?1 WHERE id = ?2", params![event_date, id])?;
    }
    if let Some(start_time) = req.start_time {
        conn.execute("UPDATE events SET start_time = ?1 WHERE id = ?2", params![start_time, id])?;
    }
    if let Some(end_time) = req.end_time {
        conn.execute("UPDATE events SET end_time = ?1 WHERE id = ?2", params![end_time, id])?;
    }
    if let Some(event_type) = req.event_type {
        conn.execute("UPDATE events SET event_type = ?1 WHERE id = ?2", params![event_type, id])?;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn delete_event(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    conn.execute("DELETE FROM events WHERE id = ?1", params![id])?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Resources ──

pub async fn create_resource(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Json(req): Json<CreateResourceRequest>,
) -> Result<Json<Resource>, AppError> {
    let conn = state.db.get()?;
    let title = validate_required(&req.title, "title")?;
    let title = sanitize_text(&title);
    let sort_order = req.sort_order.unwrap_or(0);
    let published = req.published.unwrap_or(true);
    let content = sanitize_html(&req.content);
    conn.execute(
        "INSERT INTO resources (title, content, category, sort_order, published) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![title, content, req.category, sort_order, published],
    )?;

    let id = conn.last_insert_rowid();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();

    Ok(Json(Resource {
        id,
        title,
        content,
        category: req.category,
        sort_order,
        published,
        updated_at: now,
    }))
}

pub async fn update_resource(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateResourceRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    if let Some(title) = req.title {
        conn.execute("UPDATE resources SET title = ?1, updated_at = datetime('now') WHERE id = ?2", params![title, id])?;
    }
    if let Some(content) = req.content {
        let content = sanitize_html(&content);
        conn.execute("UPDATE resources SET content = ?1, updated_at = datetime('now') WHERE id = ?2", params![content, id])?;
    }
    if let Some(category) = req.category {
        conn.execute("UPDATE resources SET category = ?1, updated_at = datetime('now') WHERE id = ?2", params![category, id])?;
    }
    if let Some(sort_order) = req.sort_order {
        conn.execute("UPDATE resources SET sort_order = ?1, updated_at = datetime('now') WHERE id = ?2", params![sort_order, id])?;
    }
    if let Some(published) = req.published {
        conn.execute("UPDATE resources SET published = ?1, updated_at = datetime('now') WHERE id = ?2", params![published, id])?;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn delete_resource(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    conn.execute("DELETE FROM resources WHERE id = ?1", params![id])?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Class Sessions ──

pub async fn create_session(
    RequireAdmin(user): RequireAdmin,
    State(state): State<AppState>,
    Json(req): Json<CreateSessionRequest>,
) -> Result<Json<ClassSession>, AppError> {
    let conn = state.db.get()?;
    let session_type_id = if let Some(id) = req.session_type_id {
        Some(id)
    } else {
        conn.query_row(
            "SELECT id FROM session_types WHERE name = 'class'",
            [],
            |row| row.get(0),
        )
        .ok()
    };
    let (hostable, rsvpable): (i64, i64) = session_type_id
        .and_then(|id| {
            conn.query_row(
                "SELECT hostable, rsvpable FROM session_types WHERE id = ?1",
                params![id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok()
        })
        .unwrap_or((1, 1));
    let status = if hostable == 0 && rsvpable == 0 {
        "closed"
    } else {
        "open"
    };
    conn.execute(
        "INSERT INTO class_sessions (
            title, theme, session_date, end_date, start_time, end_time,
            location_name, location_address, cost_amount, cost_details,
            max_students, notes, status, session_type_id, rsvp_cutoff, require_approval, created_by
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
        params![
            req.title,
            req.theme,
            req.session_date,
            req.end_date,
            req.start_time,
            req.end_time,
            req.location_name,
            req.location_address,
            req.cost_amount,
            req.cost_details,
            req.max_students,
            req.notes,
            status,
            session_type_id,
            req.rsvp_cutoff,
            req.require_approval.unwrap_or(false),
            user.id
        ],
    )?;

    let id = conn.last_insert_rowid();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();

    Ok(Json(ClassSession {
        id,
        title: req.title,
        theme: req.theme,
        session_date: req.session_date,
        end_date: req.end_date,
        start_time: req.start_time,
        end_time: req.end_time,
        host_id: None,
        host_name: None,
        host_address: None,
        location_name: req.location_name,
        location_address: req.location_address,
        cost_amount: req.cost_amount,
        cost_details: req.cost_details,
        lesson_plan_id: None,
        materials_needed: None,
        max_students: req.max_students,
        notes: req.notes,
        status: status.to_string(),
        session_type_id,
        session_type_name: None,
        session_type_label: None,
        rsvp_cutoff: req.rsvp_cutoff,
        require_approval: req.require_approval.unwrap_or(false),
        created_by: Some(user.id),
        created_at: now,
    }))
}

pub async fn update_session(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateSessionRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    if let Some(title) = req.title {
        conn.execute("UPDATE class_sessions SET title = ?1 WHERE id = ?2", params![title, id])?;
    }
    if let Some(theme) = req.theme {
        conn.execute("UPDATE class_sessions SET theme = ?1 WHERE id = ?2", params![theme, id])?;
    }
    if let Some(session_date) = req.session_date {
        conn.execute("UPDATE class_sessions SET session_date = ?1 WHERE id = ?2", params![session_date, id])?;
    }
    if let Some(end_date) = req.end_date {
        conn.execute("UPDATE class_sessions SET end_date = ?1 WHERE id = ?2", params![end_date, id])?;
    }
    if let Some(start_time) = req.start_time {
        conn.execute("UPDATE class_sessions SET start_time = ?1 WHERE id = ?2", params![start_time, id])?;
    }
    if let Some(end_time) = req.end_time {
        conn.execute("UPDATE class_sessions SET end_time = ?1 WHERE id = ?2", params![end_time, id])?;
    }
    if let Some(location_name) = req.location_name {
        conn.execute("UPDATE class_sessions SET location_name = ?1 WHERE id = ?2", params![location_name, id])?;
    }
    if let Some(location_address) = req.location_address {
        conn.execute("UPDATE class_sessions SET location_address = ?1 WHERE id = ?2", params![location_address, id])?;
    }
    if let Some(cost_amount) = req.cost_amount {
        conn.execute("UPDATE class_sessions SET cost_amount = ?1 WHERE id = ?2", params![cost_amount, id])?;
    }
    if let Some(cost_details) = req.cost_details {
        conn.execute("UPDATE class_sessions SET cost_details = ?1 WHERE id = ?2", params![cost_details, id])?;
    }
    if let Some(max_students) = req.max_students {
        conn.execute("UPDATE class_sessions SET max_students = ?1 WHERE id = ?2", params![max_students, id])?;
    }
    if let Some(notes) = req.notes {
        conn.execute("UPDATE class_sessions SET notes = ?1 WHERE id = ?2", params![notes, id])?;
    }
    if let Some(status) = req.status {
        conn.execute("UPDATE class_sessions SET status = ?1 WHERE id = ?2", params![status, id])?;
    }
    if let Some(session_type_id) = req.session_type_id {
        conn.execute("UPDATE class_sessions SET session_type_id = ?1 WHERE id = ?2", params![session_type_id, id])?;
    }
    if let Some(rsvp_cutoff) = req.rsvp_cutoff {
        conn.execute("UPDATE class_sessions SET rsvp_cutoff = ?1 WHERE id = ?2", params![rsvp_cutoff, id])?;
    }
    if let Some(require_approval) = req.require_approval {
        conn.execute("UPDATE class_sessions SET require_approval = ?1 WHERE id = ?2", params![require_approval, id])?;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn delete_session(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    conn.execute("DELETE FROM class_sessions WHERE id = ?1", params![id])?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Session Types ──

pub async fn list_session_types(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<Vec<SessionType>>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, label, sort_order, active, hostable, rsvpable, multi_day,
                description, requires_location, supports_cost, cost_label
         FROM session_types ORDER BY sort_order, label",
    )?;

    let types: Vec<SessionType> = stmt
        .query_map([], |row| {
            Ok(SessionType {
                id: row.get(0)?,
                name: row.get(1)?,
                label: row.get(2)?,
                sort_order: row.get(3)?,
                active: row.get(4)?,
                hostable: row.get(5)?,
                rsvpable: row.get(6)?,
                multi_day: row.get(7)?,
                description: row.get(8)?,
                requires_location: row.get(9)?,
                supports_cost: row.get(10)?,
                cost_label: row.get(11)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(types))
}

pub async fn create_session_type(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Json(req): Json<CreateSessionTypeRequest>,
) -> Result<Json<SessionType>, AppError> {
    let conn = state.db.get()?;
    let sort_order = req.sort_order.unwrap_or(0);
    let active = req.active.unwrap_or(true);
    let hostable = req.hostable.unwrap_or(true);
    let rsvpable = req.rsvpable.unwrap_or(true);
    let multi_day = req.multi_day.unwrap_or(false);
    let description = req.description;
    let requires_location = req.requires_location.unwrap_or(false);
    let supports_cost = req.supports_cost.unwrap_or(false);
    let cost_label = req.cost_label;
    conn.execute(
        "INSERT INTO session_types (name, label, sort_order, active, hostable, rsvpable, multi_day, description, requires_location, supports_cost, cost_label)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            req.name,
            req.label,
            sort_order,
            active,
            hostable,
            rsvpable,
            multi_day,
            description,
            requires_location,
            supports_cost,
            cost_label
        ],
    )?;

    let id = conn.last_insert_rowid();
    Ok(Json(SessionType {
        id,
        name: req.name,
        label: req.label,
        sort_order,
        active,
        hostable,
        rsvpable,
        multi_day,
        description,
        requires_location,
        supports_cost,
        cost_label,
    }))
}

pub async fn update_session_type(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateSessionTypeRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    if let Some(name) = req.name {
        conn.execute("UPDATE session_types SET name = ?1 WHERE id = ?2", params![name, id])?;
    }
    if let Some(label) = req.label {
        conn.execute("UPDATE session_types SET label = ?1 WHERE id = ?2", params![label, id])?;
    }
    if let Some(sort_order) = req.sort_order {
        conn.execute("UPDATE session_types SET sort_order = ?1 WHERE id = ?2", params![sort_order, id])?;
    }
    if let Some(active) = req.active {
        conn.execute("UPDATE session_types SET active = ?1 WHERE id = ?2", params![active, id])?;
    }
    if let Some(hostable) = req.hostable {
        conn.execute("UPDATE session_types SET hostable = ?1 WHERE id = ?2", params![hostable, id])?;
    }
    if let Some(rsvpable) = req.rsvpable {
        conn.execute("UPDATE session_types SET rsvpable = ?1 WHERE id = ?2", params![rsvpable, id])?;
    }
    if let Some(multi_day) = req.multi_day {
        conn.execute("UPDATE session_types SET multi_day = ?1 WHERE id = ?2", params![multi_day, id])?;
    }
    if let Some(description) = req.description {
        conn.execute("UPDATE session_types SET description = ?1 WHERE id = ?2", params![description, id])?;
    }
    if let Some(requires_location) = req.requires_location {
        conn.execute("UPDATE session_types SET requires_location = ?1 WHERE id = ?2", params![requires_location, id])?;
    }
    if let Some(supports_cost) = req.supports_cost {
        conn.execute("UPDATE session_types SET supports_cost = ?1 WHERE id = ?2", params![supports_cost, id])?;
    }
    if let Some(cost_label) = req.cost_label {
        conn.execute("UPDATE session_types SET cost_label = ?1 WHERE id = ?2", params![cost_label, id])?;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn get_session_defaults(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<SessionDefaults>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare("SELECT key, value FROM app_settings WHERE key LIKE 'default_%'")?;
    let mut defaults = SessionDefaults {
        default_start_time: "09:00".to_string(),
        default_capacity: 10,
        default_rsvp_cutoff_days: 1,
    };
    for row in stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))? {
        if let Ok((k, v)) = row {
            match k.as_str() {
                "default_start_time" => defaults.default_start_time = v,
                "default_capacity" => defaults.default_capacity = v.parse().unwrap_or(10),
                "default_rsvp_cutoff_days" => defaults.default_rsvp_cutoff_days = v.parse().unwrap_or(1),
                _ => {}
            }
        }
    }
    Ok(Json(defaults))
}

pub async fn update_session_defaults(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Json(req): Json<SessionDefaults>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    conn.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('default_start_time', ?1)", params![req.default_start_time])?;
    conn.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('default_capacity', ?1)", params![req.default_capacity.to_string()])?;
    conn.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('default_rsvp_cutoff_days', ?1)", params![req.default_rsvp_cutoff_days.to_string()])?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Site Pages ──

pub async fn list_site_pages(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<Vec<SitePage>>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare("SELECT slug, title, content, updated_at FROM site_pages ORDER BY slug")?;
    let pages = stmt.query_map([], |row| {
        Ok(SitePage {
            slug: row.get(0)?,
            title: row.get(1)?,
            content: row.get(2)?,
            updated_at: row.get(3)?,
        })
    })?
    .filter_map(|r| r.ok())
    .collect();
    Ok(Json(pages))
}

pub async fn update_site_page(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Json(req): Json<UpdateSitePageRequest>,
) -> Result<Json<SitePage>, AppError> {
    let conn = state.db.get()?;

    if let Some(title) = req.title {
        conn.execute(
            "UPDATE site_pages SET title = ?1, updated_at = datetime('now') WHERE slug = ?2",
            params![title, slug],
        )?;
    }

    if let Some(content) = req.content {
        let sanitized = sanitize_html(&content);
        conn.execute(
            "UPDATE site_pages SET content = ?1, updated_at = datetime('now') WHERE slug = ?2",
            params![sanitized, slug],
        )?;
    }

    // Fetch and return updated page
    let page = conn.query_row(
        "SELECT slug, title, content, updated_at FROM site_pages WHERE slug = ?1",
        params![slug],
        |row| Ok(SitePage {
            slug: row.get(0)?,
            title: row.get(1)?,
            content: row.get(2)?,
            updated_at: row.get(3)?,
        }),
    ).map_err(|_| AppError::NotFound("Page not found".to_string()))?;
    Ok(Json(page))
}

// ── Email Parents ──

#[derive(serde::Serialize)]
pub struct EmailParentsResponse {
    pub sent_count: usize,
}

pub async fn email_parents(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Json(req): Json<EmailParentsRequest>,
) -> Result<Json<EmailParentsResponse>, AppError> {
    eprintln!("[admin] email_parents called: subject='{}', body_len={}", req.subject, req.body.len());

    // Do all DB work in a block so conn is dropped before the .await
    let recipients = {
        let conn = state.db.get()?;
        let mut stmt = conn.prepare(
            "SELECT email, display_name FROM users WHERE active = 1 ORDER BY email"
        )?;
        let results: Vec<(String, String)> = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .filter_map(|r| r.ok())
        .collect();
        results
    };

    eprintln!("[admin] Found {} recipients", recipients.len());

    let config = &state.email_config;
    let sent_count = crate::email::send_bulk_email(config, recipients, &req.subject, &req.body)
        .await
        .map_err(|e| {
            eprintln!("[admin] email_parents error: {}", e);
            AppError::Internal(e)
        })?;

    eprintln!("[admin] email_parents done: sent_count={}", sent_count);
    Ok(Json(EmailParentsResponse { sent_count }))
}

// ── Trigger Reminders Manually ──

pub async fn trigger_reminders(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let sent = crate::reminders::send_upcoming_reminders(
        state.db.clone(),
        state.email_config.clone(),
    )
    .await;
    Ok(Json(serde_json::json!({ "reminders_sent": sent })))
}

// ── Admin Password Reset ──

pub async fn admin_reset_user_password(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(user_id): Path<i64>,
    Json(req): Json<AdminResetPasswordRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    use crate::auth::hash_password;

    let hashed = hash_password(&req.new_password)?;
    let conn = state.db.get()?;
    conn.execute(
        "UPDATE users SET password_hash = ?1 WHERE id = ?2",
        params![hashed, user_id],
    )?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Announcements ──

pub async fn create_announcement(
    RequireAdmin(user): RequireAdmin,
    State(state): State<AppState>,
    Json(req): Json<CreateAnnouncementRequest>,
) -> Result<Json<Announcement>, AppError> {
    validate_required("title", &req.title)?;
    validate_required("body", &req.body)?;

    let title = sanitize_text(&req.title);
    let body = sanitize_html(&req.body);
    let announcement_type = req.announcement_type.unwrap_or_else(|| "info".to_string());

    // Validate type
    if !["info", "warning", "urgent"].contains(&announcement_type.as_str()) {
        return Err(AppError::BadRequest("Type must be 'info', 'warning', or 'urgent'".to_string()));
    }

    let conn = state.db.get()?;
    conn.execute(
        "INSERT INTO announcements (title, body, announcement_type, created_by, expires_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![title, body, announcement_type, user.id, req.expires_at],
    )?;

    let id = conn.last_insert_rowid();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();

    Ok(Json(Announcement {
        id,
        title,
        body,
        announcement_type,
        active: true,
        created_by: Some(user.id),
        created_by_name: Some(user.display_name.clone()),
        expires_at: req.expires_at,
        created_at: now,
    }))
}

pub async fn list_announcements(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<Vec<Announcement>>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT a.id, a.title, a.body, a.announcement_type, a.active,
                a.created_by, u.display_name, a.expires_at, a.created_at
         FROM announcements a
         LEFT JOIN users u ON a.created_by = u.id
         ORDER BY a.created_at DESC",
    )?;

    let announcements: Vec<Announcement> = stmt
        .query_map([], |row| {
            Ok(Announcement {
                id: row.get(0)?,
                title: row.get(1)?,
                body: row.get(2)?,
                announcement_type: row.get(3)?,
                active: row.get::<_, i64>(4)? != 0,
                created_by: row.get(5)?,
                created_by_name: row.get(6)?,
                expires_at: row.get(7)?,
                created_at: row.get(8)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(announcements))
}

pub async fn update_announcement(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateAnnouncementRequest>,
) -> Result<Json<Announcement>, AppError> {
    let conn = state.db.get()?;

    let mut updates = vec![];
    let mut params: Vec<rusqlite::types::Value> = Vec::new();

    if let Some(title) = req.title {
        validate_required("title", &title)?;
        updates.push("title = ?");
        params.push(sanitize_text(&title).into());
    }

    if let Some(body) = req.body {
        updates.push("body = ?");
        params.push(sanitize_html(&body).into());
    }

    if let Some(announcement_type) = req.announcement_type {
        if !["info", "warning", "urgent"].contains(&announcement_type.as_str()) {
            return Err(AppError::BadRequest("Type must be 'info', 'warning', or 'urgent'".to_string()));
        }
        updates.push("announcement_type = ?");
        params.push(announcement_type.into());
    }

    if let Some(active) = req.active {
        updates.push("active = ?");
        params.push(if active { 1 } else { 0 }.into());
    }

    if let Some(expires_at) = req.expires_at {
        updates.push("expires_at = ?");
        params.push(expires_at.into());
    }

    if updates.is_empty() {
        return Err(AppError::BadRequest("No fields to update".to_string()));
    }

    params.push(id.into());

    let update_sql = format!("UPDATE announcements SET {} WHERE id = ?", updates.join(", "));
    conn.execute(&update_sql, rusqlite::params_from_iter(params.iter()))?;

    // Fetch and return the updated announcement
    let announcement = conn
        .query_row(
            "SELECT a.id, a.title, a.body, a.announcement_type, a.active,
                    a.created_by, u.display_name, a.expires_at, a.created_at
             FROM announcements a
             LEFT JOIN users u ON a.created_by = u.id
             WHERE a.id = ?1",
            params![id],
            |row| {
                Ok(Announcement {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    body: row.get(2)?,
                    announcement_type: row.get(3)?,
                    active: row.get::<_, i64>(4)? != 0,
                    created_by: row.get(5)?,
                    created_by_name: row.get(6)?,
                    expires_at: row.get(7)?,
                    created_at: row.get(8)?,
                })
            },
        )
        .map_err(|_| AppError::NotFound("Announcement not found".to_string()))?;

    Ok(Json(announcement))
}

pub async fn delete_announcement(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    conn.execute("DELETE FROM announcements WHERE id = ?1", params![id])?;
    Ok(Json(serde_json::json!({ "ok": true })))
}
