import type { DutyAttendance } from '@/types/database';
import { supabase } from '@/lib/supabase';

/**
 * Attendance module — 100% Supabase cloud sync (zero localStorage).
 * All punch-in/out records are persisted in the `duty_attendance` table.
 */

// ─── In-memory cache (for instant UI reads while async fetch completes) ───
let cachedAttendances: DutyAttendance[] = [];
let cacheReady = false;

function emitChange() {
  window.dispatchEvent(new Event('ics-attendance-updated'));
}

// ─── Read helpers ───

export async function fetchAllAttendances(): Promise<DutyAttendance[]> {
  const { data } = await supabase
    .from('duty_attendance')
    .select('*')
    .order('date', { ascending: false })
    .order('punch_in_at', { ascending: false });
  cachedAttendances = (data as unknown as DutyAttendance[]) || [];
  cacheReady = true;
  return cachedAttendances;
}

/** Synchronous getter for already-fetched data (used in Reports etc.) */
export function getAllAttendances(): DutyAttendance[] {
  if (!cacheReady) {
    // Trigger background fetch; callers should use async version for accuracy
    fetchAllAttendances().then(emitChange);
  }
  return cachedAttendances;
}

export async function fetchTodayAttendance(engineerId: string): Promise<DutyAttendance | null> {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('duty_attendance')
    .select('*')
    .eq('engineer_id', engineerId)
    .eq('date', today)
    .maybeSingle();
  return (data as unknown as DutyAttendance) || null;
}

/** Synchronous fallback for cached data */
export function getTodayAttendance(engineerId: string): DutyAttendance | null {
  const today = new Date().toISOString().split('T')[0];
  return cachedAttendances.find((a) => a.engineer_id === engineerId && a.date === today) || null;
}

// ─── Write helpers ───

export async function punchInDuty(
  engineerId: string,
  coords?: { latitude: number; longitude: number } | null
): Promise<DutyAttendance> {
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  // Check if already punched in today
  const existing = await fetchTodayAttendance(engineerId);
  if (existing) {
    // Update coordinates if re-punching
    const { data } = await supabase
      .from('duty_attendance')
      .update({
        punch_in_latitude: coords?.latitude ?? existing.punch_in_latitude,
        punch_in_longitude: coords?.longitude ?? existing.punch_in_longitude,
        punch_in_address: coords ? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}` : existing.punch_in_address,
        status: 'on_duty',
      })
      .eq('id', existing.id)
      .select()
      .single();
    const updated = (data as unknown as DutyAttendance) || existing;
    emitChange();
    return updated;
  }

  // New punch-in
  const newId = crypto.randomUUID();
  const newAttendance: DutyAttendance = {
    id: newId,
    engineer_id: engineerId,
    date: today,
    punch_in_at: now,
    punch_in_latitude: coords?.latitude ?? null,
    punch_in_longitude: coords?.longitude ?? null,
    punch_in_address: coords ? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}` : 'Field Location',
    status: 'on_duty',
  };

  const { data, error } = await supabase
    .from('duty_attendance')
    .insert(newAttendance)
    .select()
    .single();

  if (error) {
    console.error('Punch-in error:', error.message);
  }

  const result = (data as unknown as DutyAttendance) || newAttendance;
  emitChange();
  return result;
}

export async function punchOutDuty(
  engineerId: string,
  totalDayKm: number,
  coords?: { latitude: number; longitude: number } | null
): Promise<DutyAttendance | null> {
  const existing = await fetchTodayAttendance(engineerId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const startTime = new Date(existing.punch_in_at).getTime();
  const endTime = new Date(now).getTime();
  const diffMins = Math.max(1, Math.floor((endTime - startTime) / 60000));

  const updates = {
    punch_out_at: now,
    punch_out_latitude: coords?.latitude ?? null,
    punch_out_longitude: coords?.longitude ?? null,
    punch_out_address: coords ? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}` : 'Field Location',
    total_work_minutes: diffMins,
    total_km: totalDayKm,
    status: 'punched_out' as const,
  };

  const { data, error } = await supabase
    .from('duty_attendance')
    .update(updates)
    .eq('id', existing.id)
    .select()
    .single();

  if (error) {
    console.error('Punch-out error:', error.message);
  }

  const result = (data as unknown as DutyAttendance) || { ...existing, ...updates };
  emitChange();
  return result;
}
