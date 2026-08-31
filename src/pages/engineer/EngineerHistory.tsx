import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { StatusBadge } from '@/components/ui/Badges';
import type { ServiceJob, Client, Profile } from '@/types/database';
import {
  ChevronRight,
  History,
  Calendar,
  Car,
  CheckCircle2,
  Search,
  Route,
  TrendingUp,
} from 'lucide-react';
import { formatKm } from '@/lib/distance';

interface EngineerHistoryProps {
  onViewJob: (job: ServiceJob) => void;
}

function getJobMonth(job: ServiceJob): string {
  if (job.completed_at) {
    try {
      const d = new Date(job.completed_at);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
      }
    } catch {
      // fallback
    }
  }
  if (job.scheduled_date && job.scheduled_date.length >= 7) {
    return job.scheduled_date.substring(0, 7);
  }
  return '';
}

function formatMonthLabel(monthStr: string): string {
  if (!monthStr || monthStr === 'all') return 'All Time';
  const [year, month] = monthStr.split('-');
  const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

export function EngineerHistory({ onViewJob }: EngineerHistoryProps) {
  const { profile } = useAuth();
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!profile) return;
    loadHistory();
  }, [profile?.id]);

  async function loadHistory() {
    if (!profile) return;
    try {
      const [{ data: jobData }, { data: clientData }, { data: allEngData }] = await Promise.all([
        supabase
          .from('service_jobs')
          .select('*')
          .in('status', ['completed', 'cancelled'])
          .order('completed_at', { ascending: false }),
        supabase.from('clients').select('*'),
        supabase.from('profiles').select('*'),
      ]);

      const dbEngList = (allEngData as unknown as Profile[]) || [];
      const engMap = new Map<string, Profile>();
      dbEngList.forEach((e) => engMap.set(e.id, e));

      const dbClients = (clientData as unknown as Client[]) || [];
      const clientMap = new Map<string, Client>();
      dbClients.forEach((c) => clientMap.set(c.id, c));

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

      const rawJobs = (jobData as unknown as ServiceJob[]) || [];
      const joinedJobs = rawJobs
        .filter(isMyJob)
        .map((j) => ({
          ...j,
          client: j.client || clientMap.get(j.client_id),
          engineer: j.engineer || engMap.get(j.engineer_id || ''),
        }));

      setJobs(joinedJobs);
    } catch (err) {
      console.error('Failed to load engineer history:', err);
    } finally {
      setLoading(false);
    }
  }

  // Dynamic available months list
  const availableMonths = useMemo(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthSet = new Set<string>();
    monthSet.add(currentMonth);

    jobs.forEach((j) => {
      const m = getJobMonth(j);
      if (m) monthSet.add(m);
    });

    return Array.from(monthSet).sort().reverse();
  }, [jobs]);

  // Filtered jobs by month & search
  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      if (selectedMonth !== 'all') {
        const jMonth = getJobMonth(j);
        if (jMonth !== selectedMonth) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchNum = j.job_number?.toLowerCase().includes(q);
        const matchClient = j.client?.client_name?.toLowerCase().includes(q);
        const matchIssue = j.issue_title?.toLowerCase().includes(q);
        if (!matchNum && !matchClient && !matchIssue) return false;
      }
      return true;
    });
  }, [jobs, selectedMonth, search]);

  const filteredTotalKm = useMemo(() => {
    return filteredJobs
      .filter((j) => j.status === 'completed')
      .reduce((s, j) => s + (j.total_km || j.gps_distance_km || 0), 0);
  }, [filteredJobs]);

  const completedCallsCount = useMemo(() => {
    return filteredJobs.filter((j) => j.status === 'completed').length;
  }, [filteredJobs]);

  const avgKmPerCall = useMemo(() => {
    return completedCallsCount > 0 ? (filteredTotalKm / completedCallsCount).toFixed(1) : '0.0';
  }, [filteredTotalKm, completedCallsCount]);

  const allTimeKm = useMemo(() => {
    return jobs
      .filter((j) => j.status === 'completed')
      .reduce((s, j) => s + (j.total_km || j.gps_distance_km || 0), 0);
  }, [jobs]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-slate-500 font-medium">Loading history and KM records...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header and Month Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">History & KM Log</h1>
          <p className="text-xs text-slate-500">Track your completed calls, monthly travel distance, and history</p>
        </div>

        {/* Monthly Filter Selector */}
        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <Calendar className="pointer-events-none absolute left-3 h-4 w-4 text-blue-600" />
            <select
              id="history-month-filter"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="appearance-none rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-8 text-xs font-bold text-slate-800 shadow-2xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
            >
              <option value="all">🌐 All Time ({formatKm(allTimeKm)})</option>
              {availableMonths.map((m) => {
                const isCurrent =
                  m === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
                return (
                  <option key={m} value={m}>
                    📅 {formatMonthLabel(m)} {isCurrent ? '(Current Month)' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {selectedMonth !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedMonth('all')}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
              title="Reset to All Time"
            >
              All Time
            </button>
          )}
        </div>
      </div>

      {/* Monthly Total KM Banner Card */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 text-white shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[11px] font-bold text-blue-300 border border-blue-400/30">
                {selectedMonth === 'all' ? 'All Time Travelled' : `${formatMonthLabel(selectedMonth)} Travel`}
              </span>
            </div>
            <p className="mt-2 text-3xl sm:text-4xl font-black tracking-tight text-white">
              {formatKm(filteredTotalKm)}
            </p>
            <p className="mt-1 text-xs text-slate-300">
              Total distance logged for {selectedMonth === 'all' ? 'all completed calls' : formatMonthLabel(selectedMonth)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 min-w-[200px]">
            <div className="rounded-xl bg-white/10 p-3 backdrop-blur-xs border border-white/10">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Completed
              </p>
              <p className="mt-1 text-xl font-extrabold text-white">{completedCallsCount}</p>
              <p className="text-[10px] text-slate-400">Calls Solved</p>
            </div>
            <div className="rounded-xl bg-white/10 p-3 backdrop-blur-xs border border-white/10">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1">
                <Route className="h-3.5 w-3.5 text-cyan-400" /> Avg KM / Call
              </p>
              <p className="mt-1 text-xl font-extrabold text-white">{avgKmPerCall}</p>
              <p className="text-[10px] text-slate-400">Kilometers</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search Filter Bar */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search history by job #, client, or issue..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 shadow-2xs"
        />
      </div>

      {/* Completed Calls List */}
      <div className="space-y-3">
        {filteredJobs.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <History className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            <p className="font-semibold text-slate-700">
              No completed calls found for {selectedMonth === 'all' ? 'this search' : formatMonthLabel(selectedMonth)}
            </p>
            {selectedMonth !== 'all' && (
              <button
                onClick={() => setSelectedMonth('all')}
                className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
              >
                <span>View All Time History</span>
              </button>
            )}
          </div>
        ) : (
          filteredJobs.map((job) => (
            <button
              key={job.id}
              onClick={() => onViewJob(job)}
              className="block w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-slate-900">{job.client?.client_name || 'Customer'}</p>
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
                  <p className="mt-0.5 text-sm text-slate-600">{job.issue_title}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="font-medium">
                      📅 {job.completed_at ? new Date(job.completed_at).toLocaleDateString() : job.scheduled_date}
                    </span>
                    <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      🚗 {formatKm(job.total_km || job.gps_distance_km)}
                    </span>
                    {job.job_number && (
                      <span className="text-slate-400 font-medium">#{job.job_number}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={job.status} />
                  <ChevronRight className="h-5 w-5 text-slate-400" />
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
