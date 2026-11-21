import {
  mysqlTable,
  int,
  varchar,
  mysqlEnum,
  uniqueIndex,
} from 'drizzle-orm/mysql-core';
import { academicYears, rombels } from './master';
import { teachers } from './users';

export const subjects = mysqlTable(
  'subjects',
  {
    id: int('id').autoincrement().primaryKey(),
    kode: varchar('kode', { length: 24 }).notNull(),
    nama: varchar('nama', { length: 140 }).notNull(),
    kelompok: mysqlEnum('kelompok', ['UMUM', 'KEJURUAN', 'PKL', 'UKK']).notNull(),
  },
  (t) => [uniqueIndex('uq_subjects_kode').on(t.kode)],
);

export const teacherAssignments = mysqlTable(
  'teacher_assignments',
  {
    id: int('id').autoincrement().primaryKey(),
    teacherId: int('teacher_id')
      .notNull()
      .references(() => teachers.id, { onDelete: 'restrict' }),
    subjectId: int('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    rombelId: int('rombel_id')
      .notNull()
      .references(() => rombels.id, { onDelete: 'restrict' }),
    academicYearId: int('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'restrict' }),
    semester: mysqlEnum('semester', ['GANJIL', 'GENAP']).notNull(),
    kurikulumAcuan: mysqlEnum('kurikulum_acuan', ['K13', 'MERDEKA']).notNull(),
    jamPerMinggu: int('jam_per_minggu').notNull().default(2),
    status: mysqlEnum('status', ['AKTIF', 'NONAKTIF'])
      .notNull()
      .default('AKTIF'),
  },
  (t) => [
    uniqueIndex('uq_teacher_assignment').on(
      t.teacherId,
      t.subjectId,
      t.rombelId,
      t.academicYearId,
      t.semester,
    ),
  ],
);
