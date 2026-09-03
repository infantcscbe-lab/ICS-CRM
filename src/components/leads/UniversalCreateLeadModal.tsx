import { useState, useEffect } from 'react';
import type { ServiceJob, Profile, Lead, LeadPriority, LeadSource, Client } from '@/types/database';
import { createLead, INITIAL_LEAD_CATEGORIES, LEAD_SOURCES } from '@/lib/leads';
import { supabase } from '@/lib/supabase';
import {
  X,
  Sparkles,
  Building2,
  User,
  Phone,
  MapPin,
  Briefcase,
  IndianRupee,
  Loader2,
  CheckCircle2,
  Mail,
  Plus,
} from 'lucide-react';

interface UniversalCreateLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: Profile;
  job?: ServiceJob | null;
  currentCoords?: { latitude: number; longitude: number } | null;
  onLeadCreated: (lead: Lead) => void;
}

export function UniversalCreateLeadModal({
  isOpen,
  onClose,
  userProfile,
  job,
  currentCoords,
  onLeadCreated,
}: UniversalCreateLeadModalProps) {
  // Client selection / inputs
  const [existingClients, setExistingClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [customerName, setCustomerName] = useState(job?.client?.client_name || '');
  const [companyName, setCompanyName] = useState(job?.client?.company_name || '');
  const [mobileNumber, setMobileNumber] = useState(job?.client?.phone || '');
  const [email, setEmail] = useState(job?.client?.email || '');
  const [address, setAddress] = useState(
    job?.client ? `${job.client.address || ''}, ${job.client.city || ''}`.trim().replace(/^,|,$/g, '') : ''
  );

  // Opportunity details
  const [category, setCategory] = useState('CCTV');
  const [leadSource, setLeadSource] = useState<LeadSource>(
    job ? 'Service Visit' : userProfile.role === 'sales_executive' ? 'Sales Executive' : 'Phone Call'
  );
  const [requirement, setRequirement] = useState('');
  const [priority, setPriority] = useState<LeadPriority>('Hot');
  const [estimatedBudget, setEstimatedBudget] = useState<string>('');
  const [customerRemarks, setCustomerRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successLead, setSuccessLead] = useState<Lead | null>(null);

  useEffect(() => {
    if (isOpen && !job) {
      supabase
        .from('clients')
        .select('*')
        .order('client_name')
        .then(({ data }) => {
          if (data) setExistingClients(data as unknown as Client[]);
        });
    }
  }, [isOpen, job]);

  useEffect(() => {
    if (job?.client) {
      setCustomerName(job.client.client_name || '');
      setCompanyName(job.client.company_name || '');
      setMobileNumber(job.client.phone || '');
      setEmail(job.client.email || '');
      setAddress(`${job.client.address || ''}, ${job.client.city || ''}`.trim().replace(/^,|,$/g, ''));
      setLeadSource('Service Visit');
    }
  }, [job]);

  function handleSelectExistingClient(clientId: string) {
    setSelectedClientId(clientId);
    const found = existingClients.find((c) => c.id === clientId);
    if (found) {
      setCustomerName(found.client_name || '');
      setCompanyName(found.company_name || '');
      setMobileNumber(found.phone || '');
      setEmail(found.email || '');
      setAddress(`${found.address || ''}, ${found.city || ''}`.trim().replace(/^,|,$/g, ''));
    }
  }

  if (!isOpen) return null;

  const isEngineer = userProfile.role === 'engineer';
  const isSales = userProfile.role === 'sales_executive';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerName.trim()) {
      alert('Please enter the customer name.');
      return;
    }
    if (!mobileNumber.trim()) {
      alert('Please enter a contact phone number.');
      return;
    }
    if (!requirement.trim()) {
      alert('Please describe the customer requirement / opportunity.');
      return;
    }

    setSubmitting(true);
    try {
      const budgetNum = estimatedBudget ? parseFloat(estimatedBudget) : 0;

      const newLead = await createLead({
        customer_id: job?.client_id || selectedClientId || null,
        customer_name: customerName.trim(),
        company_name: companyName.trim() || null,
        contact_person: customerName.trim(),
        mobile_number: mobileNumber.trim(),
        email: email.trim() || null,
        address: address.trim() || null,
        gps_latitude: currentCoords?.latitude ?? job?.client?.latitude ?? null,
        gps_longitude: currentCoords?.longitude ?? job?.client?.longitude ?? null,
        service_job_id: job?.id || null,
        service_job_number: job?.job_number || null,
        created_by: userProfile.id,
        created_by_name: userProfile.full_name,
        created_by_role: userProfile.role,
        original_owner_id: userProfile.id,
        original_owner_name: userProfile.full_name,
        current_owner_id: userProfile.id,
        current_owner_name: userProfile.full_name,
        current_owner_role: userProfile.role,
        lead_source: leadSource,
        lead_category: category,
        requirement: requirement.trim(),
        priority: priority,
        estimated_value: budgetNum,
        customer_remarks: customerRemarks.trim() || null,
      });

      setSuccessLead(newLead);
      onLeadCreated(newLead);
    } catch (err: any) {
      alert(`Error creating lead: ${err?.message || err}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden border border-slate-100 max-h-[92vh] flex flex-col my-4">
        {/* Header */}
        <div
          className={`px-6 py-4 text-white flex items-center justify-between shrink-0 ${
            isSales
              ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700'
              : 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md shadow-inner">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight leading-tight">Create New Lead</h2>
              <p className="text-xs text-white/80 font-medium">
                {job
                  ? `From Service Visit (#${job.job_number})`
                  : isEngineer
                  ? 'Field / Direct Customer Opportunity'
                  : 'Sales Pipeline Opportunity'}
              </p>
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
        {successLead ? (
          <div className="p-8 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-sm animate-bounce">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900">Lead Registered Successfully!</h3>
              <p className="mt-1 text-sm text-slate-600">
                Opportunity ID: <span className="font-mono font-bold text-purple-700">{successLead.lead_number}</span>
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-left text-xs space-y-1.5 text-slate-700">
              <p>
                <strong>Lead Owner:</strong> {userProfile.full_name} ({userProfile.role})
              </p>
              <p>
                <strong>Source:</strong> {successLead.lead_source}
              </p>
              <p>
                <strong>Customer:</strong> {successLead.customer_name} {successLead.company_name ? `(${successLead.company_name})` : ''}
              </p>
              <p>
                <strong>Status:</strong> NEW (Ready for follow-up & quotation)
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white hover:bg-slate-800 shadow-sm transition"
            >
              Done & View
            </button>
          </div>
        ) : (
          /* Form View */
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
            {/* Context Card for Service Job (if opened from job) */}
            {job && (
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3.5 text-amber-950 space-y-1">
                <div className="flex items-center justify-between font-bold">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-amber-600" />
                    {customerName}
                  </span>
                  <span className="font-mono text-[10px] bg-amber-200 px-2 py-0.5 rounded-full">
                    Job #{job.job_number}
                  </span>
                </div>
                <p className="text-[11px] text-amber-800">
                  Pre-filled from current customer service ticket.
                </p>
              </div>
            )}

            {/* If NOT from job, offer existing client autofill */}
            {!job && existingClients.length > 0 && (
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Select Existing Customer (Optional)
                </label>
                <select
                  value={selectedClientId}
                  onChange={(e) => handleSelectExistingClient(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white p-2.5 font-medium text-slate-900 shadow-xs outline-none focus:border-purple-500"
                >
                  <option value="">-- Type new customer details below or choose existing --</option>
                  {existingClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.client_name} {c.company_name ? `(${c.company_name})` : ''} — {c.phone}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Customer Details */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Customer / Contact Name <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Rajesh Kumar"
                  className="w-full rounded-xl border border-slate-300 p-2.5 font-medium text-slate-900 outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Company / Organization</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Apex Corp"
                  className="w-full rounded-xl border border-slate-300 p-2.5 font-medium text-slate-900 outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Mobile Number <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  className="w-full rounded-xl border border-slate-300 p-2.5 font-mono text-slate-900 outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. client@example.com"
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-900 outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Customer Address / City</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 124 Cross Cut Road, Gandhipuram, Coimbatore"
                className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-900 outline-none focus:border-purple-500"
              />
            </div>

            {/* Lead Source & Category */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Opportunity Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white p-2.5 font-semibold text-slate-900 outline-none focus:border-purple-500"
                >
                  {INITIAL_LEAD_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Lead Source</label>
                <select
                  value={leadSource}
                  onChange={(e) => setLeadSource(e.target.value as LeadSource)}
                  className="w-full rounded-xl border border-slate-300 bg-white p-2.5 font-medium text-slate-900 outline-none focus:border-purple-500"
                >
                  {LEAD_SOURCES.map((src) => (
                    <option key={src} value={src}>
                      {src}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="block font-bold text-slate-700 mb-1.5">
                Priority Level <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Hot', 'Warm', 'Cold'] as LeadPriority[]).map((p) => {
                  const isSelected = priority === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`rounded-xl py-2 font-bold transition border ${
                        isSelected
                          ? p === 'Hot'
                            ? 'bg-red-500 text-white border-red-500 shadow-sm'
                            : p === 'Warm'
                            ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                            : 'bg-blue-500 text-white border-blue-500 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {p === 'Hot' ? '🔥 Hot' : p === 'Warm' ? '⚡ Warm' : '❄️ Cold'}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Requirement */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Requirement Details <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={requirement}
                onChange={(e) => setRequirement(e.target.value)}
                placeholder="Example: Customer needs 8 IP CCTV cameras with 2TB NVR & installation, or 5 new laptops for accounts..."
                className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-900 placeholder:text-slate-400 outline-none focus:border-purple-500"
              />
            </div>

            {/* Budget & Remarks */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Estimated Budget (₹)</label>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={estimatedBudget}
                    onChange={(e) => setEstimatedBudget(e.target.value)}
                    placeholder="e.g. 50000"
                    className="w-full rounded-xl border border-slate-300 py-2 pl-8 pr-3 font-semibold text-slate-900 outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Decision Maker / Remarks</label>
                <input
                  type="text"
                  value={customerRemarks}
                  onChange={(e) => setCustomerRemarks(e.target.value)}
                  placeholder="e.g. Speak with Director"
                  className="w-full rounded-xl border border-slate-300 p-2 text-slate-900 outline-none focus:border-purple-500"
                />
              </div>
            </div>

            {/* Ownership rule info */}
            <div className="rounded-xl bg-slate-100 p-2.5 text-[11px] text-slate-600">
              ℹ️ <strong>Lead Ownership:</strong> You (<strong>{userProfile.full_name}</strong>) will be recorded as the
              discovering owner of this opportunity.
            </div>

            {/* Submit */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className={`w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-xs font-bold text-white shadow-md transition disabled:opacity-50 ${
                  isSales
                    ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/25'
                    : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-orange-500/25'
                }`}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving Lead...</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    <span>CREATE LEAD NOW</span>
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
