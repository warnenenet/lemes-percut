use chrono::{DateTime, NaiveDate, Utc};
use lms_domain::types::*;
use lms_domain::DomainError;
use sqlx::{MySqlPool, Row};
use std::collections::HashMap;

use crate::error::map_sqlx_error;

pub async fn list_users(pool: &MySqlPool) -> Result<Vec<User>, DomainError> {
    let user_rows = sqlx::query(
        "SELECT id, nama, email, role, status, last_login_at FROM users ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    let role_rows = sqlx::query("SELECT user_id, role FROM user_roles")
        .fetch_all(pool)
        .await
        .map_err(map_sqlx_error)?;

    let mut role_map: HashMap<i32, Vec<UserRole>> = HashMap::new();
    for rr in role_rows {
        let uid: i32 = rr.get("user_id");
        let role_str: String = rr.get("role");
        if let Some(role) = UserRole::from_header(&role_str) {
            role_map.entry(uid).or_default().push(role);
        }
    }

    Ok(user_rows
        .into_iter()
        .map(|r| {
            let uid: i32 = r.get("id");
            let mut roles = role_map.remove(&uid).unwrap_or_default();
            if roles.is_empty() {
                let primary: String = r.get("role");
                roles.push(UserRole::from_header(&primary).unwrap_or(UserRole::Siswa));
            }
            let last_login_at = r
                .try_get::<Option<DateTime<Utc>>, _>("last_login_at")
                .ok()
                .flatten()
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default();
            User {
                id: UserId(uid.to_string()),
                nama: r.get("nama"),
                email: r.get("email"),
                roles,
                status: r.get("status"),
                last_login_at,
            }
        })
        .collect())
}

pub async fn list_teachers(pool: &MySqlPool) -> Result<Vec<Teacher>, DomainError> {
    let rows = sqlx::query("SELECT id, user_id, nuptk, nip, bidang FROM teachers ORDER BY id ASC")
        .fetch_all(pool)
        .await
        .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| Teacher {
            id: TeacherId(r.get::<i32, _>("id").to_string()),
            user_id: UserId(r.get::<i32, _>("user_id").to_string()),
            nuptk: r.get("nuptk"),
            nip: r.get("nip"),
            bidang: r.get("bidang"),
        })
        .collect())
}

pub async fn list_students(pool: &MySqlPool) -> Result<Vec<Student>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, user_id, nisn, nis, rombel_id, jenis_kelamin, tanggal_lahir, status FROM students ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| Student {
            id: StudentId(r.get::<i32, _>("id").to_string()),
            user_id: UserId(r.get::<i32, _>("user_id").to_string()),
            nisn: r.get("nisn"),
            nis: r.get("nis"),
            rombel_id: RombelId(r.get::<i32, _>("rombel_id").to_string()),
            jenis_kelamin: r.get("jenis_kelamin"),
            tanggal_lahir: r
                .get::<NaiveDate, _>("tanggal_lahir")
                .format("%Y-%m-%d")
                .to_string(),
            status: r.get("status"),
        })
        .collect())
}

pub async fn list_bk_counselors(pool: &MySqlPool) -> Result<Vec<BkCounselor>, DomainError> {
    let rows = sqlx::query("SELECT id, user_id FROM bk_counselors ORDER BY id ASC")
        .fetch_all(pool)
        .await
        .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| BkCounselor {
            id: BkId(r.get::<i32, _>("id").to_string()),
            user_id: UserId(r.get::<i32, _>("user_id").to_string()),
        })
        .collect())
}

pub async fn list_bk_class_assignments(
    pool: &MySqlPool,
) -> Result<Vec<BkClassAssignment>, DomainError> {
    let rows = sqlx::query("SELECT id, bk_id, rombel_id FROM bk_class_assignments ORDER BY id ASC")
        .fetch_all(pool)
        .await
        .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| BkClassAssignment {
            id: r.get::<i32, _>("id").to_string(),
            bk_id: BkId(r.get::<i32, _>("bk_id").to_string()),
            rombel_id: RombelId(r.get::<i32, _>("rombel_id").to_string()),
        })
        .collect())
}

pub async fn list_subjects(pool: &MySqlPool) -> Result<Vec<Subject>, DomainError> {
    let rows = sqlx::query("SELECT id, kode, nama, kelompok FROM subjects ORDER BY id ASC")
        .fetch_all(pool)
        .await
        .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| Subject {
            id: SubjectId(r.get::<i32, _>("id").to_string()),
            kode: r.get("kode"),
            nama: r.get("nama"),
            kelompok: SubjectGroup::from_db(&r.get::<String, _>("kelompok")),
        })
        .collect())
}

pub async fn list_teacher_assignments(
    pool: &MySqlPool,
) -> Result<Vec<TeacherAssignment>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, teacher_id, subject_id, rombel_id, academic_year_id, semester, kurikulum_acuan, jam_per_minggu, status FROM teacher_assignments ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| TeacherAssignment {
            id: AssignmentId(r.get::<i32, _>("id").to_string()),
            teacher_id: TeacherId(r.get::<i32, _>("teacher_id").to_string()),
            subject_id: SubjectId(r.get::<i32, _>("subject_id").to_string()),
            rombel_id: RombelId(r.get::<i32, _>("rombel_id").to_string()),
            academic_year_id: AcademicYearId(r.get::<i32, _>("academic_year_id").to_string()),
            semester: r.get("semester"),
            kurikulum_acuan: CurriculumTrack::from_db(&r.get::<String, _>("kurikulum_acuan")),
            jam_per_minggu: r.get::<i32, _>("jam_per_minggu") as u8,
            status: r.get("status"),
        })
        .collect())
}

pub async fn get_teacher_assignment_by_id(
    pool: &MySqlPool,
    id: i64,
) -> Result<Option<TeacherAssignment>, DomainError> {
    let row = sqlx::query(
        "SELECT id, teacher_id, subject_id, rombel_id, academic_year_id, semester, kurikulum_acuan, jam_per_minggu, status FROM teacher_assignments WHERE id = ? LIMIT 1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(row.map(|r| TeacherAssignment {
        id: AssignmentId(r.get::<i32, _>("id").to_string()),
        teacher_id: TeacherId(r.get::<i32, _>("teacher_id").to_string()),
        subject_id: SubjectId(r.get::<i32, _>("subject_id").to_string()),
        rombel_id: RombelId(r.get::<i32, _>("rombel_id").to_string()),
        academic_year_id: AcademicYearId(r.get::<i32, _>("academic_year_id").to_string()),
        semester: r.get("semester"),
        kurikulum_acuan: CurriculumTrack::from_db(&r.get::<String, _>("kurikulum_acuan")),
        jam_per_minggu: r.get::<i32, _>("jam_per_minggu") as u8,
        status: r.get("status"),
    }))
}
