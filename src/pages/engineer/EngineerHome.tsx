import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badges';
import { RequestCallModal } from '@/components/jobs/RequestCallModal';
import type { ServiceJob, Client, Profile, DutyAttendance } from '@/types/database';
import {
  Clock,
  MapPin,
  ChevronRight,
  Plus,
  Radio,
  LogOut,
  Route,
  ShieldCheck,
  Calendar,
  CalendarCheck,
  DollarSign,
  ArrowRight,
  Send,
  Sparkles,
  IndianRupee,
} from 'lucide-react';
import { UniversalCreateLeadModal } from '@/components/leads/UniversalCreateLeadModal';
import { formatKm } from '@/lib/distance';
import {
  fetchTodayAttendance,
  punchInDuty,
  punchOutDuty,
} from '@/lib/attendance';
import { backgroundKeepAlive } from '@/lib/backgroundKeepAlive';
import { ICS_OFFICE_LOCATION } from '@/lib/office';
import {
  getReturnTripState,
  startReturnToOffice,
  markReachedOffice,
  cancelReturnToOffice,
} from '@/lib/returnToOffice';
import { Building2, CheckCircle2, Navigation, ExternalLink, X } from 'lucide-react';

interface EngineerHomeProps {
  onViewJob: (job: ServiceJob) => void;
}

