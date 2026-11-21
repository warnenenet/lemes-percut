CREATE TABLE `academic_years` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tahun_ajaran` varchar(20) NOT NULL,
	`semester` enum('GANJIL','GENAP') NOT NULL,
	`tanggal_mulai` date NOT NULL,
	`tanggal_selesai` date NOT NULL,
	`is_active` boolean NOT NULL DEFAULT false,
	CONSTRAINT `academic_years_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_academic_year_sem` UNIQUE(`tahun_ajaran`,`semester`)
);
--> statement-breakpoint
CREATE TABLE `curricula` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kode` enum('K13','MERDEKA') NOT NULL,
	`deskripsi` varchar(255) NOT NULL,
	CONSTRAINT `curricula_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_curricula_kode` UNIQUE(`kode`)
);
--> statement-breakpoint
CREATE TABLE `majors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kode` varchar(16) NOT NULL,
	`nama` varchar(140) NOT NULL,
	CONSTRAINT `majors_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_majors_kode` UNIQUE(`kode`)
);
--> statement-breakpoint
CREATE TABLE `rombels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tingkat` int NOT NULL,
	`major_id` int NOT NULL,
	`academic_year_id` int NOT NULL,
	`kurikulum_acuan` enum('K13','MERDEKA') NOT NULL,
	`nama_rombel` varchar(48) NOT NULL,
	`wali_kelas_id` int,
	CONSTRAINT `rombels_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_rombel_year` UNIQUE(`nama_rombel`,`academic_year_id`)
);
--> statement-breakpoint
CREATE TABLE `schools` (
	`id` int AUTO_INCREMENT NOT NULL,
	`npsn` varchar(20) NOT NULL,
	`nama` varchar(160) NOT NULL,
	`alamat` text NOT NULL,
	`kepala_sekolah` varchar(120) NOT NULL,
	`telepon` varchar(32) NOT NULL,
	`email` varchar(120) NOT NULL,
	`logo_url` varchar(255) NOT NULL,
	CONSTRAINT `schools_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_schools_npsn` UNIQUE(`npsn`)
);
--> statement-breakpoint
CREATE TABLE `bk_class_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bk_id` int NOT NULL,
	`rombel_id` int NOT NULL,
	CONSTRAINT `bk_class_assignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_bk_rombel` UNIQUE(`bk_id`,`rombel_id`)
);
--> statement-breakpoint
CREATE TABLE `bk_counselors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	CONSTRAINT `bk_counselors_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_bk_user` UNIQUE(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`nisn` varchar(20) NOT NULL,
	`nis` varchar(20) NOT NULL,
	`rombel_id` int NOT NULL,
	`jenis_kelamin` enum('L','P') NOT NULL,
	`tanggal_lahir` date NOT NULL,
	`status` enum('AKTIF','PKL','ALUMNI') NOT NULL DEFAULT 'AKTIF',
	CONSTRAINT `students_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_students_user` UNIQUE(`user_id`),
	CONSTRAINT `uq_students_nisn` UNIQUE(`nisn`)
);
--> statement-breakpoint
CREATE TABLE `teachers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`nuptk` varchar(32) NOT NULL,
	`nip` varchar(32) NOT NULL DEFAULT '',
	`bidang` varchar(140) NOT NULL,
	CONSTRAINT `teachers_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_teachers_user` UNIQUE(`user_id`),
	CONSTRAINT `uq_teachers_nuptk` UNIQUE(`nuptk`)
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`role` enum('ADMIN','KEPALA_SEKOLAH','WAKASEK','GURU_MAPEL','GURU_BK','WALI_KELAS','SISWA') NOT NULL,
	CONSTRAINT `user_roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_user_role` UNIQUE(`user_id`,`role`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nama` varchar(140) NOT NULL,
	`email` varchar(160) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`role` enum('ADMIN','KEPALA_SEKOLAH','WAKASEK','GURU_MAPEL','GURU_BK','WALI_KELAS','SISWA') NOT NULL,
	`status` enum('AKTIF','NONAKTIF') NOT NULL DEFAULT 'AKTIF',
	`last_login_at` timestamp,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_users_email` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kode` varchar(24) NOT NULL,
	`nama` varchar(140) NOT NULL,
	`kelompok` enum('UMUM','KEJURUAN','PKL','UKK') NOT NULL,
	CONSTRAINT `subjects_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_subjects_kode` UNIQUE(`kode`)
);
--> statement-breakpoint
CREATE TABLE `teacher_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teacher_id` int NOT NULL,
	`subject_id` int NOT NULL,
	`rombel_id` int NOT NULL,
	`academic_year_id` int NOT NULL,
	`semester` enum('GANJIL','GENAP') NOT NULL,
	`kurikulum_acuan` enum('K13','MERDEKA') NOT NULL,
	`jam_per_minggu` int NOT NULL DEFAULT 2,
	`status` enum('AKTIF','NONAKTIF') NOT NULL DEFAULT 'AKTIF',
	CONSTRAINT `teacher_assignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_teacher_assignment` UNIQUE(`teacher_id`,`subject_id`,`rombel_id`,`academic_year_id`,`semester`)
);
--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_id` int,
	`teacher_assignment_id` int NOT NULL,
	`judul` varchar(200) NOT NULL,
	`deskripsi` text NOT NULL,
	`deadline` timestamp NOT NULL,
	`tipe` enum('PR','TUGAS','PROYEK','PRAKTIK') NOT NULL,
	`rubrik` text,
	`cloned_from` int,
	CONSTRAINT `assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attendance_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_id` int NOT NULL,
	`student_id` int NOT NULL,
	`status` enum('HADIR','AKSES_TANPA_AKTIVITAS','IZIN','SAKIT','ALPA') NOT NULL,
	`aktivitas_minimum_terpenuhi` boolean NOT NULL DEFAULT false,
	`read_pct` int NOT NULL DEFAULT 0,
	`submitted_task` boolean NOT NULL DEFAULT false,
	`submitted_reflection` boolean NOT NULL DEFAULT false,
	`diakses_pada` timestamp,
	`diaktifkan_pada` timestamp,
	`override_oleh` int,
	`alasan_override` text,
	CONSTRAINT `attendance_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_session_student` UNIQUE(`session_id`,`student_id`)
);
--> statement-breakpoint
CREATE TABLE `modules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teacher_assignment_id` int NOT NULL,
	`judul` varchar(200) NOT NULL,
	`konten` longtext NOT NULL,
	`status` enum('DRAFT','PUBLISHED') NOT NULL DEFAULT 'DRAFT',
	`cloned_from` int,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `modules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teacher_assignment_id` int NOT NULL,
	`pertemuan_ke` int NOT NULL,
	`tanggal` date NOT NULL,
	`jam_mulai` varchar(8) NOT NULL,
	`jam_selesai` varchar(8) NOT NULL,
	`tipe_sesi` enum('TEORI','PRAKTIK','TUGAS') NOT NULL DEFAULT 'TEORI',
	`topik` varchar(220) NOT NULL,
	`module_id` int,
	`minimum_read_pct` int NOT NULL DEFAULT 60,
	`status` enum('DRAFT','OPEN','CLOSED') NOT NULL DEFAULT 'DRAFT',
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assignment_id` int NOT NULL,
	`student_id` int NOT NULL,
	`file_url` varchar(255),
	`teks` longtext,
	`submitted_at` timestamp NOT NULL DEFAULT (now()),
	`nilai` decimal(5,2),
	`dinilai_oleh` int,
	`catatan_guru` text,
	CONSTRAINT `submissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_assignment_student` UNIQUE(`assignment_id`,`student_id`)
);
--> statement-breakpoint
CREATE TABLE `notebook_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`notebook_id` int NOT NULL,
	`judul` varchar(180) NOT NULL,
	`konten` longtext NOT NULL,
	`gambar_url` varchar(255),
	`komentar_guru` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notebook_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notebooks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`student_id` int NOT NULL,
	`subject_id` int NOT NULL,
	`teacher_assignment_id` int NOT NULL,
	CONSTRAINT `notebooks_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_notebook_student_assignment` UNIQUE(`student_id`,`teacher_assignment_id`)
);
--> statement-breakpoint
CREATE TABLE `erapor_column_mappings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`academic_year_id` int NOT NULL,
	`mapel_id` int,
	`template_name` varchar(160) NOT NULL,
	`mapping_json` json NOT NULL,
	`template_file_url` varchar(255),
	`created_by` int NOT NULL,
	CONSTRAINT `erapor_column_mappings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `final_grades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`student_id` int NOT NULL,
	`teacher_assignment_id` int NOT NULL,
	`nilai_akhir` decimal(5,2) NOT NULL,
	`predikat` varchar(48) NOT NULL,
	CONSTRAINT `final_grades_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_final_grade_student_ta` UNIQUE(`student_id`,`teacher_assignment_id`)
);
--> statement-breakpoint
CREATE TABLE `grade_components` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teacher_assignment_id` int NOT NULL,
	`nama` enum('FORMATIF','SUMATIF','PRAKTIK','PROYEK','REMEDIAL') NOT NULL,
	`bobot` decimal(5,2) NOT NULL,
	CONSTRAINT `grade_components_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `grades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`student_id` int NOT NULL,
	`teacher_assignment_id` int NOT NULL,
	`component_id` int NOT NULL,
	`nilai` decimal(5,2) NOT NULL,
	`catatan` text,
	CONSTRAINT `grades_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_student_component` UNIQUE(`student_id`,`component_id`)
);
--> statement-breakpoint
CREATE TABLE `exam_answers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`exam_session_id` int NOT NULL,
	`question_id` int NOT NULL,
	`jawaban_json` json NOT NULL,
	`skor` decimal(5,2),
	`disimpan_pada` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exam_answers_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_session_question` UNIQUE(`exam_session_id`,`question_id`)
);
--> statement-breakpoint
CREATE TABLE `exam_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`exam_id` int NOT NULL,
	`student_id` int NOT NULL,
	`status` enum('TERJADWAL','MENGERJAKAN','SELESAI','TIDAK_HADIR','SUSULAN') NOT NULL DEFAULT 'TERJADWAL',
	`started_at` timestamp,
	`finished_at` timestamp,
	`tab_switch_count` int NOT NULL DEFAULT 0,
	CONSTRAINT `exam_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_exam_student` UNIQUE(`exam_id`,`student_id`)
);
--> statement-breakpoint
CREATE TABLE `exams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teacher_assignment_id` int NOT NULL,
	`tipe` enum('MID','FINAL','CUSTOM','SUSULAN') NOT NULL,
	`judul` varchar(200) NOT NULL,
	`waktu_mulai` timestamp NOT NULL,
	`durasi_menit` int NOT NULL,
	`token` varchar(16) NOT NULL,
	`status` enum('DRAFT','TERJADWAL','AKTIF','SELESAI') NOT NULL DEFAULT 'DRAFT',
	`parent_exam_id` int,
	CONSTRAINT `exams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `question_banks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subject_id` int NOT NULL,
	`teacher_id` int NOT NULL,
	`judul` varchar(200) NOT NULL,
	`kurikulum_acuan` enum('K13','MERDEKA') NOT NULL,
	CONSTRAINT `question_banks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bank_id` int NOT NULL,
	`tipe` enum('PG','PG_KOMPLEKS','BENAR_SALAH','MENJODOHKAN','ISIAN','URAIAN') NOT NULL,
	`stem` text NOT NULL,
	`options_json` json NOT NULL,
	`jawaban_json` json NOT NULL,
	`rubrik` text,
	`skor` decimal(5,2) NOT NULL,
	`level_kognitif` varchar(8) NOT NULL,
	CONSTRAINT `questions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dudis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nama` varchar(160) NOT NULL,
	`alamat` text NOT NULL,
	`bidang` varchar(140) NOT NULL,
	`kontak` varchar(120) NOT NULL,
	CONSTRAINT `dudis_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mapel_pkl_contributions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`student_id` int NOT NULL,
	`subject_id` int NOT NULL,
	`nilai` decimal(5,2) NOT NULL,
	`guru_id` int NOT NULL,
	`catatan` text,
	CONSTRAINT `mapel_pkl_contributions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pkl_journals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`placement_id` int NOT NULL,
	`tanggal` date NOT NULL,
	`aktivitas` text NOT NULL,
	`validasi_bk` boolean NOT NULL DEFAULT false,
	`catatan_bk` text,
	CONSTRAINT `pkl_journals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pkl_placements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`student_id` int NOT NULL,
	`dudi_id` int NOT NULL,
	`pks_id` int NOT NULL,
	`pembimbing_bk_id` int NOT NULL,
	`pembimbing_dudi_nama` varchar(140) NOT NULL,
	`periode_mulai` date NOT NULL,
	`periode_selesai` date NOT NULL,
	`status` enum('BERJALAN','SELESAI','PERLU_PEMBINAAN') NOT NULL DEFAULT 'BERJALAN',
	CONSTRAINT `pkl_placements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pkl_scores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`placement_id` int NOT NULL,
	`komponen` enum('DUDI_HARD','DUDI_SOFT','DUDI_DISIPLIN','SEKOLAH_LAPORAN','SEKOLAH_SIDANG') NOT NULL,
	`nilai` decimal(5,2) NOT NULL,
	`dinilai_oleh` int NOT NULL,
	CONSTRAINT `pkl_scores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pks_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dudi_id` int NOT NULL,
	`nomor` varchar(80) NOT NULL,
	`tanggal_mulai` date NOT NULL,
	`tanggal_selesai` date NOT NULL,
	`file_url` varchar(255) NOT NULL,
	CONSTRAINT `pks_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prompt_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kode` varchar(80) NOT NULL,
	`nama` varchar(180) NOT NULL,
	`kategori` enum('UMUM','KEJURUAN','PKL','UKK') NOT NULL,
	`kurikulum_acuan` enum('K13','MERDEKA','BOTH') NOT NULL,
	`input_schema_json` json NOT NULL,
	`template_body` text NOT NULL,
	`output_structure` text NOT NULL,
	`validation_checklist_json` json NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`status` enum('AKTIF','ARSIP') NOT NULL DEFAULT 'AKTIF',
	CONSTRAINT `prompt_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_prompt_template_kode` UNIQUE(`kode`)
);
--> statement-breakpoint
CREATE TABLE `teacher_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teacher_assignment_id` int NOT NULL,
	`template_id` int NOT NULL,
	`judul` varchar(200) NOT NULL,
	`konten` longtext NOT NULL,
	`status` enum('DRAFT','PUBLISHED') NOT NULL DEFAULT 'DRAFT',
	`generated_at` timestamp,
	`pasted_at` timestamp,
	`published_at` timestamp,
	`validation_json` json NOT NULL,
	CONSTRAINT `teacher_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`aksi` varchar(80) NOT NULL,
	`entitas` varchar(64) NOT NULL,
	`entitas_id` varchar(64) NOT NULL,
	`before_json` json,
	`after_json` json,
	`ip` varchar(48) NOT NULL DEFAULT '127.0.0.1',
	`user_agent` varchar(255) NOT NULL DEFAULT 'web',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `coaching_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`author_user_id` int NOT NULL,
	`target_type` enum('SISWA','GURU') NOT NULL,
	`target_id` int NOT NULL,
	`judul` varchar(180) NOT NULL,
	`catatan` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coaching_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tipe` enum('SISWA','GURU','NILAI','TEACHER_ASSIGNMENT') NOT NULL,
	`file_url` varchar(255) NOT NULL,
	`status` enum('SELESAI','SEBAGIAN_ERROR','GAGAL') NOT NULL,
	`total_baris` int NOT NULL DEFAULT 0,
	`baris_sukses` int NOT NULL DEFAULT 0,
	`baris_error` int NOT NULL DEFAULT 0,
	`error_log_json` json NOT NULL,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `import_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`tipe` enum('INFO','PERINGATAN','AKADEMIK','PEMBINAAN') NOT NULL,
	`judul` varchar(180) NOT NULL,
	`pesan` text NOT NULL,
	`entitas` varchar(64) NOT NULL,
	`entitas_id` varchar(64) NOT NULL,
	`dibaca_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` varchar(96) NOT NULL,
	`value` text NOT NULL,
	`group` varchar(48) NOT NULL DEFAULT 'general',
	CONSTRAINT `settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `walikelas_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`student_id` int NOT NULL,
	`catatan` text NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `walikelas_notes_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_walikelas_student` UNIQUE(`student_id`)
);
--> statement-breakpoint
ALTER TABLE `rombels` ADD CONSTRAINT `rombels_major_id_majors_id_fk` FOREIGN KEY (`major_id`) REFERENCES `majors`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rombels` ADD CONSTRAINT `rombels_academic_year_id_academic_years_id_fk` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bk_class_assignments` ADD CONSTRAINT `bk_class_assignments_bk_id_bk_counselors_id_fk` FOREIGN KEY (`bk_id`) REFERENCES `bk_counselors`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bk_class_assignments` ADD CONSTRAINT `bk_class_assignments_rombel_id_rombels_id_fk` FOREIGN KEY (`rombel_id`) REFERENCES `rombels`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bk_counselors` ADD CONSTRAINT `bk_counselors_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `students` ADD CONSTRAINT `students_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `students` ADD CONSTRAINT `students_rombel_id_rombels_id_fk` FOREIGN KEY (`rombel_id`) REFERENCES `rombels`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `teachers` ADD CONSTRAINT `teachers_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `teacher_assignments` ADD CONSTRAINT `teacher_assignments_teacher_id_teachers_id_fk` FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `teacher_assignments` ADD CONSTRAINT `teacher_assignments_subject_id_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `teacher_assignments` ADD CONSTRAINT `teacher_assignments_rombel_id_rombels_id_fk` FOREIGN KEY (`rombel_id`) REFERENCES `rombels`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `teacher_assignments` ADD CONSTRAINT `teacher_assignments_academic_year_id_academic_years_id_fk` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_teacher_assignment_id_teacher_assignments_id_fk` FOREIGN KEY (`teacher_assignment_id`) REFERENCES `teacher_assignments`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_override_oleh_users_id_fk` FOREIGN KEY (`override_oleh`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `modules` ADD CONSTRAINT `modules_teacher_assignment_id_teacher_assignments_id_fk` FOREIGN KEY (`teacher_assignment_id`) REFERENCES `teacher_assignments`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_teacher_assignment_id_teacher_assignments_id_fk` FOREIGN KEY (`teacher_assignment_id`) REFERENCES `teacher_assignments`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_module_id_modules_id_fk` FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `submissions` ADD CONSTRAINT `submissions_assignment_id_assignments_id_fk` FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `submissions` ADD CONSTRAINT `submissions_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `submissions` ADD CONSTRAINT `submissions_dinilai_oleh_teachers_id_fk` FOREIGN KEY (`dinilai_oleh`) REFERENCES `teachers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notebook_entries` ADD CONSTRAINT `notebook_entries_notebook_id_notebooks_id_fk` FOREIGN KEY (`notebook_id`) REFERENCES `notebooks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notebooks` ADD CONSTRAINT `notebooks_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notebooks` ADD CONSTRAINT `notebooks_subject_id_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notebooks` ADD CONSTRAINT `notebooks_teacher_assignment_id_teacher_assignments_id_fk` FOREIGN KEY (`teacher_assignment_id`) REFERENCES `teacher_assignments`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `erapor_column_mappings` ADD CONSTRAINT `erapor_column_mappings_academic_year_id_academic_years_id_fk` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `erapor_column_mappings` ADD CONSTRAINT `erapor_column_mappings_mapel_id_subjects_id_fk` FOREIGN KEY (`mapel_id`) REFERENCES `subjects`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `erapor_column_mappings` ADD CONSTRAINT `erapor_column_mappings_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `final_grades` ADD CONSTRAINT `final_grades_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `final_grades` ADD CONSTRAINT `final_grades_teacher_assignment_id_teacher_assignments_id_fk` FOREIGN KEY (`teacher_assignment_id`) REFERENCES `teacher_assignments`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `grade_components` ADD CONSTRAINT `grade_components_teacher_assignment_id_teacher_assignments_id_fk` FOREIGN KEY (`teacher_assignment_id`) REFERENCES `teacher_assignments`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `grades` ADD CONSTRAINT `grades_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `grades` ADD CONSTRAINT `grades_teacher_assignment_id_teacher_assignments_id_fk` FOREIGN KEY (`teacher_assignment_id`) REFERENCES `teacher_assignments`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `grades` ADD CONSTRAINT `grades_component_id_grade_components_id_fk` FOREIGN KEY (`component_id`) REFERENCES `grade_components`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_answers` ADD CONSTRAINT `exam_answers_exam_session_id_exam_sessions_id_fk` FOREIGN KEY (`exam_session_id`) REFERENCES `exam_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_answers` ADD CONSTRAINT `exam_answers_question_id_questions_id_fk` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_sessions` ADD CONSTRAINT `exam_sessions_exam_id_exams_id_fk` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_sessions` ADD CONSTRAINT `exam_sessions_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exams` ADD CONSTRAINT `exams_teacher_assignment_id_teacher_assignments_id_fk` FOREIGN KEY (`teacher_assignment_id`) REFERENCES `teacher_assignments`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `question_banks` ADD CONSTRAINT `question_banks_subject_id_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `question_banks` ADD CONSTRAINT `question_banks_teacher_id_teachers_id_fk` FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `questions` ADD CONSTRAINT `questions_bank_id_question_banks_id_fk` FOREIGN KEY (`bank_id`) REFERENCES `question_banks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mapel_pkl_contributions` ADD CONSTRAINT `mapel_pkl_contributions_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mapel_pkl_contributions` ADD CONSTRAINT `mapel_pkl_contributions_subject_id_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mapel_pkl_contributions` ADD CONSTRAINT `mapel_pkl_contributions_guru_id_teachers_id_fk` FOREIGN KEY (`guru_id`) REFERENCES `teachers`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pkl_journals` ADD CONSTRAINT `pkl_journals_placement_id_pkl_placements_id_fk` FOREIGN KEY (`placement_id`) REFERENCES `pkl_placements`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pkl_placements` ADD CONSTRAINT `pkl_placements_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pkl_placements` ADD CONSTRAINT `pkl_placements_dudi_id_dudis_id_fk` FOREIGN KEY (`dudi_id`) REFERENCES `dudis`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pkl_placements` ADD CONSTRAINT `pkl_placements_pks_id_pks_documents_id_fk` FOREIGN KEY (`pks_id`) REFERENCES `pks_documents`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pkl_placements` ADD CONSTRAINT `pkl_placements_pembimbing_bk_id_bk_counselors_id_fk` FOREIGN KEY (`pembimbing_bk_id`) REFERENCES `bk_counselors`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pkl_scores` ADD CONSTRAINT `pkl_scores_placement_id_pkl_placements_id_fk` FOREIGN KEY (`placement_id`) REFERENCES `pkl_placements`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pkl_scores` ADD CONSTRAINT `pkl_scores_dinilai_oleh_users_id_fk` FOREIGN KEY (`dinilai_oleh`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pks_documents` ADD CONSTRAINT `pks_documents_dudi_id_dudis_id_fk` FOREIGN KEY (`dudi_id`) REFERENCES `dudis`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `teacher_documents` ADD CONSTRAINT `teacher_documents_teacher_assignment_id_teacher_assignments_id_fk` FOREIGN KEY (`teacher_assignment_id`) REFERENCES `teacher_assignments`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `teacher_documents` ADD CONSTRAINT `teacher_documents_template_id_prompt_templates_id_fk` FOREIGN KEY (`template_id`) REFERENCES `prompt_templates`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coaching_notes` ADD CONSTRAINT `coaching_notes_author_user_id_users_id_fk` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `import_batches` ADD CONSTRAINT `import_batches_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `walikelas_notes` ADD CONSTRAINT `walikelas_notes_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE cascade ON UPDATE no action;