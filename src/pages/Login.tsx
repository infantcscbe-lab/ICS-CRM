import { useState, useEffect, type FormEvent } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Lock, User, Sparkles } from 'lucide-react';
import icsLogo from '@/assets/ics-logo.png';

const MOTIVATIONAL_QUOTES = [
  {
    quote: "Excellence is not an act, but a habit. Every service delivered with care makes a lasting difference.",
    author: "Service Excellence"
  },
  {
    quote: "Start every day with a positive mindset. Your dedication and hard work power our continuous success.",
    author: "Daily Inspiration"
  },
  {
    quote: "Quality means doing it right when no one is looking. Take pride in every problem you solve.",
    author: "Work Integrity"
  },
  {
    quote: "Great teamwork divides the effort and multiplies the results. Together we achieve greatness.",
    author: "Teamwork & Unity"
  },
  {
    quote: "Every challenge in the field is an opportunity to showcase your expertise and earn customer trust.",
    author: "Customer Dedication"
  },
  {
    quote: "Your positive attitude and committed effort inspire confidence across our entire organization.",
    author: "Positive Mindset"
  }
];

export function LoginPage() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(() => Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length));

  useEffect(() => {
    const timer = setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % MOTIVATIONAL_QUOTES.length);
    }, 9000);
    return () => clearInterval(timer);
  }, []);

  const currentQuote = MOTIVATIONAL_QUOTES[quoteIndex];

  function nextQuote() {
    setQuoteIndex((prev) => (prev + 1) % MOTIVATIONAL_QUOTES.length);
  }

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
                  placeholder="Employee ID or Username"
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
              id="login-submit"
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-bold text-white transition hover:bg-blue-700 disabled:opacity-60 shadow-md shadow-blue-600/20"
            >
              {loading && <Loader2 className="h-5 w-5 animate-spin" />}
              {loading ? 'Signing in...' : 'Sign In to Portal'}
            </button>
          </form>

          {/* Positive & Motivational Quotes */}
          <div className="mt-6 border-t border-slate-100 pt-5">
            <div className="relative overflow-hidden rounded-xl border border-blue-100/90 bg-gradient-to-br from-blue-50/60 via-indigo-50/40 to-slate-50 p-4 shadow-sm transition-all duration-300">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600">
                  <Sparkles className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="text-xs sm:text-sm font-medium leading-relaxed text-slate-700 italic">
                    "{currentQuote.quote}"
                  </p>
                  <div className="mt-2.5 flex items-center justify-between">
                    <span className="text-[10px] font-semibold tracking-wider uppercase text-blue-600 flex items-center gap-1">
                      ✦ {currentQuote.author}
                    </span>
                    <button
                      type="button"
                      onClick={nextQuote}
                      title="Next inspiring quote"
                      className="text-[10px] text-slate-400 hover:text-blue-600 transition font-medium flex items-center gap-0.5"
                    >
                      Next quote →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

