use axum::{
    extract::{Path, Query, State},
    Json,
};
use rusqlite::params;
use serde::Deserialize;

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
        "SELECT c.id, c.subject, strftime('%Y-%m-%dT%H:%M:%fZ', c.created_at) as created_at,
                (SELECT m.body FROM messages m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 1) as last_message,
                (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', m.created_at) FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_at,
                (SELECT u.display_name FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_sender,
                (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id
                    AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01')) as unread_count
         FROM conversations c
         JOIN conversation_participants cp ON c.id = cp.conversation_id
         WHERE cp.user_id = ?1 AND cp.hidden_at IS NULL
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

    let has_files = req.file_ids.as_ref().map_or(false, |ids| !ids.is_empty());
    if req.body.trim().is_empty() && !has_files {
        return Err(AppError::BadRequest("Message body or attachment is required".into()));
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
    let message_id = conn.last_insert_rowid();

    // Link any uploaded files to the message
    if let Some(ref file_ids) = req.file_ids {
        for fid in file_ids {
            conn.execute(
                "UPDATE files SET linked_type = 'message', linked_id = ?1 WHERE id = ?2 AND uploader_id = ?3",
                params![message_id, fid, user.id],
            )?;
        }
    }

    Ok(Json(serde_json::json!({ "id": conversation_id })))
}

/// GET /api/conversations/{id} — get messages for a conversation (verify user is participant)
pub async fn get_conversation_messages(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Query(query): Query<MessagesQuery>,
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

    // Get messages with cursor-based pagination
    let limit = query.limit.unwrap_or(50).min(100);
    let fetch_limit = limit + 1; // fetch one extra to check has_more

    let map_message_row = |row: &rusqlite::Row| -> rusqlite::Result<serde_json::Value> {
        let deleted: Option<String> = row.get(5)?;
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "sender_id": row.get::<_, i64>(1)?,
            "sender_name": row.get::<_, String>(2)?,
            "body": if deleted.is_some() { serde_json::Value::Null } else { serde_json::Value::String(row.get::<_, String>(3)?) },
            "created_at": row.get::<_, String>(4)?,
            "deleted": deleted.is_some(),
        }))
    };

    let mut messages: Vec<serde_json::Value> = if let Some(before) = query.before {
        let mut stmt = conn.prepare(
            "SELECT m.id, m.sender_id, u.display_name, m.body,
                    strftime('%Y-%m-%dT%H:%M:%fZ', m.created_at), m.deleted_at
             FROM messages m
             JOIN users u ON m.sender_id = u.id
             WHERE m.conversation_id = ?1 AND m.id < ?2
             ORDER BY m.id DESC
             LIMIT ?3",
        )?;
        let rows = stmt.query_map(params![id, before, fetch_limit], &map_message_row)?;
        rows.filter_map(|r| r.ok()).collect()
    } else {
        let mut stmt = conn.prepare(
            "SELECT m.id, m.sender_id, u.display_name, m.body,
                    strftime('%Y-%m-%dT%H:%M:%fZ', m.created_at), m.deleted_at
             FROM messages m
             JOIN users u ON m.sender_id = u.id
             WHERE m.conversation_id = ?1
             ORDER BY m.id DESC
             LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![id, fetch_limit], &map_message_row)?;
        rows.filter_map(|r| r.ok()).collect()
    };

    let has_more = messages.len() as i64 > limit;
    if has_more {
        messages.pop(); // remove the extra row
    }
    messages.reverse(); // return oldest-first for display

    // Batch-fetch attachments for these messages
    let message_ids: Vec<i64> = messages.iter()
        .filter_map(|m| m.get("id").and_then(|v| v.as_i64()))
        .collect();
    let attachments = fetch_message_attachments(&conn, &message_ids)?;

    // Attach files to each message
    for msg in &mut messages {
        if let Some(mid) = msg.get("id").and_then(|v| v.as_i64()) {
            let files = attachments.get(&mid).cloned().unwrap_or_default();
            msg.as_object_mut().unwrap().insert("attachments".to_string(), serde_json::json!(files));
        }
    }

    Ok(Json(serde_json::json!({
        "id": id,
        "subject": subject,
        "participants": participants,
        "messages": messages,
        "has_more": has_more,
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

    let has_files = req.file_ids.as_ref().map_or(false, |ids| !ids.is_empty());
    if req.body.trim().is_empty() && !has_files {
        return Err(AppError::BadRequest("Message body or attachment is required".into()));
    }

    conn.execute(
        "INSERT INTO messages (conversation_id, sender_id, body) VALUES (?1, ?2, ?3)",
        params![id, user.id, req.body],
    )?;
    let message_id = conn.last_insert_rowid();

    // Link any uploaded files to the message
    if let Some(ref file_ids) = req.file_ids {
        for fid in file_ids {
            conn.execute(
                "UPDATE files SET linked_type = 'message', linked_id = ?1 WHERE id = ?2 AND uploader_id = ?3",
                params![message_id, fid, user.id],
            )?;
        }
    }

    // Resurface conversation for participants who hid it
    conn.execute(
        "UPDATE conversation_participants SET hidden_at = NULL WHERE conversation_id = ?1 AND hidden_at IS NOT NULL",
        params![id],
    )?;

    // Query back the full message to return to the client
    let message: serde_json::Value = conn.query_row(
        "SELECT m.id, m.sender_id, u.display_name, m.body, strftime('%Y-%m-%dT%H:%M:%fZ', m.created_at)
         FROM messages m JOIN users u ON m.sender_id = u.id
         WHERE m.id = ?1",
        params![message_id],
        |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "sender_id": row.get::<_, i64>(1)?,
                "sender_name": row.get::<_, String>(2)?,
                "body": row.get::<_, String>(3)?,
                "created_at": row.get::<_, String>(4)?,
                "deleted": false,
                "attachments": [],
            }))
        },
    )?;

    // Fetch attachments for this message
    let msg_attachments = fetch_message_attachments(&conn, &[message_id])?;
    let mut message = message;
    if let Some(files) = msg_attachments.get(&message_id) {
        message.as_object_mut().unwrap().insert("attachments".to_string(), serde_json::json!(files));
    }

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

    Ok(Json(message))
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

/// DELETE /api/conversations/{id} — hide conversation for current user (soft delete)
pub async fn hide_conversation(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_feature(&state.db, "messaging")?;
    let conn = state.db.get()?;
    conn.execute(
        "UPDATE conversation_participants SET hidden_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE conversation_id = ?1 AND user_id = ?2",
        params![id, user.id],
    )?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// DELETE /api/messages/{id} — soft-delete a message (sender only)
pub async fn delete_message(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_feature(&state.db, "messaging")?;
    let conn = state.db.get()?;

    // Verify the user is the sender
    let sender_id: i64 = conn.query_row(
        "SELECT sender_id FROM messages WHERE id = ?1",
        params![id],
        |row| row.get(0),
    ).map_err(|_| AppError::NotFound("Message not found".into()))?;

    if sender_id != user.id {
        return Err(AppError::Forbidden);
    }

    conn.execute(
        "UPDATE messages SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1",
        params![id],
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
              AND cp.hidden_at IS NULL
              AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01')
        ) sub",
        params![user.id],
        |row| row.get(0),
    )?;
    Ok(Json(serde_json::json!({ "count": count })))
}

/// GET /api/messaging/members — lightweight user list for messaging (any authenticated user)
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

/// Batch-fetch file attachments for a set of message IDs
fn fetch_message_attachments(
    conn: &rusqlite::Connection,
    message_ids: &[i64],
) -> Result<std::collections::HashMap<i64, Vec<serde_json::Value>>, AppError> {
    let mut map: std::collections::HashMap<i64, Vec<serde_json::Value>> = std::collections::HashMap::new();
    if message_ids.is_empty() {
        return Ok(map);
    }

    // Build IN clause dynamically
    let placeholders: Vec<String> = message_ids.iter().map(|_| "?".to_string()).collect();
    let sql = format!(
        "SELECT id, filename, storage_path, mime_type, size_bytes, linked_id FROM files WHERE linked_type = 'message' AND linked_id IN ({})",
        placeholders.join(",")
    );
    let mut stmt = conn.prepare(&sql)?;
    let params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = message_ids.iter().map(|id| Box::new(*id) as Box<dyn rusqlite::types::ToSql>).collect();
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

    let rows = stmt.query_map(param_refs.as_slice(), |row| {
        Ok((
            row.get::<_, i64>(5)?, // linked_id (message_id)
            serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "filename": row.get::<_, String>(1)?,
                "storage_path": row.get::<_, String>(2)?,
                "mime_type": row.get::<_, String>(3)?,
                "size_bytes": row.get::<_, i64>(4)?,
            }),
        ))
    })?;

    for row in rows {
        if let Ok((msg_id, file_json)) = row {
            map.entry(msg_id).or_default().push(file_json);
        }
    }

    Ok(map)
}

#[derive(Debug, Deserialize)]
pub struct SendMessageRequest {
    pub body: String,
    pub file_ids: Option<Vec<i64>>,
}

#[derive(Debug, Deserialize)]
pub struct MessagesQuery {
    pub before: Option<i64>,
    pub limit: Option<i64>,
}
