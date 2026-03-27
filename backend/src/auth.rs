use argon2::{
    password_hash::{rand_core::OsRng, SaltString},
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
};
use axum::{
    extract::FromRequestParts,
    http::request::Parts,
};
use tower_sessions::Session;

use crate::db::DbPool;
use crate::errors::AppError;
use crate::models::User;

const USER_ID_KEY: &str = "user_id";

pub fn hash_password(password: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(e.to_string()))?
        .to_string();
    Ok(hash)
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool, AppError> {
    let parsed_hash =
        PasswordHash::new(hash).map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

pub async fn set_session_user(session: &Session, user_id: i64) -> Result<(), AppError> {
    session
        .insert(USER_ID_KEY, user_id)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))
}

pub async fn clear_session(session: &Session) -> Result<(), AppError> {
    session.flush().await.map_err(|e| AppError::Internal(e.to_string()))
}

fn get_user_by_id(pool: &DbPool, user_id: i64) -> Result<User, AppError> {
    let conn = pool.get()?;
    let user = conn.query_row(
        "SELECT id, email, display_name, password_hash, role, active, phone, address, preferred_contact, created_at FROM users WHERE id = ?1 AND active = 1",
        [user_id],
        |row| {
            Ok(User {
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
    ).map_err(|_| AppError::Unauthorized)?;
    Ok(user)
}

// ── Extractors ──

/// Extracts the current authenticated user from the session.
/// Returns Unauthorized if not logged in.
pub struct RequireAuth(pub User);

impl FromRequestParts<crate::AppState> for RequireAuth {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &crate::AppState,
    ) -> Result<Self, Self::Rejection> {
        let session = Session::from_request_parts(parts, state)
            .await
            .map_err(|_| AppError::Unauthorized)?;

        let user_id: i64 = session
            .get(USER_ID_KEY)
            .await
            .map_err(|_| AppError::Unauthorized)?
            .ok_or(AppError::Unauthorized)?;

        let user = get_user_by_id(&state.db, user_id)?;
        Ok(RequireAuth(user))
    }
}

/// Requires the user to be a teacher, parent, or admin.
pub struct RequireTeacher(pub User);

impl FromRequestParts<crate::AppState> for RequireTeacher {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &crate::AppState,
    ) -> Result<Self, Self::Rejection> {
        let RequireAuth(user) = RequireAuth::from_request_parts(parts, state).await?;
        if user.role == "teacher" || user.role == "parent" || user.role == "admin" {
            Ok(RequireTeacher(user))
        } else {
            Err(AppError::Forbidden)
        }
    }
}

/// Requires the user to be an admin.
pub struct RequireAdmin(pub User);

impl FromRequestParts<crate::AppState> for RequireAdmin {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &crate::AppState,
    ) -> Result<Self, Self::Rejection> {
        let RequireAuth(user) = RequireAuth::from_request_parts(parts, state).await?;
        if user.role == "admin" {
            Ok(RequireAdmin(user))
        } else {
            Err(AppError::Forbidden)
        }
    }
}
