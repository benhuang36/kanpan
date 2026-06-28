use serde::{Serialize, Serializer};

/// Application-wide error type. Serializes to a plain string so the frontend
/// receives a readable message from failed Tauri commands.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("network error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("{0}")]
    Other(String),
}

impl AppError {
    pub fn msg(s: impl Into<String>) -> Self {
        AppError::Other(s.into())
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
