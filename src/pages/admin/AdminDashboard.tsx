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
        .select('*, client:clients(*), engineer:profiles(*)')
        .order('scheduled_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('role', 'engineer').order('full_name'),
      supabase.from('clients').select('*'),
    ]);

    const dbJobs = (jobsRes.data as unknown as ServiceJob[]) || [];
    const localJobs = JSON.parse(localStorage.getItem('custom_local_jobs') || '[]') as ServiceJob[];
    const dbClients = (clientsRes.data as unknown as Client[]) || [];
    const localClients = JSON.parse(localStorage.getItem('custom_local_clients') || '[]') as Client[];
    const dbEng = (engineersRes.data as unknown as Profile[]) || [];
    const localEng = JSON.parse(localStorage.getItem('custom_local_engineers') || '[]') as Profile[];

    const clientMap = new Map<string, Client>();
    [...dbClients, ...localClients].forEach((c) => clientMap.set(c.id, c));

    const engMap = new Map<string, Profile>();
    [...dbEng, ...localEng].forEach((e) => engMap.set(e.id, e));

    const jobMap = new Map<string, ServiceJob>();
    dbJobs.forEach((j) => jobMap.set(j.id, j));
    localJobs.forEach((j) => {
      jobMap.set(j.id, {
        ...j,
        client: j.client || clientMap.get(j.client_id),
        engineer: j.engineer || (j.engineer_id ? engMap.get(j.engineer_id) : null),
      });
    });

    setJobs(Array.from(jobMap.values()));
    setEngineers(Array.from(engMap.values()));
    setLoading(false);
  }

  const todayJobs = jobs.filter((j) => j.scheduled_date === new Date().toISOString().split('T')[0]);
  const pendingJobs = jobs.filter((j) => j.status === 'assigned' || j.status === 'traveling' || j.status === 'reached' || j.status === 'in_progress' || j.status === 'solved' || j.status === 'call_back' || j.status === 'vendor');
  const inProgressJobs = jobs.filter((j) => j.status === 'in_progress');
  const completedToday = todayJobs.filter((j) => j.status === 'completed');
  const activeEngineers = engineers.filter((e) => e.is_active);
  const totalKmToday = completedToday.reduce((sum, j) => sum + (j.total_km ?? 0), 0);

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><p className="text-slate-500">Loading dashboard...</p></div>;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Dashboard</h1>

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
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No jobs scheduled for today</td></tr>
              ) : (
                todayJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{job.job_number}</td>
                    <td className="px-4 py-3 text-slate-700">{job.client?.client_name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{job.engineer?.full_name ?? '—'}</td>
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
