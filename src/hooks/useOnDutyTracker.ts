import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchTodayAttendance, updateLiveDutyLocation } from '@/lib/attendance';
import { useResilientLocationTracker, type LocationData, type Coordinates } from '@/hooks/useLocation';
import { haversineDistance } from '@/lib/distance';
import type { DutyAttendance } from '@/types/database';

/**
 * On-Duty Background Location Tracker Hook
 *
 * Automatically monitors the engineer's attendance status.
 * As soon as the engineer punches in (status === 'on_duty' | 'late'),
 * it engages continuous background GPS tracking with screen-off keepalive,
 * sending live coordinates to the Admin Fleet Tracking map.
 * When punched out, tracking automatically suspends.
 */
export function useOnDutyTracker(engineerId?: string | null) {
  const [attendance, setAttendance] = useState<DutyAttendance | null>(null);
  const [isOnDuty, setIsOnDuty] = useState(false);
  const [currentCoords, setCurrentCoords] = useState<Coordinates | null>(null);
  const lastSentCoordsRef = useRef<{ latitude: number; longitude: number; time: number } | null>(null);

  // 1. Sync attendance status in real-time
  const refreshAttendance = useCallback(async () => {
    if (!engineerId) {
      setIsOnDuty(false);
      setAttendance(null);
      return;
    }

    try {
      const todayAtt = await fetchTodayAttendance(engineerId);
      setAttendance(todayAtt);
      const onDuty = !!todayAtt && (todayAtt.status === 'on_duty' || todayAtt.status === 'late');
      setIsOnDuty(onDuty);

      if (todayAtt?.punch_in_latitude && todayAtt?.punch_in_longitude) {
        setCurrentCoords({
          latitude: todayAtt.punch_in_latitude,
          longitude: todayAtt.punch_in_longitude,
        });
      }
    } catch (err) {
      console.warn('Attendance sync error:', err);
    }
  }, [engineerId]);

  useEffect(() => {
    refreshAttendance();

    if (!engineerId) return;

    // Real-time subscription to attendance changes (punch in / punch out events)
    const channel = supabase
      .channel(`on-duty-tracker-${engineerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'duty_attendance',
          filter: `engineer_id=eq.${engineerId}`,
        },
        () => {
          refreshAttendance();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [engineerId, refreshAttendance]);

  // 2. Handle location updates while on duty
  const handleLocationUpdate = useCallback(
    async (loc: LocationData) => {
      if (!attendance || !isOnDuty) return;

      const coords = { latitude: loc.latitude, longitude: loc.longitude };
      setCurrentCoords(coords);

      // Throttle server updates: only send if moved >= 20m or > 30s elapsed
      const now = Date.now();
      const last = lastSentCoordsRef.current;

      let shouldSend = false;
      if (!last) {
        shouldSend = true;
      } else {
        const timeDiffS = (now - last.time) / 1000;
        const distKm = haversineDistance(last.latitude, last.longitude, coords.latitude, coords.longitude);

        // Moved at least 20m OR 30 seconds elapsed while active
        if (distKm >= 0.02 || timeDiffS >= 30) {
          shouldSend = true;
        }
      }

      if (shouldSend) {
        lastSentCoordsRef.current = { latitude: coords.latitude, longitude: coords.longitude, time: now };
        await updateLiveDutyLocation(attendance.id, coords);
      }
    },
    [attendance, isOnDuty]
  );

  // 3. Resilient location tracking engine (with screen-off silent audio keepalive + Web Worker)
  const {
    gpsStatus,
    accuracy,
    lastUpdate,
    speedKmH,
    wakeLockActive,
    backgroundActive,
    enableBackgroundMode,
    reconnectGps,
  } = useResilientLocationTracker({
    active: isOnDuty,
    onLocationUpdate: handleLocationUpdate,
    tripTitle: 'ICS On-Duty Live Tracking',
  });

  return {
    isOnDuty,
    attendance,
    currentCoords,
    gpsStatus,
    accuracy,
    lastUpdate,
    speedKmH,
    wakeLockActive,
    backgroundActive,
    enableBackgroundMode,
    reconnectGps,
    refreshAttendance,
  };
}
