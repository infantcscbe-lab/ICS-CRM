import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { ServiceJob, JobLocationLog, Client, Profile } from '@/types/database';
import { MapPin, Navigation, Clock, Phone, Route, Car, RefreshCw } from 'lucide-react';
import { LiveTrackingMap } from '@/components/maps/LiveTrackingMap';

export function AdminTracking() {
  const [activeJobs, setActiveJobs] = useState<ServiceJob[]>([]);
  const [logs, setLogs] = useState<Record<string, JobLocationLog[]>>({});
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('admin-tracking')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_jobs' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_location_logs' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  async function load(isManual = false) {
    if (isManual) setRefreshing(true);

    const [{ data: jobData }, { data: clientData }, { data: engData }] = await Promise.all([
      supabase
        .from('service_jobs')
        .select('*, client:clients(*), engineer:profiles(*)')
        .in('status', ['traveling', 'reached', 'in_progress']),
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

    const combinedJobs = joinedJobs.filter((j) => j.call_source !== 'online');
    setActiveJobs(combinedJobs);

    if (combinedJobs.length > 0) {
      setSelectedJobId((prev) => (prev && combinedJobs.some((j) => j.id === prev) ? prev : combinedJobs[0].id));
    }

    const logMap: Record<string, JobLocationLog[]> = {};
    await Promise.all(
      combinedJobs.map(async (j) => {
        const { data } = await supabase
          .from('job_location_logs')
          .select('*')
          .eq('job_id', j.id)
          .order('recorded_at');
        logMap[j.id] = (data as unknown as JobLocationLog[]) || [];
      })
    );
    setLogs(logMap);
    setLoading(false);
    if (isManual) setRefreshing(false);
  }

  if (loading)
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-slate-500">Loading tracking data...</p>
      </div>
    );

  const currentJob = activeJobs.find((j) => j.id === selectedJobId) || activeJobs[0];
  const currentLogs = currentJob ? logs[currentJob.id] || [] : [];
  const latestLog = currentLogs.length > 0 ? currentLogs[currentLogs.length - 1] : null;

  const engineerLocation = latestLog
    ? { latitude: latestLog.latitude, longitude: latestLog.longitude }
    : currentJob?.start_latitude && currentJob?.start_longitude
    ? { latitude: currentJob.start_latitude, longitude: currentJob.start_longitude }
    : null;

  const clientLocation =
    currentJob?.client?.latitude && currentJob?.client?.longitude
      ? { latitude: currentJob.client.latitude, longitude: currentJob.client.longitude }
      : null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Live Fleet & Trip Tracking</h1>
          <p className="text-sm text-slate-500">Real-time GPS tracking like Uber / Rapido</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh GPS'}</span>
          </button>

          <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3.5 py-1.5 text-xs font-semibold text-blue-700 border border-blue-200">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-600"></span>
            </span>
            {activeJobs.length} Active Trips
          </div>
        </div>
      </div>

      {activeJobs.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <Navigation className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="font-semibold text-slate-700">No active trips currently in progress</p>
          <p className="mt-1 text-xs text-slate-400">
            When an engineer starts travel on a service job, real-time live navigation will appear here.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Uber/Rapido Map Component */}
          <div className="lg:col-span-2 space-y-4">
            <LiveTrackingMap
              currentLocation={engineerLocation}
              clientLocation={clientLocation}
              clientName={currentJob?.client?.client_name}
              clientAddress={currentJob?.client?.address}
              engineerName={currentJob?.engineer?.full_name}
              routeLogs={currentLogs}
              status={currentJob?.status}
              height="480px"
            />

            {/* Selected Job Info Strip */}
            {currentJob && (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Car className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{currentJob.engineer?.full_name || 'Engineer'}</p>
                    <p className="text-xs text-slate-500">Destination: {currentJob.client?.client_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
                  <span className="flex items-center gap-1">
                    <Route className="h-4 w-4 text-slate-400" /> {currentLogs.length} GPS checkpoints
                  </span>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold capitalize text-emerald-700 border border-emerald-200">
                    {currentJob.status}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Active engineers list */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Active Engineers</h2>
            {activeJobs.map((job) => {
              const jobLogs = logs[job.id] || [];
              const lastLog = jobLogs[jobLogs.length - 1];
              const isSelected = currentJob?.id === job.id;

              return (
                <div
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  className={`cursor-pointer rounded-2xl border p-4 transition-all duration-200 shadow-sm ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                        {job.engineer?.full_name?.charAt(0) || 'E'}
                      </div>
                      <p className="font-bold text-slate-900">{job.engineer?.full_name || 'Engineer'}</p>
                    </div>
                    <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold capitalize text-blue-700">
                      {job.status}
                    </span>
                  </div>

                  <p className="text-xs font-medium text-slate-700">
                    {job.job_number} — {job.issue_title}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    To: {job.client?.client_name} ({job.client?.city})
                  </p>

                  {lastLog && (
                    <div className="mt-3 flex items-center justify-between rounded-lg bg-white p-2 text-[11px] text-slate-600 border border-slate-100">
                      <span className="flex items-center gap-1 font-mono">
                        <MapPin className="h-3 w-3 text-blue-600" /> {lastLog.latitude.toFixed(4)},{' '}
                        {lastLog.longitude.toFixed(4)}
                      </span>
                      <span className="flex items-center gap-1 text-slate-400">
                        <Clock className="h-3 w-3" />{' '}
                        {new Date(lastLog.recorded_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  )}

                  {job.client?.phone && (
                    <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                      <a
                        href={`tel:${job.client.phone}`}
                        className="flex items-center gap-1 font-medium text-slate-600 hover:text-green-600"
                      >
                        <Phone className="h-3.5 w-3.5" /> {job.client.phone}
                      </a>
                      <span className="text-[11px] font-semibold text-blue-600">View Map →</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
