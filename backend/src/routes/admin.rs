use axum::{
    extract::{Path, State},
    Json,
};
use rusqlite::params;

use crate::auth::{RequireAdmin, RequireTeacher};
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
        "SELECT id, code, role, email, used_by, created_at, expires_at FROM invites WHERE used_by IS NULL ORDER BY created_at DESC",
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

pub async fn delete_invite(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    conn.execute("DELETE FROM invites WHERE id = ?1 AND used_by IS NULL", params![id])?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── User Management ──

pub async fn list_users(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    axum::extract::Query(query): axum::extract::Query<crate::models::AdminUsersQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    let mut where_clauses = vec!["1=1".to_string()];
    let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref q) = query.q {
        let q = q.trim();
        if !q.is_empty() {
            let pattern = format!("%{}%", q);
            params_vec.push(Box::new(pattern.clone()));
            params_vec.push(Box::new(pattern));
            where_clauses.push(format!("(display_name LIKE ?{} OR email LIKE ?{})", params_vec.len() - 1, params_vec.len()));
        }
    }
    if let Some(ref role) = query.role {
        if !role.is_empty() {
            params_vec.push(Box::new(role.clone()));
            where_clauses.push(format!("role = ?{}", params_vec.len()));
        }
    }
    if let Some(active) = query.active {
        params_vec.push(Box::new(active));
        where_clauses.push(format!("active = ?{}", params_vec.len()));
    }

    let where_sql = where_clauses.join(" AND ");
    let base = format!("FROM users WHERE {}", where_sql);
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    let make_row = |row: &rusqlite::Row| -> rusqlite::Result<UserResponse> {
        Ok(UserResponse {
            id: row.get(0)?, email: row.get(1)?, display_name: row.get(2)?,
            role: row.get(3)?, active: row.get(4)?, phone: row.get(5)?,
            address: row.get(6)?, preferred_contact: row.get(7)?,
            family_id: row.get(8)?, created_at: row.get(9)?,
        })
    };

    if query.page.is_some() || query.page_size.is_some() {
        let page = query.page.unwrap_or(1).max(1);
        let page_size = query.page_size.unwrap_or(20).clamp(1, 50);
        let offset = (page - 1) * page_size;

        let total: i64 = conn.query_row(&format!("SELECT COUNT(*) {}", base), rusqlite::params_from_iter(&params_refs), |row| row.get(0))?;

        let mut lp: Vec<&dyn rusqlite::types::ToSql> = params_refs.clone();
        lp.push(&page_size);
        lp.push(&offset);

        let sql = format!("SELECT id, email, display_name, role, active, phone, address, preferred_contact, family_id, created_at {} ORDER BY created_at LIMIT ?{} OFFSET ?{}", base, lp.len() - 1, lp.len());
        let mut stmt = conn.prepare(&sql)?;
        let users: Vec<UserResponse> = stmt.query_map(rusqlite::params_from_iter(&lp), make_row)?.filter_map(|r| r.ok()).collect();

        return Ok(Json(serde_json::json!({ "items": users, "total": total, "page": page, "page_size": page_size })));
    }

    let sql = format!("SELECT id, email, display_name, role, active, phone, address, preferred_contact, family_id, created_at {} ORDER BY created_at", base);
    let mut stmt = conn.prepare(&sql)?;
    let users: Vec<UserResponse> = stmt.query_map(rusqlite::params_from_iter(&params_refs), make_row)?.filter_map(|r| r.ok()).collect();
    Ok(Json(serde_json::json!(users)))
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

    // Clean up family references
    conn.execute("DELETE FROM family_invites WHERE invited_by = ?1 OR invited_user_id = ?1", params![id])?;
    conn.execute("UPDATE families SET created_by = NULL WHERE created_by = ?1", params![id])?;
    // Remove user from family; delete family if empty
    let user_family: Option<i64> = conn.query_row(
        "SELECT family_id FROM users WHERE id = ?1", params![id], |row| row.get(0),
    ).unwrap_or(None);
    conn.execute("UPDATE users SET family_id = NULL WHERE id = ?1", params![id])?;
    if let Some(fid) = user_family {
        let remaining: i64 = conn.query_row(
            "SELECT COUNT(*) FROM users WHERE family_id = ?1", params![fid], |row| row.get(0),
        ).unwrap_or(0);
        if remaining == 0 {
            conn.execute("DELETE FROM families WHERE id = ?1", params![fid])?;
        }
    }

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
        "INSERT INTO students (first_name, last_name, date_of_birth, notes, allergies, dietary_restrictions, emergency_contact_name, emergency_contact_phone) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![first_name, last_name, req.date_of_birth, req.notes, allergies, dietary, req.emergency_contact_name, req.emergency_contact_phone],
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
        emergency_contact_name: req.emergency_contact_name,
        emergency_contact_phone: req.emergency_contact_phone,
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
    if let Some(name) = req.emergency_contact_name {
        conn.execute("UPDATE students SET emergency_contact_name = ?1 WHERE id = ?2", params![name, id])?;
    }
    if let Some(phone) = req.emergency_contact_phone {
        conn.execute("UPDATE students SET emergency_contact_phone = ?1 WHERE id = ?2", params![phone, id])?;
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

pub async fn list_student_parents(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT sp.student_id, sp.user_id, u.display_name, u.email
         FROM student_parents sp
         JOIN users u ON sp.user_id = u.id
         ORDER BY sp.student_id",
    )?;
    let links: Vec<serde_json::Value> = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "student_id": row.get::<_, i64>(0)?,
            "user_id": row.get::<_, i64>(1)?,
            "display_name": row.get::<_, String>(2)?,
            "email": row.get::<_, String>(3)?,
        }))
    })?.filter_map(|r| r.ok()).collect();
    Ok(Json(links))
}

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

    // Link session to class groups if provided
    if let Some(ref group_ids) = req.class_group_ids {
        for gid in group_ids {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO class_session_groups (session_id, group_id) VALUES (?1, ?2)",
                params![id, gid],
            );
        }
    }

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

    // Update class group assignments if provided
    if let Some(group_ids) = req.class_group_ids {
        conn.execute("DELETE FROM class_session_groups WHERE session_id = ?1", [id])?;
        for gid in &group_ids {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO class_session_groups (session_id, group_id) VALUES (?1, ?2)",
                params![id, gid],
            );
        }
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
                description, requires_location, supports_cost, cost_label,
                allow_supplies, allow_attendance, allow_photos
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
                allow_supplies: row.get(12)?,
                allow_attendance: row.get(13)?,
                allow_photos: row.get(14)?,
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
    let allow_supplies = req.allow_supplies.unwrap_or(true);
    let allow_attendance = req.allow_attendance.unwrap_or(true);
    let allow_photos = req.allow_photos.unwrap_or(true);
    conn.execute(
        "INSERT INTO session_types (name, label, sort_order, active, hostable, rsvpable, multi_day, description, requires_location, supports_cost, cost_label, allow_supplies, allow_attendance, allow_photos)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            req.name, req.label, sort_order, active, hostable, rsvpable, multi_day,
            description, requires_location, supports_cost, cost_label,
            allow_supplies, allow_attendance, allow_photos
        ],
    )?;

    let id = conn.last_insert_rowid();
    Ok(Json(SessionType {
        id,
        name: req.name, label: req.label, sort_order, active, hostable, rsvpable, multi_day,
        description, requires_location, supports_cost, cost_label,
        allow_supplies, allow_attendance, allow_photos,
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
    if let Some(v) = req.allow_supplies {
        conn.execute("UPDATE session_types SET allow_supplies = ?1 WHERE id = ?2", params![v, id])?;
    }
    if let Some(v) = req.allow_attendance {
        conn.execute("UPDATE session_types SET allow_attendance = ?1 WHERE id = ?2", params![v, id])?;
    }
    if let Some(v) = req.allow_photos {
        conn.execute("UPDATE session_types SET allow_photos = ?1 WHERE id = ?2", params![v, id])?;
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

    // Process email body for email client compatibility
    let mut email_body = req.body.clone();
    let site_url = state.email_config.site_url.trim_end_matches('/').to_string();

    // Convert YouTube iframes to clickable thumbnail images
    // Email clients strip iframes, so we replace with a thumbnail + link
    while let Some(start) = email_body.find("<iframe") {
        if let Some(end) = email_body[start..].find("</iframe>") {
            let iframe_html = &email_body[start..start + end + 9];
            // Extract YouTube video ID from src attribute
            let replacement = if let Some(src_start) = iframe_html.find("src=\"") {
                let src_content = &iframe_html[src_start + 5..];
                if let Some(src_end) = src_content.find('"') {
                    let src_url = &src_content[..src_end];
                    // Extract video ID from embed URL like https://www.youtube.com/embed/VIDEO_ID
                    let video_id = src_url.split('/').last().unwrap_or("").split('?').next().unwrap_or("");
                    if !video_id.is_empty() {
                        format!(
                            r#"<a href="https://www.youtube.com/watch?v={vid}" style="display:inline-block;text-decoration:none;">
                                <img src="https://img.youtube.com/vi/{vid}/hqdefault.jpg" alt="Watch video" style="max-width:480px;width:100%;border-radius:8px;border:1px solid #ddd;" />
                                <br/><span style="color:#1a73e8;font-size:14px;">Watch on YouTube</span>
                            </a>"#,
                            vid = video_id
                        )
                    } else {
                        String::from("[Video - view in browser]")
                    }
                } else {
                    String::from("[Video - view in browser]")
                }
            } else {
                String::from("[Video - view in browser]")
            };
            email_body = format!("{}{}{}", &email_body[..start], replacement, &email_body[start + end + 9..]);
        } else {
            break;
        }
    }

    // Remove Excalidraw drawings (can't render in email)
    while let Some(start) = email_body.find("<div data-excalidraw") {
        if let Some(end) = email_body[start..].find("</div>") {
            email_body = format!("{}[Drawing - view in browser]{}", &email_body[..start], &email_body[start + end + 6..]);
        } else {
            break;
        }
    }

    // Make any remaining relative URLs absolute
    email_body = email_body.replace("src=\"/", &format!("src=\"{}/", site_url));
    email_body = email_body.replace("href=\"/", &format!("href=\"{}/", site_url));

    // Collect file IDs and their storage paths (DB work, sync)
    let file_mappings: Vec<(i64, String)> = {
        let conn = state.db.get()?;
        let mut mappings = Vec::new();
        let pattern = "/api/files/";
        let mut search_from = 0;
        while let Some(pos) = email_body[search_from..].find(pattern) {
            let abs_pos = search_from + pos;
            let after = &email_body[abs_pos + pattern.len()..];
            if let Some(id_end) = after.find('/') {
                if let Ok(file_id) = after[..id_end].parse::<i64>() {
                    if let Ok(sp) = conn.query_row("SELECT storage_path FROM files WHERE id = ?1", params![file_id], |row| row.get::<_, String>(0)) {
                        mappings.push((file_id, sp));
                    }
                }
            }
            search_from = abs_pos + 1;
            if search_from >= email_body.len() { break; }
        }
        mappings
    };
    // conn dropped — now do async presigned URL generation
    for (file_id, storage_path) in &file_mappings {
        let old_url = format!("/api/files/{}/download", file_id);
        if let Ok(presigned) = state.storage.serve_url(storage_path).await {
            email_body = email_body.replace(&old_url, &presigned);
        } else {
            let abs_url = format!("{}{}", site_url, old_url);
            email_body = email_body.replace(&old_url, &abs_url);
        }
    }

    let config = &state.email_config;
    let sent_count = crate::email::send_bulk_email(config, recipients, &req.subject, &email_body)
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

    crate::sanitize::validate_password(&req.new_password)?;
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

// ── Recent Activity ──

pub async fn recent_activity(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    let conn = state.db.get()?;
    let mut activity: Vec<serde_json::Value> = Vec::new();

    // Recent user registrations
    let mut stmt = conn.prepare(
        "SELECT display_name, role, created_at FROM users ORDER BY created_at DESC LIMIT 5",
    )?;
    for row in stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "type": "registration",
            "message": format!("{} joined as {}", row.get::<_, String>(0)?, row.get::<_, String>(1)?),
            "timestamp": row.get::<_, String>(2)?,
        }))
    })? {
        if let Ok(r) = row { activity.push(r); }
    }
    drop(stmt);

    // Recent RSVPs
    let mut stmt = conn.prepare(
        "SELECT u.display_name, s.first_name || ' ' || s.last_name, cs.title, r.created_at
         FROM rsvps r
         JOIN users u ON r.parent_id = u.id
         JOIN students s ON r.student_id = s.id
         JOIN class_sessions cs ON r.session_id = cs.id
         ORDER BY r.created_at DESC LIMIT 5",
    )?;
    for row in stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "type": "rsvp",
            "message": format!("{} RSVP'd {} for {}", row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?),
            "timestamp": row.get::<_, String>(3)?,
        }))
    })? {
        if let Ok(r) = row { activity.push(r); }
    }
    drop(stmt);

    // Recent session claims
    let mut stmt = conn.prepare(
        "SELECT u.display_name, cs.title, cs.created_at
         FROM class_sessions cs
         JOIN users u ON cs.host_id = u.id
         WHERE cs.status = 'claimed'
         ORDER BY cs.created_at DESC LIMIT 5",
    )?;
    for row in stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "type": "session_claim",
            "message": format!("{} is hosting {}", row.get::<_, String>(0)?, row.get::<_, String>(1)?),
            "timestamp": row.get::<_, String>(2)?,
        }))
    })? {
        if let Ok(r) = row { activity.push(r); }
    }

    // Sort by timestamp descending and take top 10
    activity.sort_by(|a, b| {
        let ta = a["timestamp"].as_str().unwrap_or("");
        let tb = b["timestamp"].as_str().unwrap_or("");
        tb.cmp(ta)
    });
    activity.truncate(10);

    Ok(Json(activity))
}

