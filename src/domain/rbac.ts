/**
 * RBAC Capability Guards
 * Pure policy functions mirroring Rust middleware/guard extractors.
 * Enforces all 8 mandatory RBAC rules from the specification.
 */

import { DomainError, err, forbiddenError, ok, Result } from './result';
import {
  AssignmentId,
  BkClassAssignment,
  BkCounselor,
  Notebook,
  NotebookEntry,
  NotebookMetadataSummary,
  RombelId,
  Student,
  Teacher,
  TeacherAssignment,
  User,
  UserRole,
} from './types';

export interface AuthContext {
  readonly user: User;
  readonly activeRole: UserRole;
  readonly teacher?: Teacher;
  readonly student?: Student;
  readonly bkCounselor?: BkCounselor;
}

export function hasRole(user: User, role: UserRole): boolean {
  return user.roles.includes(role);
}

/**
 * Rule 1: GURU_MAPEL may ONLY access/mutate sessions, assignments, grades, and
 * CBT exams for teacher_assignments owned by them. Any cross-teacher access -> 403.
 */
export function guardTeacherAssignmentOwnership(
  ctx: AuthContext,
  assignment: TeacherAssignment | undefined,
  actionLabel: string,
): Result<TeacherAssignment, DomainError> {
  if (!assignment) {
    return err(
      forbiddenError(
        `Penugasan mengajar tidak ditemukan atau akses ditolak (${actionLabel}).`,
        'GURU_MAPEL:OWN_ASSIGNMENT',
      ),
    );
  }
  if (ctx.activeRole === 'ADMIN') {
    return ok(assignment);
  }
  if (ctx.activeRole !== 'GURU_MAPEL' || !ctx.teacher) {
    return err(
      forbiddenError(
        `Role ${ctx.activeRole} tidak memiliki izin mengubah penugasan mengajar (${actionLabel}).`,
        'GURU_MAPEL:OWN_ASSIGNMENT',
      ),
    );
  }
  if (assignment.teacher_id !== ctx.teacher.id) {
    return err(
      forbiddenError(
        `Akses ditolak (403): Guru tidak dapat mengakses atau mengubah ${actionLabel} milik guru lain meskipun mata pelajaran sama.`,
        'GURU_MAPEL:OWN_ASSIGNMENT',
      ),
    );
  }
  return ok(assignment);
}

/**
 * Rule 2: GURU_BK accesses monitoring ONLY for rombels explicitly assigned in bk_class_assignments.
 */
export function guardBkRombelAccess(
  ctx: AuthContext,
  rombelId: RombelId,
  bkAssignments: ReadonlyArray<BkClassAssignment>,
): Result<void, DomainError> {
  if (ctx.activeRole === 'ADMIN') {
    return ok(undefined);
  }
  if (ctx.activeRole !== 'GURU_BK' || !ctx.bkCounselor) {
    return err(
      forbiddenError(
        'Hanya Guru BK yang berwenang mengakses monitoring BK.',
        'GURU_BK:ASSIGNED_ROMBEL',
      ),
    );
  }
  const assigned = bkAssignments.some(
    (b) => b.bk_id === ctx.bkCounselor!.id && b.rombel_id === rombelId,
  );
  if (!assigned) {
    return err(
      forbiddenError(
        'Akses ditolak (403): Kelas ini tidak berada dalam penugasan binaan BK Anda.',
        'GURU_BK:ASSIGNED_ROMBEL',
      ),
    );
  }
  return ok(undefined);
}

/**
 * Rule 3: Notebook content privacy!
 * ONLY the student owner and the assigned subject teacher (GURU_MAPEL) may read notebook_entries content.
 * GURU_BK, WALI_KELAS, WAKASEK, KEPALA_SEKOLAH, and other students receive 403 on content reads.
 */
