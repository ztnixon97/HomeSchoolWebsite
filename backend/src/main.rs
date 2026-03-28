use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
    Router,
};
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};
use tower_sessions::{cookie::SameSite, Expiry, SessionManagerLayer};

mod auth;
mod backup;
mod db;
mod email;
mod errors;
mod features;
mod models;
mod reminders;
mod routes;
mod sanitize;
mod rate_limit;
mod session_store;
mod storage;

use db::DbPool;
use email::EmailConfig;
use storage::{LocalStorage, StorageBackend};

#[derive(Clone)]
pub struct AppState {
    pub db: DbPool,
    pub storage: Arc<dyn StorageBackend>,
    pub uploads_dir: String,
    pub email_config: EmailConfig,
}

#[tokio::main]
async fn main() {
    // Initialize structured logging
    let is_prod = std::env::var("PRODUCTION").is_ok();
    if is_prod {
        tracing_subscriber::fmt().json().with_env_filter("info").init();
    } else {
        tracing_subscriber::fmt().pretty().with_env_filter("info,preschool_backend=debug").init();
    }

    // Config from environment with sensible defaults
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);
    let db_path = std::env::var("DATABASE_PATH").unwrap_or_else(|_| "data/preschool.db".into());
    let uploads_dir = std::env::var("UPLOADS_DIR").unwrap_or_else(|_| "uploads".into());
    let is_production = std::env::var("PRODUCTION").is_ok();
    let static_dir = std::env::var("STATIC_DIR").unwrap_or_else(|_| "static".into());

    // Initialize database
    let pool = db::init_pool(&db_path);

    // Start automated backup task (only if R2 configured)
    backup::start_backup_task(pool.clone());

    // Initialize storage — use R2 if configured, otherwise local disk
    let storage: Arc<dyn StorageBackend> = if std::env::var("R2_ACCOUNT_ID").is_ok() {
        println!("Using Cloudflare R2 storage");
        Arc::new(storage::R2Storage::new().await)
    } else {
        println!("Using local file storage");
        Arc::new(LocalStorage::new(&uploads_dir, "/uploads"))
    };

    // Start hourly session cleanup (expired sessions from sessions_store table)
    backup::start_session_cleanup_task(pool.clone());
    // Start daily photo cleanup (30-day retention for session files)
    backup::start_photo_cleanup_task(pool.clone(), storage.clone());

    // Initialize email config
    let email_config = EmailConfig::from_env();

    let state = AppState {
        db: pool.clone(),
        storage,
        uploads_dir: uploads_dir.to_string(),
        email_config,
    };

    // Session store (SQLite-backed — sessions persist across restarts)
    let session_store = session_store::SqliteSessionStore::new(pool.clone());

    let session_layer = SessionManagerLayer::new(session_store)
        .with_secure(is_production) // HTTPS in production
        .with_same_site(SameSite::Lax)
        .with_expiry(Expiry::OnInactivity(
            tower_sessions::cookie::time::Duration::days(7),
        ));

    // CORS — restrictive in production, permissive in dev
    let cors = if is_production {
        let site_url = std::env::var("SITE_URL").unwrap_or_else(|_| "https://westernloudouncoop.org".into());
        let mut origins: Vec<axum::http::HeaderValue> = vec![
            site_url.parse().unwrap(),
        ];
        // Also allow fly.dev domain
        if let Ok(fly_url) = "https://westernloudouncoop.fly.dev".parse() {
            origins.push(fly_url);
        }
        // Add www variant
        if let Ok(www_url) = format!("https://www.westernloudouncoop.org").parse() {
            origins.push(www_url);
        }
        CorsLayer::new()
            .allow_origin(origins)
            .allow_methods([
                axum::http::Method::GET,
                axum::http::Method::POST,
                axum::http::Method::PUT,
                axum::http::Method::DELETE,
            ])
            .allow_headers([
                axum::http::header::CONTENT_TYPE,
                axum::http::header::AUTHORIZATION,
                axum::http::header::COOKIE,
            ])
            .allow_credentials(true)
    } else {
        CorsLayer::new()
            .allow_origin([
                "http://localhost:5173".parse().unwrap(),
                "http://127.0.0.1:5173".parse().unwrap(),
            ])
            .allow_methods([
                axum::http::Method::GET,
                axum::http::Method::POST,
                axum::http::Method::PUT,
                axum::http::Method::DELETE,
            ])
            .allow_headers([
                axum::http::header::CONTENT_TYPE,
                axum::http::header::AUTHORIZATION,
                axum::http::header::COOKIE,
            ])
            .allow_credentials(true)
    };

    // Build API router
    let api = Router::new()
        // Public routes
        .route("/api/events", get(routes::public::list_events))
        .route(
            "/api/sessions/public",
            get(routes::public::list_public_sessions),
        )
        .route("/api/posts", get(routes::public::list_published_posts))
        .route(
            "/api/posts/search",
            get(routes::public::search_published_posts),
        )
        .route("/api/posts/{id}", get(routes::public::get_post))
        .route(
            "/api/posts/{id}/neighbors",
            get(routes::public::get_post_neighbors),
        )
        .route(
            "/api/resources",
            get(routes::public::list_published_resources),
        )
        .route("/api/pages/{slug}", get(routes::public::get_site_page))
        .route("/api/announcements", get(routes::public::list_active_announcements))
        .route("/api/features", get(routes::public::get_feature_flags))
        .route("/health", get(health_check))
        // Public calendar feed (token-based auth, no session needed)
        .route("/api/calendar/{token}", get(routes::calendar::calendar_ics_by_token))
        // Auth routes
        .route("/api/auth/login", post(routes::auth::login))
        .route("/api/auth/register", post(routes::auth::register))
        .route("/api/auth/logout", post(routes::auth::logout))
        .route("/api/auth/me", get(routes::auth::me))
        .route("/api/auth/check-invite", get(routes::auth::check_invite))
        .route("/api/auth/forgot-password", post(routes::auth::forgot_password))
        .route("/api/auth/reset-password", post(routes::auth::reset_password))
        .route("/api/auth/profile", put(routes::auth::update_profile))
        .route("/api/auth/change-email", put(routes::auth::change_email))
        .route("/api/auth/change-password", put(routes::auth::change_password))
        // Member routes (any authenticated user)
        .route(
            "/api/lesson-plans",
            get(routes::lesson_plans::list_lesson_plans),
        )
        .route(
            "/api/lesson-plans/{id}",
            get(routes::lesson_plans::get_lesson_plan),
        )
        .route(
            "/api/my-children",
            get(routes::children::my_children).post(routes::children::create_my_child),
        )
        .route(
            "/api/my-children/{id}",
            put(routes::children::update_my_child).delete(routes::children::delete_my_child),
        )
        .route("/api/users", get(routes::sessions::list_users))
        .route("/api/members", get(routes::sessions::list_members))
        .route("/api/files/{id}", get(routes::files::get_file_info).delete(routes::files::delete_file))
        .route(
            "/api/files/{id}/download",
            get(routes::files::download_file),
        )
        .route(
            "/api/files/{linked_type}/{linked_id}",
            get(routes::files::list_files_for_entity),
        )
        // Teacher+ routes
        .route("/api/posts", post(routes::blog::create_post))
        .route("/api/posts/{id}", put(routes::blog::update_post).delete(routes::blog::delete_post))
        .route("/api/posts/drafts", get(routes::blog::list_draft_posts))
        .route(
            "/api/posts/{id}/internal",
            get(routes::blog::get_post_internal),
        )
        .route(
            "/api/posts/{id}/comments",
            get(routes::blog::list_post_comments),
        )
        .route(
            "/api/posts/{id}/comments",
            post(routes::blog::create_post_comment),
        )
        .route(
            "/api/comments/{id}",
            put(routes::blog::update_post_comment),
        )
        .route(
            "/api/comments/{id}",
            delete(routes::blog::delete_post_comment),
        )
        .route(
            "/api/lesson-plans",
            post(routes::lesson_plans::create_lesson_plan),
        )
        .route(
            "/api/lesson-plans/{id}",
            put(routes::lesson_plans::update_lesson_plan).delete(routes::lesson_plans::delete_lesson_plan),
        )
        .route(
            "/api/lesson-plans/{id}/collaborators",
            get(routes::sessions::list_lesson_plan_collaborators),
        )
        .route(
            "/api/lesson-plans/{id}/collaborators",
            post(routes::sessions::add_lesson_plan_collaborator),
        )
        .route(
            "/api/lesson-plans/{id}/collaborators/{user_id}",
            delete(routes::sessions::remove_lesson_plan_collaborator),
        )
        .route("/api/uploads", post(routes::files::upload_file))
        .route("/api/students", get(routes::children::list_students))
        .route(
            "/api/students/{id}/milestones",
            get(routes::children::get_student_milestones),
        )
        .route("/api/milestones", post(routes::children::create_milestone))
        .route(
            "/api/milestones/{id}",
            put(routes::children::update_milestone),
        )
        .route(
            "/api/milestones/{id}",
            delete(routes::children::delete_milestone),
        )
        .route("/api/attendance", post(routes::children::record_attendance))
        .route("/api/sessions/{id}/attendance", get(routes::sessions::get_session_attendance))
        .route("/api/session-attendance", post(routes::sessions::save_session_attendance))
        .route("/api/sessions/{id}/supplies", get(routes::sessions::list_session_supplies).post(routes::sessions::add_session_supply))
        .route("/api/supplies/{id}/claim", post(routes::sessions::claim_supply))
        .route("/api/supplies/{id}/unclaim", post(routes::sessions::unclaim_supply))
        .route("/api/supplies/{id}", delete(routes::sessions::delete_supply))
        // Family routes (authenticated)
        .route("/api/my-family", post(routes::families::create_family).get(routes::families::get_my_family).put(routes::families::update_my_family).delete(routes::families::leave_family))
        .route("/api/my-family/invite", post(routes::families::invite_family_member))
        .route("/api/my-family/invites", get(routes::families::list_family_invites))
        .route("/api/my-invites", get(routes::families::list_my_invites))
        .route("/api/my-invites/{id}/accept", post(routes::families::accept_family_invite))
        .route("/api/my-invites/{id}/decline", post(routes::families::decline_family_invite))
        // Session & RSVP routes (authenticated)
        .route("/api/sessions", get(routes::sessions::list_sessions))
        .route("/api/sessions", post(routes::sessions::create_session))
        .route(
            "/api/session-types",
            get(routes::sessions::list_active_session_types),
        )
        .route("/api/sessions/{id}", get(routes::sessions::get_session))
        .route(
            "/api/sessions/{id}/claim",
            post(routes::sessions::claim_session),
        )
        .route(
            "/api/sessions/{id}/complete",
            post(routes::sessions::complete_session),
        )
        .route("/api/my-rsvps", get(routes::sessions::my_rsvps))
        .route("/api/my-calendar-url", get(routes::calendar::get_calendar_url))
        .route(
            "/api/sessions/{id}/unclaim",
            post(routes::sessions::unclaim_session),
        )
        .route(
            "/api/sessions/{id}/host",
            put(routes::sessions::update_host_session),
        )
        .route(
            "/api/sessions/{id}/rsvps",
            get(routes::sessions::list_session_rsvps),
        )
        .route(
            "/api/sessions/{id}/health",
            get(routes::sessions::get_session_health_summary),
        )
        .route("/api/rsvps", post(routes::sessions::create_rsvp))
        .route(
            "/api/rsvps/{id}",
            put(routes::sessions::update_rsvp_status).delete(routes::sessions::delete_rsvp),
        )
        // Admin routes
        .route("/api/admin/invites", post(routes::admin::create_invite))
        .route("/api/admin/invites", get(routes::admin::list_invites))
        .route("/api/admin/invites/{id}", delete(routes::admin::delete_invite))
        .route("/api/admin/users", get(routes::admin::list_users))
        .route("/api/admin/users/{id}", put(routes::admin::update_user).delete(routes::admin::delete_user))
        .route(
            "/api/admin/session-types",
            get(routes::admin::list_session_types),
        )
        .route(
            "/api/admin/session-types",
            post(routes::admin::create_session_type),
        )
        .route(
            "/api/admin/session-types/{id}",
            put(routes::admin::update_session_type),
        )
        .route(
            "/api/admin/session-defaults",
            get(routes::admin::get_session_defaults),
        )
        .route(
            "/api/admin/session-defaults",
            put(routes::admin::update_session_defaults),
        )
        .route("/api/admin/students", post(routes::admin::create_student))
        .route(
            "/api/admin/students/{id}",
            put(routes::admin::update_student),
        )
        .route(
            "/api/admin/students/{id}",
            delete(routes::admin::delete_student),
        )
        .route(
            "/api/admin/student-parents",
            get(routes::admin::list_student_parents).post(routes::admin::link_parent),
        )
        .route(
            "/api/admin/student-parents/{student_id}/{user_id}",
            delete(routes::admin::unlink_parent),
        )
        .route("/api/admin/events", post(routes::admin::create_event))
        .route(
            "/api/admin/events/{id}",
            put(routes::admin::update_event),
        )
        .route(
            "/api/admin/events/{id}",
            delete(routes::admin::delete_event),
        )
        .route(
            "/api/admin/resources",
            post(routes::admin::create_resource),
        )
        .route(
            "/api/admin/resources/{id}",
            put(routes::admin::update_resource),
        )
        .route(
            "/api/admin/resources/{id}",
            delete(routes::admin::delete_resource),
        )
        .route(
            "/api/admin/sessions",
            post(routes::admin::create_session),
        )
        .route(
            "/api/admin/sessions/{id}",
            put(routes::admin::update_session),
        )
        .route(
            "/api/admin/sessions/{id}",
            delete(routes::admin::delete_session),
        )
        .route("/api/admin/pages", get(routes::admin::list_site_pages))
        .route(
            "/api/admin/pages/{slug}",
            put(routes::admin::update_site_page),
        )
        .route("/api/admin/email-parents", post(routes::admin::email_parents))
        .route("/api/admin/send-reminders", post(routes::admin::trigger_reminders))
        .route(
            "/api/admin/users/{id}/reset-password",
            post(routes::admin::admin_reset_user_password),
        )
        .route("/api/admin/announcements", post(routes::admin::create_announcement))
        .route("/api/admin/announcements", get(routes::admin::list_announcements))
        .route("/api/admin/announcements/{id}", put(routes::admin::update_announcement))
        .route("/api/admin/announcements/{id}", delete(routes::admin::delete_announcement))
        .route("/api/admin/recent-activity", get(routes::admin::recent_activity))
        .route("/api/admin/features", put(routes::admin::update_feature_flags))
        .route("/api/admin/files", get(routes::admin::list_all_files))
        .route("/api/admin/files/{id}", delete(routes::admin::admin_delete_file))
        .route("/api/admin/class-groups", get(routes::admin::list_class_groups).post(routes::admin::create_class_group))
        .route("/api/admin/class-groups/{id}", put(routes::admin::update_class_group).delete(routes::admin::delete_class_group))
        .route("/api/admin/class-group-members", get(routes::admin::list_class_group_members).post(routes::admin::add_group_member))
        .route("/api/admin/class-group-members/{group_id}/{student_id}", delete(routes::admin::remove_group_member));

    // In production, serve the React frontend for any non-API route.
    // This enables client-side routing (React Router) to work correctly.
    let app = if is_production {
        let index_path = format!("{}/index.html", static_dir);
        let spa_fallback = ServeFile::new(&index_path);
        let serve_static = ServeDir::new(&static_dir).not_found_service(spa_fallback);

        api.fallback_service(serve_static)
    } else {
        // In dev, Vite handles the frontend — just serve API
        api
    };

    let app = app
        .layer(middleware::from_fn_with_state(
            state.clone(),
            request_logger,
        ))
        .layer(session_layer)
        .layer(cors);

    // Rate limiter: 10 requests per 60 seconds on auth endpoints
    let rate_limiter = rate_limit::RateLimiter::new(10, 60);
    let app = app
        .layer(middleware::from_fn_with_state(rate_limiter, rate_limit::rate_limit_auth))
        .with_state(state);

    tracing::info!(port = port, mode = if is_production { "production" } else { "development" }, "server starting");
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .expect("Failed to bind");

    axum::serve(listener, app).await.expect("Server failed");
}

