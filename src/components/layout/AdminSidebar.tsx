import type { ReactNode } from 'react';
import {
  LayoutDashboard,
  Briefcase,
  Users,
  Building2,
  MapPin,
  BarChart3,
  LogOut,
  X,
  Bell,
  CalendarCheck,
  Wrench,
  UserCheck,
  Store,
  Inbox,
  Target,
  Layers,
  FileSpreadsheet,
  Sparkles,
  IndianRupee,
  Mail,
} from 'lucide-react';
import icsLogo from '@/assets/ics-logo.png';
import { BranchSelector } from '@/components/common/BranchSelector';
import type { Profile } from '@/types/database';

export interface AdminSidebarProps {
  active: string;
  onNavigate: (page: string) => void;
  profile: Profile | null;
  isCoordinator: boolean;
  signOut: () => void;
  unreadCount: number;
  pendingLeavesCount: number;
  pendingRequestsCount: number;
  pendingOutstandingCount: number;
  setShowNotifications: (show: boolean) => void;
  setShowSmtpModal: (show: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

// ─── Sectioned Nav Item Groups ───
const serviceNavItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'requests', label: 'Call Requests', icon: Inbox, hasBadge: true },
  { id: 'jobs', label: 'Service Jobs', icon: Briefcase },
  { id: 'clients', label: 'Clients', icon: Building2 },
  { id: 'outstanding', label: 'Outstanding Report', icon: IndianRupee, hasBadge: true },
  { id: 'vendors', label: 'Vendors', icon: Store },
  { id: 'tracking', label: 'Live Tracking', icon: MapPin },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
];

const salesNavItems = [
  { id: 'leads', label: 'All Leads', icon: Target },
  { id: 'leads-dashboard', label: 'Pipeline Funnel', icon: Layers },
  { id: 'lead-reports', label: 'Lead & Sales Reports', icon: FileSpreadsheet },
];

const hrNavItems = [
  { id: 'attendance', label: 'Attendance Hub', icon: CalendarCheck, hasBadge: true },
  { id: 'engineers', label: 'Staff & Workforce', icon: Users },
];

