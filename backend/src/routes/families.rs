use axum::{
    extract::{Path, State},
    Json,
};
use rusqlite::params;
use crate::auth::RequireAuth;
use crate::errors::AppError;
use crate::models::*;
use crate::sanitize::{sanitize_text, validate_required};
use crate::AppState;

// ── Families ──

pub async fn create_family(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Json(req): Json<CreateFamilyRequest>,
) -> Result<Json<FamilyDetail>, AppError> {
    crate::features::require_feature(&state.db, "families")?;
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
    crate::features::require_feature(&state.db, "families")?;
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
    crate::features::require_feature(&state.db, "families")?;
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
    crate::features::require_feature(&state.db, "families")?;
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
    crate::features::require_feature(&state.db, "families")?;
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
    crate::features::require_feature(&state.db, "families")?;
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
    crate::features::require_feature(&state.db, "families")?;
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
    crate::features::require_feature(&state.db, "families")?;
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
    crate::features::require_feature(&state.db, "families")?;
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
