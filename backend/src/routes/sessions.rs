use axum::{
    extract::{Path, State},
    Json,
};
use rusqlite::params;
use crate::auth::{RequireAuth, RequireTeacher};
use crate::errors::AppError;
use crate::models::*;
use crate::sanitize::validate_date;
use crate::AppState;

// ── Class Sessions ──

pub async fn create_session(
    RequireTeacher(user): RequireTeacher,
    State(state): State<AppState>,
    Json(req): Json<CreateSessionRequest>,
) -> Result<Json<ClassSession>, AppError> {
    let conn = state.db.get()?;
    validate_date(&req.session_date, "session_date")?;
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

pub async fn list_sessions(
    RequireAuth(_user): RequireAuth,
    State(state): State<AppState>,
    axum::extract::Query(query): axum::extract::Query<SessionsQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    let mut where_clauses = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref q) = query.q {
        let q = q.trim();
        if !q.is_empty() {
            let pattern = format!("%{}%", q);
            params_vec.push(Box::new(pattern.clone()));
            params_vec.push(Box::new(pattern));
            where_clauses.push(format!("(cs.title LIKE ?{} OR cs.theme LIKE ?{})", params_vec.len() - 1, params_vec.len()));
        }
    }
    if let Some(ref status) = query.status {
        if !status.is_empty() {
            params_vec.push(Box::new(status.clone()));
            where_clauses.push(format!("cs.status = ?{}", params_vec.len()));
        }
    }
    if let Some(type_id) = query.session_type_id {
        params_vec.push(Box::new(type_id));
        where_clauses.push(format!("cs.session_type_id = ?{}", params_vec.len()));
    }
    if let Some(ref df) = query.date_from {
        if !df.is_empty() {
            params_vec.push(Box::new(df.clone()));
            where_clauses.push(format!("cs.session_date >= ?{}", params_vec.len()));
        }
    }
    if let Some(ref dt) = query.date_to {
        if !dt.is_empty() {
            params_vec.push(Box::new(dt.clone()));
            where_clauses.push(format!("cs.session_date <= ?{}", params_vec.len()));
        }
    }
    if let Some(group_id) = query.class_group_id {
        params_vec.push(Box::new(group_id));
        where_clauses.push(format!(
            "cs.id IN (SELECT session_id FROM class_session_groups WHERE group_id = ?{})",
            params_vec.len()
        ));
    }

    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    let base_select = format!(
        "FROM class_sessions cs
         LEFT JOIN users u ON cs.host_id = u.id
         LEFT JOIN session_types st ON cs.session_type_id = st.id
         {}", where_sql
    );

    let params_refs: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    // If pagination requested, return paginated response
    if query.page.is_some() || query.page_size.is_some() {
        let page = query.page.unwrap_or(1).max(1);
        let page_size = query.page_size.unwrap_or(12).clamp(1, 50);
        let offset = (page - 1) * page_size;

        let total: i64 = conn.query_row(
            &format!("SELECT COUNT(*) {}", base_select),
            rusqlite::params_from_iter(&params_refs),
            |row| row.get(0),
        )?;

        let mut limit_params = params_vec.iter().map(|p| p.as_ref() as &dyn rusqlite::types::ToSql).collect::<Vec<_>>();
        limit_params.push(&page_size);
        limit_params.push(&offset);

        let sql = format!(
            "SELECT cs.id, cs.title, cs.theme, cs.session_date, cs.end_date, cs.start_time, cs.end_time,
                    cs.host_id, COALESCE(u.display_name, cs.reserved_for), cs.host_address, cs.location_name, cs.location_address,
                    cs.cost_amount, cs.cost_details, cs.lesson_plan_id,
                    cs.materials_needed, cs.max_students, cs.notes, cs.status,
                    cs.session_type_id, st.name, st.label, cs.rsvp_cutoff, cs.require_approval,
                    cs.created_by, cs.created_at
             {} ORDER BY cs.session_date ASC, cs.start_time ASC LIMIT ?{} OFFSET ?{}",
            base_select, limit_params.len() - 1, limit_params.len()
        );

        let mut stmt = conn.prepare(&sql)?;
        let sessions: Vec<ClassSession> = stmt.query_map(rusqlite::params_from_iter(&limit_params), |row| {
            Ok(ClassSession {
                id: row.get(0)?, title: row.get(1)?, theme: row.get(2)?,
                session_date: row.get(3)?, end_date: row.get(4)?, start_time: row.get(5)?,
                end_time: row.get(6)?, host_id: row.get(7)?, host_name: row.get(8)?,
                host_address: row.get(9)?, location_name: row.get(10)?, location_address: row.get(11)?,
                cost_amount: row.get(12)?, cost_details: row.get(13)?, lesson_plan_id: row.get(14)?,
                materials_needed: row.get(15)?, max_students: row.get(16)?, notes: row.get(17)?,
                status: row.get(18)?, session_type_id: row.get(19)?, session_type_name: row.get(20)?,
                session_type_label: row.get(21)?, rsvp_cutoff: row.get(22)?, require_approval: row.get(23)?,
                created_by: row.get(24)?, created_at: row.get(25)?,
            })
        })?.filter_map(|r| r.ok()).collect();

        return Ok(Json(serde_json::json!({ "items": sessions, "total": total, "page": page, "page_size": page_size })));
    }

    // No pagination — return all (backwards compatible for Dashboard, etc.)
    let sql = format!(
        "SELECT cs.id, cs.title, cs.theme, cs.session_date, cs.end_date, cs.start_time, cs.end_time,
                cs.host_id, COALESCE(u.display_name, cs.reserved_for), cs.host_address, cs.location_name, cs.location_address,
                cs.cost_amount, cs.cost_details, cs.lesson_plan_id,
                cs.materials_needed, cs.max_students, cs.notes, cs.status,
                cs.session_type_id, st.name, st.label, cs.rsvp_cutoff, cs.require_approval,
                cs.created_by, cs.created_at
         {} ORDER BY cs.session_date ASC, cs.start_time ASC",
        base_select
    );

    let mut stmt = conn.prepare(&sql)?;
    let sessions: Vec<ClassSession> = stmt.query_map(rusqlite::params_from_iter(&params_refs), |row| {
        Ok(ClassSession {
            id: row.get(0)?, title: row.get(1)?, theme: row.get(2)?,
            session_date: row.get(3)?, end_date: row.get(4)?, start_time: row.get(5)?,
            end_time: row.get(6)?, host_id: row.get(7)?, host_name: row.get(8)?,
            host_address: row.get(9)?, location_name: row.get(10)?, location_address: row.get(11)?,
            cost_amount: row.get(12)?, cost_details: row.get(13)?, lesson_plan_id: row.get(14)?,
            materials_needed: row.get(15)?, max_students: row.get(16)?, notes: row.get(17)?,
            status: row.get(18)?, session_type_id: row.get(19)?, session_type_name: row.get(20)?,
            session_type_label: row.get(21)?, rsvp_cutoff: row.get(22)?, require_approval: row.get(23)?,
            created_by: row.get(24)?, created_at: row.get(25)?,
        })
    })?.filter_map(|r| r.ok()).collect();

    Ok(Json(serde_json::json!(sessions)))
}

