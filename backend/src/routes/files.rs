use axum::{
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{header, StatusCode},
    response::Response,
    Json,
};
use rusqlite::params;
use crate::auth::RequireAuth;
use crate::errors::AppError;
use crate::models::*;
use crate::AppState;

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
    RequireAuth(_user): RequireAuth,
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

    Ok(Json(file))
}

#[derive(serde::Deserialize, Default)]
pub struct DownloadQuery {
    #[serde(default)]
    pub proxy: bool,
}

pub async fn download_file(
    RequireAuth(_user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Query(query): Query<DownloadQuery>,
) -> Result<Response, AppError> {
    let conn = state.db.get()?;
    let (filename, storage_path, mime_type, _size_bytes): (String, String, String, i64) = conn
        .query_row(
            "SELECT filename, storage_path, mime_type, size_bytes FROM files WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|_| AppError::NotFound("File not found".to_string()))?;

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
    RequireAuth(_user): RequireAuth,
    State(state): State<AppState>,
    Path((linked_type, linked_id)): Path<(String, i64)>,
) -> Result<Json<Vec<FileRecord>>, AppError> {
    let conn = state.db.get()?;
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
