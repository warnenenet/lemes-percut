use axum::{
    extract::{Extension, State},
    http::HeaderMap,
    Json,
};
use lms_domain::rbac::AuthContext;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::auth::{authenticate_credentials, extract_bearer_token};
use crate::error::ApiError;
use crate::middleware::AppState;
use crate::routes::ClientAuthContext;

#[derive(Deserialize)]
pub struct LoginPayload {
    #[serde(default)]
    pub identifier: String,
    #[serde(default)]
    pub password: String,
}

pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(body): Json<LoginPayload>,
) -> Result<Json<Value>, ApiError> {
    let (token, user) =
        authenticate_credentials(&state.pool, &state.sessions, &body.identifier, &body.password)
            .await?;
    Ok(Json(json!({
        "ok": true,
        "token": token,
        "user": user
    })))
}

pub async fn logout(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Json<Value> {
    if let Some(token) = extract_bearer_token(&headers) {
        state.sessions.revoke_token(&token).await;
    }
    Json(json!({ "ok": true }))
}

pub async fn me(Extension(ctx): Extension<AuthContext>) -> Json<Value> {
    Json(json!({
        "ok": true,
        "auth": ClientAuthContext::from(&ctx)
    }))
}
