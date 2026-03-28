use axum::{
    extract::{Path, Query, State},
    Json,
};
use rusqlite::params;
use serde::Deserialize;

use crate::errors::AppError;
use crate::models::{Event, Post, Resource, ClassSession, PostSearchQuery, PostSearchResponse, PostNeighbor, PostNeighborsResponse, SitePage, Announcement};
use crate::AppState;

#[derive(Deserialize)]
pub struct EventsQuery {
    pub month: Option<String>, // "YYYY-MM"
}

pub async fn list_events(
    State(state): State<AppState>,
    Query(query): Query<EventsQuery>,
) -> Result<Json<Vec<Event>>, AppError> {
    let conn = state.db.get()?;

    let events: Vec<Event> = if let Some(month) = query.month {
        let start = format!("{}-01", month);
        let end = format!("{}-31", month);
        let mut stmt = conn.prepare(
            "SELECT id, title, description, event_date, start_time, end_time, event_type, created_by, created_at
             FROM events WHERE event_date BETWEEN ?1 AND ?2 ORDER BY event_date, start_time",
        )?;
        let result = stmt.query_map(params![start, end], map_event)?
            .filter_map(|r| r.ok())
            .collect();
        result
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, title, description, event_date, start_time, end_time, event_type, created_by, created_at
             FROM events WHERE event_date >= date('now') ORDER BY event_date, start_time LIMIT 50",
        )?;
        let result = stmt.query_map([], map_event)?
            .filter_map(|r| r.ok())
            .collect();
        result
    };

    Ok(Json(events))
}

