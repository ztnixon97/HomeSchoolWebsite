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

/// True if the user may see a session's roster-level details (RSVPs, attendance, supplies):
/// admins, the host/creator, members of a class the session is linked to (teacher or a parent
/// of an enrolled child), and anyone for an unassigned/global session. Mirrors the masking in
/// `get_session` so a non-member viewing an "other class" session can't read its roster.
pub fn can_view_session(conn: &rusqlite::Connection, user: &User, session_id: i64) -> bool {
    if user.role == "admin" {
        return true;
    }
    let owner: bool = conn
        .query_row(
            "SELECT (host_id = ?2 OR created_by = ?2) FROM class_sessions WHERE id = ?1",
            rusqlite::params![session_id, user.id],
            |r| r.get::<_, Option<bool>>(0),
        )
        .ok()
        .flatten()
        .unwrap_or(false);
    if owner {
        return true;
    }
    let has_links: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM class_session_groups WHERE session_id = ?1",
            rusqlite::params![session_id],
            |r| r.get(0),
        )
        .unwrap_or(false);
    if !has_links {
        return true;
    }
    conn.query_row(
        "SELECT COUNT(*) > 0 FROM class_session_groups csg WHERE csg.session_id = ?1 AND (
            csg.group_id IN (SELECT group_id FROM class_group_teachers WHERE user_id = ?2)
            OR csg.group_id IN (SELECT cgm.group_id FROM class_group_members cgm
                                JOIN student_parents sp ON cgm.student_id = sp.student_id
                                WHERE sp.user_id = ?2)
         )",
        rusqlite::params![session_id, user.id],
        |r| r.get(0),
    )
    .unwrap_or(false)
}

/// True if the user may create/edit/delete a specific session: admins and global teachers
/// manage any session; the session's host manages their own; a class teacher manages sessions
/// linked to a class they teach.
pub fn can_manage_session(conn: &rusqlite::Connection, user: &User, session_id: i64) -> bool {
    if user.role == "admin" || user.role == "teacher" {
        return true;
    }
    let is_host: bool = conn
        .query_row(
            "SELECT host_id = ?2 FROM class_sessions WHERE id = ?1",
            rusqlite::params![session_id, user.id],
            |r| r.get::<_, Option<bool>>(0),
        )
        .ok()
        .flatten()
        .unwrap_or(false);
    if is_host {
        return true;
    }
    conn.query_row(
        "SELECT COUNT(*) > 0 FROM class_session_groups csg
         JOIN class_group_teachers cgt ON csg.group_id = cgt.group_id
         WHERE csg.session_id = ?1 AND cgt.user_id = ?2",
        rusqlite::params![session_id, user.id],
        |r| r.get(0),
    )
    .unwrap_or(false)
}

/// True if the user may manage a class's content (announcements, assignments, grades,
/// category weights): admins and global teachers can manage any class; everyone else must
/// be an assigned teacher of that specific class. Regular parents get no management access.
pub fn can_manage_class_content(conn: &rusqlite::Connection, user: &User, group_id: i64) -> bool {
    if user.role == "admin" || user.role == "teacher" {
        return true;
    }
    conn.query_row(
        "SELECT COUNT(*) > 0 FROM class_group_teachers WHERE group_id = ?1 AND user_id = ?2",
        rusqlite::params![group_id, user.id],
        |r| r.get(0),
    )
    .unwrap_or(false)
}

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
        "SELECT id, email, display_name, password_hash, role, active, phone, address, preferred_contact, family_id, created_at FROM users WHERE id = ?1 AND active = 1",
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
                family_id: row.get(9)?,
                created_at: row.get(10)?,
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
