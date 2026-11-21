use chrono::{NaiveDate, Utc};
use lms_domain::rbac::{guard_bk_rombel_access, AuthContext};
use lms_domain::types::*;
use lms_domain::DomainError;
use rust_decimal::Decimal;
use sqlx::{MySqlPool, Row};

use crate::error::map_sqlx_error;
use crate::repositories::system_audit::insert_audit_log_tx;
use crate::repositories::user_access::list_bk_class_assignments;

pub async fn list_dudis(pool: &MySqlPool) -> Result<Vec<Dudi>, DomainError> {
    let rows = sqlx::query("SELECT id, nama, alamat, bidang, kontak FROM dudis ORDER BY id ASC")
        .fetch_all(pool)
        .await
        .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| Dudi {
            id: r.get::<i32, _>("id").to_string(),
            nama: r.get("nama"),
            alamat: r.get("alamat"),
            bidang: r.get("bidang"),
            kontak: r.get("kontak"),
        })
        .collect())
}

pub async fn list_pks_documents(pool: &MySqlPool) -> Result<Vec<PksDocument>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, dudi_id, nomor, tanggal_mulai, tanggal_selesai, file_url FROM pks_documents ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| PksDocument {
            id: r.get::<i32, _>("id").to_string(),
            dudi_id: r.get::<i32, _>("dudi_id").to_string(),
            nomor: r.get("nomor"),
            tanggal_mulai: r
                .get::<NaiveDate, _>("tanggal_mulai")
                .format("%Y-%m-%d")
                .to_string(),
            tanggal_selesai: r
                .get::<NaiveDate, _>("tanggal_selesai")
                .format("%Y-%m-%d")
                .to_string(),
            file_url: r.get("file_url"),
        })
        .collect())
}

pub async fn list_pkl_placements(pool: &MySqlPool) -> Result<Vec<PklPlacement>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, student_id, dudi_id, pks_id, pembimbing_bk_id, pembimbing_dudi_nama, periode_mulai, periode_selesai, status FROM pkl_placements ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| PklPlacement {
            id: PlacementId(r.get::<i32, _>("id").to_string()),
            student_id: StudentId(r.get::<i32, _>("student_id").to_string()),
            dudi_id: r.get::<i32, _>("dudi_id").to_string(),
            pks_id: r.get::<i32, _>("pks_id").to_string(),
            pembimbing_bk_id: BkId(r.get::<i32, _>("pembimbing_bk_id").to_string()),
            pembimbing_dudi_nama: r.get("pembimbing_dudi_nama"),
            periode_mulai: r
                .get::<NaiveDate, _>("periode_mulai")
                .format("%Y-%m-%d")
                .to_string(),
            periode_selesai: r
                .get::<NaiveDate, _>("periode_selesai")
                .format("%Y-%m-%d")
                .to_string(),
            status: r.get("status"),
        })
        .collect())
}

pub async fn list_pkl_journals(pool: &MySqlPool) -> Result<Vec<PklJournal>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, placement_id, tanggal, aktivitas, validasi_bk, catatan_bk FROM pkl_journals ORDER BY id DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| PklJournal {
            id: r.get::<i32, _>("id").to_string(),
            placement_id: PlacementId(r.get::<i32, _>("placement_id").to_string()),
            tanggal: r
                .get::<NaiveDate, _>("tanggal")
                .format("%Y-%m-%d")
                .to_string(),
            aktivitas: r.get("aktivitas"),
            validasi_bk: r.get("validasi_bk"),
            catatan_bk: r.get("catatan_bk"),
        })
        .collect())
}

pub async fn list_pkl_scores(pool: &MySqlPool) -> Result<Vec<PklScore>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, placement_id, komponen, nilai, dinilai_oleh FROM pkl_scores ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .filter_map(|r| {
            let komp_str: String = r.get("komponen");
            let komponen = PklScoreComponent::from_db(&komp_str)?;
            Some(PklScore {
                id: r.get::<i32, _>("id").to_string(),
                placement_id: PlacementId(r.get::<i32, _>("placement_id").to_string()),
                komponen,
                nilai: r.get("nilai"),
                dinilai_oleh: UserId(r.get::<i32, _>("dinilai_oleh").to_string()),
            })
        })
        .collect())
}

pub async fn list_mapel_pkl_contributions(
    pool: &MySqlPool,
) -> Result<Vec<MapelPklContribution>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, student_id, subject_id, nilai, guru_id, catatan FROM mapel_pkl_contributions ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| MapelPklContribution {
            id: r.get::<i32, _>("id").to_string(),
            student_id: StudentId(r.get::<i32, _>("student_id").to_string()),
            subject_id: SubjectId(r.get::<i32, _>("subject_id").to_string()),
            nilai: r.get("nilai"),
            guru_id: TeacherId(r.get::<i32, _>("guru_id").to_string()),
            catatan: r.get::<Option<String>, _>("catatan").unwrap_or_default(),
        })
        .collect())
}

