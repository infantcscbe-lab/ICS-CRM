import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Client, ServiceJob, ServiceHistory } from '@/types/database';
import { Plus, Pencil, X, Search, Phone, Mail, MapPin, Trash2, Eye, Route } from 'lucide-react';
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
      supabase.from('service_jobs').select('*, engineer:profiles(*)'),
      supabase.from('service_history').select('*'),
    ]);
    const dbClients = (cData as unknown as Client[]) || [];
    const localClients = JSON.parse(localStorage.getItem('custom_local_clients') || '[]') as Client[];
    const clientMap = new Map<string, Client>();
    dbClients.forEach((c) => clientMap.set(c.id, c));
    localClients.forEach((c) => clientMap.set(c.id, c));

    setClients(Array.from(clientMap.values()));
    setJobs((jData as unknown as ServiceJob[]) || []);
    setHistory((hData as unknown as ServiceHistory[]) || []);
    setLoading(false);
  }

  const filtered = clients.filter((c) =>
    !search || c.client_name.toLowerCase().includes(search.toLowerCase()) || c.company_name.toLowerCase().includes(search.toLowerCase()) || c.city.toLowerCase().includes(search.toLowerCase())
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
        <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
        <button onClick={() => { setEditing(null); setShowModal(true); }} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700">
          <Plus className="h-5 w-5" /> Add Client
        </button>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input type="text" placeholder="Search clients..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 outline-none focus:border-blue-500" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Client ID</th>
              <th className="px-4 py-3 font-semibold">Client</th>
              <th className="px-4 py-3 font-semibold">Company</th>
              <th className="px-4 py-3 font-semibold">City</th>
              <th className="px-4 py-3 font-semibold">Phone</th>
              <th className="px-4 py-3 text-right font-semibold">Jobs</th>
              <th className="px-4 py-3 text-right font-semibold">Completed</th>
              <th className="px-4 py-3 text-right font-semibold">Total KM</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No clients found</td></tr>
            ) : filtered.map((c) => {
              const s = clientStats(c.id);
              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-blue-700">
                    {c.client_code || `CL-${c.id.slice(0, 5).toUpperCase()}`}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{c.client_name}</td>
                  <td className="px-4 py-3 text-slate-700">{c.company_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{c.city || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{c.phone || '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{s.total}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{s.completed}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{formatKm(s.totalKm)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => setDetailClient(c)} className="rounded p-1.5 text-blue-600 hover:bg-blue-50"><Eye className="h-4 w-4" /></button>
                      <button onClick={() => { setEditing(c); setShowModal(true); }} className="rounded p-1.5 text-slate-600 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => deleteClient(c.id)} className="rounded p-1.5 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && <ClientModal client={editing} onClose={() => setShowModal(false)} onSaved={load} />}
      {detailClient && <ClientDetail client={detailClient} jobs={jobs.filter((j) => j.client_id === detailClient.id)} history={history.filter((h) => h.client_id === detailClient.id)} onClose={() => setDetailClient(null)} />}
    </div>
  );
}

function ClientModal({ client, onClose, onSaved }: { client: Client | null; onClose: () => void; onSaved: () => void }) {
  const [clientCode, setClientCode] = useState(() => {
    if (client?.client_code) return client.client_code;
    if (client?.id) return `CL-${client.id.slice(0, 5).toUpperCase()}`;
    const localList = JSON.parse(localStorage.getItem('custom_local_clients') || '[]') as Client[];
    const count = 100 + localList.length + 1;
    return `CL-${count}`;
  });
  const [name, setName] = useState(client?.client_name ?? '');
  const [company, setCompany] = useState(client?.company_name ?? '');
  const [phone, setPhone] = useState(client?.phone ?? '');
  const [email, setEmail] = useState(client?.email ?? '');
  const [address, setAddress] = useState(client?.address ?? '');
  const [city, setCity] = useState(client?.city ?? '');
  const [lat, setLat] = useState(client?.latitude?.toString() ?? '');
  const [lng, setLng] = useState(client?.longitude?.toString() ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) {
      // Query database count for dynamic sequential Client ID (CL-101, CL-102, ...)
      supabase.from('clients').select('id, client_code').then(({ data }) => {
        const total = (data?.length || 0);
        const nextNumber = 101 + total;
        setClientCode((prev) => prev.startsWith('CL-') ? `CL-${nextNumber}` : prev);
      });
    }
  }, [client]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('Client name is required.'); return; }
    setLoading(true);
    try {
      const clientId = client?.id || crypto.randomUUID();
      const payload = {
        id: clientId,
        client_code: clientCode.trim() || `CL-${clientId.slice(0, 5).toUpperCase()}`,
        client_name: name.trim(), company_name: company.trim(), phone: phone.trim(), email: email.trim(),
        address: address.trim(), city: city.trim(),
        latitude: lat ? parseFloat(lat) : null, longitude: lng ? parseFloat(lng) : null,
        created_at: client?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const localList = JSON.parse(localStorage.getItem('custom_local_clients') || '[]') as Client[];

      if (client) {
        const { error: uErr } = await supabase.from('clients').update(payload).eq('id', client.id);
        const updatedList = localList.map((c) => c.id === client.id ? { ...c, ...payload } : c);
        localStorage.setItem('custom_local_clients', JSON.stringify(updatedList));
        if (uErr) {
          console.warn('DB client update warning, saved locally:', uErr.message);
        }
      } else {
        const { error: iErr } = await supabase.from('clients').insert(payload);
        localList.unshift(payload as Client);
        localStorage.setItem('custom_local_clients', JSON.stringify(localList));
        if (iErr) {
          console.warn('DB client insert warning, saved locally:', iErr.message);
        }
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
      <div className="mt-8 w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">{client ? 'Edit Client' : 'Add Client'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-6 w-6" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <input type="text" placeholder="Client ID (e.g. CL-101)" value={clientCode} onChange={(e) => setClientCode(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm outline-none focus:border-blue-500" />
            <input type="text" placeholder="Client name *" value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500" />
          </div>
          <input type="text" placeholder="Company name" value={company} onChange={(e) => setCompany(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500" />
          <div className="grid grid-cols-2 gap-3">
            <input type="text" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500" />
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500" />
          </div>
          <input type="text" placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500" />
          <input type="text" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500" />
          <div className="grid grid-cols-2 gap-3">
            <input type="text" placeholder="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500" />
            <input type="text" placeholder="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
            <button type="submit" disabled={loading} className="rounded-lg bg-blue-600 px-6 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{loading ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ClientDetail({ client, jobs, history, onClose }: { client: Client; jobs: ServiceJob[]; history: ServiceHistory[]; onClose: () => void }) {
  const completed = jobs.filter((j) => j.status === 'completed');
  const totalKm = completed.reduce((s, j) => s + (j.total_km ?? 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="mt-8 w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">{client.client_name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-6 w-6" /></button>
        </div>
        <div className="p-6">
          <div className="mb-6 grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <p className="text-xs text-slate-500">Total Jobs</p>
              <p className="text-xl font-bold text-slate-900">{jobs.length}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <p className="text-xs text-slate-500">Completed</p>
              <p className="text-xl font-bold text-slate-900">{completed.length}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <p className="text-xs text-slate-500">Total KM</p>
              <p className="text-xl font-bold text-slate-900">{formatKm(totalKm)}</p>
            </div>
          </div>

          <div className="mb-6 space-y-2 text-sm text-slate-600">
            <p><span className="font-semibold text-slate-700">Company:</span> {client.company_name || '—'}</p>
            <p className="flex items-center gap-1"><Phone className="h-4 w-4" /> {client.phone || '—'}</p>
            <p className="flex items-center gap-1"><Mail className="h-4 w-4" /> {client.email || '—'}</p>
            <p className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {client.address}{client.city ? `, ${client.city}` : ''}</p>
          </div>

          <h3 className="mb-3 text-sm font-bold uppercase text-slate-500">Service History</h3>
          <div className="space-y-2">
            {history.length === 0 ? (
              <p className="text-sm text-slate-400">No service history yet</p>
            ) : history.map((h) => (
              <div key={h.id} className="rounded-lg border border-slate-100 p-3">
                <p className="text-sm font-medium text-slate-900">{h.issue}</p>
                <p className="text-xs text-slate-500">{h.solution}</p>
                <p className="mt-1 text-xs text-slate-400">{h.service_date ? new Date(h.service_date).toLocaleDateString() : '—'} • {formatKm(h.total_km)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
