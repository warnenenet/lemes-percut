use serde::Serialize;

use crate::result::DomainError;
use crate::types::{
    AssignmentId, BkClassAssignment, BkCounselor, Notebook, NotebookEntry,
    NotebookMetadataSummary, RombelId, Student, Teacher, TeacherAssignment, User, UserRole,
};

#[derive(Debug, Clone, Serialize)]
pub struct AuthContext {
    pub user: User,
    pub active_role: UserRole,
    pub teacher: Option<Teacher>,
    pub student: Option<Student>,
    pub bk_counselor: Option<BkCounselor>,
}

pub fn guard_teacher_assignment_ownership<'a>(
    ctx: &AuthContext,
    assignment: Option<&'a TeacherAssignment>,
    action_label: &str,
) -> Result<&'a TeacherAssignment, DomainError> {
    let Some(ta) = assignment else {
        return Err(DomainError::forbidden(
            format!("Penugasan mengajar tidak ditemukan atau akses ditolak ({action_label})."),
            "GURU_MAPEL:OWN_ASSIGNMENT",
        ));
    };

    if ctx.active_role == UserRole::Admin {
        return Ok(ta);
    }

    if ctx.active_role != UserRole::GuruMapel {
        return Err(DomainError::forbidden(
            format!(
                "Role {} tidak memiliki izin mengubah penugasan mengajar ({action_label}).",
                ctx.active_role.as_str()
            ),
            "GURU_MAPEL:OWN_ASSIGNMENT",
        ));
    }

    match &ctx.teacher {
        Some(t) if t.id == ta.teacher_id => Ok(ta),
        _ => Err(DomainError::forbidden(
            format!(
                "Akses ditolak (403): Guru tidak dapat mengakses atau mengubah {action_label} milik guru lain meskipun mata pelajaran sama."
            ),
            "GURU_MAPEL:OWN_ASSIGNMENT",
        )),
    }
}

pub fn guard_bk_rombel_access(
    ctx: &AuthContext,
    rombel_id: &RombelId,
    bk_assignments: &[BkClassAssignment],
) -> Result<(), DomainError> {
    if ctx.active_role == UserRole::Admin {
        return Ok(());
    }
    if ctx.active_role != UserRole::GuruBk {
        return Err(DomainError::forbidden(
            "Hanya Guru BK yang berwenang mengakses monitoring BK.",
            "GURU_BK:ASSIGNED_ROMBEL",
        ));
    }
    let Some(bk) = &ctx.bk_counselor else {
        return Err(DomainError::forbidden(
            "Profil BK tidak ditemukan.",
            "GURU_BK:ASSIGNED_ROMBEL",
        ));
    };
    let assigned = bk_assignments
        .iter()
        .any(|b| b.bk_id == bk.id && &b.rombel_id == rombel_id);

    if !assigned {
        return Err(DomainError::forbidden(
            "Akses ditolak (403): Kelas ini tidak berada dalam penugasan binaan BK Anda.",
            "GURU_BK:ASSIGNED_ROMBEL",
        ));
    }
    Ok(())
}

pub fn guard_notebook_content_read(
    ctx: &AuthContext,
    notebook: &Notebook,
    assignment: Option<&TeacherAssignment>,
) -> Result<(), DomainError> {
    if ctx.active_role == UserRole::Siswa {
        if let Some(stu) = &ctx.student {
            if stu.id == notebook.student_id {
                return Ok(());
            }
        }
    }

    if ctx.active_role == UserRole::GuruMapel {
        if let (Some(tch), Some(ta)) = (&ctx.teacher, assignment) {
            if ta.id == notebook.teacher_assignment_id && ta.teacher_id == tch.id {
                return Ok(());
            }
        }
    }

    Err(DomainError::forbidden(
        "Privasi Buku Tulis (403): Isi catatan buku tulis hanya dapat dibaca oleh siswa pemilik dan guru mapel pengampu. Role monitoring hanya menerima metadata.",
        "NOTEBOOK:CONTENT_OWNER_OR_SUBJECT_TEACHER",
    ))
}

