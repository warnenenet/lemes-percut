pub mod admin;
pub mod auth;
pub mod cbt;
pub mod files;
pub mod grading;
pub mod health;
pub mod learning;
pub mod master;
pub mod notebook;
pub mod perangkat_ajar;
pub mod pkl;

use axum::{
    http::Method,
    middleware::{from_fn, from_fn_with_state},
    routing::{get, post},
    Router,
};
use lms_domain::grading::WeightValidation;
use lms_domain::rbac::AuthContext;
use lms_domain::types::{
    BkCounselor, ExamAnswer, FinalGrade, GradeComponent, GradeComponentName, GradeRecord,
    ImportBatch, MapelPklContribution, PklScore, PklScoreComponent, Question, QuestionType,
    Student, StudentId, AssignmentId, Teacher, TeacherId, TaskId, TaskSubmission, User, UserId,
    UserRole, ExamSessionId, PlacementId, SubjectId,
};
use rust_decimal::prelude::ToPrimitive;
use rust_decimal::Decimal;
use serde::Serialize;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

use crate::middleware::{require_admin, require_auth, AppState};

pub fn dec_to_f64(d: Decimal) -> f64 {
    d.round_dp(2).to_f64().unwrap_or(0.0)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientAuthContext<'a> {
    pub user: &'a User,
    pub active_role: UserRole,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub teacher: Option<&'a Teacher>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub student: Option<&'a Student>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bk_counselor: Option<&'a BkCounselor>,
}

impl<'a> From<&'a AuthContext> for ClientAuthContext<'a> {
    fn from(ctx: &'a AuthContext) -> Self {
        Self {
            user: &ctx.user,
            active_role: ctx.active_role,
            teacher: ctx.teacher.as_ref(),
            student: ctx.student.as_ref(),
            bk_counselor: ctx.bk_counselor.as_ref(),
        }
    }
}

#[derive(Serialize)]
pub struct ClientTaskSubmission {
    pub id: String,
    pub assignment_id: TaskId,
    pub student_id: StudentId,
    pub file_url: Option<String>,
    pub teks: Option<String>,
    pub submitted_at: String,
    pub nilai: Option<f64>,
    pub dinilai_oleh: Option<TeacherId>,
    pub catatan_guru: Option<String>,
}

impl From<TaskSubmission> for ClientTaskSubmission {
    fn from(s: TaskSubmission) -> Self {
        Self {
            id: s.id,
            assignment_id: s.assignment_id,
            student_id: s.student_id,
            file_url: s.file_url,
            teks: s.teks,
            submitted_at: s.submitted_at,
            nilai: s.nilai.map(dec_to_f64),
            dinilai_oleh: s.dinilai_oleh,
            catatan_guru: s.catatan_guru,
        }
    }
}

#[derive(Serialize)]
pub struct ClientGradeComponent {
    pub id: String,
    pub teacher_assignment_id: AssignmentId,
    pub nama: GradeComponentName,
    pub bobot: f64,
}

impl From<GradeComponent> for ClientGradeComponent {
    fn from(c: GradeComponent) -> Self {
        Self {
            id: c.id,
            teacher_assignment_id: c.teacher_assignment_id,
            nama: c.nama,
            bobot: dec_to_f64(c.bobot),
        }
    }
}

#[derive(Serialize)]
pub struct ClientGradeRecord {
    pub id: String,
    pub student_id: StudentId,
    pub teacher_assignment_id: AssignmentId,
    pub component_id: String,
    pub nilai: f64,
    pub catatan: String,
}

impl From<GradeRecord> for ClientGradeRecord {
    fn from(g: GradeRecord) -> Self {
        Self {
            id: g.id,
            student_id: g.student_id,
            teacher_assignment_id: g.teacher_assignment_id,
            component_id: g.component_id,
            nilai: dec_to_f64(g.nilai),
            catatan: g.catatan,
        }
    }
}

#[derive(Serialize)]
pub struct ClientFinalGrade {
    pub id: String,
    pub student_id: StudentId,
    pub teacher_assignment_id: AssignmentId,
    pub nilai_akhir: f64,
    pub predikat: String,
}

