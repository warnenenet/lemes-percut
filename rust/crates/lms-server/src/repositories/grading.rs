use lms_domain::grading::{
    calculate_student_final_grade, generate_erapor_export, validate_component_weights,
    EraporExportResult, WeightValidation,
};
use lms_domain::rbac::{guard_grade_mutation, guard_teacher_assignment_ownership, AuthContext};
use lms_domain::types::*;
use lms_domain::DomainError;
use rust_decimal::Decimal;
use sqlx::{MySqlPool, Row};

use crate::error::map_sqlx_error;
use crate::repositories::master::list_rombels;
use crate::repositories::system_audit::insert_audit_log_tx;
use crate::repositories::user_access::{
    get_teacher_assignment_by_id, list_students, list_subjects, list_users,
};

pub async fn list_grade_components(
    pool: &MySqlPool,
) -> Result<Vec<GradeComponent>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, teacher_assignment_id, nama, bobot FROM grade_components ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| GradeComponent {
            id: r.get::<i32, _>("id").to_string(),
            teacher_assignment_id: AssignmentId(
                r.get::<i32, _>("teacher_assignment_id").to_string(),
            ),
            nama: GradeComponentName::from_db(&r.get::<String, _>("nama")),
            bobot: r.get("bobot"),
        })
        .collect())
}

pub async fn list_grades(pool: &MySqlPool) -> Result<Vec<GradeRecord>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, student_id, teacher_assignment_id, component_id, nilai, catatan FROM grades ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| GradeRecord {
            id: r.get::<i32, _>("id").to_string(),
            student_id: StudentId(r.get::<i32, _>("student_id").to_string()),
            teacher_assignment_id: AssignmentId(
                r.get::<i32, _>("teacher_assignment_id").to_string(),
            ),
            component_id: r.get::<i32, _>("component_id").to_string(),
            nilai: r.get("nilai"),
            catatan: r.get::<Option<String>, _>("catatan").unwrap_or_default(),
        })
        .collect())
}

pub async fn list_final_grades(pool: &MySqlPool) -> Result<Vec<FinalGrade>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, student_id, teacher_assignment_id, nilai_akhir, predikat FROM final_grades ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| FinalGrade {
            id: r.get::<i32, _>("id").to_string(),
            student_id: StudentId(r.get::<i32, _>("student_id").to_string()),
            teacher_assignment_id: AssignmentId(
                r.get::<i32, _>("teacher_assignment_id").to_string(),
            ),
            nilai_akhir: r.get("nilai_akhir"),
            predikat: r.get("predikat"),
        })
        .collect())
}

pub async fn list_erapor_mappings(
    pool: &MySqlPool,
) -> Result<Vec<EraporColumnMapping>, DomainError> {
    let rows = sqlx::query(
        "SELECT id, academic_year_id, mapel_id, template_name, mapping_json, created_by FROM erapor_column_mappings ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|r| {
            let mapping_val: serde_json::Value = r.get("mapping_json");
            let mapping: Vec<EraporMappingColumn> =
                serde_json::from_value(mapping_val).unwrap_or_default();
            EraporColumnMapping {
                id: r.get::<i32, _>("id").to_string(),
                academic_year_id: AcademicYearId(r.get::<i32, _>("academic_year_id").to_string()),
                mapel_id: r
                    .get::<Option<i32>, _>("mapel_id")
                    .map(|v| SubjectId(v.to_string())),
                template_name: r.get("template_name"),
                mapping,
                created_by: UserId(r.get::<i32, _>("created_by").to_string()),
            }
        })
        .collect())
}

