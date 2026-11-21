use std::collections::HashMap;

use crate::result::DomainError;
use crate::types::{
    AcademicYear, CurriculumTrack, DocumentStatus, Major, PromptTemplate, Rombel, School, Subject,
    TeacherAssignment, TeacherDocument, User,
};

pub struct PromptContextData<'a> {
    pub school: &'a School,
    pub academic_year: &'a AcademicYear,
    pub teacher_user: &'a User,
    pub teacher_nip: &'a str,
    pub subject: &'a Subject,
    pub rombel: &'a Rombel,
    pub major: &'a Major,
    pub assignment: &'a TeacherAssignment,
    pub student_count: usize,
}

pub fn resolve_fase_from_tingkat(tingkat: u8) -> String {
    if tingkat == 10 {
        "Fase E (Kelas X SMK)".into()
    } else {
        format!(
            "Fase F (Kelas {} SMK)",
            if tingkat == 11 { "XI" } else { "XII" }
        )
    }
}

pub fn assemble_prompt_for_teacher(
    template: &PromptTemplate,
    context: &PromptContextData<'_>,
    teacher_inputs: &HashMap<String, String>,
) -> Result<String, DomainError> {
    for field in &template.input_fields {
        let val = teacher_inputs
            .get(&field.key)
            .map(|s| s.trim())
            .unwrap_or("");
        if field.required && val.is_empty() {
            return Err(DomainError::validation(
                &field.key,
                format!(
                    r#"Kolom "{}" wajib diisi sebelum membuat prompt."#,
                    field.label
                ),
            ));
        }
    }

    let kurikulum_label = match context.assignment.kurikulum_acuan {
        CurriculumTrack::K13 => {
            "Kurikulum 2013 (Format KI / KD / Indikator Pencapaian Kompetensi)"
        }
        CurriculumTrack::Merdeka => {
            "Kurikulum Merdeka (Format CP / TP / ATP / KKTP & Profil Pelajar Pancasila)"
        }
    };

    let fase = match context.assignment.kurikulum_acuan {
        CurriculumTrack::Merdeka => resolve_fase_from_tingkat(context.rombel.tingkat),
        CurriculumTrack::K13 => format!("Tingkat {} (K13 Revisi)", context.rombel.tingkat),
    };

    let mut replacements: HashMap<String, String> = HashMap::from([
        ("nama_sekolah".into(), context.school.nama.clone()),
        ("npsn".into(), context.school.npsn.clone()),
        ("kepala_sekolah".into(), context.school.kepala_sekolah.clone()),
        ("nama_guru".into(), context.teacher_user.nama.clone()),
        (
            "nip_guru".into(),
            if context.teacher_nip.is_empty() {
                "-".into()
            } else {
                context.teacher_nip.into()
            },
        ),
        (
            "mapel".into(),
            format!("{} ({})", context.subject.nama, context.subject.kelompok.as_str()),
        ),
        ("kelas".into(), context.rombel.nama_rombel.clone()),
        ("fase".into(), fase),
        (
            "jurusan".into(),
            format!("{} ({})", context.major.nama, context.major.kode),
        ),
        ("semester".into(), context.academic_year.semester.clone()),
        (
            "tahun_ajaran".into(),
            context.academic_year.tahun_ajaran.clone(),
        ),
        ("kurikulum_acuan".into(), kurikulum_label.into()),
        ("jumlah_siswa".into(), context.student_count.to_string()),
        (
            "alokasi_jp".into(),
            format!("{} JP / minggu", context.assignment.jam_per_minggu),
        ),
    ]);

    for (k, v) in teacher_inputs {
        replacements.insert(k.clone(), v.trim().to_string());
    }

    let mut output = template.template_body.clone();
    for (key, val) in replacements {
        output = output.replace(&format!("{{{{{key}}}}}"), &val);
    }

    output.push_str(&format!(
        "\n\n--- STRUKTUR OUTPUT YANG DIHARAPKAN ---\n{}",
        template.output_structure
    ));
    output.push_str(
        "\n\n--- CATATAN PRIVASI ---\nPrompt ini disusun tanpa menyertakan data pribadi siswa (NISN/nama siswa). Dapat digunakan pada Gemini, Claude, DeepSeek, atau ChatGPT.",
    );

    Ok(output)
}

pub fn can_publish_teacher_document(
    doc: &TeacherDocument,
    template: &PromptTemplate,
) -> Result<(), DomainError> {
    if doc.konten.trim().len() < 20 {
        return Err(DomainError::validation(
            "konten",
            "Konten perangkat ajar masih kosong atau terlalu singkat (minimal 20 karakter).",
        ));
    }

    let unchecked: Vec<&String> = template
        .validation_checklist
        .iter()
        .filter(|item| !doc.checklist_state.get(*item).copied().unwrap_or(false))
        .collect();

    if !unchecked.is_empty() {
        return Err(DomainError::validation(
            "checklist",
            format!(
                "Tidak dapat dipublikasikan: {} item checklist validasi belum dicentang ({}).",
                unchecked.len(),
                unchecked[0]
            ),
        ));
    }

    Ok(())
}

