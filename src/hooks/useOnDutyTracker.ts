import { useEffect, useState, useRef, useCallback } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import { fetchTodayAttendance, updateLiveDutyLocation } from '@/lib/attendance';
import { backgroundKeepAlive } from '@/lib/backgroundKeepAlive';
import { requestScreenWakeLock, type Coordinates } from '@/hooks/useLocation';
import type { DutyAttendance } from '@/types/database';

const BackgroundGeolocation = registerPlugin<any>('BackgroundGeolocation');

/**
 * On-Duty Background Location Tracker Hook
 *
 * Automatically monitors the engineer's attendance status.
 * - When Punched In (status === 'on_duty' | 'late'):
 *   1. Starts Native Background Geolocation Foreground Service (on Android)
 *      which continuously gets GPS location in ANY situation (screen locked, phone sleeping, app switched).
 *   2. Detects if device Location (GPS) is turned OFF and alerts both via In-App Modal & Android Notification.
 *   3. Pushes live location to Supabase duty_attendance every time location updates.
 * - When Punched Out (status === 'punched_out' | absent):
 *   Completely shuts down native foreground service, GPS polling, audio keepalive, and wake lock.
 */
export function useOnDutyTracker(engineerId?: string | null) {
  const [attendance, setAttendance] = useState<DutyAttendance | null>(null);
  const [isOnDuty, setIsOnDuty] = useState(false);
  const [currentCoords, setCurrentCoords] = useState<Coordinates | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'searching' | 'connected' | 'denied' | 'lost'>('idle');

  const capWatcherIdRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const isUpdatingRef = useRef<boolean>(false);
  const attendanceRef = useRef<DutyAttendance | null>(null);
  attendanceRef.current = attendance;

  const isGpsDisabled = isOnDuty && (gpsStatus === 'denied' || gpsStatus === 'lost');

  // Single function to capture GPS and update Supabase (web fallback / periodic poll)
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

          if (currentAtt?.id) {
            await updateLiveDutyLocation(currentAtt.id, coords);
          }
          isUpdatingRef.current = false;
        },
        (err) => {
          console.warn('10s on-duty GPS capture notice:', err.message);
          if (err.code === 1) setGpsStatus('denied');
          else if (err.code === 2 || err.code === 3) setGpsStatus('lost');
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

  // Sync attendance status in real-time from Supabase
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

  // Start or Stop Background Tracking based on On-Duty state (Punch In -> Punch Out)
  useEffect(() => {
    if (isOnDuty) {
      setGpsStatus('searching');

      // 1. NATIVE ANDROID FOREGROUND SERVICE (Runs continuously in background on Punch In)
      if (Capacitor.isNativePlatform()) {
        try {
          BackgroundGeolocation.addWatcher(
            {
              backgroundMessage: 'On Duty: Tracking location continuously...',
              backgroundTitle: 'ICS Field Duty Active',
              requestPermissions: true,
              stale: false,
              distanceFilter: 3, // Record location every 3 meters moved
            },
            (location: any, error: any) => {
              if (error) {
                console.warn('Background Geolocation Error:', error);
                if (error.code === 'NOT_AUTHORIZED') {
                  setGpsStatus('denied');
                } else {
                  setGpsStatus('lost');
                }
                return;
              }

              if (location) {
                const coords = {
                  latitude: location.latitude,
                  longitude: location.longitude,
                  accuracy: location.accuracy ? Math.round(location.accuracy) : null,
                  speed: location.speed != null && location.speed >= 0 ? Math.round(location.speed * 3.6 * 10) / 10 : null,
                };

                setCurrentCoords({ latitude: location.latitude, longitude: location.longitude });
                setLastUpdate(new Date());
                setGpsStatus('connected');

                // Sync live location to Supabase duty_attendance table
                if (attendanceRef.current?.id) {
                  updateLiveDutyLocation(attendanceRef.current.id, coords);
                }
              }
            }
          ).then((watcherId: string) => {
            capWatcherIdRef.current = watcherId;
            setGpsStatus('connected');
          }).catch((err: any) => {
            console.warn('Native background geolocation on-duty failed:', err);
            setGpsStatus('lost');
          });
        } catch (err) {
          console.warn('Native background geolocation exception on-duty:', err);
          setGpsStatus('lost');
        }
      }

      // 2. WEB FALLBACK (Wake lock + Audio Keepalive + 10s Polls)
      requestScreenWakeLock().then((sentinel) => {
        if (sentinel) wakeLockRef.current = sentinel;
      });

      backgroundKeepAlive.start('ICS On-Duty Live Tracking');
      captureAndSyncLocation();

      const unsubHeartbeat = backgroundKeepAlive.onHeartbeat(() => {
        captureAndSyncLocation();
      });

      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(() => {
        captureAndSyncLocation();
      }, 10000);

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
        if (Capacitor.isNativePlatform() && capWatcherIdRef.current) {
          try {
            BackgroundGeolocation.removeWatcher({ id: capWatcherIdRef.current });
          } catch {}
          capWatcherIdRef.current = null;
        }
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        document.removeEventListener('visibilitychange', handleResume);
        window.removeEventListener('pageshow', handleResume);
        window.removeEventListener('focus', handleResume);
      };
    } else {
      // Punched Out / Off Duty: STOP NATIVE FOREGROUND SERVICE & ALL TRACKING
      if (Capacitor.isNativePlatform() && capWatcherIdRef.current) {
        try {
          BackgroundGeolocation.removeWatcher({ id: capWatcherIdRef.current });
        } catch (err) {
          console.warn('Error removing native background watcher on punch out:', err);
        }
        capWatcherIdRef.current = null;
      }

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

  const recheckGps = useCallback(() => {
    setGpsStatus('searching');
    captureAndSyncLocation();
  }, [captureAndSyncLocation]);

  return {
    isOnDuty,
    attendance,
    currentCoords,
    gpsStatus,
    isGpsDisabled,
    lastUpdate,
    refreshAttendance,
    recheckGps,
  };
}
