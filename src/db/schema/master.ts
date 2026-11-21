import {
  mysqlTable,
  int,
  varchar,
  text,
  boolean,
  date,
  mysqlEnum,
  uniqueIndex,
} from 'drizzle-orm/mysql-core';

export const schools = mysqlTable(
  'schools',
  {
    id: int('id').autoincrement().primaryKey(),
    npsn: varchar('npsn', { length: 20 }).notNull(),
    nama: varchar('nama', { length: 160 }).notNull(),
    alamat: text('alamat').notNull(),
    kepalaSekolah: varchar('kepala_sekolah', { length: 120 }).notNull(),
    telepon: varchar('telepon', { length: 32 }).notNull(),
    email: varchar('email', { length: 120 }).notNull(),
    logoUrl: varchar('logo_url', { length: 255 }).notNull(),
  },
  (t) => [uniqueIndex('uq_schools_npsn').on(t.npsn)],
);

export const academicYears = mysqlTable(
  'academic_years',
  {
    id: int('id').autoincrement().primaryKey(),
    tahunAjaran: varchar('tahun_ajaran', { length: 20 }).notNull(),
    semester: mysqlEnum('semester', ['GANJIL', 'GENAP']).notNull(),
    tanggalMulai: date('tanggal_mulai').notNull(),
    tanggalSelesai: date('tanggal_selesai').notNull(),
    isActive: boolean('is_active').notNull().default(false),
  },
  (t) => [uniqueIndex('uq_academic_year_sem').on(t.tahunAjaran, t.semester)],
);

export const curricula = mysqlTable(
  'curricula',
  {
    id: int('id').autoincrement().primaryKey(),
    kode: mysqlEnum('kode', ['K13', 'MERDEKA']).notNull(),
    deskripsi: varchar('deskripsi', { length: 255 }).notNull(),
  },
  (t) => [uniqueIndex('uq_curricula_kode').on(t.kode)],
);

export const majors = mysqlTable(
  'majors',
  {
    id: int('id').autoincrement().primaryKey(),
    kode: varchar('kode', { length: 16 }).notNull(),
    nama: varchar('nama', { length: 140 }).notNull(),
  },
  (t) => [uniqueIndex('uq_majors_kode').on(t.kode)],
);

export const rombels = mysqlTable(
  'rombels',
  {
    id: int('id').autoincrement().primaryKey(),
    tingkat: int('tingkat').notNull(), // 10 | 11 | 12
    majorId: int('major_id')
      .notNull()
      .references(() => majors.id, { onDelete: 'restrict' }),
    academicYearId: int('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'restrict' }),
    kurikulumAcuan: mysqlEnum('kurikulum_acuan', ['K13', 'MERDEKA']).notNull(),
    namaRombel: varchar('nama_rombel', { length: 48 }).notNull(),
    waliKelasTeacherId: int('wali_kelas_id'),
  },
  (t) => [uniqueIndex('uq_rombel_year').on(t.namaRombel, t.academicYearId)],
);
