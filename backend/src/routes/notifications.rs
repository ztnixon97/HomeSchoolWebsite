use axum::{
    extract::{Path, State},
    Json,
};
use rusqlite::params;

use crate::auth::RequireAuth;
use crate::errors::AppError;
use crate::features::require_feature;
use crate::AppState;

/// GET /api/notifications — list notifications for current user (most recent first, limit 50)
pub async fn list_notifications(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    require_feature(&state.db, "notifications")?;
    let conn = state.db.get()?;

    let mut stmt = conn.prepare(
        "SELECT id, notification_type, title, body, link, read, created_at
         FROM notifications
         WHERE user_id = ?1
         ORDER BY created_at DESC
         LIMIT 50",
    )?;
    let rows: Vec<serde_json::Value> = stmt
        .query_map(params![user.id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "notification_type": row.get::<_, String>(1)?,
                "title": row.get::<_, String>(2)?,
                "body": row.get::<_, Option<String>>(3)?,
                "link": row.get::<_, Option<String>>(4)?,
                "read": row.get::<_, bool>(5)?,
                "created_at": row.get::<_, String>(6)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(rows))
}

/// PUT /api/notifications/{id}/read — mark single notification as read
pub async fn mark_notification_read(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    let updated = conn.execute(
        "UPDATE notifications SET read = 1 WHERE id = ?1 AND user_id = ?2",
        params![id, user.id],
    )?;
    if updated == 0 {
        return Err(AppError::NotFound("Notification not found".into()));
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// PUT /api/notifications/read-all — mark all as read for current user
pub async fn mark_all_read(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    conn.execute(
        "UPDATE notifications SET read = 1 WHERE user_id = ?1 AND read = 0",
        params![user.id],
    )?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// GET /api/notifications/unread-count — returns { "count": N }
pub async fn unread_count(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM notifications WHERE user_id = ?1 AND read = 0",
        params![user.id],
        |row| row.get(0),
    )?;
    Ok(Json(serde_json::json!({ "count": count })))
}
