import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { Client, ClientContact, ClientDevice, DeviceContractType, ServiceJob, ServiceHistory, Profile } from '@/types/database';
import { Plus, Pencil, X, Search, Phone, Mail, MapPin, Trash2, Eye, Cpu, Key, Lock, EyeOff, Users, UserPlus, AlertTriangle, Calendar, CheckCircle2, ShieldCheck, Clock, AlertCircle, Filter, Wrench, FileText } from 'lucide-react';
import { formatKm } from '@/lib/distance';
import { parseClientDevices, getDeviceContractInfo, formatContractDate, getAllClientsExpiryAlerts } from '@/lib/clientDevices';

export function parseAdditionalContacts(client: Client): ClientContact[] {
  if (Array.isArray(client.additional_contacts)) {
    return client.additional_contacts;
  }
  if (typeof client.additional_contacts === 'string' && client.additional_contacts.trim()) {
    try {
      const parsed = JSON.parse(client.additional_contacts);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
  }
  if (client.secondary_contact_name || client.secondary_phone) {
    return [
      {
        name: client.secondary_contact_name || '',
        phone: client.secondary_phone || '',
        role: 'Secondary',
      },
    ];
  }
  return [];
}

export function AdminClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [history, setHistory] = useState<ServiceHistory[]>([]);
  const [engineers, setEngineers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [detailClient, setDetailClient] = useState<Client | null>(null);

  useEffect(() => {
    load();
    const ch = supabase.channel('admin-clients')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_jobs' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_history' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function load() {
    const [{ data: cData }, { data: jData }, { data: hData }, { data: pData }] = await Promise.all([
      supabase.from('clients').select('*').order('client_name'),
      supabase.from('service_jobs').select('*').order('created_at', { ascending: false }),
      supabase.from('service_history').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*'),
    ]);
    setClients((cData as unknown as Client[]) || []);
    setJobs((jData as unknown as ServiceJob[]) || []);
    setHistory((hData as unknown as ServiceHistory[]) || []);
    setEngineers((pData as unknown as Profile[]) || []);
    setLoading(false);
  }

  const filtered = clients.filter((c) => {
    const s = search.toLowerCase();
    const extra = parseAdditionalContacts(c);
    const extraMatch = extra.some(
      (ec) => ec.name?.toLowerCase().includes(s) || ec.phone?.includes(search) || ec.role?.toLowerCase().includes(s)
    );
    return (
      !search ||
      c.client_name.toLowerCase().includes(s) ||
      c.company_name?.toLowerCase().includes(s) ||
      c.city?.toLowerCase().includes(s) ||
      c.device_ids?.toLowerCase().includes(s) ||
      c.phone?.includes(search) ||
      c.secondary_contact_name?.toLowerCase().includes(s) ||
      c.secondary_phone?.includes(search) ||
      extraMatch
    );
  });

  function clientStats(clientId: string) {
    const cJobs = jobs.filter((j) => j.client_id === clientId);
    const completed = cJobs.filter((j) => j.status === 'completed');
    const totalKm = completed.reduce((s, j) => s + (j.total_km ?? 0), 0);
    return { total: cJobs.length, completed: completed.length, totalKm };
  }

  async function deleteClient(id: string) {
    if (!confirm('Are you sure you want to delete this client? This will also delete their service history.')) return;
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) { alert('Cannot delete client: they may have existing service jobs. Please cancel those jobs first.'); return; }
    load();
  }

  const expiryAlerts = useMemo(() => getAllClientsExpiryAlerts(clients), [clients]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients & Accounts</h1>
          <p className="text-xs text-slate-500 mt-0.5">Manage registered clients, client portal passwords, and assigned hardware devices & AMC/Warranty contracts</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowModal(true); }}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 font-semibold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 transition"
        >
          <Plus className="h-5 w-5" /> Add Client
        </button>
      </div>

      {/* Expiry Alerts Banner (<= 7 days or expired) */}
      {expiryAlerts.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-3 border-b border-amber-200">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-amber-950 flex items-center gap-2">
                  AMC / Warranty Expiry Notifications
                  <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-extrabold text-amber-900">
                    {expiryAlerts.length} {expiryAlerts.length === 1 ? 'Notice' : 'Notices'}
                  </span>
                </h3>
                <p className="text-xs text-amber-800">
                  Client devices expiring within 1 week (7 days) or already expired (automatically converted to Non-Contract)
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {expiryAlerts.slice(0, 6).map((alert, idx) => (
              <div
                key={`${alert.client.id}-${alert.device.device_id}-${idx}`}
                className="flex items-center justify-between gap-2 rounded-xl bg-white p-3 border border-amber-200 shadow-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-bold text-slate-900">{alert.device.device_id}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold border uppercase ${alert.info.badgeBg} ${alert.info.badgeText} ${alert.info.badgeBorder}`}>
                      {alert.device.contract_type}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-800 truncate mt-0.5" title={alert.client.client_name}>
                    {alert.client.client_name} {alert.client.company_name ? `(${alert.client.company_name})` : ''}
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                    <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
                    <span className="truncate">{alert.info.dateRangeLabel}</span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    alert.info.isExpired
                      ? 'bg-red-100 text-red-700 border border-red-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}>
                    {alert.info.daysRemaining !== null && alert.info.daysRemaining >= 0
                      ? alert.info.daysRemaining === 0
                        ? 'Expires Today'
                        : `${alert.info.daysRemaining}d left`
                      : 'Expired (Non-Contract)'}
                  </span>
                  <div>
                    <button
                      type="button"
                      onClick={() => { setEditing(alert.client); setShowModal(true); }}
                      className="mt-1 text-[11px] text-blue-600 hover:text-blue-800 font-bold underline"
                    >
                      Renew / Edit
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {expiryAlerts.length > 6 && (
            <p className="mt-2.5 text-center text-xs font-semibold text-amber-900">
              +{expiryAlerts.length - 6} more client devices requiring renewal
            </p>
          )}
        </div>
      )}

      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          id="search-clients"
          name="search_clients"
          aria-label="Search clients"
          type="text"
          placeholder="Search by client, company, phone, city, device ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Client Name</th>
              <th className="px-4 py-3 font-semibold">Company</th>
              <th className="px-4 py-3 font-semibold">City</th>
              <th className="px-4 py-3 font-semibold">Phone / Email</th>
              <th className="px-4 py-3 font-semibold">Devices & Contracts</th>
              <th className="px-4 py-3 text-right font-semibold">Jobs</th>
              <th className="px-4 py-3 text-right font-semibold">Completed</th>
              <th className="px-4 py-3 text-right font-semibold">Total KM</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Loading clients...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No clients found</td></tr>
            ) : filtered.map((c) => {
              const s = clientStats(c.id);
              const clientDevices = parseClientDevices(c);
              const extraContacts = parseAdditionalContacts(c);
              return (
                <tr key={c.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 text-slate-900">
                    <div className="font-semibold text-slate-900">{c.client_name}</div>
                    {c.password && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-1.5 py-0.5 text-[10px] text-purple-700 font-mono font-semibold border border-purple-200 mt-1 whitespace-nowrap">
                        <Key className="h-3 w-3 text-purple-500" /> Password Set
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{c.company_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{c.city || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">
                    <div className="font-mono text-xs font-semibold text-slate-900">{c.phone || '—'}</div>
                    {c.email && <div className="text-[11px] text-slate-400 truncate max-w-[140px]">{c.email}</div>}
                    {extraContacts.length > 0 && (
                      <div className="mt-1 flex flex-col gap-0.5">
                        {extraContacts.slice(0, 2).map((cnt, idx) => (
                          <div key={idx} className="text-[11px] text-slate-600 flex items-center gap-1 font-mono">
                            <span className="text-blue-600 font-semibold truncate max-w-[90px]" title={cnt.name}>{cnt.name || cnt.role || 'Alt'}:</span>
                            <span>{cnt.phone}</span>
                          </div>
                        ))}
                        {extraContacts.length > 2 && (
                          <span className="text-[10px] text-blue-600 font-bold">+{extraContacts.length - 2} more contact{extraContacts.length - 2 > 1 ? 's' : ''}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-800">
                        <Cpu className="h-3.5 w-3.5 text-blue-600" />
                        {clientDevices.length || c.device_count || 1} {clientDevices.length === 1 ? 'Device' : 'Devices'}
                      </span>
                      {clientDevices.length > 0 && (
                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                          {clientDevices.slice(0, 3).map((d) => {
                            const info = getDeviceContractInfo(d);
                            return (
                              <span
                                key={d.device_id}
                                className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-bold border flex items-center gap-1 ${
                                  info.isExpiringSoon
                                    ? 'bg-amber-50 text-amber-800 border-amber-300 ring-1 ring-amber-400'
                                    : info.isExpired
                                    ? 'bg-red-50 text-red-700 border-red-300'
                                    : d.contract_type === 'amc'
                                    ? 'bg-blue-50 text-blue-800 border-blue-200'
                                    : d.contract_type === 'warranty'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-slate-50 text-slate-700 border-slate-200'
                                }`}
                                title={`${d.device_id}: ${info.statusLabel} (${info.dateRangeLabel})`}
                              >
                                <span>{d.device_id}</span>
                                <span className="text-[9px] font-sans font-bold uppercase opacity-85">
                                  {info.isExpired ? 'EXP' : d.contract_type === 'non_contract' ? 'NC' : d.contract_type?.toUpperCase()}
                                </span>
                              </span>
                            );
                          })}
                          {clientDevices.length > 3 && (
                            <span className="text-[10px] text-slate-400 font-bold">+{clientDevices.length - 3} more</span>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">{s.total}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-600">{s.completed}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">{formatKm(s.totalKm)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => setDetailClient(c)} className="rounded p-1.5 text-blue-600 hover:bg-blue-50" title="View details"><Eye className="h-4 w-4" /></button>
                      <button onClick={() => { setEditing(c); setShowModal(true); }} className="rounded p-1.5 text-slate-600 hover:bg-slate-100" title="Edit client"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => deleteClient(c.id)} className="rounded p-1.5 text-red-600 hover:bg-red-50" title="Delete client"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && <ClientModal client={editing} onClose={() => setShowModal(false)} onSaved={load} />}
      {detailClient && (
        <ClientDetail
          client={detailClient}
          jobs={jobs.filter((j) => j.client_id === detailClient.id)}
          history={history.filter((h) => h.client_id === detailClient.id || (h.job_id && jobs.some((j) => j.id === h.job_id && j.client_id === detailClient.id)))}
          engineers={engineers}
          onClose={() => setDetailClient(null)}
        />
      )}
    </div>
  );
}

