import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badges';
import type { ServiceJob, Profile, Client } from '@/types/database';
import { Users, UserCheck, CalendarCheck, Clock, Activity, CheckCircle2, Route, Eye } from 'lucide-react';
import { formatKm } from '@/lib/distance';

interface AdminDashboardProps {
  onViewJob: (job: ServiceJob) => void;
}

export function AdminDashboard({ onViewJob }: AdminDashboardProps) {
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [engineers, setEngineers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('admin-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_jobs' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => loadData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function loadData() {
    const [jobsRes, engineersRes, clientsRes] = await Promise.all([
      supabase
        .from('service_jobs')
        .select('*')
        .order('scheduled_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('role', 'engineer').order('full_name'),
      supabase.from('clients').select('*'),
    ]);

    const dbJobs = (jobsRes.data as unknown as ServiceJob[]) || [];
    const dbClients = (clientsRes.data as unknown as Client[]) || [];
    const dbEng = (engineersRes.data as unknown as Profile[]) || [];

    const clientMap = new Map<string, Client>();
    dbClients.forEach((c) => clientMap.set(c.id, c));

    const engMap = new Map<string, Profile>();
    dbEng.forEach((e) => engMap.set(e.id, e));

    const joinedJobs = dbJobs.map((j) => ({
      ...j,
      client: j.client || clientMap.get(j.client_id),
      engineer: j.engineer || (j.engineer_id ? engMap.get(j.engineer_id) : null),
    }));

    setJobs(joinedJobs);
    setEngineers(dbEng);
    setLoading(false);
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;

  const activeStatuses = ['assigned', 'traveling', 'reached', 'in_progress', 'solved', 'vendor', 'call_back'];

  function isJobCompletedToday(j: ServiceJob) {
    if (j.status !== 'completed') return false;
    if (j.completed_at) {
      if (j.completed_at.startsWith(today)) return true;
      try {
        const d = new Date(j.completed_at);
        const localD = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (localD === today) return true;
      } catch {
        /* fallback */
      }
    }
    return j.scheduled_date === today;
  }

  const todayJobs = jobs.filter((j) => j.scheduled_date === today || activeStatuses.includes(j.status) || isJobCompletedToday(j));
  const pendingJobs = jobs.filter((j) => activeStatuses.includes(j.status));
  const inProgressJobs = jobs.filter((j) => ['traveling', 'reached', 'in_progress', 'solved'].includes(j.status));
  const completedToday = jobs.filter(isJobCompletedToday);
  const activeEngineers = engineers.filter((e) => e.is_active);
  const totalKmToday = completedToday.reduce((sum, j) => sum + (j.total_km ?? 0), 0);

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><p className="text-slate-500">Loading dashboard...</p></div>;
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <a
          href="/admin/attendance"
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-blue-700 transition"
        >
          <CalendarCheck className="h-4 w-4" />
          <span>Attendance & Duty Hub</span>
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <StatCard label="Total Engineers" value={engineers.length} icon={<Users className="h-5 w-5 text-blue-600" />} color="bg-blue-50" />
        <StatCard label="Active Engineers" value={activeEngineers.length} icon={<UserCheck className="h-5 w-5 text-green-600" />} color="bg-green-50" />
        <StatCard label="Today's Jobs" value={todayJobs.length} icon={<CalendarCheck className="h-5 w-5 text-cyan-600" />} color="bg-cyan-50" />
        <StatCard label="Pending Jobs" value={pendingJobs.length} icon={<Clock className="h-5 w-5 text-amber-600" />} color="bg-amber-50" />
        <StatCard label="In Progress" value={inProgressJobs.length} icon={<Activity className="h-5 w-5 text-orange-600" />} color="bg-orange-50" />
        <StatCard label="Completed Today" value={completedToday.length} icon={<CheckCircle2 className="h-5 w-5 text-teal-600" />} color="bg-teal-50" />
        <StatCard label="Total KM Today" value={formatKm(totalKmToday)} icon={<Route className="h-5 w-5 text-indigo-600" />} color="bg-indigo-50" />
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Today's Service Jobs</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Job No</th>
                <th className="px-4 py-3 font-semibold">Client</th>
                <th className="px-4 py-3 font-semibold">Engineer</th>
                <th className="px-4 py-3 font-semibold">Assign By</th>
                <th className="px-4 py-3 font-semibold">Given By</th>
                <th className="px-4 py-3 font-semibold">Issue</th>
                <th className="px-4 py-3 font-semibold">Priority</th>
                <th className="px-4 py-3 font-semibold">Scheduled</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">KM</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {todayJobs.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-400">No jobs scheduled for today</td></tr>
              ) : (
                todayJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{job.job_number}</td>
                    <td className="px-4 py-3 text-slate-700">{job.client?.client_name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{job.engineer?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-700 font-medium whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800 border border-blue-200">
                        👤 {job.assigned_by_name || job.reassigned_from_name || 'Admin'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-medium whitespace-nowrap">
                      {job.call_given_by ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
                          📞 {job.call_given_by}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{job.issue_title}</td>
                    <td className="px-4 py-3"><PriorityBadge priority={job.priority} /></td>
                    <td className="px-4 py-3 text-slate-700">{job.scheduled_time || '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={job.status} /></td>
                    <td className="px-4 py-3 text-slate-700">{formatKm(job.total_km)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onViewJob(job)}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-blue-600 hover:bg-blue-50"
                      >
                        <Eye className="h-4 w-4" /> View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
