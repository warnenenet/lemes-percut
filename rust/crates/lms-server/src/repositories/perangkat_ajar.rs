use chrono::{DateTime, Utc};
use lms_domain::prompt_engine::{
    apply_teacher_document_content_edit, assemble_prompt_for_teacher, can_publish_teacher_document,
    PromptContextData,
};
use lms_domain::rbac::{guard_teacher_assignment_ownership, AuthContext};
use lms_domain::types::*;
use lms_domain::DomainError;
use sqlx::{MySqlPool, Row};
use std::collections::HashMap;

use crate::error::map_sqlx_error;
use crate::repositories::master::{
    get_school, list_academic_years, list_majors, list_rombels,
};
use crate::repositories::system_audit::insert_audit_log_tx;
use crate::repositories::user_access::{
    get_teacher_assignment_by_id, list_students, list_subjects,
};

pub async fn list_prompt_templates(pool: &MySqlPool) -> Result<Vec<PromptTemplate>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, kode, nama, kategori, kurikulum_acuan, input_schema_json, template_body, output_structure, validation_checklist_json, version, status FROM prompt_templates ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| {
            let input_val: serde_json::Value = r.get("input_schema_json");
            let input_fields: Vec<PromptInputField> =
                serde_json::from_value(input_val).unwrap_or_default();
            let checklist_val: serde_json::Value = r.get("validation_checklist_json");
            let validation_checklist: Vec<String> =
                serde_json::from_value(checklist_val).unwrap_or_default();
            PromptTemplate {
                id: TemplateId(r.get::<i32, _>("id").to_string()),
                kode: r.get("kode"),
                nama: r.get("nama"),
                kategori: SubjectGroup::from_db(&r.get::<String, _>("kategori")),
                kurikulum_acuan: r.get("kurikulum_acuan"),
                input_fields,
                template_body: r.get("template_body"),
                output_structure: r.get("output_structure"),
                validation_checklist,
                version: r.get::<i32, _>("version") as u32,
                status: r.get("status"),
            }
        })
        .collect())
}

pub async fn list_teacher_documents(pool: &MySqlPool) -> Result<Vec<TeacherDocument>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, teacher_assignment_id, template_id, judul, konten, generated_prompt, status, generated_at, pasted_at, published_at, validation_json FROM teacher_documents ORDER BY id DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| {
            let val_json: serde_json::Value = r.get("validation_json");
            let checklist_state: HashMap<String, bool> =
                serde_json::from_value(val_json).unwrap_or_default();
            TeacherDocument {
                id: r.get::<i32, _>("id").to_string(),
                teacher_assignment_id: AssignmentId(
                    r.get::<i32, _>("teacher_assignment_id").to_string(),
                ),
                template_id: TemplateId(r.get::<i32, _>("template_id").to_string()),
                judul: r.get("judul"),
                konten: r.get("konten"),
                status: DocumentStatus::from_db(&r.get::<String, _>("status")),
                generated_prompt: r
                    .get::<Option<String>, _>("generated_prompt")
                    .unwrap_or_default(),
                generated_at: r
                    .try_get::<Option<DateTime<Utc>>, _>("generated_at")
                    .ok()
                    .flatten()
                    .map(|dt| dt.to_rfc3339()),
                pasted_at: r
                    .try_get::<Option<DateTime<Utc>>, _>("pasted_at")
                    .ok()
                    .flatten()
                    .map(|dt| dt.to_rfc3339()),
                published_at: r
                    .try_get::<Option<DateTime<Utc>>, _>("published_at")
                    .ok()
                    .flatten()
                    .map(|dt| dt.to_rfc3339()),
                checklist_state,
            }
        })
        .collect())
}

