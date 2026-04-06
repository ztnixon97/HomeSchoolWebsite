use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::params;

pub type DbPool = Pool<SqliteConnectionManager>;

#[derive(Clone, Debug)]
pub struct PushConfig {
    pub public_key: String,
    pub private_key: String,
    pub contact: String,
}

impl PushConfig {
    /// Load from env vars. Returns None if VAPID keys not configured (dev mode).
    pub fn from_env() -> Option<Self> {
        let public_key = std::env::var("VAPID_PUBLIC_KEY").ok()?;
        let private_key = std::env::var("VAPID_PRIVATE_KEY").ok()?;
        if public_key.is_empty() || private_key.is_empty() {
            return None;
        }
        let contact = std::env::var("VAPID_CONTACT")
            .unwrap_or_else(|_| "mailto:westernloudouncoop@gmail.com".to_string());
        Some(PushConfig {
            public_key,
            private_key,
            contact,
        })
    }
}

/// Send a push notification to a specific user (all their subscriptions).
/// Checks notification preferences for the given notification_type.
pub async fn send_push_to_user(
    db: DbPool,
    config: PushConfig,
    user_id: i64,
    notification_type: &str,
    title: &str,
    body: &str,
    url: &str,
) {
    let ntype = notification_type.to_string();
    let title = title.to_string();
    let body = body.to_string();
    let url = url.to_string();

    let subs: Vec<(i64, String, String, String, String)> = {
        let conn = match db.get() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[push] failed to get db connection: {}", e);
                return;
            }
        };

        let mut stmt = match conn.prepare(
            "SELECT id, endpoint, p256dh, auth, preferences FROM push_subscriptions WHERE user_id = ?1",
        ) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[push] failed to prepare query: {}", e);
                return;
            }
        };

        stmt.query_map(params![user_id], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        })
        .map(|rows| rows.filter_map(|r| r.ok()).collect())
        .unwrap_or_default()
    };

    #[cfg(feature = "push-notifications")]
    {
        use web_push::{
            ContentEncoding, SubscriptionInfo, VapidSignatureBuilder, WebPushClient,
            WebPushMessageBuilder,
        };

        let client = match WebPushClient::new() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[push] failed to create client: {}", e);
                return;
            }
        };

        for (sub_id, endpoint, p256dh, auth, prefs_json) in &subs {
            // Check preferences
            if let Ok(prefs) = serde_json::from_str::<serde_json::Value>(prefs_json) {
                if let Some(false) = prefs.get(&ntype).and_then(|v| v.as_bool()) {
                    continue;
                }
            }

            let sub_info = SubscriptionInfo::new(endpoint, p256dh, auth);

            let sig = match VapidSignatureBuilder::from_base64(
                &config.private_key,
                web_push::URL_SAFE_NO_PAD,
                &sub_info,
            ) {
                Ok(mut builder) => {
                    builder.add_claim("sub", &config.contact);
                    match builder.build() {
                        Ok(sig) => sig,
                        Err(e) => {
                            eprintln!("[push] VAPID signature error: {}", e);
                            continue;
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[push] VAPID builder error: {}", e);
                    continue;
                }
            };

            let payload = serde_json::json!({
                "title": title,
                "body": body,
                "url": url,
            });

            let mut builder = WebPushMessageBuilder::new(&sub_info);
            builder.set_vapid_signature(sig);
            let content = payload.to_string().into_bytes();
            builder.set_payload(ContentEncoding::Aes128Gcm, &content);

            match builder.build() {
                Ok(msg) => {
                    if let Err(e) = client.send(msg).await {
                        let err_str = format!("{}", e);
                        eprintln!("[push] send error: {}", err_str);
                        if err_str.contains("410") || err_str.contains("404") {
                            if let Ok(conn) = db.get() {
                                let _ = conn.execute(
                                    "DELETE FROM push_subscriptions WHERE id = ?1",
                                    params![sub_id],
                                );
                            }
                        }
                    }
                }
                Err(e) => eprintln!("[push] build error: {}", e),
            }
        }
    }

    #[cfg(not(feature = "push-notifications"))]
    {
        let _ = (&subs, &ntype, &title, &body, &url);
        eprintln!("[push] push-notifications feature not enabled, skipping push to user {}", user_id);
    }
}

/// Send a push notification to ALL subscribed users (e.g., announcements).
pub async fn send_push_to_all(
    db: DbPool,
    config: PushConfig,
    notification_type: &str,
    title: &str,
    body: &str,
    url: &str,
) {
    let user_ids: Vec<i64> = {
        let conn = match db.get() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[push] failed to get db connection: {}", e);
                return;
            }
        };
        conn.prepare("SELECT DISTINCT user_id FROM push_subscriptions")
            .and_then(|mut s| {
                s.query_map([], |row| row.get(0))
                    .map(|rows| rows.filter_map(|r| r.ok()).collect())
            })
            .unwrap_or_default()
    };

    for uid in user_ids {
        send_push_to_user(db.clone(), config.clone(), uid, notification_type, title, body, url).await;
    }
}
