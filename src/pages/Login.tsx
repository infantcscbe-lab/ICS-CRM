import { useState, type FormEvent } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Lock, User } from 'lucide-react';
import icsLogo from '@/assets/ics-logo.png';

export function LoginPage() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signInError } = await signIn(username.trim(), password);
    if (signInError) {
      setError(signInError);
      setLoading(false);
    }
  }

  function fillCredentials(user: string, pass: string) {
    setUsername(user);
    setPassword(pass);
    setError(null);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-2xl bg-white p-2 shadow-lg ring-4 ring-blue-500/20">
            <img src={icsLogo} alt="ICS Logo" className="h-full w-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">ICS Service Manager</h1>
          <p className="mt-1 text-sm text-slate-400">Sign in with your username and password</p>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-username" className="mb-1.5 block text-sm font-medium text-slate-700">Username</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-username"
                  name="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  placeholder="ICSEC008, ICSEC012, ICSEC013, or Username"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-bold text-white transition hover:bg-blue-700 disabled:opacity-60 shadow-md shadow-blue-600/20"
            >
              {loading && <Loader2 className="h-5 w-5 animate-spin" />}
              {loading ? 'Signing in...' : 'Sign In to Portal'}
            </button>
          </form>

          {/* Quick Demo Credentials */}
          <div className="mt-6 border-t border-slate-100 pt-4">
            <p className="text-center text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
              Authorized Portal Access
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => fillCredentials('ICSEC008', 'ICS@2026')}
                className="rounded-lg border border-blue-200 bg-blue-50/50 px-2 py-2 text-xs font-semibold text-blue-900 hover:bg-blue-100 hover:border-blue-400 transition text-center"
              >
                👑 Admin
                <span className="block text-[10px] text-blue-700 font-bold">Vimala</span>
                <span className="block text-[9px] text-blue-600/80 font-mono">ICSEC008</span>
              </button>
              <button
                type="button"
                onClick={() => fillCredentials('ICSEC012', 'ICS@2026')}
                className="rounded-lg border border-purple-200 bg-purple-50/50 px-2 py-2 text-xs font-semibold text-purple-900 hover:bg-purple-100 hover:border-purple-400 transition text-center"
              >
                📋 Co-ordinator
                <span className="block text-[10px] text-purple-700 font-bold">Jancirani</span>
                <span className="block text-[9px] text-purple-600/80 font-mono">ICSEC012</span>
              </button>
              <button
                type="button"
                onClick={() => fillCredentials('ICSEC013', 'ICS@2026')}
                className="rounded-lg border border-purple-200 bg-purple-50/50 px-2 py-2 text-xs font-semibold text-purple-900 hover:bg-purple-100 hover:border-purple-400 transition text-center"
              >
                📋 Co-ordinator
                <span className="block text-[10px] text-purple-700 font-bold">Harshiya Banu</span>
                <span className="block text-[9px] text-purple-600/80 font-mono">ICSEC013</span>
              </button>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => fillCredentials('engineer1', '')}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 transition text-center"
              >
                🔧 Engineer
                <span className="block text-[10px] text-slate-400 font-normal">engineer1</span>
              </button>
              <button
                type="button"
                onClick={() => fillCredentials('client1', 'client123')}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition text-center"
              >
                🏢 Client
                <span className="block text-[10px] text-slate-400 font-normal">client1</span>
              </button>
              <button
                type="button"
                onClick={() => fillCredentials('sales1', 'sales123')}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 transition text-center"
              >
                💼 Sales
                <span className="block text-[10px] text-slate-400 font-normal">sales1</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
