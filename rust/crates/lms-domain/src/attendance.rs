use crate::result::DomainError;
use crate::types::{
    AttendanceRecord, AttendanceStatus, SessionId, SessionStatus, SessionType, StudentId,
    TeachingSession, UserId,
};

#[derive(Debug, Clone, Copy)]
pub struct ActivityPayload {
    pub read_pct: u8,
    pub submitted_task: bool,
    pub submitted_reflection: bool,
}

fn parse_hhmm_minutes(hhmm: &str) -> Option<i32> {
    let mut parts = hhmm.split(':');
    let h: i32 = parts.next()?.parse().ok()?;
    let m: i32 = parts.next()?.parse().ok()?;
    if !(0..=23).contains(&h) || !(0..=59).contains(&m) {
        return None;
    }
    Some(h * 60 + m)
}

pub fn is_within_time_window(access_hhmm: &str, start_hhmm: &str, end_hhmm: &str) -> bool {
    match (
        parse_hhmm_minutes(access_hhmm),
        parse_hhmm_minutes(start_hhmm),
        parse_hhmm_minutes(end_hhmm),
    ) {
        (Some(cur), Some(start), Some(end)) => cur >= start && cur <= end,
        _ => false,
    }
}

pub fn is_minimum_activity_satisfied(
    session_type: SessionType,
    minimum_read_pct: u8,
    activity: ActivityPayload,
) -> bool {
    match session_type {
        SessionType::Teori => {
            activity.read_pct >= minimum_read_pct
                || activity.submitted_task
                || activity.submitted_reflection
        }
        SessionType::Praktik => activity.submitted_task || activity.submitted_reflection,
        SessionType::Tugas => activity.submitted_task,
    }
}

pub fn evaluate_session_access(
    existing_record: Option<&AttendanceRecord>,
    session: &TeachingSession,
    student_id: &StudentId,
    access_time_hhmm: &str,
    timestamp_iso: &str,
    activity: ActivityPayload,
) -> Result<AttendanceRecord, DomainError> {
    if session.status != SessionStatus::Open {
        return Err(DomainError::validation(
            "session.status",
            "Sesi pembelajaran belum dibuka atau sudah ditutup.",
        ));
    }

    if !is_within_time_window(access_time_hhmm, &session.jam_mulai, &session.jam_selesai) {
        return Err(DomainError::validation(
            "waktu",
            format!(
                "Akses berada di luar jendela waktu sesi ({}–{}).",
                session.jam_mulai, session.jam_selesai
            ),
        ));
    }

    let merged_read_pct = existing_record
        .map(|r| r.read_pct.max(activity.read_pct))
        .unwrap_or(activity.read_pct);
    let merged_task = existing_record.map(|r| r.submitted_task).unwrap_or(false)
        || activity.submitted_task;
    let merged_reflection = existing_record
        .map(|r| r.submitted_reflection)
        .unwrap_or(false)
        || activity.submitted_reflection;

    let activity_met = is_minimum_activity_satisfied(
        session.tipe_sesi,
        session.minimum_read_pct,
        ActivityPayload {
            read_pct: merged_read_pct,
            submitted_task: merged_task,
            submitted_reflection: merged_reflection,
        },
    );

    let preserved_manual = existing_record
        .and_then(|r| {
            if r.override_oleh.is_some()
                && matches!(r.status, AttendanceStatus::Izin | AttendanceStatus::Sakit)
            {
                Some(r.status)
            } else {
                None
            }
        });

    let status = if let Some(manual) = preserved_manual {
        manual
    } else if activity_met {
        AttendanceStatus::Hadir
    } else {
        AttendanceStatus::AksesTanpaAktivitas
    };

    Ok(AttendanceRecord {
        id: existing_record
            .map(|r| r.id.clone())
            .unwrap_or_else(|| format!("att-{}-{}", session.id.0, student_id.0)),
        session_id: session.id.clone(),
        student_id: student_id.clone(),
        status,
        aktivitas_minimum_terpenuhi: activity_met,
        read_pct: merged_read_pct,
        submitted_task: merged_task,
        submitted_reflection: merged_reflection,
        diakses_pada: Some(
            existing_record
                .and_then(|r| r.diakses_pada.clone())
                .unwrap_or_else(|| timestamp_iso.to_string()),
        ),
        diaktifkan_pada: if activity_met {
            Some(
                existing_record
                    .and_then(|r| r.diaktifkan_pada.clone())
                    .unwrap_or_else(|| timestamp_iso.to_string()),
            )
        } else {
            None
        },
        override_oleh: existing_record.and_then(|r| r.override_oleh.clone()),
        alasan_override: existing_record.and_then(|r| r.alasan_override.clone()),
    })
}

