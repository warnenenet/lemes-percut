/**
 * Grading & Dynamic e-Rapor Export Mapping Engine
 * - Calculates weighted component final grades
 * - Warns if active component weights != 100%
 * - Exports strictly from admin-configured EraporColumnMapping (never hardcoded)
 */

import { DomainError, err, ok, Result, validationError } from './result';
import {
  CurriculumTrack,
  EraporColumnMapping,
  GradeComponent,
  GradeRecord,
  PklScore,
  Rombel,
  Student,
  User,
} from './types';

export function validateComponentWeights(
  components: ReadonlyArray<GradeComponent>,
): { readonly valid: boolean; readonly totalWeight: number; readonly message: string | null } {
  const active = components.filter((c) => c.nama !== 'REMEDIAL');
  const totalWeight = active.reduce((acc, c) => acc + c.bobot, 0);
  if (Math.abs(totalWeight - 100) > 0.01) {
    return {
      valid: false,
      totalWeight,
      message: `Total bobot komponen aktif adalah ${totalWeight}% (seharusnya 100%).`,
    };
  }
  return { valid: true, totalWeight, message: null };
}

export function determinePredicate(
  score: number | null,
  track: CurriculumTrack,
): string {
  if (score === null) return '';
  if (track === 'K13') {
    if (score >= 90) return 'A (Sangat Baik)';
    if (score >= 80) return 'B (Baik)';
    if (score >= 75) return 'C (Cukup)';
    return 'D (Kurang)';
  }
  // Kurikulum Merdeka descriptive achievement tier
  if (score >= 90) return 'Mahir';
  if (score >= 80) return 'Cakap';
  if (score >= 75) return 'Layak';
  return 'Perlu Bimbingan';
}

export function calculateStudentFinalGrade(params: {
  readonly studentId: string;
  readonly components: ReadonlyArray<GradeComponent>;
  readonly grades: ReadonlyArray<GradeRecord>;
  readonly track: CurriculumTrack;
}): { readonly nilaiAkhir: number | null; readonly predikat: string } {
  const nonRemedial = params.components.filter((c) => c.nama !== 'REMEDIAL');
  let weightedSum = 0;
  let weightUsed = 0;

  for (const comp of nonRemedial) {
    const rec = params.grades.find(
      (g) => g.student_id === params.studentId && g.component_id === comp.id,
    );
    if (rec) {
      weightedSum += rec.nilai * (comp.bobot / 100);
      weightUsed += comp.bobot;
    }
  }

  if (weightUsed === 0) {
    return { nilaiAkhir: null, predikat: '' };
  }

  // Apply remedial cap rule if remedial component exists and improves score up to KKM (75)
  const remedialComp = params.components.find((c) => c.nama === 'REMEDIAL');
  const remedialGrade = remedialComp
    ? params.grades.find(
        (g) => g.student_id === params.studentId && g.component_id === remedialComp.id,
      )
    : undefined;

  let finalScore = Math.round(weightedSum * 100) / 100;
  if (remedialGrade && remedialGrade.nilai > finalScore) {
    finalScore = Math.min(78, remedialGrade.nilai);
  }

  return {
    nilaiAkhir: finalScore,
    predikat: determinePredicate(finalScore, params.track),
  };
}

export interface EraporExportResult {
  readonly headers: ReadonlyArray<string>;
  readonly rows: ReadonlyArray<Record<string, string>>;
  readonly csvContent: string;
}

