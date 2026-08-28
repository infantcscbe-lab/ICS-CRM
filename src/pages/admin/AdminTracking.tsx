import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { ServiceJob, JobLocationLog, Client, Profile, DutyAttendance } from '@/types/database';
import { MapPin, Navigation, Clock, Phone, Route, Car, RefreshCw, Users, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { LiveTrackingMap, type FleetEngineerLocation } from '@/components/maps/LiveTrackingMap';

interface EngineerFleetState {
  engineer: Profile;
  status: 'traveling' | 'reached' | 'in_progress' | 'on_duty' | 'punched_out' | 'idle' | 'offline';
  statusLabel: string;
  location: { latitude: number; longitude: number };
  lastSeen?: string;
  activeJob?: ServiceJob | null;
  routeLogs: JobLocationLog[];
}

export function AdminTracking() {
  const [fleetList, setFleetList] = useState<EngineerFleetState[]>([]);
  const [selectedEngineerId, setSelectedEngineerId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'traveling'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('admin-fleet-tracking')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_jobs' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_location_logs' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duty_attendance' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  async function load(isManual = false) {
    if (isManual) setRefreshing(true);

    try {
      const today = new Date().toISOString().split('T')[0];

      const [
        { data: engData },
        { data: jobData },
        { data: clientData },
        { data: attendanceData },
        { data: logsData },
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('role', 'engineer').eq('is_active', true),
        supabase
          .from('service_jobs')
          .select('*')
          .in('status', ['traveling', 'reached', 'in_progress', 'assigned']),
        supabase.from('clients').select('*'),
        supabase.from('duty_attendance').select('*').eq('date', today),
        supabase.from('job_location_logs').select('*').order('recorded_at', { ascending: true }),
      ]);

      const engineers = (engData as Profile[]) || [];
      const dbJobs = (jobData as ServiceJob[]) || [];
      const dbClients = (clientData as Client[]) || [];
      const dbAttendance = (attendanceData as DutyAttendance[]) || [];
      const allLogs = (logsData as JobLocationLog[]) || [];

      const clientMap = new Map<string, Client>();
      dbClients.forEach((c) => clientMap.set(c.id, c));

      const attendanceMap = new Map<string, DutyAttendance>();
      dbAttendance.forEach((a) => attendanceMap.set(a.engineer_id, a));

      // Group logs by engineer
      const logsByEngineer = new Map<string, JobLocationLog[]>();
      allLogs.forEach((log) => {
        if (!logsByEngineer.has(log.engineer_id)) {
          logsByEngineer.set(log.engineer_id, []);
        }
        logsByEngineer.get(log.engineer_id)!.push(log);
      });

      // Build fleet list for each active engineer
      const fleet: EngineerFleetState[] = engineers.map((eng) => {
        const activeJobRaw = dbJobs.find(
          (j) => j.engineer_id === eng.id && ['traveling', 'reached', 'in_progress'].includes(j.status)
        );

        const activeJob: ServiceJob | null = activeJobRaw
          ? {
              ...activeJobRaw,
              client: activeJobRaw.client || (activeJobRaw.client_id ? clientMap.get(activeJobRaw.client_id) : undefined),
              engineer: eng,
            }
          : null;

        const engineerLogs = logsByEngineer.get(eng.id) || [];
        const attendance = attendanceMap.get(eng.id);

        // Determine status
        let status: EngineerFleetState['status'] = 'idle';
        let statusLabel = 'Idle';

        if (activeJob?.status === 'traveling') {
          status = 'traveling';
          statusLabel = 'On Call (Traveling)';
        } else if (activeJob?.status === 'reached' || activeJob?.status === 'in_progress') {
          status = 'reached';
          statusLabel = 'At Client Place';
        } else if (attendance?.status === 'on_duty' || attendance?.status === 'present') {
          status = 'on_duty';
          statusLabel = 'On Duty (Logged In)';
        } else if (attendance?.status === 'punched_out') {
          status = 'punched_out';
          statusLabel = 'Punched Out';
        }

        // Determine latest coordinates
        let lat = 11.0168; // Default Coimbatore Center
        let lng = 76.9558;
        let lastSeen: string | undefined = undefined;

        if (engineerLogs.length > 0) {
          const latest = engineerLogs[engineerLogs.length - 1];
          lat = latest.latitude;
          lng = latest.longitude;
          lastSeen = new Date(latest.recorded_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });
        } else if (activeJob?.start_latitude && activeJob?.start_longitude) {
          lat = activeJob.start_latitude;
          lng = activeJob.start_longitude;
        } else if (attendance?.punch_in_latitude && attendance?.punch_in_longitude) {
          lat = attendance.punch_in_latitude;
          lng = attendance.punch_in_longitude;
          lastSeen = attendance.punch_in_at
            ? new Date(attendance.punch_in_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : undefined;
        }

        // Only include logs for the current active job if on-call
        const jobLogs = activeJob
          ? engineerLogs.filter((l) => l.job_id === activeJob.id)
          : [];

        return {
          engineer: eng,
          status,
          statusLabel,
          location: { latitude: lat, longitude: lng },
          lastSeen,
          activeJob,
          routeLogs: jobLogs,
        };
      });

      setFleetList(fleet);
    } catch (err) {
      console.error('Error loading fleet tracking:', err);
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-slate-500 font-medium">Loading fleet & engineer locations...</p>
      </div>
    );
  }

  // Filtered engineers for sidebar
  const displayedFleet =
    filterTab === 'traveling'
      ? fleetList.filter((f) => f.status === 'traveling' || f.status === 'reached')
      : fleetList;

  // Selected engineer state (null means All Engineers Overview)
  const selectedFleetItem = selectedEngineerId
    ? fleetList.find((f) => f.engineer.id === selectedEngineerId)
    : null;

  const isOverviewMode = !selectedFleetItem;

  // Multi-Engineer Fleet Locations array for the Map
  const fleetLocations: FleetEngineerLocation[] = fleetList.map((f) => ({
    id: f.engineer.id,
    name: f.engineer.full_name,
    phone: f.engineer.phone || undefined,
    status: f.status,
    statusLabel: f.statusLabel,
    location: f.location,
    activeJobNumber: f.activeJob?.job_number,
    activeClientName: f.activeJob?.client?.client_name,
    lastSeen: f.lastSeen,
  }));

  const activeTravelingCount = fleetList.filter((f) => f.status === 'traveling').length;

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Users className="h-6 w-6 text-blue-600" />
            Live Fleet & Engineer Tracking
          </h1>
          <p className="text-sm text-slate-500">
            {isOverviewMode
              ? 'Real-time locations of all logged-in service engineers'
              : `Tracking trip route for ${selectedFleetItem?.engineer.full_name}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh GPS'}</span>
          </button>

          <button
            onClick={() => setSelectedEngineerId(null)}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-sm border ${
              isOverviewMode
                ? 'bg-blue-600 text-white border-blue-600 shadow-blue-500/20'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>All Engineers ({fleetList.length})</span>
          </button>

          <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 border border-blue-200">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-600"></span>
            </span>
            {activeTravelingCount} On-Call Trips
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Map Component */}
        <div className="lg:col-span-2 space-y-4">
          <LiveTrackingMap
            showAllFleet={isOverviewMode}
            fleetEngineers={fleetLocations}
            onSelectFleetEngineer={(id) => setSelectedEngineerId(id)}
            onBackToFleet={() => setSelectedEngineerId(null)}
            currentLocation={selectedFleetItem ? selectedFleetItem.location : null}
            startLocation={
              selectedFleetItem?.activeJob?.start_latitude && selectedFleetItem?.activeJob?.start_longitude
                ? {
                    latitude: selectedFleetItem.activeJob.start_latitude,
                    longitude: selectedFleetItem.activeJob.start_longitude,
                  }
                : null
            }
            clientLocation={
              selectedFleetItem?.activeJob?.client?.latitude && selectedFleetItem?.activeJob?.client?.longitude
                ? {
                    latitude: selectedFleetItem.activeJob.client.latitude,
                    longitude: selectedFleetItem.activeJob.client.longitude,
                  }
                : null
            }
            clientName={selectedFleetItem?.activeJob?.client?.client_name}
            clientAddress={selectedFleetItem?.activeJob?.client?.address}
            engineerName={selectedFleetItem?.engineer.full_name}
            routeLogs={selectedFleetItem?.routeLogs || []}
            status={selectedFleetItem?.status}
            height="520px"
          />

          {/* Selected Engineer Quick Strip */}
          {selectedFleetItem && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-lg shadow-md">
                  {selectedFleetItem.engineer.full_name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-slate-900 text-base">{selectedFleetItem.engineer.full_name}</p>
                    <span
                      className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase ${
                        selectedFleetItem.status === 'traveling'
                          ? 'bg-blue-100 text-blue-700 border border-blue-200'
                          : selectedFleetItem.status === 'reached'
                          ? 'bg-amber-100 text-amber-700 border border-amber-200'
                          : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {selectedFleetItem.statusLabel}
                    </span>
                  </div>
                  {selectedFleetItem.activeJob ? (
                    <p className="text-xs text-slate-600 mt-0.5">
                      On-Call: <strong>Job #{selectedFleetItem.activeJob.job_number}</strong> ➔ Client:{' '}
                      <strong>{selectedFleetItem.activeJob.client?.client_name}</strong>
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 mt-0.5">No active travel job (Standing by / Available)</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {selectedFleetItem.engineer.phone && (
                  <a
                    href={`tel:${selectedFleetItem.engineer.phone}`}
                    className="flex items-center gap-1 rounded-xl bg-white border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
                  >
                    <Phone className="h-3.5 w-3.5 text-green-600" /> Call Engineer
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedEngineerId(null)}
                  className="flex items-center gap-1 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 shadow-sm"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to All Engineers
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: Engineers List */}
        <div className="space-y-3">
          {/* Tab Switcher */}
          <div className="flex rounded-xl bg-slate-200/80 p-1">
            <button
              type="button"
              onClick={() => setFilterTab('all')}
              className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition ${
                filterTab === 'all'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Engineers ({fleetList.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('traveling')}
              className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition ${
                filterTab === 'traveling'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              On-Call / Active ({activeTravelingCount})
            </button>
          </div>

          <div className="space-y-2.5 max-h-[580px] overflow-y-auto pr-1">
            {displayedFleet.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                <Users className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                <p className="text-xs font-semibold text-slate-600">No engineers matching filter</p>
              </div>
            ) : (
              displayedFleet.map((item) => {
                const isSelected = selectedEngineerId === item.engineer.id;
                const isTraveling = item.status === 'traveling';
                const isReached = item.status === 'reached';

                return (
                  <div
                    key={item.engineer.id}
                    onClick={() => setSelectedEngineerId(item.engineer.id)}
                    className={`cursor-pointer rounded-2xl border p-3.5 transition-all duration-200 shadow-sm ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm ${
                            isTraveling ? 'bg-blue-600' : isReached ? 'bg-amber-600' : 'bg-emerald-600'
                          }`}
                        >
                          {item.engineer.full_name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{item.engineer.full_name}</p>
                          {item.engineer.phone && (
                            <p className="text-[11px] text-slate-400">{item.engineer.phone}</p>
                          )}
                        </div>
                      </div>

                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          isTraveling
                            ? 'bg-blue-100 text-blue-700 border border-blue-200'
                            : isReached
                            ? 'bg-amber-100 text-amber-700 border border-amber-200'
                            : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {item.statusLabel}
                      </span>
                    </div>

                    {item.activeJob && (
                      <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100 text-xs mt-2">
                        <p className="font-bold text-slate-800">
                          {item.activeJob.job_number} — {item.activeJob.issue_title}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          To: <strong>{item.activeJob.client?.client_name}</strong> ({item.activeJob.client?.city})
                        </p>
                      </div>
                    )}

                    <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1 font-mono">
                        <MapPin className="h-3 w-3 text-blue-600" />
                        {item.location.latitude.toFixed(4)}, {item.location.longitude.toFixed(4)}
                      </span>
                      {item.lastSeen && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-slate-400" /> {item.lastSeen}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex justify-end">
                      <span className="text-xs font-bold text-blue-600 hover:underline">
                        {isTraveling ? '🗺️ View Route & Track →' : '📍 View Location on Map →'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
