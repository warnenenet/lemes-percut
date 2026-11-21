/**
 * Activity-Based Attendance State Machine
 * Distinguishes HADIR vs AKSES_TANPA_AKTIVITAS inside time windows,
 * plus audited teacher override with mandatory reason.
 */

import {
  assertNever,
  DomainError,
  err,
  ok,
  Result,
  validationError,
} from './result';
import {
  AttendanceRecord,
  AttendanceStatus,
  SessionType,
  TeachingSession,
} from './types';

export interface ActivityPayload {
  readonly readPct: number;
  readonly submittedTask: boolean;
  readonly submittedReflection: boolean;
}

export function isWithinTimeWindow(
  accessTimeHHmm: string,
  startHHmm: string,
  endHHmm: string,
): boolean {
  const toMinutes = (hhmm: string): number => {
    const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) return -1;
    return h * 60 + m;
  };
  const current = toMinutes(accessTimeHHmm);
  const start = toMinutes(startHHmm);
  const end = toMinutes(endHHmm);
  if (current < 0 || start < 0 || end < 0) return false;
  return current >= start && current <= end;
}

export function isMinimumActivitySatisfied(
  sessionType: SessionType,
  minimumReadPct: number,
  activity: ActivityPayload,
): boolean {
  switch (sessionType) {
    case 'TEORI':
      return (
        activity.readPct >= minimumReadPct ||
        activity.submittedTask ||
        activity.submittedReflection
      );
    case 'PRAKTIK':
      return activity.submittedTask || activity.submittedReflection;
    case 'TUGAS':
      return activity.submittedTask;
    default:
      return assertNever(sessionType, 'SessionType');
  }
}

export function evaluateSessionAccess(params: {
  readonly existingRecord: AttendanceRecord | undefined;
  readonly session: TeachingSession;
  readonly studentId: string;
  readonly accessTimeHHmm: string;
  readonly timestampIso: string;
  readonly activity: ActivityPayload;
}): Result<AttendanceRecord, DomainError> {
  const { existingRecord, session, studentId, accessTimeHHmm, timestampIso, activity } =
    params;

  if (session.status !== 'OPEN') {
    return err(
      validationError(
        'session.status',
        'Sesi pembelajaran belum dibuka atau sudah ditutup.',
      ),
    );
  }

  const inWindow = isWithinTimeWindow(
    accessTimeHHmm,
    session.jam_mulai,
    session.jam_selesai,
  );

  if (!inWindow) {
    return err(
      validationError(
        'waktu',
        `Akses berada di luar jendela waktu sesi (${session.jam_mulai}–${session.jam_selesai}).`,
      ),
    );
  }

  const mergedReadPct = Math.max(existingRecord?.read_pct ?? 0, activity.readPct);
  const mergedTask = Boolean(existingRecord?.submitted_task || activity.submittedTask);
  const mergedReflection = Boolean(
    existingRecord?.submitted_reflection || activity.submittedReflection,
  );

  const activityMet = isMinimumActivitySatisfied(
    session.tipe_sesi,
    session.minimum_read_pct,
    {
      readPct: mergedReadPct,
      submittedTask: mergedTask,
      submittedReflection: mergedReflection,
    },
  );

  // Preserve explicit teacher override (IZIN / SAKIT) if already set
  const preservedManual =
    existingRecord?.override_oleh &&
    (existingRecord.status === 'IZIN' || existingRecord.status === 'SAKIT');

  const status: AttendanceStatus = preservedManual
    ? existingRecord!.status
    : activityMet
      ? 'HADIR'
      : 'AKSES_TANPA_AKTIVITAS';

  return ok({
    id: existingRecord?.id ?? `att-${session.id}-${studentId}`,
    session_id: session.id,
    student_id: studentId,
    status,
    aktivitas_minimum_terpenuhi: activityMet,
    read_pct: mergedReadPct,
    submitted_task: mergedTask,
    submitted_reflection: mergedReflection,
    diakses_pada: existingRecord?.diakses_pada ?? timestampIso,
    diaktifkan_pada: activityMet
      ? existingRecord?.diaktifkan_pada ?? timestampIso
      : null,
    override_oleh: existingRecord?.override_oleh ?? null,
    alasan_override: existingRecord?.alasan_override ?? null,
  });
}

export function applyTeacherAttendanceOverride(params: {
  readonly existingRecord: AttendanceRecord | undefined;
  readonly sessionId: string;
  readonly studentId: string;
  readonly newStatus: AttendanceStatus;
  readonly teacherUserId: string;
  readonly reason: string;
  readonly timestampIso: string;
}): Result<AttendanceRecord, DomainError> {
  const trimmedReason = params.reason.trim();
  if (trimmedReason.length < 5) {
    return err(
      validationError(
        'alasan_override',
        'Override absensi wajib menyertakan alasan minimal 5 karakter.',
      ),
    );
  }

  return ok({
    id: params.existingRecord?.id ?? `att-${params.sessionId}-${params.studentId}`,
    session_id: params.sessionId,
    student_id: params.studentId,
    status: params.newStatus,
    aktivitas_minimum_terpenuhi:
      params.newStatus === 'HADIR'
        ? true
        : params.existingRecord?.aktivitas_minimum_terpenuhi ?? false,
    read_pct: params.existingRecord?.read_pct ?? 0,
    submitted_task: params.existingRecord?.submitted_task ?? false,
    submitted_reflection: params.existingRecord?.submitted_reflection ?? false,
    diakses_pada: params.existingRecord?.diakses_pada ?? params.timestampIso,
    diaktifkan_pada:
      params.newStatus === 'HADIR'
        ? params.existingRecord?.diaktifkan_pada ?? params.timestampIso
        : params.existingRecord?.diaktifkan_pada ?? null,
    override_oleh: params.teacherUserId,
    alasan_override: trimmedReason,
  });
}
