import { MapPinOff, Settings, AlertTriangle } from 'lucide-react';
import { Capacitor, registerPlugin } from '@capacitor/core';

const BackgroundGeolocation = registerPlugin<any>('BackgroundGeolocation');

interface GpsDisabledModalProps {
  isOpen: boolean;
  onRetry: () => void;
}

export function GpsDisabledModal({ isOpen, onRetry }: GpsDisabledModalProps) {
  if (!isOpen) return null;

  const handleOpenSettings = () => {
    if (Capacitor.isNativePlatform()) {
      try {
        BackgroundGeolocation.openSettings();
      } catch {
        // fallback
      }
    }
    onRetry();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-rose-100 text-center animate-scale-up">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-rose-600 mb-4 animate-pulse">
          <MapPinOff className="h-8 w-8" />
        </div>

        <h3 className="text-lg font-bold text-slate-900">GPS Location Turned Off!</h3>

        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          You are currently <strong>Punched In (On Duty)</strong>. Field duty tracking requires your phone&apos;s GPS location to be turned <strong>ON</strong>.
        </p>

        <div className="my-4 rounded-xl bg-amber-50 p-3 text-left border border-amber-200/60 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800 font-medium leading-tight">
            Please enable Location (GPS) in your phone settings to maintain shift attendance & distance.
          </p>
        </div>

        <div className="flex flex-col gap-2.5 mt-5">
          <button
            onClick={handleOpenSettings}
            className="flex items-center justify-center gap-2 rounded-xl bg-rose-600 py-3 px-4 text-xs font-bold text-white shadow-lg shadow-rose-600/30 hover:bg-rose-500 transition active:scale-95"
          >
            <Settings className="h-4 w-4" />
            <span>Turn ON Location Settings</span>
          </button>

          <button
            onClick={onRetry}
            className="rounded-xl bg-slate-100 py-2.5 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition"
          >
            I Turned It On (Check Again)
          </button>
        </div>
      </div>
    </div>
  );
}
