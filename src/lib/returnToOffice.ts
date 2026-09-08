import { supabase } from '@/lib/supabase';
import { ICS_OFFICE_LOCATION } from '@/lib/office';
import { fetchRoadDrivingRoute, haversineDistance } from '@/lib/distance';
import { getReadableAddress, emitAttendanceChange } from '@/lib/attendance';
import { addAdminNotification } from '@/lib/notifications';
import type { DutyAttendance } from '@/types/database';

export interface ReturnTripState {
  status: 'idle' | 'returning' | 'reached';
  startedAt?: string;
  reachedAt?: string;
  startLat?: number;
  startLng?: number;
  startAddress?: string;
  returnKm?: number;
}

const STORAGE_KEY_PREFIX = 'ics_return_trip_';

/**
 * Parse the current return to office state from duty_attendance admin_notes and local storage
 */
export function getReturnTripState(attendance: DutyAttendance | null): ReturnTripState {
  if (!attendance) return { status: 'idle' };

  // Check admin_notes first
  if (attendance.admin_notes) {
    if (attendance.admin_notes.includes('RETURNING_TO_OFFICE:')) {
      try {
        const raw = attendance.admin_notes.split('RETURNING_TO_OFFICE:')[1].split('---')[0];
        const parsed = JSON.parse(raw);
        return {
          status: 'returning',
          startedAt: parsed.startedAt,
          startLat: parsed.startLat,
          startLng: parsed.startLng,
          startAddress: parsed.startAddress,
        };
      } catch {}
    } else if (attendance.admin_notes.includes('REACHED_OFFICE:')) {
      try {
        const raw = attendance.admin_notes.split('REACHED_OFFICE:')[1].split('---')[0];
        const parsed = JSON.parse(raw);
        return {
          status: 'reached',
          startedAt: parsed.startedAt,
          reachedAt: parsed.reachedAt,
          returnKm: parsed.returnKm,
          startAddress: parsed.startAddress,
        };
      } catch {}
    }
  }

  // Fallback to local storage
  try {
    const local = localStorage.getItem(`${STORAGE_KEY_PREFIX}${attendance.engineer_id}`);
    if (local) {
      const parsed = JSON.parse(local);
      if (parsed.attendanceId === attendance.id) {
        return parsed.state;
      }
    }
  } catch {}

  return { status: 'idle' };
}

/**
 * Start the return to office journey
 */