impl From<FinalGrade> for ClientFinalGrade {
    fn from(fg: FinalGrade) -> Self {
        Self {
            id: fg.id,
            student_id: fg.student_id,
            teacher_assignment_id: fg.teacher_assignment_id,
            nilai_akhir: dec_to_f64(fg.nilai_akhir),
            predikat: fg.predikat,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientWeightValidation {
    pub valid: bool,
    pub total_weight: f64,
    pub message: Option<String>,
}

impl From<WeightValidation> for ClientWeightValidation {
    fn from(w: WeightValidation) -> Self {
        Self {
            valid: w.valid,
            total_weight: dec_to_f64(w.total_weight),
            message: w.message,
        }
    }
}

#[derive(Serialize)]
pub struct ClientQuestion {
    pub id: String,
    pub bank_id: String,
    pub tipe: QuestionType,
    pub stem: String,
    pub options: Vec<String>,
    pub jawaban: String,
    pub rubrik: String,
    pub skor: f64,
    pub level_kognitif: String,
}

impl From<Question> for ClientQuestion {
    fn from(q: Question) -> Self {
        Self {
            id: q.id,
            bank_id: q.bank_id,
            tipe: q.tipe,
            stem: q.stem,
            options: q.options,
            jawaban: q.jawaban,
            rubrik: q.rubrik,
            skor: dec_to_f64(q.skor),
            level_kognitif: q.level_kognitif,
        }
    }
}

#[derive(Serialize)]
pub struct ClientExamAnswer {
    pub id: String,
    pub exam_session_id: ExamSessionId,
    pub question_id: String,
    pub jawaban: String,
    pub skor: Option<f64>,
    pub disimpan_pada: String,
}

impl From<ExamAnswer> for ClientExamAnswer {
    fn from(a: ExamAnswer) -> Self {
        Self {
            id: a.id,
            exam_session_id: a.exam_session_id,
            question_id: a.question_id,
            jawaban: a.jawaban,
            skor: a.skor.map(dec_to_f64),
            disimpan_pada: a.disimpan_pada,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientExamGradeSummary {
    pub total_earned: f64,
    pub total_possible: f64,
    pub percentage: f64,
}

#[derive(Serialize)]
pub struct ClientPklScore {
    pub id: String,
    pub placement_id: PlacementId,
    pub komponen: PklScoreComponent,
    pub nilai: f64,
    pub dinilai_oleh: UserId,
}

impl From<PklScore> for ClientPklScore {
    fn from(s: PklScore) -> Self {
        Self {
            id: s.id,
            placement_id: s.placement_id,
            komponen: s.komponen,
            nilai: dec_to_f64(s.nilai),
            dinilai_oleh: s.dinilai_oleh,
        }
    }
}

#[derive(Serialize)]
pub struct ClientMapelPklContribution {
    pub id: String,
    pub student_id: StudentId,
    pub subject_id: SubjectId,
    pub nilai: f64,
    pub guru_id: TeacherId,
    pub catatan: String,
}

impl From<MapelPklContribution> for ClientMapelPklContribution {
    fn from(c: MapelPklContribution) -> Self {
        Self {
            id: c.id,
            student_id: c.student_id,
            subject_id: c.subject_id,
            nilai: dec_to_f64(c.nilai),
            guru_id: c.guru_id,
            catatan: c.catatan,
        }
    }
}

#[derive(Serialize)]
pub struct ClientImportBatch {
    pub id: String,
    pub tipe: String,
    pub filename: String,
    pub status: String,
    pub total_baris: usize,
    pub baris_sukses: usize,
    pub baris_error: usize,
    pub error_logs: Vec<serde_json::Value>,
    pub created_by: UserId,
    pub created_at: String,
}

impl From<ImportBatch> for ClientImportBatch {
    fn from(b: ImportBatch) -> Self {
        Self {
            id: b.id,
            tipe: b.tipe,
            filename: b.file_url,
            status: b.status,
            total_baris: b.total_baris,
            baris_sukses: b.baris_sukses,
            baris_error: b.baris_error,
            error_logs: b.error_log,
            created_by: b.created_by,
            created_at: b.created_at,
        }
    }
}

pub fn build_router(state: Arc<AppState>) -> Router {
    let public_routes = Router::new()
        .route("/api/health", get(health::health_check))
        .route("/api/public/bootstrap", get(master::get_public_bootstrap))
        .route("/api/auth/login", post(auth::login))
        .route("/api/auth/logout", post(auth::logout))
        .route("/api/files/{category}/{filename}", get(files::serve_file))
        .route("/api/reset-demo", post(admin::reset_demo_disabled));

    let admin_routes = Router::new()
        .route("/api/admin/import/preview", post(admin::preview_import_handler))
        .route("/api/admin/import/commit", post(admin::commit_import_handler))
        .route("/api/admin/erapor-mapping", post(admin::update_erapor_mapping_handler))
        .route("/api/admin/backup", post(admin::run_backup_handler))
        .route("/api/admin/audit-logs", get(admin::list_audit_logs_handler))
        .route("/api/admin/settings", post(admin::update_setting_handler))
        .route("/api/admin/verify", get(admin::verify_system_handler))
        .route_layer(from_fn(require_admin));

    let auth_routes = Router::new()
        .route("/api/auth/me", get(auth::me))
        .route("/api/state", get(master::get_workspace_state))
        .route("/api/master/majors", get(master::get_majors))
        .route("/api/master/rombels", get(master::get_rombels))
        .route("/api/master/subjects", get(master::get_subjects))
        .route("/api/master/assignments", get(master::get_teacher_assignments))
        .route("/api/sessions", post(learning::create_session_handler))
        .route("/api/sessions/{id}/status", post(learning::update_session_status_handler))
        .route("/api/sessions/{id}/access", post(learning::record_session_access_handler))
        .route("/api/sessions/{id}/override", post(learning::override_session_attendance_handler))
        .route("/api/modules", post(learning::create_module_handler))
        .route("/api/modules/{id}/clone", post(learning::clone_module_handler))
        .route("/api/tasks", post(learning::create_task_handler))
        .route("/api/tasks/{id}/submit", post(learning::submit_task_handler))
        .route("/api/submissions/{id}/grade", post(learning::grade_submission_handler))
        .route("/api/notebooks/metadata", get(notebook::get_notebook_metadata_handler))
        .route("/api/notebooks/{id}/entries", get(notebook::get_notebook_entries_handler))
        .route("/api/notebooks/{subject_id}/entries", post(notebook::create_notebook_entry_handler))
        .route("/api/notebook-entries/{id}/comment", post(notebook::comment_notebook_entry_handler))
        .route("/api/grades", post(grading::upsert_grade_handler))
        .route("/api/erapor/export", post(grading::export_erapor_handler))
        .route("/api/cbt/exams", post(cbt::create_exam_handler))
        .route("/api/cbt/exams/{id}/start", post(cbt::start_exam_session_handler))
        .route("/api/cbt/sessions/{id}/answer", post(cbt::save_exam_answer_handler))
        .route("/api/cbt/sessions/{id}/finish", post(cbt::finish_exam_session_handler))
        .route("/api/pkl/journals", post(pkl::create_pkl_journal_handler))
        .route("/api/pkl/journals/{id}/validate", post(pkl::validate_pkl_journal_handler))
        .route("/api/pkl/scores", post(pkl::upsert_pkl_score_handler))
        .route("/api/pkl/contributions", post(pkl::upsert_mapel_pkl_contribution_handler))
        .route("/api/perangkat-ajar/generate", post(perangkat_ajar::generate_prompt_handler))
        .route("/api/perangkat-ajar/save", post(perangkat_ajar::save_teacher_document_handler))
        .route("/api/perangkat-ajar/{id}/publish", post(perangkat_ajar::publish_teacher_document_handler))
        .route("/api/files/upload", post(files::upload_file))
        .route("/api/notifications/send", post(admin::send_notification_handler))
        .route("/api/coaching-notes", post(admin::create_coaching_note_handler))
        .route("/api/walikelas/notes", post(admin::upsert_walikelas_note_handler))
        .merge(admin_routes)
        .layer(from_fn_with_state(state.clone(), require_auth));

    let spa_index = state.config.dist_dir.join("index.html");
    let spa_service = ServeDir::new(&state.config.dist_dir).not_found_service(ServeFile::new(spa_index));

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
        .allow_headers(Any);

    Router::new()
        .merge(public_routes)
        .merge(auth_routes)
        .fallback_service(spa_service)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
