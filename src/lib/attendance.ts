import type { DutyAttendance, DutyAttendanceStatus, LeaveRequest, AttendancePolicyConfig, Profile } from '@/types/database';
import { supabase } from '@/lib/supabase';

/**
 * Enterprise Attendance & Leave Module — Supabase cloud persistence + resilient in-memory cache.
 * Supports shift tracking, late detection, half-day/present determination, GPS geocoding,
 * travel & food allowances, leave requests, regularization, and HR matrix exports.
 */

export const DEFAULT_ATTENDANCE_POLICY: AttendancePolicyConfig = {
  id: 'default_policy',
  shift_start_time: '09:00',
  shift_end_time: '18:30',
  grace_period_minutes: 15,
  half_day_min_hours: 4.5,
  full_day_min_hours: 8.0,
  rate_per_km: 6.0,
  daily_food_allowance: 100.0,
  weekly_off_days: [0], // 0 = Sunday
};

// ─── In-memory cache & event emission ───
let cachedAttendances: DutyAttendance[] = [];
let cachedLeaveRequests: LeaveRequest[] = [];
let cachedPolicy: AttendancePolicyConfig = DEFAULT_ATTENDANCE_POLICY;
let cacheReady = false;

export function emitAttendanceChange() {
  window.dispatchEvent(new Event('ics-attendance-updated'));
}

export function emitLeaveChange() {
  window.dispatchEvent(new Event('ics-leaves-updated'));
}

