use axum::{
    extract::{Extension, State},
    http::StatusCode,
    Json,
};
use lms_domain::rbac::AuthContext;
use lms_domain::types::EraporMappingColumn;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::db::get_health_counts;
use crate::error::ApiError;
use crate::middleware::AppState;
use crate::repositories::system_audit;
use crate::routes::ClientImportBatch;

#[derive(Deserialize)]
pub struct PreviewImportPayload {
    #[serde(default)]
    pub tipe: String,
    #[serde(default)]
    pub csv_text: String,
}

#[derive(Deserialize)]
pub struct CommitImportPayload {
    #[serde(default)]
    pub tipe: String,
    pub filename: Option<String>,
    #[serde(default)]
    pub csv_text: String,
}

#[derive(Deserialize)]
pub struct UpdateEraporMappingPayload {
    pub template_name: Option<String>,
    #[serde(default)]
    pub mapping: Vec<EraporMappingColumn>,
}

#[derive(Deserialize)]
pub struct RunBackupPayload {
    #[serde(default)]
    pub simulate_zero_byte: bool,
}

#[derive(Deserialize)]
pub struct UpdateSettingPayload {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub value: String,
    pub group: Option<String>,
}

#[derive(Deserialize)]
pub struct SendNotificationPayload {
    #[serde(default)]
    pub user_id: String,
    pub tipe: Option<String>,
    #[serde(default)]
    pub judul: String,
    #[serde(default)]
    pub pesan: String,
    pub entitas_id: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateCoachingNotePayload {
    #[serde(default)]
    pub target_type: String,
    #[serde(default)]
    pub target_id: String,
    #[serde(default)]
    pub judul: String,
    #[serde(default)]
    pub catatan: String,
}

#[derive(Deserialize)]
pub struct UpsertWalikelasNotePayload {
    #[serde(default)]
    pub student_id: String,
    #[serde(default)]
    pub catatan: String,
}

pub async fn preview_import_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<PreviewImportPayload>,
) -> Result<Json<Value>, ApiError> {
    let preview = system_audit::preview_import(&state.pool, &ctx, &body.tipe, &body.csv_text).await?;
    Ok(Json(json!({ "ok": true, "preview": preview })))
}

pub async fn commit_import_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<CommitImportPayload>,
) -> Result<Json<Value>, ApiError> {
    let (batch, preview) = system_audit::commit_student_import(
        &state.pool,
        &ctx,
        &body.tipe,
        body.filename.as_deref(),
        &body.csv_text,
    )
    .await?;
    Ok(Json(json!({
        "ok": true,
        "batch": ClientImportBatch::from(batch),
        "preview": preview
    })))
}

pub async fn update_erapor_mapping_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<UpdateEraporMappingPayload>,
) -> Result<Json<Value>, ApiError> {
    let mapping = system_audit::update_erapor_mapping(
        &state.pool,
        &ctx,
        body.template_name.as_deref(),
        body.mapping,
    )
    .await?;
    Ok(Json(json!({ "ok": true, "mapping": mapping })))
}

pub async fn run_backup_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<RunBackupPayload>,
) -> Result<Json<Value>, ApiError> {
    let backup = system_audit::record_backup_check(
        &state.pool,
        &ctx,
        &state.config.backup_dir,
        body.simulate_zero_byte,
    )
    .await?;
    Ok(Json(json!({ "ok": true, "backup": backup })))
}

pub async fn list_audit_logs_handler(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, ApiError> {
    let audit_logs = system_audit::list_audit_logs(&state.pool).await?;
    Ok(Json(json!({ "ok": true, "audit_logs": audit_logs })))
}

pub async fn update_setting_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<UpdateSettingPayload>,
) -> Result<Json<Value>, ApiError> {
    let setting = system_audit::update_setting(
        &state.pool,
        &ctx,
        &body.key,
        &body.value,
        body.group.as_deref(),
    )
    .await?;
    Ok(Json(json!({ "ok": true, "setting": setting })))
}

pub async fn verify_system_handler(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, ApiError> {
    let counts = get_health_counts(&state.pool).await?;
    let settings = system_audit::list_settings(&state.pool).await?;
    let disk_backups = system_audit::list_disk_backup_files(&state.config.backup_dir);
    Ok(Json(json!({
        "ok": true,
        "engine": "mysql",
        "counts": counts,
        "settings": settings,
        "disk_backups": disk_backups
    })))
}

pub async fn send_notification_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<SendNotificationPayload>,
) -> Result<Json<Value>, ApiError> {
    let notification = system_audit::send_notification(
        &state.pool,
        &ctx,
        &body.user_id,
        body.tipe.as_deref().unwrap_or("PERINGATAN"),
        &body.judul,
        &body.pesan,
        body.entitas_id.as_deref(),
    )
    .await?;
    Ok(Json(json!({ "ok": true, "notification": notification })))
}

pub async fn create_coaching_note_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<CreateCoachingNotePayload>,
) -> Result<Json<Value>, ApiError> {
    let note = system_audit::create_coaching_note(
        &state.pool,
        &ctx,
        &body.target_type,
        &body.target_id,
        &body.judul,
        &body.catatan,
    )
    .await?;
    Ok(Json(json!({ "ok": true, "note": note })))
}

pub async fn upsert_walikelas_note_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<UpsertWalikelasNotePayload>,
) -> Result<Json<Value>, ApiError> {
    system_audit::upsert_walikelas_note(&state.pool, &ctx, &body.student_id, &body.catatan)
        .await?;
    Ok(Json(json!({ "ok": true })))
}

pub async fn reset_demo_disabled() -> (StatusCode, Json<Value>) {
    (
        StatusCode::FORBIDDEN,
        Json(json!({
            "ok": false,
            "error": {
                "kind": "FORBIDDEN",
                "httpStatus": 403,
                "message": "Reset data uji dinonaktifkan pada mode produksi / MySQL."
            }
        })),
    )
}
