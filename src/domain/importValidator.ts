/**
 * Atomic Row-Level Excel/CSV Import Validator
 * - Previews valid vs error rows before commit
 * - Detects duplicate NISN / NUPTK both within file and against DB
 * - Generates downloadable error log
 */

import { DomainError, err, ok, Result, validationError } from './result';
import {
  ImportBatchType,
  Major,
  Rombel,
  Student,
  Teacher,
} from './types';

export interface ParsedStudentRow {
  readonly rowNumber: number;
  readonly nisn: string;
  readonly nis: string;
  readonly nama: string;
  readonly rombelName: string;
  readonly rombelId: string;
  readonly majorCode: string;
  readonly jenisKelamin: 'L' | 'P';
}

export interface ParsedTeacherRow {
  readonly rowNumber: number;
  readonly nuptk: string;
  readonly nip: string;
  readonly nama: string;
  readonly email: string;
  readonly bidang: string;
}

export interface ImportRowError {
  readonly row: number;
  readonly raw: string;
  readonly reason: string;
}

export interface ImportPreview<T> {
  readonly tipe: ImportBatchType;
  readonly totalRows: number;
  readonly validRows: ReadonlyArray<T>;
  readonly errorRows: ReadonlyArray<ImportRowError>;
  readonly errorLogText: string;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if ((ch === ',' || ch === ';') && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function previewStudentImportCsv(params: {
  readonly csvText: string;
  readonly existingStudents: ReadonlyArray<Student>;
  readonly rombels: ReadonlyArray<Rombel>;
  readonly majors: ReadonlyArray<Major>;
}): Result<ImportPreview<ParsedStudentRow>, DomainError> {
  const lines = params.csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return err(
      validationError(
        'file',
        'File kosong atau hanya berisi header tanpa baris data siswa.',
      ),
    );
  }

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = {
    nisn: headers.indexOf('nisn'),
    nis: headers.indexOf('nis'),
    nama: headers.indexOf('nama'),
    rombel: headers.indexOf('rombel'),
    jurusan: headers.indexOf('jurusan'),
    jk: headers.indexOf('jenis_kelamin'),
  };

  if (
    idx.nisn === -1 ||
    idx.nis === -1 ||
    idx.nama === -1 ||
    idx.rombel === -1 ||
    idx.jurusan === -1 ||
    idx.jk === -1
  ) {
    return err(
      validationError(
        'headers',
        'Kolom wajib siswa tidak lengkap. Wajib ada: nisn, nis, nama, rombel, jurusan, jenis_kelamin.',
      ),
    );
  }

  const existingNisns = new Set(params.existingStudents.map((s) => s.nisn));
  const seenInFile = new Set<string>();
  const validRows: ParsedStudentRow[] = [];
  const errorRows: ImportRowError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const cols = splitCsvLine(lines[i]);
    if (cols.length < headers.length) {
      errorRows.push({
        row: rowNum,
        raw: lines[i],
        reason: `Jumlah kolom kurang (${cols.length} dari ${headers.length} kolom wajib).`,
      });
      continue;
    }

    const nisn = cols[idx.nisn];
    const nis = cols[idx.nis];
    const nama = cols[idx.nama];
    const rombelName = cols[idx.rombel];
    const majorCode = cols[idx.jurusan].toUpperCase();
    const jk = cols[idx.jk].toUpperCase();

    if (!/^\d{10}$/.test(nisn)) {
      errorRows.push({
        row: rowNum,
        raw: lines[i],
        reason: `NISN "${nisn}" tidak valid (harus 10 digit angka).`,
      });
      continue;
    }
    if (seenInFile.has(nisn)) {
      errorRows.push({
        row: rowNum,
        raw: lines[i],
        reason: `NISN ${nisn} duplikat di dalam file upload.`,
      });
      continue;
    }
    if (existingNisns.has(nisn)) {
      errorRows.push({
        row: rowNum,
        raw: lines[i],
        reason: `NISN ${nisn} sudah terdaftar di database sekolah.`,
      });
      continue;
    }
    if (!nama || nama.length < 2) {
      errorRows.push({
        row: rowNum,
        raw: lines[i],
        reason: 'Nama siswa wajib diisi.',
      });
      continue;
    }
    if (jk !== 'L' && jk !== 'P') {
      errorRows.push({
        row: rowNum,
        raw: lines[i],
        reason: `jenis_kelamin "${jk}" harus L atau P.`,
      });
      continue;
    }

    const major = params.majors.find(
      (m) => m.kode.toUpperCase() === majorCode || m.nama.toUpperCase() === majorCode,
    );
    if (!major) {
      errorRows.push({
        row: rowNum,
        raw: lines[i],
        reason: `Jurusan "${majorCode}" tidak ditemukan di master 14 jurusan.`,
      });
      continue;
    }

    const rombel = params.rombels.find(
      (r) => r.nama_rombel.toLowerCase() === rombelName.toLowerCase(),
    );
    if (!rombel) {
      errorRows.push({
        row: rowNum,
        raw: lines[i],
        reason: `Rombel "${rombelName}" belum terdaftar di master rombel.`,
      });
      continue;
    }

    seenInFile.add(nisn);
    validRows.push({
      rowNumber: rowNum,
      nisn,
      nis,
      nama,
      rombelName: rombel.nama_rombel,
      rombelId: rombel.id,
      majorCode: major.kode,
      jenisKelamin: jk,
    });
  }