export function generateEraporExport(params: {
  readonly mapping: EraporColumnMapping | undefined;
  readonly rombel: Rombel;
  readonly students: ReadonlyArray<Student>;
  readonly users: ReadonlyArray<User>;
  readonly components: ReadonlyArray<GradeComponent>;
  readonly grades: ReadonlyArray<GradeRecord>;
}): Result<EraporExportResult, DomainError> {
  if (!params.mapping || params.mapping.mapping.length === 0) {
    return err(
      validationError(
        'erapor_mapping',
        'Mapping kolom e-Rapor belum dikonfigurasi oleh Admin. Hubungi Admin sebelum export.',
      ),
    );
  }

  const hasIdentifier = params.mapping.mapping.some(
    (m) => m.system_field === 'nisn' || m.system_field === 'nis',
  );
  const hasFinal = params.mapping.mapping.some(
    (m) => m.system_field === 'nilai_akhir',
  );

  if (!hasIdentifier || !hasFinal) {
    return err(
      validationError(
        'erapor_mapping',
        'Mapping e-Rapor belum lengkap: wajib memetakan kolom NISN/NIS dan nilai_akhir.',
      ),
    );
  }

  const rombelStudents = params.students.filter(
    (s) => s.rombel_id === params.rombel.id && s.status !== 'ALUMNI',
  );

  const headers = params.mapping.mapping.map((m) => m.erapor_column);
  const rows: Array<Record<string, string>> = [];

  for (const student of rombelStudents) {
    const user = params.users.find((u) => u.id === student.user_id);
    const { nilaiAkhir, predikat } = calculateStudentFinalGrade({
      studentId: student.id,
      components: params.components,
      grades: params.grades,
      track: params.rombel.kurikulum_acuan,
    });

    const getCompScore = (name: string): string => {
      const comp = params.components.find((c) => c.nama === name);
      if (!comp) return '';
      const rec = params.grades.find(
        (g) => g.student_id === student.id && g.component_id === comp.id,
      );
      return rec ? String(rec.nilai) : '';
    };

    const row: Record<string, string> = {};
    for (const colMap of params.mapping.mapping) {
      let val = '';
      switch (colMap.system_field) {
        case 'nisn':
          val = student.nisn;
          break;
        case 'nis':
          val = student.nis;
          break;
        case 'nama_siswa':
          val = user?.nama ?? '';
          break;
        case 'nama_rombel':
          val = params.rombel.nama_rombel;
          break;
        case 'nilai_formatif':
          val = getCompScore('FORMATIF');
          break;
        case 'nilai_sumatif':
          val = getCompScore('SUMATIF');
          break;
        case 'nilai_praktik':
          val = getCompScore('PRAKTIK');
          break;
        case 'nilai_akhir':
          val = nilaiAkhir !== null ? String(nilaiAkhir) : '';
          break;
        case 'predikat':
          val = predikat;
          break;
        case 'deskripsi_capaian':
          val =
            nilaiAkhir !== null
              ? `Menunjukkan penguasaan ${predikat.toLowerCase()} pada capaian pembelajaran.`
              : '';
          break;
      }
      row[colMap.erapor_column] = val;
    }
    rows.push(row);
  }

  const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;
  const csvLines = [
    headers.map(escapeCsv).join(','),
    ...rows.map((r) => headers.map((h) => escapeCsv(r[h] ?? '')).join(',')),
  ];

  return ok({
    headers,
    rows,
    csvContent: csvLines.join('\n'),
  });
}

/**
 * Computes official PKL score strictly from DUDI + Sekolah PKL components
 * (never overwritten by mapel_pkl_contributions).
 */
export function calculatePklFinalScore(
  scores: ReadonlyArray<PklScore>,
): { readonly dudiAvg: number; readonly sekolahAvg: number; readonly finalScore: number } {
  const dudi = scores.filter((s) => s.komponen.startsWith('DUDI_'));
  const sekolah = scores.filter((s) => s.komponen.startsWith('SEKOLAH_'));
  const dudiAvg =
    dudi.length > 0 ? dudi.reduce((a, b) => a + b.nilai, 0) / dudi.length : 0;
  const sekolahAvg =
    sekolah.length > 0
      ? sekolah.reduce((a, b) => a + b.nilai, 0) / sekolah.length
      : 0;
  // 60% DUDI + 40% Sekolah
  const finalScore = Math.round((dudiAvg * 0.6 + sekolahAvg * 0.4) * 10) / 10;
  return {
    dudiAvg: Math.round(dudiAvg * 10) / 10,
    sekolahAvg: Math.round(sekolahAvg * 10) / 10,
    finalScore,
  };
}
