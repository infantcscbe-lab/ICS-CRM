import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { fetchLeadsForUser, addLeadFollowup, updateLeadStatus } from '@/lib/leads';
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
} from 'lucide-react';

export function SalesFollowups() {
  const { profile } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

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

  const todayFollowups = activeLeads.filter((l) => l.next_followup_date === todayStr);
  const overdueFollowups = activeLeads.filter(
    (l) => l.next_followup_date && l.next_followup_date < todayStr
  );
  const upcomingFollowups = activeLeads.filter(
    (l) => l.next_followup_date && l.next_followup_date > todayStr
  );
  const unscheduledLeads = activeLeads.filter((l) => !l.next_followup_date);

  async function handleQuickComplete(lead: Lead) {
    if (!profile) return;
    const note = prompt('Enter follow-up outcome note:');
    if (note === null || !note.trim()) return;

    try {
      await addLeadFollowup({
        lead_id: lead.id,
        user_id: profile.id,
        user_name: profile.full_name,
        followup_date: todayStr,
        followup_type: 'Phone Call',
        notes: note.trim(),
        status: 'Completed',
      });
      alert('Follow-up recorded successfully!');
      loadData();
    } catch {
      alert('Failed to record follow-up');
    }
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
          className="self-start sm:self-center rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs"
        >
          Refresh Schedule
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
            These scheduled customer follow-up dates have passed. Call them today to prevent lost opportunities.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {overdueFollowups.map((lead) => (
              <div
                key={lead.id}
                className="rounded-2xl border border-red-200 bg-white p-4 shadow-xs flex flex-col justify-between space-y-2"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-red-600">{lead.lead_number}</span>
                    <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                      Due: {lead.next_followup_date}
                    </span>
                  </div>
                  <p className="font-bold text-slate-900 text-sm mt-1">{lead.customer_name}</p>
                  <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{lead.requirement}</p>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-500 flex items-center gap-1">
                    <Phone className="h-3 w-3 text-emerald-600" /> {lead.mobile_number}
                  </span>
                  <div className="flex gap-2">
                    <a
                      href={`tel:${lead.mobile_number}`}
                      className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700"
                    >
                      Call
                    </a>
                    <button
                      onClick={() => handleQuickComplete(lead)}
                      className="rounded-xl bg-purple-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-purple-700"
                    >
                      Done
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
            <h2 className="text-base font-black">Today's Follow-ups ({todayFollowups.length})</h2>
          </div>
          <span className="text-xs font-mono text-slate-400">{todayStr}</span>
        </div>

        {todayFollowups.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">
            No follow-ups due today. You are all set!
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {todayFollowups.map((lead) => (
              <div
                key={lead.id}
                className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 shadow-xs flex flex-col justify-between space-y-2"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-purple-700">{lead.lead_number}</span>
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-200/60 px-2 py-0.5 rounded-full">
                      {lead.next_followup_time || 'Today'}
                    </span>
                  </div>
                  <p className="font-bold text-slate-900 text-sm mt-1">{lead.customer_name}</p>
                  <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{lead.requirement}</p>
                </div>

                <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-600">{lead.mobile_number}</span>
                  <div className="flex gap-2">
                    <a
                      href={`tel:${lead.mobile_number}`}
                      className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700"
                    >
                      Call
                    </a>
                    <button
                      onClick={() => handleQuickComplete(lead)}
                      className="rounded-xl bg-purple-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-purple-700"
                    >
                      Done
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
              <div key={lead.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-purple-700">{lead.lead_number}</span>
                    <span className="font-bold text-slate-900">{lead.customer_name}</span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 font-semibold">
                      {lead.lead_category}
                    </span>
                  </div>
                  <p className="text-slate-500 text-[11px] mt-0.5">{lead.requirement}</p>
                </div>
                <div className="text-right">
                  <span className="font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 font-mono">
                    {lead.next_followup_date} {lead.next_followup_time || ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
