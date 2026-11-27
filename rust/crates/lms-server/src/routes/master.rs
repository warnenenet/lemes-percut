use axum::{
    extract::{Extension, State},
    Json,
};
use lms_domain::rbac::AuthContext;
use lms_domain::types::{AcademicYear, AcademicYearId, School};
use serde_json::{json, Value};
use std::sync::Arc;

use crate::error::ApiError;
use crate::middleware::AppState;
use crate::repositories::{
    cbt, grading, learning, master, notebook, perangkat_ajar, pkl, system_audit, user_access,
};
use crate::routes::{
    ClientAuthContext, ClientExamAnswer, ClientGradeComponent, ClientGradeRecord,
    ClientImportBatch, ClientMapelPklContribution, ClientPklScore, ClientQuestion,
    ClientTaskSubmission,
};

fn default_school() -> School {
    School {
        id: "1".to_string(),
        npsn: "10214029".to_string(),
        nama: "SMK Negeri 1 Percut Sei Tuan".to_string(),
        alamat: "Jl. Kolam No. 3, Medan Estate, Kec. Percut Sei Tuan, Kab. Deli Serdang, Sumatera Utara".to_string(),
        kepala_sekolah: "Drs. H. Kasman, M.Pd".to_string(),
        telepon: "(061) 7381234".to_string(),
        email: "info@smkn1percut.sch.id".to_string(),
        logo_url: "/src/assets/images/smkn1_emblem_1794859933905.jpg".to_string(),
    }
}

fn default_academic_year() -> AcademicYear {
    AcademicYear {
        id: AcademicYearId("1".to_string()),
        tahun_ajaran: "2025/2026".to_string(),
        semester: "GENAP".to_string(),
        tanggal_mulai: "2026-01-05".to_string(),
        tanggal_selesai: "2026-06-20".to_string(),
        is_active: true,
    }
}