export function guardNotebookContentRead(
  ctx: AuthContext,
  notebook: Notebook,
  assignment: TeacherAssignment | undefined,
): Result<void, DomainError> {
  if (ctx.activeRole === 'SISWA' && ctx.student?.id === notebook.student_id) {
    return ok(undefined);
  }
  if (
    ctx.activeRole === 'GURU_MAPEL' &&
    ctx.teacher &&
    assignment &&
    assignment.id === notebook.teacher_assignment_id &&
    assignment.teacher_id === ctx.teacher.id
  ) {
    return ok(undefined);
  }
  return err(
    forbiddenError(
      'Privasi Buku Tulis (403): Isi catatan buku tulis hanya dapat dibaca oleh siswa pemilik dan guru mapel pengampu. Role monitoring hanya menerima metadata.',
      'NOTEBOOK:CONTENT_OWNER_OR_SUBJECT_TEACHER',
    ),
  );
}

/**
 * Projects notebook entries into non-sensitive metadata for BK / Wali Kelas / Wakasek / Kepsek.
 */
export function summarizeNotebookMetadata(
  notebook: Notebook,
  entries: ReadonlyArray<NotebookEntry>,
): NotebookMetadataSummary {
  const matching = entries.filter((e) => e.notebook_id === notebook.id);
  const sortedDates = matching
    .map((e) => e.updated_at)
    .sort((a, b) => b.localeCompare(a));
  return {
    notebook_id: notebook.id,
    student_id: notebook.student_id,
    subject_id: notebook.subject_id,
    entry_count: matching.length,
    last_updated_at: sortedDates[0] ?? null,
    has_teacher_comment: matching.some((e) => Boolean(e.komentar_guru)),
  };
}

/**
 * Rule 4 & 5 & 6: Wali Kelas, Wakasek, Kepala Sekolah cannot edit subject grades.
 */
export function guardGradeMutation(
  ctx: AuthContext,
  assignment: TeacherAssignment | undefined,
): Result<TeacherAssignment, DomainError> {
  if (ctx.activeRole === 'WALI_KELAS') {
    return err(
      forbiddenError(
        'Akses ditolak (403): Wali Kelas hanya memiliki akses baca pada nilai mata pelajaran.',
        'GURU_MAPEL:GRADE_WRITE',
      ),
    );
  }
  return guardTeacherAssignmentOwnership(ctx, assignment, 'nilai mata pelajaran');
}

/**
 * Critical CBT Rule: Exam SUSULAN can ONLY be created by the owning GURU_MAPEL (never BK or Wakasek).
 */
export function guardSusulanExamCreation(
  ctx: AuthContext,
  assignment: TeacherAssignment | undefined,
): Result<TeacherAssignment, DomainError> {
  if (ctx.activeRole !== 'GURU_MAPEL') {
    return err(
      forbiddenError(
        `Akses ditolak (403): Ujian susulan hanya boleh dibuat oleh Guru Mapel pengampu, bukan ${ctx.activeRole}.`,
        'GURU_MAPEL:CREATE_SUSULAN',
      ),
    );
  }
  return guardTeacherAssignmentOwnership(ctx, assignment, 'ujian susulan');
}

export function guardAdminOnly(
  ctx: AuthContext,
  action: string,
): Result<void, DomainError> {
  if (ctx.activeRole !== 'ADMIN') {
    return err(
      forbiddenError(
        `Akses ditolak (403): Tindakan "${action}" khusus Administrator.`,
        'ADMIN:SYSTEM',
      ),
    );
  }
  return ok(undefined);
}

export function canCloneBetweenAssignments(
  teacherId: string,
  source: TeacherAssignment | undefined,
  target: TeacherAssignment | undefined,
): Result<{ sourceId: AssignmentId; targetId: AssignmentId }, DomainError> {
  if (!source || !target) {
    return err(
      forbiddenError(
        'Assignment sumber atau tujuan tidak ditemukan.',
        'GURU_MAPEL:CLONE',
      ),
    );
  }
  if (source.teacher_id !== teacherId || target.teacher_id !== teacherId) {
    return err(
      forbiddenError(
        'Clone (403): Anda hanya dapat menyalin materi/sesi/tugas antar kelas yang Anda ampu sendiri.',
        'GURU_MAPEL:CLONE',
      ),
    );
  }
  return ok({ sourceId: source.id, targetId: target.id });
}