async fn request_logger(
    State(state): State<AppState>,
    req: Request,
    next: Next,
) -> Response {
    let method = req.method().clone();
    let uri = req.uri().clone();
    let path = uri.path().to_string();

    // Only log API requests, not static file requests
    if path.starts_with("/api/") {
        tracing::info!(method = %method, path = %path, "request");

        // Check if we need to send reminders (on first request of the day)
        reminders::check_reminders_if_needed(state.db.clone(), state.email_config.clone());
    }

    let start = std::time::Instant::now();
    let response = next.run(req).await;
    let elapsed = start.elapsed();

    if path.starts_with("/api/") {
        tracing::info!(method = %method, path = %path, status = %response.status(), duration_ms = elapsed.as_millis() as u64, "response");
    }

    response
}

async fn health_check(State(state): State<AppState>) -> axum::response::Response {
    let ok = match state.db.get() {
        Ok(conn) => conn.query_row("SELECT 1", [], |_| Ok(())).is_ok(),
        Err(_) => false,
    };

    if ok {
        (StatusCode::OK, axum::Json(serde_json::json!({"status": "ok"}))).into_response()
    } else {
        (StatusCode::SERVICE_UNAVAILABLE, axum::Json(serde_json::json!({"status": "error", "message": "database unavailable"}))).into_response()
    }
}

