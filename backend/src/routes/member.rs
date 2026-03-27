use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    http::{header, HeaderValue, StatusCode},
    response::Response,
    Json,
};
use rusqlite::params;
use tokio_util::io::ReaderStream;

use crate::auth::{RequireAuth, RequireTeacher};
use crate::errors::AppError;
use crate::models::*;
use crate::sanitize::{sanitize_html, sanitize_text, validate_required, validate_date, validate_max_length};
use crate::AppState;

// ── Lesson Plans ──

pub async fn list_lesson_plans(
    RequireAuth(_user): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<Vec<LessonPlan>>, AppError> {
    let mut conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT lp.id, lp.author_id, u.display_name, lp.title, lp.description, lp.age_group, lp.category, lp.created_at, lp.updated_at
         FROM lesson_plans lp JOIN users u ON lp.author_id = u.id
         ORDER BY lp.created_at DESC",
    )?;

    let plans: Vec<LessonPlan> = stmt
        .query_map([], |row| {
            Ok(LessonPlan {
                id: row.get(0)?,
                author_id: row.get(1)?,
                author_name: row.get(2)?,
                title: row.get(3)?,
                description: row.get(4)?,
                age_group: row.get(5)?,
                category: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(plans))
}

pub async fn get_lesson_plan(
    RequireAuth(_user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<LessonPlan>, AppError> {
    let mut conn = state.db.get()?;
    let plan = conn
        .query_row(
            "SELECT lp.id, lp.author_id, u.display_name, lp.title, lp.description, lp.age_group, lp.category, lp.created_at, lp.updated_at
             FROM lesson_plans lp JOIN users u ON lp.author_id = u.id WHERE lp.id = ?1",
            params![id],
            |row| {
                Ok(LessonPlan {
                    id: row.get(0)?,
                    author_id: row.get(1)?,
                    author_name: row.get(2)?,
                    title: row.get(3)?,
                    description: row.get(4)?,
                    age_group: row.get(5)?,
                    category: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            },
        )
        .map_err(|_| AppError::NotFound("Lesson plan not found".to_string()))?;

    Ok(Json(plan))
}

pub async fn create_lesson_plan(
    RequireTeacher(user): RequireTeacher,
    State(state): State<AppState>,
    Json(req): Json<CreateLessonPlanRequest>,
) -> Result<Json<LessonPlan>, AppError> {
    let mut conn = state.db.get()?;
    let title = validate_required(&req.title, "title")?;
    let title = sanitize_text(&title);
    validate_max_length(&title, 200, "title")?;
    let description = sanitize_html(&req.description);
    conn.execute(
        "INSERT INTO lesson_plans (author_id, title, description, age_group, category) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![user.id, title, description, req.age_group, req.category],
    )?;

    let id = conn.last_insert_rowid();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();

    Ok(Json(LessonPlan {
        id,
        author_id: user.id,
        author_name: Some(user.display_name),
        title,
        description,
        age_group: req.age_group,
        category: req.category,
        created_at: now.clone(),
        updated_at: now,
    }))
}

pub async fn update_lesson_plan(
    RequireTeacher(user): RequireTeacher,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateLessonPlanRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    // Only author, admin, or collaborator can edit
    let author_id: i64 = conn
        .query_row("SELECT author_id FROM lesson_plans WHERE id = ?1", params![id], |row| row.get(0))
        .map_err(|_| AppError::NotFound("Lesson plan not found".to_string()))?;

    let is_collaborator: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM lesson_plan_collaborators WHERE lesson_plan_id = ?1 AND user_id = ?2",
            params![id, user.id],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if author_id != user.id && user.role != "admin" && !is_collaborator {
        return Err(AppError::Forbidden);
    }

    if let Some(title) = req.title {
        conn.execute("UPDATE lesson_plans SET title = ?1, updated_at = datetime('now') WHERE id = ?2", params![title, id])?;
    }
    if let Some(description) = req.description {
        let description = sanitize_html(&description);
        conn.execute("UPDATE lesson_plans SET description = ?1, updated_at = datetime('now') WHERE id = ?2", params![description, id])?;
    }
    if let Some(age_group) = req.age_group {
        conn.execute("UPDATE lesson_plans SET age_group = ?1, updated_at = datetime('now') WHERE id = ?2", params![age_group, id])?;
    }
    if let Some(category) = req.category {
        conn.execute("UPDATE lesson_plans SET category = ?1, updated_at = datetime('now') WHERE id = ?2", params![category, id])?;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn delete_lesson_plan(
    RequireTeacher(user): RequireTeacher,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    let author_id: i64 = conn
        .query_row("SELECT author_id FROM lesson_plans WHERE id = ?1", params![id], |row| row.get(0))
        .map_err(|_| AppError::NotFound("Lesson plan not found".to_string()))?;

    if author_id != user.id && user.role != "admin" {
        return Err(AppError::Forbidden);
    }

    // Unlink from any sessions referencing this plan
    conn.execute("UPDATE class_sessions SET lesson_plan_id = NULL WHERE lesson_plan_id = ?1", params![id])?;
    // Delete associated files
    conn.execute("DELETE FROM files WHERE linked_type = 'lesson_plan' AND linked_id = ?1", params![id])?;
    // Delete collaborators (cascaded) and the plan itself
    conn.execute("DELETE FROM lesson_plans WHERE id = ?1", params![id])?;

    Ok(Json(serde_json::json!({ "ok": true })))
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
    // Best-effort delete from disk
    let _ = std::fs::remove_file(&storage_path);

    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Blog Posts (Teacher+) ──

pub async fn create_post(
    RequireTeacher(user): RequireTeacher,
    State(state): State<AppState>,
    Json(req): Json<CreatePostRequest>,
) -> Result<Json<Post>, AppError> {
    let conn = state.db.get()?;
    let title = validate_required(&req.title, "title")?;
    let title = sanitize_text(&title);
    validate_max_length(&title, 200, "title")?;
    let published = req.published.unwrap_or(false);
    let content = sanitize_html(&req.content);
    conn.execute(
        "INSERT INTO posts (author_id, title, content, category, published) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![user.id, title, content, req.category, published],
    )?;

    let id = conn.last_insert_rowid();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();

    Ok(Json(Post {
        id,
        author_id: user.id,
        author_name: Some(user.display_name),
        title,
        content,
        category: req.category,
        published,
        created_at: now.clone(),
        updated_at: now,
    }))
}

pub async fn update_post(
    RequireTeacher(user): RequireTeacher,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdatePostRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    let author_id: i64 = conn
        .query_row("SELECT author_id FROM posts WHERE id = ?1", params![id], |row| row.get(0))
        .map_err(|_| AppError::NotFound("Post not found".to_string()))?;

    if author_id != user.id && user.role != "admin" {
        return Err(AppError::Forbidden);
    }

    if let Some(title) = req.title {
        conn.execute("UPDATE posts SET title = ?1, updated_at = datetime('now') WHERE id = ?2", params![title, id])?;
    }
    if let Some(content) = req.content {
        let content = sanitize_html(&content);
        conn.execute("UPDATE posts SET content = ?1, updated_at = datetime('now') WHERE id = ?2", params![content, id])?;
    }
    if let Some(category) = req.category {
        conn.execute("UPDATE posts SET category = ?1, updated_at = datetime('now') WHERE id = ?2", params![category, id])?;
    }
    if let Some(published) = req.published {
        conn.execute("UPDATE posts SET published = ?1, updated_at = datetime('now') WHERE id = ?2", params![published, id])?;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn list_draft_posts(
    RequireTeacher(user): RequireTeacher,
    State(state): State<AppState>,
) -> Result<Json<Vec<Post>>, AppError> {
    let conn = state.db.get()?;
    let map_post = |row: &rusqlite::Row| {
        Ok(Post {
            id: row.get(0)?,
            author_id: row.get(1)?,
            author_name: row.get(2)?,
            title: row.get(3)?,
            content: row.get(4)?,
            category: row.get(5)?,
            published: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    };
    let mut stmt = if user.role == "admin" {
        conn.prepare(
            "SELECT p.id, p.author_id, u.display_name, p.title, p.content, p.category, p.published, p.created_at, p.updated_at
             FROM posts p JOIN users u ON p.author_id = u.id
             WHERE p.published = 0 ORDER BY p.created_at DESC",
        )?
    } else {
        conn.prepare(
            "SELECT p.id, p.author_id, u.display_name, p.title, p.content, p.category, p.published, p.created_at, p.updated_at
             FROM posts p JOIN users u ON p.author_id = u.id
             WHERE p.published = 0 AND p.author_id = ?1 ORDER BY p.created_at DESC",
        )?
    };

    let posts: Vec<Post> = if user.role == "admin" {
        stmt.query_map([], map_post)?
    } else {
        stmt.query_map(params![user.id], map_post)?
    }
    .filter_map(|r| r.ok())
    .collect();

    Ok(Json(posts))
}

pub async fn get_post_internal(
    RequireTeacher(user): RequireTeacher,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<Post>, AppError> {
    let conn = state.db.get()?;
    let post = conn
        .query_row(
            "SELECT p.id, p.author_id, u.display_name, p.title, p.content, p.category, p.published, p.created_at, p.updated_at
             FROM posts p JOIN users u ON p.author_id = u.id
             WHERE p.id = ?1",
            params![id],
            |row| {
                Ok(Post {
                    id: row.get(0)?,
                    author_id: row.get(1)?,
                    author_name: row.get(2)?,
                    title: row.get(3)?,
                    content: row.get(4)?,
                    category: row.get(5)?,
                    published: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            },
        )
        .map_err(|_| AppError::NotFound("Post not found".to_string()))?;

    if post.published || post.author_id == user.id || user.role == "admin" {
        Ok(Json(post))
    } else {
        Err(AppError::Forbidden)
    }
}

// ── Post Comments (Authenticated) ──

pub async fn list_post_comments(
    RequireAuth(_user): RequireAuth,
    State(state): State<AppState>,
    Path(post_id): Path<i64>,
) -> Result<Json<Vec<PostComment>>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT c.id, c.post_id, c.author_id, u.display_name, c.content, c.created_at, c.updated_at
         FROM post_comments c JOIN users u ON c.author_id = u.id
         WHERE c.post_id = ?1
         ORDER BY c.created_at ASC",
    )?;
    let comments = stmt
        .query_map(params![post_id], |row| {
            Ok(PostComment {
                id: row.get(0)?,
                post_id: row.get(1)?,
                author_id: row.get(2)?,
                author_name: row.get(3)?,
                content: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(comments))
}

pub async fn create_post_comment(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(post_id): Path<i64>,
    Json(req): Json<CreateCommentRequest>,
) -> Result<Json<PostComment>, AppError> {
    let conn = state.db.get()?;
    let content = sanitize_html(&req.content);
    if content.trim().is_empty() {
        return Err(AppError::BadRequest("Comment cannot be empty".to_string()));
    }

    conn.execute(
        "INSERT INTO post_comments (post_id, author_id, content) VALUES (?1, ?2, ?3)",
        params![post_id, user.id, content],
    )?;
    let id = conn.last_insert_rowid();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();

    Ok(Json(PostComment {
        id,
        post_id,
        author_id: user.id,
        author_name: Some(user.display_name),
        content,
        created_at: now.clone(),
        updated_at: now,
    }))
}

pub async fn update_post_comment(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateCommentRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    let author_id: i64 = conn
        .query_row(
            "SELECT author_id FROM post_comments WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::NotFound("Comment not found".to_string()))?;

    if author_id != user.id {
        return Err(AppError::Forbidden);
    }

    let content = sanitize_html(&req.content);
    if content.trim().is_empty() {
        return Err(AppError::BadRequest("Comment cannot be empty".to_string()));
    }
    conn.execute(
        "UPDATE post_comments SET content = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![content, id],
    )?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn delete_post_comment(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    let author_id: i64 = conn
        .query_row(
            "SELECT author_id FROM post_comments WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::NotFound("Comment not found".to_string()))?;

    if author_id != user.id && user.role != "admin" {
        return Err(AppError::Forbidden);
    }

    conn.execute("DELETE FROM post_comments WHERE id = ?1", params![id])?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── File Upload ──

pub async fn upload_file(
    RequireTeacher(user): RequireTeacher,
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
    let storage_path = state
        .storage
        .save(&filename, &data)
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

pub async fn download_file(
    RequireAuth(_user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Response, AppError> {
    let conn = state.db.get()?;
    let (filename, storage_path, mime_type, size_bytes): (String, String, String, i64) = conn
        .query_row(
            "SELECT filename, storage_path, mime_type, size_bytes FROM files WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|_| AppError::NotFound("File not found".to_string()))?;

    let full_path = std::path::Path::new(&state.uploads_dir).join(&storage_path);
    let file = tokio::fs::File::open(&full_path)
        .await
        .map_err(|_| AppError::NotFound("File not found".to_string()))?;

    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);
    let mut resp = Response::new(body);
    *resp.status_mut() = StatusCode::OK;

    let headers = resp.headers_mut();
    if let Ok(ct) = mime_type.parse() {
        headers.insert(header::CONTENT_TYPE, ct);
    }
    let disposition = format!("inline; filename=\"{}\"", filename.replace('"', ""));
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&disposition).unwrap_or_else(|_| HeaderValue::from_static("inline")),
    );
    headers.insert(
        header::CONTENT_LENGTH,
        HeaderValue::from_str(&size_bytes.to_string()).unwrap_or_else(|_| HeaderValue::from_static("0")),
    );

    Ok(resp)
}

// ── My Children (Parent view) ──

pub async fn my_children(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<Vec<Student>>, AppError> {
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
) -> Result<Json<Vec<ClassSession>>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT cs.id, cs.title, cs.theme, cs.session_date, cs.end_date, cs.start_time, cs.end_time,
                cs.host_id, u.display_name, cs.host_address, cs.location_name, cs.location_address,
                cs.cost_amount, cs.cost_details, cs.lesson_plan_id,
                cs.materials_needed, cs.max_students, cs.notes, cs.status,
                cs.session_type_id, st.name, st.label, cs.rsvp_cutoff, cs.require_approval,
                cs.created_by, cs.created_at
         FROM class_sessions cs
         LEFT JOIN users u ON cs.host_id = u.id
         LEFT JOIN session_types st ON cs.session_type_id = st.id
         ORDER BY cs.session_date ASC, cs.start_time ASC",
    )?;

    let sessions: Vec<ClassSession> = stmt
        .query_map([], |row| {
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
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(sessions))
}

pub async fn list_users(
    RequireTeacher(_user): RequireTeacher,
    State(state): State<AppState>,
) -> Result<Json<Vec<BasicUser>>, AppError> {
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
) -> Result<Json<Vec<MemberProfile>>, AppError> {
    let conn = state.db.get()?;
    // Step 1: get basic user info
    let mut stmt = conn.prepare(
        "SELECT id, display_name, email, role, phone, address, preferred_contact
         FROM users WHERE active = 1 ORDER BY display_name",
    )?;
    let users: Vec<(i64, String, String, String, Option<String>, Option<String>, Option<String>)> = stmt.query_map([], |row| {
        Ok((
            row.get(0)?,
            row.get(1)?,
            row.get(2)?,
            row.get(3)?,
            row.get(4)?,
            row.get(5)?,
            row.get(6)?,
        ))
    })?
    .filter_map(|r| r.ok())
    .collect();
    drop(stmt);

    // Step 2: for each user, look up hosted sessions, upcoming sessions, children
    let mut members = Vec::new();
    for (id, display_name, email, role, phone, address, preferred_contact) in users {
        let hosted_sessions: Vec<String> = conn.prepare(
            "SELECT title FROM class_sessions WHERE host_id = ?1 ORDER BY session_date DESC"
        )?.query_map(params![id], |row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();

        let upcoming_sessions: Vec<String> = conn.prepare(
            "SELECT title FROM class_sessions WHERE host_id = ?1 AND session_date >= date('now') ORDER BY session_date ASC"
        )?.query_map(params![id], |row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();

        let children: Vec<String> = conn.prepare(
            "SELECT s.first_name || ' ' || s.last_name FROM students s
             JOIN student_parents sp ON s.id = sp.student_id
             WHERE sp.user_id = ?1 ORDER BY s.first_name"
        )?.query_map(params![id], |row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();

        members.push(MemberProfile {
            id,
            display_name,
            email,
            role,
            phone,
            address,
            preferred_contact,
            hosted_sessions,
            upcoming_sessions,
            children,
        });
    }
    Ok(Json(members))
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
                description, requires_location, supports_cost, cost_label
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
                    cs.host_id, u.display_name, cs.host_address, cs.location_name, cs.location_address,
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

    // Use atomic UPDATE to prevent race condition
    let changes = conn.execute(
        "UPDATE class_sessions SET host_id = ?1, host_address = ?2, lesson_plan_id = ?3, materials_needed = ?4,
             rsvp_cutoff = COALESCE(?5, rsvp_cutoff), require_approval = COALESCE(?6, require_approval),
             status = 'claimed'
         WHERE id = ?7 AND status = 'open'",
        params![user.id, req.host_address, req.lesson_plan_id, req.materials_needed, req.rsvp_cutoff, req.require_approval, id],
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
        let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();
        let now_dt = NaiveDateTime::parse_from_str(&now, "%Y-%m-%d %H:%M:%S")
            .or_else(|_| NaiveDateTime::parse_from_str(&now, "%Y-%m-%dT%H:%M:%S"))
            .map_err(|_| AppError::Internal("Failed to parse current time".into()))?;
        let cutoff_dt = NaiveDateTime::parse_from_str(&cutoff, "%Y-%m-%d %H:%M:%S")
            .or_else(|_| NaiveDateTime::parse_from_str(&cutoff, "%Y-%m-%dT%H:%M:%S"))
            .map_err(|_| AppError::BadRequest("Invalid RSVP cutoff date format".into()))?;
        if now_dt > cutoff_dt {
            return Err(AppError::BadRequest("RSVP cutoff has passed".to_string()));
        }
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

    let is_full = max_students.map(|max| confirmed_count >= max).unwrap_or(false);
    let status = if require_approval == 1 || is_full {
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

    let (parent_id, host_id): (i64, Option<i64>) = conn
        .query_row(
            "SELECT r.parent_id, cs.host_id
             FROM rsvps r
             JOIN class_sessions cs ON r.session_id = cs.id
             WHERE r.id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
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

    conn.execute("DELETE FROM rsvps WHERE id = ?1", params![id])?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Families ──

pub async fn create_family(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Json(req): Json<CreateFamilyRequest>,
) -> Result<Json<FamilyDetail>, AppError> {
    if user.family_id.is_some() {
        return Err(AppError::BadRequest("You already belong to a family".to_string()));
    }
    let name = validate_required(&req.name, "name")?;
    let name = sanitize_text(&name);

    let conn = state.db.get()?;
    conn.execute(
        "INSERT INTO families (name, created_by) VALUES (?1, ?2)",
        params![name, user.id],
    )?;
    let family_id = conn.last_insert_rowid();
    conn.execute(
        "UPDATE users SET family_id = ?1 WHERE id = ?2",
        params![family_id, user.id],
    )?;

    Ok(Json(FamilyDetail {
        id: family_id,
        name,
        members: vec![FamilyMember {
            id: user.id,
            display_name: user.display_name,
            email: user.email,
            role: user.role,
        }],
        children: vec![],
    }))
}

pub async fn get_my_family(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<FamilyDetail>, AppError> {
    let family_id = user.family_id.ok_or_else(|| AppError::NotFound("No family".to_string()))?;
    let conn = state.db.get()?;

    let name: String = conn.query_row(
        "SELECT name FROM families WHERE id = ?1",
        params![family_id],
        |row| row.get(0),
    ).map_err(|_| AppError::NotFound("Family not found".to_string()))?;

    let mut stmt = conn.prepare(
        "SELECT id, display_name, email, role FROM users WHERE family_id = ?1 AND active = 1",
    )?;
    let members: Vec<FamilyMember> = stmt.query_map(params![family_id], |row| {
        Ok(FamilyMember {
            id: row.get(0)?,
            display_name: row.get(1)?,
            email: row.get(2)?,
            role: row.get(3)?,
        })
    })?.filter_map(|r| r.ok()).collect();

    // Children: all students linked to any family member
    let mut stmt = conn.prepare(
        "SELECT DISTINCT s.id, s.first_name, s.last_name, s.date_of_birth, s.notes, s.allergies, s.dietary_restrictions, s.emergency_contact_name, s.emergency_contact_phone, s.enrolled, s.created_at
         FROM students s
         JOIN student_parents sp ON s.id = sp.student_id
         JOIN users u ON sp.user_id = u.id
         WHERE u.family_id = ?1",
    )?;
    let children: Vec<Student> = stmt.query_map(params![family_id], |row| {
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
    })?.filter_map(|r| r.ok()).collect();

    Ok(Json(FamilyDetail { id: family_id, name, members, children }))
}

pub async fn update_my_family(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Json(req): Json<UpdateFamilyRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let family_id = user.family_id.ok_or_else(|| AppError::BadRequest("You don't belong to a family".to_string()))?;
    let name = validate_required(&req.name, "name")?;
    let name = sanitize_text(&name);
    let conn = state.db.get()?;
    conn.execute("UPDATE families SET name = ?1 WHERE id = ?2", params![name, family_id])?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn leave_family(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let family_id = user.family_id.ok_or_else(|| AppError::BadRequest("You don't belong to a family".to_string()))?;
    let conn = state.db.get()?;

    conn.execute("UPDATE users SET family_id = NULL WHERE id = ?1", params![user.id])?;

    // If no members remain, delete the family
    let remaining: i64 = conn.query_row(
        "SELECT COUNT(*) FROM users WHERE family_id = ?1",
        params![family_id],
        |row| row.get(0),
    ).unwrap_or(0);
    if remaining == 0 {
        conn.execute("DELETE FROM families WHERE id = ?1", params![family_id])?;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn invite_family_member(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Json(req): Json<InviteFamilyMemberRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let family_id = user.family_id.ok_or_else(|| AppError::BadRequest("You must create a family first".to_string()))?;
    let email = req.email.trim().to_lowercase();
    let conn = state.db.get()?;

    // Find the target user
    let (target_id, target_family): (i64, Option<i64>) = conn.query_row(
        "SELECT id, family_id FROM users WHERE LOWER(email) = ?1 AND active = 1",
        params![email],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| AppError::BadRequest("No active user found with that email".to_string()))?;

    if target_id == user.id {
        return Err(AppError::BadRequest("You can't invite yourself".to_string()));
    }
    if target_family.is_some() {
        return Err(AppError::BadRequest("That user already belongs to a family".to_string()));
    }

    // Check for existing pending invite
    let existing: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM family_invites WHERE family_id = ?1 AND invited_user_id = ?2 AND status = 'pending'",
        params![family_id, target_id],
        |row| row.get(0),
    ).unwrap_or(false);
    if existing {
        return Err(AppError::BadRequest("An invite is already pending for this user".to_string()));
    }

    conn.execute(
        "INSERT INTO family_invites (family_id, invited_by, invited_user_id) VALUES (?1, ?2, ?3)",
        params![family_id, user.id, target_id],
    )?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn list_family_invites(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<Vec<FamilyInviteInfo>>, AppError> {
    let family_id = user.family_id.ok_or_else(|| AppError::NotFound("No family".to_string()))?;
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT fi.id, fi.family_id, f.name, u.display_name, fi.status, fi.created_at
         FROM family_invites fi
         JOIN families f ON fi.family_id = f.id
         JOIN users u ON fi.invited_by = u.id
         WHERE fi.family_id = ?1 AND fi.status = 'pending'",
    )?;
    let invites: Vec<FamilyInviteInfo> = stmt.query_map(params![family_id], |row| {
        Ok(FamilyInviteInfo {
            id: row.get(0)?,
            family_id: row.get(1)?,
            family_name: row.get(2)?,
            invited_by_name: row.get(3)?,
            status: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?.filter_map(|r| r.ok()).collect();
    Ok(Json(invites))
}

pub async fn list_my_invites(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<Vec<FamilyInviteInfo>>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT fi.id, fi.family_id, f.name, u.display_name, fi.status, fi.created_at
         FROM family_invites fi
         JOIN families f ON fi.family_id = f.id
         JOIN users u ON fi.invited_by = u.id
         WHERE fi.invited_user_id = ?1 AND fi.status = 'pending'",
    )?;
    let invites: Vec<FamilyInviteInfo> = stmt.query_map(params![user.id], |row| {
        Ok(FamilyInviteInfo {
            id: row.get(0)?,
            family_id: row.get(1)?,
            family_name: row.get(2)?,
            invited_by_name: row.get(3)?,
            status: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?.filter_map(|r| r.ok()).collect();
    Ok(Json(invites))
}

pub async fn accept_family_invite(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    // Verify invite belongs to this user and is pending
    let (family_id, invited_user_id): (i64, i64) = conn.query_row(
        "SELECT family_id, invited_user_id FROM family_invites WHERE id = ?1 AND status = 'pending'",
        params![id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| AppError::NotFound("Invite not found or already responded".to_string()))?;

    if invited_user_id != user.id {
        return Err(AppError::Forbidden);
    }
    if user.family_id.is_some() {
        return Err(AppError::BadRequest("You already belong to a family".to_string()));
    }

    // Join the family
    conn.execute("UPDATE users SET family_id = ?1 WHERE id = ?2", params![family_id, user.id])?;
    conn.execute("UPDATE family_invites SET status = 'accepted' WHERE id = ?1", params![id])?;

    // Auto-sync: link new member to all children already in the family
    conn.execute(
        "INSERT OR IGNORE INTO student_parents (student_id, user_id)
         SELECT DISTINCT sp.student_id, ?1
         FROM student_parents sp
         JOIN users u ON sp.user_id = u.id
         WHERE u.family_id = ?2 AND u.id != ?1",
        params![user.id, family_id],
    )?;

    // Also link existing family members to any children this user already has
    conn.execute(
        "INSERT OR IGNORE INTO student_parents (student_id, user_id)
         SELECT sp.student_id, u.id
         FROM student_parents sp
         JOIN users u ON u.family_id = ?1 AND u.id != ?2
         WHERE sp.user_id = ?2",
        params![family_id, user.id],
    )?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn decline_family_invite(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    let invited_user_id: i64 = conn.query_row(
        "SELECT invited_user_id FROM family_invites WHERE id = ?1 AND status = 'pending'",
        params![id],
        |row| row.get(0),
    ).map_err(|_| AppError::NotFound("Invite not found or already responded".to_string()))?;

    if invited_user_id != user.id {
        return Err(AppError::Forbidden);
    }

    conn.execute("UPDATE family_invites SET status = 'declined' WHERE id = ?1", params![id])?;
    Ok(Json(serde_json::json!({ "ok": true })))
}
