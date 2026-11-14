import type { DutyAttendance, DutyAttendanceStatus, LeaveRequest, AttendancePolicyConfig, Profile } from '@/types/database';
import { supabase } from '@/lib/supabase';
import { addAdminNotification } from '@/lib/notifications';

/**
 * Enterprise Attendance & Leave Module — Supabase cloud persistence + resilient in-memory cache.
 * Supports shift tracking, late detection, half-day/present determination, GPS geocoding,
 * leave requests, regularization, and HR matrix exports.
 */

export const DEFAULT_ATTENDANCE_POLICY: AttendancePolicyConfig = {
  id: 'default_policy',
  shift_start_time: '09:00',
  shift_end_time: '18:30',
  auto_punch_out_time: '22:00', // 10:00 PM auto punch-out for missed punch outs
  grace_period_minutes: 15,
  half_day_min_hours: 4.5,
  full_day_min_hours: 8.0,
  weekly_off_days: [0], // 0 = Sunday
  petrol_rate_per_km: 2.50,
};

/**
 * Official Petrol Convenience Reimbursement Rate
 * Default: Rs 2.50 per road KM.
 * Configurable dynamically by Admin in Shift Policy & Petrol Report settings.
 */
export const PETROL_RATE_PER_KM = 2.50;

export const LOCAL_STORAGE_PETROL_RATE_KEY = 'ics_petrol_rate_per_km';

export function getPetrolRate(policy?: AttendancePolicyConfig | null): number {
  if (policy && typeof policy.petrol_rate_per_km === 'number' && policy.petrol_rate_per_km > 0) {
    return policy.petrol_rate_per_km;
  }
  if (cachedPolicy && typeof cachedPolicy.petrol_rate_per_km === 'number' && cachedPolicy.petrol_rate_per_km > 0) {
    return cachedPolicy.petrol_rate_per_km;
  }
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_PETROL_RATE_KEY);
    if (stored) {
      const parsed = parseFloat(stored);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch {
    /* ignore */
  }
  return 2.50;
}

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
      let petrolRate = (data as AttendancePolicyConfig).petrol_rate_per_km;
      if (typeof petrolRate !== 'number' || petrolRate <= 0) {
        try {
          const stored = localStorage.getItem(LOCAL_STORAGE_PETROL_RATE_KEY);
          if (stored) {
            const p = parseFloat(stored);
            if (!isNaN(p) && p > 0) petrolRate = p;
          }
        } catch { /* ignore */ }
      }
      if (!petrolRate || petrolRate <= 0) petrolRate = 2.50;

      cachedPolicy = { ...DEFAULT_ATTENDANCE_POLICY, ...(data as AttendancePolicyConfig), petrol_rate_per_km: petrolRate };
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
  const currentRate = policy.petrol_rate_per_km ?? cachedPolicy.petrol_rate_per_km ?? getPetrolRate();
  try {
    localStorage.setItem(LOCAL_STORAGE_PETROL_RATE_KEY, String(currentRate));
  } catch { /* ignore */ }

  const updated: AttendancePolicyConfig = { ...cachedPolicy, ...policy, petrol_rate_per_km: currentRate, id: 'default_policy' };
  try {
    const { data, error } = await supabase
      .from('attendance_policy')
      .upsert(updated)
      .select()
      .single();

    if (!error && data) {
      cachedPolicy = { ...updated, ...(data as AttendancePolicyConfig), petrol_rate_per_km: currentRate };
      policyTableExists = true;
    } else {
      cachedPolicy = updated;
    }
  } catch {
    cachedPolicy = updated;
  }
  emitAttendanceChange();
  window.dispatchEvent(new CustomEvent('ics-petrol-rate-updated', { detail: { rate: currentRate } }));
  return cachedPolicy;
}

// ─── Attendance Calculation Engine ───
export function isPunchLate(
  punchInIso: string | null | undefined,
  policy: AttendancePolicyConfig = cachedPolicy
): boolean {
  if (!punchInIso) return false;
  try {
    const punchInDate = new Date(punchInIso);
    if (isNaN(punchInDate.getTime())) return false;
    const [shiftHour, shiftMinute] = (policy.shift_start_time || '09:00').split(':').map(Number);
    const graceLimitMinutes = shiftHour * 60 + (shiftMinute || 0) + (policy.grace_period_minutes ?? 15);
    const punchInMinutes = punchInDate.getHours() * 60 + punchInDate.getMinutes();
    return punchInMinutes > graceLimitMinutes;
  } catch {
    return false;
  }
}

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
  calculatedStatus: DutyAttendanceStatus;
} {
  const isLate = isPunchLate(punchInIso, policy);
  const punchInDate = new Date(punchInIso);

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
    } else if (totalWorkMinutes < standardShiftMinutes) {
      isHalfDay = true;
    } else {
      isHalfDay = false;
      if (totalWorkMinutes > standardShiftMinutes) {
        overtimeMinutes = totalWorkMinutes - standardShiftMinutes;
      }
    }
    calculatedStatus = 'punched_out';
  } else {
    calculatedStatus = isLate ? 'late' : 'on_duty';
  }

  return {
    isLate,
    totalWorkMinutes,
    overtimeMinutes,
    isHalfDay,
    calculatedStatus,
  };
}

