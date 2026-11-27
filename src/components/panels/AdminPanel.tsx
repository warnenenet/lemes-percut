import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Database,
  Download,
  Upload,
} from 'lucide-react';
import { ClientStatePayload, apiRequest } from '../../api/client';
import { ImportPreview, ParsedStudentRow } from '../../domain/importValidator';
import { downloadCsvFile } from '../../utils/fileTools';

interface AdminPanelProps {
  section: string;
  engineName: 'mysql' | 'local-json-fallback';
  payload: ClientStatePayload;
  onRefresh: () => Promise<void>;
}

const SAMPLE_IMPORT_CSV = [
  'nisn,nis,nama,rombel,jurusan,jenis_kelamin',
  '0084567890,240115,Bima Sakti Harahap,XI RPL 1,RPL,L',
  '0084567891,240116,Putri Melati Siregar,XI RPL 1,RPL,P',
  '0081234501,240199,Duplikat Rizky (Harus Error),XI RPL 1,RPL,L',
  '12345,240198,NISN Tidak 10 Digit (Harus Error),XI RPL 1,RPL,L',
].join('\n');

export const AdminPanel: React.FC<AdminPanelProps> = ({
  section,
  engineName,
  payload,
  onRefresh,
}) => {
  const { auth, state } = payload;
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );
  const [csvText, setCsvText] = useState(SAMPLE_IMPORT_CSV);
  const [preview, setPreview] = useState<ImportPreview<ParsedStudentRow> | null>(null);
  const [dapodikPreview, setDapodikPreview] = useState<{
    kind: 'SISWA' | 'ROMBEL' | 'PKL';
    csv: string;
  } | null>(null);

  const [mappingDraft, setMappingDraft] = useState(
    state.erapor_mappings[0]?.mapping ?? [],
  );

  useEffect(() => {
    setMappingDraft(state.erapor_mappings[0]?.mapping ?? []);
  }, [state.erapor_mappings]);

  async function handlePreviewImport() {
    setFeedback(null);
    const res = await apiRequest<{
      ok: true;
      preview: ImportPreview<ParsedStudentRow>;
    }>('/api/admin/import/preview', {
      method: 'POST',
      userId: auth.user.id,
      activeRole: auth.activeRole,
      body: { tipe: 'SISWA', csv_text: csvText },
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setPreview(res.data.preview);
  }

  async function handleCommitImport() {
    setFeedback(null);
    const res = await apiRequest<{
      ok: true;
      batch: { baris_sukses: number; baris_error: number };
    }>('/api/admin/import/commit', {
      method: 'POST',
      userId: auth.user.id,
      activeRole: auth.activeRole,
      body: {
        tipe: 'SISWA',
        filename: 'batch_siswa_smkn1percut.csv',
        csv_text: csvText,
      },
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setFeedback({
      type: 'ok',
      text: `Import selesai: ${res.data.batch.baris_sukses} baris valid masuk ke database, ${res.data.batch.baris_error} baris error dilewati.`,
    });
    await onRefresh();
  }

  async function handleSaveEraporMapping() {
    setFeedback(null);
    const res = await apiRequest('/api/admin/erapor-mapping', {
      method: 'POST',
      userId: auth.user.id,
      activeRole: auth.activeRole,
      body: {
        template_name: state.erapor_mappings[0]?.template_name,
        mapping: mappingDraft,
      },
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setFeedback({
      type: 'ok',
      text: 'Mapping kolom e-Rapor diperbarui tanpa perlu deploy ulang.',
    });
    await onRefresh();
  }

  async function handleRunBackup(simulateZeroByte: boolean) {
    setFeedback(null);
    const res = await apiRequest<{
      ok: true;
      backup: { filename: string; size_bytes: number; status: string };
    }>('/api/admin/backup', {
      method: 'POST',
      userId: auth.user.id,
      activeRole: auth.activeRole,
      body: { simulate_zero_byte: simulateZeroByte },
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setFeedback({
      type: res.data.backup.status === 'OK' ? 'ok' : 'err',
      text:
        res.data.backup.status === 'OK'
          ? `Backup ${res.data.backup.filename} selesai (${res.data.backup.size_bytes} bytes).`
          : `ALERT: Backup ${res.data.backup.filename} berukuran 0 byte! Notifikasi alert dikirim ke Admin.`,
    });
    await onRefresh();
  }

  function generateDapodikCsv(kind: 'SISWA' | 'ROMBEL' | 'PKL') {
    if (kind === 'SISWA') {
      const header = 'NISN,NIS,Nama_PD,JK,Tanggal_Lahir,Rombel';
      const rows = state.students.map((s) => {
        const u = state.users.find((x) => x.id === s.user_id);
        const r = state.rombels.find((x) => x.id === s.rombel_id);
        return `${s.nisn},${s.nis},"${u?.nama ?? ''}",${s.jenis_kelamin},${s.tanggal_lahir},"${r?.nama_rombel ?? ''}"`;
      });
      setDapodikPreview({ kind, csv: [header, ...rows].join('\n') });
    } else if (kind === 'ROMBEL') {
      const header = 'Nama_Rombel,Tingkat,Jurusan,Kurikulum_Acuan';
      const rows = state.rombels.map((r) => {
        const m = state.majors.find((x) => x.id === r.major_id);
        return `"${r.nama_rombel}",${r.tingkat},"${m?.nama ?? ''}",${r.kurikulum_acuan}`;
      });
      setDapodikPreview({ kind, csv: [header, ...rows].join('\n') });
    } else {
      const header = 'NISN,Nama_Siswa,DUDI,Nomor_PKS,Mulai,Selesai';
      const rows = state.pkl_placements.map((p) => {
        const s = state.students.find((x) => x.id === p.student_id);
        const u = s ? state.users.find((x) => x.id === s.user_id) : undefined;
        const d = state.dudis.find((x) => x.id === p.dudi_id);
        const pks = state.pks_documents.find((x) => x.id === p.pks_id);
        return `${s?.nisn ?? ''},"${u?.nama ?? ''}","${d?.nama ?? ''}",${pks?.nomor ?? ''},${p.periode_mulai},${p.periode_selesai}`;
      });
      setDapodikPreview({ kind, csv: [header, ...rows].join('\n') });
    }
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          role="status"
          className={`p-3.5 rounded-lg border text-sm font-medium flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {section === 'dashboard' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500">
                  NPSN <span className="font-mono tabular-nums">{state.school.npsn}</span> ·{' '}
                  {state.school.alamat}
                </p>
                <h1 className="text-2xl font-bold text-slate-900 mt-1">
                  Panel Administrator — {state.school.nama}
                </h1>
              </div>
              <span className="text-xs font-mono text-slate-600">
                Engine: <strong className="text-slate-900">{engineName}</strong>
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-5 border-t border-slate-200">
              <div>
                <p className="text-xs text-slate-500">Konsentrasi Keahlian</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                  {state.majors.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Rombel Aktif</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-sky-900">
                  {state.rombels.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Siswa Terdaftar</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                  {state.students.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Audit Log Tercatat</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                  {state.audit_logs.length}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
              <h2 className="text-base font-bold text-slate-900">
                14 Jurusan / Konsentrasi Keahlian
              </h2>
              <div className="divide-y divide-slate-200 text-xs max-h-80 overflow-y-auto pr-1">
                {state.majors.map((m) => (
                  <div
                    key={m.id}
                    className="py-2 flex items-center gap-3"
                  >
                    <span className="font-mono font-bold text-sky-900 w-14 shrink-0">{m.kode}</span>
                    <span className="text-slate-700 truncate">{m.nama}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
              <h2 className="text-base font-bold text-slate-900">
                Rombel Dual-Track (K13 & Kurikulum Merdeka)
              </h2>
              <div className="divide-y divide-slate-200 text-sm max-h-80 overflow-y-auto pr-1">
                {state.rombels.map((r) => {
                  const major = state.majors.find((m) => m.id === r.major_id);
                  return (
                    <div key={r.id} className="py-2.5 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{r.nama_rombel}</p>
                        <p className="text-xs text-slate-500">
                          Tingkat {r.tingkat} · {major?.nama}
                        </p>
                      </div>
                      <span className="font-mono text-xs font-bold text-sky-900">
                        {r.kurikulum_acuan}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      )}

      {section === 'import' && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Import Siswa Atomik per Baris (CSV / Excel)
            </h2>
            <p className="text-xs text-slate-600">
              Validasi dilakukan atomik per baris: baris valid masuk ke database, baris duplikat NISN atau format salah ditolak dengan alasan spesifik.
            </p>
          </div>

          <textarea
            rows={6}
            aria-label="Data CSV Import Siswa"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            className="w-full p-3 text-xs font-mono border border-slate-300 rounded-md bg-slate-50"
          />

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handlePreviewImport}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md border border-slate-300 hover:bg-slate-100 text-sm font-semibold text-slate-800 cursor-pointer"
            >
              <Upload className="w-4 h-4" aria-hidden="true" />
              <span>Preview Validasi Baris</span>
            </button>
            <button
              type="button"
              onClick={handleCommitImport}
              className="px-4 py-2 rounded-md bg-sky-800 hover:bg-sky-900 text-white text-sm font-semibold cursor-pointer"
            >
              Commit Baris Valid ke Database
            </button>
          </div>

          {preview && (
            <div className="space-y-4 pt-3 border-t border-slate-200">
              <div className="flex flex-wrap gap-6 text-sm font-mono tabular-nums">
                <span>Total: {preview.totalRows}</span>
                <span className="text-emerald-700 font-bold">
                  Valid: {preview.validRows.length}
                </span>
                <span className="text-red-700 font-bold">
                  Error: {preview.errorRows.length}
                </span>
              </div>

              {preview.errorRows.length > 0 && (
                <div className="p-4 rounded-md bg-red-50 border border-red-200 space-y-2">
                  <p className="text-xs font-bold text-red-900">
                    Daftar Baris Error (Tidak Dimasukkan):
                  </p>
                  {preview.errorRows.map((err) => (
                    <p key={err.row} className="text-xs font-mono text-red-800">
                      Baris {err.row}: {err.reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {section === 'erapor-mapping' && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-900">
            Konfigurasi Mapping Kolom e-Rapor (Tanpa Hardcode)
          </h2>
          <p className="text-xs text-slate-600">
            Template: {state.erapor_mappings[0]?.template_name}. Sesuaikan nama kolom Excel e-Rapor sekolah dengan field sistem.
          </p>

          <div className="space-y-2">
            {mappingDraft.map((item, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <input
                  type="text"
                  value={item.erapor_column}
                  onChange={(e) => {
                    const next = [...mappingDraft];
                    next[idx] = { ...next[idx], erapor_column: e.target.value };
                    setMappingDraft(next);
                  }}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
                <select
                  value={item.system_field}
                  onChange={(e) => {
                    const next = [...mappingDraft];
                    next[idx] = {
                      ...next[idx],
                      system_field: e.target.value as typeof item.system_field,
                    };
                    setMappingDraft(next);
                  }}
                  className="px-3 py-2 text-sm font-mono border border-slate-300 rounded-md bg-white"
                >
                  <option value="nisn">nisn</option>
                  <option value="nis">nis</option>
                  <option value="nama_siswa">nama_siswa</option>
                  <option value="nama_rombel">nama_rombel</option>
                  <option value="nilai_formatif">nilai_formatif</option>
                  <option value="nilai_sumatif">nilai_sumatif</option>
                  <option value="nilai_praktik">nilai_praktik</option>
                  <option value="nilai_akhir">nilai_akhir</option>
                  <option value="predikat">predikat</option>
                  <option value="deskripsi_capaian">deskripsi_capaian</option>
                </select>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleSaveEraporMapping}
            className="px-4 py-2 rounded-md bg-sky-800 hover:bg-sky-900 text-white text-sm font-semibold cursor-pointer"
          >
            Simpan Mapping e-Rapor
          </button>
        </div>
      )}

      {section === 'backup-audit' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Backup Otomatis (Retensi 7 Hari) & Verifikasi 0 Byte
                </h2>
                <p className="text-xs text-slate-600">
                  Database dump `.sql.gz` diverifikasi ukurannya; jika 0 byte, sistem mengirim alert ke Admin.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleRunBackup(false)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-sky-800 hover:bg-sky-900 text-white text-xs font-semibold cursor-pointer"
                >
                  <Database className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Jalankan Backup Normal</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRunBackup(true)}
                  className="px-3.5 py-2 rounded-md border border-red-300 text-red-800 hover:bg-red-50 text-xs font-semibold cursor-pointer"
                >
                  Simulasi Alert Backup 0 Byte
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-200 text-xs font-mono">
              {state.backup_history.map((b) => (
                <div key={b.id} className="py-2.5 flex items-center justify-between gap-4">
                  <span>{b.filename}</span>
                  <span>{b.size_bytes.toLocaleString()} bytes</span>
                  <span
                    className={
                      b.status === 'OK'
                        ? 'text-emerald-700 font-bold'
                        : 'text-red-700 font-bold'
                    }
                  >
                    {b.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-slate-900">Export Siap Dapodik</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => generateDapodikCsv('SISWA')}
                  className="px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-100 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Export Siswa
                </button>
                <button
                  type="button"
                  onClick={() => generateDapodikCsv('ROMBEL')}
                  className="px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-100 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Export Rombel
                </button>
                <button
                  type="button"
                  onClick={() => generateDapodikCsv('PKL')}
                  className="px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-100 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Export PKL/DUDI
                </button>
                {dapodikPreview && (
                  <button
                    type="button"
                    onClick={() =>
                      downloadCsvFile(
                        `dapodik-${dapodikPreview.kind.toLowerCase()}-smkn1.csv`,
                        dapodikPreview.csv,
                      )
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-sky-800 hover:bg-sky-900 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Unduh File .CSV</span>
                  </button>
                )}
              </div>
            </div>
            {dapodikPreview && (
              <pre className="p-3 rounded-md bg-slate-900 text-slate-100 text-xs font-mono overflow-x-auto max-h-80 overflow-y-auto">
                {dapodikPreview.csv}
              </pre>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
            <h2 className="text-lg font-bold text-slate-900">Audit Log Sistem</h2>
            <div className="divide-y divide-slate-200 max-h-72 overflow-y-auto text-xs">
              {state.audit_logs.map((log) => (
                <div key={log.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="font-mono font-bold text-sky-900">{log.aksi}</span>{' '}
                    <span className="text-slate-700">— {log.detail}</span>
                  </div>
                  <span className="font-mono text-slate-500 whitespace-nowrap">
                    {log.created_at.slice(0, 19).replace('T', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
