import React, { useState } from 'react';
import { LogOut, RefreshCw, Code2, Menu, X } from 'lucide-react';
import { User, UserRole } from '../domain/types';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { OfflineIndicator } from '../pwa/OfflineIndicator';

export interface NavItem {
  readonly id: string;
  readonly label: string;
}

interface SidebarLayoutProps {
  schoolName: string;
  academicYearLabel: string;
  appMode: 'LMS' | 'CBT';
  allowDemoReset: boolean;
  user: User;
  activeRole: UserRole;
  onSwitchRole: (role: UserRole) => void;
  navItems: ReadonlyArray<NavItem>;
  activeSection: string;
  onSelectSection: (sectionId: string) => void;
  onOpenRustPrep: () => void;
  onResetDemo: () => void;
  onLogout: () => void;
  unreadNotificationsCount: number;
  children: React.ReactNode;
}

const ROLE_NAMES: Record<UserRole, string> = {
  ADMIN: 'Admin Sistem',
  KEPALA_SEKOLAH: 'Kepala Sekolah',
  WAKASEK: 'Wakasek Kurikulum',
  GURU_MAPEL: 'Guru Mapel',
  GURU_BK: 'Guru BK',
  WALI_KELAS: 'Wali Kelas',
  SISWA: 'Siswa',
};

export const SidebarLayout: React.FC<SidebarLayoutProps> = ({
  schoolName,
  academicYearLabel,
  appMode,
  allowDemoReset,
  user,
  activeRole,
  onSwitchRole,
  navItems,
  activeSection,
  onSelectSection,
  onOpenRustPrep,
  onResetDemo,
  onLogout,
  unreadNotificationsCount,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const currentNavLabel =
    navItems.find((n) => n.id === activeSection)?.label ?? 'Dashboard';

  function handleSelectNav(id: string) {
    onSelectSection(id);
    setMobileMenuOpen(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      <OfflineIndicator />

      {/* Mobile backdrop when navigation drawer is open */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-30 lg:hidden"
          aria-hidden="true"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Navigation Sidebar (256px on desktop, collapsible drawer on mobile) */}
      <aside
        className={`${
          mobileMenuOpen ? 'fixed inset-y-0 left-0 z-40 flex' : 'hidden'
        } lg:static lg:flex w-72 lg:w-64 bg-white border-r border-slate-200 flex-col shrink-0`}
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-md border border-slate-200 p-1 bg-white shrink-0">
              <img
                src="/src/assets/images/smkn1_emblem_1794859933905.jpg"
                alt="Logo SMKN 1 Percut Sei Tuan"
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">
                {appMode === 'CBT' ? 'CBT SMKN 1 Percut' : 'LMS SMKN 1 Percut'}
              </p>
              <p className="text-xs text-slate-500 truncate">{academicYearLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Tutup menu navigasi"
            className="lg:hidden p-1.5 rounded-md text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Multi-Role Switcher */}
        {user.roles.length > 1 && (
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70">
            <label
              htmlFor="role-switcher"
              className="block text-xs font-medium text-slate-600 mb-1.5"
            >
              Peran Aktif (Multi-Role)
            </label>
            <select
              id="role-switcher"
              value={activeRole}
              onChange={(e) => {
                onSwitchRole(e.target.value as UserRole);
                setMobileMenuOpen(false);
              }}
              className="w-full px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-700"
            >
              {user.roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_NAMES[r]}
                </option>
              ))}
            </select>
          </div>
        )}

        <nav
          aria-label="Navigasi Utama"
          className="p-3 flex flex-col gap-1 overflow-y-auto flex-1"
        >
          {navItems.map((item) => {
            const isActive = item.id === activeSection;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectNav(item.id)}
                className={`min-h-[40px] px-3 py-2 rounded-md text-sm font-medium text-left transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-sky-800 text-white'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 space-y-1.5">
          <button
            type="button"
            onClick={() => {
              onOpenRustPrep();
              setMobileMenuOpen(false);
            }}
            className="w-full min-h-[38px] flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Code2 className="w-4 h-4 text-sky-800 shrink-0" aria-hidden="true" />
            <span>Arsitektur & Engine Rust</span>
          </button>
          {allowDemoReset && (
            <button
              type="button"
              onClick={() => {
                onResetDemo();
                setMobileMenuOpen(false);
              }}
              className="w-full min-h-[38px] flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Reset Data Uji</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Mobile menu trigger + breadcrumb on left, profile + PWA install + logout on right */}
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-3 sm:gap-6">
          <div className="flex items-center gap-2.5 text-sm min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Buka menu navigasi"
              className="lg:hidden min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 shrink-0 cursor-pointer"
            >
              <Menu className="w-4 h-4" aria-hidden="true" />
            </button>
            <span className="font-semibold text-slate-900 truncate hidden sm:inline">
              {schoolName}
            </span>
            <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
              /
            </span>
            <span className="text-slate-700 font-medium sm:font-normal sm:text-slate-600 truncate">
              {ROLE_NAMES[activeRole]}
            </span>
            <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
              /
            </span>
            <span className="text-slate-900 font-medium truncate hidden sm:inline">
              {currentNavLabel}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-600">
              <span className="font-medium text-slate-900">{user.nama}</span>
              {unreadNotificationsCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-amber-700 font-medium">
                    {unreadNotificationsCount} notifikasi
                  </span>
                </>
              )}
            </div>
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={onLogout}
              className="min-h-[36px] flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-100 text-xs font-medium text-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Keluar</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
