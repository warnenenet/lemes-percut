use rust_decimal::Decimal;
use std::collections::HashMap;

use crate::result::DomainError;
use crate::types::{
    CurriculumTrack, EraporColumnMapping, GradeComponent, GradeComponentName, GradeRecord,
    PklScore, PklScoreComponent, Rombel, Student, User,
};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeightValidation {
    pub valid: bool,
    pub total_weight: Decimal,
    pub message: Option<String>,
}

pub fn validate_component_weights(components: &[GradeComponent]) -> WeightValidation {
    let total_weight: Decimal = components
        .iter()
        .filter(|c| c.nama != GradeComponentName::Remedial)
        .map(|c| c.bobot)
        .sum();

    let hundred = Decimal::new(100, 0);
    let tolerance = Decimal::new(1, 2); // 0.01

    if (total_weight - hundred).abs() > tolerance {
        WeightValidation {
            valid: false,
            total_weight: total_weight.round_dp(2),
            message: Some(format!(
                "Peringatan: Total bobot komponen aktif adalah {}% (seharusnya 100%).",
                total_weight.round_dp(2)
            )),
        }
    } else {
        WeightValidation {
            valid: true,
            total_weight: total_weight.round_dp(2),
            message: None,
        }
    }
}

pub fn determine_predicate(score: Option<Decimal>, track: CurriculumTrack) -> String {
    let Some(s) = score else {
        return String::new();
    };
    let s90 = Decimal::new(90, 0);
    let s80 = Decimal::new(80, 0);
    let s75 = Decimal::new(75, 0);

    match track {
        CurriculumTrack::K13 => {
            if s >= s90 {
                "A (Sangat Baik)".into()
            } else if s >= s80 {
                "B (Baik)".into()
            } else if s >= s75 {
                "C (Cukup)".into()
            } else {
                "D (Kurang)".into()
            }
        }
        CurriculumTrack::Merdeka => {
            if s >= s90 {
                "Mahir".into()
            } else if s >= s80 {
                "Cakap".into()
            } else if s >= s75 {
                "Layak".into()
            } else {
                "Perlu Bimbingan".into()
            }
        }
    }
}