function ClientModal({ client, onClose, onSaved }: { client: Client | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(client?.client_name ?? '');
  const [company, setCompany] = useState(client?.company_name ?? '');
  const [phone, setPhone] = useState(client?.phone ?? '');
  const [email, setEmail] = useState(client?.email ?? '');
  const [password, setPassword] = useState(client?.password ?? 'client123');
  const [showPassword, setShowPassword] = useState(false);
  
  // Devices state as array of ClientDevice objects with AMC/Warranty/Non-Contract and expiry dates
  const [devices, setDevices] = useState<ClientDevice[]>(() => {
    const parsed = parseClientDevices(client);
    if (parsed.length > 0) return parsed;
    const today = new Date().toISOString().split('T')[0];
    const oneYearLater = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    return [
      {
        device_id: 'ICS-DEV-101',
        contract_type: 'amc',
        start_date: today,
        end_date: oneYearLater,
        notes: null,
      },
    ];
  });
  const [customDeviceInput, setCustomDeviceInput] = useState('');

  const [address, setAddress] = useState(client?.address ?? '');
  const [city, setCity] = useState(client?.city ?? '');
  const [lat, setLat] = useState(client?.latitude?.toString() ?? '');
  const [lng, setLng] = useState(client?.longitude?.toString() ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-generate next sequential device tag: ICS-DEV-101, ICS-DEV-102, ...
  function handleAddNextDevice() {
    let maxNum = 100;
    devices.forEach((d) => {
      const match = d.device_id.match(/(\d+)/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    });
    const nextTag = `ICS-DEV-${maxNum + 1}`;
    const today = new Date().toISOString().split('T')[0];
    const oneYearLater = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    setDevices((prev) => [
      ...prev,
      {
        device_id: nextTag,
        contract_type: 'amc',
        start_date: today,
        end_date: oneYearLater,
        notes: null,
      },
    ]);
  }

  function handleAddCustomDevice() {
    if (!customDeviceInput.trim()) return;
    const tag = customDeviceInput.trim().toUpperCase();
    if (!devices.some((d) => d.device_id.toUpperCase() === tag)) {
      setDevices((prev) => [
        ...prev,
        {
          device_id: tag,
          contract_type: 'non_contract',
          start_date: null,
          end_date: null,
          notes: null,
        },
      ]);
    }
    setCustomDeviceInput('');
  }

  function handleUpdateDevice(index: number, updates: Partial<ClientDevice>) {
    setDevices((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...updates };
      return copy;
    });
  }

  function handleSet1Year(index: number) {
    const today = new Date().toISOString().split('T')[0];
    const oneYearLater = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    handleUpdateDevice(index, { start_date: today, end_date: oneYearLater });
  }

  function handleSet6Months(index: number) {
    const today = new Date().toISOString().split('T')[0];
    const sixMonthsLater = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    handleUpdateDevice(index, { start_date: today, end_date: sixMonthsLater });
  }

  function handleRemoveDevice(indexToRemove: number) {
    setDevices((prev) => prev.filter((_, i) => i !== indexToRemove));
  }

  // Additional contacts state (multiple contact names & mobile numbers)
  const [additionalContacts, setAdditionalContacts] = useState<ClientContact[]>(() => {
    if (client) {
      return parseAdditionalContacts(client);
    }
    return [];
  });

  function handleAddContact() {
    setAdditionalContacts((prev) => [...prev, { name: '', phone: '', role: '' }]);
  }

  function handleUpdateContact(index: number, field: keyof ClientContact, value: string) {
    setAdditionalContacts((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  }

  function handleRemoveContact(index: number) {
    setAdditionalContacts((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('Client contact name is required.'); return; }
    if (!phone.trim() && !email.trim()) { setError('Please provide either a Phone number or Email for login access.'); return; }
    if (!password.trim()) { setError('Please set a password for the client portal login.'); return; }

    setLoading(true);
    try {
      const clientId = client?.id || crypto.randomUUID();
      const finalDeviceIds = devices.length > 0 ? devices.map((d) => d.device_id).join(', ') : 'ICS-DEV-101';
      
      const validExtra = additionalContacts.filter((c) => c.name.trim() || c.phone.trim());
      const firstExtra = validExtra[0];
      const secondaryName = firstExtra?.name.trim() || null;
      const secondaryPhone = firstExtra?.phone.trim() || null;

      const basePayload = {
        client_name: name.trim(),
        company_name: company.trim(),
        phone: phone.trim(),
        email: email.trim(),
        password: password.trim(),
        device_count: devices.length || 1,
        device_ids: finalDeviceIds,
        devices: devices,
        secondary_contact_name: secondaryName,
        secondary_phone: secondaryPhone,
        additional_contacts: validExtra,
        address: address.trim(),
        city: city.trim(),
        latitude: lat ? parseFloat(lat) : null,
        longitude: lng ? parseFloat(lng) : null,
        updated_at: new Date().toISOString(),
      };

      // Resilient save: try saving with devices JSONB column; if column missing, fallback gracefully
      try {
        if (client) {
          const { error: uErr } = await supabase.from('clients').update(basePayload).eq('id', client.id);
          if (uErr) throw uErr;
        } else {
          const { error: iErr } = await supabase.from('clients').insert({
            id: clientId,
            ...basePayload,
            created_at: new Date().toISOString(),
          });
          if (iErr) throw iErr;
        }
      } catch (colErr: unknown) {
        const fallbackPayload = {
          client_name: name.trim(),
          company_name: company.trim(),
          phone: phone.trim(),
          email: email.trim(),
          password: password.trim(),
          device_count: devices.length || 1,
          device_ids: finalDeviceIds,
          address: address.trim(),
          city: city.trim(),
          latitude: lat ? parseFloat(lat) : null,
          longitude: lng ? parseFloat(lng) : null,
          updated_at: new Date().toISOString(),
        };

        if (client) {
          const { error: fbErr } = await supabase.from('clients').update(fallbackPayload).eq('id', client.id);
          if (fbErr) throw new Error(`Database Error: ${fbErr.message}`);
        } else {
          const { error: fbErr } = await supabase.from('clients').insert({
            id: clientId,
            ...fallbackPayload,
            created_at: new Date().toISOString(),
          });
          if (fbErr) throw new Error(`Database Error: ${fbErr.message}`);
        }
      }


      if (client) {
        // Cascade updated phone, name, email, and company to all linked leads
        try {
          await supabase
            .from('leads')
            .update({
              customer_name: name.trim(),
              company_name: company.trim(),
              mobile_number: phone.trim(),
              email: email.trim(),
              address: address.trim(),
              updated_at: new Date().toISOString(),
            })
            .eq('customer_id', client.id);
        } catch (leadErr) {
          console.warn('Could not cascade client update to leads:', leadErr);
        }
      }

      // Sync Client profile so they can immediately log in
      try {
        await supabase.from('profiles').upsert({
          id: clientId,
          client_id: clientId,
          full_name: name.trim(),
          company_name: company.trim(),
          email: email.trim() || `${phone.trim().replace(/\D/g, '') || clientId.slice(0, 8)}@client.local`,
          phone: phone.trim(),
          role: 'client',
          password_hash: password.trim(),
          is_active: true,
          updated_at: new Date().toISOString(),
        });
      } catch {
        // Non-critical profile sync fallback
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save client.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="mt-6 mb-8 w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{client ? 'Edit Client' : 'Add New Client'}</h2>
            <p className="text-xs text-slate-500">Configure client details, portal credentials, and registered devices</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {error && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

          {/* Section 1: Client & Company */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="client-modal-name" className="mb-1 block text-xs font-semibold text-slate-700">Client Contact Name *</label>
              <input
                id="client-modal-name"
                name="client_name"
                type="text"
                required
                placeholder="e.g. Rajesh Kumar"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="client-modal-company" className="mb-1 block text-xs font-semibold text-slate-700">Company Name</label>
              <input
                id="client-modal-company"
                name="company_name"
                type="text"
                placeholder="e.g. Apex Engineering"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Section 2: Contact & Portal Login Password */}
          <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200 space-y-3">
            <p className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-blue-600" />
              Client Portal Login Credentials
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="client-modal-phone" className="mb-1 block text-xs font-semibold text-slate-700">Phone (Login Username)</label>
                <input
                  id="client-modal-phone"
                  name="phone"
                  type="text"
                  placeholder="+91 98765 00001"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label htmlFor="client-modal-email" className="mb-1 block text-xs font-semibold text-slate-700">Email (Optional)</label>
                <input
                  id="client-modal-email"
                  name="email"
                  type="email"
                  placeholder="client@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="client-modal-password" className="mb-1 block text-xs font-semibold text-slate-700 flex items-center justify-between">
                <span>Client Portal Password *</span>
                <span className="text-[10px] text-slate-400 font-normal">Client uses this to log in</span>
              </label>
              <div className="relative">
                <input
                  id="client-modal-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Set login password (e.g. client123)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 pr-10 text-sm font-mono outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Section: Additional Contacts & Mobile Numbers */}
          <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-blue-600" />
                  Additional Contacts & Mobile Numbers ({additionalContacts.length})
                </p>
                <p className="text-[11px] text-slate-500">
                  Add more contact persons, mobile numbers, and roles for this client
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddContact}
                className="flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 border border-blue-200 transition shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" /> Add Contact
              </button>
            </div>

            {additionalContacts.length === 0 ? (
              <div className="rounded-lg bg-white p-3 text-center border border-dashed border-slate-300 text-xs text-slate-500">
                No additional contacts added yet. Click <span className="font-semibold text-blue-600">+ Add Contact</span> to add more contact persons and numbers.
              </div>
            ) : (
              <div className="space-y-2.5">
                {additionalContacts.map((contact, idx) => (
                  <div key={idx} className="rounded-xl bg-white p-3 border border-slate-200 shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                        Contact #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveContact(idx)}
                        className="text-slate-400 hover:text-red-600 p-1 rounded-md hover:bg-red-50 transition"
                        title="Remove contact"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold text-slate-700">Contact Person Name</label>
                        <input
                          type="text"
                          placeholder="e.g. Vikram Sharma"
                          value={contact.name}
                          onChange={(e) => handleUpdateContact(idx, 'name', e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold text-slate-700">Mobile Number</label>
                        <input
                          type="tel"
                          placeholder="+91 98765 43210"
                          value={contact.phone}
                          onChange={(e) => handleUpdateContact(idx, 'phone', e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold text-slate-700">Role / Note (Optional)</label>
                        <input
                          type="text"
                          placeholder="e.g. Manager / Site In-charge"
                          value={contact.role || ''}
                          onChange={(e) => handleUpdateContact(idx, 'role', e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 3: Registered Hardware & AMC / Warranty Contracts */}
          <div className="rounded-xl bg-blue-50/70 p-4 border border-blue-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-blue-700" />
                  Client Hardware & Contract Coverage ({devices.length})
                </p>
                <p className="text-[11px] text-blue-800">
                  Set AMC, Warranty, or Non-Contract with validity dates for automatic expiry tracking
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddNextDevice}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition active:scale-95"
              >
                <Plus className="h-3.5 w-3.5" /> Add Device
              </button>
            </div>

            {/* Device Cards with contract controls */}
            {devices.length > 0 ? (
              <div className="space-y-3 pt-1">
                {devices.map((d, index) => {
                  const info = getDeviceContractInfo(d);
                  return (
                    <div
                      key={`${d.device_id}-${index}`}
                      className="rounded-xl bg-white p-3.5 border border-blue-200 shadow-xs space-y-2.5"
                    >
                      {/* Top Row: Device Tag + Contract Type + Remove */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-800 text-[11px] font-extrabold">
                            #{index + 1}
                          </span>
                          <input
                            type="text"
                            value={d.device_id}
                            onChange={(e) => handleUpdateDevice(index, { device_id: e.target.value.toUpperCase().trim() })}
                            placeholder="Device Tag (e.g. ICS-DEV-101)"
                            className="w-32 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-mono font-bold text-blue-950 outline-none focus:border-blue-500 focus:bg-white"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            value={d.contract_type || 'non_contract'}
                            onChange={(e) => {
                              const newType = e.target.value as DeviceContractType;
                              const today = new Date().toISOString().split('T')[0];
                              const oneYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                              handleUpdateDevice(index, {
                                contract_type: newType,
                                start_date: newType === 'non_contract' ? null : (d.start_date || today),
                                end_date: newType === 'non_contract' ? null : (d.end_date || oneYear),
                              });
                            }}
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 cursor-pointer"
                          >
                            <option value="amc">AMC (Annual Contract)</option>
                            <option value="warranty">Warranty</option>
                            <option value="non_contract">Non-Contract</option>
                          </select>

                          <button
                            type="button"
                            onClick={() => handleRemoveDevice(index)}
                            className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                            title={`Remove device ${d.device_id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Contract Dates Row if AMC or Warranty */}
                      {d.contract_type !== 'non_contract' ? (
                        <div className="rounded-lg bg-slate-50/80 p-2.5 border border-slate-200 space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="mb-0.5 block text-[10px] font-semibold text-slate-600 flex items-center gap-1">
                                <Calendar className="h-3 w-3 text-slate-400" />
                                Start Date
                              </label>
                              <input
                                type="date"
                                value={d.start_date ? d.start_date.split('T')[0] : ''}
                                onChange={(e) => handleUpdateDevice(index, { start_date: e.target.value })}
                                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-mono outline-none focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="mb-0.5 block text-[10px] font-semibold text-slate-600 flex items-center gap-1">
                                <Calendar className="h-3 w-3 text-slate-400" />
                                Expiry Date (End Date) *
                              </label>
                              <input
                                type="date"
                                value={d.end_date ? d.end_date.split('T')[0] : ''}
                                onChange={(e) => handleUpdateDevice(index, { end_date: e.target.value })}
                                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-mono outline-none focus:border-blue-500"
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-slate-200/60">
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-slate-400">Quick set:</span>
                              <button
                                type="button"
                                onClick={() => handleSet1Year(index)}
                                className="rounded bg-white border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition"
                              >
                                +1 Year
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSet6Months(index)}
                                className="rounded bg-white border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition"
                              >
                                +6 Months
                              </button>
                            </div>

                            <div>
                              {info.isExpired ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 border border-red-200 px-2 py-0.5 rounded-md">
                                  <AlertTriangle className="h-3 w-3" /> Expired • Auto Non-Contract
                                </span>
                              ) : info.isExpiringSoon ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md">
                                  <AlertTriangle className="h-3 w-3" /> Expires in {info.daysRemaining} days (1-wk alert)
                                </span>
                              ) : d.end_date ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-md">
                                  <CheckCircle2 className="h-3 w-3" /> Active ({info.daysRemaining}d left)
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg bg-slate-50 p-2 text-[11px] text-slate-500 border border-dashed border-slate-200">
                          Non-Contract: Service calls for this device will be billed on chargeable basis per visit.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg bg-white/70 p-3 text-center border border-dashed border-blue-300 text-xs text-blue-700">
                No devices added yet. Click <strong>+ Add Device</strong> above.
              </div>
            )}

            {/* Custom device ID input */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                placeholder="Or type custom tag (e.g. ICS-DEV-501)..."
                value={customDeviceInput}
                onChange={(e) => setCustomDeviceInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomDevice();
                  }
                }}
                className="flex-1 rounded-xl border border-blue-200 bg-white px-3 py-1.5 text-xs font-mono text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleAddCustomDevice}
                disabled={!customDeviceInput.trim()}
                className="rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-bold text-blue-800 hover:bg-blue-100 disabled:opacity-40 transition"
              >
                Add Tag
              </button>
            </div>
          </div>

          {/* Section 4: Address & Location */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="client-modal-address" className="mb-1 block text-xs font-semibold text-slate-700">Address</label>
              <input
                id="client-modal-address"
                name="address"
                type="text"
                placeholder="Street address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="client-modal-city" className="mb-1 block text-xs font-semibold text-slate-700">City</label>
              <input
                id="client-modal-city"
                name="city"
                type="text"
                placeholder="City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="client-modal-lat" className="mb-1 block text-xs font-semibold text-slate-700">Latitude (Optional)</label>
              <input
                id="client-modal-lat"
                name="latitude"
                type="text"
                placeholder="11.0168"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="client-modal-lng" className="mb-1 block text-xs font-semibold text-slate-700">Longitude (Optional)</label>
              <input
                id="client-modal-lng"
                name="longitude"
                type="text"
                placeholder="76.9558"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition">Cancel</button>
            <button type="submit" disabled={loading} className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition disabled:opacity-60 shadow-md shadow-blue-600/20">
              {loading ? 'Saving Client...' : 'Save Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ClientDetail({
  client,
  jobs,
  history,
  engineers,
  onClose,
}: {
  client: Client;
  jobs: ServiceJob[];
  history: ServiceHistory[];
  engineers: Profile[];
  onClose: () => void;
}) {
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const completed = jobs.filter((j) => j.status === 'completed');
  const totalKm = completed.reduce((s, j) => s + (j.total_km ?? 0), 0);

  // Map of engineers for fast lookup
  const engineerMap = useMemo(() => {
    const map = new Map<string, Profile>();
    engineers.forEach((eng) => map.set(eng.id, eng));
    return map;
  }, [engineers]);

  // Extract all distinct Year-Months from client's jobs
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    jobs.forEach((j) => {
      const rawDate = j.completed_at || j.scheduled_date || j.created_at;
      if (rawDate) {
        const yyyymm = rawDate.slice(0, 7); // e.g. "2026-09"
        if (/^\d{4}-\d{2}$/.test(yyyymm)) {
          monthsSet.add(yyyymm);
        }
      }
    });

    return Array.from(monthsSet)
      .sort()
      .reverse()
      .map((ym) => {
        const [y, m] = ym.split('-');
        const dateObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
        const label = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const count = jobs.filter((j) => {
          const d = j.completed_at || j.scheduled_date || j.created_at;
          return d && d.startsWith(ym);
        }).length;
        return { value: ym, label, count };
      });
  }, [jobs]);

  // Filter jobs according to month, status, and search query
  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      const jobDate = j.completed_at || j.scheduled_date || j.created_at || '';
      if (selectedMonth !== 'all' && !jobDate.startsWith(selectedMonth)) {
        return false;
      }
      if (selectedStatus !== 'all' && j.status !== selectedStatus) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const eng = j.engineer_id ? engineerMap.get(j.engineer_id) : null;
        const matchesJobNumber = j.job_number?.toLowerCase().includes(q);
        const matchesIssue = j.issue_title?.toLowerCase().includes(q) || j.issue_description?.toLowerCase().includes(q);
        const matchesWork = j.work_performed?.toLowerCase().includes(q) || j.diagnosis?.toLowerCase().includes(q);
        const matchesEng = eng?.full_name?.toLowerCase().includes(q);
        const matchesDevice = j.device_id?.toLowerCase().includes(q);
        if (!matchesJobNumber && !matchesIssue && !matchesWork && !matchesEng && !matchesDevice) {
          return false;
        }
      }
      return true;
    });
  }, [jobs, selectedMonth, selectedStatus, searchQuery, engineerMap]);

  // Filtered stats
  const filteredCompleted = filteredJobs.filter((j) => j.status === 'completed');
  const filteredKm = filteredJobs.reduce((s, j) => s + (j.total_km ?? 0), 0);

  function getStatusBadge(status: string) {
    switch (status) {
      case 'completed':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'in_progress':
      case 'traveling':
      case 'reached':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'solved':
        return 'bg-teal-50 text-teal-700 border-teal-200';
      case 'assigned':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'cancelled':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'vendor':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'call_back':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="mt-6 mb-8 w-full max-w-3xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{client.client_name}</h2>
            <p className="text-xs text-slate-500">{client.company_name || 'Client Details & Service Account'}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-2xl bg-slate-50 p-3.5 text-center border border-slate-100">
              <p className="text-xs font-semibold text-slate-500">Total Jobs</p>
              <p className="text-2xl font-extrabold text-slate-900 mt-0.5">{jobs.length}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-3.5 text-center border border-emerald-100">
              <p className="text-xs font-semibold text-emerald-700">Completed</p>
              <p className="text-2xl font-extrabold text-emerald-700 mt-0.5">{completed.length}</p>
            </div>
            <div className="rounded-2xl bg-blue-50 p-3.5 text-center border border-blue-100">
              <p className="text-xs font-semibold text-blue-700">Total KM</p>
              <p className="text-2xl font-extrabold text-blue-700 mt-0.5">{formatKm(totalKm)}</p>
            </div>
          </div>

          {/* Registered Devices & Contract Status */}
          <div className="rounded-2xl bg-blue-50/80 p-4 border border-blue-200 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                <Cpu className="h-4 w-4 text-blue-600" />
                Registered Devices & AMC/Warranty Contracts ({parseClientDevices(client).length || client.device_count || 1})
              </p>
            </div>
            {parseClientDevices(client).length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {parseClientDevices(client).map((d) => {
                  const info = getDeviceContractInfo(d);
                  return (
                    <div
                      key={d.device_id}
                      className="rounded-xl bg-white p-3 border border-blue-200 shadow-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-slate-900 flex items-center gap-1">
                          <Cpu className="h-3.5 w-3.5 text-blue-600" />
                          {d.device_id}
                        </span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold border uppercase ${info.badgeBg} ${info.badgeText} ${info.badgeBorder}`}>
                          {info.isExpired ? 'Expired • Non-Contract' : d.contract_type}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 flex items-center gap-1 font-mono">
                        <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
                        <span>{info.dateRangeLabel}</span>
                      </div>
                      <div className="text-[11px] font-semibold">
                        <span className={info.isExpired ? 'text-red-600' : info.isExpiringSoon ? 'text-amber-700' : d.contract_type === 'non_contract' ? 'text-slate-500' : 'text-emerald-700'}>
                          {info.statusLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-blue-700">1 Standard Device registered</p>
            )}
          </div>

          {/* Client Portal Credentials */}
          <div className="rounded-2xl bg-purple-50 p-4 border border-purple-200">
            <p className="text-xs font-bold text-purple-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5 text-purple-600" />
              Client Portal Login Access
            </p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-white p-2.5 border border-purple-100">
                <span className="text-slate-400 block text-[10px]">Login Username</span>
                <span className="font-mono font-bold text-purple-900">{client.phone || client.email || client.client_name}</span>
              </div>
              <div className="rounded-xl bg-white p-2.5 border border-purple-100">
                <span className="text-slate-400 block text-[10px]">Password</span>
                <span className="font-mono font-bold text-purple-900">{client.password || 'client123'}</span>
              </div>
            </div>
          </div>

          {/* Contact Persons & Mobile Numbers */}
          <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200 space-y-2.5">
            <p className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="h-4 w-4 text-blue-600" />
              Contact Persons & Mobile Numbers
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                <div>
                  <span className="text-xs font-bold text-slate-900 block">{client.client_name}</span>
                  <span className="inline-block mt-0.5 text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-semibold border border-blue-100">
                    Primary Contact
                  </span>
                </div>
                {client.phone ? (
                  <a
                    href={`tel:${client.phone}`}
                    className="flex items-center gap-1.5 text-xs font-mono font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 transition"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {client.phone}
                  </a>
                ) : (
                  <span className="text-xs text-slate-400">No phone</span>
                )}
              </div>

              {parseAdditionalContacts(client).map((cnt, idx) => (
                <div key={idx} className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">{cnt.name || 'Additional Contact'}</span>
                    <span className="inline-block mt-0.5 text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded font-medium border border-slate-200">
                      {cnt.role || 'Secondary Contact'}
                    </span>
                  </div>
                  {cnt.phone ? (
                    <a
                      href={`tel:${cnt.phone}`}
                      className="flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 transition"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {cnt.phone}
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400">No phone</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Client Details / Address */}
          <div className="space-y-2 text-sm text-slate-600">
            <p><span className="font-semibold text-slate-700">Company:</span> {client.company_name || '—'}</p>
            <p className="flex items-center gap-1.5"><Phone className="h-4 w-4 text-slate-400" /> {client.phone || '—'}</p>
            <p className="flex items-center gap-1.5"><Mail className="h-4 w-4 text-slate-400" /> {client.email || '—'}</p>
            <p className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-slate-400" /> {client.address}{client.city ? `, ${client.city}` : ''}</p>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* ENTIRE CLIENT SERVICE HISTORY WITH MONTH FILTER OPTION              */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <div className="pt-4 border-t border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-blue-600" />
                  Entire Service History ({jobs.length} Total Services)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Complete service log, engineer resolutions, and mileage breakdown
                </p>
              </div>

              {/* Month Filter Dropdown */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200">
                  <Calendar className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-700">Month:</span>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-900 outline-none cursor-pointer pr-1"
                  >
                    <option value="all">All Months ({jobs.length})</option>
                    {availableMonths.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label} ({m.count})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status Filter Dropdown */}
                <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200">
                  <Filter className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-slate-800 outline-none cursor-pointer"
                  >
                    <option value="all">All Statuses</option>
                    <option value="completed">Completed</option>
                    <option value="in_progress">In Progress</option>
                    <option value="assigned">Assigned</option>
                    <option value="solved">Solved</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Quick Search inside Client's Service History */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by job #, issue title, engineer name, or resolution notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-500 focus:bg-white transition"
              />
            </div>

            {/* Filter Result Stats Banner */}
            <div className="flex items-center justify-between rounded-xl bg-slate-100/80 px-3 py-2 text-xs text-slate-600">
              <span className="font-medium">
                Showing <strong className="text-slate-900">{filteredJobs.length}</strong> of{' '}
                <strong className="text-slate-900">{jobs.length}</strong> service records
                {selectedMonth !== 'all' && (
                  <span>
                    {' '}
                    in{' '}
                    <strong className="text-blue-700">
                      {availableMonths.find((m) => m.value === selectedMonth)?.label || selectedMonth}
                    </strong>
                  </span>
                )}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-emerald-700 font-semibold">
                  Completed: <strong>{filteredCompleted.length}</strong>
                </span>
                <span className="text-blue-700 font-semibold">
                  Distance: <strong>{formatKm(filteredKm)}</strong>
                </span>
                {(selectedMonth !== 'all' || selectedStatus !== 'all' || searchQuery) && (
                  <button
                    onClick={() => {
                      setSelectedMonth('all');
                      setSelectedStatus('all');
                      setSearchQuery('');
                    }}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 underline ml-1"
                  >
                    Reset Filter
                  </button>
                )}
              </div>
            </div>

            {/* Service History Records List */}
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {filteredJobs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center bg-slate-50/50">
                  <Wrench className="mx-auto mb-2 h-7 w-7 text-slate-300" />
                  <p className="text-xs font-semibold text-slate-600">
                    No service records found for the selected filter.
                  </p>
                  <button
                    onClick={() => {
                      setSelectedMonth('all');
                      setSelectedStatus('all');
                      setSearchQuery('');
                    }}
                    className="mt-2 text-xs font-bold text-blue-600 hover:underline"
                  >
                    View Entire Service History
                  </button>
                </div>
              ) : (
                filteredJobs.map((job) => {
                  const eng = job.engineer_id ? engineerMap.get(job.engineer_id) : job.engineer;
                  const histItem = history.find((h) => h.job_id === job.id);
                  const displayDate = job.completed_at || job.scheduled_date || job.created_at;
                  const formattedDate = displayDate
                    ? new Date(displayDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })
                    : '—';

                  const workDone = job.work_performed || histItem?.solution;
                  const notes = job.engineer_notes || histItem?.notes;

                  return (
                    <div
                      key={job.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs hover:border-slate-300 transition space-y-2.5"
                    >
                      {/* Top Job Header Row */}
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-extrabold text-blue-900 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                            #{job.job_number}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase border ${getStatusBadge(
                              job.status
                            )}`}
                          >
                            {job.status.replace('_', ' ')}
                          </span>
                          {job.priority && job.priority !== 'medium' && (
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                job.priority === 'urgent'
                                  ? 'bg-red-100 text-red-700'
                                  : job.priority === 'high'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {job.priority}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <span>{formattedDate}</span>
                        </div>
                      </div>

                      {/* Issue Title & Description */}
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">
                          {job.issue_title || 'Service Request'}
                        </h4>
                        {job.issue_description && (
                          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                            {job.issue_description}
                          </p>
                        )}
                      </div>

                      {/* Details Strip: Engineer, Device, KM */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs bg-slate-50/80 rounded-xl p-2.5 border border-slate-100">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Attended Engineer</span>
                          <span className="font-semibold text-slate-800">
                            {eng?.full_name || 'Unassigned'}
                          </span>
                          {eng?.phone && (
                            <a
                              href={`tel:${eng.phone}`}
                              className="text-[10px] text-blue-600 hover:underline block font-mono"
                            >
                              {eng.phone}
                            </a>
                          )}
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-400 block">Target Device</span>
                          <span className="font-mono font-bold text-slate-800">
                            {job.device_id || 'Primary Unit'}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-400 block">Travel Distance</span>
                          <span className="font-semibold text-emerald-700">
                            {formatKm(job.total_km ?? histItem?.total_km ?? 0)}
                          </span>
                        </div>
                      </div>

                      {/* Work Performed / Solution (replaces the 'Status changed to undefined' bug) */}
                      {(workDone || notes || job.diagnosis || job.parts_replaced) && (
                        <div className="space-y-1.5 pt-1 border-t border-slate-100 text-xs">
                          {workDone && (
                            <p className="text-slate-700">
                              <strong className="text-slate-900 font-semibold">Resolution / Work: </strong>
                              <span>{workDone}</span>
                            </p>
                          )}
                          {job.diagnosis && (
                            <p className="text-slate-700">
                              <strong className="text-slate-900 font-semibold">Diagnosis: </strong>
                              <span>{job.diagnosis}</span>
                            </p>
                          )}
                          {job.parts_replaced && (
                            <p className="text-slate-700">
                              <strong className="text-slate-900 font-semibold">Parts Replaced: </strong>
                              <span>{job.parts_replaced}</span>
                            </p>
                          )}
                          {notes && notes !== workDone && (
                            <p className="text-slate-600 italic text-[11px]">
                              <strong className="not-italic font-semibold text-slate-800">Notes: </strong>
                              <span>{notes}</span>
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

