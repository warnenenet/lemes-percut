import fs from 'node:fs';
import path from 'node:path';
import { createInitialSeedState } from '../../data/seed';
import {
  applyTeacherAttendanceOverride,
  evaluateSessionAccess,
} from '../../domain/attendance';
import {
  gradeStudentExamAnswers,
  validateExamNoStudentOverlap,
  verifyExamToken,
} from '../../domain/cbt';
import { generateEraporExport } from '../../domain/grading';
import {
  previewStudentImportCsv,
  previewTeacherImportCsv,
} from '../../domain/importValidator';
import {
  applyTeacherDocumentContentEdit,
  assemblePromptForTeacher,
  canPublishTeacherDocument,
} from '../../domain/promptEngine';
import {
  AuthContext,
  canCloneBetweenAssignments,
  guardAdminOnly,
  guardBkRombelAccess,
  guardGradeMutation,
  guardNotebookContentRead,
  guardSusulanExamCreation,
  guardTeacherAssignmentOwnership,
  summarizeNotebookMetadata,
} from '../../domain/rbac';
import {
  AttendanceStatus,
  EraporColumnMapping,
  ExamType,
  LmsDatabaseState,
  NotebookMetadataSummary,
  PklScoreComponent,
  SessionType,
  User,
  UserRole,
} from '../../domain/types';
import {
  BootstrapPayload,
  HealthCounts,
  LmsRepository,
  RepoResult,
  WorkspaceStatePayload,
} from './types';

export const CURATED_DEMO_EMAILS = new Set([
  'admin@smkn1percut.sch.id',
  'kepsek@smkn1percut.sch.id',
  'wakasek@smkn1percut.sch.id',
  'budi.mtk@smkn1percut.sch.id',
  'siti.mtk@smkn1percut.sch.id',
  'darmawan.mtk@smkn1percut.sch.id',
  'hendra.bk@smkn1percut.sch.id',
  'rizky.siswa@smkn1percut.sch.id',
]);

export class JsonFallbackRepository implements LmsRepository {
  readonly engineName = 'local-json-fallback' as const;
  private readonly dbFile: string;
  private state: LmsDatabaseState;

  constructor(dbFilePath?: string) {
    this.dbFile =
      dbFilePath ?? path.resolve(process.cwd(), 'data', 'lms_state.json');
    this.state = this.loadInitialState();
  }

  private loadInitialState(): LmsDatabaseState {
    try {
      if (fs.existsSync(this.dbFile)) {
        const raw = fs.readFileSync(this.dbFile, 'utf-8');
        const parsed = JSON.parse(raw) as LmsDatabaseState;
        if (
          Array.isArray(parsed.students) &&
          parsed.students.length >= 180 &&
          Array.isArray(parsed.rombels) &&
          parsed.rombels.length >= 18
        ) {
          return parsed;
        }
      }
    } catch {
      // Fallback to clean seed state if file is unreadable
    }
    const initial = createInitialSeedState();
    this.persistState(initial);
    return initial;
  }

  private persistState(next: LmsDatabaseState): void {
    this.state = next;
    try {
      const dir = path.dirname(this.dbFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.dbFile, JSON.stringify(next, null, 2), 'utf-8');
    } catch {
      // Non-fatal in read-only sandboxes
    }
  }

