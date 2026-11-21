use chrono::{DateTime, Utc};
use lms_domain::rbac::{
    guard_notebook_content_read, guard_teacher_assignment_ownership, summarize_notebook_metadata,
    AuthContext,
};
use lms_domain::types::*;
use lms_domain::DomainError;
use sqlx::{MySqlPool, Row};

use crate::error::map_sqlx_error;
use crate::repositories::user_access::get_teacher_assignment_by_id;

pub async fn list_notebooks(pool: &MySqlPool) -> Result<Vec<Notebook>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, student_id, subject_id, teacher_assignment_id FROM notebooks ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| Notebook {
            id: NotebookId(r.get::<i32, _>("id").to_string()),
            student_id: StudentId(r.get::<i32, _>("student_id").to_string()),
            subject_id: SubjectId(r.get::<i32, _>("subject_id").to_string()),
            teacher_assignment_id: AssignmentId(r.get::<i32, _>("teacher_assignment_id").to_string()),
        })
        .collect())
}

pub async fn list_notebook_metadata(
    pool: &MySqlPool,
) -> Result<Vec<NotebookMetadataSummary>, DomainError> {
    let notebooks = list_notebooks(pool).await?;
    let entry_rows = sqlx::query(
        "SELECT id, notebook_id, judul, konten, gambar_url, komentar_guru, created_at, updated_at FROM notebook_entries",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    let entries: Vec<NotebookEntry> = entry_rows
        .into_iter()
        .map(|r| NotebookEntry {
            id: r.get::<i32, _>("id").to_string(),
            notebook_id: NotebookId(r.get::<i32, _>("notebook_id").to_string()),
            judul: r.get("judul"),
            konten: String::new(),
            gambar_url: None,
            komentar_guru: r.get("komentar_guru"),
            created_at: r.get::<DateTime<Utc>, _>("created_at").to_rfc3339(),
            updated_at: r.get::<DateTime<Utc>, _>("updated_at").to_rfc3339(),
        })
        .collect();

    Ok(notebooks
        .iter()
        .map(|nb| summarize_notebook_metadata(nb, &entries))
        .collect())
}

pub async fn list_permitted_notebook_entries(
    pool: &MySqlPool,
    ctx: &AuthContext,
) -> Result<Vec<NotebookEntry>, DomainError> {
    match ctx.active_role {
        UserRole::Siswa => {
            let Some(stu) = &ctx.student else {
                return Ok(Vec::new());
            };
            let stu_id: i64 = stu.id.0.parse().unwrap_or(0);
            let rows = sqlx::query(
                r#"
                SELECT ne.id, ne.notebook_id, ne.judul, ne.konten, ne.gambar_url, ne.komentar_guru, ne.created_at, ne.updated_at
                FROM notebook_entries ne
                JOIN notebooks nb ON nb.id = ne.notebook_id
                WHERE nb.student_id = ?
                ORDER BY ne.id DESC
                "#,
            )
            .bind(stu_id)
            .fetch_all(pool)
            .await
            .map_err(map_sqlx_error)?;
            Ok(map_entry_rows(rows))
        }
        UserRole::GuruMapel => {
            let Some(tch) = &ctx.teacher else {
                return Ok(Vec::new());
            };
            let tch_id: i64 = tch.id.0.parse().unwrap_or(0);
            let rows = sqlx::query(
                r#"
                SELECT ne.id, ne.notebook_id, ne.judul, ne.konten, ne.gambar_url, ne.komentar_guru, ne.created_at, ne.updated_at
                FROM notebook_entries ne
                JOIN notebooks nb ON nb.id = ne.notebook_id
                JOIN teacher_assignments ta ON ta.id = nb.teacher_assignment_id
                WHERE ta.teacher_id = ?
                ORDER BY ne.id DESC
                "#,
            )
            .bind(tch_id)
            .fetch_all(pool)
            .await
            .map_err(map_sqlx_error)?;
            Ok(map_entry_rows(rows))
        }
        _ => Ok(Vec::new()),
    }
}

pub async fn get_notebook_entries(
    pool: &MySqlPool,
    ctx: &AuthContext,
    notebook_id: &str,
) -> Result<Vec<NotebookEntry>, DomainError> {
    let nb_id: i64 = notebook_id
        .parse()
        .map_err(|_| DomainError::not_found("notebook", notebook_id))?;

    let nb_row = sqlx::query(
        "SELECT id, student_id, subject_id, teacher_assignment_id FROM notebooks WHERE id = ? LIMIT 1",
    )
    .bind(nb_id)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx_error)?
    .ok_or_else(|| DomainError::not_found("notebook", notebook_id))?;

    let nb = Notebook {
        id: NotebookId(nb_row.get::<i32, _>("id").to_string()),
        student_id: StudentId(nb_row.get::<i32, _>("student_id").to_string()),
        subject_id: SubjectId(nb_row.get::<i32, _>("subject_id").to_string()),
        teacher_assignment_id: AssignmentId(nb_row.get::<i32, _>("teacher_assignment_id").to_string()),
    };

    let ta_id = nb_row.get::<i32, _>("teacher_assignment_id") as i64;
    let ta = get_teacher_assignment_by_id(pool, ta_id).await?;
    guard_notebook_content_read(ctx, &nb, ta.as_ref())?;

    let rows = sqlx::query(
        "SELECT id, notebook_id, judul, konten, gambar_url, komentar_guru, created_at, updated_at FROM notebook_entries WHERE notebook_id = ? ORDER BY id DESC",
    )
    .bind(nb_id)
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(map_entry_rows(rows))
}

