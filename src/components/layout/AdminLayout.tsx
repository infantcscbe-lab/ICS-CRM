import { useState, useEffect, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { LayoutDashboard, Briefcase, Users, Building2, MapPin, BarChart3, LogOut, Menu, X, Bell, CalendarCheck } from 'lucide-react';
import icsLogo from '@/assets/ics-logo.png';
import { NotificationCenterModal } from '@/components/notifications/NotificationCenterModal';
import { getAdminNotifications, getPartitionedNotifications } from '@/lib/notifications';

interface AdminLayoutProps {
  active: string;
  onNavigate: (page: string) => void;
  onSelectJob?: (jobId: string) => void;
  children: ReactNode;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'jobs', label: 'Service Jobs', icon: Briefcase },
  { id: 'engineers', label: 'Engineers', icon: Users },
  { id: 'attendance', label: 'Attendance Hub', icon: CalendarCheck },
  { id: 'clients', label: 'Clients', icon: Building2 },
  { id: 'tracking', label: 'Live Tracking', icon: MapPin },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
];

export function AdminLayout({ active, onNavigate, onSelectJob, children }: AdminLayoutProps) {
  const { profile, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    function updateCounts() {
      const notifs = getAdminNotifications();
      const { unreadCount: count } = getPartitionedNotifications(notifs);
      setUnreadCount(count);
    }
    updateCounts();

    window.addEventListener('ics-notifications-updated', updateCounts);
    window.addEventListener('storage', updateCounts);
    return () => {
      window.removeEventListener('ics-notifications-updated', updateCounts);
      window.removeEventListener('storage', updateCounts);
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-shrink-0 bg-slate-900 md:flex md:flex-col">
        <div className="flex items-center justify-between border-b border-slate-800/60 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white p-1 shadow-sm">
              <img src={icsLogo} alt="ICS Logo" className="h-full w-full object-contain" />
            </div>
            <div>
              <span className="block text-base font-bold text-white leading-tight">ICS</span>
              <span className="block text-xs font-medium text-slate-400">Service Manager</span>
            </div>
          </div>

          {/* Desktop Notification Bell in Sidebar Header */}
          <button
            onClick={() => setShowNotifications(true)}
            className="relative rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
            title="Admin Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Quick notification bar */}
        <div className="px-3 pt-3">
          <button
            onClick={() => setShowNotifications(true)}
            className="flex w-full items-center justify-between rounded-lg bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition border border-slate-700/50"
          >
            <span className="flex items-center gap-2">
              <Bell className="h-3.5 w-3.5 text-blue-400" /> Notifications
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${unreadCount > 0 ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
              {unreadCount > 0 ? `${unreadCount} new` : 'All read'}
            </span>
          </button>
        </div>

        <nav className="mt-4 flex-1 space-y-1 px-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 p-3">
          <div className="mb-2 px-3">
            <p className="text-sm font-medium text-white">{profile?.full_name}</p>
            <p className="text-xs text-slate-400">{profile?.email}</p>
          </div>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            <LogOut className="h-5 w-5" />
            Sign Out
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
          <div className="absolute left-0 top-0 h-full w-64 bg-slate-900">
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

            <div className="px-3 pt-3">
              <button
                onClick={() => { setShowNotifications(true); setMobileOpen(false); }}
                className="flex w-full items-center justify-between rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                <span className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-blue-400" /> Notifications
                </span>
                <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              </button>
            </div>

            <nav className="space-y-1 px-3 mt-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = active === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { onNavigate(item.id); setMobileOpen(false); }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                      isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
            <div className="mt-4 border-t border-slate-800 p-3">
              <p className="mb-2 px-3 text-sm font-medium text-white">{profile?.full_name}</p>
              <button
                onClick={signOut}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <LogOut className="h-5 w-5" />
                Sign Out
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
        onSelectJob={(jobId) => {
          if (onSelectJob) onSelectJob(jobId);
        }}
      />
    </div>
  );
}
