import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badges';
import { CreateJobModal } from '@/components/jobs/CreateJobModal';
import type { ServiceJob, JobStatus, Client, Profile } from '@/types/database';
import { Plus, Eye, Search, Filter, Globe, MapPin, Laptop } from 'lucide-react';
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
  const [sourceFilter, setSourceFilter] = useState<'all' | 'direct' | 'online'>('all');

  useEffect(() => {
    loadJobs();

    const channel = supabase
      .channel('admin-jobs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_jobs' }, () => loadJobs())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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

  // Counts for Source Filter
  const sourceCounts = useMemo(() => {
    const all = jobs.length;
    const direct = jobs.filter((j) => (j.call_source || 'direct') === 'direct').length;
    const online = jobs.filter((j) => j.call_source === 'online').length;
    return { all, direct, online };
  }, [jobs]);

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

    const matchesSource =
      sourceFilter === 'all'
        ? true
        : (job.call_source || 'direct') === sourceFilter;

    return matchesSearch && matchesStatus && matchesSource;
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Service Jobs</h1>
          <p className="text-sm text-slate-500">Manage and track all on-site and remote service calls</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 font-bold text-white shadow-sm hover:bg-blue-700 transition"
        >
          <Plus className="h-5 w-5" /> Create Service Job
        </button>
      </div>

      {/* Filters Bar with All, Direct, and Online */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Source Filter Switcher: All | Direct | Online */}
        <div className="flex rounded-xl bg-slate-200/80 p-1">
          <button
            type="button"
            onClick={() => setSourceFilter('all')}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
              sourceFilter === 'all'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Globe className="h-3.5 w-3.5 text-slate-500" />
            <span>All Calls ({sourceCounts.all})</span>
          </button>
          <button
            type="button"
            onClick={() => setSourceFilter('direct')}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
              sourceFilter === 'direct'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MapPin className="h-3.5 w-3.5 text-blue-600" />
            <span>Direct Calls ({sourceCounts.direct})</span>
          </button>
          <button
            type="button"
            onClick={() => setSourceFilter('online')}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
              sourceFilter === 'online'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Laptop className="h-3.5 w-3.5 text-indigo-600" />
            <span>Online Calls ({sourceCounts.online})</span>
          </button>
        </div>

        {/* Search & Status Filter */}
        <div className="flex flex-1 flex-wrap items-center justify-end gap-3 min-w-[280px]">
          <div className="relative flex-1 max-w-md min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="search-jobs"
              name="search_jobs"
              aria-label="Search jobs"
              type="text"
              placeholder="Search by job #, client, engineer, or issue..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-xs font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
            />
          </div>

          <div className="relative">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select
              id="status-filter"
              name="status_filter"
              aria-label="Filter jobs by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none rounded-xl border border-slate-300 py-2 pl-9 pr-8 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 bg-white"
            >
              {statusFilters.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 font-bold tracking-wider">
            <tr>
              <th className="px-4 py-3.5">Job No</th>
              <th className="px-4 py-3.5">Client & Type</th>
              <th className="px-4 py-3.5">Engineer</th>
              <th className="px-4 py-3.5">Call Given By</th>
              <th className="px-4 py-3.5">Issue</th>
              <th className="px-4 py-3.5">Priority</th>
              <th className="px-4 py-3.5">Date</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5">KM</th>
              <th className="px-4 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                  Loading service calls...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                  No service calls found matching filters
                </td>
              </tr>
            ) : (
              filtered.map((job) => (
                <tr key={job.id} className="hover:bg-slate-50/80 transition">
                  <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">
                    {job.job_number}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold">{job.client?.client_name ?? '—'}</span>
                      {job.call_source && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            job.call_source === 'online'
                              ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                              : 'bg-blue-100 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {job.call_source}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700 font-medium">
                    {job.engineer?.full_name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-700 font-medium">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800 border border-slate-200 shadow-2xs">
                      👤 {job.call_given_by || job.assigned_by_name || job.reassigned_from_name || 'Admin'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700 max-w-xs truncate">{job.issue_title}</td>
                  <td className="px-4 py-3">
                    <PriorityBadge priority={job.priority} />
                  </td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{job.scheduled_date}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={job.status as JobStatus} />
                  </td>
                  <td className="px-4 py-3 text-slate-700 font-semibold whitespace-nowrap">
                    {formatKm(job.total_km)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => onViewJob(job)}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold text-blue-600 hover:bg-blue-50 border border-blue-200 transition"
                    >
                      <Eye className="h-3.5 w-3.5" /> View
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