/**
 * Converts a date string (YYYY-MM-DD) and a local 24-hr time string (HH:mm) into an accurate UTC ISO string.
 */
export function timeToIso(dateStr: string, timeStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  const d = new Date(year, month - 1, day, hours || 0, minutes || 0, 0, 0);
  return d.toISOString();
}

/**
 * Extracts the local 24-hr time string (HH:mm) from an ISO timestamp for HTML5 <input type="time">.
 */
export function isoToTimeString(isoStr?: string | null): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// ─── 10:00 PM Auto Punch-Out Helpers ───

/**
 * Determines whether an attendance record has passed the auto punch-out cutoff time (default 10:00 PM / 22:00).
 */
export function isPastAutoPunchOut(dateStr?: string | null, policy: AttendancePolicyConfig = cachedPolicy): boolean {
  if (!dateStr) return false;
  const todayStr = new Date().toISOString().split('T')[0];
  // Any date prior to today has definitely passed auto punch-out
  if (dateStr < todayStr) return true;
  // Future dates have not passed
  if (dateStr > todayStr) return false;

  const parts = dateStr.split('-');
  if (parts.length !== 3) return false;
  const [year, month, day] = parts.map(Number);
  if (!year || !month || !day) return false;

  const autoTime = policy.auto_punch_out_time || '22:00';
  const [autoHour, autoMinute] = autoTime.split(':').map(Number);

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  return (currentHour > autoHour) || (currentHour === autoHour && currentMinute >= autoMinute);
}

/**
 * Returns an ISO timestamp representing the auto punch-out cutoff (e.g. 10:00 PM) on a given record's date.
 */
export function getAutoPunchOutIso(dateStr: string, policy: AttendancePolicyConfig = cachedPolicy): string {
  const parts = dateStr.split('-');
  const [year, month, day] = parts.map(Number);
  const autoTime = policy.auto_punch_out_time || '22:00';
  const [autoHour, autoMinute] = autoTime.split(':').map(Number);

  const d = new Date(year, month - 1, day, autoHour || 22, autoMinute || 0, 0, 0);
  return d.toISOString();
}

/**
 * Checks and auto-punches out any open attendance records where an engineer missed punching out.
 * If current time is past 10:00 PM (or past date) and the record has no punch_out_at or is on_duty,
 * it sets punch_out_at to 10:00 PM, computes shift hours, updates Supabase, and syncs the cache.
 */
