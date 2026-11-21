/**
 * Teaching Document & External AI Prompt Generator
 * - Model-agnostic prompt assembly (Gemini, DeepSeek, Claude, ChatGPT)
 * - Strictly excludes student PII (NISN, student names)
 * - Enforces dual-track K13 (KI/KD) vs MERDEKA (CP/TP/ATP/KKTP)
 * - Requires 100% validation checklist before PUBLISHED; any post-publish edit reverts to DRAFT
 */

import { DomainError, err, ok, Result, validationError } from './result';
import {
  AcademicYear,
  Major,
  PromptTemplate,
  Rombel,
  School,
  Subject,
  TeacherAssignment,
  TeacherDocument,
  User,
} from './types';

export interface PromptContextData {
  readonly school: School;
  readonly academicYear: AcademicYear;
  readonly teacherUser: User;
  readonly teacherNip: string;
  readonly subject: Subject;
  readonly rombel: Rombel;
  readonly major: Major;
  readonly assignment: TeacherAssignment;
  readonly studentCount: number;
}

export function resolveFaseFromTingkat(tingkat: 10 | 11 | 12): string {
  if (tingkat === 10) return 'Fase E (Kelas X SMK)';
  return `Fase F (Kelas ${tingkat === 11 ? 'XI' : 'XII'} SMK)`;
}

export function assemblePromptForTeacher(params: {
  readonly template: PromptTemplate;
  readonly context: PromptContextData;
  readonly teacherInputs: Readonly<Record<string, string>>;
}): Result<string, DomainError> {
  const { template, context, teacherInputs } = params;

  for (const field of template.input_fields) {
    if (field.required && !(teacherInputs[field.key] ?? '').trim()) {
      return err(
        validationError(
          field.key,
          `Kolom "${field.label}" wajib diisi sebelum membuat prompt.`,
        ),
      );
    }
  }

  const kurikulumLabel =
    context.assignment.kurikulum_acuan === 'K13'
      ? 'Kurikulum 2013 (Format KI / KD / Indikator Pencapaian Kompetensi)'
      : 'Kurikulum Merdeka (Format CP / TP / ATP / KKTP & Profil Pelajar Pancasila)';

  const replacements: Record<string, string> = {
    nama_sekolah: context.school.nama,
    npsn: context.school.npsn,
    kepala_sekolah: context.school.kepala_sekolah,
    nama_guru: context.teacherUser.nama,
    nip_guru: context.teacherNip || '-',
    mapel: `${context.subject.nama} (${context.subject.kelompok})`,
    kelas: context.rombel.nama_rombel,
    fase:
      context.assignment.kurikulum_acuan === 'MERDEKA'
        ? resolveFaseFromTingkat(context.rombel.tingkat)
        : `Tingkat ${context.rombel.tingkat} (K13 Revisi)`,
    jurusan: `${context.major.nama} (${context.major.kode})`,
    semester: context.academicYear.semester,
    tahun_ajaran: context.academicYear.tahun_ajaran,
    kurikulum_acuan: kurikulumLabel,
    jumlah_siswa: String(context.studentCount),
    alokasi_jp: `${context.assignment.jam_per_minggu} JP / minggu`,
  };

  for (const [k, v] of Object.entries(teacherInputs)) {
    replacements[k] = v.trim();
  }

  let output = template.template_body;
  for (const [key, val] of Object.entries(replacements)) {
    output = output.split(`{{${key}}}`).join(val);
  }

  output += `\n\n--- STRUKTUR OUTPUT YANG DIHARAPKAN ---\n${template.output_structure}`;
  output += `\n\n--- CATATAN PRIVASI ---\nPrompt ini disusun tanpa menyertakan data pribadi siswa (NISN/nama siswa). Dapat digunakan pada Gemini, Claude, DeepSeek, atau ChatGPT.`;

  return ok(output);
}

export function canPublishTeacherDocument(
  doc: TeacherDocument,
  template: PromptTemplate,
): Result<void, DomainError> {
  if (!doc.konten || doc.konten.trim().length < 20) {
    return err(
      validationError(
        'konten',
        'Konten perangkat ajar masih kosong atau terlalu singkat (minimal 20 karakter).',
      ),
    );
  }

  const unchecked = template.validation_checklist.filter(
    (item) => !doc.checklist_state[item],
  );
  if (unchecked.length > 0) {
    return err(
      validationError(
        'checklist',
        `Tidak dapat dipublikasikan: ${unchecked.length} item checklist validasi belum dicentang (${unchecked[0]}).`,
      ),
    );
  }

  return ok(undefined);
}

export function applyTeacherDocumentContentEdit(
  doc: TeacherDocument,
  newJudul: string,
  newKonten: string,
  timestampIso: string,
): TeacherDocument {
  // Guardrail: any edit after publish automatically returns status to DRAFT
  return {
    ...doc,
    judul: newJudul,
    konten: newKonten,
    status: 'DRAFT',
    pasted_at: doc.pasted_at ?? timestampIso,
    published_at: null,
  };
}