pub fn apply_teacher_document_content_edit(
    doc: &TeacherDocument,
    new_title: &str,
    new_content: &str,
) -> TeacherDocument {
    let mut updated = doc.clone();
    updated.judul = new_title.to_string();
    updated.konten = new_content.to_string();
    if updated.status == DocumentStatus::Published && doc.konten != new_content {
        updated.status = DocumentStatus::Draft;
        updated.published_at = None;
    }
    updated
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::*;

    #[test]
    fn generates_prompt_without_student_pii_and_enforces_publish_checklist() {
        let school = School {
            id: "s-1".into(),
            npsn: "10214029".into(),
            nama: "SMK Negeri 1 Percut Sei Tuan".into(),
            alamat: "Jl. Kolam".into(),
            kepala_sekolah: "Drs. H. Kasman".into(),
            telepon: "061".into(),
            email: "info@smkn1percut.sch.id".into(),
            logo_url: "".into(),
        };
        let ay = AcademicYear {
            id: AcademicYearId("ay-1".into()),
            tahun_ajaran: "2025/2026".into(),
            semester: "GENAP".into(),
            tanggal_mulai: "2026-01-05".into(),
            tanggal_selesai: "2026-06-20".into(),
            is_active: true,
        };
        let teacher = User {
            id: UserId("u-budi".into()),
            nama: "Budi Santoso, S.Pd".into(),
            email: "budi@smkn1percut.sch.id".into(),
            roles: vec![UserRole::GuruMapel],
            status: "AKTIF".into(),
            last_login_at: String::new(),
        };
        let subject = Subject {
            id: SubjectId("sub-mtk".into()),
            kode: "MTK".into(),
            nama: "Matematika".into(),
            kelompok: SubjectGroup::Umum,
        };
        let rombel = Rombel {
            id: RombelId("rom-1".into()),
            tingkat: 11,
            major_id: MajorId("maj-rpl".into()),
            academic_year_id: AcademicYearId("ay-1".into()),
            kurikulum_acuan: CurriculumTrack::Merdeka,
            nama_rombel: "XI RPL 1".into(),
            wali_kelas_id: None,
        };
        let major = Major {
            id: MajorId("maj-rpl".into()),
            kode: "RPL".into(),
            nama: "Rekayasa Perangkat Lunak".into(),
        };
        let ta = TeacherAssignment {
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
        let tpl = PromptTemplate {
            id: TemplateId("tpl-1".into()),
            kode: "MODUL_AJAR_MERDEKA".into(),
            nama: "Modul Ajar Merdeka".into(),
            kategori: SubjectGroup::Umum,
            kurikulum_acuan: "MERDEKA".into(),
            input_fields: vec![PromptInputField {
                key: "topik".into(),
                label: "Topik Materi".into(),
                placeholder: "Matriks".into(),
                required: true,
            }],
            template_body: "Susun modul {{mapel}} untuk kelas {{kelas}} ({{jumlah_siswa}} siswa) topik {{topik}}.".into(),
            output_structure: "TP, ATP, Asesmen".into(),
            validation_checklist: vec![
                "CP & TP sesuai".into(),
                "Tidak ada data pribadi siswa".into(),
            ],
            version: 1,
            status: "AKTIF".into(),
        };

        let ctx = PromptContextData {
            school: &school,
            academic_year: &ay,
            teacher_user: &teacher,
            teacher_nip: "19870512",
            subject: &subject,
            rombel: &rombel,
            major: &major,
            assignment: &ta,
            student_count: 40,
        };

        let inputs = HashMap::from([("topik".into(), "Transformasi Matriks".into())]);
        let prompt = assemble_prompt_for_teacher(&tpl, &ctx, &inputs).unwrap();
        assert!(prompt.contains("40 siswa"));
        assert!(!prompt.contains("0081234501"));
        assert!(!prompt.contains("Rizky Pratama"));

        let mut doc = TeacherDocument {
            id: "doc-1".into(),
            teacher_assignment_id: AssignmentId("ta-1".into()),
            template_id: TemplateId("tpl-1".into()),
            judul: "Modul Matriks".into(),
            konten: "Tujuan pembelajaran: peserta didik memahami matriks transformasi 2D.".into(),
            status: DocumentStatus::Draft,
            generated_prompt: prompt,
            generated_at: None,
            pasted_at: None,
            published_at: None,
            checklist_state: HashMap::from([("CP & TP sesuai".into(), true)]),
        };

        assert_eq!(can_publish_teacher_document(&doc, &tpl).unwrap_err().http_status(), 422);

        doc.checklist_state
            .insert("Tidak ada data pribadi siswa".into(), true);
        assert!(can_publish_teacher_document(&doc, &tpl).is_ok());

        doc.status = DocumentStatus::Published;
        let edited = apply_teacher_document_content_edit(&doc, "Modul Matriks", "Konten revisi baru minimal dua puluh karakter.");
        assert_eq!(edited.status, DocumentStatus::Draft);
    }
}