  const errorLogText =
    errorRows.length === 0
      ? 'Semua baris valid (0 error).'
      : errorRows.map((e) => `Baris ${e.row}: ${e.reason} | Data: ${e.raw}`).join('\n');

  return ok({
    tipe: 'SISWA',
    totalRows: lines.length - 1,
    validRows,
    errorRows,
    errorLogText,
  });
}

export function previewTeacherImportCsv(params: {
  readonly csvText: string;
  readonly existingTeachers: ReadonlyArray<Teacher>;
}): Result<ImportPreview<ParsedTeacherRow>, DomainError> {
  const lines = params.csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return err(validationError('file', 'File import guru kosong.'));
  }

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = {
    nuptk: headers.indexOf('nuptk'),
    nip: headers.indexOf('nip'),
    nama: headers.indexOf('nama'),
    email: headers.indexOf('email'),
    bidang: headers.indexOf('mapel'),
  };

  if (idx.nuptk === -1 || idx.nama === -1 || idx.bidang === -1) {
    return err(
      validationError(
        'headers',
        'Kolom wajib guru tidak lengkap (minimal: nuptk, nama, mapel).',
      ),
    );
  }

  const existingNuptks = new Set(params.existingTeachers.map((t) => t.nuptk));
  const seen = new Set<string>();
  const validRows: ParsedTeacherRow[] = [];
  const errorRows: ImportRowError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const cols = splitCsvLine(lines[i]);
    const nuptk = cols[idx.nuptk] ?? '';
    const nip = idx.nip >= 0 ? cols[idx.nip] ?? '' : '';
    const nama = cols[idx.nama] ?? '';
    const email =
      idx.email >= 0 && cols[idx.email]
        ? cols[idx.email]
        : `${nuptk}@smkn1percut.sch.id`;
    const bidang = cols[idx.bidang] ?? '';

    if (nuptk.length < 8) {
      errorRows.push({
        row: rowNum,
        raw: lines[i],
        reason: `NUPTK "${nuptk}" terlalu pendek.`,
      });
      continue;
    }
    if (seen.has(nuptk) || existingNuptks.has(nuptk)) {
      errorRows.push({
        row: rowNum,
        raw: lines[i],
        reason: `NUPTK ${nuptk} duplikat atau sudah terdaftar.`,
      });
      continue;
    }
    if (!nama || !bidang) {
      errorRows.push({
        row: rowNum,
        raw: lines[i],
        reason: 'Nama guru dan mapel wajib diisi.',
      });
      continue;
    }
    seen.add(nuptk);
    validRows.push({ rowNumber: rowNum, nuptk, nip, nama, email, bidang });
  }

  return ok({
    tipe: 'GURU',
    totalRows: lines.length - 1,
    validRows,
    errorRows,
    errorLogText:
      errorRows.length === 0
        ? 'Semua baris guru valid (0 error).'
        : errorRows.map((e) => `Baris ${e.row}: ${e.reason}`).join('\n'),
  });
}
