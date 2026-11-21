use serde_json::{json, Value};
use sqlx::{mysql::MySqlPoolOptions, MySqlPool};
use std::time::Duration;

pub async fn create_mysql_pool(database_url: &str) -> Result<MySqlPool, sqlx::Error> {
    MySqlPoolOptions::new()
        .max_connections(30)
        .min_connections(2)
        .acquire_timeout(Duration::from_secs(5))
        .connect(database_url)
        .await
}

pub async fn ping_mysql(pool: &MySqlPool) -> bool {
    sqlx::query_scalar::<_, i64>("SELECT 1")
        .fetch_one(pool)
        .await
        .is_ok()
}

pub async fn get_health_counts(pool: &MySqlPool) -> Result<Value, sqlx::Error> {
    let majors: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM majors")
        .fetch_one(pool)
        .await?;
    let rombels: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM rombels")
        .fetch_one(pool)
        .await?;
    let students: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM students")
        .fetch_one(pool)
        .await?;
    let teachers: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM teachers")
        .fetch_one(pool)
        .await?;
    let bk_counselors: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM bk_counselors")
        .fetch_one(pool)
        .await?;
    let pkl_placements: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM pkl_placements")
        .fetch_one(pool)
        .await?;

    Ok(json!({
        "majors": majors,
        "rombels": rombels,
        "students": students,
        "teachers": teachers,
        "bk_counselors": bk_counselors,
        "pkl_placements": pkl_placements
    }))
}
