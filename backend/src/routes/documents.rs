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

/// GET /api/document-templates/{id}/fields — get default signature fields for a template
pub async fn list_template_fields(
    RequireAuth(_user): RequireAuth,
    State(state): State<AppState>,
    Path(template_id): Path<i64>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    require_feature(&state.db, "documents")?;
    let conn = state.db.get()?;

    let mut stmt = conn.prepare(
        "SELECT id, field_type, label, page_index, x_pct, y_pct, width_pct, height_pct, required
         FROM document_template_fields
         WHERE template_id = ?1
         ORDER BY sort_order, id",
    )?;
    let rows: Vec<serde_json::Value> = stmt
        .query_map(params![template_id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "field_type": row.get::<_, String>(1)?,
                "label": row.get::<_, Option<String>>(2)?,
                "page_index": row.get::<_, i64>(3)?,
                "x_pct": row.get::<_, f64>(4)?,
                "y_pct": row.get::<_, f64>(5)?,
                "width_pct": row.get::<_, f64>(6)?,
                "height_pct": row.get::<_, f64>(7)?,
                "required": row.get::<_, bool>(8)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(rows))
}

/// PUT /api/admin/document-templates/{id}/fields — save all fields (replace)
pub async fn admin_save_template_fields(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(template_id): Path<i64>,
    Json(req): Json<SaveTemplateFieldsRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_feature(&state.db, "documents")?;
    let conn = state.db.get()?;

    // Delete existing fields and replace with new set
    conn.execute("DELETE FROM document_template_fields WHERE template_id = ?1", params![template_id])?;

    for (i, field) in req.fields.iter().enumerate() {
        conn.execute(
            "INSERT INTO document_template_fields (template_id, field_type, label, page_index, x_pct, y_pct, width_pct, height_pct, required, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                template_id,
                field.field_type,
                field.label,
                field.page_index,
                field.x_pct,
                field.y_pct,
                field.width_pct,
                field.height_pct,
                field.required.unwrap_or(true),
                i as i64,
            ],
        )?;
    }

    Ok(Json(serde_json::json!({ "ok": true, "count": req.fields.len() })))
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
                ds.file_id, ds.status, ds.notes, ds.created_at, ds.reviewed_at,
                ds.signature_file_id
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
                "signature_file_id": row.get::<_, Option<i64>>(9)?,
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
        "INSERT OR REPLACE INTO document_submissions (template_id, user_id, student_id, file_id, signature_file_id, status)
         VALUES (?1, ?2, ?3, ?4, ?5, 'submitted')",
        params![template_id, user.id, req.student_id, req.file_id, req.signature_file_id],
    )?;
    let id = conn.last_insert_rowid();

    Ok(Json(serde_json::json!({ "id": id })))
}

/// GET /api/admin/document-templates — admin list all templates
pub async fn admin_list_templates(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    require_feature(&state.db, "documents")?;
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
    require_feature(&state.db, "documents")?;
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
    require_feature(&state.db, "documents")?;
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
    require_feature(&state.db, "documents")?;
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
    require_feature(&state.db, "documents")?;
    let conn = state.db.get()?;

    let mut stmt = conn.prepare(
        "SELECT ds.id, ds.template_id, dt.title as template_title,
                ds.user_id, u.display_name as user_name,
                ds.student_id, ds.file_id, ds.status, ds.reviewed_by,
                ru.display_name as reviewed_by_name,
                ds.reviewed_at, ds.notes, ds.created_at, ds.signature_file_id
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
                "signature_file_id": row.get::<_, Option<i64>>(13)?,
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
    require_feature(&state.db, "documents")?;
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

/// GET /api/my-pending-documents — count of required documents not yet approved (for global banner)
pub async fn my_pending_required_documents(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    if crate::features::require_feature(&state.db, "documents").is_err() {
        return Ok(Json(serde_json::json!({ "count": 0, "total": 0 })));
    }
    let conn = state.db.get()?;

    let total_required: i64 = conn.query_row(
        "SELECT COUNT(*) FROM document_templates WHERE required = 1 AND active = 1",
        [], |row| row.get(0),
    ).unwrap_or(0);

    // Count templates where user has submitted OR approved (not rejected)
    let completed: i64 = conn.query_row(
        "SELECT COUNT(DISTINCT ds.template_id) FROM document_submissions ds
         JOIN document_templates dt ON ds.template_id = dt.id
         WHERE ds.user_id = ?1 AND ds.status IN ('submitted', 'pending', 'approved') AND dt.required = 1 AND dt.active = 1",
        params![user.id], |row| row.get(0),
    ).unwrap_or(0);

    let pending = total_required - completed;
    Ok(Json(serde_json::json!({ "count": pending, "total": total_required })))
}

/// GET /api/admin/document-submissions/pending-count
pub async fn admin_pending_submissions_count(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM document_submissions WHERE status IN ('submitted', 'pending')",
        [], |row| row.get(0),
    ).unwrap_or(0);
    Ok(Json(serde_json::json!({ "count": count })))
}

/// GET /api/sessions/{id}/required-documents — list documents required for a session
pub async fn session_required_documents(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(session_id): Path<i64>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT dt.id, dt.title, dt.category,
                (SELECT ds.status FROM document_submissions ds WHERE ds.template_id = dt.id AND ds.user_id = ?1 LIMIT 1) as user_status
         FROM session_required_documents srd
         JOIN document_templates dt ON srd.template_id = dt.id
         WHERE srd.session_id = ?2 AND dt.active = 1",
    )?;
    let docs: Vec<serde_json::Value> = stmt.query_map(params![user.id, session_id], |row| {
        Ok(serde_json::json!({
            "template_id": row.get::<_, i64>(0)?,
            "title": row.get::<_, String>(1)?,
            "category": row.get::<_, String>(2)?,
            "user_status": row.get::<_, Option<String>>(3)?,
        }))
    })?.filter_map(|r| r.ok()).collect();
    Ok(Json(docs))
}

/// POST /api/admin/sessions/{id}/required-documents — set required documents for a session
pub async fn set_session_required_documents(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(session_id): Path<i64>,
    Json(req): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    let template_ids: Vec<i64> = req["template_ids"].as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|v| v.as_i64())
        .collect();

    let conn = state.db.get()?;
    conn.execute("DELETE FROM session_required_documents WHERE session_id = ?1", params![session_id])?;
    for tid in &template_ids {
        conn.execute(
            "INSERT OR IGNORE INTO session_required_documents (session_id, template_id) VALUES (?1, ?2)",
            params![session_id, tid],
        )?;
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}
