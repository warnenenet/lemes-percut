use chrono::{DateTime, NaiveDate, Utc};
use lms_domain::attendance::{
    apply_teacher_attendance_override, evaluate_session_access, ActivityPayload,
};
use lms_domain::rbac::{
    can_clone_between_assignments, guard_teacher_assignment_ownership, AuthContext,
};
use lms_domain::types::*;
use lms_domain::DomainError;
use rust_decimal::Decimal;
use sqlx::{MySqlPool, Row};

use crate::error::map_sqlx_error;
use crate::repositories::user_access::get_teacher_assignment_by_id;

pub async fn list_modules(pool: &MySqlPool) -> Result<Vec<LearningModule>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, teacher_assignment_id, judul, konten, status, cloned_from, updated_at FROM modules ORDER BY id DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| LearningModule {
            id: ModuleId(r.get::<i32, _>("id").to_string()),
            teacher_assignment_id: AssignmentId(r.get::<i32, _>("teacher_assignment_id").to_string()),
            judul: r.get("judul"),
            konten: r.get("konten"),
            status: DocumentStatus::from_db(&r.get::<String, _>("status")),
            cloned_from: r
                .get::<Option<i32>, _>("cloned_from")
                .map(|id| ModuleId(id.to_string())),
            updated_at: r
                .get::<DateTime<Utc>, _>("updated_at")
                .to_rfc3339(),
        })
        .collect())
}

pub async fn list_sessions(pool: &MySqlPool) -> Result<Vec<TeachingSession>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, teacher_assignment_id, pertemuan_ke, tanggal, jam_mulai, jam_selesai, tipe_sesi, topik, module_id, minimum_read_pct, status FROM sessions ORDER BY id DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| TeachingSession {
            id: SessionId(r.get::<i32, _>("id").to_string()),
            teacher_assignment_id: AssignmentId(r.get::<i32, _>("teacher_assignment_id").to_string()),
            pertemuan_ke: r.get::<i32, _>("pertemuan_ke") as u32,
            tanggal: r
                .get::<NaiveDate, _>("tanggal")
                .format("%Y-%m-%d")
                .to_string(),
            jam_mulai: r.get("jam_mulai"),
            jam_selesai: r.get("jam_selesai"),
            tipe_sesi: SessionType::from_db(&r.get::<String, _>("tipe_sesi")),
            topik: r.get("topik"),
            module_id: r
                .get::<Option<i32>, _>("module_id")
                .map(|id| ModuleId(id.to_string())),
            minimum_read_pct: r.get::<i32, _>("minimum_read_pct") as u8,
            status: SessionStatus::from_db(&r.get::<String, _>("status")),
        })
        .collect())
}

pub async fn list_attendance_records(
    pool: &MySqlPool,
) -> Result<Vec<AttendanceRecord>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, session_id, student_id, status, aktivitas_minimum_terpenuhi, read_pct, submitted_task, submitted_reflection, diakses_pada, diaktifkan_pada, override_oleh, alasan_override FROM attendance_records ORDER BY id DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| AttendanceRecord {
            id: r.get::<i32, _>("id").to_string(),
            session_id: SessionId(r.get::<i32, _>("session_id").to_string()),
            student_id: StudentId(r.get::<i32, _>("student_id").to_string()),
            status: AttendanceStatus::from_db(&r.get::<String, _>("status")),
            aktivitas_minimum_terpenuhi: r.get("aktivitas_minimum_terpenuhi"),
            read_pct: r.get::<i32, _>("read_pct") as u8,
            submitted_task: r.get("submitted_task"),
            submitted_reflection: r.get("submitted_reflection"),
            diakses_pada: r
                .try_get::<Option<DateTime<Utc>>, _>("diakses_pada")
                .ok()
                .flatten()
                .map(|dt| dt.to_rfc3339()),
            diaktifkan_pada: r
                .try_get::<Option<DateTime<Utc>>, _>("diaktifkan_pada")
                .ok()
                .flatten()
                .map(|dt| dt.to_rfc3339()),
            override_oleh: r
                .get::<Option<i32>, _>("override_oleh")
                .map(|v| UserId(v.to_string())),
            alasan_override: r.get("alasan_override"),
        })
        .collect())
}

