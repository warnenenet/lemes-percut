use lms_server::{config::ServerConfig, db, seed};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("lms_server=info,seed=info")),
        )
        .init();

    let cfg = ServerConfig::from_env().map_err(|e| anyhow::anyhow!(e))?;
    tracing::info!("Menghubungkan ke MySQL 8 untuk migrasi & seeding...");

    let pool = db::create_mysql_pool(&cfg.database_url).await?;
    sqlx::migrate!("../../migrations").run(&pool).await?;
    tracing::info!("Migrasi MySQL selesai.");

    seed::realistic::run_idempotent_seed(&pool).await?;
    let counts = db::get_health_counts(&pool).await?;
    tracing::info!("Seeding idempoten selesai: {counts}");
    Ok(())
}
