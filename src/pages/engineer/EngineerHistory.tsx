import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { StatusBadge } from '@/components/ui/Badges';
import type { ServiceJob, Client } from '@/types/database';
import { ChevronRight, History } from 'lucide-react';
import { formatKm } from '@/lib/distance';

interface EngineerHistoryProps {
  onViewJob: (job: ServiceJob) => void;
}

export function EngineerHistory({ onViewJob }: EngineerHistoryProps) {
  const { profile } = useAuth();
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const [{ data: jobData }, { data: clientData }] = await Promise.all([
        supabase
          .from('service_jobs')
          .select('*')
          .eq('engineer_id', profile.id)
          .in('status', ['completed', 'cancelled'])
          .order('completed_at', { ascending: false }),
        supabase.from('clients').select('*'),
      ]);

      const dbClients = (clientData as unknown as Client[]) || [];
      const clientMap = new Map<string, Client>();
      dbClients.forEach((c) => clientMap.set(c.id, c));

      const rawJobs = (jobData as unknown as ServiceJob[]) || [];
      const joinedJobs = rawJobs.map((j) => ({
        ...j,
        client: j.client || clientMap.get(j.client_id),
      }));

      setJobs(joinedJobs);
      setLoading(false);
    })();
  }, [profile]);

  if (loading) return <div className="flex h-64 items-center justify-center"><p className="text-slate-500">Loading...</p></div>;

  const totalKm = jobs.filter((j) => j.status === 'completed').reduce((s, j) => s + (j.total_km ?? 0), 0);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-slate-900">History</h1>

      <div className="mb-4 rounded-xl bg-slate-900 p-4 text-center">
        <p className="text-sm text-slate-400">Total KM Travelled</p>
        <p className="text-3xl font-bold text-white">{formatKm(totalKm)}</p>
      </div>

      <div className="space-y-3">
        {jobs.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <History className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            <p className="text-slate-500">No completed jobs yet</p>
          </div>
        ) : jobs.map((job) => (
          <button key={job.id} onClick={() => onViewJob(job)} className="block w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="font-semibold text-slate-900">{job.client?.client_name}</p>
                <p className="mt-0.5 text-sm text-slate-600">{job.issue_title}</p>
                <p className="mt-1 text-xs text-slate-500">{job.completed_at ? new Date(job.completed_at).toLocaleDateString() : job.scheduled_date} • {formatKm(job.total_km)}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusBadge status={job.status} />
                <ChevronRight className="h-5 w-5 text-slate-400" />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
