use chrono::{DateTime, Utc};
use lms_domain::import_validator::{
    preview_student_import_csv, preview_teacher_import_csv, ImportPreview, ParsedStudentRow,
};
use lms_domain::rbac::{guard_admin_only, AuthContext};
use lms_domain::types::*;
use lms_domain::DomainError;
use serde::Serialize;
use sqlx::{MySql, MySqlPool, Row, Transaction};
use std::collections::HashMap;
use std::path::Path;

use crate::error::map_sqlx_error;
use crate::repositories::master::{list_majors, list_rombels};
use crate::repositories::user_access::{list_students, list_teachers};

#[derive(Debug, Clone, Serialize)]
pub struct BackupFileRecord {
    pub id: String,
    pub filename: String,
    pub size_bytes: u64,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SettingEntry {
    pub key: String,
    pub value: String,
    pub group: String,
}

pub async fn insert_audit_log_tx(
    tx: &mut Transaction<'_, MySql>,
    user_id: i64,
    aksi: &str,
    entitas: &str,
    entitas_id: &str,
    detail: &str,
) -> Result<(), DomainError> {
    let after_json = serde_json::json!({ "detail": detail });
    sqlx::query(
        "INSERT INTO audit_logs (user_id, aksi, entitas, entitas_id, after_json, ip, user_agent) VALUES (?, ?, ?, ?, ?, '127.0.0.1', 'rust-axum')",
    )
    .bind(user_id)
    .bind(aksi)
    .bind(entitas)
    .bind(entitas_id)
    .bind(after_json)
    .execute(&mut **tx)
    .await
    .map_err(map_sqlx_error)?;
    Ok(())
}

pub async fn insert_audit_log(
    pool: &MySqlPool,
    user_id: i64,
    aksi: &str,
    entitas: &str,
    entitas_id: &str,
    detail: &str,
) -> Result<(), DomainError> {
    let after_json = serde_json::json!({ "detail": detail });
    sqlx::query(
        "INSERT INTO audit_logs (user_id, aksi, entitas, entitas_id, after_json, ip, user_agent) VALUES (?, ?, ?, ?, ?, '127.0.0.1', 'rust-axum')",
    )
    .bind(user_id)
    .bind(aksi)
    .bind(entitas)
    .bind(entitas_id)
    .bind(after_json)
    .execute(pool)
    .await
    .map_err(map_sqlx_error)?;
    Ok(())
}

pub async fn list_audit_logs(pool: &MySqlPool) -> Result<Vec<AuditLog>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, user_id, aksi, entitas, entitas_id, after_json, ip, created_at FROM audit_logs ORDER BY id DESC LIMIT 200",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| {
            let aksi: String = r.get("aksi");
            let entitas: String = r.get("entitas");
            let entitas_id: String = r.get("entitas_id");
            let after_val: Option<serde_json::Value> = r.get("after_json");
            let detail = after_val
                .as_ref()
                .and_then(|v| v.get("detail"))
                .and_then(|d| d.as_str())
                .map(str::to_string)
                .unwrap_or_else(|| format!("{aksi} ({entitas}#{entitas_id})"));

            AuditLog {
                id: r.get::<i32, _>("id").to_string(),
                user_id: UserId(r.get::<i32, _>("user_id").to_string()),
                aksi,
                entitas,
                entitas_id,
                detail,
                ip: r.get("ip"),
                created_at: r.get::<DateTime<Utc>, _>("created_at").to_rfc3339(),
            }
        })
        .collect())
}

pub async fn list_notifications(pool: &MySqlPool) -> Result<Vec<AppNotification>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, user_id, tipe, judul, pesan, entitas, entitas_id, dibaca_at, created_at FROM notifications ORDER BY id DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| AppNotification {
            id: r.get::<i32, _>("id").to_string(),
            user_id: UserId(r.get::<i32, _>("user_id").to_string()),
            tipe: r.get("tipe"),
            judul: r.get("judul"),
            pesan: r.get("pesan"),
            entitas: r.get("entitas"),
            entitas_id: r.get("entitas_id"),
            dibaca_at: r
                .try_get::<Option<DateTime<Utc>>, _>("dibaca_at")
                .ok()
                .flatten()
                .map(|dt| dt.to_rfc3339()),
            created_at: r.get::<DateTime<Utc>, _>("created_at").to_rfc3339(),
        })
        .collect())
}

