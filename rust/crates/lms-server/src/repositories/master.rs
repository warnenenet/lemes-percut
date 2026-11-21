use chrono::NaiveDate;
use lms_domain::types::{AcademicYear, AcademicYearId, CurriculumTrack, Major, MajorId, Rombel, RombelId, School, TeacherId};
use lms_domain::DomainError;
use sqlx::{MySqlPool, Row};

use crate::error::map_sqlx_error;

pub async fn get_school(pool: &MySqlPool) -> Result<Option<School>, DomainError> {
    let row = sqlx::query(
        "SELECT id, npsn, nama, alamat, kepala_sekolah, telepon, email, logo_url FROM schools LIMIT 1",
    )
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(row.map(|r| School {
        id: r.get::<i32, _>("id").to_string(),
        npsn: r.get("npsn"),
        nama: r.get("nama"),
        alamat: r.get("alamat"),
        kepala_sekolah: r.get("kepala_sekolah"),
        telepon: r.get("telepon"),
        email: r.get("email"),
        logo_url: r.get("logo_url"),
    }))
}

pub async fn list_academic_years(pool: &MySqlPool) -> Result<Vec<AcademicYear>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, tahun_ajaran, semester, tanggal_mulai, tanggal_selesai, is_active FROM academic_years ORDER BY id DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| AcademicYear {
            id: AcademicYearId(r.get::<i32, _>("id").to_string()),
            tahun_ajaran: r.get("tahun_ajaran"),
            semester: r.get("semester"),
            tanggal_mulai: r
                .get::<NaiveDate, _>("tanggal_mulai")
                .format("%Y-%m-%d")
                .to_string(),
            tanggal_selesai: r
                .get::<NaiveDate, _>("tanggal_selesai")
                .format("%Y-%m-%d")
                .to_string(),
            is_active: r.get("is_active"),
        })
        .collect())
}

pub async fn list_curricula(pool: &MySqlPool) -> Result<Vec<(String, String)>, DomainError> {
    let rows = sqlx::query("SELECT kode, deskripsi FROM curricula ORDER BY id ASC")
        .fetch_all(pool)
        .await
        .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| (r.get("kode"), r.get("deskripsi")))
        .collect())
}

pub async fn list_majors(pool: &MySqlPool) -> Result<Vec<Major>, DomainError> {
    let rows = sqlx::query("SELECT id, kode, nama FROM majors ORDER BY id ASC")
        .fetch_all(pool)
        .await
        .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| Major {
            id: MajorId(r.get::<i32, _>("id").to_string()),
            kode: r.get("kode"),
            nama: r.get("nama"),
        })
        .collect())
}

pub async fn list_rombels(pool: &MySqlPool) -> Result<Vec<Rombel>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, tingkat, major_id, academic_year_id, kurikulum_acuan, nama_rombel, wali_kelas_id FROM rombels ORDER BY tingkat ASC, nama_rombel ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| Rombel {
            id: RombelId(r.get::<i32, _>("id").to_string()),
            tingkat: r.get::<i32, _>("tingkat") as u8,
            major_id: MajorId(r.get::<i32, _>("major_id").to_string()),
            academic_year_id: AcademicYearId(r.get::<i32, _>("academic_year_id").to_string()),
            kurikulum_acuan: CurriculumTrack::from_db(&r.get::<String, _>("kurikulum_acuan")),
            nama_rombel: r.get("nama_rombel"),
            wali_kelas_id: r
                .get::<Option<i32>, _>("wali_kelas_id")
                .map(|id| TeacherId(id.to_string())),
        })
        .collect())
}
