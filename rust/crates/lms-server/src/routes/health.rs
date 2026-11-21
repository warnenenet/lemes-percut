use axum::{extract::State, http::StatusCode, Json};
use chrono::Utc;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::db::{get_health_counts, ping_mysql};
use crate::middleware::AppState;

pub async fn health_check(State(state): State<Arc<AppState>>) -> (StatusCode, Json<Value>) {
    let mysql_ok = ping_mysql(&state.pool).await;
    let counts = if mysql_ok {
        get_health_counts(&state.pool).await.unwrap_or_else(|_| {
            json!({
                "majors": 0,
                "rombels": 0,
                "students": 0,
                "teachers": 0,
                "bk_counselors": 0,
                "pkl_placements": 0
            })
        })
    } else {
        json!({
            "majors": 0,
            "rombels": 0,
            "students": 0,
            "teachers": 0,
            "bk_counselors": 0,
            "pkl_placements": 0
        })
    };

    let healthy = mysql_ok || !state.config.is_production();
    let status_code = if healthy {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    (
        status_code,
        Json(json!({
            "ok": mysql_ok,
            "status": if mysql_ok { "healthy" } else { "degraded" },
            "engine": "mysql",
            "app_mode": state.config.app_mode,
            "app_env": state.config.app_env,
            "mysql_reachable": mysql_ok,
            "storage_dir": state.config.storage_dir.display().to_string(),
            "counts": counts,
            "timestamp": Utc::now().to_rfc3339()
        })),
    )
}
