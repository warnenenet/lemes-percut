/**
 * Core Domain Types & Branded Newtype Identifiers
 * Mirrors Rust newtype structs (`struct TeacherId(String);`) and enums.
 */

export type Brand<K, T> = K & { readonly __brand: T };

export type UserId = Brand<string, 'UserId'> | string;
export type TeacherId = Brand<string, 'TeacherId'> | string;
export type StudentId = Brand<string, 'StudentId'> | string;
export type BkId = Brand<string, 'BkId'> | string;
export type RombelId = Brand<string, 'RombelId'> | string;
export type MajorId = Brand<string, 'MajorId'> | string;
export type SubjectId = Brand<string, 'SubjectId'> | string;
export type AcademicYearId = Brand<string, 'AcademicYearId'> | string;
export type AssignmentId = Brand<string, 'AssignmentId'> | string;
export type SessionId = Brand<string, 'SessionId'> | string;
export type ModuleId = Brand<string, 'ModuleId'> | string;
export type TaskId = Brand<string, 'TaskId'> | string;
export type NotebookId = Brand<string, 'NotebookId'> | string;
export type ExamId = Brand<string, 'ExamId'> | string;
export type ExamSessionId = Brand<string, 'ExamSessionId'> | string;
export type PlacementId = Brand<string, 'PlacementId'> | string;
export type TemplateId = Brand<string, 'TemplateId'> | string;

export type UserRole =
  | 'ADMIN'
  | 'KEPALA_SEKOLAH'
  | 'WAKASEK'
  | 'GURU_MAPEL'
  | 'GURU_BK'
  | 'WALI_KELAS'
  | 'SISWA';

export type CurriculumTrack = 'K13' | 'MERDEKA';

export type SubjectGroup = 'UMUM' | 'KEJURUAN' | 'PKL' | 'UKK';

export type SessionType = 'TEORI' | 'PRAKTIK' | 'TUGAS';

export type SessionStatus = 'DRAFT' | 'OPEN' | 'CLOSED';

export type AttendanceStatus =
  | 'HADIR'
  | 'AKSES_TANPA_AKTIVITAS'
  | 'IZIN'
  | 'SAKIT'
  | 'ALPA';

export type TaskType = 'PR' | 'TUGAS' | 'PROYEK' | 'PRAKTIK';

export type GradeComponentName =
  | 'FORMATIF'
  | 'SUMATIF'
  | 'PRAKTIK'
  | 'PROYEK'
  | 'REMEDIAL';

export type QuestionType =
  | 'PG'
  | 'PG_KOMPLEKS'
  | 'BENAR_SALAH'
  | 'MENJODOHKAN'
  | 'ISIAN'
  | 'URAIAN';

export type ExamType = 'MID' | 'FINAL' | 'CUSTOM' | 'SUSULAN';

export type ExamStatus = 'DRAFT' | 'TERJADWAL' | 'AKTIF' | 'SELESAI';

export type ExamSessionStatus =
  | 'TERJADWAL'
  | 'MENGERJAKAN'
  | 'SELESAI'
  | 'TIDAK_HADIR'
  | 'SUSULAN';

export type PklScoreComponent =
  | 'DUDI_HARD'
  | 'DUDI_SOFT'
  | 'DUDI_DISIPLIN'
  | 'SEKOLAH_LAPORAN'
  | 'SEKOLAH_SIDANG';

export type DocumentStatus = 'DRAFT' | 'PUBLISHED';

export type ImportBatchType =
  | 'SISWA'
  | 'GURU'
  | 'NILAI'
  | 'TEACHER_ASSIGNMENT';

// --- Master Tables ---
export interface School {
  readonly id: string;
  readonly npsn: string;
  readonly nama: string;
  readonly alamat: string;
  readonly kepala_sekolah: string;
  readonly telepon: string;
  readonly email: string;
  readonly logo_url: string;
}

export interface AcademicYear {
  readonly id: AcademicYearId;
  readonly tahun_ajaran: string;
  readonly semester: 'GANJIL' | 'GENAP';
  readonly tanggal_mulai: string;
  readonly tanggal_selesai: string;
  readonly is_active: boolean;
}

export interface Major {
  readonly id: MajorId;
  readonly kode: string;
  readonly nama: string;
}

export interface Rombel {
  readonly id: RombelId;
  readonly tingkat: 10 | 11 | 12;
  readonly major_id: MajorId;
  readonly academic_year_id: AcademicYearId;
  readonly kurikulum_acuan: CurriculumTrack;
  readonly nama_rombel: string;
  readonly wali_kelas_id: TeacherId | null;
}

