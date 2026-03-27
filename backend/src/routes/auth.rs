use axum::{extract::State, Json};
use rusqlite::params;
use serde_json::json;
use tower_sessions::Session;

use crate::auth::{clear_session, hash_password, set_session_user, verify_password, RequireAuth};
use crate::errors::AppError;
use crate::models::{LoginRequest, RegisterRequest, UserResponse, ForgotPasswordRequest, ResetPasswordRequest, UpdateEmailRequest, ChangePasswordRequest, UpdateProfileRequest};
use crate::AppState;

pub async fn login(
    State(state): State<AppState>,
    session: Session,
    Json(req): Json<LoginRequest>,
) -> Result<Json<UserResponse>, AppError> {
    let conn = state.db.get()?;
    let email = req.email.trim().to_lowercase();

    let user = conn
        .query_row(
            "SELECT id, email, display_name, password_hash, role, active, phone, address, preferred_contact, created_at FROM users WHERE LOWER(email) = ?1",
            params![email],
            |row| {
                Ok(crate::models::User {
                    id: row.get(0)?,
                    email: row.get(1)?,
                    display_name: row.get(2)?,
                    password_hash: row.get(3)?,
                    role: row.get(4)?,
                    active: row.get(5)?,
                    phone: row.get(6)?,
                    address: row.get(7)?,
                    preferred_contact: row.get(8)?,
                    created_at: row.get(9)?,
                })
            },
        )
        .map_err(|_| AppError::Unauthorized)?;

    if !user.active {
        return Err(AppError::Unauthorized);
    }

    if !verify_password(&req.password, &user.password_hash)? {
        return Err(AppError::Unauthorized);
    }

    set_session_user(&session, user.id).await?;

    Ok(Json(user.into()))
}

pub async fn register(
    State(state): State<AppState>,
    session: Session,
    Json(req): Json<RegisterRequest>,
) -> Result<Json<UserResponse>, AppError> {
    let conn = state.db.get()?;

    // Validate invite code
    let invite = conn
        .query_row(
            "SELECT id, code, role, email, used_by, expires_at FROM invites WHERE code = ?1",
            params![req.invite_code],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(2)?,       // role
                    row.get::<_, Option<String>>(3)?, // email restriction
                    row.get::<_, Option<i64>>(4)?,   // used_by
                    row.get::<_, Option<String>>(5)?, // expires_at
                ))
            },
        )
        .map_err(|_| AppError::BadRequest("Invalid invite code".to_string()))?;

    let (invite_id, role, invite_email, used_by, expires_at) = invite;

    // Check if already used
    if used_by.is_some() {
        return Err(AppError::BadRequest("This invite link has already been used. Please contact the co-op admin for a new invitation.".to_string()));
    }

    // Check expiry
    if let Some(exp) = expires_at {
        let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();
        if now > exp {
            return Err(AppError::BadRequest("This invite link has expired. Please contact the co-op admin for a new invitation.".to_string()));
        }
    }

    // Check email restriction
    if let Some(restricted_email) = invite_email {
        if restricted_email.to_lowercase() != req.email.to_lowercase() {
            return Err(AppError::BadRequest(
                "This invite is for a different email address".to_string(),
            ));
        }
    }

    // Check email not already taken
    let email_lower = req.email.trim().to_lowercase();
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM users WHERE LOWER(email) = ?1",
            params![email_lower],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if exists {
        return Err(AppError::BadRequest("Email already registered".to_string()));
    }

    let password_hash = hash_password(&req.password)?;

    // Atomically claim the invite (prevents race condition with concurrent registrations)
    let claimed = conn.execute(
        "UPDATE invites SET used_by = -1 WHERE id = ?1 AND used_by IS NULL",
        params![invite_id],
    )?;
    if claimed == 0 {
        return Err(AppError::BadRequest("This invite link has already been used. Please contact the co-op admin for a new invitation.".to_string()));
    }

    conn.execute(
        "INSERT INTO users (email, display_name, password_hash, role) VALUES (?1, ?2, ?3, ?4)",
        params![email_lower, req.display_name, password_hash, role],
    )?;

    let user_id = conn.last_insert_rowid();

    // Update invite with actual user id
    conn.execute(
        "UPDATE invites SET used_by = ?1 WHERE id = ?2",
        params![user_id, invite_id],
    )?;

    let user = crate::models::User {
        id: user_id,
        email: email_lower,
        display_name: req.display_name,
        password_hash,
        role,
        active: true,
        phone: None,
        address: None,
        preferred_contact: None,
        created_at: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string(),
    };

    set_session_user(&session, user.id).await?;

    Ok(Json(user.into()))
}

