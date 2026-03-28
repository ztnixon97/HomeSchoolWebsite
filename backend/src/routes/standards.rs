use axum::{
    extract::{Path, State},
    Json,
};
use rusqlite::params;

use crate::auth::{RequireAdmin, RequireAuth};
use crate::errors::AppError;
use crate::features::require_feature;
use crate::models::*;
use crate::AppState;

/// GET /api/standards — list all standards
pub async fn list_standards(
    RequireAuth(_user): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    require_feature(&state.db, "standards")?;
    let conn = state.db.get()?;

    let mut stmt = conn.prepare(
        "SELECT id, code, title, description, subject, grade_level, sort_order, created_at
         FROM standards
         ORDER BY sort_order, code",
    )?;
    let rows: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "code": row.get::<_, String>(1)?,
                "title": row.get::<_, String>(2)?,
                "description": row.get::<_, Option<String>>(3)?,
                "subject": row.get::<_, Option<String>>(4)?,
                "grade_level": row.get::<_, Option<String>>(5)?,
                "sort_order": row.get::<_, i32>(6)?,
                "created_at": row.get::<_, String>(7)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(rows))
}

/// POST /api/admin/standards — create standard (admin)
pub async fn create_standard(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Json(req): Json<CreateStandardRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if req.code.trim().is_empty() || req.title.trim().is_empty() {
        return Err(AppError::BadRequest("Code and title are required".into()));
    }

    let conn = state.db.get()?;
    conn.execute(
        "INSERT INTO standards (code, title, description, subject, grade_level, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            req.code,
            req.title,
            req.description,
            req.subject,
            req.grade_level,
            req.sort_order.unwrap_or(0),
        ],
    )?;
    let id = conn.last_insert_rowid();

    Ok(Json(serde_json::json!({ "id": id })))
}

/// PUT /api/admin/standards/{id} — update
pub async fn update_standard(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateStandardRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM standards WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .unwrap_or(false);
    if !exists {
        return Err(AppError::NotFound("Standard not found".into()));
    }

    if let Some(v) = &req.code {
        conn.execute("UPDATE standards SET code = ?1 WHERE id = ?2", params![v, id])?;
    }
    if let Some(v) = &req.title {
        conn.execute("UPDATE standards SET title = ?1 WHERE id = ?2", params![v, id])?;
    }
    if let Some(v) = &req.description {
        conn.execute("UPDATE standards SET description = ?1 WHERE id = ?2", params![v, id])?;
    }
    if let Some(v) = &req.subject {
        conn.execute("UPDATE standards SET subject = ?1 WHERE id = ?2", params![v, id])?;
    }
    if let Some(v) = &req.grade_level {
        conn.execute("UPDATE standards SET grade_level = ?1 WHERE id = ?2", params![v, id])?;
    }
    if let Some(v) = req.sort_order {
        conn.execute("UPDATE standards SET sort_order = ?1 WHERE id = ?2", params![v, id])?;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// DELETE /api/admin/standards/{id} — delete
pub async fn delete_standard(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    let deleted = conn.execute("DELETE FROM standards WHERE id = ?1", params![id])?;
    if deleted == 0 {
        return Err(AppError::NotFound("Standard not found".into()));
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// POST /api/admin/class-assignments/{assignment_id}/standards — link standards to assignment
pub async fn link_standards_to_assignment(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(assignment_id): Path<i64>,
    Json(req): Json<LinkStandardsRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    // Verify assignment exists
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM class_assignments WHERE id = ?1",
            params![assignment_id],
            |row| row.get(0),
        )
        .unwrap_or(false);
    if !exists {
        return Err(AppError::NotFound("Assignment not found".into()));
    }

    for sid in &req.standard_ids {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO assignment_standards (assignment_id, standard_id) VALUES (?1, ?2)",
            params![assignment_id, sid],
        );
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// DELETE /api/admin/class-assignments/{assignment_id}/standards/{standard_id} — unlink
pub async fn unlink_standard_from_assignment(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path((assignment_id, standard_id)): Path<(i64, i64)>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    conn.execute(
        "DELETE FROM assignment_standards WHERE assignment_id = ?1 AND standard_id = ?2",
        params![assignment_id, standard_id],
    )?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// GET /api/class-assignments/{id}/standards — list standards for an assignment
pub async fn list_assignment_standards(
    RequireAuth(_user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    let conn = state.db.get()?;

    let mut stmt = conn.prepare(
        "SELECT s.id, s.code, s.title, s.description, s.subject, s.grade_level
         FROM standards s
         JOIN assignment_standards ast ON s.id = ast.standard_id
         WHERE ast.assignment_id = ?1
         ORDER BY s.sort_order, s.code",
    )?;
    let rows: Vec<serde_json::Value> = stmt
        .query_map(params![id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "code": row.get::<_, String>(1)?,
                "title": row.get::<_, String>(2)?,
                "description": row.get::<_, Option<String>>(3)?,
                "subject": row.get::<_, Option<String>>(4)?,
                "grade_level": row.get::<_, Option<String>>(5)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(rows))
}
