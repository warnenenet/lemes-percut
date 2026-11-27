use chrono::{DateTime, Utc};
use lms_domain::cbt::{
    grade_student_exam_answers, validate_exam_no_student_overlap, verify_exam_token,
    ExamGradeSummary,
};
use lms_domain::rbac::{
    guard_susulan_exam_creation, guard_teacher_assignment_ownership, AuthContext,
};
use lms_domain::types::*;
use lms_domain::DomainError;
use sqlx::{Connection, MySqlPool, Row};
use uuid::Uuid;

use crate::error::map_sqlx_error;
use crate::repositories::master::list_rombels;
use crate::repositories::system_audit::insert_audit_log_tx;
use crate::repositories::user_access::{
    get_teacher_assignment_by_id, list_students, list_teacher_assignments, list_users,
};

fn json_value_to_answer_str(val: serde_json::Value) -> String {
    match val {
        serde_json::Value::String(s) => s,
        other => other.to_string(),
    }
}

pub async fn list_question_banks(pool: &MySqlPool) -> Result<Vec<QuestionBank>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, subject_id, teacher_id, judul, kurikulum_acuan FROM question_banks ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| QuestionBank {
            id: r.get::<i32, _>("id").to_string(),
            subject_id: SubjectId(r.get::<i32, _>("subject_id").to_string()),
            teacher_id: TeacherId(r.get::<i32, _>("teacher_id").to_string()),
            judul: r.get("judul"),
            kurikulum_acuan: CurriculumTrack::from_db(&r.get::<String, _>("kurikulum_acuan")),
        })
        .collect())
}

pub async fn list_questions(pool: &MySqlPool) -> Result<Vec<Question>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, bank_id, tipe, stem, options_json, jawaban_json, rubrik, skor, level_kognitif FROM questions ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| {
            let options_val: serde_json::Value = r.get("options_json");
            let options: Vec<String> = serde_json::from_value(options_val).unwrap_or_default();
            let jawaban_val: serde_json::Value = r.get("jawaban_json");
            Question {
                id: r.get::<i32, _>("id").to_string(),
                bank_id: r.get::<i32, _>("bank_id").to_string(),
                tipe: QuestionType::from_db(&r.get::<String, _>("tipe")),
                stem: r.get("stem"),
                options,
                jawaban: json_value_to_answer_str(jawaban_val),
                rubrik: r.get::<Option<String>, _>("rubrik").unwrap_or_default(),
                skor: r.get("skor"),
                level_kognitif: r.get("level_kognitif"),
            }
        })
        .collect())
}

pub async fn list_exams(pool: &MySqlPool) -> Result<Vec<Exam>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, teacher_assignment_id, tipe, judul, waktu_mulai, durasi_menit, token, status, parent_exam_id, target_student_ids_json FROM exams ORDER BY id DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| {
            let target_json: Option<serde_json::Value> = r.get("target_student_ids_json");
            let target_student_ids = target_json.and_then(|v| {
                serde_json::from_value::<Vec<String>>(v)
                    .ok()
                    .map(|ids| ids.into_iter().map(StudentId).collect())
            });
            Exam {
                id: ExamId(r.get::<i32, _>("id").to_string()),
                teacher_assignment_id: AssignmentId(
                    r.get::<i32, _>("teacher_assignment_id").to_string(),
                ),
                tipe: ExamType::from_db(&r.get::<String, _>("tipe")),
                judul: r.get("judul"),
                waktu_mulai: r.get::<DateTime<Utc>, _>("waktu_mulai").to_rfc3339(),
                durasi_menit: r.get::<i32, _>("durasi_menit") as i64,
                token: r.get("token"),
                status: ExamStatus::from_db(&r.get::<String, _>("status")),
                parent_exam_id: r
                    .get::<Option<i32>, _>("parent_exam_id")
                    .map(|id| ExamId(id.to_string())),
                target_student_ids,
            }
        })
        .collect())
}