pub async fn logout(session: Session) -> Result<Json<serde_json::Value>, AppError> {
    clear_session(&session).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn me(RequireAuth(user): RequireAuth) -> Json<UserResponse> {
    Json(user.into())
}

// ── Invite Validation ──

pub async fn check_invite(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Json<serde_json::Value>, AppError> {
    let code = params.get("code").ok_or_else(|| AppError::BadRequest("Missing code".to_string()))?;
    let conn = state.db.get()?;

    match conn.query_row(
        "SELECT used_by, expires_at FROM invites WHERE code = ?1",
        params![code],
        |row| Ok((row.get::<_, Option<i64>>(0)?, row.get::<_, Option<String>>(1)?)),
    ) {
        Ok((used_by, expires_at)) => {
            if used_by.is_some() {
                return Ok(Json(json!({ "valid": false, "message": "This invite link has already been used. Please contact the co-op admin for a new invitation." })));
            }
            if let Some(exp) = expires_at {
                let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();
                if now > exp {
                    return Ok(Json(json!({ "valid": false, "message": "This invite link has expired. Please contact the co-op admin for a new invitation." })));
                }
            }
            Ok(Json(json!({ "valid": true })))
        }
        Err(_) => Ok(Json(json!({ "valid": false, "message": "Invalid invite code." }))),
    }
}

// ── Password Reset ──

pub async fn forgot_password(
    State(state): State<AppState>,
    Json(req): Json<ForgotPasswordRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let email = req.email.trim().to_lowercase();

    // Always return success to prevent email enumeration
    // Do all DB work in a block so conn is dropped before the .await
    let send_info = {
        let conn = state.db.get()?;
        if let Ok((user_id, display_name)) = conn.query_row(
            "SELECT id, display_name FROM users WHERE LOWER(email) = ?1",
            params![email],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
        ) {
            let token = uuid::Uuid::new_v4().to_string();
            let expires_at = chrono::Utc::now()
                .checked_add_signed(chrono::Duration::hours(1))
                .unwrap()
                .format("%Y-%m-%dT%H:%M:%S")
                .to_string();

            let _ = conn.execute(
                "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?1, ?2, ?3)",
                params![user_id, token, expires_at],
            );
            Some((display_name, token))
        } else {
            None
        }
    };

    if let Some((display_name, token)) = send_info {
        let config = &state.email_config;
        let _ = crate::email::send_password_reset_email(config, &email, &display_name, &token).await;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn reset_password(
    State(state): State<AppState>,
    Json(req): Json<ResetPasswordRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    // Check if token exists, is not expired, and is not used
    let user_id: i64 = conn.query_row(
        "SELECT user_id FROM password_reset_tokens WHERE token = ?1 AND used = 0 AND expires_at > datetime('now')",
        params![req.token],
        |row| row.get(0),
    ).map_err(|_| AppError::BadRequest("Invalid or expired password reset token".to_string()))?;

    // Hash new password
    let hashed = hash_password(&req.new_password)?;

    // Update user password and mark token as used
    conn.execute(
        "UPDATE users SET password_hash = ?1 WHERE id = ?2",
        params![hashed, user_id],
    )?;

    conn.execute(
        "UPDATE password_reset_tokens SET used = 1 WHERE token = ?1",
        params![req.token],
    )?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Account Management ──

pub async fn update_profile(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Json(req): Json<UpdateProfileRequest>,
) -> Result<Json<UserResponse>, AppError> {
    let conn = state.db.get()?;

    let display_name = req.display_name.unwrap_or(user.display_name.clone());
    let phone = req.phone.or(user.phone.clone());
    let address = req.address.or(user.address.clone());
    let preferred_contact = req.preferred_contact.or(user.preferred_contact.clone());

    conn.execute(
        "UPDATE users SET display_name = ?1, phone = ?2, address = ?3, preferred_contact = ?4 WHERE id = ?5",
        params![display_name, phone, address, preferred_contact, user.id],
    )?;

    let updated = crate::models::User {
        display_name,
        phone,
        address,
        preferred_contact,
        ..user
    };

    Ok(Json(updated.into()))
}

pub async fn change_email(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Json(req): Json<UpdateEmailRequest>,
) -> Result<Json<UserResponse>, AppError> {
    // Verify current password
    if !verify_password(&req.password, &user.password_hash)? {
        return Err(AppError::BadRequest("Incorrect password".to_string()));
    }

    let new_email = req.new_email.trim().to_lowercase();
    let conn = state.db.get()?;

    // Check email not taken
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM users WHERE LOWER(email) = ?1 AND id != ?2",
            params![new_email, user.id],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if exists {
        return Err(AppError::BadRequest("Email already in use".to_string()));
    }

    conn.execute(
        "UPDATE users SET email = ?1 WHERE id = ?2",
        params![new_email, user.id],
    )?;

    let updated = crate::models::User {
        email: new_email,
        ..user
    };

    Ok(Json(updated.into()))
}

pub async fn change_password(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Json(req): Json<ChangePasswordRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Verify current password
    if !verify_password(&req.current_password, &user.password_hash)? {
        return Err(AppError::BadRequest("Current password is incorrect".to_string()));
    }

    if req.new_password.len() < 6 {
        return Err(AppError::BadRequest("Password must be at least 6 characters".to_string()));
    }

    let hashed = hash_password(&req.new_password)?;
    let conn = state.db.get()?;
    conn.execute(
        "UPDATE users SET password_hash = ?1 WHERE id = ?2",
        params![hashed, user.id],
    )?;

    Ok(Json(json!({ "ok": true })))
}
