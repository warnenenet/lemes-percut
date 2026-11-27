import { useEffect, useState, useCallback } from 'react';
import {
  BootstrapResponse,
  ClientStatePayload,
  apiRequest,
  clearAuthSession,
  fetchBootstrap,
  fetchWorkspaceState,
  getStoredAuthSession,
  loginWithCredentials,
  logoutSession,
  setStoredActiveRole,
} from './api/client';
import { LoginView } from './components/LoginView';
import { NavItem, SidebarLayout } from './components/SidebarLayout';
import { SiswaPanel } from './components/panels/SiswaPanel';
import { GuruMapelPanel } from './components/panels/GuruMapelPanel';
import { MonitoringRolesPanel } from './components/panels/MonitoringRolesPanel';
import { AdminPanel } from './components/panels/AdminPanel';
import { RustPrepView } from './components/panels/RustPrepView';
import { User, UserRole } from './domain/types';

function getNavForRole(role: UserRole, appMode: 'LMS' | 'CBT'): ReadonlyArray<NavItem> {
  if (appMode === 'CBT' && role === 'SISWA') {
    return [
      { id: 'cbt', label: 'Portal Ujian CBT' },
      { id: 'dashboard', label: 'Ringkasan Siswa' },
    ];
  }
  switch (role) {
    case 'SISWA':
      return [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'sesi-modul', label: 'Sesi & Modul' },
        { id: 'tugas', label: 'Tugas / PR' },
        { id: 'buku-tulis', label: 'Buku Tulis' },
        { id: 'absensi', label: 'Absensi Saya' },
        { id: 'nilai', label: 'Nilai Saya' },
        { id: 'cbt', label: 'Ujian CBT' },
        { id: 'pkl', label: 'PKL' },
      ];
    case 'GURU_MAPEL':
      return [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'sesi', label: 'Sesi & Absensi' },
        { id: 'modul', label: 'Modul Belajar' },
        { id: 'tugas', label: 'Tugas & Nilai' },
        { id: 'buku-tulis', label: 'Buku Tulis Siswa' },
        { id: 'nilai', label: 'Nilai & e-Rapor' },
        { id: 'cbt', label: 'CBT & Jadwal' },
        { id: 'perangkat-ajar', label: 'Perangkat Ajar' },
      ];
    case 'GURU_BK':
      return [
        { id: 'dashboard', label: 'Monitoring Kelas' },
        { id: 'pkl', label: 'PKL & Validasi' },
        { id: 'pembinaan', label: 'Catatan Pembinaan' },
      ];
    case 'WALI_KELAS':
      return [{ id: 'dashboard', label: 'Rekap Kelas Binaan' }];
    case 'WAKASEK':
      return [{ id: 'dashboard', label: 'Administrasi Guru' }];
    case 'KEPALA_SEKOLAH':
      return [{ id: 'dashboard', label: 'Kepatuhan & Supervisi' }];
    case 'ADMIN':
      return [
        { id: 'dashboard', label: 'Master Sekolah' },
        { id: 'import', label: 'Import Atomik' },
        { id: 'erapor-mapping', label: 'Mapping e-Rapor' },
        { id: 'backup-audit', label: 'Backup, Dapodik & Audit' },
      ];
  }
}

function resolveInitialAppMode(serverMode: 'LMS' | 'CBT'): 'LMS' | 'CBT' {
  const params = new URLSearchParams(window.location.search);
  const queryMode = params.get('mode')?.toUpperCase();
  if (queryMode === 'CBT') return 'CBT';
  if (queryMode === 'LMS') return 'LMS';
  if (window.location.hostname.startsWith('cbt.')) return 'CBT';
  return serverMode;
}