pub fn summarize_notebook_metadata(
    notebook: &Notebook,
    entries: &[NotebookEntry],
) -> NotebookMetadataSummary {
    let matching: Vec<&NotebookEntry> = entries
        .iter()
        .filter(|e| e.notebook_id == notebook.id)
        .collect();

    let last_updated_at = matching.iter().map(|e| e.updated_at.clone()).max();

    let has_teacher_comment = matching
        .iter()
        .any(|e| e.komentar_guru.as_deref().map(|k| !k.is_empty()).unwrap_or(false));

    NotebookMetadataSummary {
        notebook_id: notebook.id.clone(),
        student_id: notebook.student_id.clone(),
        subject_id: notebook.subject_id.clone(),
        entry_count: matching.len(),
        last_updated_at,
        has_teacher_comment,
    }
}

pub fn guard_grade_mutation<'a>(
    ctx: &AuthContext,
    assignment: Option<&'a TeacherAssignment>,
) -> Result<&'a TeacherAssignment, DomainError> {
    if ctx.active_role == UserRole::WaliKelas {
        return Err(DomainError::forbidden(
            "Akses ditolak (403): Wali Kelas hanya memiliki akses baca pada nilai mata pelajaran.",
            "GURU_MAPEL:GRADE_WRITE",
        ));
    }
    guard_teacher_assignment_ownership(ctx, assignment, "nilai mata pelajaran")
}

pub fn guard_susulan_exam_creation<'a>(
    ctx: &AuthContext,
    assignment: Option<&'a TeacherAssignment>,
) -> Result<&'a TeacherAssignment, DomainError> {
    if ctx.active_role != UserRole::GuruMapel {
        return Err(DomainError::forbidden(
            format!(
                "Akses ditolak (403): Ujian susulan hanya boleh dibuat oleh Guru Mapel pengampu, bukan {}.",
                ctx.active_role.as_str()
            ),
            "GURU_MAPEL:CREATE_SUSULAN",
        ));
    }
    guard_teacher_assignment_ownership(ctx, assignment, "ujian susulan")
}

