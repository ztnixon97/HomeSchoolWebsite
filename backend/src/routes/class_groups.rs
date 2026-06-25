use axum::{
    extract::{Path, State},
    Json,
};
use rusqlite::params;

use crate::auth::RequireAuth;
use crate::errors::AppError;
use crate::features::require_feature;
use crate::models::*;
use crate::AppState;

/// Check if user has access to a class group:
/// - admin/teacher → always allowed
/// - parent → must have a child in the group
fn check_group_access(state: &AppState, user: &User, group_id: i64) -> Result<(), AppError> {
    if user.role == "admin" || user.role == "teacher" {
        return Ok(());
    }
    let conn = state.db.get()?;
    let has_child: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM student_parents sp
             JOIN class_group_members cgm ON sp.student_id = cgm.student_id
             WHERE sp.user_id = ?1 AND cgm.group_id = ?2",
            params![user.id, group_id],
            |row| row.get(0),
        )
        .unwrap_or(false);
    if has_child {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

/// Check if user is an assigned teacher for this class group
fn is_class_teacher(state: &AppState, user_id: i64, group_id: i64) -> bool {
    let conn = match state.db.get() {
        Ok(c) => c,
        Err(_) => return false,
    };
    conn.query_row(
        "SELECT COUNT(*) > 0 FROM class_group_teachers WHERE group_id = ?1 AND user_id = ?2",
        params![group_id, user_id],
        |row| row.get(0),
    ).unwrap_or(false)
}

/// GET /api/class-groups/browse — active classes with the user's children's enrollment status
pub async fn browse_classes(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    require_feature(&state.db, "class_groups")?;
    let conn = state.db.get()?;

    let mut cstmt = conn.prepare(
        "SELECT s.id, s.first_name || ' ' || s.last_name
         FROM students s JOIN student_parents sp ON s.id = sp.student_id
         WHERE sp.user_id = ?1 ORDER BY s.first_name",
    )?;
    let children: Vec<(i64, String)> = cstmt.query_map(params![user.id], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
    })?.filter_map(|r| r.ok()).collect();

    let mut gstmt = conn.prepare(
        "SELECT cg.id, cg.name, cg.description, cg.capacity,
                (SELECT COUNT(*) FROM class_group_members m WHERE m.group_id = cg.id) as member_count
         FROM class_groups cg WHERE cg.active = 1 ORDER BY cg.sort_order, cg.name",
    )?;
    let rows: Vec<(i64, String, Option<String>, Option<i64>, i64)> = gstmt.query_map([], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
    })?.filter_map(|r| r.ok()).collect();

    let mut out = Vec::new();
    for (gid, name, description, capacity, member_count) in rows {
        let mut my_students = Vec::new();
        for (sid, sname) in &children {
            let enrolled: bool = conn.query_row(
                "SELECT COUNT(*) > 0 FROM class_group_members WHERE group_id = ?1 AND student_id = ?2",
                params![gid, sid], |row| row.get(0)).unwrap_or(false);
            let status = if enrolled {
                "enrolled".to_string()
            } else {
                conn.query_row(
                    "SELECT status FROM enrollment_requests WHERE group_id = ?1 AND student_id = ?2",
                    params![gid, sid], |row| row.get::<_, String>(0)).unwrap_or_else(|_| "none".to_string())
            };
            my_students.push(serde_json::json!({ "student_id": sid, "name": sname, "status": status }));
        }
        let is_full = capacity.map(|c| member_count >= c).unwrap_or(false);
        out.push(serde_json::json!({
            "id": gid, "name": name, "description": description,
            "capacity": capacity, "member_count": member_count, "is_full": is_full,
            "my_students": my_students,
        }));
    }
    Ok(Json(out))
}

