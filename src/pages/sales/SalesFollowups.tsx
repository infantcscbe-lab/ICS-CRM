import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { fetchLeadsForUser } from '@/lib/leads';
import type { Lead } from '@/types/database';
import {
  Calendar,
  AlertCircle,
  Clock,
  Phone,
  Building2,
  CheckCircle2,
  CalendarCheck,
  RefreshCw,
  MessageSquare,
  Sparkles,
  Plus,
  ArrowRight,
} from 'lucide-react';
import { LeadFollowupModal } from '@/components/leads/LeadFollowupModal';

export function SalesFollowups() {
  const { profile } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  useEffect(() => {
    loadData();
  }, [profile?.id]);

  async function loadData() {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const data = await fetchLeadsForUser(profile.id, 'sales_executive');
      setLeads(data);
    } catch (err) {
      console.error('Error fetching followups:', err);
    } finally {
      setLoading(false);
    }
  }

  const todayStr = new Date().toISOString().split('T')[0];

  const activeLeads = leads.filter((l) => l.status !== 'WON' && l.status !== 'LOST');

  const overdueFollowups = activeLeads.filter(
    (l) => l.next_followup_date && l.next_followup_date < todayStr
  );
  const todayFollowups = activeLeads.filter((l) => l.next_followup_date === todayStr);
  const upcomingFollowups = activeLeads.filter(
    (l) => l.next_followup_date && l.next_followup_date > todayStr
  );
  const unscheduledLeads = activeLeads.filter((l) => !l.next_followup_date);

  function getCleanWhatsAppUrl(phone: string, name: string, category: string) {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const formatted = cleanPhone.startsWith('91')
      ? cleanPhone
      : cleanPhone.length === 10
      ? `91${cleanPhone}`
      : cleanPhone;
    return `https://wa.me/${formatted}?text=Hi%20${encodeURIComponent(
      name
    )},%20following%20up%20on%20your%20${encodeURIComponent(category)}%20requirement%20with%20ICS...`;
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <CalendarCheck className="h-6 w-6 text-purple-600" />
            Follow-up Reminders & Agenda
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Never miss a customer touchpoint. Track today's calls, overdue alerts, and scheduled visits.
          </p>
        </div>

        <button
          onClick={loadData}
          className="self-start sm:self-center flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh Schedule</span>
        </button>
      </div>

      {/* ─── 1. OVERDUE FOLLOW-UPS ─── */}
      {overdueFollowups.length > 0 && (
        <div className="rounded-3xl border-2 border-red-300 bg-red-50/50 p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-red-800">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <h2 className="text-base font-black uppercase tracking-wide">
              Overdue Follow-ups ({overdueFollowups.length})
            </h2>
          </div>
          <p className="text-xs text-red-700">
            These scheduled customer follow-up dates have passed. Call or WhatsApp them today to prevent lost opportunities.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {overdueFollowups.map((lead) => (
              <div
                key={lead.id}
                className="rounded-2xl border border-red-200 bg-white p-4 shadow-xs flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-red-600">{lead.lead_number}</span>
                    <span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                      Overdue: {lead.next_followup_date}
                    </span>
                  </div>
                  <p className="font-bold text-slate-900 text-sm mt-1">{lead.customer_name}</p>
                  {lead.company_name && (
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> {lead.company_name}
                    </p>
                  )}
                  <p className="text-xs text-slate-600 mt-1 line-clamp-2">{lead.requirement}</p>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-slate-500">{lead.mobile_number}</span>
                  <div className="flex items-center gap-1.5">
                    <a
                      href={`tel:${lead.mobile_number}`}
                      className="rounded-xl bg-emerald-600 p-2 text-white shadow-xs hover:bg-emerald-700 transition"
                      title="Call Customer"
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </a>
                    <a
                      href={getCleanWhatsAppUrl(lead.mobile_number, lead.customer_name, lead.lead_category)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl bg-green-600 p-2 text-white shadow-xs hover:bg-green-700 transition"
                      title="WhatsApp Chat"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                    </a>
                    <button
                      onClick={() => setSelectedLead(lead)}
                      className="rounded-xl bg-purple-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-purple-700 transition"
                    >
                      Log Notes
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── 2. TODAY'S SCHEDULE ─── */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-slate-900">
            <Calendar className="h-5 w-5 text-amber-500" />
            <h2 className="text-base font-black">Today's Scheduled Follow-ups ({todayFollowups.length})</h2>
          </div>
          <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
            {todayStr}
          </span>
        </div>

        {todayFollowups.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-1.5" />
            No follow-ups due today. You are all caught up!
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {todayFollowups.map((lead) => (
              <div
                key={lead.id}
                className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 shadow-xs flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-purple-700">{lead.lead_number}</span>
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-200/70 px-2 py-0.5 rounded-full">
                      {lead.next_followup_time || 'Today'}
                    </span>
                  </div>
                  <p className="font-bold text-slate-900 text-sm mt-1">{lead.customer_name}</p>
                  {lead.company_name && (
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> {lead.company_name}
                    </p>
                  )}
                  <p className="text-xs text-slate-600 mt-1 line-clamp-2">{lead.requirement}</p>
                </div>

                <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-slate-600">{lead.mobile_number}</span>
                  <div className="flex items-center gap-1.5">
                    <a
                      href={`tel:${lead.mobile_number}`}
                      className="rounded-xl bg-emerald-600 p-2 text-white shadow-xs hover:bg-emerald-700 transition"
                      title="Call Customer"
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </a>
                    <a
                      href={getCleanWhatsAppUrl(lead.mobile_number, lead.customer_name, lead.lead_category)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl bg-green-600 p-2 text-white shadow-xs hover:bg-green-700 transition"
                      title="WhatsApp Chat"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                    </a>
                    <button
                      onClick={() => setSelectedLead(lead)}
                      className="rounded-xl bg-purple-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-purple-700 transition"
                    >
                      Log Notes
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── 3. UPCOMING SCHEDULE ─── */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
        <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
          <Clock className="h-5 w-5 text-blue-500" />
          Upcoming Follow-ups ({upcomingFollowups.length})
        </h2>

        {upcomingFollowups.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">No future follow-ups scheduled.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {upcomingFollowups.map((lead) => (
              <div key={lead.id} className="py-3 flex items-center justify-between text-xs gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-purple-700">{lead.lead_number}</span>
                    <span className="font-bold text-slate-900 truncate">{lead.customer_name}</span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 font-semibold shrink-0">
                      {lead.lead_category}
                    </span>
                  </div>
                  <p className="text-slate-500 text-[11px] mt-0.5 truncate">{lead.requirement}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 font-mono text-[11px]">
                    {lead.next_followup_date} {lead.next_followup_time || ''}
                  </span>
                  <button
                    onClick={() => setSelectedLead(lead)}
                    className="rounded-lg bg-slate-100 hover:bg-slate-200 p-1.5 text-slate-700 font-bold transition text-[11px]"
                  >
                    View / Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── 4. UNSCHEDULED LEADS (NEEDS FIRST TOUCHPOINT) ─── */}
      {unscheduledLeads.length > 0 && (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/70 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              Unscheduled Leads ({unscheduledLeads.length})
            </h2>
            <span className="text-[11px] text-slate-500">New leads awaiting first scheduled follow-up</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {unscheduledLeads.map((lead) => (
              <div
                key={lead.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col justify-between space-y-2"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-purple-700">{lead.lead_number}</span>
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                      Status: {lead.status}
                    </span>
                  </div>
                  <p className="font-bold text-slate-900 text-sm mt-1">{lead.customer_name}</p>
                  <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{lead.requirement}</p>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-500">{lead.mobile_number}</span>
                  <button
                    onClick={() => setSelectedLead(lead)}
                    className="rounded-xl bg-purple-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-purple-700 transition"
                  >
                    + Schedule Follow-up
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── FOLLOW-UP MODAL ─── */}
      <LeadFollowupModal
        isOpen={!!selectedLead}
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        onFollowupSaved={loadData}
      />
    </div>
  );
}
