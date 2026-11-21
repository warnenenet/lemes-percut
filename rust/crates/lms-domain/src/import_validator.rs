use std::collections::HashSet;

use crate::result::DomainError;
use crate::types::{Major, Rombel, Student, Teacher};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedStudentRow {
    pub row_number: usize,
    pub nisn: String,
    pub nis: String,
    pub nama: String,
    pub rombel_name: String,
    pub rombel_id: String,
    pub major_code: String,
    pub jenis_kelamin: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedTeacherRow {
    pub row_number: usize,
    pub nuptk: String,
    pub nip: String,
    pub nama: String,
    pub email: String,
    pub bidang: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRowError {
    pub row: usize,
    pub raw: String,
    pub reason: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview<T> {
    pub tipe: String,
    pub total_rows: usize,
    pub valid_rows: Vec<T>,
    pub error_rows: Vec<ImportRowError>,
    pub error_log_text: String,
}

fn split_csv_line(line: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    for ch in line.chars() {
        if ch == '"' {
            in_quotes = !in_quotes;
        } else if (ch == ',' || ch == ';') && !in_quotes {
            result.push(current.trim().to_string());
            current.clear();
        } else {
            current.push(ch);
        }
    }
    result.push(current.trim().to_string());
    result
}

pub fn preview_student_import_csv(
    csv_text: &str,
    existing_students: &[Student],
    rombels: &[Rombel],
    majors: &[Major],
) -> Result<ImportPreview<ParsedStudentRow>, DomainError> {
    let lines: Vec<&str> = csv_text
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect();

    if lines.len() < 2 {
        return Err(DomainError::validation(
            "file",
            "File kosong atau hanya berisi header tanpa baris data siswa.",
        ));
    }

    let headers: Vec<String> = split_csv_line(lines[0])
        .into_iter()
        .map(|h| h.to_lowercase())
        .collect();
    let find_col = |name: &str| headers.iter().position(|h| h == name);

    let (Some(i_nisn), Some(i_nis), Some(i_nama), Some(i_rombel), Some(i_jurusan), Some(i_jk)) = (
        find_col("nisn"),
        find_col("nis"),
        find_col("nama"),
        find_col("rombel"),
        find_col("jurusan"),
        find_col("jenis_kelamin"),
    ) else {
        return Err(DomainError::validation(
            "headers",
            "Kolom wajib siswa tidak lengkap. Wajib ada: nisn, nis, nama, rombel, jurusan, jenis_kelamin.",
        ));
    };

    let existing_nisns: HashSet<&str> = existing_students.iter().map(|s| s.nisn.as_str()).collect();
    let mut seen_in_file: HashSet<String> = HashSet::new();
    let mut valid_rows = Vec::new();
    let mut error_rows = Vec::new();

    for (offset, raw_line) in lines.iter().skip(1).enumerate() {
        let row_num = offset + 2;
        let cols = split_csv_line(raw_line);
        if cols.len() < headers.len() {
            error_rows.push(ImportRowError {
                row: row_num,
                raw: (*raw_line).to_string(),
                reason: format!(
                    "Jumlah kolom kurang ({} dari {} kolom wajib).",
                    cols.len(),
                    headers.len()
                ),
            });
            continue;
        }

        let nisn = cols[i_nisn].clone();
        let nis = cols[i_nis].clone();
        let nama = cols[i_nama].clone();
        let rombel_name = cols[i_rombel].clone();
        let major_code = cols[i_jurusan].to_uppercase();
        let jk = cols[i_jk].to_uppercase();

        if nisn.len() != 10 || !nisn.chars().all(|c| c.is_ascii_digit()) {
            error_rows.push(ImportRowError {
                row: row_num,
                raw: (*raw_line).to_string(),
                reason: format!(r#"NISN "{nisn}" tidak valid (harus 10 digit angka)."#),
            });
            continue;
        }
        if seen_in_file.contains(&nisn) {
            error_rows.push(ImportRowError {
                row: row_num,
                raw: (*raw_line).to_string(),
                reason: format!("NISN {nisn} duplikat di dalam file upload."),
            });
            continue;
        }
        if existing_nisns.contains(nisn.as_str()) {
            error_rows.push(ImportRowError {
                row: row_num,
                raw: (*raw_line).to_string(),
                reason: format!("NISN {nisn} sudah terdaftar di database sekolah."),
            });
            continue;
        }
        if nama.len() < 2 {
            error_rows.push(ImportRowError {
                row: row_num,
                raw: (*raw_line).to_string(),
                reason: "Nama siswa wajib diisi.".into(),
            });
            continue;
        }
        if jk != "L" && jk != "P" {
            error_rows.push(ImportRowError {
                row: row_num,
                raw: (*raw_line).to_string(),
                reason: format!(r#"jenis_kelamin "{jk}" harus L atau P."#),
            });
            continue;
        }

        let Some(major) = majors.iter().find(|m| {
            m.kode.eq_ignore_ascii_case(&major_code) || m.nama.eq_ignore_ascii_case(&major_code)
        }) else {
            error_rows.push(ImportRowError {
                row: row_num,
                raw: (*raw_line).to_string(),
                reason: format!(r#"Jurusan "{major_code}" tidak ditemukan di master 14 jurusan."#),
            });
            continue;
        };

        let Some(rombel) = rombels
            .iter()
            .find(|r| r.nama_rombel.eq_ignore_ascii_case(&rombel_name))
        else {
            error_rows.push(ImportRowError {
                row: row_num,
                raw: (*raw_line).to_string(),
                reason: format!(r#"Rombel "{rombel_name}" belum terdaftar di master rombel."#),
            });
            continue;
        };

        seen_in_file.insert(nisn.clone());
        valid_rows.push(ParsedStudentRow {
            row_number: row_num,
            nisn,
            nis,
            nama,
            rombel_name: rombel.nama_rombel.clone(),
            rombel_id: rombel.id.0.clone(),
            major_code: major.kode.clone(),
            jenis_kelamin: jk,
        });
    }

    let error_log_text = if error_rows.is_empty() {
        "Semua baris valid (0 error).".into()
    } else {
        error_rows
            .iter()
            .map(|e| format!("Baris {}: {} | Data: {}", e.row, e.reason, e.raw))
            .collect::<Vec<_>>()
            .join("\n")
    };

    Ok(ImportPreview {
        tipe: "SISWA".into(),
        total_rows: lines.len() - 1,
        valid_rows,
        error_rows,
        error_log_text,
    })
}

pub fn preview_teacher_import_csv(
    csv_text: &str,
    existing_teachers: &[Teacher],
) -> Result<ImportPreview<ParsedTeacherRow>, DomainError> {
    let lines: Vec<&str> = csv_text
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect();

    if lines.len() < 2 {
        return Err(DomainError::validation(
            "file",
            "File kosong atau hanya berisi header tanpa baris data guru.",
        ));
    }

    let headers: Vec<String> = split_csv_line(lines[0])
        .into_iter()
        .map(|h| h.to_lowercase())
        .collect();
    let find_col = |name: &str| headers.iter().position(|h| h == name);

    let (Some(i_nuptk), Some(i_nama), Some(i_email), Some(i_bidang)) = (
        find_col("nuptk"),
        find_col("nama"),
        find_col("email"),
        find_col("bidang"),
    ) else {
        return Err(DomainError::validation(
            "headers",
            "Kolom wajib guru tidak lengkap. Wajib ada: nuptk, nama, email, bidang.",
        ));
    };
    let i_nip = find_col("nip");

    let existing_nuptks: HashSet<&str> = existing_teachers.iter().map(|t| t.nuptk.as_str()).collect();
    let mut seen_nuptk: HashSet<String> = HashSet::new();
    let mut valid_rows = Vec::new();
    let mut error_rows = Vec::new();

    for (offset, raw_line) in lines.iter().skip(1).enumerate() {
        let row_num = offset + 2;
        let cols = split_csv_line(raw_line);
        if cols.len() < headers.len() {
            error_rows.push(ImportRowError {
                row: row_num,
                raw: (*raw_line).to_string(),
                reason: "Jumlah kolom baris guru kurang.".into(),
            });
            continue;
        }

        let nuptk = cols[i_nuptk].clone();
        let nip = i_nip.and_then(|idx| cols.get(idx)).cloned().unwrap_or_default();
        let nama = cols[i_nama].clone();
        let email = cols[i_email].to_lowercase();
        let bidang = cols[i_bidang].clone();

        if nuptk.len() < 8 || !nuptk.chars().all(|c| c.is_ascii_digit()) {
            error_rows.push(ImportRowError {
                row: row_num,
                raw: (*raw_line).to_string(),
                reason: format!(r#"NUPTK "{nuptk}" tidak valid."#),
            });
            continue;
        }
        if seen_nuptk.contains(&nuptk) || existing_nuptks.contains(nuptk.as_str()) {
            error_rows.push(ImportRowError {
                row: row_num,
                raw: (*raw_line).to_string(),
                reason: format!("NUPTK {nuptk} sudah terdaftar atau duplikat."),
            });
            continue;
        }
        if !email.contains('@') || nama.len() < 2 {
            error_rows.push(ImportRowError {
                row: row_num,
                raw: (*raw_line).to_string(),
                reason: "Nama atau email guru tidak valid.".into(),
            });
            continue;
        }

        seen_nuptk.insert(nuptk.clone());
        valid_rows.push(ParsedTeacherRow {
            row_number: row_num,
            nuptk,
            nip,
            nama,
            email,
            bidang,
        });
    }

    let error_log_text = if error_rows.is_empty() {
        "Semua baris guru valid (0 error).".into()
    } else {
        error_rows
            .iter()
            .map(|e| format!("Baris {}: {} | Data: {}", e.row, e.reason, e.raw))
            .collect::<Vec<_>>()
            .join("\n")
    };

    Ok(ImportPreview {
        tipe: "GURU".into(),
        total_rows: lines.len() - 1,
        valid_rows,
        error_rows,
        error_log_text,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{AcademicYearId, CurriculumTrack, MajorId, RombelId};

    #[test]
    fn validates_student_csv_atomically_per_row() {
        let majors = vec![Major {
            id: MajorId("maj-rpl".into()),
            kode: "RPL".into(),
            nama: "Rekayasa Perangkat Lunak".into(),
        }];
        let rombels = vec![Rombel {
            id: RombelId("rom-xi-rpl-1".into()),
            tingkat: 11,
            major_id: MajorId("maj-rpl".into()),
            academic_year_id: AcademicYearId("ay-1".into()),
            kurikulum_acuan: CurriculumTrack::Merdeka,
            nama_rombel: "XI RPL 1".into(),
            wali_kelas_id: None,
        }];

        let csv = "\
nisn,nis,nama,rombel,jurusan,jenis_kelamin
0089999901,250901,Andi Wijaya,XI RPL 1,RPL,L
12345,250902,Budi Salah,XI RPL 1,RPL,L
0089999903,250903,Citra Salah Rombel,XII RPL 9,RPL,P";

        let preview = preview_student_import_csv(csv, &[], &rombels, &majors).unwrap();
        assert_eq!(preview.total_rows, 3);
        assert_eq!(preview.valid_rows.len(), 1);
        assert_eq!(preview.error_rows.len(), 2);
        assert_eq!(preview.valid_rows[0].nisn, "0089999901");
        assert!(preview.error_rows[0].reason.contains("10 digit"));
        assert!(preview.error_rows[1].reason.contains("belum terdaftar"));
    }
}
