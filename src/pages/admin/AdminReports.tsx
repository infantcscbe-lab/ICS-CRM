import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { ServiceJob, Profile, Client, Vendor, DutyAttendance, LeaveRequest } from '@/types/database';
import {
  Download,
  BarChart3,
  FileText,
  Car,
  Clock,
  MapPin,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Phone,
  User,
  Filter,
  ArrowUpDown,
  ExternalLink,
  Printer,
  TrendingUp,
  AlertTriangle,
  Store,
  Building2,
  Navigation,
  IndianRupee,
  Fuel,
  FileSpreadsheet,
  Layers,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { formatKm, formatDuration } from '@/lib/distance';
import { downloadCallReportPdf } from '@/lib/emailReport';
import { StatusBadge } from '@/components/ui/Badges';
import { VendorHandoverReportView } from '@/components/vendors/VendorHandoverReportView';
import { extractReturnOfficeRecords, type ReturnOfficeRecord } from '@/lib/returnToOffice';
import {
  fetchAllAttendances,
  fetchAllLeaveRequests,
  buildMonthlyAttendanceMatrix,
  DEFAULT_ATTENDANCE_POLICY,
  isPunchLate,
  PETROL_RATE_PER_KM,
} from '@/lib/attendance';
import {
  getTamilNaduHoliday,
  isSundayWeekOff,
  type TamilNaduHoliday,
} from '@/lib/tamilNaduHolidays';
import { useBranch } from '@/context/BranchContext';
import { matchesBranch, getJobBranch, getProfileBranch, getClientBranch, BRANCHES } from '@/lib/branches';
import jsPDF from 'jspdf';

type DateRange = 'today' | 'yesterday' | 'week' | 'month' | 'custom';
type ActiveReportTab =
  | 'daily_calls'
  | 'weekly_calls'
  | 'monthly_call_attendance'
  | 'petrol_convenience'
  | 'return_to_office'
  | 'vendor_handover';

interface AdminReportsProps {
  onViewJob?: (job: ServiceJob) => void;
}

export function AdminReports({ onViewJob }: AdminReportsProps) {
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [engineers, setEngineers] = useState<Profile[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [attendances, setAttendances] = useState<DutyAttendance[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveReportTab>('daily_calls');

  // Filters
  const [range, setRange] = useState<DateRange>('today');
  const [customStart, setCustomStart] = useState(new Date().toISOString().split('T')[0]);
  const [customEnd, setCustomEnd] = useState(new Date().toISOString().split('T')[0]);
  const [engFilter, setEngFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [callTypeFilter, setCallTypeFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'direct' | 'online'>('all');

  // Specific Date / Month / Week Selectors
  const [selectedDayDate, setSelectedDayDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedWeeklyMode, setSelectedWeeklyMode] = useState<'current_7' | 'this_week' | 'prev_week'>('current_7');

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [{ data: jData }, { data: eData }, { data: cData }, { data: vData }, attData, leavesData] = await Promise.all([
        supabase.from('service_jobs').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').eq('role', 'engineer').order('full_name'),
        supabase.from('clients').select('*').order('client_name'),
        supabase.from('vendors').select('*').eq('is_active', true).order('vendor_name'),
        fetchAllAttendances(),
        fetchAllLeaveRequests(),
      ]);

      const dbJobs = (jData as unknown as ServiceJob[]) || [];
      const dbClients = (cData as unknown as Client[]) || [];
      const dbEng = (eData as unknown as Profile[]) || [];
      const dbVendors = (vData as unknown as Vendor[]) || [];
      const dbAttendance = attData || [];
      const dbLeaves = leavesData || [];

      const clientMap = new Map<string, Client>();
      dbClients.forEach((c) => clientMap.set(c.id, c));

      const engMap = new Map<string, Profile>();
      dbEng.forEach((e) => engMap.set(e.id, e));

      const joinedJobs = dbJobs.map((j) => ({
        ...j,
        client: j.client || clientMap.get(j.client_id),
        engineer: j.engineer || (j.engineer_id ? engMap.get(j.engineer_id) : null),
      }));

      setJobs(joinedJobs);
      setEngineers(dbEng);
      setClients(dbClients);
      setVendors(dbVendors);
      setAttendances(dbAttendance);
      setLeaves(dbLeaves);
    } catch (err) {
      console.error('Failed to load reports data:', err);
    } finally {
      setLoading(false);
    }
  }

  const { currentBranch } = useBranch();

  const branchJobs = useMemo(() => {
    return jobs.filter((j) => matchesBranch(getJobBranch(j), currentBranch));
  }, [jobs, currentBranch]);

  const branchEngineers = useMemo(() => {
    return engineers.filter((p) => matchesBranch(getProfileBranch(p), currentBranch));
  }, [engineers, currentBranch]);

  const branchClients = useMemo(() => {
    return clients.filter((c) => matchesBranch(getClientBranch(c), currentBranch));
  }, [clients, currentBranch]);

  const branchAttendances = useMemo(() => {
    const engMap = new Map<string, Profile>();
    engineers.forEach((e) => engMap.set(e.id, e));
    return attendances.filter((a) => {
      const eng = engMap.get(a.engineer_id);
      return matchesBranch(getProfileBranch(eng), currentBranch);
    });
  }, [attendances, engineers, currentBranch]);

  const branchLeaves = useMemo(() => {
    const engMap = new Map<string, Profile>();
    engineers.forEach((e) => engMap.set(e.id, e));
    return leaves.filter((l) => {
      const eng = engMap.get(l.engineer_id);
      return matchesBranch(getProfileBranch(eng), currentBranch);
    });
  }, [leaves, engineers, currentBranch]);

  // ─── Range Date Bounds Calculation ───
  const dateBounds = useMemo(() => {
    const today = new Date();
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);

    if (range === 'yesterday') {
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
    } else if (range === 'week') {
      start.setDate(start.getDate() - 6);
    } else if (range === 'month') {
      start.setMonth(start.getMonth() - 1);
    } else if (range === 'custom') {
      if (customStart) {
        const [sy, sm, sd] = customStart.split('-').map(Number);
        if (sy && sm && sd) start.setFullYear(sy, sm - 1, sd);
      }
      if (customEnd) {
        const [ey, em, ed] = customEnd.split('-').map(Number);
        if (ey && em && ed) end.setFullYear(ey, em - 1, ed);
      }
    }
    return { start, end };
  }, [range, customStart, customEnd]);

  // ─── Filtered Jobs for General Tab / Day Tab ───
  const filteredJobs = useMemo(() => {
    return branchJobs.filter((j) => {
      if (!j.scheduled_date) return false;
      const jobDate = j.scheduled_date.includes('T')
        ? new Date(j.scheduled_date).getTime()
        : new Date(`${j.scheduled_date}T00:00:00`).getTime();
      if (jobDate < dateBounds.start.getTime() || jobDate > dateBounds.end.getTime()) return false;
      if (engFilter !== 'all' && j.engineer_id !== engFilter) return false;
      if (clientFilter !== 'all' && j.client_id !== clientFilter) return false;
      if (callTypeFilter !== 'all' && j.call_type !== callTypeFilter) return false;
      if (sourceFilter !== 'all' && (j.call_source || 'direct') !== sourceFilter) return false;
      if (statusFilter !== 'all') {
        if (statusFilter === 'in_progress') {
          if (!['reached', 'in_progress', 'solved'].includes(j.status)) return false;
        } else if (j.status !== statusFilter) {
          return false;
        }
      }
      return true;
    });
  }, [branchJobs, dateBounds, engFilter, clientFilter, statusFilter, callTypeFilter, sourceFilter]);

  // ─── Day-to-Day Specific Jobs (Exact Date) ───
  const daySpecificJobs = useMemo(() => {
    return branchJobs.filter((j) => {
      if (!j.scheduled_date) return false;
      const datePart = j.scheduled_date.split('T')[0];
      if (datePart !== selectedDayDate) return false;
      if (engFilter !== 'all' && j.engineer_id !== engFilter) return false;
      if (clientFilter !== 'all' && j.client_id !== clientFilter) return false;
      if (callTypeFilter !== 'all' && j.call_type !== callTypeFilter) return false;
      if (sourceFilter !== 'all' && (j.call_source || 'direct') !== sourceFilter) return false;
      if (statusFilter !== 'all') {
        if (statusFilter === 'in_progress') {
          if (!['reached', 'in_progress', 'solved'].includes(j.status)) return false;
        } else if (j.status !== statusFilter) {
          return false;
        }
      }
      return true;
    });
  }, [branchJobs, selectedDayDate, engFilter, clientFilter, statusFilter, callTypeFilter, sourceFilter]);

  const dayStats = useMemo(() => {
    const list = daySpecificJobs;
    const total = list.length;
    const completed = list.filter((j) => j.status === 'completed').length;
    const inProgress = list.filter((j) => ['traveling', 'reached', 'in_progress', 'solved'].includes(j.status)).length;
    const pending = list.filter((j) => ['assigned', 'call_back', 'vendor', 'pending'].includes(j.status)).length;
    const cancelled = list.filter((j) => j.status === 'cancelled').length;

    const totalGpsKm = list.reduce((s, j) => s + (j.gps_distance_km || j.total_km || 0), 0);
    const totalRoadKm = list.reduce((s, j) => s + (j.total_km || j.gps_distance_km || 0), 0);
    const petrolAllowance = totalRoadKm * PETROL_RATE_PER_KM;

    const totalBilled = list.reduce((s, j) => {
      const isCovered = j.call_type === 'Warranty' || j.call_type === 'ASC';
      const insp = isCovered ? 0 : j.inspection_charge ?? 0;
      const srv = isCovered ? 0 : j.service_charge ?? 0;
      const prt = j.part_charge ?? 0;
      return s + insp + srv + prt;
    }, 0);

    const holiday = getTamilNaduHoliday(selectedDayDate);
    const isSunday = isSundayWeekOff(selectedDayDate);

    return {
      total,
      completed,
      inProgress,
      pending,
      cancelled,
      totalGpsKm,
      totalRoadKm,
      petrolAllowance,
      totalBilled,
      holiday,
      isSunday,
    };
  }, [daySpecificJobs, selectedDayDate]);

  // ─── Weekly Call Report Bounds & Stats ───
  const weeklyBounds = useMemo(() => {
    const today = new Date();
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);

    if (selectedWeeklyMode === 'current_7') {
      start.setDate(today.getDate() - 6);
    } else if (selectedWeeklyMode === 'this_week') {
      // Monday to Sunday of current week
      const day = today.getDay(); // 0 is Sunday
      const diffToMon = day === 0 ? -6 : 1 - day;
      start.setDate(today.getDate() + diffToMon);
      end.setDate(start.getDate() + 6);
    } else if (selectedWeeklyMode === 'prev_week') {
      const day = today.getDay();
      const diffToMon = day === 0 ? -6 : 1 - day;
      start.setDate(today.getDate() + diffToMon - 7);
      end.setDate(start.getDate() + 6);
    }
    return { start, end };
  }, [selectedWeeklyMode]);

  const weeklyJobs = useMemo(() => {
    return branchJobs.filter((j) => {
      if (!j.scheduled_date) return false;
      const jobDate = j.scheduled_date.includes('T')
        ? new Date(j.scheduled_date).getTime()
        : new Date(`${j.scheduled_date}T00:00:00`).getTime();
      if (jobDate < weeklyBounds.start.getTime() || jobDate > weeklyBounds.end.getTime()) return false;
      if (engFilter !== 'all' && j.engineer_id !== engFilter) return false;
      return true;
    });
  }, [branchJobs, weeklyBounds, engFilter]);

  const weeklyStats = useMemo(() => {
    const total = weeklyJobs.length;
    const completed = weeklyJobs.filter((j) => j.status === 'completed').length;
    const inProgress = weeklyJobs.filter((j) => ['traveling', 'reached', 'in_progress', 'solved'].includes(j.status)).length;
    const pending = weeklyJobs.filter((j) => ['assigned', 'call_back', 'vendor', 'pending'].includes(j.status)).length;
    const cancelled = weeklyJobs.filter((j) => j.status === 'cancelled').length;
    const roadKm = weeklyJobs.reduce((s, j) => s + (j.total_km || j.gps_distance_km || 0), 0);
    const petrolAllowance = roadKm * PETROL_RATE_PER_KM;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Day-by-day distribution for the 7 days
    const daysBreakdown: {
      dateStr: string;
      dayName: string;
      dateObj: Date;
      holiday: TamilNaduHoliday | null;
      isSunday: boolean;
      total: number;
      completed: number;
      roadKm: number;
      petrolAllowance: number;
    }[] = [];

    const cur = new Date(weeklyBounds.start);
    while (cur.getTime() <= weeklyBounds.end.getTime()) {
      const dateStr = cur.toISOString().split('T')[0];
      const curJobs = weeklyJobs.filter((j) => (j.scheduled_date || '').startsWith(dateStr));
      const curKm = curJobs.reduce((s, j) => s + (j.total_km || j.gps_distance_km || 0), 0);
      daysBreakdown.push({
        dateStr,
        dayName: cur.toLocaleDateString('en-US', { weekday: 'short' }),
        dateObj: new Date(cur),
        holiday: getTamilNaduHoliday(dateStr),
        isSunday: isSundayWeekOff(cur),
        total: curJobs.length,
        completed: curJobs.filter((j) => j.status === 'completed').length,
        roadKm: curKm,
        petrolAllowance: curKm * PETROL_RATE_PER_KM,
      });
      cur.setDate(cur.getDate() + 1);
    }

    // Engineer performance breakdown
    const engSummary: Record<
      string,
      {
        engineer: Profile;
        assigned: number;
        completed: number;
        roadKm: number;
        petrolAllowance: number;
        completionRate: number;
      }
    > = {};

    branchEngineers.forEach((e) => {
      engSummary[e.id] = {
        engineer: e,
        assigned: 0,
        completed: 0,
        roadKm: 0,
        petrolAllowance: 0,
        completionRate: 0,
      };
    });

    weeklyJobs.forEach((j) => {
      const eid = j.engineer_id;
      if (eid && engSummary[eid]) {
        engSummary[eid].assigned++;
        if (j.status === 'completed') engSummary[eid].completed++;
        const km = j.total_km || j.gps_distance_km || 0;
        engSummary[eid].roadKm += km;
        engSummary[eid].petrolAllowance += km * PETROL_RATE_PER_KM;
      }
    });

    Object.values(engSummary).forEach((item) => {
      item.completionRate = item.assigned > 0 ? Math.round((item.completed / item.assigned) * 100) : 0;
    });

    return {
      total,
      completed,
      inProgress,
      pending,
      cancelled,
      roadKm,
      petrolAllowance,
      completionRate,
      daysBreakdown,
      engineersList: Object.values(engSummary).filter((item) => item.assigned > 0 || engFilter === 'all'),
    };
  }, [weeklyJobs, weeklyBounds, branchEngineers, engFilter]);

  // ─── Monthly Combined Call & Attendance Matrix ───
  const monthlyCombinedData = useMemo(() => {
    const daysInMonth = new Date(selectedYear, selectedMonthIndex + 1, 0).getDate();
    const monthStr = String(selectedMonthIndex + 1).padStart(2, '0');
    const monthPrefix = `${selectedYear}-${monthStr}`;

    // 1. Attendance Matrix
    const matrix = buildMonthlyAttendanceMatrix(
      selectedYear,
      selectedMonthIndex,
      branchEngineers,
      branchAttendances,
      branchLeaves,
      DEFAULT_ATTENDANCE_POLICY
    );

    // 2. Month Service Jobs
    const monthJobs = branchJobs.filter((j) => {
      if (!j.scheduled_date) return false;
      return j.scheduled_date.startsWith(monthPrefix);
    });

    // 3. Return to office records for month
    const returnRecords = extractReturnOfficeRecords(branchAttendances, branchEngineers).filter(
      (r) => r.date.startsWith(monthPrefix)
    );

    // Combine by engineer
    const combinedRows = matrix.map((attRow) => {
      const engId = attRow.engineer.id;
      const engJobs = monthJobs.filter((j) => j.engineer_id === engId);
      const engCompleted = engJobs.filter((j) => j.status === 'completed').length;
      const engPending = engJobs.filter((j) => !['completed', 'cancelled'].includes(j.status)).length;
      const engJobKm = engJobs.reduce((s, j) => s + (j.total_km || j.gps_distance_km || 0), 0);

      const engReturnKm = returnRecords
        .filter((r) => r.engineerId === engId && r.status === 'reached')
        .reduce((s, r) => s + (r.returnKm || 0), 0);

      // Total Net Travel KM (Duty/Call Visits + Office Returns)
      const combinedKm = Math.max(attRow.totalKm, engJobKm) + engReturnKm;
      const petrolAllowance = combinedKm * PETROL_RATE_PER_KM;

      const completionRate = engJobs.length > 0 ? Math.round((engCompleted / engJobs.length) * 100) : 0;
      const attendanceRate =
        attRow.totalDaysInMonth > 0
          ? Math.round(
              (attRow.presentDays /
                Math.max(1, attRow.totalDaysInMonth - attRow.weeklyOffDays - attRow.govtHolidayDays)) *
                100
            )
          : 0;

      return {
        engineer: attRow.engineer,
        // Attendance
        presentDays: attRow.presentDays,
        lateDays: attRow.lateDays,
        halfDays: attRow.halfDays,
        leaveDays: attRow.leaveDays,
        govtHolidayDays: attRow.govtHolidayDays,
        weeklyOffDays: attRow.weeklyOffDays,
        absentDays: attRow.absentDays,
        workingMinutes: attRow.totalWorkingMinutes,
        workingHours: (attRow.totalWorkingMinutes / 60).toFixed(1),
        attendanceRate: Math.min(100, Math.max(0, attendanceRate)),
        // Calls
        totalCalls: engJobs.length,
        completedCalls: engCompleted,
        pendingCalls: engPending,
        callCompletionRate: completionRate,
        // Travel & Petrol
        callRoadKm: engJobKm,
        returnOfficeKm: engReturnKm,
        totalTravelKm: combinedKm,
        petrolAllowance,
      };
    });

    // Month Totals
    const totalCalls = monthJobs.length;
    const totalCompleted = monthJobs.filter((j) => j.status === 'completed').length;
    const totalRoadKm = combinedRows.reduce((s, r) => s + r.totalTravelKm, 0);
    const totalPetrolAllowance = totalRoadKm * PETROL_RATE_PER_KM;
    const totalShiftsPresent = combinedRows.reduce((s, r) => s + r.presentDays, 0);
    const totalLateArrivals = combinedRows.reduce((s, r) => s + r.lateDays, 0);
    const totalLeaves = combinedRows.reduce((s, r) => s + r.leaveDays, 0);
    const totalAbsent = combinedRows.reduce((s, r) => s + r.absentDays, 0);

    // Day-by-Day Timeline for Month
    const monthlyDaysTimeline = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const dayStr = String(day).padStart(2, '0');
      const dateString = `${monthPrefix}-${dayStr}`;
      const dateObj = new Date(selectedYear, selectedMonthIndex, day);
      const holiday = getTamilNaduHoliday(dateString);
      const isSunday = isSundayWeekOff(dateObj);
      const dayJobs = monthJobs.filter((j) => (j.scheduled_date || '').startsWith(dateString));
      const dayAtt = branchAttendances.filter((a) => a.date === dateString);
      const dayKm = dayJobs.reduce((s, j) => s + (j.total_km || j.gps_distance_km || 0), 0);

      return {
        day,
        dateString,
        dateObj,
        holiday,
        isSunday,
        activeWorkforce: dayAtt.filter((a) => ['present', 'on_duty', 'punched_out', 'late'].includes(a.status)).length,
        callsTotal: dayJobs.length,
        callsCompleted: dayJobs.filter((j) => j.status === 'completed').length,
        dayKm,
        petrolAllowance: dayKm * PETROL_RATE_PER_KM,
      };
    });

    return {
      daysInMonth,
      monthPrefix,
      combinedRows,
      totalCalls,
      totalCompleted,
      totalRoadKm,
      totalPetrolAllowance,
      totalShiftsPresent,
      totalLateArrivals,
      totalLeaves,
      totalAbsent,
      monthlyDaysTimeline,
    };
  }, [
    selectedYear,
    selectedMonthIndex,
    branchEngineers,
    branchAttendances,
    branchLeaves,
    branchJobs,
  ]);

  // ─── Petrol Convenience Statement (Dedicated Tab) ───
  const petrolConvenienceData = useMemo(() => {
    // Collect all field trips (Calls + Return to Office) within current dateBounds
    const filteredCallTrips = filteredJobs.map((j) => {
      const gKm = j.gps_distance_km || j.total_km || 0;
      const mKm = j.total_km || j.gps_distance_km || 0;
      const dist = mKm;
      return {
        id: `job-${j.id}`,
        type: 'Service Call' as const,
        date: j.scheduled_date ? j.scheduled_date.split('T')[0] : '—',
        engineerId: j.engineer_id || '',
        engineerName: j.engineer?.full_name || 'Unassigned',
        engineerPhone: j.engineer?.phone || '—',
        refNo: j.job_number,
        destination: j.client?.client_name || 'Client',
        city: j.client?.city || 'Coimbatore',
        address: j.client?.address || 'Field Location',
        startTime: j.travel_started_at,
        endTime: j.reached_at,
        durationFormatted: j.travel_started_at && j.reached_at ? formatDuration(j.travel_started_at, j.reached_at) : '—',
        distanceKm: dist,
        petrolAllowance: dist * PETROL_RATE_PER_KM,
      };
    });

    const returnRecords = extractReturnOfficeRecords(branchAttendances, branchEngineers).filter((r) => {
      const recDate = new Date(`${r.date}T00:00:00`).getTime();
      if (recDate < dateBounds.start.getTime() || recDate > dateBounds.end.getTime()) return false;
      if (engFilter !== 'all' && r.engineerId !== engFilter) return false;
      return true;
    });

    const filteredOfficeTrips = returnRecords.map((r, idx) => ({
      id: `return-${r.attendanceId}-${idx}`,
      type: 'Return to Office' as const,
      date: r.date,
      engineerId: r.engineerId,
      engineerName: r.engineerName,
      engineerPhone: r.engineerPhone || '—',
      refNo: 'RET-OFFICE',
      destination: r.destinationAddress,
      city: 'Coimbatore',
      address: r.departureAddress,
      startTime: r.startedAt,
      endTime: r.reachedAt,
      durationFormatted: r.durationFormatted,
      distanceKm: r.returnKm,
      petrolAllowance: r.returnKm * PETROL_RATE_PER_KM,
    }));

    const allTrips = [...filteredCallTrips, ...filteredOfficeTrips].sort((a, b) => {
      return (b.date + (b.startTime || '')).localeCompare(a.date + (a.startTime || ''));
    });

    // Engineer-wise reimbursement summary
    const engSummary: Record<
      string,
      {
        engineer: Profile;
        callTrips: number;
        callKm: number;
        returnTrips: number;
        returnKm: number;
        totalKm: number;
        totalPetrolAllowance: number;
        activeDates: Set<string>;
      }
    > = {};

    branchEngineers.forEach((e) => {
      engSummary[e.id] = {
        engineer: e,
        callTrips: 0,
        callKm: 0,
        returnTrips: 0,
        returnKm: 0,
        totalKm: 0,
        totalPetrolAllowance: 0,
        activeDates: new Set<string>(),
      };
    });

    allTrips.forEach((t) => {
      if (t.engineerId && engSummary[t.engineerId]) {
        if (t.type === 'Service Call') {
          engSummary[t.engineerId].callTrips++;
          engSummary[t.engineerId].callKm += t.distanceKm;
        } else {
          engSummary[t.engineerId].returnTrips++;
          engSummary[t.engineerId].returnKm += t.distanceKm;
        }
        engSummary[t.engineerId].totalKm += t.distanceKm;
        engSummary[t.engineerId].totalPetrolAllowance += t.petrolAllowance;
        engSummary[t.engineerId].activeDates.add(t.date);
      }
    });

    const totalKm = allTrips.reduce((s, t) => s + t.distanceKm, 0);
    const totalPetrolAllowance = totalKm * PETROL_RATE_PER_KM;
    const activeEngineersCount = Object.values(engSummary).filter((e) => e.totalKm > 0).length;

    return {
      allTrips,
      totalTrips: allTrips.length,
      totalKm,
      totalPetrolAllowance,
      activeEngineersCount,
      engineerStatements: Object.values(engSummary).filter((e) => e.totalKm > 0 || engFilter === 'all'),
    };
  }, [filteredJobs, branchAttendances, branchEngineers, dateBounds, engFilter]);

  // ─── Return to Office Analytics ───
  const allReturnRecords = useMemo(() => {
    return extractReturnOfficeRecords(branchAttendances, branchEngineers);
  }, [branchAttendances, branchEngineers]);

  const filteredReturnRecords = useMemo(() => {
    return allReturnRecords.filter((r) => {
      const recDate = new Date(`${r.date}T00:00:00`).getTime();
      if (recDate < dateBounds.start.getTime() || recDate > dateBounds.end.getTime()) return false;
      if (engFilter !== 'all' && r.engineerId !== engFilter) return false;
      return true;
    });
  }, [allReturnRecords, dateBounds, engFilter]);

  const returnOfficeStats = useMemo(() => {
    const totalTrips = filteredReturnRecords.length;
    const reached = filteredReturnRecords.filter((r) => r.status === 'reached');
    const inTransit = filteredReturnRecords.filter((r) => r.status === 'returning');
    const totalReturnKm = Math.round(reached.reduce((s, r) => s + (r.returnKm || 0), 0) * 10) / 10;
    const avgKm = reached.length > 0 ? (totalReturnKm / reached.length).toFixed(1) : '0';
    const totalDurationMinutes = reached.reduce((s, r) => s + (r.durationMinutes || 0), 0);
    const totalHours = Math.floor(totalDurationMinutes / 60);
    const totalMins = totalDurationMinutes % 60;
    const totalTimeFormatted = totalHours > 0 ? `${totalHours}h ${totalMins}m` : `${totalMins}m`;

    return {
      totalTrips,
      reachedCount: reached.length,
      inTransitCount: inTransit.length,
      totalReturnKm,
      avgKm,
      totalDurationMinutes,
      totalTimeFormatted,
    };
  }, [filteredReturnRecords]);

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORT FUNCTIONS (CSV & PDF)
  // ═══════════════════════════════════════════════════════════════════════════

  // 1. Day-to-Day Call Report CSV
  function exportDayCallsCsv() {
    const headers = [
      'Job Number',
      'Branch',
      'Date',
      'Client Name',
      'Client City',
      'Engineer',
      'Assigned By',
      'Call Given By',
      'Issue',
      'Call Type',
      'Status',
      'GPS Road KM',
      'Manual KM',
      'Petrol Allowance (Rs @ 2.75/KM)',
      'Travel Duration',
      'Total Amount (Rs)',
      'Payment Mode',
    ];

    const rows = daySpecificJobs.map((j) => {
      const isCovered = j.call_type === 'Warranty' || j.call_type === 'ASC';
      const insp = isCovered ? 0 : j.inspection_charge ?? 0;
      const srv = isCovered ? 0 : j.service_charge ?? 0;
      const prt = j.part_charge ?? 0;
      const totalAmount = insp + srv + prt;
      const gKm = j.gps_distance_km || j.total_km || 0;
      const mKm = j.total_km || j.gps_distance_km || 0;
      const petrol = (mKm * PETROL_RATE_PER_KM).toFixed(2);

      return [
        j.job_number,
        BRANCHES.find((b) => b.id === getJobBranch(j))?.label || getJobBranch(j).toUpperCase(),
        j.scheduled_date,
        j.client?.client_name ?? '',
        j.client?.city ?? '',
        j.engineer?.full_name ?? 'Unassigned',
        j.assigned_by_name || j.reassigned_from_name || 'Admin',
        j.call_given_by || '—',
        j.issue_title,
        j.call_type || 'Standard',
        j.status,
        gKm.toFixed(1),
        mKm.toFixed(1),
        petrol,
        j.travel_started_at && j.reached_at ? formatDuration(j.travel_started_at, j.reached_at) : '—',
        totalAmount,
        j.payment_mode || 'Cash',
      ];
    });

    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ICS-Day-Call-Report-${selectedDayDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 2. Weekly Call Report CSV
  function exportWeeklyCallsCsv() {
    const headers = [
      'Engineer Name',
      'Phone',
      'Calls Assigned',
      'Calls Completed',
      'Completion Rate (%)',
      'Road KM',
      'Petrol Allowance (Rs @ 2.75/KM)',
    ];

    const rows = weeklyStats.engineersList.map((e) => [
      e.engineer.full_name,
      e.engineer.phone || '—',
      e.assigned,
      e.completed,
      `${e.completionRate}%`,
      e.roadKm.toFixed(1),
      e.petrolAllowance.toFixed(2),
    ]);

    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ICS-Weekly-Call-Report-${weeklyBounds.start.toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 3. Monthly Combined Call & Attendance CSV
  function exportMonthlyCombinedCsv() {
    const headers = [
      'Emp ID',
      'Engineer Name',
      'Phone',
      'Present Days',
      'Late Days',
      'Half Days',
      'Approved Leaves',
      'TN Govt Holidays (GH)',
      'Sunday Offs (WO)',
      'Absent Days',
      'Work Hours',
      'Attendance %',
      'Total Calls',
      'Completed Calls',
      'Pending Calls',
      'Call Done %',
      'Service Calls KM',
      'Office Return KM',
      'Net Travel KM',
      'Petrol Allowance (Rs @ 2.75/KM)',
    ];

    const rows = monthlyCombinedData.combinedRows.map((r) => [
      r.engineer.employee_id || `EMP-${r.engineer.id.slice(0, 5).toUpperCase()}`,
      r.engineer.full_name,
      r.engineer.phone || '—',
      r.presentDays,
      r.lateDays,
      r.halfDays,
      r.leaveDays,
      r.govtHolidayDays,
      r.weeklyOffDays,
      r.absentDays,
      r.workingHours,
      `${r.attendanceRate}%`,
      r.totalCalls,
      r.completedCalls,
      r.pendingCalls,
      `${r.callCompletionRate}%`,
      r.callRoadKm.toFixed(1),
      r.returnOfficeKm.toFixed(1),
      r.totalTravelKm.toFixed(1),
      r.petrolAllowance.toFixed(2),
    ]);

    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ICS-Monthly-Call-Attendance-Report-${monthNames[selectedMonthIndex]}-${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 4. Petrol Convenience Reimbursement CSV
  function exportPetrolConvenienceCsv() {
    const headers = [
      'Date',
      'Trip Type',
      'Reference / Job #',
      'Engineer Name',
      'Engineer Phone',
      'Start Location',
      'Destination / Client',
      'Start Time',
      'End Time',
      'Duration',
      'Distance (KM)',
      'Rate Per KM (Rs)',
      'Reimbursement Amount (Rs)',
    ];

    const rows = petrolConvenienceData.allTrips.map((t) => [
      t.date,
      t.type,
      t.refNo,
      t.engineerName,
      t.engineerPhone,
      t.address || 'Field Location',
      t.destination,
      t.startTime ? new Date(t.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
      t.endTime ? new Date(t.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
      t.durationFormatted,
      t.distanceKm.toFixed(1),
      PETROL_RATE_PER_KM.toFixed(2),
      t.petrolAllowance.toFixed(2),
    ]);

    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ICS-Petrol-Convenience-Report-2.75RS-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 5. PDF Export for Petrol Convenience Report
  function exportPetrolConveniencePdf() {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 30, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('INFANT COMPUTER STORE (ICS)', 105, 11, { align: 'center' });

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text('Podanur, Coimbatore | Field Petrol & Travel Convenience Allowance Register', 105, 17, { align: 'center' });

    doc.setFillColor(16, 185, 129);
    doc.roundedRect(40, 21, 130, 6, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`OFFICIAL REIMBURSEMENT RATE: RS. ${PETROL_RATE_PER_KM.toFixed(2)} / KM`, 105, 25.2, { align: 'center' });

    let y = 38;
    doc.setTextColor(51, 65, 85);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`Period: ${range === 'today' ? selectedDayDate : `${dateBounds.start.toISOString().split('T')[0]} to ${dateBounds.end.toISOString().split('T')[0]}`}`, 14, y);
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 135, y);

    y += 5;
    // KPI Cards in PDF
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, y, 182, 14, 2, 2, 'FD');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('TOTAL ROAD KM', 32, y + 4.5, { align: 'center' });
    doc.text('REIMBURSEMENT PAYABLE', 80, y + 4.5, { align: 'center' });
    doc.text('TOTAL FIELD TRIPS', 130, y + 4.5, { align: 'center' });
    doc.text('ACTIVE ENGINEERS', 170, y + 4.5, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`${petrolConvenienceData.totalKm.toFixed(1)} KM`, 32, y + 10.5, { align: 'center' });
    doc.setTextColor(5, 150, 105);
    doc.text(`Rs. ${petrolConvenienceData.totalPetrolAllowance.toFixed(2)}`, 80, y + 10.5, { align: 'center' });
    doc.setTextColor(15, 23, 42);
    doc.text(String(petrolConvenienceData.totalTrips), 130, y + 10.5, { align: 'center' });
    doc.text(String(petrolConvenienceData.activeEngineersCount), 170, y + 10.5, { align: 'center' });

    y += 20;
    doc.setFillColor(15, 23, 42);
    doc.rect(14, y, 182, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('Engineer Name', 16, y + 4.2);
    doc.text('Call Visits KM', 70, y + 4.2);
    doc.text('Office Return KM', 105, y + 4.2);
    doc.text('Total Road KM', 145, y + 4.2);
    doc.text(`Payable (@ Rs ${PETROL_RATE_PER_KM})`, 175, y + 4.2);

    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);

    petrolConvenienceData.engineerStatements.forEach((eng, idx) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.setFillColor(idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 250, idx % 2 === 0 ? 255 : 252);
      doc.rect(14, y, 182, 5.5, 'F');

      doc.setTextColor(15, 23, 42);
      doc.text(eng.engineer.full_name.substring(0, 24), 16, y + 3.8);
      doc.text(`${eng.callKm.toFixed(1)} KM`, 70, y + 3.8);
      doc.text(`${eng.returnKm.toFixed(1)} KM`, 105, y + 3.8);
      doc.setFont('helvetica', 'bold');
      doc.text(`${eng.totalKm.toFixed(1)} KM`, 145, y + 3.8);
      doc.setTextColor(5, 150, 105);
      doc.text(`Rs. ${eng.totalPetrolAllowance.toFixed(2)}`, 175, y + 3.8);
      doc.setFont('helvetica', 'normal');

      y += 5.5;
    });

    doc.save(`ICS-Petrol-Convenience-Statement-${new Date().toISOString().split('T')[0]}.pdf`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* Top Header & Page Navigation */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Executive Reports & Analytics</h1>
            <span className="rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2.5 py-0.5 border border-emerald-300">
              Petrol ₹2.75 / KM
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Comprehensive audit for Service Calls, Weekly Performance, Workforce Attendance (Tamil Nadu Gazetted Calendar), and Petrol Convenience.
          </p>
        </div>

        {/* Global Export Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {activeTab === 'daily_calls' && (
            <button
              onClick={exportDayCallsCsv}
              className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Day Calls CSV</span>
            </button>
          )}

          {activeTab === 'weekly_calls' && (
            <button
              onClick={exportWeeklyCallsCsv}
              className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Weekly CSV</span>
            </button>
          )}

          {activeTab === 'monthly_call_attendance' && (
            <button
              onClick={exportMonthlyCombinedCsv}
              className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>Export Monthly Register CSV</span>
            </button>
          )}

          {activeTab === 'petrol_convenience' && (
            <>
              <button
                onClick={exportPetrolConvenienceCsv}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-800 transition"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export Petrol CSV</span>
              </button>
              <button
                onClick={exportPetrolConveniencePdf}
                className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print Statement PDF</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 4 PRIMARY REPORT TABS + RETURN TO OFFICE & VENDORS */}
      <div className="flex flex-wrap border-b border-slate-200 gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('daily_calls')}
          className={`flex items-center gap-2 border-b-2 py-3 px-4 text-xs sm:text-sm font-bold transition ${
            activeTab === 'daily_calls'
              ? 'border-blue-600 text-blue-600 bg-blue-50/40 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Calendar className="h-4 w-4" />
          <span>1. Call Report (Day to Day)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('weekly_calls')}
          className={`flex items-center gap-2 border-b-2 py-3 px-4 text-xs sm:text-sm font-bold transition ${
            activeTab === 'weekly_calls'
              ? 'border-indigo-600 text-indigo-600 bg-indigo-50/40 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          <span>2. Call Report (Weekly)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('monthly_call_attendance')}
          className={`flex items-center gap-2 border-b-2 py-3 px-4 text-xs sm:text-sm font-bold transition ${
            activeTab === 'monthly_call_attendance'
              ? 'border-purple-600 text-purple-600 bg-purple-50/40 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" />
          <span>3. Monthly Call & Attendance Report</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('petrol_convenience')}
          className={`flex items-center gap-2 border-b-2 py-3 px-4 text-xs sm:text-sm font-bold transition ${
            activeTab === 'petrol_convenience'
              ? 'border-emerald-600 text-emerald-600 bg-emerald-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Fuel className="h-4 w-4 text-emerald-600" />
          <span>4. Petrol Convenience (₹2.75 / KM)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('return_to_office')}
          className={`flex items-center gap-2 border-b-2 py-3 px-3 text-xs sm:text-sm font-semibold transition ${
            activeTab === 'return_to_office'
              ? 'border-slate-800 text-slate-800 bg-slate-100/60 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>Return to Office ({filteredReturnRecords.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('vendor_handover')}
          className={`flex items-center gap-2 border-b-2 py-3 px-3 text-xs sm:text-sm font-semibold transition ${
            activeTab === 'vendor_handover'
              ? 'border-slate-800 text-slate-800 bg-slate-100/60 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Store className="h-4 w-4" />
          <span>Vendor Handover ({jobs.filter((j) => j.status === 'vendor' || !!j.vendor_name).length})</span>
        </button>

        <a
          href="/admin/outstanding"
          className="flex items-center gap-1.5 border-b-2 border-transparent py-3 px-3 text-xs font-extrabold text-red-600 hover:text-red-700 hover:bg-red-50/70 rounded-t-xl transition sm:ml-auto"
        >
          <IndianRupee className="h-4 w-4" />
          <span>Client Outstanding Report ➔</span>
        </a>
      </div>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 1. CALL REPORT - DAY TO DAY REPORT */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {activeTab === 'daily_calls' && (
        <div className="space-y-5">
          {/* Day Toolbar & Date Pickers */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase">Select Day:</span>
              <input
                type="date"
                value={selectedDayDate}
                onChange={(e) => setSelectedDayDate(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-600 shadow-sm"
              />
              <button
                type="button"
                onClick={() => setSelectedDayDate(new Date().toISOString().split('T')[0])}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  selectedDayDate === new Date().toISOString().split('T')[0]
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 1);
                  setSelectedDayDate(d.toISOString().split('T')[0]);
                }}
                className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
              >
                Yesterday
              </button>

              {/* Holiday or Sunday Indicator Badge */}
              {dayStats.holiday && (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-800 border border-indigo-200">
                  🏛️ TN Govt Holiday: {dayStats.holiday.name}
                </span>
              )}
              {dayStats.isSunday && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 border border-amber-200">
                  Weekly Off (Sunday)
                </span>
              )}
            </div>

            {/* Quick Filters for Day Table */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={engFilter}
                onChange={(e) => setEngFilter(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-600"
              >
                <option value="all">👨‍🔧 All Engineers</option>
                {branchEngineers.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
              >
                <option value="all">⚡ All Statuses</option>
                <option value="completed">Completed</option>
                <option value="in_progress">In Client Place</option>
                <option value="traveling">On Call (Traveling)</option>
                <option value="assigned">Assigned</option>
                <option value="vendor">Vendor Handling</option>
                <option value="call_back">Call Back</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>

          {/* Day KPI Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Day Total Calls</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{dayStats.total}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Completed</p>
              <p className="mt-1 text-2xl font-black text-emerald-700">{dayStats.completed}</p>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">In Progress</p>
              <p className="mt-1 text-2xl font-black text-blue-700">{dayStats.inProgress}</p>
            </div>
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Day Road KM</p>
              <p className="mt-1 text-2xl font-black text-indigo-900">{formatKm(dayStats.totalRoadKm)}</p>
            </div>
            <div className="rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Petrol Allowance</p>
                <Fuel className="h-3.5 w-3.5 text-emerald-600" />
              </div>
              <p className="mt-1 text-2xl font-black text-emerald-900">₹{dayStats.petrolAllowance.toFixed(2)}</p>
              <p className="text-[10px] text-emerald-700 font-semibold">@ ₹2.75 / KM</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Day Billing</p>
              <p className="mt-1 text-2xl font-black text-slate-900">₹{dayStats.totalBilled.toLocaleString('en-IN')}</p>
            </div>
          </div>

          {/* Day-by-Day Detailed Calls Table */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-400" />
                <h3 className="text-sm font-bold">
                  Day Service Call Log — {selectedDayDate} ({new Date(selectedDayDate).toLocaleDateString('en-US', { weekday: 'long' })})
                </h3>
              </div>
              <span className="text-xs text-slate-300 font-semibold">
                {daySpecificJobs.length} calls logged
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Job #</th>
                    <th className="px-4 py-3">Customer & City</th>
                    <th className="px-4 py-3">Engineer</th>
                    <th className="px-4 py-3">Issue Reported</th>
                    <th className="px-4 py-3 text-center">GPS Road KM</th>
                    <th className="px-4 py-3 text-center">Manual KM</th>
                    <th className="px-4 py-3 text-center">Petrol (₹2.75/KM)</th>
                    <th className="px-4 py-3 text-center">Travel Time</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {daySpecificJobs.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                        <FileText className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                        <p className="font-semibold text-slate-600">No service calls found for {selectedDayDate}</p>
                        <p className="text-xs text-slate-400 mt-0.5">Select another date or adjust engineer filters</p>
                      </td>
                    </tr>
                  ) : (
                    daySpecificJobs.map((j) => {
                      const gKm = j.gps_distance_km || j.total_km || 0;
                      const mKm = j.total_km || j.gps_distance_km || 0;
                      const petrolAllowance = (mKm * PETROL_RATE_PER_KM).toFixed(2);

                      return (
                        <tr key={j.id} className="hover:bg-slate-50 transition">
                          <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">
                            <a href={`/admin/jobs/${j.id}`} className="text-blue-600 hover:underline">
                              {j.job_number}
                            </a>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900">{j.client?.client_name || 'Customer'}</p>
                            <p className="text-[11px] text-slate-400">{j.client?.city || 'Coimbatore'}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-bold text-slate-800">{j.engineer?.full_name || 'Unassigned'}</p>
                            {j.call_given_by && (
                              <p className="text-[10px] text-slate-500">Given by: {j.call_given_by}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 max-w-xs">
                            <p className="truncate text-slate-800 font-medium">{j.issue_title}</p>
                            {j.call_type && (
                              <span className="inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                                {j.call_type}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-blue-700">
                            {formatKm(gKm)}
                          </td>
                          <td className="px-4 py-3 text-center font-extrabold text-slate-900">
                            {formatKm(mKm)}
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-200">
                              ₹{petrolAllowance}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap text-slate-600">
                            {j.travel_started_at && j.reached_at ? formatDuration(j.travel_started_at, j.reached_at) : '—'}
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <StatusBadge status={j.status as any} job={j} />
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => downloadCallReportPdf(j)}
                                className="rounded-lg bg-blue-50 p-1.5 text-blue-700 hover:bg-blue-100 transition border border-blue-200"
                                title="Download ICS Call PDF"
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </button>
                              <a
                                href={`/admin/jobs/${j.id}`}
                                className="rounded-lg bg-slate-100 p-1.5 text-slate-700 hover:bg-slate-200 transition"
                                title="View Job"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
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
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 2. CALL REPORT - WEEKLY REPORT */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {activeTab === 'weekly_calls' && (
        <div className="space-y-5">
          {/* Week Selector Bar */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase">Select Week:</span>
              <button
                type="button"
                onClick={() => setSelectedWeeklyMode('current_7')}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                  selectedWeeklyMode === 'current_7'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => setSelectedWeeklyMode('this_week')}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                  selectedWeeklyMode === 'this_week'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Current Calendar Week (Mon - Sun)
              </button>
              <button
                type="button"
                onClick={() => setSelectedWeeklyMode('prev_week')}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                  selectedWeeklyMode === 'prev_week'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Previous Calendar Week
              </button>
            </div>

            <span className="text-xs font-bold text-slate-700 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              📅 {weeklyBounds.start.toLocaleDateString('en-IN')} — {weeklyBounds.end.toLocaleDateString('en-IN')}
            </span>
          </div>

          {/* Weekly KPI Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Weekly Calls</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{weeklyStats.total}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Completed</p>
              <p className="mt-1 text-2xl font-black text-emerald-700">{weeklyStats.completed}</p>
              <p className="text-[10px] text-emerald-600 font-bold mt-0.5">{weeklyStats.completionRate}% Done</p>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">In Progress</p>
              <p className="mt-1 text-2xl font-black text-blue-700">{weeklyStats.inProgress}</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Pending</p>
              <p className="mt-1 text-2xl font-black text-amber-700">{weeklyStats.pending}</p>
            </div>
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Weekly Road KM</p>
              <p className="mt-1 text-2xl font-black text-indigo-900">{formatKm(weeklyStats.roadKm)}</p>
            </div>
            <div className="rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Petrol Allowance</p>
                <Fuel className="h-3.5 w-3.5 text-emerald-600" />
              </div>
              <p className="mt-1 text-2xl font-black text-emerald-900">₹{weeklyStats.petrolAllowance.toFixed(2)}</p>
              <p className="text-[10px] text-emerald-700 font-semibold">@ ₹2.75 / KM</p>
            </div>
          </div>

          {/* 7-Day Day-by-Day Performance Strip */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-sm text-slate-800 uppercase mb-3 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-indigo-600" />
              7-Day Call Volume & Travel Breakdown
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
              {weeklyStats.daysBreakdown.map((d) => (
                <div
                  key={d.dateStr}
                  className={`rounded-xl p-3 border text-center transition ${
                    d.holiday
                      ? 'border-indigo-300 bg-indigo-50/40'
                      : d.isSunday
                      ? 'border-amber-300 bg-amber-50/40'
                      : 'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  <p className="text-[11px] font-extrabold text-slate-800">
                    {d.dayName} <span className="font-normal text-slate-500">({d.dateStr.slice(5)})</span>
                  </p>
                  {d.holiday && (
                    <span className="mt-1 block text-[9px] font-bold text-indigo-700 bg-indigo-100 rounded px-1 py-0.5 truncate" title={d.holiday.name}>
                      🏛️ {d.holiday.name}
                    </span>
                  )}
                  {d.isSunday && !d.holiday && (
                    <span className="mt-1 block text-[9px] font-bold text-amber-700 bg-amber-100 rounded px-1 py-0.5">
                      Sunday Off
                    </span>
                  )}
                  <p className="mt-2 text-xl font-black text-slate-900">{d.total} calls</p>
                  <p className="text-[10px] font-semibold text-emerald-700">{d.completed} completed</p>
                  <p className="mt-1 text-[10px] text-slate-500 font-medium">{d.roadKm.toFixed(1)} KM</p>
                  <p className="text-[10px] font-extrabold text-emerald-700">₹{d.petrolAllowance.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Engineer Weekly Performance Table */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-indigo-400" />
                <h3 className="text-sm font-bold">Engineer Weekly Call Performance & Road Travel</h3>
              </div>
              <span className="text-xs text-slate-300">
                Rate: <strong>₹{PETROL_RATE_PER_KM.toFixed(2)} / KM</strong>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Engineer Name</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3 text-center">Calls Assigned</th>
                    <th className="px-4 py-3 text-center">Calls Completed</th>
                    <th className="px-4 py-3 text-center">Completion Rate</th>
                    <th className="px-4 py-3 text-center">Weekly Road KM</th>
                    <th className="px-4 py-3 text-center">Weekly Petrol (₹2.75)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {weeklyStats.engineersList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        No calls recorded for this week.
                      </td>
                    </tr>
                  ) : (
                    weeklyStats.engineersList.map((e) => (
                      <tr key={e.engineer.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 font-bold text-slate-900">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                              {e.engineer.full_name.charAt(0)}
                            </div>
                            <span>{e.engineer.full_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{e.engineer.phone || '—'}</td>
                        <td className="px-4 py-3 text-center font-bold text-slate-900">{e.assigned}</td>
                        <td className="px-4 py-3 text-center font-bold text-emerald-700">{e.completed}</td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${
                              e.completionRate >= 80
                                ? 'bg-emerald-100 text-emerald-800'
                                : e.completionRate >= 50
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {e.completionRate}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-extrabold text-slate-900">
                          {formatKm(e.roadKm)}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-800 border border-emerald-200">
                            ₹{e.petrolAllowance.toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 3. CALL REPORT - MONTHLY REPORT INCLUDING ATTENDANCE REPORT */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {activeTab === 'monthly_call_attendance' && (
        <div className="space-y-5">
          {/* Month & Year Selection Bar */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase">Select Month & Year:</span>
              <select
                value={selectedMonthIndex}
                onChange={(e) => setSelectedMonthIndex(Number(e.target.value))}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-purple-600 shadow-sm"
              >
                {monthNames.map((name, idx) => (
                  <option key={name} value={idx}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-purple-600 shadow-sm"
              >
                <option value={2025}>2025</option>
                <option value={2026}>2026</option>
                <option value={2027}>2027</option>
              </select>

              <span className="rounded-full bg-purple-100 text-purple-800 font-bold px-3 py-1 text-xs border border-purple-200">
                🏛️ Tamil Nadu Gazetted Holiday Calendar Active
              </span>
            </div>

            <span className="text-xs font-extrabold text-slate-700">
              Period: {monthNames[selectedMonthIndex]} {selectedYear} ({monthlyCombinedData.daysInMonth} Days)
            </span>
          </div>

          {/* Monthly Executive Overview Metrics Grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <p className="text-[10px] font-bold uppercase text-slate-500">Total Month Calls</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{monthlyCombinedData.totalCalls}</p>
              <p className="mt-0.5 text-[10px] text-emerald-600 font-bold">{monthlyCombinedData.totalCompleted} Completed</p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3.5 shadow-sm">
              <p className="text-[10px] font-bold uppercase text-emerald-700">Shift Present Days</p>
              <p className="mt-1 text-2xl font-black text-emerald-800">{monthlyCombinedData.totalShiftsPresent}</p>
              <p className="mt-0.5 text-[10px] text-emerald-600">Workforce shifts</p>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-3.5 shadow-sm">
              <p className="text-[10px] font-bold uppercase text-amber-700">Late Punches</p>
              <p className="mt-1 text-2xl font-black text-amber-800">{monthlyCombinedData.totalLateArrivals}</p>
              <p className="mt-0.5 text-[10px] text-amber-600">After grace threshold</p>
            </div>

            <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-3.5 shadow-sm">
              <p className="text-[10px] font-bold uppercase text-purple-700">Approved Leaves</p>
              <p className="mt-1 text-2xl font-black text-purple-800">{monthlyCombinedData.totalLeaves}</p>
              <p className="mt-0.5 text-[10px] text-purple-600">Casual / Sick</p>
            </div>

            <div className="rounded-2xl border border-red-200 bg-red-50/50 p-3.5 shadow-sm">
              <p className="text-[10px] font-bold uppercase text-red-700">Absent Days</p>
              <p className="mt-1 text-2xl font-black text-red-800">{monthlyCombinedData.totalAbsent}</p>
              <p className="mt-0.5 text-[10px] text-red-600">Unpunched days</p>
            </div>

            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-3.5 shadow-sm">
              <p className="text-[10px] font-bold uppercase text-indigo-700">Total Road KM</p>
              <p className="mt-1 text-2xl font-black text-indigo-900">{formatKm(monthlyCombinedData.totalRoadKm)}</p>
              <p className="mt-0.5 text-[10px] text-indigo-600">Calls + Returns</p>
            </div>

            <div className="rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50 p-3.5 shadow-sm col-span-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase text-emerald-800">Total Petrol Reimbursement</p>
                <Fuel className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="mt-1 text-2xl font-black text-emerald-900">
                ₹{monthlyCombinedData.totalPetrolAllowance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="mt-0.5 text-[10px] text-emerald-700 font-bold">
                Calculated strictly at ₹{PETROL_RATE_PER_KM.toFixed(2)} / KM for all road travel
              </p>
            </div>
          </div>

          {/* Combined Executive Table (Attendance + Calls + Petrol Reimbursement) */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-purple-400" />
                <h3 className="text-sm font-bold">
                  Combined Monthly Executive Register — {monthNames[selectedMonthIndex]} {selectedYear}
                </h3>
              </div>
              <span className="text-xs text-slate-300">
                {monthlyCombinedData.combinedRows.length} Engineers Audited
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-3.5 py-3 bg-slate-100">Engineer</th>
                    {/* Attendance Group */}
                    <th className="px-2.5 py-3 text-center bg-emerald-50/70 text-emerald-800">Present</th>
                    <th className="px-2.5 py-3 text-center bg-amber-50/70 text-amber-800">Late</th>
                    <th className="px-2.5 py-3 text-center bg-orange-50/70 text-orange-800">HD</th>
                    <th className="px-2.5 py-3 text-center bg-purple-50/70 text-purple-800">Leaves</th>
                    <th className="px-2.5 py-3 text-center bg-indigo-50/70 text-indigo-800" title="Tamil Nadu Gazetted Govt Holidays">GH (TN)</th>
                    <th className="px-2.5 py-3 text-center bg-slate-100 text-slate-700" title="Sunday Weekly Offs">WO</th>
                    <th className="px-2.5 py-3 text-center bg-red-50/70 text-red-800">Absent</th>
                    <th className="px-2.5 py-3 text-center bg-slate-100 text-slate-700">Att %</th>
                    {/* Calls Group */}
                    <th className="px-2.5 py-3 text-center bg-blue-50/70 text-blue-800">Calls Done</th>
                    <th className="px-2.5 py-3 text-center bg-blue-50/70 text-blue-800">Pending</th>
                    <th className="px-2.5 py-3 text-center bg-blue-50/70 text-blue-800">Call %</th>
                    {/* Road Travel & Petrol Group */}
                    <th className="px-3 py-3 text-center bg-slate-100">Calls KM</th>
                    <th className="px-3 py-3 text-center bg-slate-100">Return KM</th>
                    <th className="px-3 py-3 text-center bg-slate-200 font-extrabold">Net KM</th>
                    <th className="px-3.5 py-3 text-center bg-emerald-100 text-emerald-900 font-black">
                      Petrol (₹2.75)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {monthlyCombinedData.combinedRows.length === 0 ? (
                    <tr>
                      <td colSpan={16} className="px-4 py-8 text-center text-slate-400">
                        No engineers found.
                      </td>
                    </tr>
                  ) : (
                    monthlyCombinedData.combinedRows.map((row) => (
                      <tr key={row.engineer.id} className="hover:bg-slate-50 transition">
                        {/* Engineer */}
                        <td className="px-3.5 py-3 font-bold text-slate-900 whitespace-nowrap bg-white">
                          <p>{row.engineer.full_name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {row.engineer.employee_id || `EMP-${row.engineer.id.slice(0, 5).toUpperCase()}`}
                          </p>
                        </td>

                        {/* Attendance */}
                        <td className="px-2.5 py-3 text-center font-bold text-emerald-700 bg-emerald-50/20">
                          {row.presentDays}
                        </td>
                        <td className="px-2.5 py-3 text-center font-bold text-amber-700 bg-amber-50/20">
                          {row.lateDays}
                        </td>
                        <td className="px-2.5 py-3 text-center font-bold text-orange-700 bg-orange-50/20">
                          {row.halfDays}
                        </td>
                        <td className="px-2.5 py-3 text-center font-bold text-purple-700 bg-purple-50/20">
                          {row.leaveDays}
                        </td>
                        <td className="px-2.5 py-3 text-center font-bold text-indigo-700 bg-indigo-50/30">
                          {row.govtHolidayDays}
                        </td>
                        <td className="px-2.5 py-3 text-center font-bold text-slate-600 bg-slate-50/50">
                          {row.weeklyOffDays}
                        </td>
                        <td className="px-2.5 py-3 text-center font-bold text-red-600 bg-red-50/20">
                          {row.absentDays}
                        </td>
                        <td className="px-2.5 py-3 text-center whitespace-nowrap font-bold text-slate-800">
                          {row.attendanceRate}%
                        </td>

                        {/* Calls */}
                        <td className="px-2.5 py-3 text-center font-bold text-blue-700 bg-blue-50/20">
                          {row.completedCalls} / {row.totalCalls}
                        </td>
                        <td className="px-2.5 py-3 text-center font-bold text-amber-700 bg-blue-50/20">
                          {row.pendingCalls}
                        </td>
                        <td className="px-2.5 py-3 text-center whitespace-nowrap font-bold text-slate-800">
                          {row.callCompletionRate}%
                        </td>

                        {/* Road Travel & Petrol */}
                        <td className="px-3 py-3 text-center text-slate-700">
                          {row.callRoadKm.toFixed(1)}
                        </td>
                        <td className="px-3 py-3 text-center text-slate-700">
                          {row.returnOfficeKm.toFixed(1)}
                        </td>
                        <td className="px-3 py-3 text-center font-black text-slate-900 bg-slate-50">
                          {row.totalTravelKm.toFixed(1)} KM
                        </td>
                        <td className="px-3.5 py-3 text-center font-black text-emerald-800 bg-emerald-50/60 whitespace-nowrap">
                          ₹{row.petrolAllowance.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 4. PETROL CONVENIENCE REPORT PER KM 2.75RS */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {activeTab === 'petrol_convenience' && (
        <div className="space-y-5">
          {/* Policy Banner */}
          <div className="rounded-2xl border border-emerald-300 bg-gradient-to-r from-emerald-600 via-teal-700 to-slate-900 p-5 text-white shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Fuel className="h-6 w-6 text-emerald-300" />
                <h2 className="text-lg font-black tracking-tight">Official Petrol & Travel Convenience Allowance</h2>
              </div>
              <p className="text-xs text-emerald-100 mt-1 max-w-2xl">
                Reimbursement strictly calculated at <strong>₹{PETROL_RATE_PER_KM.toFixed(2)} per KM</strong> covering all verified service calls, field customer inspections, and return-to-office travel.
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm border border-white/20 text-center shrink-0">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-200">Reimbursement Rate</p>
              <p className="text-2xl font-black text-white">₹{PETROL_RATE_PER_KM.toFixed(2)} / KM</p>
            </div>
          </div>

          {/* Period Selection Controls */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase">Period:</span>
              <button
                type="button"
                onClick={() => setRange('today')}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                  range === 'today' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setRange('week')}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                  range === 'week' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => setRange('month')}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                  range === 'month' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Last 30 Days
              </button>
              <button
                type="button"
                onClick={() => setRange('custom')}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                  range === 'custom' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Custom Range
              </button>

              {range === 'custom' && (
                <div className="flex items-center gap-2 ml-2">
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="rounded-xl border border-slate-300 px-2.5 py-1 text-xs font-semibold"
                  />
                  <span className="text-xs text-slate-400">to</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="rounded-xl border border-slate-300 px-2.5 py-1 text-xs font-semibold"
                  />
                </div>
              )}
            </div>

            <select
              value={engFilter}
              onChange={(e) => setEngFilter(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-emerald-600"
            >
              <option value="all">👨‍🔧 Filter by Engineer (All)</option>
              {branchEngineers.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                </option>
              ))}
            </select>
          </div>

          {/* Petrol Summary KPI Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Travel Road KM</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{formatKm(petrolConvenienceData.totalKm)}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Calls & Return journeys</p>
            </div>

            <div className="rounded-2xl border border-emerald-300 bg-emerald-50/70 p-4 shadow-sm col-span-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Total Reimbursement Payable</p>
                <Fuel className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="mt-1 text-3xl font-black text-emerald-900">
                ₹{petrolConvenienceData.totalPetrolAllowance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-emerald-700 font-bold mt-0.5">
                {petrolConvenienceData.totalKm.toFixed(1)} KM × ₹{PETROL_RATE_PER_KM.toFixed(2)} / KM
              </p>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Total Field Trips</p>
              <p className="mt-1 text-2xl font-black text-blue-900">{petrolConvenienceData.totalTrips}</p>
              <p className="text-[10px] text-blue-600 mt-0.5">Visits logged</p>
            </div>

            <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700">Active Field Engineers</p>
              <p className="mt-1 text-2xl font-black text-purple-900">{petrolConvenienceData.activeEngineersCount}</p>
              <p className="text-[10px] text-purple-600 mt-0.5">Eligible for payout</p>
            </div>
          </div>

          {/* Engineer Petrol Convenience Statement Table */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Fuel className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-bold">Engineer Petrol Convenience Statement & Payout Summary</h3>
              </div>
              <span className="text-xs text-emerald-300 font-bold">
                Rate: ₹{PETROL_RATE_PER_KM.toFixed(2)} / KM
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Engineer Name</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3 text-center">Call Trips & KM</th>
                    <th className="px-4 py-3 text-center">Office Return Trips & KM</th>
                    <th className="px-4 py-3 text-center font-black text-slate-800">Total Road KM</th>
                    <th className="px-4 py-3 text-center font-black text-emerald-800">Reimbursement (₹2.75)</th>
                    <th className="px-4 py-3 text-center">Field Days</th>
                    <th className="px-4 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {petrolConvenienceData.engineerStatements.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                        No field travel records logged in this period.
                      </td>
                    </tr>
                  ) : (
                    petrolConvenienceData.engineerStatements.map((e) => (
                      <tr key={e.engineer.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 font-bold text-slate-900">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white">
                              {e.engineer.full_name.charAt(0)}
                            </div>
                            <div>
                              <p>{e.engineer.full_name}</p>
                              <p className="text-[10px] text-slate-400 font-mono">
                                {e.engineer.employee_id || `EMP-${e.engineer.id.slice(0, 5).toUpperCase()}`}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{e.engineer.phone || '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <p className="font-bold text-slate-900">{e.callKm.toFixed(1)} KM</p>
                          <p className="text-[10px] text-slate-400">{e.callTrips} visits</p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <p className="font-bold text-slate-900">{e.returnKm.toFixed(1)} KM</p>
                          <p className="text-[10px] text-slate-400">{e.returnTrips} returns</p>
                        </td>
                        <td className="px-4 py-3 text-center font-black text-slate-900 text-sm bg-slate-50">
                          {e.totalKm.toFixed(1)} KM
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap bg-emerald-50/70">
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-900 border border-emerald-300">
                            ₹{e.totalPetrolAllowance.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-slate-700">
                          {e.activeDates.size} days
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2.5 py-0.5 border border-emerald-200">
                            ✓ Ready
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detailed Day-by-Day Travel & Petrol Convenience Audit Log */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-100 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Itemized Travel Log & Trip Kilometer Verification
              </h3>
              <span className="text-xs text-slate-500 font-semibold">
                {petrolConvenienceData.allTrips.length} Verified Trips
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Trip Type</th>
                    <th className="px-4 py-3">Reference #</th>
                    <th className="px-4 py-3">Engineer</th>
                    <th className="px-4 py-3">Destination / Client</th>
                    <th className="px-4 py-3 text-center">Duration</th>
                    <th className="px-4 py-3 text-center font-bold">Distance (KM)</th>
                    <th className="px-4 py-3 text-right font-black text-emerald-800">Petrol (₹2.75)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {petrolConvenienceData.allTrips.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                        No trips found.
                      </td>
                    </tr>
                  ) : (
                    petrolConvenienceData.allTrips.map((trip) => (
                      <tr key={trip.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{trip.date}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {trip.type === 'Service Call' ? (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                              Service Call
                            </span>
                          ) : (
                            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                              Return Office
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">{trip.refNo}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{trip.engineerName}</td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <p className="truncate font-medium text-slate-900">{trip.destination}</p>
                          <p className="text-[10px] text-slate-400 truncate">{trip.address}</p>
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap text-slate-600">{trip.durationFormatted}</td>
                        <td className="px-4 py-3 text-center font-extrabold text-slate-900">
                          {trip.distanceKm.toFixed(1)} KM
                        </td>
                        <td className="px-4 py-3 text-right font-black text-emerald-700 whitespace-nowrap">
                          ₹{trip.petrolAllowance.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 5. RETURN TO OFFICE TRIPS */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {activeTab === 'return_to_office' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Total Return Trips</p>
              <p className="mt-1 text-2xl font-extrabold text-indigo-900">{returnOfficeStats.totalTrips}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Reached Office</p>
              <p className="mt-1 text-2xl font-extrabold text-emerald-600">{returnOfficeStats.reachedCount}</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-700">In Transit</p>
              <p className="mt-1 text-2xl font-extrabold text-amber-600">{returnOfficeStats.inTransitCount}</p>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Total Return KM</p>
              <p className="mt-1 text-2xl font-extrabold text-blue-900">{formatKm(returnOfficeStats.totalReturnKm)}</p>
            </div>
            <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-purple-700">Avg Return KM</p>
              <p className="mt-1 text-2xl font-extrabold text-purple-900">{returnOfficeStats.avgKm} KM</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Travel Time</p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">{returnOfficeStats.totalTimeFormatted}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-800">
                  Engineer Return to Office Log & KM Variance
                </h3>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                {filteredReturnRecords.length} records
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3.5">Date</th>
                    <th className="px-4 py-3.5">Engineer</th>
                    <th className="px-4 py-3.5">Departed From</th>
                    <th className="px-4 py-3.5">Destination</th>
                    <th className="px-4 py-3.5 text-center">Departure Time</th>
                    <th className="px-4 py-3.5 text-center">Office Arrival Time</th>
                    <th className="px-4 py-3.5 text-center">Travel Duration</th>
                    <th className="px-4 py-3.5 text-center">Return Distance (KM)</th>
                    <th className="px-4 py-3.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredReturnRecords.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                        <Building2 className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                        <p className="font-semibold text-slate-600">No return to office records found</p>
                      </td>
                    </tr>
                  ) : (
                    filteredReturnRecords.map((r, idx) => (
                      <tr key={`${r.attendanceId}-${idx}`} className="hover:bg-slate-50/70 transition">
                        <td className="px-4 py-3 text-xs font-semibold text-slate-700 whitespace-nowrap">
                          {r.date}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="text-xs font-bold text-slate-900">{r.engineerName}</p>
                          {r.engineerPhone && <p className="text-[11px] text-slate-400">{r.engineerPhone}</p>}
                        </td>
                        <td className="px-4 py-3 max-w-[220px]">
                          <div className="flex items-start gap-1.5 text-xs text-slate-700">
                            <MapPin className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
                            <span className="truncate">{r.departureAddress || 'Field Location'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                            <Building2 className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                            <span className="truncate">{r.destinationAddress}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            <Clock className="h-3 w-3 text-slate-500" />
                            {new Date(r.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {r.reachedAt ? (
                            <div className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              {new Date(r.reachedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          ) : (
                            <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
                              In Transit
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-800">
                            <Clock className="h-3 w-3 text-slate-500" />
                            {r.durationFormatted}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-extrabold text-indigo-700 border border-indigo-200 shadow-sm">
                            <Car className="h-3.5 w-3.5 text-indigo-600" />
                            {r.returnKm.toFixed(1)} KM
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {r.status === 'reached' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              Reached Office
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                              <Navigation className="h-3 w-3 text-amber-600 animate-spin" />
                              In Transit
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 6. VENDOR HANDOVER & FOLLOW-UP REPORT */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {activeTab === 'vendor_handover' && (
        <VendorHandoverReportView
          jobs={branchJobs}
          engineers={branchEngineers}
          clients={branchClients}
          vendors={vendors}
          onRefresh={load}
          onSelectJob={(id) => {
            const found = branchJobs.find((x) => x.id === id);
            if (found) onViewJob?.(found);
          }}
        />
      )}
    </div>
  );
}
