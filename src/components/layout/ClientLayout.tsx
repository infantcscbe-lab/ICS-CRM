import { useState, useEffect, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { Client } from '@/types/database';
import { getClientExpiryAlerts, type ClientDeviceAlert } from '@/lib/clientDevices';
import {
  CalendarPlus,
  ClipboardList,
  Building2,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  Headphones,
  AlertTriangle,
  Cpu,
} from 'lucide-react';
import icsLogo from '@/assets/ics-logo.png';

interface ClientLayoutProps {
  active: string;
  onNavigate: (page: string) => void;
  children: ReactNode;
}

const navItems = [
  { id: 'book', label: 'Book Service Call', icon: CalendarPlus },
  { id: 'calls', label: 'My Service Requests', icon: ClipboardList },
  { id: 'profile', label: 'Company Profile', icon: Building2 },
];

export function ClientLayout({ active, onNavigate, children }: ClientLayoutProps) {
  const { profile, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [clientRecord, setClientRecord] = useState<Client | null>(null);
  const [alerts, setAlerts] = useState<ClientDeviceAlert[]>([]);

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
            const c = data as Client;
            setClientRecord(c);
            setAlerts(getClientExpiryAlerts(c));
          }
        } catch {
          // ignore
        }
      }
    }
    loadClientData();
  }, [profile?.client_id]);

  const companyName = profile?.company_name || profile?.full_name || 'Valued Customer';
  const clientCode = profile?.client_code || 'ICS-CLIENT';
  const hasExpiringSoon = alerts.some((a) => a.info.isExpiringSoon);
  const hasExpired = alerts.some((a) => a.info.isExpired);

  return (
    <div className="flex min-h-screen flex-col bg-slate-900 text-slate-100 antialiased">
      {/* ── Top Header Navigation Bar ── */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          {/* Logo & Portal Branding */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white p-1 shadow-md shadow-blue-500/20">
              <img src={icsLogo} alt="ICS Logo" className="h-full w-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold tracking-tight text-white sm:text-lg">
                  ICS Client Service Portal
                </span>
                <span className="hidden items-center gap-1 rounded-full bg-purple-500/20 px-2 py-0.5 text-[11px] font-bold text-purple-300 border border-purple-500/30 sm:inline-flex">
                  <ShieldCheck className="h-3 w-3 text-purple-400" /> Client Account
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Industrial Calibration & Service Support
              </p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* User Account / Sign Out / Support */}
          <div className="hidden md:flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs font-bold text-white max-w-[160px] truncate">
                {companyName}
              </p>
              <p className="text-[10px] text-slate-400 font-mono">
                {profile?.email || clientCode}
              </p>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-300 transition"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </div>

          {/* Mobile Menu Toggle Button */}
          <div className="flex md:hidden items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:text-white"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileOpen && (
          <div className="border-t border-slate-800 bg-slate-900 px-4 py-3 md:hidden">
            <div className="mb-3 rounded-xl bg-slate-800/80 p-3 border border-slate-700">
              <p className="text-xs font-bold text-white">{companyName}</p>
              <p className="text-[11px] text-slate-400">{profile?.email || clientCode}</p>
            </div>
            <div className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = active === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onNavigate(item.id);
                      setMobileOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                      isActive
                        ? 'bg-blue-600 text-white font-bold'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={signOut}
                className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/10 transition mt-2 border-t border-slate-800 pt-3"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ── Client AMC / Warranty Expiry Notification Banner (<= 1 week or expired) ── */}
      {alerts.length > 0 && (
        <aside aria-label="AMC or Warranty contract expiry notice" className="border-b border-amber-500/40 bg-gradient-to-r from-amber-950/80 via-amber-900/60 to-slate-900 px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 shrink-0 mt-0.5 sm:mt-0">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs sm:text-sm font-bold text-amber-200">
                    {hasExpiringSoon
                      ? 'Action Required: AMC / Warranty Expiring Soon (Within 1 Week)!'
                      : 'Notice: Contract Expired • Devices Converted to Non-Contract'}
                  </p>
                  <span className="rounded-full bg-amber-500/30 px-2 py-0.5 text-[10px] font-extrabold text-amber-300 border border-amber-400/40">
                    {alerts.length} {alerts.length === 1 ? 'Device Notice' : 'Devices Notice'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {alerts.map((a, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-900/90 px-2 py-0.5 text-[11px] font-mono font-bold text-slate-200 border border-amber-500/40"
                    >
                      <Cpu className="h-3 w-3 text-blue-400" />
                      <span>{a.device.device_id}:</span>
                      <span className={a.info.isExpired ? 'text-red-400' : 'text-amber-300'}>
                        {a.info.statusLabel}
                      </span>
                      <span className="text-[10px] text-slate-400 font-sans">
                        ({a.info.dateRangeLabel})
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate('profile')}
                className="rounded-xl bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition shadow-md shadow-amber-500/20"
              >
                View Contract Details
              </button>
              <a
                href="tel:+919876543210"
                className="rounded-xl border border-amber-500/40 bg-slate-800/90 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition"
              >
                📞 Contact ICS Support
              </a>
            </div>
          </div>
        </aside>
      )}

      {/* ── Main Content Area ── */}
      <main className="flex-1 bg-slate-950 text-slate-100">
        {children}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-800/80 bg-slate-900/60 py-4 text-center text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© {new Date().getFullYear()} Infant Calibration & Service. All rights reserved.</p>
          <div className="flex items-center gap-4 text-slate-400">
            <span className="flex items-center gap-1 text-slate-400">
              <Headphones className="h-3.5 w-3.5 text-blue-400" /> Helpline: +91 98765 43210
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