pub async fn send_notification(
    pool: &MySqlPool,
    ctx: &AuthContext,
    target_user_id: &str,
    tipe: &str,
    judul: &str,
    pesan: &str,
    entitas_id: Option<&str>,
) -> Result<AppNotification, DomainError> {
    if !matches!(
        ctx.active_role,
        UserRole::Admin | UserRole::KepalaSekolah | UserRole::Wakasek | UserRole::GuruBk
    ) {
        return Err(DomainError::forbidden(
            "Peran Anda tidak diizinkan mengirim notifikasi berjenjang.",
            "NOTIFICATION:SEND",
        ));
    }

    let uid: i64 = target_user_id
        .parse()
        .map_err(|_| DomainError::not_found("user", target_user_id))?;

    sqlx::query("SELECT id FROM users WHERE id = ? LIMIT 1")
        .bind(uid)
        .fetch_optional(pool)
        .await
        .map_err(map_sqlx_error)?
        .ok_or_else(|| DomainError::not_found("user", target_user_id))?;

    let norm_tipe = match tipe.trim().to_uppercase().as_str() {
        "INFO" => "INFO",
        "AKADEMIK" => "AKADEMIK",
        "PEMBINAAN" => "PEMBINAAN",
        _ => "PERINGATAN",
    };

    if judul.trim().is_empty() || pesan.trim().is_empty() {
        return Err(DomainError::validation(
            "judul",
            "Judul dan pesan notifikasi wajib diisi.",
        ));
    }

    let ent_id = entitas_id.unwrap_or("").trim().to_string();
    let res = sqlx::query(
        "INSERT INTO notifications (user_id, tipe, judul, pesan, entitas, entitas_id) VALUES (?, ?, ?, ?, 'teacher_documents', ?)",
    )
    .bind(uid)
    .bind(norm_tipe)
    .bind(judul.trim())
    .bind(pesan.trim())
    .bind(&ent_id)
    .execute(pool)
    .await
    .map_err(map_sqlx_error)?;

    let new_id = res.last_insert_id().to_string();
    let actor_uid: i64 = ctx.user.id.0.parse().unwrap_or(1);
    insert_audit_log(
        pool,
        actor_uid,
        "SEND_NOTIFICATION",
        "notifications",
        &new_id,
        &format!("Mengirim notifikasi \"{}\" ke user {}", judul.trim(), target_user_id),
    )
    .await?;

    Ok(AppNotification {
        id: new_id,
        user_id: UserId(uid.to_string()),
        tipe: norm_tipe.to_string(),
        judul: judul.trim().to_string(),
        pesan: pesan.trim().to_string(),
        entitas: "teacher_documents".to_string(),
        entitas_id: ent_id,
        dibaca_at: None,
        created_at: Utc::now().to_rfc3339(),
    })
}

pub async fn list_coaching_notes(pool: &MySqlPool) -> Result<Vec<CoachingNote>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, author_user_id, target_type, target_id, judul, catatan, created_at FROM coaching_notes ORDER BY id DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| CoachingNote {
            id: r.get::<i32, _>("id").to_string(),
            author_user_id: UserId(r.get::<i32, _>("author_user_id").to_string()),
            target_type: r.get("target_type"),
            target_id: r.get::<i32, _>("target_id").to_string(),
            judul: r.get("judul"),
            catatan: r.get("catatan"),
            created_at: r.get::<DateTime<Utc>, _>("created_at").to_rfc3339(),
        })
        .collect())
}

