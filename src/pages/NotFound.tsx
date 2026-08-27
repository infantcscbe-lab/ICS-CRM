import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md text-center animate-fade-in">
        <div className="mb-6 text-8xl font-black text-slate-200 select-none">404</div>
        <h1 className="mb-2 text-2xl font-bold text-slate-900">Page Not Found</h1>
        <p className="mb-8 text-sm text-slate-500">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition"
          >
            <ArrowLeft className="h-4 w-4" /> Go Back
          </button>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 transition"
          >
            <Home className="h-4 w-4" /> Home
          </button>
        </div>
      </div>
    </div>
  );
}
