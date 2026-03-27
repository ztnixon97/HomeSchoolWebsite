use crate::db::DbPool;
use crate::storage::StorageBackend;
use std::sync::Arc;

/// Spawn a background task that backs up the SQLite database to R2 every 6 hours.
/// Only runs if R2 is configured (R2_ACCOUNT_ID env var set).
pub fn start_backup_task(pool: DbPool) {
    if std::env::var("R2_ACCOUNT_ID").is_err() {
        tracing::info!("R2 not configured — automatic backups disabled");
        return;
    }

    tracing::info!("Starting automatic database backup task (every 6 hours)");

    tokio::spawn(async move {
        // Initial backup after 1 minute
        tokio::time::sleep(std::time::Duration::from_secs(60)).await;

        loop {
            match run_backup(&pool).await {
                Ok(key) => tracing::info!(key = %key, "Database backup completed"),
                Err(e) => tracing::error!(error = %e, "Database backup failed"),
            }

            // Wait 6 hours
            tokio::time::sleep(std::time::Duration::from_secs(6 * 60 * 60)).await;
        }
    });
}

async fn run_backup(pool: &DbPool) -> Result<String, String> {
    let db_path = std::env::var("DATABASE_PATH").unwrap_or_else(|_| "data/preschool.db".into());
    let backup_path = format!("{}.backup", db_path);

    // Use VACUUM INTO for a consistent backup (won't block other operations)
    {
        let conn = pool.get().map_err(|e| e.to_string())?;
        conn.execute(&format!("VACUUM INTO '{}'", backup_path), [])
            .map_err(|e| format!("VACUUM INTO failed: {}", e))?;
    }

    // Read the backup file
    let data = tokio::fs::read(&backup_path)
        .await
        .map_err(|e| format!("Failed to read backup file: {}", e))?;

    // Upload to R2
    let account_id = std::env::var("R2_ACCOUNT_ID").map_err(|e| e.to_string())?;
    let access_key = std::env::var("R2_ACCESS_KEY_ID").map_err(|e| e.to_string())?;
    let secret_key = std::env::var("R2_SECRET_ACCESS_KEY").map_err(|e| e.to_string())?;
    let bucket = std::env::var("R2_BUCKET").unwrap_or_else(|_| "wlpc-uploads".into());

    let endpoint = format!("https://{}.r2.cloudflarestorage.com", account_id);
    let creds = aws_sdk_s3::config::Credentials::new(access_key, secret_key, None, None, "r2");
    let config = aws_sdk_s3::Config::builder()
        .region(aws_sdk_s3::config::Region::new("auto"))
        .endpoint_url(endpoint)
        .credentials_provider(creds)
        .force_path_style(true)
        .behavior_version_latest()
        .build();
    let client = aws_sdk_s3::Client::from_conf(config);

    let now = chrono::Utc::now();
    let key = format!("backups/preschool-{}.db", now.format("%Y-%m-%d-%H%M"));

    client
        .put_object()
        .bucket(&bucket)
        .key(&key)
        .body(aws_sdk_s3::primitives::ByteStream::from(data))
        .content_type("application/x-sqlite3")
        .send()
        .await
        .map_err(|e| format!("R2 upload failed: {}", e))?;

    // Clean up local backup file
    let _ = tokio::fs::remove_file(&backup_path).await;

    // Delete backups older than 7 days
    let cutoff = (now - chrono::Duration::days(7)).format("%Y-%m-%d").to_string();
    if let Ok(list) = client.list_objects_v2().bucket(&bucket).prefix("backups/").send().await {
        for obj in list.contents() {
            if let Some(k) = obj.key() {
                if k.starts_with("backups/preschool-") && k < format!("backups/preschool-{}", cutoff).as_str() {
                    let _ = client.delete_object().bucket(&bucket).key(k).send().await;
                    tracing::info!(key = k, "Deleted old backup");
                }
            }
        }
    }

    Ok(key)
}

/// Spawn a background task that deletes session files older than 30 days.
/// Runs daily.
pub fn start_photo_cleanup_task(pool: DbPool, storage: Arc<dyn StorageBackend>) {
    tracing::info!("Starting session photo cleanup task (daily, 30-day retention)");

    tokio::spawn(async move {
        // First run after 5 minutes
        tokio::time::sleep(std::time::Duration::from_secs(300)).await;

        loop {
            match cleanup_old_session_files(&pool, &storage).await {
                Ok(count) => {
                    if count > 0 {
                        tracing::info!(deleted = count, "Cleaned up expired session files");
                    }
                }
                Err(e) => tracing::error!(error = %e, "Session file cleanup failed"),
            }

            // Run daily
            tokio::time::sleep(std::time::Duration::from_secs(24 * 60 * 60)).await;
        }
    });
}

async fn cleanup_old_session_files(pool: &DbPool, storage: &Arc<dyn StorageBackend>) -> Result<usize, String> {
    // Gather expired files (drop connection before any .await)
    let expired: Vec<(i64, String)> = {
        let conn = pool.get().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT f.id, f.storage_path
             FROM files f
             JOIN class_sessions cs ON f.linked_type = 'session' AND f.linked_id = cs.id
             WHERE cs.session_date < date('now', '-30 days')"
        ).map_err(|e| e.to_string())?;

        let results: Vec<(i64, String)> = stmt.query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
        drop(stmt);
        results
    };
    // conn dropped here

    let count = expired.len();
    for (file_id, storage_path) in &expired {
        let _ = storage.delete(storage_path).await;
    }

    // Delete DB records in a separate connection scope
    if !expired.is_empty() {
        let conn = pool.get().map_err(|e| e.to_string())?;
        for (file_id, _) in &expired {
            let _ = conn.execute("DELETE FROM files WHERE id = ?1", rusqlite::params![file_id]);
        }
    }

    Ok(count)
}
