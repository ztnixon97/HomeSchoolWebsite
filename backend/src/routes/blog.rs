use axum::{
    extract::{Path, State},
    Json,
};
use rusqlite::params;
use crate::auth::{RequireAuth, RequireTeacher};
use crate::errors::AppError;
use crate::models::*;
use crate::sanitize::{sanitize_html, sanitize_text, validate_required, validate_max_length};
use crate::AppState;

// ── Blog Posts (Teacher+) ──

pub async fn create_post(
    RequireTeacher(user): RequireTeacher,
    State(state): State<AppState>,
    Json(req): Json<CreatePostRequest>,
) -> Result<Json<Post>, AppError> {
    crate::features::require_feature(&state.db, "blog")?;
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
    crate::features::require_feature(&state.db, "blog")?;
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
    crate::features::require_feature(&state.db, "blog")?;
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
    crate::features::require_feature(&state.db, "blog")?;
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

pub async fn delete_post(
    RequireTeacher(user): RequireTeacher,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    crate::features::require_feature(&state.db, "blog")?;
    let conn = state.db.get()?;
    let author_id: i64 = conn.query_row("SELECT author_id FROM posts WHERE id = ?1", params![id], |row| row.get(0))
        .map_err(|_| AppError::NotFound("Post not found".to_string()))?;

    if author_id != user.id && user.role != "admin" {
        return Err(AppError::Forbidden);
    }

    conn.execute("DELETE FROM post_comments WHERE post_id = ?1", params![id])?;
    conn.execute("DELETE FROM files WHERE linked_type = 'post' AND linked_id = ?1", params![id])?;
    conn.execute("DELETE FROM posts WHERE id = ?1", params![id])?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Post Comments (Authenticated) ──

pub async fn list_post_comments(
    RequireAuth(_user): RequireAuth,
    State(state): State<AppState>,
    Path(post_id): Path<i64>,
) -> Result<Json<Vec<PostComment>>, AppError> {
    crate::features::require_feature(&state.db, "blog")?;
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
    crate::features::require_feature(&state.db, "blog")?;
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
    crate::features::require_feature(&state.db, "blog")?;
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
    crate::features::require_feature(&state.db, "blog")?;
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