pub async fn list_assignments(pool: &MySqlPool) -> Result<Vec<AssignmentTask>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, session_id, teacher_assignment_id, judul, deskripsi, deadline, tipe, rubrik, cloned_from FROM assignments ORDER BY id DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| AssignmentTask {
            id: TaskId(r.get::<i32, _>("id").to_string()),
            session_id: r
                .get::<Option<i32>, _>("session_id")
                .map(|v| SessionId(v.to_string())),
            teacher_assignment_id: AssignmentId(r.get::<i32, _>("teacher_assignment_id").to_string()),
            judul: r.get("judul"),
            deskripsi: r.get("deskripsi"),
            deadline: r.get::<DateTime<Utc>, _>("deadline").to_rfc3339(),
            tipe: TaskType::from_db(&r.get::<String, _>("tipe")),
            rubrik: r.get("rubrik"),
            cloned_from: r
                .get::<Option<i32>, _>("cloned_from")
                .map(|v| TaskId(v.to_string())),
        })
        .collect())
}

pub async fn list_submissions(pool: &MySqlPool) -> Result<Vec<TaskSubmission>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, assignment_id, student_id, file_url, teks, submitted_at, nilai, dinilai_oleh, catatan_guru FROM submissions ORDER BY id DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| TaskSubmission {
            id: r.get::<i32, _>("id").to_string(),
            assignment_id: TaskId(r.get::<i32, _>("assignment_id").to_string()),
            student_id: StudentId(r.get::<i32, _>("student_id").to_string()),
            file_url: r.get("file_url"),
            teks: r.get("teks"),
            submitted_at: r.get::<DateTime<Utc>, _>("submitted_at").to_rfc3339(),
            nilai: r.get("nilai"),
            dinilai_oleh: r
                .get::<Option<i32>, _>("dinilai_oleh")
                .map(|v| TeacherId(v.to_string())),
            catatan_guru: r.get("catatan_guru"),
        })
        .collect())
}

pub struct CreateSessionInput<'a> {
    pub teacher_assignment_id: &'a str,
    pub topik: &'a str,
    pub tanggal: Option<&'a str>,
    pub jam_mulai: &'a str,
    pub jam_selesai: &'a str,
    pub tipe_sesi: SessionType,
    pub module_id: Option<&'a str>,
    pub minimum_read_pct: u8,
}

pub async fn create_session(
    pool: &MySqlPool,
    ctx: &AuthContext,
    input: CreateSessionInput<'_>,
) -> Result<TeachingSession, DomainError> {
    let ta_id: i64 = input
        .teacher_assignment_id
        .parse()
        .map_err(|_| DomainError::not_found("teacher_assignment", input.teacher_assignment_id))?;
    let ta = get_teacher_assignment_by_id(pool, ta_id).await?;
    guard_teacher_assignment_ownership(ctx, ta.as_ref(), "sesi pembelajaran")?;

    if input.topik.trim().len() < 3 {
        return Err(DomainError::validation(
            "topik",
            "Topik sesi wajib diisi minimal 3 karakter.",
        ));
    }

    let date_str = input
        .tanggal
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| Utc::now().format("%Y-%m-%d").to_string());
    let mod_num: Option<i64> = input.module_id.and_then(|s| s.parse().ok());

    let mut tx = pool.begin().await.map_err(map_sqlx_error)?;
    let max_pertemuan: Option<i32> = sqlx::query_scalar(
        "SELECT MAX(pertemuan_ke) FROM sessions WHERE teacher_assignment_id = ?",
    )
    .bind(ta_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_sqlx_error)?;
    let next_pertemuan = max_pertemuan.unwrap_or(0) + 1;

    let res = sqlx::query(
        "INSERT INTO sessions (teacher_assignment_id, pertemuan_ke, tanggal, jam_mulai, jam_selesai, tipe_sesi, topik, module_id, minimum_read_pct, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')",
    )
    .bind(ta_id)
    .bind(next_pertemuan)
    .bind(&date_str)
    .bind(input.jam_mulai.trim())
    .bind(input.jam_selesai.trim())
    .bind(input.tipe_sesi.as_str())
    .bind(input.topik.trim())
    .bind(mod_num)
    .bind(input.minimum_read_pct as i32)
    .execute(&mut *tx)
    .await
    .map_err(map_sqlx_error)?;

    let new_id = res.last_insert_id();
    tx.commit().await.map_err(map_sqlx_error)?;

    Ok(TeachingSession {
        id: SessionId(new_id.to_string()),
        teacher_assignment_id: AssignmentId(ta_id.to_string()),
        pertemuan_ke: next_pertemuan as u32,
        tanggal: date_str,
        jam_mulai: input.jam_mulai.trim().to_string(),
        jam_selesai: input.jam_selesai.trim().to_string(),
        tipe_sesi: input.tipe_sesi,
        topik: input.topik.trim().to_string(),
        module_id: mod_num.map(|m| ModuleId(m.to_string())),
        status: SessionStatus::Open,
        minimum_read_pct: input.minimum_read_pct,
    })
}