pub async fn get_public_bootstrap(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, ApiError> {
    let (school_opt, years, users) = tokio::try_join!(
        master::get_school(&state.pool),
        master::list_academic_years(&state.pool),
        user_access::list_users(&state.pool),
    )?;

    let school = school_opt.unwrap_or_else(default_school);
    let active_year = years
        .iter()
        .find(|y| y.is_active)
        .cloned()
        .or_else(|| years.into_iter().next())
        .unwrap_or_else(default_academic_year);

    let demo_users: Vec<Value> = if state.config.is_production() {
        Vec::new()
    } else {
        let demo_emails = [
            "admin@smkn1percut.sch.id",
            "kepsek@smkn1percut.sch.id",
            "wakasek@smkn1percut.sch.id",
            "budi.mtk@smkn1percut.sch.id",
            "hendra.bk@smkn1percut.sch.id",
            "rizky.siswa@smkn1percut.sch.id",
            "aisyah.siswa@smkn1percut.sch.id",
        ];
        users
            .iter()
            .filter(|u| demo_emails.contains(&u.email.as_str()))
            .map(|u| {
                json!({
                    "id": u.id,
                    "nama": u.nama,
                    "email": u.email,
                    "roles": u.roles
                })
            })
            .collect()
    };

    Ok(Json(json!({
        "school": school,
        "academic_year": active_year,
        "app_mode": state.config.app_mode,
        "engine": "mysql",
        "allow_demo_reset": false,
        "total_accounts": users.len(),
        "demo_users": demo_users
    })))
}

pub async fn get_workspace_state(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
) -> Result<Json<Value>, ApiError> {
    let (
        school_opt,
        academic_years,
        majors,
        rombels,
        users,
        teachers,
        students,
        bk_counselors,
        bk_class_assignments,
        subjects,
        teacher_assignments,
        sessions,
        attendance_records,
        modules,
        assignments,
        submissions,
    ) = tokio::try_join!(
        master::get_school(&state.pool),
        master::list_academic_years(&state.pool),
        master::list_majors(&state.pool),
        master::list_rombels(&state.pool),
        user_access::list_users(&state.pool),
        user_access::list_teachers(&state.pool),
        user_access::list_students(&state.pool),
        user_access::list_bk_counselors(&state.pool),
        user_access::list_bk_class_assignments(&state.pool),
        user_access::list_subjects(&state.pool),
        user_access::list_teacher_assignments(&state.pool),
        learning::list_sessions(&state.pool),
        learning::list_attendance_records(&state.pool),
        learning::list_modules(&state.pool),
        learning::list_assignments(&state.pool),
        learning::list_submissions(&state.pool),
    )?;

    let (
        notebooks,
        notebook_metadata,
        notebook_entries,
        grade_components,
        grades,
        erapor_mappings,
        question_banks,
        questions,
        exams,
        exam_sessions,
        exam_answers,
        dudis,
        pks_documents,
        pkl_placements,
        pkl_journals,
        pkl_scores,
    ) = tokio::try_join!(
        notebook::list_notebooks(&state.pool),
        notebook::list_notebook_metadata(&state.pool),
        notebook::list_permitted_notebook_entries(&state.pool, &ctx),
        grading::list_grade_components(&state.pool),
        grading::list_grades(&state.pool),
        grading::list_erapor_mappings(&state.pool),
        cbt::list_question_banks(&state.pool),
        cbt::list_questions(&state.pool),
        cbt::list_exams(&state.pool),
        cbt::list_exam_sessions(&state.pool),
        cbt::list_exam_answers(&state.pool),
        pkl::list_dudis(&state.pool),
        pkl::list_pks_documents(&state.pool),
        pkl::list_pkl_placements(&state.pool),
        pkl::list_pkl_journals(&state.pool),
        pkl::list_pkl_scores(&state.pool),
    )?;

    let (
        mapel_pkl_contributions,
        prompt_templates,
        teacher_documents,
        notifications,
        audit_logs,
        import_batches,
        coaching_notes,
        walikelas_notes,
    ) = tokio::try_join!(
        pkl::list_mapel_pkl_contributions(&state.pool),
        perangkat_ajar::list_prompt_templates(&state.pool),
        perangkat_ajar::list_teacher_documents(&state.pool),
        system_audit::list_notifications(&state.pool),
        system_audit::list_audit_logs(&state.pool),
        system_audit::list_import_batches(&state.pool),
        system_audit::list_coaching_notes(&state.pool),
        system_audit::list_walikelas_notes(&state.pool),
    )?;

    let backup_history = system_audit::list_disk_backup_files(&state.config.backup_dir);
    let school = school_opt.unwrap_or_else(default_school);

    let submissions_dto: Vec<ClientTaskSubmission> =
        submissions.into_iter().map(ClientTaskSubmission::from).collect();
    let grade_components_dto: Vec<ClientGradeComponent> =
        grade_components.into_iter().map(ClientGradeComponent::from).collect();
    let grades_dto: Vec<ClientGradeRecord> =
        grades.into_iter().map(ClientGradeRecord::from).collect();
    let questions_dto: Vec<ClientQuestion> =
        questions.into_iter().map(ClientQuestion::from).collect();
    let exam_answers_dto: Vec<ClientExamAnswer> =
        exam_answers.into_iter().map(ClientExamAnswer::from).collect();
    let pkl_scores_dto: Vec<ClientPklScore> =
        pkl_scores.into_iter().map(ClientPklScore::from).collect();
    let mapel_pkl_dto: Vec<ClientMapelPklContribution> = mapel_pkl_contributions
        .into_iter()
        .map(ClientMapelPklContribution::from)
        .collect();
    let import_batches_dto: Vec<ClientImportBatch> =
        import_batches.into_iter().map(ClientImportBatch::from).collect();

    Ok(Json(json!({
        "ok": true,
        "auth": ClientAuthContext::from(&ctx),
        "state": {
            "school": school,
            "academic_years": academic_years,
            "majors": majors,
            "rombels": rombels,
            "users": users,
            "teachers": teachers,
            "students": students,
            "bk_counselors": bk_counselors,
            "bk_class_assignments": bk_class_assignments,
            "subjects": subjects,
            "teacher_assignments": teacher_assignments,
            "sessions": sessions,
            "attendance_records": attendance_records,
            "modules": modules,
            "assignments": assignments,
            "submissions": submissions_dto,
            "notebooks": notebooks,
            "notebook_metadata": notebook_metadata,
            "notebook_entries": notebook_entries,
            "grade_components": grade_components_dto,
            "grades": grades_dto,
            "erapor_mappings": erapor_mappings,
            "question_banks": question_banks,
            "questions": questions_dto,
            "exams": exams,
            "exam_sessions": exam_sessions,
            "exam_answers": exam_answers_dto,
            "dudis": dudis,
            "pks_documents": pks_documents,
            "pkl_placements": pkl_placements,
            "pkl_journals": pkl_journals,
            "pkl_scores": pkl_scores_dto,
            "mapel_pkl_contributions": mapel_pkl_dto,
            "prompt_templates": prompt_templates,
            "teacher_documents": teacher_documents,
            "notifications": notifications,
            "audit_logs": audit_logs,
            "import_batches": import_batches_dto,
            "coaching_notes": coaching_notes,
            "walikelas_notes": walikelas_notes,
            "backup_history": backup_history
        }
    })))
}

pub async fn get_majors(State(state): State<Arc<AppState>>) -> Result<Json<Value>, ApiError> {
    let majors = master::list_majors(&state.pool).await?;
    Ok(Json(json!({ "ok": true, "majors": majors })))
}

pub async fn get_rombels(State(state): State<Arc<AppState>>) -> Result<Json<Value>, ApiError> {
    let rombels = master::list_rombels(&state.pool).await?;
    Ok(Json(json!({ "ok": true, "rombels": rombels })))
}

pub async fn get_subjects(State(state): State<Arc<AppState>>) -> Result<Json<Value>, ApiError> {
    let subjects = user_access::list_subjects(&state.pool).await?;
    Ok(Json(json!({ "ok": true, "subjects": subjects })))
}

pub async fn get_teacher_assignments(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, ApiError> {
    let teacher_assignments = user_access::list_teacher_assignments(&state.pool).await?;
    Ok(Json(json!({ "ok": true, "teacher_assignments": teacher_assignments })))
}