export async function autoCloseMissedPunchOuts(records?: DutyAttendance[]): Promise<DutyAttendance[]> {
  const policy = await fetchAttendancePolicy();
  const list = records || cachedAttendances;
  if (!list || list.length === 0) return cachedAttendances;

  const toUpdate: { record: DutyAttendance; dbUpdates: any }[] = [];

  for (const att of list) {
    const isOpen = att.punch_in_at && (!att.punch_out_at || att.status === 'on_duty');
    if (!isOpen || !att.date) continue;

    if (isPastAutoPunchOut(att.date, policy)) {
      const autoPunchOutIso = getAutoPunchOutIso(att.date, policy);
      const punchInDate = new Date(att.punch_in_at);
      const punchOutDate = new Date(autoPunchOutIso);

      const effectivePunchOutIso = punchOutDate.getTime() > punchInDate.getTime()
        ? autoPunchOutIso
        : new Date(punchInDate.getTime() + 60000).toISOString();

      const metrics = calculatePunchMetrics(att.punch_in_at, effectivePunchOutIso, att.total_km || 0, policy);

      const existingNotes = (att.admin_notes || '')
        .replace(/Auto punch-out at 10:00 PM/g, '')
        .replace(/AUTO_PUNCH_OUT:[^\s|]+/g, '')
        .replace(/\|\s*\|/g, '|')
        .trim();
      const autoTag = 'Auto punch-out at 10:00 PM';
      const combinedNotes = existingNotes ? `${existingNotes} | ${autoTag}` : autoTag;

      // Status for local in-memory UI
      const displayStatus: DutyAttendanceStatus = metrics.isLate
        ? 'late'
        : metrics.isHalfDay
        ? 'half_day'
        : 'punched_out';

      // Updates for DB: PostgreSQL duty_attendance has CHECK (status IN ('on_duty', 'punched_out'))
      // Using status: 'punched_out' ensures the check constraint is always satisfied
      const dbUpdates = {
        punch_out_at: effectivePunchOutIso,
        punch_out_address: att.punch_out_address || 'Auto Punch-out (10:00 PM)',
        total_work_minutes: metrics.totalWorkMinutes,
        overtime_minutes: metrics.overtimeMinutes,
        is_late: metrics.isLate,
        is_half_day: metrics.isHalfDay,
        status: 'punched_out',
        admin_notes: combinedNotes,
      };

      const memoryRecord: DutyAttendance = {
        ...att,
        ...dbUpdates,
        status: displayStatus,
      };

      toUpdate.push({
        record: memoryRecord,
        dbUpdates,
      });
    }
  }

  if (toUpdate.length > 0) {
    const updateMap = new Map(toUpdate.map((u) => [u.record.id, u.record]));
    cachedAttendances = cachedAttendances.map((r) => updateMap.get(r.id) || r);
    emitAttendanceChange();

    Promise.all(
      toUpdate.map(({ record, dbUpdates }) =>
        supabase
          .from('duty_attendance')
          .update(dbUpdates)
          .eq('id', record.id)
      )
    ).catch((err) => {
      console.warn('Auto punch-out background sync notice:', err);
    });
  }

  return cachedAttendances;
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
    const rawList = (data as unknown as DutyAttendance[]) || [];
    cachedAttendances = rawList.map((att) => {
      const isLate = att.is_late || isPunchLate(att.punch_in_at, cachedPolicy);
      let item: DutyAttendance = {
        ...att,
        is_late: isLate,
      };

      // Inline auto-punchout resolution for instant UI rendering
      const isOpen = item.punch_in_at && (!item.punch_out_at || item.status === 'on_duty');
      if (isOpen && isPastAutoPunchOut(item.date, cachedPolicy)) {
        const autoIso = getAutoPunchOutIso(item.date, cachedPolicy);
        const punchInDate = new Date(item.punch_in_at);
        const punchOutDate = new Date(autoIso);
        const effectivePunchOutIso = punchOutDate.getTime() > punchInDate.getTime()
          ? autoIso
          : new Date(punchInDate.getTime() + 60000).toISOString();

        const metrics = calculatePunchMetrics(item.punch_in_at, effectivePunchOutIso, item.total_km || 0, cachedPolicy);
        item = {
          ...item,
          punch_out_at: effectivePunchOutIso,
          punch_out_address: item.punch_out_address || 'Auto Punch-out (10:00 PM)',
          total_work_minutes: metrics.totalWorkMinutes,
          overtime_minutes: metrics.overtimeMinutes,
          is_late: metrics.isLate,
          is_half_day: metrics.isHalfDay,
          status: metrics.isLate ? 'late' : metrics.isHalfDay ? 'half_day' : 'punched_out',
        };
      }

      return item;
    });

    // Fire background persistence to Supabase for any unclosed records
    autoCloseMissedPunchOuts(rawList);

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
    let att = (data as unknown as DutyAttendance) || null;
    if (att && att.punch_in_at && (!att.punch_out_at || att.status === 'on_duty') && isPastAutoPunchOut(att.date, cachedPolicy)) {
      autoCloseMissedPunchOuts([att]);
      const autoIso = getAutoPunchOutIso(att.date, cachedPolicy);
      const metrics = calculatePunchMetrics(att.punch_in_at, autoIso, att.total_km || 0, cachedPolicy);
      att = {
        ...att,
        punch_out_at: autoIso,
        punch_out_address: att.punch_out_address || 'Auto Punch-out (10:00 PM)',
        total_work_minutes: metrics.totalWorkMinutes,
        overtime_minutes: metrics.overtimeMinutes,
        status: metrics.isLate ? 'late' : 'punched_out',
      };
    }
    return att;
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
    total_km: 0,
    status: 'on_duty',
  };

  const { data, error } = await supabase
    .from('duty_attendance')
    .insert(newAttendance)
    .select()
    .single();

  if (error) {
    console.warn('Full punch-in insert notice:', error.message);
    // Base fallback insert for legacy schema
    const baseRecord = {
      id: newId,
      engineer_id: engineerId,
      date: today,
      punch_in_at: now,
      punch_in_address: addressText,
      total_km: 0,
      status: 'on_duty',
    };
    await supabase.from('duty_attendance').insert(baseRecord);
  }

  const result = (data as unknown as DutyAttendance) || newAttendance;
  cachedAttendances = [result, ...cachedAttendances.filter((c) => c.id !== result.id)];
  emitAttendanceChange();
  return result;
}

