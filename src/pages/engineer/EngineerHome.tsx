import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badges';
import { CreateJobModal } from '@/components/jobs/CreateJobModal';
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
} from 'lucide-react';
import { formatKm } from '@/lib/distance';
import {
  fetchTodayAttendance,
  punchInDuty,
  punchOutDuty,
} from '@/lib/attendance';

interface EngineerHomeProps {
  onViewJob: (job: ServiceJob) => void;
}

export function EngineerHome({ onViewJob }: EngineerHomeProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
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

    // Match jobs belonging to current engineer by ID, email, or name
    const myName = (profile.full_name || '').trim().toLowerCase();
    const myEmail = (profile.email || '').trim().toLowerCase();

    function isMyJob(j: ServiceJob) {
      if (j.engineer_id === profile!.id) return true;
      const eng = j.engineer || engMap.get(j.engineer_id || '');
      if (eng) {
        if (eng.email && eng.email.toLowerCase() === myEmail) return true;
        if (eng.full_name && eng.full_name.toLowerCase().trim() === myName) return true;
      }
      return false;
    }

    const allDbJobs = ((jobData as unknown as ServiceJob[]) || []).map((j) => ({
      ...j,
      client: j.client || clientMap.get(j.client_id),
      engineer: j.engineer || engMap.get(j.engineer_id || ''),
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
  const totalKmToday = completedToday.reduce((s, j) => s + (j.total_km ?? 0), 0);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  async function handleDutySwipeIn() {
    if (!profile?.id) return;
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

  if (loading)
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-slate-500">Loading...</p>
      </div>
    );

  const isOnDuty = attendance?.status === 'on_duty';
  const isPunchedOut = attendance?.status === 'punched_out';

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
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 transition"
        >
          <Plus className="h-4 w-4" /> Create Call
        </button>
      </div>

      {/* Field Duty Attendance & Live GPS Card */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-5 py-4 text-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isOnDuty ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : isPunchedOut ? 'bg-slate-700/50 text-slate-300' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>
                {isOnDuty ? <Radio className="h-5 w-5 animate-pulse" /> : <ShieldCheck className="h-5 w-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm">Field Duty & Attendance</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${isOnDuty ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : isPunchedOut ? 'bg-slate-700 text-slate-300' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}>
                    {isOnDuty ? '● ON DUTY / LIVE TRACKING' : isPunchedOut ? 'Punched Out' : 'Not Punched In'}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  {isOnDuty
                    ? `Punched In at ${new Date(attendance!.punch_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : isPunchedOut
                    ? `Completed shift: ${attendance?.total_work_minutes ? `${Math.floor(attendance.total_work_minutes / 60)}h ${attendance.total_work_minutes % 60}m` : '—'} • ${formatKm(attendance?.total_km || totalKmToday)}`
                    : 'Punch in to start field duty and live GPS tracking'}
                </p>
              </div>
            </div>

            {/* Punch in / Punch Out Actions */}
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
                <div className="flex items-center gap-2">
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
              className="block w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900">{job.client?.client_name}</p>
                    {job.call_source && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          job.call_source === 'online'
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {job.call_source}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">{job.issue_title}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                    <MapPin className="h-3 w-3" /> {job.client?.city}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {job.scheduled_time || '—'}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                      👤 Assigned by: <strong className="text-slate-900">{job.assigned_by_name || job.reassigned_from_name || 'Admin'}</strong>
                    </span>
                    {job.call_given_by && (
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                        📞 Call by: <strong className="text-slate-900">{job.call_given_by}</strong>
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={job.status} />
                  <PriorityBadge priority={job.priority} />
                  <ChevronRight className="h-5 w-5 text-slate-400" />
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {showCreate && (
        <CreateJobModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={load}
          defaultEngineerId={profile?.id}
        />
      )}
    </div>
  );
}
