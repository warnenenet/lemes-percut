import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Copy,
  Download,
  Lock,
  Paperclip,
} from 'lucide-react';
import { ClientStatePayload, apiRequest, uploadLmsFile } from '../../api/client';
import {
  calculateStudentFinalGrade,
  validateComponentWeights,
} from '../../domain/grading';
import { downloadCsvFile, readFileAsBase64 } from '../../utils/fileTools';

interface GuruMapelPanelProps {
  section: string;
  payload: ClientStatePayload;
  onRefresh: () => Promise<void>;
}

export const GuruMapelPanel: React.FC<GuruMapelPanelProps> = ({
  section,
  payload,
  onRefresh,
}) => {
  const { auth, state } = payload;
  const teacher = auth.teacher!;
  const myAssignments = state.teacher_assignments.filter(
    (a) => a.teacher_id === teacher.id,
  );
  const otherTeacherAssignment = state.teacher_assignments.find(
    (a) => a.teacher_id !== teacher.id,
  );

  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>(
    myAssignments[0]?.id ?? '',
  );
  const currentAssignment =
    myAssignments.find((a) => a.id === selectedAssignmentId) ?? myAssignments[0];

  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );

  // Session form
  const [sesTopik, setSesTopik] = useState('');
  const [sesMulai, setSesMulai] = useState('07:30');
  const [sesSelesai, setSesSelesai] = useState('23:59');
  const [sesTipe, setSesTipe] = useState<'TEORI' | 'PRAKTIK' | 'TUGAS'>('TEORI');
  const [overrideReasons, setOverrideReasons] = useState<Record<string, string>>({});

  // Module form & clone
  const [modJudul, setModJudul] = useState('');
  const [modKonten, setModKonten] = useState('');
  const [uploadingModFile, setUploadingModFile] = useState(false);
  const [cloneTargetId, setCloneTargetId] = useState<string>(
    myAssignments[1]?.id ?? myAssignments[0]?.id ?? '',
  );

  // Task & Grading
  const [taskJudul, setTaskJudul] = useState('');
  const [taskDeskripsi, setTaskDeskripsi] = useState('');
  const [subScores, setSubScores] = useState<Record<string, string>>({});
  const [gradeEdits, setGradeEdits] = useState<Record<string, string>>({});
  const [eraporCsvPreview, setEraporCsvPreview] = useState<string | null>(null);

  // Notebook teacher comment
  const [nbComments, setNbComments] = useState<Record<string, string>>({});

  // CBT Exam creation (Overlap test!)
  const [examJudul, setExamJudul] = useState('');
  const [examTipe, setExamTipe] = useState<'MID' | 'FINAL' | 'CUSTOM' | 'SUSULAN'>('CUSTOM');
  const [examStartIso, setExamStartIso] = useState('2026-11-16T08:30:00Z');
  const [examDurasi, setExamDurasi] = useState(60);

  // Perangkat Ajar Prompt Generator + Checklist
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    state.prompt_templates[0]?.id ?? '',
  );
  const [promptInputs, setPromptInputs] = useState<Record<string, string>>({
    topik: 'Matriks Transformasi & Sistem Koordinat',
    model_pembelajaran: 'Project-Based Learning (PjBL)',
    dimensi_profil: 'Bernalar Kritis, Mandiri',
  });
  const [generatedPrompt, setGeneratedPrompt] = useState<string>('');
  const [docJudul, setDocJudul] = useState('');
  const [docKonten, setDocKonten] = useState('');
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});

  const getSubject = (subjectId: string) =>
    state.subjects.find((s) => s.id === subjectId);
  const getRombel = (rombelId: string) =>
    state.rombels.find((r) => r.id === rombelId);
  const getUserName = (userId: string) =>
    state.users.find((u) => u.id === userId)?.nama ?? userId;

  const rombelStudents = currentAssignment
    ? state.students.filter((s) => s.rombel_id === currentAssignment.rombel_id)
    : [];

  async function handleCreateSession(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const res = await apiRequest('/api/sessions', {
      method: 'POST',
      userId: auth.user.id,
      activeRole: auth.activeRole,
      body: {
        teacher_assignment_id: currentAssignment.id,
        topik: sesTopik,
        jam_mulai: sesMulai,
        jam_selesai: sesSelesai,
        tipe_sesi: sesTipe,
        module_id:
          state.modules.find(
            (m) => m.teacher_assignment_id === currentAssignment.id,
          )?.id ?? null,
      },
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setSesTopik('');
    setFeedback({ type: 'ok', text: 'Sesi pembelajaran berhasil dibuka.' });
    await onRefresh();
  }

  async function handleOverrideAttendance(
    sessionId: string,
    studentId: string,
    status: 'HADIR' | 'IZIN' | 'SAKIT' | 'ALPA',
  ) {
    setFeedback(null);
    const alasan = overrideReasons[`${sessionId}-${studentId}`] ?? '';
    const res = await apiRequest(`/api/sessions/${sessionId}/override`, {
      method: 'POST',
      userId: auth.user.id,
      activeRole: auth.activeRole,
      body: { student_id: studentId, status, alasan },
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setFeedback({ type: 'ok', text: `Override absensi disimpan (${status}).` });
    await onRefresh();
  }

  async function handleModuleFileAttach(file: File | null) {
    if (!file) return;
    setFeedback(null);
    setUploadingModFile(true);
    try {
      const base64Data = await readFileAsBase64(file);
      const res = await uploadLmsFile({
        category: 'modules',
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
      setModKonten((prev) =>
        `${prev ? prev + '\n\n' : ''}Lampiran Materi (${file.name}): ${res.data.file.url}`,
      );
      setFeedback({
        type: 'ok',
        text: `Berkas materi "${file.name}" terunggah dan ditautkan ke konten modul.`,
      });
    } catch {
      setFeedback({ type: 'err', text: 'Gagal mengunggah lampiran modul.' });
    } finally {
      setUploadingModFile(false);
    }
  }

  async function handleCreateModule(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const res = await apiRequest('/api/modules', {
      method: 'POST',
      userId: auth.user.id,
      activeRole: auth.activeRole,
      body: {
        teacher_assignment_id: currentAssignment.id,
        judul: modJudul,
        konten: modKonten,
        status: 'PUBLISHED',
      },
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setModJudul('');
    setModKonten('');
    setFeedback({ type: 'ok', text: 'Modul belajar berhasil dipublikasikan.' });
    await onRefresh();
  }

  async function handleCloneModule(moduleId: string) {
    setFeedback(null);
    const res = await apiRequest(`/api/modules/${moduleId}/clone`, {
      method: 'POST',
      userId: auth.user.id,
      activeRole: auth.activeRole,
      body: { target_assignment_id: cloneTargetId },
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setFeedback({ type: 'ok', text: 'Modul berhasil di-clone ke kelas tujuan.' });
    await onRefresh();
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const res = await apiRequest('/api/tasks', {
      method: 'POST',
      userId: auth.user.id,
      activeRole: auth.activeRole,
      body: {
        teacher_assignment_id: currentAssignment.id,
        judul: taskJudul,
        deskripsi: taskDeskripsi,
        tipe: 'TUGAS',
      },
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setTaskJudul('');
    setTaskDeskripsi('');
    setFeedback({ type: 'ok', text: 'Tugas baru berhasil dibuat.' });
    await onRefresh();
  }

  async function handleGradeSubmission(submissionId: string) {
    setFeedback(null);
    const nilai = Number(subScores[submissionId]);
    const res = await apiRequest(`/api/submissions/${submissionId}/grade`, {
      method: 'POST',
      userId: auth.user.id,
      activeRole: auth.activeRole,
      body: { nilai, catatan_guru: 'Dinilai oleh guru pengampu.' },
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setFeedback({ type: 'ok', text: 'Nilai submission tersimpan.' });
    await onRefresh();
  }

  async function handleSaveComponentGrade(studentId: string, componentId: string) {
    setFeedback(null);
    const raw = gradeEdits[`${studentId}-${componentId}`];
    if (raw === undefined || raw === '') return;
    const res = await apiRequest('/api/grades', {
      method: 'POST',
      userId: auth.user.id,
      activeRole: auth.activeRole,
      body: {
        student_id: studentId,
        teacher_assignment_id: currentAssignment.id,
        component_id: componentId,
        nilai: Number(raw),
      },
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setFeedback({ type: 'ok', text: 'Nilai komponen diperbarui.' });
    await onRefresh();
  }

  async function handleTestCrossTeacherRbac() {
    if (!otherTeacherAssignment) return;
    setFeedback(null);
    const targetCompId =
      state.grade_components.find(
        (c) => c.teacher_assignment_id === otherTeacherAssignment.id,
      )?.id ??
      state.grade_components[0]?.id ??
      '';
    const res = await apiRequest('/api/grades', {
      method: 'POST',
      userId: auth.user.id,
      activeRole: auth.activeRole,
      body: {
        student_id: state.students[0]?.id,
        teacher_assignment_id: otherTeacherAssignment.id,
        component_id: targetCompId,
        nilai: 99,
      },
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: `HTTP ${res.error.httpStatus}: ${res.error.message}` });
    }
  }

  async function handleExportErapor() {
    setFeedback(null);
    const res = await apiRequest<{ ok: true; export: { csvContent: string; rows: unknown[] } }>(
      '/api/erapor/export',
      {
        method: 'POST',
        userId: auth.user.id,
        activeRole: auth.activeRole,
        body: { teacher_assignment_id: currentAssignment.id },
      },
    );
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setEraporCsvPreview(res.data.export.csvContent);
    setFeedback({
      type: 'ok',
      text: `Export e-Rapor berhasil (${res.data.export.rows.length} baris siswa sesuai mapping Admin).`,
    });
    await onRefresh();
  }

  async function handleCreateExam(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const res = await apiRequest<{ ok: true; exam: { judul: string; token: string } }>(
      '/api/cbt/exams',
      {
        method: 'POST',
        userId: auth.user.id,
        activeRole: auth.activeRole,
        body: {
          teacher_assignment_id: currentAssignment.id,
          tipe: examTipe,
          judul: examJudul,
          waktu_mulai: examStartIso,
          durasi_menit: examDurasi,
        },
      },
    );
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setExamJudul('');
    setFeedback({
      type: 'ok',
      text: `Jadwal CBT "${res.data.exam.judul}" dibuat. Token: ${res.data.exam.token}`,
    });
    await onRefresh();
  }

  async function handleGeneratePrompt() {
    setFeedback(null);
    const res = await apiRequest<{ ok: true; prompt: string }>(
      '/api/perangkat-ajar/generate',
      {
        method: 'POST',
        userId: auth.user.id,
        activeRole: auth.activeRole,
        body: {
          teacher_assignment_id: currentAssignment.id,
          template_id: selectedTemplateId,
          teacher_inputs: promptInputs,
        },
      },
    );
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setGeneratedPrompt(res.data.prompt);
    if (!docJudul) {
      setDocJudul(`Perangkat Ajar - ${promptInputs.topik ?? 'Topik Baru'}`);
    }
    setFeedback({
      type: 'ok',
      text: 'Prompt ter-generate otomatis (bebas data pribadi siswa). Salin ke AI eksternal pilihan Anda.',
    });
  }

  async function handleSaveDocumentDraft() {
    setFeedback(null);
    const res = await apiRequest<{ ok: true; document: { id: string } }>(
      '/api/perangkat-ajar/save',
      {
        method: 'POST',
        userId: auth.user.id,
        activeRole: auth.activeRole,
        body: {
          id: editingDocId,
          teacher_assignment_id: currentAssignment.id,
          template_id: selectedTemplateId,
          judul: docJudul,
          konten: docKonten,
          generated_prompt: generatedPrompt,
          checklist_state: checklistState,
        },
      },
    );
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setEditingDocId(res.data.document.id);
    setFeedback({ type: 'ok', text: 'Perangkat ajar disimpan sebagai DRAFT.' });
    await onRefresh();
  }

  async function handlePublishDocument() {
    if (!editingDocId) {
      setFeedback({ type: 'err', text: 'Simpan draft terlebih dahulu sebelum mempublikasikan.' });
      return;
    }
    setFeedback(null);
    const res = await apiRequest(`/api/perangkat-ajar/${editingDocId}/publish`, {
      method: 'POST',
      userId: auth.user.id,
      activeRole: auth.activeRole,
      body: { checklist_state: checklistState },
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error.message });
      return;
    }
    setFeedback({ type: 'ok', text: 'Perangkat ajar berhasil berstatus PUBLISHED!' });
    await onRefresh();
  }

  return (
    <div className="space-y-6">
      {/* Assignment Selector Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500">
            Penugasan Mengajar Aktif (RBAC Terisolasi per Guru)
          </p>
          <p className="text-sm font-semibold text-slate-900">
            {currentAssignment
              ? `${getSubject(currentAssignment.subject_id)?.nama} · ${getRombel(currentAssignment.rombel_id)?.nama_rombel} · Kurikulum ${currentAssignment.kurikulum_acuan}`
              : 'Belum ada penugasan'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0 w-full sm:w-auto">
          <label htmlFor="teacher-assignment-select" className="text-xs text-slate-600 shrink-0">
            Kelas & Mapel:
          </label>
          <select
            id="teacher-assignment-select"
            value={currentAssignment?.id ?? ''}
            onChange={(e) => setSelectedAssignmentId(e.target.value)}
            className="w-full sm:w-auto max-w-full min-w-0 px-3 py-1.5 text-sm border border-slate-300 rounded-md bg-white text-slate-900"
          >
            {myAssignments.map((a) => (
              <option key={a.id} value={a.id}>
                {getSubject(a.subject_id)?.nama} — {getRombel(a.rombel_id)?.nama_rombel} ({a.kurikulum_acuan})
              </option>
            ))}
          </select>
        </div>
      </div>

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
            <p className="text-xs text-slate-500">
              NUPTK <span className="font-mono tabular-nums">{teacher.nuptk}</span> · NIP{' '}
              <span className="font-mono tabular-nums">{teacher.nip}</span>
            </p>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">
              Workspace Guru Mapel — {auth.user.nama}
            </h1>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-5 border-t border-slate-200">
              <div>
                <p className="text-xs text-slate-500">Kelas Ampu</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                  {myAssignments.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Sesi Terbuka</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-sky-800">
                  {
                    state.sessions.filter(
                      (s) =>
                        myAssignments.some((a) => a.id === s.teacher_assignment_id) &&
                        s.status === 'OPEN',
                    ).length
                  }
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Submission Perlu Nilai</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-amber-700">
                  {state.submissions.filter((s) => s.nilai === null).length}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Perangkat Ajar Publish</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
                  {
                    state.teacher_documents.filter(
                      (d) =>
                        myAssignments.some((a) => a.id === d.teacher_assignment_id) &&
                        d.status === 'PUBLISHED',
                    ).length
                  }
                </p>
              </div>
            </div>
          </div>

          {otherTeacherAssignment && (
            <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Verifikasi Isolasi RBAC Antar Guru Mapel
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Uji coba akses ke penugasan Matematika milik guru lain ({getRombel(otherTeacherAssignment.rombel_id)?.nama_rombel}) harus ditolak dengan HTTP 403.
                </p>
              </div>
              <button
                type="button"
                onClick={handleTestCrossTeacherRbac}
                className="px-3.5 py-2 rounded-md border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-slate-800 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Uji Akses Lintas Guru (403)</span>
              </button>
            </div>
          )}
        </div>
      )}

      {section === 'sesi' && currentAssignment && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">
              Buat & Buka Sesi Pembelajaran
            </h2>
            <form onSubmit={handleCreateSession} className="space-y-3">
              <div>
                <label htmlFor="ses-topik" className="block text-xs font-medium text-slate-700 mb-1">
                  Topik Pertemuan
                </label>
                <input
                  id="ses-topik"
                  type="text"
                  value={sesTopik}
                  onChange={(e) => setSesTopik(e.target.value)}
                  placeholder="Misal: Transformasi Dilatasi & Komposisi"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label htmlFor="ses-mulai" className="block text-xs font-medium text-slate-700 mb-1">
                    Mulai
                  </label>
                  <input
                    id="ses-mulai"
                    type="text"
                    value={sesMulai}
                    onChange={(e) => setSesMulai(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label htmlFor="ses-selesai" className="block text-xs font-medium text-slate-700 mb-1">
                    Selesai
                  </label>
                  <input
                    id="ses-selesai"
                    type="text"
                    value={sesSelesai}
                    onChange={(e) => setSesSelesai(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label htmlFor="ses-tipe" className="block text-xs font-medium text-slate-700 mb-1">
                    Tipe Sesi
                  </label>
                  <select
                    id="ses-tipe"
                    value={sesTipe}
                    onChange={(e) => setSesTipe(e.target.value as 'TEORI' | 'PRAKTIK' | 'TUGAS')}
                    className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md bg-white"
                  >
                    <option value="TEORI">TEORI</option>
                    <option value="PRAKTIK">PRAKTIK</option>
                    <option value="TUGAS">TUGAS</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-2 px-4 rounded-md bg-sky-800 hover:bg-sky-900 text-white text-sm font-semibold cursor-pointer"
              >
                Buka Sesi Sekarang
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6 space-y-5">
            <h2 className="text-lg font-bold text-slate-900">
              Daftar Sesi & Absensi Otomatis ({getRombel(currentAssignment.rombel_id)?.nama_rombel})
            </h2>
            {state.sessions
              .filter((s) => s.teacher_assignment_id === currentAssignment.id)
              .map((ses) => (
                <div key={ses.id} className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-500 font-mono tabular-nums">
                        Pertemuan {ses.pertemuan_ke} · {ses.jam_mulai}–{ses.jam_selesai} · {ses.tipe_sesi}
                      </p>
                      <h3 className="text-base font-bold text-slate-900">{ses.topik}</h3>
                    </div>
                    <span className="text-xs font-semibold text-sky-900">{ses.status}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Daftar Hadir Rombel ({rombelStudents.length} siswa)</span>
                    <span className="font-mono tabular-nums">
                      Min. Baca {ses.minimum_read_pct}%
                    </span>
                  </div>
                  <div className="divide-y divide-slate-200 max-h-[460px] overflow-y-auto pr-1">
                    {rombelStudents.map((stu) => {
                      const rec = state.attendance_records.find(
                        (r) => r.session_id === ses.id && r.student_id === stu.id,
                      );
                      const key = `${ses.id}-${stu.id}`;
                      return (
                        <div key={stu.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {getUserName(stu.user_id)}
                            </p>
                            <p className="text-slate-500 font-mono tabular-nums">
                              Status: {rec?.status ?? 'BELUM AKSES'} · Baca {rec?.read_pct ?? 0}%
                              {rec?.alasan_override ? ` · Override: ${rec.alasan_override}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              aria-label={`Alasan override untuk ${getUserName(stu.user_id)}`}
                              value={overrideReasons[key] ?? ''}
                              onChange={(e) =>
                                setOverrideReasons((p) => ({ ...p, [key]: e.target.value }))
                              }
                              placeholder="Alasan override..."
                              className="w-36 px-2 py-1 border border-slate-300 rounded text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => handleOverrideAttendance(ses.id, stu.id, 'IZIN')}
                              className="px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-100 font-medium text-slate-700 cursor-pointer"
                            >
                              Izin
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOverrideAttendance(ses.id, stu.id, 'HADIR')}
                              className="px-2.5 py-1 rounded bg-sky-800 hover:bg-sky-900 text-white font-medium cursor-pointer"
                            >
                              Hadir
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {section === 'modul' && currentAssignment && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Buat Modul Belajar</h2>
            <form onSubmit={handleCreateModule} className="space-y-3">
              <div>
                <label htmlFor="mod-judul" className="block text-xs font-medium text-slate-700 mb-1">
                  Judul Modul
                </label>
                <input
                  id="mod-judul"
                  type="text"
                  value={modJudul}
                  onChange={(e) => setModJudul(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label htmlFor="mod-konten" className="block text-xs font-medium text-slate-700">
                    Materi Pembelajaran
                  </label>
                  <label className="inline-flex items-center gap-1 text-xs font-medium text-sky-800 hover:underline cursor-pointer">
                    <Paperclip className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{uploadingModFile ? 'Mengunggah...' : 'Lampirkan PDF/Gambar'}</span>
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.md,.doc,.docx"
                      className="sr-only"
                      onChange={(e) => handleModuleFileAttach(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
                <textarea
                  id="mod-konten"
                  rows={5}
                  value={modKonten}
                  onChange={(e) => setModKonten(e.target.value)}
                  className="w-full p-3 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 px-4 rounded-md bg-sky-800 hover:bg-sky-900 text-white text-sm font-semibold cursor-pointer"
              >
                Terbitkan Modul
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-slate-900">Modul & Clone Antar Kelas</h2>
              <div className="flex items-center gap-2 text-xs">
                <span>Clone ke:</span>
                <select
                  value={cloneTargetId}
                  onChange={(e) => setCloneTargetId(e.target.value)}
                  className="px-2 py-1 border border-slate-300 rounded bg-white"
                >
                  {myAssignments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {getSubject(a.subject_id)?.kode} - {getRombel(a.rombel_id)?.nama_rombel}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="divide-y divide-slate-200">
              {state.modules
                .filter((m) => m.teacher_assignment_id === currentAssignment.id)
                .map((m) => (
                  <div key={m.id} className="py-4 first:pt-0 last:pb-0 flex justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-500">
                        {m.status} {m.cloned_from ? `· Clone dari ${m.cloned_from}` : ''}
                      </p>
                      <h3 className="text-base font-bold text-slate-900">{m.judul}</h3>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2">{m.konten}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCloneModule(m.id)}
                      className="px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-100 text-xs font-medium text-slate-700 h-fit whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Clone ke Kelas Tujuan
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {section === 'tugas' && currentAssignment && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Buat Tugas Baru</h2>
            <form onSubmit={handleCreateTask} className="space-y-3">
              <input
                type="text"
                value={taskJudul}
                onChange={(e) => setTaskJudul(e.target.value)}
                placeholder="Judul LKPD / Tugas"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
              <textarea
                rows={4}
                value={taskDeskripsi}
                onChange={(e) => setTaskDeskripsi(e.target.value)}
                placeholder="Instruksi pengerjaan dan rubrik..."
                className="w-full p-3 text-sm border border-slate-300 rounded-md"
              />
              <button
                type="submit"
                className="w-full py-2 px-4 rounded-md bg-sky-800 hover:bg-sky-900 text-white text-sm font-semibold cursor-pointer"
              >
                Terbitkan Tugas
              </button>
            </form>
          </div>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Penilaian Submission Siswa</h2>
            {state.assignments
              .filter((t) => t.teacher_assignment_id === currentAssignment.id)
              .map((task) => {
                const subs = state.submissions.filter((s) => s.assignment_id === task.id);
                return (
                  <div key={task.id} className="border border-slate-200 rounded-lg p-4 space-y-3">
                    <h3 className="text-base font-bold text-slate-900">{task.judul}</h3>
                    {subs.length === 0 ? (
                      <p className="text-xs text-slate-500">Belum ada siswa mengumpulkan.</p>
                    ) : (
                      <div className="divide-y divide-slate-200">
                        {subs.map((sub) => {
                          const stu = state.students.find((s) => s.id === sub.student_id);
                          return (
                            <div key={sub.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  {stu ? getUserName(stu.user_id) : sub.student_id}
                                </p>
                                <p className="text-xs text-slate-600 mt-0.5">{sub.teks}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={subScores[sub.id] ?? (sub.nilai !== null ? String(sub.nilai) : '')}
                                  onChange={(e) =>
                                    setSubScores((p) => ({ ...p, [sub.id]: e.target.value }))
                                  }
                                  placeholder="0-100"
                                  className="w-20 px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleGradeSubmission(sub.id)}
                                  className="px-3 py-1.5 rounded bg-sky-800 hover:bg-sky-900 text-white text-xs font-medium cursor-pointer"
                                >
                                  Simpan Nilai
                                </button>
                              </div>
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

      {section === 'buku-tulis' && currentAssignment && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-900">
            Buku Tulis Digital Siswa · {getSubject(currentAssignment.subject_id)?.nama}
          </h2>
          {state.notebooks
            .filter((n) => n.teacher_assignment_id === currentAssignment.id)
            .map((nb) => {
              const stu = state.students.find((s) => s.id === nb.student_id);
              const entries = state.notebook_entries.filter((e) => e.notebook_id === nb.id);
              return (
                <div key={nb.id} className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <h3 className="text-base font-bold text-slate-900">
                    {stu ? getUserName(stu.user_id) : nb.student_id}
                  </h3>
                  {entries.map((entry) => (
                    <div key={entry.id} className="p-3 rounded-md bg-slate-50 border border-slate-200 space-y-2">
                      <p className="text-sm font-semibold text-slate-900">{entry.judul}</p>
                      <p className="text-sm text-slate-700">{entry.konten}</p>
                      <div className="flex gap-2 pt-1">
                        <input
                          type="text"
                          value={nbComments[entry.id] ?? entry.komentar_guru ?? ''}
                          onChange={(e) =>
                            setNbComments((p) => ({ ...p, [entry.id]: e.target.value }))
                          }
                          placeholder="Tulis umpan balik guru..."
                          className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded bg-white"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            setFeedback(null);
                            const res = await apiRequest(`/api/notebook-entries/${entry.id}/comment`, {
                              method: 'POST',
                              userId: auth.user.id,
                              activeRole: auth.activeRole,
                              body: { komentar: nbComments[entry.id] ?? '' },
                            });
                            if (!res.ok) {
                              setFeedback({ type: 'err', text: res.error.message });
                              return;
                            }
                            setFeedback({ type: 'ok', text: 'Komentar buku tulis disimpan.' });
                            await onRefresh();
                          }}
                          className="px-3 py-1.5 rounded bg-sky-800 text-white text-xs font-medium cursor-pointer"
                        >
                          Beri Komentar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
        </div>
      )}

      {section === 'nilai' && currentAssignment && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          {(() => {
            const comps = state.grade_components.filter(
              (c) => c.teacher_assignment_id === currentAssignment.id,
            );
            const weightStatus = validateComponentWeights(comps);
            const rombel = getRombel(currentAssignment.rombel_id)!;
            return (
              <>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Input Nilai Komponen & Export e-Rapor ({rombel.nama_rombel})
                    </h2>
                    <p className="text-xs text-slate-500">
                      Bobot Komponen:{' '}
                      {comps.map((c) => `${c.nama} ${c.bobot}%`).join(' · ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportErapor}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-sky-800 hover:bg-sky-900 text-white text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Download className="w-4 h-4" aria-hidden="true" />
                    <span>Export e-Rapor (Sesuai Mapping)</span>
                  </button>
                </div>

                {!weightStatus.valid && (
                  <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900">
                    {weightStatus.message}
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs text-slate-500">
                        <th className="py-2.5 pr-4 font-semibold">NISN</th>
                        <th className="py-2.5 pr-4 font-semibold">Nama Siswa</th>
                        {comps.map((c) => (
                          <th key={c.id} className="py-2.5 pr-3 font-semibold">
                            {c.nama} ({c.bobot}%)
                          </th>
                        ))}
                        <th className="py-2.5 pr-4 font-semibold">Nilai Akhir</th>
                        <th className="py-2.5 font-semibold">Predikat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {rombelStudents.map((stu) => {
                        const { nilaiAkhir, predikat } = calculateStudentFinalGrade({
                          studentId: stu.id,
                          components: comps,
                          grades: state.grades,
                          track: rombel.kurikulum_acuan,
                        });
                        return (
                          <tr key={stu.id} className="hover:bg-slate-50">
                            <td className="py-3 pr-4 font-mono tabular-nums text-xs text-slate-600">
                              {stu.nisn}
                            </td>
                            <td className="py-3 pr-4 font-medium text-slate-900">
                              {getUserName(stu.user_id)}
                            </td>
                            {comps.map((c) => {
                              const rec = state.grades.find(
                                (g) =>
                                  g.student_id === stu.id && g.component_id === c.id,
                              );
                              const k = `${stu.id}-${c.id}`;
                              return (
                                <td key={c.id} className="py-2 pr-3">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      value={gradeEdits[k] ?? (rec ? String(rec.nilai) : '')}
                                      onChange={(e) =>
                                        setGradeEdits((p) => ({ ...p, [k]: e.target.value }))
                                      }
                                      className="w-16 px-2 py-1 text-xs font-mono border border-slate-300 rounded"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleSaveComponentGrade(stu.id, c.id)}
                                      className="px-2 py-1 rounded border border-slate-300 hover:bg-slate-100 text-xs cursor-pointer"
                                    >
                                      OK
                                    </button>
                                  </div>
                                </td>
                              );
                            })}
                            <td className="py-3 pr-4 font-mono tabular-nums font-bold text-sky-900">
                              {nilaiAkhir ?? '-'}
                            </td>
                            <td className="py-3 text-xs font-semibold text-slate-700">
                              {predikat}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {eraporCsvPreview && (
                  <div className="p-4 rounded-lg bg-slate-900 text-slate-100 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-sky-300">
                        Preview Hasil Export CSV e-Rapor (Jumlah baris = {rombelStudents.length} siswa)
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          downloadCsvFile(
                            `erapor-${rombel.nama_rombel.replace(/\s+/g, '-').toLowerCase()}.csv`,
                            eraporCsvPreview,
                          )
                        }
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-600 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Unduh File .CSV</span>
                      </button>
                    </div>
                    <pre className="text-xs font-mono overflow-x-auto max-h-80 overflow-y-auto whitespace-pre">
                      {eraporCsvPreview}
                    </pre>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {section === 'cbt' && currentAssignment && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">
              Jadwalkan Ujian CBT (Anti-Overlap Siswa)
            </h2>
            <p className="text-xs text-slate-600">
              Sistem memeriksa bentrok jadwal untuk seluruh siswa di kelas {getRombel(currentAssignment.rombel_id)?.nama_rombel} lintas semua guru dan mata pelajaran.
            </p>
            <form onSubmit={handleCreateExam} className="space-y-3">
              <div>
                <label htmlFor="ex-judul" className="block text-xs font-medium text-slate-700 mb-1">
                  Judul Ujian
                </label>
                <input
                  id="ex-judul"
                  type="text"
                  value={examJudul}
                  onChange={(e) => setExamJudul(e.target.value)}
                  placeholder="Misal: Ujian Harian / Susulan"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="ex-tipe" className="block text-xs font-medium text-slate-700 mb-1">
                    Tipe Ujian
                  </label>
                  <select
                    id="ex-tipe"
                    value={examTipe}
                    onChange={(e) =>
                      setExamTipe(e.target.value as 'MID' | 'FINAL' | 'CUSTOM' | 'SUSULAN')
                    }
                    className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded-md bg-white"
                  >
                    <option value="CUSTOM">CUSTOM</option>
                    <option value="MID">MID</option>
                    <option value="FINAL">FINAL</option>
                    <option value="SUSULAN">SUSULAN (Khusus Guru Mapel)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="ex-durasi" className="block text-xs font-medium text-slate-700 mb-1">
                    Durasi (Menit)
                  </label>
                  <input
                    id="ex-durasi"
                    type="number"
                    value={examDurasi}
                    onChange={(e) => setExamDurasi(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="ex-start" className="block text-xs font-medium text-slate-700 mb-1">
                  Waktu Mulai (ISO UTC)
                </label>
                <input
                  id="ex-start"
                  type="text"
                  value={examStartIso}
                  onChange={(e) => setExamStartIso(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Tips uji bentrok: 2026-11-16T08:30:00Z bentrok dengan STS Matematika XI RPL 1 (08:00–09:30).
                </p>
              </div>
              <button
                type="submit"
                className="w-full py-2 px-4 rounded-md bg-sky-800 hover:bg-sky-900 text-white text-sm font-semibold cursor-pointer"
              >
                Simpan & Validasi Jadwal CBT
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">
              Monitoring Ujian & Token Aktif
            </h2>
            <div className="divide-y divide-slate-200">
              {state.exams
                .filter((e) => myAssignments.some((a) => a.id === e.teacher_assignment_id))
                .map((ex) => {
                  const sessions = state.exam_sessions.filter((s) => s.exam_id === ex.id);
                  return (
                    <div key={ex.id} className="py-4 first:pt-0 last:pb-0 space-y-2">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs text-slate-500">
                            {ex.tipe} · Token:{' '}
                            <span className="font-mono font-bold text-sky-900">{ex.token}</span>
                          </p>
                          <h3 className="text-base font-bold text-slate-900">{ex.judul}</h3>
                          <p className="text-xs font-mono text-slate-500">
                            {ex.waktu_mulai} · {ex.durasi_menit} menit
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-emerald-700">{ex.status}</span>
                      </div>
                      <p className="text-xs text-slate-600">
                        Peserta aktif/selesai: <span className="font-mono tabular-nums">{sessions.length}</span>
                      </p>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {section === 'perangkat-ajar' && currentAssignment && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {(() => {
            const template =
              state.prompt_templates.find((t) => t.id === selectedTemplateId) ??
              state.prompt_templates[0];
            const allChecked = template.validation_checklist.every(
              (item) => checklistState[item] === true,
            );
            return (
              <>
                <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
                  <h2 className="text-lg font-bold text-slate-900">
                    Generator Prompt Perangkat Ajar
                  </h2>
                  <p className="text-xs text-slate-600">
                    Merakit prompt model-agnostik (Gemini, Claude, DeepSeek, ChatGPT) dari data master tanpa mengirim data siswa.
                  </p>

                  <div>
                    <label htmlFor="tpl-select" className="block text-xs font-medium text-slate-700 mb-1">
                      Template Kurikulum ({currentAssignment.kurikulum_acuan})
                    </label>
                    <select
                      id="tpl-select"
                      value={selectedTemplateId}
                      onChange={(e) => {
                        setSelectedTemplateId(e.target.value);
                        setChecklistState({});
                      }}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                    >
                      {state.prompt_templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          [{t.kategori} · {t.kurikulum_acuan}] {t.nama}
                        </option>
                      ))}
                    </select>
                  </div>

                  {template.input_fields.map((field) => (
                    <div key={field.key}>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        {field.label} {field.required ? '*' : ''}
                      </label>
                      <input
                        type="text"
                        value={promptInputs[field.key] ?? ''}
                        onChange={(e) =>
                          setPromptInputs((p) => ({ ...p, [field.key]: e.target.value }))
                        }
                        placeholder={field.placeholder}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                      />
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={handleGeneratePrompt}
                    className="w-full py-2 px-4 rounded-md bg-sky-800 hover:bg-sky-900 text-white text-sm font-semibold cursor-pointer"
                  >
                    Rakit Prompt Otomatis
                  </button>

                  {generatedPrompt && (
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-700">
                          Prompt Siap Salin
                        </span>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard?.writeText(generatedPrompt)}
                          className="flex items-center gap-1 text-xs font-medium text-sky-800 hover:underline cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Salin</span>
                        </button>
                      </div>
                      <pre className="p-3 rounded-md bg-slate-900 text-slate-100 text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
                        {generatedPrompt}
                      </pre>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
                  <h2 className="text-lg font-bold text-slate-900">
                    Editor Hasil AI & Checklist Validasi Publish
                  </h2>

                  <div>
                    <label htmlFor="doc-judul" className="block text-xs font-medium text-slate-700 mb-1">
                      Judul Perangkat Ajar
                    </label>
                    <input
                      id="doc-judul"
                      type="text"
                      value={docJudul}
                      onChange={(e) => setDocJudul(e.target.value)}
                      placeholder="Judul Modul Ajar / RPP..."
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                    />
                  </div>

                  <div>
                    <label htmlFor="doc-konten" className="block text-xs font-medium text-slate-700 mb-1">
                      Tempel & Sunting Hasil AI Eksternal
                    </label>
                    <textarea
                      id="doc-konten"
                      rows={6}
                      value={docKonten}
                      onChange={(e) => setDocKonten(e.target.value)}
                      placeholder="Tempelkan hasil perangkat ajar dari Gemini / Claude / DeepSeek / ChatGPT di sini..."
                      className="w-full p-3 text-sm border border-slate-300 rounded-md"
                    />
                  </div>

                  <div className="p-4 rounded-md bg-slate-50 border border-slate-200 space-y-2">
                    <p className="text-xs font-bold text-slate-900">
                      Checklist Validasi Wajib Sebelum Publish
                    </p>
                    {template.validation_checklist.map((item) => (
                      <label key={item} className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(checklistState[item])}
                          onChange={(e) =>
                            setChecklistState((p) => ({ ...p, [item]: e.target.checked }))
                          }
                          className="mt-0.5"
                        />
                        <span>{item}</span>
                      </label>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleSaveDocumentDraft}
                      className="px-4 py-2 rounded-md border border-slate-300 hover:bg-slate-100 text-sm font-semibold text-slate-800 cursor-pointer"
                    >
                      Simpan Draft
                    </button>
                    <button
                      type="button"
                      disabled={!allChecked || !editingDocId}
                      onClick={handlePublishDocument}
                      className="px-4 py-2 rounded-md bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 disabled:text-slate-500 text-white text-sm font-semibold cursor-pointer disabled:cursor-not-allowed"
                    >
                      Publish Perangkat Ajar
                    </button>
                  </div>

                  <div className="pt-4 border-t border-slate-200 space-y-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      Dokumen Tersimpan
                    </h3>
                    {state.teacher_documents
                      .filter((d) => myAssignments.some((a) => a.id === d.teacher_assignment_id))
                      .map((doc) => (
                        <div
                          key={doc.id}
                          className="p-3 rounded-md border border-slate-200 flex items-center justify-between gap-4 text-xs"
                        >
                          <div>
                            <p className="font-semibold text-slate-900">{doc.judul}</p>
                            <p className="text-slate-500">
                              Status:{' '}
                              <span
                                className={
                                  doc.status === 'PUBLISHED'
                                    ? 'font-bold text-emerald-700'
                                    : 'font-bold text-amber-700'
                                }
                              >
                                {doc.status}
                              </span>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDocId(doc.id);
                              setSelectedTemplateId(doc.template_id);
                              setDocJudul(doc.judul);
                              setDocKonten(doc.konten);
                              setChecklistState({ ...doc.checklist_state });
                            }}
                            className="px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-100 font-medium cursor-pointer"
                          >
                            Muat ke Editor
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
};