/**
 * Strips raw internal system tags (e.g. LIVE_GPS JSON payloads, PUNCHED_OUT timestamps)
 * from notes so that only clean human-readable reasons or regularization notes remain.
 */
export function formatAttendanceNotes(notes?: string | null): string {
  if (!notes) return '';
  return notes
    .replace(/LIVE_GPS:\s*\{[\s\S]*?\}/gi, '')
    .replace(/LIVE_GPS:[^|]*/gi, '')
    .replace(/PUNCHED_OUT:[^\s|]*/gi, '')
    .replace(/AUTO_PUNCH_OUT:[^\s|]*/gi, '')
    .replace(/\|\s*\|/g, '|')
    .trim()
    .replace(/^\|\s*/, '')
    .replace(/\s*\|$/, '')
    .trim();
}

/**
 * Update real-time on-duty location for an engineer
 * Called every 10 seconds in the background while the engineer is punched in
 */
export async function updateLiveDutyLocation(
  attendanceId: string,
  coords: { latitude: number; longitude: number; accuracy?: number | null; speed?: number | null }
): Promise<void> {
  try {
    await supabase
      .from('duty_attendance')
      .update({
        punch_in_latitude: coords.latitude,
        punch_in_longitude: coords.longitude,
      })
      .eq('id', attendanceId);
  } catch {
    /* silent background best-effort */
  }
}

/**
 * Real-time travel KM accumulator: Immediately adds completed travel distance to today's duty attendance
 * Supports all travel types: regular visits, pending visits, follow-up calls, and return to office
 */