// ── Class Groups ──

pub async fn list_class_groups(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<Vec<ClassGroup>>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, description, sort_order, active, created_at, grading_enabled FROM class_groups ORDER BY sort_order, name",
    )?;
    let groups = stmt
        .query_map([], |row| {
            Ok(ClassGroup {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                sort_order: row.get(3)?,
                active: row.get(4)?,
                created_at: row.get(5)?,
                grading_enabled: row.get(6)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(Json(groups))
}

pub async fn create_class_group(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Json(req): Json<CreateClassGroupRequest>,
) -> Result<Json<ClassGroup>, AppError> {
    let conn = state.db.get()?;
    let name = validate_required(&req.name, "name")?;
    conn.execute(
        "INSERT INTO class_groups (name, description, sort_order) VALUES (?1, ?2, ?3)",
        params![name, req.description, req.sort_order.unwrap_or(0)],
    )?;
    let id = conn.last_insert_rowid();
    let group = conn.query_row(
        "SELECT id, name, description, sort_order, active, created_at, grading_enabled FROM class_groups WHERE id = ?1",
        [id],
        |row| {
            Ok(ClassGroup {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                sort_order: row.get(3)?,
                active: row.get(4)?,
                created_at: row.get(5)?,
                grading_enabled: row.get(6)?,
            })
        },
    )?;
    Ok(Json(group))
}

pub async fn update_class_group(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateClassGroupRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    if let Some(name) = &req.name {
        let name = validate_required(name, "name")?;
        conn.execute("UPDATE class_groups SET name = ?1 WHERE id = ?2", params![name, id])?;
    }
    if let Some(desc) = &req.description {
        conn.execute("UPDATE class_groups SET description = ?1 WHERE id = ?2", params![desc, id])?;
    }
    if let Some(order) = req.sort_order {
        conn.execute("UPDATE class_groups SET sort_order = ?1 WHERE id = ?2", params![order, id])?;
    }
    if let Some(active) = req.active {
        conn.execute("UPDATE class_groups SET active = ?1 WHERE id = ?2", params![active, id])?;
    }
    if let Some(grading_enabled) = req.grading_enabled {
        conn.execute("UPDATE class_groups SET grading_enabled = ?1 WHERE id = ?2", params![grading_enabled, id])?;
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn delete_class_group(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    conn.execute("DELETE FROM class_groups WHERE id = ?1", [id])?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn list_class_group_members(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT cgm.group_id, cgm.student_id, s.first_name, s.last_name
         FROM class_group_members cgm
         JOIN students s ON cgm.student_id = s.id
         ORDER BY cgm.group_id",
    )?;
    let members: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "group_id": row.get::<_, i64>(0)?,
                "student_id": row.get::<_, i64>(1)?,
                "first_name": row.get::<_, String>(2)?,
                "last_name": row.get::<_, String>(3)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(Json(members))
}

pub async fn add_group_member(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Json(req): Json<AddGroupMemberRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    conn.execute(
        "INSERT OR IGNORE INTO class_group_members (group_id, student_id) VALUES (?1, ?2)",
        params![req.group_id, req.student_id],
    )?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn remove_group_member(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path((group_id, student_id)): Path<(i64, i64)>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    conn.execute(
        "DELETE FROM class_group_members WHERE group_id = ?1 AND student_id = ?2",
        params![group_id, student_id],
    )?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Class Group Teachers ──

pub async fn list_class_group_teachers(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT cgt.group_id, cgt.user_id, u.display_name, u.email
         FROM class_group_teachers cgt
         JOIN users u ON cgt.user_id = u.id
         ORDER BY cgt.group_id",
    )?;
    let teachers: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "group_id": row.get::<_, i64>(0)?,
                "user_id": row.get::<_, i64>(1)?,
                "display_name": row.get::<_, String>(2)?,
                "email": row.get::<_, String>(3)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(Json(teachers))
}

pub async fn add_group_teacher(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Json(req): Json<AddGroupTeacherRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    conn.execute(
        "INSERT OR IGNORE INTO class_group_teachers (group_id, user_id) VALUES (?1, ?2)",
        params![req.group_id, req.user_id],
    )?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn remove_group_teacher(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path((group_id, user_id)): Path<(i64, i64)>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    conn.execute(
        "DELETE FROM class_group_teachers WHERE group_id = ?1 AND user_id = ?2",
        params![group_id, user_id],
    )?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Class Group Announcements ──

pub async fn create_class_group_announcement(
    RequireAdmin(user): RequireAdmin,
    State(state): State<AppState>,
    Json(req): Json<CreateClassGroupAnnouncementRequest>,
) -> Result<Json<ClassGroupAnnouncement>, AppError> {
    let title = validate_required(&req.title, "title")?;
    let body = req.body.unwrap_or_default();
    let conn = state.db.get()?;
    conn.execute(
        "INSERT INTO class_group_announcements (group_id, title, body, created_by) VALUES (?1, ?2, ?3, ?4)",
        params![req.group_id, title, body, user.id],
    )?;
    let id = conn.last_insert_rowid();
    let announcement = conn.query_row(
        "SELECT a.id, a.group_id, a.title, a.body, a.created_by, u.display_name, a.created_at
         FROM class_group_announcements a
         LEFT JOIN users u ON a.created_by = u.id
         WHERE a.id = ?1",
        [id],
        |row| Ok(ClassGroupAnnouncement {
            id: row.get(0)?,
            group_id: row.get(1)?,
            title: row.get(2)?,
            body: row.get(3)?,
            created_by: row.get(4)?,
            created_by_name: row.get(5)?,
            created_at: row.get(6)?,
        }),
    )?;
    Ok(Json(announcement))
}

pub async fn update_class_group_announcement(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateClassGroupAnnouncementRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    if let Some(title) = &req.title {
        let title = validate_required(title, "title")?;
        conn.execute("UPDATE class_group_announcements SET title = ?1 WHERE id = ?2", params![title, id])?;
    }
    if let Some(body) = &req.body {
        conn.execute("UPDATE class_group_announcements SET body = ?1 WHERE id = ?2", params![body, id])?;
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn delete_class_group_announcement(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    conn.execute("DELETE FROM class_group_announcements WHERE id = ?1", [id])?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Class Grades ──

pub async fn create_assignment(
    RequireTeacher(user): RequireTeacher,
    State(state): State<AppState>,
    Json(req): Json<CreateAssignmentRequest>,
) -> Result<Json<ClassAssignment>, AppError> {
    crate::features::require_feature(&state.db, "class_groups")?;
    let conn = state.db.get()?;

    // Verify grading is enabled for this group
    let enabled: bool = conn.query_row(
        "SELECT grading_enabled FROM class_groups WHERE id = ?1",
        [req.group_id],
        |row| row.get(0),
    ).unwrap_or(false);
    if !enabled {
        return Err(AppError::BadRequest("Grading is not enabled for this class".to_string()));
    }

    let title = validate_required(&req.title, "title")?;
    let max_points = req.max_points.unwrap_or(100.0);
    conn.execute(
        "INSERT INTO class_assignments (group_id, title, description, category, max_points, due_date, created_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![req.group_id, title, req.description, req.category, max_points, req.due_date, user.id],
    )?;
    let id = conn.last_insert_rowid();
    let assignment = conn.query_row(
        "SELECT a.id, a.group_id, a.title, a.description, a.category, a.max_points, a.due_date,
                a.created_by, u.display_name, a.created_at
         FROM class_assignments a
         LEFT JOIN users u ON a.created_by = u.id
         WHERE a.id = ?1",
        [id],
        |row| Ok(ClassAssignment {
            id: row.get(0)?,
            group_id: row.get(1)?,
            title: row.get(2)?,
            description: row.get(3)?,
            category: row.get(4)?,
            max_points: row.get(5)?,
            due_date: row.get(6)?,
            created_by: row.get(7)?,
            created_by_name: row.get(8)?,
            created_at: row.get(9)?,
        }),
    )?;
    Ok(Json(assignment))
}

pub async fn update_assignment(
    RequireTeacher(_user): RequireTeacher,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateAssignmentRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    if let Some(title) = &req.title {
        let title = validate_required(title, "title")?;
        conn.execute("UPDATE class_assignments SET title = ?1 WHERE id = ?2", params![title, id])?;
    }
    if let Some(desc) = &req.description {
        conn.execute("UPDATE class_assignments SET description = ?1 WHERE id = ?2", params![desc, id])?;
    }
    if let Some(cat) = &req.category {
        conn.execute("UPDATE class_assignments SET category = ?1 WHERE id = ?2", params![cat, id])?;
    }
    if let Some(max) = req.max_points {
        conn.execute("UPDATE class_assignments SET max_points = ?1 WHERE id = ?2", params![max, id])?;
    }
    if let Some(due) = &req.due_date {
        conn.execute("UPDATE class_assignments SET due_date = ?1 WHERE id = ?2", params![due, id])?;
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn delete_assignment(
    RequireTeacher(_user): RequireTeacher,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    // Cascade deletes grades too
    conn.execute("DELETE FROM class_assignments WHERE id = ?1", [id])?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// Save grades for an assignment (bulk upsert — one request per assignment)
pub async fn save_assignment_grades(
    RequireTeacher(user): RequireTeacher,
    State(state): State<AppState>,
    Path(assignment_id): Path<i64>,
    Json(req): Json<BulkSaveGradesRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    crate::features::require_feature(&state.db, "class_groups")?;
    let conn = state.db.get()?;

    // Verify assignment exists and grading is enabled
    let group_id: i64 = conn.query_row(
        "SELECT a.group_id FROM class_assignments a
         JOIN class_groups g ON a.group_id = g.id
         WHERE a.id = ?1 AND g.grading_enabled = 1",
        [assignment_id],
        |row| row.get(0),
    ).map_err(|_| AppError::BadRequest("Assignment not found or grading not enabled".to_string()))?;

    for g in &req.grades {
        // Verify student is in the group
        let in_group: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM class_group_members WHERE group_id = ?1 AND student_id = ?2",
            params![group_id, g.student_id],
            |row| row.get(0),
        ).unwrap_or(false);
        if !in_group { continue; }

        conn.execute(
            "INSERT INTO class_grades (assignment_id, student_id, score, notes, graded_by, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
             ON CONFLICT(assignment_id, student_id) DO UPDATE SET
               score = excluded.score,
               notes = excluded.notes,
               graded_by = excluded.graded_by,
               updated_at = datetime('now')",
            params![assignment_id, g.student_id, g.score, g.notes, user.id],
        )?;
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// PUT /api/admin/class-groups/{id}/category-weights — save category weights for a class
pub async fn save_category_weights(
    RequireTeacher(_user): RequireTeacher,
    State(state): State<AppState>,
    Path(group_id): Path<i64>,
    Json(req): Json<SaveCategoryWeightsRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    crate::features::require_feature(&state.db, "class_groups")?;
    let conn = state.db.get()?;

    // Verify grading is enabled
    let enabled: bool = conn.query_row(
        "SELECT grading_enabled FROM class_groups WHERE id = ?1",
        [group_id],
        |row| row.get(0),
    ).unwrap_or(false);
    if !enabled {
        return Err(AppError::BadRequest("Grading is not enabled for this class".to_string()));
    }

    // Replace all weights for this group
    conn.execute("DELETE FROM grade_category_weights WHERE group_id = ?1", [group_id])?;
    for w in &req.weights {
        if w.category.trim().is_empty() { continue; }
        conn.execute(
            "INSERT INTO grade_category_weights (group_id, category, weight) VALUES (?1, ?2, ?3)",
            params![group_id, w.category.trim(), w.weight],
        )?;
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Feature Flags ──

pub async fn update_feature_flags(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Json(flags): Json<std::collections::HashMap<String, bool>>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    let valid_features = ["blog", "resources", "lesson_plans", "member_directory", "student_progress", "families", "my_children", "my_rsvps", "class_groups"];
    for (key, enabled) in &flags {
        if valid_features.contains(&key.as_str()) {
            conn.execute(
                "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?1, ?2)",
                params![format!("feature_{}", key), if *enabled { "1" } else { "0" }],
            )?;
        }
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── File Management ──

pub async fn list_all_files(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    // Storage summary
    let total_bytes: i64 = conn.query_row("SELECT COALESCE(SUM(size_bytes), 0) FROM files", [], |row| row.get(0)).unwrap_or(0);
    let file_count: i64 = conn.query_row("SELECT COUNT(*) FROM files", [], |row| row.get(0)).unwrap_or(0);
    let session_bytes: i64 = conn.query_row("SELECT COALESCE(SUM(size_bytes), 0) FROM files WHERE linked_type = 'session'", [], |row| row.get(0)).unwrap_or(0);
    let lesson_bytes: i64 = conn.query_row("SELECT COALESCE(SUM(size_bytes), 0) FROM files WHERE linked_type = 'lesson_plan'", [], |row| row.get(0)).unwrap_or(0);
    let other_bytes: i64 = conn.query_row("SELECT COALESCE(SUM(size_bytes), 0) FROM files WHERE linked_type IS NULL OR (linked_type != 'session' AND linked_type != 'lesson_plan')", [], |row| row.get(0)).unwrap_or(0);

    // All files with uploader info
    let mut stmt = conn.prepare(
        "SELECT f.id, f.filename, f.mime_type, f.size_bytes, f.linked_type, f.linked_id, f.created_at, u.display_name
         FROM files f
         LEFT JOIN users u ON f.uploader_id = u.id
         ORDER BY f.created_at DESC"
    )?;
    let files: Vec<serde_json::Value> = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "filename": row.get::<_, String>(1)?,
            "mime_type": row.get::<_, String>(2)?,
            "size_bytes": row.get::<_, i64>(3)?,
            "linked_type": row.get::<_, Option<String>>(4)?,
            "linked_id": row.get::<_, Option<i64>>(5)?,
            "created_at": row.get::<_, String>(6)?,
            "uploader_name": row.get::<_, Option<String>>(7)?,
        }))
    })?.filter_map(|r| r.ok()).collect();

    Ok(Json(serde_json::json!({
        "summary": {
            "total_bytes": total_bytes,
            "total_mb": format!("{:.1}", total_bytes as f64 / (1024.0 * 1024.0)),
            "file_count": file_count,
            "session_bytes": session_bytes,
            "lesson_plan_bytes": lesson_bytes,
            "other_bytes": other_bytes,
            "r2_free_tier_gb": 10,
        },
        "files": files,
    })))
}

pub async fn admin_delete_file(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let storage_path: String = {
        let conn = state.db.get()?;
        let path: String = conn.query_row("SELECT storage_path FROM files WHERE id = ?1", params![id], |row| row.get(0))
            .map_err(|_| AppError::NotFound("File not found".to_string()))?;
        conn.execute("DELETE FROM files WHERE id = ?1", params![id])?;
        path
    };
    let _ = state.storage.delete(&storage_path).await;
    Ok(Json(serde_json::json!({ "ok": true })))
}
