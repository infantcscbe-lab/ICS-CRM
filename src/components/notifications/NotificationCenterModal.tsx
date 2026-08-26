import { useState, useEffect } from 'react';
import type { AdminNotification } from '@/types/database';
import {
  getAdminNotifications,
  getPartitionedNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearAllNotifications,
} from '@/lib/notifications';
import {
  Bell,
  X,
  UserCheck,
  Building,
  PhoneCall,
  Activity,
  CheckCheck,
  Trash2,
  Clock,
  ExternalLink,
  Archive,
} from 'lucide-react';

interface NotificationCenterModalProps {
  open: boolean;
  onClose: () => void;
  onSelectJob: (jobId: string) => void;
}

export function NotificationCenterModal({ open, onClose, onSelectJob }: NotificationCenterModalProps) {
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);

  useEffect(() => {
    function loadNotifs() {
      setNotifications(getAdminNotifications());
    }
    loadNotifs();

    window.addEventListener('ics-notifications-updated', loadNotifs);
    window.addEventListener('storage', loadNotifs);
    return () => {
      window.removeEventListener('ics-notifications-updated', loadNotifs);
      window.removeEventListener('storage', loadNotifs);
    };
  }, []);

  if (!open) return null;

  const { active, history, unreadCount } = getPartitionedNotifications(notifications);
  const currentList = tab === 'active' ? active : history;

  function getIcon(type: AdminNotification['type']) {
    switch (type) {
      case 'reassigned':
        return <UserCheck className="h-4 w-4 text-blue-500" />;
      case 'vendor':
        return <Building className="h-4 w-4 text-purple-500" />;
      case 'call_back':
        return <PhoneCall className="h-4 w-4 text-amber-500" />;
      default:
        return <Activity className="h-4 w-4 text-slate-500" />;
    }
  }

  function formatTimeAgo(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    const days = Math.floor(diffSec / 86400);
    return `${days}d ago (${d.toLocaleDateString()})`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/50 p-3 sm:p-6 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex h-[92vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between bg-slate-900 px-5 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/30 text-blue-400">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-base font-bold">Admin Notifications</h2>
              <p className="text-xs text-slate-400">Job status & reassignment alerts</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation & Actions */}
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex rounded-lg bg-slate-200 p-0.5">
              <button
                onClick={() => setTab('active')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  tab === 'active'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                <span>Active (2 Days)</span>
                {active.length > 0 && (
                  <span className="rounded-full bg-blue-100 px-1.5 py-0.2 text-[10px] font-bold text-blue-700">
                    {active.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setTab('history')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  tab === 'history'
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Archive className="h-3.5 w-3.5" />
                <span>History</span>
                {history.length > 0 && (
                  <span className="rounded-full bg-slate-300 px-1.5 py-0.2 text-[10px] font-bold text-slate-700">
                    {history.length}
                  </span>
                )}
              </button>
            </div>

            {tab === 'active' && active.length > 0 && (
              <button
                onClick={markAllNotificationsAsRead}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                title="Mark all as read"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Mark read</span>
              </button>
            )}

            {tab === 'history' && history.length > 0 && (
              <button
                onClick={clearAllNotifications}
                className="flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-800"
                title="Clear all history"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            {tab === 'active'
              ? '⚡ Alerts from the last 48 hours. Older items auto-move to history.'
              : '📁 Archived notifications older than 2 days.'}
          </p>
        </div>

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {currentList.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <div className="rounded-full bg-slate-100 p-3 text-slate-400 mb-2">
                {tab === 'active' ? <Bell className="h-6 w-6" /> : <Archive className="h-6 w-6" />}
              </div>
              <p className="text-sm font-semibold text-slate-700">
                {tab === 'active' ? 'No active notifications' : 'No history archives'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5 max-w-xs">
                {tab === 'active'
                  ? 'New reassignments, vendor transfers, and callbacks will appear here.'
                  : 'Notifications older than 2 days are stored here.'}
              </p>
            </div>
          ) : (
            currentList.map((notif) => (
              <div
                key={notif.id}
                onClick={() => markNotificationAsRead(notif.id)}
                className={`group relative rounded-xl border p-3.5 transition ${
                  !notif.read && tab === 'active'
                    ? 'border-blue-200 bg-blue-50/50 shadow-sm hover:bg-blue-50'
                    : 'border-slate-200 bg-white hover:bg-slate-50 shadow-sm'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-lg bg-slate-100 p-2 shrink-0 border border-slate-200">
                    {getIcon(notif.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {notif.title}
                      </p>
                      <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                        {formatTimeAgo(notif.created_at)}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-slate-700 leading-relaxed font-normal">
                      {notif.message}
                    </p>

                    {/* Metadata chips */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-700 border border-slate-200">
                        #{notif.job_number}
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">
                        By: <span className="font-semibold text-slate-800">{notif.actor_name}</span>
                      </span>

                      {notif.data?.vendor_name && (
                        <span className="rounded-md bg-purple-100 px-2 py-0.5 font-semibold text-purple-700">
                          Vendor: {notif.data.vendor_name}
                        </span>
                      )}
                      {notif.data?.call_back_date && (
                        <span className="rounded-md bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
                          📅 {notif.data.call_back_date} {notif.data.call_back_time || ''}
                        </span>
                      )}
                      {notif.data?.target_engineer_name && (
                        <span className="rounded-md bg-blue-100 px-2 py-0.5 font-semibold text-blue-700">
                          ➡️ Assigned to: {notif.data.target_engineer_name}
                        </span>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markNotificationAsRead(notif.id);
                          onSelectJob(notif.job_id);
                          onClose();
                        }}
                        className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> View / Change Job
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(notif.id);
                        }}
                        className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-red-600 transition"
                        title="Delete notification"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
