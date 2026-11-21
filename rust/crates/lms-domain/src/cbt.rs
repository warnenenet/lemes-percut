use chrono::{DateTime, Duration, Utc};
use rust_decimal::Decimal;
use std::collections::HashSet;

use crate::result::{DomainError, ExamConflict};
use crate::types::{
    Exam, ExamAnswer, ExamStatus, Question, QuestionType, Rombel, Student, TeacherAssignment, User,
};

#[derive(Debug, Clone, Copy)]
pub struct ExamInterval {
    pub start_ms: i64,
    pub end_ms: i64,
}

pub fn get_exam_interval(waktu_mulai_iso: &str, durasi_menit: i64) -> Option<ExamInterval> {
    if durasi_menit <= 0 {
        return None;
    }
    let dt = DateTime::parse_from_rfc3339(waktu_mulai_iso).ok()?;
    let start_ms = dt.timestamp_millis();
    let end = dt.with_timezone(&Utc) + Duration::minutes(durasi_menit);
    Some(ExamInterval {
        start_ms,
        end_ms: end.timestamp_millis(),
    })
}

pub fn intervals_overlap(a: ExamInterval, b: ExamInterval) -> bool {
    a.start_ms < b.end_ms && b.start_ms < a.end_ms
}

pub fn resolve_exam_target_students<'a>(
    exam: &Exam,
    assignments: &[TeacherAssignment],
    students: &'a [Student],
) -> Vec<&'a Student> {
    let Some(ta) = assignments.iter().find(|a| a.id == exam.teacher_assignment_id) else {
        return Vec::new();
    };
    let rombel_students: Vec<&Student> = students
        .iter()
        .filter(|s| s.rombel_id == ta.rombel_id && s.status != "ALUMNI")
        .collect();

    if let Some(target_ids) = &exam.target_student_ids {
        if !target_ids.is_empty() {
            let allowed: HashSet<&str> = target_ids.iter().map(|id| id.0.as_str()).collect();
            return rombel_students
                .into_iter()
                .filter(|s| allowed.contains(s.id.0.as_str()))
                .collect();
        }
    }
    rombel_students
}

pub fn validate_exam_no_student_overlap(
    candidate: &Exam,
    existing_exams: &[Exam],
    assignments: &[TeacherAssignment],
    students: &[Student],
    rombels: &[Rombel],
    users: &[User],
) -> Result<(), DomainError> {
    let Some(cand_interval) = get_exam_interval(&candidate.waktu_mulai, candidate.durasi_menit)
    else {
        return Err(DomainError::validation(
            "waktu_mulai",
            "Waktu mulai atau durasi ujian tidak valid (gunakan format RFC3339).",
        ));
    };

    let candidate_students = resolve_exam_target_students(candidate, assignments, students);
    if candidate_students.is_empty() {
        return Err(DomainError::validation(
            "target_student_ids",
            "Tidak ada siswa aktif pada kelas penugasan ujian ini.",
        ));
    }

    let candidate_ids: HashSet<&str> = candidate_students.iter().map(|s| s.id.0.as_str()).collect();
    let mut conflicts: Vec<ExamConflict> = Vec::new();

    for existing in existing_exams {
        if existing.id == candidate.id || existing.status == ExamStatus::Draft {
            continue;
        }
        let Some(existing_interval) =
            get_exam_interval(&existing.waktu_mulai, existing.durasi_menit)
        else {
            continue;
        };
        if !intervals_overlap(cand_interval, existing_interval) {
            continue;
        }

        let existing_targets = resolve_exam_target_students(existing, assignments, students);
        let overlap_end_iso = DateTime::from_timestamp_millis(existing_interval.end_ms)
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_default();

        for student in existing_targets {
            if candidate_ids.contains(student.id.0.as_str()) {
                let student_name = users
                    .iter()
                    .find(|u| u.id == student.user_id)
                    .map(|u| u.nama.clone())
                    .unwrap_or_else(|| student.nisn.clone());
                let rombel_name = rombels
                    .iter()
                    .find(|r| r.id == student.rombel_id)
                    .map(|r| r.nama_rombel.clone())
                    .unwrap_or_else(|| student.rombel_id.0.clone());

                conflicts.push(ExamConflict {
                    student_id: student.id.0.clone(),
                    student_name,
                    rombel_name,
                    conflicting_exam_id: existing.id.0.clone(),
                    conflicting_exam_title: existing.judul.clone(),
                    overlap_start: existing.waktu_mulai.clone(),
                    overlap_end: overlap_end_iso.clone(),
                });
            }
        }
    }

    if !conflicts.is_empty() {
        let sample = &conflicts[0];
        return Err(DomainError::ExamOverlap {
            http_status: 409,
            message: format!(
                r#"Jadwal CBT bentrok untuk {} siswa ({} · {}) dengan ujian "{}"."#,
                conflicts.len(),
                sample.student_name,
                sample.rombel_name,
                sample.conflicting_exam_title
            ),
            conflicts,
        });
    }

    Ok(())
}

