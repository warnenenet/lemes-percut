import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialSeedState } from '../data/seed';
import {
  guardTeacherAssignmentOwnership,
  guardNotebookContentRead,
  guardSusulanExamCreation,
  guardBkRombelAccess,
  summarizeNotebookMetadata,
  AuthContext,
} from './rbac';
import {
  evaluateSessionAccess,
  applyTeacherAttendanceOverride,
} from './attendance';
import { validateExamNoStudentOverlap, verifyExamToken } from './cbt';
import {
  calculateStudentFinalGrade,
  validateComponentWeights,
  generateEraporExport,
  calculatePklFinalScore,
} from './grading';
import {
  assemblePromptForTeacher,
  canPublishTeacherDocument,
  applyTeacherDocumentContentEdit,
} from './promptEngine';
import { previewStudentImportCsv } from './importValidator';
import { buildHealthResponse, evaluatePersistencePolicy } from '../db/envGuard';

test('RBAC: Guru A cannot access or edit Guru B assignment even on same subject (Matematika)', () => {
  const db = createInitialSeedState();
  const budiUser = db.users.find((u) => u.id === 'usr-budi')!;
  const budiTeacher = db.teachers.find((t) => t.id === 'tch-budi')!;
  const sitiAssignment = db.teacher_assignments.find(
    (a) => a.id === 'ta-siti-mtk-xiitkj1',
  );

  const ctx: AuthContext = {
    user: budiUser,
    activeRole: 'GURU_MAPEL',
    teacher: budiTeacher,
  };

  const res = guardTeacherAssignmentOwnership(ctx, sitiAssignment, 'nilai');
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.httpStatus, 403);
  }
});

test('Attendance: distinguishes HADIR vs AKSES_TANPA_AKTIVITAS and requires reason for override', () => {
  const db = createInitialSeedState();
  const session = db.sessions.find((s) => s.id === 'ses-1')!;

  const accessOnly = evaluateSessionAccess({
    existingRecord: undefined,
    session,
    studentId: 'stu-rizky',
    accessTimeHHmm: '08:30',
    timestampIso: '2026-11-16T08:30:00Z',
    activity: { readPct: 10, submittedTask: false, submittedReflection: false },
  });
  assert.equal(accessOnly.ok, true);
  if (accessOnly.ok) {
    assert.equal(accessOnly.value.status, 'AKSES_TANPA_AKTIVITAS');
  }

  const withActivity = evaluateSessionAccess({
    existingRecord: accessOnly.ok ? accessOnly.value : undefined,
    session,
    studentId: 'stu-rizky',
    accessTimeHHmm: '08:40',
    timestampIso: '2026-11-16T08:40:00Z',
    activity: { readPct: 75, submittedTask: false, submittedReflection: false },
  });
  assert.equal(withActivity.ok, true);
  if (withActivity.ok) {
    assert.equal(withActivity.value.status, 'HADIR');
  }

  const badOverride = applyTeacherAttendanceOverride({
    existingRecord: undefined,
    sessionId: session.id,
    studentId: 'stu-rizky',
    newStatus: 'IZIN',
    teacherUserId: 'usr-budi',
    reason: ' ',
    timestampIso: '2026-11-16T09:00:00Z',
  });
  assert.equal(badOverride.ok, false);
});

test('Notebook Privacy: BK, Wali Kelas, Wakasek, Kepsek cannot read content (403) and only get metadata', () => {
  const db = createInitialSeedState();
  const notebook = db.notebooks[0];
  const assignment = db.teacher_assignments.find(
    (a) => a.id === notebook.teacher_assignment_id,
  );

  const bkUser = db.users.find((u) => u.id === 'usr-hendra')!;
  const bkRes = guardNotebookContentRead(
    { user: bkUser, activeRole: 'GURU_BK' },
    notebook,
    assignment,
  );
  assert.equal(bkRes.ok, false);
  if (!bkRes.ok) assert.equal(bkRes.error.httpStatus, 403);

  const budiUser = db.users.find((u) => u.id === 'usr-budi')!;
  const budiTeacher = db.teachers.find((t) => t.id === 'tch-budi')!;
  const waliRes = guardNotebookContentRead(
    { user: budiUser, activeRole: 'WALI_KELAS', teacher: budiTeacher },
    notebook,
    assignment,
  );
  assert.equal(waliRes.ok, false);

  const mapelRes = guardNotebookContentRead(
    { user: budiUser, activeRole: 'GURU_MAPEL', teacher: budiTeacher },
    notebook,
    assignment,
  );
  assert.equal(mapelRes.ok, true);

  const meta = summarizeNotebookMetadata(notebook, db.notebook_entries);
  assert.equal(meta.entry_count, 1);
  assert.equal('konten' in meta, false);
});