export async function startReturnToOffice(
  attendance: DutyAttendance,
  engineerName: string,
  startCoords?: { latitude: number; longitude: number } | null
): Promise<ReturnTripState> {
  const now = new Date().toISOString();
  let startAddress = 'Field Location';

  if (startCoords?.latitude && startCoords?.longitude) {
    startAddress = await getReadableAddress(startCoords.latitude, startCoords.longitude);
  }

  const tripState: ReturnTripState = {
    status: 'returning',
    startedAt: now,
    startLat: startCoords?.latitude,
    startLng: startCoords?.longitude,
    startAddress,
  };

  // Save to local storage for instant offline resilience
  try {
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${attendance.engineer_id}`,
      JSON.stringify({ attendanceId: attendance.id, state: tripState })
    );
  } catch {}

  // Update Supabase duty_attendance admin_notes with RETURNING_TO_OFFICE tag
  try {
    const existingNotes = attendance.admin_notes || '';
    // Clean out any previous return tags
    const cleanedNotes = existingNotes
      .replace(/RETURNING_TO_OFFICE:.*?---/g, '')
      .replace(/REACHED_OFFICE:.*?---/g, '')
      .trim();

    const newTag = `RETURNING_TO_OFFICE:${JSON.stringify(tripState)}---`;
    const updatedNotes = `${newTag} ${cleanedNotes}`.trim();

    await supabase
      .from('duty_attendance')
      .update({ admin_notes: updatedNotes })
      .eq('id', attendance.id);

    // Notify Admin & Dispatcher
    await addAdminNotification({
      type: 'status_change',
      title: 'Engineer Returning to Office',
      message: `${engineerName} started travel back to ${ICS_OFFICE_LOCATION.name} from ${startAddress}.`,
      actor_name: engineerName,
    });
  } catch (err) {
    console.warn('Error starting return to office in DB:', err);
  }

  emitAttendanceChange();
  return tripState;
}

/**
 * Mark engineer as reached office, calculate distance, and add to attendance total_km
 */
export async function markReachedOffice(
  attendance: DutyAttendance,
  engineerName: string,
  endCoords?: { latitude: number; longitude: number } | null
): Promise<{ returnKm: number; newTotalKm: number }> {
  const now = new Date().toISOString();
  const currentTrip = getReturnTripState(attendance);

  let returnKm = 0;

  // Calculate actual road distance from start location to office
  const startLat = currentTrip.startLat || attendance.punch_in_latitude;
  const startLng = currentTrip.startLng || attendance.punch_in_longitude;
  const officeLat = endCoords?.latitude || ICS_OFFICE_LOCATION.latitude;
  const officeLng = endCoords?.longitude || ICS_OFFICE_LOCATION.longitude;

  if (startLat && startLng) {
    try {
      const roadResult = await fetchRoadDrivingRoute(startLat, startLng, officeLat, officeLng);
      if (roadResult && roadResult.distanceKm > 0) {
        returnKm = roadResult.distanceKm;
      } else {
        returnKm = Math.round(haversineDistance(startLat, startLng, officeLat, officeLng) * 10) / 10;
      }
    } catch {
      returnKm = Math.round(haversineDistance(startLat, startLng, officeLat, officeLng) * 10) / 10;
    }
  }

  // New cumulative KM
  const currentTotal = attendance.total_km || 0;
  const newTotalKm = Math.round((currentTotal + returnKm) * 10) / 10;

  const finalTripState: ReturnTripState = {
    status: 'reached',
    startedAt: currentTrip.startedAt,
    reachedAt: now,
    returnKm,
    startAddress: currentTrip.startAddress,
  };

  // Save to local storage
  try {
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${attendance.engineer_id}`,
      JSON.stringify({ attendanceId: attendance.id, state: finalTripState })
    );
  } catch {}

  // Update Supabase duty_attendance with new total_km and REACHED_OFFICE tag
  try {
    const existingNotes = attendance.admin_notes || '';
    const cleanedNotes = existingNotes
      .replace(/RETURNING_TO_OFFICE:.*?---/g, '')
      .replace(/REACHED_OFFICE:.*?---/g, '')
      .trim();

    const newTag = `REACHED_OFFICE:${JSON.stringify(finalTripState)}---`;
    const updatedNotes = `${newTag} ${cleanedNotes}`.trim();

    await supabase
      .from('duty_attendance')
      .update({
        total_km: newTotalKm,
        admin_notes: updatedNotes,
      })
      .eq('id', attendance.id);

    // Notify Admin & Dispatcher
    await addAdminNotification({
      type: 'status_change',
      title: 'Engineer Reached Office',
      message: `${engineerName} has arrived at ${ICS_OFFICE_LOCATION.name}. Return distance of ${returnKm.toFixed(1)} KM added to daily field travel.`,
      actor_name: engineerName,
    });
  } catch (err) {
    console.warn('Error updating reached office in DB:', err);
  }

  emitAttendanceChange();
  return { returnKm, newTotalKm };
}

/**
 * Cancel return to office mode
 */
