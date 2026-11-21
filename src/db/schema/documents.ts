import {
  mysqlTable,
  int,
  varchar,
  text,
  longtext,
  json,
  mysqlEnum,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/mysql-core';
import { teacherAssignments } from './academic';

export const promptTemplates = mysqlTable(
  'prompt_templates',
  {
    id: int('id').autoincrement().primaryKey(),
    kode: varchar('kode', { length: 80 }).notNull(),
    nama: varchar('nama', { length: 180 }).notNull(),
    kategori: mysqlEnum('kategori', ['UMUM', 'KEJURUAN', 'PKL', 'UKK']).notNull(),
    kurikulumAcuan: mysqlEnum('kurikulum_acuan', [
      'K13',
      'MERDEKA',
      'BOTH',
    ]).notNull(),
    inputSchemaJson: json('input_schema_json').notNull(),
    templateBody: text('template_body').notNull(),
    outputStructure: text('output_structure').notNull(),
    validationChecklistJson: json('validation_checklist_json').notNull(),
    version: int('version').notNull().default(1),
    status: mysqlEnum('status', ['AKTIF', 'ARSIP']).notNull().default('AKTIF'),
  },
  (t) => [uniqueIndex('uq_prompt_template_kode').on(t.kode)],
);

export const teacherDocuments = mysqlTable('teacher_documents', {
  id: int('id').autoincrement().primaryKey(),
  teacherAssignmentId: int('teacher_assignment_id')
    .notNull()
    .references(() => teacherAssignments.id, { onDelete: 'restrict' }),
  templateId: int('template_id')
    .notNull()
    .references(() => promptTemplates.id, { onDelete: 'restrict' }),
  judul: varchar('judul', { length: 200 }).notNull(),
  konten: longtext('konten').notNull(),
  status: mysqlEnum('status', ['DRAFT', 'PUBLISHED'])
    .notNull()
    .default('DRAFT'),
  generatedAt: timestamp('generated_at'),
  pastedAt: timestamp('pasted_at'),
  publishedAt: timestamp('published_at'),
  validationJson: json('validation_json').notNull(),
});