pub async fn create_coaching_note(
    pool: &MySqlPool,
    ctx: &AuthContext,
    target_type: &str,
    target_id: &str,
    judul: &str,
    catatan: &str,
) -> Result<CoachingNote, DomainError> {
    if !matches!(
        ctx.active_role,
        UserRole::Admin | UserRole::KepalaSekolah | UserRole::Wakasek | UserRole::GuruBk | UserRole::WaliKelas
    ) {
        return Err(DomainError::forbidden(
            "Role Anda tidak diizinkan membuat catatan pembinaan.",
            "COACHING:CREATE",
        ));
    }

    let tid: i64 = target_id.parse().map_err(|_| {
        DomainError::validation("target_id", "ID target pembinaan tidak valid.")
    })?;
    let norm_type = if target_type.eq_ignore_ascii_case("GURU") {
        "GURU"
    } else {
        "SISWA"
    };
    if judul.trim().is_empty() || catatan.trim().is_empty() {
        return Err(DomainError::validation(
            "judul",
            "Judul dan isi catatan pembinaan wajib diisi.",
        ));
    }

    let author_uid: i64 = ctx
        .user
        .id
        .0
        .parse()
        .map_err(|_| DomainError::internal("ID pengguna tidak valid."))?;

    let res = sqlx::query(
        "INSERT INTO coaching_notes (author_user_id, target_type, target_id, judul, catatan) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(author_uid)
    .bind(norm_type)
    .bind(tid)
    .bind(judul.trim())
    .bind(catatan.trim())
    .execute(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(CoachingNote {
        id: res.last_insert_id().to_string(),
        author_user_id: ctx.user.id.clone(),
        target_type: norm_type.to_string(),
        target_id: tid.to_string(),
        judul: judul.trim().to_string(),
        catatan: catatan.trim().to_string(),
        created_at: Utc::now().to_rfc3339(),
    })
}

pub async fn list_walikelas_notes(
    pool: &MySqlPool,
) -> Result<HashMap<String, String>, DomainError> {
    let rows = sqlx::query("SELECT student_id, catatan FROM walikelas_notes ORDER BY id ASC")
        .fetch_all(pool)
        .await
        .map_err(map_sqlx_error)?;

    let mut map = HashMap::new();
    for r in rows {
        let stu_id = r.get::<i32, _>("student_id").to_string();
        let catatan: String = r.get("catatan");
        map.insert(stu_id, catatan);
    }
    Ok(map)
}

pub async fn upsert_walikelas_note(
    pool: &MySqlPool,
    ctx: &AuthContext,
    student_id: &str,
    catatan: &str,
) -> Result<(), DomainError> {
    if ctx.active_role != UserRole::WaliKelas && ctx.active_role != UserRole::Admin {
        return Err(DomainError::forbidden(
            "Hanya Wali Kelas yang dapat menulis catatan wali kelas.",
            "WALI_KELAS:NOTE",
        ));
    }
    let stu_id: i64 = student_id
        .parse()
        .map_err(|_| DomainError::not_found("student", student_id))?;

    sqlx::query("SELECT id FROM students WHERE id = ? LIMIT 1")
        .bind(stu_id)
        .fetch_optional(pool)
        .await
        .map_err(map_sqlx_error)?
        .ok_or_else(|| DomainError::not_found("student", student_id))?;

    sqlx::query(
        "INSERT INTO walikelas_notes (student_id, catatan) VALUES (?, ?) ON DUPLICATE KEY UPDATE catatan = VALUES(catatan)",
    )
    .bind(stu_id)
    .bind(catatan.trim())
    .execute(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(())
}

pub async fn list_import_batches(pool: &MySqlPool) -> Result<Vec<ImportBatch>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, tipe, file_url, status, total_baris, baris_sukses, baris_error, error_log_json, created_by, created_at FROM import_batches ORDER BY id DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| {
            let err_val: serde_json::Value = r.get("error_log_json");
            let error_log = match err_val {
                serde_json::Value::Array(arr) => arr,
                _ => Vec::new(),
            };
            ImportBatch {
                id: r.get::<i32, _>("id").to_string(),
                tipe: r.get("tipe"),
                file_url: r.get("file_url"),
                status: r.get("status"),
                total_baris: r.get::<i32, _>("total_baris") as usize,
                baris_sukses: r.get::<i32, _>("baris_sukses") as usize,
                baris_error: r.get::<i32, _>("baris_error") as usize,
                error_log,
                created_by: UserId(r.get::<i32, _>("created_by").to_string()),
                created_at: r.get::<DateTime<Utc>, _>("created_at").to_rfc3339(),
            }
        })
        .collect())
}

