import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { ServiceJob, JobLocationLog, Client, Profile, DutyAttendance } from '@/types/database';
import {
  MapPin,
  Navigation,
  Clock,
  Phone,
  Car,
  RefreshCw,
  Users,
  ArrowLeft,
  Search,
  Radio,
  Building2,
  ExternalLink,
  X,
  Sparkles,
} from 'lucide-react';
import { LiveTrackingMap, type FleetEngineerLocation } from '@/components/maps/LiveTrackingMap';

interface EngineerFleetState {
  engineer: Profile;
  status: 'traveling' | 'reached' | 'in_progress' | 'on_duty' | 'punched_out' | 'idle' | 'offline';
  statusLabel: string;
  location: { latitude: number; longitude: number };
  lastSeen?: string;
  isLiveTracking?: boolean;
  activeJob?: ServiceJob | null;
  routeLogs: JobLocationLog[];
}

export function AdminTracking() {
  const [fleetList, setFleetList] = useState<EngineerFleetState[]>([]);
  const [selectedEngineerId, setSelectedEngineerId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'on_duty' | 'traveling' | 'reached' | 'idle'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

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

      // Build fleet state for each engineer
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
        } else if (attendance?.status === 'on_duty' || attendance?.status === 'present' || attendance?.status === 'late') {
          status = 'on_duty';
          statusLabel = 'On Duty (Logged In)';
        } else if (attendance?.status === 'punched_out') {
          status = 'punched_out';
          statusLabel = 'Punched Out';
        }

        // Determine latest coordinates & last seen time
        let lat = 11.0168; // Default Coimbatore Center
        let lng = 76.9558;
        let lastSeen: string | undefined = undefined;
        let isLiveTracking = false;

        // Priority 1: Active job location logs (sent every few seconds while traveling)
        if (engineerLogs.length > 0) {
          const latest = engineerLogs[engineerLogs.length - 1];
          lat = latest.latitude;
          lng = latest.longitude;
          lastSeen = new Date(latest.recorded_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });
          isLiveTracking = true;
        }
        // Priority 2: Real-time on-duty location sent continuously from punch-in
        else if (attendance?.admin_notes && attendance.admin_notes.startsWith('LIVE_GPS:')) {
          try {
            const parsed = JSON.parse(attendance.admin_notes.slice(9));
            if (parsed.lat && parsed.lng) {
              lat = parsed.lat;
              lng = parsed.lng;
              lastSeen = new Date(parsed.updated_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });
              isLiveTracking = true;
            }
          } catch {}
        }
        // Priority 3: Initial punch-in coordinates from morning attendance
        else if (attendance?.punch_in_latitude && attendance?.punch_in_longitude) {
          lat = attendance.punch_in_latitude;
          lng = attendance.punch_in_longitude;
          lastSeen = attendance.punch_in_at
            ? new Date(attendance.punch_in_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : undefined;
          isLiveTracking = attendance.status === 'on_duty' || attendance.status === 'late';
        }
        // Priority 4: Active job start position
        else if (activeJob?.start_latitude && activeJob?.start_longitude) {
          lat = activeJob.start_latitude;
          lng = activeJob.start_longitude;
        }

        // Only include logs for the current active job if on-call
        const jobLogs = activeJob ? engineerLogs.filter((l) => l.job_id === activeJob.id) : [];

        return {
          engineer: eng,
          status,
          statusLabel,
          location: { latitude: lat, longitude: lng },
          lastSeen,
          isLiveTracking,
          activeJob,
          routeLogs: jobLogs,
        };
      });

      setFleetList(fleet);
      setLastRefreshedAt(new Date());
    } catch (err) {
      console.error('Error loading fleet tracking:', err);
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  }

  // Fleet Statistics
  const stats = useMemo(() => {
    const total = fleetList.length;
    const traveling = fleetList.filter((f) => f.status === 'traveling').length;
    const reached = fleetList.filter((f) => f.status === 'reached' || f.status === 'in_progress').length;
    const onDuty = fleetList.filter(
      (f) => f.status === 'on_duty' || f.status === 'traveling' || f.status === 'reached' || f.status === 'in_progress'
    ).length;
    const idle = fleetList.filter((f) => f.status === 'idle' || f.status === 'punched_out' || f.status === 'offline').length;
    return { total, traveling, reached, onDuty, idle };
  }, [fleetList]);

  // Filtered engineers for sidebar
  const displayedFleet = useMemo(() => {
    let list = fleetList;

    if (filterTab === 'traveling') {
      list = list.filter((f) => f.status === 'traveling');
    } else if (filterTab === 'on_duty') {
      list = list.filter(
        (f) => f.status === 'on_duty' || f.status === 'traveling' || f.status === 'reached' || f.status === 'in_progress'
      );
    } else if (filterTab === 'reached') {
      list = list.filter((f) => f.status === 'reached' || f.status === 'in_progress');
    } else if (filterTab === 'idle') {
      list = list.filter((f) => f.status === 'idle' || f.status === 'punched_out');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (f) =>
          f.engineer.full_name.toLowerCase().includes(q) ||
          f.engineer.phone?.toLowerCase().includes(q) ||
          f.activeJob?.job_number.toLowerCase().includes(q) ||
          f.activeJob?.client?.client_name.toLowerCase().includes(q)
      );
    }

    return list;
  }, [fleetList, filterTab, searchQuery]);

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

  if (loading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-sm font-semibold text-slate-600">Connecting to live fleet GPS...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── Top Dispatch Header ─── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Radio className="h-6 w-6 text-blue-600 animate-pulse" />
              Fleet Live Tracking Dispatch
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping"></span>
              Realtime Sync Active
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {isOverviewMode
              ? `Real-time GPS tracking across ${fleetList.length} service engineers`
              : `Tracking active route & checkpoints for ${selectedFleetItem?.engineer.full_name}`}
          </p>
        </div>

        {/* Global Action Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm transition disabled:opacity-60"
            title={`Last updated: ${lastRefreshedAt.toLocaleTimeString()}`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh GPS'}</span>
          </button>

          {!isOverviewMode && (
            <button
              onClick={() => setSelectedEngineerId(null)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800 shadow-sm transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>All Engineers Overview</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── Fleet KPI Metrics Strip ─── */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        <div
          onClick={() => {
            setFilterTab('all');
            setSelectedEngineerId(null);
          }}
          className={`cursor-pointer rounded-2xl border p-3 transition-all ${
            filterTab === 'all'
              ? 'border-blue-500 bg-blue-50/70 shadow-sm ring-1 ring-blue-400/40'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Fleet</span>
            <Users className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-1 text-xl font-black text-slate-900">{stats.total}</p>
          <p className="text-[10px] text-slate-400 font-medium">Registered Engineers</p>
        </div>

        <div
          onClick={() => {
            setFilterTab('on_duty');
            setSelectedEngineerId(null);
          }}
          className={`cursor-pointer rounded-2xl border p-3 transition-all ${
            filterTab === 'on_duty'
              ? 'border-emerald-500 bg-emerald-50/70 shadow-sm ring-1 ring-emerald-400/40'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-600">
            <span className="text-[11px] font-bold uppercase tracking-wider">On Duty</span>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
          </div>
          <p className="mt-1 text-xl font-black text-emerald-700">{stats.onDuty}</p>
          <p className="text-[10px] text-emerald-600/80 font-medium">Punched In & Active</p>
        </div>

        <div
          onClick={() => {
            setFilterTab('traveling');
            setSelectedEngineerId(null);
          }}
          className={`cursor-pointer rounded-2xl border p-3 transition-all ${
            filterTab === 'traveling'
              ? 'border-blue-600 bg-blue-50/70 shadow-sm ring-1 ring-blue-500/40'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-blue-600">
            <span className="text-[11px] font-bold uppercase tracking-wider">In Transit</span>
            <Car className="h-4 w-4 text-blue-600 animate-pulse" />
          </div>
          <p className="mt-1 text-xl font-black text-blue-700">{stats.traveling}</p>
          <p className="text-[10px] text-blue-600/80 font-medium">Traveling to Client</p>
        </div>

        <div
          onClick={() => {
            setFilterTab('reached');
            setSelectedEngineerId(null);
          }}
          className={`cursor-pointer rounded-2xl border p-3 transition-all ${
            filterTab === 'reached'
              ? 'border-amber-500 bg-amber-50/70 shadow-sm ring-1 ring-amber-400/40'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-amber-600">
            <span className="text-[11px] font-bold uppercase tracking-wider">At Client</span>
            <Building2 className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-1 text-xl font-black text-amber-700">{stats.reached}</p>
          <p className="text-[10px] text-amber-600/80 font-medium">Working on Service</p>
        </div>

        <div
          onClick={() => {
            setFilterTab('idle');
            setSelectedEngineerId(null);
          }}
          className={`col-span-2 sm:col-span-1 cursor-pointer rounded-2xl border p-3 transition-all ${
            filterTab === 'idle'
              ? 'border-slate-400 bg-slate-100 shadow-sm ring-1 ring-slate-400/40'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Standing By</span>
            <Clock className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-1 text-xl font-black text-slate-800">{stats.idle}</p>
          <p className="text-[10px] text-slate-400 font-medium">Idle / Available</p>
        </div>
      </div>

      {/* ─── Main Content Grid: Map + Interactive Fleet Drawer ─── */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* Map Section (8 Cols on Desktop) */}
        <div className="lg:col-span-8 flex flex-col space-y-3">
          <div className="relative rounded-2xl overflow-hidden shadow-lg border border-slate-300">
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
              height="580px"
            />
          </div>

          {/* Focused Engineer Trip Card (When single engineer is selected) */}
          {selectedFleetItem && (
            <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/90 via-indigo-50/60 to-white p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-in fade-in duration-200">
              <div className="flex items-center gap-3">
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white font-black text-lg shadow-md">
                  {selectedFleetItem.engineer.full_name.charAt(0)}
                  <span
                    className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white ${
                      selectedFleetItem.status === 'traveling'
                        ? 'bg-blue-500 animate-pulse'
                        : selectedFleetItem.status === 'reached'
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                  ></span>
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-base font-extrabold text-slate-900">{selectedFleetItem.engineer.full_name}</p>
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase ${
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
                    <p className="text-xs text-slate-600 mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-blue-900">Job #{selectedFleetItem.activeJob.job_number}</span>
                      <span className="text-slate-400">➔</span>
                      <span>{selectedFleetItem.activeJob.client?.client_name}</span>
                      {selectedFleetItem.activeJob.client?.city && (
                        <span className="text-slate-500 font-medium">({selectedFleetItem.activeJob.client.city})</span>
                      )}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {selectedFleetItem.status === 'on_duty'
                        ? 'Punched In • Standing by for assignment'
                        : 'Available / Standing by'}
                    </p>
                  )}

                  <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                    <span>
                      GPS: {selectedFleetItem.location.latitude.toFixed(4)},{' '}
                      {selectedFleetItem.location.longitude.toFixed(4)}
                    </span>
                    {selectedFleetItem.lastSeen && <span>• Updated: {selectedFleetItem.lastSeen}</span>}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                {selectedFleetItem.engineer.phone && (
                  <a
                    href={`tel:${selectedFleetItem.engineer.phone}`}
                    className="inline-flex items-center gap-1 rounded-xl bg-white border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm transition"
                  >
                    <Phone className="h-3.5 w-3.5 text-emerald-600" /> Call
                  </a>
                )}

                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${selectedFleetItem.location.latitude},${selectedFleetItem.location.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-xl bg-white border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm transition"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-blue-600" /> Google Maps
                </a>

                <button
                  type="button"
                  onClick={() => setSelectedEngineerId(null)}
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 shadow-sm transition"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> All Fleet
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Fleet Engineers Sidebar (4 Cols on Desktop) */}
        <div className="lg:col-span-4 flex flex-col space-y-3">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search engineers, phone, job #..."
              className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-8 text-xs font-medium text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Quick Filter Tabs */}
          <div className="flex flex-wrap gap-1 rounded-xl bg-slate-200/80 p-1">
            <button
              type="button"
              onClick={() => setFilterTab('all')}
              className={`flex-1 rounded-lg py-1.5 text-[11px] font-bold transition text-center ${
                filterTab === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({fleetList.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('on_duty')}
              className={`flex-1 rounded-lg py-1.5 text-[11px] font-bold transition text-center ${
                filterTab === 'on_duty' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              On Duty ({stats.onDuty})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('traveling')}
              className={`flex-1 rounded-lg py-1.5 text-[11px] font-bold transition text-center ${
                filterTab === 'traveling' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Trips ({stats.traveling})
            </button>
          </div>

          {/* Engineers List */}
          <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
            {displayedFleet.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <Users className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                <p className="text-xs font-semibold text-slate-600">No engineers match this filter</p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="mt-2 text-xs font-bold text-blue-600 hover:underline"
                  >
                    Clear Search
                  </button>
                )}
              </div>
            ) : (
              displayedFleet.map((item) => {
                const isSelected = selectedEngineerId === item.engineer.id;
                const isTraveling = item.status === 'traveling';
                const isReached = item.status === 'reached';
                const isOnDuty = item.status === 'on_duty';

                return (
                  <div
                    key={item.engineer.id}
                    onClick={() => setSelectedEngineerId(item.engineer.id)}
                    className={`group cursor-pointer rounded-2xl border p-3.5 transition-all duration-200 shadow-sm ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/80 ring-2 ring-blue-500/20 shadow-md'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black text-white shadow-sm ${
                            isTraveling ? 'bg-blue-600' : isReached ? 'bg-amber-600' : isOnDuty ? 'bg-emerald-600' : 'bg-slate-600'
                          }`}
                        >
                          {item.engineer.full_name.charAt(0)}
                          {item.isLiveTracking && (
                            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 border border-white"></span>
                            </span>
                          )}
                        </div>

                        <div>
                          <p className="font-extrabold text-slate-900 text-sm group-hover:text-blue-600 transition leading-snug">
                            {item.engineer.full_name}
                          </p>
                          {item.engineer.phone && (
                            <p className="text-[11px] text-slate-400 font-medium">{item.engineer.phone}</p>
                          )}
                        </div>
                      </div>

                      <span
                        className={`text-[9px] px-2 py-0.5 rounded-full font-extrabold uppercase shrink-0 ${
                          isTraveling
                            ? 'bg-blue-100 text-blue-700 border border-blue-200'
                            : isReached
                            ? 'bg-amber-100 text-amber-700 border border-amber-200'
                            : isOnDuty
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {item.statusLabel}
                      </span>
                    </div>

                    {/* Active Job Callout */}
                    {item.activeJob ? (
                      <div className="mt-2.5 rounded-xl bg-blue-50/80 p-2.5 border border-blue-100 text-xs">
                        <p className="font-bold text-blue-900 flex items-center gap-1">
                          <Car className="h-3 w-3 text-blue-600" />
                          Job #{item.activeJob.job_number}
                        </p>
                        <p className="text-[11px] text-slate-600 mt-0.5 truncate">
                          To: <strong>{item.activeJob.client?.client_name}</strong>
                          {item.activeJob.client?.city ? ` (${item.activeJob.client.city})` : ''}
                        </p>
                      </div>
                    ) : isOnDuty ? (
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium bg-emerald-50/60 rounded-lg px-2 py-1 border border-emerald-100">
                        <Sparkles className="h-3 w-3 text-emerald-500" />
                        <span>Punched In • Live GPS Active</span>
                      </div>
                    ) : null}

                    {/* Footer Info: Coordinates & Last Seen */}
                    <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500 font-mono">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-blue-500" />
                        {item.location.latitude.toFixed(4)}, {item.location.longitude.toFixed(4)}
                      </span>
                      {item.lastSeen && (
                        <span className="flex items-center gap-1 text-slate-400 font-sans text-[10px]">
                          <Clock className="h-2.5 w-2.5" /> {item.lastSeen}
                        </span>
                      )}
                    </div>

                    {/* Quick Call & Focus Button */}
                    <div className="mt-2 flex items-center justify-between pt-1">
                      {item.engineer.phone ? (
                        <a
                          href={`tel:${item.engineer.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-700"
                        >
                          <Phone className="h-3 w-3" /> Call
                        </a>
                      ) : (
                        <span></span>
                      )}

                      <span className="text-xs font-bold text-blue-600 group-hover:underline flex items-center gap-1">
                        {isTraveling ? '🗺️ View Route →' : '📍 Focus Map →'}
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
