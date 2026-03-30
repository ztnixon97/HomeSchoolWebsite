use crate::db::DbPool;
use crate::storage::StorageBackend;
use std::sync::Arc;

fn build_r2_client() -> Result<(aws_sdk_s3::Client, String), String> {
    let account_id = std::env::var("R2_ACCOUNT_ID").map_err(|_| "R2_ACCOUNT_ID not set".to_string())?;
    let access_key = std::env::var("R2_ACCESS_KEY_ID").map_err(|_| "R2_ACCESS_KEY_ID not set".to_string())?;
    let secret_key = std::env::var("R2_SECRET_ACCESS_KEY").map_err(|_| "R2_SECRET_ACCESS_KEY not set".to_string())?;
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

    Ok((aws_sdk_s3::Client::from_conf(config), bucket))
}

/// List available backups in R2 with size and date info
pub async fn list_backups() -> Result<Vec<serde_json::Value>, String> {
    let (client, bucket) = build_r2_client()?;

    let list = client.list_objects_v2().bucket(&bucket).prefix("backups/preschool-").send().await
        .map_err(|e| format!("Failed to list backups: {}", e))?;

    let mut backups: Vec<serde_json::Value> = list.contents().iter()
        .filter_map(|obj| {
            let key = obj.key()?;
            if !key.ends_with(".db") { return None; }
            let size = obj.size().unwrap_or(0);
            let modified = obj.last_modified().map(|t| t.to_string());
            Some(serde_json::json!({
                "key": key,
                "size_bytes": size,
                "size_mb": format!("{:.1}", size as f64 / (1024.0 * 1024.0)),
                "has_data": size > 1024 * 1024,
                "date": modified,
            }))
        })
        .collect();

    backups.sort_by(|a, b| b["key"].as_str().cmp(&a["key"].as_str()));
    Ok(backups)
}

/// Create a backup right now and upload to R2
pub async fn create_backup_now(pool: &DbPool) -> Result<String, String> {
    run_backup(pool).await
}

/// Restore database from a specific R2 backup key
pub async fn restore_from_backup(backup_key: &str) -> Result<(), String> {
    let db_path = std::env::var("DATABASE_PATH").unwrap_or_else(|_| "data/preschool.db".into());
    let (client, bucket) = build_r2_client()?;

    tracing::warn!("Restoring database from backup: {}", backup_key);

    let resp = client.get_object().bucket(&bucket).key(backup_key).send().await
        .map_err(|e| format!("Failed to download backup: {}", e))?;

    let bytes = resp.body.collect().await
        .map_err(|e| format!("Failed to read backup: {}", e))?;
    let data = bytes.into_bytes();

    if data.len() < 1024 * 1024 {
        return Err(format!("Backup {} is only {} bytes — likely empty, refusing to restore", backup_key, data.len()));
    }

    // Write to a temp file first, then rename (atomic-ish)
    let temp_path = format!("{}.restoring", db_path);
    std::fs::write(&temp_path, &data).map_err(|e| format!("Failed to write temp file: {}", e))?;
    std::fs::rename(&temp_path, &db_path).map_err(|e| format!("Failed to rename restored DB: {}", e))?;

    tracing::info!("Database restored from {} ({} bytes). App restart required.", backup_key, data.len());
    Ok(())
}