/// POST /api/class-groups/{id}/enroll-request — parent requests to enroll a child
pub async fn request_enrollment(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(group_id): Path<i64>,
    Json(req): Json<EnrollStudentRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_feature(&state.db, "class_groups")?;
    let conn = state.db.get()?;

    let is_parent: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM student_parents WHERE user_id = ?1 AND student_id = ?2",
        params![user.id, req.student_id], |row| row.get(0)).unwrap_or(false);
    if !is_parent {
        return Err(AppError::Forbidden);
    }

    let (active, capacity): (bool, Option<i64>) = conn.query_row(
        "SELECT active, capacity FROM class_groups WHERE id = ?1",
        params![group_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|_| AppError::NotFound("Class not found".to_string()))?;
    if !active {
        return Err(AppError::BadRequest("Class is not active".to_string()));
    }

    let enrolled: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM class_group_members WHERE group_id = ?1 AND student_id = ?2",
        params![group_id, req.student_id], |row| row.get(0)).unwrap_or(false);
    if enrolled {
        return Err(AppError::BadRequest("Student is already enrolled".to_string()));
    }

    let member_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM class_group_members WHERE group_id = ?1",
        params![group_id], |row| row.get(0)).unwrap_or(0);
    let status = match capacity {
        Some(c) if member_count >= c => "waitlisted",
        _ => "pending",
    };

    conn.execute(
        "INSERT INTO enrollment_requests (group_id, student_id, requested_by, status)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(group_id, student_id) DO UPDATE SET status = ?4, requested_by = ?3, reviewed_by = NULL, reviewed_at = NULL, created_at = datetime('now')",
        params![group_id, req.student_id, user.id, status],
    )?;

    Ok(Json(serde_json::json!({ "ok": true, "status": status })))
}

/// POST /api/class-groups/{id}/members — admin/class teacher adds a student to the roster
pub async fn add_class_member(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(group_id): Path<i64>,
    Json(req): Json<EnrollStudentRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_feature(&state.db, "class_groups")?;
    if user.role != "admin" && !is_class_teacher(&state, user.id, group_id) {
        return Err(AppError::Forbidden);
    }
    let conn = state.db.get()?;
    conn.execute(
        "INSERT OR IGNORE INTO class_group_members (group_id, student_id) VALUES (?1, ?2)",
        params![group_id, req.student_id],
    )?;
    let _ = conn.execute(
        "UPDATE enrollment_requests SET status = 'approved', reviewed_by = ?3, reviewed_at = datetime('now')
         WHERE group_id = ?1 AND student_id = ?2 AND status IN ('pending','waitlisted')",
        params![group_id, req.student_id, user.id],
    );
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// DELETE /api/class-groups/{id}/members/{student_id} — admin/class teacher removes a student
pub async fn remove_class_member(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path((group_id, student_id)): Path<(i64, i64)>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_feature(&state.db, "class_groups")?;
    if user.role != "admin" && !is_class_teacher(&state, user.id, group_id) {
        return Err(AppError::Forbidden);
    }
    let conn = state.db.get()?;
    conn.execute(
        "DELETE FROM class_group_members WHERE group_id = ?1 AND student_id = ?2",
        params![group_id, student_id],
    )?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// GET /api/class-groups/{id}/candidate-students — students not yet in the class (manager only)
pub async fn candidate_students(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(group_id): Path<i64>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    require_feature(&state.db, "class_groups")?;
    if user.role != "admin" && !is_class_teacher(&state, user.id, group_id) {
        return Err(AppError::Forbidden);
    }
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT s.id, s.first_name, s.last_name FROM students s
         WHERE s.id NOT IN (SELECT student_id FROM class_group_members WHERE group_id = ?1)
         ORDER BY s.last_name, s.first_name",
    )?;
    let out: Vec<serde_json::Value> = stmt.query_map(params![group_id], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "first_name": row.get::<_, String>(1)?,
            "last_name": row.get::<_, String>(2)?,
        }))
    })?.filter_map(|r| r.ok()).collect();
    Ok(Json(out))
}

