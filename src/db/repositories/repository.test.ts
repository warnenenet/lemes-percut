import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonFallbackRepository } from './jsonRepository';
import {
  listDiskBackupFiles,
  resolveStoredFilePath,
  saveUploadedFile,
} from '../storage';

function makeTempRepo(): { repo: JsonFallbackRepository; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-repo-test-'));
  const dbPath = path.join(dir, 'lms_state.json');
  const repo = new JsonFallbackRepository(dbPath);
  return {
    repo,
    cleanup: () => {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('Repository Auth: authenticates by email, NISN, NUPTK and rejects bad password', async () => {
  const { repo, cleanup } = makeTempRepo();
  try {
    const emailAuth = await repo.authenticateUser(
      'budi.mtk@smkn1percut.sch.id',
      'smkn1percut',
    );
    assert.equal(emailAuth.ok, true);
    if (emailAuth.ok) assert.equal(emailAuth.value.id, 'usr-budi');

    const nisnAuth = await repo.authenticateUser('0081234501', 'smkn1percut');
    assert.equal(nisnAuth.ok, true);
    if (nisnAuth.ok) assert.equal(nisnAuth.value.id, 'usr-rizky');

    const badPass = await repo.authenticateUser(
      'budi.mtk@smkn1percut.sch.id',
      'wrongpass',
    );
    assert.equal(badPass.ok, false);
    if (!badPass.ok) assert.equal(badPass.error.httpStatus, 401);
  } finally {
    cleanup();
  }
});

test('Repository Notebook Privacy: strips notebook entries for BK/Wali/Kepsek & blocks direct read (403)', async () => {
  const { repo, cleanup } = makeTempRepo();
  try {
    const bkCtx = (await repo.resolveAuthContext('usr-hendra', 'GURU_BK'))!;
    const bkState = await repo.getWorkspaceState(bkCtx);
    assert.equal(bkState.state.notebook_entries.length, 0);
    assert.ok(bkState.state.notebook_metadata.length > 0);

    const firstNbId = bkState.state.notebooks[0].id;
    const directBkRead = await repo.getNotebookEntries(bkCtx, firstNbId);
    assert.equal(directBkRead.ok, false);
    if (!directBkRead.ok) assert.equal(directBkRead.error.httpStatus, 403);

    const waliCtx = (await repo.resolveAuthContext('usr-budi', 'WALI_KELAS'))!;
    const waliState = await repo.getWorkspaceState(waliCtx);
    assert.equal(waliState.state.notebook_entries.length, 0);

    const studentCtx = (await repo.resolveAuthContext('usr-rizky', 'SISWA'))!;
    const created = await repo.createNotebookEntry(studentCtx, 'sub-mtk', {
      judul: 'Ringkasan Matriks 2x2',
      konten: 'Determinan ad - bc harus tidak nol agar memiliki invers.',
      gambar_url: '/api/files/notebooks/sample.png',
    });
    assert.equal(created.ok, true);

    const studentRead = await repo.getNotebookEntries(studentCtx, firstNbId);
    assert.equal(studentRead.ok, true);
    if (studentRead.ok) {
      assert.ok(
        studentRead.value.some((e) => e.judul === 'Ringkasan Matriks 2x2'),
      );
    }
  } finally {
    cleanup();
  }
});

test('Repository Cross-Teacher Isolation & Attendance Activity Tracking', async () => {
  const { repo, cleanup } = makeTempRepo();
  try {
    const budiCtx = (await repo.resolveAuthContext('usr-budi', 'GURU_MAPEL'))!;
    const studentCtx = (await repo.resolveAuthContext('usr-rizky', 'SISWA'))!;

    const crossGrade = await repo.upsertGrade(budiCtx, {
      student_id: 'stu-rizky',
      teacher_assignment_id: 'ta-siti-mtk-xiitkj1',
      component_id: 'gc-5',
      nilai: 95,
    });
    assert.equal(crossGrade.ok, false);
    if (!crossGrade.ok) assert.equal(crossGrade.error.httpStatus, 403);

    const crossSession = await repo.createSession(budiCtx, {
      teacher_assignment_id: 'ta-siti-mtk-xiitkj1',
      topik: 'Sesi Illegal',
      jam_mulai: '08:00',
      jam_selesai: '09:30',
    });
    assert.equal(crossSession.ok, false);
    if (!crossSession.ok) assert.equal(crossSession.error.httpStatus, 403);

    const lowActivity = await repo.recordSessionAccess(studentCtx, 'ses-1', {
      readPct: 15,
      simulatedTimeHHmm: '08:15',
    });
    assert.equal(lowActivity.ok, true);
    if (lowActivity.ok) {
      assert.equal(lowActivity.value.status, 'AKSES_TANPA_AKTIVITAS');
    }

    const fullActivity = await repo.recordSessionAccess(studentCtx, 'ses-1', {
      readPct: 90,
      simulatedTimeHHmm: '08:30',
    });
    assert.equal(fullActivity.ok, true);
    if (fullActivity.ok) {
      assert.equal(fullActivity.value.status, 'HADIR');
    }

    const badOverride = await repo.overrideSessionAttendance(budiCtx, 'ses-1', {
      student_id: 'stu-rizky',
      status: 'IZIN',
      alasan: 'abc',
    });
    assert.equal(badOverride.ok, false);
    if (!badOverride.ok) assert.equal(badOverride.error.httpStatus, 422);

    const validOverride = await repo.overrideSessionAttendance(
      budiCtx,
      'ses-1',
      {
        student_id: 'stu-rizky',
        status: 'SAKIT',
        alasan: 'Surat keterangan dokter puskesmas sudah diterima wali kelas.',
      },
    );
    assert.equal(validOverride.ok, true);
    if (validOverride.ok) assert.equal(validOverride.value.status, 'SAKIT');
  } finally {
    cleanup();
  }
});

test('Repository CBT Overlap (409), Susulan RBAC (403), Token & Scoring Flow', async () => {
  const { repo, cleanup } = makeTempRepo();
  try {
    const budiCtx = (await repo.resolveAuthContext('usr-budi', 'GURU_MAPEL'))!;
    const bkCtx = (await repo.resolveAuthContext('usr-hendra', 'GURU_BK'))!;
    const studentCtx = (await repo.resolveAuthContext('usr-rizky', 'SISWA'))!;

    const overlapExam = await repo.createExam(budiCtx, {
      teacher_assignment_id: 'ta-budi-pwb-xirpl1',
      tipe: 'CUSTOM',
      judul: 'UH PWB Bentrok',
      waktu_mulai: '2026-11-16T08:30:00Z',
      durasi_menit: 60,
    });
    assert.equal(overlapExam.ok, false);
    if (!overlapExam.ok) assert.equal(overlapExam.error.httpStatus, 409);

    const bkSusulan = await repo.createExam(bkCtx, {
      teacher_assignment_id: 'ta-budi-mtk-xirpl1',
      tipe: 'SUSULAN',
      judul: 'Susulan Ilegal BK',
      waktu_mulai: '2026-11-20T10:00:00Z',
      durasi_menit: 45,
      target_student_ids: ['stu-rizky'],
    });
    assert.equal(bkSusulan.ok, false);
    if (!bkSusulan.ok) assert.equal(bkSusulan.error.httpStatus, 403);

    const validSusulan = await repo.createExam(budiCtx, {
      teacher_assignment_id: 'ta-budi-mtk-xirpl1',
      tipe: 'SUSULAN',
      judul: 'Susulan Matematika XI RPL 1',
      waktu_mulai: '2026-11-20T10:00:00Z',
      durasi_menit: 45,
      target_student_ids: ['stu-rizky'],
    });
    assert.equal(validSusulan.ok, true);

    const badToken = await repo.startExamSession(studentCtx, 'ex-1', 'WRONG');
    assert.equal(badToken.ok, false);
    if (!badToken.ok) assert.equal(badToken.error.httpStatus, 422);

    const started = await repo.startExamSession(studentCtx, 'ex-1', 'RPL2026');
    assert.equal(started.ok, true);
    if (started.ok) {
      const ws = await repo.getWorkspaceState(studentCtx);
      const q1 = ws.state.questions[0];
      const saved = await repo.saveExamAnswer(studentCtx, started.value.id, {
        question_id: q1.id,
        jawaban: q1.jawaban,
      });
      assert.equal(saved.ok, true);

      const finished = await repo.finishExamSession(
        studentCtx,
        started.value.id,
      );
      assert.equal(finished.ok, true);
      if (finished.ok) {
        assert.equal(finished.value.exam_session.status, 'SELESAI');
        assert.ok(finished.value.summary.percentage >= 0);
      }
    }
  } finally {
    cleanup();
  }
});

test('Repository e-Rapor Dynamic Mapping & Atomic CSV Import Commit', async () => {
  const { repo, cleanup } = makeTempRepo();
  try {
    const adminCtx = (await repo.resolveAuthContext('usr-admin', 'ADMIN'))!;
    const budiCtx = (await repo.resolveAuthContext('usr-budi', 'GURU_MAPEL'))!;

    const mapUpdate = await repo.updateEraporMapping(adminCtx, {
      template_name: 'Format e-Rapor SMK v2026',
      mapping: [
        { erapor_column: 'NISN_SISWA', system_field: 'nisn' },
        { erapor_column: 'NAMA_LENGKAP', system_field: 'nama_siswa' },
        { erapor_column: 'NILAI_FINAL', system_field: 'nilai_akhir' },
      ],
    });
    assert.equal(mapUpdate.ok, true);

    const exported = await repo.exportErapor(budiCtx, {
      teacher_assignment_id: 'ta-budi-mtk-xirpl1',
    });
    assert.equal(exported.ok, true);
    if (exported.ok) {
      assert.deepEqual(exported.value.headers, [
        'NISN_SISWA',
        'NAMA_LENGKAP',
        'NILAI_FINAL',
      ]);
      assert.ok(
        exported.value.csvContent.startsWith(
          '"NISN_SISWA","NAMA_LENGKAP","NILAI_FINAL"',
        ),
      );
    }

    const csv = [
      'nisn,nis,nama,rombel,jurusan,jenis_kelamin',
      '0091112233,249901,Siti Nurhaliza,XI RPL 1,RPL,P',
      '0081234501,249902,Duplikat Rizky,XI RPL 1,RPL,L',
    ].join('\n');

    const commitRes = await repo.commitStudentImport(adminCtx, {
      tipe: 'SISWA',
      filename: 'dapodik_baru.csv',
      csv_text: csv,
    });
    assert.equal(commitRes.ok, true);
    if (commitRes.ok) {
      assert.equal(commitRes.value.batch.baris_sukses, 1);
      assert.equal(commitRes.value.batch.baris_error, 1);
      const counts = await repo.getHealthCounts();
      assert.equal(counts.students, 181);
    }
  } finally {
    cleanup();
  }
});

test('Storage Security: saves allowed uploads, blocks path traversal / bad ext / >5MB, detects 0-byte backup', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-storage-test-'));
  const prevStorage = process.env.STORAGE_DIR;
  const prevBackup = process.env.BACKUP_DIR;
  const storageDir = path.join(tempRoot, 'storage');
  const backupDir = path.join(tempRoot, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  process.env.STORAGE_DIR = storageDir;
  process.env.BACKUP_DIR = backupDir;

  try {
    const validPng = saveUploadedFile({
      category: 'notebooks',
      originalName: 'sketsa-rangkaian.png',
      mimeType: 'image/png',
      base64Data: Buffer.from('fake-png-content').toString('base64'),
    });
    assert.equal(validPng.ok, true);
    if (validPng.ok) {
      assert.ok(validPng.value.url.startsWith('/api/files/notebooks/'));
      const resolved = resolveStoredFilePath(
        'notebooks',
        validPng.value.filename,
      );
      assert.ok(resolved !== null && fs.existsSync(resolved));
    }

    assert.equal(resolveStoredFilePath('notebooks', '../etc/passwd'), null);
    assert.equal(resolveStoredFilePath('secrets', 'test.png'), null);

    const badExt = saveUploadedFile({
      category: 'modules',
      originalName: 'malware.exe',
      mimeType: 'application/octet-stream',
      base64Data: Buffer.from('MZ').toString('base64'),
    });
    assert.equal(badExt.ok, false);
    if (!badExt.ok) assert.equal(badExt.error.httpStatus, 422);

    const oversized = saveUploadedFile({
      category: 'submissions',
      originalName: 'huge.pdf',
      mimeType: 'application/pdf',
      base64Data: Buffer.alloc(5 * 1024 * 1024 + 16, 65).toString('base64'),
    });
    assert.equal(oversized.ok, false);
    if (!oversized.ok) assert.equal(oversized.error.httpStatus, 413);

    fs.writeFileSync(path.join(backupDir, 'ok_backup.sql.gz'), 'gzip-bytes');
    fs.writeFileSync(path.join(backupDir, 'corrupt_empty.sql.gz'), '');
    const backups = listDiskBackupFiles(backupDir);
    assert.equal(backups.length, 2);
    const emptyBkp = backups.find((b) => b.filename === 'corrupt_empty.sql.gz');
    const okBkp = backups.find((b) => b.filename === 'ok_backup.sql.gz');
    assert.equal(emptyBkp?.status, 'EMPTY_ALERT');
    assert.equal(okBkp?.status, 'OK');
  } finally {
    if (prevStorage === undefined) delete process.env.STORAGE_DIR;
    else process.env.STORAGE_DIR = prevStorage;
    if (prevBackup === undefined) delete process.env.BACKUP_DIR;
    else process.env.BACKUP_DIR = prevBackup;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