pub fn verify_exam_token(exam: &Exam, submitted_token: &str) -> Result<(), DomainError> {
    if exam.token.trim().to_uppercase() != submitted_token.trim().to_uppercase() {
        return Err(DomainError::validation(
            "token",
            "Token ujian tidak sesuai. Periksa token resmi dari guru pengampu atau pengawas.",
        ));
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExamGradeSummary {
    pub total_earned: Decimal,
    pub total_possible: Decimal,
    pub percentage: Decimal,
}

pub fn grade_student_exam_answers(
    questions: &[Question],
    answers: &[ExamAnswer],
) -> ExamGradeSummary {
    let mut total_earned = Decimal::ZERO;
    let mut total_possible = Decimal::ZERO;

    for q in questions {
        total_possible += q.skor;
        if let Some(ans) = answers.iter().find(|a| a.question_id == q.id) {
            match q.tipe {
                QuestionType::Pg | QuestionType::BenarSalah | QuestionType::Isian => {
                    if ans.jawaban.trim().to_uppercase() == q.jawaban.trim().to_uppercase() {
                        total_earned += q.skor;
                    }
                }
                _ => {
                    if let Some(manual_score) = ans.skor {
                        total_earned += manual_score;
                    }
                }
            }
        }
    }

    let percentage = if total_possible > Decimal::ZERO {
        ((total_earned / total_possible) * Decimal::new(100, 0)).round_dp(2)
    } else {
        Decimal::ZERO
    };

    ExamGradeSummary {
        total_earned: total_earned.round_dp(2),
        total_possible: total_possible.round_dp(2),
        percentage,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::*;

    #[test]
    fn detects_overlap_across_different_teachers_with_409() {
        let ta_mtk = TeacherAssignment {
            id: AssignmentId("ta-1".into()),
            teacher_id: TeacherId("tch-1".into()),
            subject_id: SubjectId("sub-mtk".into()),
            rombel_id: RombelId("rom-1".into()),
            academic_year_id: AcademicYearId("ay-1".into()),
            semester: "GENAP".into(),
            kurikulum_acuan: CurriculumTrack::Merdeka,
            jam_per_minggu: 4,
            status: "AKTIF".into(),
        };
        let ta_pbo = TeacherAssignment {
            id: AssignmentId("ta-2".into()),
            teacher_id: TeacherId("tch-2".into()),
            subject_id: SubjectId("sub-pbo".into()),
            rombel_id: RombelId("rom-1".into()),
            academic_year_id: AcademicYearId("ay-1".into()),
            semester: "GENAP".into(),
            kurikulum_acuan: CurriculumTrack::Merdeka,
            jam_per_minggu: 6,
            status: "AKTIF".into(),
        };
        let stu = Student {
            id: StudentId("stu-1".into()),
            user_id: UserId("u-s1".into()),
            nisn: "0081234501".into(),
            nis: "24001".into(),
            rombel_id: RombelId("rom-1".into()),
            jenis_kelamin: "L".into(),
            tanggal_lahir: "2008-01-01".into(),
            status: "AKTIF".into(),
        };
        let existing = Exam {
            id: ExamId("ex-1".into()),
            teacher_assignment_id: AssignmentId("ta-1".into()),
            tipe: ExamType::Mid,
            judul: "STS Matematika".into(),
            waktu_mulai: "2026-11-16T08:00:00Z".into(),
            durasi_menit: 90,
            token: "MTK123".into(),
            status: ExamStatus::Terjadwal,
            parent_exam_id: None,
            target_student_ids: None,
        };
        let candidate = Exam {
            id: ExamId("ex-2".into()),
            teacher_assignment_id: AssignmentId("ta-2".into()),
            tipe: ExamType::Custom,
            judul: "UH PBO".into(),
            waktu_mulai: "2026-11-16T08:30:00Z".into(),
            durasi_menit: 60,
            token: "PBO999".into(),
            status: ExamStatus::Terjadwal,
            parent_exam_id: None,
            target_student_ids: None,
        };

        let err = validate_exam_no_student_overlap(
            &candidate,
            &[existing.clone()],
            &[ta_mtk.clone(), ta_pbo.clone()],
            &[stu.clone()],
            &[],
            &[],
        )
        .unwrap_err();
        assert_eq!(err.http_status(), 409);

        let non_overlapping = Exam {
            waktu_mulai: "2026-11-16T10:00:00Z".into(),
            ..candidate
        };
        assert!(validate_exam_no_student_overlap(
            &non_overlapping,
            &[existing],
            &[ta_mtk, ta_pbo],
            &[stu],
            &[],
            &[],
        )
        .is_ok());
    }

    #[test]
    fn grades_cbt_answers_with_decimal_precision() {
        let questions = vec![
            Question {
                id: "q1".into(),
                bank_id: "qb-1".into(),
                tipe: QuestionType::Pg,
                stem: "2+2?".into(),
                options: vec!["3".into(), "4".into()],
                jawaban: "4".into(),
                rubrik: String::new(),
                skor: Decimal::new(25, 0),
                level_kognitif: "C2".into(),
            },
            Question {
                id: "q2".into(),
                bank_id: "qb-1".into(),
                tipe: QuestionType::BenarSalah,
                stem: "Rust memory safe?".into(),
                options: vec!["BENAR".into(), "SALAH".into()],
                jawaban: "BENAR".into(),
                rubrik: String::new(),
                skor: Decimal::new(25, 0),
                level_kognitif: "C1".into(),
            },
        ];
        let answers = vec![
            ExamAnswer {
                id: "a1".into(),
                exam_session_id: ExamSessionId("es-1".into()),
                question_id: "q1".into(),
                jawaban: "4".into(),
                skor: None,
                disimpan_pada: "2026-11-16T08:10:00Z".into(),
            },
            ExamAnswer {
                id: "a2".into(),
                exam_session_id: ExamSessionId("es-1".into()),
                question_id: "q2".into(),
                jawaban: "SALAH".into(),
                skor: None,
                disimpan_pada: "2026-11-16T08:11:00Z".into(),
            },
        ];

        let summary = grade_student_exam_answers(&questions, &answers);
        assert_eq!(summary.total_earned, Decimal::new(25, 0));
        assert_eq!(summary.total_possible, Decimal::new(50, 0));
        assert_eq!(summary.percentage, Decimal::new(50, 0));
    }
}