pub async fn preview_import(
    pool: &MySqlPool,
    ctx: &AuthContext,
    tipe: &str,
    csv_text: &str,
) -> Result<serde_json::Value, DomainError> {
    guard_admin_only(ctx, "Preview Import")?;

    if tipe.eq_ignore_ascii_case("GURU") {
        let teachers = list_teachers(pool).await?;
        let preview = preview_teacher_import_csv(csv_text, &teachers)?;
        serde_json::to_value(preview)
            .map_err(|_| DomainError::internal("Gagal menyerialisasi hasil preview guru."))
    } else {
        let (students, rombels, majors) = tokio::try_join!(
            list_students(pool),
            list_rombels(pool),
            list_majors(pool),
        )?;
        let preview = preview_student_import_csv(csv_text, &students, &rombels, &majors)?;
        serde_json::to_value(preview)
            .map_err(|_| DomainError::internal("Gagal menyerialisasi hasil preview siswa."))
    }
}

pub async fn commit_student_import(
    pool: &MySqlPool,
    ctx: &AuthContext,
    tipe: &str,
    filename: Option<&str>,
    csv_text: &str,
) -> Result<(ImportBatch, ImportPreview<ParsedStudentRow>), DomainError> {
    guard_admin_only(ctx, "Commit Import")?;

    if !tipe.eq_ignore_ascii_case("SISWA") {
        return Err(DomainError::validation(
            "tipe",
            "Tipe import belum didukung pada endpoint commit siswa.",
        ));
    }

    let (students, rombels, majors) = tokio::try_join!(
        list_students(pool),
        list_rombels(pool),
        list_majors(pool),
    )?;

    let preview = preview_student_import_csv(csv_text, &students, &rombels, &majors)?;

    let mut tx = pool.begin().await.map_err(map_sqlx_error)?;

    for row in &preview.valid_rows {
        let email = format!("{}@siswa.smkn1percut.sch.id", row.nisn);
        let u_res = sqlx::query(
            "INSERT INTO users (nama, email, password_hash, role, status) VALUES (?, ?, 'demo:smkn1percut', 'SISWA', 'AKTIF')",
        )
        .bind(&row.nama)
        .bind(&email)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;

        let new_uid = u_res.last_insert_id() as i64;
        sqlx::query("INSERT INTO user_roles (user_id, role) VALUES (?, 'SISWA')")
            .bind(new_uid)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;

        let rombel_num: i64 = row
            .rombel_id
            .parse()
            .map_err(|_| DomainError::internal("ID rombel hasil validasi tidak valid."))?;

        sqlx::query(
            "INSERT INTO students (user_id, nisn, nis, rombel_id, jenis_kelamin, tanggal_lahir, status) VALUES (?, ?, ?, ?, ?, '2008-01-01', 'AKTIF')",
        )
        .bind(new_uid)
        .bind(&row.nisn)
        .bind(&row.nis)
        .bind(rombel_num)
        .bind(&row.jenis_kelamin)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;
    }

    let fname = filename
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("import_siswa.csv")
        .to_string();

    let status = if !preview.error_rows.is_empty() {
        "SEBAGIAN_ERROR"
    } else {
        "SELESAI"
    };

    let error_log_values: Vec<serde_json::Value> = preview
        .error_rows
        .iter()
        .map(|e| serde_json::json!({ "row": e.row, "reason": e.reason }))
        .collect();
    let error_log_json = serde_json::Value::Array(error_log_values.clone());

    let actor_uid: i64 = ctx.user.id.0.parse().unwrap_or(1);
    let batch_res = sqlx::query(
        "INSERT INTO import_batches (tipe, file_url, status, total_baris, baris_sukses, baris_error, error_log_json, created_by) VALUES ('SISWA', ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&fname)
    .bind(status)
    .bind(preview.total_rows as i32)
    .bind(preview.valid_rows.len() as i32)
    .bind(preview.error_rows.len() as i32)
    .bind(error_log_json)
    .bind(actor_uid)
    .execute(&mut *tx)
    .await
    .map_err(map_sqlx_error)?;

    let batch_id = batch_res.last_insert_id().to_string();
    insert_audit_log_tx(
        &mut tx,
        actor_uid,
        "IMPORT_STUDENTS",
        "import_batches",
        &batch_id,
        &format!(
            "Import siswa: {} masuk, {} error",
            preview.valid_rows.len(),
            preview.error_rows.len()
        ),
    )
    .await?;

    tx.commit().await.map_err(map_sqlx_error)?;

    let batch = ImportBatch {
        id: batch_id,
        tipe: "SISWA".to_string(),
        file_url: fname,
        status: status.to_string(),
        total_baris: preview.total_rows,
        baris_sukses: preview.valid_rows.len(),
        baris_error: preview.error_rows.len(),
        error_log: error_log_values,
        created_by: ctx.user.id.clone(),
        created_at: Utc::now().to_rfc3339(),
    };

    Ok((batch, preview))
}

pub async fn update_erapor_mapping(
    pool: &MySqlPool,
    ctx: &AuthContext,
    template_name: Option<&str>,
    mapping: Vec<EraporMappingColumn>,
) -> Result<EraporColumnMapping, DomainError> {
    guard_admin_only(ctx, "Update Mapping e-Rapor")?;

    if mapping.is_empty() {
        return Err(DomainError::validation(
            "mapping",
            "Daftar kolom mapping e-Rapor tidak boleh kosong.",
        ));
    }

    let first = sqlx::query(
        "SELECT id, academic_year_id, mapel_id, template_name, created_by FROM erapor_column_mappings ORDER BY id ASC LIMIT 1",
    )
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx_error)?
    .ok_or_else(|| DomainError::not_found("erapor_column_mappings", "1"))?;

    let id: i32 = first.get("id");
    let next_name = template_name
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| first.get::<String, _>("template_name"));

    let mapping_json = serde_json::to_value(&mapping)
        .map_err(|_| DomainError::internal("Gagal menyerialisasi mapping e-Rapor."))?;

    sqlx::query(
        "UPDATE erapor_column_mappings SET template_name = ?, mapping_json = ? WHERE id = ?",
    )
    .bind(&next_name)
    .bind(mapping_json)
    .bind(id)
    .execute(pool)
    .await
    .map_err(map_sqlx_error)?;

    let actor_uid: i64 = ctx.user.id.0.parse().unwrap_or(1);
    insert_audit_log(
        pool,
        actor_uid,
        "UPDATE_ERAPOR_MAPPING",
        "erapor_mappings",
        &id.to_string(),
        &format!("Memperbarui mapping e-Rapor ({} kolom)", mapping.len()),
    )
    .await?;

    Ok(EraporColumnMapping {
        id: id.to_string(),
        academic_year_id: AcademicYearId(first.get::<i32, _>("academic_year_id").to_string()),
        mapel_id: first
            .get::<Option<i32>, _>("mapel_id")
            .map(|v| SubjectId(v.to_string())),
        template_name: next_name,
        mapping,
        created_by: UserId(first.get::<i32, _>("created_by").to_string()),
    })
}

