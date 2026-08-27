import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { DutyAttendance, LeaveRequest, AttendancePolicyConfig, ServiceJob } from '@/types/database';
import {
  Clock,
  MapPin,
  CalendarCheck,
  ShieldCheck,
  Radio,
  LogOut,
  Route,
  DollarSign,
  Plus,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Layers,
  FileText,
  X,
  Send,
  Sparkles,
} from 'lucide-react';
import {
  fetchTodayAttendance,
  fetchAllAttendances,
  fetchAllLeaveRequests,
  fetchAttendancePolicy,
  punchInDuty,
  punchOutDuty,
  submitLeaveRequest,
  DEFAULT_ATTENDANCE_POLICY,
} from '@/lib/attendance';
import { formatKm } from '@/lib/distance';

export function EngineerAttendance() {
  const { profile } = useAuth();
  const [attendance, setAttendance] = useState<DutyAttendance | null>(null);
  const [attendances, setAttendances] = useState<DutyAttendance[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [policy, setPolicy] = useState<AttendancePolicyConfig>(DEFAULT_ATTENDANCE_POLICY);
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [punchLoading, setPunchLoading] = useState(false);

  // Clock
  const [currentTime, setCurrentTime] = useState(new Date());

  // Monthly History
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Modal
  const [showLeaveModal, setShowLeaveModal] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (profile?.id) {
      loadData();
    }

    const handler = () => loadData();
    window.addEventListener('ics-attendance-updated', handler);
    window.addEventListener('ics-leaves-updated', handler);

    const ch = supabase
      .channel('eng-attendance')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duty_attendance' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => loadData())
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
      window.removeEventListener('ics-attendance-updated', handler);
      window.removeEventListener('ics-leaves-updated', handler);
    };
  }, [profile?.id]);

  async function loadData() {
    if (!profile?.id) return;
    try {
      const [todayAtt, allAtt, allLeaves, pol, jobRes] = await Promise.all([
        fetchTodayAttendance(profile.id),
        fetchAllAttendances(),
        fetchAllLeaveRequests(),
        fetchAttendancePolicy(),
        supabase.from('service_jobs').select('*').eq('engineer_id', profile.id),
      ]);

      setAttendance(todayAtt);
      setAttendances(allAtt.filter((a) => a.engineer_id === profile.id));
      setLeaves(allLeaves.filter((l) => l.engineer_id === profile.id));
      setPolicy(pol);
      setJobs((jobRes.data as unknown as ServiceJob[]) || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const completedTodayJobs = jobs.filter(
    (j) => j.status === 'completed' && (j.completed_at?.startsWith(todayStr) || j.scheduled_date === todayStr)
  );
  const totalKmToday = completedTodayJobs.reduce((s, j) => s + (j.total_km || 0), 0);

  // Swipe In
  async function handleSwipeIn() {
    if (!profile?.id) return;
    setPunchLoading(true);
    let coords: { latitude: number; longitude: number } | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, enableHighAccuracy: true });
      });
      coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch {
      // fallback
    }
    const att = await punchInDuty(profile.id, coords);
    setAttendance(att);
    setPunchLoading(false);
    loadData();
  }

  // Swipe Out
  async function handleSwipeOut() {
    if (!profile?.id) return;
    setPunchLoading(true);
    let coords: { latitude: number; longitude: number } | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, enableHighAccuracy: true });
      });
      coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch {
      // fallback
    }
    const att = await punchOutDuty(profile.id, totalKmToday, coords);
    setAttendance(att);
    setPunchLoading(false);
    loadData();
  }

  const isOnDuty = attendance?.status === 'on_duty';
  const isPunchedOut = attendance?.status === 'punched_out' || attendance?.status === 'present';
  const isLate = attendance?.is_late;

  // Monthly stats calculation
  const monthStr = String(selectedMonth + 1).padStart(2, '0');
  const monthPrefix = `${selectedYear}-${monthStr}`;
  const monthlyLogs = attendances.filter((a) => a.date.startsWith(monthPrefix));

  const presentDays = monthlyLogs.filter((a) => a.status === 'present' || a.status === 'punched_out' || a.status === 'on_duty' || a.status === 'late').length;
  const lateDays = monthlyLogs.filter((a) => a.is_late || a.status === 'late').length;
  const totalMonthlyMinutes = monthlyLogs.reduce((s, a) => s + (a.total_work_minutes || 0), 0);
  const totalMonthlyKm = monthlyLogs.reduce((s, a) => s + (a.total_km || 0), 0);
  const totalMonthlyAllowance = monthlyLogs.reduce(
    (s, a) => s + (a.travel_allowance || Math.round((a.total_km || 0) * policy.rate_per_km)) + (a.food_allowance || policy.daily_food_allowance),
    0
  );

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Clock className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-20">
      {/* Top Profile & Live Clock Hero Header */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-xl relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute top-0 right-0 -mt-8 -mr-8 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl"></div>

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-300 border border-blue-500/30">
                ICS Field Service ID
              </span>
              <span className="font-mono text-xs text-slate-400">
                {profile?.employee_id || `EMP-${(profile?.id || '').slice(0, 5).toUpperCase()}`}
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-black text-white">{profile?.full_name}</h1>
            <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
              <CalendarCheck className="h-3.5 w-3.5 text-blue-400" />
              <span>Shift: {policy.shift_start_time} to {policy.shift_end_time}</span>
              <span>• Grace: {policy.grace_period_minutes}m</span>
            </p>
          </div>

          {/* Digital Live Clock */}
          <div className="text-right">
            <p className="font-mono text-3xl font-black tracking-tight text-white">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
            <p className="text-xs font-medium text-slate-400">
              {currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Live Duty Swipe Card Box */}
        <div className="mt-6 rounded-2xl bg-white/10 p-4 backdrop-blur-md border border-white/15">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                  isOnDuty
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/40 animate-pulse'
                    : isPunchedOut
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {isOnDuty ? <Radio className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">Field Duty Status</h3>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                      isOnDuty
                        ? 'bg-emerald-400 text-emerald-950 animate-pulse'
                        : isPunchedOut
                        ? 'bg-blue-400/20 text-blue-300 border border-blue-400/30'
                        : 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                    }`}
                  >
                    {isOnDuty
                      ? '● ON DUTY / LIVE GPS'
                      : isPunchedOut
                      ? 'SHIFT COMPLETED'
                      : 'NOT PUNCHED IN'}
                  </span>
                </div>

                <p className="text-xs text-slate-300 mt-1">
                  {isOnDuty
                    ? `Punched In at ${new Date(attendance!.punch_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${isLate ? '(Late Arrival)' : '(On Time)'}`
                    : isPunchedOut
                    ? `Shift ended: ${attendance?.total_work_minutes ? `${Math.floor(attendance.total_work_minutes / 60)}h ${attendance.total_work_minutes % 60}m` : 'Completed'}`
                    : 'Swipe in to begin daily field duty and start call tracking'}
                </p>

                {attendance?.punch_in_address && (
                  <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-1">
                    <MapPin className="h-3 w-3 text-red-400 shrink-0" />
                    <span className="line-clamp-1">{attendance.punch_in_address}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div>
              {!isOnDuty && !isPunchedOut && (
                <button
                  onClick={handleSwipeIn}
                  disabled={punchLoading}
                  className="flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3.5 text-xs font-black uppercase tracking-wider text-emerald-950 shadow-xl shadow-emerald-500/30 hover:bg-emerald-400 transition active:scale-95 disabled:opacity-50"
                >
                  <Radio className="h-4 w-4" />
                  <span>{punchLoading ? 'PUNCHING IN...' : 'SWIPE IN / START DUTY'}</span>
                </button>
              )}

              {isOnDuty && (
                <button
                  onClick={handleSwipeOut}
                  disabled={punchLoading}
                  className="flex items-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-xl shadow-red-600/30 hover:bg-red-500 transition active:scale-95 disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" />
                  <span>{punchLoading ? 'ENDING SHIFT...' : 'SWIPE OUT / END SHIFT'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Today's Metrics Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase text-slate-500 flex items-center gap-1">
            <Route className="h-3.5 w-3.5 text-blue-600" /> Today's Field KM
          </p>
          <p className="mt-1 text-2xl font-black text-slate-900">{formatKm(attendance?.total_km || totalKmToday)}</p>
          <p className="text-[11px] text-slate-400">{completedTodayJobs.length} completed calls</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase text-slate-500 flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-indigo-600" /> Duty Time
          </p>
          <p className="mt-1 text-2xl font-black text-slate-900">
            {attendance?.punch_in_at
              ? isPunchedOut && attendance.total_work_minutes
                ? `${Math.floor(attendance.total_work_minutes / 60)}h ${attendance.total_work_minutes % 60}m`
                : `${Math.max(0, Math.floor((Date.now() - new Date(attendance.punch_in_at).getTime()) / 3600000))}h ${Math.floor(((Date.now() - new Date(attendance.punch_in_at).getTime()) % 3600000) / 60000)}m`
              : '—'}
          </p>
          <p className="text-[11px] text-slate-400">{isOnDuty ? 'Live Active' : isPunchedOut ? 'Shift Done' : 'Not started'}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase text-slate-500 flex items-center gap-1">
            <DollarSign className="h-3.5 w-3.5 text-emerald-600" /> Travel Allowance
          </p>
          <p className="mt-1 text-2xl font-black text-emerald-700">
            ₹{Math.round((attendance?.total_km || totalKmToday) * policy.rate_per_km).toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-400">@ ₹{policy.rate_per_km}/KM</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase text-slate-500 flex items-center gap-1">
            <DollarSign className="h-3.5 w-3.5 text-purple-600" /> Food DA Allowance
          </p>
          <p className="mt-1 text-2xl font-black text-purple-700">
            ₹{attendance || isOnDuty || isPunchedOut ? policy.daily_food_allowance : 0}
          </p>
          <p className="text-[11px] text-slate-400">Daily Per-diem</p>
        </div>
      </div>

      {/* Leave & Regularization Application Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 p-4 border border-blue-200/80 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white font-bold shadow-md">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">Need Leave or Missed a Punch?</h4>
            <p className="text-xs text-slate-600">Apply for Casual/Sick Leave or submit a punch regularization request for admin review</p>
          </div>
        </div>

        <button
          onClick={() => setShowLeaveModal(true)}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-blue-700 transition"
        >
          <Plus className="h-4 w-4" /> Apply Request
        </button>
      </div>

      {/* My Submitted Requests Section (if any) */}
      {leaves.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-blue-600" /> My Leave & Regularization Requests
          </h3>

          <div className="space-y-2">
            {leaves.slice(0, 3).map((leave) => (
              <div key={leave.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-xs border border-slate-100">
                <div>
                  <span className="font-bold uppercase text-indigo-700">{leave.leave_type}</span>
                  <span className="text-slate-500 ml-2">
                    {leave.start_date} {leave.start_date !== leave.end_date ? `to ${leave.end_date}` : ''} ({leave.total_days} {leave.total_days === 1 ? 'day' : 'days'})
                  </span>
                  <p className="text-[11px] text-slate-600 italic mt-0.5">"{leave.reason}"</p>
                </div>

                <div className="text-right">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                      leave.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-800'
                        : leave.status === 'rejected'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {leave.status}
                  </span>
                  {leave.admin_remarks && (
                    <p className="text-[10px] text-slate-500 mt-1">Remark: {leave.admin_remarks}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monthly Timesheet & Attendance Register Section */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-indigo-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">My Monthly Attendance Register</h3>
              <p className="text-xs text-slate-500">Day-by-day punch records, working hours & allowance earnings</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              aria-label="Filter Month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 outline-none"
            >
              {monthNames.map((m, idx) => (
                <option key={idx} value={idx}>
                  {m}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter Year"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 outline-none"
            >
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Monthly Summary Strip */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 rounded-xl bg-slate-50 p-3 text-xs">
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-500">Days Present</p>
            <p className="text-lg font-black text-emerald-700 mt-0.5">{presentDays}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-500">Late Punches</p>
            <p className="text-lg font-black text-amber-600 mt-0.5">{lateDays}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-500">Total KM</p>
            <p className="text-lg font-black text-slate-900 mt-0.5">{formatKm(totalMonthlyKm)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-500">Total Reimbursement</p>
            <p className="text-lg font-black text-indigo-700 mt-0.5">₹{totalMonthlyAllowance.toLocaleString()}</p>
          </div>
        </div>

        {/* Day-by-Day Log List */}
        <div className="space-y-2.5">
          {monthlyLogs.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No punch records recorded for {monthNames[selectedMonth]} {selectedYear}.
            </div>
          ) : (
            monthlyLogs.map((att) => (
              <div
                key={att.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-3.5 shadow-sm hover:border-slate-300 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 flex-col items-center justify-center rounded-xl bg-slate-100 text-slate-800">
                    <span className="text-[10px] font-bold uppercase">
                      {new Date(att.date).toLocaleDateString('en-US', { month: 'short' })}
                    </span>
                    <span className="text-xs font-black">
                      {new Date(att.date).getDate()}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-xs">
                        {new Date(att.punch_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {att.punch_out_at ? ` - ${new Date(att.punch_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ' (On Duty)'}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                          att.status === 'on_duty'
                            ? 'bg-emerald-100 text-emerald-800'
                            : att.status === 'late'
                            ? 'bg-amber-100 text-amber-800'
                            : att.status === 'half_day'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {att.status}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {att.total_work_minutes ? `${Math.floor(att.total_work_minutes / 60)}h ${att.total_work_minutes % 60}m worked` : 'Shift in progress'} • {formatKm(att.total_km || 0)}
                    </p>
                  </div>
                </div>

                <div className="text-right text-xs">
                  <p className="font-bold text-emerald-700">
                    ₹
                    {(
                      (att.travel_allowance || Math.round((att.total_km || 0) * policy.rate_per_km)) +
                      (att.food_allowance || policy.daily_food_allowance)
                    ).toLocaleString()}
                  </p>
                  <p className="text-[10px] text-slate-400">Total Allowance</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* APPLY LEAVE / REGULARIZATION MODAL */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showLeaveModal && (
        <LeaveModal
          engineerId={profile?.id || ''}
          onClose={() => setShowLeaveModal(false)}
          onSubmitted={() => {
            setShowLeaveModal(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}

// ─── Leave Request Modal Component ───
function LeaveModal({
  engineerId,
  onClose,
  onSubmitted,
}: {
  engineerId: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [leaveType, setLeaveType] = useState<LeaveRequest['leave_type']>('casual');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a reason for the request.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitLeaveRequest(engineerId, leaveType, startDate, endDate, reason);
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Apply for Leave / Regularization</h3>
            <p className="text-xs text-slate-500">Request leave or correct a missed punch timestamp</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-xl bg-red-50 p-2.5 text-xs text-red-700 border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Request Type</label>
            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value as LeaveRequest['leave_type'])}
              className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-bold text-slate-800 outline-none"
            >
              <option value="casual">Casual Leave (CL)</option>
              <option value="sick">Sick Leave (SL)</option>
              <option value="emergency">Emergency / Personal</option>
              <option value="half_day">Half Day Leave</option>
              <option value="regularization">Punch Regularization (Forgot to Punch)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (e.target.value > endDate) setEndDate(e.target.value);
                }}
                className="w-full rounded-xl border border-slate-300 p-2 text-xs font-semibold outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2 text-xs font-semibold outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Reason / Explanation</label>
            <textarea
              rows={3}
              placeholder="e.g. Attending family function / Forgot to swipe out due to network issue at client site..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-none focus:border-blue-500"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{submitting ? 'Submitting...' : 'Submit Request'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
