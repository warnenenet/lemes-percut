use axum::{
    extract::{Extension, Path, State},
    Json,
};
use lms_domain::rbac::AuthContext;
use lms_domain::types::PklScoreComponent;
use lms_domain::DomainError;
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::error::ApiError;
use crate::middleware::AppState;
use crate::repositories::pkl;
use crate::routes::{ClientMapelPklContribution, ClientPklScore};

#[derive(Deserialize)]
pub struct CreatePklJournalPayload {
    #[serde(default)]
    pub placement_id: String,
    pub tanggal: Option<String>,
    #[serde(default)]
    pub aktivitas: String,
}

#[derive(Deserialize)]
pub struct ValidatePklJournalPayload {
    pub validasi_bk: Option<bool>,
    pub catatan_bk: Option<String>,
}

#[derive(Deserialize)]
pub struct UpsertPklScorePayload {
    #[serde(default)]
    pub placement_id: String,
    #[serde(default)]
    pub komponen: String,
    pub nilai: f64,
}

#[derive(Deserialize)]
pub struct UpsertMapelPklContributionPayload {
    #[serde(default)]
    pub student_id: String,
    #[serde(default)]
    pub subject_id: String,
    pub nilai: f64,
    #[serde(default)]
    pub catatan: String,
}

pub async fn create_pkl_journal_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<CreatePklJournalPayload>,
) -> Result<Json<Value>, ApiError> {
    let journal = pkl::create_pkl_journal(
        &state.pool,
        &ctx,
        &body.placement_id,
        body.tanggal.as_deref(),
        &body.aktivitas,
    )
    .await?;
    Ok(Json(json!({ "ok": true, "journal": journal })))
}

pub async fn validate_pkl_journal_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(body): Json<ValidatePklJournalPayload>,
) -> Result<Json<Value>, ApiError> {
    let journal = pkl::validate_pkl_journal(
        &state.pool,
        &ctx,
        &id,
        body.validasi_bk.unwrap_or(true),
        body.catatan_bk.as_deref(),
    )
    .await?;
    Ok(Json(json!({ "ok": true, "journal": journal })))
}

pub async fn upsert_pkl_score_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<UpsertPklScorePayload>,
) -> Result<Json<Value>, ApiError> {
    let komponen = PklScoreComponent::from_db(&body.komponen).ok_or_else(|| {
        DomainError::validation("komponen", "Komponen nilai PKL tidak dikenali.")
    })?;
    if !body.nilai.is_finite() {
        return Err(DomainError::validation("nilai", "Nilai PKL tidak valid.").into());
    }
    let nilai = Decimal::try_from(body.nilai)
        .map_err(|_| DomainError::validation("nilai", "Nilai PKL tidak valid."))?;

    let score =
        pkl::upsert_pkl_score(&state.pool, &ctx, &body.placement_id, komponen, nilai).await?;
    Ok(Json(json!({
        "ok": true,
        "score": ClientPklScore::from(score)
    })))
}

pub async fn upsert_mapel_pkl_contribution_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<UpsertMapelPklContributionPayload>,
) -> Result<Json<Value>, ApiError> {
    if !body.nilai.is_finite() {
        return Err(DomainError::validation("nilai", "Nilai kontribusi mapel tidak valid.").into());
    }
    let nilai = Decimal::try_from(body.nilai)
        .map_err(|_| DomainError::validation("nilai", "Nilai kontribusi mapel tidak valid."))?;

    let contribution = pkl::upsert_mapel_pkl_contribution(
        &state.pool,
        &ctx,
        &body.student_id,
        &body.subject_id,
        nilai,
        &body.catatan,
    )
    .await?;
    Ok(Json(json!({
        "ok": true,
        "contribution": ClientMapelPklContribution::from(contribution)
    })))
}
