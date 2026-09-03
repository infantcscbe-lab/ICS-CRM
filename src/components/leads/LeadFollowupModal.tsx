import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { addLeadFollowup, fetchFollowupsForLead, canUserFollowupLead } from '@/lib/leads';
import type { Lead, LeadFollowup, LeadStatus } from '@/types/database';
import {
  X,
  Phone,
  MessageSquare,
  Calendar,
  Clock,
  Send,
  Building2,
  User,
  History,
  CheckCircle2,
  Sparkles,
  Loader2,
  ExternalLink,
  Lock,
} from 'lucide-react';

interface LeadFollowupModalProps {
  isOpen: boolean;
  lead: Lead | null;
  onClose: () => void;
  onFollowupSaved: () => void;
}

export function LeadFollowupModal({
  isOpen,
  lead,
  onClose,
  onFollowupSaved,
}: LeadFollowupModalProps) {
  const { profile } = useAuth();
  const todayStr = new Date().toISOString().split('T')[0];

  const canLogFollowup = canUserFollowupLead(profile, lead);

  const [activeTab, setActiveTab] = useState<'log' | 'history'>('log');
  const [followupType, setFollowupType] = useState<LeadFollowup['followup_type']>('Phone Call');
  const [notes, setNotes] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [nextTime, setNextTime] = useState('');
  const [updateStatus, setUpdateStatus] = useState<LeadStatus>(lead?.status || 'FOLLOW-UP');
  const [submitting, setSubmitting] = useState(false);

  // Past follow-ups
  const [pastFollowups, setPastFollowups] = useState<LeadFollowup[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (lead) {
      setUpdateStatus(
        lead.status === 'NEW' || lead.status === 'CONTACTED' ? 'FOLLOW-UP' : lead.status
      );
      setNotes('');
      setNextAction('');
      setNextDate('');
      setNextTime('');
      setActiveTab(canLogFollowup ? 'log' : 'history');

      // Load past touchpoints
      setLoadingHistory(true);
      fetchFollowupsForLead(lead.id)
        .then((data) => setPastFollowups(data))
        .finally(() => setLoadingHistory(false));
    }
  }, [lead?.id, canLogFollowup]);

  if (!isOpen || !lead) return null;

  const cleanPhone = lead.mobile_number.replace(/[^0-9]/g, '');
  const formattedWaNumber = cleanPhone.startsWith('91')
    ? cleanPhone
    : cleanPhone.length === 10
    ? `91${cleanPhone}`
    : cleanPhone;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !lead) return;
    if (!canLogFollowup) {
      alert('Only Admin, or the assigned Sales Executive/Engineer can log follow-ups for this lead.');
      return;
    }
    if (!notes.trim()) {
      alert('Please enter follow-up discussion notes.');
      return;
    }

    setSubmitting(true);
    try {
      await addLeadFollowup({
        lead_id: lead.id,
        user_id: profile.id,
        user_name: profile.full_name,
        followup_date: todayStr,
        followup_type: followupType,
        notes: notes.trim(),
        next_action: nextAction.trim() || undefined,
        next_followup_date: nextDate || undefined,
        next_followup_time: nextTime || undefined,
        updateLeadStatusTo: updateStatus,
      });

      onFollowupSaved();
      onClose();
    } catch (err: any) {
      alert(`Failed to save follow-up: ${err?.message || err}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[92vh] my-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-700 via-indigo-700 to-slate-900 px-6 py-4 text-white shrink-0 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider bg-purple-500/30 px-2 py-0.5 rounded-full border border-purple-400/30">
                {lead.lead_number}
              </span>
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-semibold">
                {lead.lead_category}
              </span>
            </div>
            <h2 className="text-lg font-black tracking-tight mt-1">{lead.customer_name}</h2>
            {lead.company_name && (
              <p className="text-xs text-purple-200 flex items-center gap-1">
                <Building2 className="h-3 w-3" /> {lead.company_name}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-white/80 hover:bg-white/20 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Quick Contact & Info Strip */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-2.5 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-600">
            <span className="font-mono font-bold text-slate-800">{lead.mobile_number}</span>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={`tel:${lead.mobile_number}`}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
              title="Direct Call"
            >
              <Phone className="h-3.5 w-3.5" />
              <span>Call</span>
            </a>
            <a
              href={`https://wa.me/${formattedWaNumber}?text=Hi%20${encodeURIComponent(
                lead.customer_name
              )},%20regarding%20your%20${encodeURIComponent(
                lead.lead_category
              )}%20requirement%20with%20ICS...`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-bold text-white shadow-xs hover:bg-green-700 transition"
              title="Chat on WhatsApp"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>WhatsApp</span>
            </a>
          </div>
        </div>

        {/* Tabs: Log Follow-up vs History */}
        <div className="flex border-b border-slate-200 bg-white shrink-0">
          {canLogFollowup ? (
            <button
              type="button"
              onClick={() => setActiveTab('log')}
              className={`flex-1 py-3 text-xs font-bold transition border-b-2 text-center ${
                activeTab === 'log'
                  ? 'border-purple-600 text-purple-700 bg-purple-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              + Log New Follow-up
            </button>
          ) : (
            <div className="flex-1 py-3 text-xs font-semibold text-slate-400 bg-slate-50/70 text-center flex items-center justify-center gap-1.5 border-b-2 border-transparent">
              <Lock className="h-3.5 w-3.5 text-slate-400" />
              <span>Log Follow-up (Owner/Admin only)</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-3 text-xs font-bold transition border-b-2 text-center flex items-center justify-center gap-1.5 ${
              activeTab === 'history'
                ? 'border-purple-600 text-purple-700 bg-purple-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>Past Timeline ({pastFollowups.length})</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {!canLogFollowup && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-xs text-amber-900 flex items-start gap-2">
              <Lock className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <strong className="block font-bold">Read-Only Follow-up View</strong>
                <span>Only an Admin, the assigned Sales Executive, or the discovering Engineer can log follow-ups for this lead.</span>
              </div>
            </div>
          )}
          {activeTab === 'history' ? (
            /* Follow-up Timeline View */
            <div className="space-y-4">
              {loadingHistory ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-purple-600 mb-2" />
                  Loading history...
                </div>
              ) : pastFollowups.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-400 text-xs">
                  No previous follow-ups logged for this lead yet.
                </div>
              ) : (
                <div className="relative border-l-2 border-purple-200 ml-4 pl-4 space-y-5">
                  {pastFollowups.map((f) => (
                    <div key={f.id} className="relative group">
                      <div className="absolute -left-[23px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-purple-600 shadow-xs" />
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-slate-900 flex items-center gap-1">
                            <User className="h-3 w-3 text-purple-600" />
                            {f.user_name}
                          </span>
                          <span className="font-mono text-slate-400">
                            {new Date(f.created_at).toLocaleDateString()} {new Date(f.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded text-[10px]">
                            {f.followup_type}
                          </span>
                        </div>
                        <p className="text-slate-700 text-xs font-medium whitespace-pre-wrap">{f.notes}</p>
                        {f.next_action && (
                          <p className="text-amber-800 text-[11px] bg-amber-50 rounded-lg p-2 border border-amber-200">
                            <strong>Next Action:</strong> {f.next_action}
                            {f.next_followup_date && ` (Due: ${f.next_followup_date})`}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Follow-up Logging Form */
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {/* Interaction Mode */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Follow-up Channel / Mode
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['Phone Call', 'Customer Visit', 'WhatsApp', 'Email'] as LeadFollowup['followup_type'][]).map(
                    (mode) => {
                      const isSelected = followupType === mode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setFollowupType(mode)}
                          className={`rounded-xl py-2 px-1 text-center font-bold text-[11px] transition border ${
                            isSelected
                              ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {mode === 'Phone Call'
                            ? '📞 Phone'
                            : mode === 'Customer Visit'
                            ? '🚗 Visit'
                            : mode === 'WhatsApp'
                            ? '💬 WhatsApp'
                            : '✉️ Email'}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              {/* Discussion & Outcome Notes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Discussion & Outcome Notes <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="What did the customer say? e.g. Customer is comparing with local dealer, wants revised quote with 8-channel NVR..."
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-900 outline-none focus:border-purple-500"
                />
              </div>

              {/* Lead Stage Progression */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Update Pipeline Stage</label>
                <select
                  value={updateStatus}
                  onChange={(e) => setUpdateStatus(e.target.value as LeadStatus)}
                  className="w-full rounded-xl border border-slate-300 bg-white p-2.5 font-bold text-slate-900 outline-none focus:border-purple-500"
                >
                  <option value="CONTACTED">CONTACTED — Spoke with customer</option>
                  <option value="REQUIREMENT IDENTIFIED">REQUIREMENT IDENTIFIED — Specs confirmed</option>
                  <option value="FOLLOW-UP">FOLLOW-UP — Ongoing discussion</option>
                  <option value="QUOTATION">QUOTATION — Quotation sent / requested</option>
                  <option value="NEGOTIATION">NEGOTIATION — Discussing pricing & terms</option>
                  <option value="WON">WON 🏆 — Customer approved order!</option>
                  <option value="LOST">LOST ❌ — Deal cancelled</option>
                </select>
              </div>

              {/* Next Action Plan */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Next Action Plan</label>
                <input
                  type="text"
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                  placeholder="e.g. Prepare formal quote with GST, visit site for wiring audit"
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-900 outline-none focus:border-purple-500"
                />
              </div>

              {/* Schedule Next Follow-up Date & Time */}
              <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-3.5 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-purple-900">
                  <Calendar className="h-4 w-4 text-purple-600" />
                  <span>Schedule Next Follow-up</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      min={todayStr}
                      value={nextDate}
                      onChange={(e) => setNextDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white p-2 text-slate-900 outline-none focus:border-purple-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Time / Slot
                    </label>
                    <input
                      type="text"
                      value={nextTime}
                      onChange={(e) => setNextTime(e.target.value)}
                      placeholder="e.g. 11:30 AM, Evening"
                      className="w-full rounded-xl border border-slate-300 bg-white p-2 text-slate-900 outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              </div>

              {/* Submit */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-purple-600 py-3 text-xs font-bold text-white shadow-md shadow-purple-600/20 hover:bg-purple-700 transition disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Saving Follow-up...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>SAVE FOLLOW-UP & UPDATE LEAD</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
