import {
  mysqlTable,
  int,
  varchar,
  text,
  json,
  mysqlEnum,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/mysql-core';
import { students, users } from './users';

export const notifications = mysqlTable('notifications', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tipe: mysqlEnum('tipe', [
    'INFO',
    'PERINGATAN',
    'AKADEMIK',
    'PEMBINAAN',
  ]).notNull(),
  judul: varchar('judul', { length: 180 }).notNull(),
  pesan: text('pesan').notNull(),
  entitas: varchar('entitas', { length: 64 }).notNull(),
  entitasId: varchar('entitas_id', { length: 64 }).notNull(),
  dibacaAt: timestamp('dibaca_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const auditLogs = mysqlTable('audit_logs', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  aksi: varchar('aksi', { length: 80 }).notNull(),
  entitas: varchar('entitas', { length: 64 }).notNull(),
  entitasId: varchar('entitas_id', { length: 64 }).notNull(),
  beforeJson: json('before_json'),
  afterJson: json('after_json'),
  ip: varchar('ip', { length: 48 }).notNull().default('127.0.0.1'),
  userAgent: varchar('user_agent', { length: 255 }).notNull().default('web'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const importBatches = mysqlTable('import_batches', {
  id: int('id').autoincrement().primaryKey(),
  tipe: mysqlEnum('tipe', [
    'SISWA',
    'GURU',
    'NILAI',
    'TEACHER_ASSIGNMENT',
  ]).notNull(),
  fileUrl: varchar('file_url', { length: 255 }).notNull(),
  status: mysqlEnum('status', ['SELESAI', 'SEBAGIAN_ERROR', 'GAGAL']).notNull(),
  totalBaris: int('total_baris').notNull().default(0),
  barisSukses: int('baris_sukses').notNull().default(0),
  barisError: int('baris_error').notNull().default(0),
  errorLogJson: json('error_log_json').notNull(),
  createdBy: int('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const coachingNotes = mysqlTable('coaching_notes', {
  id: int('id').autoincrement().primaryKey(),
  authorUserId: int('author_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  targetType: mysqlEnum('target_type', ['SISWA', 'GURU']).notNull(),
  targetId: int('target_id').notNull(),
  judul: varchar('judul', { length: 180 }).notNull(),
  catatan: text('catatan').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const walikelasNotes = mysqlTable(
  'walikelas_notes',
  {
    id: int('id').autoincrement().primaryKey(),
    studentId: int('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    catatan: text('catatan').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex('uq_walikelas_student').on(t.studentId)],
);

export const settings = mysqlTable('settings', {
  key: varchar('key', { length: 96 }).primaryKey(),
  value: text('value').notNull(),
  group: varchar('group', { length: 48 }).notNull().default('general'),
});
