use async_trait::async_trait;
use std::path::{Path, PathBuf};

#[async_trait]
pub trait StorageBackend: Send + Sync {
    async fn save(&self, filename: &str, data: &[u8]) -> Result<String, StorageError>;
    async fn delete(&self, storage_path: &str) -> Result<(), StorageError>;
    fn public_url(&self, storage_path: &str) -> String;
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

    fn public_url(&self, storage_path: &str) -> String {
        format!("{}/{}", self.url_prefix, storage_path)
    }
}
