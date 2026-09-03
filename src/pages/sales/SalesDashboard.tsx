import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { fetchLeadsForUser, fetchAllLeads, fetchQuotations } from '@/lib/leads';
import type { Lead, Quotation } from '@/types/database';
import {
  Target,
  Flame,
  Calendar,
  AlertCircle,
  FileText,
  Trophy,
  IndianRupee,
  Percent,
  Phone,
  Building2,
  ArrowRight,
  Clock,
  Sparkles,
  Plus,
} from 'lucide-react';
import { UniversalCreateLeadModal } from '@/components/leads/UniversalCreateLeadModal';

interface SalesDashboardProps {
  onNavigate: (page: string) => void;
}

export function SalesDashboard({ onNavigate }: SalesDashboardProps) {
  const { profile } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadData();
  }, [profile?.id]);

  async function loadData() {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const [myLeads, allQuotes] = await Promise.all([
        fetchLeadsForUser(profile.id, 'sales_executive'),
        fetchQuotations(),
      ]);
      setLeads(myLeads);
      setQuotations(allQuotes.filter((q) => q.created_by === profile.id));
    } catch (err) {
      console.error('Sales dashboard error:', err);
    } finally {
      setLoading(false);
    }
  }

  const todayStr = new Date().toISOString().split('T')[0];

  // Metrics
  const newLeads = leads.filter((l) => l.status === 'NEW').length;
  const hotLeads = leads.filter((l) => l.priority === 'Hot' && l.status !== 'WON' && l.status !== 'LOST').length;

  const todayFollowups = leads.filter(
    (l) => l.next_followup_date === todayStr && l.status !== 'WON' && l.status !== 'LOST'
  );

  const overdueFollowups = leads.filter(
    (l) =>
      l.next_followup_date &&
      l.next_followup_date < todayStr &&
      l.status !== 'WON' &&
      l.status !== 'LOST'
  );

  const pendingQuotations = leads.filter((l) => l.status === 'QUOTATION').length;
  const wonLeads = leads.filter((l) => l.status === 'WON').length;
  const lostLeads = leads.filter((l) => l.status === 'LOST').length;

  const wonSalesValue = leads
    .filter((l) => l.status === 'WON')
    .reduce((s, l) => s + (l.estimated_value || 0), 0);

  const totalLeadValue = leads
    .filter((l) => l.status !== 'LOST')
    .reduce((s, l) => s + (l.estimated_value || 0), 0);

  const closedCount = wonLeads + lostLeads;
  const conversionRate = closedCount > 0 ? Math.round((wonLeads / closedCount) * 100) : 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Welcome Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-purple-700 via-indigo-700 to-slate-900 p-6 text-white shadow-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/30 px-3 py-1 text-xs font-bold text-purple-200 border border-purple-400/30">
            <Sparkles className="h-3 w-3" /> Sales Executive Hub
          </span>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight mt-2">
            Welcome back, {profile?.full_name}
          </h1>
          <p className="text-xs sm:text-sm text-purple-200 mt-1 max-w-xl">
            You have <strong>{todayFollowups.length} follow-ups scheduled for today</strong> and{' '}
            <strong>{newLeads} new assigned leads</strong> waiting for your attention.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowCreateModal(true)}
            className="self-start sm:self-center inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 px-5 py-3 text-xs font-black uppercase text-slate-950 shadow-lg shadow-orange-500/20 hover:from-amber-300 hover:to-orange-400 transition shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>+ Create Lead</span>
          </button>
          <button
            onClick={() => onNavigate('leads')}
            className="self-start sm:self-center inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-xs font-black uppercase text-purple-900 shadow-md hover:bg-purple-50 transition shrink-0"
          >
            <span>View My Leads</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div
          onClick={() => onNavigate('leads')}
          className="cursor-pointer rounded-2xl border border-blue-200 bg-blue-50/70 p-4 shadow-xs hover:border-blue-300 transition"
        >
          <div className="flex items-center justify-between text-blue-600">
            <span className="text-[11px] font-bold uppercase tracking-wider">New Leads</span>
            <Target className="h-4 w-4" />
          </div>
          <p className="text-2xl font-black text-blue-900 mt-1.5">{newLeads}</p>
          <p className="text-[10px] text-blue-700 font-medium">Ready for contact</p>
        </div>

        <div
          onClick={() => onNavigate('leads')}
          className="cursor-pointer rounded-2xl border border-red-200 bg-red-50/70 p-4 shadow-xs hover:border-red-300 transition"
        >
          <div className="flex items-center justify-between text-red-600">
            <span className="text-[11px] font-bold uppercase tracking-wider">Hot Leads</span>
            <Flame className="h-4 w-4" />
          </div>
          <p className="text-2xl font-black text-red-900 mt-1.5">{hotLeads}</p>
          <p className="text-[10px] text-red-700 font-medium">Urgent deals</p>
        </div>

        <div
          onClick={() => onNavigate('followups')}
          className="cursor-pointer rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-xs hover:border-amber-300 transition"
        >
          <div className="flex items-center justify-between text-amber-700">
            <span className="text-[11px] font-bold uppercase tracking-wider">Today's Calls</span>
            <Calendar className="h-4 w-4" />
          </div>
          <p className="text-2xl font-black text-amber-900 mt-1.5">{todayFollowups.length}</p>
          <p className="text-[10px] text-amber-700 font-medium">Due today</p>
        </div>

        <div
          onClick={() => onNavigate('followups')}
          className="cursor-pointer rounded-2xl border border-rose-300 bg-rose-50/80 p-4 shadow-xs hover:border-rose-400 transition"
        >
          <div className="flex items-center justify-between text-rose-700">
            <span className="text-[11px] font-bold uppercase tracking-wider">Overdue</span>
            <AlertCircle className="h-4 w-4" />
          </div>
          <p className="text-2xl font-black text-rose-900 mt-1.5">{overdueFollowups.length}</p>
          <p className="text-[10px] text-rose-700 font-medium">Action needed</p>
        </div>

        <div
          onClick={() => onNavigate('quotations')}
          className="cursor-pointer rounded-2xl border border-purple-200 bg-purple-50/70 p-4 shadow-xs hover:border-purple-300 transition"
        >
          <div className="flex items-center justify-between text-purple-700">
            <span className="text-[11px] font-bold uppercase tracking-wider">Quotations</span>
            <FileText className="h-4 w-4" />
          </div>
          <p className="text-2xl font-black text-purple-900 mt-1.5">{pendingQuotations}</p>
          <p className="text-[10px] text-purple-700 font-medium">In negotiation</p>
        </div>
      </div>

      {/* Financial Performance Strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-xs font-bold uppercase tracking-wider">Won Sales Value</span>
            <Trophy className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-emerald-900 mt-2">
            ₹{wonSalesValue.toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-emerald-700 font-medium mt-1">
            {wonLeads} deals successfully closed
          </p>
        </div>

        <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-indigo-700">
            <span className="text-xs font-bold uppercase tracking-wider">Active Pipeline Value</span>
            <IndianRupee className="h-5 w-5 text-indigo-600" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-indigo-900 mt-2">
            ₹{totalLeadValue.toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-indigo-700 font-medium mt-1">
            Across {leads.filter((l) => l.status !== 'WON' && l.status !== 'LOST').length} active leads
          </p>
        </div>

        <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-purple-700">
            <span className="text-xs font-bold uppercase tracking-wider">Conversion Rate</span>
            <Percent className="h-5 w-5 text-purple-600" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-purple-900 mt-2">{conversionRate}%</p>
          <p className="text-xs text-purple-700 font-medium mt-1">
            {wonLeads} won out of {closedCount} closed
          </p>
        </div>
      </div>

      {/* ─── Today's Follow-up Agenda ─── */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-amber-500" />
              Today's Scheduled Follow-ups
            </h2>
            <p className="text-xs text-slate-500">
              Customers expecting a phone call, visit, or quotation follow-up today
            </p>
          </div>
          <button
            onClick={() => onNavigate('followups')}
            className="text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1"
          >
            <span>View All Agenda</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {todayFollowups.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            No follow-ups due today. You're all caught up!
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {todayFollowups.map((lead) => (
              <div
                key={lead.id}
                className="rounded-2xl border border-slate-200 p-4 bg-slate-50/60 hover:bg-purple-50/40 hover:border-purple-200 transition flex items-center justify-between gap-3 shadow-xs"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-bold text-purple-700">{lead.lead_number}</span>
                    <span className="rounded bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                      {lead.lead_category}
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-extrabold uppercase ${
                        lead.priority === 'Hot' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {lead.priority}
                    </span>
                  </div>

                  <p className="font-bold text-slate-900 text-sm mt-1 flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-slate-400" />
                    {lead.customer_name}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5 truncate max-w-xs">{lead.requirement}</p>

                  <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1 font-mono">
                    <Clock className="h-3 w-3" /> Due Today {lead.next_followup_time || ''}
                  </p>
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  <a
                    href={`tel:${lead.mobile_number}`}
                    className="inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition"
                  >
                    <Phone className="h-3 w-3" /> Call
                  </a>
                  <button
                    onClick={() => onNavigate('leads')}
                    className="inline-flex items-center justify-center rounded-xl bg-white border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Overdue Follow-ups Alert Callout ─── */}
      {overdueFollowups.length > 0 && (
        <div className="rounded-2xl border border-red-300 bg-red-50/90 p-4 text-xs text-red-900 shadow-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white font-bold shrink-0">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="font-extrabold text-sm text-red-950">
                You have {overdueFollowups.length} overdue follow-ups!
              </p>
              <p className="text-red-700 text-xs mt-0.5">
                These customers had scheduled follow-up dates in the past. Re-connect today to keep the opportunity active.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('followups')}
            className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-red-700 transition shrink-0"
          >
            Review Overdue
          </button>
        </div>
      )}

      {/* ─── CREATE LEAD MODAL ─── */}
      {profile && (
        <UniversalCreateLeadModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          userProfile={profile}
          onLeadCreated={() => {
            loadData();
          }}
        />
      )}
    </div>
  );
}
