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

    let group = conn.query_row(
        "SELECT cg.id, cg.name, cg.description, cg.grading_enabled
         FROM class_groups cg WHERE cg.id = ?1 AND cg.active = 1",
        [id],
        |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "name": row.get::<_, String>(1)?,
                "description": row.get::<_, Option<String>>(2)?,
                "grading_enabled": row.get::<_, bool>(3)?,
            }))
        },
    )?;

    Ok(Json(group))
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

/// GET /api/class-groups/{id}/grades — grades for this group
/// Teachers/admins see all; parents see only their children's grades
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
        return Ok(Json(serde_json::json!({ "grading_enabled": false, "grades": [] })));
    }

    let grades: Vec<serde_json::Value> = if user.role == "admin" || user.role == "teacher" {
        let mut stmt = conn.prepare(
            "SELECT g.id, g.group_id, g.student_id, s.first_name || ' ' || s.last_name,
                    g.assignment_title, g.grade, g.max_grade, g.notes,
                    g.graded_by, u.display_name, g.created_at
             FROM class_grades g
             JOIN students s ON g.student_id = s.id
             LEFT JOIN users u ON g.graded_by = u.id
             WHERE g.group_id = ?1
             ORDER BY g.assignment_title, s.last_name, s.first_name",
        )?;
        let result = stmt.query_map(params![id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "group_id": row.get::<_, i64>(1)?,
                "student_id": row.get::<_, i64>(2)?,
                "student_name": row.get::<_, String>(3)?,
                "assignment_title": row.get::<_, String>(4)?,
                "grade": row.get::<_, Option<f64>>(5)?,
                "max_grade": row.get::<_, Option<f64>>(6)?,
                "notes": row.get::<_, Option<String>>(7)?,
                "graded_by": row.get::<_, i64>(8)?,
                "graded_by_name": row.get::<_, Option<String>>(9)?,
                "created_at": row.get::<_, String>(10)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();
        result
    } else {
        // Parents see only their children's grades
        let mut stmt = conn.prepare(
            "SELECT g.id, g.group_id, g.student_id, s.first_name || ' ' || s.last_name,
                    g.assignment_title, g.grade, g.max_grade, g.notes,
                    g.graded_by, u.display_name, g.created_at
             FROM class_grades g
             JOIN students s ON g.student_id = s.id
             LEFT JOIN users u ON g.graded_by = u.id
             JOIN student_parents sp ON g.student_id = sp.student_id
             WHERE g.group_id = ?1 AND sp.user_id = ?2
             ORDER BY g.assignment_title, s.last_name, s.first_name",
        )?;
        let result = stmt.query_map(params![id, user.id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "group_id": row.get::<_, i64>(1)?,
                "student_id": row.get::<_, i64>(2)?,
                "student_name": row.get::<_, String>(3)?,
                "assignment_title": row.get::<_, String>(4)?,
                "grade": row.get::<_, Option<f64>>(5)?,
                "max_grade": row.get::<_, Option<f64>>(6)?,
                "notes": row.get::<_, Option<String>>(7)?,
                "graded_by": row.get::<_, i64>(8)?,
                "graded_by_name": row.get::<_, Option<String>>(9)?,
                "created_at": row.get::<_, String>(10)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();
        result
    };

    Ok(Json(serde_json::json!({ "grading_enabled": true, "grades": grades })))
}
