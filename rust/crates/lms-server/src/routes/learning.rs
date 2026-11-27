use axum::{
    extract::{Extension, Path, State},
    Json,
};
use lms_domain::rbac::AuthContext;
use lms_domain::types::{AttendanceStatus, DocumentStatus, SessionStatus, SessionType, TaskType};
use lms_domain::DomainError;
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::error::ApiError;
use crate::middleware::AppState;
use crate::repositories::learning;
use crate::routes::ClientTaskSubmission;

#[derive(Deserialize)]
pub struct CreateSessionPayload {
    #[serde(default)]
    pub teacher_assignment_id: String,
    #[serde(default)]
    pub topik: String,
    pub tanggal: Option<String>,
    pub jam_mulai: Option<String>,
    pub jam_selesai: Option<String>,
    pub tipe_sesi: Option<String>,
    pub module_id: Option<String>,
    pub minimum_read_pct: Option<u8>,
}

#[derive(Deserialize)]
pub struct UpdateSessionStatusPayload {
    #[serde(default)]
    pub status: String,
}

#[derive(Deserialize)]
pub struct SessionAccessPayload {
    #[serde(default, rename = "readPct", alias = "read_pct")]
    pub read_pct: u8,
    #[serde(default, rename = "submittedTask", alias = "submitted_task")]
    pub submitted_task: bool,
    #[serde(default, rename = "submittedReflection", alias = "submitted_reflection")]
    pub submitted_reflection: bool,
    #[serde(rename = "simulatedTimeHHmm", alias = "simulated_time_hhmm")]
    pub simulated_time_hhmm: Option<String>,
}

#[derive(Deserialize)]
pub struct OverrideAttendancePayload {
    #[serde(default)]
    pub student_id: String,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub alasan: String,
}

#[derive(Deserialize)]
pub struct CreateModulePayload {
    #[serde(default)]
    pub teacher_assignment_id: String,
    #[serde(default)]
    pub judul: String,
    #[serde(default)]
    pub konten: String,
    pub status: Option<String>,
}

#[derive(Deserialize)]
pub struct CloneModulePayload {
    #[serde(default)]
    pub target_assignment_id: String,
}

#[derive(Deserialize)]
pub struct CreateTaskPayload {
    #[serde(default)]
    pub teacher_assignment_id: String,
    pub session_id: Option<String>,
    #[serde(default)]
    pub judul: String,
    #[serde(default)]
    pub deskripsi: String,
    pub deadline: Option<String>,
    pub tipe: Option<String>,
    pub rubrik: Option<String>,
}

#[derive(Deserialize)]
pub struct SubmitTaskPayload {
    #[serde(default)]
    pub teks: String,
    pub file_url: Option<String>,
}

#[derive(Deserialize)]
pub struct GradeSubmissionPayload {
    pub nilai: f64,
    pub catatan_guru: Option<String>,
}

pub async fn create_session_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<CreateSessionPayload>,
) -> Result<Json<Value>, ApiError> {
    let tipe_sesi = SessionType::from_db(body.tipe_sesi.as_deref().unwrap_or("TEORI"));
    let session = learning::create_session(
        &state.pool,
        &ctx,
        learning::CreateSessionInput {
            teacher_assignment_id: &body.teacher_assignment_id,
            topik: &body.topik,
            tanggal: body.tanggal.as_deref(),
            jam_mulai: body.jam_mulai.as_deref().unwrap_or("07:30"),
            jam_selesai: body.jam_selesai.as_deref().unwrap_or("09:00"),
            tipe_sesi,
            module_id: body.module_id.as_deref(),
            minimum_read_pct: body.minimum_read_pct.unwrap_or(60),
        },
    )
    .await?;

    Ok(Json(json!({ "ok": true, "session": session })))
}

pub async fn update_session_status_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(body): Json<UpdateSessionStatusPayload>,
) -> Result<Json<Value>, ApiError> {
    let status = SessionStatus::from_db(&body.status);
    learning::update_session_status(&state.pool, &ctx, &id, status).await?;
    Ok(Json(json!({ "ok": true })))
}

pub async fn record_session_access_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(body): Json<SessionAccessPayload>,
) -> Result<Json<Value>, ApiError> {
    let record = learning::record_session_access(
        &state.pool,
        &ctx,
        &id,
        body.read_pct,
        body.submitted_task,
        body.submitted_reflection,
        body.simulated_time_hhmm.as_deref(),
    )
    .await?;
    Ok(Json(json!({ "ok": true, "record": record })))
}

pub async fn override_session_attendance_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(body): Json<OverrideAttendancePayload>,
) -> Result<Json<Value>, ApiError> {
    let status = AttendanceStatus::from_db(&body.status);
    let record = learning::override_session_attendance(
        &state.pool,
        &ctx,
        &id,
        &body.student_id,
        status,
        &body.alasan,
    )
    .await?;
    Ok(Json(json!({ "ok": true, "record": record })))
}

pub async fn create_module_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<CreateModulePayload>,
) -> Result<Json<Value>, ApiError> {
    let status = DocumentStatus::from_db(body.status.as_deref().unwrap_or("DRAFT"));
    let module = learning::create_module(
        &state.pool,
        &ctx,
        &body.teacher_assignment_id,
        &body.judul,
        &body.konten,
        status,
    )
    .await?;
    Ok(Json(json!({ "ok": true, "module": module })))
}

pub async fn clone_module_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(body): Json<CloneModulePayload>,
) -> Result<Json<Value>, ApiError> {
    let module =
        learning::clone_module(&state.pool, &ctx, &id, &body.target_assignment_id).await?;
    Ok(Json(json!({ "ok": true, "module": module })))
}

pub async fn create_task_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<CreateTaskPayload>,
) -> Result<Json<Value>, ApiError> {
    let tipe = TaskType::from_db(body.tipe.as_deref().unwrap_or("TUGAS"));
    let task = learning::create_task(
        &state.pool,
        &ctx,
        learning::CreateTaskInput {
            teacher_assignment_id: &body.teacher_assignment_id,
            session_id: body.session_id.as_deref(),
            judul: &body.judul,
            deskripsi: &body.deskripsi,
            deadline_iso: body.deadline.as_deref(),
            tipe,
            rubrik: body.rubrik.as_deref(),
        },
    )
    .await?;
    Ok(Json(json!({ "ok": true, "task": task })))
}

pub async fn submit_task_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(body): Json<SubmitTaskPayload>,
) -> Result<Json<Value>, ApiError> {
    let submission =
        learning::submit_task(&state.pool, &ctx, &id, &body.teks, body.file_url.as_deref())
            .await?;
    Ok(Json(json!({
        "ok": true,
        "submission": ClientTaskSubmission::from(submission)
    })))
}

pub async fn grade_submission_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(body): Json<GradeSubmissionPayload>,
) -> Result<Json<Value>, ApiError> {
    if !body.nilai.is_finite() {
        return Err(DomainError::validation("nilai", "Nilai tugas tidak valid.").into());
    }
    let nilai = Decimal::try_from(body.nilai)
        .map_err(|_| DomainError::validation("nilai", "Nilai tugas tidak valid."))?;
    let submission = learning::grade_submission(
        &state.pool,
        &ctx,
        &id,
        nilai,
        body.catatan_guru.as_deref(),
    )
    .await?;
    Ok(Json(json!({
        "ok": true,
        "submission": ClientTaskSubmission::from(submission)
    })))
}
