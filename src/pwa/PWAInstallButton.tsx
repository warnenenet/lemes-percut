import React, { useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { usePWAInstall } from './usePWAInstall';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({
  compact = false,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`flex items-center gap-1.5 rounded-md bg-sky-800 hover:bg-sky-900 text-white font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          compact ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-xs'
        }`}
      >
        <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Install Aplikasi</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-md border border-slate-300 hover:bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Install di iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
            <div className="w-full max-w-sm rounded-lg bg-white border border-slate-200 p-6 shadow-xl space-y-3">
              <h3 className="text-base font-bold text-slate-900">
                Pasang LMS di iPhone / iPad
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                1. Ketuk tombol <strong>Bagikan (Share)</strong> pada bilah bawah Safari.
                <br />
                2. Gulir ke bawah lalu pilih <strong>Tambah ke Layar Utama</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-md bg-sky-800 hover:bg-sky-900 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                Mengerti
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