// ─── Reverse Geocoding Helper ───
export async function getReadableAddress(lat: number, lng: number): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      const addr = data.address;
      if (addr) {
        const parts = [
          addr.suburb || addr.neighbourhood || addr.road || addr.village,
          addr.city || addr.town || addr.county,
          addr.state_district || addr.state,
        ].filter(Boolean);
        if (parts.length > 0) return parts.join(', ');
      }
      if (data.display_name) {
        return data.display_name.split(',').slice(0, 3).join(', ');
      }
    }
  } catch {
    // fallback
  }
  return `GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

// ─── Policy Helpers ───
let policyTableExists = true;

export async function fetchAttendancePolicy(): Promise<AttendancePolicyConfig> {
  if (!policyTableExists) return cachedPolicy;
  try {
    const { data, error } = await supabase
      .from('attendance_policy')
      .select('*')
      .eq('id', 'default_policy')
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116' || error.code === '42P01' || error.message?.includes('does not exist')) {
        policyTableExists = false;
      }
      return cachedPolicy;
    }
    if (data) {
      cachedPolicy = { ...DEFAULT_ATTENDANCE_POLICY, ...(data as AttendancePolicyConfig) };
      return cachedPolicy;
    }
  } catch {
    policyTableExists = false;
  }
  return cachedPolicy;
}

export function getCachedPolicy(): AttendancePolicyConfig {
  return cachedPolicy;
}

export async function saveAttendancePolicy(policy: Partial<AttendancePolicyConfig>): Promise<AttendancePolicyConfig> {
  const updated: AttendancePolicyConfig = { ...cachedPolicy, ...policy, id: 'default_policy' };
  try {
    const { data, error } = await supabase
      .from('attendance_policy')
      .upsert(updated)
      .select()
      .single();

    if (!error && data) {
      cachedPolicy = data as AttendancePolicyConfig;
      policyTableExists = true;
    } else {
      cachedPolicy = updated;
    }
  } catch {
    cachedPolicy = updated;
  }
  emitAttendanceChange();
  return cachedPolicy;
}

// ─── Attendance Calculation Engine ───
export function calculatePunchMetrics(
  punchInIso: string,
  punchOutIso?: string | null,
  totalKm: number = 0,
  policy: AttendancePolicyConfig = cachedPolicy
): {
  isLate: boolean;
  totalWorkMinutes: number;
  overtimeMinutes: number;
  isHalfDay: boolean;
  travelAllowance: number;
  foodAllowance: number;
  calculatedStatus: DutyAttendanceStatus;
} {
  const punchInDate = new Date(punchInIso);
  const [shiftHour, shiftMinute] = policy.shift_start_time.split(':').map(Number);
  
  // Grace threshold
  const graceLimitMinutes = shiftHour * 60 + shiftMinute + (policy.grace_period_minutes || 15);
  const punchInMinutes = punchInDate.getHours() * 60 + punchInDate.getMinutes();
  const isLate = punchInMinutes > graceLimitMinutes;

  let totalWorkMinutes = 0;
  let overtimeMinutes = 0;
  let isHalfDay = false;
  let calculatedStatus: DutyAttendanceStatus = 'on_duty';

  if (punchOutIso) {
    const punchOutDate = new Date(punchOutIso);
    const diffMs = punchOutDate.getTime() - punchInDate.getTime();
    totalWorkMinutes = Math.max(1, Math.floor(diffMs / 60000));

    const standardShiftMinutes = (policy.full_day_min_hours || 8.0) * 60;
    const halfDayMinutes = (policy.half_day_min_hours || 4.5) * 60;

    if (totalWorkMinutes < halfDayMinutes) {
      isHalfDay = true;
      calculatedStatus = 'half_day';
    } else if (totalWorkMinutes < standardShiftMinutes) {
      isHalfDay = true;
      calculatedStatus = 'half_day';
    } else {
      isHalfDay = false;
      calculatedStatus = isLate ? 'late' : 'present';
      if (totalWorkMinutes > standardShiftMinutes) {
        overtimeMinutes = totalWorkMinutes - standardShiftMinutes;
      }
    }
  } else {
    calculatedStatus = isLate ? 'late' : 'on_duty';
  }

  const travelAllowance = Math.round(totalKm * (policy.rate_per_km || 6.0));
  const foodAllowance = policy.daily_food_allowance || 100.0;

  return {
    isLate,
    totalWorkMinutes,
    overtimeMinutes,
    isHalfDay,
    travelAllowance,
    foodAllowance,
    calculatedStatus,
  };
}

// ─── Read helpers ───
export async function fetchAllAttendances(): Promise<DutyAttendance[]> {
  cacheReady = true;
  try {
    const { data, error } = await supabase
      .from('duty_attendance')
      .select('*')
      .order('date', { ascending: false })
      .order('punch_in_at', { ascending: false });

    if (error) {
      return cachedAttendances;
    }
    cachedAttendances = (data as unknown as DutyAttendance[]) || [];
    return cachedAttendances;
  } catch {
    return cachedAttendances;
  }
}

export function getAllAttendances(): DutyAttendance[] {
  if (!cacheReady) {
    fetchAllAttendances().then(emitAttendanceChange);
  }
  return cachedAttendances;
}

export async function fetchTodayAttendance(engineerId: string): Promise<DutyAttendance | null> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('duty_attendance')
      .select('*')
      .eq('engineer_id', engineerId)
      .eq('date', today)
      .maybeSingle();

    if (error) return null;
    return (data as unknown as DutyAttendance) || null;
  } catch {
    return null;
  }
}

export function getTodayAttendance(engineerId: string): DutyAttendance | null {
  const today = new Date().toISOString().split('T')[0];
  return cachedAttendances.find((a) => a.engineer_id === engineerId && a.date === today) || null;
}

// ─── Write Operations ───

export async function punchInDuty(
  engineerId: string,
  coords?: { latitude: number; longitude: number } | null
): Promise<DutyAttendance> {
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();
  const policy = await fetchAttendancePolicy();

  let addressText = 'Field Office';
  if (coords) {
    addressText = await getReadableAddress(coords.latitude, coords.longitude);
  }

  const { isLate } = calculatePunchMetrics(now, null, 0, policy);

  // Check if already punched in today
  const existing = await fetchTodayAttendance(engineerId);
  if (existing) {
    const updates: Partial<DutyAttendance> = {
      punch_in_latitude: coords?.latitude ?? existing.punch_in_latitude,
      punch_in_longitude: coords?.longitude ?? existing.punch_in_longitude,
      punch_in_address: addressText || existing.punch_in_address,
      status: 'on_duty',
      is_late: isLate,
    };

    const { data } = await supabase
      .from('duty_attendance')
      .update(updates)
      .eq('id', existing.id)
      .select()
      .single();

    const updated = (data as unknown as DutyAttendance) || { ...existing, ...updates };
    emitAttendanceChange();
    return updated;
  }

  // New punch-in record
  const newId = crypto.randomUUID();
  const newAttendance: DutyAttendance = {
    id: newId,
    engineer_id: engineerId,
    date: today,
    punch_in_at: now,
    punch_in_latitude: coords?.latitude ?? null,
    punch_in_longitude: coords?.longitude ?? null,
    punch_in_address: addressText,
    work_shift: `General Shift (${policy.shift_start_time} - ${policy.shift_end_time})`,
    is_late: isLate,
    food_allowance: policy.daily_food_allowance,
    travel_allowance: 0,
    total_km: 0,
    status: isLate ? 'late' : 'on_duty',
  };

  const { data, error } = await supabase
    .from('duty_attendance')
    .insert(newAttendance)
    .select()
    .single();

  if (error) {
    console.error('Punch-in sync notice:', error.message);
  }

  const result = (data as unknown as DutyAttendance) || newAttendance;
  emitAttendanceChange();
  return result;
}

export async function punchOutDuty(
  engineerId: string,
  totalDayKm: number = 0,
  coords?: { latitude: number; longitude: number } | null
): Promise<DutyAttendance | null> {
  const existing = await fetchTodayAttendance(engineerId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const policy = await fetchAttendancePolicy();

  let addressText = existing.punch_out_address || 'Field Location';
  if (coords) {
    addressText = await getReadableAddress(coords.latitude, coords.longitude);
  }

  const metrics = calculatePunchMetrics(existing.punch_in_at, now, totalDayKm, policy);

  const updates: Partial<DutyAttendance> = {
    punch_out_at: now,
    punch_out_latitude: coords?.latitude ?? null,
    punch_out_longitude: coords?.longitude ?? null,
    punch_out_address: addressText,
    total_work_minutes: metrics.totalWorkMinutes,
    overtime_minutes: metrics.overtimeMinutes,
    total_km: totalDayKm,
    travel_allowance: metrics.travelAllowance,
    food_allowance: metrics.foodAllowance,
    is_late: metrics.isLate,
    is_half_day: metrics.isHalfDay,
    status: metrics.calculatedStatus === 'on_duty' ? 'punched_out' : metrics.calculatedStatus,
  };

  const { data, error } = await supabase
    .from('duty_attendance')
    .update(updates)
    .eq('id', existing.id)
    .select()
    .single();

  if (error) {
    console.error('Punch-out sync notice:', error.message);
  }

  const result = (data as unknown as DutyAttendance) || { ...existing, ...updates };
  emitAttendanceChange();
  return result;
}

// ─── Manual Admin Adjustments & Regularization ───

export async function manualSaveAttendance(attendance: Partial<DutyAttendance> & { engineer_id: string; date: string }): Promise<DutyAttendance> {
  const policy = await fetchAttendancePolicy();
  const punchInAt = attendance.punch_in_at || `${attendance.date}T${policy.shift_start_time}:00.000Z`;
  const punchOutAt = attendance.punch_out_at || (attendance.status === 'present' || attendance.status === 'punched_out' ? `${attendance.date}T${policy.shift_end_time}:00.000Z` : null);
  
  const km = attendance.total_km || 0;
  const metrics = calculatePunchMetrics(punchInAt, punchOutAt, km, policy);

  const fullRecord: DutyAttendance = {
    id: attendance.id || crypto.randomUUID(),
    engineer_id: attendance.engineer_id,
    date: attendance.date,
    punch_in_at: punchInAt,
    punch_in_address: attendance.punch_in_address || 'Admin Manual Entry',
    punch_out_at: punchOutAt,
    punch_out_address: attendance.punch_out_address || (punchOutAt ? 'Admin Manual Entry' : null),
    work_shift: attendance.work_shift || `General Shift (${policy.shift_start_time} - ${policy.shift_end_time})`,
    total_work_minutes: attendance.total_work_minutes ?? metrics.totalWorkMinutes,
    overtime_minutes: attendance.overtime_minutes ?? metrics.overtimeMinutes,
    total_km: km,
    travel_allowance: attendance.travel_allowance ?? metrics.travelAllowance,
    food_allowance: attendance.food_allowance ?? metrics.foodAllowance,
    is_late: attendance.is_late ?? metrics.isLate,
    is_half_day: attendance.is_half_day ?? metrics.isHalfDay,
    is_regularized: true,
    regularized_reason: attendance.regularized_reason || 'Admin adjustment',
    admin_notes: attendance.admin_notes || null,
    status: attendance.status || metrics.calculatedStatus,
  };

  // Base fallback record in case optional columns are not yet migrated in Supabase
  const baseRecord = {
    id: fullRecord.id,
    engineer_id: fullRecord.engineer_id,
    date: fullRecord.date,
    punch_in_at: fullRecord.punch_in_at,
    punch_in_address: fullRecord.punch_in_address,
    punch_out_at: fullRecord.punch_out_at,
    punch_out_address: fullRecord.punch_out_address,
    total_work_minutes: fullRecord.total_work_minutes,
    total_km: fullRecord.total_km,
    status: fullRecord.status === 'late' ? 'on_duty' : fullRecord.status === 'present' ? 'punched_out' : fullRecord.status,
  };

  try {
    const { data, error } = await supabase
      .from('duty_attendance')
      .upsert(fullRecord)
      .select()
      .single();

    if (!error && data) {
      const result = data as unknown as DutyAttendance;
      emitAttendanceChange();
      return result;
    }

    if (error) {
      // If error is due to missing columns in live Supabase, retry with base columns
      const { data: baseData } = await supabase
        .from('duty_attendance')
        .upsert(baseRecord)
        .select()
        .single();

      const result = (baseData as unknown as DutyAttendance) || fullRecord;
      emitAttendanceChange();
      return result;
    }
  } catch {
    // fallback
  }

  emitAttendanceChange();
  return fullRecord;
}

export async function deleteAttendanceRecord(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('duty_attendance').delete().eq('id', id);
    if (!error) {
      cachedAttendances = cachedAttendances.filter((a) => a.id !== id);
      emitAttendanceChange();
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

// ─── Leave Requests Module ───
let leaveTableExists = true;

export async function fetchAllLeaveRequests(): Promise<LeaveRequest[]> {
  if (!leaveTableExists) return cachedLeaveRequests;
  try {
    const [{ data: lData, error: lErr }, { data: pData }] = await Promise.all([
      supabase.from('leave_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('role', 'engineer'),
    ]);

    if (lErr) {
      if (lErr.code === '42P01' || lErr.code === 'PGRST116' || lErr.message?.includes('does not exist')) {
        leaveTableExists = false;
      }
      return cachedLeaveRequests;
    }

    const engMap = new Map<string, Profile>();
    ((pData as unknown as Profile[]) || []).forEach((p) => engMap.set(p.id, p));

    const leaves = ((lData as unknown as LeaveRequest[]) || []).map((l) => ({
      ...l,
      engineer: engMap.get(l.engineer_id) || null,
    }));

    cachedLeaveRequests = leaves;
    return leaves;
  } catch {
    leaveTableExists = false;
    return cachedLeaveRequests;
  }
}

export async function submitLeaveRequest(
  engineerId: string,
  leaveType: LeaveRequest['leave_type'],
  startDate: string,
  endDate: string,
  reason: string
): Promise<LeaveRequest> {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  const newLeave: LeaveRequest = {
    id: crypto.randomUUID(),
    engineer_id: engineerId,
    leave_type: leaveType,
    start_date: startDate,
    end_date: endDate,
    total_days: leaveType === 'half_day' ? 0.5 : diffDays,
    reason: reason.trim(),
    status: 'pending',
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('leave_requests')
    .insert(newLeave)
    .select()
    .single();

  if (error) {
    console.error('Leave submit notice:', error.message);
  }

  const result = (data as unknown as LeaveRequest) || newLeave;
  emitLeaveChange();
  return result;
}

export async function reviewLeaveRequest(
  leaveId: string,
  status: 'approved' | 'rejected',
  reviewedBy: string,
  adminRemarks?: string
): Promise<LeaveRequest | null> {
  const updates = {
    status,
    reviewed_by: reviewedBy,
    reviewed_at: new Date().toISOString(),
    admin_remarks: adminRemarks?.trim() || null,
  };

  const { data, error } = await supabase
    .from('leave_requests')
    .update(updates)
    .eq('id', leaveId)
    .select()
    .single();

  if (error) {
    console.error('Leave review error:', error.message);
    return null;
  }

  // If approved, optionally create corresponding on_leave records in duty_attendance for each day
  if (status === 'approved' && data) {
    const leave = data as unknown as LeaveRequest;
    const cur = new Date(leave.start_date);
    const end = new Date(leave.end_date);

    while (cur <= end) {
      const dateStr = cur.toISOString().split('T')[0];
      await manualSaveAttendance({
        engineer_id: leave.engineer_id,
        date: dateStr,
        status: leave.leave_type === 'half_day' ? 'half_day' : 'on_leave',
        admin_notes: `Approved ${leave.leave_type.toUpperCase()} leave: ${leave.reason}`,
      });
      cur.setDate(cur.getDate() + 1);
    }
  }

  emitLeaveChange();
  emitAttendanceChange();
  return data as unknown as LeaveRequest;
}

// ─── Monthly Matrix & Aggregation Helpers ───

export interface EngineerMonthlyRow {
  engineer: Profile;
  daysMap: Record<number, DutyAttendance | null>;
  totalDaysInMonth: number;
  presentDays: number;
  lateDays: number;
  halfDays: number;
  absentDays: number;
  leaveDays: number;
  weeklyOffDays: number;
  totalWorkingMinutes: number;
  totalKm: number;
  totalTravelAllowance: number;
  totalFoodAllowance: number;
  totalPayableAllowance: number;
}

export function buildMonthlyAttendanceMatrix(
  year: number,
  month: number, // 0-indexed (0 = Jan, 11 = Dec)
  engineers: Profile[],
  attendances: DutyAttendance[],
  leaves: LeaveRequest[],
  policy: AttendancePolicyConfig = cachedPolicy
): EngineerMonthlyRow[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthStr = String(month + 1).padStart(2, '0');
  const monthPrefix = `${year}-${monthStr}`;

  return engineers.map((eng) => {
    const daysMap: Record<number, DutyAttendance | null> = {};
    let presentDays = 0;
    let lateDays = 0;
    let halfDays = 0;
    let absentDays = 0;
    let leaveDays = 0;
    let weeklyOffDays = 0;
    let totalWorkingMinutes = 0;
    let totalKm = 0;
    let totalTravelAllowance = 0;
    let totalFoodAllowance = 0;

    const engAttendances = attendances.filter(
      (a) => a.engineer_id === eng.id && a.date.startsWith(monthPrefix)
    );

    const engApprovedLeaves = leaves.filter(
      (l) => l.engineer_id === eng.id && l.status === 'approved'
    );

    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = String(day).padStart(2, '0');
      const dateString = `${monthPrefix}-${dayStr}`;
      const dateObj = new Date(year, month, day);
      const isSunday = dateObj.getDay() === 0;

      // Find punch record
      const att = engAttendances.find((a) => a.date === dateString) || null;
      daysMap[day] = att;

      if (att) {
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

        totalWorkingMinutes += att.total_work_minutes || 0;
        totalKm += att.total_km || 0;
        totalTravelAllowance += att.travel_allowance || Math.round((att.total_km || 0) * policy.rate_per_km);
        totalFoodAllowance += att.food_allowance || (att.status !== 'absent' && att.status !== 'on_leave' ? policy.daily_food_allowance : 0);
      } else {
        // No punch record
        const isOnLeave = engApprovedLeaves.some((l) => {
          return dateString >= l.start_date && dateString <= l.end_date;
        });

        if (isOnLeave) {
          leaveDays++;
        } else if (isSunday) {
          weeklyOffDays++;
        } else {
          // If past date in the current month, mark absent
          const todayStr = new Date().toISOString().split('T')[0];
          if (dateString < todayStr) {
            absentDays++;
          }
        }
      }
    }

    return {
      engineer: eng,
      daysMap,
      totalDaysInMonth: daysInMonth,
      presentDays,
      lateDays,
      halfDays,
      absentDays,
      leaveDays,
      weeklyOffDays,
      totalWorkingMinutes,
      totalKm,
      totalTravelAllowance,
      totalFoodAllowance,
      totalPayableAllowance: totalTravelAllowance + totalFoodAllowance,
    };
  });
}

// ─── Export Generators (CSV / HR Register) ───

export function exportMonthlyRegisterCsv(
  matrix: EngineerMonthlyRow[],
  year: number,
  month: number
) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'long' });

  // Day columns: 1, 2, ..., 31
  const dayHeaders = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`);

  const headers = [
    'Emp ID',
    'Engineer Name',
    'Phone',
    ...dayHeaders,
    'Present Days',
    'Late Days',
    'Half Days',
    'Leaves',
    'Absent',
    'Total Hours',
    'Total KM',
    'Travel Allowance (₹)',
    'Food DA (₹)',
    'Total Reimbursement (₹)',
  ];

  const rows = matrix.map((row) => {
    const dayCells = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const att = row.daysMap[day];
      if (!att) {
        const dateObj = new Date(year, month, day);
        return dateObj.getDay() === 0 ? 'WO' : '-';
      }
      switch (att.status) {
        case 'present':
        case 'punched_out':
          return 'P';
        case 'on_duty':
          return 'OD';
        case 'late':
          return 'L';
        case 'half_day':
          return 'HD';
        case 'on_leave':
          return 'LV';
        case 'absent':
          return 'A';
        case 'weekly_off':
          return 'WO';
        default:
          return 'P';
      }
    });

    const hours = (row.totalWorkingMinutes / 60).toFixed(1);

    return [
      row.engineer.employee_id || `EMP-${row.engineer.id.slice(0, 5).toUpperCase()}`,
      row.engineer.full_name,
      row.engineer.phone || '—',
      ...dayCells,
      row.presentDays,
      row.lateDays,
      row.halfDays,
      row.leaveDays,
      row.absentDays,
      hours,
      row.totalKm.toFixed(1),
      row.totalTravelAllowance,
      row.totalFoodAllowance,
      row.totalPayableAllowance,
    ];
  });

  const csvContent = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ICS-Attendance-Register-${monthName}-${year}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportAllowancePayrollCsv(
  matrix: EngineerMonthlyRow[],
  year: number,
  month: number,
  policy: AttendancePolicyConfig = cachedPolicy
) {
  const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'long' });

  const headers = [
    'Emp ID',
    'Engineer Name',
    'Phone',
    'Working Days Present',
    'Total Field KM',
    `Travel Rate (₹/KM)`,
    'Calculated Travel Allowance (₹)',
    `Daily Food DA Rate (₹/Day)`,
    'Total Food DA (₹)',
    'Total Payable Reimbursement (₹)',
  ];

  const rows = matrix.map((row) => [
    row.engineer.employee_id || `EMP-${row.engineer.id.slice(0, 5).toUpperCase()}`,
    row.engineer.full_name,
    row.engineer.phone || '—',
    row.presentDays,
    row.totalKm.toFixed(1),
    policy.rate_per_km,
    row.totalTravelAllowance,
    policy.daily_food_allowance,
    row.totalFoodAllowance,
    row.totalPayableAllowance,
  ]);

  const csvContent = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ICS-Travel-Allowance-Statement-${monthName}-${year}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