/// GET /api/class-groups — list groups visible to the user
pub async fn list_user_class_groups(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    require_feature(&state.db, "class_groups")?;
    let conn = state.db.get()?;

    let groups: Vec<serde_json::Value> = if user.role == "admin" || user.role == "teacher" {
        let mut stmt = conn.prepare(
            "SELECT cg.id, cg.name, cg.description, cg.sort_order,
                    (SELECT COUNT(*) FROM class_group_members cgm WHERE cgm.group_id = cg.id) as member_count,
                    (SELECT COUNT(DISTINCT csg.session_id) FROM class_session_groups csg
                     JOIN class_sessions cs ON csg.session_id = cs.id
                     WHERE csg.group_id = cg.id AND cs.session_date >= date('now')) as upcoming_sessions
             FROM class_groups cg WHERE cg.active = 1 ORDER BY cg.sort_order, cg.name",
        )?;
        let result = stmt.query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "name": row.get::<_, String>(1)?,
                "description": row.get::<_, Option<String>>(2)?,
                "sort_order": row.get::<_, i32>(3)?,
                "member_count": row.get::<_, i64>(4)?,
                "upcoming_sessions": row.get::<_, i64>(5)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();
        result
    } else {
        // Parents only see groups their children belong to
        let mut stmt = conn.prepare(
            "SELECT DISTINCT cg.id, cg.name, cg.description, cg.sort_order,
                    (SELECT COUNT(*) FROM class_group_members cgm WHERE cgm.group_id = cg.id) as member_count,
                    (SELECT COUNT(DISTINCT csg.session_id) FROM class_session_groups csg
                     JOIN class_sessions cs ON csg.session_id = cs.id
                     WHERE csg.group_id = cg.id AND cs.session_date >= date('now')) as upcoming_sessions
             FROM class_groups cg
             JOIN class_group_members cgm ON cg.id = cgm.group_id
             JOIN student_parents sp ON cgm.student_id = sp.student_id
             WHERE sp.user_id = ?1 AND cg.active = 1
             ORDER BY cg.sort_order, cg.name",
        )?;
        let result = stmt.query_map(params![user.id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "name": row.get::<_, String>(1)?,
                "description": row.get::<_, Option<String>>(2)?,
                "sort_order": row.get::<_, i32>(3)?,
                "member_count": row.get::<_, i64>(4)?,
                "upcoming_sessions": row.get::<_, i64>(5)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();
        result
    };

    Ok(Json(groups))
}

/// GET /api/class-groups/{id} — single group detail
pub async fn get_class_group(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_feature(&state.db, "class_groups")?;
    check_group_access(&state, &user, id)?;
    let conn = state.db.get()?;

    let is_assigned_teacher = is_class_teacher(&state, user.id, id);

    let group = conn.query_row(
        "SELECT cg.id, cg.name, cg.description, cg.grading_enabled, cg.home_content, cg.capacity,
                (SELECT COUNT(*) FROM class_group_members m WHERE m.group_id = cg.id) as member_count,
                cg.meeting_info, cg.term_start, cg.term_end
         FROM class_groups cg WHERE cg.id = ?1 AND cg.active = 1",
        [id],
        |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "name": row.get::<_, String>(1)?,
                "description": row.get::<_, Option<String>>(2)?,
                "grading_enabled": row.get::<_, bool>(3)?,
                "home_content": row.get::<_, Option<String>>(4)?,
                "capacity": row.get::<_, Option<i64>>(5)?,
                "member_count": row.get::<_, i64>(6)?,
                "meeting_info": row.get::<_, Option<String>>(7)?,
                "term_start": row.get::<_, Option<String>>(8)?,
                "term_end": row.get::<_, Option<String>>(9)?,
                "is_class_teacher": is_assigned_teacher,
            }))
        },
    )?;

    Ok(Json(group))
}

