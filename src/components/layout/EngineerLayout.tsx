import { type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useOnDutyTracker } from '@/hooks/useOnDutyTracker';
import { Home, Briefcase, CalendarCheck, History, User, LogOut, Sparkles } from 'lucide-react';
import icsLogo from '@/assets/ics-logo.png';

interface EngineerLayoutProps {
  active: string;
  onNavigate: (page: string) => void;
  children: ReactNode;
}

const navItems = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'jobs', label: 'Jobs', icon: Briefcase },
  { id: 'leads', label: 'Leads', icon: Sparkles },
  { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { id: 'history', label: 'History', icon: History },
  { id: 'profile', label: 'Profile', icon: User },
];

export function EngineerLayout({ active, onNavigate, children }: EngineerLayoutProps) {
  const { profile, signOut } = useAuth();

  // Continuous background GPS tracking while engineer is punched in on duty
  const { isOnDuty, gpsStatus } = useOnDutyTracker(profile?.id);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-slate-900 px-3.5 sm:px-4 py-2.5 sm:py-3 shadow-sm">
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white p-0.5 shadow-sm">
            <img src={icsLogo} alt="ICS Logo" className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0">
            <span className="block text-sm font-bold text-white leading-none">ICS</span>
            <span className="block text-[10px] font-medium text-slate-400 truncate">Service Engineer</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {isOnDuty && (
            <div
              className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[10px] font-bold text-emerald-400 border border-emerald-500/30 shadow-sm"
              title={`GPS Live Tracking Active (${gpsStatus})`}
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              <span>On Duty<span className="hidden sm:inline"> (GPS Live)</span></span>
            </div>
          )}

          <button onClick={signOut} className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition" title="Sign Out">
            <LogOut className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-3.5 sm:p-4 pb-24 sm:pb-24">{children}</main>

      {/* Bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-slate-200/90 bg-white/95 backdrop-blur-md pb-[max(0.35rem,env(safe-area-inset-bottom,0px))] pt-1.5 shadow-[0_-4px_16px_rgba(0,0,0,0.04)]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`group flex flex-1 flex-col items-center justify-center py-1 px-0.5 transition-all select-none ${
                isActive ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className="relative flex items-center justify-center">
                <Icon className={`h-5 w-5 transition-transform duration-150 ${isActive ? 'scale-110 stroke-[2.4]' : 'stroke-2'}`} />
                {isActive && (
                  <span className="absolute -bottom-1 h-1 w-1 rounded-full bg-blue-600" />
                )}
              </div>
              <span className="mt-1 text-[10px] leading-tight tracking-tight truncate max-w-full text-center">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Hidden but keeps profile referenced */}
      <span className="hidden">{profile?.full_name}</span>
    </div>
  );
}
