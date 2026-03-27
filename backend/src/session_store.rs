use async_trait::async_trait;
use time::OffsetDateTime;
use tower_sessions::{
    session::{Id, Record},
    session_store, SessionStore,
};

use crate::db::DbPool;

#[derive(Clone, Debug)]
pub struct SqliteSessionStore {
    pool: DbPool,
}

impl SqliteSessionStore {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

}

#[async_trait]
impl SessionStore for SqliteSessionStore {
    async fn create(&self, record: &mut Record) -> session_store::Result<()> {
        // Expired session cleanup handled by background task in backup.rs
        let conn = self.pool.get().map_err(|e| session_store::Error::Backend(e.to_string()))?;

        let id_str = record.id.to_string();
        let data = rmp_serde_encode(&record.data)?;
        let expiry = record.expiry_date
            .format(&time::format_description::well_known::Rfc3339)
            .map_err(|e| session_store::Error::Backend(e.to_string()))?;

        // Check for collision and regenerate ID
        loop {
            let exists: bool = conn
                .query_row(
                    "SELECT COUNT(*) > 0 FROM sessions_store WHERE id = ?1",
                    rusqlite::params![id_str],
                    |row| row.get(0),
                )
                .unwrap_or(false);

            if !exists {
                break;
            }
            record.id = Id::default();
        }

        let id_str = record.id.to_string();
        conn.execute(
            "INSERT INTO sessions_store (id, data, expiry_date) VALUES (?1, ?2, ?3)",
            rusqlite::params![id_str, data, expiry],
        )
        .map_err(|e| session_store::Error::Backend(e.to_string()))?;

        Ok(())
    }

    async fn save(&self, record: &Record) -> session_store::Result<()> {
        let conn = self.pool.get().map_err(|e| session_store::Error::Backend(e.to_string()))?;

        let id_str = record.id.to_string();
        let data = rmp_serde_encode(&record.data)?;
        let expiry = record.expiry_date
            .format(&time::format_description::well_known::Rfc3339)
            .map_err(|e| session_store::Error::Backend(e.to_string()))?;

        conn.execute(
            "INSERT OR REPLACE INTO sessions_store (id, data, expiry_date) VALUES (?1, ?2, ?3)",
            rusqlite::params![id_str, data, expiry],
        )
        .map_err(|e| session_store::Error::Backend(e.to_string()))?;

        Ok(())
    }

    async fn load(&self, session_id: &Id) -> session_store::Result<Option<Record>> {
        let conn = self.pool.get().map_err(|e| session_store::Error::Backend(e.to_string()))?;

        let id_str = session_id.to_string();
        let now = OffsetDateTime::now_utc()
            .format(&time::format_description::well_known::Rfc3339)
            .unwrap_or_default();

        let result = conn.query_row(
            "SELECT data, expiry_date FROM sessions_store WHERE id = ?1 AND expiry_date >= ?2",
            rusqlite::params![id_str, now],
            |row| {
                let data: Vec<u8> = row.get(0)?;
                let expiry_str: String = row.get(1)?;
                Ok((data, expiry_str))
            },
        );

        match result {
            Ok((data, expiry_str)) => {
                let expiry_date = OffsetDateTime::parse(&expiry_str, &time::format_description::well_known::Rfc3339)
                    .map_err(|e| session_store::Error::Backend(e.to_string()))?;
                let session_data = rmp_serde_decode(&data)?;

                Ok(Some(Record {
                    id: *session_id,
                    data: session_data,
                    expiry_date,
                }))
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(session_store::Error::Backend(e.to_string())),
        }
    }

    async fn delete(&self, session_id: &Id) -> session_store::Result<()> {
        let conn = self.pool.get().map_err(|e| session_store::Error::Backend(e.to_string()))?;
        let id_str = session_id.to_string();

        conn.execute("DELETE FROM sessions_store WHERE id = ?1", rusqlite::params![id_str])
            .map_err(|e| session_store::Error::Backend(e.to_string()))?;

        Ok(())
    }
}

// Encode session data as JSON bytes (simple, debuggable)
fn rmp_serde_encode(data: &std::collections::HashMap<String, serde_json::Value>) -> session_store::Result<Vec<u8>> {
    serde_json::to_vec(data).map_err(|e| session_store::Error::Encode(e.to_string()))
}

fn rmp_serde_decode(data: &[u8]) -> session_store::Result<std::collections::HashMap<String, serde_json::Value>> {
    serde_json::from_slice(data).map_err(|e| session_store::Error::Decode(e.to_string()))
}
