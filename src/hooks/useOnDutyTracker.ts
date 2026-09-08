import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchTodayAttendance, updateLiveDutyLocation } from '@/lib/attendance';
import { backgroundKeepAlive } from '@/lib/backgroundKeepAlive';
import { requestScreenWakeLock, type Coordinates } from '@/hooks/useLocation';
import type { DutyAttendance } from '@/types/database';

/**
 * On-Duty Background Location Tracker Hook
 *
 * Automatically monitors the engineer's attendance status.
 * - When Punched In (status === 'on_duty' | 'late'):
 *   1. Engages background keep-alive (silent audio loop + Web Worker timer)
 *      to run continuously even when the screen is turned off or another app is opened.
 *   2. Captures GPS coordinates every 10 seconds.
 *   3. Pushes live location to Supabase duty_attendance so the Admin Tracking map
 *      updates in real-time.
 * - When Punched Out (status === 'punched_out' | absent):
 *   Completely shuts down GPS polling, audio keepalive, Web Worker, and wake lock.
 */
export function useOnDutyTracker(engineerId?: string | null) {
  const [attendance, setAttendance] = useState<DutyAttendance | null>(null);
  const [isOnDuty, setIsOnDuty] = useState(false);
  const [currentCoords, setCurrentCoords] = useState<Coordinates | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'searching' | 'connected' | 'denied' | 'lost'>('idle');

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const isUpdatingRef = useRef<boolean>(false);
  const attendanceRef = useRef<DutyAttendance | null>(null);
  attendanceRef.current = attendance;

  // 1. Single function to capture GPS and update Supabase (runs every 10 seconds)
  const captureAndSyncLocation = useCallback(async () => {
    const currentAtt = attendanceRef.current;
    if (!currentAtt || (currentAtt.status !== 'on_duty' && currentAtt.status !== 'late')) {
      return;
    }
    if (isUpdatingRef.current) return;
    isUpdatingRef.current = true;

    try {
      if (!navigator.geolocation) {
        setGpsStatus('denied');
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude, accuracy, speed } = pos.coords;

          if (latitude == null || longitude == null) return;
          if (Math.abs(latitude) < 0.0001 && Math.abs(longitude) < 0.0001) return;

          const coords = {
            latitude,
            longitude,
            accuracy: accuracy ? Math.round(accuracy) : null,
            speed: speed != null && speed >= 0 ? Math.round(speed * 3.6 * 10) / 10 : null,
          };

          setCurrentCoords({ latitude, longitude });
          setLastUpdate(new Date());
          setGpsStatus('connected');

          // Send to database every 10 seconds
          if (currentAtt?.id) {
            await updateLiveDutyLocation(currentAtt.id, coords);
          }
          isUpdatingRef.current = false;
        },
        (err) => {
          console.warn('10s on-duty GPS capture notice:', err.message);
          if (err.code === 1) setGpsStatus('denied');
          else if (err.code === 2) setGpsStatus('lost');
          isUpdatingRef.current = false;
        },
        {
          enableHighAccuracy: true,
          timeout: 9000,
          maximumAge: 5000,
        }
      );
    } catch {
      isUpdatingRef.current = false;
    }
  }, []);

  // 2. Sync attendance status in real-time
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

  // 3. Start or Stop 10-Second Background Tracking based on On-Duty state
  useEffect(() => {
    if (isOnDuty) {
      setGpsStatus('searching');

      // Acquire screen wake lock where supported
      requestScreenWakeLock().then((sentinel) => {
        if (sentinel) wakeLockRef.current = sentinel;
      });

      // Start background keepalive (silent audio loop + media session for background/screen-off survival)
      backgroundKeepAlive.start('ICS On-Duty Live Tracking');

      // Initial immediate capture
      captureAndSyncLocation();

      // Listen to 10s Web Worker heartbeat (survives screen-off and background tabs)
      const unsubHeartbeat = backgroundKeepAlive.onHeartbeat(() => {
        captureAndSyncLocation();
      });

      // Also set a standard 10-second interval fallback
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(() => {
        captureAndSyncLocation();
      }, 10000);

      // Re-assert GPS and wake lock when tab becomes visible again or phone is unlocked
      const handleResume = () => {
        if (document.visibilityState === 'visible') {
          captureAndSyncLocation();
          if (!wakeLockRef.current) {
            requestScreenWakeLock().then((s) => {
              if (s) wakeLockRef.current = s;
            });
          }
        }
      };
      document.addEventListener('visibilitychange', handleResume);
      window.addEventListener('pageshow', handleResume);
      window.addEventListener('focus', handleResume);

      return () => {
        unsubHeartbeat();
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        document.removeEventListener('visibilitychange', handleResume);
        window.removeEventListener('pageshow', handleResume);
        window.removeEventListener('focus', handleResume);
      };
    } else {
      // Punched Out / Off Duty: STOP ALL TRACKING IMMEDIATELY
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
      backgroundKeepAlive.stop();
      setGpsStatus('idle');
    }
  }, [isOnDuty, captureAndSyncLocation]);

  return {
    isOnDuty,
    attendance,
    currentCoords,
    gpsStatus,
    lastUpdate,
    refreshAttendance,
  };
}
