import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badges';
import type { ServiceJob, ServiceJobPhoto, JobLocationLog, Client, Profile, Vendor } from '@/types/database';
import {
  ArrowLeft,
  MapPin,
  Phone,
  Clock,
  Route,
  Wrench,
  CheckCircle2,
  Car,
  FileText,
  Image as ImageIcon,
  Navigation,
  Mail,
  Printer,
  UserCheck,
  Building,
  PhoneCall,
  X,
  Loader2,
  Download,
  Store,
  Cpu,
} from 'lucide-react';
import { calculateGpsDistance, formatDuration, formatKm } from '@/lib/distance';
import { LiveTrackingMap } from '@/components/maps/LiveTrackingMap';
import { sendCustomerCallReportPdf, downloadCallReportPdf, generateCallReportHtml } from '@/lib/emailReport';
import { addAdminNotification } from '@/lib/notifications';
import { safeUpdateServiceJob } from '@/lib/safeDb';
import { parseClientDevices, getDeviceContractInfo } from '@/lib/clientDevices';

interface JobDetailProps {
  jobId: string;
  onBack: () => void;
}

function formatTime(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function JobDetail({ jobId, onBack }: JobDetailProps) {
  const [job, setJob] = useState<ServiceJob | null>(null);
  const [engineersList, setEngineersList] = useState<Profile[]>([]);
  const [vendorsList, setVendorsList] = useState<Vendor[]>([]);
  const [photos, setPhotos] = useState<ServiceJobPhoto[]>([]);
  const [logs, setLogs] = useState<JobLocationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showReportPreview, setShowReportPreview] = useState(false);

  // Admin Override Modals
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [adminTargetEngId, setAdminTargetEngId] = useState('');
  const [adminReassignReason, setAdminReassignReason] = useState('');

  const [showVendorModal, setShowVendorModal] = useState(false);
  const [adminVendorName, setAdminVendorName] = useState('');
  const [adminVendorPhone, setAdminVendorPhone] = useState('');
  const [adminVendorNotes, setAdminVendorNotes] = useState('');

  const [showCallbackModal, setShowCallbackModal] = useState(false);
  const [adminCallbackDate, setAdminCallbackDate] = useState('');
  const [adminCallbackTime, setAdminCallbackTime] = useState('');
  const [adminCallbackReason, setAdminCallbackReason] = useState('');

  useEffect(() => {
    if (jobId) loadData();
  }, [jobId]);

  async function handleSendReport() {
    if (!job) return;
    setEmailSending(true);
    setEmailNotice(null);
    try {
      const res = await sendCustomerCallReportPdf(job);
      setEmailNotice(res.message);
    } catch {
      setEmailNotice('Failed to dispatch PDF report to customer.');
    } finally {
      setEmailSending(false);
    }
  }

  async function handleDownloadPdf() {
    if (!job) return;
    await downloadCallReportPdf(job);
  }

  function handlePrintReport() {
    if (!job) return;
    const html = generateCallReportHtml(job);
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 350);
    }
  }

  async function loadData() {
    const [{ data: jobData }, { data: photoData }, { data: logData }, { data: clientData }, { data: engData }] =
      await Promise.all([
        supabase.from('service_jobs').select('*').eq('id', jobId).maybeSingle(),
        supabase.from('service_job_photos').select('*').eq('job_id', jobId).order('created_at'),
        supabase.from('job_location_logs').select('*').eq('job_id', jobId).order('recorded_at'),
        supabase.from('clients').select('*'),
        supabase.from('profiles').select('*'),
      ]);

    const dbEng = (engData as unknown as Profile[]) || [];
    const engMap = new Map<string, Profile>();
    dbEng.forEach((e) => engMap.set(e.id, e));
    setEngineersList(dbEng.filter((e) => e.role === 'engineer' && e.is_active));

    const dbClients = (clientData as unknown as Client[]) || [];
    const clientMap = new Map<string, Client>();
    dbClients.forEach((c) => clientMap.set(c.id, c));

    let j = jobData as unknown as ServiceJob;
    if (j) {
      j.client = j.client || clientMap.get(j.client_id);
      j.engineer = j.engineer || (j.engineer_id ? engMap.get(j.engineer_id) : null);
    }

    setJob(j);
    setPhotos((photoData as unknown as ServiceJobPhoto[]) || []);
    setLogs((logData as unknown as JobLocationLog[]) || []);
    if (j?.vendor_name) setAdminVendorName(j.vendor_name);
    if (j?.vendor_phone) setAdminVendorPhone(j.vendor_phone);
    if (j?.vendor_notes) setAdminVendorNotes(j.vendor_notes);
    if (j?.engineer_id) setAdminTargetEngId(j.engineer_id);

    try {
      const { data: vData } = await supabase.from('vendors').select('*').eq('is_active', true).order('vendor_name');
      if (vData && vData.length > 0) {
        setVendorsList(vData as Vendor[]);
      } else {
        const cached = localStorage.getItem('ics_local_vendors_cache');
        if (cached) setVendorsList(JSON.parse(cached));
      }
    } catch {
      const cached = localStorage.getItem('ics_local_vendors_cache');
      if (cached) setVendorsList(JSON.parse(cached));
    }

    setLoading(false);
  }

  async function updateJob(updates: Partial<ServiceJob>) {
    const { error: uErr } = await safeUpdateServiceJob(jobId, updates as Record<string, unknown>);
    if (uErr) {
      throw new Error(`Database Error: ${uErr.message}`);
    }
    await loadData();
  }

  // --- ADMIN ACTIONS (CHANGE / OVERRIDE) ---

  async function handleAdminReassign() {
    if (!adminTargetEngId) {
      setActionNotice({ type: 'error', message: 'Please select an engineer.' });
      return;
    }
    if (job?.status === 'vendor' && !adminReassignReason.trim()) {
      setActionNotice({ type: 'error', message: 'Admin note/reason is required to move this job out of Vendor Handling.' });
      return;
    }
    setActionLoading(true);
    try {
      const targetEng = engineersList.find((e) => e.id === adminTargetEngId);
      const updates = {
        engineer_id: adminTargetEngId,
        reassigned_from_name: 'Admin Override',
        reassignment_reason: adminReassignReason || 'Reassigned by Admin',
        admin_notes: (job?.admin_notes ? job.admin_notes + '\n' : '') + (adminReassignReason.trim() ? `[Admin Reassigned from Vendor: ${adminReassignReason.trim()}]` : ''),
        status: (job?.status === 'vendor' ? 'assigned' : job?.status) || 'assigned',
      };
      await updateJob(updates);

      addAdminNotification({
        job_id: jobId,
        job_number: job?.job_number || 'JOB',
        type: 'reassigned',
        title: `Job #${job?.job_number} Reassigned by Admin`,
        message: `Admin assigned job to ${targetEng?.full_name || 'engineer'}.${adminReassignReason ? ` Reason: ${adminReassignReason}` : ''}`,
        actor_name: 'Admin',
        data: {
          target_engineer_id: adminTargetEngId,
          target_engineer_name: targetEng?.full_name,
          reason: adminReassignReason,
        },
      });

      setActionNotice({ type: 'success', message: `Job reassigned to ${targetEng?.full_name || 'engineer'} successfully.` });
      setShowReassignModal(false);
    } catch {
      setActionNotice({ type: 'error', message: 'Failed to reassign engineer.' });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAdminVendor() {
    if (!adminVendorName.trim()) {
      setActionNotice({ type: 'error', message: 'Please enter a vendor name.' });
      return;
    }
    setActionLoading(true);
    try {
      const updates = {
        status: 'vendor' as const,
        vendor_name: adminVendorName.trim(),
        vendor_phone: adminVendorPhone.trim() || null,
        vendor_notes: adminVendorNotes.trim() || null,
      };
      await updateJob(updates);

      addAdminNotification({
        job_id: jobId,
        job_number: job?.job_number || 'JOB',
        type: 'vendor',
        title: `Job #${job?.job_number} Vendor Updated by Admin`,
        message: `Admin updated vendor to "${adminVendorName.trim()}".`,
        actor_name: 'Admin',
        data: {
          vendor_name: adminVendorName.trim(),
          vendor_phone: adminVendorPhone.trim(),
          reason: adminVendorNotes,
        },
      });

      setActionNotice({ type: 'success', message: `Vendor details saved and job status set to Vendor Handling.` });
      setShowVendorModal(false);
    } catch {
      setActionNotice({ type: 'error', message: 'Failed to update vendor.' });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAdminCallback() {
    if (!adminCallbackDate) {
      setActionNotice({ type: 'error', message: 'Please select a call back date.' });
      return;
    }
    setActionLoading(true);
    try {
      const updates = {
        status: 'call_back' as const,
        call_back_date: adminCallbackDate,
        call_back_time: adminCallbackTime,
        call_back_reason: adminCallbackReason.trim() || null,
        scheduled_date: adminCallbackDate,
        scheduled_time: adminCallbackTime,
      };
      await updateJob(updates);

      addAdminNotification({
        job_id: jobId,
        job_number: job?.job_number || 'JOB',
        type: 'call_back',
        title: `Job #${job?.job_number} Call Back Updated by Admin`,
        message: `Admin scheduled Call Back for ${adminCallbackDate} at ${adminCallbackTime || 'Scheduled Time'}.`,
        actor_name: 'Admin',
        data: {
          call_back_date: adminCallbackDate,
          call_back_time: adminCallbackTime,
          reason: adminCallbackReason,
        },
      });

      setActionNotice({ type: 'success', message: `Call Back scheduled for ${adminCallbackDate} at ${adminCallbackTime}!` });
      setShowCallbackModal(false);
    } catch {
      setActionNotice({ type: 'error', message: 'Failed to update callback schedule.' });
    } finally {
      setActionLoading(false);
    }
  }

  if (loading)
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-slate-500">Loading job...</p>
      </div>
    );
  if (!job) return <div className="p-4 text-center text-slate-500">Job not found.</div>;

  const timeline = [
    { label: 'Job assigned', time: job.assigned_at, icon: FileText },
    { label: 'Travel started', time: job.travel_started_at, icon: Car },
    { label: 'Reached client', time: job.reached_at, icon: MapPin },
    { label: 'Service started', time: job.service_started_at, icon: Wrench },
    { label: 'Issue solved', time: job.solved_at, icon: CheckCircle2 },
    { label: 'Job completed', time: job.completed_at, icon: CheckCircle2 },
  ].filter((t) => t.time);

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-5 w-5" /> Back
      </button>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{job.job_number}</h1>
          <p className="mt-1 text-slate-600">{job.issue_title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge priority={job.priority} />
          <StatusBadge status={job.status} />

          {/* Action Buttons for Call Report */}
          <button
            onClick={() => setShowReportPreview(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
          >
            <FileText className="h-4 w-4 text-blue-600" /> View Slip
          </button>

          <button
            onClick={handleDownloadPdf}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
          >
            <Download className="h-4 w-4 text-emerald-600" /> Download PDF
          </button>

          <button
            onClick={handleSendReport}
            disabled={emailSending}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 transition"
          >
            <Mail className="h-4 w-4" /> {emailSending ? 'Sending PDF...' : 'Send Customer PDF'}
          </button>
        </div>
      </div>

      {emailNotice && (
        <div className="mb-4 flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs font-semibold text-emerald-800">
          <span>📧 {emailNotice}</span>
          <button onClick={() => setEmailNotice(null)} className="text-emerald-600 hover:text-emerald-900">
            Dismiss
          </button>
        </div>
      )}

      {actionNotice && (
        <div
          className={`mb-4 flex items-center justify-between rounded-xl p-3 text-xs font-semibold border ${
            actionNotice.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{actionNotice.message}</span>
          <button onClick={() => setActionNotice(null)} className="hover:opacity-75">
            Dismiss
          </button>
        </div>
      )}

      {/* Admin Action Bar (Reassign Engineer, Change Vendor, Reschedule Call Back) */}
      <div className="mb-6 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-slate-50 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>Admin Assignment Controls</span>
              <span className="text-[11px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                Admin Privilege
              </span>
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Override assigned engineer, route to an external vendor, or reschedule call back slot.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setAdminTargetEngId(job.engineer_id || '');
                setShowReassignModal(true);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
            >
              <UserCheck className="h-4 w-4" /> Change Engineer
            </button>

            <button
              onClick={() => {
                setAdminVendorName(job.vendor_name || '');
                setAdminVendorPhone(job.vendor_phone || '');
                setAdminVendorNotes(job.vendor_notes || '');
                setShowVendorModal(true);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-purple-700 transition"
            >
              <Building className="h-4 w-4" /> Manage Vendor
            </button>

            <button
              onClick={() => {
                setAdminCallbackDate(job.call_back_date || job.scheduled_date);
                setAdminCallbackTime(job.call_back_time || job.scheduled_time || '10:00 AM');
                setAdminCallbackReason(job.call_back_reason || '');
                setShowCallbackModal(true);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-700 transition"
            >
              <PhoneCall className="h-4 w-4" /> Reschedule Call Back
            </button>
          </div>
        </div>

        {/* Info Badges for Current Vendor / Callback if present */}
        {(job.vendor_name || job.call_back_date || job.reassigned_from_name) && (
          <div className="mt-3 pt-3 border-t border-blue-100 flex flex-wrap gap-2 text-xs">
            {job.reassigned_from_name && (
              <div className="rounded-lg bg-white p-2 border border-blue-200 text-blue-900 shadow-sm flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5 text-blue-600" />
                <span>
                  Reassigned from: <strong>{job.reassigned_from_name}</strong>{' '}
                  {job.reassignment_reason && `(${job.reassignment_reason})`}
                </span>
              </div>
            )}
            {job.vendor_name && (
              <div className="rounded-lg bg-purple-50 p-2 border border-purple-200 text-purple-900 shadow-sm flex items-center gap-1.5">
                <Building className="h-3.5 w-3.5 text-purple-600" />
                <span>
                  Vendor: <strong>{job.vendor_name}</strong>{' '}
                  {job.vendor_phone && `(📞 ${job.vendor_phone})`}{' '}
                  {job.vendor_notes && `— ${job.vendor_notes}`}
                </span>
              </div>
            )}
            {job.call_back_date && (
              <div className="rounded-lg bg-amber-50 p-2 border border-amber-200 text-amber-900 shadow-sm flex items-center gap-1.5">
                <PhoneCall className="h-3.5 w-3.5 text-amber-600" />
                <span>
                  Call Back: <strong>{job.call_back_date} {job.call_back_time}</strong>{' '}
                  {job.call_back_reason && `(${job.call_back_reason})`}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Client info */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold uppercase text-slate-500">Client</h2>
          <div className="space-y-2 text-sm">
            <p className="text-lg font-semibold text-slate-900">{job.client?.client_name}</p>
            <p className="text-slate-600">{job.client?.company_name}</p>
            <p className="flex items-center gap-2 text-slate-600">
              <Phone className="h-4 w-4" /> {job.client?.phone}
            </p>
            <p className="text-slate-600">{job.client?.email}</p>
            <p className="flex items-center gap-2 text-slate-600">
              <MapPin className="h-4 w-4" /> {job.client?.address}, {job.client?.city}
            </p>
            {job.client?.latitude && job.client?.longitude && (
              <a
                href={`https://www.google.com/maps?q=${job.client.latitude},${job.client.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-blue-600 hover:underline"
              >
                <MapPin className="h-4 w-4" /> View on Google Maps
              </a>
            )}
          </div>
        </div>

        {/* Issue info */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold uppercase text-slate-500">Issue Details</h2>
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-semibold text-slate-700">Title</p>
              <p className="text-slate-600">{job.issue_title}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-700">Description</p>
              <p className="text-slate-600">{job.issue_description || '—'}</p>
            </div>
            <div className="flex flex-wrap gap-4">
              <div>
                <p className="font-semibold text-slate-700">Engineer</p>
                <p className="text-slate-600 font-semibold text-blue-700">
                  {job.engineer?.full_name ?? 'Unassigned'}
                </p>
              </div>
              <div>
                <p className="font-semibold text-slate-700">Scheduled</p>
                <p className="text-slate-600">
                  {job.scheduled_date} {job.scheduled_time}
                </p>
              </div>
              {job.device_id && (
                <div>
                  <p className="font-semibold text-slate-700">Problem Devices & Contract</p>
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {(() => {
                      const allClientDevs = parseClientDevices(job.client);
                      return job.device_id
                        .split(/[,\n;]/)
                        .map((d) => d.trim())
                        .filter(Boolean)
                        .map((dev) => {
                          const matched = allClientDevs.find(
                            (cd) => cd.device_id.toUpperCase() === dev.toUpperCase()
                          );
                          const info = matched ? getDeviceContractInfo(matched) : null;
                          const badgeText = info?.isExpired
                            ? 'Expired (NC)'
                            : matched?.contract_type === 'amc'
                            ? 'AMC'
                            : matched?.contract_type === 'warranty'
                            ? 'Warranty'
                            : 'NC';

                          return (
                            <span
                              key={dev}
                              className={`font-mono font-bold px-2 py-0.5 rounded-md border inline-flex items-center gap-1.5 text-xs ${
                                info?.isExpired
                                  ? 'bg-red-50 text-red-700 border-red-200'
                                  : info?.isExpiringSoon
                                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                                  : matched?.contract_type === 'amc'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : matched?.contract_type === 'warranty'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              <Cpu className="h-3 w-3" />
                              <span>{dev}</span>
                              <span className="font-sans text-[10px] font-extrabold uppercase px-1 py-0.2 rounded bg-white/60 border border-current/20">
                                {badgeText}
                              </span>
                              {info?.dateRangeLabel && info.dateRangeLabel !== 'No dates' && (
                                <span className="font-sans text-[10px] opacity-75">
                                  ({info.dateRangeLabel})
                                </span>
                              )}
                            </span>
                          );
                        });
                    })()}
                  </div>
                </div>
              )}
              <div>
                <p className="font-semibold text-slate-700">Assigned By</p>
                <p className="text-slate-800 font-bold bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 inline-block text-xs">
                  👤 {job.assigned_by_name || job.reassigned_from_name || 'Admin'}
                </p>
              </div>
              {job.call_given_by && (
                <div>
                  <p className="font-semibold text-slate-700">Given By / Caller</p>
                  <p className="text-slate-800 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 inline-block text-xs">
                    📞 {job.call_given_by}
                  </p>
                </div>
              )}
              {job.call_source && (
                <div>
                  <p className="font-semibold text-slate-700">Call Source</p>
                  <p className={`font-bold px-2.5 py-1 rounded-lg border inline-block text-xs uppercase ${job.call_source === 'online' ? 'bg-indigo-100 text-indigo-800 border-indigo-200' : 'bg-blue-100 text-blue-800 border-blue-200'}`}>
                    {job.call_source === 'online' ? '🌐 Online Call' : `📍 Direct Call${job.direct_call_type ? ` (${job.direct_call_type})` : ''}`}
                  </p>
                </div>
              )}
            </div>
            {job.admin_notes && (
              <div>
                <p className="font-semibold text-slate-700">Admin Notes</p>
                <p className="text-slate-600">{job.admin_notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Timeline */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold uppercase text-slate-500">Timeline</h2>
          <div className="space-y-4">
            {timeline.length === 0 ? (
              <p className="text-sm text-slate-400">No activity yet</p>
            ) : (
              timeline.map((event, i) => {
                const Icon = event.icon;
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50">
                      <Icon className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{event.label}</p>
                      <p className="flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="h-3 w-3" /> {formatTime(event.time)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Service & KM info */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold uppercase text-slate-500">Service, Time & KM Analytics</h2>
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-blue-50/60 border border-blue-100 p-3">
                <p className="flex items-center gap-1 text-xs font-semibold text-blue-800 uppercase">
                  <Car className="h-3.5 w-3.5 text-blue-600" /> Travel Duration
                </p>
                <p className="text-xl font-extrabold text-blue-900 mt-1">
                  {job.travel_started_at
                    ? formatDuration(
                        job.travel_started_at,
                        job.reached_at || (job.status === 'traveling' ? new Date().toISOString() : null)
                      )
                    : '—'}
                </p>
              </div>

              <div className="rounded-xl bg-cyan-50/60 border border-cyan-100 p-3">
                <p className="flex items-center gap-1 text-xs font-semibold text-cyan-800 uppercase">
                  <Clock className="h-3.5 w-3.5 text-cyan-600" /> In-Client Service Time
                </p>
                <p className="text-xl font-extrabold text-cyan-900 mt-1">
                  {job.reached_at
                    ? formatDuration(
                        job.reached_at,
                        job.completed_at ||
                          (job.status !== 'assigned' && job.status !== 'traveling'
                            ? new Date().toISOString()
                            : null)
                      )
                    : '—'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="font-semibold text-slate-700">Total KM</p>
                <p className="text-slate-600">{formatKm(job.total_km)}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-700">GPS Distance</p>
                <p className="text-slate-600">{job.gps_distance_km ? formatKm(job.gps_distance_km) : '—'}</p>
              </div>
            </div>

            {job.diagnosis && (
              <div>
                <p className="font-semibold text-slate-700">Diagnosis</p>
                <p className="text-slate-600">{job.diagnosis}</p>
              </div>
            )}
            {job.work_performed && (
              <div>
                <p className="font-semibold text-slate-700">Work Performed</p>
                <p className="text-slate-600">{job.work_performed}</p>
              </div>
            )}
            {job.parts_replaced && (
              <div>
                <p className="font-semibold text-slate-700">Parts Replaced</p>
                <p className="text-slate-600">{job.parts_replaced}</p>
              </div>
            )}
            {job.engineer_notes && (
              <div>
                <p className="font-semibold text-slate-700">Engineer Notes</p>
                <p className="text-slate-600">{job.engineer_notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Live Trip & GPS Route Map */}
        {(logs.length > 0 ||
          (job.client?.latitude && job.client?.longitude) ||
          (job.start_latitude && job.start_longitude)) && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-700">
                <Navigation className="h-4 w-4 text-blue-600 animate-pulse" /> Live Trip Route & Map
              </h2>
              <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
                {job.status === 'traveling'
                  ? '📍 In Transit'
                  : job.status === 'completed'
                  ? '🏁 Completed Route'
                  : job.status}
              </span>
            </div>
            <LiveTrackingMap
              currentLocation={
                logs.length > 0
                  ? { latitude: logs[logs.length - 1].latitude, longitude: logs[logs.length - 1].longitude }
                  : job.status === 'completed' || job.status === 'reached' || job.status === 'in_progress' || job.status === 'solved'
                  ? job.reached_latitude && job.reached_longitude
                    ? { latitude: job.reached_latitude, longitude: job.reached_longitude }
                    : job.end_latitude && job.end_longitude
                    ? { latitude: job.end_latitude, longitude: job.end_longitude }
                    : null
                  : job.start_latitude && job.start_longitude
                  ? { latitude: job.start_latitude, longitude: job.start_longitude }
                  : null
              }
              startLocation={
                job.start_latitude && job.start_longitude
                  ? { latitude: job.start_latitude, longitude: job.start_longitude }
                  : null
              }
              reachedLocation={
                job.reached_latitude && job.reached_longitude
                  ? { latitude: job.reached_latitude, longitude: job.reached_longitude }
                  : job.end_latitude && job.end_longitude
                  ? { latitude: job.end_latitude, longitude: job.end_longitude }
                  : null
              }
              clientLocation={
                job.client?.latitude && job.client?.longitude
                  ? { latitude: job.client.latitude, longitude: job.client.longitude }
                  : null
              }
              clientName={job.client?.client_name}
              clientAddress={job.client?.address}
              engineerName={job.engineer?.full_name || 'Engineer'}
              routeLogs={logs}
              status={job.status}
              totalKm={job.total_km || job.gps_distance_km}
              height="360px"
            />
          </div>
        )}

        {/* Photos */}
        {photos.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase text-slate-500">
              <ImageIcon className="h-4 w-4" /> Photos
            </h2>
            <div className="flex flex-wrap gap-4">
              {photos.map((photo) => (
                <div key={photo.id} className="text-center">
                  <img
                    src={photo.photo_url}
                    alt={photo.photo_type}
                    className="h-32 w-32 rounded-lg border border-slate-200 object-cover"
                  />
                  <p className="mt-1 text-xs font-medium capitalize text-slate-500">{photo.photo_type}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ----------------- ADMIN REASSIGN MODAL ----------------- */}
      {showReassignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
              <div className="flex items-center gap-2.5">
                <UserCheck className="h-5 w-5 text-blue-400" />
                <h3 className="font-bold text-base">Admin: Change Engineer</h3>
              </div>
              <button
                onClick={() => setShowReassignModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-slate-800">
              <p className="text-xs text-slate-600">
                Select an active engineer to assign or re-route Job #{job.job_number}.
              </p>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Select Engineer *
                </label>
                <select
                  value={adminTargetEngId}
                  onChange={(e) => setAdminTargetEngId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">-- Choose Engineer --</option>
                  {engineersList.map((eng) => (
                    <option key={eng.id} value={eng.id}>
                      {eng.full_name} ({eng.phone || eng.email})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Admin Note / Reason {job?.status === 'vendor' ? <span className="text-red-600 font-bold">* (Required for Vendor Jobs)</span> : '(Optional)'}
                </label>
                <textarea
                  value={adminReassignReason}
                  onChange={(e) => setAdminReassignReason(e.target.value)}
                  rows={2}
                  placeholder={
                    job?.status === 'vendor'
                      ? 'e.g. Received back from vendor, reassigned to engineer for installation & testing...'
                      : 'e.g. Workload balancing, engineer on leave...'
                  }
                  className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 border-t bg-slate-50 px-6 py-4">
              <button
                onClick={() => setShowReassignModal(false)}
                className="flex-1 rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleAdminReassign}
                disabled={actionLoading}
                className="flex-[1.5] flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-60"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                <span>Save Assignment</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- ADMIN VENDOR MODAL ----------------- */}
      {showVendorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
              <div className="flex items-center gap-2.5">
                <Building className="h-5 w-5 text-purple-400" />
                <h3 className="font-bold text-base">Admin: Manage Vendor</h3>
              </div>
              <button
                onClick={() => setShowVendorModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-slate-800">
              <p className="text-xs text-slate-600">
                Update or assign external vendor details for Job #{job.job_number}.
              </p>

              {vendorsList.length > 0 && (
                <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-3">
                  <label className="mb-1.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-purple-900">
                    <span className="flex items-center gap-1.5">
                      <Store className="h-3.5 w-3.5 text-purple-600" />
                      Select Registered Vendor Partner
                    </span>
                    <span className="text-[10px] text-purple-700 font-bold bg-purple-100 px-1.5 py-0.5 rounded">
                      {vendorsList.length} registered
                    </span>
                  </label>
                  <select
                    onChange={(e) => {
                      const selected = vendorsList.find((v) => v.id === e.target.value);
                      if (selected) {
                        setAdminVendorName(selected.vendor_name);
                        setAdminVendorPhone(selected.phone || '');
                        const specialtyNote = selected.service_type ? `[${selected.service_type}] ` : '';
                        const termNote = selected.notes ? `Terms: ${selected.notes}` : '';
                        setAdminVendorNotes(`${specialtyNote}${termNote}`.trim());
                      }
                    }}
                    className="w-full rounded-xl border border-purple-300 bg-white p-2.5 text-xs font-bold text-slate-900 outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100 shadow-sm"
                  >
                    <option value="">-- Choose From Vendor Directory --</option>
                    {vendorsList.map((v) => (
                      <option key={v.id} value={v.id}>
                        🏪 {v.vendor_name} ({v.service_type || v.city || 'Vendor'}) • {v.phone}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Vendor Name *
                </label>
                <input
                  type="text"
                  value={adminVendorName}
                  onChange={(e) => setAdminVendorName(e.target.value)}
                  placeholder="e.g. Dell Authorized Service Center"
                  className="w-full rounded-xl border border-slate-300 p-3 text-sm font-semibold outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Vendor Phone
                </label>
                <input
                  type="text"
                  value={adminVendorPhone}
                  onChange={(e) => setAdminVendorPhone(e.target.value)}
                  placeholder="e.g. +91 9876543210"
                  className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Vendor Notes
                </label>
                <textarea
                  value={adminVendorNotes}
                  onChange={(e) => setAdminVendorNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. RMA ticket #4412, chip repair pending..."
                  className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 border-t bg-slate-50 px-6 py-4">
              <button
                onClick={() => setShowVendorModal(false)}
                className="flex-1 rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleAdminVendor}
                disabled={actionLoading}
                className="flex-[1.5] flex items-center justify-center gap-2 rounded-xl bg-purple-600 py-2.5 text-sm font-bold text-white shadow-md hover:bg-purple-700 disabled:opacity-60"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building className="h-4 w-4" />}
                <span>Save Vendor Details</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- ADMIN CALL BACK MODAL ----------------- */}
      {showCallbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
              <div className="flex items-center gap-2.5">
                <PhoneCall className="h-5 w-5 text-amber-400" />
                <h3 className="font-bold text-base">Admin: Reschedule Call Back</h3>
              </div>
              <button
                onClick={() => setShowCallbackModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-slate-800">
              <p className="text-xs text-slate-600">
                Reschedule next call back slot for Job #{job.job_number}.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Call Back Date *
                  </label>
                  <input
                    type="date"
                    value={adminCallbackDate}
                    onChange={(e) => setAdminCallbackDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-sm font-semibold outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Call Back Time *
                  </label>
                  <input
                    type="text"
                    value={adminCallbackTime}
                    onChange={(e) => setAdminCallbackTime(e.target.value)}
                    placeholder="e.g. 11:00 AM"
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-sm font-semibold outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Call Back Reason / Notes
                </label>
                <textarea
                  value={adminCallbackReason}
                  onChange={(e) => setAdminCallbackReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. Customer requested appointment change..."
                  className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 border-t bg-slate-50 px-6 py-4">
              <button
                onClick={() => setShowCallbackModal(false)}
                className="flex-1 rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleAdminCallback}
                disabled={actionLoading}
                className="flex-[1.5] flex items-center justify-center gap-2 rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white shadow-md hover:bg-amber-700 disabled:opacity-60"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
                <span>Set Call Back</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ICS Physical Call Report Slip Modal */}
      {showReportPreview && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
          <div className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-6 py-4 text-white">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-400" />
                <h3 className="font-bold text-base">INFANT COMPUTER STORE (ICS) - Call Report</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadPdf}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                >
                  <Download className="h-4 w-4" /> Download PDF
                </button>
                <button
                  onClick={handlePrintReport}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition"
                >
                  <Printer className="h-4 w-4" /> Print
                </button>
                <button
                  onClick={() => setShowReportPreview(false)}
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white transition"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-6 text-slate-800 space-y-4 text-xs">
              <div className="text-center border-b pb-4">
                <h2 className="text-xl font-extrabold tracking-wider text-blue-900">INFANT COMPUTER STORE</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  240/A28, Sharadha Mill Road, Podanur, Coimbatore - 641023
                </p>
                <p className="text-[11px] font-semibold text-slate-600">Sales: 96266 44490 / Service: 96266 44496</p>
                <div className="mt-2 inline-block rounded-md bg-blue-100 px-3 py-1 font-bold text-blue-800 tracking-wide text-xs uppercase">
                  CALL REPORT SLIP NO: {job.job_number}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-b pb-3">
                <div>
                  <p className="text-slate-500 font-semibold">Customer / Company:</p>
                  <p className="text-sm font-bold text-slate-900">{job.client?.client_name}</p>
                  <p className="text-slate-600">{job.client?.company_name}</p>
                  <p className="text-slate-600">
                    {job.client?.address}, {job.client?.city}
                  </p>
                  <p className="text-slate-700 font-medium mt-1">📞 {job.client?.phone || '—'}</p>
                  <p className="text-slate-700 font-medium">✉️ {job.client?.email || '—'}</p>
                </div>
                <div>
                  <p className="text-slate-500 font-semibold">Service Engineer:</p>
                  <p className="text-sm font-bold text-slate-900">{job.engineer?.full_name || 'Unassigned'}</p>
                  <p className="text-slate-600">Date: {job.scheduled_date}</p>
                  <p className="text-slate-600">
                    Status: <span className="font-semibold uppercase text-emerald-700">{job.status}</span>
                  </p>
                  <div className="mt-2 rounded-lg bg-slate-50 p-2 border text-[11px]">
                    <p>
                      🚗 <strong>Travel KM:</strong> {formatKm(job.total_km)}
                    </p>
                    <p>
                      ⏱️ <strong>Travel Time:</strong>{' '}
                      {job.travel_started_at ? formatDuration(job.travel_started_at, job.reached_at) : '—'}
                    </p>
                    <p>
                      🏢 <strong>In-Client Time:</strong>{' '}
                      {job.reached_at ? formatDuration(job.reached_at, job.completed_at) : '—'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="rounded-lg bg-slate-50 p-3 border">
                  <p className="font-bold text-slate-700 text-xs uppercase">Problem Reported:</p>
                  <p className="text-slate-800 mt-0.5">{job.issue_title}</p>
                  {job.issue_description && <p className="text-slate-500 mt-0.5">{job.issue_description}</p>}
                </div>

                {job.diagnosis && (
                  <div className="rounded-lg bg-slate-50 p-3 border">
                    <p className="font-bold text-slate-700 text-xs uppercase">Diagnosis:</p>
                    <p className="text-slate-800 mt-0.5">{job.diagnosis}</p>
                  </div>
                )}

                <div className="rounded-lg bg-slate-50 p-3 border">
                  <p className="font-bold text-slate-700 text-xs uppercase">Action Taken / Work Performed:</p>
                  <p className="text-slate-800 mt-0.5">
                    {job.work_performed || 'Service completed and tested on-site.'}
                  </p>
                </div>

                {job.parts_replaced && (
                  <div className="rounded-lg bg-slate-50 p-3 border">
                    <p className="font-bold text-slate-700 text-xs uppercase">Parts Replaced:</p>
                    <p className="text-slate-800 mt-0.5">{job.parts_replaced}</p>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t flex justify-between items-end text-[11px] text-slate-500">
                <div>
                  <p className="border-t border-dashed border-slate-400 pt-1 w-44 text-center font-medium">
                    Customer Signature
                  </p>
                </div>
                <div className="text-right">
                  <p className="border-t border-dashed border-slate-400 pt-1 w-44 text-center font-medium">
                    For Infant Computer Store
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
