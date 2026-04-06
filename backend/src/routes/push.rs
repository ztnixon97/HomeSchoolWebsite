use axum::{
    extract::State,
    Json,
};
use rusqlite::params;
use serde::Deserialize;

use crate::auth::RequireAuth;
use crate::errors::AppError;
use crate::AppState;

/// GET /api/push/vapid-key — public key for push subscription (no auth needed)
pub async fn vapid_key(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    match &state.push_config {
        Some(config) => Ok(Json(serde_json::json!({ "public_key": config.public_key }))),
        None => Ok(Json(serde_json::json!({ "public_key": null }))),
    }
}

#[derive(Debug, Deserialize)]
pub struct SubscribeRequest {
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
}

/// POST /api/push/subscribe — save push subscription for current user
pub async fn subscribe(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Json(req): Json<SubscribeRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    // Upsert: if endpoint already exists, update the keys and user
    conn.execute(
        "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(endpoint) DO UPDATE SET user_id = ?1, p256dh = ?3, auth = ?4",
        params![user.id, req.endpoint, req.p256dh, req.auth],
    )?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

#[derive(Debug, Deserialize)]
pub struct UnsubscribeRequest {
    pub endpoint: String,
}

/// DELETE /api/push/unsubscribe — remove push subscription
pub async fn unsubscribe(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Json(req): Json<UnsubscribeRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    conn.execute(
        "DELETE FROM push_subscriptions WHERE endpoint = ?1 AND user_id = ?2",
        params![req.endpoint, user.id],
    )?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// GET /api/push/preferences — get notification preferences for current user
pub async fn get_preferences(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    let prefs: Option<String> = conn
        .query_row(
            "SELECT preferences FROM push_subscriptions WHERE user_id = ?1 LIMIT 1",
            params![user.id],
            |row| row.get(0),
        )
        .ok();

    match prefs {
        Some(json) => {
            let parsed: serde_json::Value =
                serde_json::from_str(&json).unwrap_or(serde_json::json!({}));
            Ok(Json(serde_json::json!({ "subscribed": true, "preferences": parsed })))
        }
        None => Ok(Json(serde_json::json!({ "subscribed": false, "preferences": {} }))),
    }
}

#[derive(Debug, Deserialize)]
pub struct UpdatePreferencesRequest {
    pub host_assignment: Option<bool>,
    pub reminders: Option<bool>,
    pub rsvp: Option<bool>,
    pub announcements: Option<bool>,
    pub messages: Option<bool>,
}

/// PUT /api/push/preferences — update notification preferences
pub async fn update_preferences(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Json(req): Json<UpdatePreferencesRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    // Get current preferences
    let current: Option<String> = conn
        .query_row(
            "SELECT preferences FROM push_subscriptions WHERE user_id = ?1 LIMIT 1",
            params![user.id],
            |row| row.get(0),
        )
        .ok();

    let mut prefs: serde_json::Value = current
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::json!({
            "host_assignment": true,
            "reminders": true,
            "rsvp": true,
            "announcements": true,
            "messages": true,
        }));

    // Merge updates
    if let Some(v) = req.host_assignment {
        prefs["host_assignment"] = serde_json::json!(v);
    }
    if let Some(v) = req.reminders {
        prefs["reminders"] = serde_json::json!(v);
    }
    if let Some(v) = req.rsvp {
        prefs["rsvp"] = serde_json::json!(v);
    }
    if let Some(v) = req.announcements {
        prefs["announcements"] = serde_json::json!(v);
    }
    if let Some(v) = req.messages {
        prefs["messages"] = serde_json::json!(v);
    }

    let prefs_str = serde_json::to_string(&prefs).unwrap_or_default();
    conn.execute(
        "UPDATE push_subscriptions SET preferences = ?1 WHERE user_id = ?2",
        params![prefs_str, user.id],
    )?;

    Ok(Json(serde_json::json!({ "ok": true, "preferences": prefs })))
}