export async function addTravelKmToTodayAttendance(
  engineerId: string,
  kmToAdd: number
): Promise<DutyAttendance | null> {
  if (!engineerId || !kmToAdd || kmToAdd <= 0) return null;
  const roundedKm = Math.round(kmToAdd * 10) / 10;

  try {
    const existing = await fetchTodayAttendance(engineerId);
    if (!existing) {
      console.log(`[Attendance] Engineer ${engineerId} has no duty attendance punched in yet today. KM (${roundedKm}) recorded on job.`);
      return null;
    }

    const currentTotal = existing.total_km || 0;
    const newTotalKm = Math.round((currentTotal + roundedKm) * 10) / 10;

    const { data, error } = await supabase
      .from('duty_attendance')
      .update({ total_km: newTotalKm })
      .eq('id', existing.id)
      .select()
      .maybeSingle();

    if (error) {
      console.warn('Failed to update total_km on duty_attendance:', error.message);
      return null;
    }

    const updated = (data as unknown as DutyAttendance) || { ...existing, total_km: newTotalKm };
    emitAttendanceChange();
    return updated;
  } catch (err) {
    console.warn('Error in addTravelKmToTodayAttendance:', err);
    return null;
  }
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

  // Preserve whichever KM is higher to ensure return to office or pending/followup call KM is never wiped
  const finalKm = Math.round(Math.max(existing.total_km || 0, totalDayKm || 0) * 10) / 10;

  const metrics = calculatePunchMetrics(existing.punch_in_at, now, finalKm, policy);

  // Preserve existing admin notes (like REACHED_OFFICE or RETURNING_TO_OFFICE tags)
  const existingNotes = (existing.admin_notes || '')
    .replace(/PUNCHED_OUT:.*?($|\s)/g, '')
    .trim();
  const punchOutTag = `PUNCHED_OUT:${now}`;
  const combinedNotes = existingNotes ? `${existingNotes} | ${punchOutTag}` : punchOutTag;

  const updates: Partial<DutyAttendance> = {
    punch_out_at: now,
    punch_out_latitude: coords?.latitude ?? null,
    punch_out_longitude: coords?.longitude ?? null,
    punch_out_address: addressText,
    total_work_minutes: metrics.totalWorkMinutes,
    overtime_minutes: metrics.overtimeMinutes,
    total_km: finalKm,
    is_late: metrics.isLate,
    is_half_day: metrics.isHalfDay,
    status: 'punched_out',
    admin_notes: combinedNotes,
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
  cachedAttendances = cachedAttendances.map((c) => (c.id === result.id ? result : c));
  emitAttendanceChange();
  return result;
}

/**
 * Revokes an accidental punch-out by an engineer or coordinator.
 * Resets punch_out_at, punch_out_address, punch_out coordinates, and total_work_minutes to null,
 * restores status to 'on_duty', appends the admin's mandatory revoke reason to admin_notes,
 * updates Supabase, updates local cache, and broadcasts an update event.
 */
export async function revokePunchOut(
  attendanceId: string,
  adminNotes: string
): Promise<DutyAttendance | null> {
  if (!attendanceId) return null;
  if (!adminNotes || !adminNotes.trim()) {
    throw new Error('Admin notes/reason is required to revoke a punch out');
  }

  // Fetch current record
  const { data: existing, error: fetchErr } = await supabase
    .from('duty_attendance')
    .select('*')
    .eq('id', attendanceId)
    .single();

  if (fetchErr || !existing) {
    console.error('Failed to find attendance record to revoke:', fetchErr?.message);
    throw new Error('Attendance record not found');
  }

  const existingNotes = (existing.admin_notes || '')
    .replace(/PUNCHED_OUT:[^\s|]+/g, '')
    .replace(/AUTO_PUNCH_OUT:[^\s|]+/g, '')
    .replace(/\|\s*\|/g, '|')
    .trim()
    .replace(/^\|\s*/, '')
    .replace(/\s*\|$/, '')
    .trim();

  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const revokeTag = `[REVOKED_PUNCH_OUT (${timestamp}): ${adminNotes.trim()}]`;
  const combinedNotes = existingNotes ? `${existingNotes} | ${revokeTag}` : revokeTag;

  const updates: Partial<DutyAttendance> = {
    punch_out_at: null,
    punch_out_latitude: null,
    punch_out_longitude: null,
    punch_out_address: null,
    total_work_minutes: null,
    status: 'on_duty',
    is_regularized: true,
    regularized_reason: `Punch-out revoked by admin: ${adminNotes.trim()}`,
    admin_notes: combinedNotes,
  };

  const { data: updated, error: updateErr } = await supabase
    .from('duty_attendance')
    .update(updates)
    .eq('id', attendanceId)
    .select()
    .single();

  let finalRecord: DutyAttendance;

  if (updateErr) {
    console.warn('Full update failed, using base updates fallback:', updateErr.message);
    const baseUpdates = {
      punch_out_at: null,
      punch_out_address: null,
      total_work_minutes: null,
      status: 'on_duty',
      admin_notes: combinedNotes,
    };
    const { data: fallbackUpdated, error: fallbackErr } = await supabase
      .from('duty_attendance')
      .update(baseUpdates)
      .eq('id', attendanceId)
      .select()
      .single();

    if (fallbackErr) {
      throw new Error(fallbackErr.message);
    }
    finalRecord = (fallbackUpdated as unknown as DutyAttendance) || { ...existing, ...baseUpdates };
  } else {
    finalRecord = (updated as unknown as DutyAttendance) || { ...existing, ...updates };
  }

  cachedAttendances = cachedAttendances.map((c) => (c.id === finalRecord.id ? finalRecord : c));
  emitAttendanceChange();
  return finalRecord;
}

// ─── Manual Admin Adjustments & Regularization ───

export async function manualSaveAttendance(attendance: Partial<DutyAttendance> & { engineer_id: string; date: string }): Promise<DutyAttendance> {
  const policy = await fetchAttendancePolicy();
  const punchInAt = attendance.punch_in_at || timeToIso(attendance.date, policy.shift_start_time);
  const punchOutAt = attendance.status === 'on_duty'
    ? null
    : (attendance.punch_out_at || (attendance.status === 'present' || attendance.status === 'punched_out' ? timeToIso(attendance.date, policy.shift_end_time) : null));
  
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
    status: (fullRecord.status === 'on_duty' || !fullRecord.punch_out_at) ? 'on_duty' : 'punched_out',
  };

  let finalSaved = fullRecord;

  try {
    const { data, error } = await supabase
      .from('duty_attendance')
      .upsert(fullRecord)
      .select()
      .single();

    if (!error && data) {
      finalSaved = data as unknown as DutyAttendance;
    } else if (error) {
      // If error is due to missing columns or constraints in live Supabase, retry with base columns
      const { data: baseData } = await supabase
        .from('duty_attendance')
        .upsert(baseRecord)
        .select()
        .single();

      finalSaved = (baseData as unknown as DutyAttendance) || fullRecord;
    }
  } catch {
    // fallback
  }

  cachedAttendances = [finalSaved, ...cachedAttendances.filter((c) => c.id !== finalSaved.id)];
  emitAttendanceChange();
  return finalSaved;
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

  // Fetch engineer name for prominent admin notification
  let engName = 'Engineer';
  try {
    const { data: p } = await supabase.from('profiles').select('full_name, employee_id').eq('id', engineerId).maybeSingle();
    if (p?.full_name) engName = p.full_name;
  } catch {
    // ignore
  }

  // Create solo Admin Notification
  try {
    const typeLabel = leaveType === 'regularization' ? 'Punch Regularization' : `${leaveType.toUpperCase()} Leave`;
    await addAdminNotification({
      job_id: '',
      job_number: 'LEAVE',
      type: 'leave_request',
      title: `🌴 New ${typeLabel}: ${engName}`,
      message: `${engName} applied for ${typeLabel} (${startDate} to ${endDate}) • Reason: "${reason.trim()}"`,
      actor_name: engName,
      data: {
        leave_id: newLeave.id,
        leave_type: leaveType,
        reason: reason.trim(),
      },
    });
  } catch {
    // ignore
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
    const [startY, startM, startD] = leave.start_date.split('-').map(Number);
    const [endY, endM, endD] = leave.end_date.split('-').map(Number);
    const endDate = new Date(endY, endM - 1, endD);
    const curDate = new Date(startY, startM - 1, startD);

    while (curDate <= endDate) {
      const yStr = curDate.getFullYear();
      const mStr = String(curDate.getMonth() + 1).padStart(2, '0');
      const dStr = String(curDate.getDate()).padStart(2, '0');
      const dateStr = `${yStr}-${mStr}-${dStr}`;

      await manualSaveAttendance({
        engineer_id: leave.engineer_id,
        date: dateStr,
        status: leave.leave_type === 'half_day' ? 'half_day' : 'on_leave',
        admin_notes: `Approved ${leave.leave_type.toUpperCase()} leave: ${leave.reason}`,
      });
      curDate.setDate(curDate.getDate() + 1);
    }
  }

  emitLeaveChange();
  emitAttendanceChange();
  return data as unknown as LeaveRequest;
}

