import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile, DutyAttendance, LeaveRequest, AttendancePolicyConfig, DutyAttendanceStatus } from '@/types/database';
import {
  CalendarCheck,
  Clock,
  MapPin,
  Plus,
  FileSpreadsheet,
  Settings,
  Calendar,
  Layers,
  Edit,
  Trash2,
  Check,
  X,
  Radio,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  User,
  FileText,
  Printer,
  Download,
  Route,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import {
  fetchAllAttendances,
  fetchAllLeaveRequests,
  fetchAttendancePolicy,
  saveAttendancePolicy,
  manualSaveAttendance,
  deleteAttendanceRecord,
  reviewLeaveRequest,
  buildMonthlyAttendanceMatrix,
  exportMonthlyRegisterCsv,
  exportIndividualAttendanceCsv,
  DEFAULT_ATTENDANCE_POLICY,
} from '@/lib/attendance';
import { formatKm } from '@/lib/distance';
import { useAuth } from '@/hooks/useAuth';

type TabType = 'daily' | 'matrix' | 'person' | 'logs' | 'leaves' | 'policy';

export function AdminAttendance() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('daily');
  const [engineers, setEngineers] = useState<Profile[]>([]);
  const [attendances, setAttendances] = useState<DutyAttendance[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [policy, setPolicy] = useState<AttendancePolicyConfig>(DEFAULT_ATTENDANCE_POLICY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters for Matrix & Logs & Person Report
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth()); // 0-indexed
  const [selectedPersonId, setSelectedPersonId] = useState<string>('');
  const [searchEng, setSearchEng] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterEngId, setFilterEngId] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'custom'>('today');
  const [customStart, setCustomStart] = useState(new Date().toISOString().split('T')[0]);
  const [customEnd, setCustomEnd] = useState(new Date().toISOString().split('T')[0]);

  // Modals
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<{ engineer_id: string; date: string; existing?: DutyAttendance | null } | null>(null);

  // Policy Form State
  const [policyForm, setPolicyForm] = useState<AttendancePolicyConfig>(DEFAULT_ATTENDANCE_POLICY);
  const [policySaving, setPolicySaving] = useState(false);
  const [policySuccess, setPolicySuccess] = useState(false);

  useEffect(() => {
    loadData();

    const handleUpdate = () => { loadData(); };
    window.addEventListener('ics-attendance-updated', handleUpdate);
    window.addEventListener('ics-leaves-updated', handleUpdate);

    const ch = supabase
      .channel('admin-attendance')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duty_attendance' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => loadData())
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
      window.removeEventListener('ics-attendance-updated', handleUpdate);
      window.removeEventListener('ics-leaves-updated', handleUpdate);
    };
  }, []);

  async function loadData(manual = false) {
    if (manual) setRefreshing(true);
    try {
      const [{ data: engData }, attList, leaveList, polData] = await Promise.all([
        supabase.from('profiles').select('*').eq('role', 'engineer').order('full_name'),
        fetchAllAttendances(),
        fetchAllLeaveRequests(),
        fetchAttendancePolicy(),
      ]);

      const engs = (engData as unknown as Profile[]) || [];
      setEngineers(engs);
      setAttendances(attList);
      setLeaves(leaveList);
      setPolicy(polData);
      setPolicyForm(polData);

      if (!selectedPersonId && engs.length > 0) {
        setSelectedPersonId(engs[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      if (manual) setRefreshing(false);
    }
  }

  const today = new Date().toISOString().split('T')[0];

  // Today's attendance list mapped with engineers
  const todayRecords = useMemo(() => {
    return engineers.map((eng) => {
      const att = attendances.find((a) => a.engineer_id === eng.id && a.date === today);
      const leave = leaves.find((l) => l.engineer_id === eng.id && l.status === 'approved' && today >= l.start_date && today <= l.end_date);
      return {
        engineer: eng,
        attendance: att || null,
        leave: leave || null,
      };
    });
  }, [engineers, attendances, leaves, today]);

  // Top metrics
  const stats = useMemo(() => {
    const total = engineers.length;
    let onDuty = 0;
    let punchedOut = 0;
    let late = 0;
    let halfDay = 0;
    let onLeave = 0;
    let absent = 0;
    let totalKm = 0;

    todayRecords.forEach(({ attendance: a, leave }) => {
      if (leave) {
        onLeave++;
      } else if (a) {
        if (a.status === 'on_duty') onDuty++;
        else if (a.status === 'punched_out' || a.status === 'present') punchedOut++;
        else if (a.status === 'late') { late++; onDuty++; }
        else if (a.status === 'half_day') halfDay++;
        else if (a.status === 'on_leave') onLeave++;
        else if (a.status === 'absent') absent++;

        totalKm += a.total_km || 0;
      } else {
        absent++;
      }
    });

    const pendingLeaves = leaves.filter((l) => l.status === 'pending').length;

    return { total, onDuty, punchedOut, late, halfDay, onLeave, absent, totalKm, pendingLeaves };
  }, [engineers, todayRecords, leaves]);

  // Monthly Matrix data
  const monthlyMatrix = useMemo(() => {
    return buildMonthlyAttendanceMatrix(selectedYear, selectedMonth, engineers, attendances, leaves, policy);
  }, [selectedYear, selectedMonth, engineers, attendances, leaves, policy]);

  // Selected Person Data & Breakdown
  const selectedEngineer = useMemo(() => {
    return engineers.find((e) => e.id === selectedPersonId) || engineers[0] || null;
  }, [engineers, selectedPersonId]);

  const personReportData = useMemo(() => {
    if (!selectedEngineer) return null;

    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const monthStr = String(selectedMonth + 1).padStart(2, '0');
    const monthPrefix = `${selectedYear}-${monthStr}`;

    const engAttendances = attendances.filter(
      (a) => a.engineer_id === selectedEngineer.id && a.date.startsWith(monthPrefix)
    );

    const engApprovedLeaves = leaves.filter(
      (l) => l.engineer_id === selectedEngineer.id && l.status === 'approved'
    );

    const joiningDateStr = selectedEngineer.joining_date || (selectedEngineer.created_at ? selectedEngineer.created_at.split('T')[0] : '2000-01-01');

    let presentDays = 0;
    let lateDays = 0;
    let halfDays = 0;
    let absentDays = 0;
    let leaveDays = 0;
    let weeklyOffDays = 0;
    let totalWorkMinutes = 0;
    let totalKm = 0;
    let activeEligibleDays = 0;

    const dayRows = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = String(day).padStart(2, '0');
      const dateString = `${monthPrefix}-${dayStr}`;
      const dateObj = new Date(selectedYear, selectedMonth, day);
      const isSunday = dateObj.getDay() === 0;
      const isPreJoining = dateString < joiningDateStr;

      const att = engAttendances.find((a) => a.date === dateString) || null;
      const leave = engApprovedLeaves.find((l) => dateString >= l.start_date && dateString <= l.end_date) || null;

      let displayStatus: DutyAttendanceStatus | 'not_joined' = 'absent';

      if (isPreJoining) {
        displayStatus = 'not_joined';
      } else if (att) {
        displayStatus = att.status;
        if (att.status === 'present' || att.status === 'on_duty' || att.status === 'punched_out') {
          presentDays++;
        } else if (att.status === 'late') {
          lateDays++;
          presentDays++;
        } else if (att.status === 'half_day') {
          halfDays++;
        } else if (att.status === 'on_leave') {
          leaveDays++;
        } else if (att.status === 'absent') {
          absentDays++;
        } else if (att.status === 'weekly_off') {
          weeklyOffDays++;
        }

        totalWorkMinutes += att.total_work_minutes || 0;
        totalKm += att.total_km || 0;
      } else if (leave) {
        displayStatus = 'on_leave';
        leaveDays++;
      } else if (isSunday) {
        displayStatus = 'weekly_off';
        weeklyOffDays++;
      } else {
        const todayStr = new Date().toISOString().split('T')[0];
        if (dateString < todayStr) {
          absentDays++;
        }
      }

      if (!isPreJoining && !isSunday) {
        activeEligibleDays++;
      }

      dayRows.push({
        day,
        dateString,
        dateObj,
        isSunday,
        isPreJoining,
        attendance: att,
        leave,
        displayStatus,
      });
    }

    const workingDaysCount = Math.max(1, activeEligibleDays);
    const attendancePercentage = Math.round((presentDays / workingDaysCount) * 100);

    return {
      engineer: selectedEngineer,
      joiningDateStr,
      daysInMonth,
      dayRows,
      presentDays,
      lateDays,
      halfDays,
      absentDays,
      leaveDays,
      weeklyOffDays,
      totalWorkMinutes,
      totalHours: (totalWorkMinutes / 60).toFixed(1),
      avgHoursPerDay: presentDays > 0 ? (totalWorkMinutes / 60 / presentDays).toFixed(1) : '0.0',
      totalKm,
      attendancePercentage: Math.min(100, Math.max(0, attendancePercentage)),
    };
  }, [selectedEngineer, selectedYear, selectedMonth, attendances, leaves]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    const start = new Date();
    const end = new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (dateRange === 'week') {
      start.setDate(start.getDate() - 6);
    } else if (dateRange === 'month') {
      start.setDate(1);
    } else if (dateRange === 'custom') {
      start.setTime(new Date(customStart).getTime());
      end.setTime(new Date(customEnd).getTime() + 86400000 - 1);
    }

    return attendances.filter((a) => {
      const aDate = new Date(a.date).getTime();
      if (aDate < start.getTime() || aDate > end.getTime()) return false;
      if (filterEngId !== 'all' && a.engineer_id !== filterEngId) return false;
      if (filterStatus !== 'all' && a.status !== filterStatus) return false;
      return true;
    });
  }, [attendances, dateRange, customStart, customEnd, filterEngId, filterStatus]);

  async function handleSavePolicy(e: React.FormEvent) {
    e.preventDefault();
    setPolicySaving(true);
    setPolicySuccess(false);
    try {
      const updated = await saveAttendancePolicy(policyForm);
      setPolicy(updated);
      setPolicySuccess(true);
      setTimeout(() => setPolicySuccess(false), 3000);
    } catch {
      alert('Failed to save policy');
    } finally {
      setPolicySaving(false);
    }
  }

  async function handleApproveLeave(leaveId: string) {
    if (!profile?.id) return;
    const remarks = prompt('Enter admin remarks (optional):') || 'Approved by Admin';
    await reviewLeaveRequest(leaveId, 'approved', profile.id, remarks);
    loadData();
  }

  async function handleRejectLeave(leaveId: string) {
    if (!profile?.id) return;
    const remarks = prompt('Enter rejection reason:') || 'Declined by Admin';
    await reviewLeaveRequest(leaveId, 'rejected', profile.id, remarks);
    loadData();
  }

  async function handleDeletePunch(id: string) {
    if (!confirm('Are you sure you want to delete this punch record?')) return;
    await deleteAttendanceRecord(id);
    loadData();
  }

  function openAdjust(engineerId: string, date: string, existing?: DutyAttendance | null) {
    setAdjustTarget({ engineer_id: engineerId, date, existing });
    setShowAdjustModal(true);
  }

  function viewPersonReport(engineerId: string) {
    setSelectedPersonId(engineerId);
    setActiveTab('person');
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <Clock className="mx-auto h-8 w-8 animate-spin text-blue-600 mb-2" />
          <p className="text-sm font-medium text-slate-600">Loading Attendance System...</p>
        </div>
      </div>
    );
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">Engineers Attendance & Duty Hub</h1>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
              Enterprise Suite
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time field duty tracking, monthly HR timesheet register, individual person reports & missed punch regularization
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => exportMonthlyRegisterCsv(monthlyMatrix, selectedYear, selectedMonth)}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-800 transition"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Export HR Register (CSV)</span>
          </button>

          <button
            onClick={() => openAdjust(engineers[0]?.id || '', today)}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 transition"
          >
            <Plus className="h-4 w-4" />
            <span>Add / Regularize Punch</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Staff</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{stats.total}</p>
          <p className="mt-1 text-[11px] text-slate-400">Field Engineers</p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">● On Duty (Live)</p>
          <p className="mt-1 text-2xl font-black text-emerald-700">{stats.onDuty}</p>
          <p className="mt-1 text-[11px] text-emerald-600 font-medium">Currently in field</p>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Shift Completed</p>
          <p className="mt-1 text-2xl font-black text-blue-800">{stats.punchedOut}</p>
          <p className="mt-1 text-[11px] text-blue-600">Punched Out</p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Late Punches</p>
          <p className="mt-1 text-2xl font-black text-amber-700">{stats.late}</p>
          <p className="mt-1 text-[11px] text-amber-600">After grace time</p>
        </div>

        <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-purple-700">On Leave / Half</p>
          <p className="mt-1 text-2xl font-black text-purple-800">{stats.onLeave + stats.halfDay}</p>
          <p className="mt-1 text-[11px] text-purple-600">Approved leaves</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Today's Field KM</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{formatKm(stats.totalKm)}</p>
          <p className="mt-1 text-[11px] text-slate-400">Total service run</p>
        </div>
      </div>

      {/* Main Tab Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5 rounded-2xl shadow-sm">
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setActiveTab('daily')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === 'daily'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Radio className="h-4 w-4" />
            <span>Live Daily Board</span>
          </button>

          <button
            onClick={() => setActiveTab('matrix')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === 'matrix'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Calendar className="h-4 w-4" />
            <span>Monthly HR Matrix</span>
          </button>

          <button
            onClick={() => setActiveTab('person')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === 'person'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <User className="h-4 w-4" />
            <span>Individual Person Report</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === 'logs'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Detailed Logs</span>
          </button>

          <button
            onClick={() => setActiveTab('leaves')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === 'leaves'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
            <span>Leaves & Regularization</span>
            {stats.pendingLeaves > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-extrabold text-white">
                {stats.pendingLeaves}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('policy')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === 'policy'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Settings className="h-4 w-4" />
            <span>Shift Policy Settings</span>
          </button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 1: LIVE DAILY BOARD */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'daily' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 px-5 py-3 rounded-2xl text-white">
            <div className="flex items-center gap-2.5">
              <Radio className="h-5 w-5 text-emerald-400 animate-pulse" />
              <div>
                <h3 className="text-sm font-bold">Real-time Engineer Duty Status</h3>
                <p className="text-xs text-slate-300">Live punch status, GPS check-in & active duty duration for {new Date().toDateString()}</p>
              </div>
            </div>
            <div className="text-xs font-medium text-slate-300 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
              Shift Policy: <strong className="text-white">{policy.shift_start_time} - {policy.shift_end_time}</strong> (Grace: {policy.grace_period_minutes}m)
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {todayRecords.map(({ engineer: eng, attendance: att, leave }) => {
              const isOnDuty = att?.status === 'on_duty';
              const isPunchedOut = att?.status === 'punched_out' || att?.status === 'present';
              const isLate = att?.is_late;
              const isLeave = !!leave || att?.status === 'on_leave';
              const isHalfDay = att?.status === 'half_day';

              const punchInTime = att?.punch_in_at
                ? new Date(att.punch_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : null;
              const punchOutTime = att?.punch_out_at
                ? new Date(att.punch_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : null;

              return (
                <div
                  key={eng.id}
                  className={`rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md ${
                    isOnDuty
                      ? 'border-emerald-300 ring-1 ring-emerald-400/20'
                      : isPunchedOut
                      ? 'border-blue-200'
                      : isLeave
                      ? 'border-purple-200 bg-purple-50/20'
                      : isLate
                      ? 'border-amber-300'
                      : 'border-slate-200'
                  }`}
                >
                  {/* Top card header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-white ${
                          isOnDuty
                            ? 'bg-emerald-600'
                            : isPunchedOut
                            ? 'bg-blue-600'
                            : isLeave
                            ? 'bg-purple-600'
                            : isLate
                            ? 'bg-amber-600'
                            : 'bg-slate-400'
                        }`}
                      >
                        {eng.full_name?.charAt(0) || 'E'}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 leading-tight">{eng.full_name}</p>
                        <p className="text-xs font-mono font-semibold text-indigo-700 mt-0.5">
                          {eng.employee_id || `EMP-${eng.id.slice(0, 5).toUpperCase()}`}
                        </p>
                        <p className="text-[11px] text-slate-500">{eng.phone || 'No phone'}</p>
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                        isOnDuty
                          ? 'bg-emerald-100 text-emerald-800 animate-pulse'
                          : isPunchedOut
                          ? 'bg-blue-100 text-blue-800'
                          : isLeave
                          ? 'bg-purple-100 text-purple-800'
                          : isLate
                          ? 'bg-amber-100 text-amber-800'
                          : isHalfDay
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {isOnDuty
                        ? '● ON DUTY'
                        : isPunchedOut
                        ? 'SHIFT DONE'
                        : isLeave
                        ? 'ON LEAVE'
                        : isLate
                        ? 'LATE'
                        : isHalfDay
                        ? 'HALF DAY'
                        : 'ABSENT'}
                    </span>
                  </div>

                  {/* Punch details block */}
                  <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs space-y-2 border border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-blue-600" /> Punch In:
                      </span>
                      <span className="font-bold text-slate-800">
                        {punchInTime ? (
                          <span className={isLate ? 'text-amber-700 font-extrabold' : ''}>
                            {punchInTime} {isLate ? '(Late)' : '(On Time)'}
                          </span>
                        ) : (
                          '—'
                        )}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-slate-400" /> Punch Out:
                      </span>
                      <span className="font-bold text-slate-800">{punchOutTime || 'Active / In-Field'}</span>
                    </div>

                    {att?.punch_in_address && (
                      <div className="flex items-start gap-1 text-[11px] text-slate-600 pt-1 border-t border-slate-200/60">
                        <MapPin className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{att.punch_in_address}</span>
                      </div>
                    )}
                  </div>

                  {/* Field Distance strip */}
                  <div className="mt-3 rounded-lg bg-indigo-50/70 p-2.5 text-center border border-indigo-100">
                    <p className="text-[10px] uppercase font-bold text-indigo-700">Field Distance Run</p>
                    <p className="text-sm font-bold text-indigo-900 mt-0.5">{formatKm(att?.total_km || 0)}</p>
                  </div>

                  {/* Card footer actions */}
                  <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                    <button
                      onClick={() => viewPersonReport(eng.id)}
                      className="flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-800 transition hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>View Report</span>
                    </button>

                    <button
                      onClick={() => openAdjust(eng.id, today, att)}
                      className="flex items-center gap-1 font-bold text-blue-600 hover:text-blue-800 transition hover:underline"
                    >
                      <Edit className="h-3.5 w-3.5" />
                      <span>{att ? 'Edit Punch' : 'Mark Attendance'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 2: MONTHLY ATTENDANCE REGISTER MATRIX */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'matrix' && (
        <div className="space-y-4">
          {/* Month & Search Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <CalendarCheck className="h-5 w-5 text-blue-600" />
                <span className="text-sm font-bold text-slate-800">Select Month:</span>
              </div>
              <select
                id="att-month-select"
                aria-label="Attendance Month Select"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-500"
              >
                {monthNames.map((m, idx) => (
                  <option key={idx} value={idx}>
                    {m}
                  </option>
                ))}
              </select>

              <select
                id="att-year-select"
                aria-label="Attendance Year Select"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-500"
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {/* Legend guide */}
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
              <span className="flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-600"></span> P = Present
              </span>
              <span className="flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-amber-800">
                <span className="h-2 w-2 rounded-full bg-amber-600"></span> L = Late
              </span>
              <span className="flex items-center gap-1 rounded bg-orange-100 px-2 py-0.5 text-orange-800">
                <span className="h-2 w-2 rounded-full bg-orange-600"></span> HD = Half Day
              </span>
              <span className="flex items-center gap-1 rounded bg-purple-100 px-2 py-0.5 text-purple-800">
                <span className="h-2 w-2 rounded-full bg-purple-600"></span> LV = Leave
              </span>
              <span className="flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-red-800">
                <span className="h-2 w-2 rounded-full bg-red-600"></span> A = Absent
              </span>
              <span className="flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-slate-600">
                WO = Weekly Off
              </span>
            </div>
          </div>

          {/* HR Matrix Grid Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-white font-bold uppercase tracking-wider">
                <tr>
                  <th className="sticky left-0 z-20 bg-slate-900 px-3 py-3 w-24">Emp ID</th>
                  <th className="sticky left-24 z-20 bg-slate-900 px-3 py-3 w-40 border-r border-slate-700">Engineer</th>
                  {Array.from({ length: new Date(selectedYear, selectedMonth + 1, 0).getDate() }, (_, i) => {
                    const day = i + 1;
                    const dateObj = new Date(selectedYear, selectedMonth, day);
                    const isSun = dateObj.getDay() === 0;
                    return (
                      <th
                        key={day}
                        className={`px-1.5 py-2.5 text-center min-w-[28px] border-r border-slate-800 ${
                          isSun ? 'bg-slate-800 text-amber-300' : ''
                        }`}
                        title={`${dateObj.toLocaleDateString('en-US', { weekday: 'short' })}`}
                      >
                        <div>{day}</div>
                        <div className="text-[9px] font-normal opacity-70">
                          {dateObj.toLocaleDateString('en-US', { weekday: 'narrow' })}
                        </div>
                      </th>
                    );
                  })}
                  <th className="px-3 py-3 text-center bg-slate-950">Present</th>
                  <th className="px-3 py-3 text-center bg-slate-950">Late</th>
                  <th className="px-3 py-3 text-center bg-slate-950">HD</th>
                  <th className="px-3 py-3 text-center bg-slate-950">Leaves</th>
                  <th className="px-3 py-3 text-center bg-slate-950">Absent</th>
                  <th className="px-3 py-3 text-center bg-slate-950">Hours</th>
                  <th className="px-3 py-3 text-center bg-slate-950">KM</th>
                  <th className="px-3 py-3 text-center bg-slate-950">Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {monthlyMatrix.length === 0 ? (
                  <tr>
                    <td colSpan={40} className="py-8 text-center text-slate-400">
                      No engineers registered yet.
                    </td>
                  </tr>
                ) : (
                  monthlyMatrix
                    .filter((row) =>
                      !searchEng ||
                      row.engineer.full_name.toLowerCase().includes(searchEng.toLowerCase()) ||
                      (row.engineer.employee_id || '').toLowerCase().includes(searchEng.toLowerCase())
                    )
                    .map((row) => {
                      const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
                      return (
                        <tr key={row.engineer.id} className="hover:bg-slate-50/80 transition">
                          <td className="sticky left-0 z-10 bg-white px-3 py-2.5 font-mono text-[11px] font-bold text-indigo-700">
                            {row.engineer.employee_id || `EMP-${row.engineer.id.slice(0, 5).toUpperCase()}`}
                          </td>
                          <td
                            onClick={() => viewPersonReport(row.engineer.id)}
                            className="sticky left-24 z-10 bg-white px-3 py-2.5 font-bold text-slate-900 border-r border-slate-200 cursor-pointer hover:text-blue-600 hover:underline"
                          >
                            {row.engineer.full_name}
                          </td>

                          {/* Day Columns */}
                          {Array.from({ length: daysInMonth }, (_, i) => {
                            const day = i + 1;
                            const att = row.daysMap[day];
                            const dateObj = new Date(selectedYear, selectedMonth, day);
                            const isSun = dateObj.getDay() === 0;
                            const dayStr = String(day).padStart(2, '0');
                            const monthStr = String(selectedMonth + 1).padStart(2, '0');
                            const dateString = `${selectedYear}-${monthStr}-${dayStr}`;
                            const engJoinDate = row.engineer.joining_date || (row.engineer.created_at ? row.engineer.created_at.split('T')[0] : '2000-01-01');
                            const isPreJoining = dateString < engJoinDate;

                            let label = '-';
                            let cellBg = 'bg-transparent text-slate-300';

                            if (isPreJoining) {
                              label = '-';
                              cellBg = 'bg-transparent text-slate-300 opacity-40';
                            } else if (att) {
                              if (att.status === 'present' || att.status === 'punched_out') {
                                label = 'P';
                                cellBg = 'bg-emerald-500 text-white font-bold';
                              } else if (att.status === 'on_duty') {
                                label = 'OD';
                                cellBg = 'bg-emerald-600 text-white font-bold animate-pulse';
                              } else if (att.status === 'late') {
                                label = 'L';
                                cellBg = 'bg-amber-500 text-white font-bold';
                              } else if (att.status === 'half_day') {
                                label = 'HD';
                                cellBg = 'bg-orange-500 text-white font-bold';
                              } else if (att.status === 'on_leave') {
                                label = 'LV';
                                cellBg = 'bg-purple-600 text-white font-bold';
                              } else if (att.status === 'absent') {
                                label = 'A';
                                cellBg = 'bg-red-500 text-white font-bold';
                              } else if (att.status === 'weekly_off') {
                                label = 'WO';
                                cellBg = 'bg-slate-100 text-slate-500';
                              }
                            } else if (isSun) {
                              label = 'WO';
                              cellBg = 'bg-slate-100 text-slate-400';
                            } else {
                              const todayStr = new Date().toISOString().split('T')[0];
                              if (dateString < todayStr) {
                                label = 'A';
                                cellBg = 'bg-red-100 text-red-700 font-semibold';
                              }
                            }

                            return (
                              <td
                                key={day}
                                onClick={() => !isPreJoining && openAdjust(row.engineer.id, dateString, att)}
                                className={`px-1 py-2 text-center border-r border-slate-100 transition ${
                                  isPreJoining ? 'cursor-default' : 'cursor-pointer hover:opacity-80'
                                } ${isSun ? 'bg-amber-50/20' : ''}`}
                                title={
                                  isPreJoining
                                    ? `${row.engineer.full_name} - ${dateString}: Pre-Joining (Joined on ${engJoinDate})`
                                    : `${row.engineer.full_name} - ${dateString}: ${label} (Click to edit)`
                                }
                              >
                                <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${cellBg}`}>
                                  {label}
                                </span>
                              </td>
                            );
                          })}

                          {/* Summary columns */}
                          <td className="px-2 py-2 text-center font-bold text-emerald-700 bg-slate-50/50">
                            {row.presentDays}
                          </td>
                          <td className="px-2 py-2 text-center font-bold text-amber-700 bg-slate-50/50">
                            {row.lateDays}
                          </td>
                          <td className="px-2 py-2 text-center font-bold text-orange-700 bg-slate-50/50">
                            {row.halfDays}
                          </td>
                          <td className="px-2 py-2 text-center font-bold text-purple-700 bg-slate-50/50">
                            {row.leaveDays}
                          </td>
                          <td className="px-2 py-2 text-center font-bold text-red-600 bg-slate-50/50">
                            {row.absentDays}
                          </td>
                          <td className="px-2 py-2 text-center font-mono font-bold text-slate-800 bg-slate-50/50">
                            {(row.totalWorkingMinutes / 60).toFixed(1)}h
                          </td>
                          <td className="px-2 py-2 text-center font-bold text-slate-800 bg-slate-50/50">
                            {formatKm(row.totalKm)}
                          </td>
                          <td className="px-2 py-2 text-center bg-slate-50/50">
                            <button
                              onClick={() => viewPersonReport(row.engineer.id)}
                              className="rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100"
                            >
                              Report
                            </button>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 3: INDIVIDUAL PERSON REPORT */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'person' && (
        <div className="space-y-5">
          {/* Person Selector & Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-indigo-600" />
                <span className="text-sm font-bold text-slate-800">Select Engineer:</span>
              </div>

              <select
                value={selectedPersonId}
                onChange={(e) => setSelectedPersonId(e.target.value)}
                className="rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 shadow-sm"
              >
                {engineers.map((eng) => (
                  <option key={eng.id} value={eng.id}>
                    {eng.full_name} ({eng.employee_id || 'EMP'})
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                <span className="text-xs font-bold text-slate-500">Period:</span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 outline-none"
                >
                  {monthNames.map((m, idx) => (
                    <option key={idx} value={idx}>
                      {m}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 outline-none"
                >
                  {[2024, 2025, 2026, 2027].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Export & Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (selectedEngineer) {
                    exportIndividualAttendanceCsv(selectedEngineer, selectedYear, selectedMonth, attendances, leaves, policy);
                  }
                }}
                className="flex items-center gap-1.5 rounded-xl bg-indigo-700 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-800 transition"
              >
                <Download className="h-4 w-4" />
                <span>Export {selectedEngineer?.full_name?.split(' ')[0] || 'Person'} CSV</span>
              </button>

              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition"
              >
                <Printer className="h-4 w-4 text-slate-500" />
                <span>Print Report</span>
              </button>
            </div>
          </div>

          {/* Engineer Profile & Performance Header */}
          {personReportData && selectedEngineer && (
            <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white shadow-xl relative overflow-hidden">
              <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-2xl font-black text-white shadow-lg shadow-indigo-600/40">
                    {selectedEngineer.full_name?.charAt(0) || 'E'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-indigo-500/30 px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-300 border border-indigo-400/30">
                        {selectedEngineer.employee_id || `EMP-${selectedEngineer.id.slice(0, 5).toUpperCase()}`}
                      </span>
                      <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                        Active Engineer
                      </span>
                      <span className="rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[10px] font-bold text-blue-200 border border-blue-400/30">
                        Joined: {personReportData.joiningDateStr}
                      </span>
                    </div>
                    <h2 className="mt-1 text-2xl font-black text-white">{selectedEngineer.full_name}</h2>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Phone: <span className="font-semibold text-white">{selectedEngineer.phone || '—'}</span> • Email: <span className="text-slate-300">{selectedEngineer.email || '—'}</span>
                    </p>
                  </div>
                </div>

                {/* Score badge & timing */}
                <div className="flex flex-wrap items-center gap-4 text-right">
                  <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-sm border border-white/15 text-center min-w-[120px]">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-300">Attendance Rate</p>
                    <p className="text-2xl font-black text-emerald-400 mt-0.5">{personReportData.attendancePercentage}%</p>
                    <p className="text-[10px] text-slate-400">for {monthNames[selectedMonth]}</p>
                  </div>

                  <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-sm border border-white/15 text-center min-w-[120px]">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-300">Total Hours</p>
                    <p className="text-2xl font-black text-indigo-300 mt-0.5">{personReportData.totalHours}h</p>
                    <p className="text-[10px] text-slate-400">Avg {personReportData.avgHoursPerDay}h / day</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Person Performance Metrics KPI Grid */}
          {personReportData && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase text-emerald-700">Days Present</p>
                <p className="mt-1 text-2xl font-black text-emerald-800">{personReportData.presentDays}</p>
                <p className="mt-1 text-[11px] text-emerald-600 font-medium">Full & active shifts</p>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase text-amber-700">Late Punches</p>
                <p className="mt-1 text-2xl font-black text-amber-800">{personReportData.lateDays}</p>
                <p className="mt-1 text-[11px] text-amber-600">After grace threshold</p>
              </div>

              <div className="rounded-2xl border border-orange-200 bg-orange-50/50 p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase text-orange-700">Half Days</p>
                <p className="mt-1 text-2xl font-black text-orange-800">{personReportData.halfDays}</p>
                <p className="mt-1 text-[11px] text-orange-600">&lt; {policy.half_day_min_hours}h duration</p>
              </div>

              <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase text-purple-700">Approved Leaves</p>
                <p className="mt-1 text-2xl font-black text-purple-800">{personReportData.leaveDays}</p>
                <p className="mt-1 text-[11px] text-purple-600">Casual / Sick leaves</p>
              </div>

              <div className="rounded-2xl border border-red-200 bg-red-50/50 p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase text-red-700">Absent Days</p>
                <p className="mt-1 text-2xl font-black text-red-800">{personReportData.absentDays}</p>
                <p className="mt-1 text-[11px] text-red-600">Unpunched days</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase text-slate-500">Field KM Run</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{formatKm(personReportData.totalKm)}</p>
                <p className="mt-1 text-[11px] text-slate-400">Total travel in month</p>
              </div>
            </div>
          )}

          {/* Day-by-Day Detailed Timesheet Table for Selected Person */}
          {personReportData && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-3.5 text-white">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-blue-400" />
                  <h3 className="text-sm font-bold">
                    Day-by-Day Attendance Timesheet — {monthNames[selectedMonth]} {selectedYear}
                  </h3>
                </div>
                <span className="text-xs text-slate-300">
                  Engineer: <strong>{selectedEngineer?.full_name}</strong>
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Date & Day</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Punch In</th>
                      <th className="px-4 py-3">Punch Out</th>
                      <th className="px-4 py-3">Work Duration</th>
                      <th className="px-4 py-3">Field KM</th>
                      <th className="px-4 py-3">Notes & Reason</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {personReportData.dayRows.map((row) => {
                      const dayName = row.dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                      const punchInTime = row.attendance?.punch_in_at
                        ? new Date(row.attendance.punch_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : null;
                      const punchOutTime = row.attendance?.punch_out_at
                        ? new Date(row.attendance.punch_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : null;

                      let statusBadge = (
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600">
                          -
                        </span>
                      );

                      if (row.isPreJoining) {
                        statusBadge = (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-400">
                            Pre-Joining
                          </span>
                        );
                      } else if (row.attendance) {
                        if (row.attendance.status === 'present' || row.attendance.status === 'punched_out') {
                          statusBadge = <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">Present</span>;
                        } else if (row.attendance.status === 'on_duty') {
                          statusBadge = <span className="rounded-full bg-emerald-500 text-white px-2.5 py-0.5 text-[10px] font-bold animate-pulse">● On Duty</span>;
                        } else if (row.attendance.status === 'late') {
                          statusBadge = <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">Late Arrival</span>;
                        } else if (row.attendance.status === 'half_day') {
                          statusBadge = <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-[10px] font-bold text-orange-800">Half Day</span>;
                        } else if (row.attendance.status === 'on_leave') {
                          statusBadge = <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-bold text-purple-800">On Leave</span>;
                        } else if (row.attendance.status === 'absent') {
                          statusBadge = <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-bold text-red-800">Absent</span>;
                        }
                      } else if (row.leave) {
                        statusBadge = (
                          <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-bold text-purple-800">
                            Leave ({row.leave.leave_type})
                          </span>
                        );
                      } else if (row.isSunday) {
                        statusBadge = <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500">Weekly Off</span>;
                      } else {
                        const todayStr = new Date().toISOString().split('T')[0];
                        if (row.dateString < todayStr) {
                          statusBadge = <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-bold text-red-800">Absent</span>;
                        }
                      }

                      return (
                        <tr
                          key={row.day}
                          className={`hover:bg-slate-50 transition ${row.isSunday ? 'bg-slate-50/50' : ''}`}
                        >
                          {/* Date & Day */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">{row.dateString}</span>
                              <span className={`text-[11px] font-semibold ${row.isSunday ? 'text-amber-600' : 'text-slate-400'}`}>
                                ({dayName})
                              </span>
                            </div>
                          </td>

                          {/* Status Badge */}
                          <td className="px-4 py-3">{statusBadge}</td>

                          {/* Punch In */}
                          <td className="px-4 py-3">
                            {punchInTime ? (
                              <div>
                                <p className="font-bold text-slate-800">{punchInTime}</p>
                                <p className="text-[11px] text-slate-500 line-clamp-1 max-w-[160px]">
                                  {row.attendance?.punch_in_address || 'Field Location'}
                                </p>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {/* Punch Out */}
                          <td className="px-4 py-3">
                            {punchOutTime ? (
                              <div>
                                <p className="font-bold text-slate-800">{punchOutTime}</p>
                                <p className="text-[11px] text-slate-500 line-clamp-1 max-w-[160px]">
                                  {row.attendance?.punch_out_address || 'Field Location'}
                                </p>
                              </div>
                            ) : row.attendance?.status === 'on_duty' ? (
                              <span className="font-semibold text-emerald-600">Active in Field</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {/* Work Duration */}
                          <td className="px-4 py-3 font-mono font-bold text-slate-800">
                            {row.attendance?.total_work_minutes
                              ? `${Math.floor(row.attendance.total_work_minutes / 60)}h ${row.attendance.total_work_minutes % 60}m`
                              : row.attendance?.status === 'on_duty'
                              ? 'Active'
                              : '—'}
                          </td>

                          {/* Field KM */}
                          <td className="px-4 py-3 font-bold text-slate-800">
                            {row.attendance?.total_km ? formatKm(row.attendance.total_km) : '0.0 KM'}
                          </td>

                          {/* Notes / Reason */}
                          <td className="px-4 py-3 text-slate-600 text-[11px]">
                            {row.leave ? (
                              <span className="italic text-purple-700">Reason: {row.leave.reason}</span>
                            ) : row.attendance?.regularized_reason || row.attendance?.admin_notes ? (
                              <span className="text-slate-700 font-medium">
                                {row.attendance.regularized_reason || row.attendance.admin_notes}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => openAdjust(selectedEngineer.id, row.dateString, row.attendance)}
                              className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50 transition"
                              title="Edit / Regularize"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 4: DETAILED PUNCH AUDIT LOGS */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          {/* Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
                {(['today', 'week', 'month', 'custom'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setDateRange(r)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition ${
                      dateRange === r ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              {dateRange === 'custom' && (
                <div className="flex items-center gap-2 text-xs">
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5"
                  />
                  <span>to</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5"
                  />
                </div>
              )}

              <select
                value={filterEngId}
                onChange={(e) => setFilterEngId(e.target.value)}
                className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 outline-none"
              >
                <option value="all">All Engineers</option>
                {engineers.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="on_duty">On Duty</option>
                <option value="punched_out">Punched Out</option>
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="half_day">Half Day</option>
                <option value="on_leave">On Leave</option>
                <option value="absent">Absent</option>
              </select>
            </div>

            <div className="text-xs font-bold text-slate-500">
              Showing {filteredLogs.length} punch records
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5">Date</th>
                  <th className="px-4 py-3.5">Engineer</th>
                  <th className="px-4 py-3.5">Punch In</th>
                  <th className="px-4 py-3.5">Punch Out</th>
                  <th className="px-4 py-3.5">Duration</th>
                  <th className="px-4 py-3.5">Field KM</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No punch records match selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((att) => {
                    const eng = engineers.find((e) => e.id === att.engineer_id);
                    return (
                      <tr key={att.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-bold text-slate-900">{att.date}</td>
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-900">{eng?.full_name || 'Engineer'}</p>
                          <p className="text-[11px] font-mono text-indigo-700">
                            {eng?.employee_id || `EMP-${(att.engineer_id || '').slice(0, 5).toUpperCase()}`}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-800">
                            {new Date(att.punch_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="text-[11px] text-slate-500 line-clamp-1 max-w-xs">{att.punch_in_address || 'Field'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-800">
                            {att.punch_out_at
                              ? new Date(att.punch_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              : '—'}
                          </p>
                          <p className="text-[11px] text-slate-500 line-clamp-1 max-w-xs">{att.punch_out_address || '—'}</p>
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-slate-700">
                          {att.total_work_minutes
                            ? `${Math.floor(att.total_work_minutes / 60)}h ${att.total_work_minutes % 60}m`
                            : att.status === 'on_duty'
                            ? 'Active Duty'
                            : '—'}
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-800">{formatKm(att.total_km || 0)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                              att.status === 'on_duty'
                                ? 'bg-emerald-100 text-emerald-800'
                                : att.status === 'late'
                                ? 'bg-amber-100 text-amber-800'
                                : att.status === 'half_day'
                                ? 'bg-orange-100 text-orange-800'
                                : att.status === 'on_leave'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {att.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openAdjust(att.engineer_id, att.date, att)}
                              className="rounded p-1.5 text-blue-600 hover:bg-blue-50"
                              title="Edit Punch"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeletePunch(att.id)}
                              className="rounded p-1.5 text-red-600 hover:bg-red-50"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 5: LEAVE & REGULARIZATION REQUESTS */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'leaves' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-900 px-5 py-4 rounded-2xl text-white">
            <div>
              <h3 className="text-sm font-bold">Engineer Leave & Regularization Requests</h3>
              <p className="text-xs text-slate-300">
                Review and approve leave applications, emergency leaves, and missed punch adjustments
              </p>
            </div>
            <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold">
              {leaves.filter((l) => l.status === 'pending').length} Pending Requests
            </span>
          </div>

          <div className="space-y-3">
            {leaves.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-400">
                <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-slate-300" />
                <p className="font-semibold text-slate-600">No leave requests submitted</p>
                <p className="text-xs text-slate-400 mt-1">Engineers can apply for leaves or punch regularizations from their app</p>
              </div>
            ) : (
              leaves.map((leave) => {
                const eng = engineers.find((e) => e.id === leave.engineer_id) || leave.engineer;
                const isPending = leave.status === 'pending';

                return (
                  <div
                    key={leave.id}
                    className={`rounded-2xl border bg-white p-5 shadow-sm transition ${
                      isPending ? 'border-amber-300 ring-1 ring-amber-300/20' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700 font-bold">
                          {eng?.full_name?.charAt(0) || 'E'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-slate-900">{eng?.full_name || 'Engineer'}</h4>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                              {eng?.employee_id || `EMP-${leave.engineer_id.slice(0, 5).toUpperCase()}`}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Applied on: {new Date(leave.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${
                            leave.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : leave.status === 'rejected'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {leave.status}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3 rounded-xl bg-slate-50 p-3 text-xs border border-slate-100">
                      <div>
                        <span className="text-slate-500 font-semibold">Type:</span>
                        <p className="font-bold uppercase text-indigo-700 mt-0.5">{leave.leave_type}</p>
                      </div>
                      <div>
                        <span className="text-slate-500 font-semibold">Duration:</span>
                        <p className="font-bold text-slate-800 mt-0.5">
                          {leave.start_date} {leave.start_date !== leave.end_date ? `to ${leave.end_date}` : ''} ({leave.total_days} {leave.total_days === 1 ? 'day' : 'days'})
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500 font-semibold">Reason:</span>
                        <p className="font-medium text-slate-800 mt-0.5 italic">"{leave.reason}"</p>
                      </div>
                    </div>

                    {leave.admin_remarks && (
                      <p className="mt-2 text-xs text-slate-600 bg-blue-50 p-2 rounded-lg border border-blue-100">
                        <strong>Admin Remarks:</strong> {leave.admin_remarks}
                      </p>
                    )}

                    {isPending && (
                      <div className="mt-4 flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                        <button
                          onClick={() => handleRejectLeave(leave.id)}
                          className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 transition"
                        >
                          <X className="h-4 w-4" /> Reject
                        </button>
                        <button
                          onClick={() => handleApproveLeave(leave.id)}
                          className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-sm"
                        >
                          <Check className="h-4 w-4" /> Approve & Update Register
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 6: SHIFT & POLICY CONFIGURATION */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'policy' && (
        <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 border-b border-slate-100 pb-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Settings className="h-5 w-5 text-blue-600" /> Attendance Policy & Shift Settings
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Configure standard work shift timings, late grace thresholds, and half-day cutoffs
            </p>
          </div>

          {policySuccess && (
            <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800 border border-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Attendance Policy updated successfully! All future punches will adhere to this policy.
            </div>
          )}

          <form onSubmit={handleSavePolicy} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Shift Start Time</label>
                <input
                  type="time"
                  value={policyForm.shift_start_time}
                  onChange={(e) => setPolicyForm({ ...policyForm, shift_start_time: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-sm font-semibold outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Shift End Time</label>
                <input
                  type="time"
                  value={policyForm.shift_end_time}
                  onChange={(e) => setPolicyForm({ ...policyForm, shift_end_time: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-sm font-semibold outline-none focus:border-blue-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Late Grace Period (Minutes)</label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={policyForm.grace_period_minutes}
                  onChange={(e) => setPolicyForm({ ...policyForm, grace_period_minutes: Number(e.target.value) })}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-sm font-semibold outline-none focus:border-blue-500"
                  required
                />
                <span className="text-[10px] text-slate-400">Punches after this are flagged as 'Late'</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Half Day Minimum Hours</label>
                <input
                  type="number"
                  step="0.5"
                  min={1}
                  max={8}
                  value={policyForm.half_day_min_hours}
                  onChange={(e) => setPolicyForm({ ...policyForm, half_day_min_hours: Number(e.target.value) })}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-sm font-semibold outline-none focus:border-blue-500"
                  required
                />
                <span className="text-[10px] text-slate-400">Hours below this count as Half-Day</span>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={policySaving}
                className="rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-700 transition disabled:opacity-50"
              >
                {policySaving ? 'Saving Policy...' : 'Save Shift Policy'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MANUAL PUNCH / REGULARIZATION MODAL */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showAdjustModal && adjustTarget && (
        <ManualAdjustModal
          engineers={engineers}
          target={adjustTarget}
          policy={policy}
          onClose={() => setShowAdjustModal(false)}
          onSaved={() => {
            setShowAdjustModal(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}

// ─── Manual Adjust / Regularize Modal Component ───

function ManualAdjustModal({
  engineers,
  target,
  policy,
  onClose,
  onSaved,
}: {
  engineers: Profile[];
  target: { engineer_id: string; date: string; existing?: DutyAttendance | null };
  policy: AttendancePolicyConfig;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [engId, setEngId] = useState(target.engineer_id);
  const [date, setDate] = useState(target.date);
  const [status, setStatus] = useState<DutyAttendanceStatus>(target.existing?.status || 'present');
  const [inTime, setInTime] = useState(() => {
    if (target.existing?.punch_in_at) {
      return new Date(target.existing.punch_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    return policy.shift_start_time;
  });
  const [outTime, setOutTime] = useState(() => {
    if (target.existing?.punch_out_at) {
      return new Date(target.existing.punch_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    return policy.shift_end_time;
  });
  const [totalKm, setTotalKm] = useState(target.existing?.total_km || 0);
  const [reason, setReason] = useState(target.existing?.regularized_reason || 'Admin manual entry');
  const [notes, setNotes] = useState(target.existing?.admin_notes || '');
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const punchInIso = inTime ? `${date}T${inTime}:00.000Z` : `${date}T${policy.shift_start_time}:00.000Z`;
      const punchOutIso = outTime ? `${date}T${outTime}:00.000Z` : null;

      await manualSaveAttendance({
        id: target.existing?.id,
        engineer_id: engId,
        date,
        punch_in_at: punchInIso,
        punch_out_at: punchOutIso,
        total_km: Number(totalKm),
        status,
        regularized_reason: reason,
        admin_notes: notes,
      });

      onSaved();
    } catch {
      alert('Failed to save manual punch');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {target.existing ? 'Edit / Regularize Attendance Record' : 'Manual Punch & Attendance Entry'}
            </h3>
            <p className="text-xs text-slate-500">Correct missed punches, update status, and add admin remarks</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Engineer</label>
              <select
                value={engId}
                onChange={(e) => setEngId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2 text-xs font-bold text-slate-800 outline-none"
              >
                {engineers.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name} ({e.employee_id || 'EMP'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2 text-xs font-bold outline-none"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Attendance Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as DutyAttendanceStatus)}
                className="w-full rounded-xl border border-slate-300 p-2 text-xs font-bold text-slate-800 outline-none"
              >
                <option value="present">Present (Full Day)</option>
                <option value="on_duty">On Duty (Active)</option>
                <option value="punched_out">Punched Out (Shift Done)</option>
                <option value="late">Late Arrival</option>
                <option value="half_day">Half Day</option>
                <option value="on_leave">On Leave</option>
                <option value="absent">Absent</option>
                <option value="weekly_off">Weekly Off</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Field KM Covered</label>
              <input
                type="number"
                step="0.1"
                min={0}
                value={totalKm}
                onChange={(e) => setTotalKm(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 p-2 text-xs font-bold outline-none"
              />
            </div>
          </div>

          {status !== 'absent' && status !== 'on_leave' && status !== 'weekly_off' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Punch In Time</label>
                <input
                  type="time"
                  value={inTime}
                  onChange={(e) => setInTime(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2 text-xs font-bold outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Punch Out Time</label>
                <input
                  type="time"
                  value={outTime}
                  onChange={(e) => setOutTime(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2 text-xs font-bold outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Regularization Reason</label>
            <input
              type="text"
              placeholder="e.g. Forgot punch-out at client site / Manager approved"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-2 text-xs font-medium outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Admin Notes</label>
            <textarea
              rows={2}
              placeholder="Internal remarks regarding this record..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-2 text-xs outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save & Update Register'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
