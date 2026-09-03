import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { LoginPage } from '@/pages/Login';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { EngineerLayout } from '@/components/layout/EngineerLayout';
import { AdminDashboard } from '@/pages/admin/AdminDashboard';
import { AdminJobs } from '@/pages/admin/AdminJobs';
import { AdminEngineers } from '@/pages/admin/AdminEngineers';
import { AdminClients } from '@/pages/admin/AdminClients';
import { AdminVendors } from '@/pages/admin/AdminVendors';
import { AdminTracking } from '@/pages/admin/AdminTracking';
import { AdminReports } from '@/pages/admin/AdminReports';
import { AdminAttendance } from '@/pages/admin/AdminAttendance';
import { AdminCallRequests } from '@/pages/admin/AdminCallRequests';
import { JobDetail } from '@/components/jobs/JobDetail';
import { EngineerHome } from '@/pages/engineer/EngineerHome';
import { EngineerJobs } from '@/pages/engineer/EngineerJobs';
import { EngineerAttendance } from '@/pages/engineer/EngineerAttendance';
import { EngineerJobDetail } from '@/pages/engineer/EngineerJobDetail';
import { EngineerHistory } from '@/pages/engineer/EngineerHistory';
import { EngineerProfile } from '@/pages/engineer/EngineerProfile';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { ClientBookCall } from '@/pages/client/ClientBookCall';
import { ClientCalls } from '@/pages/client/ClientCalls';
import { ClientProfile } from '@/pages/client/ClientProfile';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { SalesDashboard } from '@/pages/sales/SalesDashboard';
import { SalesLeads } from '@/pages/sales/SalesLeads';
import { SalesFollowups } from '@/pages/sales/SalesFollowups';
import { SalesQuotations } from '@/pages/sales/SalesQuotations';
import { AdminLeads } from '@/pages/admin/AdminLeads';
import { AdminLeadsDashboard } from '@/pages/admin/AdminLeadsDashboard';
import { AdminLeadReports } from '@/pages/admin/AdminLeadReports';
import { EngineerLeads } from '@/pages/engineer/EngineerLeads';
import { Loader2 } from 'lucide-react';
import { ToastProvider } from '@/components/ui/Toast';

function AdminJobDetailWrapper() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  if (!id) return <Navigate to="/admin/jobs" replace />;
  return <JobDetail jobId={id} onBack={() => navigate(-1)} />;
}

function EngineerJobDetailWrapper() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  if (!id) return <Navigate to="/engineer/jobs" replace />;
  return <EngineerJobDetail jobId={id} onBack={() => navigate(-1)} />;
}

function AdminLayoutWrapper({ page }: { page: string }) {
  const navigate = useNavigate();
  return (
    <AdminLayout
      active={page}
      onNavigate={(p) => navigate(`/admin/${p}`)}
      onSelectJob={(jId) => navigate(`/admin/jobs/${jId}`)}
    >
      {page === 'dashboard' && <AdminDashboard onViewJob={(j) => navigate(`/admin/jobs/${j.id}`)} />}
      {page === 'requests' && <AdminCallRequests onViewJob={(jId) => navigate(`/admin/jobs/${jId}`)} />}
      {page === 'jobs' && <AdminJobs onViewJob={(j) => navigate(`/admin/jobs/${j.id}`)} />}
      {page === 'engineers' && <AdminEngineers onViewJob={(j) => navigate(`/admin/jobs/${j.id}`)} />}
      {page === 'attendance' && <AdminAttendance />}
      {page === 'clients' && <AdminClients />}
      {page === 'vendors' && <AdminVendors onViewJob={(j) => navigate(`/admin/jobs/${j.id}`)} />}
      {page === 'tracking' && <AdminTracking />}
      {page === 'reports' && <AdminReports onViewJob={(j) => navigate(`/admin/jobs/${j.id}`)} />}
      {page === 'leads' && <AdminLeads onViewJob={(jId) => navigate(`/admin/jobs/${jId}`)} />}
      {page === 'leads-dashboard' && <AdminLeadsDashboard />}
      {page === 'lead-reports' && <AdminLeadReports />}
      {page === 'job-detail' && <AdminJobDetailWrapper />}
    </AdminLayout>
  );
}

function EngineerLayoutWrapper({ page }: { page: string }) {
  const navigate = useNavigate();
  return (
    <EngineerLayout
      active={page}
      onNavigate={(p) => navigate(`/engineer/${p}`)}
    >
      {page === 'home' && <EngineerHome onViewJob={(j) => navigate(`/engineer/jobs/${j.id}`)} />}
      {page === 'jobs' && <EngineerJobs onViewJob={(j) => navigate(`/engineer/jobs/${j.id}`)} />}
      {page === 'attendance' && <EngineerAttendance />}
      {page === 'history' && <EngineerHistory onViewJob={(j) => navigate(`/engineer/jobs/${j.id}`)} />}
      {page === 'leads' && <EngineerLeads />}
      {page === 'profile' && <EngineerProfile />}
      {page === 'job-detail' && <EngineerJobDetailWrapper />}
    </EngineerLayout>
  );
}

