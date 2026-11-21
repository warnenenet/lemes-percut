import {
  mysqlTable,
  int,
  varchar,
  text,
  decimal,
  json,
  mysqlEnum,
  uniqueIndex,
} from 'drizzle-orm/mysql-core';
import { academicYears } from './master';
import { subjects, teacherAssignments } from './academic';
import { students, users } from './users';

export const gradeComponents = mysqlTable('grade_components', {
  id: int('id').autoincrement().primaryKey(),
  teacherAssignmentId: int('teacher_assignment_id')
    .notNull()
    .references(() => teacherAssignments.id, { onDelete: 'restrict' }),
  nama: mysqlEnum('nama', [
    'FORMATIF',
    'SUMATIF',
    'PRAKTIK',
    'PROYEK',
    'REMEDIAL',
  ]).notNull(),
  bobot: decimal('bobot', { precision: 5, scale: 2 }).notNull(),
});

export const grades = mysqlTable(
  'grades',
  {
    id: int('id').autoincrement().primaryKey(),
    studentId: int('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    teacherAssignmentId: int('teacher_assignment_id')
      .notNull()
      .references(() => teacherAssignments.id, { onDelete: 'restrict' }),
    componentId: int('component_id')
      .notNull()
      .references(() => gradeComponents.id, { onDelete: 'restrict' }),
    nilai: decimal('nilai', { precision: 5, scale: 2 }).notNull(),
    catatan: text('catatan'),
  },
  (t) => [uniqueIndex('uq_student_component').on(t.studentId, t.componentId)],
);

export const finalGrades = mysqlTable(
  'final_grades',
  {
    id: int('id').autoincrement().primaryKey(),
    studentId: int('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    teacherAssignmentId: int('teacher_assignment_id')
      .notNull()
      .references(() => teacherAssignments.id, { onDelete: 'restrict' }),
    nilaiAkhir: decimal('nilai_akhir', { precision: 5, scale: 2 }).notNull(),
    predikat: varchar('predikat', { length: 48 }).notNull(),
  },
  (t) => [
    uniqueIndex('uq_final_grade_student_ta').on(
      t.studentId,
      t.teacherAssignmentId,
    ),
  ],
);

export const eraporColumnMappings = mysqlTable('erapor_column_mappings', {
  id: int('id').autoincrement().primaryKey(),
  academicYearId: int('academic_year_id')
    .notNull()
    .references(() => academicYears.id, { onDelete: 'restrict' }),
  mapelId: int('mapel_id').references(() => subjects.id, {
    onDelete: 'set null',
  }),
  templateName: varchar('template_name', { length: 160 }).notNull(),
  mappingJson: json('mapping_json').notNull(),
  templateFileUrl: varchar('template_file_url', { length: 255 }),
  createdBy: int('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
});