pub async fn list_exam_sessions(pool: &MySqlPool) -> Result<Vec<ExamSession>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, exam_id, student_id, status, started_at, finished_at, tab_switch_count FROM exam_sessions ORDER BY id DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| ExamSession {
            id: ExamSessionId(r.get::<i32, _>("id").to_string()),
            exam_id: ExamId(r.get::<i32, _>("exam_id").to_string()),
            student_id: StudentId(r.get::<i32, _>("student_id").to_string()),
            status: ExamSessionStatus::from_db(&r.get::<String, _>("status")),
            started_at: r
                .try_get::<Option<DateTime<Utc>>, _>("started_at")
                .ok()
                .flatten()
                .map(|dt| dt.to_rfc3339()),
            finished_at: r
                .try_get::<Option<DateTime<Utc>>, _>("finished_at")
                .ok()
                .flatten()
                .map(|dt| dt.to_rfc3339()),
            tab_switch_count: r.get("tab_switch_count"),
        })
        .collect())
}

pub async fn list_exam_answers(pool: &MySqlPool) -> Result<Vec<ExamAnswer>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, exam_session_id, question_id, jawaban_json, skor, disimpan_pada FROM exam_answers ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| {
            let jawaban_val: serde_json::Value = r.get("jawaban_json");
            ExamAnswer {
                id: r.get::<i32, _>("id").to_string(),
                exam_session_id: ExamSessionId(r.get::<i32, _>("exam_session_id").to_string()),
                question_id: r.get::<i32, _>("question_id").to_string(),
                jawaban: json_value_to_answer_str(jawaban_val),
                skor: r.get("skor"),
                disimpan_pada: r.get::<DateTime<Utc>, _>("disimpan_pada").to_rfc3339(),
            }
        })
        .collect())
}

pub struct CreateExamInput<'a> {
    pub teacher_assignment_id: &'a str,
    pub tipe: ExamType,
    pub judul: &'a str,
    pub waktu_mulai_iso: &'a str,
    pub durasi_menit: i64,
    pub target_student_ids: Option<Vec<String>>,
    pub parent_exam_id: Option<&'a str>,
}

