import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Client, ServiceJob, ServiceHistory } from '@/types/database';
import { Plus, Pencil, X, Search, Phone, Mail, MapPin, Trash2, Eye, Cpu, Key, Lock, EyeOff } from 'lucide-react';
import { formatKm } from '@/lib/distance';

export function AdminClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [history, setHistory] = useState<ServiceHistory[]>([]);
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
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function load() {
    const [{ data: cData }, { data: jData }, { data: hData }] = await Promise.all([
      supabase.from('clients').select('*').order('client_name'),
      supabase.from('service_jobs').select('*'),
      supabase.from('service_history').select('*'),
    ]);
    setClients((cData as unknown as Client[]) || []);
    setJobs((jData as unknown as ServiceJob[]) || []);
    setHistory((hData as unknown as ServiceHistory[]) || []);
    setLoading(false);
  }

  const filtered = clients.filter((c) =>
    !search ||
    c.client_name.toLowerCase().includes(search.toLowerCase()) ||
    c.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.city?.toLowerCase().includes(search.toLowerCase()) ||
    c.device_ids?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

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

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients & Accounts</h1>
          <p className="text-xs text-slate-500 mt-0.5">Manage registered clients, client portal passwords, and assigned hardware devices</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowModal(true); }}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 font-semibold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 transition"
        >
          <Plus className="h-5 w-5" /> Add Client
        </button>
      </div>

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
              <th className="px-4 py-3 font-semibold">Devices</th>
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
              const deviceIdsList = (c.device_ids || '')
                .split(/[,\n;]/)
                .map((d) => d.trim())
                .filter(Boolean);

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
                    <div className="font-mono text-xs">{c.phone || '—'}</div>
                    {c.email && <div className="text-[11px] text-slate-400 truncate max-w-[140px]">{c.email}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-800">
                        <Cpu className="h-3.5 w-3.5 text-blue-600" />
                        {c.device_count || (deviceIdsList.length > 0 ? deviceIdsList.length : 1)} {c.device_count === 1 ? 'Device' : 'Devices'}
                      </span>
                      {deviceIdsList.length > 0 && (
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {deviceIdsList.slice(0, 3).map((d) => (
                            <span key={d} className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-mono font-bold text-blue-700 border border-blue-200">
                              {d}
                            </span>
                          ))}
                          {deviceIdsList.length > 3 && (
                            <span className="text-[10px] text-slate-400 font-bold">+{deviceIdsList.length - 3} more</span>
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
      {detailClient && <ClientDetail client={detailClient} jobs={jobs.filter((j) => j.client_id === detailClient.id)} history={history.filter((h) => h.job_id && jobs.some((j) => j.id === h.job_id && j.client_id === detailClient.id))} onClose={() => setDetailClient(null)} />}
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
  
  // Devices state as array of sequential / custom device IDs
  const [devices, setDevices] = useState<string[]>(() => {
    if (client?.device_ids) {
      const list = client.device_ids.split(/[,\n;]/).map((d) => d.trim()).filter(Boolean);
      if (list.length > 0) return list;
    }
    return ['ICS-DEV-101'];
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
      const match = d.match(/(\d+)/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    });
    const nextTag = `ICS-DEV-${maxNum + 1}`;
    setDevices((prev) => [...prev, nextTag]);
  }

  function handleAddCustomDevice() {
    if (!customDeviceInput.trim()) return;
    const tag = customDeviceInput.trim().toUpperCase();
    if (!devices.includes(tag)) {
      setDevices((prev) => [...prev, tag]);
    }
    setCustomDeviceInput('');
  }

  function handleRemoveDevice(indexToRemove: number) {
    setDevices((prev) => prev.filter((_, i) => i !== indexToRemove));
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
      const finalDeviceIds = devices.length > 0 ? devices.join(', ') : 'ICS-DEV-101';
      const basePayload = {
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
        const { error: uErr } = await supabase.from('clients').update(basePayload).eq('id', client.id);
        if (uErr) throw new Error(`Database Error: ${uErr.message}`);
      } else {
        const { error: iErr } = await supabase.from('clients').insert({
          id: clientId,
          ...basePayload,
          created_at: new Date().toISOString(),
        });
        if (iErr) throw new Error(`Database Error: ${iErr.message}`);
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

          {/* Section 3: Registered Hardware & Devices */}
          <div className="rounded-xl bg-blue-50/70 p-4 border border-blue-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-blue-700" />
                Client Hardware & Registered Devices ({devices.length})
              </p>
              <button
                type="button"
                onClick={handleAddNextDevice}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition active:scale-95"
              >
                <Plus className="h-3.5 w-3.5" /> Add Device
              </button>
            </div>

            <p className="text-xs text-blue-800">
              Click <strong>+ Add Device</strong> to automatically generate sequential tags (e.g. <span className="font-mono font-bold">ICS-DEV-101</span>, <span className="font-mono font-bold">ICS-DEV-102</span>).
            </p>

            {/* Device Chips with remove button */}
            {devices.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {devices.map((d, index) => (
                  <span
                    key={`${d}-${index}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-white pl-3 pr-2 py-1 text-xs font-mono font-bold text-blue-900 border border-blue-200 shadow-xs"
                  >
                    <Cpu className="h-3.5 w-3.5 text-blue-600" />
                    <span>{d}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveDevice(index)}
                      className="rounded-md p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition ml-1"
                      title={`Remove ${d}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <div className="rounded-lg bg-white/70 p-3 text-center border border-dashed border-blue-300 text-xs text-blue-700">
                No devices added. Click <strong>+ Add Device</strong> above.
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

function ClientDetail({ client, jobs, history, onClose }: { client: Client; jobs: ServiceJob[]; history: ServiceHistory[]; onClose: () => void }) {
  const completed = jobs.filter((j) => j.status === 'completed');
  const totalKm = completed.reduce((s, j) => s + (j.total_km ?? 0), 0);
  const deviceIdsList = (client.device_ids || '')
    .split(/[,\n;]/)
    .map((d) => d.trim())
    .filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="mt-8 mb-8 w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{client.client_name}</h2>
            <p className="text-xs text-slate-500">{client.company_name || 'Client Details'}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6 space-y-6">
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

          {/* Registered Devices */}
          <div className="rounded-2xl bg-blue-50/80 p-4 border border-blue-200">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                <Cpu className="h-4 w-4 text-blue-600" />
                Registered Devices ({client.device_count || deviceIdsList.length || 1})
              </p>
            </div>
            {deviceIdsList.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {deviceIdsList.map((d) => (
                  <span key={d} className="rounded-lg bg-white px-2.5 py-1 text-xs font-mono font-bold text-blue-800 border border-blue-200 shadow-xs">
                    📟 {d}
                  </span>
                ))}
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

          <div className="space-y-2 text-sm text-slate-600">
            <p><span className="font-semibold text-slate-700">Company:</span> {client.company_name || '—'}</p>
            <p className="flex items-center gap-1.5"><Phone className="h-4 w-4 text-slate-400" /> {client.phone || '—'}</p>
            <p className="flex items-center gap-1.5"><Mail className="h-4 w-4 text-slate-400" /> {client.email || '—'}</p>
            <p className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-slate-400" /> {client.address}{client.city ? `, ${client.city}` : ''}</p>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Recent Service History</h3>
            <div className="space-y-2">
              {history.length === 0 ? (
                <p className="text-xs text-slate-400">No service history recorded yet</p>
              ) : history.slice(0, 5).map((h) => (
                <div key={h.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-xs">
                  <p className="font-semibold text-slate-900">{h.notes || `Status changed to ${h.status_to}`}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{h.created_at ? new Date(h.created_at).toLocaleDateString() : '—'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

