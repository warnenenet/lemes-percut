use axum::{
    extract::{Extension, Path, State},
    Json,
};
use lms_domain::rbac::AuthContext;
use lms_domain::types::ExamType;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::error::ApiError;
use crate::middleware::AppState;
use crate::repositories::cbt;
use crate::routes::{dec_to_f64, ClientExamAnswer, ClientExamGradeSummary};

#[derive(Deserialize)]
pub struct CreateExamPayload {
    #[serde(default)]
    pub teacher_assignment_id: String,
    pub tipe: Option<String>,
    #[serde(default)]
    pub judul: String,
    #[serde(default)]
    pub waktu_mulai: String,
    pub durasi_menit: i64,
    pub target_student_ids: Option<Vec<String>>,
    pub parent_exam_id: Option<String>,
}

#[derive(Deserialize)]
pub struct StartExamPayload {
    #[serde(default)]
    pub token: String,
}

#[derive(Deserialize)]
pub struct SaveExamAnswerPayload {
    #[serde(default)]
    pub question_id: String,
    #[serde(default)]
    pub jawaban: String,
}

pub async fn create_exam_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<CreateExamPayload>,
) -> Result<Json<Value>, ApiError> {
    let tipe = ExamType::from_db(body.tipe.as_deref().unwrap_or("CUSTOM"));
    let exam = cbt::create_exam(
        &state.pool,
        &ctx,
        cbt::CreateExamInput {
            teacher_assignment_id: &body.teacher_assignment_id,
            tipe,
            judul: &body.judul,
            waktu_mulai_iso: &body.waktu_mulai,
            durasi_menit: body.durasi_menit,
            target_student_ids: body.target_student_ids,
            parent_exam_id: body.parent_exam_id.as_deref(),
        },
    )
    .await?;

    Ok(Json(json!({ "ok": true, "exam": exam })))
}

pub async fn start_exam_session_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(body): Json<StartExamPayload>,
) -> Result<Json<Value>, ApiError> {
    let exam_session = cbt::start_exam_session(&state.pool, &ctx, &id, &body.token).await?;
    Ok(Json(json!({ "ok": true, "exam_session": exam_session })))
}

pub async fn save_exam_answer_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(body): Json<SaveExamAnswerPayload>,
) -> Result<Json<Value>, ApiError> {
    let answer =
        cbt::save_exam_answer(&state.pool, &ctx, &id, &body.question_id, &body.jawaban).await?;
    Ok(Json(json!({
        "ok": true,
        "answer": ClientExamAnswer::from(answer)
    })))
}

pub async fn finish_exam_session_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let (exam_session, summary) = cbt::finish_exam_session(&state.pool, &ctx, &id).await?;
    let summary_dto = ClientExamGradeSummary {
        total_earned: dec_to_f64(summary.total_earned),
        total_possible: dec_to_f64(summary.total_possible),
        percentage: dec_to_f64(summary.percentage),
    };
    Ok(Json(json!({
        "ok": true,
        "exam_session": exam_session,
        "summary": summary_dto
    })))
}