pub async fn create_exam(
    pool: &MySqlPool,
    ctx: &AuthContext,
    input: CreateExamInput<'_>,
) -> Result<Exam, DomainError> {
    let ta_id: i64 = input
        .teacher_assignment_id
        .parse()
        .map_err(|_| DomainError::not_found("teacher_assignment", input.teacher_assignment_id))?;
    let ta_opt = get_teacher_assignment_by_id(pool, ta_id).await?;

    let ta = if input.tipe == ExamType::Susulan {
        guard_susulan_exam_creation(ctx, ta_opt.as_ref())?
    } else {
        guard_teacher_assignment_ownership(ctx, ta_opt.as_ref(), "jadwal CBT")?
    };

    if input.judul.trim().len() < 3 {
        return Err(DomainError::validation(
            "judul",
            "Judul ujian CBT wajib diisi minimal 3 karakter.",
        ));
    }

    let waktu_mulai_dt = DateTime::parse_from_rfc3339(input.waktu_mulai_iso.trim())
        .map_err(|_| {
            DomainError::validation(
                "waktu_mulai",
                "Format waktu_mulai tidak valid (wajib RFC3339, mis. 2026-11-16T08:00:00Z).",
            )
        })?
        .with_timezone(&Utc);

    let (assignments, rombels, users) = tokio::try_join!(
        list_teacher_assignments(pool),
        list_rombels(pool),
        list_users(pool),
    )?;

    let mut conn = pool.acquire().await.map_err(map_sqlx_error)?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
        .execute(&mut *conn)
        .await
        .map_err(map_sqlx_error)?;

    let mut tx = conn.begin().await.map_err(map_sqlx_error)?;

    let exam_rows = sqlx::query(
        "SELECT id, teacher_assignment_id, tipe, judul, waktu_mulai, durasi_menit, token, status, parent_exam_id, target_student_ids_json FROM exams FOR UPDATE",
    )
    .fetch_all(&mut *tx)
    .await
    .map_err(map_sqlx_error)?;

    let existing_exams: Vec<Exam> = exam_rows
        .into_iter()
        .map(|r| {
            let target_json: Option<serde_json::Value> = r.get("target_student_ids_json");
            let targets = target_json.and_then(|v| {
                serde_json::from_value::<Vec<String>>(v)
                    .ok()
                    .map(|ids| ids.into_iter().map(StudentId).collect())
            });
            Exam {
                id: ExamId(r.get::<i32, _>("id").to_string()),
                teacher_assignment_id: AssignmentId(
                    r.get::<i32, _>("teacher_assignment_id").to_string(),
                ),
                tipe: ExamType::from_db(&r.get::<String, _>("tipe")),
                judul: r.get("judul"),
                waktu_mulai: r.get::<DateTime<Utc>, _>("waktu_mulai").to_rfc3339(),
                durasi_menit: r.get::<i32, _>("durasi_menit") as i64,
                token: r.get("token"),
                status: ExamStatus::from_db(&r.get::<String, _>("status")),
                parent_exam_id: r
                    .get::<Option<i32>, _>("parent_exam_id")
                    .map(|id| ExamId(id.to_string())),
                target_student_ids: targets,
            }
        })
        .collect();

    let stu_rows = sqlx::query(
        "SELECT id, user_id, nisn, nis, rombel_id, jenis_kelamin, tanggal_lahir, status FROM students FOR UPDATE",
    )
    .fetch_all(&mut *tx)
    .await
    .map_err(map_sqlx_error)?;

    let locked_students: Vec<Student> = stu_rows
        .into_iter()
        .map(|r| Student {
            id: StudentId(r.get::<i32, _>("id").to_string()),
            user_id: UserId(r.get::<i32, _>("user_id").to_string()),
            nisn: r.get("nisn"),
            nis: r.get("nis"),
            rombel_id: RombelId(r.get::<i32, _>("rombel_id").to_string()),
            jenis_kelamin: r.get("jenis_kelamin"),
            tanggal_lahir: r
                .get::<chrono::NaiveDate, _>("tanggal_lahir")
                .format("%Y-%m-%d")
                .to_string(),
            status: r.get("status"),
        })
        .collect();

    let candidate_targets = input
        .target_student_ids
        .clone()
        .map(|ids| ids.into_iter().map(StudentId).collect());
    let parent_num: Option<i64> = input.parent_exam_id.and_then(|s| s.parse().ok());

    let candidate = Exam {
        id: ExamId("candidate".to_string()),
        teacher_assignment_id: ta.id.clone(),
        tipe: input.tipe,
        judul: input.judul.trim().to_string(),
        waktu_mulai: waktu_mulai_dt.to_rfc3339(),
        durasi_menit: input.durasi_menit,
        token: String::new(),
        status: ExamStatus::Aktif,
        parent_exam_id: parent_num.map(|id| ExamId(id.to_string())),
        target_student_ids: candidate_targets.clone(),
    };

    validate_exam_no_student_overlap(
        &candidate,
        &existing_exams,
        &assignments,
        &locked_students,
        &rombels,
        &users,
    )?;

    let raw_uuid = Uuid::new_v4().simple().to_string().to_uppercase();
    let token: String = raw_uuid.chars().take(6).collect();
    let targets_json: Option<serde_json::Value> = input
        .target_student_ids
        .as_ref()
        .map(serde_json::to_value)
        .transpose()
        .map_err(|_| DomainError::internal("Gagal menyerialisasi daftar siswa target ujian."))?;

    let res = sqlx::query(
        r#"
        INSERT INTO exams
          (teacher_assignment_id, tipe, judul, waktu_mulai, durasi_menit, token, status, parent_exam_id, target_student_ids_json)
        VALUES (?, ?, ?, ?, ?, ?, 'AKTIF', ?, ?)
        "#,
    )
    .bind(ta_id)
    .bind(input.tipe.as_str())
    .bind(input.judul.trim())
    .bind(waktu_mulai_dt)
    .bind(input.durasi_menit as i32)
    .bind(&token)
    .bind(parent_num)
    .bind(targets_json)
    .execute(&mut *tx)
    .await
    .map_err(map_sqlx_error)?;

    let new_id = res.last_insert_id();
    let actor_uid: i64 = ctx.user.id.0.parse().unwrap_or(1);
    insert_audit_log_tx(
        &mut tx,
        actor_uid,
        "CREATE_CBT_EXAM",
        "exams",
        &new_id.to_string(),
        &format!(
            "Membuat jadwal CBT \"{}\" ({}) token {}",
            input.judul.trim(),
            input.tipe.as_str(),
            token
        ),
    )
    .await?;

    tx.commit().await.map_err(map_sqlx_error)?;

    Ok(Exam {
        id: ExamId(new_id.to_string()),
        teacher_assignment_id: ta.id.clone(),
        tipe: input.tipe,
        judul: input.judul.trim().to_string(),
        waktu_mulai: waktu_mulai_dt.to_rfc3339(),
        durasi_menit: input.durasi_menit,
        token,
        status: ExamStatus::Aktif,
        parent_exam_id: parent_num.map(|id| ExamId(id.to_string())),
        target_student_ids: candidate_targets,
    })
}

