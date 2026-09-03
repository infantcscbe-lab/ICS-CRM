import { useState, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  LayoutDashboard,
  Target,
  CalendarCheck,
  FileText,
  BarChart3,
  User,
  LogOut,
  Menu,
  X,
  Sparkles,
} from 'lucide-react';
import icsLogo from '@/assets/ics-logo.png';

interface SalesLayoutProps {
  active: string;
  onNavigate: (page: string) => void;
  children: ReactNode;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'leads', label: 'My Leads', icon: Target },
  { id: 'followups', label: 'Follow-ups', icon: CalendarCheck },
  { id: 'quotations', label: 'Quotations', icon: FileText },
  { id: 'reports', label: 'My Performance', icon: BarChart3 },
  { id: 'profile', label: 'Profile', icon: User },
];

export function SalesLayout({ active, onNavigate, children }: SalesLayoutProps) {
  const { profile, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* ─── Desktop Sidebar ─── */}
      <aside className="hidden w-64 flex-col bg-slate-900 text-white lg:flex shrink-0">
        {/* Branding Header */}
        <div className="flex items-center gap-3 border-b border-slate-800 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white p-1 shadow-sm">
            <img src={icsLogo} alt="ICS Logo" className="h-full w-full object-contain" />
          </div>
          <div>
            <span className="block text-base font-extrabold tracking-tight text-white leading-none">
              ICS Service
            </span>
            <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-bold text-purple-300 border border-purple-500/30">
              <Sparkles className="h-2.5 w-2.5" /> Sales Executive
            </span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                    : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User Info & Sign Out Footer */}
        <div className="border-t border-slate-800 p-3">
          <div className="flex items-center justify-between rounded-xl bg-slate-800/60 p-2.5">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600 text-xs font-bold text-white shrink-0">
                {profile?.full_name?.charAt(0) || 'S'}
              </div>
              <div className="truncate">
                <p className="truncate text-xs font-bold text-white">{profile?.full_name}</p>
                <p className="truncate text-[10px] text-slate-400">
                  {profile?.employee_id ? `ID: ${profile.employee_id}` : 'Sales Executive'}
                </p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white transition"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ─── Mobile Header ─── */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden shadow-xs">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="flex items-center gap-2">
              <img src={icsLogo} alt="ICS Logo" className="h-6 w-6 object-contain" />
              <span className="text-sm font-black text-slate-900">ICS Sales</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
              {profile?.full_name?.split(' ')[0]}
            </span>
            <button onClick={signOut} className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Mobile Dropdown Nav */}
        {mobileOpen && (
          <div className="border-b border-slate-200 bg-slate-900 p-3 text-white lg:hidden space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id);
                    setMobileOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-bold ${
                    isActive ? 'bg-purple-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
