use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub database_url: String,
    pub port: u16,
    pub app_mode: String,
    pub app_env: String,
    pub storage_dir: PathBuf,
    pub dist_dir: PathBuf,
    pub backup_dir: PathBuf,
}

impl ServerConfig {
    pub fn from_env() -> Result<Self, String> {
        let app_env = std::env::var("APP_ENV")
            .or_else(|_| std::env::var("NODE_ENV"))
            .unwrap_or_else(|_| "production".to_string())
            .to_lowercase();

        if std::env::var("ALLOW_JSON_FALLBACK")
            .map(|v| v.eq_ignore_ascii_case("true"))
            .unwrap_or(false)
        {
            return Err(
                "FATAL: ALLOW_JSON_FALLBACK=true dilarang pada lms-server Rust. Gunakan MySQL 8."
                    .to_string(),
            );
        }

        let database_url = std::env::var("DATABASE_URL").map_err(|_| {
            format!(
                "FATAL: DATABASE_URL tidak diset (APP_ENV={app_env}). Server menolak start tanpa koneksi MySQL 8."
            )
        })?;

        if database_url.trim().is_empty() {
            return Err("FATAL: DATABASE_URL kosong.".to_string());
        }

        let port: u16 = std::env::var("PORT")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(3000);

        let app_mode = if std::env::var("APP_MODE").as_deref() == Ok("CBT") {
            "CBT".to_string()
        } else {
            "LMS".to_string()
        };

        let storage_dir = PathBuf::from(
            std::env::var("STORAGE_DIR").unwrap_or_else(|_| "/app/storage".to_string()),
        );
        let dist_dir = PathBuf::from(
            std::env::var("DIST_DIR").unwrap_or_else(|_| "/app/dist".to_string()),
        );
        let backup_dir = PathBuf::from(
            std::env::var("BACKUP_DIR").unwrap_or_else(|_| "/backup".to_string()),
        );

        Ok(Self {
            database_url,
            port,
            app_mode,
            app_env,
            storage_dir,
            dist_dir,
            backup_dir,
        })
    }

    pub fn is_production(&self) -> bool {
        self.app_env == "production"
    }
}