export interface User {
  readonly id: UserId;
  readonly nama: string;
  readonly email: string;
  readonly roles: ReadonlyArray<UserRole>;
  readonly status: 'AKTIF' | 'NONAKTIF';
  readonly last_login_at: string;
}

export interface Teacher {
  readonly id: TeacherId;
  readonly user_id: UserId;
  readonly nuptk: string;
  readonly nip: string;
  readonly bidang: string;
}

export interface Student {
  readonly id: StudentId;
  readonly user_id: UserId;
  readonly nisn: string;
  readonly nis: string;
  readonly rombel_id: RombelId;
  readonly jenis_kelamin: 'L' | 'P';
  readonly tanggal_lahir: string;
  readonly status: 'AKTIF' | 'PKL' | 'ALUMNI';
}

export interface BkCounselor {
  readonly id: BkId;
  readonly user_id: UserId;
}

export interface BkClassAssignment {
  readonly id: string;
  readonly bk_id: BkId;
  readonly rombel_id: RombelId;
}

// --- RBAC Core: Penugasan Mengajar ---
export interface Subject {
  readonly id: SubjectId;
  readonly kode: string;
  readonly nama: string;
  readonly kelompok: SubjectGroup;
}

export interface TeacherAssignment {
  readonly id: AssignmentId;
  readonly teacher_id: TeacherId;
  readonly subject_id: SubjectId;
  readonly rombel_id: RombelId;
  readonly academic_year_id: AcademicYearId;
  readonly semester: 'GANJIL' | 'GENAP';
  readonly kurikulum_acuan: CurriculumTrack;
  readonly jam_per_minggu: number;
  readonly status: 'AKTIF' | 'NONAKTIF';
}

// --- Pembelajaran & Absensi ---
export interface TeachingSession {
  readonly id: SessionId;
  readonly teacher_assignment_id: AssignmentId;
  readonly pertemuan_ke: number;
  readonly tanggal: string;
  readonly jam_mulai: string; // HH:mm
  readonly jam_selesai: string; // HH:mm
  readonly tipe_sesi: SessionType;
  readonly topik: string;
  readonly module_id: ModuleId | null;
  readonly status: SessionStatus;
  readonly minimum_read_pct: number;
}

export interface AttendanceRecord {
  readonly id: string;
  readonly session_id: SessionId;
  readonly student_id: StudentId;
  readonly status: AttendanceStatus;
  readonly aktivitas_minimum_terpenuhi: boolean;
  readonly read_pct: number;
  readonly submitted_task: boolean;
  readonly submitted_reflection: boolean;
  readonly diakses_pada: string | null;
  readonly diaktifkan_pada: string | null;
  readonly override_oleh: UserId | null;
  readonly alasan_override: string | null;
}

// --- Modul, Tugas, Buku Tulis ---
export interface LearningModule {
  readonly id: ModuleId;
  readonly teacher_assignment_id: AssignmentId;
  readonly judul: string;
  readonly konten: string;
  readonly status: DocumentStatus;
  readonly cloned_from: ModuleId | null;
  readonly updated_at: string;
}

export interface AssignmentTask {
  readonly id: TaskId;
  readonly session_id: SessionId | null;
  readonly teacher_assignment_id: AssignmentId;
  readonly judul: string;
  readonly deskripsi: string;
  readonly deadline: string;
  readonly tipe: TaskType;
  readonly rubrik: string;
  readonly cloned_from: TaskId | null;
}

export interface TaskSubmission {
  readonly id: string;
  readonly assignment_id: TaskId;
  readonly student_id: StudentId;
  readonly file_url: string | null;
  readonly teks: string | null;
  readonly submitted_at: string;
  readonly nilai: number | null;
  readonly dinilai_oleh: TeacherId | null;
  readonly catatan_guru: string | null;
}

export interface Notebook {
  readonly id: NotebookId;
  readonly student_id: StudentId;
  readonly subject_id: SubjectId;
  readonly teacher_assignment_id: AssignmentId;
}

