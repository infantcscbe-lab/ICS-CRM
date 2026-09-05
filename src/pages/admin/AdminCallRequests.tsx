import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { AdminNotification } from '@/types/database';
import {
  getAdminNotifications,
  markNotificationAsRead,
  deleteNotification,
} from '@/lib/notifications';
import { CreateJobModal, type InitialJobData } from '@/components/jobs/CreateJobModal';
import {
  Inbox,
  Send,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Trash2,
  ExternalLink,
  Plus,
  Building,
  Phone,
  MapPin,
  Globe,
  User,
  Calendar,
  AlertCircle,
  CheckCheck,
  Cpu,
} from 'lucide-react';

interface AdminCallRequestsProps {
  onViewJob?: (jobId: string) => void;
}

export function AdminCallRequests({ onViewJob }: AdminCallRequestsProps) {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'resolved'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'direct' | 'online'>('all');

  // Job creation modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createInitialData, setCreateInitialData] = useState<InitialJobData | null>(null);

  useEffect(() => {
    loadRequests();

    const handleUpdate = () => loadRequests();
    window.addEventListener('ics-notifications-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    const channel = supabase
      .channel('admin-call-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_notifications' }, () => {
        loadRequests();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('ics-notifications-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  async function loadRequests() {
    try {
      const { data, error } = await supabase
        .from('admin_notifications')
        .select('*')
        .eq('type', 'call_request')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setNotifications(data as unknown as AdminNotification[]);
      } else {
        const notifs = getAdminNotifications().filter((n) => n.type === 'call_request');
        setNotifications(notifs);
      }
    } catch {
      const notifs = getAdminNotifications().filter((n) => n.type === 'call_request');
      setNotifications(notifs);
    } finally {
      setLoading(false);
    }
  }

  // Filtered requests list
  const filteredRequests = useMemo(() => {
    return notifications.filter((req) => {
      // Status filter
      if (statusFilter === 'pending' && req.read) return false;
      if (statusFilter === 'resolved' && !req.read) return false;

      // Source filter
      if (sourceFilter !== 'all' && req.data?.call_source !== sourceFilter) return false;

      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const clientMatch = req.data?.client_name?.toLowerCase().includes(q);
        const issueMatch = req.data?.issue_title?.toLowerCase().includes(q);
        const engineerMatch = req.actor_name?.toLowerCase().includes(q);
        const phoneMatch = req.data?.client_phone?.toLowerCase().includes(q);
        const callerMatch = req.data?.call_given_by?.toLowerCase().includes(q);
        if (!clientMatch && !issueMatch && !engineerMatch && !phoneMatch && !callerMatch) {
          return false;
        }
      }

      return true;
    });
  }, [notifications, statusFilter, sourceFilter, search]);

  const pendingCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  const resolvedCount = useMemo(() => {
    return notifications.filter((n) => n.read).length;
  }, [notifications]);

  function handleOpenCreateJob(req: AdminNotification) {
    if (!req.data) return;
    const data = req.data;
    setCreateInitialData({
      clientId: data.client_id,
      clientName: data.client_name,
      clientCompany: data.client_company,
      clientPhone: data.client_phone,
      clientEmail: data.client_email,
      clientAddress: data.client_address,
      clientCity: data.client_city,
      deviceId: data.device_id || undefined,
      issueTitle: data.issue_title || req.title,
      issueDescription: data.issue_description || req.message,
      priority: data.priority,
      callSource: data.call_source || 'online',
      directCallType: data.direct_call_type || 'outboard',
      scheduledDate: data.scheduled_date,
      scheduledTime: data.scheduled_time,
      callGivenBy: data.call_given_by,
      assignedByName: data.assigned_by_name,
      adminNotes: data.admin_notes,
      engineerId: data.requesting_engineer_id,
      notificationId: req.id,
    });
    setShowCreateModal(true);
  }

  async function handleMarkResolved(reqId: string) {
    await markNotificationAsRead(reqId);
    loadRequests();
  }

  async function handleDelete(reqId: string) {
    await deleteNotification(reqId);
    loadRequests();
  }

  function formatTimeAgo(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900">Service Call Requests</h1>
            {pendingCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-black text-red-700 border border-red-200 animate-pulse">
                <AlertCircle className="h-3.5 w-3.5" /> {pendingCount} Pending Review
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Review incoming call creation requests from customer portal and field engineers, assign engineers, and dispatch scheduled jobs
          </p>
        </div>
      </div>

      {/* Stats KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Requests</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{notifications.length}</p>
            <p className="text-[11px] text-slate-500">Customer portal & field engineers</p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 border border-blue-100">
            <Inbox className="h-6 w-6" />
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Pending Review</p>
            <p className="mt-1 text-2xl font-black text-amber-900">{pendingCount}</p>
            <p className="text-[11px] text-amber-700">Awaiting admin scheduling</p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 border border-amber-200">
            <Clock className="h-6 w-6" />
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Approved & Processed</p>
            <p className="mt-1 text-2xl font-black text-emerald-900">{resolvedCount}</p>
            <p className="text-[11px] text-emerald-700">Converted to service calls</p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-100 p-1 border border-slate-200">
          <button
            onClick={() => setStatusFilter('all')}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              statusFilter === 'all'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Requests ({notifications.length})
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              statusFilter === 'pending'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Pending ({pendingCount})</span>
          </button>
          <button
            onClick={() => setStatusFilter('resolved')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              statusFilter === 'resolved'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Approved / Handled ({resolvedCount})</span>
          </button>
        </div>

        {/* Call Source Filter & Search */}
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2 min-w-[280px]">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as any)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
          >
            <option value="all">All Call Types</option>
            <option value="direct">📍 Direct Calls</option>
            <option value="online">🌐 Online Calls</option>
          </select>

          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by client, engineer, issue, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs font-medium outline-none focus:border-blue-500 shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* Call Requests List */}
      <div className="space-y-3">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <p className="text-slate-500 font-medium">Loading call requests...</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <Inbox className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="text-base font-bold text-slate-800">No call requests found</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              When field engineers request service call creation from their mobile app, requests will appear here for your review and scheduling.
            </p>
          </div>
        ) : (
          filteredRequests.map((req) => {
            const data = req.data || {};
            const isPending = !req.read;

            return (
              <div
                key={req.id}
                className={`group rounded-2xl border p-5 transition shadow-sm ${
                  isPending
                    ? 'border-amber-300 bg-gradient-to-r from-amber-50/40 via-white to-white'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  {/* Left info */}
                  <div className="flex-1 min-w-[280px]">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      {isPending ? (
                        <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-800 border border-amber-200">
                          <Clock className="h-3 w-3" /> Pending Review
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" /> Converted / Handled
                        </span>
                      )}

                      {data.call_source && (
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-extrabold uppercase border ${
                            data.call_source === 'online'
                              ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                              : data.direct_call_type === 'inboard'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              : 'bg-blue-100 text-blue-700 border-blue-200'
                          }`}
                        >
                          {data.call_source === 'online'
                            ? '🌐 Online Call'
                            : data.direct_call_type === 'inboard'
                            ? '🏢 Inboard (In-House)'
                            : '🚗 Outboard (On-Site)'}
                        </span>
                      )}

                      {data.priority && (
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-extrabold uppercase border ${
                            data.priority === 'urgent'
                              ? 'bg-red-100 text-red-700 border-red-200'
                              : data.priority === 'high'
                              ? 'bg-amber-100 text-amber-800 border-amber-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          Priority: {data.priority}
                        </span>
                      )}

                      {data.device_id && (
                        <div className="flex flex-wrap items-center gap-1">
                          {data.device_id
                            .split(/[,\n;]/)
                            .map((d) => d.trim())
                            .filter(Boolean)
                            .map((dev) => (
                              <span
                                key={dev}
                                className="flex items-center gap-1 rounded-md bg-purple-100 px-2.5 py-0.5 text-[10px] font-bold text-purple-800 border border-purple-200 font-mono"
                              >
                                <Cpu className="h-3 w-3 text-purple-600" /> {dev}
                              </span>
                            ))}
                        </div>
                      )}

                      <span className="text-xs text-slate-400 font-medium ml-auto">
                        📅 {formatTimeAgo(req.created_at)}
                      </span>
                    </div>

                    {/* Issue Title & Description */}
                    <h3 className="text-base font-bold text-slate-900 mt-1">
                      {data.issue_title || req.title}
                    </h3>
                    {data.issue_description && (
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed max-w-2xl">
                        {data.issue_description}
                      </p>
                    )}

                    {/* Metadata Grid */}
                    <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 rounded-xl bg-slate-50 p-3 border border-slate-100 text-xs text-slate-700">
                      <div className="flex items-center gap-2">
                        <Building className="h-4 w-4 text-blue-600 shrink-0" />
                        <div>
                          <p className="text-[10px] font-bold uppercase text-slate-400">Client / Customer</p>
                          <p className="font-bold text-slate-900 truncate">{data.client_name || 'Client'}</p>
                          {data.client_company && (
                            <p className="text-[11px] text-slate-500 truncate">{data.client_company}</p>
                          )}
                        </div>
                      </div>

                      {/* Requested By (Client vs Engineer) */}
                      {(() => {
                        const isClientRequest =
                          data.call_source === 'online' ||
                          req.actor_name === 'client portal' ||
                          data.requesting_engineer_name === 'client portal' ||
                          !data.requesting_engineer_id;

                        return (
                          <div className="flex items-center gap-2">
                            {isClientRequest ? (
                              <Globe className="h-4 w-4 text-emerald-600 shrink-0" />
                            ) : (
                              <User className="h-4 w-4 text-indigo-600 shrink-0" />
                            )}
                            <div>
                              <p className="text-[10px] font-bold uppercase text-slate-400">
                                {isClientRequest ? 'Requested By Client' : 'Requested By Engineer'}
                              </p>
                              <p className="font-bold text-slate-900">
                                {isClientRequest
                                  ? data.client_name || req.actor_name || 'Client Portal'
                                  : req.actor_name || 'Service Engineer'}
                              </p>
                              {data.call_given_by && (
                                <p className="text-[11px] text-slate-500">Caller: {data.call_given_by}</p>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-emerald-600 shrink-0" />
                        <div>
                          <p className="text-[10px] font-bold uppercase text-slate-400">Scheduled Date & Time</p>
                          <p className="font-bold text-slate-900">
                            {data.scheduled_date || '—'} {data.scheduled_time ? `• ${data.scheduled_time}` : ''}
                          </p>
                          {data.client_phone && (
                            <p className="text-[11px] text-slate-500">📞 {data.client_phone}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Client Location & Notes */}
                    {(data.client_address || data.client_city || data.admin_notes) && (
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        {(data.client_address || data.client_city) && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 text-slate-400" />
                            <span>
                              {[data.client_address, data.client_city].filter(Boolean).join(', ')}
                            </span>
                          </span>
                        )}
                        {data.admin_notes && (
                          <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-800 border border-blue-200">
                            💬 Notes: {data.admin_notes}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right Actions */}
                  {(() => {
                    const isClientRequest =
                      data.call_source === 'online' ||
                      req.actor_name === 'client portal' ||
                      data.requesting_engineer_name === 'client portal' ||
                      !data.requesting_engineer_id;

                    return (
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {isPending ? (
                          <button
                            onClick={() => handleOpenCreateJob(req)}
                            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-700 transition active:scale-95"
                          >
                            <Plus className="h-4 w-4" />
                            <span>Review & Create Job</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-sm">
                            <CheckCheck className="h-4 w-4 text-emerald-600" />
                            <span>Approved & Converted</span>
                          </div>
                        )}

                        <div className="flex items-center gap-1.5">
                          {isPending && !isClientRequest && (
                            <button
                              onClick={() => handleMarkResolved(req.id)}
                              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                              title="Mark as handled"
                            >
                              <CheckCheck className="h-3.5 w-3.5 text-emerald-600" />
                              <span>Mark Done</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(req.id)}
                            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                            title="Delete Request"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal to Create Job with Pre-populated Data */}
      {showCreateModal && (
        <CreateJobModal
          open={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setCreateInitialData(null);
          }}
          onCreated={() => {
            setShowCreateModal(false);
            setCreateInitialData(null);
            loadRequests();
            window.dispatchEvent(new Event('ics-jobs-updated'));
          }}
          initialData={createInitialData}
        />
      )}
    </div>
  );
}
