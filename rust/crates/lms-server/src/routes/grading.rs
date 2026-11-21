use axum::{
    extract::{Extension, State},
    Json,
};
use lms_domain::rbac::AuthContext;
use lms_domain::DomainError;
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::error::ApiError;
use crate::middleware::AppState;
use crate::repositories::grading;
use crate::routes::{ClientFinalGrade, ClientGradeRecord, ClientWeightValidation};

#[derive(Deserialize)]
pub struct UpsertGradePayload {
    #[serde(default)]
    pub student_id: String,
    #[serde(default)]
    pub teacher_assignment_id: String,
    #[serde(default)]
    pub component_id: String,
    pub nilai: f64,
    #[serde(default)]
    pub catatan: String,
}

#[derive(Deserialize)]
pub struct ExportEraporPayload {
    #[serde(default)]
    pub teacher_assignment_id: String,
    pub mapping_id: Option<String>,
}

pub async fn upsert_grade_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<UpsertGradePayload>,
) -> Result<Json<Value>, ApiError> {
    if !body.nilai.is_finite() {
        return Err(DomainError::validation("nilai", "Nilai komponen tidak valid.").into());
    }
    let nilai = Decimal::try_from(body.nilai)
        .map_err(|_| DomainError::validation("nilai", "Nilai komponen tidak valid."))?;

    let (record, final_grade, weight_validation) = grading::upsert_grade(
        &state.pool,
        &ctx,
        &body.student_id,
        &body.teacher_assignment_id,
        &body.component_id,
        nilai,
        &body.catatan,
    )
    .await?;

    Ok(Json(json!({
        "ok": true,
        "record": ClientGradeRecord::from(record),
        "final_grade": final_grade.map(ClientFinalGrade::from),
        "weight_validation": ClientWeightValidation::from(weight_validation)
    })))
}

pub async fn export_erapor_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<ExportEraporPayload>,
) -> Result<Json<Value>, ApiError> {
    let export = grading::export_erapor(
        &state.pool,
        &ctx,
        &body.teacher_assignment_id,
        body.mapping_id.as_deref(),
    )
    .await?;

    Ok(Json(json!({
        "ok": true,
        "export": export
    })))
}