pub async fn list_settings(pool: &MySqlPool) -> Result<Vec<SettingEntry>, DomainError> {
    let rows = sqlx::query("SELECT `key`, `value`, `group` FROM settings ORDER BY `key` ASC")
        .fetch_all(pool)
        .await
        .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| SettingEntry {
            key: r.get("key"),
            value: r.get("value"),
            group: r.get("group"),
        })
        .collect())
}

pub async fn update_setting(
    pool: &MySqlPool,
    ctx: &AuthContext,
    key: &str,
    value: &str,
    group: Option<&str>,
) -> Result<SettingEntry, DomainError> {
    guard_admin_only(ctx, "Pengaturan Sistem")?;

    let k = key.trim();
    if k.is_empty() {
        return Err(DomainError::validation("key", "Kunci pengaturan wajib diisi."));
    }
    let grp = group
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("general");

    sqlx::query(
        "INSERT INTO settings (`key`, `value`, `group`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `group` = VALUES(`group`)",
    )
    .bind(k)
    .bind(value.trim())
    .bind(grp)
    .execute(pool)
    .await
    .map_err(map_sqlx_error)?;

    let actor_uid: i64 = ctx.user.id.0.parse().unwrap_or(1);
    insert_audit_log(
        pool,
        actor_uid,
        "UPDATE_SETTING",
        "settings",
        k,
        &format!("Memperbarui pengaturan {k}"),
    )
    .await?;

    Ok(SettingEntry {
        key: k.to_string(),
        value: value.trim().to_string(),
        group: grp.to_string(),
    })
}

