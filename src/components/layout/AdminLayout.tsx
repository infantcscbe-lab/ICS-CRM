import { useState, useEffect, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import {
  LayoutDashboard,
  Briefcase,
  Users,
  Building2,
  MapPin,
  BarChart3,
  LogOut,
  Menu,
  X,
  Bell,
  CalendarCheck,
  Wrench,
  UserCheck,
} from 'lucide-react';
import icsLogo from '@/assets/ics-logo.png';
import { NotificationCenterModal } from '@/components/notifications/NotificationCenterModal';
import { getAdminNotifications, getPartitionedNotifications } from '@/lib/notifications';

interface AdminLayoutProps {
  active: string;
  onNavigate: (page: string) => void;
  onSelectJob?: (jobId: string) => void;
  children: ReactNode;
}

// ─── Sectioned Nav Item Groups ───
const serviceNavItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'jobs', label: 'Service Jobs', icon: Briefcase },
  { id: 'clients', label: 'Clients', icon: Building2 },
  { id: 'tracking', label: 'Live Tracking', icon: MapPin },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
];

const hrNavItems = [
  { id: 'attendance', label: 'Attendance Hub', icon: CalendarCheck, hasBadge: true },
  { id: 'engineers', label: 'Engineers', icon: Users },
];

export function AdminLayout({ active, onNavigate, onSelectJob, children }: AdminLayoutProps) {
  const { profile, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingLeavesCount, setPendingLeavesCount] = useState(0);

  useEffect(() => {
    function updateCounts() {
      const notifs = getAdminNotifications();
      const { unreadCount: count } = getPartitionedNotifications(notifs);
      setUnreadCount(count);
    }
    updateCounts();

    async function loadPendingLeaves() {
      try {
        const { count } = await supabase
          .from('leave_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');
        setPendingLeavesCount(count || 0);
      } catch {
        // ignore
      }
    }
    loadPendingLeaves();

    window.addEventListener('ics-notifications-updated', updateCounts);
    window.addEventListener('ics-leaves-updated', loadPendingLeaves);
    window.addEventListener('storage', updateCounts);

    const ch = supabase
      .channel('admin-layout-leaves')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => {
        loadPendingLeaves();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
      window.removeEventListener('ics-notifications-updated', updateCounts);
      window.removeEventListener('ics-leaves-updated', loadPendingLeaves);
      window.removeEventListener('storage', updateCounts);
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-shrink-0 bg-slate-900 md:flex md:flex-col shadow-xl">
        {/* Brand Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white p-1 shadow-sm">
              <img src={icsLogo} alt="ICS Logo" className="h-full w-full object-contain" />
            </div>
            <div>
              <span className="block text-base font-black text-white tracking-tight leading-tight">ICS</span>
              <span className="block text-[11px] font-semibold text-blue-400 uppercase tracking-wider">Service Manager</span>
            </div>
          </div>

          {/* Desktop Notification Bell Button */}
          <button
            onClick={() => setShowNotifications(true)}
            className="relative rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
            title="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white shadow-md animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* 1. NOTIFICATIONS STRIP BUTTON */}
        <div className="px-3 pt-3">
          <button
            onClick={() => setShowNotifications(true)}
            className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-bold transition border ${
              unreadCount > 0
                ? 'bg-gradient-to-r from-blue-600/30 to-indigo-600/30 text-white border-blue-500/50 shadow-sm'
                : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <Bell className={`h-4 w-4 ${unreadCount > 0 ? 'text-blue-400 animate-bounce' : 'text-slate-400'}`} />
              <span>Notifications</span>
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                unreadCount > 0
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-700 text-slate-400'
              }`}
            >
              {unreadCount > 0 ? `${unreadCount} new` : 'All caught up'}
            </span>
          </button>
        </div>

        {/* Navigation Groups */}
        <nav className="mt-3 flex-1 overflow-y-auto px-3 space-y-5">
          {/* 2. SERVICE MANAGEMENT GROUP */}
          <div>
            <div className="flex items-center gap-1.5 px-3 mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              <Wrench className="h-3 w-3 text-blue-400" />
              <span>Service Management</span>
            </div>
            <div className="space-y-1">
              {serviceNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = active === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-md font-bold'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. HR MANAGEMENT GROUP */}
          <div>
            <div className="flex items-center gap-1.5 px-3 mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              <UserCheck className="h-3 w-3 text-emerald-400" />
              <span>HR & Workforce</span>
            </div>
            <div className="space-y-1">
              {hrNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = active === item.id;
                const badge = item.hasBadge && pendingLeavesCount > 0 ? pendingLeavesCount : null;

                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold transition ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-md font-bold'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </div>

                    {badge !== null && (
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-extrabold text-white shadow-sm animate-pulse">
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        {/* User profile & Sign out */}
        <div className="border-t border-slate-800/80 p-3">
          <div className="mb-2 px-3">
            <p className="text-xs font-bold text-white leading-tight">{profile?.full_name}</p>
            <p className="text-[11px] text-slate-400 truncate">{profile?.email}</p>
          </div>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            <LogOut className="h-4 w-4 text-red-400" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between bg-slate-900 px-4 py-3 md:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white p-0.5 shadow-sm">
            <img src={icsLogo} alt="ICS Logo" className="h-full w-full object-contain" />
          </div>
          <span className="text-base font-bold text-white">ICS Service Manager</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNotifications(true)}
            className="relative rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
            title="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <button onClick={() => setMobileOpen(true)} className="text-white">
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-slate-900 flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800/60 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white p-0.5">
                  <img src={icsLogo} alt="ICS Logo" className="h-full w-full object-contain" />
                </div>
                <div>
                  <span className="block text-sm font-bold text-white leading-tight">ICS</span>
                  <span className="block text-[10px] font-medium text-slate-400">Service Manager</span>
                </div>
              </div>
              <button onClick={() => setMobileOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Mobile Notification Button */}
            <div className="px-3 pt-3">
              <button
                onClick={() => { setShowNotifications(true); setMobileOpen(false); }}
                className="flex w-full items-center justify-between rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700"
              >
                <span className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-blue-400" /> Notifications
                </span>
                <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              </button>
            </div>

            {/* Mobile Navigation */}
            <nav className="flex-1 overflow-y-auto px-3 mt-4 space-y-4">
              {/* Service Management */}
              <div>
                <p className="px-3 mb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Service Management
                </p>
                <div className="space-y-1">
                  {serviceNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = active === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => { onNavigate(item.id); setMobileOpen(false); }}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                          isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* HR Management */}
              <div>
                <p className="px-3 mb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  HR & Workforce
                </p>
                <div className="space-y-1">
                  {hrNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = active === item.id;
                    const badge = item.hasBadge && pendingLeavesCount > 0 ? pendingLeavesCount : null;

                    return (
                      <button
                        key={item.id}
                        onClick={() => { onNavigate(item.id); setMobileOpen(false); }}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition ${
                          isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </div>
                        {badge !== null && (
                          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-extrabold text-white">
                            {badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </nav>

            <div className="mt-auto border-t border-slate-800 p-3">
              <p className="mb-2 px-3 text-xs font-medium text-white">{profile?.full_name}</p>
              <button
                onClick={signOut}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <LogOut className="h-4 w-4 text-red-400" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-x-hidden pt-14 md:pt-0">
        <main className="p-4 md:p-6">{children}</main>
      </div>

      {/* Admin Notification Modal */}
      <NotificationCenterModal
        open={showNotifications}
        onClose={() => setShowNotifications(false)}
        onNavigate={onNavigate}
        onSelectJob={(jobId) => {
          if (onSelectJob) onSelectJob(jobId);
        }}
      />
    </div>
  );
}
