use axum::{
    extract::{Request, State},
    middleware::{self, Next},
    response::Response,
    routing::{delete, get, post, put},
    Router,
};
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};
use tower_sessions::{cookie::SameSite, Expiry, SessionManagerLayer};
use tower_sessions_memory_store::MemoryStore;

mod auth;
mod db;
mod email;
mod errors;
mod models;
mod reminders;
mod routes;
mod sanitize;
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

    // Initialize storage
    let storage: Arc<dyn StorageBackend> =
        Arc::new(LocalStorage::new(&uploads_dir, "/uploads"));

    // Initialize email config
    let email_config = EmailConfig::from_env();

    let state = AppState {
        db: pool.clone(),
        storage,
        uploads_dir: uploads_dir.to_string(),
        email_config,
    };

    // Session store (in-memory — sessions lost on restart)
    let session_store = MemoryStore::default();

    let session_layer = SessionManagerLayer::new(session_store)
        .with_secure(is_production) // HTTPS in production
        .with_same_site(SameSite::Lax)
        .with_expiry(Expiry::OnInactivity(
            tower_sessions::cookie::time::Duration::days(7),
        ));

    // CORS — permissive in dev, restrictive in production
    let cors = if is_production {
        // In production, frontend is served from same origin — no CORS needed.
        // But we still set up a permissive same-origin policy just in case.
        CorsLayer::new()
            .allow_origin(tower_http::cors::Any)
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
            .allow_credentials(false)
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
        // Public calendar feed (token-based auth, no session needed)
        .route("/api/calendar/{token}", get(routes::member::calendar_ics_by_token))
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
            get(routes::member::list_lesson_plans),
        )
        .route(
            "/api/lesson-plans/{id}",
            get(routes::member::get_lesson_plan),
        )
        .route(
            "/api/my-children",
            get(routes::member::my_children).post(routes::member::create_my_child),
        )
        .route(
            "/api/my-children/{id}",
            put(routes::member::update_my_child).delete(routes::member::delete_my_child),
        )
        .route("/api/users", get(routes::member::list_users))
        .route("/api/members", get(routes::member::list_members))
        .route("/api/files/{id}", get(routes::member::get_file_info).delete(routes::member::delete_file))
        .route(
            "/api/files/{id}/download",
            get(routes::member::download_file),
        )
        .route(
            "/api/files/{linked_type}/{linked_id}",
            get(routes::member::list_files_for_entity),
        )
        // Teacher+ routes
        .route("/api/posts", post(routes::member::create_post))
        .route("/api/posts/{id}", put(routes::member::update_post))
        .route("/api/posts/drafts", get(routes::member::list_draft_posts))
        .route(
            "/api/posts/{id}/internal",
            get(routes::member::get_post_internal),
        )
        .route(
            "/api/posts/{id}/comments",
            get(routes::member::list_post_comments),
        )
        .route(
            "/api/posts/{id}/comments",
            post(routes::member::create_post_comment),
        )
        .route(
            "/api/comments/{id}",
            put(routes::member::update_post_comment),
        )
        .route(
            "/api/comments/{id}",
            delete(routes::member::delete_post_comment),
        )
        .route(
            "/api/lesson-plans",
            post(routes::member::create_lesson_plan),
        )
        .route(
            "/api/lesson-plans/{id}",
            put(routes::member::update_lesson_plan).delete(routes::member::delete_lesson_plan),
        )
        .route(
            "/api/lesson-plans/{id}/collaborators",
            get(routes::member::list_lesson_plan_collaborators),
        )
        .route(
            "/api/lesson-plans/{id}/collaborators",
            post(routes::member::add_lesson_plan_collaborator),
        )
        .route(
            "/api/lesson-plans/{id}/collaborators/{user_id}",
            delete(routes::member::remove_lesson_plan_collaborator),
        )
        .route("/api/uploads", post(routes::member::upload_file))
        .route("/api/students", get(routes::member::list_students))
        .route(
            "/api/students/{id}/milestones",
            get(routes::member::get_student_milestones),
        )
        .route("/api/milestones", post(routes::member::create_milestone))
        .route(
            "/api/milestones/{id}",
            put(routes::member::update_milestone),
        )
        .route(
            "/api/milestones/{id}",
            delete(routes::member::delete_milestone),
        )
        .route("/api/attendance", post(routes::member::record_attendance))
        .route("/api/sessions/{id}/attendance", get(routes::member::get_session_attendance))
        .route("/api/session-attendance", post(routes::member::save_session_attendance))
        .route("/api/sessions/{id}/supplies", get(routes::member::list_session_supplies).post(routes::member::add_session_supply))
        .route("/api/supplies/{id}/claim", post(routes::member::claim_supply))
        .route("/api/supplies/{id}/unclaim", post(routes::member::unclaim_supply))
        .route("/api/supplies/{id}", delete(routes::member::delete_supply))
        // Family routes (authenticated)
        .route("/api/my-family", post(routes::member::create_family).get(routes::member::get_my_family).put(routes::member::update_my_family).delete(routes::member::leave_family))
        .route("/api/my-family/invite", post(routes::member::invite_family_member))
        .route("/api/my-family/invites", get(routes::member::list_family_invites))
        .route("/api/my-invites", get(routes::member::list_my_invites))
        .route("/api/my-invites/{id}/accept", post(routes::member::accept_family_invite))
        .route("/api/my-invites/{id}/decline", post(routes::member::decline_family_invite))
        // Session & RSVP routes (authenticated)
        .route("/api/sessions", get(routes::member::list_sessions))
        .route("/api/sessions", post(routes::member::create_session))
        .route(
            "/api/session-types",
            get(routes::member::list_active_session_types),
        )
        .route("/api/sessions/{id}", get(routes::member::get_session))
        .route(
            "/api/sessions/{id}/claim",
            post(routes::member::claim_session),
        )
        .route(
            "/api/sessions/{id}/complete",
            post(routes::member::complete_session),
        )
        .route("/api/my-rsvps", get(routes::member::my_rsvps))
        .route("/api/my-calendar-url", get(routes::member::get_calendar_url))
        .route(
            "/api/sessions/{id}/unclaim",
            post(routes::member::unclaim_session),
        )
        .route(
            "/api/sessions/{id}/host",
            put(routes::member::update_host_session),
        )
        .route(
            "/api/sessions/{id}/rsvps",
            get(routes::member::list_session_rsvps),
        )
        .route(
            "/api/sessions/{id}/health",
            get(routes::member::get_session_health_summary),
        )
        .route("/api/rsvps", post(routes::member::create_rsvp))
        .route(
            "/api/rsvps/{id}",
            put(routes::member::update_rsvp_status).delete(routes::member::delete_rsvp),
        )
        // Admin routes
        .route("/api/admin/invites", post(routes::admin::create_invite))
        .route("/api/admin/invites", get(routes::admin::list_invites))
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
            post(routes::admin::link_parent),
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
        .route("/api/admin/recent-activity", get(routes::admin::recent_activity));

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
        .layer(cors)
        .with_state(state);

    println!(
        "Server starting on port {} ({})",
        port,
        if is_production { "production" } else { "development" }
    );
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
        eprintln!("[req] {} {}", method, path);

        // Check if we need to send reminders (on first request of the day)
        reminders::check_reminders_if_needed(state.db.clone(), state.email_config.clone());
    }

    let start = std::time::Instant::now();
    let response = next.run(req).await;
    let elapsed = start.elapsed();

    if path.starts_with("/api/") {
        eprintln!("[req] {} {} -> {} ({:.1?})", method, path, response.status(), elapsed);
    }

    response
}
