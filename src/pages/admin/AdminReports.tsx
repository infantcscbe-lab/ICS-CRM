import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { ServiceJob, Profile, Client, DutyAttendance, TravelAllowanceConfig } from '@/types/database';
import { Download, BarChart3, IndianRupee, Settings, ShieldCheck, Clock, Route } from 'lucide-react';
import { formatKm, formatDuration } from '@/lib/distance';
import {
  getAllAttendances,
  getTravelAllowanceConfig,
  saveTravelAllowanceConfig,
} from '@/lib/attendance';

type DateRange = 'today' | 'week' | 'month' | 'custom';

export function AdminReports() {
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [engineers, setEngineers] = useState<Profile[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [attendances, setAttendances] = useState<DutyAttendance[]>([]);
  const [travelConfig, setTravelConfig] = useState<TravelAllowanceConfig>(getTravelAllowanceConfig());
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [editRate, setEditRate] = useState(travelConfig.rate_per_km.toString());
  const [editBase, setEditBase] = useState(travelConfig.daily_base_allowance.toString());
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DateRange>('today');
  const [customStart, setCustomStart] = useState(new Date().toISOString().split('T')[0]);
  const [customEnd, setCustomEnd] = useState(new Date().toISOString().split('T')[0]);
  const [engFilter, setEngFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: jData }, { data: eData }, { data: cData }] = await Promise.all([
      supabase.from('service_jobs').select('*, client:clients(*), engineer:profiles(*)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('role', 'engineer').order('full_name'),
      supabase.from('clients').select('*').order('client_name'),
    ]);

    const dbJobs = (jData as unknown as ServiceJob[]) || [];
    const localJobs = JSON.parse(localStorage.getItem('custom_local_jobs') || '[]') as ServiceJob[];
    const dbClients = (cData as unknown as Client[]) || [];
    const localClients = JSON.parse(localStorage.getItem('custom_local_clients') || '[]') as Client[];
    const dbEng = (eData as unknown as Profile[]) || [];
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

    setClients(Array.from(clientMap.values()));
    setEngineers(Array.from(engMap.values()));
    setJobs(Array.from(jobMap.values()));
    setAttendances(getAllAttendances());
    setLoading(false);
  }

  const dateBounds = useMemo(() => {
    const today = new Date();
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);

    if (range === 'week') {
      start.setDate(start.getDate() - 6);
    } else if (range === 'month') {
      start.setMonth(start.getMonth() - 1);
    } else if (range === 'custom') {
      start.setTime(new Date(customStart).getTime());
      end.setTime(new Date(customEnd).getTime() + 86400000 - 1);
    }
    return { start, end };
  }, [range, customStart, customEnd]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      const jobDate = new Date(j.scheduled_date).getTime();
      if (jobDate < dateBounds.start.getTime() || jobDate > dateBounds.end.getTime()) return false;
      if (engFilter !== 'all' && j.engineer_id !== engFilter) return false;
      if (clientFilter !== 'all' && j.client_id !== clientFilter) return false;
      if (statusFilter !== 'all') {
        if (statusFilter === 'in_progress') {
          if (!['reached', 'in_progress', 'solved'].includes(j.status)) return false;
        } else if (j.status !== statusFilter) {
          return false;
        }
      }
      return true;
    });
  }, [jobs, dateBounds, engFilter, clientFilter, statusFilter]);

  const stats = useMemo(() => {
    const total = filteredJobs.length;
    const completed = filteredJobs.filter((j) => j.status === 'completed');
    const pending = filteredJobs.filter((j) => j.status === 'assigned' || j.status === 'traveling' || j.status === 'reached' || j.status === 'in_progress' || j.status === 'solved' || j.status === 'call_back' || j.status === 'vendor');
    const cancelled = filteredJobs.filter((j) => j.status === 'cancelled');
    const totalKm = completed.reduce((s, j) => s + (j.total_km ?? 0), 0);
    const avgKm = completed.length > 0 ? totalKm / completed.length : 0;

    const perEngineer: Record<string, { name: string; count: number; km: number }> = {};
    filteredJobs.forEach((j) => {
      const name = j.engineer?.full_name ?? 'Unassigned';
      if (!perEngineer[j.engineer_id ?? 'none']) perEngineer[j.engineer_id ?? 'none'] = { name, count: 0, km: 0 };
      perEngineer[j.engineer_id ?? 'none'].count++;
      if (j.status === 'completed') perEngineer[j.engineer_id ?? 'none'].km += (j.total_km ?? 0);
    });

    return { total, completed: completed.length, pending: pending.length, cancelled: cancelled.length, totalKm, avgKm, perEngineer: Object.values(perEngineer) };
  }, [filteredJobs]);

  function exportCsv() {
    const headers = ['Job No', 'Client', 'Engineer', 'Issue', 'Priority', 'Status', 'Scheduled Date', 'Travel KM', 'Travel Duration (On Call -> Client)', 'In-Client Service Duration', 'Created At'];
    const rows = filteredJobs.map((j) => [
      j.job_number,
      j.client?.client_name ?? '',
      j.engineer?.full_name ?? '',
      j.issue_title,
      j.priority,
      j.status === 'traveling' ? 'On Call' : j.status === 'reached' || j.status === 'in_progress' || j.status === 'solved' ? 'In Client Place' : j.status,
      j.scheduled_date,
      j.total_km ?? '',
      j.travel_started_at ? formatDuration(j.travel_started_at, j.reached_at) : '—',
      j.reached_at ? formatDuration(j.reached_at, j.completed_at) : '—',
      new Date(j.created_at).toISOString(),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `service-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><p className="text-slate-500">Loading reports...</p></div>;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <button onClick={exportCsv} className="flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2.5 font-semibold text-white hover:bg-slate-800">
          <Download className="h-5 w-5" /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {(['today', 'week', 'month', 'custom'] as DateRange[]).map((r) => (
              <button key={r} onClick={() => setRange(r)} className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${range === r ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'}`}>
                {r === 'today' ? 'Today' : r === 'week' ? 'This Week' : r === 'month' ? 'This Month' : 'Custom'}
              </button>
            ))}
          </div>
          {range === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500" />
              <span className="text-slate-400">to</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500" />
            </div>
          )}
          <select value={engFilter} onChange={(e) => setEngFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500">
            <option value="all">All Engineers</option>
            {engineers.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500">
            <option value="all">All Clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.client_name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500">
            <option value="all">All Statuses</option>
            <option value="assigned">Assigned</option>
            <option value="traveling">On Call</option>
            <option value="in_progress">In Client Place</option>
            <option value="vendor">Vendor</option>
            <option value="call_back">Call Back</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Total Jobs</p>
          <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Completed</p>
          <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Pending</p>
          <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Cancelled</p>
          <p className="text-2xl font-bold text-red-600">{stats.cancelled}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Total KM</p>
          <p className="text-2xl font-bold text-slate-900">{formatKm(stats.totalKm)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Avg KM/Job</p>
          <p className="text-2xl font-bold text-slate-900">{formatKm(stats.avgKm)}</p>
        </div>
      </div>

      {/* Jobs per engineer */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase text-slate-500"><BarChart3 className="h-4 w-4" /> Jobs per Engineer</h2>
        {stats.perEngineer.length === 0 ? (
          <p className="text-sm text-slate-400">No data for selected filters</p>
        ) : (
          <div className="space-y-3">
            {stats.perEngineer.map((e, i) => (
              <div key={i} className="flex items-center gap-4">
                <span className="w-32 truncate text-sm font-medium text-slate-700">{e.name}</span>
                <div className="flex-1">
                  <div className="h-6 rounded bg-slate-100">
                    <div className="flex h-6 items-center rounded bg-blue-500 px-2 text-xs font-semibold text-white" style={{ width: `${Math.max((e.count / stats.total) * 100, 8)}%` }}>
                      {e.count} jobs
                    </div>
                  </div>
                </div>
                <span className="w-20 text-right text-sm text-slate-600">{formatKm(e.km)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* greytHR Field Attendance & Daily Travel Claims Table */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-indigo-600" />
            <div>
              <h2 className="text-sm font-bold uppercase text-slate-800">
                greytHR Field Duty & Daily Travel Claims
              </h2>
              <p className="text-xs text-slate-500">
                Daily swipe-in/out attendance, field working hours & automated travel allowances
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowConfigModal(true)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition shadow-sm"
          >
            <Settings className="h-3.5 w-3.5 text-slate-500" />
            <span>Configure Rates (₹{travelConfig.rate_per_km}/KM)</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Engineer</th>
                <th className="px-4 py-3 font-semibold">Swipe In</th>
                <th className="px-4 py-3 font-semibold">Swipe Out</th>
                <th className="px-4 py-3 font-semibold">Duty Duration</th>
                <th className="px-4 py-3 font-semibold">Field KM</th>
                <th className="px-4 py-3 font-semibold">Travel Claim</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attendances.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-xs text-slate-400">
                    No field attendance punches recorded yet. Engineers can swipe in from the Engineer App.
                  </td>
                </tr>
              ) : (
                attendances.map((att) => {
                  const eng = engineers.find((e) => e.id === att.engineer_id);
                  return (
                    <tr key={att.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{att.date}</td>
                      <td className="px-4 py-3 font-semibold text-blue-700">{eng?.full_name || 'Engineer'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {new Date(att.punch_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {att.punch_out_at
                          ? new Date(att.punch_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700 font-medium">
                        {att.total_work_minutes
                          ? `${Math.floor(att.total_work_minutes / 60)}h ${att.total_work_minutes % 60}m`
                          : att.status === 'on_duty'
                          ? 'Active On-Duty'
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-900">
                        {formatKm(att.total_km || 0)}
                      </td>
                      <td className="px-4 py-3 text-xs font-black text-emerald-700">
                        ₹{att.allowance_claimed || Math.round((travelConfig.daily_base_allowance + (att.total_km || 0) * travelConfig.rate_per_km) * 100) / 100}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            att.status === 'on_duty'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {att.status === 'on_duty' ? '● On Duty' : 'Completed'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Allowance Rate Configuration Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-blue-400" />
                <h3 className="font-bold text-base">Travel Allowance Rates</h3>
              </div>
              <button onClick={() => setShowConfigModal(false)} className="rounded-lg p-1 text-slate-400 hover:text-white">
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4 text-slate-800 text-sm">
              <p className="text-xs text-slate-600">
                Configure company per-KM fuel reimbursement rates and base daily field allowances for engineers.
              </p>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-slate-700">
                  Rate Per KM (₹)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={editRate}
                  onChange={(e) => setEditRate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 font-bold outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-slate-700">
                  Base Daily Allowance (₹)
                </label>
                <input
                  type="number"
                  value={editBase}
                  onChange={(e) => setEditBase(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 font-bold outline-none focus:border-blue-600"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const newConfig = {
                      rate_per_km: parseFloat(editRate) || 6.0,
                      daily_base_allowance: parseFloat(editBase) || 100.0,
                    };
                    saveTravelAllowanceConfig(newConfig);
                    setTravelConfig(newConfig);
                    setShowConfigModal(false);
                  }}
                  className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 shadow-sm"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
