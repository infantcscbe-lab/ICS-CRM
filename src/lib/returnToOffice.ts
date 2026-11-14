import { supabase } from '@/lib/supabase';
import { ICS_OFFICE_LOCATION, getOfficeLocationForBranch, type OfficeLocation } from '@/lib/office';
import { fetchRoadDrivingRoute, haversineDistance } from '@/lib/distance';
import { getReadableAddress, emitAttendanceChange, addTravelKmToTodayAttendance } from '@/lib/attendance';
import { addAdminNotification } from '@/lib/notifications';
import { safeInsertServiceJob } from '@/lib/safeDb';
import type { DutyAttendance } from '@/types/database';

export interface ReturnTripState {
  status: 'idle' | 'returning' | 'reached';
  startedAt?: string;
  reachedAt?: string;
  startLat?: number;
  startLng?: number;
  startAddress?: string;
  returnKm?: number;
  jobId?: string;
  jobNumber?: string;
  branch?: string;
  officeName?: string;
}

const STORAGE_KEY_PREFIX = 'ics_return_trip_';

/**
 * Get or create an internal client record for the branch office so Return-to-Office
 * calls can be booked as proper first-class service jobs in the CRM.
 * For Coimbatore: Head Office (Podanur)
 * For Other Branches: Branch Office in that city (Chennai, Tirupur, Salem, etc.)
 */