pub async fn create_pkl_journal(
    pool: &MySqlPool,
    ctx: &AuthContext,
    placement_id: &str,
    tanggal: Option<&str>,
    aktivitas: &str,
) -> Result<PklJournal, DomainError> {
    let Some(student) = &ctx.student else {
        return Err(DomainError::forbidden(
            "Hanya siswa PKL yang dapat mencatat jurnal.",
            "SISWA:PKL_JOURNAL",
        ));
    };
    if ctx.active_role != UserRole::Siswa {
        return Err(DomainError::forbidden(
            "Hanya siswa PKL yang dapat mencatat jurnal.",
            "SISWA:PKL_JOURNAL",
        ));
    }

    let plc_id: i64 = placement_id
        .parse()
        .map_err(|_| DomainError::not_found("pkl_placement", placement_id))?;
    let stu_id: i64 = student
        .id
        .0
        .parse()
        .map_err(|_| DomainError::internal("ID siswa tidak valid."))?;

    if aktivitas.trim().len() < 5 {
        return Err(DomainError::validation(
            "aktivitas",
            "Aktivitas jurnal PKL wajib diisi minimal 5 karakter.",
        ));
    }

    sqlx::query("SELECT id FROM pkl_placements WHERE id = ? AND student_id = ? LIMIT 1")
        .bind(plc_id)
        .bind(stu_id)
        .fetch_optional(pool)
        .await
        .map_err(map_sqlx_error)?
        .ok_or_else(|| DomainError::not_found("pkl_placement", placement_id))?;

    let tgl_str = tanggal
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| Utc::now().format("%Y-%m-%d").to_string());

    let res = sqlx::query(
        "INSERT INTO pkl_journals (placement_id, tanggal, aktivitas, validasi_bk, catatan_bk) VALUES (?, ?, ?, FALSE, '')",
    )
    .bind(plc_id)
    .bind(&tgl_str)
    .bind(aktivitas.trim())
    .execute(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(PklJournal {
        id: res.last_insert_id().to_string(),
        placement_id: PlacementId(plc_id.to_string()),
        tanggal: tgl_str,
        aktivitas: aktivitas.trim().to_string(),
        validasi_bk: false,
        catatan_bk: Some(String::new()),
    })
}

pub async fn validate_pkl_journal(
    pool: &MySqlPool,
    ctx: &AuthContext,
    journal_id: &str,
    validasi_bk: bool,
    catatan_bk: Option<&str>,
) -> Result<PklJournal, DomainError> {
    let jid: i64 = journal_id
        .parse()
        .map_err(|_| DomainError::not_found("pkl_journal", journal_id))?;

    let row = sqlx::query(
        r#"
        SELECT j.id, j.placement_id, j.tanggal, j.aktivitas, s.rombel_id
        FROM pkl_journals j
        JOIN pkl_placements p ON p.id = j.placement_id
        JOIN students s ON s.id = p.student_id
        WHERE j.id = ?
        LIMIT 1
        "#,
    )
    .bind(jid)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx_error)?
    .ok_or_else(|| DomainError::not_found("pkl_journal", journal_id))?;

    let rombel_id = RombelId(row.get::<i32, _>("rombel_id").to_string());
    let bk_assignments = list_bk_class_assignments(pool).await?;
    guard_bk_rombel_access(ctx, &rombel_id, &bk_assignments)?;

    let note = catatan_bk
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("Tervalidasi pembimbing BK.")
        .to_string();

    sqlx::query("UPDATE pkl_journals SET validasi_bk = ?, catatan_bk = ? WHERE id = ?")
        .bind(validasi_bk)
        .bind(&note)
        .bind(jid)
        .execute(pool)
        .await
        .map_err(map_sqlx_error)?;

    Ok(PklJournal {
        id: row.get::<i32, _>("id").to_string(),
        placement_id: PlacementId(row.get::<i32, _>("placement_id").to_string()),
        tanggal: row
            .get::<NaiveDate, _>("tanggal")
            .format("%Y-%m-%d")
            .to_string(),
        aktivitas: row.get("aktivitas"),
        validasi_bk,
        catatan_bk: Some(note),
    })
}

