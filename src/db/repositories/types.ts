import { DomainError } from '../../domain/result';
import { AuthContext } from '../../domain/rbac';
import {
  AppNotification,
  AssignmentTask,
  AttendanceRecord,
  AttendanceStatus,
  CoachingNote,
  EraporColumnMapping,
  Exam,
  ExamAnswer,
  ExamSession,
  ExamType,
  GradeRecord,
  ImportBatch,
  LearningModule,
  LmsDatabaseState,
  NotebookEntry,
  NotebookMetadataSummary,
  PklJournal,
  PklScore,
  PklScoreComponent,
  SessionType,
  TaskSubmission,
  TeacherDocument,
  TeachingSession,
  User,
  UserRole,
} from '../../domain/types';

export type RepoResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: DomainError };

export interface BootstrapPayload {
  school: LmsDatabaseState['school'];
  academic_year: LmsDatabaseState['academic_years'][number];
  app_mode: 'LMS' | 'CBT';
  engine: 'mysql' | 'local-json-fallback';
  allow_demo_reset: boolean;
  total_accounts: number;
  demo_users: Array<Pick<User, 'id' | 'nama' | 'email' | 'roles'>>;
}

export interface WorkspaceStatePayload {
  auth: AuthContext;
  state: LmsDatabaseState & {
    notebook_metadata: NotebookMetadataSummary[];
  };
}

export interface HealthCounts {
  majors: number;
  rombels: number;
  students: number;
  teachers: number;
  bk_counselors: number;
  pkl_placements: number;
}

export interface LmsRepository {
  readonly engineName: 'mysql' | 'local-json-fallback';

  getBootstrapData(appMode: 'LMS' | 'CBT'): Promise<BootstrapPayload>;
  authenticateUser(identifier: string, password: string): Promise<RepoResult<User>>;
  resolveAuthContext(userId?: string, requestedRole?: UserRole): Promise<AuthContext | null>;
  getHealthCounts(): Promise<HealthCounts>;

  getWorkspaceState(ctx: AuthContext): Promise<WorkspaceStatePayload>;

  getNotebookEntries(
    ctx: AuthContext,
    notebookId: string,
  ): Promise<RepoResult<NotebookEntry[]>>;
  createNotebookEntry(
    ctx: AuthContext,
    subjectId: string,
    input: { judul: string; konten: string; gambar_url?: string | null },
  ): Promise<RepoResult<NotebookEntry>>;
  commentNotebookEntry(
    ctx: AuthContext,
    entryId: string,
    komentar: string,
  ): Promise<RepoResult<NotebookEntry>>;

  createSession(
    ctx: AuthContext,
    input: {
      teacher_assignment_id: string;
      topik: string;
      tanggal?: string;
      jam_mulai: string;
      jam_selesai: string;
      tipe_sesi?: SessionType;
      module_id?: string | null;
      minimum_read_pct?: number;
    },
  ): Promise<RepoResult<TeachingSession>>;
  updateSessionStatus(
    ctx: AuthContext,
    sessionId: string,
    status: 'OPEN' | 'CLOSED' | 'DRAFT',
  ): Promise<RepoResult<void>>;
  recordSessionAccess(
    ctx: AuthContext,
    sessionId: string,
    input: {
      readPct: number;
      submittedTask?: boolean;
      submittedReflection?: boolean;
      simulatedTimeHHmm?: string;
    },
  ): Promise<RepoResult<AttendanceRecord>>;
  overrideSessionAttendance(
    ctx: AuthContext,
    sessionId: string,
    input: { student_id: string; status: AttendanceStatus; alasan: string },
  ): Promise<RepoResult<AttendanceRecord>>;

  createModule(
    ctx: AuthContext,
    input: {
      teacher_assignment_id: string;
      judul: string;
      konten: string;
      status?: 'DRAFT' | 'PUBLISHED';
    },
  ): Promise<RepoResult<LearningModule>>;
  cloneModule(
    ctx: AuthContext,
    sourceModuleId: string,
    targetAssignmentId: string,
  ): Promise<RepoResult<LearningModule>>;

  createTask(
    ctx: AuthContext,
    input: {
      teacher_assignment_id: string;
      judul: string;
      deskripsi: string;
      deadline?: string;
      tipe?: 'PR' | 'TUGAS' | 'PROYEK' | 'PRAKTIK';
      rubrik?: string;
      session_id?: string | null;
    },
  ): Promise<RepoResult<AssignmentTask>>;
  submitTask(
    ctx: AuthContext,
    taskId: string,
    input: { teks: string; file_url?: string | null },
  ): Promise<RepoResult<TaskSubmission>>;
  gradeSubmission(
    ctx: AuthContext,
    submissionId: string,
    input: { nilai: number; catatan_guru?: string },
  ): Promise<RepoResult<TaskSubmission>>;