pub async fn generate_prompt(
    pool: &MySqlPool,
    ctx: &AuthContext,
    teacher_assignment_id: &str,
    template_id: &str,
    teacher_inputs: &HashMap<String, String>,
) -> Result<String, DomainError> {
    let ta_id: i64 = teacher_assignment_id
        .parse()
        .map_err(|_| DomainError::not_found("teacher_assignment", teacher_assignment_id))?;
    let ta_opt = get_teacher_assignment_by_id(pool, ta_id).await?;
    let ta = guard_teacher_assignment_ownership(ctx, ta_opt.as_ref(), "perangkat ajar")?;

    let (templates, school_opt, years, rombels, majors, subjects, students) = tokio::try_join!(
        list_prompt_templates(pool),
        get_school(pool),
        list_academic_years(pool),
        list_rombels(pool),
        list_majors(pool),
        list_subjects(pool),
        list_students(pool),
    )?;

    let template = templates
        .iter()
        .find(|t| t.id.0 == template_id)
        .ok_or_else(|| DomainError::not_found("prompt_template", template_id))?;
    let school = school_opt.unwrap_or_else(|| School {
        id: "1".into(),
        npsn: "10214029".into(),
        nama: "SMK Negeri 1 Percut Sei Tuan".into(),
        alamat: "Jl. Kolam No. 3, Medan Estate".into(),
        kepala_sekolah: "Kepala Sekolah".into(),
        telepon: "-".into(),
        email: "info@smkn1percut.sch.id".into(),
        logo_url: String::new(),
    });

    let rombel = rombels
        .iter()
        .find(|r| r.id == ta.rombel_id)
        .ok_or_else(|| DomainError::not_found("rombel", &ta.rombel_id.0))?;
    let major = majors
        .iter()
        .find(|m| m.id == rombel.major_id)
        .ok_or_else(|| DomainError::not_found("major", &rombel.major_id.0))?;
    let subject = subjects
        .iter()
        .find(|s| s.id == ta.subject_id)
        .ok_or_else(|| DomainError::not_found("subject", &ta.subject_id.0))?;
    let academic_year = years
        .iter()
        .find(|y| y.id == ta.academic_year_id)
        .or_else(|| years.first())
        .ok_or_else(|| DomainError::not_found("academic_year", &ta.academic_year_id.0))?;

    let student_count = students
        .iter()
        .filter(|s| s.rombel_id == rombel.id && s.status != "ALUMNI")
        .count();

    let teacher_nip = ctx.teacher.as_ref().map(|t| t.nip.as_str()).unwrap_or("-");

    let prompt_ctx = PromptContextData {
        school: &school,
        academic_year,
        teacher_user: &ctx.user,
        teacher_nip,
        subject,
        rombel,
        major,
        assignment: ta,
        student_count,
    };

    assemble_prompt_for_teacher(template, &prompt_ctx, teacher_inputs)
}

