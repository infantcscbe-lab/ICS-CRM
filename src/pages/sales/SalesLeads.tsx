import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchLeadsForUser,
  updateLeadStatus,
  addLeadFollowup,
  fetchFollowupsForLead,
  fetchLeadHistory,
  LEAD_STATUS_PIPELINE,
} from '@/lib/leads';
import type { Lead, LeadFollowup, LeadAssignmentHistory, LeadStatus, LeadPriority } from '@/types/database';
import {
  Target,
  Search,
  Phone,
  Building2,
  Calendar,
  IndianRupee,
  Sparkles,
  Clock,
  History,
  FileText,
  User,
  X,
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';
import { UniversalCreateLeadModal } from '@/components/leads/UniversalCreateLeadModal';
import { LeadFollowupModal } from '@/components/leads/LeadFollowupModal';

interface SalesLeadsProps {
  onNavigateToQuotations?: () => void;
}

export function SalesLeads({ onNavigateToQuotations }: SalesLeadsProps) {
  const { profile } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [followupLead, setFollowupLead] = useState<Lead | null>(null);
  const [historyLead, setHistoryLead] = useState<Lead | null>(null);
  const [historyLogs, setHistoryLogs] = useState<LeadAssignmentHistory[]>([]);
  const [pastFollowups, setPastFollowups] = useState<LeadFollowup[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    loadLeads();
  }, [profile?.id]);

  async function loadLeads() {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const data = await fetchLeadsForUser(profile.id, 'sales_executive');
      setLeads(data);
    } catch (err) {
      console.error('Error fetching sales leads:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(leadId: string, newStatus: LeadStatus) {
    let lostReason: string | undefined;
    if (newStatus === 'LOST') {
      const reason = prompt('Please enter the reason for marking this lead as LOST:');
      if (reason === null) return;
      lostReason = reason;
    }

    try {
      const updated = await updateLeadStatus(leadId, newStatus, { lost_reason: lostReason });
      if (updated) {
        setLeads((prev) => prev.map((l) => (l.id === leadId ? updated : l)));
      }
    } catch (err) {
      alert('Failed to update lead status');
    }
  }

  async function openHistoryModal(lead: Lead) {
    setHistoryLead(lead);
    setHistoryLoading(true);
    try {
      const [hist, followups] = await Promise.all([
        fetchLeadHistory(lead.id),
        fetchFollowupsForLead(lead.id),
      ]);
      setHistoryLogs(hist);
      setPastFollowups(followups);
    } finally {
      setHistoryLoading(false);
    }
  }

  const filtered = leads.filter((lead) => {
    if (statusFilter !== 'all' && lead.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && lead.priority !== priorityFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      lead.lead_number.toLowerCase().includes(q) ||
      lead.customer_name.toLowerCase().includes(q) ||
      (lead.company_name || '').toLowerCase().includes(q) ||
      lead.mobile_number.includes(q) ||
      lead.requirement.toLowerCase().includes(q) ||
      lead.lead_category.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Target className="h-6 w-6 text-purple-600" />
            My Assigned Leads
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage your opportunities, follow-ups, and customer requirements
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadLeads}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs"
          >
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-700 shadow-sm transition"
          >
            <Plus className="h-4 w-4" />
            <span>+ Create Lead</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer, phone, lead #, requirement..."
            className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs font-medium text-slate-900 placeholder:text-slate-400 shadow-xs outline-none focus:border-purple-500"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs outline-none focus:border-purple-500"
          >
            <option value="all">All Statuses</option>
            {LEAD_STATUS_PIPELINE.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs outline-none focus:border-purple-500"
          >
            <option value="all">All Priorities</option>
            <option value="Hot">🔥 Hot</option>
            <option value="Warm">⚡ Warm</option>
            <option value="Cold">❄️ Cold</option>
          </select>
        </div>
      </div>

      {/* Leads List */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400">Loading assigned leads...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center space-y-2">
          <Target className="mx-auto h-10 w-10 text-slate-300" />
          <p className="text-base font-bold text-slate-800">No leads found</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            You currently have no leads matching this filter. New opportunities generated by Service Engineers will appear here when assigned to you.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((lead) => {
            const isWon = lead.status === 'WON';
            const isLost = lead.status === 'LOST';

            return (
              <div
                key={lead.id}
                className={`rounded-2xl border p-4 sm:p-5 bg-white shadow-xs transition hover:shadow-md ${
                  isWon
                    ? 'border-emerald-300 bg-emerald-50/15'
                    : isLost
                    ? 'border-slate-200 opacity-80'
                    : 'border-slate-200'
                }`}
              >
                {/* Header Row: Lead Number, Badges, Status Select */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-black text-purple-700">{lead.lead_number}</span>
                    <span className="rounded-lg bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-800 border border-slate-200">
                      {lead.lead_category}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase ${
                        lead.priority === 'Hot'
                          ? 'bg-red-100 text-red-700 border border-red-200'
                          : lead.priority === 'Warm'
                          ? 'bg-amber-100 text-amber-700 border border-amber-200'
                          : 'bg-blue-100 text-blue-700 border border-blue-200'
                      }`}
                    >
                      {lead.priority}
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">
                      Source: <strong>{lead.lead_source}</strong>
                    </span>
                  </div>

                  {/* Status Dropdown */}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-500">Status:</span>
                    <select
                      value={lead.status}
                      onChange={(e) => handleStatusChange(lead.id, e.target.value as LeadStatus)}
                      className={`rounded-xl px-2.5 py-1 text-xs font-bold uppercase outline-none border ${
                        isWon
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : isLost
                          ? 'bg-red-100 text-red-800 border-red-300'
                          : lead.status === 'QUOTATION'
                          ? 'bg-purple-100 text-purple-800 border-purple-300'
                          : 'bg-blue-50 text-blue-800 border-blue-200'
                      }`}
                    >
                      {LEAD_STATUS_PIPELINE.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Customer Details & Requirement */}
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-1 space-y-1">
                    <p className="font-black text-slate-900 text-base flex items-center gap-1.5">
                      <Building2 className="h-4 w-4 text-slate-400" />
                      {lead.customer_name}
                    </p>
                    {lead.company_name && (
                      <p className="text-xs text-slate-600 font-medium">{lead.company_name}</p>
                    )}
                    <p className="text-xs text-slate-600 flex items-center gap-1 font-mono pt-1">
                      <Phone className="h-3 w-3 text-emerald-600" />
                      {lead.mobile_number}
                    </p>
                    {lead.address && <p className="text-[11px] text-slate-400 truncate">{lead.address}</p>}
                  </div>

                  <div className="sm:col-span-2 space-y-2">
                    <div className="rounded-xl bg-slate-50 p-3 border border-slate-100 text-xs">
                      <p className="font-bold text-slate-900">Requirement:</p>
                      <p className="text-slate-700 mt-0.5">{lead.requirement}</p>
                      {lead.customer_remarks && (
                        <p className="text-[11px] text-slate-500 mt-1 italic">
                          Remarks: "{lead.customer_remarks}"
                        </p>
                      )}
                    </div>

                    {/* Attribution Badge: Who discovered it */}
                    <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-1">
                      <span className="flex items-center gap-1 font-medium bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60 text-amber-900">
                        <User className="h-3 w-3 text-amber-600" />
                        Discovered by: <strong>{lead.original_owner_name}</strong> (Engineer)
                        {lead.service_job_number ? ` via #${lead.service_job_number}` : ''}
                      </span>

                      {lead.estimated_value ? (
                        <span className="flex items-center gap-1 font-bold text-emerald-700 text-xs">
                          <IndianRupee className="h-3.5 w-3.5" />
                          ₹{lead.estimated_value.toLocaleString('en-IN')}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Follow-up / Action Strip */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                    <Clock className="h-3.5 w-3.5 text-purple-600" />
                    <span>
                      Next Follow-up:{' '}
                      <strong>{lead.next_followup_date || 'None scheduled'}</strong>{' '}
                      {lead.next_followup_time || ''}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`tel:${lead.mobile_number}`}
                      className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
                      title="Direct Call"
                    >
                      <Phone className="h-3 w-3" /> Call
                    </a>

                    <a
                      href={`https://wa.me/${lead.mobile_number.replace(/[^0-9]/g, '')}?text=Hi%20${encodeURIComponent(lead.customer_name)},%20regarding%20your%20${encodeURIComponent(lead.lead_category)}%20requirement%20with%20ICS...`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-xl bg-green-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-green-700 transition"
                      title="Chat on WhatsApp"
                    >
                      <MessageSquare className="h-3 w-3" /> WhatsApp
                    </a>

                    <button
                      onClick={() => setFollowupLead(lead)}
                      className="inline-flex items-center gap-1 rounded-xl bg-purple-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-purple-700 transition"
                    >
                      <Plus className="h-3 w-3" /> Log Follow-up
                    </button>

                    <button
                      onClick={() => openHistoryModal(lead)}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                    >
                      <History className="h-3 w-3" /> History
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Follow-up Logging Modal */}
      <LeadFollowupModal
        isOpen={!!followupLead}
        lead={followupLead}
        onClose={() => setFollowupLead(null)}
        onFollowupSaved={loadLeads}
      />

      {/* History Modal */}
      {historyLead && (
        <HistoryModal
          lead={historyLead}
          history={historyLogs}
          followups={pastFollowups}
          loading={historyLoading}
          onClose={() => setHistoryLead(null)}
        />
      )}

      {/* Create Lead Modal */}
      {profile && (
        <UniversalCreateLeadModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          userProfile={profile}
          onLeadCreated={() => {
            loadLeads();
          }}
        />
      )}
    </div>
  );
}

function HistoryModal({
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
  const [tab, setTab] = useState<'followups' | 'transfers'>('followups');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <History className="h-4 w-4 text-purple-400" />
              Lead Audit & History
            </h2>
            <p className="text-xs text-slate-400 font-mono">{lead.lead_number} • {lead.customer_name}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200 bg-slate-50 p-2 gap-2 shrink-0">
          <button
            onClick={() => setTab('followups')}
            className={`flex-1 rounded-xl py-1.5 text-xs font-bold transition ${
              tab === 'followups' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            Follow-up Notes ({followups.length})
          </button>
          <button
            onClick={() => setTab('transfers')}
            className={`flex-1 rounded-xl py-1.5 text-xs font-bold transition ${
              tab === 'transfers' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            Assignment Audit ({history.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading history logs...</div>
          ) : tab === 'followups' ? (
            followups.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">No follow-ups logged yet.</p>
            ) : (
              followups.map((f) => (
                <div key={f.id} className="rounded-2xl border border-slate-200 p-3.5 text-xs space-y-1 bg-slate-50/50">
                  <div className="flex items-center justify-between text-slate-500 font-medium">
                    <span className="font-bold text-purple-700">📞 {f.followup_type}</span>
                    <span className="font-mono">{f.followup_date} {f.followup_time || ''}</span>
                  </div>
                  <p className="text-slate-800 font-medium">{f.notes}</p>
                  {f.next_action && (
                    <p className="text-[11px] text-purple-700">Next: {f.next_action}</p>
                  )}
                  <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                    Logged by: {f.user_name}
                  </p>
                </div>
              ))
            )
          ) : history.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">No transfer history.</p>
          ) : (
            history.map((h) => (
              <div key={h.id} className="rounded-2xl border border-slate-200 p-3.5 text-xs space-y-1 bg-slate-50/50">
                <div className="flex items-center justify-between text-slate-500 font-medium">
                  <span className="font-bold uppercase text-slate-700">Action: {h.action}</span>
                  <span className="font-mono text-[10px]">{new Date(h.created_at).toLocaleString()}</span>
                </div>
                <p className="text-slate-800">
                  {h.from_user_name ? `${h.from_user_name} ➔ ` : ''}
                  <strong>{h.to_user_name}</strong>
                </p>
                {h.reason && <p className="text-[11px] text-slate-500">Reason: "{h.reason}"</p>}
                <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                  By: {h.transferred_by_name}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
