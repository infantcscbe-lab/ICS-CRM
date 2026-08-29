import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { ServiceJob, Profile, Client, Vendor } from '@/types/database';
import {
  Download,
  BarChart3,
  FileText,
  Car,
  Clock,
  MapPin,
  Calendar,
  CheckCircle2,
  Phone,
  User,
  Filter,
  ArrowUpDown,
  ExternalLink,
  Printer,
  TrendingUp,
  AlertTriangle,
  Store,
} from 'lucide-react';
import { formatKm, formatDuration } from '@/lib/distance';
import { downloadCallReportPdf } from '@/lib/emailReport';
import { VendorHandoverReportView } from '@/components/vendors/VendorHandoverReportView';
import jsPDF from 'jspdf';

type DateRange = 'today' | 'week' | 'month' | 'custom';
type ActiveReportTab = 'calls' | 'km_summary' | 'vendor_handover';

interface AdminReportsProps {
  onViewJob?: (job: ServiceJob) => void;
}

export function AdminReports({ onViewJob }: AdminReportsProps) {
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [engineers, setEngineers] = useState<Profile[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveReportTab>('calls');

  // Filters
  const [range, setRange] = useState<DateRange>('today');
  const [customStart, setCustomStart] = useState(new Date().toISOString().split('T')[0]);
  const [customEnd, setCustomEnd] = useState(new Date().toISOString().split('T')[0]);
  const [engFilter, setEngFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [callTypeFilter, setCallTypeFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'direct' | 'online'>('all');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [{ data: jData }, { data: eData }, { data: cData }, { data: vData }] = await Promise.all([
        supabase.from('service_jobs').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').eq('role', 'engineer').order('full_name'),
        supabase.from('clients').select('*').order('client_name'),
        supabase.from('vendors').select('*').eq('is_active', true).order('vendor_name'),
      ]);

      const dbJobs = (jData as unknown as ServiceJob[]) || [];
      const dbClients = (cData as unknown as Client[]) || [];
      const dbEng = (eData as unknown as Profile[]) || [];
      const dbVendors = (vData as unknown as Vendor[]) || [];

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
      setEngineers(dbEng);
      setClients(dbClients);
      setVendors(dbVendors);
    } catch (err) {
      console.error('Failed to load reports data:', err);
    } finally {
      setLoading(false);
    }
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
      if (callTypeFilter !== 'all' && j.call_type !== callTypeFilter) return false;
      if (sourceFilter !== 'all' && (j.call_source || 'direct') !== sourceFilter) return false;
      if (statusFilter !== 'all') {
        if (statusFilter === 'in_progress') {
          if (!['reached', 'in_progress', 'solved'].includes(j.status)) return false;
        } else if (j.status !== statusFilter) {
          return false;
        }
      }
      return true;
    });
  }, [jobs, dateBounds, engFilter, clientFilter, statusFilter, callTypeFilter, sourceFilter]);

  const stats = useMemo(() => {
    const total = filteredJobs.length;
    const completed = filteredJobs.filter((j) => j.status === 'completed');
    const pending = filteredJobs.filter((j) =>
      ['assigned', 'traveling', 'reached', 'in_progress', 'solved', 'call_back', 'vendor'].includes(j.status)
    );
    const cancelled = filteredJobs.filter((j) => j.status === 'cancelled');

    // Separate GPS KM and Manual KM
    const totalGpsKm = filteredJobs.reduce((s, j) => s + (j.gps_distance_km || j.total_km || 0), 0);
    const totalManualKm = filteredJobs.reduce((s, j) => s + (j.total_km || j.gps_distance_km || 0), 0);
    const totalDiffKm = totalManualKm - totalGpsKm;
    const avgKm = total > 0 ? totalManualKm / total : 0;

    // Per Engineer Analytics
    const perEngineer: Record<
      string,
      {
        id: string;
        name: string;
        phone: string;
        totalCalls: number;
        completedCalls: number;
        gpsKm: number;
        manualKm: number;
        diffKm: number;
        totalTravelMinutes: number;
      }
    > = {};

    engineers.forEach((e) => {
      perEngineer[e.id] = {
        id: e.id,
        name: e.full_name,
        phone: e.phone || '',
        totalCalls: 0,
        completedCalls: 0,
        gpsKm: 0,
        manualKm: 0,
        diffKm: 0,
        totalTravelMinutes: 0,
      };
    });

    filteredJobs.forEach((j) => {
      const engId = j.engineer_id || 'unassigned';
      if (!perEngineer[engId]) {
        perEngineer[engId] = {
          id: engId,
          name: j.engineer?.full_name ?? 'Unassigned',
          phone: j.engineer?.phone ?? '',
          totalCalls: 0,
          completedCalls: 0,
          gpsKm: 0,
          manualKm: 0,
          diffKm: 0,
          totalTravelMinutes: 0,
        };
      }
      perEngineer[engId].totalCalls++;
      if (j.status === 'completed') perEngineer[engId].completedCalls++;

      const gKm = j.gps_distance_km || j.total_km || 0;
      const mKm = j.total_km || j.gps_distance_km || 0;
      perEngineer[engId].gpsKm += gKm;
      perEngineer[engId].manualKm += mKm;
      perEngineer[engId].diffKm += mKm - gKm;

      if (j.travel_started_at && j.reached_at) {
        const diffMs = Math.max(0, new Date(j.reached_at).getTime() - new Date(j.travel_started_at).getTime());
        perEngineer[engId].totalTravelMinutes += Math.floor(diffMs / 60000);
      }
    });

    return {
      total,
      completed: completed.length,
      pending: pending.length,
      cancelled: cancelled.length,
      totalGpsKm,
      totalManualKm,
      totalDiffKm,
      avgKm,
      perEngineer: Object.values(perEngineer).filter((e) => e.totalCalls > 0 || engFilter === 'all'),
    };
  }, [filteredJobs, engineers, engFilter]);

  const selectedEngineerObj = engineers.find((e) => e.id === engFilter);

  // Helper function to format Difference KM with sign
  function formatDiffKm(diff: number) {
    const sign = diff > 0 ? '+' : '';
    return `${sign}${diff.toFixed(1)} KM`;
  }

  // Export CSV
  function exportCsv() {
    const headers = [
      'Job Number',
      'Client Name',
      'Client City',
      'Engineer',
      'Assigned By',
      'Call Given By',
      'Issue',
      'Call Type',
      'Status',
      'Scheduled Date',
      'GPS KM',
      'Manual KM',
      'Diff KM (Manual - GPS)',
      'Travel Duration',
      'In-Client Time',
      'Inspection Charge (Rs)',
      'Parts Charge (Rs)',
      'Service Charge (Rs)',
      'Total Amount (Rs)',
      'Payment Mode',
      'Amount Received',
      'Created At',
    ];

    const rows = filteredJobs.map((j) => {
      const isCovered = j.call_type === 'Warranty' || j.call_type === 'ASC';
      const insp = isCovered ? 0 : j.inspection_charge ?? 0;
      const srv = isCovered ? 0 : j.service_charge ?? 0;
      const prt = j.part_charge ?? 0;
      const totalAmount = insp + srv + prt;

      const gKm = j.gps_distance_km || j.total_km || 0;
      const mKm = j.total_km || j.gps_distance_km || 0;
      const dKm = mKm - gKm;

      return [
        j.job_number,
        j.client?.client_name ?? '',
        j.client?.city ?? '',
        j.engineer?.full_name ?? 'Unassigned',
        j.assigned_by_name || j.reassigned_from_name || 'Admin',
        j.call_given_by || '—',
        j.issue_title,
        j.call_type || 'Standard',
        j.status === 'traveling'
          ? 'On Call'
          : j.status === 'reached' || j.status === 'in_progress'
          ? 'In Client Place'
          : j.status,
        j.scheduled_date,
        gKm.toFixed(1),
        mKm.toFixed(1),
        formatDiffKm(dKm),
        j.travel_started_at && j.reached_at ? formatDuration(j.travel_started_at, j.reached_at) : '—',
        j.reached_at ? formatDuration(j.reached_at, j.completed_at) : '—',
        insp,
        prt,
        srv,
        totalAmount,
        j.payment_mode || 'Cash',
        j.amount_received || 'Yes',
        new Date(j.created_at).toISOString(),
      ];
    });

    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const engSlug = selectedEngineerObj ? `-${selectedEngineerObj.full_name.replace(/\s+/g, '_')}` : '';
    a.download = `ICS-Service-Report${engSlug}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Export PDF Report for Selected Engineer / All Engineers
  function exportEngineerSummaryPdf() {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const title = selectedEngineerObj
      ? `ENGINEER SERVICE & KM REPORT - ${selectedEngineerObj.full_name.toUpperCase()}`
      : 'ALL ENGINEERS SERVICE & KM REPORT';

    const rangeLabel =
      range === 'today'
        ? `Today (${new Date().toLocaleDateString('en-IN')})`
        : range === 'week'
        ? 'Last 7 Days'
        : range === 'month'
        ? 'Last 30 Days'
        : `${customStart} to ${customEnd}`;

    // Header Background
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 32, 'F');

    // Brand Title
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('INFANT COMPUTER STORE (ICS)', 105, 12, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Sales: 96266 44490 / Service: 96266 44496 | Podanur, Coimbatore', 105, 18, { align: 'center' });

    doc.setFillColor(37, 99, 235);
    doc.roundedRect(45, 22, 120, 6.5, 2, 2, 'F');
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 105, 26.5, { align: 'center' });

    let y = 40;
    doc.setTextColor(51, 65, 85);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Period: ${rangeLabel}`, 14, y);
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 130, y);

    y += 6;
    // Analytics Card
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, y, 182, 16, 2, 2, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('TOTAL CALLS', 25, y + 5.5, { align: 'center' });
    doc.text('GPS ROAD KM', 62, y + 5.5, { align: 'center' });
    doc.text('MANUAL KM', 100, y + 5.5, { align: 'center' });
    doc.text('KM VARIANCE', 140, y + 5.5, { align: 'center' });
    doc.text('AVG KM / CALL', 175, y + 5.5, { align: 'center' });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(String(stats.total), 25, y + 12.5, { align: 'center' });
    doc.setTextColor(37, 99, 235);
    doc.text(formatKm(stats.totalGpsKm), 62, y + 12.5, { align: 'center' });
    doc.setTextColor(16, 185, 129);
    doc.text(formatKm(stats.totalManualKm), 100, y + 12.5, { align: 'center' });
    doc.setTextColor(stats.totalDiffKm > 3 ? 220 : 15, stats.totalDiffKm > 3 ? 38 : 23, stats.totalDiffKm > 3 ? 38 : 42);
    doc.text(formatDiffKm(stats.totalDiffKm), 140, y + 12.5, { align: 'center' });
    doc.setTextColor(15, 23, 42);
    doc.text(formatKm(stats.avgKm), 175, y + 12.5, { align: 'center' });

    y += 24;

    // Table Header
    doc.setFillColor(15, 23, 42);
    doc.rect(14, y, 182, 6.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('Job #', 16, y + 4.5);
    doc.text('Client Name', 38, y + 4.5);
    doc.text('Engineer', 80, y + 4.5);
    doc.text('GPS KM', 118, y + 4.5);
    doc.text('Manual KM', 142, y + 4.5);
    doc.text('Diff KM', 168, y + 4.5);
    doc.text('Status', 184, y + 4.5);

    y += 6.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);

    filteredJobs.slice(0, 30).forEach((j, idx) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.setFillColor(idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 250, idx % 2 === 0 ? 255 : 252);
      doc.rect(14, y, 182, 6, 'F');

      const gKm = j.gps_distance_km || j.total_km || 0;
      const mKm = j.total_km || j.gps_distance_km || 0;
      const dKm = mKm - gKm;

      doc.setTextColor(15, 23, 42);
      doc.text(j.job_number || 'JOB', 16, y + 4.2);
      doc.text((j.client?.client_name || 'Customer').substring(0, 22), 38, y + 4.2);
      doc.text((j.engineer?.full_name || 'Unassigned').substring(0, 16), 80, y + 4.2);

      doc.text(gKm.toFixed(1), 118, y + 4.2);
      doc.setFont('helvetica', 'bold');
      doc.text(mKm.toFixed(1), 142, y + 4.2);
      doc.text(formatDiffKm(dKm), 168, y + 4.2);
      doc.setFont('helvetica', 'normal');

      const st =
        j.status === 'completed'
          ? 'Done'
          : j.status === 'traveling'
          ? 'On Call'
          : j.status === 'reached'
          ? 'In Client'
          : j.status;
      doc.text(st, 184, y + 4.2);

      y += 6;
    });

    const engSlug = selectedEngineerObj ? `-${selectedEngineerObj.full_name.replace(/\s+/g, '_')}` : '';
    doc.save(`ICS-Engineer-Report${engSlug}-${new Date().toISOString().split('T')[0]}.pdf`);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-slate-500 font-medium">Loading call reports & KM analytics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <FileText className="h-6 w-6 text-blue-600" />
            Service Call & Engineer KM Reports
          </h1>
          <p className="text-sm text-slate-500">
            {selectedEngineerObj
              ? `Filtered for engineer: ${selectedEngineerObj.full_name}`
              : 'Detailed call analytics, GPS vs Manual road KM variance and engineer performance'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedEngineerObj && (
            <button
              onClick={() => setEngFilter('all')}
              className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm"
            >
              <span>Clear Engineer Filter</span>
            </button>
          )}

          <button
            onClick={exportEngineerSummaryPdf}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 shadow-sm transition"
          >
            <Printer className="h-4 w-4" />
            <span>Download Summary PDF</span>
          </button>

          <button
            onClick={exportCsv}
            className="flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white hover:bg-slate-900 shadow-sm transition"
          >
            <Download className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Quick Date Range Buttons */}
          <div className="flex rounded-xl bg-slate-100 p-1">
            {(['today', 'week', 'month', 'custom'] as DateRange[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition ${
                  range === r ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {r === 'today' ? 'Today' : r === 'week' ? 'This Week' : r === 'month' ? 'This Month' : 'Custom'}
              </button>
            ))}
          </div>

          {/* Custom Date Inputs */}
          {range === 'custom' && (
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200">
              <input
                id="report-start-date"
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 outline-none"
              />
              <span className="text-xs text-slate-400 font-bold">to</span>
              <input
                id="report-end-date"
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 outline-none"
              />
            </div>
          )}

          {/* Engineer Filter Dropdown */}
          <div className="flex items-center gap-1.5">
            <User className="h-4 w-4 text-slate-400" />
            <select
              id="report-engineer-filter"
              value={engFilter}
              onChange={(e) => setEngFilter(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-100"
            >
              <option value="all">👥 All Engineers</option>
              {engineers.map((e) => (
                <option key={e.id} value={e.id}>
                  👤 {e.full_name}
                </option>
              ))}
            </select>
          </div>

          {/* Client Filter Dropdown */}
          <select
            id="report-client-filter"
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
          >
            <option value="all">🏢 All Clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.client_name} ({c.city})
              </option>
            ))}
          </select>

          {/* Status Filter Dropdown */}
          <select
            id="report-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
          >
            <option value="all">⚡ All Statuses</option>
            <option value="completed">Completed</option>
            <option value="traveling">On Call (Traveling)</option>
            <option value="in_progress">In Client Place</option>
            <option value="assigned">Assigned</option>
            <option value="vendor">Vendor Handling</option>
            <option value="call_back">Call Back</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {/* Call Source Filter (All, Direct, Online) */}
          <select
            id="report-source-filter"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as 'all' | 'direct' | 'online')}
            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-600"
          >
            <option value="all">🌐 All Sources</option>
            <option value="direct">📍 Direct Calls</option>
            <option value="online">💻 Online Calls</option>
          </select>

          {/* Call Type Filter */}
          <select
            id="report-calltype-filter"
            value={callTypeFilter}
            onChange={(e) => setCallTypeFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
          >
            <option value="all">🏷️ All Call Types</option>
            <option value="Per Call">Per Call (Paid)</option>
            <option value="Warranty">Warranty (Free)</option>
            <option value="AMC">AMC</option>
            <option value="ASC">ASC</option>
          </select>
        </div>
      </div>

      {/* Primary KPI Metrics Summary: GPS KM, Manual KM & Difference KM */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Calls</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-green-200 bg-green-50/50 p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-green-700">Completed</p>
          <p className="mt-1 text-2xl font-extrabold text-green-600">{stats.completed}</p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700">GPS Road KM</p>
          <p className="mt-1 text-2xl font-extrabold text-blue-900">{formatKm(stats.totalGpsKm)}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Manual / Bike KM</p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-900">{formatKm(stats.totalManualKm)}</p>
        </div>
        <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-purple-700">KM Difference</p>
          <p
            className={`mt-1 text-2xl font-extrabold ${
              Math.abs(stats.totalDiffKm) > 5
                ? 'text-amber-600'
                : 'text-purple-900'
            }`}
          >
            {formatDiffKm(stats.totalDiffKm)}
          </p>
        </div>
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Avg KM / Call</p>
          <p className="mt-1 text-2xl font-extrabold text-indigo-900">{formatKm(stats.avgKm)}</p>
        </div>
      </div>

      {/* Tabs Header: Detailed Call Log vs KM Analytics vs Vendor Handover */}
      <div className="flex flex-wrap border-b border-slate-200 gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('calls')}
          className={`flex items-center gap-2 border-b-2 py-3 px-4 text-sm font-bold transition ${
            activeTab === 'calls'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Detailed Call Log ({filteredJobs.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('km_summary')}
          className={`flex items-center gap-2 border-b-2 py-3 px-4 text-sm font-bold transition ${
            activeTab === 'km_summary'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Car className="h-4 w-4" />
          <span>Engineer KM & Travel Summary</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('vendor_handover')}
          className={`flex items-center gap-2 border-b-2 py-3 px-4 text-sm font-bold transition ${
            activeTab === 'vendor_handover'
              ? 'border-purple-600 text-purple-600 bg-purple-50/40 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Store className="h-4 w-4 text-purple-600" />
          <span>
            Vendor Handover & Follow-Up ({jobs.filter((j) => j.status === 'vendor' || !!j.vendor_name).length})
          </span>
        </button>
      </div>

      {/* ----------------- TAB 1: DETAILED SERVICE CALL REPORT TABLE ----------------- */}
      {activeTab === 'calls' && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3.5">Job #</th>
                  <th className="px-4 py-3.5">Date</th>
                  <th className="px-4 py-3.5">Customer & City</th>
                  <th className="px-4 py-3.5">Engineer</th>
                  <th className="px-4 py-3.5">Issue Reported</th>
                  <th className="px-4 py-3.5 text-center">GPS Road KM</th>
                  <th className="px-4 py-3.5 text-center">Manual KM</th>
                  <th className="px-4 py-3.5 text-center">KM Diff</th>
                  <th className="px-4 py-3.5 text-center">Travel Time</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredJobs.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-slate-400">
                      <FileText className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                      <p className="font-semibold text-slate-600">No service calls found for selected filters</p>
                    </td>
                  </tr>
                ) : (
                  filteredJobs.map((j) => {
                    const gKm = j.gps_distance_km || j.total_km || 0;
                    const mKm = j.total_km || j.gps_distance_km || 0;
                    const diff = mKm - gKm;
                    const absDiff = Math.abs(diff);

                    return (
                      <tr key={j.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">
                          <a
                            href={`/admin/jobs/${j.id}`}
                            className="text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <span>{j.job_number}</span>
                          </a>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                          {j.scheduled_date}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{j.client?.client_name || 'Customer'}</p>
                          <p className="text-xs text-slate-400">{j.client?.city || 'Coimbatore'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => j.engineer_id && setEngFilter(j.engineer_id)}
                            className="font-bold text-blue-700 hover:underline flex items-center gap-1 text-left"
                            title="Filter this engineer"
                          >
                            <span>{j.engineer?.full_name || 'Unassigned'}</span>
                          </button>
                          <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                            <span className="inline-flex items-center gap-0.5 rounded bg-blue-50 px-1.5 py-0.5 font-medium text-blue-700 border border-blue-100">
                              👤 {j.assigned_by_name || j.reassigned_from_name || 'Admin'}
                            </span>
                            {j.call_given_by && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700 border border-emerald-100">
                                📞 {j.call_given_by}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <p className="truncate font-medium text-slate-800 text-xs">{j.issue_title}</p>
                          {j.call_type && (
                            <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              {j.call_type}
                            </span>
                          )}
                        </td>
                        {/* GPS KM */}
                        <td className="px-4 py-3 text-center text-xs font-semibold text-blue-700">
                          {formatKm(gKm)}
                        </td>
                        {/* Manual KM */}
                        <td className="px-4 py-3 text-center text-xs font-bold text-slate-900">
                          {formatKm(mKm)}
                        </td>
                        {/* Diff KM */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              absDiff <= 1.0
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : absDiff <= 3.0
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {formatDiffKm(diff)}
                          </span>
                        </td>
                        {/* Travel Time */}
                        <td className="px-4 py-3 text-center text-xs text-slate-600 font-medium whitespace-nowrap">
                          {j.travel_started_at && j.reached_at
                            ? formatDuration(j.travel_started_at, j.reached_at)
                            : '—'}
                        </td>
                        {/* Status */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${
                              j.status === 'completed'
                                ? 'bg-green-100 text-green-800 border border-green-200'
                                : j.status === 'traveling'
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : j.status === 'reached' || j.status === 'in_progress'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {j.status === 'traveling' ? 'On Call' : j.status === 'reached' ? 'In Client' : j.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => downloadCallReportPdf(j)}
                              className="rounded-lg bg-blue-50 p-1.5 text-blue-700 hover:bg-blue-100 transition border border-blue-200"
                              title="Download Official ICS Call Report PDF"
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </button>
                            <a
                              href={`/admin/jobs/${j.id}`}
                              className="rounded-lg bg-slate-100 p-1.5 text-slate-700 hover:bg-slate-200 transition"
                              title="View Full Job Details"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ----------------- TAB 2: ENGINEER KM & TRAVEL SUMMARY ----------------- */}
      {activeTab === 'km_summary' && (
        <div className="space-y-6">
          {/* Engineer Visual Progress Bar */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase text-slate-700">
              <BarChart3 className="h-4 w-4 text-blue-600" /> Calls Handled & Road KM per Engineer
            </h2>
            {stats.perEngineer.length === 0 ? (
              <p className="text-xs text-slate-400">No data available for current selection</p>
            ) : (
              <div className="space-y-3">
                {stats.perEngineer.map((e) => (
                  <div key={e.id} className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => setEngFilter(e.id)}
                      className="w-36 truncate text-xs font-bold text-slate-800 hover:text-blue-600 text-left"
                    >
                      {e.name}
                    </button>
                    <div className="flex-1">
                      <div className="h-6 rounded-lg bg-slate-100 overflow-hidden">
                        <div
                          className="flex h-6 items-center rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-2 text-xs font-bold text-white shadow-sm"
                          style={{
                            width: `${Math.max((e.totalCalls / (stats.total || 1)) * 100, 10)}%`,
                          }}
                        >
                          {e.totalCalls} calls ({e.completedCalls} completed)
                        </div>
                      </div>
                    </div>
                    <span className="w-28 text-right text-xs font-extrabold text-blue-900">
                      {formatKm(e.manualKm)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Engineer KM & Travel Analytics Table */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-800 uppercase">
                  Engineer Travel Distance (GPS vs Manual) & Performance Summary
                </h3>
                <p className="text-xs text-slate-500">
                  Comprehensive audit comparing automated GPS road kilometers with manual bike odometer readings
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3.5">Engineer Name</th>
                    <th className="px-4 py-3.5">Contact Phone</th>
                    <th className="px-4 py-3.5 text-center">Total Calls</th>
                    <th className="px-4 py-3.5 text-center">Completed Calls</th>
                    <th className="px-4 py-3.5 text-center">GPS Road KM</th>
                    <th className="px-4 py-3.5 text-center">Manual KM</th>
                    <th className="px-4 py-3.5 text-center">KM Difference</th>
                    <th className="px-4 py-3.5 text-center">Avg KM / Call</th>
                    <th className="px-4 py-3.5 text-center">Travel Time</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stats.perEngineer.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-xs text-slate-400">
                        No engineers found.
                      </td>
                    </tr>
                  ) : (
                    stats.perEngineer.map((eng) => {
                      const avgEngKm = eng.totalCalls > 0 ? eng.manualKm / eng.totalCalls : 0;
                      const hrs = Math.floor(eng.totalTravelMinutes / 60);
                      const mins = eng.totalTravelMinutes % 60;
                      const travelTimeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
                      const absDiff = Math.abs(eng.diffKm);

                      return (
                        <tr key={eng.id} className="hover:bg-slate-50 transition">
                          <td className="px-4 py-3 font-bold text-slate-900">
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                                {eng.name.charAt(0)}
                              </div>
                              <span>{eng.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {eng.phone ? (
                              <a href={`tel:${eng.phone}`} className="hover:text-green-600">
                                {eng.phone}
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-slate-900">
                            {eng.totalCalls}
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-green-600">
                            {eng.completedCalls}
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-blue-700">
                            {formatKm(eng.gpsKm)}
                          </td>
                          <td className="px-4 py-3 text-center font-extrabold text-slate-900">
                            {formatKm(eng.manualKm)}
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                absDiff <= 2.0
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : absDiff <= 5.0
                                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                  : 'bg-amber-100 text-amber-800 border border-amber-200'
                              }`}
                            >
                              {formatDiffKm(eng.diffKm)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-indigo-700">
                            {formatKm(avgEngKm)}
                          </td>
                          <td className="px-4 py-3 text-center text-xs text-slate-600 font-medium">
                            {eng.totalTravelMinutes > 0 ? travelTimeStr : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setEngFilter(eng.id);
                                setActiveTab('calls');
                              }}
                              className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100 transition border border-blue-200"
                            >
                              Filter Calls →
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- TAB 3: VENDOR HANDOVER & FOLLOW-UP REPORT ----------------- */}
      {activeTab === 'vendor_handover' && (
        <VendorHandoverReportView
          jobs={jobs}
          engineers={engineers}
          clients={clients}
          vendors={vendors}
          onRefresh={load}
          onSelectJob={(id) => {
            const found = jobs.find((x) => x.id === id);
            if (found) onViewJob?.(found);
          }}
        />
      )}
    </div>
  );
}
