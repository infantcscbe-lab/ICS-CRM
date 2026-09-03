import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { fetchLeadsForUser } from '@/lib/leads';
import type { Lead } from '@/types/database';
import {
  Sparkles,
  Search,
  IndianRupee,
  Building2,
  Calendar,
  Briefcase,
  User,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Phone,
  Plus,
} from 'lucide-react';
import { UniversalCreateLeadModal } from '@/components/leads/UniversalCreateLeadModal';

export function EngineerLeads() {
  const { profile } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'won' | 'lost'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadLeads();
  }, [profile?.id]);

  async function loadLeads() {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const userLeads = await fetchLeadsForUser(profile.id, 'engineer');
      setLeads(userLeads);
    } catch (err) {
      console.error('Failed to load engineer leads:', err);
    } finally {
      setLoading(false);
    }
  }

  // Summary Metrics
  const totalLeads = leads.length;
  const wonLeads = leads.filter((l) => l.status === 'WON').length;
  const wonValue = leads
    .filter((l) => l.status === 'WON')
    .reduce((s, l) => s + (l.estimated_value || 0), 0);
  const pipelineValue = leads
    .filter((l) => l.status !== 'WON' && l.status !== 'LOST')
    .reduce((s, l) => s + (l.estimated_value || 0), 0);

  // Filtered List
  const filtered = leads.filter((l) => {
    if (statusFilter === 'active' && (l.status === 'WON' || l.status === 'LOST')) return false;
    if (statusFilter === 'won' && l.status !== 'WON') return false;
    if (statusFilter === 'lost' && l.status !== 'LOST') return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchNum = l.lead_number.toLowerCase().includes(q);
      const matchCust = l.customer_name.toLowerCase().includes(q);
      const matchReq = l.requirement.toLowerCase().includes(q);
      const matchCat = l.lead_category.toLowerCase().includes(q);
      return matchNum || matchCust || matchReq || matchCat;
    }
    return true;
  });

  return (
    <div className="space-y-4 pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            My Generated Leads
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Opportunities you identified during field service visits or direct customer discussions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadLeads}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 shadow-xs"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:from-amber-600 hover:to-orange-700 transition"
          >
            <Plus className="h-4 w-4" />
            <span>+ Create Lead</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Leads Logged</p>
          <p className="text-xl font-black text-slate-900 mt-1">{totalLeads}</p>
          <p className="text-[10px] text-slate-400 font-medium">By you on service calls</p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-xs">
          <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Won Deals</p>
          <p className="text-xl font-black text-emerald-700 mt-1">{wonLeads}</p>
          <p className="text-[10px] text-emerald-600/80 font-medium">Converted to sales</p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 shadow-xs">
          <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">Won Sales Value</p>
          <p className="text-lg font-black text-amber-900 mt-1">₹{wonValue.toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-amber-700/80 font-medium">Eligible for incentive</p>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-3 shadow-xs">
          <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Active Pipeline</p>
          <p className="text-lg font-black text-blue-900 mt-1">₹{pipelineValue.toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-blue-600/80 font-medium">In follow-up / quotation</p>
        </div>
      </div>

      {/* Search & Status Filter */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads, customer, or category..."
            className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs font-medium text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        <div className="flex gap-1 rounded-xl bg-slate-200/80 p-1">
          {(['all', 'active', 'won', 'lost'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`flex-1 rounded-lg py-1 text-xs font-bold capitalize transition ${
                statusFilter === tab
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab === 'all' ? 'All' : tab}
            </button>
          ))}
        </div>
      </div>

      {/* Lead Cards List */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400">Loading your leads...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center space-y-3">
          <Sparkles className="mx-auto h-8 w-8 text-amber-500" />
          <div>
            <p className="text-sm font-bold text-slate-800">No leads logged yet</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-0.5">
              Discovered a customer needing computers, CCTV, laptops, networking, or AMC? Log it anytime to earn incentive credit.
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:from-amber-600 hover:to-orange-700 transition"
          >
            <Plus className="h-4 w-4" />
            <span>+ Create Opportunity Now</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((lead) => {
            const isWon = lead.status === 'WON';
            const isLost = lead.status === 'LOST';

            return (
              <div
                key={lead.id}
                className={`rounded-2xl border p-4 shadow-sm bg-white transition hover:shadow-md ${
                  isWon
                    ? 'border-emerald-300 bg-emerald-50/20'
                    : isLost
                    ? 'border-slate-200 opacity-75'
                    : 'border-slate-200'
                }`}
              >
                {/* Top Row: Lead Number, Category, Priority, Status */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-amber-600">{lead.lead_number}</span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                        {lead.lead_category}
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-extrabold uppercase ${
                          lead.priority === 'Hot'
                            ? 'bg-red-100 text-red-700 border border-red-200'
                            : lead.priority === 'Warm'
                            ? 'bg-amber-100 text-amber-700 border border-amber-200'
                            : 'bg-blue-100 text-blue-700 border border-blue-200'
                        }`}
                      >
                        {lead.priority}
                      </span>
                    </div>
                    <p className="text-sm font-black text-slate-900 mt-1 flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-slate-400" />
                      {lead.customer_name} {lead.company_name ? `(${lead.company_name})` : ''}
                    </p>
                  </div>

                  <span
                    className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase shrink-0 ${
                      isWon
                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                        : isLost
                        ? 'bg-red-100 text-red-700 border border-red-200'
                        : lead.status === 'QUOTATION'
                        ? 'bg-purple-100 text-purple-700 border border-purple-200'
                        : 'bg-blue-100 text-blue-700 border border-blue-200'
                    }`}
                  >
                    {lead.status}
                  </span>
                </div>

                {/* Requirement */}
                <div className="mt-2.5 rounded-xl bg-slate-50 p-2.5 text-xs text-slate-800 border border-slate-100">
                  <p className="font-semibold text-slate-900">{lead.requirement}</p>
                  {lead.customer_remarks && (
                    <p className="text-[11px] text-slate-500 mt-1 italic">
                      Remarks: "{lead.customer_remarks}"
                    </p>
                  )}
                </div>

                {/* Metadata Details */}
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-600 font-medium">
                  {lead.estimated_value ? (
                    <p className="flex items-center gap-1 font-bold text-slate-900">
                      <IndianRupee className="h-3.5 w-3.5 text-emerald-600" />
                      ₹{lead.estimated_value.toLocaleString('en-IN')}
                    </p>
                  ) : (
                    <p className="text-slate-400">Budget: Not specified</p>
                  )}

                  {lead.service_job_number && (
                    <p className="flex items-center gap-1 text-slate-500">
                      <Briefcase className="h-3 w-3 text-blue-500" />
                      From Job #{lead.service_job_number}
                    </p>
                  )}

                  <p className="flex items-center gap-1 text-slate-500">
                    <User className="h-3 w-3 text-amber-600" />
                    Handler: <strong>{lead.current_owner_name || 'Unassigned'}</strong>
                  </p>

                  <p className="flex items-center gap-1 text-slate-500">
                    <Calendar className="h-3 w-3 text-slate-400" />
                    {new Date(lead.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── CREATE LEAD MODAL (ANYTIME FOR ENGINEER) ─── */}
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