pub async fn update_session_status(
    pool: &MySqlPool,
    ctx: &AuthContext,
    session_id: &str,
    status: SessionStatus,
) -> Result<(), DomainError> {
    let ses_id: i64 = session_id
        .parse()
        .map_err(|_| DomainError::not_found("session", session_id))?;

    let row = sqlx::query("SELECT teacher_assignment_id FROM sessions WHERE id = ? LIMIT 1")
        .bind(ses_id)
        .fetch_optional(pool)
        .await
        .map_err(map_sqlx_error)?
        .ok_or_else(|| DomainError::not_found("session", session_id))?;

    let ta_id = row.get::<i32, _>("teacher_assignment_id") as i64;
    let ta = get_teacher_assignment_by_id(pool, ta_id).await?;
    guard_teacher_assignment_ownership(ctx, ta.as_ref(), "status sesi")?;

    sqlx::query("UPDATE sessions SET status = ? WHERE id = ?")
        .bind(status.as_str())
        .bind(ses_id)
        .execute(pool)
        .await
        .map_err(map_sqlx_error)?;

    Ok(())
}

pub async fn record_session_access(
    pool: &MySqlPool,
    ctx: &AuthContext,
    session_id: &str,
    read_pct: u8,
    submitted_task: bool,
    submitted_reflection: bool,
    simulated_time_hhmm: Option<&str>,
) -> Result<AttendanceRecord, DomainError> {
    let Some(student) = &ctx.student else {
        return Err(DomainError::forbidden(
            "Hanya siswa yang dapat mencatat kehadiran sesi.",
            "SISWA:ACCESS_SESSION",
        ));
    };
    if ctx.active_role != UserRole::Siswa {
        return Err(DomainError::forbidden(
            "Hanya siswa yang dapat mencatat kehadiran sesi.",
            "SISWA:ACCESS_SESSION",
        ));
    }

    let ses_id: i64 = session_id
        .parse()
        .map_err(|_| DomainError::not_found("session", session_id))?;

    let s_row = sqlx::query(
        "SELECT id, teacher_assignment_id, pertemuan_ke, tanggal, jam_mulai, jam_selesai, tipe_sesi, topik, module_id, status, minimum_read_pct FROM sessions WHERE id = ? LIMIT 1",
    )
    .bind(ses_id)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx_error)?
    .ok_or_else(|| DomainError::not_found("session", session_id))?;

    let ses = TeachingSession {
        id: SessionId(s_row.get::<i32, _>("id").to_string()),
        teacher_assignment_id: AssignmentId(s_row.get::<i32, _>("teacher_assignment_id").to_string()),
        pertemuan_ke: s_row.get::<i32, _>("pertemuan_ke") as u32,
        tanggal: s_row
            .get::<NaiveDate, _>("tanggal")
            .format("%Y-%m-%d")
            .to_string(),
        jam_mulai: s_row.get("jam_mulai"),
        jam_selesai: s_row.get("jam_selesai"),
        tipe_sesi: SessionType::from_db(&s_row.get::<String, _>("tipe_sesi")),
        topik: s_row.get("topik"),
        module_id: s_row
            .get::<Option<i32>, _>("module_id")
            .map(|v| ModuleId(v.to_string())),
        status: SessionStatus::from_db(&s_row.get::<String, _>("status")),
        minimum_read_pct: s_row.get::<i32, _>("minimum_read_pct") as u8,
    };

    let stu_id_num: i64 = student
        .id
        .0
        .parse()
        .map_err(|_| DomainError::internal("ID siswa tidak valid."))?;

    let mut tx = pool.begin().await.map_err(map_sqlx_error)?;
    let existing_row = sqlx::query(
        "SELECT id, session_id, student_id, status, aktivitas_minimum_terpenuhi, read_pct, submitted_task, submitted_reflection, diakses_pada, diaktifkan_pada, override_oleh, alasan_override FROM attendance_records WHERE session_id = ? AND student_id = ? LIMIT 1",
    )
    .bind(ses_id)
    .bind(stu_id_num)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_sqlx_error)?;

    let existing = existing_row.map(|r| AttendanceRecord {
        id: r.get::<i32, _>("id").to_string(),
        session_id: SessionId(r.get::<i32, _>("session_id").to_string()),
        student_id: StudentId(r.get::<i32, _>("student_id").to_string()),
        status: AttendanceStatus::from_db(&r.get::<String, _>("status")),
        aktivitas_minimum_terpenuhi: r.get("aktivitas_minimum_terpenuhi"),
        read_pct: r.get::<i32, _>("read_pct") as u8,
        submitted_task: r.get("submitted_task"),
        submitted_reflection: r.get("submitted_reflection"),
        diakses_pada: r
            .try_get::<Option<DateTime<Utc>>, _>("diakses_pada")
            .ok()
            .flatten()
            .map(|dt| dt.to_rfc3339()),
        diaktifkan_pada: r
            .try_get::<Option<DateTime<Utc>>, _>("diaktifkan_pada")
            .ok()
            .flatten()
            .map(|dt| dt.to_rfc3339()),
        override_oleh: r
            .get::<Option<i32>, _>("override_oleh")
            .map(|v| UserId(v.to_string())),
        alasan_override: r.get("alasan_override"),
    });

    let now = Utc::now();
    let hhmm = simulated_time_hhmm
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| now.format("%H:%M").to_string());

    let computed = evaluate_session_access(
        existing.as_ref(),
        &ses,
        &student.id,
        &hhmm,
        &now.to_rfc3339(),
        ActivityPayload {
            read_pct,
            submitted_task,
            submitted_reflection,
        },
    )?;

    sqlx::query(
        r#"
        INSERT INTO attendance_records
          (session_id, student_id, status, aktivitas_minimum_terpenuhi, read_pct, submitted_task, submitted_reflection, diakses_pada, diaktifkan_pada)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), IF(? = 1, NOW(), NULL))
        ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          aktivitas_minimum_terpenuhi = VALUES(aktivitas_minimum_terpenuhi),
          read_pct = VALUES(read_pct),
          submitted_task = VALUES(submitted_task),
          submitted_reflection = VALUES(submitted_reflection),
          diaktifkan_pada = COALESCE(attendance_records.diaktifkan_pada, VALUES(diaktifkan_pada))
        "#,
    )
    .bind(ses_id)
    .bind(stu_id_num)
    .bind(computed.status.as_str())
    .bind(computed.aktivitas_minimum_terpenuhi)
    .bind(computed.read_pct as i32)
    .bind(computed.submitted_task)
    .bind(computed.submitted_reflection)
    .bind(if computed.aktivitas_minimum_terpenuhi { 1_i32 } else { 0_i32 })
    .execute(&mut *tx)
    .await
    .map_err(map_sqlx_error)?;

    tx.commit().await.map_err(map_sqlx_error)?;
    Ok(computed)
}

