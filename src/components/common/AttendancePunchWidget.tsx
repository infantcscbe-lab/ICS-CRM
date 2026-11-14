import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchTodayAttendance,
  punchInDuty,
  punchOutDuty,
  emitAttendanceChange,
} from '@/lib/attendance';
import type { DutyAttendance } from '@/types/database';
import {
  Clock,
  CheckCircle2,
  MapPin,
  RefreshCw,
  LogOut,
  LogIn,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';

interface AttendancePunchWidgetProps {
  variant?: 'compact' | 'card' | 'banner';
  className?: string;
  onPunchSuccess?: (att: DutyAttendance) => void;
}

export function AttendancePunchWidget({
  variant = 'card',
  className = '',
  onPunchSuccess,
}: AttendancePunchWidgetProps) {
  const { profile } = useAuth();
  const [attendance, setAttendance] = useState<DutyAttendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [punching, setPunching] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [liveDuration, setLiveDuration] = useState<string>('');

  const loadStatus = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const att = await fetchTodayAttendance(profile.id);
      setAttendance(att);
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    loadStatus();

    const handleUpdate = () => {
      loadStatus();
    };
    window.addEventListener('ics-attendance-updated', handleUpdate);
    return () => {
      window.removeEventListener('ics-attendance-updated', handleUpdate);
    };
  }, [loadStatus]);

  // Live timer while on duty
  useEffect(() => {
    if (!attendance?.punch_in_at || attendance.punch_out_at || (attendance.status !== 'on_duty' && attendance.status !== 'late')) {
      setLiveDuration('');
      return;
    }

    function updateTimer() {
      if (!attendance?.punch_in_at) return;
      const start = new Date(attendance.punch_in_at).getTime();
      const now = Date.now();
      const diffMins = Math.max(0, Math.floor((now - start) / 60000));
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      setLiveDuration(`${hours}h ${mins}m`);
    }

    updateTimer();
    const interval = setInterval(updateTimer, 30000); // update every 30s
    return () => clearInterval(interval);
  }, [attendance]);

  async function handlePunchIn() {
    if (!profile?.id || punching) return;
    setPunching(true);
    setErrorMsg(null);

    let coords: { latitude: number; longitude: number } | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation not supported'));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 7000,
          enableHighAccuracy: true,
        });
      });
      coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch {
      // Allow punch in even if GPS fails (fallback location applied)
    }

    try {
      const att = await punchInDuty(profile.id, coords);
      setAttendance(att);
      emitAttendanceChange();
      onPunchSuccess?.(att);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to record punch in. Please try again.');
    } finally {
      setPunching(false);
    }
  }

  async function handlePunchOut() {
    if (!profile?.id || punching) return;

    const confirmed = window.confirm('Are you sure you want to punch out and end your duty shift?');
    if (!confirmed) return;

    setPunching(true);
    setErrorMsg(null);

    let coords: { latitude: number; longitude: number } | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation not supported'));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 7000,
          enableHighAccuracy: true,
        });
      });
      coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch {
      // Allow punch out even if GPS fails
    }

    try {
      const att = await punchOutDuty(profile.id, 0, coords);
      setAttendance(att);
      emitAttendanceChange();
      if (att) onPunchSuccess?.(att);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to record punch out. Please try again.');
    } finally {
      setPunching(false);
    }
  }

  if (!profile) return null;

  const isPunchedIn = !!attendance?.punch_in_at;
  const isPunchedOut = !!attendance?.punch_out_at || attendance?.status === 'punched_out' || attendance?.status === 'present';
  const isOnDuty = isPunchedIn && !isPunchedOut && (attendance?.status === 'on_duty' || attendance?.status === 'late');

  const inTimeStr = attendance?.punch_in_at
    ? new Date(attendance.punch_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const outTimeStr = attendance?.punch_out_at
    ? new Date(attendance.punch_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  // ─── COMPACT SIDEBAR VARIANT ───
  if (variant === 'compact') {
    if (loading) {
      return (
        <div className={`p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-400 text-xs flex items-center justify-center gap-1.5 ${className}`}>
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>Syncing attendance...</span>
        </div>
      );
    }

    if (!isPunchedIn) {
      return (
        <div className={`space-y-1.5 ${className}`}>
          <button
            onClick={handlePunchIn}
            disabled={punching}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-bold py-2 px-3 text-xs shadow-md transition disabled:opacity-50"
          >
            {punching ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogIn className="h-3.5 w-3.5" />
            )}
            <span>{punching ? 'Recording Punch...' : 'Punch In (Duty)'}</span>
          </button>
          {errorMsg && <p className="text-[10px] text-red-400 font-medium px-1">{errorMsg}</p>}
        </div>
      );
    }

    if (isOnDuty) {
      return (
        <div className={`rounded-xl bg-slate-800/90 border border-emerald-500/40 p-2.5 shadow-sm space-y-2 ${className}`}>
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              On Duty ({inTimeStr})
            </span>
            {liveDuration && (
              <span className="text-[10px] font-mono font-bold text-slate-300 bg-slate-700/80 px-1.5 py-0.5 rounded">
                {liveDuration}
              </span>
            )}
          </div>

          <button
            onClick={handlePunchOut}
            disabled={punching}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-red-600/90 hover:bg-red-500 active:scale-[0.98] text-white font-bold py-1.5 px-2.5 text-[11px] transition disabled:opacity-50"
          >
            {punching ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <LogOut className="h-3 w-3" />
            )}
            <span>{punching ? 'Recording Out...' : 'Punch Out (End Shift)'}</span>
          </button>
        </div>
      );
    }

    return (
      <div className={`rounded-xl bg-slate-800/70 border border-blue-500/30 p-2.5 text-xs ${className}`}>
        <div className="flex items-center justify-between text-[11px]">
          <span className="inline-flex items-center gap-1 text-blue-400 font-bold">
            <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" />
            Shift Done
          </span>
          <span className="text-slate-300 font-medium text-[10px]">
            {inTimeStr} - {outTimeStr}
          </span>
        </div>
      </div>
    );
  }

  // ─── CARD / BANNER VARIANT (FOR DASHBOARD & ATTENDANCE HUB) ───
  return (
    <div
      className={`rounded-2xl border transition shadow-sm p-4 ${
        isOnDuty
          ? 'border-emerald-300 bg-gradient-to-r from-emerald-50/80 via-white to-emerald-50/40 ring-1 ring-emerald-400/20'
          : isPunchedOut
          ? 'border-blue-200 bg-gradient-to-r from-blue-50/60 via-white to-blue-50/30'
          : 'border-slate-200 bg-gradient-to-r from-slate-50 via-white to-amber-50/30'
      } ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left Side Info */}
        <div className="flex items-center gap-3">
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-xl font-bold text-white shadow-sm shrink-0 ${
              isOnDuty ? 'bg-emerald-600 shadow-emerald-500/20' : isPunchedOut ? 'bg-blue-600' : 'bg-slate-700'
            }`}
          >
            {isOnDuty ? (
              <Clock className="h-5 w-5 animate-pulse" />
            ) : isPunchedOut ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <LogIn className="h-5 w-5" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                {profile.full_name}’s Attendance
              </h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 uppercase border border-slate-200">
                {profile.role.replace('_', ' ')}
              </span>
            </div>

            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
              {isOnDuty ? (
                <>
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                    Punched In at {inTimeStr}
                  </span>
                  {liveDuration && (
                    <span className="text-slate-400">• Active: <strong>{liveDuration}</strong></span>
                  )}
                  {attendance?.punch_in_address && (
                    <span className="text-slate-500 text-[11px] max-w-xs truncate" title={attendance.punch_in_address}>
                      • 📍 {attendance.punch_in_address}
                    </span>
                  )}
                </>
              ) : isPunchedOut ? (
                <span className="font-semibold text-blue-700">
                  Shift Completed: {inTimeStr} — {outTimeStr} ({Math.floor((attendance?.total_work_minutes || 0) / 60)}h {(attendance?.total_work_minutes || 0) % 60}m)
                </span>
              ) : (
                <span className="text-slate-500 font-medium">
                  Not punched in yet today. Click button to record your duty shift.
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Right Side Punch Actions */}
        <div className="flex items-center gap-2">
          {errorMsg && (
            <span className="text-xs text-red-600 font-medium flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
              {errorMsg}
            </span>
          )}

          {!isPunchedIn ? (
            <button
              onClick={handlePunchIn}
              disabled={punching}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] px-4 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition disabled:opacity-50"
            >
              {punching ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              <span>{punching ? 'Recording Punch In...' : 'Punch In Today'}</span>
            </button>
          ) : isOnDuty ? (
            <button
              onClick={handlePunchOut}
              disabled={punching}
              className="flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-500 active:scale-[0.98] px-4 py-2 text-xs font-bold text-white shadow-md shadow-red-600/20 transition disabled:opacity-50"
            >
              {punching ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              <span>{punching ? 'Recording Punch Out...' : 'Punch Out (End Shift)'}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="rounded-xl bg-blue-100 text-blue-800 border border-blue-200 px-3 py-1.5 text-xs font-bold flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
                Shift Finished
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