pub async fn save_teacher_document(
    pool: &MySqlPool,
    ctx: &AuthContext,
    doc_id: Option<&str>,
    teacher_assignment_id: &str,
    template_id: &str,
    judul: &str,
    konten: &str,
    generated_prompt: Option<&str>,
    checklist_state: Option<HashMap<String, bool>>,
) -> Result<TeacherDocument, DomainError> {
    let ta_id: i64 = teacher_assignment_id
        .parse()
        .map_err(|_| DomainError::not_found("teacher_assignment", teacher_assignment_id))?;
    let ta_opt = get_teacher_assignment_by_id(pool, ta_id).await?;
    guard_teacher_assignment_ownership(ctx, ta_opt.as_ref(), "simpan perangkat ajar")?;

    if judul.trim().len() < 3 {
        return Err(DomainError::validation(
            "judul",
            "Judul perangkat ajar wajib diisi minimal 3 karakter.",
        ));
    }

    let now = Utc::now();
    if let Some(existing_id_str) = doc_id.map(str::trim).filter(|s| !s.is_empty()) {
        if let Ok(existing_id) = existing_id_str.parse::<i64>() {
            let existing_opt = sqlx::query(
                "SELECT id, teacher_assignment_id, template_id, judul, konten, generated_prompt, status, generated_at, pasted_at, published_at, validation_json FROM teacher_documents WHERE id = ? LIMIT 1",
            )
            .bind(existing_id)
            .fetch_optional(pool)
            .await
            .map_err(map_sqlx_error)?;

            if let Some(r) = existing_opt {
                let existing_ta = r.get::<i32, _>("teacher_assignment_id") as i64;
                if existing_ta != ta_id && ctx.active_role != UserRole::Admin {
                    return Err(DomainError::forbidden(
                        "Akses ditolak (403): Dokumen perangkat ajar milik penugasan lain.",
                        "GURU_MAPEL:OWN_ASSIGNMENT",
                    ));
                }

                let existing_checklist: HashMap<String, bool> =
                    serde_json::from_value(r.get("validation_json")).unwrap_or_default();
                let current_doc = TeacherDocument {
                    id: existing_id.to_string(),
                    teacher_assignment_id: AssignmentId(existing_ta.to_string()),
                    template_id: TemplateId(r.get::<i32, _>("template_id").to_string()),
                    judul: r.get("judul"),
                    konten: r.get("konten"),
                    status: DocumentStatus::from_db(&r.get::<String, _>("status")),
                    generated_prompt: r
                        .get::<Option<String>, _>("generated_prompt")
                        .unwrap_or_default(),
                    generated_at: r
                        .try_get::<Option<DateTime<Utc>>, _>("generated_at")
                        .ok()
                        .flatten()
                        .map(|dt| dt.to_rfc3339()),
                    pasted_at: Some(now.to_rfc3339()),
                    published_at: r
                        .try_get::<Option<DateTime<Utc>>, _>("published_at")
                        .ok()
                        .flatten()
                        .map(|dt| dt.to_rfc3339()),
                    checklist_state: existing_checklist,
                };

                let mut edited = apply_teacher_document_content_edit(
                    &current_doc,
                    judul.trim(),
                    konten.trim(),
                );
                if let Some(gp) = generated_prompt {
                    if !gp.is_empty() {
                        edited.generated_prompt = gp.to_string();
                    }
                }
                if let Some(new_checklist) = checklist_state {
                    edited.checklist_state = new_checklist;
                }

                let val_json = serde_json::to_value(&edited.checklist_state)
                    .map_err(|_| DomainError::internal("Gagal menyerialisasi checklist."))?;
                let pub_dt: Option<DateTime<Utc>> = edited
                    .published_at
                    .as_deref()
                    .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
                    .map(|dt| dt.with_timezone(&Utc));

                sqlx::query(
                    "UPDATE teacher_documents SET judul = ?, konten = ?, generated_prompt = ?, status = ?, pasted_at = ?, published_at = ?, validation_json = ? WHERE id = ?",
                )
                .bind(&edited.judul)
                .bind(&edited.konten)
                .bind(&edited.generated_prompt)
                .bind(edited.status.as_str())
                .bind(now)
                .bind(pub_dt)
                .bind(val_json)
                .bind(existing_id)
                .execute(pool)
                .await
                .map_err(map_sqlx_error)?;

                return Ok(edited);
            }
        }
    }

    let tpl_id: i64 = template_id
        .parse()
        .map_err(|_| DomainError::not_found("prompt_template", template_id))?;
    sqlx::query("SELECT id FROM prompt_templates WHERE id = ? LIMIT 1")
        .bind(tpl_id)
        .fetch_optional(pool)
        .await
        .map_err(map_sqlx_error)?
        .ok_or_else(|| DomainError::not_found("prompt_template", template_id))?;

    let checklist = checklist_state.unwrap_or_default();
    let val_json = serde_json::to_value(&checklist)
        .map_err(|_| DomainError::internal("Gagal menyerialisasi checklist."))?;
    let prompt_text = generated_prompt.unwrap_or("").to_string();

    let res = sqlx::query(
        r#"
        INSERT INTO teacher_documents
          (teacher_assignment_id, template_id, judul, konten, generated_prompt, status, generated_at, pasted_at, published_at, validation_json)
        VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, NULL, ?)
        "#,
    )
    .bind(ta_id)
    .bind(tpl_id)
    .bind(judul.trim())
    .bind(konten.trim())
    .bind(&prompt_text)
    .bind(now)
    .bind(now)
    .bind(val_json)
    .execute(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(TeacherDocument {
        id: res.last_insert_id().to_string(),
        teacher_assignment_id: AssignmentId(ta_id.to_string()),
        template_id: TemplateId(tpl_id.to_string()),
        judul: judul.trim().to_string(),
        konten: konten.trim().to_string(),
        status: DocumentStatus::Draft,
        generated_prompt: prompt_text,
        generated_at: Some(now.to_rfc3339()),
        pasted_at: Some(now.to_rfc3339()),
        published_at: None,
        checklist_state: checklist,
    })
}

