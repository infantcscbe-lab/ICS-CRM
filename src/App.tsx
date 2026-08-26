import { useState } from 'react';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { LoginPage } from '@/pages/Login';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { EngineerLayout } from '@/components/layout/EngineerLayout';
import { AdminDashboard } from '@/pages/admin/AdminDashboard';
import { AdminJobs } from '@/pages/admin/AdminJobs';
import { AdminEngineers } from '@/pages/admin/AdminEngineers';
import { AdminClients } from '@/pages/admin/AdminClients';
import { AdminTracking } from '@/pages/admin/AdminTracking';
import { AdminReports } from '@/pages/admin/AdminReports';
import { JobDetail } from '@/components/jobs/JobDetail';
import { EngineerHome } from '@/pages/engineer/EngineerHome';
import { EngineerJobs } from '@/pages/engineer/EngineerJobs';
import { EngineerJobDetail } from '@/pages/engineer/EngineerJobDetail';
import { EngineerHistory } from '@/pages/engineer/EngineerHistory';
import { EngineerProfile } from '@/pages/engineer/EngineerProfile';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { session, profile, loading, signOut } = useAuth();
  const [adminPage, setAdminPage] = useState('dashboard');
  const [engPage, setEngPage] = useState('home');
  const [viewingJobId, setViewingJobId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!session || !profile) {
    return <LoginPage />;
  }

  // Admin routing
  if (profile.role === 'admin') {
    if (viewingJobId) {
      return (
        <AdminLayout
          active={adminPage}
          onNavigate={(p) => { setAdminPage(p); setViewingJobId(null); }}
          onSelectJob={(jId) => setViewingJobId(jId)}
        >
          <JobDetail jobId={viewingJobId} onBack={() => setViewingJobId(null)} />
        </AdminLayout>
      );
    }
    return (
      <AdminLayout
        active={adminPage}
        onNavigate={setAdminPage}
        onSelectJob={(jId) => setViewingJobId(jId)}
      >
        {adminPage === 'dashboard' && <AdminDashboard onViewJob={(j) => setViewingJobId(j.id)} />}
        {adminPage === 'jobs' && <AdminJobs onViewJob={(j) => setViewingJobId(j.id)} />}
        {adminPage === 'engineers' && <AdminEngineers onViewJob={(j) => setViewingJobId(j.id)} />}
        {adminPage === 'clients' && <AdminClients />}
        {adminPage === 'tracking' && <AdminTracking />}
        {adminPage === 'reports' && <AdminReports />}
      </AdminLayout>
    );
  }

  // Engineer routing
  if (profile.role === 'engineer') {
    if (!profile.is_active) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4 text-center">
          <p className="text-lg font-semibold text-slate-900">Account Inactive</p>
          <p className="mt-2 text-sm text-slate-600">Your account has been deactivated. Please contact your administrator.</p>
          <button onClick={signOut} className="mt-4 rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700">Sign Out</button>
        </div>
      );
    }

    if (viewingJobId) {
      return (
        <EngineerLayout active={engPage} onNavigate={(p) => { setEngPage(p); setViewingJobId(null); }}>
          <EngineerJobDetail jobId={viewingJobId} onBack={() => setViewingJobId(null)} />
        </EngineerLayout>
      );
    }
    return (
      <EngineerLayout active={engPage} onNavigate={setEngPage}>
        {engPage === 'home' && <EngineerHome onViewJob={(j) => setViewingJobId(j.id)} />}
        {engPage === 'jobs' && <EngineerJobs onViewJob={(j) => setViewingJobId(j.id)} />}
        {engPage === 'history' && <EngineerHistory onViewJob={(j) => setViewingJobId(j.id)} />}
        {engPage === 'profile' && <EngineerProfile />}
      </EngineerLayout>
    );
  }

  return <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
