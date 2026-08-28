import { useState, useEffect, useRef, useCallback } from 'react';

export type GpsStatus = 'connected' | 'searching' | 'lost' | 'denied' | 'idle';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number | null; // meters per second
  heading?: number | null;
  timestamp: number;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

/**
 * Robust single-shot GPS acquisition with high accuracy & network fallback
 */
export function getCurrentPosition(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser/device.'));
      return;
    }

    // Attempt 1: High accuracy GPS hardware
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err1) => {
        // Attempt 2: Fallback to cell tower / Wi-Fi network location
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            resolve({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            });
          },
          (err2) => {
            reject(
              new Error(
                err2.code === 1
                  ? 'Location permission was denied. Please allow location access in your browser settings.'
                  : `GPS Signal unavailable: ${err2.message || err1.message}`
              )
            );
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 }
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
    );
  });
}

/**
 * Screen WakeLock manager to prevent the mobile screen / phone from sleeping during travel
 */
async function requestScreenWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    if ('wakeLock' in navigator && navigator.wakeLock) {
      const sentinel = await navigator.wakeLock.request('screen');
      return sentinel;
    }
  } catch (err) {
    console.warn('Wake Lock request warning:', err);
  }
  return null;
}

/**
 * Advanced resilient hook for real-time background & foreground GPS tracking
 * Handles phone calls, tab visibility changes, wake lock, auto-recovery & GPS status
 */
export function useResilientLocationTracker({
  active,
  onLocationUpdate,
  minAccuracy = 150, // Ignore absurd points > 150m accuracy if needed
}: {
  active: boolean;
  onLocationUpdate: (loc: LocationData) => void;
  minAccuracy?: number;
}) {
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle');
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [speedKmH, setSpeedKmH] = useState<number | null>(null);
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);

  const watchIdRef = useRef<number | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchdogTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const callbackRef = useRef(onLocationUpdate);
  callbackRef.current = onLocationUpdate;

  const handlePositionSuccess = useCallback((pos: GeolocationPosition) => {
    const { latitude, longitude, accuracy: acc, speed, heading } = pos.coords;
    if (!latitude || !longitude) return;

    // Filter out completely invalid spoofed/huge accuracy noise if any
    if (acc && acc > minAccuracy && minAccuracy > 0) {
      // Still update status to searching/connected if we received something
      setAccuracy(Math.round(acc));
      setGpsStatus('connected');
      return;
    }

    const now = Date.now();
    lastUpdateTimeRef.current = now;
    setLastUpdate(new Date(now));
    setAccuracy(acc ? Math.round(acc) : null);
    setGpsStatus('connected');

    if (speed != null && !isNaN(speed) && speed >= 0) {
      setSpeedKmH(Math.round(speed * 3.6 * 10) / 10); // convert m/s to km/h
    }

    const locData: LocationData = {
      latitude,
      longitude,
      accuracy: acc ? Math.round(acc) : undefined,
      speed: speed != null ? speed : null,
      heading: heading != null ? heading : null,
      timestamp: now,
    };

    callbackRef.current(locData);
  }, [minAccuracy]);

  const handlePositionError = useCallback((err: GeolocationPositionError) => {
    if (err.code === 1) {
      // PERMISSION_DENIED
      console.warn('GPS permission denied');
      setGpsStatus('denied');
    } else if (err.code === 2) {
      // POSITION_UNAVAILABLE
      setGpsStatus('lost');
    } else if (err.code === 3) {
      // TIMEOUT - transient, will retry on next watch update
      setGpsStatus((prev) => (prev === 'connected' ? 'connected' : 'searching'));
    }
  }, []);

  const forceGpsCheck = useCallback(() => {
    if (!navigator.geolocation) return;
    setGpsStatus((prev) => (prev === 'denied' ? 'denied' : 'searching'));

    navigator.geolocation.getCurrentPosition(
      (pos) => handlePositionSuccess(pos),
      (err) => {
        // Fallback with low accuracy
        navigator.geolocation.getCurrentPosition(
          (pos) => handlePositionSuccess(pos),
          (e2) => handlePositionError(e2),
          { enableHighAccuracy: false, timeout: 12000, maximumAge: 20000 }
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
    );
  }, [handlePositionSuccess, handlePositionError]);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsStatus('denied');
      return;
    }

    setGpsStatus('searching');

    // 1. Start continuous watchPosition
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => handlePositionSuccess(pos),
        (err) => handlePositionError(err),
        {
          enableHighAccuracy: true,
          maximumAge: 4000,
          timeout: 20000,
        }
      );
    } catch (e) {
      console.warn('watchPosition failed to start:', e);
    }

    // 2. Initial position check
    forceGpsCheck();

    // 3. Watchdog timer (every 10s): only restarts if stalled for > 30s
    if (watchdogTimerRef.current) clearInterval(watchdogTimerRef.current);
    watchdogTimerRef.current = setInterval(() => {
      const timeSinceLast = Date.now() - lastUpdateTimeRef.current;
      if (lastUpdateTimeRef.current > 0 && timeSinceLast > 30000) {
        setGpsStatus('lost');
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
        try {
          watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => handlePositionSuccess(pos),
            (err) => handlePositionError(err),
            { enableHighAccuracy: true, maximumAge: 4000, timeout: 20000 }
          );
        } catch {}
        forceGpsCheck();
      }
    }, 10000);

    // 4. Request Screen WakeLock
    requestScreenWakeLock().then((sentinel) => {
      if (sentinel) {
        wakeLockRef.current = sentinel;
        setWakeLockActive(true);
        sentinel.onrelease = () => {
          setWakeLockActive(false);
        };
      }
    });
  }, [forceGpsCheck, handlePositionSuccess, handlePositionError]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (watchdogTimerRef.current) {
      clearInterval(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
    setGpsStatus('idle');
    setAccuracy(null);
    setSpeedKmH(null);
  }, []);

  // Main lifecycle: Start or stop based on active prop
  useEffect(() => {
    if (active) {
      startTracking();
    } else {
      stopTracking();
    }

    return () => {
      stopTracking();
    };
  }, [active, startTracking, stopTracking]);

  // Mobile Lifecycle Handlers:
  // When user receives a phone call, tab is backgrounded. When call ends and user returns to browser:
  // visibilitychange ('visible'), pageshow, focus, and online events fire.
  useEffect(() => {
    if (!active) return;

    const handleVisibilityOrResume = () => {
      if (document.visibilityState === 'visible') {
        // Re-acquire WakeLock if dropped
        if (!wakeLockRef.current) {
          requestScreenWakeLock().then((sentinel) => {
            if (sentinel) {
              wakeLockRef.current = sentinel;
              setWakeLockActive(true);
              sentinel.onrelease = () => setWakeLockActive(false);
            }
          });
        }
        // Force immediate GPS refresh
        forceGpsCheck();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrResume);
    window.addEventListener('pageshow', handleVisibilityOrResume);
    window.addEventListener('focus', handleVisibilityOrResume);
    window.addEventListener('online', handleVisibilityOrResume);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrResume);
      window.removeEventListener('pageshow', handleVisibilityOrResume);
      window.removeEventListener('focus', handleVisibilityOrResume);
      window.removeEventListener('online', handleVisibilityOrResume);
    };
  }, [active, forceGpsCheck]);

  const reconnectGps = useCallback(() => {
    forceGpsCheck();
    startTracking();
  }, [forceGpsCheck, startTracking]);

  return {
    gpsStatus,
    accuracy,
    lastUpdate,
    speedKmH,
    wakeLockActive,
    reconnectGps,
  };
}
