import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile, ServiceJob } from '@/types/database';
import { Plus, Pencil, X, Phone, Mail, CheckCircle2, XCircle, Eye, Route } from 'lucide-react';
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

  useEffect(() => {
    load();
    const ch = supabase.channel('admin-engineers').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function load() {
    const [{ data: engData }, { data: jobData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'engineer').order('full_name'),
      supabase.from('service_jobs').select('*, client:clients(*)'),
    ]);
    const dbEngineers = (engData as unknown as Profile[]) || [];
    const localEngineers = JSON.parse(localStorage.getItem('custom_local_engineers') || '[]') as Profile[];
    
    // Combine unique by id
    const engMap = new Map<string, Profile>();
    dbEngineers.forEach((e) => engMap.set(e.id, e));
    localEngineers.forEach((e) => engMap.set(e.id, e));

    setEngineers(Array.from(engMap.values()));
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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Engineers</h1>
        <button onClick={() => { setEditing(null); setShowModal(true); }} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700">
          <Plus className="h-5 w-5" /> Add Engineer
        </button>
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
            ) : engineers.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No engineers found</td></tr>
            ) : engineers.map((eng) => {
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
                      <button onClick={() => setDetailEng(eng)} className="rounded p-1.5 text-blue-600 hover:bg-blue-50"><Eye className="h-4 w-4" /></button>
                      <button onClick={() => { setEditing(eng); setShowModal(true); }} className="rounded p-1.5 text-slate-600 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
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
    const localList = JSON.parse(localStorage.getItem('custom_local_engineers') || '[]') as Profile[];
    const count = 100 + localList.length + 1;
    return `EMP-${count}`;
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
      // Query database count for dynamic sequential EMP ID (EMP-101, EMP-102, ...)
      supabase.from('profiles').select('id, employee_id').then(({ data }) => {
        const total = (data?.length || 0);
        const nextNumber = 101 + total;
        setEmpId((prev) => prev.startsWith('EMP-') ? `EMP-${nextNumber}` : prev);
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
        // Update existing engineer
        const { error: uErr } = await supabase.from('profiles').update({
          employee_id: generatedEmpId,
          full_name: fullName.trim(), email: email.trim(), phone: phone.trim(), is_active: isActive,
        }).eq('id', engineer.id);
        
        // Also update in local storage list
        const localList = JSON.parse(localStorage.getItem('custom_local_engineers') || '[]');
        const updatedList = localList.map((e: Profile) => e.id === engineer.id ? { ...e, employee_id: generatedEmpId, full_name: fullName.trim(), email: email.trim(), phone: phone.trim(), is_active: isActive } : e);
        localStorage.setItem('custom_local_engineers', JSON.stringify(updatedList));

        if (uErr) {
          console.warn('DB update failed, using local storage:', uErr.message);
        }
      } else {
        // Create new engineer profile
        const newId = crypto.randomUUID();
        const finalEmpId = empId.trim() || `EMP-${newId.slice(0, 5).toUpperCase()}`;
        const newEngProfile: Profile & { password?: string } = {
          id: newId,
          employee_id: finalEmpId,
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          role: 'engineer',
          is_active: isActive,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          password: password,
        };

        // Try insert into supabase profiles
        const { error: pErr } = await supabase.from('profiles').insert({
          id: newId,
          employee_id: finalEmpId,
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          role: 'engineer',
          is_active: isActive,
        });
        
        // Persist locally with password so they can log in immediately by username or email
        const localList = JSON.parse(localStorage.getItem('custom_local_engineers') || '[]');
        localList.push(newEngProfile);
        localStorage.setItem('custom_local_engineers', JSON.stringify(localList));

        if (pErr) {
          console.warn('DB direct insert warning:', pErr.message);
        }
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
