import { useState, useEffect, type FormEvent } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { JobPriority, Client } from '@/types/database';
import { addAdminNotification } from '@/lib/notifications';
import {
  CalendarPlus,
  Building,
  Phone,
  Mail,
  MapPin,
  AlertCircle,
  Clock,
  Calendar,
  CheckCircle2,
  Loader2,
  Wrench,
  Zap,
  ArrowRight,
  ShieldCheck,
  ClipboardList,
  Sparkles,
  HelpCircle,
  Cpu,
} from 'lucide-react';

interface ClientBookCallProps {
  onViewCalls?: () => void;
}

const COMMON_CATEGORIES = [
  { label: 'Emergency Breakdown', priority: 'urgent' as JobPriority, icon: Zap },
  { label: 'Calibration & Testing', priority: 'medium' as JobPriority, icon: Wrench },
  { label: 'Hardware Failure', priority: 'high' as JobPriority, icon: AlertCircle },
  { label: 'Preventive Maintenance', priority: 'low' as JobPriority, icon: ShieldCheck },
  { label: 'PLC / Electrical Fault', priority: 'high' as JobPriority, icon: Sparkles },
];

export function ClientBookCall({ onViewCalls }: ClientBookCallProps) {
  const { profile } = useAuth();

  // Client / Company details
  const [clientRecord, setClientRecord] = useState<Client | null>(null);
  const [companyName, setCompanyName] = useState(profile?.company_name || profile?.full_name || '');
  const [contactName, setContactName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Coimbatore');

  // Issue details
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [issueTitle, setIssueTitle] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [priority, setPriority] = useState<JobPriority>('medium');
  const [equipmentModel, setEquipmentModel] = useState('');
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().split('T')[0]);
  const [scheduledTime, setScheduledTime] = useState('Morning (09:00 AM - 01:00 PM)');

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<{
    referenceId: string;
    deviceId?: string;
    issueTitle: string;
    scheduledDate: string;
    scheduledTime: string;
  } | null>(null);

  // Load registered client info from database if available
  useEffect(() => {
    async function loadClientData() {
      if (profile?.client_id) {
        try {
          const { data } = await supabase
            .from('clients')
            .select('*')
            .eq('id', profile.client_id)
            .maybeSingle();

          if (data) {
            const client = data as Client;
            setClientRecord(client);
            if (client.company_name) setCompanyName(client.company_name);
            if (client.client_name) setContactName(client.client_name);
            if (client.phone) setPhone(client.phone);
            if (client.email) setEmail(client.email);
            if (client.address) setAddress(client.address);
            if (client.city) setCity(client.city);

            // Auto-select first registered device if available
            const devList = (client.device_ids || '')
              .split(/[,\n;]/)
              .map((d) => d.trim())
              .filter(Boolean);
            if (devList.length > 0) {
              setSelectedDeviceId(devList[0]);
            }
          }
        } catch {
          // ignore
        }
      }
    }
    loadClientData();
  }, [profile?.client_id]);

  const availableDeviceIds = (clientRecord?.device_ids || '')
    .split(/[,\n;]/)
    .map((d) => d.trim())
    .filter(Boolean);

  function handleQuickCategory(cat: (typeof COMMON_CATEGORIES)[0]) {
    setIssueTitle(cat.label);
    setPriority(cat.priority);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!issueTitle.trim()) {
      setError('Please provide a title or issue summary.');
      return;
    }
    if (!phone.trim()) {
      setError('Please provide a contact phone number.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const refId = `REQ-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      // Construct notification payload for admin
      const notificationPayload = {
        type: 'call_request' as const,
        title: `🌐 Online Service Request: ${issueTitle.trim()}${selectedDeviceId ? ` [${selectedDeviceId}]` : ''}`,
        message: `${companyName || contactName} has booked a service call for "${issueTitle.trim()}"${selectedDeviceId ? ` on Device ${selectedDeviceId}` : ''}. Priority: ${priority.toUpperCase()}. Please assign a service engineer.`,
        actor_name: contactName.trim() || companyName.trim() || 'client portal',
        data: {
          client_id: clientRecord?.id || profile?.client_id || undefined,
          client_name: contactName.trim() || companyName.trim(),
          client_company: companyName.trim(),
          client_phone: phone.trim(),
          client_email: email.trim(),
          client_address: address.trim(),
          client_city: city.trim(),
          device_id: selectedDeviceId.trim() || undefined,
          issue_title: issueTitle.trim(),
          issue_description: `${issueDescription.trim()}${selectedDeviceId ? `\n[Device ID: ${selectedDeviceId.trim()}]` : ''}${equipmentModel ? `\n[Equipment/Model: ${equipmentModel.trim()}]` : ''}\n[Ref: ${refId}]`,
          priority,
          call_source: 'online' as const,
          scheduled_date: scheduledDate,
          scheduled_time: scheduledTime,
          call_given_by: `${contactName.trim()} (${phone.trim()})`,
          admin_notes: `Booked via client portal. Ref: ${refId}${selectedDeviceId ? ` | Device: ${selectedDeviceId.trim()}` : ''}`,
          requesting_engineer_name: 'client portal',
        },
      };

      await addAdminNotification(notificationPayload);

      setBookingSuccess({
        referenceId: refId,
        deviceId: selectedDeviceId.trim() || undefined,
        issueTitle: issueTitle.trim(),
        scheduledDate,
        scheduledTime,
      });
    } catch (err) {
      console.error('Call booking error:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit service request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setBookingSuccess(null);
    setIssueTitle('');
    setIssueDescription('');
    setEquipmentModel('');
    setPriority('medium');
  }

  // ─── Success Screen ───
  if (bookingSuccess) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="overflow-hidden rounded-3xl border border-emerald-500/30 bg-slate-900 p-8 sm:p-10 shadow-2xl relative">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
          
          <div className="flex flex-col items-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-500/10 mb-6 animate-bounce">
              <CheckCircle2 className="h-10 w-10" />
            </div>

            <span className="rounded-full bg-emerald-500/20 px-3.5 py-1 text-xs font-bold text-emerald-300 border border-emerald-500/40 uppercase tracking-wider mb-2">
              Service Request Dispatched
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              Your Service Call is Booked!
            </h1>
            <p className="mt-2 text-sm sm:text-base text-slate-300 max-w-lg">
              Your request has been received by our central service dispatch team. Admin will assign a dedicated field engineer shortly.
            </p>

            <div className="mt-8 w-full rounded-2xl bg-slate-800/80 p-5 sm:p-6 border border-slate-700/80 text-left space-y-3">
              <div className="flex items-center justify-between border-b border-slate-700 pb-3">
                <span className="text-xs text-slate-400">Reference Number</span>
                <span className="font-mono text-sm font-bold text-blue-400 bg-blue-900/40 px-2.5 py-1 rounded-lg border border-blue-700/50">
                  {bookingSuccess.referenceId}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-700 pb-3 text-sm">
                <span className="text-xs text-slate-400">Service Issue</span>
                <span className="font-semibold text-white truncate max-w-[220px]">
                  {bookingSuccess.issueTitle}
                </span>
              </div>
              {bookingSuccess.deviceId && (
                <div className="flex items-center justify-between border-b border-slate-700 pb-3 text-sm">
                  <span className="text-xs text-slate-400">Affected Device</span>
                  <span className="font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-700/50">
                    📟 {bookingSuccess.deviceId}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between border-b border-slate-700 pb-3 text-sm">
                <span className="text-xs text-slate-400">Preferred Slot</span>
                <span className="font-semibold text-white">
                  {bookingSuccess.scheduledDate} ({bookingSuccess.scheduledTime.split('(')[0].trim()})
                </span>
              </div>
              <div className="flex items-center justify-between text-sm pt-1">
                <span className="text-xs text-slate-400">Dispatch Status</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400">
                  <Clock className="h-3.5 w-3.5 animate-spin" /> Admin Review & Assignment
                </span>
              </div>
            </div>

            <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              {onViewCalls && (
                <button
                  type="button"
                  onClick={onViewCalls}
                  className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700 transition"
                >
                  <ClipboardList className="h-4 w-4" />
                  <span>Track My Service Requests</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={handleReset}
                className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-5 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition"
              >
                <CalendarPlus className="h-4 w-4" />
                <span>Book Another Call</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Booking Form Screen ───
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Hero Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-3.5 py-1 text-xs font-bold text-blue-400 border border-blue-500/20 mb-3">
          <CalendarPlus className="h-3.5 w-3.5" /> Fast Online Service Booking
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
          Book a Field Service Engineer
        </h1>
        <p className="mt-1.5 text-sm sm:text-base text-slate-400">
          Request machine inspection, calibration, troubleshooting, or emergency breakdown repair at your doorstep.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-300 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
            <div>
              <p className="font-bold">Booking Notice</p>
              <p className="text-xs text-red-200 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Section 1: Quick Categories */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6 shadow-xl backdrop-blur-md">
          <label className="mb-2.5 block text-xs font-bold uppercase tracking-wider text-slate-400">
            Quick Issue Categories
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {COMMON_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isSelected = issueTitle === cat.label;
              return (
                <button
                  key={cat.label}
                  type="button"
                  onClick={() => handleQuickCategory(cat)}
                  className={`flex flex-col items-start gap-2 rounded-2xl p-3.5 text-left border transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-600/20 text-white shadow-lg shadow-blue-500/10 ring-2 ring-blue-500/30'
                      : 'border-slate-800 bg-slate-800/60 text-slate-300 hover:border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  <div className={`p-2 rounded-xl ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-bold leading-tight">{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 2: Affected Device Selection */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Cpu className="h-4 w-4 text-blue-400" />
              <span>Which Device / Machine has the problem?</span>
            </h2>
            {clientRecord?.device_count ? (
              <span className="text-xs text-blue-400 font-semibold bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20">
                {clientRecord.device_count} Registered Devices
              </span>
            ) : null}
          </div>

          <p className="text-xs text-slate-400">
            Please indicate the specific device ID or equipment tag that requires service or calibration.
          </p>

          {availableDeviceIds.length > 0 ? (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-300">
                Select from your Registered Devices:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                {availableDeviceIds.map((devId) => {
                  const isSelected = selectedDeviceId === devId;
                  return (
                    <button
                      key={devId}
                      type="button"
                      onClick={() => setSelectedDeviceId(devId)}
                      className={`flex items-center gap-2.5 p-3 rounded-2xl border text-left transition ${
                        isSelected
                          ? 'border-blue-500 bg-blue-600/25 text-white ring-2 ring-blue-500/40 shadow-md shadow-blue-500/10'
                          : 'border-slate-800 bg-slate-800/60 text-slate-300 hover:border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      <div className={`p-2 rounded-xl shrink-0 ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                        <Cpu className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-mono text-xs font-bold block truncate">{devId}</span>
                        <span className="text-[10px] text-slate-400 block">{isSelected ? 'Selected' : 'Device unit'}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="pt-2">
                <label className="mb-1.5 block text-xs font-semibold text-slate-400">
                  Or enter specific device ID / machine number:
                </label>
                <input
                  type="text"
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  placeholder="e.g. DEV-01, Machine #4"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-mono text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                Device ID / Machine Tag / Serial Number
              </label>
              <input
                type="text"
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                placeholder="e.g. DEV-01, Machine #2, Calibration Unit A"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-mono text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          )}
        </div>

        {/* Section 3: Problem Description */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6 shadow-xl space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <Wrench className="h-4 w-4 text-blue-400" />
            <span>Problem & Equipment Details</span>
          </h2>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-300">
              Service Issue / Problem Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={issueTitle}
              onChange={(e) => setIssueTitle(e.target.value)}
              placeholder="e.g. CNC Lathe Motor Vibrating Excessively / Calibration Expired"
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                Machine / Equipment Model (Optional)
              </label>
              <input
                type="text"
                value={equipmentModel}
                onChange={(e) => setEquipmentModel(e.target.value)}
                placeholder="e.g. Fanuc Robodrill D21 / Fluke 8846A"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                Urgency / Priority Level <span className="text-red-400">*</span>
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as JobPriority)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="low">🟢 Normal (Within 48 Hours)</option>
                <option value="medium">🟡 Standard (Within 24 Hours)</option>
                <option value="high">🟠 High Priority (Same Day Service)</option>
                <option value="urgent">🔴 Critical / Emergency Breakdown (Immediate)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-300">
              Detailed Fault Description & Symptoms
            </label>
            <textarea
              rows={3}
              value={issueDescription}
              onChange={(e) => setIssueDescription(e.target.value)}
              placeholder="Describe what error codes appear, when it started, or specific tests required..."
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        {/* Section 3: Company & Service Location */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6 shadow-xl space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <Building className="h-4 w-4 text-emerald-400" />
            <span>Company & Service Site Location</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                Company / Organization Name <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Building className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Apex Industries Pvt Ltd"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                Contact Person Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="e.g. Mr. Rajesh Kumar"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                Site Contact Phone <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                Email Address for Reports
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="support@company.com"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                Site Service Address <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Plot 42, SIDCO Industrial Estate, Kurichi"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                City / Region <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Coimbatore"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Preferred Schedule */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6 shadow-xl space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <Calendar className="h-4 w-4 text-purple-400" />
            <span>Preferred Schedule & Timing</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                Preferred Service Date <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                required
                value={scheduledDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                Preferred Time Slot <span className="text-red-400">*</span>
              </label>
              <select
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500"
              >
                <option value="Morning (09:00 AM - 01:00 PM)">🌅 Morning (09:00 AM - 01:00 PM)</option>
                <option value="Afternoon (01:00 PM - 05:00 PM)">☀️ Afternoon (01:00 PM - 05:00 PM)</option>
                <option value="Evening (05:00 PM - 08:00 PM)">🌆 Evening (05:00 PM - 08:00 PM)</option>
                <option value="Emergency (Immediate / ASAP)">🚨 Emergency (Immediate / ASAP)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Submit Action */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>Instant dispatch alert sent directly to ICS central service administration.</span>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-2xl bg-blue-600 px-8 py-3.5 text-sm font-bold text-white shadow-xl shadow-blue-600/30 hover:bg-blue-700 transition disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Sending Request to Admin...</span>
              </>
            ) : (
              <>
                <CalendarPlus className="h-4 w-4" />
                <span>Submit Service Request</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

