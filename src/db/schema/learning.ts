import {
  mysqlTable,
  int,
  varchar,
  text,
  longtext,
  boolean,
  date,
  decimal,
  mysqlEnum,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/mysql-core';
import { teacherAssignments } from './academic';
import { students, teachers, users } from './users';

export const modules = mysqlTable('modules', {
  id: int('id').autoincrement().primaryKey(),
  teacherAssignmentId: int('teacher_assignment_id')
    .notNull()
    .references(() => teacherAssignments.id, { onDelete: 'restrict' }),
  judul: varchar('judul', { length: 200 }).notNull(),
  konten: longtext('konten').notNull(),
  status: mysqlEnum('status', ['DRAFT', 'PUBLISHED'])
    .notNull()
    .default('DRAFT'),
  clonedFrom: int('cloned_from'),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

export const sessions = mysqlTable('sessions', {
  id: int('id').autoincrement().primaryKey(),
  teacherAssignmentId: int('teacher_assignment_id')
    .notNull()
    .references(() => teacherAssignments.id, { onDelete: 'restrict' }),
  pertemuanKe: int('pertemuan_ke').notNull(),
  tanggal: date('tanggal').notNull(),
  jamMulai: varchar('jam_mulai', { length: 8 }).notNull(),
  jamSelesai: varchar('jam_selesai', { length: 8 }).notNull(),
  tipeSesi: mysqlEnum('tipe_sesi', ['TEORI', 'PRAKTIK', 'TUGAS'])
    .notNull()
    .default('TEORI'),
  topik: varchar('topik', { length: 220 }).notNull(),
  moduleId: int('module_id').references(() => modules.id, {
    onDelete: 'set null',
  }),
  minimumReadPct: int('minimum_read_pct').notNull().default(60),
  status: mysqlEnum('status', ['DRAFT', 'OPEN', 'CLOSED'])
    .notNull()
    .default('DRAFT'),
});

export const attendanceRecords = mysqlTable(
  'attendance_records',
  {
    id: int('id').autoincrement().primaryKey(),
    sessionId: int('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'restrict' }),
    studentId: int('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    status: mysqlEnum('status', [
      'HADIR',
      'AKSES_TANPA_AKTIVITAS',
      'IZIN',
      'SAKIT',
      'ALPA',
    ]).notNull(),
    aktivitasMinimumTerpenuhi: boolean('aktivitas_minimum_terpenuhi')
      .notNull()
      .default(false),
    readPct: int('read_pct').notNull().default(0),
    submittedTask: boolean('submitted_task').notNull().default(false),
    submittedReflection: boolean('submitted_reflection').notNull().default(false),
    diaksesPada: timestamp('diakses_pada'),
    diaktifkanPada: timestamp('diaktifkan_pada'),
    overrideOleh: int('override_oleh').references(() => users.id, {
      onDelete: 'set null',
    }),
    alasanOverride: text('alasan_override'),
  },
  (t) => [uniqueIndex('uq_session_student').on(t.sessionId, t.studentId)],
);

export const assignments = mysqlTable('assignments', {
  id: int('id').autoincrement().primaryKey(),
  sessionId: int('session_id').references(() => sessions.id, {
    onDelete: 'set null',
  }),
  teacherAssignmentId: int('teacher_assignment_id')
    .notNull()
    .references(() => teacherAssignments.id, { onDelete: 'restrict' }),
  judul: varchar('judul', { length: 200 }).notNull(),
  deskripsi: text('deskripsi').notNull(),
  deadline: timestamp('deadline').notNull(),
  tipe: mysqlEnum('tipe', ['PR', 'TUGAS', 'PROYEK', 'PRAKTIK']).notNull(),
  rubrik: text('rubrik'),
  clonedFrom: int('cloned_from'),
});

export const submissions = mysqlTable(
  'submissions',
  {
    id: int('id').autoincrement().primaryKey(),
    assignmentId: int('assignment_id')
      .notNull()
      .references(() => assignments.id, { onDelete: 'restrict' }),
    studentId: int('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    fileUrl: varchar('file_url', { length: 255 }),
    teks: longtext('teks'),
    submittedAt: timestamp('submitted_at').defaultNow().notNull(),
    nilai: decimal('nilai', { precision: 5, scale: 2 }),
    dinilaiOleh: int('dinilai_oleh').references(() => teachers.id, {
      onDelete: 'set null',
    }),
    catatanGuru: text('catatan_guru'),
  },
  (t) => [uniqueIndex('uq_assignment_student').on(t.assignmentId, t.studentId)],
);
