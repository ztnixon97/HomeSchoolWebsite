use axum::{
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{header, StatusCode},
    response::Response,
    Json,
};
use rusqlite::params;
use crate::auth::{can_view_session, RequireAuth};
use crate::errors::AppError;
use crate::models::*;
use crate::AppState;

/// True if the user may see the entity a file is linked to (admins always can).
fn can_access_linked(conn: &rusqlite::Connection, user: &User, linked_type: Option<&str>, linked_id: Option<i64>) -> bool {
    if user.role == "admin" {
        return true;
    }
    match (linked_type, linked_id) {
        (Some("session"), Some(sid)) => can_view_session(conn, user, sid),
        (Some("document"), Some(s)) | (Some("document_submission"), Some(s)) | (Some("submission"), Some(s)) => conn
            .query_row(
                "SELECT user_id = ?2 FROM document_submissions WHERE id = ?1",
                params![s, user.id],
                |r| r.get::<_, Option<bool>>(0),
            )
            .ok()
            .flatten()
            .unwrap_or(false),
        (Some("conversation"), Some(c)) | (Some("message"), Some(c)) => conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM conversation_participants WHERE conversation_id = ?1 AND user_id = ?2",
                params![c, user.id],
                |r| r.get(0),
            )
            .unwrap_or(false),
        // Shared content visible to any authenticated member
        (Some("lesson_plan"), _) | (Some("post"), _) | (Some("blog"), _) | (Some("resource"), _)
        | (Some("announcement"), _) | (Some("page"), _) | (Some("site"), _) => true,
        // Unknown / unlinked files: uploader or admin only (handled by the caller)
        _ => false,
    }
}

/// True if the user may read a file: admin, the uploader, or anyone who can see the linked entity.
fn can_read_file(conn: &rusqlite::Connection, user: &User, uploader_id: i64, linked_type: Option<&str>, linked_id: Option<i64>) -> bool {
    user.id == uploader_id || can_access_linked(conn, user, linked_type, linked_id)
}

// ── File Upload ──

pub async fn upload_file(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<FileRecord>, AppError> {
    let mut filename = String::new();
    let mut data = Vec::new();
    let mut mime_type = "application/octet-stream".to_string();
    let mut linked_type: Option<String> = None;
    let mut linked_id: Option<i64> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "file" => {
                filename = field
                    .file_name()
                    .unwrap_or("upload")
                    .to_string();
                if let Some(ct) = field.content_type() {
                    mime_type = ct.to_string();
                }
                data = field
                    .bytes()
                    .await
                    .map_err(|e| AppError::BadRequest(e.to_string()))?
                    .to_vec();
                // 10MB file size limit
                if data.len() > 10 * 1024 * 1024 {
                    return Err(AppError::BadRequest("File size must be under 10MB".to_string()));
                }
            }
            "linked_type" => {
                linked_type = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::BadRequest(e.to_string()))?,
                );
            }
            "linked_id" => {
                let text = field
                    .text()
                    .await
                    .map_err(|e| AppError::BadRequest(e.to_string()))?;
                linked_id = text.parse().ok();
            }
            _ => {}
        }
    }

    if data.is_empty() {
        return Err(AppError::BadRequest("No file provided".to_string()));
    }

    let size_bytes = data.len() as i64;
    // Organize files into folders by linked_type (documents/, sessions/, lesson_plans/, etc.)
    let storage_filename = if let Some(ref lt) = linked_type {
        format!("{}/{}", lt, filename)
    } else {
        filename.clone()
    };
    let storage_path = state
        .storage
        .save(&storage_filename, &data)
        .await
        .map_err(|e| AppError::Internal(e.0))?;

    let conn = state.db.get()?;
    conn.execute(
        "INSERT INTO files (uploader_id, filename, storage_path, mime_type, size_bytes, linked_type, linked_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![user.id, filename, storage_path, mime_type, size_bytes, linked_type, linked_id],
    )?;

    let id = conn.last_insert_rowid();

    Ok(Json(FileRecord {
        id,
        uploader_id: user.id,
        filename,
        storage_path: storage_path.clone(),
        mime_type,
        size_bytes,
        linked_type,
        linked_id,
        created_at: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string(),
    }))
}

