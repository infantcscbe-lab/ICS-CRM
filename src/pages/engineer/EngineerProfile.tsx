import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { User, Phone, Mail, Save, Loader2 } from 'lucide-react';

export function EngineerProfile() {
  const { profile, signOut } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSuccess(null); setLoading(true);
    try {
      const { error: uErr } = await supabase.from('profiles').update({
        full_name: fullName.trim(), phone: phone.trim(),
      }).eq('id', profile?.id);
      if (uErr) throw new Error(uErr.message);
      setSuccess('Profile updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally { setLoading(false); }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Profile</h1>

      <div className="mb-6 flex justify-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-600">
          <User className="h-10 w-10 text-white" />
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {success && <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">Full Name</label>
          <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500" />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">Email</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input type="email" value={profile?.email ?? ''} disabled className="w-full rounded-lg border border-slate-300 bg-slate-100 py-2.5 pl-10 pr-3 text-slate-500" />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">Phone</label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 outline-none focus:border-blue-500" />
          </div>
        </div>

        <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />} Save Changes
        </button>
      </form>

      <button onClick={signOut} className="mt-4 w-full rounded-lg border border-slate-300 py-2.5 font-medium text-slate-600 hover:bg-slate-100">
        Sign Out
      </button>
    </div>
  );
}