pub async fn create_notebook_entry(
    pool: &MySqlPool,
    ctx: &AuthContext,
    subject_id: &str,
    judul: &str,
    konten: &str,
    gambar_url: Option<&str>,
) -> Result<NotebookEntry, DomainError> {
    let Some(student) = &ctx.student else {
        return Err(DomainError::forbidden(
            "Hanya siswa yang dapat menulis catatan buku tulis.",
            "SISWA:WRITE_NOTEBOOK",
        ));
    };
    if ctx.active_role != UserRole::Siswa {
        return Err(DomainError::forbidden(
            "Hanya siswa yang dapat menulis catatan buku tulis.",
            "SISWA:WRITE_NOTEBOOK",
        ));
    }
    if judul.trim().len() < 2 || konten.trim().len() < 3 {
        return Err(DomainError::validation(
            "konten",
            "Judul dan isi catatan buku tulis wajib diisi.",
        ));
    }

    let stu_id: i64 = student
        .id
        .0
        .parse()
        .map_err(|_| DomainError::internal("ID siswa tidak valid."))?;
    let rombel_id: i64 = student
        .rombel_id
        .0
        .parse()
        .map_err(|_| DomainError::internal("ID rombel siswa tidak valid."))?;
    let sub_id: i64 = subject_id
        .parse()
        .map_err(|_| DomainError::not_found("subject", subject_id))?;

    let mut tx = pool.begin().await.map_err(map_sqlx_error)?;

    let existing_nb = sqlx::query(
        "SELECT id FROM notebooks WHERE student_id = ? AND subject_id = ? LIMIT 1",
    )
    .bind(stu_id)
    .bind(sub_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_sqlx_error)?;

    let notebook_id: i64 = if let Some(row) = existing_nb {
        row.get::<i32, _>("id") as i64
    } else {
        let ta_row = sqlx::query(
            "SELECT id FROM teacher_assignments WHERE rombel_id = ? AND subject_id = ? LIMIT 1",
        )
        .bind(rombel_id)
        .bind(sub_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(map_sqlx_error)?
        .ok_or_else(|| DomainError::not_found("teacher_assignment", subject_id))?;
        let ta_id = ta_row.get::<i32, _>("id") as i64;
        let nb_res = sqlx::query(
            "INSERT INTO notebooks (student_id, subject_id, teacher_assignment_id) VALUES (?, ?, ?)",
        )
        .bind(stu_id)
        .bind(sub_id)
        .bind(ta_id)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;
        nb_res.last_insert_id() as i64
    };

    let res = sqlx::query(
        "INSERT INTO notebook_entries (notebook_id, judul, konten, gambar_url) VALUES (?, ?, ?, ?)",
    )
    .bind(notebook_id)
    .bind(judul.trim())
    .bind(konten.trim())
    .bind(gambar_url)
    .execute(&mut *tx)
    .await
    .map_err(map_sqlx_error)?;

    let entry_id = res.last_insert_id();
    tx.commit().await.map_err(map_sqlx_error)?;

    let now_iso = Utc::now().to_rfc3339();
    Ok(NotebookEntry {
        id: entry_id.to_string(),
        notebook_id: NotebookId(notebook_id.to_string()),
        judul: judul.trim().to_string(),
        konten: konten.trim().to_string(),
        gambar_url: gambar_url.map(str::to_string),
        komentar_guru: None,
        created_at: now_iso.clone(),
        updated_at: now_iso,
    })
}

pub async fn comment_notebook_entry(
    pool: &MySqlPool,
    ctx: &AuthContext,
    entry_id: &str,
    komentar: &str,
) -> Result<NotebookEntry, DomainError> {
    let eid: i64 = entry_id
        .parse()
        .map_err(|_| DomainError::not_found("notebook_entry", entry_id))?;

    let row = sqlx::query(
        "SELECT ne.id, ne.notebook_id, nb.teacher_assignment_id FROM notebook_entries ne JOIN notebooks nb ON nb.id = ne.notebook_id WHERE ne.id = ? LIMIT 1",
    )
    .bind(eid)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx_error)?
    .ok_or_else(|| DomainError::not_found("notebook_entry", entry_id))?;

    let ta_id = row.get::<i32, _>("teacher_assignment_id") as i64;
    let ta = get_teacher_assignment_by_id(pool, ta_id).await?;
    guard_teacher_assignment_ownership(ctx, ta.as_ref(), "komentar buku tulis")?;

    if komentar.trim().len() < 2 {
        return Err(DomainError::validation("komentar", "Komentar guru wajib diisi."));
    }

    sqlx::query("UPDATE notebook_entries SET komentar_guru = ? WHERE id = ?")
        .bind(komentar.trim())
        .bind(eid)
        .execute(pool)
        .await
        .map_err(map_sqlx_error)?;

    let updated = sqlx::query(
        "SELECT id, notebook_id, judul, konten, gambar_url, komentar_guru, created_at, updated_at FROM notebook_entries WHERE id = ? LIMIT 1",
    )
    .bind(eid)
    .fetch_one(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(map_entry_row(updated))
}

fn map_entry_rows(rows: Vec<sqlx::mysql::MySqlRow>) -> Vec<NotebookEntry> {
    rows.into_iter().map(map_entry_row).collect()
}

fn map_entry_row(r: sqlx::mysql::MySqlRow) -> NotebookEntry {
    NotebookEntry {
        id: r.get::<i32, _>("id").to_string(),
        notebook_id: NotebookId(r.get::<i32, _>("notebook_id").to_string()),
        judul: r.get("judul"),
        konten: r.get("konten"),
        gambar_url: r.get("gambar_url"),
        komentar_guru: r.get("komentar_guru"),
        created_at: r.get::<DateTime<Utc>, _>("created_at").to_rfc3339(),
        updated_at: r.get::<DateTime<Utc>, _>("updated_at").to_rfc3339(),
    }
}
