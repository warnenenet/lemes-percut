use axum::{
    body::Body,
    http::{header, Method, Request, StatusCode},
    Router,
};
use http_body_util::BodyExt;
use lms_server::{
    auth::SessionStore,
    config::ServerConfig,
    middleware::AppState,
    routes::build_router,
    seed::realistic::run_idempotent_seed,
    storage::ensure_storage_directories,
};
use serde_json::{json, Value};
use sqlx::{mysql::MySqlPoolOptions, MySqlPool};
use std::sync::Arc;
use std::time::Duration;
use tower::ServiceExt;

async fn send_json(
    app: &Router,
    method: Method,
    uri: &str,
    token: Option<&str>,
    active_role: Option<&str>,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut builder = Request::builder().method(method).uri(uri);
    if let Some(tok) = token {
        builder = builder.header(header::AUTHORIZATION, format!("Bearer {tok}"));
    }
    if let Some(role) = active_role {
        builder = builder.header("x-active-role", role);
    }

    let req = match body {
        Some(payload) => builder
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(payload.to_string()))
            .expect("valid json request"),
        None => builder.body(Body::empty()).expect("valid empty request"),
    };

    let res = app
        .clone()
        .oneshot(req)
        .await
        .expect("router oneshot succeeded");
    let status = res.status();
    let bytes = res
        .into_body()
        .collect()
        .await
        .expect("collect response body")
        .to_bytes();
    let parsed: Value =
        serde_json::from_slice(&bytes).unwrap_or_else(|_| json!({ "raw": String::from_utf8_lossy(&bytes) }));
    (status, parsed)
}

async fn login(app: &Router, identifier: &str, password: &str) -> (String, Value) {
    let (status, body) = send_json(
        app,
        Method::POST,
        "/api/auth/login",
        None,
        None,
        Some(json!({
            "identifier": identifier,
            "password": password
        })),
    )
    .await;
    assert_eq!(
        status, StatusCode::OK,
        "Expected login 200 for {identifier}, got {status}: {body}"
    );
    assert_eq!(body["ok"], json!(true));
    let token = body["token"]
        .as_str()
        .expect("login response must include bearer token")
        .to_string();
    (token, body["user"].clone())
}

async fn cleanup_e2e_artifacts(pool: &MySqlPool) {
    let _ = sqlx::query("DELETE FROM exams WHERE judul LIKE 'E2E %'")
        .execute(pool)
        .await;
    let _ = sqlx::query("DELETE FROM attendance_records WHERE session_id = 1 AND student_id = 1")
        .execute(pool)
        .await;
    let _ = sqlx::query(
        "DELETE FROM students WHERE nisn IN ('0087770001', '0087770002')",
    )
    .execute(pool)
    .await;
    let _ = sqlx::query(
        "DELETE FROM users WHERE email IN ('0087770001@siswa.smkn1percut.sch.id', '0087770002@siswa.smkn1percut.sch.id')",
    )
    .execute(pool)
    .await;
    let _ = sqlx::query("DELETE FROM import_batches WHERE file_url = 'e2e_import_siswa.csv'")
        .execute(pool)
        .await;
}