pub async fn override_session_attendance(
    pool: &MySqlPool,
    ctx: &AuthContext,
    session_id: &str,
    student_id: &str,
    new_status: AttendanceStatus,
    alasan: &str,
) -> Result<AttendanceRecord, DomainError> {
    let ses_id: i64 = session_id
        .parse()
        .map_err(|_| DomainError::not_found("session", session_id))?;
    let stu_id: i64 = student_id
        .parse()
        .map_err(|_| DomainError::not_found("student", student_id))?;

    let ses_row = sqlx::query("SELECT teacher_assignment_id FROM sessions WHERE id = ? LIMIT 1")
        .bind(ses_id)
        .fetch_optional(pool)
        .await
        .map_err(map_sqlx_error)?
        .ok_or_else(|| DomainError::not_found("session", session_id))?;

    let ta_id = ses_row.get::<i32, _>("teacher_assignment_id") as i64;
    let ta = get_teacher_assignment_by_id(pool, ta_id).await?;
    guard_teacher_assignment_ownership(ctx, ta.as_ref(), "override absensi")?;

    let existing_row = sqlx::query(
        "SELECT id, session_id, student_id, status, aktivitas_minimum_terpenuhi, read_pct, submitted_task, submitted_reflection, diakses_pada, diaktifkan_pada, override_oleh, alasan_override FROM attendance_records WHERE session_id = ? AND student_id = ? LIMIT 1",
    )
    .bind(ses_id)
    .bind(stu_id)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx_error)?;

    let existing = existing_row.map(|r| AttendanceRecord {
        id: r.get::<i32, _>("id").to_string(),
        session_id: SessionId(r.get::<i32, _>("session_id").to_string()),
        student_id: StudentId(r.get::<i32, _>("student_id").to_string()),
        status: AttendanceStatus::from_db(&r.get::<String, _>("status")),
        aktivitas_minimum_terpenuhi: r.get("aktivitas_minimum_terpenuhi"),
        read_pct: r.get::<i32, _>("read_pct") as u8,
        submitted_task: r.get("submitted_task"),
        submitted_reflection: r.get("submitted_reflection"),
        diakses_pada: None,
        diaktifkan_pada: None,
        override_oleh: r
            .get::<Option<i32>, _>("override_oleh")
            .map(|v| UserId(v.to_string())),
        alasan_override: r.get("alasan_override"),
    });

    let now_iso = Utc::now().to_rfc3339();
    let updated = apply_teacher_attendance_override(
        existing.as_ref(),
        &SessionId(ses_id.to_string()),
        &StudentId(stu_id.to_string()),
        new_status,
        &ctx.user.id,
        alasan,
        &now_iso,
    )?;

    let override_uid: i64 = ctx
        .user
        .id
        .0
        .parse()
        .map_err(|_| DomainError::internal("ID pengguna tidak valid."))?;

    sqlx::query(
        r#"
        INSERT INTO attendance_records
          (session_id, student_id, status, aktivitas_minimum_terpenuhi, read_pct, submitted_task, submitted_reflection, diakses_pada, override_oleh, alasan_override)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)
        ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          aktivitas_minimum_terpenuhi = VALUES(aktivitas_minimum_terpenuhi),
          override_oleh = VALUES(override_oleh),
          alasan_override = VALUES(alasan_override)
        "#,
    )
    .bind(ses_id)
    .bind(stu_id)
    .bind(updated.status.as_str())
    .bind(updated.aktivitas_minimum_terpenuhi)
    .bind(updated.read_pct as i32)
    .bind(updated.submitted_task)
    .bind(updated.submitted_reflection)
    .bind(override_uid)
    .bind(updated.alasan_override.as_deref())
    .execute(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(updated)
}

