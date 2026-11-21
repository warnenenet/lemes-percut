import {
  mysqlTable,
  int,
  varchar,
  text,
  date,
  boolean,
  decimal,
  mysqlEnum,
} from 'drizzle-orm/mysql-core';
import { subjects } from './academic';
import { bkCounselors, students, teachers, users } from './users';

export const dudis = mysqlTable('dudis', {
  id: int('id').autoincrement().primaryKey(),
  nama: varchar('nama', { length: 160 }).notNull(),
  alamat: text('alamat').notNull(),
  bidang: varchar('bidang', { length: 140 }).notNull(),
  kontak: varchar('kontak', { length: 120 }).notNull(),
});

export const pksDocuments = mysqlTable('pks_documents', {
  id: int('id').autoincrement().primaryKey(),
  dudiId: int('dudi_id')
    .notNull()
    .references(() => dudis.id, { onDelete: 'restrict' }),
  nomor: varchar('nomor', { length: 80 }).notNull(),
  tanggalMulai: date('tanggal_mulai').notNull(),
  tanggalSelesai: date('tanggal_selesai').notNull(),
  fileUrl: varchar('file_url', { length: 255 }).notNull(),
});

export const pklPlacements = mysqlTable('pkl_placements', {
  id: int('id').autoincrement().primaryKey(),
  studentId: int('student_id')
    .notNull()
    .references(() => students.id, { onDelete: 'restrict' }),
  dudiId: int('dudi_id')
    .notNull()
    .references(() => dudis.id, { onDelete: 'restrict' }),
  pksId: int('pks_id')
    .notNull()
    .references(() => pksDocuments.id, { onDelete: 'restrict' }),
  pembimbingBkId: int('pembimbing_bk_id')
    .notNull()
    .references(() => bkCounselors.id, { onDelete: 'restrict' }),
  pembimbingDudiNama: varchar('pembimbing_dudi_nama', { length: 140 }).notNull(),
  periodeMulai: date('periode_mulai').notNull(),
  periodeSelesai: date('periode_selesai').notNull(),
  status: mysqlEnum('status', ['BERJALAN', 'SELESAI', 'PERLU_PEMBINAAN'])
    .notNull()
    .default('BERJALAN'),
});

export const pklJournals = mysqlTable('pkl_journals', {
  id: int('id').autoincrement().primaryKey(),
  placementId: int('placement_id')
    .notNull()
    .references(() => pklPlacements.id, { onDelete: 'cascade' }),
  tanggal: date('tanggal').notNull(),
  aktivitas: text('aktivitas').notNull(),
  validasiBk: boolean('validasi_bk').notNull().default(false),
  catatanBk: text('catatan_bk'),
});

export const pklScores = mysqlTable('pkl_scores', {
  id: int('id').autoincrement().primaryKey(),
  placementId: int('placement_id')
    .notNull()
    .references(() => pklPlacements.id, { onDelete: 'restrict' }),
  komponen: mysqlEnum('komponen', [
    'DUDI_HARD',
    'DUDI_SOFT',
    'DUDI_DISIPLIN',
    'SEKOLAH_LAPORAN',
    'SEKOLAH_SIDANG',
  ]).notNull(),
  nilai: decimal('nilai', { precision: 5, scale: 2 }).notNull(),
  dinilaiOleh: int('dinilai_oleh')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
});

export const mapelPklContributions = mysqlTable('mapel_pkl_contributions', {
  id: int('id').autoincrement().primaryKey(),
  studentId: int('student_id')
    .notNull()
    .references(() => students.id, { onDelete: 'restrict' }),
  subjectId: int('subject_id')
    .notNull()
    .references(() => subjects.id, { onDelete: 'restrict' }),
  nilai: decimal('nilai', { precision: 5, scale: 2 }).notNull(),
  guruId: int('guru_id')
    .notNull()
    .references(() => teachers.id, { onDelete: 'restrict' }),
  catatan: text('catatan'),
});