export async function getOrCreateOfficeClient(branchId: string = 'cbe'): Promise<string> {
  const office = getOfficeLocationForBranch(branchId);
  try {
    // 1. Try to find existing client by name or phone
    const { data: existing } = await supabase
      .from('clients')
      .select('id, client_name')
      .or(`client_name.ilike.%${office.name}%,company_name.ilike.%${office.company}%`)
      .limit(1);

    if (existing && existing.length > 0) {
      return existing[0].id;
    }

    // 2. Also check if any client with office phone exists in this city
    const { data: phoneMatch } = await supabase
      .from('clients')
      .select('id')
      .eq('phone', office.phone)
      .eq('city', office.city)
      .limit(1);

    if (phoneMatch && phoneMatch.length > 0) {
      return phoneMatch[0].id;
    }

    // 3. Create the Branch / Head Office as an internal client
    const newClientId = crypto.randomUUID();
    const { data: created, error } = await supabase
      .from('clients')
      .insert({
        id: newClientId,
        client_name: office.name,
        company_name: office.company,
        phone: office.phone,
        email: 'service@icsstore.in',
        address: office.address,
        city: office.city,
        latitude: office.latitude,
        longitude: office.longitude,
        branch: office.branchId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (!error && created) {
      return created.id;
    }
    return newClientId;
  } catch (err) {
    console.warn('Failed to get/create office client:', err);
    const { data: anyClient } = await supabase.from('clients').select('id').limit(1);
    return anyClient?.[0]?.id || crypto.randomUUID();
  }
}

/**
 * Generate next sequential service job number (e.g. JOB-1178)
 */
export async function generateNextJobNumber(): Promise<string> {
  try {
    const { data: allJobs } = await supabase.from('service_jobs').select('job_number');
    let maxNum = 1000;
    (allJobs || []).forEach((j) => {
      const match = j.job_number?.match(/JOB-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    return `JOB-${maxNum + 1}`;
  } catch {
    return `JOB-${Date.now().toString().slice(-4)}`;
  }
}

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
          jobId: parsed.jobId,
          jobNumber: parsed.jobNumber,
          branch: parsed.branch,
          officeName: parsed.officeName,
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
          jobId: parsed.jobId,
          jobNumber: parsed.jobNumber,
          branch: parsed.branch,
          officeName: parsed.officeName,
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
 * Book Return to Office as an official Service Call in service_jobs table.
 * Branch-aware:
 * - Coimbatore: Return to Office — Head Office (Podanur)
 * - Other branches: Return to Office — ICS <Branch> Branch Office
 */
export async function bookReturnToOfficeJob(params: {
  engineerId: string;
  engineerName: string;
  startAddress: string;
  startCoords?: { latitude: number; longitude: number } | null;
  branch?: string;
}): Promise<{ jobId: string; jobNumber: string; officeName: string } | null> {
  try {
    const now = new Date().toISOString();
    const todayStr = now.split('T')[0];
    const branchCode = (params.branch || 'cbe').trim().toLowerCase();
    const office = getOfficeLocationForBranch(branchCode);
    const officeClientId = await getOrCreateOfficeClient(branchCode);
    const autoJobNo = await generateNextJobNumber();
    const newJobId = crypto.randomUUID();

    // Coimbatore -> Return to Office — Head Office (Podanur)
    // Other Branches -> Return to Office — ICS <Branch> Branch Office
    const isCoimbatore = branchCode === 'cbe' || branchCode === 'coimbatore';
    const issueTitle = isCoimbatore
      ? 'Return to Office — Head Office (Podanur)'
      : `Return to Office — ${office.name}`;

    const jobPayload = {
      id: newJobId,
      job_number: autoJobNo,
      client_id: officeClientId,
      engineer_id: params.engineerId,
      issue_title: issueTitle,
      issue_description: `Return journey to ${office.name} (${office.city}) from ${params.startAddress}. Live road distance & field tracking.`,
      priority: 'medium',
      status: 'traveling', // Traveling back to office
      call_source: 'direct',
      direct_call_type: 'inboard',
      call_type: 'Return to Office',
      call_given_by: params.engineerName || 'Service Engineer',
      assigned_by_name: 'Auto Dispatch / Return to Office',
      scheduled_date: todayStr,
      scheduled_time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      assigned_at: now,
      travel_started_at: now,
      start_latitude: params.startCoords?.latitude || null,
      start_longitude: params.startCoords?.longitude || null,
      branch: branchCode,
      admin_notes: `[RETURN_TO_OFFICE_CALL] Auto-booked return journey from ${params.startAddress} to ${office.name}.`,
      created_at: now,
      updated_at: now,
    };

    const { error } = await safeInsertServiceJob(jobPayload);
    if (!error) {
      return { jobId: newJobId, jobNumber: autoJobNo, officeName: office.name };
    }
    console.warn('Failed to insert return to office service job:', error);
  } catch (err) {
    console.warn('Error booking return to office job:', err);
  }
  return null;
}

/**
 * Start the return to office journey and book it as a Service Call!
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

  // Branch awareness
  const branch = (attendance as any).branch || 'cbe';
  const office = getOfficeLocationForBranch(branch);

  // 1. Auto-book as an official Service Call in service_jobs table!
  const booked = await bookReturnToOfficeJob({
    engineerId: attendance.engineer_id,
    engineerName,
    startAddress,
    startCoords,
    branch,
  });

  const tripState: ReturnTripState = {
    status: 'returning',
    startedAt: now,
    startLat: startCoords?.latitude,
    startLng: startCoords?.longitude,
    startAddress,
    jobId: booked?.jobId,
    jobNumber: booked?.jobNumber,
    branch,
    officeName: booked?.officeName || office.name,
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
      job_id: booked?.jobId,
      job_number: booked?.jobNumber,
      type: 'status_change',
      title: `Return to Office Call Booked: ${booked?.jobNumber || 'In Transit'}`,
      message: `${engineerName} started return journey to ${office.name} from ${startAddress}. Booked as Service Call ${booked?.jobNumber || ''}.`,
      actor_name: engineerName,
    });
  } catch (err) {
    console.warn('Error starting return to office in DB:', err);
  }

  emitAttendanceChange();
  return tripState;
}

/**
 * Mark engineer as reached office, calculate distance to that branch's office,
 * and complete the Return to Office Service Call!
 */
export async function markReachedOffice(
  attendance: DutyAttendance,
  engineerName: string,
  endCoords?: { latitude: number; longitude: number } | null
): Promise<{ returnKm: number; newTotalKm: number }> {
  const now = new Date().toISOString();
  const currentTrip = getReturnTripState(attendance);

  // Branch awareness: destination is the office for this branch (Podanur for Coimbatore, or respective branch office)
  const branch = currentTrip.branch || (attendance as any).branch || 'cbe';
  const office = getOfficeLocationForBranch(branch);

  let returnKm = 0;

  // Calculate actual road distance from start location to branch office
  const startLat = currentTrip.startLat || attendance.punch_in_latitude;
  const startLng = currentTrip.startLng || attendance.punch_in_longitude;
  const officeLat = endCoords?.latitude || office.latitude;
  const officeLng = endCoords?.longitude || office.longitude;

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
    jobId: currentTrip.jobId,
    jobNumber: currentTrip.jobNumber,
    branch,
    officeName: office.name,
  };

  // 1. Mark the booked Return to Office call as completed!
  const targetJobId = currentTrip.jobId;
  try {
    if (targetJobId) {
      await supabase
        .from('service_jobs')
        .update({
          status: 'completed',
          reached_at: now,
          service_started_at: now,
          solved_at: now,
          completed_at: now,
          reached_latitude: officeLat,
          reached_longitude: officeLng,
          end_latitude: officeLat,
          end_longitude: officeLng,
          total_km: returnKm,
          gps_distance_km: returnKm,
          work_performed: `Arrived safely at ${office.name} (${office.city}). Verified return distance of ${returnKm.toFixed(1)} KM logged.`,
          engineer_notes: `Reached ${office.name} safely. Return travel distance: ${returnKm.toFixed(1)} KM.`,
          updated_at: now,
        })
        .eq('id', targetJobId);
    } else {
      // Fallback: look for today's active Return to Office job for this engineer
      const todayStr = now.split('T')[0];
      const { data: activeJob } = await supabase
        .from('service_jobs')
        .select('id')
        .eq('engineer_id', attendance.engineer_id)
        .eq('scheduled_date', todayStr)
        .ilike('issue_title', '%Return to Office%')
        .in('status', ['traveling', 'assigned', 'in_progress', 'reached'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (activeJob && activeJob.length > 0) {
        await supabase
          .from('service_jobs')
          .update({
            status: 'completed',
            reached_at: now,
            service_started_at: now,
            solved_at: now,
            completed_at: now,
            total_km: returnKm,
            gps_distance_km: returnKm,
            work_performed: `Arrived safely at ${office.name} (${office.city}). Verified return distance: ${returnKm.toFixed(1)} KM.`,
            updated_at: now,
          })
          .eq('id', activeJob[0].id);
      }
    }
  } catch (err) {
    console.warn('Could not update return to office job to completed:', err);
  }

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

    // Real-time travel sync: credit returnKm to duty attendance
    await addTravelKmToTodayAttendance(attendance.engineer_id, returnKm);

    // Notify Admin & Dispatcher
    await addAdminNotification({
      job_id: currentTrip.jobId,
      job_number: currentTrip.jobNumber,
      type: 'status_change',
      title: 'Engineer Reached Office — Call Completed',
      message: `${engineerName} has arrived at ${office.name}. Return distance of ${returnKm.toFixed(1)} KM recorded and Service Call marked completed.`,
      actor_name: engineerName,
    });
  } catch (err) {
    console.warn('Error updating reached office in DB:', err);
  }

  emitAttendanceChange();
  return { returnKm, newTotalKm };
}

/**
 * Cancel return to office mode and cancel the corresponding booked Service Call
 */
export async function cancelReturnToOffice(attendance: DutyAttendance): Promise<void> {
  const currentTrip = getReturnTripState(attendance);

  // If a Service Call was booked for this return trip, mark it cancelled
  if (currentTrip.jobId) {
    try {
      await supabase
        .from('service_jobs')
        .update({
          status: 'cancelled',
          engineer_notes: 'Return to office travel cancelled by engineer.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentTrip.jobId);
    } catch (err) {
      console.warn('Failed to mark return to office job as cancelled:', err);
    }
  }

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
  jobNumber?: string;
}

/**
 * Extract all return-to-office records from attendance list for reporting
 */
export function extractReturnOfficeRecords(
  attendances: DutyAttendance[],
  engineers: { id: string; full_name: string; phone?: string; branch?: string }[]
): ReturnOfficeRecord[] {
  const engMap = new Map<string, { full_name: string; phone?: string; branch?: string }>();
  engineers.forEach((e) => engMap.set(e.id, { full_name: e.full_name, phone: e.phone, branch: e.branch }));

  const records: ReturnOfficeRecord[] = [];

  for (const att of attendances) {
    if (!att.admin_notes) continue;
    const eng = engMap.get(att.engineer_id);
    const engName = eng?.full_name || 'Engineer';
    const engPhone = eng?.phone || '';
    const engBranch = eng?.branch || (att as any).branch || 'cbe';
    const branchOffice = getOfficeLocationForBranch(engBranch);

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

        const destName = parsed.officeName || branchOffice.name;

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
          destinationAddress: destName,
          returnKm: Number(parsed.returnKm) || 0,
          durationMinutes,
          durationFormatted,
          jobNumber: parsed.jobNumber,
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

        const destName = parsed.officeName || branchOffice.name;

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
          destinationAddress: destName,
          returnKm: 0, // in progress
          durationMinutes,
          durationFormatted,
          jobNumber: parsed.jobNumber,
        });
      } catch {}
    }
  }

  // Sort newest first
  return records.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}
