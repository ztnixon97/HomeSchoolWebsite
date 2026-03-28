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

/// GET /api/document-types — list active document templates
pub async fn list_document_types(
    RequireAuth(_user): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    require_feature(&state.db, "documents")?;
    let conn = state.db.get()?;

    let mut stmt = conn.prepare(
        "SELECT id, title, description, category, required, file_id, created_at
         FROM document_templates
         WHERE active = 1
         ORDER BY title",
    )?;
    let rows: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "title": row.get::<_, String>(1)?,
                "description": row.get::<_, Option<String>>(2)?,
                "category": row.get::<_, String>(3)?,
                "required": row.get::<_, bool>(4)?,
                "file_id": row.get::<_, Option<i64>>(5)?,
                "created_at": row.get::<_, String>(6)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(rows))
}

/// GET /api/my-documents — list user's submissions with template info and status
pub async fn list_my_documents(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    require_feature(&state.db, "documents")?;
    let conn = state.db.get()?;

    let mut stmt = conn.prepare(
        "SELECT ds.id, ds.template_id, dt.title as template_title, dt.category,
                ds.file_id, ds.status, ds.notes, ds.created_at, ds.reviewed_at
         FROM document_submissions ds
         JOIN document_templates dt ON ds.template_id = dt.id
         WHERE ds.user_id = ?1
         ORDER BY ds.created_at DESC",
    )?;
    let rows: Vec<serde_json::Value> = stmt
        .query_map(params![user.id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "template_id": row.get::<_, i64>(1)?,
                "template_title": row.get::<_, String>(2)?,
                "category": row.get::<_, String>(3)?,
                "file_id": row.get::<_, Option<i64>>(4)?,
                "status": row.get::<_, String>(5)?,
                "notes": row.get::<_, Option<String>>(6)?,
                "created_at": row.get::<_, String>(7)?,
                "reviewed_at": row.get::<_, Option<String>>(8)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(rows))
}

/// POST /api/documents/{template_id}/submit — submit document (upload file_id)
pub async fn submit_document(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(template_id): Path<i64>,
    Json(req): Json<SubmitDocumentRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_feature(&state.db, "documents")?;
    let conn = state.db.get()?;

    // Verify template exists and is active
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM document_templates WHERE id = ?1 AND active = 1",
            params![template_id],
            |row| row.get(0),
        )
        .unwrap_or(false);
    if !exists {
        return Err(AppError::NotFound("Document template not found".into()));
    }

    conn.execute(
        "INSERT OR REPLACE INTO document_submissions (template_id, user_id, student_id, file_id, status)
         VALUES (?1, ?2, ?3, ?4, 'submitted')",
        params![template_id, user.id, req.student_id, req.file_id],
    )?;
    let id = conn.last_insert_rowid();

    Ok(Json(serde_json::json!({ "id": id })))
}

/// GET /api/admin/document-templates — admin list all templates
pub async fn admin_list_templates(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    let conn = state.db.get()?;

    let mut stmt = conn.prepare(
        "SELECT dt.id, dt.title, dt.description, dt.category, dt.required, dt.active,
                dt.file_id, dt.created_by, u.display_name as created_by_name, dt.created_at
         FROM document_templates dt
         LEFT JOIN users u ON dt.created_by = u.id
         ORDER BY dt.created_at DESC",
    )?;
    let rows: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "title": row.get::<_, String>(1)?,
                "description": row.get::<_, Option<String>>(2)?,
                "category": row.get::<_, String>(3)?,
                "required": row.get::<_, bool>(4)?,
                "active": row.get::<_, bool>(5)?,
                "file_id": row.get::<_, Option<i64>>(6)?,
                "created_by": row.get::<_, Option<i64>>(7)?,
                "created_by_name": row.get::<_, Option<String>>(8)?,
                "created_at": row.get::<_, String>(9)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(rows))
}