#[tokio::test]
async fn e2e_mysql8_full_workflow() {
    let require_mysql = std::env::var("REQUIRE_MYSQL_E2E")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let Ok(database_url) = std::env::var("DATABASE_URL") else {
        if require_mysql {
            panic!("REQUIRE_MYSQL_E2E=1 set, but DATABASE_URL is missing.");
        }
        eprintln!("Skipping e2e_mysql8_full_workflow because DATABASE_URL is not set.");
        return;
    };

    let pool = MySqlPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(15))
        .connect(&database_url)
        .await
        .expect("connect to MySQL 8");

    sqlx::migrate!("../../migrations")
        .run(&pool)
        .await
        .expect("run SQLx migrations");

    cleanup_e2e_artifacts(&pool).await;
    run_idempotent_seed(&pool)
        .await
        .expect("run idempotent realistic seed");

    let temp_root = std::env::temp_dir().join("lms_smkn1_e2e_test");
    let storage_dir = temp_root.join("storage");
    let dist_dir = temp_root.join("dist");
    let backup_dir = temp_root.join("backup");
    let _ = std::fs::create_dir_all(&dist_dir);
    let _ = std::fs::create_dir_all(&backup_dir);
    let _ = std::fs::write(dist_dir.join("index.html"), "<!doctype html><html></html>");
    ensure_storage_directories(&storage_dir).expect("create storage dirs");

    let state = Arc::new(AppState {
        pool: pool.clone(),
        config: ServerConfig {
            database_url,
            port: 3000,
            app_mode: "LMS".to_string(),
            app_env: "test".to_string(),
            storage_dir,
            dist_dir,
            backup_dir,
        },
        sessions: Arc::new(SessionStore::new()),
    });
    let app = build_router(state);

    // 1. Health & Public Bootstrap
    let (status, health) = send_json(&app, Method::GET, "/api/health", None, None, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(health["ok"], json!(true));
    assert_eq!(health["engine"], json!("mysql"));

    let (status, boot) =
        send_json(&app, Method::GET, "/api/public/bootstrap", None, None, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(boot["engine"], json!("mysql"));
    assert!(!boot["demo_users"].as_array().unwrap().is_empty());

    // 2. Multi-role Login, Token Auth, Role Switching & Logout Revocation
    let (bad_status, _) = send_json(
        &app,
        Method::POST,
        "/api/auth/login",
        None,
        None,
        Some(json!({
            "identifier": "budi.mtk@smkn1percut.sch.id",
            "password": "wrong-password"
        })),
    )
    .await;
    assert_eq!(bad_status, StatusCode::UNAUTHORIZED);

    let (budi_token, budi_user) = login(&app, "budi.mtk@smkn1percut.sch.id", "smkn1percut").await;
    let budi_roles = budi_user["roles"].as_array().expect("roles array");
    assert!(budi_roles.iter().any(|r| r == "GURU_MAPEL"));
    assert!(budi_roles.iter().any(|r| r == "WALI_KELAS"));

    let (me_status, me_body) = send_json(
        &app,
        Method::GET,
        "/api/auth/me",
        Some(&budi_token),
        Some("WALI_KELAS"),
        None,
    )
    .await;
    assert_eq!(me_status, StatusCode::OK);
    assert_eq!(me_body["auth"]["activeRole"], json!("WALI_KELAS"));

    let (state_status, state_body) = send_json(
        &app,
        Method::GET,
        "/api/state",
        Some(&budi_token),
        Some("GURU_MAPEL"),
        None,
    )
    .await;
    assert_eq!(state_status, StatusCode::OK);
    assert_eq!(state_body["auth"]["activeRole"], json!("GURU_MAPEL"));

    // Login remaining 6 roles + login by NISN
    let (siti_token, _) = login(&app, "siti.mtk@smkn1percut.sch.id", "smkn1percut").await;
    let (wakasek_token, _) = login(&app, "wakasek@smkn1percut.sch.id", "smkn1percut").await;
    let (admin_token, _) = login(&app, "admin@smkn1percut.sch.id", "smkn1percut").await;
    let (_kepsek_token, _) = login(&app, "kepsek@smkn1percut.sch.id", "smkn1percut").await;
    let (_bk_token, _) = login(&app, "hendra.bk@smkn1percut.sch.id", "smkn1percut").await;
    let (rizky_token, _) = login(&app, "0081234501", "smkn1percut").await;

    // Logout revocation check
    let (temp_token, _) = login(&app, "rizky.siswa@smkn1percut.sch.id", "smkn1percut").await;
    let (logout_status, _) = send_json(
        &app,
        Method::POST,
        "/api/auth/logout",
        Some(&temp_token),
        None,
        None,
    )
    .await;
    assert_eq!(logout_status, StatusCode::OK);
    let (revoked_status, _) = send_json(
        &app,
        Method::GET,
        "/api/auth/me",
        Some(&temp_token),
        None,
        None,
    )
    .await;
    assert_eq!(revoked_status, StatusCode::UNAUTHORIZED);

    // 3. Cross-Teacher RBAC 403
    let (rbac_grade_status, rbac_grade_body) = send_json(
        &app,
        Method::POST,
        "/api/grades",
        Some(&siti_token),
        Some("GURU_MAPEL"),
        Some(json!({
            "student_id": "1",
            "teacher_assignment_id": "1",
            "component_id": "1",
            "nilai": 99,
            "catatan": "Cross-teacher test"
        })),
    )
    .await;
    assert_eq!(rbac_grade_status, StatusCode::FORBIDDEN);
    assert_eq!(rbac_grade_body["error"]["kind"], json!("FORBIDDEN"));

    let (rbac_session_status, _) = send_json(
        &app,
        Method::POST,
        "/api/sessions",
        Some(&siti_token),
        Some("GURU_MAPEL"),
        Some(json!({
            "teacher_assignment_id": "1",
            "topik": "Sesi Ilegal Lintas Guru"
        })),
    )
    .await;
    assert_eq!(rbac_session_status, StatusCode::FORBIDDEN);

    // 4. Attendance: AKSES_TANPA_AKTIVITAS (readPct=20) -> HADIR (readPct=90 + reflection)
    let (att1_status, att1_body) = send_json(
        &app,
        Method::POST,
        "/api/sessions/1/access",
        Some(&rizky_token),
        Some("SISWA"),
        Some(json!({
            "readPct": 20,
            "submittedTask": false,
            "submittedReflection": false,
            "simulatedTimeHHmm": "09:15"
        })),
    )
    .await;
    assert_eq!(att1_status, StatusCode::OK, "att1 body: {att1_body}");
    assert_eq!(att1_body["record"]["status"], json!("AKSES_TANPA_AKTIVITAS"));
    assert_eq!(att1_body["record"]["aktivitas_minimum_terpenuhi"], json!(false));

    let db_att1: String = sqlx::query_scalar(
        "SELECT status FROM attendance_records WHERE session_id = 1 AND student_id = 1 LIMIT 1",
    )
    .fetch_one(&pool)
    .await
    .expect("attendance row 1");
    assert_eq!(db_att1, "AKSES_TANPA_AKTIVITAS");

    let (att2_status, att2_body) = send_json(
        &app,
        Method::POST,
        "/api/sessions/1/access",
        Some(&rizky_token),
        Some("SISWA"),
        Some(json!({
            "readPct": 90,
            "submittedTask": false,
            "submittedReflection": true,
            "simulatedTimeHHmm": "09:20"
        })),
    )
    .await;
    assert_eq!(att2_status, StatusCode::OK, "att2 body: {att2_body}");
    assert_eq!(att2_body["record"]["status"], json!("HADIR"));
    assert_eq!(att2_body["record"]["aktivitas_minimum_terpenuhi"], json!(true));

    let db_att2: String = sqlx::query_scalar(
        "SELECT status FROM attendance_records WHERE session_id = 1 AND student_id = 1 LIMIT 1",
    )
    .fetch_one(&pool)
    .await
    .expect("attendance row 2");
    assert_eq!(db_att2, "HADIR");

    // 5. CBT Schedule Overlap 409 (Budi creates exam on ta=2 XI RPL 1 overlapping Exam 1 at 2026-11-16T08:00:00Z +90m)
    let (overlap_status, overlap_body) = send_json(
        &app,
        Method::POST,
        "/api/cbt/exams",
        Some(&budi_token),
        Some("GURU_MAPEL"),
        Some(json!({
            "teacher_assignment_id": "2",
            "tipe": "CUSTOM",
            "judul": "E2E Bentrok XI RPL 1",
            "waktu_mulai": "2026-11-16T08:30:00Z",
            "durasi_menit": 60
        })),
    )
    .await;
    assert_eq!(overlap_status, StatusCode::CONFLICT, "overlap body: {overlap_body}");
    assert_eq!(overlap_body["error"]["kind"], json!("EXAM_OVERLAP"));
    assert!(!overlap_body["error"]["conflicts"].as_array().unwrap().is_empty());

    // 6. CBT Susulan 403 (non-GURU_MAPEL & cross-teacher) vs 200 (assigned GURU_MAPEL)
    let (susulan_wakasek_status, susulan_wakasek_body) = send_json(
        &app,
        Method::POST,
        "/api/cbt/exams",
        Some(&wakasek_token),
        Some("WAKASEK"),
        Some(json!({
            "teacher_assignment_id": "1",
            "tipe": "SUSULAN",
            "judul": "E2E Susulan Wakasek Ilegal",
            "waktu_mulai": "2026-11-18T08:00:00Z",
            "durasi_menit": 60
        })),
    )
    .await;
    assert_eq!(susulan_wakasek_status, StatusCode::FORBIDDEN);
    assert_eq!(susulan_wakasek_body["error"]["kind"], json!("FORBIDDEN"));

    let (susulan_admin_status, _) = send_json(
        &app,
        Method::POST,
        "/api/cbt/exams",
        Some(&admin_token),
        Some("ADMIN"),
        Some(json!({
            "teacher_assignment_id": "1",
            "tipe": "SUSULAN",
            "judul": "E2E Susulan Admin Ilegal",
            "waktu_mulai": "2026-11-18T08:00:00Z",
            "durasi_menit": 60
        })),
    )
    .await;
    assert_eq!(susulan_admin_status, StatusCode::FORBIDDEN);

    let (susulan_siti_status, _) = send_json(
        &app,
        Method::POST,
        "/api/cbt/exams",
        Some(&siti_token),
        Some("GURU_MAPEL"),
        Some(json!({
            "teacher_assignment_id": "1",
            "tipe": "SUSULAN",
            "judul": "E2E Susulan Siti Lintas Guru",
            "waktu_mulai": "2026-11-18T08:00:00Z",
            "durasi_menit": 60
        })),
    )
    .await;
    assert_eq!(susulan_siti_status, StatusCode::FORBIDDEN);

    let (susulan_budi_status, susulan_budi_body) = send_json(
        &app,
        Method::POST,
        "/api/cbt/exams",
        Some(&budi_token),
        Some("GURU_MAPEL"),
        Some(json!({
            "teacher_assignment_id": "1",
            "tipe": "SUSULAN",
            "judul": "E2E Susulan Matematika XI RPL 1",
            "waktu_mulai": "2026-11-18T08:00:00Z",
            "durasi_menit": 60,
            "target_student_ids": ["1"]
        })),
    )
    .await;
    assert_eq!(
        susulan_budi_status,
        StatusCode::OK,
        "budi susulan body: {susulan_budi_body}"
    );
    assert_eq!(susulan_budi_body["exam"]["tipe"], json!("SUSULAN"));

    // 7. Dynamic e-Rapor Export
    let (erapor_status, erapor_body) = send_json(
        &app,
        Method::POST,
        "/api/erapor/export",
        Some(&budi_token),
        Some("GURU_MAPEL"),
        Some(json!({ "teacher_assignment_id": "1" })),
    )
    .await;
    assert_eq!(erapor_status, StatusCode::OK, "erapor body: {erapor_body}");
    let csv_content = erapor_body["export"]["csvContent"]
        .as_str()
        .expect("csvContent string");
    assert!(
        csv_content.starts_with(r#""NISN","Nama Peserta Didik","Rombel","Nilai Rapor","Predikat","Deskripsi Capaian Kompetensi""#),
        "unexpected e-Rapor header: {csv_content}"
    );
    assert!(csv_content.contains("0081234501"));
    assert!(csv_content.contains("Rizky Pratama"));

    // 8. Atomic CSV Student Import (Preview + Commit + MySQL Persistence)
    let csv_text = [
        "nisn,nis,nama,rombel,jurusan,jenis_kelamin",
        "0087770001,260101,E2E Siswa Baru Satu,XI RPL 1,RPL,L",
        "0087770002,260102,E2E Siswa Baru Dua,XI RPL 1,RPL,P",
        "0081234501,260199,Duplikat Rizky,XI RPL 1,RPL,L",
        "12345,260198,NISN Salah,XI RPL 1,RPL,L",
    ]
    .join("\n");

    let (prev_status, prev_body) = send_json(
        &app,
        Method::POST,
        "/api/admin/import/preview",
        Some(&admin_token),
        Some("ADMIN"),
        Some(json!({
            "tipe": "SISWA",
            "csv_text": csv_text
        })),
    )
    .await;
    assert_eq!(prev_status, StatusCode::OK, "preview body: {prev_body}");
    assert_eq!(prev_body["preview"]["validRows"].as_array().unwrap().len(), 2);
    assert_eq!(prev_body["preview"]["errorRows"].as_array().unwrap().len(), 2);

    let (commit_status, commit_body) = send_json(
        &app,
        Method::POST,
        "/api/admin/import/commit",
        Some(&admin_token),
        Some("ADMIN"),
        Some(json!({
            "tipe": "SISWA",
            "filename": "e2e_import_siswa.csv",
            "csv_text": csv_text
        })),
    )
    .await;
    assert_eq!(commit_status, StatusCode::OK, "commit body: {commit_body}");
    assert_eq!(commit_body["batch"]["baris_sukses"], json!(2));
    assert_eq!(commit_body["batch"]["baris_error"], json!(2));
    assert_eq!(commit_body["batch"]["status"], json!("SEBAGIAN_ERROR"));

    let imported_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM students WHERE nisn IN ('0087770001', '0087770002')",
    )
    .fetch_one(&pool)
    .await
    .expect("count imported students");
    assert_eq!(imported_count, 2);

    cleanup_e2e_artifacts(&pool).await;
    let _ = std::fs::remove_dir_all(&temp_root);
}