pub async fn create_module(
    pool: &MySqlPool,
    ctx: &AuthContext,
    teacher_assignment_id: &str,
    judul: &str,
    konten: &str,
    status: DocumentStatus,
) -> Result<LearningModule, DomainError> {
    let ta_id: i64 = teacher_assignment_id
        .parse()
        .map_err(|_| DomainError::not_found("teacher_assignment", teacher_assignment_id))?;
    let ta = get_teacher_assignment_by_id(pool, ta_id).await?;
    guard_teacher_assignment_ownership(ctx, ta.as_ref(), "modul pembelajaran")?;

    if judul.trim().len() < 3 {
        return Err(DomainError::validation("judul", "Judul modul wajib diisi."));
    }

    let res = sqlx::query(
        "INSERT INTO modules (teacher_assignment_id, judul, konten, status) VALUES (?, ?, ?, ?)",
    )
    .bind(ta_id)
    .bind(judul.trim())
    .bind(konten)
    .bind(status.as_str())
    .execute(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(LearningModule {
        id: ModuleId(res.last_insert_id().to_string()),
        teacher_assignment_id: AssignmentId(ta_id.to_string()),
        judul: judul.trim().to_string(),
        konten: konten.to_string(),
        status,
        cloned_from: None,
        updated_at: Utc::now().to_rfc3339(),
    })
}

pub async fn clone_module(
    pool: &MySqlPool,
    ctx: &AuthContext,
    source_module_id: &str,
    target_assignment_id: &str,
) -> Result<LearningModule, DomainError> {
    let src_id: i64 = source_module_id
        .parse()
        .map_err(|_| DomainError::not_found("module", source_module_id))?;
    let target_ta_id: i64 = target_assignment_id
        .parse()
        .map_err(|_| DomainError::not_found("teacher_assignment", target_assignment_id))?;

    let src_row = sqlx::query(
        "SELECT id, teacher_assignment_id, judul, konten, status FROM modules WHERE id = ? LIMIT 1",
    )
    .bind(src_id)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx_error)?
    .ok_or_else(|| DomainError::not_found("module", source_module_id))?;

    let src_ta_id = src_row.get::<i32, _>("teacher_assignment_id") as i64;
    let src_ta = get_teacher_assignment_by_id(pool, src_ta_id).await?;
    let tgt_ta = get_teacher_assignment_by_id(pool, target_ta_id).await?;

    let teacher_id = ctx
        .teacher
        .as_ref()
        .map(|t| t.id.0.as_str())
        .unwrap_or("");
    can_clone_between_assignments(teacher_id, src_ta.as_ref(), tgt_ta.as_ref())?;

    let judul: String = src_row.get("judul");
    let konten: String = src_row.get("konten");
    let res = sqlx::query(
        "INSERT INTO modules (teacher_assignment_id, judul, konten, status, cloned_from) VALUES (?, ?, ?, 'DRAFT', ?)",
    )
    .bind(target_ta_id)
    .bind(&judul)
    .bind(&konten)
    .bind(src_id)
    .execute(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(LearningModule {
        id: ModuleId(res.last_insert_id().to_string()),
        teacher_assignment_id: AssignmentId(target_ta_id.to_string()),
        judul,
        konten,
        status: DocumentStatus::Draft,
        cloned_from: Some(ModuleId(src_id.to_string())),
        updated_at: Utc::now().to_rfc3339(),
    })
}

pub struct CreateTaskInput<'a> {
    pub teacher_assignment_id: &'a str,
    pub session_id: Option<&'a str>,
    pub judul: &'a str,
    pub deskripsi: &'a str,
    pub deadline_iso: Option<&'a str>,
    pub tipe: TaskType,
    pub rubrik: Option<&'a str>,
}