// ─── Monthly Matrix & Aggregation Helpers ───

import {
  getTamilNaduHoliday,
  isSundayWeekOff,
  type TamilNaduHoliday,
} from './tamilNaduHolidays';

export interface EngineerMonthlyRow {
  engineer: Profile;
  daysMap: Record<number, DutyAttendance | null>;
  leavesMap: Record<number, LeaveRequest | null>;
  holidaysMap: Record<number, TamilNaduHoliday | null>;
  totalDaysInMonth: number;
  presentDays: number;
  lateDays: number;
  halfDays: number;
  absentDays: number;
  leaveDays: number;
  weeklyOffDays: number;
  govtHolidayDays: number;
  totalWorkingMinutes: number;
  totalKm: number;
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
    const leavesMap: Record<number, LeaveRequest | null> = {};
    const holidaysMap: Record<number, TamilNaduHoliday | null> = {};
    let presentDays = 0;
    let lateDays = 0;
    let halfDays = 0;
    let absentDays = 0;
    let leaveDays = 0;
    let weeklyOffDays = 0;
    let govtHolidayDays = 0;
    let totalWorkingMinutes = 0;
    let totalKm = 0;

    const joiningDateStr = eng.joining_date || (eng.created_at ? eng.created_at.split('T')[0] : '2000-01-01');

    const engAttendances = attendances.filter(
      (a) => a.engineer_id === eng.id && a.date.startsWith(monthPrefix)
    );

    const engApprovedLeaves = leaves.filter(
      (l) => l.engineer_id === eng.id && l.status === 'approved'
    );

    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = String(day).padStart(2, '0');
      const dateString = `${monthPrefix}-${dayStr}`;
      const isSunday = isSundayWeekOff(dateString);
      const tnHoliday = getTamilNaduHoliday(dateString);

      // If prior to joining date, skip attendance counting
      if (dateString < joiningDateStr) {
        daysMap[day] = null;
        leavesMap[day] = null;
        holidaysMap[day] = null;
        continue;
      }

      // Find punch record
      const att = engAttendances.find((a) => a.date === dateString) || null;
      daysMap[day] = att;

      // Find approved leave record
      const leave = engApprovedLeaves.find((l) => dateString >= l.start_date && dateString <= l.end_date) || null;
      leavesMap[day] = leave;

      // Tamil Nadu Government Holiday
      holidaysMap[day] = tnHoliday;

