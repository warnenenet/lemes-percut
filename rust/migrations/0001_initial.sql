-- LMS SMK Negeri 1 Percut Sei Tuan — Initial MySQL 8 Migration (43 Tables)
-- Charset: utf8mb4 | Collation: utf8mb4_unicode_ci | Engine: InnoDB

CREATE TABLE IF NOT EXISTS `academic_years` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `tahun_ajaran` VARCHAR(20) NOT NULL,
  `semester` ENUM('GANJIL','GENAP') NOT NULL,
  `tanggal_mulai` DATE NOT NULL,
  `tanggal_selesai` DATE NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT `pk_academic_years` PRIMARY KEY (`id`),
  CONSTRAINT `uq_academic_year_sem` UNIQUE (`tahun_ajaran`, `semester`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `curricula` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `kode` ENUM('K13','MERDEKA') NOT NULL,
  `deskripsi` VARCHAR(255) NOT NULL,
  CONSTRAINT `pk_curricula` PRIMARY KEY (`id`),
  CONSTRAINT `uq_curricula_kode` UNIQUE (`kode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `majors` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `kode` VARCHAR(16) NOT NULL,
  `nama` VARCHAR(140) NOT NULL,
  CONSTRAINT `pk_majors` PRIMARY KEY (`id`),
  CONSTRAINT `uq_majors_kode` UNIQUE (`kode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `schools` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `npsn` VARCHAR(20) NOT NULL,
  `nama` VARCHAR(160) NOT NULL,
  `alamat` TEXT NOT NULL,
  `kepala_sekolah` VARCHAR(120) NOT NULL,
  `telepon` VARCHAR(32) NOT NULL,
  `email` VARCHAR(120) NOT NULL,
  `logo_url` VARCHAR(255) NOT NULL,
  CONSTRAINT `pk_schools` PRIMARY KEY (`id`),
  CONSTRAINT `uq_schools_npsn` UNIQUE (`npsn`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nama` VARCHAR(140) NOT NULL,
  `email` VARCHAR(160) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('ADMIN','KEPALA_SEKOLAH','WAKASEK','GURU_MAPEL','GURU_BK','WALI_KELAS','SISWA') NOT NULL,
  `status` ENUM('AKTIF','NONAKTIF') NOT NULL DEFAULT 'AKTIF',
  `last_login_at` TIMESTAMP NULL DEFAULT NULL,
  CONSTRAINT `pk_users` PRIMARY KEY (`id`),
  CONSTRAINT `uq_users_email` UNIQUE (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_roles` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `role` ENUM('ADMIN','KEPALA_SEKOLAH','WAKASEK','GURU_MAPEL','GURU_BK','WALI_KELAS','SISWA') NOT NULL,
  CONSTRAINT `pk_user_roles` PRIMARY KEY (`id`),
  CONSTRAINT `uq_user_role` UNIQUE (`user_id`, `role`),
  CONSTRAINT `fk_user_roles_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `teachers` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `nuptk` VARCHAR(32) NOT NULL,
  `nip` VARCHAR(32) NOT NULL DEFAULT '',
  `bidang` VARCHAR(140) NOT NULL,
  CONSTRAINT `pk_teachers` PRIMARY KEY (`id`),
  CONSTRAINT `uq_teachers_user` UNIQUE (`user_id`),
  CONSTRAINT `uq_teachers_nuptk` UNIQUE (`nuptk`),
  CONSTRAINT `fk_teachers_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rombels` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `tingkat` INT NOT NULL,
  `major_id` INT NOT NULL,
  `academic_year_id` INT NOT NULL,
  `kurikulum_acuan` ENUM('K13','MERDEKA') NOT NULL,
  `nama_rombel` VARCHAR(48) NOT NULL,
  `wali_kelas_id` INT NULL DEFAULT NULL,
  CONSTRAINT `pk_rombels` PRIMARY KEY (`id`),
  CONSTRAINT `uq_rombel_year` UNIQUE (`nama_rombel`, `academic_year_id`),
  CONSTRAINT `fk_rombels_major` FOREIGN KEY (`major_id`) REFERENCES `majors`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_rombels_academic_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_rombels_wali_kelas` FOREIGN KEY (`wali_kelas_id`) REFERENCES `teachers`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `students` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `nisn` VARCHAR(20) NOT NULL,
  `nis` VARCHAR(20) NOT NULL,
  `rombel_id` INT NOT NULL,
  `jenis_kelamin` ENUM('L','P') NOT NULL,
  `tanggal_lahir` DATE NOT NULL,
  `status` ENUM('AKTIF','PKL','ALUMNI') NOT NULL DEFAULT 'AKTIF',
  CONSTRAINT `pk_students` PRIMARY KEY (`id`),
  CONSTRAINT `uq_students_user` UNIQUE (`user_id`),
  CONSTRAINT `uq_students_nisn` UNIQUE (`nisn`),
  INDEX `idx_students_rombel` (`rombel_id`),
  CONSTRAINT `fk_students_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_students_rombel` FOREIGN KEY (`rombel_id`) REFERENCES `rombels`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `bk_counselors` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  CONSTRAINT `pk_bk_counselors` PRIMARY KEY (`id`),
  CONSTRAINT `uq_bk_user` UNIQUE (`user_id`),
  CONSTRAINT `fk_bk_counselors_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `bk_class_assignments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `bk_id` INT NOT NULL,
  `rombel_id` INT NOT NULL,
  CONSTRAINT `pk_bk_class_assignments` PRIMARY KEY (`id`),
  CONSTRAINT `uq_bk_rombel` UNIQUE (`bk_id`, `rombel_id`),
  CONSTRAINT `fk_bk_class_bk` FOREIGN KEY (`bk_id`) REFERENCES `bk_counselors`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_bk_class_rombel` FOREIGN KEY (`rombel_id`) REFERENCES `rombels`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `subjects` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `kode` VARCHAR(24) NOT NULL,
  `nama` VARCHAR(140) NOT NULL,
  `kelompok` ENUM('UMUM','KEJURUAN','PKL','UKK') NOT NULL,
  CONSTRAINT `pk_subjects` PRIMARY KEY (`id`),
  CONSTRAINT `uq_subjects_kode` UNIQUE (`kode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `teacher_assignments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `teacher_id` INT NOT NULL,
  `subject_id` INT NOT NULL,
  `rombel_id` INT NOT NULL,
  `academic_year_id` INT NOT NULL,
  `semester` ENUM('GANJIL','GENAP') NOT NULL,
  `kurikulum_acuan` ENUM('K13','MERDEKA') NOT NULL,
  `jam_per_minggu` INT NOT NULL DEFAULT 2,
  `status` ENUM('AKTIF','NONAKTIF') NOT NULL DEFAULT 'AKTIF',
  CONSTRAINT `pk_teacher_assignments` PRIMARY KEY (`id`),
  CONSTRAINT `uq_teacher_assignment` UNIQUE (`teacher_id`, `subject_id`, `rombel_id`, `academic_year_id`, `semester`),
  INDEX `idx_ta_rombel` (`rombel_id`),
  CONSTRAINT `fk_ta_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_ta_subject` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_ta_rombel` FOREIGN KEY (`rombel_id`) REFERENCES `rombels`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_ta_academic_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `modules` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `teacher_assignment_id` INT NOT NULL,
  `judul` VARCHAR(200) NOT NULL,
  `konten` LONGTEXT NOT NULL,
  `status` ENUM('DRAFT','PUBLISHED') NOT NULL DEFAULT 'DRAFT',
  `cloned_from` INT NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pk_modules` PRIMARY KEY (`id`),
  CONSTRAINT `fk_modules_ta` FOREIGN KEY (`teacher_assignment_id`) REFERENCES `teacher_assignments`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sessions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `teacher_assignment_id` INT NOT NULL,
  `pertemuan_ke` INT NOT NULL,
  `tanggal` DATE NOT NULL,
  `jam_mulai` VARCHAR(8) NOT NULL,
  `jam_selesai` VARCHAR(8) NOT NULL,
  `tipe_sesi` ENUM('TEORI','PRAKTIK','TUGAS') NOT NULL DEFAULT 'TEORI',
  `topik` VARCHAR(220) NOT NULL,
  `module_id` INT NULL DEFAULT NULL,
  `minimum_read_pct` INT NOT NULL DEFAULT 60,
  `status` ENUM('DRAFT','OPEN','CLOSED') NOT NULL DEFAULT 'DRAFT',
  CONSTRAINT `pk_sessions` PRIMARY KEY (`id`),
  INDEX `idx_sessions_ta` (`teacher_assignment_id`),
  CONSTRAINT `fk_sessions_ta` FOREIGN KEY (`teacher_assignment_id`) REFERENCES `teacher_assignments`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_sessions_module` FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `attendance_records` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `session_id` INT NOT NULL,
  `student_id` INT NOT NULL,
  `status` ENUM('HADIR','AKSES_TANPA_AKTIVITAS','IZIN','SAKIT','ALPA') NOT NULL,
  `aktivitas_minimum_terpenuhi` BOOLEAN NOT NULL DEFAULT FALSE,
  `read_pct` INT NOT NULL DEFAULT 0,
  `submitted_task` BOOLEAN NOT NULL DEFAULT FALSE,
  `submitted_reflection` BOOLEAN NOT NULL DEFAULT FALSE,
  `diakses_pada` TIMESTAMP NULL DEFAULT NULL,
  `diaktifkan_pada` TIMESTAMP NULL DEFAULT NULL,
  `override_oleh` INT NULL DEFAULT NULL,
  `alasan_override` TEXT NULL,
  CONSTRAINT `pk_attendance_records` PRIMARY KEY (`id`),
  CONSTRAINT `uq_session_student` UNIQUE (`session_id`, `student_id`),
  CONSTRAINT `fk_attendance_session` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_attendance_student` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_attendance_override_user` FOREIGN KEY (`override_oleh`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `assignments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `session_id` INT NULL DEFAULT NULL,
  `teacher_assignment_id` INT NOT NULL,
  `judul` VARCHAR(200) NOT NULL,
  `deskripsi` TEXT NOT NULL,
  `deadline` TIMESTAMP NOT NULL,
  `tipe` ENUM('PR','TUGAS','PROYEK','PRAKTIK') NOT NULL,
  `rubrik` TEXT NULL,
  `cloned_from` INT NULL DEFAULT NULL,
  CONSTRAINT `pk_assignments` PRIMARY KEY (`id`),
  CONSTRAINT `fk_assignments_session` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT `fk_assignments_ta` FOREIGN KEY (`teacher_assignment_id`) REFERENCES `teacher_assignments`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `submissions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `assignment_id` INT NOT NULL,
  `student_id` INT NOT NULL,
  `file_url` VARCHAR(255) NULL DEFAULT NULL,
  `teks` LONGTEXT NULL,
  `submitted_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `nilai` DECIMAL(5,2) NULL DEFAULT NULL,
  `dinilai_oleh` INT NULL DEFAULT NULL,
  `catatan_guru` TEXT NULL,
  CONSTRAINT `pk_submissions` PRIMARY KEY (`id`),
  CONSTRAINT `uq_assignment_student` UNIQUE (`assignment_id`, `student_id`),
  CONSTRAINT `fk_submissions_assignment` FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_submissions_student` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_submissions_teacher` FOREIGN KEY (`dinilai_oleh`) REFERENCES `teachers`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notebooks` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `student_id` INT NOT NULL,
  `subject_id` INT NOT NULL,
  `teacher_assignment_id` INT NOT NULL,
  CONSTRAINT `pk_notebooks` PRIMARY KEY (`id`),
  CONSTRAINT `uq_notebook_student_assignment` UNIQUE (`student_id`, `teacher_assignment_id`),
  CONSTRAINT `fk_notebooks_student` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_notebooks_subject` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_notebooks_ta` FOREIGN KEY (`teacher_assignment_id`) REFERENCES `teacher_assignments`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notebook_entries` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `notebook_id` INT NOT NULL,
  `judul` VARCHAR(180) NOT NULL,
  `konten` LONGTEXT NOT NULL,
  `gambar_url` VARCHAR(255) NULL DEFAULT NULL,
  `komentar_guru` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pk_notebook_entries` PRIMARY KEY (`id`),
  CONSTRAINT `fk_notebook_entries_nb` FOREIGN KEY (`notebook_id`) REFERENCES `notebooks`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `erapor_column_mappings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `academic_year_id` INT NOT NULL,
  `mapel_id` INT NULL DEFAULT NULL,
  `template_name` VARCHAR(160) NOT NULL,
  `mapping_json` JSON NOT NULL,
  `template_file_url` VARCHAR(255) NULL DEFAULT NULL,
  `created_by` INT NOT NULL,
  CONSTRAINT `pk_erapor_column_mappings` PRIMARY KEY (`id`),
  CONSTRAINT `fk_erapor_ay` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_erapor_mapel` FOREIGN KEY (`mapel_id`) REFERENCES `subjects`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT `fk_erapor_created_by` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `grade_components` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `teacher_assignment_id` INT NOT NULL,
  `nama` ENUM('FORMATIF','SUMATIF','PRAKTIK','PROYEK','REMEDIAL') NOT NULL,
  `bobot` DECIMAL(5,2) NOT NULL,
  CONSTRAINT `pk_grade_components` PRIMARY KEY (`id`),
  CONSTRAINT `uq_gc_ta_nama` UNIQUE (`teacher_assignment_id`, `nama`),
  CONSTRAINT `fk_gc_ta` FOREIGN KEY (`teacher_assignment_id`) REFERENCES `teacher_assignments`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `grades` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `student_id` INT NOT NULL,
  `teacher_assignment_id` INT NOT NULL,
  `component_id` INT NOT NULL,
  `nilai` DECIMAL(5,2) NOT NULL,
  `catatan` TEXT NULL,
  CONSTRAINT `pk_grades` PRIMARY KEY (`id`),
  CONSTRAINT `uq_student_component` UNIQUE (`student_id`, `component_id`),
  CONSTRAINT `fk_grades_student` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_grades_ta` FOREIGN KEY (`teacher_assignment_id`) REFERENCES `teacher_assignments`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_grades_component` FOREIGN KEY (`component_id`) REFERENCES `grade_components`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `final_grades` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `student_id` INT NOT NULL,
  `teacher_assignment_id` INT NOT NULL,
  `nilai_akhir` DECIMAL(5,2) NOT NULL,
  `predikat` VARCHAR(48) NOT NULL,
  CONSTRAINT `pk_final_grades` PRIMARY KEY (`id`),
  CONSTRAINT `uq_final_grade_student_ta` UNIQUE (`student_id`, `teacher_assignment_id`),
  CONSTRAINT `fk_final_grades_student` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_final_grades_ta` FOREIGN KEY (`teacher_assignment_id`) REFERENCES `teacher_assignments`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `question_banks` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `subject_id` INT NOT NULL,
  `teacher_id` INT NOT NULL,
  `judul` VARCHAR(200) NOT NULL,
  `kurikulum_acuan` ENUM('K13','MERDEKA') NOT NULL,
  CONSTRAINT `pk_question_banks` PRIMARY KEY (`id`),
  CONSTRAINT `fk_qb_subject` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_qb_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `questions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `bank_id` INT NOT NULL,
  `tipe` ENUM('PG','PG_KOMPLEKS','BENAR_SALAH','MENJODOHKAN','ISIAN','URAIAN') NOT NULL,
  `stem` TEXT NOT NULL,
  `options_json` JSON NOT NULL,
  `jawaban_json` JSON NOT NULL,
  `rubrik` TEXT NULL,
  `skor` DECIMAL(5,2) NOT NULL,
  `level_kognitif` VARCHAR(8) NOT NULL,
  CONSTRAINT `pk_questions` PRIMARY KEY (`id`),
  CONSTRAINT `fk_questions_bank` FOREIGN KEY (`bank_id`) REFERENCES `question_banks`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `exams` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `teacher_assignment_id` INT NOT NULL,
  `tipe` ENUM('MID','FINAL','CUSTOM','SUSULAN') NOT NULL,
  `judul` VARCHAR(200) NOT NULL,
  `waktu_mulai` TIMESTAMP NOT NULL,
  `durasi_menit` INT NOT NULL,
  `token` VARCHAR(16) NOT NULL,
  `status` ENUM('DRAFT','TERJADWAL','AKTIF','SELESAI') NOT NULL DEFAULT 'DRAFT',
  `parent_exam_id` INT NULL DEFAULT NULL,
  `target_student_ids_json` JSON NULL,
  CONSTRAINT `pk_exams` PRIMARY KEY (`id`),
  INDEX `idx_exams_waktu` (`waktu_mulai`),
  CONSTRAINT `fk_exams_ta` FOREIGN KEY (`teacher_assignment_id`) REFERENCES `teacher_assignments`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `exam_sessions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `exam_id` INT NOT NULL,
  `student_id` INT NOT NULL,
  `status` ENUM('TERJADWAL','MENGERJAKAN','SELESAI','TIDAK_HADIR','SUSULAN') NOT NULL DEFAULT 'TERJADWAL',
  `started_at` TIMESTAMP NULL DEFAULT NULL,
  `finished_at` TIMESTAMP NULL DEFAULT NULL,
  `tab_switch_count` INT NOT NULL DEFAULT 0,
  CONSTRAINT `pk_exam_sessions` PRIMARY KEY (`id`),
  CONSTRAINT `uq_exam_student` UNIQUE (`exam_id`, `student_id`),
  CONSTRAINT `fk_exam_sessions_exam` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_exam_sessions_student` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `exam_answers` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `exam_session_id` INT NOT NULL,
  `question_id` INT NOT NULL,
  `jawaban_json` JSON NOT NULL,
  `skor` DECIMAL(5,2) NULL DEFAULT NULL,
  `disimpan_pada` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pk_exam_answers` PRIMARY KEY (`id`),
  CONSTRAINT `uq_session_question` UNIQUE (`exam_session_id`, `question_id`),
  CONSTRAINT `fk_exam_answers_session` FOREIGN KEY (`exam_session_id`) REFERENCES `exam_sessions`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `fk_exam_answers_question` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `dudis` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nama` VARCHAR(160) NOT NULL,
  `alamat` TEXT NOT NULL,
  `bidang` VARCHAR(140) NOT NULL,
  `kontak` VARCHAR(120) NOT NULL,
  CONSTRAINT `pk_dudis` PRIMARY KEY (`id`),
  CONSTRAINT `uq_dudis_nama` UNIQUE (`nama`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pks_documents` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `dudi_id` INT NOT NULL,
  `nomor` VARCHAR(80) NOT NULL,
  `tanggal_mulai` DATE NOT NULL,
  `tanggal_selesai` DATE NOT NULL,
  `file_url` VARCHAR(255) NOT NULL,
  CONSTRAINT `pk_pks_documents` PRIMARY KEY (`id`),
  CONSTRAINT `uq_pks_nomor` UNIQUE (`nomor`),
  CONSTRAINT `fk_pks_dudi` FOREIGN KEY (`dudi_id`) REFERENCES `dudis`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pkl_placements` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `student_id` INT NOT NULL,
  `dudi_id` INT NOT NULL,
  `pks_id` INT NOT NULL,
  `pembimbing_bk_id` INT NOT NULL,
  `pembimbing_dudi_nama` VARCHAR(140) NOT NULL,
  `periode_mulai` DATE NOT NULL,
  `periode_selesai` DATE NOT NULL,
  `status` ENUM('BERJALAN','SELESAI','PERLU_PEMBINAAN') NOT NULL DEFAULT 'BERJALAN',
  CONSTRAINT `pk_pkl_placements` PRIMARY KEY (`id`),
  CONSTRAINT `uq_pkl_student_dudi` UNIQUE (`student_id`, `dudi_id`),
  CONSTRAINT `fk_pkl_student` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_pkl_dudi` FOREIGN KEY (`dudi_id`) REFERENCES `dudis`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_pkl_pks` FOREIGN KEY (`pks_id`) REFERENCES `pks_documents`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_pkl_bk` FOREIGN KEY (`pembimbing_bk_id`) REFERENCES `bk_counselors`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pkl_journals` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `placement_id` INT NOT NULL,
  `tanggal` DATE NOT NULL,
  `aktivitas` TEXT NOT NULL,
  `validasi_bk` BOOLEAN NOT NULL DEFAULT FALSE,
  `catatan_bk` TEXT NULL,
  CONSTRAINT `pk_pkl_journals` PRIMARY KEY (`id`),
  CONSTRAINT `fk_pkl_journals_placement` FOREIGN KEY (`placement_id`) REFERENCES `pkl_placements`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pkl_scores` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `placement_id` INT NOT NULL,
  `komponen` ENUM('DUDI_HARD','DUDI_SOFT','DUDI_DISIPLIN','SEKOLAH_LAPORAN','SEKOLAH_SIDANG') NOT NULL,
  `nilai` DECIMAL(5,2) NOT NULL,
  `dinilai_oleh` INT NOT NULL,
  CONSTRAINT `pk_pkl_scores` PRIMARY KEY (`id`),
  CONSTRAINT `uq_pkl_score_comp` UNIQUE (`placement_id`, `komponen`),
  CONSTRAINT `fk_pkl_scores_placement` FOREIGN KEY (`placement_id`) REFERENCES `pkl_placements`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_pkl_scores_user` FOREIGN KEY (`dinilai_oleh`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mapel_pkl_contributions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `student_id` INT NOT NULL,
  `subject_id` INT NOT NULL,
  `nilai` DECIMAL(5,2) NOT NULL,
  `guru_id` INT NOT NULL,
  `catatan` TEXT NULL,
  CONSTRAINT `pk_mapel_pkl_contributions` PRIMARY KEY (`id`),
  CONSTRAINT `uq_mapel_pkl_stu_sub` UNIQUE (`student_id`, `subject_id`, `guru_id`),
  CONSTRAINT `fk_mapel_pkl_student` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_mapel_pkl_subject` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_mapel_pkl_teacher` FOREIGN KEY (`guru_id`) REFERENCES `teachers`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `prompt_templates` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `kode` VARCHAR(80) NOT NULL,
  `nama` VARCHAR(180) NOT NULL,
  `kategori` ENUM('UMUM','KEJURUAN','PKL','UKK') NOT NULL,
  `kurikulum_acuan` ENUM('K13','MERDEKA','BOTH') NOT NULL,
  `input_schema_json` JSON NOT NULL,
  `template_body` TEXT NOT NULL,
  `output_structure` TEXT NOT NULL,
  `validation_checklist_json` JSON NOT NULL,
  `version` INT NOT NULL DEFAULT 1,
  `status` ENUM('AKTIF','ARSIP') NOT NULL DEFAULT 'AKTIF',
  CONSTRAINT `pk_prompt_templates` PRIMARY KEY (`id`),
  CONSTRAINT `uq_prompt_template_kode` UNIQUE (`kode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `teacher_documents` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `teacher_assignment_id` INT NOT NULL,
  `template_id` INT NOT NULL,
  `judul` VARCHAR(200) NOT NULL,
  `konten` LONGTEXT NOT NULL,
  `generated_prompt` LONGTEXT NULL,
  `status` ENUM('DRAFT','PUBLISHED') NOT NULL DEFAULT 'DRAFT',
  `generated_at` TIMESTAMP NULL DEFAULT NULL,
  `pasted_at` TIMESTAMP NULL DEFAULT NULL,
  `published_at` TIMESTAMP NULL DEFAULT NULL,
  `validation_json` JSON NOT NULL,
  CONSTRAINT `pk_teacher_documents` PRIMARY KEY (`id`),
  CONSTRAINT `fk_tdoc_ta` FOREIGN KEY (`teacher_assignment_id`) REFERENCES `teacher_assignments`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT `fk_tdoc_tpl` FOREIGN KEY (`template_id`) REFERENCES `prompt_templates`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `aksi` VARCHAR(80) NOT NULL,
  `entitas` VARCHAR(64) NOT NULL,
  `entitas_id` VARCHAR(64) NOT NULL,
  `before_json` JSON NULL,
  `after_json` JSON NULL,
  `ip` VARCHAR(48) NOT NULL DEFAULT '127.0.0.1',
  `user_agent` VARCHAR(255) NOT NULL DEFAULT 'web',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `pk_audit_logs` PRIMARY KEY (`id`),
  INDEX `idx_audit_created` (`created_at`),
  CONSTRAINT `fk_audit_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `coaching_notes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `author_user_id` INT NOT NULL,
  `target_type` ENUM('SISWA','GURU') NOT NULL,
  `target_id` INT NOT NULL,
  `judul` VARCHAR(180) NOT NULL,
  `catatan` TEXT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `pk_coaching_notes` PRIMARY KEY (`id`),
  CONSTRAINT `fk_coaching_author` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `import_batches` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `tipe` ENUM('SISWA','GURU','NILAI','TEACHER_ASSIGNMENT') NOT NULL,
  `file_url` VARCHAR(255) NOT NULL,
  `status` ENUM('SELESAI','SEBAGIAN_ERROR','GAGAL') NOT NULL,
  `total_baris` INT NOT NULL DEFAULT 0,
  `baris_sukses` INT NOT NULL DEFAULT 0,
  `baris_error` INT NOT NULL DEFAULT 0,
  `error_log_json` JSON NOT NULL,
  `created_by` INT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `pk_import_batches` PRIMARY KEY (`id`),
  CONSTRAINT `fk_import_batches_user` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `tipe` ENUM('INFO','PERINGATAN','AKADEMIK','PEMBINAAN') NOT NULL,
  `judul` VARCHAR(180) NOT NULL,
  `pesan` TEXT NOT NULL,
  `entitas` VARCHAR(64) NOT NULL,
  `entitas_id` VARCHAR(64) NOT NULL,
  `dibaca_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `pk_notifications` PRIMARY KEY (`id`),
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `settings` (
  `key` VARCHAR(96) NOT NULL,
  `value` TEXT NOT NULL,
  `group` VARCHAR(48) NOT NULL DEFAULT 'general',
  CONSTRAINT `pk_settings` PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `walikelas_notes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `student_id` INT NOT NULL,
  `catatan` TEXT NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pk_walikelas_notes` PRIMARY KEY (`id`),
  CONSTRAINT `uq_walikelas_student` UNIQUE (`student_id`),
  CONSTRAINT `fk_walikelas_student` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