pub async fn publish_teacher_document(
    pool: &MySqlPool,
    ctx: &AuthContext,
    document_id: &str,
    checklist_state: Option<HashMap<String, bool>>,
) -> Result<TeacherDocument, DomainError> {
    let doc_id: i64 = document_id
        .parse()
        .map_err(|_| DomainError::not_found("teacher_document", document_id))?;

    let doc_row = sqlx::query(
        "SELECT id, teacher_assignment_id, template_id, judul, konten, generated_prompt, status, generated_at, pasted_at, published_at, validation_json FROM teacher_documents WHERE id = ? LIMIT 1",
    )
    .bind(doc_id)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx_error)?
    .ok_or_else(|| DomainError::not_found("teacher_document", document_id))?;

    let ta_id = doc_row.get::<i32, _>("teacher_assignment_id") as i64;
    let ta_opt = get_teacher_assignment_by_id(pool, ta_id).await?;
    guard_teacher_assignment_ownership(ctx, ta_opt.as_ref(), "publish perangkat ajar")?;

    let tpl_id = doc_row.get::<i32, _>("template_id").to_string();
    let templates = list_prompt_templates(pool).await?;
    let template = templates
        .iter()
        .find(|t| t.id.0 == tpl_id)
        .ok_or_else(|| DomainError::not_found("prompt_template", &tpl_id))?;

    let existing_checklist: HashMap<String, bool> =
        serde_json::from_value(doc_row.get("validation_json")).unwrap_or_default();
    let merged_checklist = checklist_state.unwrap_or(existing_checklist);

    let mut doc = TeacherDocument {
        id: doc_id.to_string(),
        teacher_assignment_id: AssignmentId(ta_id.to_string()),
        template_id: TemplateId(tpl_id),
        judul: doc_row.get("judul"),
        konten: doc_row.get("konten"),
        status: DocumentStatus::from_db(&doc_row.get::<String, _>("status")),
        generated_prompt: doc_row
            .get::<Option<String>, _>("generated_prompt")
            .unwrap_or_default(),
        generated_at: doc_row
            .try_get::<Option<DateTime<Utc>>, _>("generated_at")
            .ok()
            .flatten()
            .map(|dt| dt.to_rfc3339()),
        pasted_at: doc_row
            .try_get::<Option<DateTime<Utc>>, _>("pasted_at")
            .ok()
            .flatten()
            .map(|dt| dt.to_rfc3339()),
        published_at: doc_row
            .try_get::<Option<DateTime<Utc>>, _>("published_at")
            .ok()
            .flatten()
            .map(|dt| dt.to_rfc3339()),
        checklist_state: merged_checklist,
    };

    can_publish_teacher_document(&doc, template)?;

    let now = Utc::now();
    let val_json = serde_json::to_value(&doc.checklist_state)
        .map_err(|_| DomainError::internal("Gagal menyerialisasi checklist."))?;

    let mut tx = pool.begin().await.map_err(map_sqlx_error)?;
    sqlx::query(
        "UPDATE teacher_documents SET status = 'PUBLISHED', published_at = ?, validation_json = ? WHERE id = ?",
    )
    .bind(now)
    .bind(val_json)
    .bind(doc_id)
    .execute(&mut *tx)
    .await
    .map_err(map_sqlx_error)?;

    let actor_uid: i64 = ctx.user.id.0.parse().unwrap_or(1);
    insert_audit_log_tx(
        &mut tx,
        actor_uid,
        "PUBLISH_TEACHER_DOCUMENT",
        "teacher_documents",
        &doc_id.to_string(),
        &format!("Mempublikasikan perangkat ajar \"{}\"", doc.judul),
    )
    .await?;

    tx.commit().await.map_err(map_sqlx_error)?;

    doc.status = DocumentStatus::Published;
    doc.published_at = Some(now.to_rfc3339());
    Ok(doc)
}