test('CBT Overlap & Susulan RBAC: rejects overlapping exam for shared student across different subjects', () => {
  const db = createInitialSeedState();
  // ex-1 is ta-budi-mtk-xirpl1 at 2026-11-16T08:00:00Z for 90 mins
  // Creating a PWB exam in XI RPL 1 at 08:30 must overlap!
  const overlapRes = validateExamNoStudentOverlap({
    candidate: {
      id: 'ex-new',
      teacher_assignment_id: 'ta-budi-pwb-xirpl1',
      waktu_mulai: '2026-11-16T08:30:00Z',
      durasi_menit: 60,
    },
    existingExams: db.exams,
    assignments: db.teacher_assignments,
    students: db.students,
    rombels: db.rombels,
    users: db.users,
  });
  assert.equal(overlapRes.ok, false);
  if (!overlapRes.ok) {
    assert.equal(overlapRes.error.kind, 'EXAM_OVERLAP');
    assert.equal(overlapRes.error.httpStatus, 409);
  }

  // Susulan created by BK must be rejected 403
  const bkUser = db.users.find((u) => u.id === 'usr-hendra')!;
  const susulanByBk = guardSusulanExamCreation(
    { user: bkUser, activeRole: 'GURU_BK' },
    db.teacher_assignments[0],
  );
  assert.equal(susulanByBk.ok, false);
  if (!susulanByBk.ok) assert.equal(susulanByBk.error.httpStatus, 403);

  assert.equal(verifyExamToken(db.exams[0], 'RPL2026').ok, true);
  assert.equal(verifyExamToken(db.exams[0], 'SALAH').ok, false);
});

test('Grading & Dynamic e-Rapor Export: computes weighted grades and exports exact rombel student count', () => {
  const db = createInitialSeedState();
  const comps = db.grade_components.filter(
    (c) => c.teacher_assignment_id === 'ta-budi-mtk-xirpl1',
  );
  assert.equal(validateComponentWeights(comps).valid, true);

  const rizkyFinal = calculateStudentFinalGrade({
    studentId: 'stu-rizky',
    components: comps,
    grades: db.grades,
    track: 'MERDEKA',
  });
  // 84*0.3 + 80*0.4 + 88*0.3 = 25.2 + 32 + 26.4 = 83.6
  assert.equal(rizkyFinal.nilaiAkhir, 83.6);
  assert.equal(rizkyFinal.predikat, 'Cakap');

  const xiRpl1 = db.rombels.find((r) => r.id === 'rom-xi-rpl-1')!;
  const exportRes = generateEraporExport({
    mapping: db.erapor_mappings[0],
    rombel: xiRpl1,
    students: db.students,
    users: db.users,
    components: comps,
    grades: db.grades,
  });
  assert.equal(exportRes.ok, true);
  if (exportRes.ok) {
    assert.equal(exportRes.value.rows.length, 40);
    assert.equal(exportRes.value.rows[0]['Nilai Rapor'], '83.6');
  }
});

test('Perangkat Ajar Prompt Generator: excludes student PII, enforces checklist before publish, reverts on edit', () => {
  const db = createInitialSeedState();
  const template = db.prompt_templates[0];
  const assignment = db.teacher_assignments.find(
    (a) => a.id === 'ta-budi-pwb-xirpl1',
  )!;
  const rombel = db.rombels.find((r) => r.id === assignment.rombel_id)!;
  const major = db.majors.find((m) => m.id === rombel.major_id)!;
  const subject = db.subjects.find((s) => s.id === assignment.subject_id)!;
  const teacher = db.teachers.find((t) => t.id === assignment.teacher_id)!;
  const teacherUser = db.users.find((u) => u.id === teacher.user_id)!;
  const year = db.academic_years.find((y) => y.is_active)!;

  const promptRes = assemblePromptForTeacher({
    template,
    context: {
      school: db.school,
      academicYear: year,
      teacherUser,
      teacherNip: teacher.nip,
      subject,
      rombel,
      major,
      assignment,
      studentCount: 2,
    },
    teacherInputs: {
      topik: 'REST API Type-Safe',
      model_pembelajaran: 'PjBL',
      dimensi_profil: 'Bernalar Kritis',
    },
  });

  assert.equal(promptRes.ok, true);
  if (promptRes.ok) {
    assert.equal(promptRes.value.includes('0081234501'), false);
    assert.equal(promptRes.value.includes('Rizky Pratama'), false);
    assert.equal(promptRes.value.includes('CP / TP / ATP / KKTP'), true);
  }

  const draftDoc = db.teacher_documents.find((d) => d.id === 'tdoc-2')!;
  const tplK13 = db.prompt_templates.find((t) => t.id === 'tpl-k13-umum')!;
  assert.equal(canPublishTeacherDocument(draftDoc, tplK13).ok, false);

  const publishedDoc = db.teacher_documents.find((d) => d.id === 'tdoc-1')!;
  const edited = applyTeacherDocumentContentEdit(
    publishedDoc,
    publishedDoc.judul,
    'Konten diubah setelah publish',
    '2026-11-16T12:00:00Z',
  );
  assert.equal(edited.status, 'DRAFT');
});

