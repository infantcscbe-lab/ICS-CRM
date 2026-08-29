import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type { Client, JobPriority } from '@/types/database';
import { X, Send, Loader2, Globe, MapPin, CheckCircle2, User, Building, Phone } from 'lucide-react';
import { addAdminNotification } from '@/lib/notifications';

interface RequestCallModalProps {
  open: boolean;
  onClose: () => void;
  onRequestSubmitted?: () => void;
}

export function RequestCallModal({ open, onClose, onRequestSubmitted }: RequestCallModalProps) {
  const { profile } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewClient, setShowNewClient] = useState(false);

  const [clientId, setClientId] = useState('');
  const [callSource, setCallSource] = useState<'online' | 'direct'>('direct');
  const [issueTitle, setIssueTitle] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [priority, setPriority] = useState<JobPriority>('medium');
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().split('T')[0]);
  const [scheduledTime, setScheduledTime] = useState('');
  const [callGivenBy, setCallGivenBy] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  // New Client Fields
  const [newClientName, setNewClientName] = useState('');
  const [newClientCompany, setNewClientCompany] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientAddress, setNewClientAddress] = useState('');
  const [newClientCity, setNewClientCity] = useState('');

  useEffect(() => {
    if (open) {
      loadClients();
      setSuccess(false);
      setError(null);
    }
  }, [open]);

  async function loadClients() {
    const { data } = await supabase.from('clients').select('*').order('client_name');
    setClients((data as unknown as Client[]) || []);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!clientId && !showNewClient) {
      setError('Please select a client or enter new client details.');
      return;
    }
    if (showNewClient && !newClientName.trim()) {
      setError('Client name is required.');
      return;
    }
    if (!issueTitle.trim()) {
      setError('Issue title is required.');
      return;
    }

    setLoading(true);

    try {
      const selectedClient = clients.find((c) => c.id === clientId);
      const clientName = showNewClient ? newClientName.trim() : (selectedClient?.client_name || 'Client');
      const clientPhone = showNewClient ? newClientPhone.trim() : (selectedClient?.phone || '');

      await addAdminNotification({
        job_id: 'CALL-REQUEST',
        job_number: 'CALL-REQ',
        type: 'call_request',
        title: `📞 Call Request: ${issueTitle.trim()}`,
        message: `${profile?.full_name || 'Engineer'} requested a new ${callSource} call for client "${clientName}".`,
        actor_name: profile?.full_name || 'Service Engineer',
        data: {
          client_id: clientId || undefined,
          client_name: clientName,
          client_company: showNewClient ? newClientCompany.trim() : (selectedClient?.company_name || undefined),
          client_phone: clientPhone || undefined,
          client_email: showNewClient ? newClientEmail.trim() : (selectedClient?.email || undefined),
          client_address: showNewClient ? newClientAddress.trim() : (selectedClient?.address || undefined),
          client_city: showNewClient ? newClientCity.trim() : (selectedClient?.city || undefined),
          issue_title: issueTitle.trim(),
          issue_description: issueDescription.trim(),
          priority,
          call_source: callSource,
          scheduled_date: scheduledDate,
          scheduled_time: scheduledTime,
          call_given_by: callGivenBy.trim() || undefined,
          admin_notes: adminNotes.trim() || undefined,
          requesting_engineer_id: profile?.id,
          requesting_engineer_name: profile?.full_name || 'Engineer',
        },
      });

      setSuccess(true);
      if (onRequestSubmitted) onRequestSubmitted();

      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send call request to Admin.');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setClientId('');
    setCallSource('direct');
    setIssueTitle('');
    setIssueDescription('');
    setPriority('medium');
    setScheduledDate(new Date().toISOString().split('T')[0]);
    setScheduledTime('');
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
    setSuccess(false);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-blue-900 to-slate-900 px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600/30 text-blue-300 border border-blue-400/30">
              <Send className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Request Service Call</h2>
              <p className="text-xs text-blue-200">Send call creation request to Admin Panel</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1 text-slate-300 hover:bg-white/10 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        {success ? (
          <div className="p-8 text-center space-y-3">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-10 w-10 animate-bounce" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Request Sent to Admin!</h3>
            <p className="text-sm text-slate-600 max-w-sm mx-auto">
              Your service call creation request has been forwarded to the Admin panel. Admin will receive an instant notification to review and schedule.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
            {error && (
              <div className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700 border border-red-200">
                {error}
              </div>
            )}

            {/* Call Source Selector */}
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Call Type / Source *
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCallSource('direct')}
                  className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold transition ${
                    callSource === 'direct'
                      ? 'border-blue-600 bg-blue-50/80 text-blue-900 ring-2 ring-blue-200'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <MapPin className={`h-4 w-4 ${callSource === 'direct' ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span>📍 Direct Call (On-Site)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCallSource('online')}
                  className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold transition ${
                    callSource === 'online'
                      ? 'border-indigo-600 bg-indigo-50/80 text-indigo-900 ring-2 ring-indigo-200'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Globe className={`h-4 w-4 ${callSource === 'online' ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span>🌐 Online Call (Remote)</span>
                </button>
              </div>
            </div>

            {/* Client Selection */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Client / Customer *
                </label>
                <button
                  type="button"
                  onClick={() => setShowNewClient(!showNewClient)}
                  className="text-xs font-bold text-blue-600 hover:underline"
                >
                  {showNewClient ? '← Select Existing Client' : '+ New Client'}
                </button>
              </div>

              {showNewClient ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                  <p className="text-xs font-bold text-slate-700">New Client Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Contact Name *"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium outline-none focus:border-blue-500"
                    />
                    <input
                      type="text"
                      placeholder="Company / Firm Name"
                      value={newClientCompany}
                      onChange={(e) => setNewClientCompany(e.target.value)}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="tel"
                      placeholder="Phone Number *"
                      value={newClientPhone}
                      onChange={(e) => setNewClientPhone(e.target.value)}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium outline-none focus:border-blue-500"
                    />
                    <input
                      type="text"
                      placeholder="City (e.g. Coimbatore)"
                      value={newClientCity}
                      onChange={(e) => setNewClientCity(e.target.value)}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium outline-none focus:border-blue-500"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Full Address / Location"
                    value={newClientAddress}
                    onChange={(e) => setNewClientAddress(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium outline-none focus:border-blue-500"
                  />
                </div>
              ) : (
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-medium outline-none focus:border-blue-500"
                >
                  <option value="">Select Existing Customer...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.client_name} {c.company_name ? `(${c.company_name})` : ''} - {c.city || 'Coimbatore'}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Issue Title & Description */}
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Issue / Service Description *
              </label>
              <input
                type="text"
                value={issueTitle}
                onChange={(e) => setIssueTitle(e.target.value)}
                placeholder="e.g. Motherboard replacement, Screen flickering..."
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-medium outline-none focus:border-blue-500"
              />
              <textarea
                value={issueDescription}
                onChange={(e) => setIssueDescription(e.target.value)}
                rows={2}
                placeholder="Additional fault details or customer remarks..."
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium outline-none focus:border-blue-500"
              />
            </div>

            {/* Priority & Scheduled Time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as JobPriority)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-medium outline-none focus:border-blue-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Scheduled Time
                </label>
                <input
                  type="text"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  placeholder="e.g. 11:30 AM"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-medium outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Scheduled Date & Call Given By */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Scheduled Date *
                </label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-medium outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Call Given By / Caller
                </label>
                <input
                  type="text"
                  value={callGivenBy}
                  onChange={(e) => setCallGivenBy(e.target.value)}
                  placeholder="e.g. Reception, Manager..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-medium outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Notes for Admin
              </label>
              <input
                type="text"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Any special instruction for Admin..."
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-60 transition"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span>Send Call Request to Admin</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
