import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchAllLeads,
  createLead,
  transferLead,
  fetchLeadHistory,
  fetchFollowupsForLead,
  canUserFollowupLead,
  INITIAL_LEAD_CATEGORIES,
  LEAD_SOURCES,
  LEAD_STATUS_PIPELINE,
} from '@/lib/leads';
import type { Lead, Profile, LeadAssignmentHistory, LeadFollowup, LeadStatus, LeadPriority, LeadSource } from '@/types/database';
import {
  Target,
  Search,
  Plus,
  ArrowRightLeft,
  Building2,
  Phone,
  User,
  Briefcase,
  Calendar,
  IndianRupee,
  Clock,
  History,
  ExternalLink,
  X,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
} from 'lucide-react';
import { LeadFollowupModal } from '@/components/leads/LeadFollowupModal';

interface AdminLeadsProps {
  onViewJob?: (jobId: string) => void;
}

export function AdminLeads({ onViewJob }: AdminLeadsProps) {
  const { profile } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');

  // Modals
  const [transferModalLead, setTransferModalLead] = useState<Lead | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [historyModalLead, setHistoryModalLead] = useState<Lead | null>(null);
  const [followupLead, setFollowupLead] = useState<Lead | null>(null);
  const [historyLogs, setHistoryLogs] = useState<LeadAssignmentHistory[]>([]);
  const [followups, setFollowups] = useState<LeadFollowup[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    loadData();

    const ch = supabase
      .channel('admin-leads-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => loadData())
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [allLeads, empData] = await Promise.all([
        fetchAllLeads(),
        supabase.from('profiles').select('*').in('role', ['engineer', 'sales_executive']).order('full_name'),
      ]);
      setLeads(allLeads);
      setEmployees((empData.data as unknown as Profile[]) || []);
    } catch (err) {
      console.error('Error fetching admin leads:', err);
    } finally {
      setLoading(false);
    }
  }

  async function openHistory(lead: Lead) {
    setHistoryModalLead(lead);
    setHistoryLoading(true);
    try {
      const [h, f] = await Promise.all([
        fetchLeadHistory(lead.id),
        fetchFollowupsForLead(lead.id),
      ]);
      setHistoryLogs(h);
      setFollowups(f);
    } finally {
      setHistoryLoading(false);
    }
  }

  const filtered = leads.filter((lead) => {
    if (statusFilter !== 'all' && lead.status !== statusFilter) return false;
    if (sourceFilter !== 'all' && lead.lead_source !== sourceFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      lead.lead_number.toLowerCase().includes(q) ||
      lead.customer_name.toLowerCase().includes(q) ||
      (lead.company_name || '').toLowerCase().includes(q) ||
      lead.mobile_number.includes(q) ||
      lead.requirement.toLowerCase().includes(q) ||
      lead.lead_category.toLowerCase().includes(q) ||
      (lead.original_owner_name || '').toLowerCase().includes(q) ||
      (lead.current_owner_name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Target className="h-6 w-6 text-purple-600" />
            Lead Management & Sales Pipeline
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Track all field-discovered business opportunities, assign to sales executives, and convert to revenue
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs"
          >
            Refresh
          </button>
          <button
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-purple-700 transition"
          >
            <Plus className="h-4 w-4" />
            <span>+ Create Lead</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by lead #, customer, owner, category..."
            className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs font-medium text-slate-900 placeholder:text-slate-400 shadow-xs outline-none focus:border-purple-500"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs outline-none focus:border-purple-500"
          >
            <option value="all">All Statuses ({leads.length})</option>
            {LEAD_STATUS_PIPELINE.map((st) => (
              <option key={st} value={st}>
                {st} ({leads.filter((l) => l.status === st).length})
              </option>
            ))}
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs outline-none focus:border-purple-500"
          >
            <option value="all">All Sources</option>
            {LEAD_SOURCES.map((src) => (
              <option key={src} value={src}>
                {src}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Leads Table */}
      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase font-bold text-slate-500">
            <tr>
              <th className="px-4 py-3.5">Lead Info</th>
              <th className="px-4 py-3.5">Customer</th>
              <th className="px-4 py-3.5">Requirement</th>
              <th className="px-4 py-3.5">Original Owner (Discovered)</th>
              <th className="px-4 py-3.5">Current Owner (Sales)</th>
              <th className="px-4 py-3.5">Est. Value</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  Loading leads...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  No leads found matching current filter.
                </td>
              </tr>
            ) : (
              filtered.map((lead) => {
                const isWon = lead.status === 'WON';
                const isLost = lead.status === 'LOST';
                const canFollowup = canUserFollowupLead(profile, lead);

                return (
                  <tr key={lead.id} className="hover:bg-slate-50/70 transition">
                    {/* Lead Info */}
                    <td className="px-4 py-3.5">
                      <p className="font-mono font-bold text-purple-700">{lead.lead_number}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="font-semibold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                          {lead.lead_category}
                        </span>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-extrabold uppercase ${
                            lead.priority === 'Hot'
                              ? 'bg-red-100 text-red-700'
                              : lead.priority === 'Warm'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {lead.priority}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium block mt-1">
                        Src: {lead.lead_source}
                      </span>
                    </td>

                    {/* Customer */}
                    <td className="px-4 py-3.5 font-medium">
                      <p className="font-bold text-slate-900">{lead.customer_name}</p>
                      {lead.company_name && (
                        <p className="text-[11px] text-slate-500">{lead.company_name}</p>
                      )}
                      <p className="text-[11px] font-mono text-slate-500 mt-0.5">{lead.mobile_number}</p>
                    </td>

                    {/* Requirement */}
                    <td className="px-4 py-3.5 max-w-xs">
                      <p className="font-medium text-slate-800 line-clamp-2">{lead.requirement}</p>
                      {lead.service_job_number && (
                        <button
                          onClick={() => lead.service_job_id && onViewJob && onViewJob(lead.service_job_id)}
                          className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:underline"
                        >
                          <Briefcase className="h-3 w-3" /> Job #{lead.service_job_number} ➔
                        </button>
                      )}
                    </td>

                    {/* Original Owner */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 text-amber-900 bg-amber-50/80 px-2 py-1 rounded-lg border border-amber-200/60 inline-flex">
                        <User className="h-3.5 w-3.5 text-amber-600" />
                        <div>
                          <p className="font-bold">{lead.original_owner_name}</p>
                          <p className="text-[9px] text-amber-700">Permanent Discoverer</p>
                        </div>
                      </div>
                    </td>

                    {/* Current Owner */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 text-purple-900 bg-purple-50/80 px-2 py-1 rounded-lg border border-purple-200/60 inline-flex">
                        <User className="h-3.5 w-3.5 text-purple-600" />
                        <div>
                          <p className="font-bold">{lead.current_owner_name || 'Unassigned'}</p>
                          <p className="text-[9px] text-purple-700 capitalize">
                            {lead.current_owner_role || 'Sales'}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Value */}
                    <td className="px-4 py-3.5 font-mono font-bold text-slate-900">
                      {lead.estimated_value ? (
                        <span className="flex items-center gap-0.5 text-emerald-700">
                          <IndianRupee className="h-3 w-3" />
                          {lead.estimated_value.toLocaleString('en-IN')}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-normal">—</span>
                      )}
                    </td>

                    {/* Status Badge (Updates from Follow-up) */}
                    <td className="px-4 py-3.5">
                      <span
                        title="Status is updated automatically from logged follow-ups"
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide border shadow-2xs ${
                          isWon
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : isLost
                            ? 'bg-red-100 text-red-800 border-red-300'
                            : lead.status === 'QUOTATION'
                            ? 'bg-purple-100 text-purple-800 border-purple-300'
                            : lead.status === 'FOLLOW-UP'
                            ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                            : lead.status === 'CONTACTED'
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-blue-50 text-blue-800 border-blue-200'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isWon
                              ? 'bg-emerald-500'
                              : isLost
                              ? 'bg-red-500'
                              : lead.status === 'QUOTATION'
                              ? 'bg-purple-500'
                              : lead.status === 'FOLLOW-UP'
                              ? 'bg-indigo-500'
                              : lead.status === 'CONTACTED'
                              ? 'bg-amber-500'
                              : 'bg-blue-500'
                          }`}
                        />
                        {lead.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <a
                          href={`https://wa.me/${lead.mobile_number.replace(/[^0-9]/g, '')}?text=Hi%20${encodeURIComponent(lead.customer_name)},%20regarding%20your%20${encodeURIComponent(lead.lead_category)}%20requirement%20with%20ICS...`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg bg-green-50 hover:bg-green-100 p-1.5 text-green-700 transition"
                          title="WhatsApp Chat"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </a>

                        {canFollowup ? (
                          <button
                            onClick={() => setFollowupLead(lead)}
                            className="inline-flex items-center gap-1 rounded-lg bg-purple-50 hover:bg-purple-100 px-2 py-1 text-[11px] font-bold text-purple-700 transition"
                            title="Log Follow-up / View History"
                          >
                            <Calendar className="h-3 w-3" /> Follow-up
                          </button>
                        ) : (
                          <button
                            onClick={() => setFollowupLead(lead)}
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 hover:bg-slate-200 px-2 py-1 text-[11px] font-bold text-slate-500 transition"
                            title="View Follow-up History (Only owner or admin can log new follow-up)"
                          >
                            <History className="h-3 w-3" /> Timeline
                          </button>
                        )}

                        <button
                          onClick={() => setTransferModalLead(lead)}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 hover:bg-purple-100 px-2 py-1 text-[11px] font-bold text-slate-700 hover:text-purple-700 transition"
                          title="Transfer / Reassign Lead"
                        >
                          <ArrowRightLeft className="h-3 w-3" /> Transfer
                        </button>

                        <button
                          onClick={() => openHistory(lead)}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 hover:bg-slate-200 px-2 py-1 text-[11px] font-bold text-slate-700 transition"
                          title="Audit Trail"
                        >
                          <History className="h-3 w-3" />
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

      {/* Transfer Lead Modal */}
      {transferModalLead && (
        <TransferModal
          lead={transferModalLead}
          employees={employees}
          onClose={() => setTransferModalLead(null)}
          onSaved={() => {
            setTransferModalLead(null);
            loadData();
          }}
        />
      )}

      {/* Admin Create Lead Modal */}
      {createModalOpen && (
        <AdminCreateLeadModal
          employees={employees}
          onClose={() => setCreateModalOpen(false)}
          onSaved={() => {
            setCreateModalOpen(false);
            loadData();
          }}
        />
      )}

      {/* History Modal */}
      {historyModalLead && (
        <AdminLeadHistoryModal
          lead={historyModalLead}
          history={historyLogs}
          followups={followups}
          loading={historyLoading}
          onClose={() => setHistoryModalLead(null)}
        />
      )}

      {/* Follow-up Logging Modal */}
      <LeadFollowupModal
        isOpen={!!followupLead}
        lead={followupLead}
        onClose={() => setFollowupLead(null)}
        onFollowupSaved={loadData}
      />
    </div>
  );
}

function TransferModal({
  lead,
  employees,
  onClose,
  onSaved,
}: {
  lead: Lead;
  employees: Profile[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState('');
  const [reason, setReason] = useState('Customer requested quotation. Reassigned for sales follow-up.');
  const [submitting, setSubmitting] = useState(false);

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !selectedUserId) return;

    const targetEmp = employees.find((e) => e.id === selectedUserId);
    if (!targetEmp) return;

    setSubmitting(true);
    try {
      await transferLead({
        lead_id: lead.id,
        to_user_id: targetEmp.id,
        to_user_name: targetEmp.full_name,
        to_user_role: targetEmp.role,
        transferred_by_id: profile.id,
        transferred_by_name: profile.full_name,
        reason: reason.trim() || undefined,
      });

      alert(`Lead ${lead.lead_number} successfully assigned to ${targetEmp.full_name}!`);
      onSaved();
    } catch (err: any) {
      alert(`Error transferring lead: ${err?.message || err}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">
        <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold flex items-center gap-1.5">
              <ArrowRightLeft className="h-4 w-4 text-purple-400" />
              Transfer / Reassign Lead
            </h2>
            <p className="text-xs text-slate-400 font-mono">{lead.lead_number}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleTransfer} className="p-6 space-y-4 text-xs">
          {/* Ownership Retention Notice */}
          <div className="rounded-2xl bg-amber-50 p-3.5 border border-amber-200 text-amber-950 space-y-1">
            <p className="font-bold flex items-center gap-1 text-amber-800">
              <Sparkles className="h-3.5 w-3.5" /> Permanent Original Owner:
            </p>
            <p className="text-xs font-semibold text-slate-900">
              {lead.original_owner_name} ({lead.created_by_role || 'Engineer'})
            </p>
            <p className="text-[11px] text-slate-500 pt-1">
              Transferring will reassign the active follow-up to the selected Sales Executive, while preserving{' '}
              <strong>{lead.original_owner_name}</strong> as the permanent discoverer for sales incentive credit.
            </p>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Current Active Handler:</label>
            <p className="p-2.5 rounded-xl bg-slate-100 font-semibold text-slate-800">
              {lead.current_owner_name || 'Unassigned'}
            </p>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Transfer To (New Owner) *</label>
            <select
              required
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-2.5 font-bold text-slate-900 outline-none focus:border-purple-500"
            >
              <option value="">-- Select Sales Executive / Employee --</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name} — {emp.role === 'sales_executive' ? 'Sales Executive' : 'Service Engineer'} (
                  {emp.employee_id || 'ID'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Transfer Reason / Instructions</label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-2 text-slate-800 outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 font-bold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-purple-600 px-5 py-2 font-bold text-white shadow-sm hover:bg-purple-700 transition disabled:opacity-50"
            >
              {submitting ? 'Transferring...' : 'Transfer Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AdminCreateLeadModal({
  employees,
  onClose,
  onSaved,
}: {
  employees: Profile[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [customerName, setCustomerName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [category, setCategory] = useState('CCTV');
  const [requirement, setRequirement] = useState('');
  const [source, setSource] = useState<LeadSource>('Admin Created');
  const [priority, setPriority] = useState<LeadPriority>('Warm');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !customerName.trim() || !requirement.trim() || !ownerId) {
      alert('Please fill all required fields and select a Lead Owner.');
      return;
    }

    const assignedEmp = employees.find((e) => e.id === ownerId);
    if (!assignedEmp) return;

    setSubmitting(true);
    try {
      await createLead({
        customer_name: customerName.trim(),
        company_name: companyName.trim() || undefined,
        mobile_number: mobileNumber.trim(),
        created_by: profile.id,
        created_by_name: profile.full_name,
        created_by_role: 'admin',
        original_owner_id: assignedEmp.id,
        original_owner_name: assignedEmp.full_name,
        current_owner_id: assignedEmp.id,
        current_owner_name: assignedEmp.full_name,
        current_owner_role: assignedEmp.role,
        lead_source: source,
        lead_category: category,
        requirement: requirement.trim(),
        priority: priority,
        estimated_value: estimatedValue ? parseFloat(estimatedValue) : 0,
      });

      alert('Lead successfully registered!');
      onSaved();
    } catch (err: any) {
      alert(`Error creating lead: ${err?.message || err}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden my-6">
        <div className="bg-purple-700 px-6 py-4 text-white flex items-center justify-between">
          <h2 className="text-base font-bold">Admin: Register New Lead</h2>
          <button onClick={onClose} className="rounded-full p-1 text-white/80 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Customer Name *</label>
              <input
                required
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2 outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Company</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2 outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Mobile Number *</label>
              <input
                required
                type="text"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2 outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Lead Source</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as LeadSource)}
                className="w-full rounded-xl border border-slate-300 p-2 outline-none focus:border-purple-500"
              >
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Admin Owner Selection Dropdown */}
          <div className="rounded-2xl bg-purple-50/80 p-3.5 border border-purple-200">
            <label className="block font-black text-purple-950 mb-1">
              Assign Lead Owner (Sales Executive / Engineer) *
            </label>
            <select
              required
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="w-full rounded-xl border border-purple-300 bg-white p-2.5 font-bold text-slate-900 outline-none focus:border-purple-500"
            >
              <option value="">-- Choose Employee to Handle this Lead --</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name} — {emp.role === 'sales_executive' ? 'Sales Executive' : 'Service Engineer'}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2 outline-none focus:border-purple-500"
              >
                {INITIAL_LEAD_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as LeadPriority)}
                className="w-full rounded-xl border border-slate-300 p-2 outline-none focus:border-purple-500"
              >
                <option value="Hot">Hot</option>
                <option value="Warm">Warm</option>
                <option value="Cold">Cold</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Requirement Details *</label>
            <textarea
              required
              rows={3}
              value={requirement}
              onChange={(e) => setRequirement(e.target.value)}
              placeholder="Describe customer requirement..."
              className="w-full rounded-xl border border-slate-300 p-2 outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Estimated Value (₹)</label>
            <input
              type="number"
              min="0"
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
              placeholder="e.g. 75000"
              className="w-full rounded-xl border border-slate-300 p-2 outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 font-bold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-purple-600 px-5 py-2 font-bold text-white shadow-sm hover:bg-purple-700 transition disabled:opacity-50"
            >
              {submitting ? 'Registering...' : 'Register Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AdminLeadHistoryModal({
  lead,
  history,
  followups,
  loading,
  onClose,
}: {
  lead: Lead;
  history: LeadAssignmentHistory[];
  followups: LeadFollowup[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <History className="h-4 w-4 text-purple-400" />
              Lead Audit Trail & Follow-up History
            </h2>
            <p className="text-xs text-slate-400 font-mono">{lead.lead_number} • {lead.customer_name}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {loading ? (
            <div className="py-8 text-center text-slate-400">Loading history...</div>
          ) : (
            <>
              {/* Assignment Audit */}
              <div>
                <h3 className="font-bold text-slate-900 uppercase text-[11px] mb-2">Assignment Audit</h3>
                <div className="space-y-2">
                  {history.map((h) => (
                    <div key={h.id} className="rounded-xl bg-slate-50 p-3 border border-slate-200">
                      <div className="flex items-center justify-between text-slate-500 font-mono text-[10px]">
                        <span className="font-bold uppercase text-purple-700">{h.action}</span>
                        <span>{new Date(h.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-slate-800 font-semibold mt-1">
                        {h.from_user_name ? `${h.from_user_name} ➔ ` : 'Assigned to: '}
                        <strong>{h.to_user_name}</strong>
                      </p>
                      {h.reason && <p className="text-[11px] text-slate-500 mt-0.5">"{h.reason}"</p>}
                      <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-100 mt-1">
                        By: {h.transferred_by_name}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Follow-up Notes */}
              <div>
                <h3 className="font-bold text-slate-900 uppercase text-[11px] mb-2">
                  Follow-up Calls & Visits ({followups.length})
                </h3>
                <div className="space-y-2">
                  {followups.map((f) => (
                    <div key={f.id} className="rounded-xl bg-purple-50/40 p-3 border border-purple-100">
                      <div className="flex items-center justify-between text-[10px] text-purple-800 font-mono">
                        <span className="font-bold">{f.followup_type}</span>
                        <span>{f.followup_date}</span>
                      </div>
                      <p className="text-slate-800 mt-1 font-medium">{f.notes}</p>
                      {f.next_action && (
                        <p className="text-[11px] text-purple-700 mt-0.5 font-semibold">
                          Next Action: {f.next_action}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400 pt-1 border-t border-purple-100 mt-1">
                        Logged by: {f.user_name}
                      </p>
                    </div>
                  ))}
                  {followups.length === 0 && (
                    <p className="text-slate-400 text-[11px]">No customer follow-ups logged yet.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
