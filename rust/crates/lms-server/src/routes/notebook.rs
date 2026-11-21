use axum::{
    extract::{Extension, Path, State},
    Json,
};
use lms_domain::rbac::AuthContext;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::error::ApiError;
use crate::middleware::AppState;
use crate::repositories::notebook;

#[derive(Deserialize)]
pub struct CreateNotebookEntryPayload {
    #[serde(default)]
    pub judul: String,
    #[serde(default)]
    pub konten: String,
    pub gambar_url: Option<String>,
}

#[derive(Deserialize)]
pub struct CommentNotebookPayload {
    #[serde(default)]
    pub komentar: String,
}

pub async fn get_notebook_metadata_handler(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, ApiError> {
    let metadata = notebook::list_notebook_metadata(&state.pool).await?;
    Ok(Json(json!({ "ok": true, "metadata": metadata })))
}

pub async fn get_notebook_entries_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let entries = notebook::get_notebook_entries(&state.pool, &ctx, &id).await?;
    Ok(Json(json!({ "ok": true, "entries": entries })))
}

pub async fn create_notebook_entry_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(subject_id): Path<String>,
    Json(body): Json<CreateNotebookEntryPayload>,
) -> Result<Json<Value>, ApiError> {
    let entry = notebook::create_notebook_entry(
        &state.pool,
        &ctx,
        &subject_id,
        &body.judul,
        &body.konten,
        body.gambar_url.as_deref(),
    )
    .await?;
    Ok(Json(json!({ "ok": true, "entry": entry })))
}

pub async fn comment_notebook_entry_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(body): Json<CommentNotebookPayload>,
) -> Result<Json<Value>, ApiError> {
    let entry =
        notebook::comment_notebook_entry(&state.pool, &ctx, &id, &body.komentar).await?;
    Ok(Json(json!({ "ok": true, "entry": entry })))
}
