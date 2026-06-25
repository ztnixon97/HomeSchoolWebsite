use axum::{
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct RateLimiter {
    /// Map of IP -> (count, window_start)
    state: Arc<Mutex<HashMap<String, (u32, Instant)>>>,
    max_requests: u32,
    window_secs: u64,
}

impl RateLimiter {
    pub fn new(max_requests: u32, window_secs: u64) -> Self {
        Self {
            state: Arc::new(Mutex::new(HashMap::new())),
            max_requests,
            window_secs,
        }
    }
}

pub async fn rate_limit_auth(
    axum::extract::State(limiter): axum::extract::State<RateLimiter>,
    req: Request,
    next: Next,
) -> Response {
    let path = req.uri().path().to_string();

    // Only rate-limit auth endpoints
    if !path.starts_with("/api/auth/login")
        && !path.starts_with("/api/auth/register")
        && !path.starts_with("/api/auth/forgot-password")
    {
        return next.run(req).await;
    }

    // Determine the client IP from a trustworthy source. Fly.io sets `Fly-Client-IP`
    // to the real client address; otherwise use the RIGHTMOST X-Forwarded-For entry
    // (appended by our proxy). The leftmost XFF value is client-controlled and spoofable,
    // so it must not be used as the rate-limit key.
    let ip = req
        .headers()
        .get("fly-client-ip")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .or_else(|| {
            req.headers()
                .get("x-forwarded-for")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.split(',').next_back())
                .map(|s| s.trim().to_string())
        })
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "unknown".to_string());

    let mut state = limiter.state.lock().await;
    let now = Instant::now();

    let entry = state.entry(ip).or_insert((0, now));

    // Reset window if expired
    if now.duration_since(entry.1).as_secs() > limiter.window_secs {
        entry.0 = 0;
        entry.1 = now;
    }

    entry.0 += 1;

    if entry.0 > limiter.max_requests {
        tracing::warn!(attempts = entry.0, "rate limit exceeded on auth endpoint");
        return (
            StatusCode::TOO_MANY_REQUESTS,
            "Too many requests. Please try again later.",
        )
            .into_response();
    }

    drop(state);
    next.run(req).await
}