  upsertGrade(
    ctx: AuthContext,
    input: {
      student_id: string;
      teacher_assignment_id: string;
      component_id: string;
      nilai: number;
      catatan?: string;
    },
  ): Promise<RepoResult<GradeRecord>>;
  exportErapor(
    ctx: AuthContext,
    input: { teacher_assignment_id: string; mapping_id?: string },
  ): Promise<
    RepoResult<{
      readonly headers: ReadonlyArray<string>;
      readonly rows: ReadonlyArray<Record<string, string | number>>;
      readonly csvContent: string;
    }>
  >;

  createExam(
    ctx: AuthContext,
    input: {
      teacher_assignment_id: string;
      tipe?: ExamType;
      judul: string;
      waktu_mulai: string;
      durasi_menit: number;
      target_student_ids?: string[];
      parent_exam_id?: string | null;
    },
  ): Promise<RepoResult<Exam>>;
  startExamSession(
    ctx: AuthContext,
    examId: string,
    token: string,
  ): Promise<RepoResult<ExamSession>>;
  saveExamAnswer(
    ctx: AuthContext,
    examSessionId: string,
    input: { question_id: string; jawaban: string },
  ): Promise<RepoResult<ExamAnswer>>;
  finishExamSession(
    ctx: AuthContext,
    examSessionId: string,
  ): Promise<
    RepoResult<{
      exam_session: ExamSession;
      summary: { totalEarned: number; totalPossible: number; percentage: number };
    }>
  >;

  generatePrompt(
    ctx: AuthContext,
    input: {
      teacher_assignment_id: string;
      template_id: string;
      teacher_inputs: Record<string, string>;
    },
  ): Promise<RepoResult<string>>;
  saveTeacherDocument(
    ctx: AuthContext,
    input: {
      id?: string | null;
      teacher_assignment_id: string;
      template_id: string;
      judul: string;
      konten: string;
      generated_prompt?: string;
      checklist_state?: Record<string, boolean>;
    },
  ): Promise<RepoResult<TeacherDocument>>;
  publishTeacherDocument(
    ctx: AuthContext,
    documentId: string,
    checklistState?: Record<string, boolean>,
  ): Promise<RepoResult<TeacherDocument>>;

  createPklJournal(
    ctx: AuthContext,
    input: { placement_id: string; tanggal?: string; aktivitas: string },
  ): Promise<RepoResult<PklJournal>>;
  validatePklJournal(
    ctx: AuthContext,
    journalId: string,
    input: { validasi_bk?: boolean; catatan_bk?: string },
  ): Promise<RepoResult<PklJournal>>;
  upsertPklScore(
    ctx: AuthContext,
    input: { placement_id: string; komponen: PklScoreComponent; nilai: number },
  ): Promise<RepoResult<PklScore>>;

  sendNotification(
    ctx: AuthContext,
    input: {
      user_id: string;
      tipe?: 'INFO' | 'PERINGATAN' | 'AKADEMIK' | 'PEMBINAAN';
      judul: string;
      pesan: string;
      entitas_id?: string;
    },
  ): Promise<RepoResult<AppNotification>>;
  createCoachingNote(
    ctx: AuthContext,
    input: { target_type: 'SISWA' | 'GURU'; target_id: string; judul: string; catatan: string },
  ): Promise<RepoResult<CoachingNote>>;
  upsertWalikelasNote(
    ctx: AuthContext,
    input: { student_id: string; catatan: string },
  ): Promise<RepoResult<void>>;

  previewImport(
    ctx: AuthContext,
    input: { tipe: 'SISWA' | 'GURU'; csv_text: string },
  ): Promise<RepoResult<unknown>>;
  commitStudentImport(
    ctx: AuthContext,
    input: { tipe: string; filename?: string; csv_text: string },
  ): Promise<RepoResult<{ batch: ImportBatch; preview: unknown }>>;

  updateEraporMapping(
    ctx: AuthContext,
    input: { template_name?: string; mapping: EraporColumnMapping['mapping'] },
  ): Promise<RepoResult<EraporColumnMapping>>;

  recordBackupRun(
    ctx: AuthContext,
    input: { simulate_zero_byte?: boolean },
  ): Promise<
    RepoResult<{
      id: string;
      filename: string;
      size_bytes: number;
      status: 'OK' | 'EMPTY_ALERT';
      created_at: string;
    }>
  >;

  resetDemoState(): Promise<void>;
}
