import type { DutyAttendance, TravelAllowanceConfig } from '@/types/database';

const ATTENDANCE_STORAGE_KEY = 'ics_field_duty_attendance';
const CONFIG_STORAGE_KEY = 'ics_travel_allowance_config';

export const DEFAULT_TRAVEL_CONFIG: TravelAllowanceConfig = {
  rate_per_km: 6.0, // ₹6.00 per KM for fuel / travel
  daily_base_allowance: 100.0, // ₹100 base daily field allowance
};

export function getTravelAllowanceConfig(): TravelAllowanceConfig {
  try {
    const data = localStorage.getItem(CONFIG_STORAGE_KEY);
    return data ? { ...DEFAULT_TRAVEL_CONFIG, ...JSON.parse(data) } : DEFAULT_TRAVEL_CONFIG;
  } catch {
    return DEFAULT_TRAVEL_CONFIG;
  }
}

export function saveTravelAllowanceConfig(config: TravelAllowanceConfig): void {
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
}

export function getAllAttendances(): DutyAttendance[] {
  try {
    const data = localStorage.getItem(ATTENDANCE_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function getTodayAttendance(engineerId: string): DutyAttendance | null {
  const today = new Date().toISOString().split('T')[0];
  const list = getAllAttendances();
  return list.find((a) => a.engineer_id === engineerId && a.date === today) || null;
}

export function punchInDuty(
  engineerId: string,
  coords?: { latitude: number; longitude: number } | null
): DutyAttendance {
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();
  const list = getAllAttendances();

  const existingIndex = list.findIndex((a) => a.engineer_id === engineerId && a.date === today);

  const newAttendance: DutyAttendance = {
    id: existingIndex >= 0 ? list[existingIndex].id : crypto.randomUUID(),
    engineer_id: engineerId,
    date: today,
    punch_in_at: existingIndex >= 0 ? list[existingIndex].punch_in_at : now,
    punch_in_latitude: coords?.latitude ?? null,
    punch_in_longitude: coords?.longitude ?? null,
    punch_in_address: coords ? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}` : 'Field Location',
    status: 'on_duty',
  };

  if (existingIndex >= 0) {
    list[existingIndex] = { ...list[existingIndex], ...newAttendance };
  } else {
    list.unshift(newAttendance);
  }

  localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent('ics-attendance-updated'));
  return newAttendance;
}

export function punchOutDuty(
  engineerId: string,
  totalDayKm: number,
  coords?: { latitude: number; longitude: number } | null
): DutyAttendance | null {
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();
  const list = getAllAttendances();

  const index = list.findIndex((a) => a.engineer_id === engineerId && a.date === today);
  if (index === -1) return null;

  const att = list[index];
  const startTime = new Date(att.punch_in_at).getTime();
  const endTime = new Date(now).getTime();
  const diffMins = Math.max(1, Math.floor((endTime - startTime) / 60000));

  const config = getTravelAllowanceConfig();
  const calculatedAllowance = Math.round(
    (config.daily_base_allowance + totalDayKm * config.rate_per_km) * 100
  ) / 100;

  const updated: DutyAttendance = {
    ...att,
    punch_out_at: now,
    punch_out_latitude: coords?.latitude ?? null,
    punch_out_longitude: coords?.longitude ?? null,
    punch_out_address: coords ? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}` : 'Field Location',
    total_work_minutes: diffMins,
    total_km: totalDayKm,
    allowance_claimed: calculatedAllowance,
    status: 'punched_out',
  };

  list[index] = updated;
  localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent('ics-attendance-updated'));
  return updated;
}