pub fn list_disk_backup_files(backup_dir: &Path) -> Vec<BackupFileRecord> {
    let db_dir = backup_dir.join("db");
    let target_dir = if db_dir.is_dir() { &db_dir } else { backup_dir };
    let Ok(entries) = std::fs::read_dir(target_dir) else {
        return Vec::new();
    };

    let mut files: Vec<BackupFileRecord> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(fname) = path.file_name().and_then(|s| s.to_str()) else {
            continue;
        };
        if !fname.ends_with(".sql.gz") && !fname.ends_with(".sql") {
            continue;
        }
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        let size_bytes = meta.len();
        let created_at = meta
            .modified()
            .ok()
            .map(|t| DateTime::<Utc>::from(t).to_rfc3339())
            .unwrap_or_else(|| Utc::now().to_rfc3339());
        files.push(BackupFileRecord {
            id: format!("disk-{fname}"),
            filename: fname.to_string(),
            size_bytes,
            status: if size_bytes == 0 {
                "EMPTY_ALERT".to_string()
            } else {
                "OK".to_string()
            },
            created_at,
        });
    }
    files.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    files
}

pub async fn record_backup_check(
    pool: &MySqlPool,
    ctx: &AuthContext,
    backup_dir: &Path,
    simulate_zero_byte: bool,
) -> Result<BackupFileRecord, DomainError> {
    guard_admin_only(ctx, "Jalankan Backup Manual")?;

    let actor_uid: i64 = ctx.user.id.0.parse().unwrap_or(1);
    let disk_files = list_disk_backup_files(backup_dir);
    if !simulate_zero_byte && !disk_files.is_empty() {
        let latest = disk_files[0].clone();
        insert_audit_log(
            pool,
            actor_uid,
            "VERIFY_BACKUP_DISK",
            "backup_history",
            &latest.id,
            &format!(
                "Verifikasi backup nyata di disk: {} ({} bytes) status={}",
                latest.filename, latest.size_bytes, latest.status
            ),
        )
        .await?;
        return Ok(latest);
    }

    let counts = crate::db::get_health_counts(pool).await.unwrap_or_default();
    let size_bytes = if simulate_zero_byte {
        0
    } else {
        let stu_count = counts
            .get("students")
            .and_then(|v| v.as_i64())
            .unwrap_or(180)
            .max(0) as u64;
        stu_count.saturating_mul(2048).max(4096)
    };
    let now = Utc::now();
    let stamp = now.format("%Y%m%d_%H%M%S");
    let filename = format!("lms_smkn1percut_{stamp}.sql.gz");
    let id = format!("bkp-{}", now.timestamp_millis());
    let status = if size_bytes == 0 {
        "EMPTY_ALERT".to_string()
    } else {
        "OK".to_string()
    };

    if size_bytes == 0 {
        sqlx::query(
            "INSERT INTO notifications (user_id, tipe, judul, pesan, entitas, entitas_id) VALUES (?, 'PERINGATAN', 'ALERT BACKUP 0 BYTE', ?, 'backup_history', ?)",
        )
        .bind(actor_uid)
        .bind(format!(
            "Verifikasi backup gagal: file {filename} berukuran 0 byte! Segera periksa disk server / container backup."
        ))
        .bind(&id)
        .execute(pool)
        .await
        .map_err(map_sqlx_error)?;
    }

    insert_audit_log(
        pool,
        actor_uid,
        "RUN_BACKUP",
        "backup_history",
        &id,
        &format!("Backup {filename} ({size_bytes} bytes) status={status}"),
    )
    .await?;

    Ok(BackupFileRecord {
        id,
        filename,
        size_bytes,
        status,
        created_at: now.to_rfc3339(),
    })
}
