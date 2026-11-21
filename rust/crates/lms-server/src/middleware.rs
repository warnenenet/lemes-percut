use axum::{
    extract::{Request, State},
    middleware::Next,
    response::Response,
};
use lms_domain::rbac::{guard_admin_only, AuthContext};
use lms_domain::types::UserRole;
use lms_domain::DomainError;
use sqlx::MySqlPool;
use std::sync::Arc;

use crate::auth::{self, SessionStore};
use crate::config::ServerConfig;
use crate::error::ApiError;

#[derive(Clone)]
pub struct AppState {
    pub pool: MySqlPool,
    pub config: ServerConfig,
    pub sessions: Arc<SessionStore>,
}

pub async fn require_auth(
    State(state): State<Arc<AppState>>,
    mut req: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let ctx = auth::resolve_auth_context(&state.pool, &state.sessions, req.headers()).await?;
    req.extensions_mut().insert(ctx);
    Ok(next.run(req).await)
}

pub async fn require_admin(req: Request, next: Next) -> Result<Response, ApiError> {
    let ctx = req
        .extensions()
        .get::<AuthContext>()
        .ok_or_else(|| DomainError::unauthorized("Autentikasi diperlukan."))?;
    guard_admin_only(ctx, "endpoint administrator")?;
    Ok(next.run(req).await)
}

pub fn ensure_any_role(ctx: &AuthContext, allowed: &[UserRole], action: &str) -> Result<(), DomainError> {
    if allowed.contains(&ctx.active_role) {
        return Ok(());
    }
    Err(DomainError::forbidden(
        format!(
            "Akses ditolak (403): Role {} tidak diizinkan mengakses {}.",
            ctx.active_role.as_str(),
            action
        ),
        "RBAC:ROLE_GUARD",
    ))
}
