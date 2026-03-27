use async_trait::async_trait;
use std::path::{Path, PathBuf};
use aws_sdk_s3::Client as S3Client;

#[async_trait]
pub trait StorageBackend: Send + Sync {
    async fn save(&self, filename: &str, data: &[u8]) -> Result<String, StorageError>;
    async fn delete(&self, storage_path: &str) -> Result<(), StorageError>;
    /// Get the file bytes and content type (for local storage).
    async fn get_bytes(&self, storage_path: &str) -> Result<(Vec<u8>, String), StorageError>;
    /// Get a URL to serve the file. For local storage, returns a relative path.
    /// For R2, returns a presigned URL (time-limited, direct from CDN).
    async fn serve_url(&self, storage_path: &str) -> Result<String, StorageError>;
    fn public_url(&self, storage_path: &str) -> String;
    /// Whether this backend supports direct redirect (presigned URL) for downloads
    fn supports_redirect(&self) -> bool { false }
}

#[derive(Debug)]
pub struct StorageError(pub String);

impl std::fmt::Display for StorageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Storage error: {}", self.0)
    }
}

pub struct LocalStorage {
    base_dir: PathBuf,
    url_prefix: String,
}

impl LocalStorage {
    pub fn new(base_dir: impl AsRef<Path>, url_prefix: &str) -> Self {
        let base_dir = base_dir.as_ref().to_path_buf();
        std::fs::create_dir_all(&base_dir).expect("Failed to create uploads directory");
        Self {
            base_dir,
            url_prefix: url_prefix.to_string(),
        }
    }
}

#[async_trait]
impl StorageBackend for LocalStorage {
    async fn save(&self, filename: &str, data: &[u8]) -> Result<String, StorageError> {
        // Generate a unique filename to avoid collisions
        let ext = Path::new(filename)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("bin");
        let unique_name = format!("{}_{}.{}", chrono::Utc::now().format("%Y%m%d%H%M%S"), uuid::Uuid::new_v4(), ext);

        let file_path = self.base_dir.join(&unique_name);
        tokio::fs::write(&file_path, data)
            .await
            .map_err(|e| StorageError(e.to_string()))?;

        Ok(unique_name)
    }

    async fn delete(&self, storage_path: &str) -> Result<(), StorageError> {
        let file_path = self.base_dir.join(storage_path);
        if file_path.exists() {
            tokio::fs::remove_file(&file_path)
                .await
                .map_err(|e| StorageError(e.to_string()))?;
        }
        Ok(())
    }

    async fn get_bytes(&self, storage_path: &str) -> Result<(Vec<u8>, String), StorageError> {
        let file_path = self.base_dir.join(storage_path);
        let data = tokio::fs::read(&file_path)
            .await
            .map_err(|e| StorageError(e.to_string()))?;
        let ext = Path::new(storage_path).extension().and_then(|e| e.to_str()).unwrap_or("");
        let ct = match ext {
            "jpg" | "jpeg" => "image/jpeg",
            "png" => "image/png",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "pdf" => "application/pdf",
            _ => "application/octet-stream",
        };
        Ok((data, ct.to_string()))
    }

    async fn serve_url(&self, _storage_path: &str) -> Result<String, StorageError> {
        Err(StorageError("Local storage does not support redirect URLs".into()))
    }

    fn public_url(&self, storage_path: &str) -> String {
        format!("{}/{}", self.url_prefix, storage_path)
    }
}

/// Cloudflare R2 storage backend (S3-compatible)
pub struct R2Storage {
    client: S3Client,
    bucket: String,
}

impl R2Storage {
    pub async fn new() -> Self {
        let account_id = std::env::var("R2_ACCOUNT_ID").expect("R2_ACCOUNT_ID required");
        let access_key = std::env::var("R2_ACCESS_KEY_ID").expect("R2_ACCESS_KEY_ID required");
        let secret_key = std::env::var("R2_SECRET_ACCESS_KEY").expect("R2_SECRET_ACCESS_KEY required");
        let bucket = std::env::var("R2_BUCKET").unwrap_or_else(|_| "wlpc-uploads".into());

        let endpoint = format!("https://{}.r2.cloudflarestorage.com", account_id);

        let creds = aws_sdk_s3::config::Credentials::new(
            access_key,
            secret_key,
            None, None, "r2",
        );

        let config = aws_sdk_s3::Config::builder()
            .region(aws_sdk_s3::config::Region::new("auto"))
            .endpoint_url(endpoint)
            .credentials_provider(creds)
            .force_path_style(true)
            .behavior_version_latest()
            .build();

        let client = S3Client::from_conf(config);

        Self { client, bucket }
    }
}

#[async_trait]
impl StorageBackend for R2Storage {
    async fn save(&self, filename: &str, data: &[u8]) -> Result<String, StorageError> {
        let ext = Path::new(filename)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("bin");
        let key = format!("{}_{}.{}", chrono::Utc::now().format("%Y%m%d%H%M%S"), uuid::Uuid::new_v4(), ext);

        // Detect content type
        let content_type = if ext == "jpg" || ext == "jpeg" { "image/jpeg" }
            else if ext == "png" { "image/png" }
            else if ext == "gif" { "image/gif" }
            else if ext == "webp" { "image/webp" }
            else if ext == "pdf" { "application/pdf" }
            else { "application/octet-stream" };

        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(&key)
            .body(aws_sdk_s3::primitives::ByteStream::from(data.to_vec()))
            .content_type(content_type)
            .send()
            .await
            .map_err(|e| StorageError(format!("R2 upload failed: {}", e)))?;

        Ok(key)
    }

    async fn delete(&self, storage_path: &str) -> Result<(), StorageError> {
        self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(storage_path)
            .send()
            .await
            .map_err(|e| StorageError(format!("R2 delete failed: {}", e)))?;
        Ok(())
    }

    async fn get_bytes(&self, storage_path: &str) -> Result<(Vec<u8>, String), StorageError> {
        // Fallback: fetch from R2 if needed (shouldn't normally be called — use serve_url instead)
        let resp = self.client
            .get_object()
            .bucket(&self.bucket)
            .key(storage_path)
            .send()
            .await
            .map_err(|e| StorageError(format!("R2 get failed: {}", e)))?;

        let content_type = resp.content_type().unwrap_or("application/octet-stream").to_string();
        let bytes = resp.body.collect()
            .await
            .map_err(|e| StorageError(format!("R2 read failed: {}", e)))?
            .into_bytes()
            .to_vec();

        Ok((bytes, content_type))
    }

    async fn serve_url(&self, storage_path: &str) -> Result<String, StorageError> {
        // Generate a presigned URL valid for 1 hour
        let presigned = self.client
            .get_object()
            .bucket(&self.bucket)
            .key(storage_path)
            .presigned(
                aws_sdk_s3::presigning::PresigningConfig::expires_in(std::time::Duration::from_secs(3600))
                    .map_err(|e| StorageError(format!("Presign config error: {}", e)))?
            )
            .await
            .map_err(|e| StorageError(format!("Presign failed: {}", e)))?;

        Ok(presigned.uri().to_string())
    }

    fn public_url(&self, storage_path: &str) -> String {
        // Not truly public — downloads go through our API which generates presigned URLs
        format!("/uploads/{}", storage_path)
    }

    fn supports_redirect(&self) -> bool { true }
}
