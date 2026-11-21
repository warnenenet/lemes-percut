import {
  mysqlTable,
  int,
  varchar,
  text,
  json,
  decimal,
  mysqlEnum,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/mysql-core';
import { subjects, teacherAssignments } from './academic';
import { students, teachers } from './users';

export const questionBanks = mysqlTable('question_banks', {
  id: int('id').autoincrement().primaryKey(),
  subjectId: int('subject_id')
    .notNull()
    .references(() => subjects.id, { onDelete: 'restrict' }),
  teacherId: int('teacher_id')
    .notNull()
    .references(() => teachers.id, { onDelete: 'restrict' }),
  judul: varchar('judul', { length: 200 }).notNull(),
  kurikulumAcuan: mysqlEnum('kurikulum_acuan', ['K13', 'MERDEKA']).notNull(),
});

export const questions = mysqlTable('questions', {
  id: int('id').autoincrement().primaryKey(),
  bankId: int('bank_id')
    .notNull()
    .references(() => questionBanks.id, { onDelete: 'cascade' }),
  tipe: mysqlEnum('tipe', [
    'PG',
    'PG_KOMPLEKS',
    'BENAR_SALAH',
    'MENJODOHKAN',
    'ISIAN',
    'URAIAN',
  ]).notNull(),
  stem: text('stem').notNull(),
  optionsJson: json('options_json').notNull(),
  jawabanJson: json('jawaban_json').notNull(),
  rubrik: text('rubrik'),
  skor: decimal('skor', { precision: 5, scale: 2 }).notNull(),
  levelKognitif: varchar('level_kognitif', { length: 8 }).notNull(),
});

export const exams = mysqlTable('exams', {
  id: int('id').autoincrement().primaryKey(),
  teacherAssignmentId: int('teacher_assignment_id')
    .notNull()
    .references(() => teacherAssignments.id, { onDelete: 'restrict' }),
  tipe: mysqlEnum('tipe', ['MID', 'FINAL', 'CUSTOM', 'SUSULAN']).notNull(),
  judul: varchar('judul', { length: 200 }).notNull(),
  waktuMulai: timestamp('waktu_mulai').notNull(),
  durasiMenit: int('durasi_menit').notNull(),
  token: varchar('token', { length: 16 }).notNull(),
  status: mysqlEnum('status', ['DRAFT', 'TERJADWAL', 'AKTIF', 'SELESAI'])
    .notNull()
    .default('DRAFT'),
  parentExamId: int('parent_exam_id'),
});

export const examSessions = mysqlTable(
  'exam_sessions',
  {
    id: int('id').autoincrement().primaryKey(),
    examId: int('exam_id')
      .notNull()
      .references(() => exams.id, { onDelete: 'restrict' }),
    studentId: int('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    status: mysqlEnum('status', [
      'TERJADWAL',
      'MENGERJAKAN',
      'SELESAI',
      'TIDAK_HADIR',
      'SUSULAN',
    ])
      .notNull()
      .default('TERJADWAL'),
    startedAt: timestamp('started_at'),
    finishedAt: timestamp('finished_at'),
    tabSwitchCount: int('tab_switch_count').notNull().default(0),
  },
  (t) => [uniqueIndex('uq_exam_student').on(t.examId, t.studentId)],
);

export const examAnswers = mysqlTable(
  'exam_answers',
  {
    id: int('id').autoincrement().primaryKey(),
    examSessionId: int('exam_session_id')
      .notNull()
      .references(() => examSessions.id, { onDelete: 'cascade' }),
    questionId: int('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'restrict' }),
    jawabanJson: json('jawaban_json').notNull(),
    skor: decimal('skor', { precision: 5, scale: 2 }),
    disimpanPada: timestamp('disimpan_pada').defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex('uq_session_question').on(t.examSessionId, t.questionId)],
);
