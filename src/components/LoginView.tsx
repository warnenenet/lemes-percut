import React, { useState } from 'react';
import { Lock, LogIn, ShieldCheck, ArrowRight, MonitorCheck } from 'lucide-react';
import { User, UserRole } from '../domain/types';
import { loginWithCredentials } from '../api/client';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { OfflineIndicator } from '../pwa/OfflineIndicator';

interface DemoUserOption {
  id: string;
  nama: string;
  email: string;
  roles: ReadonlyArray<UserRole>;
}

interface LoginViewProps {
  schoolName: string;
  npsn: string;
  academicYearLabel: string;
  appMode: 'LMS' | 'CBT';
  demoUsers: DemoUserOption[];
  onLoginSuccess: (user: User) => void;
}

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Admin Sistem',
  KEPALA_SEKOLAH: 'Kepala Sekolah',
  WAKASEK: 'Wakasek Kurikulum',
  GURU_MAPEL: 'Guru Mata Pelajaran',
  GURU_BK: 'Guru Bimbingan Konseling',
  WALI_KELAS: 'Wali Kelas',
  SISWA: 'Peserta Didik',
};

export const LoginView: React.FC<LoginViewProps> = ({
  schoolName,
  npsn,
  academicYearLabel,
  appMode,
  demoUsers,
  onLoginSuccess,
}) => {
  const [identifier, setIdentifier] = useState(
    appMode === 'CBT'
      ? 'rizky.siswa@smkn1percut.sch.id'
      : 'budi.mtk@smkn1percut.sch.id',
  );
  const [password, setPassword] = useState('smkn1percut');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submitLogin(idValue: string, passValue: string) {
    setErrorMsg(null);
    if (!idValue.trim() || !passValue) {
      setErrorMsg('Email / NISN / NUPTK dan kata sandi wajib diisi.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await loginWithCredentials(idValue.trim(), passValue);
      if (!res.ok) {
        setErrorMsg(res.error.message ?? 'Gagal masuk ke sistem.');
        return;
      }
      onLoginSuccess(res.data.user);
    } finally {
      setSubmitting(false);
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitLogin(identifier, password);
  }

  function handleQuickSelect(email: string) {
    setIdentifier(email);
    setPassword('smkn1percut');
    submitLogin(email, 'smkn1percut');
  }

  const isCbtMode = appMode === 'CBT';

  return (
    <div className="min-h-screen bg-slate-50 grid grid-cols-1 lg:grid-cols-12 items-stretch">
      <OfflineIndicator />

      {/* Left Institutional Campus Showcase */}
      <div className="lg:col-span-7 relative min-h-[280px] lg:min-h-screen bg-slate-900 overflow-hidden flex flex-col justify-between">
        <img
          src="/src/assets/images/smkn1_percut_campus_1794859947600.jpg"
          alt="Lingkungan Kampus SMK Negeri 1 Percut Sei Tuan"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/92 via-slate-900/60 to-slate-950/45" />

        <div className="relative z-10 p-6 sm:p-8 lg:p-12 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-lg bg-white p-1.5 shrink-0 border border-slate-200 overflow-hidden">
              <img
                src="/src/assets/images/smkn1_emblem_1794859933905.jpg"
                alt="Lambang SMK Negeri 1 Percut Sei Tuan"
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="text-white min-w-0">
              <p className="text-xs font-medium tracking-wide text-slate-200">
                NPSN <span className="font-mono tabular-nums">{npsn}</span> · Deli Serdang
              </p>
              <h1 className="text-lg font-semibold tracking-tight truncate">{schoolName}</h1>
            </div>
          </div>

          <div className="shrink-0">
            <PWAInstallButton compact />
          </div>
        </div>

        <div className="relative z-10 p-6 sm:p-8 lg:p-12 max-w-2xl text-white space-y-4">
          <p className="text-xs font-medium text-sky-200 tracking-wide">
            {isCbtMode
              ? `Portal Ujian Terisolasi (cbt.sekolah.sch.id) · ${academicYearLabel}`
              : `Portal Pembelajaran & Administrasi Akademik · ${academicYearLabel}`}
          </p>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight text-balance">
            {isCbtMode
              ? 'Portal CBT Ujian Sekolah & Asesmen Berbasis Komputer'
              : 'Sistem Manajemen Pembelajaran Dual-Track SMK'}
          </h2>
          <p className="text-sm lg:text-base text-slate-200 leading-relaxed max-w-xl">
            {isCbtMode
              ? 'Subdomain khusus ujian dengan validasi token ruang, pencegahan bentrok jadwal lintas guru, dan autosave jawaban langsung ke server lokal sekolah.'
              : 'Mendukung Kurikulum 2013 dan Kurikulum Merdeka secara berdampingan untuk 14 konsentrasi keahlian, lengkap dengan absensi aktivitas minimum, CBT anti-bentrok, PKL, dan export e-Rapor dinamis.'}
          </p>
          <div className="pt-2 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs text-slate-300 font-mono tabular-nums">
            <span className="whitespace-nowrap">2.300 Siswa</span>
            <span className="whitespace-nowrap">400 Guru</span>
            <span className="whitespace-nowrap">14 Konsentrasi Keahlian</span>
            <span className="whitespace-nowrap">Arsitektur Rust + MySQL 8</span>
          </div>
        </div>
      </div>

      {/* Right Login & Role Switcher Panel */}
      <div className="lg:col-span-5 flex flex-col justify-center p-6 sm:p-10 lg:p-14 bg-white border-l border-slate-200">
        <div className="w-full max-w-md mx-auto space-y-7">
          <div className="space-y-1.5">
            {isCbtMode && (
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-900 pb-1">
                <MonitorCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Mode Portal Ujian CBT Aktif</span>
              </div>
            )}
            <h2 className="text-2xl font-bold text-slate-900">
              {isCbtMode ? 'Masuk ke Ruang Ujian CBT' : 'Masuk ke Portal LMS'}
            </h2>
            <p className="text-sm text-slate-600">
              Gunakan Email Sekolah, NISN (siswa), atau NUPTK/NIP (guru).
            </p>
          </div>

          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="login-identifier"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Email / NISN / NUPTK
              </label>
              <input
                id="login-identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="nama@smkn1percut.sch.id atau 0081234501"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-700 focus:border-sky-700"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Kata Sandi
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan kata sandi"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-700 focus:border-sky-700"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" aria-hidden="true" />
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Kata sandi akun uji lokal:{' '}
                <span className="font-mono font-medium text-slate-700">smkn1percut</span>
              </p>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 font-medium"
              >
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[42px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-sky-800 hover:bg-sky-900 text-white text-sm font-semibold transition-colors disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogIn className="w-4 h-4" aria-hidden="true" />
              <span>{submitting ? 'Memeriksa akses...' : 'Masuk ke Workspace'}</span>
            </button>
          </form>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-2 text-xs text-slate-600">
            <span>Portal Dual-Mode SMKN 1 Percut</span>
            <a
              href={isCbtMode ? '?mode=lms' : '?mode=cbt'}
              className="text-sky-800 hover:underline font-semibold whitespace-nowrap"
            >
              {isCbtMode ? 'Beralih ke Mode LMS' : 'Pratinjau Mode CBT'}
            </a>
          </div>

          {demoUsers.length > 0 && (
            <div className="pt-4 border-t border-slate-200 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <ShieldCheck className="w-4 h-4 text-sky-800" aria-hidden="true" />
                <span>Akses Cepat Uji 7 Role RBAC</span>
              </div>
              <div className="border border-slate-200 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-px bg-slate-200 overflow-hidden">
                {demoUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleQuickSelect(u.email)}
                    className="w-full text-left px-3 py-2 bg-white hover:bg-slate-50 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">{u.nama}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {u.roles.map((r) => ROLE_LABELS[r]).join(' + ')}
                      </p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