pub async fn list_published_posts(
    State(state): State<AppState>,
) -> Result<Json<Vec<Post>>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT p.id, p.author_id, u.display_name, p.title, p.content, p.category, p.published, p.created_at, p.updated_at
         FROM posts p JOIN users u ON p.author_id = u.id
         WHERE p.published = 1 ORDER BY p.created_at DESC LIMIT 50",
    )?;

    let posts: Vec<Post> = stmt
        .query_map([], |row| {
            Ok(Post {
                id: row.get(0)?,
                author_id: row.get(1)?,
                author_name: row.get(2)?,
                title: row.get(3)?,
                content: row.get(4)?,
                category: row.get(5)?,
                published: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(posts))
}

pub async fn search_published_posts(
    State(state): State<AppState>,
    Query(q): Query<PostSearchQuery>,
) -> Result<Json<PostSearchResponse>, AppError> {
    let conn = state.db.get()?;
    let page = q.page.unwrap_or(1).max(1);
    let page_size = q.page_size.unwrap_or(10).clamp(1, 50);
    let offset = (page - 1) * page_size;
    let term = q.q.unwrap_or_default().trim().to_string();
    let like = format!("%{}%", term);

    let mut where_clauses = vec!["p.published = 1".to_string()];
    let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();

    // Only add search filters if a non-empty search term is provided
    if !term.is_empty() {
        where_clauses.push("(p.title LIKE ? OR p.content LIKE ? OR u.display_name LIKE ?)".to_string());
        params_vec.push(like.clone().into());
        params_vec.push(like.clone().into());
        params_vec.push(like.into());
    }
    if let Some(category) = q.category.clone().filter(|c| !c.trim().is_empty()) {
        where_clauses.push("p.category = ?".to_string());
        params_vec.push(category.into());
    }
    if let Some(from) = q.from.clone().filter(|d| !d.trim().is_empty()) {
        where_clauses.push("date(p.created_at) >= date(?)".to_string());
        params_vec.push(from.into());
    }
    if let Some(to) = q.to.clone().filter(|d| !d.trim().is_empty()) {
        where_clauses.push("date(p.created_at) <= date(?)".to_string());
        params_vec.push(to.into());
    }

    let where_sql = where_clauses.join(" AND ");

    let mut count_stmt = conn.prepare(&format!(
        "SELECT COUNT(*) FROM posts p JOIN users u ON p.author_id = u.id WHERE {}",
        where_sql
    ))?;
    let total: i64 = count_stmt
        .query_row(rusqlite::params_from_iter(params_vec.iter()), |row| row.get(0))
        .unwrap_or(0);

    let mut list_params = params_vec.clone();
    list_params.push(page_size.into());
    list_params.push(offset.into());

    let mut stmt = conn.prepare(&format!(
        "SELECT p.id, p.author_id, u.display_name, p.title, p.content, p.category, p.published, p.created_at, p.updated_at
         FROM posts p JOIN users u ON p.author_id = u.id
         WHERE {}
         ORDER BY p.created_at DESC
         LIMIT ? OFFSET ?",
        where_sql
    ))?;

    let posts: Vec<Post> = stmt
        .query_map(rusqlite::params_from_iter(list_params.iter()), |row| {
            Ok(Post {
                id: row.get(0)?,
                author_id: row.get(1)?,
                author_name: row.get(2)?,
                title: row.get(3)?,
                content: row.get(4)?,
                category: row.get(5)?,
                published: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(PostSearchResponse {
        items: posts,
        total,
        page,
        page_size,
    }))
}

pub async fn get_post(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<Post>, AppError> {
    let conn = state.db.get()?;
    let post = conn
        .query_row(
            "SELECT p.id, p.author_id, u.display_name, p.title, p.content, p.category, p.published, p.created_at, p.updated_at
             FROM posts p JOIN users u ON p.author_id = u.id
             WHERE p.id = ?1 AND p.published = 1",
            params![id],
            |row| {
                Ok(Post {
                    id: row.get(0)?,
                    author_id: row.get(1)?,
                    author_name: row.get(2)?,
                    title: row.get(3)?,
                    content: row.get(4)?,
                    category: row.get(5)?,
                    published: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            },
        )
        .map_err(|_| AppError::NotFound("Post not found".to_string()))?;

    Ok(Json(post))
}

pub async fn get_post_neighbors(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<PostNeighborsResponse>, AppError> {
    let conn = state.db.get()?;
    let created_at: String = conn
        .query_row(
            "SELECT created_at FROM posts WHERE id = ?1 AND published = 1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::NotFound("Post not found".to_string()))?;

    let prev = conn
        .query_row(
            "SELECT id, title, created_at FROM posts
             WHERE published = 1 AND created_at < ?1
             ORDER BY created_at DESC LIMIT 1",
            params![created_at],
            |row| {
                Ok(PostNeighbor {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    created_at: row.get(2)?,
                })
            },
        )
        .ok();

    let next = conn
        .query_row(
            "SELECT id, title, created_at FROM posts
             WHERE published = 1 AND created_at > ?1
             ORDER BY created_at ASC LIMIT 1",
            params![created_at],
            |row| {
                Ok(PostNeighbor {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    created_at: row.get(2)?,
                })
            },
        )
        .ok();

    Ok(Json(PostNeighborsResponse { prev, next }))
}

pub async fn list_published_resources(
    State(state): State<AppState>,
) -> Result<Json<Vec<Resource>>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, title, content, category, sort_order, published, updated_at
         FROM resources WHERE published = 1 ORDER BY sort_order, title",
    )?;

    let resources: Vec<Resource> = stmt
        .query_map([], |row| {
            Ok(Resource {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                category: row.get(3)?,
                sort_order: row.get(4)?,
                published: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(resources))
}

pub async fn list_public_sessions(
    State(state): State<AppState>,
) -> Result<Json<Vec<ClassSession>>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT cs.id, cs.title, cs.theme, cs.session_date, cs.end_date, cs.start_time, cs.end_time,
                NULL as host_id, NULL as host_name, NULL as host_address,
                NULL as location_name, NULL as location_address,
                NULL as cost_amount, NULL as cost_details,
                NULL as lesson_plan_id, NULL as materials_needed, NULL as max_students, NULL as notes, cs.status,
                cs.session_type_id, st.name, st.label, NULL as rsvp_cutoff, 0 as require_approval,
                cs.created_by, cs.created_at
         FROM class_sessions cs
         LEFT JOIN session_types st ON cs.session_type_id = st.id
         ORDER BY cs.session_date ASC, cs.start_time ASC",
    )?;

    let sessions: Vec<ClassSession> = stmt
        .query_map([], |row| {
            Ok(ClassSession {
                id: row.get(0)?,
                title: row.get(1)?,
                theme: row.get(2)?,
                session_date: row.get(3)?,
                end_date: row.get(4)?,
                start_time: row.get(5)?,
                end_time: row.get(6)?,
                host_id: row.get(7)?,
                host_name: row.get(8)?,
                host_address: row.get(9)?,
                location_name: row.get(10)?,
                location_address: row.get(11)?,
                cost_amount: row.get(12)?,
                cost_details: row.get(13)?,
                lesson_plan_id: row.get(14)?,
                materials_needed: row.get(15)?,
                max_students: row.get(16)?,
                notes: row.get(17)?,
                status: row.get(18)?,
                session_type_id: row.get(19)?,
                session_type_name: row.get(20)?,
                session_type_label: row.get(21)?,
                rsvp_cutoff: row.get(22)?,
                require_approval: row.get(23)?,
                created_by: row.get(24)?,
                created_at: row.get(25)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(sessions))
}

fn map_event(row: &rusqlite::Row) -> rusqlite::Result<Event> {
    Ok(Event {
        id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        event_date: row.get(3)?,
        start_time: row.get(4)?,
        end_time: row.get(5)?,
        event_type: row.get(6)?,
        created_by: row.get(7)?,
        created_at: row.get(8)?,
    })
}

pub async fn get_site_page(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> Result<Json<SitePage>, AppError> {
    let conn = state.db.get()?;
    let page = conn.query_row(
        "SELECT slug, title, content, updated_at FROM site_pages WHERE slug = ?1",
        params![slug],
        |row| Ok(SitePage {
            slug: row.get(0)?,
            title: row.get(1)?,
            content: row.get(2)?,
            updated_at: row.get(3)?,
        }),
    ).map_err(|_| AppError::NotFound("Page not found".to_string()))?;
    Ok(Json(page))
}

pub async fn list_active_announcements(
    State(state): State<AppState>,
) -> Result<Json<Vec<Announcement>>, AppError> {
    let conn = state.db.get()?;
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();

    let mut stmt = conn.prepare(
        "SELECT a.id, a.title, a.body, a.announcement_type, a.active,
                a.created_by, u.display_name, a.expires_at, a.created_at
         FROM announcements a
         LEFT JOIN users u ON a.created_by = u.id
         WHERE a.active = 1 AND (a.expires_at IS NULL OR a.expires_at > ?1)
         ORDER BY a.created_at DESC",
    )?;

    let announcements: Vec<Announcement> = stmt
        .query_map(params![now], |row| {
            Ok(Announcement {
                id: row.get(0)?,
                title: row.get(1)?,
                body: row.get(2)?,
                announcement_type: row.get(3)?,
                active: row.get::<_, i64>(4)? != 0,
                created_by: row.get(5)?,
                created_by_name: row.get(6)?,
                expires_at: row.get(7)?,
                created_at: row.get(8)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(announcements))
}

pub async fn get_feature_flags(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare("SELECT key, value FROM app_settings WHERE key LIKE 'feature_%'")?;
    let flags: std::collections::HashMap<String, bool> = stmt
        .query_map([], |row| {
            let key: String = row.get(0)?;
            let val: String = row.get(1)?;
            Ok((key.strip_prefix("feature_").unwrap_or(&key).to_string(), val == "1"))
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(Json(serde_json::json!(flags)))
}
