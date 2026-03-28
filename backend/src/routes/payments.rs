use axum::{
    extract::{Path, State},
    Json,
};
use rusqlite::params;

use crate::auth::{RequireAdmin, RequireAuth};
use crate::errors::AppError;
use crate::features::require_feature;
use crate::models::*;
use crate::AppState;

/// GET /api/my-payments — list payments for current user
pub async fn list_my_payments(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    require_feature(&state.db, "payments")?;
    let conn = state.db.get()?;

    let mut stmt = conn.prepare(
        "SELECT pl.id, pl.description, pl.amount, pl.payment_type, pl.status,
                pl.session_id, cs.title as session_title,
                pl.paid_at, pl.notes, pl.created_at,
                pl.payment_method, pl.due_date, pl.category, pl.reference_number
         FROM payment_ledger pl
         LEFT JOIN class_sessions cs ON pl.session_id = cs.id
         WHERE pl.user_id = ?1
         ORDER BY pl.created_at DESC",
    )?;
    let rows: Vec<serde_json::Value> = stmt
        .query_map(params![user.id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "description": row.get::<_, String>(1)?,
                "amount": row.get::<_, f64>(2)?,
                "payment_type": row.get::<_, String>(3)?,
                "status": row.get::<_, String>(4)?,
                "session_id": row.get::<_, Option<i64>>(5)?,
                "session_title": row.get::<_, Option<String>>(6)?,
                "paid_at": row.get::<_, Option<String>>(7)?,
                "notes": row.get::<_, Option<String>>(8)?,
                "created_at": row.get::<_, String>(9)?,
                "payment_method": row.get::<_, Option<String>>(10)?,
                "due_date": row.get::<_, Option<String>>(11)?,
                "category": row.get::<_, Option<String>>(12)?,
                "reference_number": row.get::<_, Option<String>>(13)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(rows))
}

/// GET /api/admin/payments — list all payments (admin)
pub async fn admin_list_payments(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    let conn = state.db.get()?;

    let mut stmt = conn.prepare(
        "SELECT pl.id, pl.user_id, u.display_name as user_name,
                pl.description, pl.amount, pl.payment_type, pl.status,
                pl.session_id, cs.title as session_title,
                pl.paid_at, pl.recorded_by, ru.display_name as recorded_by_name,
                pl.notes, pl.created_at,
                pl.payment_method, pl.due_date, pl.category, pl.reference_number
         FROM payment_ledger pl
         JOIN users u ON pl.user_id = u.id
         LEFT JOIN class_sessions cs ON pl.session_id = cs.id
         LEFT JOIN users ru ON pl.recorded_by = ru.id
         ORDER BY pl.created_at DESC",
    )?;
    let rows: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "user_id": row.get::<_, i64>(1)?,
                "user_name": row.get::<_, String>(2)?,
                "description": row.get::<_, String>(3)?,
                "amount": row.get::<_, f64>(4)?,
                "payment_type": row.get::<_, String>(5)?,
                "status": row.get::<_, String>(6)?,
                "session_id": row.get::<_, Option<i64>>(7)?,
                "session_title": row.get::<_, Option<String>>(8)?,
                "paid_at": row.get::<_, Option<String>>(9)?,
                "recorded_by": row.get::<_, Option<i64>>(10)?,
                "recorded_by_name": row.get::<_, Option<String>>(11)?,
                "notes": row.get::<_, Option<String>>(12)?,
                "created_at": row.get::<_, String>(13)?,
                "payment_method": row.get::<_, Option<String>>(14)?,
                "due_date": row.get::<_, Option<String>>(15)?,
                "category": row.get::<_, Option<String>>(16)?,
                "reference_number": row.get::<_, Option<String>>(17)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(rows))
}