pub async fn start_exam_session(
    pool: &MySqlPool,
    ctx: &AuthContext,
    exam_id: &str,
    submitted_token: &str,
) -> Result<ExamSession, DomainError> {
    let Some(student) = &ctx.student else {
        return Err(DomainError::forbidden(
            "Hanya siswa yang dapat memulai sesi CBT.",
            "SISWA:START_CBT",
        ));
    };
    if ctx.active_role != UserRole::Siswa {
        return Err(DomainError::forbidden(
            "Hanya siswa yang dapat memulai sesi CBT.",
            "SISWA:START_CBT",
        ));
    }

    let eid: i64 = exam_id
        .parse()
        .map_err(|_| DomainError::not_found("exam", exam_id))?;
    let stu_id: i64 = student
        .id
        .0
        .parse()
        .map_err(|_| DomainError::internal("ID siswa tidak valid."))?;

    let row = sqlx::query(
        "SELECT id, teacher_assignment_id, tipe, judul, waktu_mulai, durasi_menit, token, status, parent_exam_id, target_student_ids_json FROM exams WHERE id = ? LIMIT 1",
    )
    .bind(eid)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx_error)?
    .ok_or_else(|| DomainError::not_found("exam", exam_id))?;

    let target_json: Option<serde_json::Value> = row.get("target_student_ids_json");
    let targets = target_json.and_then(|v| {
        serde_json::from_value::<Vec<String>>(v)
            .ok()
            .map(|ids| ids.into_iter().map(StudentId).collect())
    });

    let exam = Exam {
        id: ExamId(row.get::<i32, _>("id").to_string()),
        teacher_assignment_id: AssignmentId(
            row.get::<i32, _>("teacher_assignment_id").to_string(),
        ),
        tipe: ExamType::from_db(&row.get::<String, _>("tipe")),
        judul: row.get("judul"),
        waktu_mulai: row.get::<DateTime<Utc>, _>("waktu_mulai").to_rfc3339(),
        durasi_menit: row.get::<i32, _>("durasi_menit") as i64,
        token: row.get("token"),
        status: ExamStatus::from_db(&row.get::<String, _>("status")),
        parent_exam_id: row
            .get::<Option<i32>, _>("parent_exam_id")
            .map(|id| ExamId(id.to_string())),
        target_student_ids: targets,
    };

    verify_exam_token(&exam, submitted_token)?;

    let ta_id: i64 = exam.teacher_assignment_id.0.parse().unwrap_or(0);
    if let Some(ta) = get_teacher_assignment_by_id(pool, ta_id).await? {
        if ta.rombel_id != student.rombel_id {
            return Err(DomainError::forbidden(
                "Anda tidak terdaftar pada rombel peserta ujian ini.",
                "SISWA:START_CBT",
            ));
        }
    }

    if let Some(ref subset) = exam.target_student_ids {
        if !subset.is_empty() && !subset.contains(&student.id) {
            return Err(DomainError::forbidden(
                "Anda tidak termasuk dalam daftar peserta ujian susulan ini.",
                "SISWA:START_CBT",
            ));
        }
    }

    let existing = sqlx::query(
        "SELECT id, exam_id, student_id, status, started_at, finished_at, tab_switch_count FROM exam_sessions WHERE exam_id = ? AND student_id = ? LIMIT 1",
    )
    .bind(eid)
    .bind(stu_id)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx_error)?;

    if let Some(ex) = existing {
        return Ok(ExamSession {
            id: ExamSessionId(ex.get::<i32, _>("id").to_string()),
            exam_id: ExamId(eid.to_string()),
            student_id: student.id.clone(),
            status: ExamSessionStatus::from_db(&ex.get::<String, _>("status")),
            started_at: ex
                .try_get::<Option<DateTime<Utc>>, _>("started_at")
                .ok()
                .flatten()
                .map(|dt| dt.to_rfc3339()),
            finished_at: ex
                .try_get::<Option<DateTime<Utc>>, _>("finished_at")
                .ok()
                .flatten()
                .map(|dt| dt.to_rfc3339()),
            tab_switch_count: ex.get("tab_switch_count"),
        });
    }

    let now = Utc::now();
    let res = sqlx::query(
        "INSERT INTO exam_sessions (exam_id, student_id, status, started_at, tab_switch_count) VALUES (?, ?, 'MENGERJAKAN', ?, 0)",
    )
    .bind(eid)
    .bind(stu_id)
    .bind(now)
    .execute(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(ExamSession {
        id: ExamSessionId(res.last_insert_id().to_string()),
        exam_id: ExamId(eid.to_string()),
        student_id: student.id.clone(),
        status: ExamSessionStatus::Mengerjakan,
        started_at: Some(now.to_rfc3339()),
        finished_at: None,
        tab_switch_count: 0,
    })
}