pub async fn list_users(
    RequireTeacher(_user): RequireTeacher,
    State(state): State<AppState>,
) -> Result<Json<Vec<BasicUser>>, AppError> {
    crate::features::require_feature(&state.db, "member_directory")?;
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, display_name, email, role, phone, address, preferred_contact FROM users WHERE active = 1 ORDER BY display_name",
    )?;
    let users: Vec<BasicUser> = stmt
        .query_map([], |row| {
            Ok(BasicUser {
                id: row.get(0)?,
                display_name: row.get(1)?,
                email: row.get(2)?,
                role: row.get(3)?,
                phone: row.get(4)?,
                address: row.get(5)?,
                preferred_contact: row.get(6)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(Json(users))
}

pub async fn list_members(
    RequireTeacher(_user): RequireTeacher,
    State(state): State<AppState>,
    axum::extract::Query(query): axum::extract::Query<MembersQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    crate::features::require_feature(&state.db, "member_directory")?;
    let conn = state.db.get()?;

    let mut where_clauses = vec!["u.active = 1".to_string()];
    let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref q) = query.q {
        let q = q.trim();
        if !q.is_empty() {
            let pattern = format!("%{}%", q);
            params_vec.push(Box::new(pattern.clone()));
            params_vec.push(Box::new(pattern));
            where_clauses.push(format!("(u.display_name LIKE ?{} OR u.email LIKE ?{})", params_vec.len() - 1, params_vec.len()));
        }
    }
    if let Some(ref role) = query.role {
        if !role.is_empty() {
            params_vec.push(Box::new(role.clone()));
            where_clauses.push(format!("u.role = ?{}", params_vec.len()));
        }
    }

    let where_sql = where_clauses.join(" AND ");
    let base = format!("FROM users u WHERE {}", where_sql);
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    let make_row = |row: &rusqlite::Row| -> rusqlite::Result<MemberProfile> {
        let hosted_str: String = row.get(7)?;
        let upcoming_str: String = row.get(8)?;
        let children_str: String = row.get(9)?;
        Ok(MemberProfile {
            id: row.get(0)?, display_name: row.get(1)?, email: row.get(2)?, role: row.get(3)?,
            phone: row.get(4)?, address: row.get(5)?, preferred_contact: row.get(6)?,
            hosted_sessions: if hosted_str.is_empty() { vec![] } else { hosted_str.split("||").map(String::from).collect() },
            upcoming_sessions: if upcoming_str.is_empty() { vec![] } else { upcoming_str.split("||").map(String::from).collect() },
            children: if children_str.is_empty() { vec![] } else { children_str.split("||").map(String::from).collect() },
        })
    };

    let select_cols = format!(
        "SELECT u.id, u.display_name, u.email, u.role, u.phone, u.address, u.preferred_contact,
                COALESCE((SELECT GROUP_CONCAT(cs.title, '||') FROM class_sessions cs WHERE cs.host_id = u.id), ''),
                COALESCE((SELECT GROUP_CONCAT(cs2.title, '||') FROM class_sessions cs2 WHERE cs2.host_id = u.id AND cs2.session_date >= date('now')), ''),
                COALESCE((SELECT GROUP_CONCAT(s.first_name || ' ' || s.last_name, '||') FROM students s JOIN student_parents sp ON s.id = sp.student_id WHERE sp.user_id = u.id), '')
         {}", base
    );

    if query.page.is_some() || query.page_size.is_some() {
        let page = query.page.unwrap_or(1).max(1);
        let page_size = query.page_size.unwrap_or(12).clamp(1, 50);
        let offset = (page - 1) * page_size;

        let total: i64 = conn.query_row(&format!("SELECT COUNT(*) {}", base), rusqlite::params_from_iter(&params_refs), |row| row.get(0))?;

        let mut lp: Vec<&dyn rusqlite::types::ToSql> = params_refs.clone();
        lp.push(&page_size);
        lp.push(&offset);

        let sql = format!("{} ORDER BY u.display_name LIMIT ?{} OFFSET ?{}", select_cols, lp.len() - 1, lp.len());
        let mut stmt = conn.prepare(&sql)?;
        let members: Vec<MemberProfile> = stmt.query_map(rusqlite::params_from_iter(&lp), make_row)?.filter_map(|r| r.ok()).collect();

        return Ok(Json(serde_json::json!({ "items": members, "total": total, "page": page, "page_size": page_size })));
    }

    let sql = format!("{} ORDER BY u.display_name", select_cols);
    let mut stmt = conn.prepare(&sql)?;
    let members: Vec<MemberProfile> = stmt.query_map(rusqlite::params_from_iter(&params_refs), make_row)?.filter_map(|r| r.ok()).collect();
    Ok(Json(serde_json::json!(members)))
}

pub async fn list_lesson_plan_collaborators(
    RequireTeacher(_user): RequireTeacher,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<Vec<LessonPlanCollaborator>>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT u.id, u.display_name, u.email
         FROM lesson_plan_collaborators c
         JOIN users u ON c.user_id = u.id
         WHERE c.lesson_plan_id = ?1
         ORDER BY u.display_name",
    )?;
    let collaborators: Vec<LessonPlanCollaborator> = stmt
        .query_map(params![id], |row| {
            Ok(LessonPlanCollaborator {
                user_id: row.get(0)?,
                display_name: row.get(1)?,
                email: row.get(2)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(Json(collaborators))
}

pub async fn add_lesson_plan_collaborator(
    RequireTeacher(user): RequireTeacher,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<AddCollaboratorRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    let author_id: i64 = conn
        .query_row("SELECT author_id FROM lesson_plans WHERE id = ?1", params![id], |row| row.get(0))
        .map_err(|_| AppError::NotFound("Lesson plan not found".to_string()))?;

    if author_id != user.id && user.role != "admin" {
        return Err(AppError::Forbidden);
    }

    conn.execute(
        "INSERT OR IGNORE INTO lesson_plan_collaborators (lesson_plan_id, user_id) VALUES (?1, ?2)",
        params![id, req.user_id],
    )?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn remove_lesson_plan_collaborator(
    RequireTeacher(user): RequireTeacher,
    State(state): State<AppState>,
    Path((id, user_id)): Path<(i64, i64)>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    let author_id: i64 = conn
        .query_row("SELECT author_id FROM lesson_plans WHERE id = ?1", params![id], |row| row.get(0))
        .map_err(|_| AppError::NotFound("Lesson plan not found".to_string()))?;

    if author_id != user.id && user.role != "admin" {
        return Err(AppError::Forbidden);
    }

    conn.execute(
        "DELETE FROM lesson_plan_collaborators WHERE lesson_plan_id = ?1 AND user_id = ?2",
        params![id, user_id],
    )?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn list_active_session_types(
    RequireAuth(_user): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<Vec<SessionType>>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, label, sort_order, active, hostable, rsvpable, multi_day,
                description, requires_location, supports_cost, cost_label,
                allow_supplies, allow_attendance, allow_photos
         FROM session_types WHERE active = 1 ORDER BY sort_order, label",
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

pub async fn get_session(
    RequireAuth(_user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<ClassSession>, AppError> {
    let conn = state.db.get()?;
    let session = conn
        .query_row(
            "SELECT cs.id, cs.title, cs.theme, cs.session_date, cs.end_date, cs.start_time, cs.end_time,
                    cs.host_id, COALESCE(u.display_name, cs.reserved_for), cs.host_address, cs.location_name, cs.location_address,
                    cs.cost_amount, cs.cost_details, cs.lesson_plan_id,
                    cs.materials_needed, cs.max_students, cs.notes, cs.status,
                    cs.session_type_id, st.name, st.label, cs.rsvp_cutoff, cs.require_approval,
                    cs.created_by, cs.created_at
             FROM class_sessions cs
             LEFT JOIN users u ON cs.host_id = u.id
             LEFT JOIN session_types st ON cs.session_type_id = st.id
             WHERE cs.id = ?1",
            params![id],
            |row| {
                Ok(ClassSession {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    theme: row.get(2)?,
                    session_date: row.get(3)?,
                    end_date: row.get(4)?,
                    start_time: row.get(5)?,
                    end_time: row.get(6)?,
                    host_id: row.get(7)?,
                    host_name: row.get(8)?,
                    host_address: row.get(9)?,
                    location_name: row.get(10)?,
                    location_address: row.get(11)?,
                    cost_amount: row.get(12)?,
                    cost_details: row.get(13)?,
                    lesson_plan_id: row.get(14)?,
                    materials_needed: row.get(15)?,
                    max_students: row.get(16)?,
                    notes: row.get(17)?,
                    status: row.get(18)?,
                    session_type_id: row.get(19)?,
                    session_type_name: row.get(20)?,
                    session_type_label: row.get(21)?,
                    rsvp_cutoff: row.get(22)?,
                    require_approval: row.get(23)?,
                    created_by: row.get(24)?,
                    created_at: row.get(25)?,
                })
            },
        )
        .map_err(|_| AppError::NotFound("Session not found".to_string()))?;

    Ok(Json(session))
}

pub async fn claim_session(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<ClaimSessionRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    let hostable: i64 = conn
        .query_row(
            "SELECT st.hostable
             FROM class_sessions cs
             LEFT JOIN session_types st ON cs.session_type_id = st.id
             WHERE cs.id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::NotFound("Session not found".to_string()))?;
    if hostable == 0 {
        return Err(AppError::BadRequest("This session type cannot be hosted".to_string()));
    }

    // Auto-fill host_address from user profile if not provided
    let host_address = if req.host_address.trim().is_empty() {
        conn.query_row(
            "SELECT address FROM users WHERE id = ?1",
            params![user.id],
            |row| row.get::<_, Option<String>>(0),
        )
        .unwrap_or(None)
        .unwrap_or_default()
    } else {
        req.host_address.clone()
    };

    // Use atomic UPDATE to prevent race condition
    let changes = conn.execute(
        "UPDATE class_sessions SET host_id = ?1, host_address = ?2, lesson_plan_id = ?3, materials_needed = ?4,
             rsvp_cutoff = COALESCE(?5, rsvp_cutoff), require_approval = COALESCE(?6, require_approval),
             status = 'claimed'
         WHERE id = ?7 AND status = 'open'",
        params![user.id, host_address, req.lesson_plan_id, req.materials_needed, req.rsvp_cutoff, req.require_approval, id],
    )?;

    if changes == 0 {
        return Err(AppError::BadRequest("Session is no longer available to claim".into()));
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn unclaim_session(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    let host_id: Option<i64> = conn
        .query_row("SELECT host_id FROM class_sessions WHERE id = ?1", params![id], |row| row.get(0))
        .map_err(|_| AppError::NotFound("Session not found".to_string()))?;

    if host_id != Some(user.id) && user.role != "admin" {
        return Err(AppError::Forbidden);
    }

    conn.execute(
        "UPDATE class_sessions SET host_id = NULL, host_address = NULL, lesson_plan_id = NULL, materials_needed = NULL, status = 'open' WHERE id = ?1",
        params![id],
    )?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn complete_session(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    let host_id: Option<i64> = conn
        .query_row("SELECT host_id FROM class_sessions WHERE id = ?1", params![id], |row| row.get(0))
        .map_err(|_| AppError::NotFound("Session not found".to_string()))?;

    if host_id != Some(user.id) && user.role != "admin" {
        return Err(AppError::Forbidden);
    }

    conn.execute("UPDATE class_sessions SET status = 'completed' WHERE id = ?1", params![id])?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn my_rsvps(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    crate::features::require_feature(&state.db, "my_rsvps")?;
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT r.id, r.session_id, r.student_id, s.first_name || ' ' || s.last_name as student_name,
                r.status, r.note, cs.title as session_title, cs.session_date, cs.start_time,
                cs.location_name, COALESCE(cs.location_address, cs.host_address) as location
         FROM rsvps r
         JOIN students s ON r.student_id = s.id
         JOIN class_sessions cs ON r.session_id = cs.id
         WHERE r.parent_id = ?1
         ORDER BY cs.session_date ASC",
    )?;
    let rsvps: Vec<serde_json::Value> = stmt.query_map(params![user.id], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "session_id": row.get::<_, i64>(1)?,
            "student_id": row.get::<_, i64>(2)?,
            "student_name": row.get::<_, String>(3)?,
            "status": row.get::<_, String>(4)?,
            "note": row.get::<_, Option<String>>(5)?,
            "session_title": row.get::<_, String>(6)?,
            "session_date": row.get::<_, String>(7)?,
            "start_time": row.get::<_, Option<String>>(8)?,
            "location_name": row.get::<_, Option<String>>(9)?,
            "location": row.get::<_, Option<String>>(10)?,
        }))
    })?.filter_map(|r| r.ok()).collect();

    Ok(Json(rsvps))
}

pub async fn update_host_session(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateHostSessionRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    let host_id: Option<i64> = conn
        .query_row("SELECT host_id FROM class_sessions WHERE id = ?1", params![id], |row| row.get(0))
        .map_err(|_| AppError::NotFound("Session not found".to_string()))?;

    if host_id != Some(user.id) && user.role != "admin" {
        return Err(AppError::Forbidden);
    }

    if let Some(title) = req.title {
        conn.execute("UPDATE class_sessions SET title = ?1 WHERE id = ?2", params![title, id])?;
    }
    if let Some(start_time) = req.start_time {
        conn.execute("UPDATE class_sessions SET start_time = ?1 WHERE id = ?2", params![start_time, id])?;
    }
    if let Some(end_time) = req.end_time {
        conn.execute("UPDATE class_sessions SET end_time = ?1 WHERE id = ?2", params![end_time, id])?;
    }
    if let Some(host_address) = req.host_address {
        conn.execute("UPDATE class_sessions SET host_address = ?1 WHERE id = ?2", params![host_address, id])?;
    }
    if let Some(lesson_plan_id) = req.lesson_plan_id {
        conn.execute("UPDATE class_sessions SET lesson_plan_id = ?1 WHERE id = ?2", params![lesson_plan_id, id])?;
    }
    if let Some(materials_needed) = req.materials_needed {
        conn.execute("UPDATE class_sessions SET materials_needed = ?1 WHERE id = ?2", params![materials_needed, id])?;
    }
    if let Some(max_students) = req.max_students {
        conn.execute("UPDATE class_sessions SET max_students = ?1 WHERE id = ?2", params![max_students, id])?;
    }
    if let Some(notes) = req.notes {
        conn.execute("UPDATE class_sessions SET notes = ?1 WHERE id = ?2", params![notes, id])?;
    }
    if let Some(rsvp_cutoff) = req.rsvp_cutoff {
        conn.execute("UPDATE class_sessions SET rsvp_cutoff = ?1 WHERE id = ?2", params![rsvp_cutoff, id])?;
    }
    if let Some(require_approval) = req.require_approval {
        conn.execute("UPDATE class_sessions SET require_approval = ?1 WHERE id = ?2", params![require_approval, id])?;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── RSVPs ──

pub async fn list_session_rsvps(
    RequireAuth(_user): RequireAuth,
    State(state): State<AppState>,
    Path(session_id): Path<i64>,
) -> Result<Json<Vec<Rsvp>>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT r.id, r.session_id, r.student_id, (s.first_name || ' ' || s.last_name), r.parent_id, u.display_name, r.status, r.note, r.created_at
         FROM rsvps r
         JOIN students s ON r.student_id = s.id
         JOIN users u ON r.parent_id = u.id
         WHERE r.session_id = ?1
         ORDER BY s.last_name, s.first_name",
    )?;

    let rsvps: Vec<Rsvp> = stmt
        .query_map(params![session_id], |row| {
            Ok(Rsvp {
                id: row.get(0)?,
                session_id: row.get(1)?,
                student_id: row.get(2)?,
                student_name: row.get(3)?,
                parent_id: row.get(4)?,
                parent_name: row.get(5)?,
                status: row.get(6)?,
                note: row.get(7)?,
                created_at: row.get(8)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(rsvps))
}

#[derive(serde::Serialize)]
pub struct SessionHealthSummary {
    pub dietary_restrictions: Vec<String>,
    pub allergies: Vec<String>,
}

pub async fn get_session_health_summary(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(session_id): Path<i64>,
) -> Result<Json<SessionHealthSummary>, AppError> {
    let conn = state.db.get()?;
    let host_id: Option<i64> = conn
        .query_row("SELECT host_id FROM class_sessions WHERE id = ?1", params![session_id], |row| row.get(0))
        .map_err(|_| AppError::NotFound("Session not found".to_string()))?;

    if host_id != Some(user.id) && user.role != "admin" {
        return Err(AppError::Forbidden);
    }

    let mut stmt = conn.prepare(
        "SELECT s.allergies, s.dietary_restrictions
         FROM rsvps r
         JOIN students s ON r.student_id = s.id
         WHERE r.session_id = ?1",
    )?;

    let mut allergies: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    let mut dietary: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    for row in stmt.query_map(params![session_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))? {
        if let Ok((a, d)) = row {
            let a = a.trim();
            if !a.is_empty() {
                *allergies.entry(a.to_string()).or_insert(0) += 1;
            }
            let d = d.trim();
            if !d.is_empty() {
                *dietary.entry(d.to_string()).or_insert(0) += 1;
            }
        }
    }

    let mut allergies_list: Vec<String> = allergies
        .into_iter()
        .map(|(k, v)| if v > 1 { format!("{k} ({v})") } else { k })
        .collect();
    allergies_list.sort();

    let mut dietary_list: Vec<String> = dietary
        .into_iter()
        .map(|(k, v)| if v > 1 { format!("{k} ({v})") } else { k })
        .collect();
    dietary_list.sort();

    Ok(Json(SessionHealthSummary {
        dietary_restrictions: dietary_list,
        allergies: allergies_list,
    }))
}

pub async fn create_rsvp(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Json(req): Json<CreateRsvpRequest>,
) -> Result<Json<Rsvp>, AppError> {
    let conn = state.db.get()?;
    let (rsvpable, max_students, require_approval, confirmed_count): (i64, Option<i64>, i64, i64) = conn
        .query_row(
            "SELECT st.rsvpable,
                    cs.max_students,
                    cs.require_approval,
                    (SELECT COUNT(*) FROM rsvps WHERE session_id = cs.id AND status = 'confirmed')
             FROM class_sessions cs
             LEFT JOIN session_types st ON cs.session_type_id = st.id
             WHERE cs.id = ?1",
            params![req.session_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|_| AppError::NotFound("Session not found".to_string()))?;
    if rsvpable == 0 {
        return Err(AppError::BadRequest("RSVPs are disabled for this session".to_string()));
    }
    let cutoff: Option<String> = conn
        .query_row(
            "SELECT rsvp_cutoff FROM class_sessions WHERE id = ?1",
            params![req.session_id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::NotFound("Session not found".to_string()))?;
    if let Some(cutoff) = cutoff {
        use chrono::NaiveDateTime;
        let now = chrono::Utc::now().naive_utc();
        // Try multiple formats since cutoff may come from datetime-local input (no seconds) or ISO format
        let cutoff_dt = NaiveDateTime::parse_from_str(&cutoff, "%Y-%m-%dT%H:%M:%S")
            .or_else(|_| NaiveDateTime::parse_from_str(&cutoff, "%Y-%m-%dT%H:%M"))
            .or_else(|_| NaiveDateTime::parse_from_str(&cutoff, "%Y-%m-%d %H:%M:%S"))
            .or_else(|_| NaiveDateTime::parse_from_str(&cutoff, "%Y-%m-%d %H:%M"));
        if let Ok(cutoff_dt) = cutoff_dt {
            if now > cutoff_dt {
                return Err(AppError::BadRequest("RSVP cutoff has passed".to_string()));
            }
        }
        // If cutoff can't be parsed, skip the check rather than blocking the RSVP
    }

    // Verify this parent is linked to the student
    let linked: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM student_parents WHERE student_id = ?1 AND user_id = ?2",
            params![req.student_id, user.id],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if !linked && user.role != "admin" {
        return Err(AppError::BadRequest("You can only RSVP for your own children".to_string()));
    }

    // If class_groups feature is enabled, check group membership
    if user.role != "admin" && user.role != "teacher" {
        if crate::features::require_feature(&state.db, "class_groups").is_ok() {
            let session_group_ids: Vec<i64> = {
                let mut stmt = conn.prepare(
                    "SELECT group_id FROM class_session_groups WHERE session_id = ?1",
                )?;
                let result = stmt.query_map(params![req.session_id], |row| row.get(0))?
                    .filter_map(|r| r.ok())
                    .collect();
                result
            };
            if !session_group_ids.is_empty() {
                let placeholders: Vec<String> = session_group_ids.iter().enumerate().map(|(i, _)| format!("?{}", i + 2)).collect();
                let sql = format!(
                    "SELECT COUNT(*) > 0 FROM class_group_members WHERE student_id = ?1 AND group_id IN ({})",
                    placeholders.join(",")
                );
                let mut check_stmt = conn.prepare(&sql)?;
                let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
                param_values.push(Box::new(req.student_id));
                for gid in &session_group_ids {
                    param_values.push(Box::new(*gid));
                }
                let refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|b| b.as_ref()).collect();
                let in_group: bool = check_stmt.query_row(&*refs, |row| row.get(0)).unwrap_or(false);
                if !in_group {
                    return Err(AppError::BadRequest("Student is not in any of this session's class groups".to_string()));
                }
            }
        }
    }

    let is_full = max_students.map(|max| confirmed_count >= max).unwrap_or(false);
    let status = if is_full {
        "waitlisted"
    } else if require_approval == 1 {
        "pending"
    } else {
        "confirmed"
    };

    conn.execute(
        "INSERT INTO rsvps (session_id, student_id, parent_id, note, status) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![req.session_id, req.student_id, user.id, req.note, status],
    )?;

    let id = conn.last_insert_rowid();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();

    // Push notification to session host
    if let Some(ref push_cfg) = state.push_config {
        let host_info: Option<(i64, String)> = conn.query_row(
            "SELECT cs.host_id, cs.title FROM class_sessions cs WHERE cs.id = ?1 AND cs.host_id IS NOT NULL",
            params![req.session_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).ok();
        let student_name: String = conn.query_row(
            "SELECT first_name || ' ' || last_name FROM students WHERE id = ?1",
            params![req.student_id],
            |row| row.get(0),
        ).unwrap_or_else(|_| "A student".to_string());

        if let Some((host_id, session_title)) = host_info {
            if host_id != user.id {
                let db = state.db.clone();
                let cfg = push_cfg.clone();
                let push_url = format!("/sessions/{}", req.session_id);
                tokio::spawn(async move {
                    crate::push::send_push_to_user(
                        db, cfg, host_id, "rsvp",
                        &format!("New RSVP for {}", session_title),
                        &format!("{} has RSVPed.", student_name),
                        &push_url,
                    ).await;
                });
            }
        }
    }

    Ok(Json(Rsvp {
        id,
        session_id: req.session_id,
        student_id: req.student_id,
        student_name: None,
        parent_id: user.id,
        parent_name: Some(user.display_name),
        status: status.to_string(),
        note: req.note,
        created_at: now,
    }))
}

pub async fn update_rsvp_status(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateRsvpRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    let (_session_id, host_id, _max_students, _confirmed_count): (i64, Option<i64>, Option<i64>, i64) = conn
        .query_row(
            "SELECT cs.id, cs.host_id, cs.max_students,
                    (SELECT COUNT(*) FROM rsvps WHERE session_id = cs.id AND status = 'confirmed')
             FROM rsvps r
             JOIN class_sessions cs ON r.session_id = cs.id
             WHERE r.id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|_| AppError::NotFound("RSVP not found".to_string()))?;

    if host_id != Some(user.id) && user.role != "admin" {
        return Err(AppError::Forbidden);
    }

    if let Some(status) = &req.status {
        conn.execute("UPDATE rsvps SET status = ?1 WHERE id = ?2", params![status, id])?;
    }
    if let Some(note) = &req.note {
        conn.execute("UPDATE rsvps SET note = ?1 WHERE id = ?2", params![note, id])?;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn delete_rsvp(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    let (parent_id, host_id, session_id, was_confirmed): (i64, Option<i64>, i64, String) = conn
        .query_row(
            "SELECT r.parent_id, cs.host_id, r.session_id, r.status
             FROM rsvps r
             JOIN class_sessions cs ON r.session_id = cs.id
             WHERE r.id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|_| AppError::NotFound("RSVP not found".to_string()))?;

    // Allow same-family members to manage each other's RSVPs
    let same_family = user.family_id.is_some() && conn.query_row(
        "SELECT COUNT(*) > 0 FROM users WHERE id = ?1 AND family_id = ?2",
        params![parent_id, user.family_id.unwrap()],
        |row| row.get::<_, bool>(0),
    ).unwrap_or(false);

    if parent_id != user.id && !same_family && host_id != Some(user.id) && user.role != "admin" {
        return Err(AppError::Forbidden);
    }

    // Push notification to host about RSVP cancellation
    if let Some(ref push_cfg) = state.push_config {
        if let Some(hid) = host_id {
            if hid != user.id {
                let session_title: String = conn.query_row(
                    "SELECT title FROM class_sessions WHERE id = ?1", params![session_id], |row| row.get(0),
                ).unwrap_or_else(|_| "a session".to_string());
                let db = state.db.clone();
                let cfg = push_cfg.clone();
                let push_url = format!("/sessions/{}", session_id);
                tokio::spawn(async move {
                    crate::push::send_push_to_user(
                        db, cfg, hid, "rsvp",
                        &format!("RSVP cancelled for {}", session_title),
                        "An RSVP has been cancelled.",
                        &push_url,
                    ).await;
                });
            }
        }
    }

    conn.execute("DELETE FROM rsvps WHERE id = ?1", params![id])?;

    // If a confirmed RSVP was removed, auto-promote the first waitlisted
    if was_confirmed == "confirmed" {
        let _ = conn.execute(
            "UPDATE rsvps SET status = 'confirmed' WHERE id = (
                SELECT id FROM rsvps WHERE session_id = ?1 AND status = 'waitlisted' ORDER BY created_at ASC LIMIT 1
            )",
            params![session_id],
        );
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Session Attendance ──

pub async fn get_session_attendance(
    RequireAuth(_user): RequireAuth,
    State(state): State<AppState>,
    Path(session_id): Path<i64>,
) -> Result<Json<Vec<SessionAttendance>>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT sa.id, sa.session_id, sa.student_id, s.first_name || ' ' || s.last_name, sa.present, sa.note
         FROM session_attendance sa
         JOIN students s ON sa.student_id = s.id
         WHERE sa.session_id = ?1",
    )?;
    let records: Vec<SessionAttendance> = stmt.query_map(params![session_id], |row| {
        Ok(SessionAttendance {
            id: row.get(0)?, session_id: row.get(1)?, student_id: row.get(2)?,
            student_name: row.get(3)?, present: row.get(4)?, note: row.get(5)?,
        })
    })?.filter_map(|r| r.ok()).collect();
    Ok(Json(records))
}

pub async fn save_session_attendance(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Json(req): Json<RecordSessionAttendanceRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    // Only host or admin can record attendance
    let host_id: Option<i64> = conn.query_row(
        "SELECT host_id FROM class_sessions WHERE id = ?1",
        params![req.session_id],
        |row| row.get(0),
    ).map_err(|_| AppError::NotFound("Session not found".to_string()))?;

    if host_id != Some(user.id) && user.role != "admin" {
        return Err(AppError::Forbidden);
    }

    for record in &req.records {
        conn.execute(
            "INSERT INTO session_attendance (session_id, student_id, present, note, recorded_by)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(session_id, student_id) DO UPDATE SET present = ?3, note = ?4, recorded_by = ?5",
            params![req.session_id, record.student_id, record.present, record.note, user.id],
        )?;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Session Supplies ──

pub async fn list_session_supplies(
    RequireAuth(_user): RequireAuth,
    State(state): State<AppState>,
    Path(session_id): Path<i64>,
) -> Result<Json<Vec<SessionSupply>>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT ss.id, ss.session_id, ss.item_name, ss.quantity, ss.claimed_by, u.display_name
         FROM session_supplies ss
         LEFT JOIN users u ON ss.claimed_by = u.id
         WHERE ss.session_id = ?1
         ORDER BY ss.created_at ASC",
    )?;
    let supplies: Vec<SessionSupply> = stmt.query_map(params![session_id], |row| {
        Ok(SessionSupply {
            id: row.get(0)?, session_id: row.get(1)?, item_name: row.get(2)?,
            quantity: row.get(3)?, claimed_by: row.get(4)?, claimed_by_name: row.get(5)?,
        })
    })?.filter_map(|r| r.ok()).collect();
    Ok(Json(supplies))
}

pub async fn add_session_supply(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(session_id): Path<i64>,
    Json(req): Json<CreateSupplyRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    let host_id: Option<i64> = conn.query_row(
        "SELECT host_id FROM class_sessions WHERE id = ?1", params![session_id], |row| row.get(0),
    ).map_err(|_| AppError::NotFound("Session not found".to_string()))?;

    if host_id != Some(user.id) && user.role != "admin" {
        return Err(AppError::Forbidden);
    }

    conn.execute(
        "INSERT INTO session_supplies (session_id, item_name, quantity) VALUES (?1, ?2, ?3)",
        params![session_id, req.item_name, req.quantity],
    )?;

    Ok(Json(serde_json::json!({ "id": conn.last_insert_rowid() })))
}

pub async fn claim_supply(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    let claimed = conn.execute(
        "UPDATE session_supplies SET claimed_by = ?1 WHERE id = ?2 AND claimed_by IS NULL",
        params![user.id, id],
    )?;

    if claimed == 0 {
        return Err(AppError::BadRequest("This item has already been claimed".to_string()));
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn unclaim_supply(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    // Only the person who claimed it (or admin) can unclaim
    let claimed_by: Option<i64> = conn.query_row(
        "SELECT claimed_by FROM session_supplies WHERE id = ?1", params![id], |row| row.get(0),
    ).map_err(|_| AppError::NotFound("Supply not found".to_string()))?;

    if claimed_by != Some(user.id) && user.role != "admin" {
        return Err(AppError::Forbidden);
    }

    conn.execute("UPDATE session_supplies SET claimed_by = NULL WHERE id = ?1", params![id])?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn delete_supply(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    // Only host of the session or admin can delete
    let host_id: Option<i64> = conn.query_row(
        "SELECT cs.host_id FROM session_supplies ss JOIN class_sessions cs ON ss.session_id = cs.id WHERE ss.id = ?1",
        params![id], |row| row.get(0),
    ).map_err(|_| AppError::NotFound("Supply not found".to_string()))?;

    if host_id != Some(user.id) && user.role != "admin" {
        return Err(AppError::Forbidden);
    }

    conn.execute("DELETE FROM session_supplies WHERE id = ?1", params![id])?;
    Ok(Json(serde_json::json!({ "ok": true })))
}
