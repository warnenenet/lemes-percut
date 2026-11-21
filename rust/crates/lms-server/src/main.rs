use lms_server::{
    auth::SessionStore,
    config::ServerConfig,
    db,
    middleware::AppState,
    routes,
    seed,
    storage,
};
use std::net::SocketAddr;
use std::sync::Arc;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("lms_server=info,tower_http=info")),
        )
        .init();

    let cfg = match ServerConfig::from_env() {
        Ok(c) => c,
        Err(msg) => {
            tracing::error!("{msg}");
            std::process::exit(1);
        }
    };

    storage::ensure_storage_directories(&cfg.storage_dir)?;

    tracing::info!(
        "Menghubungkan ke MySQL 8 (mode={}, env={})...",
        cfg.app_mode,
        cfg.app_env
    );
    let pool = db::create_mysql_pool(&cfg.database_url).await?;

    sqlx::migrate!("../../migrations").run(&pool).await?;
    tracing::info!("Migrasi skema MySQL 8 aktif dan sinkron.");

    let auto_seed = std::env::var("AUTO_SEED")
        .map(|v| v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    if auto_seed {
        tracing::info!("AUTO_SEED=true terdeteksi, menjalankan seeder idempoten...");
        seed::realistic::run_idempotent_seed(&pool).await?;
        tracing::info!("Seeder idempoten selesai.");
    }

    let port = cfg.port;
    let mode = cfg.app_mode.clone();
    let state = Arc::new(AppState {
        pool,
        config: cfg,
        sessions: Arc::new(SessionStore::new()),
    });

    let app = routes::build_router(state);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("LMS SMK Negeri 1 Percut Sei Tuan ({mode}) mendengarkan pada http://{addr}");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
