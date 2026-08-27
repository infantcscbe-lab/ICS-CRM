import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badges';
import { CreateJobModal } from '@/components/jobs/CreateJobModal';
import type { ServiceJob, JobStatus, Client, Profile } from '@/types/database';
import { Plus, Eye, Search, Filter } from 'lucide-react';
import { formatKm } from '@/lib/distance';

interface AdminJobsProps {
  onViewJob: (job: ServiceJob) => void;
}

const statusFilters: { value: string; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'traveling', label: 'On Call' },
  { value: 'in_progress', label: 'In Client Place' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'call_back', label: 'Call Back' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function AdminJobs({ onViewJob }: AdminJobsProps) {
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadJobs();

    const channel = supabase
      .channel('admin-jobs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_jobs' }, () => loadJobs())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function loadJobs() {
    const [{ data: jobData }, { data: clientData }, { data: engData }] = await Promise.all([
      supabase.from('service_jobs').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('*'),
      supabase.from('profiles').select('*'),
    ]);

    const dbJobs = (jobData as unknown as ServiceJob[]) || [];
    const dbClients = (clientData as unknown as Client[]) || [];
    const dbEng = (engData as unknown as Profile[]) || [];

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
    setLoading(false);
  }

  const filtered = jobs.filter((job) => {
    const matchesSearch =
      !search ||
      job.job_number.toLowerCase().includes(search.toLowerCase()) ||
      job.issue_title.toLowerCase().includes(search.toLowerCase()) ||
      job.client?.client_name.toLowerCase().includes(search.toLowerCase()) ||
      job.engineer?.full_name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'in_progress'
        ? ['reached', 'in_progress', 'solved'].includes(job.status)
        : job.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Service Jobs</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700"
        >
          <Plus className="h-5 w-5" /> Create Service Job
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            id="search-jobs"
            name="search_jobs"
            type="text"
            placeholder="Search jobs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 outline-none focus:border-blue-500"
          />
        </div>
        <div className="relative">
          <Filter className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <select
            id="status-filter"
            name="status_filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none rounded-lg border border-slate-300 py-2.5 pl-10 pr-8 font-medium outline-none focus:border-blue-500"
          >
            {statusFilters.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Job No</th>
              <th className="px-4 py-3 font-semibold">Client</th>
              <th className="px-4 py-3 font-semibold">Engineer</th>
              <th className="px-4 py-3 font-semibold">Call Given By</th>
              <th className="px-4 py-3 font-semibold">Issue</th>
              <th className="px-4 py-3 font-semibold">Priority</th>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">KM</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">No jobs found</td></tr>
            ) : (
              filtered.map((job) => (
                <tr key={job.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{job.job_number}</td>
                  <td className="px-4 py-3 text-slate-700">
                    <div className="flex items-center gap-1.5">
                      <span>{job.client?.client_name ?? '—'}</span>
                      {job.call_source && (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${job.call_source === 'online' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'}`}>
                          {job.call_source}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{job.engineer?.full_name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-700 font-medium">
                    {job.call_given_by ? (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-800 border border-slate-200">
                        {job.call_given_by}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{job.issue_title}</td>
                  <td className="px-4 py-3"><PriorityBadge priority={job.priority} /></td>
                  <td className="px-4 py-3 text-slate-700">{job.scheduled_date}</td>
                  <td className="px-4 py-3"><StatusBadge status={job.status as JobStatus} /></td>
                  <td className="px-4 py-3 text-slate-700">{formatKm(job.total_km)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => onViewJob(job)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-blue-600 hover:bg-blue-50">
                      <Eye className="h-4 w-4" /> View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <CreateJobModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={loadJobs} />
    </div>
  );
}
