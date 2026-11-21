import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from './usePWAInstall';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-700 border border-amber-800 px-3.5 py-2 text-xs font-medium text-white shadow-lg"
    >
      <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>Mode Offline — Menggunakan cache aplikasi lokal</span>
    </div>
  );
};
