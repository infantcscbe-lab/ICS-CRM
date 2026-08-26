import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badges';
import { CreateJobModal } from '@/components/jobs/CreateJobModal';
import type { ServiceJob, Client } from '@/types/database';
import { ChevronRight, Plus } from 'lucide-react';

interface EngineerJobsProps {
  onViewJob: (job: ServiceJob) => void;
}

export function EngineerJobs({ onViewJob }: EngineerJobsProps) {
  const { profile } = useAuth();
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('active');

  useEffect(() => {
    load();
    const ch = supabase.channel('eng-jobs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_jobs' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function load() {
    if (!profile) return;
    const [{ data: jobData }, { data: clientData }] = await Promise.all([
      supabase.from('service_jobs').select('*, client:clients(*)').eq('engineer_id', profile.id).order('scheduled_date', { ascending: false }),
      supabase.from('clients').select('*'),
    ]);

    const dbJobs = (jobData as unknown as ServiceJob[]) || [];
    const localJobs = (JSON.parse(localStorage.getItem('custom_local_jobs') || '[]') as ServiceJob[]).filter(
      (j) => j.engineer_id === profile.id
    );
    const dbClients = (clientData as unknown as Client[]) || [];
    const localClients = JSON.parse(localStorage.getItem('custom_local_clients') || '[]') as Client[];
    const clientMap = new Map<string, Client>();
    [...dbClients, ...localClients].forEach((c) => clientMap.set(c.id, c));

    const jobMap = new Map<string, ServiceJob>();
    dbJobs.forEach((j) => jobMap.set(j.id, j));
    localJobs.forEach((j) => {
      jobMap.set(j.id, {
        ...j,
        client: j.client || clientMap.get(j.client_id),
      });
    });

    setJobs(Array.from(jobMap.values()));
    setLoading(false);
  }

  const activeStatuses = ['assigned', 'traveling', 'reached', 'in_progress', 'solved', 'vendor', 'call_back'];
  const inClientStatuses = ['reached', 'in_progress', 'solved'];
  const filtered = jobs.filter((j) =>
    filter === 'all'
      ? true
      : filter === 'active'
      ? activeStatuses.includes(j.status)
      : filter === 'in_progress'
      ? inClientStatuses.includes(j.status)
      : j.status === filter
  );

  const filters = [
    { value: 'active', label: 'Active' },
    { value: 'assigned', label: 'Assigned' },
    { value: 'traveling', label: 'On Call' },
    { value: 'in_progress', label: 'In Client Place' },
    { value: 'vendor', label: 'Vendor' },
    { value: 'call_back', label: 'Call Back' },
    { value: 'completed', label: 'Completed' },
    { value: 'all', label: 'All' },
  ];

  if (loading) return <div className="flex h-64 items-center justify-center"><p className="text-slate-500">Loading...</p></div>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">My Jobs</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
        >
          <Plus className="h-4 w-4" /> Create Call
        </button>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {filters.map((f) => (
          <button key={f.value} onClick={() => setFilter(f.value)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${filter === f.value ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-slate-500">No jobs found</p>
          </div>
        ) : filtered.map((job) => (
          <button key={job.id} onClick={() => onViewJob(job)} className="block w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-slate-900">{job.client?.client_name}</p>
                  {job.call_source && (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${job.call_source === 'online' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'}`}>
                      {job.call_source}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-slate-600">{job.issue_title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>{job.scheduled_date} • {job.scheduled_time || '—'}</span>
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
        ))}
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