export function AdminSidebar({
  active,
  onNavigate,
  profile,
  isCoordinator,
  signOut,
  unreadCount,
  pendingLeavesCount,
  pendingRequestsCount,
  pendingOutstandingCount,
  setShowNotifications,
  setShowSmtpModal,
  mobileOpen,
  setMobileOpen,
}: AdminSidebarProps) {
  return (
    <>
      {/* ─── Desktop Sidebar ─── */}
      <aside className="hidden w-64 flex-shrink-0 bg-slate-900 md:flex md:flex-col shadow-xl h-screen sticky top-0 overflow-hidden">
        {/* Brand Header with Notification Bell and Top Logout Button */}
        <div className="shrink-0 flex items-center justify-between border-b border-slate-800/80 px-4 py-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white p-1 shadow-sm shrink-0">
              <img src={icsLogo} alt="ICS Logo" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              <span className="block text-sm font-black text-white tracking-tight leading-tight">ICS</span>
              <span className="block text-[10px] font-bold text-blue-400 uppercase tracking-wider whitespace-nowrap">
                Service Manager
              </span>
            </div>
          </div>

          {/* Desktop Notification Bell Button */}
          <button
            onClick={() => setShowNotifications(true)}
            className="relative rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition shrink-0"
            title="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white shadow-md animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Branch Selector (Global for Admin / Locked for Coordinator) */}
        <div className="shrink-0 px-3 pt-3">
          <BranchSelector className="w-full" />
        </div>

        {/* 1. NOTIFICATIONS STRIP BUTTON */}
        <div className="shrink-0 px-3 pt-3">
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

        {/* Navigation Groups with Dedicated Custom Scrollbar */}
        <nav className="mt-3 flex-1 min-h-0 overflow-y-scroll px-3 pr-1.5 space-y-5 sidebar-scrollbar">
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
                const badge =
                  item.id === 'requests' && pendingRequestsCount > 0
                    ? pendingRequestsCount
                    : item.id === 'outstanding' && pendingOutstandingCount > 0
                    ? pendingOutstandingCount
                    : null;

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
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-black text-slate-950 shadow-sm animate-pulse">
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. SALES & LEADS GROUP */}
          <div>
            <div className="flex items-center gap-1.5 px-3 mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              <Sparkles className="h-3 w-3 text-purple-400" />
              <span>Sales & Leads</span>
            </div>
            <div className="space-y-1">
              {salesNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = active === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold transition ${
                      isActive
                        ? 'bg-purple-600 text-white shadow-md font-bold'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. HR MANAGEMENT GROUP - Only accessible & visible for Admin */}
          {!isCoordinator && (
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
          )}
        </nav>

        {/* User profile & Settings Footer */}
        <div className="shrink-0 border-t border-slate-800/80 p-3">
          <div className="mb-2 px-3">
            <div className="flex items-center justify-between gap-1.5">
              <p className="text-xs font-bold text-white leading-tight truncate">{profile?.full_name}</p>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider border ${
                  isCoordinator
                    ? 'bg-purple-950/80 text-purple-300 border-purple-800/80'
                    : 'bg-blue-950/80 text-blue-300 border-blue-800/80'
                }`}
              >
                {isCoordinator ? 'Co-ordinator' : 'Admin'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate mt-0.5">
              {profile?.employee_id ? <span className="font-mono font-semibold text-slate-300 mr-1">{profile.employee_id}</span> : null}
              {profile?.employee_id ? '• ' : ''}
              {profile?.email}
            </p>
          </div>
          <button
            onClick={() => setShowSmtpModal(true)}
            className="mb-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
            title="Configure accounts@icsstore.in Mail & Password"
          >
            <Mail className="h-4 w-4 text-blue-400" />
            <span>Mail & SMTP Config</span>
          </button>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            <LogOut className="h-4 w-4 text-red-400" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ─── Mobile Drawer ─── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-slate-900 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800/60 px-4 py-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white p-0.5 shadow-sm">
                  <img src={icsLogo} alt="ICS Logo" className="h-full w-full object-contain" />
                </div>
                <span className="text-sm font-bold text-white">Menu</span>
              </div>
              <button onClick={() => setMobileOpen(false)} className="text-slate-400 hover:text-white p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-4 py-2.5 border-b border-slate-800">
              <BranchSelector className="w-full" />
            </div>

            {/* Mobile Notification Button */}
            <div className="px-3 pt-3">
              <button
                onClick={() => {
                  setShowNotifications(true);
                  setMobileOpen(false);
                }}
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

            {/* Mobile Navigation with Custom Scrollbar */}
            <nav className="flex-1 min-h-0 overflow-y-scroll px-3 pr-1.5 mt-4 space-y-4 sidebar-scrollbar">
              {/* Service Management */}
              <div>
                <p className="px-3 mb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Service Management
                </p>
                <div className="space-y-1">
                  {serviceNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = active === item.id;
                    const badge =
                      item.id === 'requests' && pendingRequestsCount > 0
                        ? pendingRequestsCount
                        : item.id === 'outstanding' && pendingOutstandingCount > 0
                        ? pendingOutstandingCount
                        : null;

                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          onNavigate(item.id);
                          setMobileOpen(false);
                        }}
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
                          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-black text-slate-950 shadow-sm animate-pulse">
                            {badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sales & Leads */}
              <div>
                <p className="px-3 mb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Sales & Leads
                </p>
                <div className="space-y-1">
                  {salesNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = active === item.id;

                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          onNavigate(item.id);
                          setMobileOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold transition ${
                          isActive
                            ? 'bg-purple-600 text-white shadow-md font-bold'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                          <span>{item.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* HR & Workforce */}
              {!isCoordinator && (
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
                          onClick={() => {
                            onNavigate(item.id);
                            setMobileOpen(false);
                          }}
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
              )}
            </nav>

            {/* Mobile Footer */}
            <div className="border-t border-slate-800 p-3">
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
    </>
  );
}