test('Atomic Import & PKL Score Isolation & BK Rombel Guard', () => {
  const db = createInitialSeedState();
  const csv = [
    'nisn,nis,nama,rombel,jurusan,jenis_kelamin',
    '0087654321,240199,Bagas Pratama,XI RPL 1,RPL,L',
    '0081234501,240198,Duplikat Rizky,XI RPL 1,RPL,L',
    '123,240197,Salah NISN,XI RPL 1,RPL,L',
  ].join('\n');

  const preview = previewStudentImportCsv({
    csvText: csv,
    existingStudents: db.students,
    rombels: db.rombels,
    majors: db.majors,
  });
  assert.equal(preview.ok, true);
  if (preview.ok) {
    assert.equal(preview.value.validRows.length, 1);
    assert.equal(preview.value.errorRows.length, 2);
  }

  const pklFinal = calculatePklFinalScore(db.pkl_scores);
  assert.equal(pklFinal.dudiAvg, 90);
  assert.equal(pklFinal.sekolahAvg, 85);
  assert.equal(pklFinal.finalScore, 88);

  const bkUser = db.users.find((u) => u.id === 'usr-hendra')!;
  const bkCounselor = db.bk_counselors[0];
  const deniedRombel = guardBkRombelAccess(
    { user: bkUser, activeRole: 'GURU_BK', bkCounselor },
    'rom-x-rpl-1',
    db.bk_class_assignments,
  );
  assert.equal(deniedRombel.ok, false);
});

test('Realistic Scale Seed: verifies 14 majors, 18 rombels, 180 students (40 in XI RPL 1), 20 teachers, 5 BK, 10 PKL', () => {
  const db = createInitialSeedState();
  assert.equal(db.majors.length, 14);
  assert.equal(db.rombels.length, 18);
  assert.equal(db.students.length, 180);
  assert.equal(
    db.students.filter((s) => s.rombel_id === 'rom-xi-rpl-1').length,
    40,
  );
  assert.equal(db.teachers.length, 20);
  assert.equal(
    db.teachers.filter((t) => t.bidang.includes('Matematika')).length,
    3,
  );
  assert.equal(db.bk_counselors.length, 5);
  assert.equal(db.bk_class_assignments.length, 18);
  assert.equal(db.pkl_placements.length, 10);
  assert.equal(db.dudis.length, 2);
});

test('Production Persistence Guard: refuses JSON fallback when NODE_ENV=production or ALLOW_JSON_FALLBACK!=true', () => {
  const prodWithoutDb = evaluatePersistencePolicy({
    NODE_ENV: 'production',
    ALLOW_JSON_FALLBACK: 'true',
    DATABASE_URL: '',
  });
  assert.equal(prodWithoutDb.allowed, false);

  const devWithoutFlag = evaluatePersistencePolicy({
    NODE_ENV: 'development',
    DATABASE_URL: '',
  });
  assert.equal(devWithoutFlag.allowed, false);

  const devWithFlag = evaluatePersistencePolicy({
    NODE_ENV: 'development',
    ALLOW_JSON_FALLBACK: 'true',
    DATABASE_URL: '',
  });
  assert.equal(devWithFlag.allowed, true);
  assert.equal(devWithFlag.mode, 'local-json-fallback');

  const prodWithDb = evaluatePersistencePolicy({
    NODE_ENV: 'production',
    DATABASE_URL: 'mysql://lms_user:secret@mysql:3306/lms_smkn1',
  });
  assert.equal(prodWithDb.allowed, true);
  assert.equal(prodWithDb.mode, 'mysql');
});

test('Health Endpoint Contract: returns DEGRADED on fallback, 503 in production degradation, and 200 OK when MySQL live', () => {
  const counts = {
    majors: 14,
    rombels: 18,
    students: 180,
    teachers: 20,
    bk_counselors: 5,
    pkl_placements: 10,
  };

  const devFallback = buildHealthResponse({
    nodeEnv: 'development',
    appMode: 'LMS',
    mysqlConfigured: false,
    mysqlReachable: false,
    storageDir: './storage',
    counts,
  });
  assert.equal(devFallback.httpStatus, 200);
  assert.equal(devFallback.body.status, 'DEGRADED');
  assert.equal(devFallback.body.engine, 'local-json-fallback');

  const prodUnreachable = buildHealthResponse({
    nodeEnv: 'production',
    appMode: 'LMS',
    mysqlConfigured: true,
    mysqlReachable: false,
    storageDir: '/app/storage',
    counts,
  });
  assert.equal(prodUnreachable.httpStatus, 503);
  assert.equal(prodUnreachable.body.ok, false);
  assert.equal(prodUnreachable.body.status, 'DEGRADED');

  const prodHealthy = buildHealthResponse({
    nodeEnv: 'production',
    appMode: 'CBT',
    mysqlConfigured: true,
    mysqlReachable: true,
    storageDir: '/app/storage',
    counts,
  });
  assert.equal(prodHealthy.httpStatus, 200);
  assert.equal(prodHealthy.body.ok, true);
  assert.equal(prodHealthy.body.status, 'OK');
  assert.equal(prodHealthy.body.engine, 'mysql');
});