/// POST /api/admin/document-templates — create template
pub async fn admin_create_template(
    RequireAdmin(user): RequireAdmin,
    State(state): State<AppState>,
    Json(req): Json<CreateDocumentTemplateRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    conn.execute(
        "INSERT INTO document_templates (title, description, category, required, file_id, created_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            req.title,
            req.description,
            req.category.unwrap_or_else(|| "waiver".into()),
            req.required.unwrap_or(false),
            req.file_id,
            user.id,
        ],
    )?;
    let id = conn.last_insert_rowid();

    Ok(Json(serde_json::json!({ "id": id })))
}

/// PUT /api/admin/document-templates/{id} — update template
pub async fn admin_update_template(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateDocumentTemplateRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    // Check exists
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM document_templates WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .unwrap_or(false);
    if !exists {
        return Err(AppError::NotFound("Template not found".into()));
    }

    if let Some(v) = &req.title {
        conn.execute("UPDATE document_templates SET title = ?1 WHERE id = ?2", params![v, id])?;
    }
    if let Some(v) = &req.description {
        conn.execute("UPDATE document_templates SET description = ?1 WHERE id = ?2", params![v, id])?;
    }
    if let Some(v) = &req.category {
        conn.execute("UPDATE document_templates SET category = ?1 WHERE id = ?2", params![v, id])?;
    }
    if let Some(v) = req.required {
        conn.execute("UPDATE document_templates SET required = ?1 WHERE id = ?2", params![v, id])?;
    }
    if let Some(v) = req.active {
        conn.execute("UPDATE document_templates SET active = ?1 WHERE id = ?2", params![v, id])?;
    }
    if let Some(v) = req.file_id {
        conn.execute("UPDATE document_templates SET file_id = ?1 WHERE id = ?2", params![v, id])?;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// DELETE /api/admin/document-templates/{id} — delete template
pub async fn admin_delete_template(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    let deleted = conn.execute("DELETE FROM document_templates WHERE id = ?1", params![id])?;
    if deleted == 0 {
        return Err(AppError::NotFound("Template not found".into()));
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// GET /api/admin/document-submissions — list all submissions
pub async fn admin_list_submissions(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    let conn = state.db.get()?;

    let mut stmt = conn.prepare(
        "SELECT ds.id, ds.template_id, dt.title as template_title,
                ds.user_id, u.display_name as user_name,
                ds.student_id, ds.file_id, ds.status, ds.reviewed_by,
                ru.display_name as reviewed_by_name,
                ds.reviewed_at, ds.notes, ds.created_at
         FROM document_submissions ds
         JOIN document_templates dt ON ds.template_id = dt.id
         JOIN users u ON ds.user_id = u.id
         LEFT JOIN users ru ON ds.reviewed_by = ru.id
         ORDER BY ds.created_at DESC",
    )?;
    let rows: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "template_id": row.get::<_, i64>(1)?,
                "template_title": row.get::<_, String>(2)?,
                "user_id": row.get::<_, i64>(3)?,
                "user_name": row.get::<_, String>(4)?,
                "student_id": row.get::<_, Option<i64>>(5)?,
                "file_id": row.get::<_, Option<i64>>(6)?,
                "status": row.get::<_, String>(7)?,
                "reviewed_by": row.get::<_, Option<i64>>(8)?,
                "reviewed_by_name": row.get::<_, Option<String>>(9)?,
                "reviewed_at": row.get::<_, Option<String>>(10)?,
                "notes": row.get::<_, Option<String>>(11)?,
                "created_at": row.get::<_, String>(12)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(rows))
}

/// PUT /api/admin/document-submissions/{id} — approve/reject (update status, reviewed_by, reviewed_at)
pub async fn admin_review_submission(
    RequireAdmin(user): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<ReviewSubmissionRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    let valid_statuses = ["approved", "rejected"];
    if !valid_statuses.contains(&req.status.as_str()) {
        return Err(AppError::BadRequest("Status must be 'approved' or 'rejected'".into()));
    }

    let updated = conn.execute(
        "UPDATE document_submissions SET status = ?1, reviewed_by = ?2, reviewed_at = datetime('now'), notes = COALESCE(?3, notes) WHERE id = ?4",
        params![req.status, user.id, req.notes, id],
    )?;
    if updated == 0 {
        return Err(AppError::NotFound("Submission not found".into()));
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}
