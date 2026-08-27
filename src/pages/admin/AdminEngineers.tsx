import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile, ServiceJob } from '@/types/database';
import { Plus, Pencil, X, Phone, Mail, CheckCircle2, XCircle, Eye, Route, Trash2, Search } from 'lucide-react';
import { formatKm } from '@/lib/distance';

interface AdminEngineersProps {
  onViewJob: (job: ServiceJob) => void;
}

export function AdminEngineers({ onViewJob }: AdminEngineersProps) {
  const [engineers, setEngineers] = useState<Profile[]>([]);
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [detailEng, setDetailEng] = useState<Profile | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    load();
    const ch = supabase.channel('admin-engineers').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function load() {
    const [{ data: engData }, { data: jobData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'engineer').order('full_name'),
      supabase.from('service_jobs').select('*'),
    ]);
    setEngineers((engData as unknown as Profile[]) || []);
    setJobs((jobData as unknown as ServiceJob[]) || []);
    setLoading(false);
  }

  const today = new Date().toISOString().split('T')[0];

  function engStats(engId: string) {
    const engJobs = jobs.filter((j) => j.engineer_id === engId);
    const todayJobs = engJobs.filter((j) => j.scheduled_date === today);
    const completed = engJobs.filter((j) => j.status === 'completed');
    const totalKm = completed.reduce((s, j) => s + (j.total_km ?? 0), 0);
    const active = engJobs.find((j) => j.status === 'traveling' || j.status === 'reached' || j.status === 'in_progress');
    return { todayJobs: todayJobs.length, completed: completed.length, totalKm, activeJob: active };
  }

  async function deleteEngineer(id: string) {
    if (!confirm('Are you sure you want to delete this engineer?')) return;
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (error) {
      alert(`Cannot delete engineer: ${error.message}`);
      return;
    }
    load();
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Engineers</h1>
        <button onClick={() => { setEditing(null); setShowModal(true); }} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700">
          <Plus className="h-5 w-5" /> Add Engineer
        </button>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          id="search-engineers"
          name="search_engineers"
          aria-label="Search engineers"
          type="text"
          placeholder="Search engineers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 outline-none focus:border-blue-500"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Emp ID</th>
              <th className="px-4 py-3 font-semibold">Engineer</th>
              <th className="px-4 py-3 font-semibold">Phone</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Today's Jobs</th>
              <th className="px-4 py-3 text-right font-semibold">Completed</th>
              <th className="px-4 py-3 text-right font-semibold">Total KM</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Loading...</td></tr>
            ) : engineers.filter((eng) =>
              !search || eng.full_name.toLowerCase().includes(search.toLowerCase()) ||
              (eng.email || '').toLowerCase().includes(search.toLowerCase()) ||
              (eng.employee_id || '').toLowerCase().includes(search.toLowerCase()) ||
              (eng.phone || '').includes(search)
            ).length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No engineers found</td></tr>
            ) : engineers.filter((eng) =>
              !search || eng.full_name.toLowerCase().includes(search.toLowerCase()) ||
              (eng.email || '').toLowerCase().includes(search.toLowerCase()) ||
              (eng.employee_id || '').toLowerCase().includes(search.toLowerCase()) ||
              (eng.phone || '').includes(search)
            ).map((eng) => {
              const s = engStats(eng.id);
              return (
                <tr key={eng.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-indigo-700">
                    {eng.employee_id || `EMP-${eng.id.slice(0, 5).toUpperCase()}`}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{eng.full_name}</p>
                    <p className="text-xs text-slate-500">{eng.email}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{eng.phone || '—'}</td>
                  <td className="px-4 py-3">
                    {eng.is_active ? (
                      <span className="inline-flex items-center gap-1 text-green-600"><CheckCircle2 className="h-4 w-4" /> Active</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-400"><XCircle className="h-4 w-4" /> Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">{s.todayJobs}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{s.completed}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{formatKm(s.totalKm)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => setDetailEng(eng)} className="rounded p-1.5 text-blue-600 hover:bg-blue-50" title="View"><Eye className="h-4 w-4" /></button>
                      <button onClick={() => { setEditing(eng); setShowModal(true); }} className="rounded p-1.5 text-slate-600 hover:bg-slate-100" title="Edit"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => deleteEngineer(eng.id)} className="rounded p-1.5 text-red-600 hover:bg-red-50" title="Delete"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && <EngineerModal engineer={editing} onClose={() => setShowModal(false)} onSaved={load} />}
      {detailEng && <EngineerDetail engineer={detailEng} jobs={jobs.filter((j) => j.engineer_id === detailEng.id)} onClose={() => setDetailEng(null)} onViewJob={onViewJob} />}
    </div>
  );
}

function EngineerModal({ engineer, onClose, onSaved }: { engineer: Profile | null; onClose: () => void; onSaved: () => void }) {
  const [empId, setEmpId] = useState(() => {
    if (engineer?.employee_id) return engineer.employee_id;
    if (engineer?.id) return `EMP-${engineer.id.slice(0, 5).toUpperCase()}`;
    return 'EMP-101';
  });
  const [fullName, setFullName] = useState(engineer?.full_name ?? '');
  const [email, setEmail] = useState(engineer?.email ?? '');
  const [phone, setPhone] = useState(engineer?.phone ?? '');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(engineer?.is_active ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!engineer) {
      // Query database for highest EMP number for dynamic sequential EMP ID (EMP-101, EMP-102, ...)
      supabase.from('profiles').select('employee_id').then(({ data }) => {
        let maxNum = 100;
        (data || []).forEach((p) => {
          const match = (p.employee_id || '').match(/EMP-(\d+)/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
          }
        });
        setEmpId(`EMP-${maxNum + 1}`);
      });
    }
  }, [engineer]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fullName.trim() || !email.trim()) { setError('Name and email are required.'); return; }
    if (!engineer && !password.trim()) { setError('Password is required for new engineers.'); return; }
    setLoading(true);
    try {
      const generatedEmpId = empId.trim() || (engineer?.employee_id || `EMP-${(engineer?.id || crypto.randomUUID()).slice(0, 5).toUpperCase()}`);
      if (engineer) {
        // Update existing engineer directly in Supabase
        const { error: uErr } = await supabase.from('profiles').update({
          employee_id: generatedEmpId,
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          is_active: isActive,
        }).eq('id', engineer.id);
        
        if (uErr) throw new Error(`Database Error: ${uErr.message}`);
      } else {
        // Create new engineer profile directly in Supabase
        const newId = crypto.randomUUID();
        const finalEmpId = empId.trim() || `EMP-${newId.slice(0, 5).toUpperCase()}`;

        const { error: pErr } = await supabase.from('profiles').insert({
          id: newId,
          employee_id: finalEmpId,
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          role: 'engineer',
          is_active: isActive,
          password_hash: password.trim(),
        });
        
        if (pErr) throw new Error(`Database Error: ${pErr.message}`);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save engineer.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="mt-8 w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">{engineer ? 'Edit Engineer' : 'Add Engineer'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-6 w-6" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Emp ID</label>
              <input type="text" placeholder="e.g. EMP-101" value={empId} onChange={(e) => setEmpId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Full Name *</label>
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500" />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Email *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!engineer} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 disabled:bg-slate-100" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Phone</label>
            <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500" />
          </div>
          {!engineer && (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Password *</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500" />
            </div>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            <span className="text-sm font-medium text-slate-700">Active</span>
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
            <button type="submit" disabled={loading} className="rounded-lg bg-blue-600 px-6 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{loading ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EngineerDetail({ engineer, jobs, onClose, onViewJob }: { engineer: Profile; jobs: ServiceJob[]; onClose: () => void; onViewJob: (j: ServiceJob) => void }) {
  const completed = jobs.filter((j) => j.status === 'completed');
  const active = jobs.find((j) => j.status === 'traveling' || j.status === 'reached' || j.status === 'in_progress');
  const totalKm = completed.reduce((s, j) => s + (j.total_km ?? 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="mt-8 w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">{engineer.full_name}</h2>
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

          <div className="mb-4 flex flex-wrap gap-4 text-sm text-slate-600">
            <span className="flex items-center gap-1"><Mail className="h-4 w-4" /> {engineer.email}</span>
            <span className="flex items-center gap-1"><Phone className="h-4 w-4" /> {engineer.phone || '—'}</span>
          </div>

          {active && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-sm font-semibold text-blue-700">Active Job: {active.job_number} — {active.issue_title}</p>
              <button onClick={() => onViewJob(active)} className="mt-1 text-sm text-blue-600 hover:underline">View job</button>
            </div>
          )}

          <h3 className="mb-3 text-sm font-bold uppercase text-slate-500">Recent Jobs</h3>
          <div className="space-y-2">
            {jobs.slice(0, 10).map((j) => (
              <div key={j.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3 hover:bg-slate-50">
                <div>
                  <p className="text-sm font-medium text-slate-900">{j.job_number} — {j.issue_title}</p>
                  <p className="text-xs text-slate-500">{j.client?.client_name} • {j.scheduled_date} • {formatKm(j.total_km)}</p>
                </div>
                <button onClick={() => onViewJob(j)} className="text-blue-600 hover:underline"><Eye className="h-4 w-4" /></button>
              </div>
            ))}
            {jobs.length === 0 && <p className="text-sm text-slate-400">No jobs assigned yet</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
