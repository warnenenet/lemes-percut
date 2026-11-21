use axum::{
    extract::{Extension, Path, State},
    Json,
};
use lms_domain::rbac::AuthContext;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;

use crate::error::ApiError;
use crate::middleware::AppState;
use crate::repositories::perangkat_ajar;

#[derive(Deserialize)]
pub struct GeneratePromptPayload {
    #[serde(default)]
    pub teacher_assignment_id: String,
    #[serde(default)]
    pub template_id: String,
    #[serde(default)]
    pub teacher_inputs: HashMap<String, String>,
}

#[derive(Deserialize)]
pub struct SaveTeacherDocumentPayload {
    pub id: Option<String>,
    #[serde(default)]
    pub teacher_assignment_id: String,
    #[serde(default)]
    pub template_id: String,
    #[serde(default)]
    pub judul: String,
    #[serde(default)]
    pub konten: String,
    pub generated_prompt: Option<String>,
    pub checklist_state: Option<HashMap<String, bool>>,
}

#[derive(Deserialize)]
pub struct PublishTeacherDocumentPayload {
    pub checklist_state: Option<HashMap<String, bool>>,
}

pub async fn generate_prompt_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<GeneratePromptPayload>,
) -> Result<Json<Value>, ApiError> {
    let prompt = perangkat_ajar::generate_prompt(
        &state.pool,
        &ctx,
        &body.teacher_assignment_id,
        &body.template_id,
        &body.teacher_inputs,
    )
    .await?;
    Ok(Json(json!({ "ok": true, "prompt": prompt })))
}

pub async fn save_teacher_document_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<SaveTeacherDocumentPayload>,
) -> Result<Json<Value>, ApiError> {
    let document = perangkat_ajar::save_teacher_document(
        &state.pool,
        &ctx,
        body.id.as_deref(),
        &body.teacher_assignment_id,
        &body.template_id,
        &body.judul,
        &body.konten,
        body.generated_prompt.as_deref(),
        body.checklist_state,
    )
    .await?;
    Ok(Json(json!({ "ok": true, "document": document })))
}

pub async fn publish_teacher_document_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(body): Json<PublishTeacherDocumentPayload>,
) -> Result<Json<Value>, ApiError> {
    let document = perangkat_ajar::publish_teacher_document(
        &state.pool,
        &ctx,
        &id,
        body.checklist_state,
    )
    .await?;
    Ok(Json(json!({ "ok": true, "document": document })))
}
