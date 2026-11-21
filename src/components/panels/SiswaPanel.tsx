import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Paperclip,
  ExternalLink,
} from 'lucide-react';
import { ClientStatePayload, apiRequest, uploadLmsFile } from '../../api/client';
import {
  calculateStudentFinalGrade,
  calculatePklFinalScore,
} from '../../domain/grading';
import { gradeStudentExamAnswers } from '../../domain/cbt';
import { readFileAsBase64 } from '../../utils/fileTools';

interface SiswaPanelProps {
  section: string;
  appMode: 'LMS' | 'CBT';
  payload: ClientStatePayload;
  onRefresh: () => Promise<void>;
}

export const SiswaPanel: React.FC<SiswaPanelProps> = ({
  section,
  appMode,
  payload,
  onRefresh,
}) => {
  const { auth, state } = payload;
  const student = auth.student!;
  const rombel = state.rombels.find((r) => r.id === student.rombel_id)!;
  const major = state.majors.find((m) => m.id === rombel.major_id)!;
  const myAssignments = state.teacher_assignments.filter(
    (a) => a.rombel_id === student.rombel_id,
  );
  const myAssignmentIds = new Set(myAssignments.map((a) => a.id));

  const mySessions = state.sessions.filter((s) =>
    myAssignmentIds.has(s.teacher_assignment_id),
  );
  const myModules = state.modules.filter(
    (m) => myAssignmentIds.has(m.teacher_assignment_id) && m.status === 'PUBLISHED',
  );
  const myTasks = state.assignments.filter((t) =>
    myAssignmentIds.has(t.teacher_assignment_id),
  );
  const myNotifications = state.notifications.filter(
    (n) => n.user_id === auth.user.id,
  );

  // Local interactive states
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(
    myModules[0]?.id ?? null,
  );
  const [reflectionText, setReflectionText] = useState('');
  const [taskTexts, setTaskTexts] = useState<Record<string, string>>({});
  const [taskFiles, setTaskFiles] = useState<Record<string, string>>({});
  const [uploadingTask, setUploadingTask] = useState<Record<string, boolean>>({});
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(
    myAssignments[0]?.subject_id ?? state.subjects[0]?.id ?? '',
  );
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteImageUrl, setNoteImageUrl] = useState('');
  const [uploadingNoteImg, setUploadingNoteImg] = useState(false);

  // CBT states
  const [tokenInputs, setTokenInputs] = useState<Record<string, string>>({});
  const [activeExamId, setActiveExamId] = useState<string | null>(null);
  const [activeExamSessionId, setActiveExamSessionId] = useState<string | null>(null);
  const [examResultSummary, setExamResultSummary] = useState<{
    totalEarned: number;
    totalPossible: number;
    percentage: number;
  } | null>(null);

  // PKL journal state
  const [pklActivity, setPklActivity] = useState('');

  async function handleEnterSession(
    sessionId: string,
    readPct: number,
    submittedReflection = false,
  ) {
    setFeedback(null);
    const res = await apiRequest<{ ok: true; record: { status: string } }>(
      `/api/sessions/${sessionId}/access`,
      {
        method: 'POST',
        userId: auth.user.id,
        activeRole: auth.activeRole,
        body: {
          readPct,
          submittedReflection,
          simulatedTimeHHmm: '09:15',
        },
      },
    );
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setFeedback({
      type: 'ok',
      text: `Status kehadiran sesi diperbarui: ${res.data.record.status}`,
    });
    if (submittedReflection) setReflectionText('');
    await onRefresh();
  }

  async function handleTaskFileSelect(taskId: string, file: File | null) {
    if (!file) return;
    setFeedback(null);
    setUploadingTask((p) => ({ ...p, [taskId]: true }));
    try {
      const base64Data = await readFileAsBase64(file);
      const res = await uploadLmsFile({
        category: 'submissions',
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64Data,
        userId: auth.user.id,
        activeRole: auth.activeRole,
      });
      if (!res.ok) {
        setFeedback({ type: 'err', text: res.error.message });
        return;
      }
      setTaskFiles((p) => ({ ...p, [taskId]: res.data.file.url }));
      setFeedback({
        type: 'ok',
        text: `Berkas "${file.name}" siap dikirim bersama jawaban tugas.`,
      });
    } catch {
      setFeedback({ type: 'err', text: 'Gagal membaca berkas unggahan.' });
    } finally {
      setUploadingTask((p) => ({ ...p, [taskId]: false }));
    }
  }

  async function handleSubmitTask(taskId: string) {
    setFeedback(null);
    const teks = taskTexts[taskId] ?? '';
    const fileUrl = taskFiles[taskId] ?? null;
    const res = await apiRequest(`/api/tasks/${taskId}/submit`, {
      method: 'POST',
      userId: auth.user.id,
      activeRole: auth.activeRole,
      body: { teks, file_url: fileUrl },
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setFeedback({ type: 'ok', text: 'Tugas berhasil dikirim ke guru pengampu.' });
    setTaskTexts((prev) => ({ ...prev, [taskId]: '' }));
    setTaskFiles((prev) => ({ ...prev, [taskId]: '' }));
    await onRefresh();
  }

  async function handleNotebookFileSelect(file: File | null) {
    if (!file) return;
    setFeedback(null);
    setUploadingNoteImg(true);
    try {
      const base64Data = await readFileAsBase64(file);
      const res = await uploadLmsFile({
        category: 'notebooks',
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64Data,
        userId: auth.user.id,
        activeRole: auth.activeRole,
      });
      if (!res.ok) {
        setFeedback({ type: 'err', text: res.error.message });
        return;
      }
      setNoteImageUrl(res.data.file.url);
      setFeedback({
        type: 'ok',
        text: `Lampiran diagram "${file.name}" berhasil diunggah ke server.`,
      });
    } catch {
      setFeedback({ type: 'err', text: 'Gagal membaca berkas lampiran buku tulis.' });
    } finally {
      setUploadingNoteImg(false);
    }
  }

  async function handleCreateNotebookEntry(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const res = await apiRequest(`/api/notebooks/${selectedSubjectId}/entries`, {
      method: 'POST',
      userId: auth.user.id,
      activeRole: auth.activeRole,
      body: {
        judul: noteTitle,
        konten: noteContent,
        gambar_url: noteImageUrl.trim() || null,
      },
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setNoteTitle('');
    setNoteContent('');
    setNoteImageUrl('');
    setFeedback({ type: 'ok', text: 'Catatan buku tulis tersimpan (privat untuk Anda & Guru Mapel).' });
    await onRefresh();
  }

  async function handleStartCbt(examId: string) {
    setFeedback(null);
    setExamResultSummary(null);
    const token = tokenInputs[examId] ?? '';
    const res = await apiRequest<{ ok: true; exam_session: { id: string } }>(
      `/api/cbt/exams/${examId}/start`,
      {
        method: 'POST',
        userId: auth.user.id,
        activeRole: auth.activeRole,
        body: { token },
      },
    );
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setActiveExamId(examId);
    setActiveExamSessionId(res.data.exam_session.id);
    await onRefresh();
  }

  async function handleAutosaveAnswer(questionId: string, jawaban: string) {
    if (!activeExamSessionId) return;
    await apiRequest(`/api/cbt/sessions/${activeExamSessionId}/answer`, {
      method: 'POST',
      userId: auth.user.id,
      activeRole: auth.activeRole,
      body: { question_id: questionId, jawaban },
    });
    await onRefresh();
  }

  async function handleFinishExam() {
    if (!activeExamSessionId) return;
    const res = await apiRequest<{
      ok: true;
      summary: { totalEarned: number; totalPossible: number; percentage: number };
    }>(`/api/cbt/sessions/${activeExamSessionId}/finish`, {
      method: 'POST',
      userId: auth.user.id,
      activeRole: auth.activeRole,
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setExamResultSummary(res.data.summary);
    setActiveExamId(null);
    setActiveExamSessionId(null);
    await onRefresh();
  }

  async function handleCreatePklJournal(placementId: string) {
    setFeedback(null);
    if (!pklActivity.trim()) {
      setFeedback({ type: 'err', text: 'Isi aktivitas harian PKL terlebih dahulu.' });
      return;
    }
    const res = await apiRequest('/api/pkl/journals', {
      method: 'POST',
      userId: auth.user.id,
      activeRole: auth.activeRole,
      body: { placement_id: placementId, aktivitas: pklActivity },
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setPklActivity('');
    setFeedback({ type: 'ok', text: 'Jurnal harian PKL berhasil dikirim untuk validasi BK.' });
    await onRefresh();
  }

  const getSubjectName = (subjectId: string) =>
    state.subjects.find((s) => s.id === subjectId)?.nama ?? subjectId;

  const getTeacherName = (teacherId: string) => {
    const t = state.teachers.find((x) => x.id === teacherId);
    return state.users.find((u) => u.id === t?.user_id)?.nama ?? teacherId;
  };

  const formatAttendanceStatus = (status?: string | null) => {
    if (!status) return 'Belum Akses';
    if (status === 'AKSES_TANPA_AKTIVITAS') return 'Akses Tanpa Aktivitas';
    return status;
  };

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
            <p className="text-xs font-medium text-slate-500">
              NISN <span className="font-mono tabular-nums">{student.nisn}</span> · NIS{' '}
              <span className="font-mono tabular-nums">{student.nis}</span> · Kurikulum{' '}
              {rombel.kurikulum_acuan}
            </p>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">
              Selamat Datang, {auth.user.nama}
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              {rombel.nama_rombel} · {major.nama}
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-5 border-t border-slate-200">
              <div>
                <p className="text-xs text-slate-500">Mapel Diikuti</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                  {myAssignments.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Sesi Terbuka</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-sky-800 mt-0.5">
                  {mySessions.filter((s) => s.status === 'OPEN').length}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Tugas Aktif</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                  {myTasks.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Ujian CBT</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                  {
                    state.exams.filter((e) =>
                      myAssignmentIds.has(e.teacher_assignment_id),
                    ).length
                  }
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900">
                Sesi Pembelajaran Hari Ini
              </h2>
              {mySessions.length === 0 ? (
                <p className="text-sm text-slate-500">Belum ada sesi terjadwal.</p>
              ) : (
                <div className="divide-y divide-slate-200">
                  {mySessions.map((ses) => {
                    const ta = myAssignments.find(
                      (a) => a.id === ses.teacher_assignment_id,
                    );
                    const rec = state.attendance_records.find(
                      (r) => r.session_id === ses.id && r.student_id === student.id,
                    );
                    return (
                      <div key={ses.id} className="py-3.5 first:pt-0 last:pb-0 space-y-2">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-xs text-slate-500">
                              {ta ? getSubjectName(ta.subject_id) : ''} · Pertemuan{' '}
                              <span className="font-mono tabular-nums">
                                {ses.pertemuan_ke}
                              </span>{' '}
                              ·{' '}
                              <span className="font-mono tabular-nums">
                                {ses.jam_mulai}–{ses.jam_selesai}
                              </span>
                            </p>
                            <p className="text-sm font-semibold text-slate-900">
                              {ses.topik}
                            </p>
                          </div>
                          <span
                            className={`text-xs font-semibold whitespace-nowrap shrink-0 ${
                              rec?.status === 'HADIR'
                                ? 'text-emerald-700'
                                : rec?.status === 'AKSES_TANPA_AKTIVITAS'
                                  ? 'text-amber-700'
                                  : 'text-slate-600'
                            }`}
                          >
                            {rec ? formatAttendanceStatus(rec.status) : ses.status}
                          </span>
                        </div>
                        {ses.status === 'OPEN' && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleEnterSession(ses.id, 15, false)}
                              className="px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-100 text-xs font-medium text-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Masuk Sesi (Buka Saja)
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEnterSession(ses.id, 100, true)}
                              className="px-3 py-1.5 rounded-md bg-sky-800 hover:bg-sky-900 text-white text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Penuhi Aktivitas Minimum
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900">Notifikasi Terbaru</h2>
              {myNotifications.length === 0 ? (
                <p className="text-sm text-slate-500">Tidak ada notifikasi baru.</p>
              ) : (
                <div className="divide-y divide-slate-200">
                  {myNotifications.map((n) => (
                    <div key={n.id} className="py-3 first:pt-0 last:pb-0">
                      <p className="text-xs font-semibold text-sky-800">{n.tipe}</p>
                      <p className="text-sm font-semibold text-slate-900">{n.judul}</p>
                      <p className="text-xs text-slate-600 mt-0.5">{n.pesan}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {section === 'sesi-modul' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">
              Sesi Aktif & Daftar Modul
            </h2>
            <div className="divide-y divide-slate-200">
              {mySessions.map((ses) => {
                const ta = myAssignments.find(
                  (a) => a.id === ses.teacher_assignment_id,
                );
                const rec = state.attendance_records.find(
                  (r) => r.session_id === ses.id && r.student_id === student.id,
                );
                return (
                  <div key={ses.id} className="py-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-500">
                        {ta ? getSubjectName(ta.subject_id) : ''} · {ses.tipe_sesi}
                      </span>
                      <span
                        className={`text-xs font-semibold ${
                          rec?.status === 'HADIR'
                            ? 'text-emerald-700'
                            : rec?.status === 'AKSES_TANPA_AKTIVITAS'
                              ? 'text-amber-700'
                              : 'text-slate-600'
                        }`}
                      >
                        {formatAttendanceStatus(rec?.status)}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{ses.topik}</p>
                    <p className="text-xs text-slate-500 font-mono tabular-nums">
                      Jendela: {ses.jam_mulai}–{ses.jam_selesai} · Min. baca{' '}
                      {ses.minimum_read_pct}%
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {ses.module_id && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveModuleId(ses.module_id);
                            if (ses.status === 'OPEN') {
                              handleEnterSession(ses.id, 15, false);
                            }
                          }}
                          className="px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-100 text-xs font-medium text-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Masuk Sesi & Baca Modul
                        </button>
                      )}
                      {ses.status === 'OPEN' && (
                        <button
                          type="button"
                          onClick={() => handleEnterSession(ses.id, 100, true)}
                          className="px-3 py-1.5 rounded-md bg-sky-800 hover:bg-sky-900 text-white text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Selesaikan Baca (100%)
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            {(() => {
              const mod = myModules.find((m) => m.id === activeModuleId) ?? myModules[0];
              if (!mod) {
                return <p className="text-sm text-slate-500">Pilih modul untuk membaca materi.</p>;
              }
              const ta = myAssignments.find(
                (a) => a.id === mod.teacher_assignment_id,
              );
              const openSession = mySessions.find(
                (s) => s.module_id === mod.id && s.status === 'OPEN',
              );
              return (
                <>
                  <div className="border-b border-slate-200 pb-4">
                    <p className="text-xs text-slate-500">
                      {ta ? getSubjectName(ta.subject_id) : ''} · Guru:{' '}
                      {ta ? getTeacherName(ta.teacher_id) : ''}
                    </p>
                    <h2 className="text-xl font-bold text-slate-900 mt-1">{mod.judul}</h2>
                  </div>
                  <div className="prose prose-slate max-w-none text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                    {mod.konten}
                  </div>
                  {openSession && (
                    <div className="pt-4 border-t border-slate-200 space-y-3">
                      <label
                        htmlFor="session-reflection"
                        className="block text-sm font-semibold text-slate-900"
                      >
                        Refleksi Singkat (Memenuhi Aktivitas Minimum Sesi)
                      </label>
                      <textarea
                        id="session-reflection"
                        rows={3}
                        value={reflectionText}
                        onChange={(e) => setReflectionText(e.target.value)}
                        placeholder="Tuliskan inti materi yang Anda pahami hari ini..."
                        className="w-full p-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700"
                      />
                      <button
                        type="button"
                        onClick={() => handleEnterSession(openSession.id, 100, true)}
                        className="px-4 py-2 rounded-md bg-sky-800 hover:bg-sky-900 text-white text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Kirim Refleksi & Catat HADIR
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {section === 'tugas' && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          <h2 className="text-lg font-bold text-slate-900">Tugas & Pengumpulan</h2>
          <div className="divide-y divide-slate-200">
            {myTasks.map((task) => {
              const ta = myAssignments.find(
                (a) => a.id === task.teacher_assignment_id,
              );
              const sub = state.submissions.find(
                (s) => s.assignment_id === task.id && s.student_id === student.id,
              );
              return (
                <div key={task.id} className="py-5 first:pt-0 last:pb-0 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-500">
                        {ta ? getSubjectName(ta.subject_id) : ''} · {task.tipe} · Batas{' '}
                        <span className="font-mono tabular-nums">
                          {task.deadline.slice(0, 10)}
                        </span>
                      </p>
                      <h3 className="text-base font-bold text-slate-900">{task.judul}</h3>
                      <p className="text-sm text-slate-600 mt-1">{task.deskripsi}</p>
                    </div>
                    <div className="text-right">
                      {sub ? (
                        <p className="text-sm font-semibold text-emerald-700 font-mono tabular-nums">
                          {sub.nilai !== null ? `Nilai: ${sub.nilai}` : 'Sudah Dikirim'}
                        </p>
                      ) : (
                        <p className="text-sm font-semibold text-amber-700">Belum Submit</p>
                      )}
                    </div>
                  </div>
                  {sub && (
                    <div className="p-3 rounded-md bg-slate-50 text-xs text-slate-700 space-y-1.5">
                      <p className="font-semibold text-slate-900">Jawaban Terkirim:</p>
                      <p>{sub.teks || '-'}</p>
                      {sub.file_url && (
                        <a
                          href={sub.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sky-800 hover:underline font-medium"
                        >
                          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Lihat Berkas Terunggah</span>
                        </a>
                      )}
                      {sub.catatan_guru && (
                        <p className="text-sky-900 font-medium">
                          Catatan Guru: {sub.catatan_guru}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        aria-label={`Jawaban untuk ${task.judul}`}
                        value={taskTexts[task.id] ?? ''}
                        onChange={(e) =>
                          setTaskTexts((p) => ({ ...p, [task.id]: e.target.value }))
                        }
                        placeholder="Tulis ringkasan jawaban atau keterangan..."
                        className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-700"
                      />
                      <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 hover:bg-slate-50 text-xs font-medium text-slate-700 whitespace-nowrap shrink-0 cursor-pointer">
                        <Paperclip className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>
                          {uploadingTask[task.id]
                            ? 'Mengunggah...'
                            : taskFiles[task.id]
                              ? 'Berkas Siap'
                              : 'Lampirkan Berkas'}
                        </span>
                        <input
                          type="file"
                          accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.md,.doc,.docx"
                          className="sr-only"
                          onChange={(e) =>
                            handleTaskFileSelect(task.id, e.target.files?.[0] ?? null)
                          }
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => handleSubmitTask(task.id)}
                        className="px-4 py-2 rounded-md bg-sky-800 hover:bg-sky-900 text-white text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {sub ? 'Perbarui Jawaban' : 'Kirim Tugas'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {section === 'buku-tulis' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <div className="flex items-start gap-2.5 p-3 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-700">
              <ShieldAlert className="w-4 h-4 text-sky-800 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Privasi Buku Tulis: Isi catatan hanya dapat dibaca oleh Anda dan Guru Mapel pengampu. BK, Wali Kelas, Wakasek, dan Kepala Sekolah hanya melihat jumlah entri.
              </span>
            </div>

            <div>
              <label
                htmlFor="notebook-subject"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Pilih Mata Pelajaran
              </label>
              <select
                id="notebook-subject"
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                {myAssignments.map((a) => (
                  <option key={a.id} value={a.subject_id}>
                    {getSubjectName(a.subject_id)}
                  </option>
                ))}
              </select>
            </div>

            <form onSubmit={handleCreateNotebookEntry} className="space-y-3">
              <div>
                <label
                  htmlFor="nb-title"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Judul Catatan
                </label>
                <input
                  id="nb-title"
                  type="text"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="Misal: Ringkasan Pertemuan 2"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label
                  htmlFor="nb-content"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Isi Catatan Belajar
                </label>
                <textarea
                  id="nb-content"
                  rows={5}
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Catat rumus, langkah praktik bengkel, atau pertanyaan..."
                  className="w-full p-3 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label
                  htmlFor="nb-img"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Lampiran Diagram / Foto Catatan (Unggah ke Server atau URL)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    id="nb-img"
                    type="text"
                    value={noteImageUrl}
                    onChange={(e) => setNoteImageUrl(e.target.value)}
                    placeholder="/api/files/notebooks/... atau kosongkan"
                    className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-md"
                  />
                  <label className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 hover:bg-slate-50 text-xs font-medium text-slate-700 whitespace-nowrap shrink-0 cursor-pointer">
                    <Paperclip className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{uploadingNoteImg ? 'Mengunggah...' : 'Unggah Gambar/PDF'}</span>
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,.pdf"
                      className="sr-only"
                      onChange={(e) =>
                        handleNotebookFileSelect(e.target.files?.[0] ?? null)
                      }
                    />
                  </label>
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-md bg-sky-800 hover:bg-sky-900 text-white text-sm font-semibold cursor-pointer"
              >
                Simpan ke Buku Tulis
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">
              Catatan Buku Tulis · {getSubjectName(selectedSubjectId)}
            </h2>
            {(() => {
              const nb = state.notebooks.find(
                (n) => n.student_id === student.id && n.subject_id === selectedSubjectId,
              );
              const entries = nb
                ? state.notebook_entries.filter((e) => e.notebook_id === nb.id)
                : [];
              if (entries.length === 0) {
                return (
                  <p className="text-sm text-slate-500">
                    Belum ada catatan pada buku tulis mapel ini.
                  </p>
                );
              }
              return (
                <div className="divide-y divide-slate-200">
                  {entries.map((entry) => (
                    <article key={entry.id} className="py-4 first:pt-0 last:pb-0 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-base font-bold text-slate-900">{entry.judul}</h3>
                        <span className="text-xs text-slate-500 font-mono tabular-nums">
                          {entry.updated_at.slice(0, 10)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 whitespace-pre-line">
                        {entry.konten}
                      </p>
                      {entry.gambar_url && (
                        <div className="pt-1">
                          {entry.gambar_url.toLowerCase().endsWith('.pdf') ? (
                            <a
                              href={entry.gambar_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-800 hover:underline"
                            >
                              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Buka Lampiran PDF</span>
                            </a>
                          ) : (
                            <img
                              src={entry.gambar_url}
                              alt={`Lampiran ${entry.judul}`}
                              className="max-h-56 rounded-md border border-slate-200 object-contain bg-slate-50"
                            />
                          )}
                        </div>
                      )}
                      {entry.komentar_guru && (
                        <div className="p-3 rounded-md bg-slate-50 text-xs text-slate-800">
                          <span className="font-semibold text-sky-900">Komentar Guru Mapel:</span>{' '}
                          {entry.komentar_guru}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {section === 'absensi' && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Rekap Absensi Saya</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2.5 pr-4 font-semibold">Mata Pelajaran</th>
                  <th className="py-2.5 pr-4 font-semibold">Pertemuan & Topik</th>
                  <th className="py-2.5 pr-4 font-semibold">Aktivitas Baca</th>
                  <th className="py-2.5 pr-4 font-semibold">Status Kehadiran</th>
                  <th className="py-2.5 font-semibold">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {mySessions.map((ses) => {
                  const ta = myAssignments.find(
                    (a) => a.id === ses.teacher_assignment_id,
                  );
                  const rec = state.attendance_records.find(
                    (r) => r.session_id === ses.id && r.student_id === student.id,
                  );
                  return (
                    <tr key={ses.id} className="hover:bg-slate-50">
                      <td className="py-3 pr-4 font-medium text-slate-900">
                        {ta ? getSubjectName(ta.subject_id) : '-'}
                      </td>
                      <td className="py-3 pr-4 text-slate-700">
                        P{ses.pertemuan_ke}: {ses.topik}
                      </td>
                      <td className="py-3 pr-4 font-mono tabular-nums text-slate-700">
                        {rec ? `${rec.read_pct}%` : '0%'}
                      </td>
                      <td className="py-3 pr-4 font-semibold">
                        <span
                          className={
                            rec?.status === 'HADIR'
                              ? 'text-emerald-700'
                              : rec?.status === 'AKSES_TANPA_AKTIVITAS'
                                ? 'text-amber-700'
                                : 'text-slate-600'
                          }
                        >
                          {formatAttendanceStatus(rec?.status)}
                        </span>
                      </td>
                      <td className="py-3 text-xs text-slate-600">
                        {rec?.alasan_override ?? '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === 'nilai' && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          <h2 className="text-lg font-bold text-slate-900">
            Nilai Mata Pelajaran ({rombel.kurikulum_acuan})
          </h2>
          <div className="divide-y divide-slate-200">
            {myAssignments.map((ta) => {
              const comps = state.grade_components.filter(
                (c) => c.teacher_assignment_id === ta.id,
              );
              const { nilaiAkhir, predikat } = calculateStudentFinalGrade({
                studentId: student.id,
                components: comps,
                grades: state.grades,
                track: ta.kurikulum_acuan,
              });
              return (
                <div key={ta.id} className="py-4 first:pt-0 last:pb-0 space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        {getSubjectName(ta.subject_id)}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {getTeacherName(ta.teacher_id)} · {ta.kurikulum_acuan}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold font-mono tabular-nums text-sky-900">
                        {nilaiAkhir !== null ? nilaiAkhir : '-'}
                      </p>
                      <p className="text-xs font-medium text-slate-600">{predikat}</p>
                    </div>
                  </div>
                  {comps.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 bg-slate-50 rounded-md p-3">
                      {comps.map((c) => {
                        const rec = state.grades.find(
                          (g) =>
                            g.student_id === student.id && g.component_id === c.id,
                        );
                        return (
                          <div key={c.id}>
                            <p className="text-xs text-slate-500">
                              {c.nama} (<span className="font-mono tabular-nums">{c.bobot}%</span>)
                            </p>
                            <p className="text-base font-bold font-mono tabular-nums text-slate-900">
                              {rec ? rec.nilai : '-'}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {section === 'cbt' && (
        <div className="space-y-6">
          {examResultSummary && (
            <div className="bg-white border border-emerald-200 rounded-lg p-6">
              <h3 className="text-base font-bold text-emerald-900">
                Ujian Selesai & Terkirim
              </h3>
              <p className="text-sm text-slate-700 mt-1 font-mono tabular-nums">
                Skor Objektif: {examResultSummary.totalEarned} /{' '}
                {examResultSummary.totalPossible} ({examResultSummary.percentage}%)
              </p>
            </div>
          )}

          {activeExamId && activeExamSessionId ? (
            (() => {
              const exam = state.exams.find((e) => e.id === activeExamId)!;
              const ta = myAssignments.find(
                (a) => a.id === exam.teacher_assignment_id,
              );
              const bank = ta
                ? state.question_banks.find((b) => b.subject_id === ta.subject_id)
                : undefined;
              const questions = bank
                ? state.questions.filter((q) => q.bank_id === bank.id)
                : state.questions;

              return (
                <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
                    <div>
                      <p className="text-xs text-slate-500">
                        Ujian CBT Berlangsung · Autosave Aktif
                      </p>
                      <h2 className="text-xl font-bold text-slate-900">{exam.judul}</h2>
                    </div>
                    <button
                      type="button"
                      onClick={handleFinishExam}
                      className="px-4 py-2 rounded-md bg-sky-800 hover:bg-sky-900 text-white text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Selesaikan & Kumpulkan Ujian
                    </button>
                  </div>

                  <div className="space-y-6">
                    {questions.map((q, idx) => {
                      const saved = state.exam_answers.find(
                        (a) =>
                          a.exam_session_id === activeExamSessionId &&
                          a.question_id === q.id,
                      );
                      return (
                        <div key={q.id} className="space-y-3 pb-5 border-b border-slate-200 last:border-b-0">
                          <p className="text-sm font-semibold text-slate-900">
                            {idx + 1}. {q.stem}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {q.options.map((opt) => (
                              <label
                                key={opt}
                                className={`flex items-center gap-2.5 p-3 rounded-md border text-sm cursor-pointer ${
                                  saved?.jawaban === opt
                                    ? 'border-sky-800 bg-sky-50 text-sky-950 font-medium'
                                    : 'border-slate-200 hover:bg-slate-50 text-slate-800'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`q-${q.id}`}
                                  checked={saved?.jawaban === opt}
                                  onChange={() => handleAutosaveAnswer(q.id, opt)}
                                />
                                <span>{opt}</span>
                              </label>
                            ))}
                          </div>
                          {saved && (
                            <p className="text-xs text-emerald-700 font-mono">
                              Tersimpan otomatis ({saved.disimpan_pada.slice(11, 19)})
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-slate-900">
                  Jadwal Ujian CBT (Subdomain cbt.sekolah.sch.id)
                </h2>
                {appMode === 'CBT' && (
                  <span className="text-xs font-semibold text-sky-900">
                    Portal CBT Terisolasi Aktif
                  </span>
                )}
              </div>
              <div className="divide-y divide-slate-200">
                {state.exams
                  .filter((e) => myAssignmentIds.has(e.teacher_assignment_id))
                  .map((exam) => {
                    const session = state.exam_sessions.find(
                      (s) => s.exam_id === exam.id && s.student_id === student.id,
                    );
                    const ta = myAssignments.find(
                      (a) => a.id === exam.teacher_assignment_id,
                    );
                    const bank = ta
                      ? state.question_banks.find((b) => b.subject_id === ta.subject_id)
                      : undefined;
                    const qs = bank
                      ? state.questions.filter((q) => q.bank_id === bank.id)
                      : state.questions;
                    const ans = session
                      ? state.exam_answers.filter(
                          (a) => a.exam_session_id === session.id,
                        )
                      : [];
                    const graded =
                      session?.status === 'SELESAI'
                        ? gradeStudentExamAnswers(qs, ans)
                        : null;

                    return (
                      <div
                        key={exam.id}
                        className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div>
                          <p className="text-xs text-slate-500">
                            {exam.tipe} ·{' '}
                            <span className="font-mono tabular-nums">
                              {exam.waktu_mulai.slice(0, 16).replace('T', ' ')}
                            </span>{' '}
                            · {exam.durasi_menit} menit
                          </p>
                          <h3 className="text-base font-bold text-slate-900">
                            {exam.judul}
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Token uji demo: <span className="font-mono font-semibold text-slate-700">{exam.token}</span>
                          </p>
                        </div>

                        {session?.status === 'SELESAI' ? (
                          <div className="text-sm font-semibold text-emerald-700 font-mono tabular-nums">
                            SELESAI · Skor {graded?.percentage ?? 0}%
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              aria-label={`Token untuk ${exam.judul}`}
                              value={tokenInputs[exam.id] ?? ''}
                              onChange={(e) =>
                                setTokenInputs((p) => ({
                                  ...p,
                                  [exam.id]: e.target.value,
                                }))
                              }
                              placeholder="Masukkan token"
                              className="w-36 px-3 py-1.5 text-sm font-mono uppercase border border-slate-300 rounded-md"
                            />
                            <button
                              type="button"
                              onClick={() => handleStartCbt(exam.id)}
                              className="px-4 py-1.5 rounded-md bg-sky-800 hover:bg-sky-900 text-white text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Mulai Ujian
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {section === 'pkl' && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          <h2 className="text-lg font-bold text-slate-900">
            Praktik Kerja Lapangan (PKL)
          </h2>
          {(() => {
            const placement = state.pkl_placements.find(
              (p) => p.student_id === student.id,
            );
            if (!placement) {
              return (
                <p className="text-sm text-slate-600">
                  Anda belum memiliki penempatan PKL aktif pada semester ini (PKL umumnya untuk siswa tingkat XI/XII sesuai jadwal jurusan).
                </p>
              );
            }
            const dudi = state.dudis.find((d) => d.id === placement.dudi_id);
            const journals = state.pkl_journals.filter(
              (j) => j.placement_id === placement.id,
            );
            const scores = state.pkl_scores.filter(
              (s) => s.placement_id === placement.id,
            );
            const pklSummary = calculatePklFinalScore(scores);

            return (
              <div className="space-y-5">
                <div className="p-4 rounded-md bg-slate-50 border border-slate-200 flex flex-wrap justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-500">Lokasi DUDI</p>
                    <p className="text-base font-bold text-slate-900">{dudi?.nama}</p>
                    <p className="text-xs text-slate-600">
                      Pembimbing DUDI: {placement.pembimbing_dudi_nama}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Nilai Akhir PKL</p>
                    <p className="text-2xl font-bold font-mono tabular-nums text-sky-900">
                      {pklSummary.finalScore}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pklActivity}
                    onChange={(e) => setPklActivity(e.target.value)}
                    placeholder="Catat aktivitas harian PKL hari ini..."
                    className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-md"
                  />
                  <button
                    type="button"
                    onClick={() => handleCreatePklJournal(placement.id)}
                    className="px-4 py-2 rounded-md bg-sky-800 hover:bg-sky-900 text-white text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Simpan Jurnal
                  </button>
                </div>

                <div className="divide-y divide-slate-200">
                  {journals.map((j) => (
                    <div key={j.id} className="py-3 flex justify-between gap-4">
                      <div>
                        <p className="text-xs font-mono text-slate-500">{j.tanggal}</p>
                        <p className="text-sm text-slate-800">{j.aktivitas}</p>
                      </div>
                      <span
                        className={`text-xs font-semibold whitespace-nowrap shrink-0 ${
                          j.validasi_bk ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {j.validasi_bk ? 'Tervalidasi BK' : 'Menunggu Validasi'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