pub fn apply_teacher_attendance_override(
    existing_record: Option<&AttendanceRecord>,
    session_id: &SessionId,
    student_id: &StudentId,
    new_status: AttendanceStatus,
    teacher_user_id: &UserId,
    reason: &str,
    timestamp_iso: &str,
) -> Result<AttendanceRecord, DomainError> {
    let trimmed = reason.trim();
    if trimmed.len() < 5 {
        return Err(DomainError::validation(
            "alasan_override",
            "Override absensi wajib menyertakan alasan minimal 5 karakter.",
        ));
    }

    Ok(AttendanceRecord {
        id: existing_record
            .map(|r| r.id.clone())
            .unwrap_or_else(|| format!("att-{}-{}", session_id.0, student_id.0)),
        session_id: session_id.clone(),
        student_id: student_id.clone(),
        status: new_status,
        aktivitas_minimum_terpenuhi: if new_status == AttendanceStatus::Hadir {
            true
        } else {
            existing_record
                .map(|r| r.aktivitas_minimum_terpenuhi)
                .unwrap_or(false)
        },
        read_pct: existing_record.map(|r| r.read_pct).unwrap_or(0),
        submitted_task: existing_record.map(|r| r.submitted_task).unwrap_or(false),
        submitted_reflection: existing_record
            .map(|r| r.submitted_reflection)
            .unwrap_or(false),
        diakses_pada: Some(
            existing_record
                .and_then(|r| r.diakses_pada.clone())
                .unwrap_or_else(|| timestamp_iso.to_string()),
        ),
        diaktifkan_pada: if new_status == AttendanceStatus::Hadir {
            Some(
                existing_record
                    .and_then(|r| r.diaktifkan_pada.clone())
                    .unwrap_or_else(|| timestamp_iso.to_string()),
            )
        } else {
            existing_record.and_then(|r| r.diaktifkan_pada.clone())
        },
        override_oleh: Some(teacher_user_id.clone()),
        alasan_override: Some(trimmed.to_string()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{AssignmentId, SessionId};

    fn sample_session() -> TeachingSession {
        TeachingSession {
            id: SessionId("ses-1".into()),
            teacher_assignment_id: AssignmentId("ta-1".into()),
            pertemuan_ke: 1,
            tanggal: "2026-11-16".into(),
            jam_mulai: "07:30".into(),
            jam_selesai: "10:00".into(),
            tipe_sesi: SessionType::Teori,
            topik: "Matriks".into(),
            module_id: None,
            status: SessionStatus::Open,
            minimum_read_pct: 60,
        }
    }

    #[test]
    fn distinguishes_hadir_vs_akses_tanpa_aktivitas() {
        let ses = sample_session();

        let low = evaluate_session_access(
            None,
            &ses,
            &StudentId("stu-1".into()),
            "08:00",
            "2026-11-16T08:00:00Z",
            ActivityPayload {
                read_pct: 15,
                submitted_task: false,
                submitted_reflection: false,
            },
        )
        .unwrap();
        assert_eq!(low.status, AttendanceStatus::AksesTanpaAktivitas);
        assert!(!low.aktivitas_minimum_terpenuhi);

        let full = evaluate_session_access(
            Some(&low),
            &ses,
            &StudentId("stu-1".into()),
            "08:15",
            "2026-11-16T08:15:00Z",
            ActivityPayload {
                read_pct: 85,
                submitted_task: false,
                submitted_reflection: false,
            },
        )
        .unwrap();
        assert_eq!(full.status, AttendanceStatus::Hadir);
        assert!(full.aktivitas_minimum_terpenuhi);
    }

    #[test]
    fn rejects_access_outside_session_window() {
        let ses = sample_session();
        let err = evaluate_session_access(
            None,
            &ses,
            &StudentId("stu-1".into()),
            "11:30",
            "2026-11-16T11:30:00Z",
            ActivityPayload {
                read_pct: 100,
                submitted_task: true,
                submitted_reflection: true,
            },
        )
        .unwrap_err();
        assert_eq!(err.http_status(), 422);
    }

    #[test]
    fn override_requires_valid_reason() {
        let err = apply_teacher_attendance_override(
            None,
            &SessionId("ses-1".into()),
            &StudentId("stu-1".into()),
            AttendanceStatus::Izin,
            &UserId("usr-budi".into()),
            "ok",
            "2026-11-16T09:00:00Z",
        )
        .unwrap_err();
        assert_eq!(err.http_status(), 422);

        let ok = apply_teacher_attendance_override(
            None,
            &SessionId("ses-1".into()),
            &StudentId("stu-1".into()),
            AttendanceStatus::Izin,
            &UserId("usr-budi".into()),
            "Surat izin dispen lomba LKS",
            "2026-11-16T09:00:00Z",
        )
        .unwrap();
        assert_eq!(ok.status, AttendanceStatus::Izin);
        assert_eq!(
            ok.alasan_override.as_deref(),
            Some("Surat izin dispen lomba LKS")
        );
    }
}
