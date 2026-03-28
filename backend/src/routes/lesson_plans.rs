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

// ── Lesson Plans ──

pub async fn list_lesson_plans(
    RequireAuth(_user): RequireAuth,
    State(state): State<AppState>,
    axum::extract::Query(query): axum::extract::Query<LessonPlansQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    crate::features::require_feature(&state.db, "lesson_plans")?;
    let conn = state.db.get()?;

    let mut where_clauses = vec!["1=1".to_string()];
    let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref q) = query.q {
        let q = q.trim();
        if !q.is_empty() {
            let pattern = format!("%{}%", q);
            params_vec.push(Box::new(pattern));
            where_clauses.push(format!("lp.title LIKE ?{}", params_vec.len()));
        }
    }
    if let Some(ref cat) = query.category {
        if !cat.is_empty() {
            params_vec.push(Box::new(cat.clone()));
            where_clauses.push(format!("lp.category = ?{}", params_vec.len()));
        }
    }

    let where_sql = where_clauses.join(" AND ");
    let base = format!("FROM lesson_plans lp JOIN users u ON lp.author_id = u.id WHERE {}", where_sql);
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    if query.page.is_some() || query.page_size.is_some() {
        let page = query.page.unwrap_or(1).max(1);
        let page_size = query.page_size.unwrap_or(12).clamp(1, 50);
        let offset = (page - 1) * page_size;

        let total: i64 = conn.query_row(&format!("SELECT COUNT(*) {}", base), rusqlite::params_from_iter(&params_refs), |row| row.get(0))?;

        let mut lp: Vec<&dyn rusqlite::types::ToSql> = params_refs.clone();
        lp.push(&page_size);
        lp.push(&offset);

        let sql = format!(
            "SELECT lp.id, lp.author_id, u.display_name, lp.title, lp.description, lp.age_group, lp.category, lp.created_at, lp.updated_at {} ORDER BY lp.created_at DESC LIMIT ?{} OFFSET ?{}",
            base, lp.len() - 1, lp.len()
        );
        let mut stmt = conn.prepare(&sql)?;
        let plans: Vec<LessonPlan> = stmt.query_map(rusqlite::params_from_iter(&lp), |row| {
            Ok(LessonPlan { id: row.get(0)?, author_id: row.get(1)?, author_name: row.get(2)?, title: row.get(3)?, description: row.get(4)?, age_group: row.get(5)?, category: row.get(6)?, created_at: row.get(7)?, updated_at: row.get(8)? })
        })?.filter_map(|r| r.ok()).collect();

        return Ok(Json(serde_json::json!({ "items": plans, "total": total, "page": page, "page_size": page_size })));
    }

    let sql = format!("SELECT lp.id, lp.author_id, u.display_name, lp.title, lp.description, lp.age_group, lp.category, lp.created_at, lp.updated_at {} ORDER BY lp.created_at DESC", base);
    let mut stmt = conn.prepare(&sql)?;
    let plans: Vec<LessonPlan> = stmt.query_map(rusqlite::params_from_iter(&params_refs), |row| {
        Ok(LessonPlan { id: row.get(0)?, author_id: row.get(1)?, author_name: row.get(2)?, title: row.get(3)?, description: row.get(4)?, age_group: row.get(5)?, category: row.get(6)?, created_at: row.get(7)?, updated_at: row.get(8)? })
    })?.filter_map(|r| r.ok()).collect();

    Ok(Json(serde_json::json!(plans)))
}