pub fn calculate_student_final_grade(
    student_id: &str,
    components: &[GradeComponent],
    grades: &[GradeRecord],
    track: CurriculumTrack,
) -> (Option<Decimal>, String) {
    let hundred = Decimal::new(100, 0);
    let kkm_cap = Decimal::new(78, 0);

    let mut weighted_sum = Decimal::ZERO;
    let mut weight_used = Decimal::ZERO;

    for comp in components.iter().filter(|c| c.nama != GradeComponentName::Remedial) {
        if let Some(rec) = grades
            .iter()
            .find(|g| g.student_id.0 == student_id && g.component_id == comp.id)
        {
            weighted_sum += rec.nilai * (comp.bobot / hundred);
            weight_used += comp.bobot;
        }
    }

    if weight_used == Decimal::ZERO {
        return (None, String::new());
    }

    let mut final_score = weighted_sum.round_dp(2);
    if let Some(remedial_comp) = components
        .iter()
        .find(|c| c.nama == GradeComponentName::Remedial)
    {
        if let Some(rem) = grades
            .iter()
            .find(|g| g.student_id.0 == student_id && g.component_id == remedial_comp.id)
        {
            if rem.nilai > final_score {
                final_score = rem.nilai.min(kkm_cap).round_dp(2);
            }
        }
    }

    let pred = determine_predicate(Some(final_score), track);
    (Some(final_score), pred)
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EraporExportResult {
    pub headers: Vec<String>,
    pub rows: Vec<HashMap<String, String>>,
    pub csv_content: String,
}

pub fn generate_erapor_export(
    mapping: Option<&EraporColumnMapping>,
    rombel: &Rombel,
    students: &[Student],
    users: &[User],
    components: &[GradeComponent],
    grades: &[GradeRecord],
) -> Result<EraporExportResult, DomainError> {
    let Some(map) = mapping else {
        return Err(DomainError::validation(
            "erapor_mapping",
            "Mapping kolom e-Rapor belum dikonfigurasi oleh Admin. Hubungi Admin sebelum export.",
        ));
    };
    if map.mapping.is_empty() {
        return Err(DomainError::validation(
            "erapor_mapping",
            "Mapping kolom e-Rapor belum dikonfigurasi oleh Admin. Hubungi Admin sebelum export.",
        ));
    }

    let has_identifier = map
        .mapping
        .iter()
        .any(|m| m.system_field == "nisn" || m.system_field == "nis");
    let has_final = map
        .mapping
        .iter()
        .any(|m| m.system_field == "nilai_akhir");
    if !has_identifier || !has_final {
        return Err(DomainError::validation(
            "erapor_mapping",
            "Mapping e-Rapor belum lengkap: wajib memetakan kolom NISN/NIS dan nilai_akhir.",
        ));
    }

    let headers: Vec<String> = map.mapping.iter().map(|m| m.erapor_column.clone()).collect();
    let mut rows: Vec<HashMap<String, String>> = Vec::new();

    for student in students
        .iter()
        .filter(|s| s.rombel_id == rombel.id && s.status != "ALUMNI")
    {
        let user_name = users
            .iter()
            .find(|u| u.id == student.user_id)
            .map(|u| u.nama.clone())
            .unwrap_or_default();

        let (nilai_akhir, predikat) = calculate_student_final_grade(
            &student.id.0,
            components,
            grades,
            rombel.kurikulum_acuan,
        );

        let get_comp = |target: GradeComponentName| -> String {
            components
                .iter()
                .find(|c| c.nama == target)
                .and_then(|comp| {
                    grades
                        .iter()
                        .find(|g| g.student_id == student.id && g.component_id == comp.id)
                })
                .map(|g| g.nilai.round_dp(2).to_string())
                .unwrap_or_default()
        };

        let mut row = HashMap::new();
        for col in &map.mapping {
            let val = match col.system_field.as_str() {
                "nisn" => student.nisn.clone(),
                "nis" => student.nis.clone(),
                "nama_siswa" => user_name.clone(),
                "nama_rombel" => rombel.nama_rombel.clone(),
                "nilai_formatif" => get_comp(GradeComponentName::Formatif),
                "nilai_sumatif" => get_comp(GradeComponentName::Sumatif),
                "nilai_praktik" => get_comp(GradeComponentName::Praktik),
                "nilai_proyek" => get_comp(GradeComponentName::Proyek),
                "nilai_akhir" => nilai_akhir.map(|v| v.round_dp(2).to_string()).unwrap_or_default(),
                "predikat" => predikat.clone(),
                "deskripsi_capaian" => {
                    if nilai_akhir.is_some() {
                        format!(
                            "Menunjukkan penguasaan {} pada capaian pembelajaran.",
                            predikat.to_lowercase()
                        )
                    } else {
                        String::new()
                    }
                }
                _ => String::new(),
            };
            row.insert(col.erapor_column.clone(), val);
        }
        rows.push(row);
    }

    let escape = |v: &str| format!(r#""{}""#, v.replace('"', r#""""#));
    let mut csv_lines = Vec::with_capacity(rows.len() + 1);
    csv_lines.push(
        headers
            .iter()
            .map(|h| escape(h))
            .collect::<Vec<_>>()
            .join(","),
    );
    for r in &rows {
        let line = headers
            .iter()
            .map(|h| escape(r.get(h).map(|s| s.as_str()).unwrap_or("")))
            .collect::<Vec<_>>()
            .join(",");
        csv_lines.push(line);
    }

    Ok(EraporExportResult {
        headers,
        rows,
        csv_content: csv_lines.join("\n"),
    })
}

pub fn calculate_pkl_final_score(scores: &[PklScore]) -> (Decimal, Decimal, Decimal) {
    let dudi: Vec<Decimal> = scores
        .iter()
        .filter(|s| {
            matches!(
                s.komponen,
                PklScoreComponent::DudiHard
                    | PklScoreComponent::DudiSoft
                    | PklScoreComponent::DudiDisiplin
            )
        })
        .map(|s| s.nilai)
        .collect();

    let sekolah: Vec<Decimal> = scores
        .iter()
        .filter(|s| {
            matches!(
                s.komponen,
                PklScoreComponent::SekolahLaporan | PklScoreComponent::SekolahSidang
            )
        })
        .map(|s| s.nilai)
        .collect();

    let dudi_avg = if dudi.is_empty() {
        Decimal::ZERO
    } else {
        dudi.iter().copied().sum::<Decimal>() / Decimal::from(dudi.len() as u64)
    };
    let sekolah_avg = if sekolah.is_empty() {
        Decimal::ZERO
    } else {
        sekolah.iter().copied().sum::<Decimal>() / Decimal::from(sekolah.len() as u64)
    };

    let w_dudi = Decimal::new(6, 1); // 0.6
    let w_sekolah = Decimal::new(4, 1); // 0.4
    let final_score = (dudi_avg * w_dudi + sekolah_avg * w_sekolah).round_dp(2);

    (
        dudi_avg.round_dp(2),
        sekolah_avg.round_dp(2),
        final_score,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{
        AcademicYearId, AssignmentId, EraporMappingColumn, MajorId, RombelId, StudentId, UserId,
    };

    #[test]
    fn warns_when_component_weights_do_not_equal_100() {
        let bad_comps = vec![
            GradeComponent {
                id: "c1".into(),
                teacher_assignment_id: AssignmentId("ta-1".into()),
                nama: GradeComponentName::Formatif,
                bobot: Decimal::new(30, 0),
            },
            GradeComponent {
                id: "c2".into(),
                teacher_assignment_id: AssignmentId("ta-1".into()),
                nama: GradeComponentName::Sumatif,
                bobot: Decimal::new(50, 0),
            },
        ];
        let res = validate_component_weights(&bad_comps);
        assert!(!res.valid);
        assert_eq!(res.total_weight, Decimal::new(80, 0));
        assert!(res.message.unwrap().contains("80"));
    }

    #[test]
    fn calculates_weighted_final_and_merdeka_predicate_with_decimal() {
        let comps = vec![
            GradeComponent {
                id: "c1".into(),
                teacher_assignment_id: AssignmentId("ta-1".into()),
                nama: GradeComponentName::Formatif,
                bobot: Decimal::new(40, 0),
            },
            GradeComponent {
                id: "c2".into(),
                teacher_assignment_id: AssignmentId("ta-1".into()),
                nama: GradeComponentName::Sumatif,
                bobot: Decimal::new(60, 0),
            },
        ];
        assert!(validate_component_weights(&comps).valid);

        let grades = vec![
            GradeRecord {
                id: "g1".into(),
                student_id: StudentId("s1".into()),
                teacher_assignment_id: AssignmentId("ta-1".into()),
                component_id: "c1".into(),
                nilai: Decimal::new(9050, 2), // 90.50
                catatan: String::new(),
            },
            GradeRecord {
                id: "g2".into(),
                student_id: StudentId("s1".into()),
                teacher_assignment_id: AssignmentId("ta-1".into()),
                component_id: "c2".into(),
                nilai: Decimal::new(9500, 2), // 95.00
                catatan: String::new(),
            },
        ];
        let (final_score, pred) =
            calculate_student_final_grade("s1", &comps, &grades, CurriculumTrack::Merdeka);
        assert_eq!(final_score, Some(Decimal::new(9320, 2)));
        assert_eq!(pred, "Mahir");
    }

    #[test]
    fn generates_dynamic_erapor_csv_and_computes_pkl_scores() {
        let rombel = Rombel {
            id: RombelId("rom-1".into()),
            tingkat: 11,
            major_id: MajorId("maj-rpl".into()),
            academic_year_id: AcademicYearId("ay-1".into()),
            kurikulum_acuan: CurriculumTrack::Merdeka,
            nama_rombel: "XI RPL 1".into(),
            wali_kelas_id: None,
        };
        let stu = Student {
            id: StudentId("stu-1".into()),
            user_id: UserId("usr-1".into()),
            nisn: "0081234501".into(),
            nis: "240101".into(),
            rombel_id: RombelId("rom-1".into()),
            jenis_kelamin: "L".into(),
            tanggal_lahir: "2008-04-12".into(),
            status: "AKTIF".into(),
        };
        let usr = User {
            id: UserId("usr-1".into()),
            nama: "Rizky Pratama".into(),
            email: "rizky@smkn1percut.sch.id".into(),
            roles: vec![crate::types::UserRole::Siswa],
            status: "AKTIF".into(),
            last_login_at: String::new(),
        };
        let mapping = EraporColumnMapping {
            id: "map-1".into(),
            academic_year_id: AcademicYearId("ay-1".into()),
            mapel_id: None,
            template_name: "e-Rapor SMK".into(),
            mapping: vec![
                EraporMappingColumn {
                    erapor_column: "NISN_PESERTA".into(),
                    system_field: "nisn".into(),
                },
                EraporMappingColumn {
                    erapor_column: "NILAI_RAPOR".into(),
                    system_field: "nilai_akhir".into(),
                },
            ],
            created_by: UserId("usr-admin".into()),
        };

        let comps = vec![GradeComponent {
            id: "c1".into(),
            teacher_assignment_id: AssignmentId("ta-1".into()),
            nama: GradeComponentName::Formatif,
            bobot: Decimal::new(100, 0),
        }];
        let grades = vec![GradeRecord {
            id: "g1".into(),
            student_id: StudentId("stu-1".into()),
            teacher_assignment_id: AssignmentId("ta-1".into()),
            component_id: "c1".into(),
            nilai: Decimal::new(8800, 2),
            catatan: String::new(),
        }];

        let csv = generate_erapor_export(
            Some(&mapping),
            &rombel,
            &[stu],
            &[usr],
            &comps,
            &grades,
        )
        .unwrap();
        assert_eq!(csv.headers, vec!["NISN_PESERTA", "NILAI_RAPOR"]);
        assert!(csv.csv_content.contains(r#""0081234501","88.00""#));

        let pkl = vec![
            PklScore {
                id: "p1".into(),
                placement_id: crate::types::PlacementId("plc-1".into()),
                komponen: PklScoreComponent::DudiHard,
                nilai: Decimal::new(90, 0),
                dinilai_oleh: UserId("u-bk".into()),
            },
            PklScore {
                id: "p2".into(),
                placement_id: crate::types::PlacementId("plc-1".into()),
                komponen: PklScoreComponent::SekolahLaporan,
                nilai: Decimal::new(80, 0),
                dinilai_oleh: UserId("u-bk".into()),
            },
        ];
        let (dudi_avg, sek_avg, fin) = calculate_pkl_final_score(&pkl);
        assert_eq!(dudi_avg, Decimal::new(90, 0));
        assert_eq!(sek_avg, Decimal::new(80, 0));
        assert_eq!(fin, Decimal::new(86, 0));
    }
}