export async function cancelReturnToOffice(attendance: DutyAttendance): Promise<void> {
  try {
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${attendance.engineer_id}`);
  } catch {}

  try {
    const existingNotes = attendance.admin_notes || '';
    const cleanedNotes = existingNotes
      .replace(/RETURNING_TO_OFFICE:.*?---/g, '')
      .replace(/REACHED_OFFICE:.*?---/g, '')
      .trim();

    await supabase
      .from('duty_attendance')
      .update({ admin_notes: cleanedNotes })
      .eq('id', attendance.id);
  } catch {}

  emitAttendanceChange();
}

export interface ReturnOfficeRecord {
  id: string;
  attendanceId: string;
  engineerId: string;
  engineerName: string;
  engineerPhone?: string;
  date: string;
  status: 'returning' | 'reached';
  startedAt: string;
  reachedAt?: string;
  departureAddress: string;
  destinationAddress: string;
  returnKm: number;
  durationMinutes: number;
  durationFormatted: string;
}

/**
 * Extract all return-to-office records from attendance list for reporting
 */
export function extractReturnOfficeRecords(
  attendances: DutyAttendance[],
  engineers: { id: string; full_name: string; phone?: string }[]
): ReturnOfficeRecord[] {
  const engMap = new Map<string, { full_name: string; phone?: string }>();
  engineers.forEach((e) => engMap.set(e.id, { full_name: e.full_name, phone: e.phone }));

  const records: ReturnOfficeRecord[] = [];

  for (const att of attendances) {
    if (!att.admin_notes) continue;
    const eng = engMap.get(att.engineer_id);
    const engName = eng?.full_name || 'Engineer';
    const engPhone = eng?.phone || '';

    // 1. Check REACHED_OFFICE
    if (att.admin_notes.includes('REACHED_OFFICE:')) {
      try {
        const raw = att.admin_notes.split('REACHED_OFFICE:')[1].split('---')[0];
        const parsed = JSON.parse(raw);
        const started = parsed.startedAt || att.punch_in_at;
        const reached = parsed.reachedAt || att.punch_out_at || new Date().toISOString();

        const diffMs = Math.max(0, new Date(reached).getTime() - new Date(started).getTime());
        const durationMinutes = Math.max(1, Math.round(diffMs / 60000));
        const hours = Math.floor(durationMinutes / 60);
        const mins = durationMinutes % 60;
        const durationFormatted = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

        records.push({
          id: `${att.id}-reached`,
          attendanceId: att.id,
          engineerId: att.engineer_id,
          engineerName: engName,
          engineerPhone: engPhone,
          date: att.date,
          status: 'reached',
          startedAt: started,
          reachedAt: reached,
          departureAddress: parsed.startAddress || att.punch_in_address || 'Field Location',
          destinationAddress: `${ICS_OFFICE_LOCATION.name}, Podanur`,
          returnKm: Number(parsed.returnKm) || 0,
          durationMinutes,
          durationFormatted,
        });
      } catch {}
    }
    // 2. Check RETURNING_TO_OFFICE (currently in transit)
    else if (att.admin_notes.includes('RETURNING_TO_OFFICE:')) {
      try {
        const raw = att.admin_notes.split('RETURNING_TO_OFFICE:')[1].split('---')[0];
        const parsed = JSON.parse(raw);
        const started = parsed.startedAt || new Date().toISOString();

        const diffMs = Math.max(0, Date.now() - new Date(started).getTime());
        const durationMinutes = Math.max(1, Math.round(diffMs / 60000));
        const hours = Math.floor(durationMinutes / 60);
        const mins = durationMinutes % 60;
        const durationFormatted = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

        records.push({
          id: `${att.id}-returning`,
          attendanceId: att.id,
          engineerId: att.engineer_id,
          engineerName: engName,
          engineerPhone: engPhone,
          date: att.date,
          status: 'returning',
          startedAt: started,
          reachedAt: undefined,
          departureAddress: parsed.startAddress || 'Field Location',
          destinationAddress: `${ICS_OFFICE_LOCATION.name}, Podanur`,
          returnKm: 0, // in progress
          durationMinutes,
          durationFormatted,
        });
      } catch {}
    }
  }

  // Sort newest first
  return records.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}