/// POST /api/admin/payments — record payment (admin)
pub async fn admin_create_payment(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(req): Json<CreatePaymentRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if req.description.trim().is_empty() {
        return Err(AppError::BadRequest("Description is required".into()));
    }

    let conn = state.db.get()?;

    // Verify user exists
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM users WHERE id = ?1",
            params![req.user_id],
            |row| row.get(0),
        )
        .unwrap_or(false);
    if !exists {
        return Err(AppError::NotFound("User not found".into()));
    }

    let payment_type = req.payment_type.unwrap_or_else(|| "charge".into());
    let status = req.status.unwrap_or_else(|| "pending".into());

    conn.execute(
        "INSERT INTO payment_ledger (user_id, session_id, description, amount, payment_type, status, recorded_by, notes, payment_method, due_date, category, reference_number)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            req.user_id,
            req.session_id,
            req.description,
            req.amount,
            payment_type,
            status,
            admin.id,
            req.notes,
            req.payment_method,
            req.due_date,
            req.category,
            req.reference_number,
        ],
    )?;
    let id = conn.last_insert_rowid();

    Ok(Json(serde_json::json!({ "id": id })))
}

/// PUT /api/admin/payments/{id} — update payment status (admin)
pub async fn admin_update_payment(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdatePaymentRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM payment_ledger WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .unwrap_or(false);
    if !exists {
        return Err(AppError::NotFound("Payment not found".into()));
    }

    if let Some(v) = &req.description {
        conn.execute("UPDATE payment_ledger SET description = ?1 WHERE id = ?2", params![v, id])?;
    }
    if let Some(v) = req.amount {
        conn.execute("UPDATE payment_ledger SET amount = ?1 WHERE id = ?2", params![v, id])?;
    }
    if let Some(v) = &req.payment_type {
        conn.execute("UPDATE payment_ledger SET payment_type = ?1 WHERE id = ?2", params![v, id])?;
    }
    if let Some(v) = &req.status {
        conn.execute("UPDATE payment_ledger SET status = ?1 WHERE id = ?2", params![v, id])?;
    }
    if let Some(v) = &req.paid_at {
        conn.execute("UPDATE payment_ledger SET paid_at = ?1 WHERE id = ?2", params![v, id])?;
    }
    if let Some(v) = &req.notes {
        conn.execute("UPDATE payment_ledger SET notes = ?1 WHERE id = ?2", params![v, id])?;
    }
    if let Some(v) = &req.payment_method {
        conn.execute("UPDATE payment_ledger SET payment_method = ?1 WHERE id = ?2", params![v, id])?;
    }
    if let Some(v) = &req.due_date {
        conn.execute("UPDATE payment_ledger SET due_date = ?1 WHERE id = ?2", params![v, id])?;
    }
    if let Some(v) = &req.category {
        conn.execute("UPDATE payment_ledger SET category = ?1 WHERE id = ?2", params![v, id])?;
    }
    if let Some(v) = &req.reference_number {
        conn.execute("UPDATE payment_ledger SET reference_number = ?1 WHERE id = ?2", params![v, id])?;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// DELETE /api/admin/payments/{id} — delete payment (admin)
pub async fn admin_delete_payment(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    let deleted = conn.execute("DELETE FROM payment_ledger WHERE id = ?1", params![id])?;
    if deleted == 0 {
        return Err(AppError::NotFound("Payment not found".into()));
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// POST /api/admin/payments/bulk-charge — charge all RSVPs for a session
pub async fn admin_bulk_charge_session(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(req): Json<BulkChargeRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;

    // Get the session to verify it exists
    let _session_title: String = conn.query_row(
        "SELECT title FROM class_sessions WHERE id = ?1",
        params![req.session_id],
        |row| row.get(0),
    ).map_err(|_| AppError::NotFound("Session not found".into()))?;

    // Get all users who RSVP'd to this session
    let mut stmt = conn.prepare(
        "SELECT DISTINCT r.user_id FROM rsvps r WHERE r.session_id = ?1"
    )?;
    let user_ids: Vec<i64> = stmt.query_map(params![req.session_id], |row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();

    if user_ids.is_empty() {
        return Err(AppError::BadRequest("No RSVPs found for this session".into()));
    }

    let mut created: i64 = 0;
    for uid in &user_ids {
        // Check if charge already exists for this user+session to avoid duplicates
        let exists: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM payment_ledger WHERE user_id = ?1 AND session_id = ?2 AND payment_type = 'charge'",
            params![uid, req.session_id],
            |row| row.get(0),
        ).unwrap_or(false);

        if !exists {
            conn.execute(
                "INSERT INTO payment_ledger (user_id, session_id, description, amount, payment_type, status, recorded_by, notes, category, due_date)
                 VALUES (?1, ?2, ?3, ?4, 'charge', 'pending', ?5, ?6, ?7, ?8)",
                params![uid, req.session_id, req.description, req.amount, admin.id, req.notes, req.category, req.due_date],
            )?;
            created += 1;
        }
    }

    Ok(Json(serde_json::json!({ "created": created, "skipped": user_ids.len() as i64 - created, "total_rsvps": user_ids.len() })))
}

/// GET /api/admin/payments/overdue — list overdue charges
pub async fn admin_overdue_payments(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT pl.id, pl.user_id, u.display_name, u.email, pl.description, pl.amount, pl.due_date, pl.category, pl.created_at
         FROM payment_ledger pl
         JOIN users u ON pl.user_id = u.id
         WHERE pl.payment_type = 'charge' AND pl.status = 'pending' AND pl.due_date IS NOT NULL AND pl.due_date < date('now')
         ORDER BY pl.due_date ASC"
    )?;
    let rows: Vec<serde_json::Value> = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "user_id": row.get::<_, i64>(1)?,
            "display_name": row.get::<_, String>(2)?,
            "email": row.get::<_, String>(3)?,
            "description": row.get::<_, String>(4)?,
            "amount": row.get::<_, f64>(5)?,
            "due_date": row.get::<_, Option<String>>(6)?,
            "category": row.get::<_, Option<String>>(7)?,
            "created_at": row.get::<_, String>(8)?,
        }))
    })?.filter_map(|r| r.ok()).collect();
    Ok(Json(rows))
}