pub fn guard_admin_only(ctx: &AuthContext, action: &str) -> Result<(), DomainError> {
    if ctx.active_role != UserRole::Admin {
        return Err(DomainError::forbidden(
            format!(r#"Akses ditolak (403): Tindakan "{action}" khusus Administrator."#),
            "ADMIN:SYSTEM",
        ));
    }
    Ok(())
}

pub fn can_clone_between_assignments(
    teacher_id: &str,
    source: Option<&TeacherAssignment>,
    target: Option<&TeacherAssignment>,
) -> Result<(AssignmentId, AssignmentId), DomainError> {
    match (source, target) {
        (Some(s), Some(t)) if s.teacher_id.0 == teacher_id && t.teacher_id.0 == teacher_id => {
            Ok((s.id.clone(), t.id.clone()))
        }
        (Some(_), Some(_)) => Err(DomainError::forbidden(
            "Clone (403): Anda hanya dapat menyalin materi/sesi/tugas antar kelas yang Anda ampu sendiri.",
            "GURU_MAPEL:CLONE",
        )),
        _ => Err(DomainError::forbidden(
            "Assignment sumber atau tujuan tidak ditemukan.",
            "GURU_MAPEL:CLONE",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::*;

    fn sample_assignment(id: &str, teacher_id: &str) -> TeacherAssignment {
        TeacherAssignment {
            id: AssignmentId(id.into()),
            teacher_id: TeacherId(teacher_id.into()),
            subject_id: SubjectId("sub-mtk".into()),
            rombel_id: RombelId("rom-1".into()),
            academic_year_id: AcademicYearId("ay-1".into()),
            semester: "GENAP".into(),
            kurikulum_acuan: CurriculumTrack::Merdeka,
            jam_per_minggu: 4,
            status: "AKTIF".into(),
        }
    }

    fn teacher_ctx(teacher_id: &str) -> AuthContext {
        AuthContext {
            user: User {
                id: UserId("u-1".into()),
                nama: "Budi".into(),
                email: "budi@smkn1percut.sch.id".into(),
                roles: vec![UserRole::GuruMapel],
                status: "AKTIF".into(),
                last_login_at: String::new(),
            },
            active_role: UserRole::GuruMapel,
            teacher: Some(Teacher {
                id: TeacherId(teacher_id.into()),
                user_id: UserId("u-1".into()),
                nuptk: "111".into(),
                nip: "222".into(),
                bidang: "Matematika".into(),
            }),
            student: None,
            bk_counselor: None,
        }
    }

    fn role_ctx(role: UserRole) -> AuthContext {
        AuthContext {
            user: User {
                id: UserId("u-mon".into()),
                nama: "Monitor".into(),
                email: "monitor@smkn1percut.sch.id".into(),
                roles: vec![role],
                status: "AKTIF".into(),
                last_login_at: String::new(),
            },
            active_role: role,
            teacher: None,
            student: None,
            bk_counselor: if role == UserRole::GuruBk {
                Some(BkCounselor {
                    id: BkId("bk-1".into()),
                    user_id: UserId("u-mon".into()),
                })
            } else {
                None
            },
        }
    }

    #[test]
    fn rejects_cross_teacher_assignment_with_403() {
        let ctx = teacher_ctx("tch-budi");
        let other = sample_assignment("ta-other", "tch-siti");
        let err = guard_teacher_assignment_ownership(&ctx, Some(&other), "nilai").unwrap_err();
        assert_eq!(err.http_status(), 403);
    }

    #[test]
    fn enforces_notebook_privacy_403_for_monitoring_and_allows_owner() {
        let nb = Notebook {
            id: NotebookId("nb-1".into()),
            student_id: StudentId("stu-1".into()),
            subject_id: SubjectId("sub-mtk".into()),
            teacher_assignment_id: AssignmentId("ta-1".into()),
        };
        let ta = sample_assignment("ta-1", "tch-budi");

        for role in [
            UserRole::GuruBk,
            UserRole::WaliKelas,
            UserRole::Wakasek,
            UserRole::KepalaSekolah,
            UserRole::Admin,
        ] {
            let err = guard_notebook_content_read(&role_ctx(role), &nb, Some(&ta)).unwrap_err();
            assert_eq!(err.http_status(), 403);
        }

        let owner_ctx = AuthContext {
            user: User {
                id: UserId("u-stu".into()),
                nama: "Rizky".into(),
                email: "rizky@smkn1percut.sch.id".into(),
                roles: vec![UserRole::Siswa],
                status: "AKTIF".into(),
                last_login_at: String::new(),
            },
            active_role: UserRole::Siswa,
            teacher: None,
            student: Some(Student {
                id: StudentId("stu-1".into()),
                user_id: UserId("u-stu".into()),
                nisn: "0081234501".into(),
                nis: "2401".into(),
                rombel_id: RombelId("rom-1".into()),
                jenis_kelamin: "L".into(),
                tanggal_lahir: "2008-01-01".into(),
                status: "AKTIF".into(),
            }),
            bk_counselor: None,
        };
        assert!(guard_notebook_content_read(&owner_ctx, &nb, Some(&ta)).is_ok());
        assert!(guard_notebook_content_read(&teacher_ctx("tch-budi"), &nb, Some(&ta)).is_ok());
        assert_eq!(
            guard_notebook_content_read(&teacher_ctx("tch-siti"), &nb, Some(&ta))
                .unwrap_err()
                .http_status(),
            403
        );
    }

    #[test]
    fn susulan_only_allowed_for_assigned_guru_mapel() {
        let ta = sample_assignment("ta-1", "tch-budi");
        for role in [
            UserRole::GuruBk,
            UserRole::Wakasek,
            UserRole::KepalaSekolah,
            UserRole::Admin,
            UserRole::WaliKelas,
        ] {
            let err = guard_susulan_exam_creation(&role_ctx(role), Some(&ta)).unwrap_err();
            assert_eq!(err.http_status(), 403);
        }
        assert!(guard_susulan_exam_creation(&teacher_ctx("tch-budi"), Some(&ta)).is_ok());
        assert_eq!(
            guard_susulan_exam_creation(&teacher_ctx("tch-siti"), Some(&ta))
                .unwrap_err()
                .http_status(),
            403
        );
    }
}