      if (att) {
        const isLate = att.is_late || isPunchLate(att.punch_in_at, policy) || att.status === 'late';
        const isHalfDay = att.is_half_day || att.status === 'half_day';

        if (isHalfDay) {
          halfDays++;
          if (isLate) lateDays++;
        } else if (isLate) {
          lateDays++;
          presentDays++;
        } else if (att.status === 'present' || att.status === 'on_duty' || att.status === 'punched_out') {
          presentDays++;
        } else if (att.status === 'on_leave') {
          leaveDays++;
        } else if (att.status === 'absent') {
          absentDays++;
        } else if (att.status === 'weekly_off') {
          weeklyOffDays++;
        } else {
          presentDays++;
        }

        totalWorkingMinutes += att.total_work_minutes || 0;
        totalKm += att.total_km || 0;
      } else if (leave) {
        leaveDays++;
      } else if (tnHoliday) {
        // Tamil Nadu Government Holiday (Not absent!)
        govtHolidayDays++;
      } else if (isSunday) {
        // Sunday Weekly Off (Not absent!)
        weeklyOffDays++;
      } else {
        // Only past working days without punch or leave are marked Absent
        const todayStr = new Date().toISOString().split('T')[0];
        if (dateString < todayStr) {
          absentDays++;
        }
      }
    }

    return {
      engineer: eng,
      daysMap,
      leavesMap,
      holidaysMap,
      totalDaysInMonth: daysInMonth,
      presentDays,
      lateDays,
      halfDays,
      absentDays,
      leaveDays,
      weeklyOffDays,
      govtHolidayDays,
      totalWorkingMinutes,
      totalKm,
    };
  });
}

// ─── Export Generator (CSV HR Register) ───

