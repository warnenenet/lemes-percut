/**
 * CBT (Computer-Based Test) Domain Logic
 * Critical rule: Student-level schedule overlap detection across ALL teachers & subjects.
 * Susulan exams allowed ONLY by owning GURU_MAPEL.
 */

import {
  DomainError,
  err,
  ok,
  Result,
  validationError,
} from './result';
import {
  Exam,
  ExamAnswer,
  Question,
  Rombel,
  Student,
  TeacherAssignment,
  User,
} from './types';

export interface ExamInterval {
  readonly startMs: number;
  readonly endMs: number;
}

export function getExamInterval(waktuMulaiIso: string, durasiMenit: number): ExamInterval | null {
  const startMs = Date.parse(waktuMulaiIso);
  if (Number.isNaN(startMs) || durasiMenit <= 0) return null;
  return {
    startMs,
    endMs: startMs + durasiMenit * 60_000,
  };
}

export function intervalsOverlap(a: ExamInterval, b: ExamInterval): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

export function resolveExamTargetStudents(
  exam: Pick<Exam, 'teacher_assignment_id' | 'target_student_ids'>,
  assignments: ReadonlyArray<TeacherAssignment>,
  students: ReadonlyArray<Student>,
): ReadonlyArray<Student> {
  const assignment = assignments.find((a) => a.id === exam.teacher_assignment_id);
  if (!assignment) return [];
  const rombelStudents = students.filter(
    (s) => s.rombel_id === assignment.rombel_id && s.status !== 'ALUMNI',
  );
  if (exam.target_student_ids && exam.target_student_ids.length > 0) {
    const allowed = new Set(exam.target_student_ids);
    return rombelStudents.filter((s) => allowed.has(s.id));
  }
  return rombelStudents;
}

/**
 * Checks whether creating/scheduling `candidate` overlaps with ANY existing exam
 * for ANY student involved, regardless of subject or teacher.
 */
export function validateExamNoStudentOverlap(params: {
  readonly candidate: Pick<
    Exam,
    'id' | 'teacher_assignment_id' | 'waktu_mulai' | 'durasi_menit' | 'target_student_ids'
  >;
  readonly existingExams: ReadonlyArray<Exam>;
  readonly assignments: ReadonlyArray<TeacherAssignment>;
  readonly students: ReadonlyArray<Student>;
  readonly rombels: ReadonlyArray<Rombel>;
  readonly users: ReadonlyArray<User>;
}): Result<void, DomainError> {
  const candidateInterval = getExamInterval(
    params.candidate.waktu_mulai,
    params.candidate.durasi_menit,
  );
  if (!candidateInterval) {
    return err(
      validationError(
        'waktu_mulai',
        'Waktu mulai atau durasi ujian tidak valid.',
      ),
    );
  }

  const candidateStudents = resolveExamTargetStudents(
    params.candidate,
    params.assignments,
    params.students,
  );
  if (candidateStudents.length === 0) {
    return err(
      validationError(
        'target_student_ids',
        'Tidak ada siswa aktif pada kelas penugasan ujian ini.',
      ),
    );
  }

  const candidateStudentIds = new Set(candidateStudents.map((s) => s.id));
  const conflicts: Array<{
    readonly studentId: string;
    readonly studentName: string;
    readonly rombelName: string;
    readonly conflictingExamId: string;
    readonly conflictingExamTitle: string;
    readonly overlapStart: string;
    readonly overlapEnd: string;
  }> = [];

  for (const existing of params.existingExams) {
    if (existing.id === params.candidate.id || existing.status === 'DRAFT') {
      continue;
    }
    const existingInterval = getExamInterval(
      existing.waktu_mulai,
      existing.durasi_menit,
    );
    if (!existingInterval || !intervalsOverlap(candidateInterval, existingInterval)) {
      continue;
    }

    const existingTargets = resolveExamTargetStudents(
      existing,
      params.assignments,
      params.students,
    );

    for (const student of existingTargets) {
      if (candidateStudentIds.has(student.id)) {
        const user = params.users.find((u) => u.id === student.user_id);
        const rombel = params.rombels.find((r) => r.id === student.rombel_id);
        conflicts.push({
          studentId: student.id,
          studentName: user?.nama ?? student.nisn,
          rombelName: rombel?.nama_rombel ?? student.rombel_id,
          conflictingExamId: existing.id,
          conflictingExamTitle: existing.judul,
          overlapStart: existing.waktu_mulai,
          overlapEnd: new Date(existingInterval.endMs).toISOString(),
        });
      }
    }
  }

  if (conflicts.length > 0) {
    const sample = conflicts[0];
    return err({
      kind: 'EXAM_OVERLAP',
      httpStatus: 409,
      message: `Jadwal CBT bentrok untuk ${conflicts.length} siswa (${sample.studentName} · ${sample.rombelName}) dengan ujian "${sample.conflictingExamTitle}".`,
      conflicts,
    });
  }

  return ok(undefined);
}

export function verifyExamToken(
  exam: Exam,
  submittedToken: string,
): Result<void, DomainError> {
  if (exam.token.trim().toUpperCase() !== submittedToken.trim().toUpperCase()) {
    return err(
      validationError(
        'token',
        'Token ujian tidak sesuai. Periksa token resmi dari guru pengampu atau pengawas.',
      ),
    );
  }
  return ok(undefined);
}

export function gradeStudentExamAnswers(
  questions: ReadonlyArray<Question>,
  answers: ReadonlyArray<ExamAnswer>,
): { readonly totalEarned: number; readonly totalPossible: number; readonly percentage: number } {
  let totalEarned = 0;
  let totalPossible = 0;

  for (const q of questions) {
    totalPossible += q.skor;
    const ans = answers.find((a) => a.question_id === q.id);
    if (!ans) continue;
    if (q.tipe === 'PG' || q.tipe === 'BENAR_SALAH' || q.tipe === 'ISIAN') {
      if (ans.jawaban.trim().toUpperCase() === q.jawaban.trim().toUpperCase()) {
        totalEarned += q.skor;
      }
    } else if (ans.skor !== null) {
      totalEarned += ans.skor;
    }
  }

  const percentage =
    totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 1000) / 10 : 0;

  return { totalEarned, totalPossible, percentage };
}
