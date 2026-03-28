use crate::db::DbPool;
use crate::errors::AppError;

pub fn require_feature(pool: &DbPool, feature: &str) -> Result<(), AppError> {
    let conn = pool.get()?;
    let key = format!("feature_{}", feature);
    let enabled: bool = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            [&key],
            |row| {
                let val: String = row.get(0)?;
                Ok(val == "1")
            },
        )
        .unwrap_or(true);

    if enabled {
        Ok(())
    } else {
        Err(AppError::FeatureDisabled)
    }
}