export function EngineerHome({ onViewJob }: EngineerHomeProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateLead, setShowCreateLead] = useState(false);
  const [attendance, setAttendance] = useState<DutyAttendance | null>(null);
  const [punchLoading, setPunchLoading] = useState(false);

  useEffect(() => {
    load();
    loadAttendance();
    const ch = supabase
      .channel('eng-home')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_jobs' }, () => load())
      .subscribe();

    window.addEventListener('ics-attendance-updated', loadAttendance);
    return () => {
      supabase.removeChannel(ch);
      window.removeEventListener('ics-attendance-updated', loadAttendance);
    };
  }, [profile?.id]);

  async function loadAttendance() {
    if (profile?.id) {
      const att = await fetchTodayAttendance(profile.id);
      setAttendance(att);
    }
  }

  async function load() {
    if (!profile) return;
    const [{ data: jobData }, { data: clientData }, { data: allEngData }] = await Promise.all([
      supabase
        .from('service_jobs')
        .select('*')
        .order('scheduled_date', { ascending: true }),
      supabase.from('clients').select('*'),
      supabase.from('profiles').select('*'),
    ]);

    const dbEngList = (allEngData as unknown as Profile[]) || [];
    const engMap = new Map<string, Profile>();
    dbEngList.forEach((e) => engMap.set(e.id, e));

    const dbClients = (clientData as unknown as Client[]) || [];
    const clientMap = new Map<string, Client>();
    dbClients.forEach((c) => clientMap.set(c.id, c));

    // Match jobs strictly belonging to current engineer by ID, Emp ID, or unique full name
    const myName = (profile.full_name || '').trim().toLowerCase();
    const myEmpId = (profile.employee_id || '').trim().toLowerCase();

    function isMyJob(j: ServiceJob) {
      // Direct match as Primary Engineer
      if (j.engineer_id === profile!.id) return true;
      // Direct match as Assist Engineer
      if (j.assist_engineer_id === profile!.id) return true;

      const eng = j.engineer || engMap.get(j.engineer_id || '');
      if (eng) {
        if (eng.id === profile!.id) return true;
        if (myEmpId && eng.employee_id && eng.employee_id.trim().toLowerCase() === myEmpId) return true;
        if (myName && eng.full_name && eng.full_name.trim().toLowerCase() === myName) return true;
      }

      const assistEng = j.assist_engineer || engMap.get(j.assist_engineer_id || '');
      if (assistEng) {
        if (assistEng.id === profile!.id) return true;
        if (myEmpId && assistEng.employee_id && assistEng.employee_id.trim().toLowerCase() === myEmpId) return true;
        if (myName && assistEng.full_name && assistEng.full_name.trim().toLowerCase() === myName) return true;
      }

      return false;
    }

    const allDbJobs = ((jobData as unknown as ServiceJob[]) || []).map((j) => ({
      ...j,
      client: j.client || clientMap.get(j.client_id),
      engineer: j.engineer || engMap.get(j.engineer_id || ''),
      assist_engineer: j.assist_engineer || engMap.get(j.assist_engineer_id || ''),
    })).filter(isMyJob);

    setJobs(allDbJobs);
    setLoading(false);
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;

  const activeStatuses = ['assigned', 'traveling', 'reached', 'in_progress', 'solved', 'vendor', 'call_back'];

  function isCompletedToday(j: ServiceJob) {
    if (j.status !== 'completed') return false;
    if (j.completed_at) {
      if (j.completed_at.startsWith(today)) return true;
      try {
        const d = new Date(j.completed_at);
        const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (localDate === today) return true;
      } catch {
        /* fallback */
      }
    }
    return j.scheduled_date === today;
  }

  // Show all active jobs assigned to the engineer, or scheduled for today, or completed today
  const todayJobs = jobs.filter((j) => activeStatuses.includes(j.status) || j.scheduled_date === today || isCompletedToday(j));
  const pendingJobs = jobs.filter((j) => activeStatuses.includes(j.status));
  const completedToday = jobs.filter(isCompletedToday);
  const totalCompleted = jobs.filter((j) => j.status === 'completed');
  const totalKmToday = completedToday.reduce((s, j) => s + (j.total_km || j.gps_distance_km || 0), 0);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  async function handleDutySwipeIn() {
    if (!profile?.id) return;
    // Prime background keepalive immediately within the user tap gesture
    backgroundKeepAlive.prime();
    backgroundKeepAlive.start('ICS On-Duty Live Tracking');

    setPunchLoading(true);
    let coords: { latitude: number; longitude: number } | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, enableHighAccuracy: true });
      });
      coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch {
      /* fallback */
    }
    const att = await punchInDuty(profile.id, coords);
    setAttendance(att);
    setPunchLoading(false);
  }

  async function handleDutySwipeOut() {
    if (!profile?.id) return;
    // Immediately stop background audio & worker keepalive
    backgroundKeepAlive.stop();

    setPunchLoading(true);
    let coords: { latitude: number; longitude: number } | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, enableHighAccuracy: true });
      });
      coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch {
      /* fallback */
    }
    const att = await punchOutDuty(profile.id, totalKmToday, coords);
    setAttendance(att);
    setPunchLoading(false);
  }

  const [returnLoading, setReturnLoading] = useState(false);
  const [returnSuccessMsg, setReturnSuccessMsg] = useState<string | null>(null);

  const returnTrip = getReturnTripState(attendance);

  async function handleStartReturnToOffice() {
    if (!attendance || !profile?.full_name) return;
    setReturnLoading(true);
    setReturnSuccessMsg(null);
    try {
      let coords: { latitude: number; longitude: number } | null = null;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, enableHighAccuracy: true });
        });
        coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      } catch {
        /* fallback */
      }

      await startReturnToOffice(attendance, profile.full_name, coords);
      await loadAttendance();
      setReturnSuccessMsg('Return to office initiated! Live travel & distance tracking active.');
    } catch (e) {
      console.warn(e);
    } finally {
      setReturnLoading(false);
    }
  }

  async function handleMarkReachedOffice() {
    if (!attendance || !profile?.full_name) return;
    setReturnLoading(true);
    try {
      let coords: { latitude: number; longitude: number } | null = null;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, enableHighAccuracy: true });
        });
        coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      } catch {
        /* fallback */
      }

      const { returnKm } = await markReachedOffice(attendance, profile.full_name, coords);
      await loadAttendance();
      setReturnSuccessMsg(`Safely arrived at ICS Head Office! ${returnKm.toFixed(1)} KM added to your daily travel distance.`);
    } catch (e) {
      console.warn(e);
    } finally {
      setReturnLoading(false);
    }
  }

  async function handleCancelReturn() {
    if (!attendance) return;
    await cancelReturnToOffice(attendance);
    await loadAttendance();
    setReturnSuccessMsg(null);
  }

  if (loading)
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-slate-500">Loading...</p>
      </div>
    );

  const isPunchedOut = !!attendance?.punch_out_at || attendance?.status === 'punched_out' || attendance?.status === 'present';
  const isOnDuty = !isPunchedOut && !!attendance?.punch_in_at && (attendance?.status === 'on_duty' || attendance?.status === 'late');

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {greeting}, {profile?.full_name?.split(' ')[0]}
          </h1>
          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
            <Calendar className="h-3.5 w-3.5" />
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowCreateLead(true)}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-3 py-2 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:from-amber-600 hover:to-orange-700 transition"
          >
            <Sparkles className="h-3.5 w-3.5" /> + Log Lead
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 transition"
          >
            <Send className="h-3.5 w-3.5" /> Request Call
          </button>
        </div>
      </div>

      {/* Field Duty Attendance & Live GPS Card */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-5 py-4 text-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${returnTrip.status === 'returning' ? 'bg-blue-500/20 text-blue-300 border border-blue-400/40 animate-pulse' : isOnDuty ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : isPunchedOut ? 'bg-slate-700/50 text-slate-300' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>
                {returnTrip.status === 'returning' ? <Navigation className="h-5 w-5" /> : isOnDuty ? <Radio className="h-5 w-5 animate-pulse" /> : <ShieldCheck className="h-5 w-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm">Field Duty & Attendance</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${returnTrip.status === 'returning' ? 'bg-blue-500/20 text-blue-300 border border-blue-400/40 animate-pulse' : returnTrip.status === 'reached' ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' : isOnDuty ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : isPunchedOut ? 'bg-slate-700 text-slate-300' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}>
                    {returnTrip.status === 'returning' ? '🚗 RETURNING TO OFFICE' : returnTrip.status === 'reached' ? '🏢 AT OFFICE' : isOnDuty ? '● ON DUTY / LIVE TRACKING' : isPunchedOut ? 'Punched Out' : 'Not Punched In'}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  {returnTrip.status === 'returning'
                    ? `In transit to ${ICS_OFFICE_LOCATION.name} • Departed ${returnTrip.startedAt ? new Date(returnTrip.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}`
                    : returnTrip.status === 'reached'
                    ? `Arrived at ${ICS_OFFICE_LOCATION.name} (${returnTrip.returnKm} KM recorded)`
                    : isOnDuty
                    ? `Punched In at ${new Date(attendance!.punch_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : isPunchedOut
                    ? `Completed shift: ${attendance?.total_work_minutes ? `${Math.floor(attendance.total_work_minutes / 60)}h ${attendance.total_work_minutes % 60}m` : '—'} • ${formatKm(attendance?.total_km || totalKmToday)}`
                    : 'Punch in to start field duty and live GPS tracking'}
                </p>
              </div>
            </div>

            {/* Punch in / Return to Office / Punch Out Actions */}
            <div>
              {!isOnDuty && !isPunchedOut && (
                <button
                  onClick={handleDutySwipeIn}
                  disabled={punchLoading}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-emerald-700 transition disabled:opacity-60"
                >
                  <Radio className="h-4 w-4" />
                  <span>{punchLoading ? 'Punching In...' : 'Punch In / Start Shift'}</span>
                </button>
              )}

              {isOnDuty && (
                <div className="flex flex-wrap items-center gap-2">
                  {/* RETURN TO OFFICE BUTTON / REACHED OFFICE ACTION */}
                  {returnTrip.status === 'returning' ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleMarkReachedOffice}
                        disabled={returnLoading}
                        className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-emerald-500/30 hover:bg-emerald-700 transition animate-pulse disabled:opacity-60"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{returnLoading ? 'Updating...' : 'Reached Office'}</span>
                      </button>
                      <button
                        onClick={handleCancelReturn}
                        disabled={returnLoading}
                        title="Cancel Return"
                        className="rounded-xl border border-white/20 bg-white/10 px-2.5 py-2 text-xs font-medium text-white/80 hover:bg-white/20 transition"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleStartReturnToOffice}
                      disabled={returnLoading}
                      className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-blue-500/25 hover:from-blue-700 hover:to-indigo-700 transition disabled:opacity-60"
                    >
                      <Building2 className="h-4 w-4" />
                      <span>{returnLoading ? 'Starting...' : 'Return to Office'}</span>
                    </button>
                  )}

                  <button
                    onClick={handleDutySwipeOut}
                    disabled={punchLoading}
                    className="flex items-center gap-1.5 rounded-xl bg-red-600/90 px-3.5 py-2 text-xs font-bold text-white shadow-md hover:bg-red-700 transition disabled:opacity-60"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>{punchLoading ? 'Ending Shift...' : 'Punch Out / End Shift'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* In-Transit to Office Active Card */}
        {returnTrip.status === 'returning' && (
          <div className="border-t border-slate-700/60 bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 px-5 py-3 text-white animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400 border border-blue-400/30">
                  <Navigation className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-blue-300 uppercase tracking-wider">Destination</p>
                    <span className="text-[11px] text-slate-200 font-bold">{ICS_OFFICE_LOCATION.name}</span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">{ICS_OFFICE_LOCATION.address}</p>
                  {returnTrip.startAddress && (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Departed from: <span className="text-slate-300">{returnTrip.startAddress}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${ICS_OFFICE_LOCATION.latitude},${ICS_OFFICE_LOCATION.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-xl border border-blue-400/40 bg-blue-500/20 px-3 py-1.5 text-xs font-bold text-blue-200 hover:bg-blue-500/30 transition shadow-sm"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Google Maps</span>
                </a>
                <button
                  onClick={handleMarkReachedOffice}
                  disabled={returnLoading}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-emerald-500/30 hover:bg-emerald-700 transition animate-pulse disabled:opacity-60"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{returnLoading ? 'Calculating...' : 'Reached Office (Record KM)'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Success Alert Banner if just reached */}
        {returnSuccessMsg && (
          <div className="border-t border-emerald-800/40 bg-emerald-950/40 px-5 py-2 text-xs text-emerald-300 flex items-center justify-between animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>{returnSuccessMsg}</span>
            </div>
            <button onClick={() => setReturnSuccessMsg(null)} className="text-emerald-400/80 hover:text-emerald-200 p-0.5">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Live Field KM & Duty Time Strip */}
        <div className="grid grid-cols-3 divide-x divide-slate-100 bg-slate-50/70 p-3 text-center border-t border-slate-100">
          <div>
            <p className="text-[11px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
              <Route className="h-3.5 w-3.5 text-blue-600" /> Field KM
            </p>
            <p className="mt-0.5 text-sm font-bold text-slate-900">{formatKm(totalKmToday)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase text-slate-500 flex items-center justify-center gap-1">
              <Clock className="h-3.5 w-3.5 text-indigo-600" /> Duty Time
            </p>
            <p className="mt-0.5 text-sm font-bold text-slate-900">
              {attendance?.punch_in_at
                ? isPunchedOut && attendance.total_work_minutes
                  ? `${Math.floor(attendance.total_work_minutes / 60)}h ${attendance.total_work_minutes % 60}m`
                  : `${Math.max(0, Math.floor((Date.now() - new Date(attendance.punch_in_at).getTime()) / 3600000))}h ${Math.floor(((Date.now() - new Date(attendance.punch_in_at).getTime()) % 3600000) / 60000)}m`
                : '—'}
            </p>
          </div>
          <div className="flex flex-col items-center justify-center">
            <button
              onClick={() => navigate('/engineer/attendance')}
              className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 transition"
            >
              <span>Timesheet</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Today's Jobs</p>
          <p className="text-2xl font-bold text-slate-900">{todayJobs.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Pending</p>
          <p className="text-2xl font-bold text-amber-600">{pendingJobs.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Completed Today</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-green-600">{completedToday.length}</p>
            {totalCompleted.length > 0 && (
              <span className="text-xs font-semibold text-slate-400">({totalCompleted.length} total)</span>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Total KM Covered</p>
          <p className="text-2xl font-bold text-slate-900">{formatKm(totalKmToday)}</p>
        </div>
      </div>

      {/* Today's Jobs List */}
      <h2 className="mb-3 text-lg font-semibold text-slate-900">Active & Today's Calls</h2>
      <div className="space-y-3">
        {todayJobs.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <Clock className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            <p className="text-slate-500">No jobs scheduled for today</p>
          </div>
        ) : (
          todayJobs.map((job) => (
            <button
              key={job.id}
              onClick={() => onViewJob(job)}
              className="block w-full rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 truncate max-w-full">{job.client?.client_name}</p>
                    {Number(job.client?.outstanding_amount || 0) > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase bg-red-100 text-red-700 border border-red-200 shrink-0 shadow-2xs">
                        <IndianRupee className="h-3 w-3" />
                        <span>{Number(job.client?.outstanding_amount).toLocaleString('en-IN')} Due</span>
                      </span>
                    )}
                    {job.call_source && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase shrink-0 ${
                          job.call_source === 'online'
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {job.call_source}
                      </span>
                    )}
                    {job.is_assist_call && job.assist_engineer_id === profile?.id && (
                      <span className="rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase bg-purple-100 text-purple-700 border border-purple-200 shrink-0">
                        🤝 Assist Call (Lead: {job.engineer?.full_name || 'Colleague'})
                      </span>
                    )}
                    {job.is_assist_call && job.engineer_id === profile?.id && (
                      <span className="rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase bg-indigo-100 text-indigo-700 border border-indigo-200 shrink-0">
                        👑 Lead (Assist: {job.assist_engineer?.full_name || 'Colleague'})
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs sm:text-sm text-slate-600 line-clamp-2">{job.issue_title}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                    <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{job.client?.city}</span>
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1 text-[11px] sm:text-xs">
                      <Clock className="h-3 w-3 shrink-0" /> {job.scheduled_time || '—'}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                      👤 Assigned by: <strong className="text-slate-900 truncate max-w-[120px]">{job.assigned_by_name || job.reassigned_from_name || 'Admin'}</strong>
                    </span>
                    {job.call_given_by && (
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                        📞 Call by: <strong className="text-slate-900 truncate max-w-[100px]">{job.call_given_by}</strong>
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <StatusBadge status={job.status} />
                  <PriorityBadge priority={job.priority} />
                  <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-slate-400 mt-1" />
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {showCreate && (
        <RequestCallModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onRequestSubmitted={load}
        />
      )}

      {/* ─── CREATE LEAD MODAL (ANYTIME) ─── */}
      {profile && (
        <UniversalCreateLeadModal
          isOpen={showCreateLead}
          onClose={() => setShowCreateLead(false)}
          userProfile={profile}
          onLeadCreated={() => {
            // navigate to leads
            navigate('/engineer/leads');
          }}
        />
      )}
    </div>
  );
}
