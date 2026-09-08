import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { backgroundKeepAlive } from '@/lib/backgroundKeepAlive';

const BackgroundGeolocation = registerPlugin<any>('BackgroundGeolocation');

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
export async function getCurrentPosition(): Promise<Coordinates> {
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
export async function requestScreenWakeLock(): Promise<WakeLockSentinel | null> {
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
 * Handles native Android Background Geolocation Foreground Service, screen off, tab switches, wake lock & auto-recovery
 */
export function useResilientLocationTracker({
  active,
  onLocationUpdate,
  minAccuracy = 150, // Ignore absurd points > 150m accuracy if needed
  tripTitle = 'ICS Live GPS Tracking',
}: {
  active: boolean;
  onLocationUpdate: (loc: LocationData) => void;
  minAccuracy?: number;
  tripTitle?: string;
}) {
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle');
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [speedKmH, setSpeedKmH] = useState<number | null>(null);
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);
  const [backgroundActive, setBackgroundActive] = useState<boolean>(false);

  const capWatcherIdRef = useRef<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchdogTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const callbackRef = useRef(onLocationUpdate);
  callbackRef.current = onLocationUpdate;

  const handlePositionSuccess = useCallback(
    (pos: GeolocationPosition | { coords: Partial<GeolocationCoordinates>; timestamp?: number }) => {
      const coords = pos.coords || {};
      const { latitude, longitude, accuracy: acc, speed, heading } = coords;

      // 1. Strict Validation: Ignore points that are missing or invalid
      if (latitude == null || longitude == null) return;

      // Ignore points very close to (0,0)
      if (Math.abs(latitude) < 0.0001 && Math.abs(longitude) < 0.0001) {
        return;
      }

      // 2. Filter out completely invalid accuracy noise
      if (acc && acc > minAccuracy && minAccuracy > 0) {
        setAccuracy(Math.round(acc));
        setGpsStatus('connected');
        return;
      }

      const now = pos.timestamp || Date.now();
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
    },
    [minAccuracy]
  );

  const handlePositionError = useCallback((err: GeolocationPositionError) => {
    if (err.code === 1) {
      console.warn('GPS permission denied');
      setGpsStatus('denied');
    } else if (err.code === 2) {
      setGpsStatus('lost');
    } else if (err.code === 3) {
      setGpsStatus((prev) => (prev === 'connected' ? 'connected' : 'searching'));
    }
  }, []);

  const forceGpsCheck = useCallback(() => {
    if (!navigator.geolocation) return;
    setGpsStatus((prev) => (prev === 'denied' ? 'denied' : 'searching'));

    navigator.geolocation.getCurrentPosition(
      (pos) => handlePositionSuccess(pos),
      () => {
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
    setGpsStatus('searching');

    // NATIVE CAPACITOR BACKGROUND GEOLOCATION (Android Foreground Service)
    if (Capacitor.isNativePlatform()) {
      try {
        BackgroundGeolocation.addWatcher(
          {
            backgroundMessage: 'Tracking route & distance in background...',
            backgroundTitle: tripTitle || 'ICS Live GPS Tracking',
            requestPermissions: true,
            stale: false,
            distanceFilter: 3, // Record update every 3 meters moved
          },
          (location: any, error: any) => {
            if (error) {
              if (error.code === 'NOT_AUTHORIZED') {
                setGpsStatus('denied');
                BackgroundGeolocation.openSettings();
              } else {
                setGpsStatus('lost');
              }
              return;
            }

            if (location) {
              handlePositionSuccess({
                coords: {
                  latitude: location.latitude,
                  longitude: location.longitude,
                  accuracy: location.accuracy || 10,
                  speed: location.speed ?? null,
                  heading: location.bearing ?? null,
                  altitude: location.altitude ?? null,
                },
                timestamp: location.time || Date.now(),
              });
            }
          }
        ).then((watcherId: string) => {
          capWatcherIdRef.current = watcherId;
          setGpsStatus('connected');
          setBackgroundActive(true);
        }).catch((err: any) => {
          console.warn('Native background geolocation failed to start:', err);
        });
      } catch (err) {
        console.warn('Native background geolocation exception:', err);
      }
    }

    // WEB FALLBACK (watchPosition + Pollers)
    if (!navigator.geolocation) {
      if (!Capacitor.isNativePlatform()) {
        setGpsStatus('denied');
      }
      return;
    }

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

    forceGpsCheck();

    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(() => {
      forceGpsCheck();
    }, 10000);

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

    requestScreenWakeLock().then((sentinel) => {
      if (sentinel) {
        wakeLockRef.current = sentinel;
        setWakeLockActive(true);
        sentinel.onrelease = () => {
          setWakeLockActive(false);
        };
      }
    });

    backgroundKeepAlive.start(tripTitle).then((started) => {
      if (!Capacitor.isNativePlatform()) {
        setBackgroundActive(started);
      }
    });
  }, [forceGpsCheck, handlePositionSuccess, handlePositionError, tripTitle]);

  const stopTracking = useCallback(() => {
    if (Capacitor.isNativePlatform() && capWatcherIdRef.current) {
      try {
        BackgroundGeolocation.removeWatcher({ id: capWatcherIdRef.current });
      } catch (err) {
        console.warn('Error removing native background watcher:', err);
      }
      capWatcherIdRef.current = null;
    }

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
    backgroundKeepAlive.stop();
    setBackgroundActive(false);
    setGpsStatus('idle');
    setAccuracy(null);
    setSpeedKmH(null);
  }, []);

  useEffect(() => {
    if (active) {
      startTracking();
      const unsubHeartbeat = backgroundKeepAlive.onHeartbeat(() => {
        forceGpsCheck();
      });
      return () => {
        unsubHeartbeat();
        stopTracking();
      };
    } else {
      stopTracking();
    }
  }, [active, startTracking, stopTracking, forceGpsCheck]);

  useEffect(() => {
    if (!active) return;

    const handleVisibilityOrResume = () => {
      if (document.visibilityState === 'visible') {
        if (!wakeLockRef.current) {
          requestScreenWakeLock().then((sentinel) => {
            if (sentinel) {
              wakeLockRef.current = sentinel;
              setWakeLockActive(true);
              sentinel.onrelease = () => setWakeLockActive(false);
            }
          });
        }
        backgroundKeepAlive.start(tripTitle).then((started) => setBackgroundActive(started));
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
  }, [active, forceGpsCheck, tripTitle]);

  const reconnectGps = useCallback(() => {
    forceGpsCheck();
    backgroundKeepAlive.start(tripTitle).then((started) => setBackgroundActive(started));
    startTracking();
  }, [forceGpsCheck, startTracking, tripTitle]);

  const enableBackgroundMode = useCallback(() => {
    return backgroundKeepAlive.start(tripTitle).then((started) => {
      setBackgroundActive(started);
      return started;
    });
  }, [tripTitle]);

  return {
    gpsStatus,
    accuracy,
    lastUpdate,
    speedKmH,
    wakeLockActive,
    backgroundActive,
    enableBackgroundMode,
    reconnectGps,
  };
}
