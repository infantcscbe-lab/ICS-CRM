import { useState, useEffect, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { LogOut, Menu, Bell } from 'lucide-react';
import icsLogo from '@/assets/ics-logo.png';
import { AdminSidebar } from './AdminSidebar';
import { NotificationCenterModal } from '@/components/notifications/NotificationCenterModal';
import { getAdminNotifications, getPartitionedNotifications } from '@/lib/notifications';
import { CreateJobModal, type InitialJobData } from '@/components/jobs/CreateJobModal';
import { isServiceCoordinatorRole } from '@/types/database';
import { SmtpConfigModal } from '@/components/common/SmtpConfigModal';
import { BranchSelector } from '@/components/common/BranchSelector';
import { useBranch } from '@/context/BranchContext';
import { matchesBranch } from '@/lib/branches';

interface AdminLayoutProps {
  active: string;
  onNavigate: (page: string) => void;
  onSelectJob?: (jobId: string) => void;
  children: ReactNode;
}

export function AdminLayout({ active, onNavigate, onSelectJob, children }: AdminLayoutProps) {
  const { profile, signOut } = useAuth();
  const isCoordinator = isServiceCoordinatorRole(profile);
  const { currentBranch } = useBranch();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingLeavesCount, setPendingLeavesCount] = useState(0);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [pendingOutstandingCount, setPendingOutstandingCount] = useState(0);
  const [showCreateFromRequest, setShowCreateFromRequest] = useState(false);
  const [createInitialData, setCreateInitialData] = useState<InitialJobData | null>(null);
  const [showSmtpModal, setShowSmtpModal] = useState(false);

  useEffect(() => {
    function updateCounts() {
      const notifs = getAdminNotifications();
      const filteredNotifs = notifs.filter((n) => matchesBranch(n.data?.branch, currentBranch));
      const { unreadCount: count } = getPartitionedNotifications(filteredNotifs);
      setUnreadCount(count);
      const reqCount = filteredNotifs.filter((n) => n.type === 'call_request' && !n.read).length;
      setPendingRequestsCount(reqCount);
    }
    updateCounts();

    async function loadPendingLeaves() {
      try {
        const { count } = await supabase
          .from('leave_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');
        setPendingLeavesCount(count || 0);
      } catch {
        // ignore
      }
    }
    loadPendingLeaves();

    async function loadOutstandingCount() {
      try {
        const { count } = await supabase
          .from('clients')
          .select('*', { count: 'exact', head: true })
          .gt('outstanding_amount', 0);
        setPendingOutstandingCount(count || 0);
      } catch {
        // ignore
      }
    }
    loadOutstandingCount();

    window.addEventListener('ics-notifications-updated', updateCounts);
    window.addEventListener('ics-leaves-updated', loadPendingLeaves);
    window.addEventListener('storage', updateCounts);

    const ch = supabase
      .channel('admin-layout-leaves')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => {
        loadPendingLeaves();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => {
        loadOutstandingCount();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
      window.removeEventListener('ics-notifications-updated', updateCounts);
      window.removeEventListener('ics-leaves-updated', loadPendingLeaves);
      window.removeEventListener('storage', updateCounts);
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Dedicated Modular Sidebar Component */}
      <AdminSidebar
        active={active}
        onNavigate={onNavigate}
        profile={profile}
        isCoordinator={isCoordinator}
        signOut={signOut}
        unreadCount={unreadCount}
        pendingLeavesCount={pendingLeavesCount}
        pendingRequestsCount={pendingRequestsCount}
        pendingOutstandingCount={pendingOutstandingCount}
        setShowNotifications={setShowNotifications}
        setShowSmtpModal={setShowSmtpModal}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      {/* Mobile header */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between bg-slate-900 px-4 py-3 md:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white p-0.5 shadow-sm">
            <img src={icsLogo} alt="ICS Logo" className="h-full w-full object-contain" />
          </div>
          <span className="text-base font-bold text-white">ICS Service Manager</span>
        </div>
        <div className="flex items-center gap-2">
          <BranchSelector />
          <button
            onClick={() => setShowNotifications(true)}
            className="relative rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
            title="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <button onClick={() => setMobileOpen(true)} className="text-white">
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-x-hidden pt-14 md:pt-0">
        <main className="p-4 md:p-6">{children}</main>
      </div>

      {/* Admin Notification Modal */}
      <NotificationCenterModal
        open={showNotifications}
        onClose={() => setShowNotifications(false)}
        onNavigate={onNavigate}
        onSelectJob={(jobId) => {
          if (onSelectJob) onSelectJob(jobId);
        }}
        onRequestCreateJob={(data, notifId) => {
          setCreateInitialData({ ...data, notificationId: notifId });
          setShowCreateFromRequest(true);
        }}
      />

      {/* Review & Create Service Job Modal from Call Request */}
      {showCreateFromRequest && (
        <CreateJobModal
          open={showCreateFromRequest}
          onClose={() => {
            setShowCreateFromRequest(false);
            setCreateInitialData(null);
          }}
          onCreated={() => {
            setShowCreateFromRequest(false);
            setCreateInitialData(null);
            window.dispatchEvent(new Event('ics-jobs-updated'));
            if (active !== 'jobs') onNavigate('jobs');
          }}
          initialData={createInitialData}
        />
      )}
      {/* Smtp Configuration Modal */}
      <SmtpConfigModal
        isOpen={showSmtpModal}
        onClose={() => setShowSmtpModal(false)}
      />
    </div>
  );
}
