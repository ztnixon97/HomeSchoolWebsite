use axum::{
    extract::{Path, State},
    Json,
};
use rusqlite::params;

use crate::auth::RequireAuth;
use crate::errors::AppError;
use crate::features::require_feature;
use crate::models::CreateConversationRequest;
use crate::AppState;

/// GET /api/conversations — list user's conversations with last message preview and unread count
pub async fn list_conversations(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    require_feature(&state.db, "messaging")?;
    let conn = state.db.get()?;

    let mut stmt = conn.prepare(
        "SELECT c.id, c.subject, c.created_at,
                (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
                (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_at,
                (SELECT u.display_name FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_sender,
                (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id
                    AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01')) as unread_count
         FROM conversations c
         JOIN conversation_participants cp ON c.id = cp.conversation_id
         WHERE cp.user_id = ?1
         ORDER BY COALESCE(
            (SELECT m2.created_at FROM messages m2 WHERE m2.conversation_id = c.id ORDER BY m2.created_at DESC LIMIT 1),
            c.created_at
         ) DESC",
    )?;
    let rows: Vec<serde_json::Value> = stmt
        .query_map(params![user.id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "subject": row.get::<_, Option<String>>(1)?,
                "created_at": row.get::<_, String>(2)?,
                "last_message": row.get::<_, Option<String>>(3)?,
                "last_message_at": row.get::<_, Option<String>>(4)?,
                "last_sender": row.get::<_, Option<String>>(5)?,
                "unread_count": row.get::<_, i64>(6)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(rows))
}

/// POST /api/conversations — create conversation
pub async fn create_conversation(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Json(req): Json<CreateConversationRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_feature(&state.db, "messaging")?;

    if req.body.trim().is_empty() {
        return Err(AppError::BadRequest("Message body is required".into()));
    }
    if req.participant_ids.is_empty() {
        return Err(AppError::BadRequest("At least one participant is required".into()));
    }

    let conn = state.db.get()?;

    conn.execute(
        "INSERT INTO conversations (subject, created_by) VALUES (?1, ?2)",
        params![req.subject, user.id],
    )?;
    let conversation_id = conn.last_insert_rowid();

    // Add creator as participant
    conn.execute(
        "INSERT INTO conversation_participants (conversation_id, user_id, last_read_at) VALUES (?1, ?2, datetime('now'))",
        params![conversation_id, user.id],
    )?;

    // Add other participants
    for pid in &req.participant_ids {
        if *pid != user.id {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (?1, ?2)",
                params![conversation_id, pid],
            );
        }
    }

    // Insert first message
    conn.execute(
        "INSERT INTO messages (conversation_id, sender_id, body) VALUES (?1, ?2, ?3)",
        params![conversation_id, user.id, req.body],
    )?;

    Ok(Json(serde_json::json!({ "id": conversation_id })))
}

/// GET /api/conversations/{id} — get messages for a conversation (verify user is participant)
pub async fn get_conversation_messages(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_feature(&state.db, "messaging")?;
    let conn = state.db.get()?;

    // Verify participant
    let is_participant: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM conversation_participants WHERE conversation_id = ?1 AND user_id = ?2",
            params![id, user.id],
            |row| row.get(0),
        )
        .unwrap_or(false);
    if !is_participant {
        return Err(AppError::Forbidden);
    }

    // Get conversation info
    let subject: Option<String> = conn.query_row(
        "SELECT subject FROM conversations WHERE id = ?1",
        params![id],
        |row| row.get(0),
    ).map_err(|_| AppError::NotFound("Conversation not found".into()))?;

    // Get participants
    let mut pstmt = conn.prepare(
        "SELECT u.id, u.display_name FROM conversation_participants cp
         JOIN users u ON cp.user_id = u.id
         WHERE cp.conversation_id = ?1",
    )?;
    let participants: Vec<serde_json::Value> = pstmt
        .query_map(params![id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "display_name": row.get::<_, String>(1)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();

    // Get messages
    let mut stmt = conn.prepare(
        "SELECT m.id, m.sender_id, u.display_name, m.body, m.created_at
         FROM messages m
         JOIN users u ON m.sender_id = u.id
         WHERE m.conversation_id = ?1
         ORDER BY m.created_at ASC",
    )?;
    let messages: Vec<serde_json::Value> = stmt
        .query_map(params![id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "sender_id": row.get::<_, i64>(1)?,
                "sender_name": row.get::<_, String>(2)?,
                "body": row.get::<_, String>(3)?,
                "created_at": row.get::<_, String>(4)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(serde_json::json!({
        "id": id,
        "subject": subject,
        "participants": participants,
        "messages": messages,
    })))
}

/// POST /api/conversations/{id}/messages — send message (verify participant)
pub async fn send_message(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<SendMessageRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_feature(&state.db, "messaging")?;
    let conn = state.db.get()?;

    // Verify participant
    let is_participant: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM conversation_participants WHERE conversation_id = ?1 AND user_id = ?2",
            params![id, user.id],
            |row| row.get(0),
        )
        .unwrap_or(false);
    if !is_participant {
        return Err(AppError::Forbidden);
    }

    if req.body.trim().is_empty() {
        return Err(AppError::BadRequest("Message body is required".into()));
    }

    conn.execute(
        "INSERT INTO messages (conversation_id, sender_id, body) VALUES (?1, ?2, ?3)",
        params![id, user.id, req.body],
    )?;
    let message_id = conn.last_insert_rowid();

    // Push notification to other conversation participants
    if let Some(ref push_cfg) = state.push_config {
        let mut pstmt = conn.prepare(
            "SELECT user_id FROM conversation_participants WHERE conversation_id = ?1 AND user_id != ?2",
        )?;
        let recipient_ids: Vec<i64> = pstmt
            .query_map(params![id, user.id], |row| row.get(0))
            .map(|rows| rows.filter_map(|r| r.ok()).collect())
            .unwrap_or_default();
        drop(pstmt);

        let sender_name = user.display_name.clone();
        let conv_url = format!("/inbox/{}", id);
        for rid in recipient_ids {
            let db = state.db.clone();
            let cfg = push_cfg.clone();
            let name = sender_name.clone();
            let url = conv_url.clone();
            tokio::spawn(async move {
                crate::push::send_push_to_user(
                    db, cfg, rid, "messages",
                    &format!("New message from {}", name),
                    "You have a new message.",
                    &url,
                ).await;
            });
        }
    }

    Ok(Json(serde_json::json!({ "id": message_id })))
}

/// PUT /api/conversations/{id}/read — update last_read_at for current user
pub async fn mark_conversation_read(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_feature(&state.db, "messaging")?;
    let conn = state.db.get()?;
    conn.execute(
        "UPDATE conversation_participants SET last_read_at = datetime('now') WHERE conversation_id = ?1 AND user_id = ?2",
        params![id, user.id],
    )?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// GET /api/conversations/unread-count — total unread count across all conversations
pub async fn conversations_unread_count(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_feature(&state.db, "messaging")?;
    let conn = state.db.get()?;
    let count: i64 = conn.query_row(
        "SELECT COALESCE(SUM(sub.cnt), 0) FROM (
            SELECT COUNT(*) as cnt FROM messages m
            JOIN conversation_participants cp ON m.conversation_id = cp.conversation_id
            WHERE cp.user_id = ?1
              AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01')
        ) sub",
        params![user.id],
        |row| row.get(0),
    )?;
    Ok(Json(serde_json::json!({ "count": count })))
}

/// GET /api/members — lightweight user list for messaging (any authenticated user)
pub async fn list_members(
    RequireAuth(_user): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, display_name, email, role FROM users WHERE active = 1 ORDER BY display_name",
    )?;
    let members: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "display_name": row.get::<_, String>(1)?,
                "email": row.get::<_, String>(2)?,
                "role": row.get::<_, String>(3)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(Json(members))
}

use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct SendMessageRequest {
    pub body: String,
}
