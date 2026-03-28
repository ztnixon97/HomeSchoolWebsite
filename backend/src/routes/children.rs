use axum::{
    extract::{Path, State},
    Json,
};
use rusqlite::params;
use crate::auth::{RequireAuth, RequireTeacher};
use crate::errors::AppError;
use crate::models::*;
use crate::sanitize::{sanitize_text, validate_required};
use crate::AppState;

// ── My Children (Parent view) ──

pub async fn my_children(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<Vec<Student>>, AppError> {
    crate::features::require_feature(&state.db, "my_children")?;
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT s.id, s.first_name, s.last_name, s.date_of_birth, s.notes, s.allergies, s.dietary_restrictions, s.emergency_contact_name, s.emergency_contact_phone, s.enrolled, s.created_at
         FROM students s
         JOIN student_parents sp ON s.id = sp.student_id
         WHERE sp.user_id = ?1",
    )?;

    let students: Vec<Student> = stmt
        .query_map(params![user.id], |row| {
            Ok(Student {
                id: row.get(0)?,
                first_name: row.get(1)?,
                last_name: row.get(2)?,
                date_of_birth: row.get(3)?,
                notes: row.get(4)?,
                allergies: row.get(5)?,
                dietary_restrictions: row.get(6)?,
                emergency_contact_name: row.get(7)?,
                emergency_contact_phone: row.get(8)?,
                enrolled: row.get(9)?,
                created_at: row.get(10)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(students))
}

pub async fn create_my_child(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Json(req): Json<CreateStudentRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    crate::features::require_feature(&state.db, "my_children")?;
    let mut conn = state.db.get()?;
    let first_name = validate_required(&req.first_name, "first_name")?;
    let first_name = sanitize_text(&first_name);
    let last_name = validate_required(&req.last_name, "last_name")?;
    let last_name = sanitize_text(&last_name);

    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO students (first_name, last_name, date_of_birth, notes, allergies, dietary_restrictions, emergency_contact_name, emergency_contact_phone)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            first_name,
            last_name,
            req.date_of_birth,
            req.notes,
            req.allergies.unwrap_or_default(),
            req.dietary_restrictions.unwrap_or_default(),
            req.emergency_contact_name,
            req.emergency_contact_phone
        ],
    )?;
    let student_id = tx.last_insert_rowid();
    tx.execute(
        "INSERT OR IGNORE INTO student_parents (student_id, user_id) VALUES (?1, ?2)",
        params![student_id, user.id],
    )?;
    // Auto-link all family members to this new child
    if let Some(fid) = user.family_id {
        tx.execute(
            "INSERT OR IGNORE INTO student_parents (student_id, user_id)
             SELECT ?1, u.id FROM users u WHERE u.family_id = ?2 AND u.id != ?3",
            params![student_id, fid, user.id],
        )?;
    }
    tx.commit()?;

    Ok(Json(serde_json::json!({ "id": student_id })))
}

pub async fn update_my_child(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateMyChildRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    crate::features::require_feature(&state.db, "my_children")?;
    let conn = state.db.get()?;
    let linked: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM student_parents WHERE student_id = ?1 AND user_id = ?2",
            params![id, user.id],
            |row| row.get(0),
        )
        .unwrap_or(false);
    if !linked && user.role != "admin" {
        return Err(AppError::Forbidden);
    }

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
    if let Some(name) = req.emergency_contact_name {
        conn.execute("UPDATE students SET emergency_contact_name = ?1 WHERE id = ?2", params![name, id])?;
    }
    if let Some(phone) = req.emergency_contact_phone {
        conn.execute("UPDATE students SET emergency_contact_phone = ?1 WHERE id = ?2", params![phone, id])?;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn delete_my_child(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    crate::features::require_feature(&state.db, "my_children")?;
    let conn = state.db.get()?;
    let linked: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM student_parents WHERE student_id = ?1 AND user_id = ?2",
            params![id, user.id],
            |row| row.get(0),
        )
        .unwrap_or(false);
    if !linked && user.role != "admin" {
        return Err(AppError::Forbidden);
    }

    conn.execute(
        "DELETE FROM student_parents WHERE student_id = ?1 AND user_id = ?2",
        params![id, user.id],
    )?;

    let remaining: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM student_parents WHERE student_id = ?1",
            params![id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if remaining == 0 {
        conn.execute("DELETE FROM students WHERE id = ?1", params![id])?;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Parent Milestone View ──

/// GET /api/my-children/{id}/milestones — parent sees milestones for their own child
pub async fn get_my_child_milestones(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<Vec<Milestone>>, AppError> {
    crate::features::require_feature(&state.db, "student_progress")?;
    let conn = state.db.get()?;

    // Verify parent-child link (unless admin/teacher)
    if user.role != "admin" && user.role != "teacher" {
        let linked: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM student_parents WHERE student_id = ?1 AND user_id = ?2",
                params![id, user.id],
                |row| row.get(0),
            )
            .unwrap_or(false);
        if !linked {
            return Err(AppError::Forbidden);
        }
    }

    let mut stmt = conn.prepare(
        "SELECT id, student_id, recorded_by, category, title, notes, achieved_date, created_at
         FROM milestones WHERE student_id = ?1 ORDER BY created_at DESC",
    )?;
    let milestones: Vec<Milestone> = stmt
        .query_map(params![id], |row| {
            Ok(Milestone {
                id: row.get(0)?,
                student_id: row.get(1)?,
                recorded_by: row.get(2)?,
                category: row.get(3)?,
                title: row.get(4)?,
                notes: row.get(5)?,
                achieved_date: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(milestones))
}

// ── Students & Milestones (Teacher+) ──

pub async fn list_students(
    RequireTeacher(_user): RequireTeacher,
    State(state): State<AppState>,
) -> Result<Json<Vec<Student>>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, first_name, last_name, date_of_birth, notes, allergies, dietary_restrictions, emergency_contact_name, emergency_contact_phone, enrolled, created_at FROM students ORDER BY last_name, first_name",
    )?;

    let students: Vec<Student> = stmt
        .query_map([], |row| {
            Ok(Student {
                id: row.get(0)?,
                first_name: row.get(1)?,
                last_name: row.get(2)?,
                date_of_birth: row.get(3)?,
                notes: row.get(4)?,
                allergies: row.get(5)?,
                dietary_restrictions: row.get(6)?,
                emergency_contact_name: row.get(7)?,
                emergency_contact_phone: row.get(8)?,
                enrolled: row.get(9)?,
                created_at: row.get(10)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(students))
}

pub async fn get_student_milestones(
    RequireTeacher(_user): RequireTeacher,
    State(state): State<AppState>,
    Path(student_id): Path<i64>,
) -> Result<Json<Vec<Milestone>>, AppError> {
    crate::features::require_feature(&state.db, "student_progress")?;
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, student_id, recorded_by, category, title, notes, achieved_date, created_at
         FROM milestones WHERE student_id = ?1 ORDER BY created_at DESC",
    )?;

    let milestones: Vec<Milestone> = stmt
        .query_map(params![student_id], |row| {
            Ok(Milestone {
                id: row.get(0)?,
                student_id: row.get(1)?,
                recorded_by: row.get(2)?,
                category: row.get(3)?,
                title: row.get(4)?,
                notes: row.get(5)?,
                achieved_date: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(milestones))
}

pub async fn create_milestone(
    RequireTeacher(user): RequireTeacher,
    State(state): State<AppState>,
    Json(req): Json<CreateMilestoneRequest>,
) -> Result<Json<Milestone>, AppError> {
    crate::features::require_feature(&state.db, "student_progress")?;
    let conn = state.db.get()?;
    conn.execute(
        "INSERT INTO milestones (student_id, recorded_by, category, title, notes, achieved_date) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![req.student_id, user.id, req.category, req.title, req.notes, req.achieved_date],
    )?;

    let id = conn.last_insert_rowid();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();

    Ok(Json(Milestone {
        id,
        student_id: req.student_id,
        recorded_by: user.id,
        category: req.category,
        title: req.title,
        notes: req.notes,
        achieved_date: req.achieved_date,
        created_at: now,
    }))
}

pub async fn update_milestone(
    RequireTeacher(_user): RequireTeacher,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateMilestoneRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    crate::features::require_feature(&state.db, "student_progress")?;
    let conn = state.db.get()?;

    if let Some(category) = req.category {
        conn.execute("UPDATE milestones SET category = ?1 WHERE id = ?2", params![category, id])?;
    }
    if let Some(title) = req.title {
        conn.execute("UPDATE milestones SET title = ?1 WHERE id = ?2", params![title, id])?;
    }
    if let Some(notes) = req.notes {
        conn.execute("UPDATE milestones SET notes = ?1 WHERE id = ?2", params![notes, id])?;
    }
    if let Some(achieved_date) = req.achieved_date {
        conn.execute("UPDATE milestones SET achieved_date = ?1 WHERE id = ?2", params![achieved_date, id])?;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn delete_milestone(
    RequireTeacher(_user): RequireTeacher,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    crate::features::require_feature(&state.db, "student_progress")?;
    let conn = state.db.get()?;
    conn.execute("DELETE FROM milestones WHERE id = ?1", params![id])?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Attendance ──

pub async fn record_attendance(
    RequireTeacher(_user): RequireTeacher,
    State(state): State<AppState>,
    Json(req): Json<RecordAttendanceRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    // Upsert: delete existing then insert
    conn.execute(
        "DELETE FROM attendance WHERE student_id = ?1 AND event_id = ?2",
        params![req.student_id, req.event_id],
    )?;
    conn.execute(
        "INSERT INTO attendance (student_id, event_id, present, note) VALUES (?1, ?2, ?3, ?4)",
        params![req.student_id, req.event_id, req.present, req.note],
    )?;

    Ok(Json(serde_json::json!({ "ok": true })))
}