/// Auto-restore: if the DB file is missing or empty, download the latest backup from R2.
/// Call this BEFORE init_pool().
pub async fn auto_restore_if_needed(db_path: &str) {
    // Check if DB file exists and has real data (not just empty migrations)
    let needs_restore = match std::fs::metadata(db_path) {
        Ok(meta) if meta.len() == 0 => true,          // exists but zero bytes
        Ok(meta) if meta.len() < 1024 * 1024 => {     // exists but < 1MB = only migrations, no real data
            // Double check by looking for users
            let has_users = rusqlite::Connection::open(db_path)
                .and_then(|conn| conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get::<_, i64>(0)))
                .unwrap_or(0);
            if has_users <= 1 {
                tracing::warn!("Database at {} has only {} user(s) and is < 1MB — likely empty, will attempt restore", db_path, has_users);
                true
            } else {
                false
            }
        }
        Ok(_) => false,                                // exists with data > 1MB
        Err(_) => true,                                // doesn't exist
    };

    if !needs_restore {
        tracing::info!("Database exists at {} with real data, skipping auto-restore", db_path);
        return;
    }

    // Check if R2 is configured
    let account_id = match std::env::var("R2_ACCOUNT_ID") {
        Ok(v) => v,
        Err(_) => {
            tracing::warn!("Database missing and R2 not configured — starting fresh");
            return;
        }
    };

    tracing::warn!("Database missing or empty at {} — attempting auto-restore from R2", db_path);

    let access_key = std::env::var("R2_ACCESS_KEY_ID").unwrap_or_default();
    let secret_key = std::env::var("R2_SECRET_ACCESS_KEY").unwrap_or_default();
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

    // List backups and find the most recent non-empty one (>1MB = has real data)
    match client.list_objects_v2().bucket(&bucket).prefix("backups/preschool-").send().await {
        Ok(list) => {
            // Filter to .db files > 1MB (empty DBs are ~100KB after migrations)
            let min_size: i64 = 1024 * 1024; // 1MB
            let mut candidates: Vec<(&str, i64)> = list.contents().iter()
                .filter_map(|obj| {
                    let key = obj.key()?;
                    let size = obj.size().unwrap_or(0);
                    if key.ends_with(".db") && size > min_size { Some((key, size)) } else { None }
                })
                .collect();
            candidates.sort_by_key(|(k, _)| k.to_string());

            if let Some((latest_key, size)) = candidates.last() {
                tracing::info!("Found backup: {} ({} bytes)", latest_key, size);

                match client.get_object().bucket(&bucket).key(*latest_key).send().await {
                    Ok(resp) => {
                        match resp.body.collect().await {
                            Ok(bytes) => {
                                let data = bytes.into_bytes();
                                // Ensure parent directory exists
                                if let Some(parent) = std::path::Path::new(db_path).parent() {
                                    let _ = std::fs::create_dir_all(parent);
                                }
                                match std::fs::write(db_path, &data) {
                                    Ok(_) => tracing::info!("Database restored from {} ({} bytes)", latest_key, data.len()),
                                    Err(e) => tracing::error!("Failed to write restored DB: {}", e),
                                }
                            }
                            Err(e) => tracing::error!("Failed to read backup body: {}", e),
                        }
                    }
                    Err(e) => tracing::error!("Failed to download backup {}: {}", latest_key, e),
                }
            } else {
                tracing::warn!("No backups found in R2 — starting with fresh database");
            }
        }
        Err(e) => tracing::error!("Failed to list R2 backups: {}", e),
    }
}

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

    // Skip uploading empty/tiny databases (< 1MB = no real data, just migrations)
    if data.len() < 1024 * 1024 {
        let _ = tokio::fs::remove_file(&backup_path).await;
        return Err(format!("Skipping backup — database is only {} bytes (no real data)", data.len()));
    }

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

/// Spawn a background task that cleans up expired sessions from the sessions_store table.
/// Runs hourly.
pub fn start_session_cleanup_task(pool: DbPool) {
    tracing::info!("Starting session cleanup task (hourly)");

    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(120)).await;

        loop {
            if let Ok(conn) = pool.get() {
                let now = time::OffsetDateTime::now_utc()
                    .format(&time::format_description::well_known::Rfc3339)
                    .unwrap_or_default();
                match conn.execute("DELETE FROM sessions_store WHERE expiry_date < ?1", rusqlite::params![now]) {
                    Ok(count) if count > 0 => tracing::info!(deleted = count, "Cleaned up expired sessions"),
                    Err(e) => tracing::error!(error = %e, "Session cleanup failed"),
                    _ => {}
                }
            }

            tokio::time::sleep(std::time::Duration::from_secs(60 * 60)).await;
        }
    });
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

            // Check total storage usage and warn if approaching R2 free tier limit
            check_storage_usage(&pool);

            // Run daily
            tokio::time::sleep(std::time::Duration::from_secs(24 * 60 * 60)).await;
        }
    });
}

fn check_storage_usage(pool: &DbPool) {
    if let Ok(conn) = pool.get() {
        let total_bytes: i64 = conn
            .query_row("SELECT COALESCE(SUM(size_bytes), 0) FROM files", [], |row| row.get(0))
            .unwrap_or(0);
        let total_mb = total_bytes as f64 / (1024.0 * 1024.0);
        let total_gb = total_mb / 1024.0;
        let file_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM files", [], |row| row.get(0))
            .unwrap_or(0);

        tracing::info!(total_mb = format!("{:.1}", total_mb), files = file_count, "Storage usage check");

        if total_gb > 5.0 {
            tracing::warn!(
                total_gb = format!("{:.2}", total_gb),
                files = file_count,
                "Storage usage exceeds 5GB! Approaching R2 free tier limit (10GB). Review and clean up files."
            );
        } else if total_gb > 3.0 {
            tracing::warn!(
                total_gb = format!("{:.2}", total_gb),
                files = file_count,
                "Storage usage above 3GB. Monitor growth."
            );
        }
    }
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
    for (_file_id, storage_path) in &expired {
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
