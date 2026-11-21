import {
  mysqlTable,
  int,
  varchar,
  date,
  mysqlEnum,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/mysql-core';
import { rombels } from './master';

export const users = mysqlTable(
  'users',
  {
    id: int('id').autoincrement().primaryKey(),
    nama: varchar('nama', { length: 140 }).notNull(),
    email: varchar('email', { length: 160 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    role: mysqlEnum('role', [
      'ADMIN',
      'KEPALA_SEKOLAH',
      'WAKASEK',
      'GURU_MAPEL',
      'GURU_BK',
      'WALI_KELAS',
      'SISWA',
    ]).notNull(),
    status: mysqlEnum('status', ['AKTIF', 'NONAKTIF'])
      .notNull()
      .default('AKTIF'),
    lastLoginAt: timestamp('last_login_at'),
  },
  (t) => [uniqueIndex('uq_users_email').on(t.email)],
);

export const userRoles = mysqlTable(
  'user_roles',
  {
    id: int('id').autoincrement().primaryKey(),
    userId: int('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: mysqlEnum('role', [
      'ADMIN',
      'KEPALA_SEKOLAH',
      'WAKASEK',
      'GURU_MAPEL',
      'GURU_BK',
      'WALI_KELAS',
      'SISWA',
    ]).notNull(),
  },
  (t) => [uniqueIndex('uq_user_role').on(t.userId, t.role)],
);

export const teachers = mysqlTable(
  'teachers',
  {
    id: int('id').autoincrement().primaryKey(),
    userId: int('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    nuptk: varchar('nuptk', { length: 32 }).notNull(),
    nip: varchar('nip', { length: 32 }).notNull().default(''),
    bidang: varchar('bidang', { length: 140 }).notNull(),
  },
  (t) => [
    uniqueIndex('uq_teachers_user').on(t.userId),
    uniqueIndex('uq_teachers_nuptk').on(t.nuptk),
  ],
);

export const students = mysqlTable(
  'students',
  {
    id: int('id').autoincrement().primaryKey(),
    userId: int('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    nisn: varchar('nisn', { length: 20 }).notNull(),
    nis: varchar('nis', { length: 20 }).notNull(),
    rombelId: int('rombel_id')
      .notNull()
      .references(() => rombels.id, { onDelete: 'restrict' }),
    jenisKelamin: mysqlEnum('jenis_kelamin', ['L', 'P']).notNull(),
    tanggalLahir: date('tanggal_lahir').notNull(),
    status: mysqlEnum('status', ['AKTIF', 'PKL', 'ALUMNI'])
      .notNull()
      .default('AKTIF'),
  },
  (t) => [
    uniqueIndex('uq_students_user').on(t.userId),
    uniqueIndex('uq_students_nisn').on(t.nisn),
  ],
);

export const bkCounselors = mysqlTable(
  'bk_counselors',
  {
    id: int('id').autoincrement().primaryKey(),
    userId: int('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [uniqueIndex('uq_bk_user').on(t.userId)],
);

export const bkClassAssignments = mysqlTable(
  'bk_class_assignments',
  {
    id: int('id').autoincrement().primaryKey(),
    bkId: int('bk_id')
      .notNull()
      .references(() => bkCounselors.id, { onDelete: 'restrict' }),
    rombelId: int('rombel_id')
      .notNull()
      .references(() => rombels.id, { onDelete: 'restrict' }),
  },
  (t) => [uniqueIndex('uq_bk_rombel').on(t.bkId, t.rombelId)],
);
