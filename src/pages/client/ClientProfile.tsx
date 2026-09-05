import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { Client } from '@/types/database';
import { parseClientDevices, getDeviceContractInfo } from '@/lib/clientDevices';
import {
  Building2,
  Phone,
  Mail,
  MapPin,
  ShieldCheck,
  Headphones,
  Save,
  CheckCircle2,
  Calendar,
  Clock,
  Cpu,
  AlertTriangle,
} from 'lucide-react';

export function ClientProfile() {
  const { profile } = useAuth();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  // Form states
  const [contactName, setContactName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');

  useEffect(() => {
    async function loadClient() {
      if (profile?.client_id) {
        try {
          const { data } = await supabase
            .from('clients')
            .select('*')
            .eq('id', profile.client_id)
            .maybeSingle();

          if (data) {
            const c = data as Client;
            setClient(c);
            setContactName(c.client_name || profile.full_name || '');
            setPhone(c.phone || profile.phone || '');
            setEmail(c.email || profile.email || '');
            setAddress(c.address || '');
            setCity(c.city || '');
          }
        } catch {
          // ignore
        }
      }
      setLoading(false);
    }
    loadClient();
  }, [profile]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (client?.id) {
      try {
        await supabase
          .from('clients')
          .update({
            client_name: contactName.trim(),
            phone: phone.trim(),
            email: email.trim(),
            address: address.trim(),
            city: city.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', client.id);

        // Sync leads
        try {
          await supabase
            .from('leads')
            .update({
              customer_name: contactName.trim(),
              mobile_number: phone.trim(),
              email: email.trim(),
              address: address.trim(),
              updated_at: new Date().toISOString(),
            })
            .eq('customer_id', client.id);
        } catch {}

        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch {
        // ignore
      }
    }
  }

  const companyName = client?.company_name || profile?.company_name || profile?.full_name || 'Client Company';
  const clientCode = profile?.client_code || 'CLI-001';

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Top Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-0.5 text-xs font-bold text-blue-400 border border-blue-500/20 mb-2">
          <Building2 className="h-3.5 w-3.5" /> Client Account Profile
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
          Company & Contact Profile
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Manage your organization details and site dispatch contact addresses.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Summary Card */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl space-y-6">
          <div className="text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-600/20 border border-blue-500/30 text-blue-400 text-2xl font-black mb-3 shadow-lg shadow-blue-500/10">
              {companyName.charAt(0)}
            </div>
            <h2 className="text-lg font-bold text-white">{companyName}</h2>
            <span className="inline-block mt-1 font-mono text-xs text-blue-400 bg-blue-900/40 px-2.5 py-0.5 rounded-full border border-blue-700/50">
              {clientCode}
            </span>
          </div>

          <div className="border-t border-slate-800 pt-4 space-y-3 text-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span>Account Status</span>
              <span className="font-bold text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" /> Active Client
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Service Level</span>
              <span className="font-bold text-white">Priority Direct On-Site</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Support Region</span>
              <span className="font-bold text-white">Tamil Nadu / South Zone</span>
            </div>
          </div>

          {/* Help Center Card */}
          <div className="rounded-2xl bg-slate-800/80 p-4 border border-slate-700/80 space-y-2">
            <p className="text-xs font-bold text-white flex items-center gap-1.5">
              <Headphones className="h-4 w-4 text-blue-400" />
              <span>ICS Client Support</span>
            </p>
            <p className="text-[11px] text-slate-400">
              Need immediate technical help or contract renewal?
            </p>
            <a
              href="tel:+919876543210"
              className="mt-2 block w-full rounded-xl bg-blue-600/20 border border-blue-500/40 py-2 text-center text-xs font-bold text-blue-300 hover:bg-blue-600 hover:text-white transition"
            >
              📞 Call +91 98765 43210
            </a>
          </div>
        </div>

        {/* Right Side: Editable Details Form */}
        <div className="lg:col-span-2 rounded-3xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-xl">
          <h3 className="text-base font-bold text-white border-b border-slate-800 pb-3 mb-5">
            Organization & Contact Information
          </h3>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                Company / Organization Name
              </label>
              <input
                type="text"
                disabled
                value={companyName}
                className="w-full rounded-xl border border-slate-800 bg-slate-800/50 px-4 py-2.5 text-sm text-slate-400 outline-none cursor-not-allowed"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                  Primary Contact Person
                </label>
                <input
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                  Site Contact Phone
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                Email Address for Work Slips & Reports
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                  Registered Site Service Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                  City
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {saved && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-500/20 p-3 text-xs font-bold text-emerald-300 border border-emerald-500/30">
                <CheckCircle2 className="h-4 w-4" />
                <span>Company profile details updated successfully!</span>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-blue-700 transition shadow-md shadow-blue-600/20"
              >
                <Save className="h-4 w-4" />
                <span>Save Profile Changes</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Hardware Devices & AMC/Warranty Contracts Section */}
      <div className="mt-8 rounded-3xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                <Cpu className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-bold text-white">
                Registered Hardware & Service Contracts
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Overview of your registered equipment, AMC coverage, warranty periods, and expiry dates.
            </p>
          </div>
          <a
            href="tel:+919876543210"
            className="flex items-center gap-1.5 rounded-xl border border-blue-500/40 bg-blue-600/20 px-4 py-2 text-xs font-bold text-blue-300 hover:bg-blue-600 hover:text-white transition"
          >
            <Headphones className="h-3.5 w-3.5" /> Renew / Extend AMC
          </a>
        </div>

        {parseClientDevices(client).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">
            No registered hardware units found for this account. Contact ICS administration to register your devices.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {parseClientDevices(client).map((dev) => {
              const info = getDeviceContractInfo(dev);
              return (
                <div
                  key={dev.device_id}
                  className={`rounded-2xl border p-4.5 transition ${
                    info.isExpiringSoon
                      ? 'border-amber-500/50 bg-amber-950/20 shadow-md shadow-amber-500/10'
                      : info.isExpired
                      ? 'border-red-500/40 bg-red-950/20'
                      : dev.contract_type === 'amc'
                      ? 'border-blue-500/40 bg-blue-950/20'
                      : dev.contract_type === 'warranty'
                      ? 'border-emerald-500/40 bg-emerald-950/20'
                      : 'border-slate-800 bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 border border-slate-700 text-blue-400">
                        <Cpu className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <h4 className="font-mono text-sm font-extrabold text-white">
                          {dev.device_id}
                        </h4>
                        <span className="text-[11px] text-slate-400 font-medium">
                          Registered Device
                        </span>
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase border ${
                        info.isExpired
                          ? 'bg-red-500/20 text-red-300 border-red-500/40'
                          : info.isExpiringSoon
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : dev.contract_type === 'amc'
                          ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                          : dev.contract_type === 'warranty'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-slate-700/60 text-slate-300 border-slate-600'
                      }`}
                    >
                      {info.isExpired ? 'Expired (Non-Contract)' : dev.contract_type?.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-slate-500" /> Contract Validity:
                      </span>
                      <span className="font-mono font-semibold text-slate-200">
                        {info.dateRangeLabel}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-800/80 pt-2">
                      <span className="text-slate-400">Current Status:</span>
                      <span
                        className={`font-bold flex items-center gap-1 ${
                          info.isExpired
                            ? 'text-red-400'
                            : info.isExpiringSoon
                            ? 'text-amber-400'
                            : dev.contract_type === 'non_contract'
                            ? 'text-slate-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {info.isExpired ? (
                          <>
                            <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                            <span>Expired • Auto Non-Contract</span>
                          </>
                        ) : info.isExpiringSoon ? (
                          <>
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                            <span>Expires in {info.daysRemaining} days (Renew Now)</span>
                          </>
                        ) : dev.contract_type === 'non_contract' ? (
                          <span>Non-Contract (Chargeable)</span>
                        ) : (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            <span>Active ({info.daysRemaining} days remaining)</span>
                          </>
                        )}
                      </span>
                    </div>

                    {info.isExpired && (
                      <p className="text-[11px] text-red-300/80 bg-red-500/10 p-2 rounded-xl border border-red-500/20">
                        Notice: Contract period has ended. This device is now Non-Contract. Any service calls will be billed per visit.
                      </p>
                    )}

                    {info.isExpiringSoon && (
                      <p className="text-[11px] text-amber-300/80 bg-amber-500/10 p-2 rounded-xl border border-amber-500/20">
                        Reminder: This contract expires within 1 week. Please contact ICS Support to renew before expiry.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
