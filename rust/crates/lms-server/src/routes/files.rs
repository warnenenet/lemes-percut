use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::error::ApiError;
use crate::middleware::AppState;
use crate::storage::{resolve_stored_file_path, save_uploaded_file};

#[derive(Deserialize)]
pub struct UploadFilePayload {
    #[serde(default)]
    pub category: String,
    #[serde(default, rename = "originalName", alias = "original_name")]
    pub original_name: String,
    #[serde(default, rename = "mimeType", alias = "mime_type")]
    pub mime_type: String,
    #[serde(default, rename = "base64Data", alias = "base64_data")]
    pub base64_data: String,
}

pub async fn upload_file(
    State(state): State<Arc<AppState>>,
    Json(body): Json<UploadFilePayload>,
) -> Result<Json<Value>, ApiError> {
    let mime = if body.mime_type.trim().is_empty() {
        "application/octet-stream"
    } else {
        body.mime_type.trim()
    };
    let saved = save_uploaded_file(
        &state.config.storage_dir,
        body.category.trim(),
        body.original_name.trim(),
        mime,
        &body.base64_data,
    )?;
    Ok(Json(json!({ "ok": true, "file": saved })))
}

pub async fn serve_file(
    State(state): State<Arc<AppState>>,
    Path((category, filename)): Path<(String, String)>,
) -> Response {
    let Some(path) = resolve_stored_file_path(&state.config.storage_dir, &category, &filename)
    else {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({
                "ok": false,
                "error": {
                    "httpStatus": 404,
                    "message": "Berkas tidak ditemukan."
                }
            })),
        )
            .into_response();
    };

    let Ok(bytes) = tokio::fs::read(&path).await else {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({
                "ok": false,
                "error": {
                    "httpStatus": 404,
                    "message": "Berkas tidak dapat dibaca dari penyimpanan."
                }
            })),
        )
            .into_response();
    };

    let content_type = match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("pdf") => "application/pdf",
        Some("txt") => "text/plain; charset=utf-8",
        Some("md") => "text/markdown; charset=utf-8",
        Some("doc") => "application/msword",
        Some("docx") => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        _ => "application/octet-stream",
    };

    let mut res = Response::new(Body::from(bytes));
    *res.status_mut() = StatusCode::OK;
    res.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(content_type),
    );
    res.headers_mut().insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    res
}