pub async fn save_exam_answer(
    pool: &MySqlPool,
    ctx: &AuthContext,
    exam_session_id: &str,
    question_id: &str,
    jawaban: &str,
) -> Result<ExamAnswer, DomainError> {
    let Some(student) = &ctx.student else {
        return Err(DomainError::forbidden(
            "Hanya siswa yang dapat menyimpan jawaban CBT.",
            "SISWA:ANSWER_CBT",
        ));
    };
    if ctx.active_role != UserRole::Siswa {
        return Err(DomainError::forbidden(
            "Hanya siswa yang dapat menyimpan jawaban CBT.",
            "SISWA:ANSWER_CBT",
        ));
    }

    let ses_id: i64 = exam_session_id
        .parse()
        .map_err(|_| DomainError::not_found("exam_session", exam_session_id))?;
    let q_id: i64 = question_id
        .parse()
        .map_err(|_| DomainError::not_found("question", question_id))?;
    let stu_id: i64 = student
        .id
        .0
        .parse()
        .map_err(|_| DomainError::internal("ID siswa tidak valid."))?;

    let ses_row = sqlx::query(
        "SELECT id, status FROM exam_sessions WHERE id = ? AND student_id = ? LIMIT 1",
    )
    .bind(ses_id)
    .bind(stu_id)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx_error)?
    .ok_or_else(|| DomainError::not_found("exam_session", exam_session_id))?;

    let status = ExamSessionStatus::from_db(&ses_row.get::<String, _>("status"));
    if status == ExamSessionStatus::Selesai {
        return Err(DomainError::Conflict {
            http_status: 409,
            message: "Ujian sudah diselesaikan dan tidak dapat diubah lagi.".into(),
        });
    }

    sqlx::query("SELECT id FROM questions WHERE id = ? LIMIT 1")
        .bind(q_id)
        .fetch_optional(pool)
        .await
        .map_err(map_sqlx_error)?
        .ok_or_else(|| DomainError::not_found("question", question_id))?;

    let jawaban_json = serde_json::Value::String(jawaban.to_string());
    sqlx::query(
        r#"
        INSERT INTO exam_answers (exam_session_id, question_id, jawaban_json, skor)
        VALUES (?, ?, ?, NULL)
        ON DUPLICATE KEY UPDATE
          jawaban_json = VALUES(jawaban_json),
          disimpan_pada = CURRENT_TIMESTAMP
        "#,
    )
    .bind(ses_id)
    .bind(q_id)
    .bind(&jawaban_json)
    .execute(pool)
    .await
    .map_err(map_sqlx_error)?;

    let saved = sqlx::query(
        "SELECT id, exam_session_id, question_id, jawaban_json, skor, disimpan_pada FROM exam_answers WHERE exam_session_id = ? AND question_id = ? LIMIT 1",
    )
    .bind(ses_id)
    .bind(q_id)
    .fetch_one(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(ExamAnswer {
        id: saved.get::<i32, _>("id").to_string(),
        exam_session_id: ExamSessionId(ses_id.to_string()),
        question_id: q_id.to_string(),
        jawaban: json_value_to_answer_str(saved.get("jawaban_json")),
        skor: saved.get("skor"),
        disimpan_pada: saved.get::<DateTime<Utc>, _>("disimpan_pada").to_rfc3339(),
    })
}

