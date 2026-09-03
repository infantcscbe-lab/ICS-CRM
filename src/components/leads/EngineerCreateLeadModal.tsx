import { useState } from 'react';
import type { ServiceJob, Profile, Lead, LeadPriority } from '@/types/database';
import { createLead, INITIAL_LEAD_CATEGORIES } from '@/lib/leads';
import { X, Sparkles, Building2, User, Phone, MapPin, Briefcase, IndianRupee, Loader2, CheckCircle2, Calendar, Clock } from 'lucide-react';

interface EngineerCreateLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: ServiceJob;
  engineerProfile: Profile;
  currentCoords?: { latitude: number; longitude: number } | null;
  onLeadCreated: (lead: Lead) => void;
}

export function EngineerCreateLeadModal({
  isOpen,
  onClose,
  job,
  engineerProfile,
  currentCoords,
  onLeadCreated,
}: EngineerCreateLeadModalProps) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  const todayStr = new Date().toISOString().split('T')[0];

  const [category, setCategory] = useState('CCTV');
  const [requirement, setRequirement] = useState('');
  const [priority, setPriority] = useState<LeadPriority>('Hot');
  const [estimatedBudget, setEstimatedBudget] = useState<string>('');
  const [customerRemarks, setCustomerRemarks] = useState('');
  const [nextFollowupDate, setNextFollowupDate] = useState<string>(tomorrowStr);
  const [nextFollowupTime, setNextFollowupTime] = useState<string>('11:00');
  const [submitting, setSubmitting] = useState(false);
  const [successLeadNumber, setSuccessLeadNumber] = useState<string | null>(null);

  if (!isOpen) return null;

  const clientName = job.client?.client_name || 'Customer';
  const companyName = job.client?.company_name || '';
  const mobileNumber = job.client?.phone || '';
  const email = job.client?.email || '';
  const address = `${job.client?.address || ''}, ${job.client?.city || ''}`.trim().replace(/^,|,$/g, '');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!requirement.trim()) {
      alert('Please describe the customer requirement / opportunity.');
      return;
    }

    setSubmitting(true);
    try {
      const budgetNum = estimatedBudget ? parseFloat(estimatedBudget) : 0;

      const newLead = await createLead({
        customer_id: job.client_id,
        customer_name: clientName,
        company_name: companyName,
        contact_person: clientName,
        mobile_number: mobileNumber,
        email: email,
        address: address,
        gps_latitude: currentCoords?.latitude ?? job.client?.latitude ?? null,
        gps_longitude: currentCoords?.longitude ?? job.client?.longitude ?? null,
        service_job_id: job.id,
        service_job_number: job.job_number,
        created_by: engineerProfile.id,
        created_by_name: engineerProfile.full_name,
        created_by_role: 'engineer',
        // Business Rule: Engineer is automatically the Original Owner and Initial Current Owner
        original_owner_id: engineerProfile.id,
        original_owner_name: engineerProfile.full_name,
        current_owner_id: engineerProfile.id,
        current_owner_name: engineerProfile.full_name,
        current_owner_role: 'engineer',
        lead_source: 'Service Visit',
        lead_category: category,
        requirement: requirement.trim(),
        priority: priority,
        estimated_value: budgetNum,
        customer_remarks: customerRemarks.trim() || null,
        next_followup_date: nextFollowupDate || null,
        next_followup_time: nextFollowupTime || null,
      });

      setSuccessLeadNumber(newLead.lead_number);
      onLeadCreated(newLead);
    } catch (err: any) {
      alert(`Error creating lead: ${err?.message || err}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden border border-slate-100 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md shadow-inner">
              <Sparkles className="h-5 w-5 text-amber-100" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight leading-tight">Create New Lead</h2>
              <p className="text-xs text-amber-100 font-medium">New Business Opportunity from Service Visit</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-white/80 hover:bg-white/20 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Success View */}
        {successLeadNumber ? (
          <div className="p-8 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-sm animate-bounce">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900">Lead Created Successfully!</h3>
              <p className="mt-1 text-sm text-slate-600">
                Opportunity logged with ID: <span className="font-mono font-bold text-amber-600">{successLeadNumber}</span>
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-left text-xs space-y-1.5 text-slate-700">
              <p>
                <strong>Original Owner:</strong> {engineerProfile.full_name} (Service Engineer)
              </p>
              <p>
                <strong>Lead Source:</strong> Service Visit (#{job.job_number})
              </p>
              <p>
                <strong>Customer:</strong> {clientName} ({companyName})
              </p>
              <p>
                <strong>Status:</strong> NEW (Ready for Sales Follow-up / Quotation)
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white hover:bg-slate-800 shadow-sm transition"
            >
              Done & Return to Job
            </button>
          </div>
        ) : (
          /* Form View */
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Auto-populated Context Card */}
            <div className="rounded-2xl bg-amber-50/70 border border-amber-200/80 p-3.5 text-xs text-amber-950 space-y-1.5 shadow-sm">
              <div className="flex items-center justify-between font-bold border-b border-amber-200/60 pb-1.5">
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-amber-600" />
                  {clientName} {companyName ? `• ${companyName}` : ''}
                </span>
                <span className="font-mono text-[10px] bg-amber-200/60 px-2 py-0.5 rounded-full">
                  Job #{job.job_number}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-amber-900 pt-0.5">
                <p className="flex items-center gap-1">
                  <Phone className="h-3 w-3 text-amber-700" /> {mobileNumber || 'No phone'}
                </p>
                <p className="flex items-center gap-1">
                  <User className="h-3 w-3 text-amber-700" /> Owner: <strong>{engineerProfile.full_name}</strong>
                </p>
              </div>
              {address && (
                <p className="flex items-center gap-1 text-[10px] text-amber-800/80 truncate">
                  <MapPin className="h-3 w-3 shrink-0 text-amber-600" /> {address}
                </p>
              )}
            </div>

            {/* Lead Category */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Lead Category <span className="text-red-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm font-medium text-slate-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                {INITIAL_LEAD_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Opportunity Priority <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Hot', 'Warm', 'Cold'] as LeadPriority[]).map((p) => {
                  const isSelected = priority === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`rounded-xl py-2 text-xs font-bold transition border ${
                        isSelected
                          ? p === 'Hot'
                            ? 'bg-red-500 text-white border-red-500 shadow-md shadow-red-500/20'
                            : p === 'Warm'
                            ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20'
                            : 'bg-blue-500 text-white border-blue-500 shadow-md shadow-blue-500/20'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {p === 'Hot' ? '🔥 Hot' : p === 'Warm' ? '⚡ Warm' : '❄️ Cold'}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Requirement Description */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Requirement Details <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={requirement}
                onChange={(e) => setRequirement(e.target.value)}
                placeholder="Example: Customer needs 8 IP CCTV cameras with 2TB NVR & installation, or 5 new laptops for accounts..."
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            {/* Estimated Budget */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Estimated Budget (₹) <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="number"
                  min="0"
                  step="500"
                  value={estimatedBudget}
                  onChange={(e) => setEstimatedBudget(e.target.value)}
                  placeholder="e.g. 45000"
                  className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* Customer Remarks */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Customer Remarks / Decision Maker Notes <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={customerRemarks}
                onChange={(e) => setCustomerRemarks(e.target.value)}
                placeholder="e.g. Discuss with Director Mr. Kumar by Friday"
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            {/* Next Follow-up Schedule */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 font-bold text-amber-950 text-xs">
                  <Calendar className="h-4 w-4 text-amber-600" />
                  <span>Schedule Next Follow-up</span>
                  <span className="text-red-500">*</span>
                </label>
                <span className="text-[10px] text-amber-800 font-medium">When to contact next</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Follow-up Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    min={todayStr}
                    value={nextFollowupDate}
                    onChange={(e) => setNextFollowupDate(e.target.value)}
                    className="w-full rounded-xl border border-amber-200 bg-white p-2 text-xs font-semibold text-slate-900 outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Time (Optional)
                  </label>
                  <div className="relative">
                    <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="time"
                      value={nextFollowupTime}
                      onChange={(e) => setNextFollowupTime(e.target.value)}
                      className="w-full rounded-xl border border-amber-200 bg-white py-2 pl-8 pr-2 text-xs font-semibold text-slate-900 outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Business Rule Notice */}
            <div className="rounded-xl bg-slate-100 p-2.5 text-[11px] text-slate-600 border border-slate-200/80">
              ℹ️ <strong>Lead Ownership:</strong> You ({engineerProfile.full_name}) will permanently be recorded as the
              discovering owner of this lead for performance and incentive credit.
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-500/30 hover:from-amber-600 hover:to-orange-700 transition disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Creating Opportunity...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>CREATE LEAD</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