pub async fn upsert_grade(
    pool: &MySqlPool,
    ctx: &AuthContext,
    student_id: &str,
    teacher_assignment_id: &str,
    component_id: &str,
    nilai: Decimal,
    catatan: &str,
) -> Result<(GradeRecord, Option<FinalGrade>, WeightValidation), DomainError> {
    let ta_id: i64 = teacher_assignment_id
        .parse()
        .map_err(|_| DomainError::not_found("teacher_assignment", teacher_assignment_id))?;
    let ta_opt = get_teacher_assignment_by_id(pool, ta_id).await?;
    let ta = guard_grade_mutation(ctx, ta_opt.as_ref())?;

    let stu_id: i64 = student_id
        .parse()
        .map_err(|_| DomainError::not_found("student", student_id))?;
    let comp_id: i64 = component_id
        .parse()
        .map_err(|_| DomainError::not_found("grade_component", component_id))?;

    let zero = Decimal::ZERO;
    let hundred = Decimal::new(100, 0);
    if nilai < zero || nilai > hundred {
        return Err(DomainError::validation(
            "nilai",
            "Nilai harus berada pada rentang 0 sampai 100.",
        ));
    }

    let rounded_nilai = nilai.round_dp(2);
    let trimmed_catatan = catatan.trim().to_string();

    let mut tx = pool.begin().await.map_err(map_sqlx_error)?;

    sqlx::query("SELECT id FROM students WHERE id = ? LIMIT 1")
        .bind(stu_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(map_sqlx_error)?
        .ok_or_else(|| DomainError::not_found("student", student_id))?;

    sqlx::query("SELECT id FROM grade_components WHERE id = ? AND teacher_assignment_id = ? LIMIT 1")
        .bind(comp_id)
        .bind(ta_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(map_sqlx_error)?
        .ok_or_else(|| DomainError::not_found("grade_component", component_id))?;

    sqlx::query(
        r#"
        INSERT INTO grades (student_id, teacher_assignment_id, component_id, nilai, catatan)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          nilai = VALUES(nilai),
          catatan = VALUES(catatan)
        "#,
    )
    .bind(stu_id)
    .bind(ta_id)
    .bind(comp_id)
    .bind(rounded_nilai)
    .bind(&trimmed_catatan)
    .execute(&mut *tx)
    .await
    .map_err(map_sqlx_error)?;

    let saved_row = sqlx::query(
        "SELECT id, student_id, teacher_assignment_id, component_id, nilai, catatan FROM grades WHERE student_id = ? AND component_id = ? LIMIT 1",
    )
    .bind(stu_id)
    .bind(comp_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_sqlx_error)?;

    let record = GradeRecord {
        id: saved_row.get::<i32, _>("id").to_string(),
        student_id: StudentId(stu_id.to_string()),
        teacher_assignment_id: AssignmentId(ta_id.to_string()),
        component_id: comp_id.to_string(),
        nilai: saved_row.get("nilai"),
        catatan: saved_row
            .get::<Option<String>, _>("catatan")
            .unwrap_or_default(),
    };

    let comp_rows = sqlx::query(
        "SELECT id, teacher_assignment_id, nama, bobot FROM grade_components WHERE teacher_assignment_id = ? ORDER BY id ASC",
    )
    .bind(ta_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(map_sqlx_error)?;

    let ta_components: Vec<GradeComponent> = comp_rows
        .into_iter()
        .map(|r| GradeComponent {
            id: r.get::<i32, _>("id").to_string(),
            teacher_assignment_id: AssignmentId(
                r.get::<i32, _>("teacher_assignment_id").to_string(),
            ),
            nama: GradeComponentName::from_db(&r.get::<String, _>("nama")),
            bobot: r.get("bobot"),
        })
        .collect();

    let stu_grade_rows = sqlx::query(
        "SELECT id, student_id, teacher_assignment_id, component_id, nilai, catatan FROM grades WHERE student_id = ? AND teacher_assignment_id = ?",
    )
    .bind(stu_id)
    .bind(ta_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(map_sqlx_error)?;

    let stu_grades: Vec<GradeRecord> = stu_grade_rows
        .into_iter()
        .map(|r| GradeRecord {
            id: r.get::<i32, _>("id").to_string(),
            student_id: StudentId(r.get::<i32, _>("student_id").to_string()),
            teacher_assignment_id: AssignmentId(
                r.get::<i32, _>("teacher_assignment_id").to_string(),
            ),
            component_id: r.get::<i32, _>("component_id").to_string(),
            nilai: r.get("nilai"),
            catatan: r.get::<Option<String>, _>("catatan").unwrap_or_default(),
        })
        .collect();

    let weight_validation = validate_component_weights(&ta_components);
    let (final_score_opt, predicate) = calculate_student_final_grade(
        &stu_id.to_string(),
        &ta_components,
        &stu_grades,
        ta.kurikulum_acuan,
    );

    let final_grade = if let Some(nilai_akhir) = final_score_opt {
        sqlx::query(
            r#"
            INSERT INTO final_grades (student_id, teacher_assignment_id, nilai_akhir, predikat)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              nilai_akhir = VALUES(nilai_akhir),
              predikat = VALUES(predikat)
            "#,
        )
        .bind(stu_id)
        .bind(ta_id)
        .bind(nilai_akhir)
        .bind(&predicate)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;

        let fg_row = sqlx::query(
            "SELECT id, student_id, teacher_assignment_id, nilai_akhir, predikat FROM final_grades WHERE student_id = ? AND teacher_assignment_id = ? LIMIT 1",
        )
        .bind(stu_id)
        .bind(ta_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;

        Some(FinalGrade {
            id: fg_row.get::<i32, _>("id").to_string(),
            student_id: StudentId(stu_id.to_string()),
            teacher_assignment_id: AssignmentId(ta_id.to_string()),
            nilai_akhir: fg_row.get("nilai_akhir"),
            predikat: fg_row.get("predikat"),
        })
    } else {
        None
    };

    let actor_uid: i64 = ctx.user.id.0.parse().unwrap_or(1);
    insert_audit_log_tx(
        &mut tx,
        actor_uid,
        "UPSERT_GRADE",
        "grades",
        &record.id,
        &format!("Input nilai {rounded_nilai} untuk siswa {student_id}"),
    )
    .await?;

    tx.commit().await.map_err(map_sqlx_error)?;
    Ok((record, final_grade, weight_validation))
}

pub async fn export_erapor(
    pool: &MySqlPool,
    ctx: &AuthContext,
    teacher_assignment_id: &str,
    mapping_id: Option<&str>,
) -> Result<EraporExportResult, DomainError> {
    let ta_id: i64 = teacher_assignment_id
        .parse()
        .map_err(|_| DomainError::not_found("teacher_assignment", teacher_assignment_id))?;
    let ta_opt = get_teacher_assignment_by_id(pool, ta_id).await?;
    let ta = guard_teacher_assignment_ownership(ctx, ta_opt.as_ref(), "export e-Rapor")?;

    let (rombels, students, users, all_components, all_grades, mappings, _subjects) = tokio::try_join!(
        list_rombels(pool),
        list_students(pool),
        list_users(pool),
        list_grade_components(pool),
        list_grades(pool),
        list_erapor_mappings(pool),
        list_subjects(pool),
    )?;

    let rombel = rombels
        .iter()
        .find(|r| r.id == ta.rombel_id)
        .ok_or_else(|| DomainError::not_found("rombel", &ta.rombel_id.0))?;

    let selected_mapping = mapping_id
        .and_then(|mid| mappings.iter().find(|m| m.id == mid))
        .or_else(|| {
            mappings
                .iter()
                .find(|m| m.mapel_id.as_ref() == Some(&ta.subject_id))
        })
        .or_else(|| mappings.first());

    let comps: Vec<GradeComponent> = all_components
        .into_iter()
        .filter(|c| c.teacher_assignment_id == ta.id)
        .collect();
    let grades: Vec<GradeRecord> = all_grades
        .into_iter()
        .filter(|g| g.teacher_assignment_id == ta.id)
        .collect();

    let exported = generate_erapor_export(
        selected_mapping,
        rombel,
        &students,
        &users,
        &comps,
        &grades,
    )?;

    let mapping_log_id = selected_mapping.map(|m| m.id.as_str()).unwrap_or("none");
    let actor_uid: i64 = ctx.user.id.0.parse().unwrap_or(1);
    let mut tx = pool.begin().await.map_err(map_sqlx_error)?;
    insert_audit_log_tx(
        &mut tx,
        actor_uid,
        "EXPORT_ERAPOR",
        "erapor_mappings",
        mapping_log_id,
        &format!(
            "Export e-Rapor kelas {} ({} siswa)",
            rombel.nama_rombel,
            exported.rows.len()
        ),
    )
    .await?;
    tx.commit().await.map_err(map_sqlx_error)?;

    Ok(exported)
}