pub async fn finish_exam_session(
    pool: &MySqlPool,
    ctx: &AuthContext,
    exam_session_id: &str,
) -> Result<(ExamSession, ExamGradeSummary), DomainError> {
    let Some(student) = &ctx.student else {
        return Err(DomainError::forbidden(
            "Hanya siswa yang dapat menyelesaikan ujian.",
            "SISWA:FINISH_CBT",
        ));
    };
    if ctx.active_role != UserRole::Siswa {
        return Err(DomainError::forbidden(
            "Hanya siswa yang dapat menyelesaikan ujian.",
            "SISWA:FINISH_CBT",
        ));
    }

    let ses_id: i64 = exam_session_id
        .parse()
        .map_err(|_| DomainError::not_found("exam_session", exam_session_id))?;
    let stu_id: i64 = student
        .id
        .0
        .parse()
        .map_err(|_| DomainError::internal("ID siswa tidak valid."))?;

    let ses_row = sqlx::query(
        "SELECT id, exam_id, student_id, status, started_at, finished_at, tab_switch_count FROM exam_sessions WHERE id = ? AND student_id = ? LIMIT 1",
    )
    .bind(ses_id)
    .bind(stu_id)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx_error)?
    .ok_or_else(|| DomainError::not_found("exam_session", exam_session_id))?;

    let exam_id = ses_row.get::<i32, _>("exam_id") as i64;
    let ta_row = sqlx::query(
        "SELECT ta.subject_id FROM exams e JOIN teacher_assignments ta ON ta.id = e.teacher_assignment_id WHERE e.id = ? LIMIT 1",
    )
    .bind(exam_id)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx_error)?;

    let subject_id_opt = ta_row.map(|r| r.get::<i32, _>("subject_id").to_string());

    let (banks, all_questions, all_answers) = tokio::try_join!(
        list_question_banks(pool),
        list_questions(pool),
        list_exam_answers(pool),
    )?;

    let bank_id_opt = subject_id_opt
        .and_then(|sid| banks.iter().find(|b| b.subject_id.0 == sid))
        .map(|b| b.id.clone());

    let bank_questions: Vec<Question> = match bank_id_opt {
        Some(bid) => all_questions
            .into_iter()
            .filter(|q| q.bank_id == bid)
            .collect(),
        None => all_questions,
    };

    let session_answers: Vec<ExamAnswer> = all_answers
        .into_iter()
        .filter(|a| a.exam_session_id.0 == ses_id.to_string())
        .collect();

    let summary = grade_student_exam_answers(&bank_questions, &session_answers);

    let now = Utc::now();
    let mut tx = pool.begin().await.map_err(map_sqlx_error)?;

    sqlx::query(
        "UPDATE exam_sessions SET status = 'SELESAI', finished_at = ? WHERE id = ? AND student_id = ?",
    )
    .bind(now)
    .bind(ses_id)
    .bind(stu_id)
    .execute(&mut *tx)
    .await
    .map_err(map_sqlx_error)?;

    for q in &bank_questions {
        if let Some(ans) = session_answers.iter().find(|a| a.question_id == q.id) {
            if matches!(
                q.tipe,
                QuestionType::Pg | QuestionType::BenarSalah | QuestionType::Isian
            ) {
                let earned =
                    if ans.jawaban.trim().to_uppercase() == q.jawaban.trim().to_uppercase() {
                        q.skor
                    } else {
                        rust_decimal::Decimal::ZERO
                    };
                let aid: i64 = ans.id.parse().unwrap_or(0);
                if aid > 0 {
                    sqlx::query("UPDATE exam_answers SET skor = ? WHERE id = ?")
                        .bind(earned)
                        .bind(aid)
                        .execute(&mut *tx)
                        .await
                        .map_err(map_sqlx_error)?;
                }
            }
        }
    }

    let actor_uid: i64 = ctx.user.id.0.parse().unwrap_or(1);
    insert_audit_log_tx(
        &mut tx,
        actor_uid,
        "FINISH_CBT",
        "exam_sessions",
        &ses_id.to_string(),
        &format!(
            "Menyelesaikan CBT dengan skor objektif {}%",
            summary.percentage
        ),
    )
    .await?;

    tx.commit().await.map_err(map_sqlx_error)?;

    let updated_session = ExamSession {
        id: ExamSessionId(ses_id.to_string()),
        exam_id: ExamId(exam_id.to_string()),
        student_id: student.id.clone(),
        status: ExamSessionStatus::Selesai,
        started_at: ses_row
            .try_get::<Option<DateTime<Utc>>, _>("started_at")
            .ok()
            .flatten()
            .map(|dt| dt.to_rfc3339()),
        finished_at: Some(now.to_rfc3339()),
        tab_switch_count: ses_row.get("tab_switch_count"),
    };

    Ok((updated_session, summary))
}