pub async fn get_lesson_plan(
    RequireAuth(_user): RequireAuth,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<LessonPlan>, AppError> {
    crate::features::require_feature(&state.db, "lesson_plans")?;
    let conn = state.db.get()?;
    let plan = conn
        .query_row(
            "SELECT lp.id, lp.author_id, u.display_name, lp.title, lp.description, lp.age_group, lp.category, lp.created_at, lp.updated_at
             FROM lesson_plans lp JOIN users u ON lp.author_id = u.id WHERE lp.id = ?1",
            params![id],
            |row| {
                Ok(LessonPlan {
                    id: row.get(0)?,
                    author_id: row.get(1)?,
                    author_name: row.get(2)?,
                    title: row.get(3)?,
                    description: row.get(4)?,
                    age_group: row.get(5)?,
                    category: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            },
        )
        .map_err(|_| AppError::NotFound("Lesson plan not found".to_string()))?;

    Ok(Json(plan))
}

pub async fn create_lesson_plan(
    RequireTeacher(user): RequireTeacher,
    State(state): State<AppState>,
    Json(req): Json<CreateLessonPlanRequest>,
) -> Result<Json<LessonPlan>, AppError> {
    crate::features::require_feature(&state.db, "lesson_plans")?;
    let conn = state.db.get()?;
    let title = validate_required(&req.title, "title")?;
    let title = sanitize_text(&title);
    validate_max_length(&title, 200, "title")?;
    let description = sanitize_html(&req.description);
    conn.execute(
        "INSERT INTO lesson_plans (author_id, title, description, age_group, category) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![user.id, title, description, req.age_group, req.category],
    )?;

    let id = conn.last_insert_rowid();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();

    Ok(Json(LessonPlan {
        id,
        author_id: user.id,
        author_name: Some(user.display_name),
        title,
        description,
        age_group: req.age_group,
        category: req.category,
        created_at: now.clone(),
        updated_at: now,
    }))
}

pub async fn update_lesson_plan(
    RequireTeacher(user): RequireTeacher,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateLessonPlanRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    crate::features::require_feature(&state.db, "lesson_plans")?;
    let conn = state.db.get()?;

    // Only author, admin, or collaborator can edit
    let author_id: i64 = conn
        .query_row("SELECT author_id FROM lesson_plans WHERE id = ?1", params![id], |row| row.get(0))
        .map_err(|_| AppError::NotFound("Lesson plan not found".to_string()))?;

    let is_collaborator: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM lesson_plan_collaborators WHERE lesson_plan_id = ?1 AND user_id = ?2",
            params![id, user.id],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if author_id != user.id && user.role != "admin" && !is_collaborator {
        return Err(AppError::Forbidden);
    }

    if let Some(title) = req.title {
        conn.execute("UPDATE lesson_plans SET title = ?1, updated_at = datetime('now') WHERE id = ?2", params![title, id])?;
    }
    if let Some(description) = req.description {
        let description = sanitize_html(&description);
        conn.execute("UPDATE lesson_plans SET description = ?1, updated_at = datetime('now') WHERE id = ?2", params![description, id])?;
    }
    if let Some(age_group) = req.age_group {
        conn.execute("UPDATE lesson_plans SET age_group = ?1, updated_at = datetime('now') WHERE id = ?2", params![age_group, id])?;
    }
    if let Some(category) = req.category {
        conn.execute("UPDATE lesson_plans SET category = ?1, updated_at = datetime('now') WHERE id = ?2", params![category, id])?;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn delete_lesson_plan(
    RequireTeacher(user): RequireTeacher,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    crate::features::require_feature(&state.db, "lesson_plans")?;
    let conn = state.db.get()?;
    let author_id: i64 = conn
        .query_row("SELECT author_id FROM lesson_plans WHERE id = ?1", params![id], |row| row.get(0))
        .map_err(|_| AppError::NotFound("Lesson plan not found".to_string()))?;

    if author_id != user.id && user.role != "admin" {
        return Err(AppError::Forbidden);
    }

    // Collect file paths to delete from storage, then drop conn before async calls
    let file_paths: Vec<(i64, String)> = {
        let mut stmt = conn.prepare("SELECT id, storage_path FROM files WHERE linked_type = 'lesson_plan' AND linked_id = ?1")?;
        let results: Vec<(i64, String)> = stmt.query_map(params![id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })?.filter_map(|r| r.ok()).collect();
        drop(stmt);
        results
    };

    // Unlink sessions, delete file records and plan (all sync DB ops)
    conn.execute("UPDATE class_sessions SET lesson_plan_id = NULL WHERE lesson_plan_id = ?1", params![id])?;
    conn.execute("DELETE FROM files WHERE linked_type = 'lesson_plan' AND linked_id = ?1", params![id])?;
    conn.execute("DELETE FROM lesson_plans WHERE id = ?1", params![id])?;
    drop(conn);

    // Now delete from storage (async, conn dropped)
    for (_fid, path) in &file_paths {
        let _ = state.storage.delete(path).await;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}
