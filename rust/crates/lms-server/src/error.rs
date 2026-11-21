use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use lms_domain::DomainError;
use serde_json::json;

pub struct ApiError(pub DomainError);

impl From<DomainError> for ApiError {
    fn from(value: DomainError) -> Self {
        Self(value)
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(err: sqlx::Error) -> Self {
        tracing::error!("SQLx database error: {err:?}");
        Self(DomainError::internal(
            "Terjadi kesalahan akses basis data MySQL.",
        ))
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(err: anyhow::Error) -> Self {
        tracing::error!("Internal server error: {err:?}");
        Self(DomainError::internal(
            "Terjadi kesalahan internal pada server LMS.",
        ))
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = StatusCode::from_u16(self.0.http_status())
            .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
        (status, Json(json!({ "ok": false, "error": self.0 }))).into_response()
    }
}

pub fn map_sqlx_error(err: sqlx::Error) -> DomainError {
    tracing::error!("SQLx query error: {err:?}");
    DomainError::internal("Terjadi kesalahan akses basis data MySQL.")
}
