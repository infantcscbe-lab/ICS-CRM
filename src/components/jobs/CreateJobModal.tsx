import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type { Client, Profile, JobPriority } from '@/types/database';
import { X, Plus, Loader2, Globe, UserCheck } from 'lucide-react';
import { safeInsertServiceJob } from '@/lib/safeDb';
import { markNotificationAsRead } from '@/lib/notifications';

export interface InitialJobData {
  clientId?: string;
  clientName?: string;
  clientCompany?: string;
  clientPhone?: string;
  clientEmail?: string;
  clientAddress?: string;
  clientCity?: string;
  issueTitle?: string;
  issueDescription?: string;
  priority?: JobPriority;
  callSource?: 'online' | 'direct';
  scheduledDate?: string;
  scheduledTime?: string;
  callGivenBy?: string;
  assignedByName?: string;
  adminNotes?: string;
  engineerId?: string;
  notificationId?: string;
}

interface CreateJobModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultEngineerId?: string;
  initialData?: InitialJobData | null;
}

export function CreateJobModal({ open, onClose, onCreated, defaultEngineerId, initialData }: CreateJobModalProps) {
  const { profile } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [engineers, setEngineers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewClient, setShowNewClient] = useState(false);

  const [clientId, setClientId] = useState('');
  const [engineerId, setEngineerId] = useState(defaultEngineerId || '');
  const [callSource, setCallSource] = useState<'online' | 'direct'>('direct');
  const [issueTitle, setIssueTitle] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [priority, setPriority] = useState<JobPriority>('medium');
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().split('T')[0]);
  const [scheduledTime, setScheduledTime] = useState('');
  const [assignedByName, setAssignedByName] = useState('');
  const [callGivenBy, setCallGivenBy] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  const [newClientName, setNewClientName] = useState('');
  const [newClientCompany, setNewClientCompany] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientAddress, setNewClientAddress] = useState('');
  const [newClientCity, setNewClientCity] = useState('');

  useEffect(() => {
    if (open) {
      loadData();
      if (initialData) {
        if (initialData.clientId) {
          setClientId(initialData.clientId);
          setShowNewClient(false);
        } else if (initialData.clientName) {
          setShowNewClient(true);
          setNewClientName(initialData.clientName || '');
          setNewClientCompany(initialData.clientCompany || '');
          setNewClientPhone(initialData.clientPhone || '');
          setNewClientEmail(initialData.clientEmail || '');
          setNewClientAddress(initialData.clientAddress || '');
          setNewClientCity(initialData.clientCity || '');
        }
        if (initialData.engineerId) setEngineerId(initialData.engineerId);
        if (initialData.callSource) setCallSource(initialData.callSource);
        if (initialData.issueTitle) setIssueTitle(initialData.issueTitle);
        if (initialData.issueDescription) setIssueDescription(initialData.issueDescription);
        if (initialData.priority) setPriority(initialData.priority);
        if (initialData.scheduledDate) setScheduledDate(initialData.scheduledDate);
        if (initialData.scheduledTime) setScheduledTime(initialData.scheduledTime);
        if (initialData.callGivenBy) setCallGivenBy(initialData.callGivenBy);
        if (initialData.assignedByName) setAssignedByName(initialData.assignedByName);
        if (initialData.adminNotes) setAdminNotes(initialData.adminNotes);
      } else {
        if (defaultEngineerId) {
          setEngineerId(defaultEngineerId);
        } else if (profile?.role === 'engineer') {
          setEngineerId(profile.id);
        }
        setAssignedByName(profile?.full_name || (profile?.role === 'engineer' ? 'Service Engineer' : 'Admin'));
      }
    }
  }, [open, defaultEngineerId, profile, initialData]);

  async function loadData() {
    const [clientsRes, engineersRes] = await Promise.all([
      supabase.from('clients').select('*').order('client_name'),
      supabase.from('profiles').select('*').eq('role', 'engineer').eq('is_active', true).order('full_name'),
    ]);
    setClients((clientsRes.data as unknown as Client[]) || []);
    setEngineers((engineersRes.data as unknown as Profile[]) || []);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!clientId && !showNewClient) {
      setError('Please select a client.');
      return;
    }
    if (showNewClient && !newClientName.trim()) {
      setError('Client name is required.');
      return;
    }
    if (!engineerId) {
      setError('Please select an engineer.');
      return;
    }
    if (!issueTitle.trim()) {
      setError('Issue title is required.');
      return;
    }
    if (!scheduledDate) {
      setError('Scheduled date is required.');
      return;
    }

    setLoading(true);

    try {
      let finalClientId = clientId;

      if (showNewClient) {
        const newCId = crypto.randomUUID();
        const clientPayload = {
          id: newCId,
          client_name: newClientName.trim(),
          company_name: newClientCompany.trim(),
          phone: newClientPhone.trim(),
          email: newClientEmail.trim(),
          address: newClientAddress.trim(),
          city: newClientCity.trim(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { data: newClient, error: clientErr } = await supabase
          .from('clients')
          .insert(clientPayload)
          .select()
          .single();

        if (clientErr) throw new Error(`Database Error creating client: ${clientErr.message}`);
        if (newClient) finalClientId = (newClient as Client).id;
      }

      const newJobId = crypto.randomUUID();
      const { data: allJobs } = await supabase.from('service_jobs').select('job_number');
      let maxNum = 1000;
      (allJobs || []).forEach((j) => {
        const match = j.job_number?.match(/JOB-(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      });
      const autoJobNo = `JOB-${maxNum + 1}`;

      const jobPayload = {
        id: newJobId,
        job_number: autoJobNo,
        client_id: finalClientId,
        engineer_id: engineerId,
        issue_title: issueTitle.trim(),
        issue_description: issueDescription.trim(),
        priority,
        status: 'assigned' as const,
        call_source: callSource,
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        assigned_at: new Date().toISOString(),
        call_given_by: callGivenBy.trim() || null,
        assigned_by_name: assignedByName.trim() || profile?.full_name || (profile?.role === 'engineer' ? 'Service Engineer' : 'Admin'),
        admin_notes: adminNotes.trim(),
        created_by: profile?.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: jobErr } = await safeInsertServiceJob(jobPayload);
      if (jobErr) throw new Error(`Database Error creating service job: ${jobErr.message}`);

      if (initialData?.notificationId) {
        await markNotificationAsRead(initialData.notificationId);
      }

      onCreated();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job.');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setClientId('');
    setEngineerId(defaultEngineerId || '');
    setCallSource('direct');
    setIssueTitle('');
    setIssueDescription('');
    setPriority('medium');
    setScheduledDate(new Date().toISOString().split('T')[0]);
    setScheduledTime('');
    setAssignedByName('');
    setCallGivenBy('');
    setAdminNotes('');
    setShowNewClient(false);
    setNewClientName('');
    setNewClientCompany('');
    setNewClientPhone('');
    setNewClientEmail('');
    setNewClientAddress('');
    setNewClientCity('');
    setError(null);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="mt-8 w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
          <div>
            <h2 className="text-lg font-bold">Create Service Job / Call</h2>
            <p className="text-xs text-slate-400">
              {profile?.role === 'engineer' ? 'Log direct or online call as Engineer' : 'Create and assign service call as Admin'}
            </p>
          </div>
          <button onClick={handleClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-medium">
              {error}
            </div>
          )}

          {/* Call Source Selection: Online vs Direct */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-700">
              Call Type / Source *
            </span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setCallSource('direct')}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-sm font-bold border transition ${
                  callSource === 'direct'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                <UserCheck className="h-4 w-4" />
                <span>Direct Call (Walk-in / Phone)</span>
              </button>

              <button
                type="button"
                onClick={() => setCallSource('online')}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-sm font-bold border transition ${
                  callSource === 'online'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                <Globe className="h-4 w-4" />
                <span>Online Call (Portal / Web / WhatsApp)</span>
              </button>
            </div>
          </div>

          {/* Client selection */}
          <div>
            <label htmlFor="create-job-client" className="mb-1.5 block text-sm font-semibold text-slate-700">Client *</label>
            {!showNewClient ? (
              <div className="flex gap-2">
                <select
                  id="create-job-client"
                  name="client_id"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-blue-500 font-medium"
                >
                  <option value="">Select a client...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      [{c.client_code || `CL-${c.id.slice(0, 5).toUpperCase()}`}] {c.client_name} — {c.company_name || c.city}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewClient(true)}
                  className="flex items-center gap-1 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 border border-slate-300"
                >
                  <Plus className="h-4 w-4" /> New
                </button>
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-blue-900">New Client Details</span>
                  <button
                    type="button"
                    onClick={() => setShowNewClient(false)}
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    Select existing client
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    id="new-client-code"
                    name="new_client_code"
                    type="text"
                    placeholder="Client ID (e.g. CL-101)"
                    value={newClientPhone ? `CL-${newClientPhone.slice(-4)}` : ''}
                    readOnly
                    className="rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-sm font-mono outline-none"
                  />
                  <input
                    id="new-client-name"
                    name="new_client_name"
                    type="text"
                    placeholder="Client name *"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <input
                  id="new-client-company"
                  name="new_client_company"
                  type="text"
                  placeholder="Company name"
                  value={newClientCompany}
                  onChange={(e) => setNewClientCompany(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    id="new-client-phone"
                    name="new_client_phone"
                    type="text"
                    placeholder="Phone"
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                  <input
                    id="new-client-email"
                    name="new_client_email"
                    type="email"
                    placeholder="Email"
                    value={newClientEmail}
                    onChange={(e) => setNewClientEmail(e.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    id="new-client-address"
                    name="new_client_address"
                    type="text"
                    placeholder="Address"
                    value={newClientAddress}
                    onChange={(e) => setNewClientAddress(e.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                  <input
                    id="new-client-city"
                    name="new_client_city"
                    type="text"
                    placeholder="City"
                    value={newClientCity}
                    onChange={(e) => setNewClientCity(e.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Engineer Assignment */}
          <div>
            <label htmlFor="create-job-engineer" className="mb-1.5 block text-sm font-semibold text-slate-700">Assign Engineer *</label>
            <select
              id="create-job-engineer"
              name="engineer_id"
              value={engineerId}
              onChange={(e) => setEngineerId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-blue-500 font-medium"
            >
              <option value="">Select an engineer...</option>
              {engineers.map((e) => (
                <option key={e.id} value={e.id}>
                  [{e.employee_id || `EMP-${e.id.slice(0, 5).toUpperCase()}`}] {e.full_name} ({e.email})
                </option>
              ))}
            </select>
          </div>

          {/* Service details */}
          <div>
            <label htmlFor="create-job-title" className="mb-1.5 block text-sm font-semibold text-slate-700">Issue Title *</label>
            <input
              id="create-job-title"
              name="issue_title"
              type="text"
              value={issueTitle}
              onChange={(e) => setIssueTitle(e.target.value)}
              placeholder="e.g. Laptop not powering on, OS corrupt..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 font-medium"
            />
          </div>

          <div>
            <label htmlFor="create-job-description" className="mb-1.5 block text-sm font-semibold text-slate-700">Issue Description</label>
            <textarea
              id="create-job-description"
              name="issue_description"
              value={issueDescription}
              onChange={(e) => setIssueDescription(e.target.value)}
              rows={2}
              placeholder="Describe the problem or symptoms..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="create-job-priority" className="mb-1.5 block text-sm font-semibold text-slate-700">Priority</label>
              <select
                id="create-job-priority"
                name="priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as JobPriority)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 font-semibold"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label htmlFor="create-job-time" className="mb-1.5 block text-sm font-semibold text-slate-700">Scheduled Time</label>
              <input
                id="create-job-time"
                name="scheduled_time"
                type="text"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                placeholder="e.g. 10:30 AM"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="create-job-date" className="mb-1.5 block text-sm font-semibold text-slate-700">Scheduled Date *</label>
              <input
                id="create-job-date"
                name="scheduled_date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 font-medium"
              />
            </div>
            <div>
              <label htmlFor="create-job-assigner" className="mb-1.5 block text-sm font-semibold text-slate-700">Assign By (Assigned By)</label>
              <input
                id="create-job-assigner"
                name="assigned_by_name"
                type="text"
                value={assignedByName}
                onChange={(e) => setAssignedByName(e.target.value)}
                placeholder="e.g. Bala, Admin..."
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="create-job-caller" className="mb-1.5 block text-sm font-semibold text-slate-700">Given By / Caller</label>
              <input
                id="create-job-caller"
                name="call_given_by"
                type="text"
                value={callGivenBy}
                onChange={(e) => setCallGivenBy(e.target.value)}
                placeholder="e.g. Reception, Client, Manager..."
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="create-job-notes" className="mb-1.5 block text-sm font-semibold text-slate-700">Notes / Remarks</label>
              <input
                id="create-job-notes"
                name="admin_notes"
                type="text"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Internal remarks for this call..."
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl px-5 py-2.5 font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-60 transition"
            >
              {loading && <Loader2 className="h-5 w-5 animate-spin" />}
              Create & Assign Call
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