export function exportMonthlyRegisterCsv(
  matrix: EngineerMonthlyRow[],
  year: number,
  month: number,
  policy: AttendancePolicyConfig = cachedPolicy
) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'long' });
  const petrolRate = getPetrolRate(policy);

  // Day columns: 1, 2, ..., 31
  const dayHeaders = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`);

  const headers = [
    'Emp ID',
    'Employee Name',
    'Phone',
    ...dayHeaders,
    'Present Days',
    'Late Days',
    'Half Days',
    'Leaves',
    'TN Govt Holidays (GH)',
    'Sunday Offs (WO)',
    'Absent (A)',
    'Total Hours',
    'Total KM',
    `Petrol Allowance (Rs @ ${petrolRate.toFixed(2)}/KM)`,
  ];

  const rows = matrix.map((row) => {
    const dayCells = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const att = row.daysMap[day];
      const leave = row.leavesMap?.[day];
      const dayStr = String(day).padStart(2, '0');
      const monthStr = String(month + 1).padStart(2, '0');
      const dateString = `${year}-${monthStr}-${dayStr}`;
      const engJoinDate = row.engineer.joining_date || (row.engineer.created_at ? row.engineer.created_at.split('T')[0] : '2000-01-01');
      const isPreJoining = dateString < engJoinDate;
      const isSunday = isSundayWeekOff(dateString);
      const tnHoliday = getTamilNaduHoliday(dateString);

      if (isPreJoining) return '-';
      if (att) {
        const isLate = att.is_late || isPunchLate(att.punch_in_at, cachedPolicy) || att.status === 'late';
        if (isLate) return 'L';
        if (att.status === 'present' || att.status === 'punched_out') return 'P';
        if (att.status === 'on_duty') return 'OD';
        if (att.status === 'half_day') return 'HD';
        if (att.status === 'on_leave') return 'LV';
        if (att.status === 'absent') return 'A';
        if (att.status === 'weekly_off') return 'WO';
        return 'P';
      }
      if (leave) {
        return `LV (${leave.leave_type.toUpperCase()})`;
      }
      if (tnHoliday) {
        return `GH (${tnHoliday.name})`;
      }
      if (isSunday) {
        return 'WO';
      }
      const todayStr = new Date().toISOString().split('T')[0];
      if (dateString < todayStr) {
        return 'A';
      }
      return '-';
    });

    const hours = (row.totalWorkingMinutes / 60).toFixed(1);
    const petrolAllowance = (row.totalKm * petrolRate).toFixed(2);

    return [
      row.engineer.employee_id || `EMP-${row.engineer.id.slice(0, 5).toUpperCase()}`,
      row.engineer.full_name,
      row.engineer.phone || '—',
      ...dayCells,
      row.presentDays,
      row.lateDays,
      row.halfDays,
      row.leaveDays,
      row.govtHolidayDays,
      row.weeklyOffDays,
      row.absentDays,
      hours,
      row.totalKm.toFixed(1),
      petrolAllowance,
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

// ─── Individual Person Report Exporter ───

export function exportIndividualAttendanceCsv(
  engineer: Profile,
  year: number,
  month: number,
  attendances: DutyAttendance[],
  leaves: LeaveRequest[],
  policy: AttendancePolicyConfig = cachedPolicy
) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'long' });
  const monthStr = String(month + 1).padStart(2, '0');
  const monthPrefix = `${year}-${monthStr}`;

  const engAttendances = attendances.filter(
    (a) => a.engineer_id === engineer.id && a.date.startsWith(monthPrefix)
  );

  const engApprovedLeaves = leaves.filter(
    (l) => l.engineer_id === engineer.id && l.status === 'approved'
  );

  const petrolRate = getPetrolRate(policy);

  const headers = [
    'Date',
    'Day',
    'Status',
    'Punch In Time',
    'Punch In Location',
    'Punch Out Time',
    'Punch Out Location',
    'Duration (Hours)',
    'Field KM',
    `Petrol Allowance (Rs @ ${petrolRate.toFixed(2)}/KM)`,
    'Remarks / Reason',
  ];

  const rows = [];

  const joiningDateStr = engineer.joining_date || (engineer.created_at ? engineer.created_at.split('T')[0] : '2000-01-01');

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = String(day).padStart(2, '0');
    const dateString = `${monthPrefix}-${dayStr}`;
    const dateObj = new Date(year, month, day);
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    const isSunday = isSundayWeekOff(dateString);
    const tnHoliday = getTamilNaduHoliday(dateString);

    const att = engAttendances.find((a) => a.date === dateString);
    const leave = engApprovedLeaves.find((l) => dateString >= l.start_date && dateString <= l.end_date);

    let statusText = 'Absent';
    let inTime = '—';
    let inLoc = '—';
    let outTime = '—';
    let outLoc = '—';
    let hoursText = '0.0';
    let kmText = '0.0';
    let remarks = '';

    if (dateString < joiningDateStr) {
      statusText = 'PRE-JOINING (NOT JOINED)';
      remarks = `Joined on ${joiningDateStr}`;
    } else if (att) {
      const isLate = att.is_late || isPunchLate(att.punch_in_at, policy) || att.status === 'late';
      const todayStr = new Date().toISOString().split('T')[0];
      const isPastDate = dateString < todayStr;
      const isToday = dateString === todayStr;

      if (att.punch_in_at) {
        inTime = new Date(att.punch_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        inLoc = att.punch_in_address || 'Field Location';
      }

      if (att.punch_out_at) {
        outTime = new Date(att.punch_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        outLoc = att.punch_out_address || 'Field Location';
        statusText = isLate ? 'LATE' : att.status === 'half_day' || att.is_half_day ? 'HALF DAY' : 'PRESENT';
      } else if (isPastDate) {
        // Missed punch out auto-closed at 10:00 PM
        outTime = '10:00 PM (Auto)';
        outLoc = att.punch_out_address || 'Auto Punch-out (10:00 PM)';
        statusText = isLate ? 'LATE' : 'PRESENT';
        remarks = 'Auto punch-out at 10:00 PM';
      } else if (isToday) {
        outTime = 'Active / In-Field';
        statusText = isLate ? 'LATE (ON DUTY)' : 'ON DUTY';
      }

      if (att.total_work_minutes) {
        hoursText = (att.total_work_minutes / 60).toFixed(2);
      } else if (att.punch_in_at) {
        const endTimeMs = att.punch_out_at
          ? new Date(att.punch_out_at).getTime()
          : isPastDate
          ? new Date(getAutoPunchOutIso(dateString, policy)).getTime()
          : Date.now();
        const diffMs = endTimeMs - new Date(att.punch_in_at).getTime();
        hoursText = (Math.max(0, Math.floor(diffMs / 60000)) / 60).toFixed(2);
      }

      if (att.total_km) {
        kmText = att.total_km.toFixed(1);
      }
      const noteText = formatAttendanceNotes(att.regularized_reason || att.admin_notes);
      if (noteText) {
        remarks = remarks ? `${remarks} | ${noteText}` : noteText;
      }
    } else if (leave) {
      statusText = `ON LEAVE (${leave.leave_type.toUpperCase()})`;
      remarks = leave.reason;
    } else if (tnHoliday) {
      statusText = `GOVT HOLIDAY (TN)`;
      remarks = tnHoliday.name;
    } else if (isSunday) {
      statusText = 'WEEKLY OFF (SUNDAY)';
    } else {
      const todayStr = new Date().toISOString().split('T')[0];
      statusText = dateString <= todayStr ? 'ABSENT' : 'UPCOMING';
    }

    const petrolAllowance = (Number(kmText) * petrolRate).toFixed(2);

    rows.push([
      dateString,
      dayName,
      statusText,
      inTime,
      inLoc,
      outTime,
      outLoc,
      hoursText,
      kmText,
      petrolAllowance,
      remarks,
    ]);
  }

  const cleanName = (engineer.full_name || 'Staff').replace(/[^a-zA-Z0-9_-]/g, '_');
  const csvContent = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ICS-Attendance-Report-${cleanName}-${monthName}-${year}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