/// PUT /api/class-groups/{id}/home — update the class home page content
/// Allowed for admin or assigned teachers
pub async fn update_class_home(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateClassHomeContentRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_feature(&state.db, "class_groups")?;

    let allowed = user.role == "admin" || is_class_teacher(&state, user.id, id);
    if !allowed {
        return Err(AppError::Forbidden);
    }

    let conn = state.db.get()?;
    conn.execute(
        "UPDATE class_groups SET home_content = ?1 WHERE id = ?2",
        params![req.home_content, id],
    )?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// PUT /api/class-groups/{id}/info — assigned teacher or admin edits class description + meeting info
pub async fn update_class_info(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateClassInfoRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_feature(&state.db, "class_groups")?;
    if user.role != "admin" && !is_class_teacher(&state, user.id, id) {
        return Err(AppError::Forbidden);
    }
    let conn = state.db.get()?;
    if let Some(desc) = &req.description {
        let stored: Option<&str> = if desc.trim().is_empty() { None } else { Some(desc.as_str()) };
        conn.execute("UPDATE class_groups SET description = ?1 WHERE id = ?2", params![stored, id])?;
    }
    if let Some(mi) = &req.meeting_info {
        let stored: Option<&str> = if mi.trim().is_empty() { None } else { Some(mi.as_str()) };
        conn.execute("UPDATE class_groups SET meeting_info = ?1 WHERE id = ?2", params![stored, id])?;
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// GET /api/class-groups/{id}/sessions — sessions for this group
pub async fn get_group_sessions(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    require_feature(&state.db, "class_groups")?;
    check_group_access(&state, &user, id)?;
    let conn = state.db.get()?;

    let mut stmt = conn.prepare(
        "SELECT cs.id, cs.title, cs.theme, cs.session_date, cs.start_time, cs.end_time,
                cs.status, cs.host_id, u.display_name as host_name,
                st.label as session_type_label, cs.max_students,
                (SELECT COUNT(*) FROM rsvps r WHERE r.session_id = cs.id AND r.status = 'confirmed') as rsvp_count
         FROM class_sessions cs
         JOIN class_session_groups csg ON cs.id = csg.session_id
         LEFT JOIN users u ON cs.host_id = u.id
         LEFT JOIN session_types st ON cs.session_type_id = st.id
         WHERE csg.group_id = ?1
         ORDER BY cs.session_date DESC, cs.start_time",
    )?;
    let sessions: Vec<serde_json::Value> = stmt
        .query_map(params![id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "title": row.get::<_, String>(1)?,
                "theme": row.get::<_, Option<String>>(2)?,
                "session_date": row.get::<_, String>(3)?,
                "start_time": row.get::<_, Option<String>>(4)?,
                "end_time": row.get::<_, Option<String>>(5)?,
                "status": row.get::<_, String>(6)?,
                "host_id": row.get::<_, Option<i64>>(7)?,
                "host_name": row.get::<_, Option<String>>(8)?,
                "session_type_label": row.get::<_, Option<String>>(9)?,
                "max_students": row.get::<_, Option<i64>>(10)?,
                "rsvp_count": row.get::<_, i64>(11)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(sessions))
}

/// GET /api/class-groups/{id}/roster — students in the group
pub async fn get_group_roster(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    require_feature(&state.db, "class_groups")?;
    check_group_access(&state, &user, id)?;
    let conn = state.db.get()?;

    let show_health = user.role == "admin" || user.role == "teacher";
    let mut stmt = conn.prepare(
        "SELECT s.id, s.first_name, s.last_name, s.date_of_birth, s.allergies, s.dietary_restrictions
         FROM students s
         JOIN class_group_members cgm ON s.id = cgm.student_id
         WHERE cgm.group_id = ?1
         ORDER BY s.last_name, s.first_name",
    )?;
    let roster: Vec<serde_json::Value> = stmt
        .query_map(params![id], |row| {
            let mut obj = serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "first_name": row.get::<_, String>(1)?,
                "last_name": row.get::<_, String>(2)?,
                "date_of_birth": row.get::<_, Option<String>>(3)?,
            });
            if show_health {
                obj["allergies"] = serde_json::json!(row.get::<_, String>(4)?);
                obj["dietary_restrictions"] = serde_json::json!(row.get::<_, String>(5)?);
            }
            Ok(obj)
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(roster))
}

/// GET /api/class-groups/{id}/attendance — attendance summary across group sessions
pub async fn get_group_attendance(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_feature(&state.db, "class_groups")?;
    check_group_access(&state, &user, id)?;
    let conn = state.db.get()?;

    // Get recent sessions for this group (last 10)
    let mut session_stmt = conn.prepare(
        "SELECT cs.id, cs.title, cs.session_date
         FROM class_sessions cs
         JOIN class_session_groups csg ON cs.id = csg.session_id
         WHERE csg.group_id = ?1 AND cs.session_date <= date('now')
         ORDER BY cs.session_date DESC LIMIT 10",
    )?;
    let sessions: Vec<serde_json::Value> = session_stmt
        .query_map(params![id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "title": row.get::<_, String>(1)?,
                "session_date": row.get::<_, String>(2)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();

    // Get attendance records for these sessions
    let session_ids: Vec<i64> = sessions
        .iter()
        .filter_map(|s| s["id"].as_i64())
        .collect();

    let mut records: Vec<serde_json::Value> = Vec::new();
    if !session_ids.is_empty() {
        let placeholders: Vec<String> = session_ids.iter().enumerate().map(|(i, _)| format!("?{}", i + 1)).collect();
        let sql = format!(
            "SELECT sa.session_id, sa.student_id, s.first_name, s.last_name, sa.present
             FROM session_attendance sa
             JOIN students s ON sa.student_id = s.id
             WHERE sa.session_id IN ({})
             ORDER BY s.last_name, s.first_name",
            placeholders.join(",")
        );
        let mut stmt = conn.prepare(&sql)?;
        let params_refs: Vec<&dyn rusqlite::types::ToSql> = session_ids.iter().map(|id| id as &dyn rusqlite::types::ToSql).collect();
        records = stmt
            .query_map(rusqlite::params_from_iter(&params_refs), |row| {
                Ok(serde_json::json!({
                    "session_id": row.get::<_, i64>(0)?,
                    "student_id": row.get::<_, i64>(1)?,
                    "first_name": row.get::<_, String>(2)?,
                    "last_name": row.get::<_, String>(3)?,
                    "present": row.get::<_, bool>(4)?,
                }))
            })?
            .filter_map(|r| r.ok())
            .collect();
    }

    Ok(Json(serde_json::json!({
        "sessions": sessions,
        "records": records,
    })))
}

/// GET /api/class-groups/{id}/announcements — announcements for this group
pub async fn get_group_announcements(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<Vec<ClassGroupAnnouncement>>, AppError> {
    require_feature(&state.db, "class_groups")?;
    check_group_access(&state, &user, id)?;
    let conn = state.db.get()?;

    let mut stmt = conn.prepare(
        "SELECT a.id, a.group_id, a.title, a.body, a.created_by, u.display_name, a.created_at
         FROM class_group_announcements a
         LEFT JOIN users u ON a.created_by = u.id
         WHERE a.group_id = ?1
         ORDER BY a.created_at DESC",
    )?;
    let announcements: Vec<ClassGroupAnnouncement> = stmt
        .query_map(params![id], |row| {
            Ok(ClassGroupAnnouncement {
                id: row.get(0)?,
                group_id: row.get(1)?,
                title: row.get(2)?,
                body: row.get(3)?,
                created_by: row.get(4)?,
                created_by_name: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(announcements))
}

/// GET /api/class-groups/{id}/grades — assignments + grades for this group
/// Teachers/admins see all students; parents see only their children's grades
pub async fn get_group_grades(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_feature(&state.db, "class_groups")?;
    check_group_access(&state, &user, id)?;
    let conn = state.db.get()?;

    // Check grading_enabled
    let enabled: bool = conn.query_row(
        "SELECT grading_enabled FROM class_groups WHERE id = ?1",
        [id],
        |row| row.get(0),
    ).unwrap_or(false);

    if !enabled {
        return Ok(Json(serde_json::json!({ "grading_enabled": false, "assignments": [], "grades": [], "category_weights": [] })));
    }

    // Fetch assignments for this group
    let mut stmt = conn.prepare(
        "SELECT a.id, a.group_id, a.title, a.description, a.category, a.max_points,
                a.due_date, a.created_by, u.display_name, a.created_at
         FROM class_assignments a
         LEFT JOIN users u ON a.created_by = u.id
         WHERE a.group_id = ?1
         ORDER BY a.due_date IS NULL, a.due_date, a.created_at",
    )?;
    let assignments: Vec<serde_json::Value> = stmt.query_map(params![id], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "group_id": row.get::<_, i64>(1)?,
            "title": row.get::<_, String>(2)?,
            "description": row.get::<_, Option<String>>(3)?,
            "category": row.get::<_, Option<String>>(4)?,
            "max_points": row.get::<_, f64>(5)?,
            "due_date": row.get::<_, Option<String>>(6)?,
            "created_by": row.get::<_, i64>(7)?,
            "created_by_name": row.get::<_, Option<String>>(8)?,
            "created_at": row.get::<_, String>(9)?,
        }))
    })?
    .filter_map(|r| r.ok())
    .collect();

    // Fetch grades
    let grades: Vec<serde_json::Value> = if user.role == "admin" || user.role == "teacher" || is_class_teacher(&state, user.id, id) {
        let mut stmt2 = conn.prepare(
            "SELECT g.id, g.assignment_id, g.student_id, s.first_name || ' ' || s.last_name,
                    g.score, g.notes, g.graded_by, u.display_name, g.updated_at, g.status
             FROM class_grades g
             JOIN students s ON g.student_id = s.id
             LEFT JOIN users u ON g.graded_by = u.id
             JOIN class_assignments a ON g.assignment_id = a.id
             WHERE a.group_id = ?1
             ORDER BY g.assignment_id, s.last_name, s.first_name",
        )?;
        let result = stmt2.query_map(params![id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "assignment_id": row.get::<_, i64>(1)?,
                "student_id": row.get::<_, i64>(2)?,
                "student_name": row.get::<_, String>(3)?,
                "score": row.get::<_, Option<f64>>(4)?,
                "notes": row.get::<_, Option<String>>(5)?,
                "graded_by": row.get::<_, i64>(6)?,
                "graded_by_name": row.get::<_, Option<String>>(7)?,
                "updated_at": row.get::<_, String>(8)?,
                "status": row.get::<_, String>(9)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();
        result
    } else {
        // Parents see only their children's grades
        let mut stmt2 = conn.prepare(
            "SELECT g.id, g.assignment_id, g.student_id, s.first_name || ' ' || s.last_name,
                    g.score, g.notes, g.graded_by, u.display_name, g.updated_at, g.status
             FROM class_grades g
             JOIN students s ON g.student_id = s.id
             LEFT JOIN users u ON g.graded_by = u.id
             JOIN class_assignments a ON g.assignment_id = a.id
             JOIN student_parents sp ON g.student_id = sp.student_id
             WHERE a.group_id = ?1 AND sp.user_id = ?2
             ORDER BY g.assignment_id, s.last_name, s.first_name",
        )?;
        let result = stmt2.query_map(params![id, user.id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "assignment_id": row.get::<_, i64>(1)?,
                "student_id": row.get::<_, i64>(2)?,
                "student_name": row.get::<_, String>(3)?,
                "score": row.get::<_, Option<f64>>(4)?,
                "notes": row.get::<_, Option<String>>(5)?,
                "graded_by": row.get::<_, i64>(6)?,
                "graded_by_name": row.get::<_, Option<String>>(7)?,
                "updated_at": row.get::<_, String>(8)?,
                "status": row.get::<_, String>(9)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();
        result
    };

    // Fetch category weights
    let mut wstmt = conn.prepare(
        "SELECT id, group_id, category, weight, drop_lowest FROM grade_category_weights WHERE group_id = ?1 ORDER BY category",
    )?;
    let category_weights: Vec<serde_json::Value> = wstmt.query_map(params![id], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "group_id": row.get::<_, i64>(1)?,
            "category": row.get::<_, String>(2)?,
            "weight": row.get::<_, f64>(3)?,
            "drop_lowest": row.get::<_, i64>(4)?,
        }))
    })?
    .filter_map(|r| r.ok())
    .collect();

    Ok(Json(serde_json::json!({ "grading_enabled": true, "assignments": assignments, "grades": grades, "category_weights": category_weights })))
}
