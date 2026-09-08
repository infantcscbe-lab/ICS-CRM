import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type { ServiceJob, Client, Profile, JobPriority, JobStatus, Vendor } from '@/types/database';
import {
  X,
  Loader2,
  Cpu,
  Calendar,
  Clock,
  UserCheck,
  Building,
  PhoneCall,
  CheckCircle2,
  Car,
  AlertCircle,
  FileText,
  Phone,
  Save,
  Tag,
  Wrench,
} from 'lucide-react';
import { safeUpdateServiceJob } from '@/lib/safeDb';
import { parseClientDevices, getDeviceContractInfo } from '@/lib/clientDevices';

interface EditJobModalProps {
  open: boolean;
  job: ServiceJob | null;
  onClose: () => void;
  onUpdated: () => void;
}

const COMMON_ASSIGNERS = ['Jancirani', 'Harshiya Banu', 'Vimala', 'TESTADMIN', 'Admin'];

export function EditJobModal({ open, job, onClose, onUpdated }: EditJobModalProps) {
  const { profile } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [engineers, setEngineers] = useState<Profile[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form State
  const [clientId, setClientId] = useState('');
  const [engineerId, setEngineerId] = useState('');
  const [assignedByName, setAssignedByName] = useState('');
  const [callGivenBy, setCallGivenBy] = useState('');
  const [issueTitle, setIssueTitle] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [priority, setPriority] = useState<JobPriority>('medium');
  const [status, setStatus] = useState<JobStatus>('assigned');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [callSource, setCallSource] = useState<'direct' | 'online'>('direct');
  const [directCallType, setDirectCallType] = useState<'inboard' | 'outboard'>('outboard');
  const [totalKm, setTotalKm] = useState<string>('0');
  const [adminNotes, setAdminNotes] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [workPerformed, setWorkPerformed] = useState('');
  const [partsReplaced, setPartsReplaced] = useState('');

  // Vendor override fields
  const [vendorName, setVendorName] = useState('');
  const [vendorPhone, setVendorPhone] = useState('');
  const [vendorNotes, setVendorNotes] = useState('');

  // Call Back override fields
  const [callBackDate, setCallBackDate] = useState('');
  const [callBackTime, setCallBackTime] = useState('');
  const [callBackReason, setCallBackReason] = useState('');

  // Physical slip fields
  const [callType, setCallType] = useState<'Warranty' | 'ASC' | 'Repeated' | 'Per Call'>('Per Call');
  const [serviceCharge, setServiceCharge] = useState<string>('');
  const [partCharge, setPartCharge] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'Cheque' | 'Online' | 'Credit' | 'UPI'>('Cash');

  useEffect(() => {
    if (open) {
      loadDependencies();
      if (job) {
        initFormFromJob(job);
      }
    } else {
      setError(null);
      setSuccess(null);
    }
  }, [open, job]);

  function initFormFromJob(j: ServiceJob) {
    setClientId(j.client_id || '');
    setEngineerId(j.engineer_id || '');
    setAssignedByName(j.assigned_by_name || j.reassigned_from_name || '');
    setCallGivenBy(j.call_given_by || '');
    setIssueTitle(j.issue_title || '');
    setIssueDescription(j.issue_description || '');
    setDeviceId(j.device_id || '');
    setPriority(j.priority || 'medium');
    setStatus(j.status || 'assigned');
    setScheduledDate(j.scheduled_date || '');
    setScheduledTime(j.scheduled_time || '');
    setCallSource(j.call_source || 'direct');
    setDirectCallType(j.direct_call_type || 'outboard');
    setTotalKm(j.total_km !== null && j.total_km !== undefined ? String(j.total_km) : '0');
    setAdminNotes(j.admin_notes || '');
    setDiagnosis(j.diagnosis || '');
    setWorkPerformed(j.work_performed || '');
    setPartsReplaced(j.parts_replaced || '');

    setVendorName(j.vendor_name || '');
    setVendorPhone(j.vendor_phone || '');
    setVendorNotes(j.vendor_notes || '');

    setCallBackDate(j.call_back_date || '');
    setCallBackTime(j.call_back_time || '');
    setCallBackReason(j.call_back_reason || '');

    setCallType(j.call_type || 'Per Call');
    setServiceCharge(j.service_charge !== null && j.service_charge !== undefined ? String(j.service_charge) : '');
    setPartCharge(j.part_charge !== null && j.part_charge !== undefined ? String(j.part_charge) : '');
    setPaymentMode(j.payment_mode || 'Cash');
  }

  async function loadDependencies() {
    setLoading(true);
    try {
      const [{ data: cData }, { data: pData }, { data: vData }] = await Promise.all([
        supabase.from('clients').select('*').order('client_name'),
        supabase.from('profiles').select('*').order('full_name'),
        supabase.from('vendors').select('*').eq('is_active', true).order('vendor_name'),
      ]);

      setClients((cData as Client[]) || []);
      const allProfiles = (pData as Profile[]) || [];
      setEngineers(allProfiles.filter((p) => p.role === 'engineer' && p.is_active));
      setVendors((vData as Vendor[]) || []);
    } catch (err) {
      console.error('Failed to load dependencies for Edit Job:', err);
    } finally {
      setLoading(false);
    }
  }

  const selectedClient = clients.find((c) => c.id === clientId);
  const clientDevices = selectedClient ? parseClientDevices(selectedClient) : [];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!job) return;
    setError(null);
    setSuccess(null);

    if (!clientId) {
      setError('Please select a client.');
      return;
    }
    if (!issueTitle.trim()) {
      setError('Issue title is required.');
      return;
    }

    setSaving(true);
    try {
      const parsedKm = parseFloat(totalKm);
      const validKm = isNaN(parsedKm) ? 0 : Math.max(0, parsedKm);

      const updates: Record<string, unknown> = {
        client_id: clientId,
        engineer_id: engineerId || null,
        assigned_by_name: assignedByName.trim() || null,
        call_given_by: callGivenBy.trim() || null,
        issue_title: issueTitle.trim(),
        issue_description: issueDescription.trim(),
        device_id: deviceId.trim() || null,
        priority,
        status,
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime.trim(),
        call_source: callSource,
        direct_call_type: callSource === 'direct' ? directCallType : null,
        total_km: validKm,
        admin_notes: adminNotes.trim(),
        diagnosis: diagnosis.trim(),
        work_performed: workPerformed.trim(),
        parts_replaced: partsReplaced.trim(),
        call_type: callType,
        service_charge: serviceCharge ? parseFloat(serviceCharge) : null,
        part_charge: partCharge ? parseFloat(partCharge) : null,
        payment_mode: paymentMode,
        updated_at: new Date().toISOString(),
      };

      // If status changed to completed and completed_at is null, record it
      if (status === 'completed' && !job.completed_at) {
        updates.completed_at = new Date().toISOString();
      }

      // Vendor fields
      if (status === 'vendor' || vendorName.trim()) {
        updates.vendor_name = vendorName.trim() || null;
        updates.vendor_phone = vendorPhone.trim() || null;
        updates.vendor_notes = vendorNotes.trim() || null;
      } else if (job.status === 'vendor' && status !== 'vendor') {
        // Clear vendor if moved out of vendor handling
        updates.vendor_name = null;
        updates.vendor_phone = null;
        updates.vendor_notes = null;
      }

      // Call back fields
      if (status === 'call_back' || callBackDate) {
        updates.call_back_date = callBackDate || null;
        updates.call_back_time = callBackTime.trim() || null;
        updates.call_back_reason = callBackReason.trim() || null;
      }

      // If engineer was changed, track reassignment
      if (engineerId && engineerId !== job.engineer_id) {
        const prevEng = engineers.find((e) => e.id === job.engineer_id)?.full_name || 'Previous Engineer';
        updates.reassigned_from_id = job.engineer_id || null;
        updates.reassigned_from_name = prevEng;
        updates.reassignment_reason = 'Updated by Admin in Edit Call';
      }

      const { error: updateErr } = await safeUpdateServiceJob(job.id, updates);
      if (updateErr) throw updateErr;

      // Sync new device tag to client if provided
      if (deviceId.trim() && selectedClient) {
        const existingTags = (selectedClient.device_ids || '')
          .split(/[,\n;]/)
          .map((d) => d.trim())
          .filter(Boolean);

        const currentTag = deviceId.trim().toUpperCase();
        if (!existingTags.includes(currentTag)) {
          existingTags.push(currentTag);
          try {
            await supabase
              .from('clients')
              .update({
                device_ids: existingTags.join(', '),
                device_count: existingTags.length,
                updated_at: new Date().toISOString(),
              })
              .eq('id', selectedClient.id);
          } catch {}
        }
      }

      window.dispatchEvent(new CustomEvent('ics-jobs-updated'));
      setSuccess('Service call updated successfully!');
      setTimeout(() => {
        onUpdated();
        onClose();
      }, 700);
    } catch (err) {
      console.error('Failed to update service job:', err);
      setError(err instanceof Error ? err.message : 'Failed to update service job.');
    } finally {
      setSaving(false);
    }
  }

  if (!open || !job) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/30 border border-blue-400/40 text-blue-300 font-bold">
              <Wrench className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Edit Service Call</h2>
                <span className="rounded-md bg-blue-500/20 px-2 py-0.5 font-mono text-xs font-bold text-blue-300 border border-blue-400/30">
                  {job.job_number}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Modify call details, assignees, client, status, and KM records
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="max-h-[82vh] overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs font-semibold text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {loading ? (
            <div className="flex h-40 items-center justify-center gap-2 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm font-medium">Loading call details & dependencies...</span>
            </div>
          ) : (
            <>
              {/* ---------------- 1. CLIENT & HARDWARE SECTION ---------------- */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200/80 pb-2">
                  <Building className="h-4 w-4 text-blue-600" />
                  <span>Customer & Hardware Information</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Client Selector */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Customer / Client <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
                      required
                    >
                      <option value="">-- Select Client --</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.client_name} {c.company_name ? `(${c.company_name})` : ''} — {c.city || c.phone}
                        </option>
                      ))}
                    </select>
                    {selectedClient && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        📞 {selectedClient.phone || 'No phone'} | 📍 {selectedClient.city || selectedClient.address || 'No location'}
                      </p>
                    )}
                  </div>

                  {/* Device ID / Machine Model */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Device ID / Machine Serial
                    </label>
                    <div className="relative">
                      <Cpu className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={deviceId}
                        onChange={(e) => setDeviceId(e.target.value)}
                        placeholder="e.g. ICS-DEV-101, HP LaserJet Pro..."
                        className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
                      />
                    </div>

                    {/* Quick Device Badges from Client */}
                    {clientDevices.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Registered:</span>
                        {clientDevices.map((cd) => (
                          <button
                            key={cd.device_id}
                            type="button"
                            onClick={() => setDeviceId(cd.device_id)}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-bold transition border ${
                              deviceId === cd.device_id
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400'
                            }`}
                          >
                            {cd.device_id}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ---------------- 2. ASSIGNMENT & CALL TRACKING ---------------- */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200/80 pb-2">
                  <UserCheck className="h-4 w-4 text-indigo-600" />
                  <span>Engineer Assignment & Sourcing</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Engineer */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Assigned Engineer
                    </label>
                    <select
                      value={engineerId}
                      onChange={(e) => setEngineerId(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
                    >
                      <option value="">-- Unassigned --</option>
                      {engineers.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.full_name} ({e.phone || 'No phone'})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Assign By */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Assign By (Staff Name)
                    </label>
                    <input
                      type="text"
                      value={assignedByName}
                      onChange={(e) => setAssignedByName(e.target.value)}
                      placeholder="e.g. Jancirani, Admin..."
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
                    />
                    <div className="mt-1 flex flex-wrap gap-1">
                      {COMMON_ASSIGNERS.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setAssignedByName(name)}
                          className="rounded px-1.5 py-0.5 text-[9px] font-semibold bg-white text-slate-600 border border-slate-200 hover:bg-blue-50 hover:text-blue-700"
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Call Given By */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Call Given By (Caller / Contact)
                    </label>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={callGivenBy}
                        onChange={(e) => setCallGivenBy(e.target.value)}
                        placeholder="e.g. Bala, Manager Phone..."
                        className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-8 pr-3 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Priority
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as JobPriority)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-600"
                    >
                      <option value="low">🟢 Low Priority</option>
                      <option value="medium">🟡 Medium Priority</option>
                      <option value="high">🟠 High Priority</option>
                      <option value="urgent">🔴 Urgent / Critical</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                  {/* Scheduled Date */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Scheduled Date <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Calendar className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-8 pr-3 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
                        required
                      />
                    </div>
                  </div>

                  {/* Scheduled Time */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Scheduled Time
                    </label>
                    <div className="relative">
                      <Clock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        placeholder="e.g. 10:30 AM"
                        className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-8 pr-3 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  {/* Call Source */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Call Source
                    </label>
                    <select
                      value={callSource}
                      onChange={(e) => setCallSource(e.target.value as 'direct' | 'online')}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-600"
                    >
                      <option value="direct">📍 Direct Call (Field / On-Site)</option>
                      <option value="online">💻 Online Call (AnyDesk / Remote)</option>
                    </select>
                  </div>

                  {/* Direct Call Type (if direct) */}
                  {callSource === 'direct' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Call Nature
                      </label>
                      <select
                        value={directCallType}
                        onChange={(e) => setDirectCallType(e.target.value as 'inboard' | 'outboard')}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
                      >
                        <option value="outboard">🚗 Outboard (Engineer Visit Site)</option>
                        <option value="inboard">🏢 Inboard (Customer Brought to Office)</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* ---------------- 3. ISSUE & COMPLAINT ---------------- */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200/80 pb-2">
                  <FileText className="h-4 w-4 text-amber-600" />
                  <span>Issue & Description</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Issue Title / Complaint Summary <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={issueTitle}
                    onChange={(e) => setIssueTitle(e.target.value)}
                    placeholder="e.g. Paper Jam in Tray 1, No Power, OS Boot Failure..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-600"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Detailed Complaint / Symptoms / Remarks
                  </label>
                  <textarea
                    rows={3}
                    value={issueDescription}
                    onChange={(e) => setIssueDescription(e.target.value)}
                    placeholder="Customer reported details, error codes, specific machine symptoms..."
                    className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs font-normal text-slate-800 outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              {/* ---------------- 4. STATUS, KM & WORKFLOW OVERRIDES ---------------- */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                    <Tag className="h-4 w-4 text-emerald-600" />
                    <span>Status & Road KM Override</span>
                  </div>
                  <span className="text-[11px] font-bold text-slate-400">Admin Control</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {/* Status */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Call Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as JobStatus)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-extrabold text-slate-800 outline-none focus:border-blue-600"
                    >
                      <option value="assigned">Assigned</option>
                      <option value="traveling">On Call (Traveling)</option>
                      <option value="reached">In Client Place</option>
                      <option value="in_progress">Service In Progress</option>
                      <option value="solved">Solved (Pending Approval)</option>
                      <option value="completed">Completed</option>
                      <option value="vendor">Vendor Handover</option>
                      <option value="call_back">Call Back (Rescheduled)</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>

                  {/* Total KM (Manual / Road KM) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Road KM (Manual / Bike KM)
                    </label>
                    <div className="relative">
                      <Car className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={totalKm}
                        onChange={(e) => setTotalKm(e.target.value)}
                        placeholder="0.0"
                        className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-8 pr-3 text-xs font-bold text-slate-900 outline-none focus:border-blue-600"
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400">
                      GPS KM: {job.gps_distance_km ? `${job.gps_distance_km.toFixed(1)} KM` : '—'}
                    </p>
                  </div>

                  {/* Call Contract Type */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Call Type / Billing Nature
                    </label>
                    <select
                      value={callType}
                      onChange={(e) => setCallType(e.target.value as any)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
                    >
                      <option value="Per Call">Per Call (Paid Visit)</option>
                      <option value="Warranty">Warranty (Free)</option>
                      <option value="AMC">AMC (Annual Maintenance)</option>
                      <option value="ASC">ASC</option>
                      <option value="Repeated">Repeated Call</option>
                    </select>
                  </div>
                </div>

                {/* Conditional: Vendor Handover Details */}
                {status === 'vendor' && (
                  <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3 space-y-3">
                    <p className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                      <Building className="h-4 w-4 text-purple-600" />
                      <span>External Vendor Handover Details</span>
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-purple-800 mb-1">
                          Vendor Name
                        </label>
                        <input
                          type="text"
                          value={vendorName}
                          onChange={(e) => setVendorName(e.target.value)}
                          placeholder="e.g. Master Tech Lab"
                          className="w-full rounded-lg border border-purple-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-purple-800 mb-1">
                          Vendor Phone
                        </label>
                        <input
                          type="text"
                          value={vendorPhone}
                          onChange={(e) => setVendorPhone(e.target.value)}
                          placeholder="e.g. 9876543210"
                          className="w-full rounded-lg border border-purple-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-purple-800 mb-1">
                        Vendor Notes / Tracking Info
                      </label>
                      <input
                        type="text"
                        value={vendorNotes}
                        onChange={(e) => setVendorNotes(e.target.value)}
                        placeholder="Material handed over, courier slip #, estimated return date..."
                        className="w-full rounded-lg border border-purple-300 bg-white px-3 py-1.5 text-xs text-slate-800"
                      />
                    </div>
                  </div>
                )}

                {/* Conditional: Call Back Details */}
                {status === 'call_back' && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-3">
                    <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                      <PhoneCall className="h-4 w-4 text-amber-600" />
                      <span>Rescheduled Call Back Details</span>
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-amber-800 mb-1">
                          Next Follow-up Date
                        </label>
                        <input
                          type="date"
                          value={callBackDate}
                          onChange={(e) => setCallBackDate(e.target.value)}
                          className="w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-amber-800 mb-1">
                          Preferred Time Slot
                        </label>
                        <input
                          type="text"
                          value={callBackTime}
                          onChange={(e) => setCallBackTime(e.target.value)}
                          placeholder="e.g. 11:00 AM"
                          className="w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-amber-800 mb-1">
                        Reason for Rescheduling
                      </label>
                      <input
                        type="text"
                        value={callBackReason}
                        onChange={(e) => setCallBackReason(e.target.value)}
                        placeholder="e.g. Client not in office, spare part awaited..."
                        className="w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs text-slate-800"
                      />
                    </div>
                  </div>
                )}

                {/* Completion & Diagnosis Details */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Diagnosis
                    </label>
                    <input
                      type="text"
                      value={diagnosis}
                      onChange={(e) => setDiagnosis(e.target.value)}
                      placeholder="Root cause identified..."
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Work Performed
                    </label>
                    <input
                      type="text"
                      value={workPerformed}
                      onChange={(e) => setWorkPerformed(e.target.value)}
                      placeholder="Action taken..."
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Parts Replaced
                    </label>
                    <input
                      type="text"
                      value={partsReplaced}
                      onChange={(e) => setPartsReplaced(e.target.value)}
                      placeholder="e.g. Roller, Toner, RAM..."
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800"
                    />
                  </div>
                </div>

                {/* Charges & Billing Details */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Service Charge (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={serviceCharge}
                      onChange={(e) => setServiceCharge(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Part Charge (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={partCharge}
                      onChange={(e) => setPartCharge(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Payment Mode
                    </label>
                    <select
                      value={paymentMode}
                      onChange={(e) => setPaymentMode(e.target.value as any)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
                    >
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI / GPay / PhonePe</option>
                      <option value="Online">Online / NEFT / IMPS</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Credit">Credit / Due</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* ---------------- 5. ADMIN INTERNAL NOTES ---------------- */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Admin Internal Notes & Logs
                </label>
                <textarea
                  rows={2}
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Private internal note visible only to admins..."
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-800 outline-none focus:border-blue-600"
                />
              </div>
            </>
          )}

          {/* Modal Footer Buttons */}
          <div className="sticky bottom-0 -mx-6 -mb-6 flex items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4 shadow-lg">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || loading}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Save Call Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
