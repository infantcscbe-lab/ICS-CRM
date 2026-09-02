import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { AdminNotification, ServiceJob, Profile } from '@/types/database';
import { getAdminNotifications } from '@/lib/notifications';
import {
  ClipboardList,
  CalendarPlus,
  Clock,
  CheckCircle2,
  AlertCircle,
  Phone,
  User,
  MapPin,
  Calendar,
  Wrench,
  Car,
  Search,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  Zap,
  Cpu,
} from 'lucide-react';
import { formatKm } from '@/lib/distance';

interface ClientCallsProps {
  onBookCall?: () => void;
}

export function ClientCalls({ onBookCall }: ClientCallsProps) {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<AdminNotification[]>([]);
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [engineers, setEngineers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabFilter, setTabFilter] = useState<'all' | 'active' | 'pending' | 'completed'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadClientData();

    const handleUpdate = () => loadClientData();
    window.addEventListener('ics-notifications-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    const ch1 = supabase
      .channel('client-requests-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_notifications' }, () => {
        loadClientData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_jobs' }, () => {
        loadClientData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      window.removeEventListener('ics-notifications-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [profile?.client_id, profile?.phone, profile?.email]);

  async function loadClientData() {
    try {
      // 1. Load online call requests
      let notifs: AdminNotification[] = [];
      try {
        const { data } = await supabase
          .from('admin_notifications')
          .select('*')
          .eq('type', 'call_request')
          .order('created_at', { ascending: false });
        if (data) notifs = data as unknown as AdminNotification[];
      } catch {
        notifs = getAdminNotifications().filter((n) => n.type === 'call_request');
      }

      // Filter to this customer's requests
      const myRequests = notifs.filter((n) => {
        const d = n.data;
        if (!d) return true;
        if (profile?.client_id && d.client_id === profile.client_id) return true;
        if (profile?.phone && d.client_phone && d.client_phone.includes(profile.phone.replace(/\D/g, ''))) return true;
        if (profile?.email && d.client_email && d.client_email.toLowerCase() === profile.email.toLowerCase()) return true;
        return true; // Fallback: show demo requests
      });
      setRequests(myRequests);

      // 2. Load service jobs linked to this client
      try {
        let query = supabase.from('service_jobs').select('*').order('created_at', { ascending: false });
        if (profile?.client_id) {
          query = query.eq('client_id', profile.client_id);
        }
        const { data: jobData } = await query;
        if (jobData) setJobs(jobData as ServiceJob[]);
      } catch {
        // ignore
      }

      // 3. Load engineers for name/contact lookup
      try {
        const { data: engData } = await supabase.from('profiles').select('*').eq('role', 'engineer');
        if (engData) setEngineers(engData as Profile[]);
      } catch {
        // ignore
      }
    } finally {
      setLoading(false);
    }
  }

  // Combined active & historical records
  const allRecords = useMemo(() => {
    // Map existing jobs with their engineer info
    const jobItems = jobs.map((j) => {
      const eng = engineers.find((e) => e.id === j.engineer_id);
      return {
        id: j.id,
        type: 'job' as const,
        jobNumber: j.job_number,
        title: j.issue_title,
        description: j.issue_description,
        deviceId: j.device_id || j.issue_description?.match(/\[Device ID:\s*([^\]]+)\]/)?.[1] || null,
        priority: j.priority,
        status: j.status,
        scheduledDate: j.scheduled_date,
        scheduledTime: j.scheduled_time,
        engineerName: eng?.full_name || 'Assigned Engineer',
        engineerPhone: eng?.phone,
        createdAt: j.created_at,
        totalKm: j.total_km,
        workPerformed: j.work_performed,
        partsReplaced: j.parts_replaced,
      };
    });

    // Map unassigned pending requests from admin_notifications
    const requestItems = requests
      .filter((r) => !r.read && !jobs.some((j) => j.issue_title === r.data?.issue_title))
      .map((r) => ({
        id: r.id,
        type: 'request' as const,
        jobNumber: r.data?.issue_description?.match(/\[Ref:\s*([^\]]+)\]/)?.[1] || 'PENDING',
        title: r.data?.issue_title || r.title,
        description: r.data?.issue_description || r.message,
        deviceId: r.data?.device_id || r.data?.issue_description?.match(/\[Device ID:\s*([^\]]+)\]/)?.[1] || null,
        priority: r.data?.priority || 'medium',
        status: 'pending_admin' as const,
        scheduledDate: r.data?.scheduled_date || new Date(r.created_at).toISOString().split('T')[0],
        scheduledTime: r.data?.scheduled_time || 'Standard Slot',
        engineerName: undefined,
        engineerPhone: undefined,
        createdAt: r.created_at,
        totalKm: null,
        workPerformed: null,
        partsReplaced: null,
      }));

    return [...requestItems, ...jobItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [jobs, requests, engineers]);

  // Filtered by tab and search
  const filteredRecords = useMemo(() => {
    return allRecords.filter((rec) => {
      // Tab filter
      if (tabFilter === 'pending' && rec.status !== 'pending_admin') return false;
      if (tabFilter === 'completed' && rec.status !== 'completed' && rec.status !== 'solved') return false;
      if (
        tabFilter === 'active' &&
        (rec.status === 'completed' || rec.status === 'solved' || rec.status === 'cancelled')
      ) {
        return false;
      }

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = rec.title.toLowerCase().includes(q);
        const matchJobNo = rec.jobNumber.toLowerCase().includes(q);
        const matchEng = rec.engineerName?.toLowerCase().includes(q);
        if (!matchTitle && !matchJobNo && !matchEng) return false;
      }

      return true;
    });
  }, [allRecords, tabFilter, search]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Top Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/10 px-3 py-0.5 text-xs font-bold text-purple-400 border border-purple-500/20 mb-2">
            <ClipboardList className="h-3.5 w-3.5" /> Service Request Tracker
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            My Service Requests & History
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Real-time status of your calibration, breakdown repairs, and maintenance calls.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadClientData}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
            title="Refresh list"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {onBookCall && (
            <button
              type="button"
              onClick={onBookCall}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-blue-600/30 hover:bg-blue-700 transition"
            >
              <CalendarPlus className="h-4 w-4" />
              <span>Book New Call</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex rounded-2xl bg-slate-900 p-1 border border-slate-800 shadow-sm overflow-x-auto">
          {[
            { id: 'all', label: `All Calls (${allRecords.length})` },
            {
              id: 'active',
              label: `Active (${allRecords.filter((r) => r.status !== 'completed' && r.status !== 'solved' && r.status !== 'cancelled').length})`,
            },
            {
              id: 'pending',
              label: `Pending Admin (${allRecords.filter((r) => r.status === 'pending_admin').length})`,
            },
            {
              id: 'completed',
              label: `Completed (${allRecords.filter((r) => r.status === 'completed' || r.status === 'solved').length})`,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTabFilter(tab.id as typeof tabFilter)}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition whitespace-nowrap ${
                tabFilter === tab.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative max-w-xs w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search by issue or job #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-800 bg-slate-900 pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Records List */}
      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center rounded-3xl border border-slate-800 bg-slate-900/60 p-8 text-center text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-500 mr-2" />
          <span className="text-sm font-semibold">Loading your service records...</span>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-3xl border border-slate-800 bg-slate-900/60 p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800 text-slate-500 mb-4">
            <ClipboardList className="h-8 w-8" />
          </div>
          <h3 className="text-base font-bold text-white">No service calls found</h3>
          <p className="mt-1 text-xs text-slate-400 max-w-sm">
            {search
              ? 'No requests match your search criteria. Try a different search term.'
              : 'You have not submitted any service requests yet.'}
          </p>
          {onBookCall && (
            <button
              type="button"
              onClick={onBookCall}
              className="mt-5 flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700 transition"
            >
              <CalendarPlus className="h-4 w-4" />
              <span>Book Your First Service Call</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRecords.map((rec) => {
            const isPendingAdmin = rec.status === 'pending_admin';
            const isAssigned = rec.status === 'assigned';
            const isTraveling = rec.status === 'traveling';
            const isReached = rec.status === 'reached';
            const isInProgress = rec.status === 'in_progress';
            const isSolved = rec.status === 'solved';
            const isCompleted = rec.status === 'completed';

            return (
              <div
                key={rec.id}
                className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6 shadow-xl backdrop-blur-md transition hover:border-slate-700"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-slate-800 px-2.5 py-1 font-mono text-xs font-bold text-blue-400 border border-slate-700">
                        {rec.jobNumber}
                      </span>

                      {/* Priority Tag */}
                      <span
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          rec.priority === 'urgent'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : rec.priority === 'high'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        {rec.priority} Priority
                      </span>

                      {rec.deviceId && (
                        <span className="rounded-lg bg-purple-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-purple-300 border border-purple-500/30 flex items-center gap-1">
                          <Cpu className="h-3 w-3 text-purple-400" /> Device: {rec.deviceId}
                        </span>
                      )}

                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {rec.scheduledDate} ({rec.scheduledTime.split('(')[0].trim()})
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-white pt-1">{rec.title}</h3>
                  </div>

                  {/* Overall Status Badge */}
                  <div>
                    {isPendingAdmin && (
                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/20 px-3.5 py-1.5 text-xs font-bold text-amber-300 border border-amber-500/40">
                        <Clock className="h-3.5 w-3.5 animate-spin" /> Pending Admin Assignment
                      </span>
                    )}
                    {isAssigned && (
                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-blue-500/20 px-3.5 py-1.5 text-xs font-bold text-blue-300 border border-blue-500/40">
                        <User className="h-3.5 w-3.5" /> Engineer Assigned
                      </span>
                    )}
                    {isTraveling && (
                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500/20 px-3.5 py-1.5 text-xs font-bold text-cyan-300 border border-cyan-500/40 animate-pulse">
                        <Car className="h-3.5 w-3.5" /> Engineer Traveling to Site
                      </span>
                    )}
                    {(isReached || isInProgress) && (
                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-purple-500/20 px-3.5 py-1.5 text-xs font-bold text-purple-300 border border-purple-500/40">
                        <Wrench className="h-3.5 w-3.5" /> In Service at Site
                      </span>
                    )}
                    {(isSolved || isCompleted) && (
                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/20 px-3.5 py-1.5 text-xs font-bold text-emerald-300 border border-emerald-500/40">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Service Completed
                      </span>
                    )}
                  </div>
                </div>

                {/* Live Progress Stepper Bar */}
                <div className="py-4 border-b border-slate-800/80">
                  <div className="grid grid-cols-4 gap-2 text-center text-[11px] font-semibold">
                    {/* Step 1 */}
                    <div className="flex flex-col items-center">
                      <div
                        className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold mb-1 ${
                          !isPendingAdmin
                            ? 'bg-emerald-500 text-white'
                            : 'bg-amber-500 text-slate-900 ring-4 ring-amber-500/20'
                        }`}
                      >
                        1
                      </div>
                      <span className={!isPendingAdmin ? 'text-emerald-400' : 'text-amber-300 font-bold'}>
                        Requested
                      </span>
                    </div>

                    {/* Step 2 */}
                    <div className="flex flex-col items-center">
                      <div
                        className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold mb-1 ${
                          isAssigned || isTraveling || isReached || isInProgress || isSolved || isCompleted
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        2
                      </div>
                      <span
                        className={
                          isAssigned || isTraveling || isReached || isInProgress || isSolved || isCompleted
                            ? 'text-emerald-400'
                            : 'text-slate-500'
                        }
                      >
                        Assigned
                      </span>
                    </div>

                    {/* Step 3 */}
                    <div className="flex flex-col items-center">
                      <div
                        className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold mb-1 ${
                          isTraveling
                            ? 'bg-cyan-500 text-white ring-4 ring-cyan-500/20 animate-pulse'
                            : isReached || isInProgress || isSolved || isCompleted
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        3
                      </div>
                      <span
                        className={
                          isTraveling
                            ? 'text-cyan-300 font-bold'
                            : isReached || isInProgress || isSolved || isCompleted
                            ? 'text-emerald-400'
                            : 'text-slate-500'
                        }
                      >
                        Traveling / Site
                      </span>
                    </div>

                    {/* Step 4 */}
                    <div className="flex flex-col items-center">
                      <div
                        className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold mb-1 ${
                          isSolved || isCompleted
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        4
                      </div>
                      <span className={isSolved || isCompleted ? 'text-emerald-400' : 'text-slate-500'}>
                        Completed
                      </span>
                    </div>
                  </div>
                </div>

                {/* Details Section */}
                <div className="pt-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="text-xs text-slate-300 space-y-1">
                    <p className="line-clamp-2 text-slate-400">{rec.description}</p>

                    {rec.engineerName && (
                      <div className="flex items-center gap-3 pt-1 text-slate-200">
                        <span className="flex items-center gap-1 font-bold text-white">
                          <User className="h-3.5 w-3.5 text-blue-400" />
                          Assigned Engineer: {rec.engineerName}
                        </span>
                        {rec.engineerPhone && (
                          <a
                            href={`tel:${rec.engineerPhone}`}
                            className="flex items-center gap-1 text-blue-400 hover:underline font-semibold"
                          >
                            <Phone className="h-3 w-3" /> Call Engineer ({rec.engineerPhone})
                          </a>
                        )}
                      </div>
                    )}

                    {rec.workPerformed && (
                      <div className="pt-1 text-[11px] text-slate-300">
                        <strong className="text-emerald-400">Work Done:</strong> {rec.workPerformed}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                    <a
                      href="tel:+919876543210"
                      className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
                    >
                      <Phone className="h-3 w-3 text-blue-400" />
                      <span>Support Hotline</span>
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

