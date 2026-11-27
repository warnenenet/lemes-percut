import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Lock,
  Send,
} from 'lucide-react';
import { ClientStatePayload, apiRequest } from '../../api/client';
import {
  calculateStudentFinalGrade,
  calculatePklFinalScore,
} from '../../domain/grading';
import { PklScoreComponent } from '../../domain/types';

interface MonitoringRolesPanelProps {
  section: string;
  payload: ClientStatePayload;
  onRefresh: () => Promise<void>;
}

export const MonitoringRolesPanel: React.FC<MonitoringRolesPanelProps> = ({
  section,
  payload,
  onRefresh,
}) => {
  const { auth, state } = payload;
  const role = auth.activeRole;

  // BK assigned rombels ONLY
  const bkRombelIds = new Set(
    auth.bkCounselor
      ? state.bk_class_assignments
          .filter((b) => b.bk_id === auth.bkCounselor!.id)
          .map((b) => b.rombel_id)
      : [],
  );

  const defaultBkStudentId =
    state.students.find((s) => bkRombelIds.has(s.rombel_id))?.id ??
    state.students[0]?.id ??
    '';
  const defaultTeacherId = state.teachers[0]?.id ?? '';

  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );
  const [coachTarget, setCoachTarget] = useState(
    role === 'KEPALA_SEKOLAH' ? defaultTeacherId : defaultBkStudentId,
  );
  const [coachTitle, setCoachTitle] = useState('');
  const [coachBody, setCoachBody] = useState('');
  const [waliNotesEdit, setWaliNotesEdit] = useState<Record<string, string>>({});
  const [pklScoreEdits, setPklScoreEdits] = useState<Record<string, string>>({});

  useEffect(() => {
    setCoachTarget(role === 'KEPALA_SEKOLAH' ? defaultTeacherId : defaultBkStudentId);
  }, [role, defaultTeacherId, defaultBkStudentId]);

  const getUserName = (userId: string) =>
    state.users.find((u) => u.id === userId)?.nama ?? userId;
  const getSubjectName = (subjectId: string) =>
    state.subjects.find((s) => s.id === subjectId)?.nama ?? subjectId;

  // Wali Kelas assigned rombel
  const waliRombels = auth.teacher
    ? state.rombels.filter((r) => r.wali_kelas_id === auth.teacher!.id)
    : [];

  async function handleTestNotebookPrivacy403() {
    const firstNb = state.notebooks[0];
    if (!firstNb) return;
    const res = await apiRequest(`/api/notebooks/${firstNb.id}/entries`, {
      userId: auth.user.id,
      activeRole: auth.activeRole,
    });
    if (!res.ok) {
      setFeedback({
        type: 'err',
        text: `Verifikasi Privasi Berhasil — HTTP ${res.error.httpStatus}: ${res.error.message}`,
      });
    }
  }

  async function handleValidateJournal(journalId: string) {
    setFeedback(null);
    const res = await apiRequest(`/api/pkl/journals/${journalId}/validate`, {
      method: 'POST',
      userId: auth.user.id,
      activeRole: auth.activeRole,
      body: { validasi_bk: true, catatan_bk: 'Divalidasi oleh Pembimbing BK.' },
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setFeedback({ type: 'ok', text: 'Jurnal PKL berhasil divalidasi.' });
    await onRefresh();
  }

  async function handleSavePklScore(placementId: string, komponen: PklScoreComponent) {
    setFeedback(null);
    const val = Number(pklScoreEdits[`${placementId}-${komponen}`]);
    if (Number.isNaN(val) || val < 0 || val > 100) {
      setFeedback({ type: 'err', text: 'Nilai PKL harus berada di rentang 0–100.' });
      return;
    }
    const res = await apiRequest('/api/pkl/scores', {
      method: 'POST',
      userId: auth.user.id,
      activeRole: auth.activeRole,
      body: { placement_id: placementId, komponen, nilai: val },
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setFeedback({ type: 'ok', text: `Nilai komponen PKL ${komponen} diperbarui.` });
    await onRefresh();
  }

  async function handleSendNotification(
    targetUserId: string,
    judul: string,
    pesan: string,
    entitasId: string,
  ) {
    setFeedback(null);
    const res = await apiRequest('/api/notifications/send', {
      method: 'POST',
      userId: auth.user.id,
      activeRole: auth.activeRole,
      body: {
        user_id: targetUserId,
        tipe: 'PERINGATAN',
        judul,
        pesan,
        entitas_id: entitasId,
      },
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setFeedback({ type: 'ok', text: `Notifikasi terkirim ke ${getUserName(targetUserId)}.` });
    await onRefresh();
  }

  async function handleAddCoachingNote(e: React.FormEvent, targetType: 'SISWA' | 'GURU') {
    e.preventDefault();
    setFeedback(null);
    if (!coachTitle.trim() || !coachBody.trim()) {
      setFeedback({ type: 'err', text: 'Judul dan isi catatan pembinaan wajib diisi.' });
      return;
    }
    const res = await apiRequest('/api/coaching-notes', {
      method: 'POST',
      userId: auth.user.id,
      activeRole: auth.activeRole,
      body: {
        target_type: targetType,
        target_id: coachTarget,
        judul: coachTitle,
        catatan: coachBody,
      },
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setCoachTitle('');
    setCoachBody('');
    setFeedback({ type: 'ok', text: 'Catatan pembinaan tersimpan.' });
    await onRefresh();
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

      {/* GURU BK WORKSPACE */}
      {role === 'GURU_BK' && (
        <>
          {(section === 'dashboard' || section === 'monitoring') && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-lg p-6">
                <p className="text-xs text-slate-500">
                  Beban Kasus BK · Terbatas pada Kelas Binaan (`bk_class_assignments`)
                </p>
                <h1 className="text-2xl font-bold text-slate-900 mt-1">
                  Dashboard Bimbingan Konseling — {auth.user.nama}
                </h1>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-5 border-t border-slate-200">
                  <div>
                    <p className="text-xs text-slate-500">Kelas Binaan BK</p>
                    <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                      {bkRombelIds.size}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Siswa Binaan</p>
                    <p className="text-2xl font-bold font-mono tabular-nums text-sky-900">
                      {state.students.filter((s) => bkRombelIds.has(s.rombel_id)).length}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Jurnal PKL Perlu Validasi</p>
                    <p className="text-2xl font-bold font-mono tabular-nums text-amber-700">
                      {state.pkl_journals.filter((j) => !j.validasi_bk).length}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Catatan Pembinaan</p>
                    <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                      {state.coaching_notes.filter((c) => c.target_type === 'SISWA').length}
                    </p>
                  </div>
                </div>
              </div>

              {/* Notebook Metadata ONLY (Strict RBAC Rule 3) */}
              <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Metadata Buku Tulis Siswa Binaan (Isi Terproteksi)
                    </h2>
                    <p className="text-xs text-slate-600">
                      Sesuai aturan privasi, Guru BK hanya melihat jumlah entri dan tanggal pembaruan—isi catatan tidak dapat dibaca.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestNotebookPrivacy403}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Uji Baca Isi Buku Tulis (403)</span>
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs text-slate-500">
                        <th className="py-2 pr-4 font-semibold">Siswa</th>
                        <th className="py-2 pr-4 font-semibold">Mata Pelajaran</th>
                        <th className="py-2 pr-4 font-semibold">Jumlah Entri</th>
                        <th className="py-2 pr-4 font-semibold">Terakhir Diperbarui</th>
                        <th className="py-2 font-semibold">Status Isi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {state.notebook_metadata
                        .filter((meta) => {
                          const stu = state.students.find((s) => s.id === meta.student_id);
                          return stu ? bkRombelIds.has(stu.rombel_id) : false;
                        })
                        .map((meta) => {
                          const stu = state.students.find((s) => s.id === meta.student_id);
                          return (
                            <tr key={meta.notebook_id}>
                              <td className="py-2.5 pr-4 font-medium text-slate-900">
                                {stu ? getUserName(stu.user_id) : meta.student_id}
                              </td>
                              <td className="py-2.5 pr-4 text-slate-700">
                                {getSubjectName(meta.subject_id)}
                              </td>
                              <td className="py-2.5 pr-4 font-mono tabular-nums font-semibold">
                                {meta.entry_count}
                              </td>
                              <td className="py-2.5 pr-4 font-mono tabular-nums text-xs text-slate-500">
                                {meta.last_updated_at?.slice(0, 16).replace('T', ' ') ?? '-'}
                              </td>
                              <td className="py-2.5 text-xs font-medium text-slate-500">
                                Terkunci (Khusus Siswa & Guru Mapel)
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {section === 'pkl' && (
            <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Manajemen PKL: Validasi Jurnal & Nilai DUDI/Sekolah
                </h2>
                <p className="text-xs text-slate-600">
                  Nilai PKL dikelola oleh BK terpisah dari kontribusi nilai guru mapel (`mapel_pkl_contributions`).
                </p>
              </div>

              {state.pkl_placements.map((plc) => {
                const stu = state.students.find((s) => s.id === plc.student_id);
                const dudi = state.dudis.find((d) => d.id === plc.dudi_id);
                const journals = state.pkl_journals.filter((j) => j.placement_id === plc.id);
                const scores = state.pkl_scores.filter((s) => s.placement_id === plc.id);
                const summary = calculatePklFinalScore(scores);
                const contributions = state.mapel_pkl_contributions.filter(
                  (c) => c.student_id === plc.student_id,
                );
                const components: PklScoreComponent[] = [
                  'DUDI_HARD',
                  'DUDI_SOFT',
                  'DUDI_DISIPLIN',
                  'SEKOLAH_LAPORAN',
                  'SEKOLAH_SIDANG',
                ];

                return (
                  <div key={plc.id} className="border border-slate-200 rounded-lg p-5 space-y-4">
                    <div className="flex flex-wrap justify-between gap-4 border-b border-slate-200 pb-3">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">
                          {stu ? getUserName(stu.user_id) : plc.student_id} — {dudi?.nama}
                        </h3>
                        <p className="text-xs text-slate-500">
                          Pembimbing DUDI: {plc.pembimbing_dudi_nama} · Status: {plc.status}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500">Nilai Akhir PKL (60% DUDI + 40% Sekolah)</p>
                        <p className="text-xl font-bold font-mono tabular-nums text-sky-900">
                          {summary.finalScore}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <h4 className="text-sm font-bold text-slate-900">Jurnal Harian PKL</h4>
                        <div className="divide-y divide-slate-200">
                          {journals.map((j) => (
                            <div key={j.id} className="py-2.5 flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-mono text-slate-500">{j.tanggal}</p>
                                <p className="text-sm text-slate-800">{j.aktivitas}</p>
                              </div>
                              {j.validasi_bk ? (
                                <span className="text-xs font-semibold text-emerald-700 whitespace-nowrap shrink-0">
                                  Tervalidasi
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleValidateJournal(j.id)}
                                  className="px-2.5 py-1 rounded bg-sky-800 hover:bg-sky-900 text-white text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  Validasi
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h4 className="text-sm font-bold text-slate-900">
                          Komponen Nilai PKL (BK & DUDI)
                        </h4>
                        <div className="space-y-2">
                          {components.map((comp) => {
                            const existing = scores.find((s) => s.komponen === comp);
                            const key = `${plc.id}-${comp}`;
                            return (
                              <div key={comp} className="flex items-center justify-between gap-2 text-xs">
                                <span className="font-mono text-slate-700">{comp}</span>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={pklScoreEdits[key] ?? (existing ? String(existing.nilai) : '')}
                                    onChange={(e) =>
                                      setPklScoreEdits((p) => ({ ...p, [key]: e.target.value }))
                                    }
                                    className="w-16 px-2 py-1 border border-slate-300 rounded font-mono"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSavePklScore(plc.id, comp)}
                                    className="px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-100 font-medium cursor-pointer"
                                  >
                                    Simpan
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {contributions.length > 0 && (
                          <div className="p-3 rounded bg-slate-50 border border-slate-200 text-xs">
                            <p className="font-semibold text-slate-800">
                              Kontribusi Mapel Terpisah (`mapel_pkl_contributions`):
                            </p>
                            {contributions.map((c) => (
                              <p key={c.id} className="text-slate-600 mt-1">
                                {getSubjectName(c.subject_id)}: <span className="font-mono font-bold">{c.nilai}</span> — {c.catatan}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {section === 'pembinaan' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
                <h2 className="text-lg font-bold text-slate-900">Catat Pembinaan Siswa</h2>
                <form onSubmit={(e) => handleAddCoachingNote(e, 'SISWA')} className="space-y-3">
                  <select
                    value={coachTarget}
                    onChange={(e) => setCoachTarget(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                  >
                    {state.students
                      .filter((s) => bkRombelIds.has(s.rombel_id))
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {getUserName(s.user_id)} ({s.nisn})
                        </option>
                      ))}
                  </select>
                  <input
                    type="text"
                    value={coachTitle}
                    onChange={(e) => setCoachTitle(e.target.value)}
                    placeholder="Judul pembinaan / konseling"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                  />
                  <textarea
                    rows={4}
                    value={coachBody}
                    onChange={(e) => setCoachBody(e.target.value)}
                    placeholder="Hasil konseling dan rencana tindak lanjut..."
                    className="w-full p-3 text-sm border border-slate-300 rounded-md"
                  />
                  <button
                    type="submit"
                    className="w-full py-2 px-4 rounded-md bg-sky-800 hover:bg-sky-900 text-white text-sm font-semibold cursor-pointer"
                  >
                    Simpan Catatan Pembinaan
                  </button>
                </form>
              </div>
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
                <h2 className="text-lg font-bold text-slate-900">Riwayat Pembinaan Siswa</h2>
                <div className="divide-y divide-slate-200">
                  {state.coaching_notes
                    .filter((c) => c.target_type === 'SISWA')
                    .map((c) => (
                      <div key={c.id} className="py-3 first:pt-0 last:pb-0">
                        <p className="text-xs font-mono text-slate-500">
                          {c.created_at.slice(0, 10)} · Target {c.target_id}
                        </p>
                        <p className="text-sm font-bold text-slate-900">{c.judul}</p>
                        <p className="text-sm text-slate-700 mt-0.5">{c.catatan}</p>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* WALI KELAS WORKSPACE (Read-only grades + class notes + metadata-only notebook) */}
      {role === 'WALI_KELAS' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500">
                  Wali Kelas Binaan (Read-Only Nilai Mapel · Dapat Mengisi Catatan Wali Kelas)
                </p>
                <h1 className="text-2xl font-bold text-slate-900 mt-1">
                  Rekap Kelas {waliRombels.map((r) => r.nama_rombel).join(', ') || 'Belum Ditugaskan'}
                </h1>
              </div>
              <button
                type="button"
                onClick={handleTestNotebookPrivacy403}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-slate-800 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Uji Privasi Buku Tulis (403)</span>
              </button>
            </div>

            {waliRombels.map((rombel) => {
              const students = state.students.filter((s) => s.rombel_id === rombel.id);
              const rombelAssignments = state.teacher_assignments.filter(
                (a) => a.rombel_id === rombel.id,
              );
              return (
                <div key={rombel.id} className="space-y-4 pt-2">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs text-slate-500">
                          <th className="py-2 pr-4 font-semibold">Siswa</th>
                          {rombelAssignments.map((a) => (
                            <th key={a.id} className="py-2 pr-4 font-semibold">
                              {getSubjectName(a.subject_id)} (Read-Only)
                            </th>
                          ))}
                          <th className="py-2 font-semibold">Catatan Wali Kelas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {students.map((stu) => (
                          <tr key={stu.id}>
                            <td className="py-3 pr-4 font-medium text-slate-900">
                              {getUserName(stu.user_id)}
                            </td>
                            {rombelAssignments.map((a) => {
                              const comps = state.grade_components.filter(
                                (c) => c.teacher_assignment_id === a.id,
                              );
                              const { nilaiAkhir } = calculateStudentFinalGrade({
                                studentId: stu.id,
                                components: comps,
                                grades: state.grades,
                                track: rombel.kurikulum_acuan,
                              });
                              return (
                                <td key={a.id} className="py-3 pr-4 font-mono tabular-nums">
                                  {nilaiAkhir ?? '-'}
                                </td>
                              );
                            })}
                            <td className="py-2">
                              <div className="flex gap-1.5">
                                <input
                                  type="text"
                                  value={
                                    waliNotesEdit[stu.id] ??
                                    state.walikelas_notes[stu.id] ??
                                    ''
                                  }
                                  onChange={(e) =>
                                    setWaliNotesEdit((p) => ({
                                      ...p,
                                      [stu.id]: e.target.value,
                                    }))
                                  }
                                  className="flex-1 min-w-[200px] px-2.5 py-1 text-xs border border-slate-300 rounded"
                                />
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setFeedback(null);
                                    const res = await apiRequest('/api/walikelas/notes', {
                                      method: 'POST',
                                      userId: auth.user.id,
                                      activeRole: auth.activeRole,
                                      body: {
                                        student_id: stu.id,
                                        catatan:
                                          waliNotesEdit[stu.id] ??
                                          state.walikelas_notes[stu.id] ??
                                          '',
                                      },
                                    });
                                    if (!res.ok) {
                                      setFeedback({ type: 'err', text: res.error.message });
                                      return;
                                    }
                                    setFeedback({
                                      type: 'ok',
                                      text: 'Catatan wali kelas disimpan.',
                                    });
                                    await onRefresh();
                                  }}
                                  className="px-2.5 py-1 rounded bg-sky-800 text-white text-xs font-medium cursor-pointer"
                                >
                                  Simpan
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* WAKASEK WORKSPACE */}
      {role === 'WAKASEK' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <h1 className="text-2xl font-bold text-slate-900">
              Rekap Administrasi & Kelengkapan Perangkat Ajar Guru
            </h1>
            <p className="text-xs text-slate-600">
              Status kelengkapan dihitung otomatis dari tabel `teacher_documents`. Kirim pengingat berjenjang kepada guru yang dokumennya belum berstatus PUBLISHED.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2.5 pr-4 font-semibold">Guru Pengampu</th>
                    <th className="py-2.5 pr-4 font-semibold">Mapel & Kelas</th>
                    <th className="py-2.5 pr-4 font-semibold">Kurikulum</th>
                    <th className="py-2.5 pr-4 font-semibold">Status Dokumen</th>
                    <th className="py-2.5 font-semibold">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {state.teacher_assignments.map((ta) => {
                    const tch = state.teachers.find((t) => t.id === ta.teacher_id);
                    const rom = state.rombels.find((r) => r.id === ta.rombel_id);
                    const doc = state.teacher_documents.find(
                      (d) => d.teacher_assignment_id === ta.id,
                    );
                    const isPublished = doc?.status === 'PUBLISHED';
                    return (
                      <tr key={ta.id} className="hover:bg-slate-50">
                        <td className="py-3 pr-4 font-medium text-slate-900">
                          {tch ? getUserName(tch.user_id) : ta.teacher_id}
                        </td>
                        <td className="py-3 pr-4 text-slate-700">
                          {getSubjectName(ta.subject_id)} · {rom?.nama_rombel}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs">{ta.kurikulum_acuan}</td>
                        <td className="py-3 pr-4 font-semibold text-xs">
                          <span
                            className={
                              isPublished
                                ? 'text-emerald-700'
                                : doc
                                  ? 'text-amber-700'
                                  : 'text-red-700'
                            }
                          >
                            {doc ? doc.status : 'BELUM ADA'}
                          </span>
                        </td>
                        <td className="py-3">
                          {!isPublished && tch && (
                            <button
                              type="button"
                              onClick={() =>
                                handleSendNotification(
                                  tch.user_id,
                                  'Pengingat Kelengkapan Perangkat Ajar',
                                  `Mohon segera selesaikan dan publish perangkat ajar ${getSubjectName(ta.subject_id)} kelas ${rom?.nama_rombel}.`,
                                  ta.id,
                                )
                              }
                              className="flex items-center gap-1 px-3 py-1 rounded bg-sky-800 hover:bg-sky-900 text-white text-xs font-medium cursor-pointer"
                            >
                              <Send className="w-3 h-3" aria-hidden="true" />
                              <span>Kirim Notifikasi</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* KEPALA SEKOLAH WORKSPACE */}
      {role === 'KEPALA_SEKOLAH' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Dashboard Kepatuhan Eksekutif — {state.school.nama}
              </h1>
              <p className="text-xs text-slate-600 mt-0.5">
                Ringkasan kepatuhan guru mengisi sesi, input nilai, perangkat ajar, dan kehadiran siswa.
              </p>
            </div>

            {(() => {
              const totalTa = state.teacher_assignments.length;
              const withSession = new Set(state.sessions.map((s) => s.teacher_assignment_id)).size;
              const publishedDocs = state.teacher_documents.filter(
                (d) => d.status === 'PUBLISHED',
              ).length;
              const hadirCount = state.attendance_records.filter(
                (r) => r.status === 'HADIR',
              ).length;
              const totalAtt = state.attendance_records.length || 1;
              const metrics = [
                {
                  label: 'Kepatuhan Sesi Mengajar',
                  pct: Math.round((withSession / totalTa) * 100),
                  detail: `${withSession} dari ${totalTa} penugasan`,
                },
                {
                  label: 'Perangkat Ajar Published',
                  pct: Math.round((publishedDocs / totalTa) * 100),
                  detail: `${publishedDocs} dari ${totalTa} dokumen`,
                },
                {
                  label: 'Kehadiran Aktif Siswa (HADIR)',
                  pct: Math.round((hadirCount / totalAtt) * 100),
                  detail: `${hadirCount} dari ${state.attendance_records.length} log sesi`,
                },
              ];

              return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-200 divide-y md:divide-y-0 md:divide-x divide-slate-200">
                  {metrics.map((m, idx) => (
                    <div
                      key={m.label}
                      className={`space-y-2 ${idx > 0 ? 'pt-4 md:pt-0 md:pl-6' : ''}`}
                    >
                      <div className="flex justify-between text-xs font-semibold text-slate-700">
                        <span>{m.label}</span>
                        <span className="font-mono tabular-nums">{m.pct}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-sky-800 rounded-full"
                          style={{ width: `${m.pct}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-500 font-mono">{m.detail}</p>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-bold text-slate-900">Catat Pembinaan Guru</h2>
              <form onSubmit={(e) => handleAddCoachingNote(e, 'GURU')} className="space-y-3">
                <select
                  value={coachTarget}
                  onChange={(e) => setCoachTarget(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                >
                  {state.teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {getUserName(t.user_id)} ({t.bidang})
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={coachTitle}
                  onChange={(e) => setCoachTitle(e.target.value)}
                  placeholder="Agenda supervisi / pembinaan"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
                <textarea
                  rows={3}
                  value={coachBody}
                  onChange={(e) => setCoachBody(e.target.value)}
                  placeholder="Rekomendasi pembinaan kepala sekolah..."
                  className="w-full p-3 text-sm border border-slate-300 rounded-md"
                />
                <button
                  type="submit"
                  className="w-full py-2 px-4 rounded-md bg-sky-800 hover:bg-sky-900 text-white text-sm font-semibold cursor-pointer"
                >
                  Simpan Catatan Supervisi
                </button>
              </form>
            </div>

            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-bold text-slate-900">
                Catatan Supervisi & Pembinaan Guru
              </h2>
              <div className="divide-y divide-slate-200">
                {state.coaching_notes
                  .filter((c) => c.target_type === 'GURU')
                  .map((c) => (
                    <div key={c.id} className="py-3 first:pt-0 last:pb-0">
                      <p className="text-xs font-mono text-slate-500">
                        {c.created_at.slice(0, 10)} · Target {c.target_id}
                      </p>
                      <p className="text-sm font-bold text-slate-900">{c.judul}</p>
                      <p className="text-sm text-slate-700 mt-0.5">{c.catatan}</p>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
