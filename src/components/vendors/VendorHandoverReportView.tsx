import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { ServiceJob, Profile, Client, Vendor } from '@/types/database';
import {
  Store,
  Phone,
  Calendar,
  Clock,
  Search,
  Filter,
  Download,
  Printer,
  UserCheck,
  Building,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  MessageSquare,
  Loader2,
  X,
  PhoneCall,
  History,
  AlertCircle,
} from 'lucide-react';
import { addAdminNotification } from '@/lib/notifications';
import { safeUpdateServiceJob } from '@/lib/safeDb';

interface VendorHandoverReportViewProps {
  jobs: ServiceJob[];
  engineers: Profile[];
  clients: Client[];
  vendors: Vendor[];
  onRefresh: () => void;
  onSelectJob?: (jobId: string) => void;
}

const REPAIR_STAGES = [
  'Sent to Vendor (Initial Handover)',
  'Under Diagnosis / Inspection',
  'Waiting for Spare Parts / IC Chip',
  'Component Level Repair / Soldering',
  'Testing & Quality Check',
  'Ready for Pickup / Collection',
  'Returned to ICS Office',
  'Reassigned to Engineer',
];

export function VendorHandoverReportView({
  jobs,
  engineers,
  clients,
  vendors,
  onRefresh,
  onSelectJob,
}: VendorHandoverReportViewProps) {
  // Filters
  const [search, setSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [dateRange, setDateRange] = useState<'all' | 'today' | 'week' | 'month'>('all');

  // Follow-Up Modal State
  const [showFollowupModal, setShowFollowupModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState<ServiceJob | null>(null);
  const [followupDate, setFollowupDate] = useState('');
  const [followupTime, setFollowupTime] = useState('11:00 AM');
  const [repairStage, setRepairStage] = useState(REPAIR_STAGES[0]);
  const [vendorPhone, setVendorPhone] = useState('');
  const [followupNotes, setFollowupNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Reassign Modal State
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignJob, setReassignJob] = useState<ServiceJob | null>(null);
  const [targetEngId, setTargetEngId] = useState('');
  const [reassignReason, setReassignReason] = useState('Received back from vendor, assigned for re-assembly and testing at client place');

  // All jobs that have been handed over to a vendor
  const vendorJobs = useMemo(() => {
    return jobs.filter((j) => j.status === 'vendor' || !!j.vendor_name);
  }, [jobs]);

  // Filtered dataset
  const filteredJobs = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];

    return vendorJobs.filter((j) => {
      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesJob = j.job_number.toLowerCase().includes(q);
        const matchesClient = j.client?.client_name?.toLowerCase().includes(q) || j.client?.company_name?.toLowerCase().includes(q);
        const matchesVendor = j.vendor_name?.toLowerCase().includes(q);
        const matchesIssue = j.issue_title?.toLowerCase().includes(q) || j.issue_description?.toLowerCase().includes(q);
        const matchesPhone = (j.client?.phone || '').includes(q) || (j.vendor_phone || '').includes(q);
        if (!matchesJob && !matchesClient && !matchesVendor && !matchesIssue && !matchesPhone) {
          return false;
        }
      }

      // Vendor Filter
      if (vendorFilter !== 'all' && j.vendor_name !== vendorFilter) {
        return false;
      }

      // Stage / Status Filter
      if (stageFilter === 'active') {
        if (j.status !== 'vendor') return false;
      } else if (stageFilter === 'due_today') {
        if (j.call_back_date !== todayStr) return false;
      } else if (stageFilter === 'completed') {
        if (j.status !== 'completed' && j.status !== 'solved') return false;
      } else if (stageFilter === 'ready_pickup') {
        const n = (j.vendor_notes || '').toLowerCase();
        if (!n.includes('ready') && !n.includes('pickup') && !n.includes('collection')) return false;
      }

      // Date Range Filter
      if (dateRange !== 'all') {
        const createdDate = new Date(j.created_at).getTime();
        const now = Date.now();
        if (dateRange === 'today') {
          const startOfToday = new Date().setHours(0, 0, 0, 0);
          if (createdDate < startOfToday) return false;
        } else if (dateRange === 'week') {
          if (now - createdDate > 7 * 86400000) return false;
        } else if (dateRange === 'month') {
          if (now - createdDate > 30 * 86400000) return false;
        }
      }

      return true;
    });
  }, [vendorJobs, search, vendorFilter, stageFilter, dateRange]);

  // KPI Analytics
  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const total = vendorJobs.length;
    const activeAtVendor = vendorJobs.filter((j) => j.status === 'vendor').length;
    const dueTodayOrOverdue = vendorJobs.filter(
      (j) => j.status === 'vendor' && j.call_back_date && j.call_back_date <= todayStr
    ).length;
    const returnedOrCompleted = vendorJobs.filter((j) => j.status === 'completed' || j.status === 'solved').length;

    return {
      total,
      activeAtVendor,
      dueTodayOrOverdue,
      returnedOrCompleted,
    };
  }, [vendorJobs]);

  // Open Follow-Up Modal
  function handleOpenFollowup(job: ServiceJob) {
    setSelectedJob(job);
    setFollowupDate(job.call_back_date || new Date().toISOString().split('T')[0]);
    setFollowupTime(job.call_back_time || '11:00 AM');
    setVendorPhone(job.vendor_phone || '');
    setFollowupNotes('');
    setActionMessage(null);
    setShowFollowupModal(true);
  }

  // Save Follow-Up
  async function handleSaveFollowup() {
    if (!selectedJob) return;
    setActionLoading(true);
    setActionMessage(null);

    try {
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const todayDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      
      const newLogEntry = followupNotes.trim()
        ? `[Follow-up ${todayDate} ${timestamp} | ${repairStage}]: ${followupNotes.trim()}`
        : `[Follow-up ${todayDate} ${timestamp}]: Status updated to "${repairStage}"`;

      const existingNotes = selectedJob.vendor_notes || '';
      const updatedVendorNotes = existingNotes ? `${newLogEntry}\n---\n${existingNotes}` : newLogEntry;

      const updates: Record<string, unknown> = {
        call_back_date: followupDate || null,
        call_back_time: followupTime || null,
        vendor_phone: vendorPhone.trim() || selectedJob.vendor_phone,
        vendor_notes: updatedVendorNotes,
      };

      await safeUpdateServiceJob(selectedJob.id, updates);

      addAdminNotification({
        job_id: selectedJob.id,
        job_number: selectedJob.job_number,
        type: 'vendor',
        title: `Vendor Follow-Up: Job #${selectedJob.job_number}`,
        message: `Admin logged follow-up for vendor "${selectedJob.vendor_name}". Next follow-up: ${followupDate} at ${followupTime}.`,
        actor_name: 'Admin',
        data: {
          vendor_name: selectedJob.vendor_name || undefined,
          call_back_date: followupDate,
          call_back_time: followupTime,
          reason: repairStage,
          admin_notes: followupNotes,
        },
      });

      setActionMessage({ type: 'success', text: 'Follow-up details saved successfully!' });
      setTimeout(() => {
        setShowFollowupModal(false);
        onRefresh();
      }, 900);
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save follow-up.',
      });
    } finally {
      setActionLoading(false);
    }
  }

  // Open Reassign Modal
  function handleOpenReassign(job: ServiceJob) {
    setReassignJob(job);
    setTargetEngId('');
    setReassignReason('Received back from vendor, assigned for re-assembly and testing at client place');
    setActionMessage(null);
    setShowReassignModal(true);
  }

  // Confirm Reassign
  async function handleConfirmReassign() {
    if (!reassignJob || !targetEngId) {
      setActionMessage({ type: 'error', text: 'Please select an engineer to reassign.' });
      return;
    }

    setActionLoading(true);
    try {
      const targetEng = engineers.find((e) => e.id === targetEngId);
      const updates = {
        engineer_id: targetEngId,
        status: 'assigned' as const,
        reassigned_from_name: `Vendor (${reassignJob.vendor_name || 'External'})`,
        reassignment_reason: reassignReason.trim() || 'Reassigned from vendor by Admin',
        admin_notes: (reassignJob.admin_notes ? reassignJob.admin_notes + '\n' : '') + `[Returned from Vendor: ${reassignReason.trim()}]`,
      };

      await safeUpdateServiceJob(reassignJob.id, updates);

      addAdminNotification({
        job_id: reassignJob.id,
        job_number: reassignJob.job_number,
        type: 'reassigned',
        title: `Job #${reassignJob.job_number} Returned from Vendor`,
        message: `Admin assigned returned job to engineer ${targetEng?.full_name || 'Engineer'}.`,
        actor_name: 'Admin',
        data: {
          target_engineer_id: targetEngId,
          target_engineer_name: targetEng?.full_name,
          reason: reassignReason,
        },
      });

      setActionMessage({ type: 'success', text: `Job assigned to ${targetEng?.full_name || 'engineer'}!` });
      setTimeout(() => {
        setShowReassignModal(false);
        onRefresh();
      }, 900);
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to reassign job.',
      });
    } finally {
      setActionLoading(false);
    }
  }

  // Print Vendor Handover Challan / Gate Pass
  function handlePrintHandoverSlip(job: ServiceJob) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Pop-up blocked. Please allow pop-ups for this site to print the Handover Gate Pass.');
      return;
    }

    const clientName = job.client?.client_name || 'Valued Client';
    const companyName = job.client?.company_name || '';
    const clientPhone = job.client?.phone || '—';
    const clientAddress = job.client?.address || '—';
    const vendorName = job.vendor_name || 'External Repair Center';
    const vendorPhone = job.vendor_phone || '—';
    const handedOverDate = job.created_at
      ? new Date(job.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : new Date().toLocaleDateString('en-IN');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Vendor Handover Gate Pass - #${job.job_number}</title>
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 25px; color: #1e293b; background: #fff; }
    .container { max-width: 800px; margin: 0 auto; border: 2px solid #0f172a; padding: 24px; border-radius: 8px; }
    .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
    .header h1 { margin: 0; font-size: 22px; color: #0f172a; text-transform: uppercase; letter-spacing: 1px; }
    .header p { margin: 4px 0 0; font-size: 11px; color: #64748b; }
    .badge { display: inline-block; background: #7c3aed; color: #fff; font-size: 11px; font-weight: bold; padding: 4px 12px; border-radius: 4px; margin-top: 8px; text-transform: uppercase; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 18px; }
    .box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; font-size: 12px; line-height: 1.5; }
    .box-title { font-size: 11px; font-weight: bold; text-transform: uppercase; color: #64748b; margin-bottom: 6px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
    .table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12px; }
    .table th, .table td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; }
    .table th { background: #0f172a; color: #fff; font-weight: bold; font-size: 11px; text-transform: uppercase; }
    .notes-box { background: #fffbeb; border: 1px solid #fef3c7; padding: 12px; border-radius: 6px; margin-top: 16px; font-size: 12px; color: #92400e; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 50px; text-align: center; font-size: 11px; font-weight: bold; }
    .sig-line { border-top: 1px solid #0f172a; margin-top: 45px; padding-top: 6px; }
    .footer { text-align: center; margin-top: 25px; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
    @media print {
      body { padding: 0; }
      .container { border: 1px solid #000; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Infant Computer Store (ICS)</h1>
      <p>Sales: 96266 44490 | Service: 96266 44496 • 240/A28, Sharadha Mill Road, Podanur, Coimbatore - 641023</p>
      <div class="badge">OUTSOURCE SERVICE HANDOVER GATE PASS / CHALLAN</div>
    </div>

    <div class="grid">
      <div class="box">
        <div class="box-title">Vendor Partner (Handover To)</div>
        <strong>${vendorName}</strong><br>
        Phone: ${vendorPhone}<br>
        Handover Date: ${handedOverDate}<br>
        Target Follow-Up: ${job.call_back_date ? `${job.call_back_date} (${job.call_back_time || '10:00 AM'})` : 'Within 3 Days'}
      </div>

      <div class="box">
        <div class="box-title">Customer & Job Reference</div>
        <strong>Job Order #${job.job_number}</strong><br>
        Customer: ${clientName} ${companyName ? `(${companyName})` : ''}<br>
        Contact: ${clientPhone}<br>
        Location: ${clientAddress}
      </div>
    </div>

    <table class="table">
      <thead>
        <tr>
          <th>Equipment / Problem Reported</th>
          <th>Diagnosis / Special Work Requested</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <strong>${job.issue_title}</strong><br>
            <span style="color:#64748b; font-size:11px;">${job.issue_description || 'Unit handed over for specialized chip/component repair.'}</span>
          </td>
          <td>
            ${job.vendor_notes || job.diagnosis || 'Requires specialized component repair and diagnostics.'}
          </td>
        </tr>
      </tbody>
    </table>

    <div class="notes-box">
      <strong>TERMS & HANDOVER INSTRUCTIONS:</strong>
      <ol style="margin: 4px 0 0; padding-left: 16px;">
        <li>Vendor must inspect the equipment and provide an estimate/diagnosis within 24 hours.</li>
        <li>No spare replacement without prior written/verbal approval from ICS Admin.</li>
        <li>Equipment must be securely packed and protected against physical damage during return transit.</li>
      </ol>
    </div>

    <div class="signatures">
      <div>
        <div class="sig-line">Prepared & Dispatched By (ICS Team)</div>
      </div>
      <div>
        <div class="sig-line">Received & Acknowledged By (${vendorName})</div>
      </div>
    </div>

    <div class="footer">
      This is a computer-generated Outsource Gate Pass document • Infant Computer Store (ICS) Management System
    </div>
  </div>
  <script>
    window.onload = () => { window.print(); };
  </script>
</body>
</html>
    `.trim();

    printWindow.document.write(html);
    printWindow.document.close();
  }

  // Export CSV
  function handleExportCsv() {
    const headers = [
      'Job Number',
      'Handover Date',
      'Client Name',
      'Client Company',
      'Client Phone',
      'Issue Reported',
      'External Vendor Name',
      'Vendor Contact Phone',
      'Next Follow-Up Date',
      'Next Follow-Up Time',
      'Follow-Up Status',
      'Assigned Engineer',
      'Vendor Notes & History',
    ];

    const rows = filteredJobs.map((j) => [
      j.job_number,
      j.created_at ? new Date(j.created_at).toISOString().split('T')[0] : '—',
      j.client?.client_name || '',
      j.client?.company_name || '',
      j.client?.phone || '',
      j.issue_title || '',
      j.vendor_name || '',
      j.vendor_phone || '',
      j.call_back_date || '—',
      j.call_back_time || '—',
      j.status === 'vendor' ? 'In Vendor Repair' : j.status === 'completed' ? 'Completed' : j.status,
      j.engineer?.full_name || 'Unassigned',
      (j.vendor_notes || '').replace(/\n/g, ' | '),
    ]);

    const csvContent = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ICS-Vendor-Handover-Report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-purple-200 bg-purple-50/60 p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-purple-700 flex items-center gap-1.5">
            <Store className="h-4 w-4" /> Total Handed Over
          </p>
          <p className="mt-1 text-2xl font-extrabold text-purple-950">{stats.total}</p>
          <p className="text-[11px] text-purple-700/80">Outsourced service jobs</p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
            <Clock className="h-4 w-4" /> In Vendor Repair
          </p>
          <p className="mt-1 text-2xl font-extrabold text-amber-950">{stats.activeAtVendor}</p>
          <p className="text-[11px] text-amber-700">Currently with external vendor</p>
        </div>

        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" /> Follow-Up Due / Today
          </p>
          <p className="mt-1 text-2xl font-extrabold text-rose-950">{stats.dueTodayOrOverdue}</p>
          <p className="text-[11px] text-rose-700">Requires status check with vendor</p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> Returned / Completed
          </p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-950">{stats.returnedOrCompleted}</p>
          <p className="text-[11px] text-emerald-700">Successfully resolved</p>
        </div>
      </div>

      {/* Filter & Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Job #, client, device issue, vendor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-xs font-medium outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100"
          />
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Vendor Filter */}
          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-purple-600"
          >
            <option value="all">🏪 All Vendor Partners</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.vendor_name}>
                {v.vendor_name}
              </option>
            ))}
          </select>

          {/* Stage Filter */}
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-purple-600"
          >
            <option value="all">⚡ All Statuses</option>
            <option value="active">Active In Vendor Repair</option>
            <option value="due_today">Follow-Up Due Today</option>
            <option value="ready_pickup">Ready for Pickup / Collection</option>
            <option value="completed">Completed / Solved</option>
          </select>

          {/* Date Filter */}
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-purple-600"
          >
            <option value="all">📅 All Time</option>
            <option value="today">Today</option>
            <option value="week">Past 7 Days</option>
            <option value="month">This Month</option>
          </select>

          {/* Export CSV */}
          <button
            onClick={handleExportCsv}
            disabled={filteredJobs.length === 0}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm disabled:opacity-50"
          >
            <Download className="h-4 w-4 text-purple-600" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-bold uppercase tracking-wider text-slate-600">
              <tr>
                <th className="px-4 py-3.5">Job & Date</th>
                <th className="px-4 py-3.5">Client Information</th>
                <th className="px-4 py-3.5">Equipment / Defect</th>
                <th className="px-4 py-3.5">External Vendor</th>
                <th className="px-4 py-3.5">Next Follow-Up</th>
                <th className="px-4 py-3.5">Repair Notes & History</th>
                <th className="px-4 py-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    <Store className="mx-auto h-10 w-10 text-slate-300 mb-2" />
                    <p className="text-sm font-semibold text-slate-600">No vendor handover records found</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      When an engineer or admin transfers a job to an external vendor, it will appear here.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredJobs.map((j) => {
                  const todayStr = new Date().toISOString().split('T')[0];
                  const isOverdue = j.status === 'vendor' && j.call_back_date && j.call_back_date < todayStr;
                  const isDueToday = j.status === 'vendor' && j.call_back_date === todayStr;
                  const isReady = (j.vendor_notes || '').toLowerCase().includes('ready') || (j.vendor_notes || '').toLowerCase().includes('pickup');

                  return (
                    <tr key={j.id} className="hover:bg-slate-50/80 transition">
                      {/* Job & Date */}
                      <td className="px-4 py-3.5 align-top">
                        <div className="flex flex-col gap-1">
                          <span
                            onClick={() => onSelectJob?.(j.id)}
                            className="font-bold text-blue-600 hover:underline cursor-pointer flex items-center gap-1"
                          >
                            #{j.job_number}
                            <ExternalLink className="h-3 w-3 opacity-60" />
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {new Date(j.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                          </span>
                          <span
                            className={`inline-block w-fit rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                              j.status === 'vendor'
                                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                : j.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {j.status === 'vendor' ? 'At Vendor' : j.status}
                          </span>
                        </div>
                      </td>

                      {/* Client Info */}
                      <td className="px-4 py-3.5 align-top">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-slate-900">{j.client?.client_name || 'Client'}</span>
                          {j.client?.company_name && (
                            <span className="text-[11px] text-slate-500 font-normal">{j.client.company_name}</span>
                          )}
                          {j.client?.phone && (
                            <a
                              href={`tel:${j.client.phone}`}
                              className="text-[11px] text-slate-600 hover:text-blue-600 flex items-center gap-1 mt-0.5"
                            >
                              <Phone className="h-3 w-3 text-slate-400" />
                              {j.client.phone}
                            </a>
                          )}
                        </div>
                      </td>

                      {/* Problem / Equipment */}
                      <td className="px-4 py-3.5 align-top max-w-[200px]">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-slate-900 line-clamp-1">{j.issue_title}</span>
                          {j.issue_description && (
                            <span className="text-[11px] text-slate-500 line-clamp-2 font-normal">
                              {j.issue_description}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Vendor Partner */}
                      <td className="px-4 py-3.5 align-top">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-purple-900 flex items-center gap-1">
                            <Store className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                            {j.vendor_name || 'External Vendor'}
                          </span>
                          {j.vendor_phone && (
                            <a
                              href={`tel:${j.vendor_phone}`}
                              className="text-[11px] text-purple-700 hover:underline flex items-center gap-1 font-semibold"
                            >
                              <PhoneCall className="h-3 w-3 text-purple-500" />
                              {j.vendor_phone}
                            </a>
                          )}
                        </div>
                      </td>

                      {/* Next Follow-Up */}
                      <td className="px-4 py-3.5 align-top">
                        {j.call_back_date ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1 text-slate-900 font-bold">
                              <Calendar className="h-3.5 w-3.5 text-slate-400" />
                              <span>{j.call_back_date}</span>
                            </div>
                            {j.call_back_time && (
                              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                <Clock className="h-3 w-3 text-slate-400" />
                                {j.call_back_time}
                              </span>
                            )}
                            {isOverdue && (
                              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-800 border border-rose-200 w-fit">
                                🔴 Overdue
                              </span>
                            )}
                            {isDueToday && (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 border border-amber-200 w-fit">
                                🟡 Due Today
                              </span>
                            )}
                            {!isOverdue && !isDueToday && (
                              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 w-fit">
                                🟢 Scheduled
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No follow-up set</span>
                        )}
                      </td>

                      {/* Repair Notes & History */}
                      <td className="px-4 py-3.5 align-top max-w-[240px]">
                        {isReady && (
                          <span className="mb-1 inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800">
                            ✨ Ready for Collection
                          </span>
                        )}
                        {j.vendor_notes ? (
                          <p className="text-[11px] text-slate-600 line-clamp-3 whitespace-pre-line font-normal bg-slate-50 p-2 rounded-lg border border-slate-100">
                            {j.vendor_notes}
                          </p>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">No notes logged yet</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 align-top text-center">
                        <div className="flex flex-col gap-1.5 items-center justify-center">
                          {/* Follow-up button */}
                          <button
                            onClick={() => handleOpenFollowup(j)}
                            title="Schedule or log vendor follow-up call"
                            className="flex w-full items-center justify-center gap-1 rounded-lg bg-purple-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-purple-700 transition"
                          >
                            <PhoneCall className="h-3.5 w-3.5" />
                            <span>Follow-Up</span>
                          </button>

                          {/* Reassign to Engineer */}
                          {j.status === 'vendor' && (
                            <button
                              onClick={() => handleOpenReassign(j)}
                              title="Reassign to engineer once returned from vendor"
                              className="flex w-full items-center justify-center gap-1 rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100 transition"
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                              <span>Reassign</span>
                            </button>
                          )}

                          {/* Print Gate Pass Slip */}
                          <button
                            onClick={() => handlePrintHandoverSlip(j)}
                            title="Print Vendor Handover Gate Pass"
                            className="flex w-full items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 transition"
                          >
                            <Printer className="h-3 w-3 text-slate-400" />
                            <span>Gate Pass</span>
                          </button>
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

      {/* ----------------- MODAL 1: VENDOR FOLLOW-UP ----------------- */}
      {showFollowupModal && selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
              <div className="flex items-center gap-2.5">
                <PhoneCall className="h-5 w-5 text-purple-400" />
                <div>
                  <h3 className="font-bold text-base">Vendor Follow-Up</h3>
                  <p className="text-[11px] text-slate-400">Job #{selectedJob.job_number} • {selectedJob.vendor_name || 'Vendor'}</p>
                </div>
              </div>
              <button
                onClick={() => setShowFollowupModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 text-slate-800 max-h-[75vh] overflow-y-auto">
              {actionMessage && (
                <div
                  className={`rounded-xl px-4 py-3 text-xs font-semibold flex items-center gap-2 ${
                    actionMessage.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {actionMessage.type === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-rose-600" />
                  )}
                  <span>{actionMessage.text}</span>
                </div>
              )}

              {/* Job & Vendor Reference Card */}
              <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-3 text-xs space-y-1 text-purple-950">
                <div className="flex items-center justify-between">
                  <span className="font-bold flex items-center gap-1.5">
                    <Store className="h-4 w-4 text-purple-600" />
                    {selectedJob.vendor_name || 'External Vendor'}
                  </span>
                  {selectedJob.vendor_phone && (
                    <a
                      href={`tel:${selectedJob.vendor_phone}`}
                      className="rounded-md bg-purple-600 text-white font-bold px-2 py-0.5 flex items-center gap-1 hover:bg-purple-700"
                    >
                      <Phone className="h-3 w-3" /> Call Vendor
                    </a>
                  )}
                </div>
                <p className="text-slate-600"><strong>Problem:</strong> {selectedJob.issue_title}</p>
                <p className="text-slate-600"><strong>Customer:</strong> {selectedJob.client?.client_name} ({selectedJob.client?.phone || '—'})</p>
              </div>

              {/* Next Follow-Up Schedule */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Next Follow-Up Date *
                  </label>
                  <input
                    type="date"
                    value={followupDate}
                    onChange={(e) => setFollowupDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-semibold outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Target Time *
                  </label>
                  <input
                    type="text"
                    value={followupTime}
                    onChange={(e) => setFollowupTime(e.target.value)}
                    placeholder="e.g. 11:30 AM"
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-semibold outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100"
                  />
                </div>
              </div>

              {/* Repair Stage */}
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Current Repair / Diagnosis Stage
                </label>
                <select
                  value={repairStage}
                  onChange={(e) => setRepairStage(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100"
                >
                  {REPAIR_STAGES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              {/* Vendor Phone Contact (in case it needs updating) */}
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Vendor Phone / Alternate Contact
                </label>
                <input
                  type="text"
                  value={vendorPhone}
                  onChange={(e) => setVendorPhone(e.target.value)}
                  placeholder="e.g. +91 9876543210"
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-semibold outline-none focus:border-purple-600"
                />
              </div>

              {/* Log Notes */}
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Follow-Up Remarks / Conversation Log
                </label>
                <textarea
                  value={followupNotes}
                  onChange={(e) => setFollowupNotes(e.target.value)}
                  rows={3}
                  placeholder="e.g. Spoke with technician Rajesh. Power IC replaced, running 4-hour burn-in test. Delivery confirmed for tomorrow 4 PM..."
                  className="w-full rounded-xl border border-slate-300 p-3 text-xs outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100"
                />
              </div>

              {/* Previous History */}
              {selectedJob.vendor_notes && (
                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                    <History className="h-3 w-3" /> Previous Follow-Up History
                  </label>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700 max-h-32 overflow-y-auto whitespace-pre-line">
                    {selectedJob.vendor_notes}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center gap-3 border-t bg-slate-50 px-6 py-4">
              <button
                onClick={() => setShowFollowupModal(false)}
                className="flex-1 rounded-xl border border-slate-300 bg-white py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveFollowup}
                disabled={actionLoading}
                className="flex-[1.5] flex items-center justify-center gap-2 rounded-xl bg-purple-600 py-2.5 text-xs font-bold text-white shadow-md hover:bg-purple-700 disabled:opacity-60"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                <span>Save Follow-Up</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- MODAL 2: REASSIGN TO ENGINEER ----------------- */}
      {showReassignModal && reassignJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
              <div className="flex items-center gap-2.5">
                <UserCheck className="h-5 w-5 text-blue-400" />
                <div>
                  <h3 className="font-bold text-base">Reassign to Engineer</h3>
                  <p className="text-[11px] text-slate-400">Job #{reassignJob.job_number} • Returned from Vendor</p>
                </div>
              </div>
              <button
                onClick={() => setShowReassignModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 text-slate-800">
              {actionMessage && (
                <div
                  className={`rounded-xl px-4 py-3 text-xs font-semibold flex items-center gap-2 ${
                    actionMessage.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {actionMessage.type === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-rose-600" />
                  )}
                  <span>{actionMessage.text}</span>
                </div>
              )}

              <p className="text-xs text-slate-600">
                The unit has returned from <strong>{reassignJob.vendor_name || 'Vendor'}</strong>. Assign an engineer to deliver, install, or perform on-site testing for client <strong>{reassignJob.client?.client_name}</strong>.
              </p>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Select Engineer *
                </label>
                <select
                  value={targetEngId}
                  onChange={(e) => setTargetEngId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs font-bold text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">-- Choose Field Engineer --</option>
                  {engineers.map((eng) => (
                    <option key={eng.id} value={eng.id}>
                      {eng.full_name} ({eng.phone || eng.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Reassignment Reason / Task Details
                </label>
                <textarea
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 p-3 text-xs outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center gap-3 border-t bg-slate-50 px-6 py-4">
              <button
                onClick={() => setShowReassignModal(false)}
                className="flex-1 rounded-xl border border-slate-300 bg-white py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReassign}
                disabled={actionLoading}
                className="flex-[1.5] flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-60"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                <span>Assign Engineer</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