export default function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [appMode, setAppMode] = useState<'LMS' | 'CBT'>('LMS');

  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [activeRole, setActiveRole] = useState<UserRole>('GURU_MAPEL');
  const [activeSection, setActiveSection] = useState<string>('dashboard');
  const [showRustPrep, setShowRustPrep] = useState(false);
  const [payload, setPayload] = useState<ClientStatePayload | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshState = useCallback(
    async (userId?: string, role?: UserRole) => {
      const uid = userId ?? sessionUser?.id;
      const r = role ?? activeRole;
      if (!uid) return;
      const res = await fetchWorkspaceState(uid, r);
      if (res.ok) {
        setPayload(res.data);
      }
    },
    [sessionUser?.id, activeRole],
  );

  useEffect(() => {
    let mounted = true;
    async function init() {
      const bootRes = await fetchBootstrap();
      if (!mounted) return;
      let resolvedMode: 'LMS' | 'CBT' = resolveInitialAppMode('LMS');
      if (bootRes.ok) {
        setBootstrap(bootRes.data);
        resolvedMode = resolveInitialAppMode(bootRes.data.app_mode);
        setAppMode(resolvedMode);
      }

      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        const defaultEmail =
          resolvedMode === 'CBT'
            ? 'rizky.siswa@smkn1percut.sch.id'
            : 'budi.mtk@smkn1percut.sch.id';
        const loginRes = await loginWithCredentials(defaultEmail, 'smkn1percut');
        if (mounted && loginRes.ok) {
          const user = loginRes.data.user;
          const initialRole = user.roles[0];
          setSessionUser(user);
          setActiveRole(initialRole);
          setActiveSection(
            resolvedMode === 'CBT' && initialRole === 'SISWA' ? 'cbt' : 'dashboard',
          );
          const stateRes = await fetchWorkspaceState(user.id, initialRole);
          if (mounted && stateRes.ok) {
            setPayload(stateRes.data);
          }
        }
      } else {
        const stored = getStoredAuthSession();
        if (stored.token && stored.user) {
          const restoredRole =
            stored.activeRole && stored.user.roles.includes(stored.activeRole)
              ? stored.activeRole
              : stored.user.roles[0];
          const stateRes = await fetchWorkspaceState(stored.user.id, restoredRole);
          if (mounted && stateRes.ok) {
            setSessionUser(stored.user);
            setActiveRole(restoredRole);
            setActiveSection(
              resolvedMode === 'CBT' && restoredRole === 'SISWA' ? 'cbt' : 'dashboard',
            );
            setPayload(stateRes.data);
          } else if (mounted) {
            clearAuthSession();
          }
        }
      }
      if (mounted) setLoading(false);
    }
    init();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleLoginSuccess(user: User) {
    setSessionUser(user);
    const defaultRole = user.roles[0];
    setActiveRole(defaultRole);
    setStoredActiveRole(defaultRole);
    setActiveSection(appMode === 'CBT' && defaultRole === 'SISWA' ? 'cbt' : 'dashboard');
    setShowRustPrep(false);
    await refreshState(user.id, defaultRole);
  }

  async function handleSwitchRole(newRole: UserRole) {
    if (!sessionUser) return;
    setActiveRole(newRole);
    setStoredActiveRole(newRole);
    setActiveSection(appMode === 'CBT' && newRole === 'SISWA' ? 'cbt' : 'dashboard');
    setShowRustPrep(false);
    await refreshState(sessionUser.id, newRole);
  }

  async function handleResetDemo() {
    await apiRequest('/api/reset-demo', { method: 'POST' });
    await refreshState();
  }

  async function handleLogout() {
    await logoutSession();
    setSessionUser(null);
    setPayload(null);
    setShowRustPrep(false);
  }

  if (loading || !bootstrap) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-lg px-6 py-5 max-w-sm w-full space-y-2">
          <p className="text-sm font-semibold text-slate-900">
            SMK Negeri 1 Percut Sei Tuan
          </p>
          <p className="text-xs text-slate-600">
            Menyiapkan portal pembelajaran dan konfigurasi akademik...
          </p>
        </div>
      </div>
    );
  }

  if (!sessionUser || !payload) {
    return (
      <LoginView
        schoolName={bootstrap.school.nama}
        npsn={bootstrap.school.npsn}
        academicYearLabel={`${bootstrap.academic_year.tahun_ajaran} · ${bootstrap.academic_year.semester}`}
        appMode={appMode}
        demoUsers={bootstrap.demo_users}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  const navItems = getNavForRole(activeRole, appMode);
  const unreadNotifs = payload.state.notifications.filter(
    (n) => n.user_id === sessionUser.id && !n.dibaca_at,
  ).length;

  return (
    <SidebarLayout
      schoolName={bootstrap.school.nama}
      academicYearLabel={`${bootstrap.academic_year.tahun_ajaran} · ${bootstrap.academic_year.semester}`}
      appMode={appMode}
      allowDemoReset={bootstrap.allow_demo_reset}
      user={sessionUser}
      activeRole={activeRole}
      onSwitchRole={handleSwitchRole}
      navItems={navItems}
      activeSection={activeSection}
      onSelectSection={(id) => {
        setShowRustPrep(false);
        setActiveSection(id);
      }}
      onOpenRustPrep={() => setShowRustPrep(true)}
      onResetDemo={handleResetDemo}
      onLogout={handleLogout}
      unreadNotificationsCount={unreadNotifs}
    >
      {showRustPrep ? (
        <RustPrepView engineName={bootstrap.engine} onClose={() => setShowRustPrep(false)} />
      ) : activeRole === 'SISWA' ? (
        <SiswaPanel
          section={activeSection}
          appMode={appMode}
          payload={payload}
          onRefresh={() => refreshState()}
        />
      ) : activeRole === 'GURU_MAPEL' ? (
        <GuruMapelPanel
          section={activeSection}
          payload={payload}
          onRefresh={() => refreshState()}
        />
      ) : activeRole === 'ADMIN' ? (
        <AdminPanel
          section={activeSection}
          engineName={bootstrap.engine}
          payload={payload}
          onRefresh={() => refreshState()}
        />
      ) : (
        <MonitoringRolesPanel
          section={activeSection}
          payload={payload}
          onRefresh={() => refreshState()}
        />
      )}
    </SidebarLayout>
  );
}