pub async fn get_file_info(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<FileRecord>, AppError> {
    let conn = state.db.get()?;
    let file = conn
        .query_row(
            "SELECT id, uploader_id, filename, storage_path, mime_type, size_bytes, linked_type, linked_id, created_at FROM files WHERE id = ?1",
            params![id],
            |row| {
                Ok(FileRecord {
                    id: row.get(0)?,
                    uploader_id: row.get(1)?,
                    filename: row.get(2)?,
                    storage_path: row.get(3)?,
                    mime_type: row.get(4)?,
                    size_bytes: row.get(5)?,
                    linked_type: row.get(6)?,
                    linked_id: row.get(7)?,
                    created_at: row.get(8)?,
                })
            },
        )
        .map_err(|_| AppError::NotFound("File not found".to_string()))?;

    if !can_read_file(&conn, &user, file.uploader_id, file.linked_type.as_deref(), file.linked_id) {
        return Err(AppError::Forbidden);
    }

    Ok(Json(file))
}

#[derive(serde::Deserialize, Default)]
pub struct DownloadQuery {
    #[serde(default)]
    pub proxy: bool,
}

pub async fn download_file(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Query(query): Query<DownloadQuery>,
) -> Result<Response, AppError> {
    let conn = state.db.get()?;
    let (filename, storage_path, mime_type, uploader_id, linked_type, linked_id):
        (String, String, String, i64, Option<String>, Option<i64>) = conn
        .query_row(
            "SELECT filename, storage_path, mime_type, uploader_id, linked_type, linked_id FROM files WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
        )
        .map_err(|_| AppError::NotFound("File not found".to_string()))?;

    if !can_read_file(&conn, &user, uploader_id, linked_type.as_deref(), linked_id) {
        return Err(AppError::Forbidden);
    }

    // If storage supports presigned URLs (R2), redirect directly — zero bandwidth through our server.
    // Use ?proxy=true to force proxying through backend (needed for in-browser fetch/CORS).
    if state.storage.supports_redirect() && !query.proxy {
        let presigned_url = state.storage.serve_url(&storage_path)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to generate download URL: {}", e)))?;
        return Ok(Response::builder()
            .status(StatusCode::FOUND)
            .header(header::LOCATION, &presigned_url)
            .header(header::CACHE_CONTROL, "private, max-age=3600")
            .body(Body::empty())
            .unwrap());
    }

    // Local storage: read and serve bytes
    let (data, content_type) = state.storage.get_bytes(&storage_path)
        .await
        .map_err(|_| AppError::NotFound("File not found on storage".to_string()))?;

    let ct = if !mime_type.is_empty() && mime_type != "application/octet-stream" { mime_type } else { content_type };
    let disposition = format!("inline; filename=\"{}\"", filename.replace('"', ""));

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, &ct)
        .header(header::CONTENT_DISPOSITION, &disposition)
        .header(header::CONTENT_LENGTH, data.len().to_string())
        .body(Body::from(data))
        .unwrap())
}

pub async fn delete_file(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    let (uploader_id, storage_path): (i64, String) = conn
        .query_row("SELECT uploader_id, storage_path FROM files WHERE id = ?1", params![id], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .map_err(|_| AppError::NotFound("File not found".to_string()))?;

    if uploader_id != user.id && user.role != "admin" {
        return Err(AppError::Forbidden);
    }

    conn.execute("DELETE FROM files WHERE id = ?1", params![id])?;
    // Best-effort delete from storage (works for both local and R2)
    let _ = state.storage.delete(&storage_path).await;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Files for linked entities ──

pub async fn list_files_for_entity(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path((linked_type, linked_id)): Path<(String, i64)>,
) -> Result<Json<Vec<FileRecord>>, AppError> {
    let conn = state.db.get()?;
    if !can_access_linked(&conn, &user, Some(linked_type.as_str()), Some(linked_id)) {
        return Err(AppError::Forbidden);
    }
    let mut stmt = conn.prepare(
        "SELECT id, uploader_id, filename, storage_path, mime_type, size_bytes, linked_type, linked_id, created_at
         FROM files WHERE linked_type = ?1 AND linked_id = ?2 ORDER BY created_at",
    )?;

    let files: Vec<FileRecord> = stmt
        .query_map(params![linked_type, linked_id], |row| {
            Ok(FileRecord {
                id: row.get(0)?,
                uploader_id: row.get(1)?,
                filename: row.get(2)?,
                storage_path: row.get(3)?,
                mime_type: row.get(4)?,
                size_bytes: row.get(5)?,
                linked_type: row.get(6)?,
                linked_id: row.get(7)?,
                created_at: row.get(8)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(files))
}