function SalesLayoutWrapper({ page }: { page: string }) {
  const navigate = useNavigate();
  return (
    <SalesLayout active={page} onNavigate={(p) => navigate(`/sales/${p}`)}>
      {page === 'dashboard' && <SalesDashboard onNavigate={(p) => navigate(`/sales/${p}`)} />}
      {page === 'leads' && <SalesLeads onNavigateToQuotations={() => navigate('/sales/quotations')} />}
      {page === 'followups' && <SalesFollowups />}
      {page === 'quotations' && <SalesQuotations />}
      {page === 'reports' && <AdminLeadReports />}
      {page === 'profile' && <EngineerProfile />}
    </SalesLayout>
  );
}

function ClientLayoutWrapper({ page }: { page: string }) {
  const navigate = useNavigate();
  return (
    <ClientLayout active={page} onNavigate={(p) => navigate(`/client/${p}`)}>
      {page === 'book' && <ClientBookCall onViewCalls={() => navigate('/client/calls')} />}
      {page === 'calls' && <ClientCalls onBookCall={() => navigate('/client/book')} />}
      {page === 'profile' && <ClientProfile />}
    </ClientLayout>
  );
}

function AppRoutes() {
  const { session, profile, loading, signOut } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!session || !profile) {
    if (location.pathname !== '/login') {
      return <Navigate to="/login" replace />;
    }
    return <LoginPage />;
  }

  // Admin routing
  if (profile.role === 'admin') {
    return (
      <Routes>
        <Route path="/admin/dashboard" element={<AdminLayoutWrapper page="dashboard" />} />
        <Route path="/admin/requests" element={<AdminLayoutWrapper page="requests" />} />
        <Route path="/admin/jobs" element={<AdminLayoutWrapper page="jobs" />} />
        <Route path="/admin/jobs/:id" element={<AdminLayoutWrapper page="job-detail" />} />
        <Route path="/admin/engineers" element={<AdminLayoutWrapper page="engineers" />} />
        <Route path="/admin/attendance" element={<AdminLayoutWrapper page="attendance" />} />
        <Route path="/admin/clients" element={<AdminLayoutWrapper page="clients" />} />
        <Route path="/admin/vendors" element={<AdminLayoutWrapper page="vendors" />} />
        <Route path="/admin/tracking" element={<AdminLayoutWrapper page="tracking" />} />
        <Route path="/admin/reports" element={<AdminLayoutWrapper page="reports" />} />
        <Route path="/admin/leads" element={<AdminLayoutWrapper page="leads" />} />
        <Route path="/admin/leads-dashboard" element={<AdminLayoutWrapper page="leads-dashboard" />} />
        <Route path="/admin/lead-reports" element={<AdminLayoutWrapper page="lead-reports" />} />
        
        {/* Legacy & Root redirects */}
        <Route path="/login" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
      </Routes>
    );
  }

  // Sales Executive routing
  if (profile.role === 'sales_executive') {
    if (!profile.is_active) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4 text-center">
          <p className="text-lg font-semibold text-slate-900">Account Inactive</p>
          <p className="mt-2 text-sm text-slate-600">Your account has been deactivated. Please contact your administrator.</p>
          <button onClick={signOut} className="mt-4 rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700">Sign Out</button>
        </div>
      );
    }

    return (
      <Routes>
        <Route path="/sales/dashboard" element={<SalesLayoutWrapper page="dashboard" />} />
        <Route path="/sales/leads" element={<SalesLayoutWrapper page="leads" />} />
        <Route path="/sales/followups" element={<SalesLayoutWrapper page="followups" />} />
        <Route path="/sales/quotations" element={<SalesLayoutWrapper page="quotations" />} />
        <Route path="/sales/reports" element={<SalesLayoutWrapper page="reports" />} />
        <Route path="/sales/profile" element={<SalesLayoutWrapper page="profile" />} />
        
        {/* Root redirects */}
        <Route path="/login" element={<Navigate to="/sales/dashboard" replace />} />
        <Route path="/sales" element={<Navigate to="/sales/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/sales/dashboard" replace />} />
      </Routes>
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

    return (
      <Routes>
        <Route path="/engineer/home" element={<EngineerLayoutWrapper page="home" />} />
        <Route path="/engineer/jobs" element={<EngineerLayoutWrapper page="jobs" />} />
        <Route path="/engineer/jobs/:id" element={<EngineerLayoutWrapper page="job-detail" />} />
        <Route path="/engineer/leads" element={<EngineerLayoutWrapper page="leads" />} />
        <Route path="/engineer/attendance" element={<EngineerLayoutWrapper page="attendance" />} />
        <Route path="/engineer/history" element={<EngineerLayoutWrapper page="history" />} />
        <Route path="/engineer/profile" element={<EngineerLayoutWrapper page="profile" />} />
        
        {/* Legacy & Root redirects */}
        <Route path="/login" element={<Navigate to="/engineer/home" replace />} />
        <Route path="/engineer" element={<Navigate to="/engineer/home" replace />} />
        <Route path="*" element={<Navigate to="/engineer/home" replace />} />
      </Routes>
    );
  }

  // Client Portal routing
  if (profile.role === 'client') {
    return (
      <Routes>
        <Route path="/client/book" element={<ClientLayoutWrapper page="book" />} />
        <Route path="/client/calls" element={<ClientLayoutWrapper page="calls" />} />
        <Route path="/client/profile" element={<ClientLayoutWrapper page="profile" />} />

        {/* Root & Login Redirects */}
        <Route path="/login" element={<Navigate to="/client/book" replace />} />
        <Route path="/client" element={<Navigate to="/client/book" replace />} />
        <Route path="*" element={<Navigate to="/client/book" replace />} />
      </Routes>
    );
  }

  return <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
