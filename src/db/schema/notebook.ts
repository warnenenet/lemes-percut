import {
  mysqlTable,
  int,
  varchar,
  longtext,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/mysql-core';
import { subjects, teacherAssignments } from './academic';
import { students } from './users';

export const notebooks = mysqlTable(
  'notebooks',
  {
    id: int('id').autoincrement().primaryKey(),
    studentId: int('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    subjectId: int('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    teacherAssignmentId: int('teacher_assignment_id')
      .notNull()
      .references(() => teacherAssignments.id, { onDelete: 'restrict' }),
  },
  (t) => [
    uniqueIndex('uq_notebook_student_assignment').on(
      t.studentId,
      t.teacherAssignmentId,
    ),
  ],
);

export const notebookEntries = mysqlTable('notebook_entries', {
  id: int('id').autoincrement().primaryKey(),
  notebookId: int('notebook_id')
    .notNull()
    .references(() => notebooks.id, { onDelete: 'cascade' }),
  judul: varchar('judul', { length: 180 }).notNull(),
  konten: longtext('konten').notNull(),
  gambarUrl: varchar('gambar_url', { length: 255 }),
  komentarGuru: text('komentar_guru'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});