pub async fn upsert_pkl_score(
    pool: &MySqlPool,
    ctx: &AuthContext,
    placement_id: &str,
    komponen: PklScoreComponent,
    nilai: Decimal,
) -> Result<PklScore, DomainError> {
    let plc_id: i64 = placement_id
        .parse()
        .map_err(|_| DomainError::not_found("pkl_placement", placement_id))?;

    let row = sqlx::query(
        r#"
        SELECT p.id, s.rombel_id
        FROM pkl_placements p
        JOIN students s ON s.id = p.student_id
        WHERE p.id = ?
        LIMIT 1
        "#,
    )
    .bind(plc_id)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx_error)?
    .ok_or_else(|| DomainError::not_found("pkl_placement", placement_id))?;

    let rombel_id = RombelId(row.get::<i32, _>("rombel_id").to_string());
    let bk_assignments = list_bk_class_assignments(pool).await?;
    guard_bk_rombel_access(ctx, &rombel_id, &bk_assignments)?;

    let zero = Decimal::ZERO;
    let hundred = Decimal::new(100, 0);
    if nilai < zero || nilai > hundred {
        return Err(DomainError::validation(
            "nilai",
            "Nilai PKL harus berada pada rentang 0 sampai 100.",
        ));
    }

    let rounded = nilai.round_dp(2);
    let uid: i64 = ctx
        .user
        .id
        .0
        .parse()
        .map_err(|_| DomainError::internal("ID pengguna tidak valid."))?;

    sqlx::query(
        r#"
        INSERT INTO pkl_scores (placement_id, komponen, nilai, dinilai_oleh)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          nilai = VALUES(nilai),
          dinilai_oleh = VALUES(dinilai_oleh)
        "#,
    )
    .bind(plc_id)
    .bind(komponen.as_str())
    .bind(rounded)
    .bind(uid)
    .execute(pool)
    .await
    .map_err(map_sqlx_error)?;

    let saved = sqlx::query(
        "SELECT id, placement_id, komponen, nilai, dinilai_oleh FROM pkl_scores WHERE placement_id = ? AND komponen = ? LIMIT 1",
    )
    .bind(plc_id)
    .bind(komponen.as_str())
    .fetch_one(pool)
    .await
    .map_err(map_sqlx_error)?;

    let mut tx = pool.begin().await.map_err(map_sqlx_error)?;
    let saved_id = saved.get::<i32, _>("id").to_string();
    insert_audit_log_tx(
        &mut tx,
        uid,
        "UPSERT_PKL_SCORE",
        "pkl_scores",
        &saved_id,
        &format!(
            "Simpan nilai PKL {}={} untuk placement {}",
            komponen.as_str(),
            rounded,
            plc_id
        ),
    )
    .await?;
    tx.commit().await.map_err(map_sqlx_error)?;

    Ok(PklScore {
        id: saved_id,
        placement_id: PlacementId(plc_id.to_string()),
        komponen,
        nilai: saved.get("nilai"),
        dinilai_oleh: UserId(uid.to_string()),
    })
}

pub async fn upsert_mapel_pkl_contribution(
    pool: &MySqlPool,
    ctx: &AuthContext,
    student_id: &str,
    subject_id: &str,
    nilai: Decimal,
    catatan: &str,
) -> Result<MapelPklContribution, DomainError> {
    if ctx.active_role != UserRole::GuruMapel {
        return Err(DomainError::forbidden(
            "Hanya Guru Mapel yang dapat menginput kontribusi nilai proyek mapel selama PKL.",
            "GURU_MAPEL:PKL_CONTRIBUTION",
        ));
    }
    let Some(teacher) = &ctx.teacher else {
        return Err(DomainError::forbidden(
            "Profil guru tidak ditemukan.",
            "GURU_MAPEL:PKL_CONTRIBUTION",
        ));
    };

    let stu_id: i64 = student_id
        .parse()
        .map_err(|_| DomainError::not_found("student", student_id))?;
    let sub_id: i64 = subject_id
        .parse()
        .map_err(|_| DomainError::not_found("subject", subject_id))?;
    let tch_id: i64 = teacher
        .id
        .0
        .parse()
        .map_err(|_| DomainError::internal("ID guru tidak valid."))?;

    let zero = Decimal::ZERO;
    let hundred = Decimal::new(100, 0);
    if nilai < zero || nilai > hundred {
        return Err(DomainError::validation(
            "nilai",
            "Nilai kontribusi mapel PKL harus 0..100.",
        ));
    }

    let rounded = nilai.round_dp(2);
    sqlx::query(
        r#"
        INSERT INTO mapel_pkl_contributions (student_id, subject_id, nilai, guru_id, catatan)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          nilai = VALUES(nilai),
          catatan = VALUES(catatan)
        "#,
    )
    .bind(stu_id)
    .bind(sub_id)
    .bind(rounded)
    .bind(tch_id)
    .bind(catatan.trim())
    .execute(pool)
    .await
    .map_err(map_sqlx_error)?;

    let saved = sqlx::query(
        "SELECT id, student_id, subject_id, nilai, guru_id, catatan FROM mapel_pkl_contributions WHERE student_id = ? AND subject_id = ? AND guru_id = ? LIMIT 1",
    )
    .bind(stu_id)
    .bind(sub_id)
    .bind(tch_id)
    .fetch_one(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(MapelPklContribution {
        id: saved.get::<i32, _>("id").to_string(),
        student_id: StudentId(stu_id.to_string()),
        subject_id: SubjectId(sub_id.to_string()),
        nilai: saved.get("nilai"),
        guru_id: teacher.id.clone(),
        catatan: saved.get::<Option<String>, _>("catatan").unwrap_or_default(),
    })
}