/// GET /api/admin/payments/stats — overall payment statistics
pub async fn admin_payment_stats(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    let stats = conn.query_row(
        "SELECT
            COALESCE(SUM(CASE WHEN payment_type = 'charge' THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN payment_type = 'payment' THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN payment_type = 'charge' AND status = 'pending' THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN payment_type = 'charge' AND status = 'pending' AND due_date IS NOT NULL AND due_date < date('now') THEN amount ELSE 0 END), 0),
            COUNT(DISTINCT CASE WHEN payment_type = 'charge' AND status = 'pending' THEN user_id END)
         FROM payment_ledger",
        [],
        |row| Ok(serde_json::json!({
            "total_charged": row.get::<_, f64>(0)?,
            "total_collected": row.get::<_, f64>(1)?,
            "outstanding": row.get::<_, f64>(2)?,
            "overdue": row.get::<_, f64>(3)?,
            "members_with_balance": row.get::<_, i64>(4)?,
        }))
    )?;
    Ok(Json(stats))
}

/// GET /api/admin/payments/summary — per-user balance summary (admin)
pub async fn admin_payments_summary(
    RequireAdmin(_user): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    let conn = state.db.get()?;

    let mut stmt = conn.prepare(
        "SELECT u.id, u.display_name, u.email,
                COALESCE(SUM(CASE WHEN pl.payment_type = 'charge' THEN pl.amount ELSE 0 END), 0) as total_charges,
                COALESCE(SUM(CASE WHEN pl.payment_type = 'payment' THEN pl.amount ELSE 0 END), 0) as total_payments,
                COALESCE(SUM(CASE WHEN pl.payment_type = 'charge' THEN pl.amount ELSE -pl.amount END), 0) as balance
         FROM users u
         LEFT JOIN payment_ledger pl ON u.id = pl.user_id
         GROUP BY u.id
         HAVING balance != 0 OR total_charges != 0
         ORDER BY u.display_name",
    )?;
    let rows: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "user_id": row.get::<_, i64>(0)?,
                "display_name": row.get::<_, String>(1)?,
                "email": row.get::<_, String>(2)?,
                "total_charges": row.get::<_, f64>(3)?,
                "total_payments": row.get::<_, f64>(4)?,
                "balance": row.get::<_, f64>(5)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(rows))
}