pub async fn create_task(
    pool: &MySqlPool,
    ctx: &AuthContext,
    input: CreateTaskInput<'_>,
) -> Result<AssignmentTask, DomainError> {
    let ta_id: i64 = input
        .teacher_assignment_id
        .parse()
        .map_err(|_| DomainError::not_found("teacher_assignment", input.teacher_assignment_id))?;
    let ta = get_teacher_assignment_by_id(pool, ta_id).await?;
    guard_teacher_assignment_ownership(ctx, ta.as_ref(), "tugas pembelajaran")?;

    if input.judul.trim().len() < 3 {
        return Err(DomainError::validation("judul", "Judul tugas wajib diisi."));
    }

    let deadline_dt = input
        .deadline_iso
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(|| Utc::now() + chrono::Duration::days(7));
    let ses_num: Option<i64> = input.session_id.and_then(|s| s.parse().ok());

    let res = sqlx::query(
        "INSERT INTO assignments (session_id, teacher_assignment_id, judul, deskripsi, deadline, tipe, rubrik) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(ses_num)
    .bind(ta_id)
    .bind(input.judul.trim())
    .bind(input.deskripsi.trim())
    .bind(deadline_dt)
    .bind(input.tipe.as_str())
    .bind(input.rubrik)
    .execute(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(AssignmentTask {
        id: TaskId(res.last_insert_id().to_string()),
        session_id: ses_num.map(|v| SessionId(v.to_string())),
        teacher_assignment_id: AssignmentId(ta_id.to_string()),
        judul: input.judul.trim().to_string(),
        deskripsi: input.deskripsi.trim().to_string(),
        deadline: deadline_dt.to_rfc3339(),
        tipe: input.tipe,
        rubrik: input.rubrik.map(str::to_string),
        cloned_from: None,
    })
}

pub async fn submit_task(
    pool: &MySqlPool,
    ctx: &AuthContext,
    task_id: &str,
    teks: &str,
    file_url: Option<&str>,
) -> Result<TaskSubmission, DomainError> {
    let Some(student) = &ctx.student else {
        return Err(DomainError::forbidden(
            "Hanya siswa yang dapat mengumpulkan tugas.",
            "SISWA:SUBMIT_TASK",
        ));
    };
    let aid: i64 = task_id
        .parse()
        .map_err(|_| DomainError::not_found("assignment", task_id))?;
    let stu_id: i64 = student
        .id
        .0
        .parse()
        .map_err(|_| DomainError::internal("ID siswa tidak valid."))?;

    sqlx::query("SELECT id FROM assignments WHERE id = ? LIMIT 1")
        .bind(aid)
        .fetch_optional(pool)
        .await
        .map_err(map_sqlx_error)?
        .ok_or_else(|| DomainError::not_found("assignment", task_id))?;

    let mut tx = pool.begin().await.map_err(map_sqlx_error)?;
    sqlx::query(
        r#"
        INSERT INTO submissions (assignment_id, student_id, file_url, teks, submitted_at)
        VALUES (?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          file_url = VALUES(file_url),
          teks = VALUES(teks),
          submitted_at = NOW()
        "#,
    )
    .bind(aid)
    .bind(stu_id)
    .bind(file_url)
    .bind(teks)
    .execute(&mut *tx)
    .await
    .map_err(map_sqlx_error)?;

    let row = sqlx::query(
        "SELECT id, assignment_id, student_id, file_url, teks, submitted_at, nilai, dinilai_oleh, catatan_guru FROM submissions WHERE assignment_id = ? AND student_id = ? LIMIT 1",
    )
    .bind(aid)
    .bind(stu_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_sqlx_error)?;

    tx.commit().await.map_err(map_sqlx_error)?;

    Ok(TaskSubmission {
        id: row.get::<i32, _>("id").to_string(),
        assignment_id: TaskId(aid.to_string()),
        student_id: student.id.clone(),
        file_url: row.get("file_url"),
        teks: row.get("teks"),
        submitted_at: row.get::<DateTime<Utc>, _>("submitted_at").to_rfc3339(),
        nilai: row.get("nilai"),
        dinilai_oleh: row
            .get::<Option<i32>, _>("dinilai_oleh")
            .map(|v| TeacherId(v.to_string())),
        catatan_guru: row.get("catatan_guru"),
    })
}

pub async fn grade_submission(
    pool: &MySqlPool,
    ctx: &AuthContext,
    submission_id: &str,
    nilai: Decimal,
    catatan_guru: Option<&str>,
) -> Result<TaskSubmission, DomainError> {
    let sub_id: i64 = submission_id
        .parse()
        .map_err(|_| DomainError::not_found("submission", submission_id))?;

    let row = sqlx::query(
        "SELECT s.id, s.assignment_id, a.teacher_assignment_id FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE s.id = ? LIMIT 1",
    )
    .bind(sub_id)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx_error)?
    .ok_or_else(|| DomainError::not_found("submission", submission_id))?;

    let ta_id = row.get::<i32, _>("teacher_assignment_id") as i64;
    let ta = get_teacher_assignment_by_id(pool, ta_id).await?;
    guard_teacher_assignment_ownership(ctx, ta.as_ref(), "penilaian tugas")?;

    let zero = Decimal::ZERO;
    let hundred = Decimal::new(100, 0);
    if nilai < zero || nilai > hundred {
        return Err(DomainError::validation(
            "nilai",
            "Nilai tugas harus berada pada rentang 0 sampai 100.",
        ));
    }

    let teacher_num: Option<i64> = ctx.teacher.as_ref().and_then(|t| t.id.0.parse().ok());
    sqlx::query(
        "UPDATE submissions SET nilai = ?, dinilai_oleh = ?, catatan_guru = ? WHERE id = ?",
    )
    .bind(nilai.round_dp(2))
    .bind(teacher_num)
    .bind(catatan_guru)
    .bind(sub_id)
    .execute(pool)
    .await
    .map_err(map_sqlx_error)?;

    let updated = sqlx::query(
        "SELECT id, assignment_id, student_id, file_url, teks, submitted_at, nilai, dinilai_oleh, catatan_guru FROM submissions WHERE id = ? LIMIT 1",
    )
    .bind(sub_id)
    .fetch_one(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(TaskSubmission {
        id: updated.get::<i32, _>("id").to_string(),
        assignment_id: TaskId(updated.get::<i32, _>("assignment_id").to_string()),
        student_id: StudentId(updated.get::<i32, _>("student_id").to_string()),
        file_url: updated.get("file_url"),
        teks: updated.get("teks"),
        submitted_at: updated.get::<DateTime<Utc>, _>("submitted_at").to_rfc3339(),
        nilai: updated.get("nilai"),
        dinilai_oleh: updated
            .get::<Option<i32>, _>("dinilai_oleh")
            .map(|v| TeacherId(v.to_string())),
        catatan_guru: updated.get("catatan_guru"),
    })
}
