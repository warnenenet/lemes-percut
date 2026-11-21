use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct UserId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct TeacherId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct StudentId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct BkId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct RombelId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct MajorId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SubjectId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct AcademicYearId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct AssignmentId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SessionId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ModuleId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct TaskId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct NotebookId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ExamId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ExamSessionId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct PlacementId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct TemplateId(pub String);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum UserRole {
    Admin,
    KepalaSekolah,
    Wakasek,
    GuruMapel,
    GuruBk,
    WaliKelas,
    Siswa,
}

impl UserRole {
    pub fn from_header(raw: &str) -> Option<Self> {
        match raw.trim() {
            "ADMIN" => Some(Self::Admin),
            "KEPALA_SEKOLAH" => Some(Self::KepalaSekolah),
            "WAKASEK" => Some(Self::Wakasek),
            "GURU_MAPEL" => Some(Self::GuruMapel),
            "GURU_BK" => Some(Self::GuruBk),
            "WALI_KELAS" => Some(Self::WaliKelas),
            "SISWA" => Some(Self::Siswa),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Admin => "ADMIN",
            Self::KepalaSekolah => "KEPALA_SEKOLAH",
            Self::Wakasek => "WAKASEK",
            Self::GuruMapel => "GURU_MAPEL",
            Self::GuruBk => "GURU_BK",
            Self::WaliKelas => "WALI_KELAS",
            Self::Siswa => "SISWA",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CurriculumTrack {
    K13,
    Merdeka,
}

impl CurriculumTrack {
    pub fn from_db(raw: &str) -> Self {
        if raw.eq_ignore_ascii_case("K13") {
            Self::K13
        } else {
            Self::Merdeka
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::K13 => "K13",
            Self::Merdeka => "MERDEKA",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SubjectGroup {
    Umum,
    Kejuruan,
    Pkl,
    Ukk,
}

impl SubjectGroup {
    pub fn from_db(raw: &str) -> Self {
        match raw.trim() {
            "KEJURUAN" => Self::Kejuruan,
            "PKL" => Self::Pkl,
            "UKK" => Self::Ukk,
            _ => Self::Umum,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Umum => "UMUM",
            Self::Kejuruan => "KEJURUAN",
            Self::Pkl => "PKL",
            Self::Ukk => "UKK",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SessionType {
    Teori,
    Praktik,
    Tugas,
}

impl SessionType {
    pub fn from_db(raw: &str) -> Self {
        match raw.trim() {
            "PRAKTIK" => Self::Praktik,
            "TUGAS" => Self::Tugas,
            _ => Self::Teori,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Teori => "TEORI",
            Self::Praktik => "PRAKTIK",
            Self::Tugas => "TUGAS",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SessionStatus {
    Draft,
    Open,
    Closed,
}

impl SessionStatus {
    pub fn from_db(raw: &str) -> Self {
        match raw.trim() {
            "OPEN" => Self::Open,
            "CLOSED" => Self::Closed,
            _ => Self::Draft,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Draft => "DRAFT",
            Self::Open => "OPEN",
            Self::Closed => "CLOSED",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AttendanceStatus {
    Hadir,
    AksesTanpaAktivitas,
    Izin,
    Sakit,
    Alpa,
}

impl AttendanceStatus {
    pub fn from_db(raw: &str) -> Self {
        match raw.trim() {
            "HADIR" => Self::Hadir,
            "IZIN" => Self::Izin,
            "SAKIT" => Self::Sakit,
            "ALPA" => Self::Alpa,
            _ => Self::AksesTanpaAktivitas,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Hadir => "HADIR",
            Self::AksesTanpaAktivitas => "AKSES_TANPA_AKTIVITAS",
            Self::Izin => "IZIN",
            Self::Sakit => "SAKIT",
            Self::Alpa => "ALPA",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TaskType {
    Pr,
    Tugas,
    Proyek,
    Praktik,
}

impl TaskType {
    pub fn from_db(raw: &str) -> Self {
        match raw.trim() {
            "PR" => Self::Pr,
            "PROYEK" => Self::Proyek,
            "PRAKTIK" => Self::Praktik,
            _ => Self::Tugas,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pr => "PR",
            Self::Tugas => "TUGAS",
            Self::Proyek => "PROYEK",
            Self::Praktik => "PRAKTIK",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum GradeComponentName {
    Formatif,
    Sumatif,
    Praktik,
    Proyek,
    Remedial,
}

impl GradeComponentName {
    pub fn from_db(raw: &str) -> Self {
        match raw.trim() {
            "SUMATIF" => Self::Sumatif,
            "PRAKTIK" => Self::Praktik,
            "PROYEK" => Self::Proyek,
            "REMEDIAL" => Self::Remedial,
            _ => Self::Formatif,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Formatif => "FORMATIF",
            Self::Sumatif => "SUMATIF",
            Self::Praktik => "PRAKTIK",
            Self::Proyek => "PROYEK",
            Self::Remedial => "REMEDIAL",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum QuestionType {
    Pg,
    PgKompleks,
    BenarSalah,
    Menjodohkan,
    Isian,
    Uraian,
}

impl QuestionType {
    pub fn from_db(raw: &str) -> Self {
        match raw.trim() {
            "PG_KOMPLEKS" => Self::PgKompleks,
            "BENAR_SALAH" => Self::BenarSalah,
            "MENJODOHKAN" => Self::Menjodohkan,
            "ISIAN" => Self::Isian,
            "URAIAN" => Self::Uraian,
            _ => Self::Pg,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pg => "PG",
            Self::PgKompleks => "PG_KOMPLEKS",
            Self::BenarSalah => "BENAR_SALAH",
            Self::Menjodohkan => "MENJODOHKAN",
            Self::Isian => "ISIAN",
            Self::Uraian => "URAIAN",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ExamType {
    Mid,
    Final,
    Custom,
    Susulan,
}

impl ExamType {
    pub fn from_db(raw: &str) -> Self {
        match raw.trim() {
            "MID" => Self::Mid,
            "FINAL" => Self::Final,
            "SUSULAN" => Self::Susulan,
            _ => Self::Custom,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Mid => "MID",
            Self::Final => "FINAL",
            Self::Custom => "CUSTOM",
            Self::Susulan => "SUSULAN",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ExamStatus {
    Draft,
    Terjadwal,
    Aktif,
    Selesai,
}

impl ExamStatus {
    pub fn from_db(raw: &str) -> Self {
        match raw.trim() {
            "TERJADWAL" => Self::Terjadwal,
            "AKTIF" => Self::Aktif,
            "SELESAI" => Self::Selesai,
            _ => Self::Draft,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Draft => "DRAFT",
            Self::Terjadwal => "TERJADWAL",
            Self::Aktif => "AKTIF",
            Self::Selesai => "SELESAI",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ExamSessionStatus {
    Terjadwal,
    Mengerjakan,
    Selesai,
    TidakHadir,
    Susulan,
}

impl ExamSessionStatus {
    pub fn from_db(raw: &str) -> Self {
        match raw.trim() {
            "MENGERJAKAN" => Self::Mengerjakan,
            "SELESAI" => Self::Selesai,
            "TIDAK_HADIR" => Self::TidakHadir,
            "SUSULAN" => Self::Susulan,
            _ => Self::Terjadwal,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Terjadwal => "TERJADWAL",
            Self::Mengerjakan => "MENGERJAKAN",
            Self::Selesai => "SELESAI",
            Self::TidakHadir => "TIDAK_HADIR",
            Self::Susulan => "SUSULAN",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PklScoreComponent {
    DudiHard,
    DudiSoft,
    DudiDisiplin,
    SekolahLaporan,
    SekolahSidang,
}

impl PklScoreComponent {
    pub fn from_db(raw: &str) -> Option<Self> {
        match raw.trim() {
            "DUDI_HARD" => Some(Self::DudiHard),
            "DUDI_SOFT" => Some(Self::DudiSoft),
            "DUDI_DISIPLIN" => Some(Self::DudiDisiplin),
            "SEKOLAH_LAPORAN" => Some(Self::SekolahLaporan),
            "SEKOLAH_SIDANG" => Some(Self::SekolahSidang),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::DudiHard => "DUDI_HARD",
            Self::DudiSoft => "DUDI_SOFT",
            Self::DudiDisiplin => "DUDI_DISIPLIN",
            Self::SekolahLaporan => "SEKOLAH_LAPORAN",
            Self::SekolahSidang => "SEKOLAH_SIDANG",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DocumentStatus {
    Draft,
    Published,
}

impl DocumentStatus {
    pub fn from_db(raw: &str) -> Self {
        if raw.trim() == "PUBLISHED" {
            Self::Published
        } else {
            Self::Draft
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Draft => "DRAFT",
            Self::Published => "PUBLISHED",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct School {
    pub id: String,
    pub npsn: String,
    pub nama: String,
    pub alamat: String,
    pub kepala_sekolah: String,
    pub telepon: String,
    pub email: String,
    pub logo_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcademicYear {
    pub id: AcademicYearId,
    pub tahun_ajaran: String,
    pub semester: String,
    pub tanggal_mulai: String,
    pub tanggal_selesai: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Major {
    pub id: MajorId,
    pub kode: String,
    pub nama: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rombel {
    pub id: RombelId,
    pub tingkat: u8,
    pub major_id: MajorId,
    pub academic_year_id: AcademicYearId,
    pub kurikulum_acuan: CurriculumTrack,
    pub nama_rombel: String,
    pub wali_kelas_id: Option<TeacherId>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: UserId,
    pub nama: String,
    pub email: String,
    pub roles: Vec<UserRole>,
    pub status: String,
    pub last_login_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Teacher {
    pub id: TeacherId,
    pub user_id: UserId,
    pub nuptk: String,
    pub nip: String,
    pub bidang: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Student {
    pub id: StudentId,
    pub user_id: UserId,
    pub nisn: String,
    pub nis: String,
    pub rombel_id: RombelId,
    pub jenis_kelamin: String,
    pub tanggal_lahir: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BkCounselor {
    pub id: BkId,
    pub user_id: UserId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BkClassAssignment {
    pub id: String,
    pub bk_id: BkId,
    pub rombel_id: RombelId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subject {
    pub id: SubjectId,
    pub kode: String,
    pub nama: String,
    pub kelompok: SubjectGroup,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeacherAssignment {
    pub id: AssignmentId,
    pub teacher_id: TeacherId,
    pub subject_id: SubjectId,
    pub rombel_id: RombelId,
    pub academic_year_id: AcademicYearId,
    pub semester: String,
    pub kurikulum_acuan: CurriculumTrack,
    pub jam_per_minggu: u8,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LearningModule {
    pub id: ModuleId,
    pub teacher_assignment_id: AssignmentId,
    pub judul: String,
    pub konten: String,
    pub status: DocumentStatus,
    pub cloned_from: Option<ModuleId>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeachingSession {
    pub id: SessionId,
    pub teacher_assignment_id: AssignmentId,
    pub pertemuan_ke: u32,
    pub tanggal: String,
    pub jam_mulai: String,
    pub jam_selesai: String,
    pub tipe_sesi: SessionType,
    pub topik: String,
    pub module_id: Option<ModuleId>,
    pub status: SessionStatus,
    pub minimum_read_pct: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttendanceRecord {
    pub id: String,
    pub session_id: SessionId,
    pub student_id: StudentId,
    pub status: AttendanceStatus,
    pub aktivitas_minimum_terpenuhi: bool,
    pub read_pct: u8,
    pub submitted_task: bool,
    pub submitted_reflection: bool,
    pub diakses_pada: Option<String>,
    pub diaktifkan_pada: Option<String>,
    pub override_oleh: Option<UserId>,
    pub alasan_override: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssignmentTask {
    pub id: TaskId,
    pub session_id: Option<SessionId>,
    pub teacher_assignment_id: AssignmentId,
    pub judul: String,
    pub deskripsi: String,
    pub deadline: String,
    pub tipe: TaskType,
    pub rubrik: Option<String>,
    pub cloned_from: Option<TaskId>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSubmission {
    pub id: String,
    pub assignment_id: TaskId,
    pub student_id: StudentId,
    pub file_url: Option<String>,
    pub teks: Option<String>,
    pub submitted_at: String,
    pub nilai: Option<Decimal>,
    pub dinilai_oleh: Option<TeacherId>,
    pub catatan_guru: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notebook {
    pub id: NotebookId,
    pub student_id: StudentId,
    pub subject_id: SubjectId,
    pub teacher_assignment_id: AssignmentId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotebookEntry {
    pub id: String,
    pub notebook_id: NotebookId,
    pub judul: String,
    pub konten: String,
    pub gambar_url: Option<String>,
    pub komentar_guru: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotebookMetadataSummary {
    pub notebook_id: NotebookId,
    pub student_id: StudentId,
    pub subject_id: SubjectId,
    pub entry_count: usize,
    pub last_updated_at: Option<String>,
    pub has_teacher_comment: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GradeComponent {
    pub id: String,
    pub teacher_assignment_id: AssignmentId,
    pub nama: GradeComponentName,
    pub bobot: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GradeRecord {
    pub id: String,
    pub student_id: StudentId,
    pub teacher_assignment_id: AssignmentId,
    pub component_id: String,
    pub nilai: Decimal,
    pub catatan: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FinalGrade {
    pub id: String,
    pub student_id: StudentId,
    pub teacher_assignment_id: AssignmentId,
    pub nilai_akhir: Decimal,
    pub predikat: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EraporMappingColumn {
    pub erapor_column: String,
    pub system_field: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EraporColumnMapping {
    pub id: String,
    pub academic_year_id: AcademicYearId,
    pub mapel_id: Option<SubjectId>,
    pub template_name: String,
    pub mapping: Vec<EraporMappingColumn>,
    pub created_by: UserId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionBank {
    pub id: String,
    pub subject_id: SubjectId,
    pub teacher_id: TeacherId,
    pub judul: String,
    pub kurikulum_acuan: CurriculumTrack,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Question {
    pub id: String,
    pub bank_id: String,
    pub tipe: QuestionType,
    pub stem: String,
    pub options: Vec<String>,
    pub jawaban: String,
    pub rubrik: String,
    pub skor: Decimal,
    pub level_kognitif: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Exam {
    pub id: ExamId,
    pub teacher_assignment_id: AssignmentId,
    pub tipe: ExamType,
    pub judul: String,
    pub waktu_mulai: String,
    pub durasi_menit: i64,
    pub token: String,
    pub status: ExamStatus,
    pub parent_exam_id: Option<ExamId>,
    pub target_student_ids: Option<Vec<StudentId>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExamSession {
    pub id: ExamSessionId,
    pub exam_id: ExamId,
    pub student_id: StudentId,
    pub status: ExamSessionStatus,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub tab_switch_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExamAnswer {
    pub id: String,
    pub exam_session_id: ExamSessionId,
    pub question_id: String,
    pub jawaban: String,
    pub skor: Option<Decimal>,
    pub disimpan_pada: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dudi {
    pub id: String,
    pub nama: String,
    pub alamat: String,
    pub bidang: String,
    pub kontak: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PksDocument {
    pub id: String,
    pub dudi_id: String,
    pub nomor: String,
    pub tanggal_mulai: String,
    pub tanggal_selesai: String,
    pub file_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PklPlacement {
    pub id: PlacementId,
    pub student_id: StudentId,
    pub dudi_id: String,
    pub pks_id: String,
    pub pembimbing_bk_id: BkId,
    pub pembimbing_dudi_nama: String,
    pub periode_mulai: String,
    pub periode_selesai: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PklJournal {
    pub id: String,
    pub placement_id: PlacementId,
    pub tanggal: String,
    pub aktivitas: String,
    pub validasi_bk: bool,
    pub catatan_bk: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PklScore {
    pub id: String,
    pub placement_id: PlacementId,
    pub komponen: PklScoreComponent,
    pub nilai: Decimal,
    pub dinilai_oleh: UserId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MapelPklContribution {
    pub id: String,
    pub student_id: StudentId,
    pub subject_id: SubjectId,
    pub nilai: Decimal,
    pub guru_id: TeacherId,
    pub catatan: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptInputField {
    pub key: String,
    pub label: String,
    pub placeholder: String,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptTemplate {
    pub id: TemplateId,
    pub kode: String,
    pub nama: String,
    pub kategori: SubjectGroup,
    pub kurikulum_acuan: String,
    pub input_fields: Vec<PromptInputField>,
    pub template_body: String,
    pub output_structure: String,
    pub validation_checklist: Vec<String>,
    pub version: u32,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeacherDocument {
    pub id: String,
    pub teacher_assignment_id: AssignmentId,
    pub template_id: TemplateId,
    pub judul: String,
    pub konten: String,
    pub status: DocumentStatus,
    pub generated_prompt: String,
    pub generated_at: Option<String>,
    pub pasted_at: Option<String>,
    pub published_at: Option<String>,
    pub checklist_state: HashMap<String, bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppNotification {
    pub id: String,
    pub user_id: UserId,
    pub tipe: String,
    pub judul: String,
    pub pesan: String,
    pub entitas: String,
    pub entitas_id: String,
    pub dibaca_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLog {
    pub id: String,
    pub user_id: UserId,
    pub aksi: String,
    pub entitas: String,
    pub entitas_id: String,
    pub detail: String,
    pub ip: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportBatch {
    pub id: String,
    pub tipe: String,
    pub file_url: String,
    pub status: String,
    pub total_baris: usize,
    pub baris_sukses: usize,
    pub baris_error: usize,
    pub error_log: Vec<serde_json::Value>,
    pub created_by: UserId,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoachingNote {
    pub id: String,
    pub author_user_id: UserId,
    pub target_type: String,
    pub target_id: String,
    pub judul: String,
    pub catatan: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalikelasNote {
    pub student_id: StudentId,
    pub catatan: String,
    pub updated_at: String,
}