export interface NotebookEntry {
  readonly id: string;
  readonly notebook_id: NotebookId;
  readonly judul: string;
  readonly konten: string;
  readonly gambar_url: string | null;
  readonly komentar_guru: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface NotebookMetadataSummary {
  readonly notebook_id: NotebookId;
  readonly student_id: StudentId;
  readonly subject_id: SubjectId;
  readonly entry_count: number;
  readonly last_updated_at: string | null;
  readonly has_teacher_comment: boolean;
}

// --- Nilai & e-Rapor ---
export interface GradeComponent {
  readonly id: string;
  readonly teacher_assignment_id: AssignmentId;
  readonly nama: GradeComponentName;
  readonly bobot: number; // percentage 0..100
}

export interface GradeRecord {
  readonly id: string;
  readonly student_id: StudentId;
  readonly teacher_assignment_id: AssignmentId;
  readonly component_id: string;
  readonly nilai: number;
  readonly catatan: string;
}

export interface FinalGrade {
  readonly id: string;
  readonly student_id: StudentId;
  readonly teacher_assignment_id: AssignmentId;
  readonly nilai_akhir: number;
  readonly predikat: string;
}

export interface EraporColumnMapping {
  readonly id: string;
  readonly academic_year_id: AcademicYearId;
  readonly mapel_id: SubjectId | null;
  readonly template_name: string;
  readonly mapping: ReadonlyArray<{
    readonly erapor_column: string;
    readonly system_field:
      | 'nisn'
      | 'nis'
      | 'nama_siswa'
      | 'nama_rombel'
      | 'nilai_formatif'
      | 'nilai_sumatif'
      | 'nilai_praktik'
      | 'nilai_akhir'
      | 'predikat'
      | 'deskripsi_capaian';
  }>;
  readonly created_by: UserId;
}

// --- CBT ---
export interface QuestionBank {
  readonly id: string;
  readonly subject_id: SubjectId;
  readonly teacher_id: TeacherId;
  readonly judul: string;
  readonly kurikulum_acuan: CurriculumTrack;
}

export interface Question {
  readonly id: string;
  readonly bank_id: string;
  readonly tipe: QuestionType;
  readonly stem: string;
  readonly options: ReadonlyArray<string>;
  readonly jawaban: string;
  readonly rubrik: string;
  readonly skor: number;
  readonly level_kognitif: 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6';
}

export interface Exam {
  readonly id: ExamId;
  readonly teacher_assignment_id: AssignmentId;
  readonly tipe: ExamType;
  readonly judul: string;
  readonly waktu_mulai: string; // ISO string
  readonly durasi_menit: number;
  readonly token: string;
  readonly status: ExamStatus;
  readonly parent_exam_id: ExamId | null;
  readonly target_student_ids?: ReadonlyArray<StudentId>; // optional subset for SUSULAN
}

export interface ExamSession {
  readonly id: ExamSessionId;
  readonly exam_id: ExamId;
  readonly student_id: StudentId;
  readonly status: ExamSessionStatus;
  readonly started_at: string | null;
  readonly finished_at: string | null;
  readonly tab_switch_count: number;
}

export interface ExamAnswer {
  readonly id: string;
  readonly exam_session_id: ExamSessionId;
  readonly question_id: string;
  readonly jawaban: string;
  readonly skor: number | null;
  readonly disimpan_pada: string;
}

// --- PKL ---
export interface Dudi {
  readonly id: string;
  readonly nama: string;
  readonly alamat: string;
  readonly bidang: string;
  readonly kontak: string;
}

export interface PksDocument {
  readonly id: string;
  readonly dudi_id: string;
  readonly nomor: string;
  readonly tanggal_mulai: string;
  readonly tanggal_selesai: string;
  readonly file_url: string;
}

export interface PklPlacement {
  readonly id: PlacementId;
  readonly student_id: StudentId;
  readonly dudi_id: string;
  readonly pks_id: string;
  readonly pembimbing_bk_id: BkId;
  readonly pembimbing_dudi_nama: string;
  readonly periode_mulai: string;
  readonly periode_selesai: string;
  readonly status: 'BERJALAN' | 'SELESAI' | 'PERLU_PEMBINAAN';
}

export interface PklJournal {
  readonly id: string;
  readonly placement_id: PlacementId;
  readonly tanggal: string;
  readonly aktivitas: string;
  readonly validasi_bk: boolean;
  readonly catatan_bk: string;
}

export interface PklScore {
  readonly id: string;
  readonly placement_id: PlacementId;
  readonly komponen: PklScoreComponent;
  readonly nilai: number;
  readonly dinilai_oleh: UserId;
}

export interface MapelPklContribution {
  readonly id: string;
  readonly student_id: StudentId;
  readonly subject_id: SubjectId;
  readonly nilai: number;
  readonly guru_id: TeacherId;
  readonly catatan: string;
}

// --- Perangkat Ajar & Prompt ---
export interface PromptTemplate {
  readonly id: TemplateId;
  readonly kode: string;
  readonly nama: string;
  readonly kategori: SubjectGroup;
  readonly kurikulum_acuan: CurriculumTrack | 'BOTH';
  readonly input_fields: ReadonlyArray<{
    readonly key: string;
    readonly label: string;
    readonly placeholder: string;
    readonly required: boolean;
  }>;
  readonly template_body: string;
  readonly output_structure: string;
  readonly validation_checklist: ReadonlyArray<string>;
  readonly version: number;
  readonly status: 'AKTIF' | 'ARSIP';
}

export interface TeacherDocument {
  readonly id: string;
  readonly teacher_assignment_id: AssignmentId;
  readonly template_id: TemplateId;
  readonly judul: string;
  readonly konten: string;
  readonly status: DocumentStatus;
  readonly generated_prompt: string;
  readonly generated_at: string | null;
  readonly pasted_at: string | null;
  readonly published_at: string | null;
  readonly checklist_state: Readonly<Record<string, boolean>>;
}

// --- Sistem ---
export interface AppNotification {
  readonly id: string;
  readonly user_id: UserId;
  readonly tipe: 'INFO' | 'PERINGATAN' | 'AKADEMIK' | 'PEMBINAAN';
  readonly judul: string;
  readonly pesan: string;
  readonly entitas: string;
  readonly entitas_id: string;
  readonly dibaca_at: string | null;
  readonly created_at: string;
}

export interface AuditLog {
  readonly id: string;
  readonly user_id: UserId;
  readonly aksi: string;
  readonly entitas: string;
  readonly entitas_id: string;
  readonly detail: string;
  readonly created_at: string;
}

export interface ImportBatch {
  readonly id: string;
  readonly tipe: ImportBatchType;
  readonly filename: string;
  readonly status: 'SELESAI' | 'SEBAGIAN_ERROR' | 'GAGAL';
  readonly total_baris: number;
  readonly baris_sukses: number;
  readonly baris_error: number;
  readonly error_logs: ReadonlyArray<{ readonly row: number; readonly reason: string }>;
  readonly created_by: UserId;
  readonly created_at: string;
}

export interface CoachingNote {
  readonly id: string;
  readonly author_user_id: UserId;
  readonly target_type: 'SISWA' | 'GURU';
  readonly target_id: string;
  readonly judul: string;
  readonly catatan: string;
  readonly created_at: string;
}

export interface LmsDatabaseState {
  readonly school: School;
  readonly academic_years: ReadonlyArray<AcademicYear>;
  readonly majors: ReadonlyArray<Major>;
  readonly rombels: ReadonlyArray<Rombel>;
  readonly users: ReadonlyArray<User>;
  readonly teachers: ReadonlyArray<Teacher>;
  readonly students: ReadonlyArray<Student>;
  readonly bk_counselors: ReadonlyArray<BkCounselor>;
  readonly bk_class_assignments: ReadonlyArray<BkClassAssignment>;
  readonly subjects: ReadonlyArray<Subject>;
  readonly teacher_assignments: ReadonlyArray<TeacherAssignment>;
  readonly sessions: ReadonlyArray<TeachingSession>;
  readonly attendance_records: ReadonlyArray<AttendanceRecord>;
  readonly modules: ReadonlyArray<LearningModule>;
  readonly assignments: ReadonlyArray<AssignmentTask>;
  readonly submissions: ReadonlyArray<TaskSubmission>;
  readonly notebooks: ReadonlyArray<Notebook>;
  readonly notebook_entries: ReadonlyArray<NotebookEntry>;
  readonly grade_components: ReadonlyArray<GradeComponent>;
  readonly grades: ReadonlyArray<GradeRecord>;
  readonly erapor_mappings: ReadonlyArray<EraporColumnMapping>;
  readonly question_banks: ReadonlyArray<QuestionBank>;
  readonly questions: ReadonlyArray<Question>;
  readonly exams: ReadonlyArray<Exam>;
  readonly exam_sessions: ReadonlyArray<ExamSession>;
  readonly exam_answers: ReadonlyArray<ExamAnswer>;
  readonly dudis: ReadonlyArray<Dudi>;
  readonly pks_documents: ReadonlyArray<PksDocument>;
  readonly pkl_placements: ReadonlyArray<PklPlacement>;
  readonly pkl_journals: ReadonlyArray<PklJournal>;
  readonly pkl_scores: ReadonlyArray<PklScore>;
  readonly mapel_pkl_contributions: ReadonlyArray<MapelPklContribution>;
  readonly prompt_templates: ReadonlyArray<PromptTemplate>;
  readonly teacher_documents: ReadonlyArray<TeacherDocument>;
  readonly notifications: ReadonlyArray<AppNotification>;
  readonly audit_logs: ReadonlyArray<AuditLog>;
  readonly import_batches: ReadonlyArray<ImportBatch>;
  readonly coaching_notes: ReadonlyArray<CoachingNote>;
  readonly walikelas_notes: Readonly<Record<string, string>>; // key: studentId
  readonly backup_history: ReadonlyArray<{
    readonly id: string;
    readonly filename: string;
    readonly size_bytes: number;
    readonly status: 'OK' | 'EMPTY_ALERT';
    readonly created_at: string;
  }>;
}