  private appendAudit(
    state: LmsDatabaseState,
    userId: string,
    aksi: string,
    entitas: string,
    entitasId: string,
    detail: string,
  ): LmsDatabaseState {
    const entry = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      user_id: userId,
      aksi,
      entitas,
      entitas_id: entitasId,
      detail,
      created_at: new Date().toISOString(),
    };
    return {
      ...state,
      audit_logs: [entry, ...state.audit_logs].slice(0, 200),
    };
  }

  async getBootstrapData(appMode: 'LMS' | 'CBT'): Promise<BootstrapPayload> {
    return {
      school: this.state.school,
      academic_year:
        this.state.academic_years.find((a) => a.is_active) ??
        this.state.academic_years[0],
      app_mode: appMode,
      engine: this.engineName,
      allow_demo_reset: process.env.NODE_ENV !== 'production',
      total_accounts: this.state.users.length,
      demo_users: this.state.users
        .filter((u) => CURATED_DEMO_EMAILS.has(u.email.toLowerCase()))
        .map((u) => ({
          id: u.id,
          nama: u.nama,
          email: u.email,
          roles: u.roles,
        })),
    };
  }

  async authenticateUser(
    identifierRaw: string,
    password: string,
  ): Promise<RepoResult<User>> {
    const identifier = identifierRaw.trim().toLowerCase();
    if (!identifier || !password) {
      return {
        ok: false,
        error: {
          kind: 'VALIDATION_ERROR',
          httpStatus: 422,
          field: 'identifier',
          message: 'Email/NISN/NUPTK dan kata sandi wajib diisi.',
        },
      };
    }

    let user = this.state.users.find(
      (u) => u.email.toLowerCase() === identifier && u.status === 'AKTIF',
    );
    if (!user) {
      const stu = this.state.students.find(
        (s) => s.nisn === identifier || s.nis === identifier,
      );
      if (stu) {
        user = this.state.users.find(
          (u) => u.id === stu.user_id && u.status === 'AKTIF',
        );
      }
    }
    if (!user) {
      const tch = this.state.teachers.find(
        (t) => t.nuptk === identifier || t.nip === identifier,
      );
      if (tch) {
        user = this.state.users.find(
          (u) => u.id === tch.user_id && u.status === 'AKTIF',
        );
      }
    }

    if (!user || password !== 'smkn1percut') {
      return {
        ok: false as const,
        error: {
          kind: 'UNAUTHORIZED' as const,
          httpStatus: 401 as const,
          message: 'Kredensial tidak valid. (Kata sandi demo: smkn1percut)',
        },
      };
    }

    this.persistState(
      this.appendAudit(
        this.state,
        user.id,
        'LOGIN',
        'users',
        user.id,
        `Login berhasil sebagai ${user.roles.join(', ')}`,
      ),
    );
    return { ok: true, value: user };
  }

  async resolveAuthContext(
    userId?: string,
    requestedRole?: UserRole,
  ): Promise<AuthContext | null> {
    if (!userId) return null;
    const user = this.state.users.find(
      (u) => u.id === userId && u.status === 'AKTIF',
    );
    if (!user) return null;

    const activeRole =
      requestedRole && user.roles.includes(requestedRole)
        ? requestedRole
        : user.roles[0];

    return {
      user,
      activeRole,
      teacher: this.state.teachers.find((t) => t.user_id === user.id),
      student: this.state.students.find((s) => s.user_id === user.id),
      bkCounselor: this.state.bk_counselors.find((b) => b.user_id === user.id),
    };
  }

  async getHealthCounts(): Promise<HealthCounts> {
    return {
      majors: this.state.majors.length,
      rombels: this.state.rombels.length,
      students: this.state.students.length,
      teachers: this.state.teachers.length,
      bk_counselors: this.state.bk_counselors.length,
      pkl_placements: this.state.pkl_placements.length,
    };
  }

  async getWorkspaceState(ctx: AuthContext): Promise<WorkspaceStatePayload> {
    const visibleEntries = this.state.notebook_entries.filter((entry) => {
      const nb = this.state.notebooks.find((n) => n.id === entry.notebook_id);
      if (!nb) return false;
      const ta = this.state.teacher_assignments.find(
        (a) => a.id === nb.teacher_assignment_id,
      );
      return guardNotebookContentRead(ctx, nb, ta).ok;
    });

    const notebookMetadata: NotebookMetadataSummary[] = this.state.notebooks.map(
      (nb) => summarizeNotebookMetadata(nb, this.state.notebook_entries),
    );

    return {
      auth: ctx,
      state: {
        ...this.state,
        notebook_entries: visibleEntries,
        notebook_metadata: notebookMetadata,
      },
    };
  }

  async getNotebookEntries(ctx: AuthContext, notebookId: string) {
    const nb = this.state.notebooks.find((n) => n.id === notebookId);
    if (!nb) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'notebooks',
          id: notebookId,
          message: 'Buku tulis tidak ditemukan.',
        },
      };
    }
    const ta = this.state.teacher_assignments.find(
      (a) => a.id === nb.teacher_assignment_id,
    );
    const guard = guardNotebookContentRead(ctx, nb, ta);
    if (!guard.ok) return guard;
    return {
      ok: true as const,
      value: this.state.notebook_entries.filter((e) => e.notebook_id === nb.id),
    };
  }

  async createNotebookEntry(
    ctx: AuthContext,
    subjectId: string,
    input: { judul: string; konten: string; gambar_url?: string | null },
  ) {
    if (ctx.activeRole !== 'SISWA' || !ctx.student) {
      return {
        ok: false as const,
        error: {
          kind: 'FORBIDDEN' as const,
          httpStatus: 403 as const,
          message: 'Hanya siswa pemilik yang dapat menulis buku tulis.',
        },
      };
    }
    if (!input.judul?.trim() || !input.konten?.trim()) {
      return {
        ok: false as const,
        error: {
          kind: 'VALIDATION_ERROR' as const,
          httpStatus: 422 as const,
          field: 'judul',
          message: 'Judul dan isi catatan wajib diisi.',
        },
      };
    }

    let nb = this.state.notebooks.find(
      (n) => n.student_id === ctx.student!.id && n.subject_id === subjectId,
    );
    const nextNotebooks = [...this.state.notebooks];
    if (!nb) {
      const ta = this.state.teacher_assignments.find(
        (a) =>
          a.rombel_id === ctx.student!.rombel_id && a.subject_id === subjectId,
      );
      if (!ta) {
        return {
          ok: false as const,
          error: {
            kind: 'NOT_FOUND' as const,
            httpStatus: 404 as const,
            entity: 'teacher_assignments',
            id: subjectId,
            message: 'Mapel tidak ditemukan untuk kelas Anda.',
          },
        };
      }
      nb = {
        id: `nb-${ctx.student.id}-${subjectId}`,
        student_id: ctx.student.id,
        subject_id: subjectId,
        teacher_assignment_id: ta.id,
      };
      nextNotebooks.push(nb);
    }

    const now = new Date().toISOString();
    const entry = {
      id: `nbe-${Date.now()}`,
      notebook_id: nb.id,
      judul: input.judul.trim(),
      konten: input.konten.trim(),
      gambar_url: input.gambar_url ? String(input.gambar_url) : null,
      komentar_guru: null,
      created_at: now,
      updated_at: now,
    };

    this.persistState(
      this.appendAudit(
        {
          ...this.state,
          notebooks: nextNotebooks,
          notebook_entries: [entry, ...this.state.notebook_entries],
        },
        ctx.user.id,
        'NOTEBOOK_ENTRY_CREATE',
        'notebook_entries',
        entry.id,
        `Siswa menulis catatan buku tulis "${entry.judul}"`,
      ),
    );
    return { ok: true as const, value: entry };
  }

  async commentNotebookEntry(
    ctx: AuthContext,
    entryId: string,
    komentar: string,
  ) {
    const entry = this.state.notebook_entries.find((e) => e.id === entryId);
    if (!entry) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'notebook_entries',
          id: entryId,
          message: 'Entri buku tulis tidak ditemukan.',
        },
      };
    }
    const nb = this.state.notebooks.find((n) => n.id === entry.notebook_id);
    const ta = nb
      ? this.state.teacher_assignments.find(
          (a) => a.id === nb.teacher_assignment_id,
        )
      : undefined;
    const guard = guardTeacherAssignmentOwnership(
      ctx,
      ta,
      'komentar buku tulis',
    );
    if (!guard.ok) return guard;

    const updated = {
      ...entry,
      komentar_guru: komentar.trim(),
      updated_at: new Date().toISOString(),
    };
    this.persistState({
      ...this.state,
      notebook_entries: this.state.notebook_entries.map((e) =>
        e.id === entry.id ? updated : e,
      ),
    });
    return { ok: true as const, value: updated };
  }

  async createSession(
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
  ) {
    const ta = this.state.teacher_assignments.find(
      (a) => a.id === input.teacher_assignment_id,
    );
    const guard = guardTeacherAssignmentOwnership(ctx, ta, 'sesi pembelajaran');
    if (!guard.ok) return guard;

    if (!input.topik?.trim() || !input.jam_mulai || !input.jam_selesai) {
      return {
        ok: false as const,
        error: {
          kind: 'VALIDATION_ERROR' as const,
          httpStatus: 422 as const,
          field: 'topik',
          message: 'Topik, jam mulai, dan jam selesai wajib diisi.',
        },
      };
    }

    const existingCount = this.state.sessions.filter(
      (s) => s.teacher_assignment_id === ta!.id,
    ).length;

    const newSession = {
      id: `ses-${Date.now()}`,
      teacher_assignment_id: ta!.id,
      pertemuan_ke: existingCount + 1,
      tanggal: input.tanggal || new Date().toISOString().slice(0, 10),
      jam_mulai: input.jam_mulai,
      jam_selesai: input.jam_selesai,
      tipe_sesi: input.tipe_sesi || ('TEORI' as const),
      topik: input.topik.trim(),
      module_id: input.module_id || null,
      status: 'OPEN' as const,
      minimum_read_pct: Number(input.minimum_read_pct ?? 60),
    };

    this.persistState(
      this.appendAudit(
        { ...this.state, sessions: [newSession, ...this.state.sessions] },
        ctx.user.id,
        'CREATE_SESSION',
        'sessions',
        newSession.id,
        `Membuka sesi pertemuan ${newSession.pertemuan_ke}: ${newSession.topik}`,
      ),
    );
    return { ok: true as const, value: newSession };
  }

  async updateSessionStatus(
    ctx: AuthContext,
    sessionId: string,
    status: 'OPEN' | 'CLOSED' | 'DRAFT',
  ) {
    const session = this.state.sessions.find((s) => s.id === sessionId);
    if (!session) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'sessions',
          id: sessionId,
          message: 'Sesi tidak ditemukan.',
        },
      };
    }
    const ta = this.state.teacher_assignments.find(
      (a) => a.id === session.teacher_assignment_id,
    );
    const guard = guardTeacherAssignmentOwnership(ctx, ta, 'status sesi');
    if (!guard.ok) return guard;

    this.persistState(
      this.appendAudit(
        {
          ...this.state,
          sessions: this.state.sessions.map((s) =>
            s.id === session.id ? { ...s, status } : s,
          ),
        },
        ctx.user.id,
        `SESSION_${status}`,
        'sessions',
        session.id,
        `Mengubah status sesi "${session.topik}" menjadi ${status}`,
      ),
    );
    return { ok: true as const, value: undefined };
  }

  async recordSessionAccess(
    ctx: AuthContext,
    sessionId: string,
    input: {
      readPct: number;
      submittedTask?: boolean;
      submittedReflection?: boolean;
      simulatedTimeHHmm?: string;
    },
  ) {
    if (ctx.activeRole !== 'SISWA' || !ctx.student) {
      return {
        ok: false as const,
        error: {
          kind: 'FORBIDDEN' as const,
          httpStatus: 403 as const,
          message: 'Hanya siswa yang dapat mencatat kehadiran sesi.',
        },
      };
    }
    const session = this.state.sessions.find((s) => s.id === sessionId);
    if (!session) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'sessions',
          id: sessionId,
          message: 'Sesi tidak ditemukan.',
        },
      };
    }
    const ta = this.state.teacher_assignments.find(
      (a) => a.id === session.teacher_assignment_id,
    );
    if (!ta || ta.rombel_id !== ctx.student.rombel_id) {
      return {
        ok: false as const,
        error: {
          kind: 'FORBIDDEN' as const,
          httpStatus: 403 as const,
          message: 'Anda tidak terdaftar di rombel sesi ini.',
        },
      };
    }

    const existing = this.state.attendance_records.find(
      (r) => r.session_id === session.id && r.student_id === ctx.student!.id,
    );
    const now = new Date();
    const hhmm =
      input.simulatedTimeHHmm ||
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const result = evaluateSessionAccess({
      existingRecord: existing,
      session,
      studentId: ctx.student.id,
      accessTimeHHmm: hhmm,
      timestampIso: now.toISOString(),
      activity: {
        readPct: Number(input.readPct ?? 0),
        submittedTask: Boolean(input.submittedTask),
        submittedReflection: Boolean(input.submittedReflection),
      },
    });
    if (!result.ok) return result;

    const updatedRecords = existing
      ? this.state.attendance_records.map((r) =>
          r.id === existing.id ? result.value : r,
        )
      : [...this.state.attendance_records, result.value];

    this.persistState(
      this.appendAudit(
        { ...this.state, attendance_records: updatedRecords },
        ctx.user.id,
        `SESSION_ACCESS_${result.value.status}`,
        'attendance_records',
        result.value.id,
        `Akses sesi "${session.topik}" pada ${hhmm} -> ${result.value.status} (baca: ${result.value.read_pct}%)`,
      ),
    );
    return { ok: true as const, value: result.value };
  }

  async overrideSessionAttendance(
    ctx: AuthContext,
    sessionId: string,
    input: { student_id: string; status: AttendanceStatus; alasan: string },
  ) {
    const session = this.state.sessions.find((s) => s.id === sessionId);
    if (!session) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'sessions',
          id: sessionId,
          message: 'Sesi tidak ditemukan.',
        },
      };
    }
    const ta = this.state.teacher_assignments.find(
      (a) => a.id === session.teacher_assignment_id,
    );
    const guard = guardTeacherAssignmentOwnership(ctx, ta, 'override absensi');
    if (!guard.ok) return guard;

    const existing = this.state.attendance_records.find(
      (r) => r.session_id === session.id && r.student_id === input.student_id,
    );
    const overrideRes = applyTeacherAttendanceOverride({
      existingRecord: existing,
      sessionId: session.id,
      studentId: input.student_id,
      newStatus: input.status,
      teacherUserId: ctx.user.id,
      reason: String(input.alasan ?? ''),
      timestampIso: new Date().toISOString(),
    });
    if (!overrideRes.ok) return overrideRes;

    const updatedRecords = existing
      ? this.state.attendance_records.map((r) =>
          r.id === existing.id ? overrideRes.value : r,
        )
      : [...this.state.attendance_records, overrideRes.value];

    this.persistState(
      this.appendAudit(
        { ...this.state, attendance_records: updatedRecords },
        ctx.user.id,
        'OVERRIDE_ATTENDANCE',
        'attendance_records',
        overrideRes.value.id,
        `Override absensi siswa ${input.student_id} menjadi ${input.status}. Alasan: ${overrideRes.value.alasan_override}`,
      ),
    );
    return { ok: true as const, value: overrideRes.value };
  }

  async createModule(
    ctx: AuthContext,
    input: {
      teacher_assignment_id: string;
      judul: string;
      konten: string;
      status?: 'DRAFT' | 'PUBLISHED';
    },
  ) {
    const ta = this.state.teacher_assignments.find(
      (a) => a.id === input.teacher_assignment_id,
    );
    const guard = guardTeacherAssignmentOwnership(ctx, ta, 'modul belajar');
    if (!guard.ok) return guard;

    const mod = {
      id: `mod-${Date.now()}`,
      teacher_assignment_id: ta!.id,
      judul: String(input.judul ?? '').trim(),
      konten: String(input.konten ?? '').trim(),
      status: input.status || ('PUBLISHED' as const),
      cloned_from: null,
      updated_at: new Date().toISOString(),
    };
    this.persistState(
      this.appendAudit(
        { ...this.state, modules: [mod, ...this.state.modules] },
        ctx.user.id,
        'CREATE_MODULE',
        'modules',
        mod.id,
        `Membuat modul "${mod.judul}"`,
      ),
    );
    return { ok: true as const, value: mod };
  }

  async cloneModule(
    ctx: AuthContext,
    sourceModuleId: string,
    targetAssignmentId: string,
  ) {
    if (!ctx.teacher) {
      return {
        ok: false as const,
        error: {
          kind: 'FORBIDDEN' as const,
          httpStatus: 403 as const,
          message: 'Hanya guru yang dapat melakukan clone modul.',
        },
      };
    }
    const sourceMod = this.state.modules.find((m) => m.id === sourceModuleId);
    if (!sourceMod) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'modules',
          id: sourceModuleId,
          message: 'Modul sumber tidak ditemukan.',
        },
      };
    }
    const sourceTa = this.state.teacher_assignments.find(
      (a) => a.id === sourceMod.teacher_assignment_id,
    );
    const targetTa = this.state.teacher_assignments.find(
      (a) => a.id === targetAssignmentId,
    );
    const cloneCheck = canCloneBetweenAssignments(
      ctx.teacher.id,
      sourceTa,
      targetTa,
    );
    if (!cloneCheck.ok) return cloneCheck;

    const cloned = {
      ...sourceMod,
      id: `mod-${Date.now()}`,
      teacher_assignment_id: targetTa!.id,
      cloned_from: sourceMod.id,
      updated_at: new Date().toISOString(),
    };
    this.persistState(
      this.appendAudit(
        { ...this.state, modules: [cloned, ...this.state.modules] },
        ctx.user.id,
        'CLONE_MODULE',
        'modules',
        cloned.id,
        `Clone modul "${cloned.judul}" ke assignment ${targetTa!.id}`,
      ),
    );
    return { ok: true as const, value: cloned };
  }

  async createTask(
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
  ) {
    const ta = this.state.teacher_assignments.find(
      (a) => a.id === input.teacher_assignment_id,
    );
    const guard = guardTeacherAssignmentOwnership(ctx, ta, 'tugas');
    if (!guard.ok) return guard;

    const task = {
      id: `task-${Date.now()}`,
      session_id: input.session_id || null,
      teacher_assignment_id: ta!.id,
      judul: String(input.judul).trim(),
      deskripsi: String(input.deskripsi).trim(),
      deadline:
        input.deadline || new Date(Date.now() + 86400000 * 5).toISOString(),
      tipe: input.tipe || ('TUGAS' as const),
      rubrik: String(input.rubrik || ''),
      cloned_from: null,
    };
    this.persistState({
      ...this.state,
      assignments: [task, ...this.state.assignments],
    });
    return { ok: true as const, value: task };
  }

  async submitTask(
    ctx: AuthContext,
    taskId: string,
    input: { teks: string; file_url?: string | null },
  ) {
    if (ctx.activeRole !== 'SISWA' || !ctx.student) {
      return {
        ok: false as const,
        error: {
          kind: 'FORBIDDEN' as const,
          httpStatus: 403 as const,
          message: 'Hanya siswa yang dapat mengumpulkan tugas.',
        },
      };
    }
    const task = this.state.assignments.find((t) => t.id === taskId);
    if (!task) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'assignments',
          id: taskId,
          message: 'Tugas tidak ditemukan.',
        },
      };
    }
    const teks = String(input.teks ?? '').trim();
    if (!teks && !input.file_url) {
      return {
        ok: false as const,
        error: {
          kind: 'VALIDATION_ERROR' as const,
          httpStatus: 422 as const,
          field: 'teks',
          message: 'Jawaban teks atau lampiran berkas wajib diisi.',
        },
      };
    }

    const existing = this.state.submissions.find(
      (s) => s.assignment_id === task.id && s.student_id === ctx.student!.id,
    );
    const submission = {
      id: existing?.id ?? `subm-${Date.now()}`,
      assignment_id: task.id,
      student_id: ctx.student.id,
      file_url: input.file_url
        ? String(input.file_url)
        : existing?.file_url ?? null,
      teks: teks || existing?.teks || 'Lampiran berkas terunggah.',
      submitted_at: new Date().toISOString(),
      nilai: existing?.nilai ?? null,
      dinilai_oleh: existing?.dinilai_oleh ?? null,
      catatan_guru: existing?.catatan_guru ?? null,
    };

    const nextSubmissions = existing
      ? this.state.submissions.map((s) =>
          s.id === existing.id ? submission : s,
        )
      : [submission, ...this.state.submissions];

    this.persistState({ ...this.state, submissions: nextSubmissions });
    return { ok: true as const, value: submission };
  }

  async gradeSubmission(
    ctx: AuthContext,
    submissionId: string,
    input: { nilai: number; catatan_guru?: string },
  ) {
    const sub = this.state.submissions.find((s) => s.id === submissionId);
    if (!sub) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'submissions',
          id: submissionId,
          message: 'Submission tidak ditemukan.',
        },
      };
    }
    const task = this.state.assignments.find((t) => t.id === sub.assignment_id);
    const ta = task
      ? this.state.teacher_assignments.find(
          (a) => a.id === task.teacher_assignment_id,
        )
      : undefined;
    const guard = guardGradeMutation(ctx, ta);
    if (!guard.ok) return guard;

    const nilai = Number(input.nilai);
    if (Number.isNaN(nilai) || nilai < 0 || nilai > 100) {
      return {
        ok: false as const,
        error: {
          kind: 'VALIDATION_ERROR' as const,
          httpStatus: 422 as const,
          field: 'nilai',
          message: 'Nilai harus berada pada rentang 0–100.',
        },
      };
    }

    const updated = {
      ...sub,
      nilai,
      dinilai_oleh: ctx.teacher!.id,
      catatan_guru: String(input.catatan_guru ?? ''),
    };
    this.persistState({
      ...this.state,
      submissions: this.state.submissions.map((s) =>
        s.id === sub.id ? updated : s,
      ),
    });
    return { ok: true as const, value: updated };
  }

  async upsertGrade(
    ctx: AuthContext,
    input: {
      student_id: string;
      teacher_assignment_id: string;
      component_id: string;
      nilai: number;
      catatan?: string;
    },
  ) {
    const ta = this.state.teacher_assignments.find(
      (a) => a.id === input.teacher_assignment_id,
    );
    const guard = guardGradeMutation(ctx, ta);
    if (!guard.ok) return guard;

    const score = Number(input.nilai);
    if (Number.isNaN(score) || score < 0 || score > 100) {
      return {
        ok: false as const,
        error: {
          kind: 'VALIDATION_ERROR' as const,
          httpStatus: 422 as const,
          field: 'nilai',
          message: 'Nilai harus antara 0 dan 100.',
        },
      };
    }

    const existing = this.state.grades.find(
      (g) =>
        g.student_id === input.student_id &&
        g.teacher_assignment_id === input.teacher_assignment_id &&
        g.component_id === input.component_id,
    );
    const record = {
      id: existing?.id ?? `grd-${Date.now()}`,
      student_id: input.student_id,
      teacher_assignment_id: input.teacher_assignment_id,
      component_id: input.component_id,
      nilai: score,
      catatan: String(input.catatan ?? ''),
    };
    const nextGrades = existing
      ? this.state.grades.map((g) => (g.id === existing.id ? record : g))
      : [...this.state.grades, record];

    this.persistState(
      this.appendAudit(
        { ...this.state, grades: nextGrades },
        ctx.user.id,
        'UPSERT_GRADE',
        'grades',
        record.id,
        `Input nilai ${score} untuk siswa ${input.student_id}`,
      ),
    );
    return { ok: true as const, value: record };
  }

  async exportErapor(
    ctx: AuthContext,
    input: { teacher_assignment_id: string; mapping_id?: string },
  ) {
    const ta = this.state.teacher_assignments.find(
      (a) => a.id === input.teacher_assignment_id,
    );
    const guard = guardTeacherAssignmentOwnership(ctx, ta, 'export e-Rapor');
    if (!guard.ok) return guard;

    const rombel = this.state.rombels.find((r) => r.id === ta!.rombel_id);
    if (!rombel) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'rombels',
          id: ta!.rombel_id,
          message: 'Rombel tidak ditemukan.',
        },
      };
    }

    const mapping =
      this.state.erapor_mappings.find((m) => m.id === input.mapping_id) ??
      this.state.erapor_mappings[0];
    const comps = this.state.grade_components.filter(
      (c) => c.teacher_assignment_id === ta!.id,
    );
    const grades = this.state.grades.filter(
      (g) => g.teacher_assignment_id === ta!.id,
    );

    const exportRes = generateEraporExport({
      mapping,
      rombel,
      students: this.state.students,
      users: this.state.users,
      components: comps,
      grades,
    });
    if (!exportRes.ok) return exportRes;

    this.persistState(
      this.appendAudit(
        this.state,
        ctx.user.id,
        'EXPORT_ERAPOR',
        'erapor_mappings',
        mapping.id,
        `Export e-Rapor kelas ${rombel.nama_rombel} (${exportRes.value.rows.length} siswa)`,
      ),
    );
    return { ok: true as const, value: exportRes.value };
  }

  async createExam(
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
  ) {
    const ta = this.state.teacher_assignments.find(
      (a) => a.id === input.teacher_assignment_id,
    );
    if (input.tipe === 'SUSULAN') {
      const susulanGuard = guardSusulanExamCreation(ctx, ta);
      if (!susulanGuard.ok) return susulanGuard;
    } else {
      const guard = guardTeacherAssignmentOwnership(ctx, ta, 'jadwal CBT');
      if (!guard.ok) return guard;
    }

    const candidateId = `ex-${Date.now()}`;
    const overlapCheck = validateExamNoStudentOverlap({
      candidate: {
        id: candidateId,
        teacher_assignment_id: ta!.id,
        waktu_mulai: input.waktu_mulai,
        durasi_menit: Number(input.durasi_menit),
        target_student_ids: input.target_student_ids,
      },
      existingExams: this.state.exams,
      assignments: this.state.teacher_assignments,
      students: this.state.students,
      rombels: this.state.rombels,
      users: this.state.users,
    });
    if (!overlapCheck.ok) return overlapCheck;

    const token = Math.random().toString(36).slice(2, 8).toUpperCase();
    const exam = {
      id: candidateId,
      teacher_assignment_id: ta!.id,
      tipe: input.tipe || ('CUSTOM' as const),
      judul: String(input.judul).trim(),
      waktu_mulai: input.waktu_mulai,
      durasi_menit: Number(input.durasi_menit),
      token,
      status: 'AKTIF' as const,
      parent_exam_id: input.parent_exam_id || null,
      target_student_ids: input.target_student_ids,
    };

    this.persistState(
      this.appendAudit(
        { ...this.state, exams: [exam, ...this.state.exams] },
        ctx.user.id,
        'CREATE_CBT_EXAM',
        'exams',
        exam.id,
        `Membuat jadwal CBT "${exam.judul}" (${exam.tipe}) token ${exam.token}`,
      ),
    );
    return { ok: true as const, value: exam };
  }

  async startExamSession(ctx: AuthContext, examId: string, token: string) {
    if (ctx.activeRole !== 'SISWA' || !ctx.student) {
      return {
        ok: false as const,
        error: {
          kind: 'FORBIDDEN' as const,
          httpStatus: 403 as const,
          message: 'Hanya siswa yang dapat memulai sesi CBT.',
        },
      };
    }
    const exam = this.state.exams.find((e) => e.id === examId);
    if (!exam) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'exams',
          id: examId,
          message: 'Ujian tidak ditemukan.',
        },
      };
    }
    const tokenCheck = verifyExamToken(exam, token);
    if (!tokenCheck.ok) return tokenCheck;

    let session = this.state.exam_sessions.find(
      (s) => s.exam_id === exam.id && s.student_id === ctx.student!.id,
    );
    if (!session) {
      session = {
        id: `exs-${Date.now()}`,
        exam_id: exam.id,
        student_id: ctx.student.id,
        status: 'MENGERJAKAN',
        started_at: new Date().toISOString(),
        finished_at: null,
        tab_switch_count: 0,
      };
      this.persistState({
        ...this.state,
        exam_sessions: [...this.state.exam_sessions, session],
      });
    }
    return { ok: true as const, value: session };
  }

  async saveExamAnswer(
    ctx: AuthContext,
    examSessionId: string,
    input: { question_id: string; jawaban: string },
  ) {
    if (ctx.activeRole !== 'SISWA' || !ctx.student) {
      return {
        ok: false as const,
        error: {
          kind: 'FORBIDDEN' as const,
          httpStatus: 403 as const,
          message: 'Hanya siswa yang dapat menyimpan jawaban CBT.',
        },
      };
    }
    const session = this.state.exam_sessions.find(
      (s) => s.id === examSessionId && s.student_id === ctx.student!.id,
    );
    if (!session) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'exam_sessions',
          id: examSessionId,
          message: 'Sesi ujian tidak ditemukan.',
        },
      };
    }
    if (session.status === 'SELESAI') {
      return {
        ok: false as const,
        error: {
          kind: 'CONFLICT' as const,
          httpStatus: 409 as const,
          message: 'Ujian sudah diselesaikan.',
        },
      };
    }

    const existing = this.state.exam_answers.find(
      (a) =>
        a.exam_session_id === session.id &&
        a.question_id === input.question_id,
    );
    const ans = {
      id:
        existing?.id ??
        `exa-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      exam_session_id: session.id,
      question_id: input.question_id,
      jawaban: String(input.jawaban ?? ''),
      skor: null,
      disimpan_pada: new Date().toISOString(),
    };
    const nextAnswers = existing
      ? this.state.exam_answers.map((a) => (a.id === existing.id ? ans : a))
      : [...this.state.exam_answers, ans];

    this.persistState({ ...this.state, exam_answers: nextAnswers });
    return { ok: true as const, value: ans };
  }

  async finishExamSession(ctx: AuthContext, examSessionId: string) {
    if (ctx.activeRole !== 'SISWA' || !ctx.student) {
      return {
        ok: false as const,
        error: {
          kind: 'FORBIDDEN' as const,
          httpStatus: 403 as const,
          message: 'Hanya siswa yang dapat menyelesaikan ujian.',
        },
      };
    }
    const session = this.state.exam_sessions.find(
      (s) => s.id === examSessionId && s.student_id === ctx.student!.id,
    );
    if (!session) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'exam_sessions',
          id: examSessionId,
          message: 'Sesi ujian tidak ditemukan.',
        },
      };
    }

    const exam = this.state.exams.find((e) => e.id === session.exam_id);
    const ta = exam
      ? this.state.teacher_assignments.find(
          (a) => a.id === exam.teacher_assignment_id,
        )
      : undefined;
    const bank = ta
      ? this.state.question_banks.find((b) => b.subject_id === ta.subject_id)
      : undefined;
    const bankQuestions = bank
      ? this.state.questions.filter((q) => q.bank_id === bank.id)
      : this.state.questions;
    const myAnswers = this.state.exam_answers.filter(
      (a) => a.exam_session_id === session.id,
    );
    const summary = gradeStudentExamAnswers(bankQuestions, myAnswers);

    const updated = {
      ...session,
      status: 'SELESAI' as const,
      finished_at: new Date().toISOString(),
    };

    this.persistState(
      this.appendAudit(
        {
          ...this.state,
          exam_sessions: this.state.exam_sessions.map((s) =>
            s.id === session.id ? updated : s,
          ),
        },
        ctx.user.id,
        'FINISH_CBT',
        'exam_sessions',
        session.id,
        `Menyelesaikan CBT dengan skor objektif ${summary.percentage}%`,
      ),
    );
    return {
      ok: true as const,
      value: { exam_session: updated, summary },
    };
  }

  async generatePrompt(
    ctx: AuthContext,
    input: {
      teacher_assignment_id: string;
      template_id: string;
      teacher_inputs: Record<string, string>;
    },
  ) {
    const ta = this.state.teacher_assignments.find(
      (a) => a.id === input.teacher_assignment_id,
    );
    const guard = guardTeacherAssignmentOwnership(ctx, ta, 'perangkat ajar');
    if (!guard.ok) return guard;

    const template = this.state.prompt_templates.find(
      (t) => t.id === input.template_id,
    );
    if (!template) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'prompt_templates',
          id: input.template_id,
          message: 'Template prompt tidak ditemukan.',
        },
      };
    }

    const rombel = this.state.rombels.find((r) => r.id === ta!.rombel_id)!;
    const major = this.state.majors.find((m) => m.id === rombel.major_id)!;
    const subject = this.state.subjects.find((s) => s.id === ta!.subject_id)!;
    const academicYear = this.state.academic_years.find(
      (y) => y.id === ta!.academic_year_id,
    )!;
    const studentCount = this.state.students.filter(
      (s) => s.rombel_id === rombel.id,
    ).length;

    return assemblePromptForTeacher({
      template,
      context: {
        school: this.state.school,
        academicYear,
        teacherUser: ctx.user,
        teacherNip: ctx.teacher?.nip ?? '-',
        subject,
        rombel,
        major,
        assignment: ta!,
        studentCount,
      },
      teacherInputs: input.teacher_inputs ?? {},
    });
  }

  async saveTeacherDocument(
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
  ) {
    const ta = this.state.teacher_assignments.find(
      (a) => a.id === input.teacher_assignment_id,
    );
    const guard = guardTeacherAssignmentOwnership(
      ctx,
      ta,
      'simpan perangkat ajar',
    );
    if (!guard.ok) return guard;

    const now = new Date().toISOString();
    const existing = input.id
      ? this.state.teacher_documents.find((d) => d.id === input.id)
      : undefined;

    const doc = existing
      ? {
          ...applyTeacherDocumentContentEdit(
            existing,
            String(input.judul),
            String(input.konten),
            now,
          ),
          checklist_state: input.checklist_state ?? existing.checklist_state,
        }
      : {
          id: `tdoc-${Date.now()}`,
          teacher_assignment_id: ta!.id,
          template_id: input.template_id,
          judul: String(input.judul).trim(),
          konten: String(input.konten).trim(),
          status: 'DRAFT' as const,
          generated_prompt: String(input.generated_prompt ?? ''),
          generated_at: now,
          pasted_at: now,
          published_at: null,
          checklist_state: input.checklist_state ?? {},
        };

    const nextDocs = existing
      ? this.state.teacher_documents.map((d) =>
          d.id === existing.id ? doc : d,
        )
      : [doc, ...this.state.teacher_documents];

    this.persistState({ ...this.state, teacher_documents: nextDocs });
    return { ok: true as const, value: doc };
  }

  async publishTeacherDocument(
    ctx: AuthContext,
    documentId: string,
    checklistState?: Record<string, boolean>,
  ) {
    const doc = this.state.teacher_documents.find((d) => d.id === documentId);
    if (!doc) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'teacher_documents',
          id: documentId,
          message: 'Dokumen perangkat ajar tidak ditemukan.',
        },
      };
    }
    const ta = this.state.teacher_assignments.find(
      (a) => a.id === doc.teacher_assignment_id,
    );
    const guard = guardTeacherAssignmentOwnership(
      ctx,
      ta,
      'publish perangkat ajar',
    );
    if (!guard.ok) return guard;

    const template = this.state.prompt_templates.find(
      (t) => t.id === doc.template_id,
    );
    if (!template) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'prompt_templates',
          id: doc.template_id,
          message: 'Template tidak ditemukan.',
        },
      };
    }

    const docWithChecks = {
      ...doc,
      checklist_state: checklistState ?? doc.checklist_state,
    };
    const check = canPublishTeacherDocument(docWithChecks, template);
    if (!check.ok) return check;

    const published = {
      ...docWithChecks,
      status: 'PUBLISHED' as const,
      published_at: new Date().toISOString(),
    };
    this.persistState(
      this.appendAudit(
        {
          ...this.state,
          teacher_documents: this.state.teacher_documents.map((d) =>
            d.id === doc.id ? published : d,
          ),
        },
        ctx.user.id,
        'PUBLISH_TEACHER_DOCUMENT',
        'teacher_documents',
        doc.id,
        `Mempublikasikan perangkat ajar "${doc.judul}"`,
      ),
    );
    return { ok: true as const, value: published };
  }

  async createPklJournal(
    ctx: AuthContext,
    input: { placement_id: string; tanggal?: string; aktivitas: string },
  ) {
    if (ctx.activeRole !== 'SISWA' || !ctx.student) {
      return {
        ok: false as const,
        error: {
          kind: 'FORBIDDEN' as const,
          httpStatus: 403 as const,
          message: 'Hanya siswa PKL yang dapat mencatat jurnal.',
        },
      };
    }
    const placement = this.state.pkl_placements.find(
      (p) => p.id === input.placement_id && p.student_id === ctx.student!.id,
    );
    if (!placement) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'pkl_placements',
          id: input.placement_id,
          message: 'Penempatan PKL tidak ditemukan.',
        },
      };
    }

    const journal = {
      id: `pklj-${Date.now()}`,
      placement_id: placement.id,
      tanggal: input.tanggal || new Date().toISOString().slice(0, 10),
      aktivitas: String(input.aktivitas ?? '').trim(),
      validasi_bk: false,
      catatan_bk: '',
    };
    this.persistState({
      ...this.state,
      pkl_journals: [journal, ...this.state.pkl_journals],
    });
    return { ok: true as const, value: journal };
  }

  async validatePklJournal(
    ctx: AuthContext,
    journalId: string,
    input: { validasi_bk?: boolean; catatan_bk?: string },
  ) {
    const journal = this.state.pkl_journals.find((j) => j.id === journalId);
    if (!journal) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'pkl_journals',
          id: journalId,
          message: 'Jurnal PKL tidak ditemukan.',
        },
      };
    }
    const placement = this.state.pkl_placements.find(
      (p) => p.id === journal.placement_id,
    );
    const stu = placement
      ? this.state.students.find((s) => s.id === placement.student_id)
      : undefined;
    if (!stu) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'students',
          id: placement?.student_id ?? '-',
          message: 'Siswa PKL tidak ditemukan.',
        },
      };
    }
    const bkGuard = guardBkRombelAccess(
      ctx,
      stu.rombel_id,
      this.state.bk_class_assignments,
    );
    if (!bkGuard.ok) return bkGuard;

    const updated = {
      ...journal,
      validasi_bk: Boolean(input.validasi_bk ?? true),
      catatan_bk: String(input.catatan_bk ?? 'Tervalidasi pembimbing BK.'),
    };
    this.persistState({
      ...this.state,
      pkl_journals: this.state.pkl_journals.map((j) =>
        j.id === journal.id ? updated : j,
      ),
    });
    return { ok: true as const, value: updated };
  }

  async upsertPklScore(
    ctx: AuthContext,
    input: { placement_id: string; komponen: PklScoreComponent; nilai: number },
  ) {
    const placement = this.state.pkl_placements.find(
      (p) => p.id === input.placement_id,
    );
    if (!placement) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'pkl_placements',
          id: input.placement_id,
          message: 'Penempatan PKL tidak ditemukan.',
        },
      };
    }
    const stu = this.state.students.find((s) => s.id === placement.student_id);
    if (!stu) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'students',
          id: placement.student_id,
          message: 'Siswa PKL tidak ditemukan.',
        },
      };
    }
    const bkGuard = guardBkRombelAccess(
      ctx,
      stu.rombel_id,
      this.state.bk_class_assignments,
    );
    if (!bkGuard.ok) return bkGuard;

    const existing = this.state.pkl_scores.find(
      (s) =>
        s.placement_id === placement.id && s.komponen === input.komponen,
    );
    const score = {
      id: existing?.id ?? `pkls-${Date.now()}`,
      placement_id: placement.id,
      komponen: input.komponen,
      nilai: Number(input.nilai),
      dinilai_oleh: ctx.user.id,
    };
    const nextScores = existing
      ? this.state.pkl_scores.map((s) => (s.id === existing.id ? score : s))
      : [...this.state.pkl_scores, score];

    this.persistState({ ...this.state, pkl_scores: nextScores });
    return { ok: true as const, value: score };
  }

  async sendNotification(
    ctx: AuthContext,
    input: {
      user_id: string;
      tipe?: 'INFO' | 'PERINGATAN' | 'AKADEMIK' | 'PEMBINAAN';
      judul: string;
      pesan: string;
      entitas_id?: string;
    },
  ) {
    if (
      ctx.activeRole !== 'WAKASEK' &&
      ctx.activeRole !== 'KEPALA_SEKOLAH' &&
      ctx.activeRole !== 'ADMIN' &&
      ctx.activeRole !== 'GURU_BK'
    ) {
      return {
        ok: false as const,
        error: {
          kind: 'FORBIDDEN' as const,
          httpStatus: 403 as const,
          message: 'Peran Anda tidak diizinkan mengirim notifikasi berjenjang.',
        },
      };
    }
    const notif = {
      id: `notif-${Date.now()}`,
      user_id: String(input.user_id),
      tipe: input.tipe || ('PERINGATAN' as const),
      judul: String(input.judul).trim(),
      pesan: String(input.pesan).trim(),
      entitas: 'teacher_documents',
      entitas_id: String(input.entitas_id ?? ''),
      dibaca_at: null,
      created_at: new Date().toISOString(),
    };
    this.persistState(
      this.appendAudit(
        { ...this.state, notifications: [notif, ...this.state.notifications] },
        ctx.user.id,
        'SEND_NOTIFICATION',
        'notifications',
        notif.id,
        `Mengirim notifikasi "${notif.judul}" ke ${notif.user_id}`,
      ),
    );
    return { ok: true as const, value: notif };
  }

  async createCoachingNote(
    ctx: AuthContext,
    input: {
      target_type: 'SISWA' | 'GURU';
      target_id: string;
      judul: string;
      catatan: string;
    },
  ) {
    const note = {
      id: `cn-${Date.now()}`,
      author_user_id: ctx.user.id,
      target_type: input.target_type || ('SISWA' as const),
      target_id: String(input.target_id),
      judul: String(input.judul).trim(),
      catatan: String(input.catatan).trim(),
      created_at: new Date().toISOString(),
    };
    this.persistState({
      ...this.state,
      coaching_notes: [note, ...this.state.coaching_notes],
    });
    return { ok: true as const, value: note };
  }

  async upsertWalikelasNote(
    ctx: AuthContext,
    input: { student_id: string; catatan: string },
  ) {
    if (ctx.activeRole !== 'WALI_KELAS') {
      return {
        ok: false as const,
        error: {
          kind: 'FORBIDDEN' as const,
          httpStatus: 403 as const,
          message: 'Hanya Wali Kelas yang dapat menulis catatan wali kelas.',
        },
      };
    }
    this.persistState({
      ...this.state,
      walikelas_notes: {
        ...this.state.walikelas_notes,
        [input.student_id]: String(input.catatan ?? ''),
      },
    });
    return { ok: true as const, value: undefined };
  }

  async previewImport(
    ctx: AuthContext,
    input: { tipe: 'SISWA' | 'GURU'; csv_text: string },
  ) {
    const adminCheck = guardAdminOnly(ctx, 'Preview Import');
    if (!adminCheck.ok) return adminCheck;

    if (input.tipe === 'GURU') {
      return previewTeacherImportCsv({
        csvText: String(input.csv_text ?? ''),
        existingTeachers: this.state.teachers,
      });
    }
    return previewStudentImportCsv({
      csvText: String(input.csv_text ?? ''),
      existingStudents: this.state.students,
      rombels: this.state.rombels,
      majors: this.state.majors,
    });
  }

  async commitStudentImport(
    ctx: AuthContext,
    input: { tipe: string; filename?: string; csv_text: string },
  ) {
    const adminCheck = guardAdminOnly(ctx, 'Commit Import');
    if (!adminCheck.ok) return adminCheck;

    if (input.tipe !== 'SISWA') {
      return {
        ok: false as const,
        error: {
          kind: 'VALIDATION_ERROR' as const,
          httpStatus: 422 as const,
          field: 'tipe',
          message: 'Tipe import belum didukung pada endpoint ini.',
        },
      };
    }

    const previewRes = previewStudentImportCsv({
      csvText: String(input.csv_text ?? ''),
      existingStudents: this.state.students,
      rombels: this.state.rombels,
      majors: this.state.majors,
    });
    if (!previewRes.ok) return previewRes;

    const newUsers = [...this.state.users];
    const newStudents = [...this.state.students];
    for (const row of previewRes.value.validRows) {
      const uid = `usr-${row.nisn}`;
      const sid = `stu-${row.nisn}`;
      newUsers.push({
        id: uid,
        nama: row.nama,
        email: `${row.nisn}@siswa.smkn1percut.sch.id`,
        roles: ['SISWA'],
        status: 'AKTIF',
        last_login_at: '',
      });
      newStudents.push({
        id: sid,
        user_id: uid,
        nisn: row.nisn,
        nis: row.nis,
        rombel_id: row.rombelId,
        jenis_kelamin: row.jenisKelamin,
        tanggal_lahir: '2008-01-01',
        status: 'AKTIF',
      });
    }

    const batch = {
      id: `imp-${Date.now()}`,
      tipe: 'SISWA' as const,
      filename: String(input.filename || 'import_siswa.csv'),
      status:
        previewRes.value.errorRows.length > 0
          ? ('SEBAGIAN_ERROR' as const)
          : ('SELESAI' as const),
      total_baris: previewRes.value.totalRows,
      baris_sukses: previewRes.value.validRows.length,
      baris_error: previewRes.value.errorRows.length,
      error_logs: previewRes.value.errorRows.map((e) => ({
        row: e.row,
        reason: e.reason,
      })),
      created_by: ctx.user.id,
      created_at: new Date().toISOString(),
    };

    this.persistState(
      this.appendAudit(
        {
          ...this.state,
          users: newUsers,
          students: newStudents,
          import_batches: [batch, ...this.state.import_batches],
        },
        ctx.user.id,
        'IMPORT_STUDENTS',
        'import_batches',
        batch.id,
        `Import siswa: ${batch.baris_sukses} masuk, ${batch.baris_error} error`,
      ),
    );
    return { ok: true as const, value: { batch, preview: previewRes.value } };
  }

  async updateEraporMapping(
    ctx: AuthContext,
    input: { template_name?: string; mapping: EraporColumnMapping['mapping'] },
  ) {
    const adminCheck = guardAdminOnly(ctx, 'Update Mapping e-Rapor');
    if (!adminCheck.ok) return adminCheck;

    const updated = {
      ...this.state.erapor_mappings[0],
      template_name: String(
        input.template_name || this.state.erapor_mappings[0].template_name,
      ),
      mapping: input.mapping,
    };
    this.persistState(
      this.appendAudit(
        { ...this.state, erapor_mappings: [updated] },
        ctx.user.id,
        'UPDATE_ERAPOR_MAPPING',
        'erapor_mappings',
        updated.id,
        `Memperbarui mapping e-Rapor (${input.mapping.length} kolom)`,
      ),
    );
    return { ok: true as const, value: updated };
  }

  async recordBackupRun(
    ctx: AuthContext,
    input: { simulate_zero_byte?: boolean },
  ) {
    const adminCheck = guardAdminOnly(ctx, 'Jalankan Backup Manual');
    if (!adminCheck.ok) return adminCheck;

    const simulateZero = Boolean(input.simulate_zero_byte);
    const sizeBytes = simulateZero ? 0 : JSON.stringify(this.state).length * 42;
    const filename = `lms_smkn1percut_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${Date.now().toString().slice(-4)}.sql.gz`;
    const record = {
      id: `bkp-${Date.now()}`,
      filename,
      size_bytes: sizeBytes,
      status: sizeBytes === 0 ? ('EMPTY_ALERT' as const) : ('OK' as const),
      created_at: new Date().toISOString(),
    };

    let nextState: LmsDatabaseState = {
      ...this.state,
      backup_history: [record, ...this.state.backup_history].slice(0, 7),
    };

    if (sizeBytes === 0) {
      nextState = {
        ...nextState,
        notifications: [
          {
            id: `notif-${Date.now()}`,
            user_id: ctx.user.id,
            tipe: 'PERINGATAN',
            judul: 'ALERT BACKUP 0 BYTE',
            pesan: `Verifikasi backup gagal: file ${filename} berukuran 0 byte! Segera periksa disk server.`,
            entitas: 'backup_history',
            entitas_id: record.id,
            dibaca_at: null,
            created_at: new Date().toISOString(),
          },
          ...nextState.notifications,
        ],
      };
    }

    this.persistState(
      this.appendAudit(
        nextState,
        ctx.user.id,
        'RUN_BACKUP',
        'backup_history',
        record.id,
        `Backup ${filename} (${sizeBytes} bytes) status=${record.status}`,
      ),
    );
    return { ok: true as const, value: record };
  }

  async resetDemoState(): Promise<void> {
    this.persistState(createInitialSeedState());
  }
}
