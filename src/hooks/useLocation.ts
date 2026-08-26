import { useCallback, useRef } from 'react';

interface Coordinates {
  latitude: number;
  longitude: number;
}

export function getCurrentPosition(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not supported by your browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => {
        let msg = 'Unable to get your location.';
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Location permission is required to start travel. Please enable location access in your browser.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = 'Location information is unavailable. Please try again.';
        } else if (err.code === err.TIMEOUT) {
          msg = 'Location request timed out. Please try again.';
        }
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

export function useLocationTracking(onUpdate: (coords: Coordinates) => void, active: boolean) {
  const watchIdRef = useRef<number | null>(null);
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  const start = useCallback(() => {
    if (!navigator.geolocation) return;
    if (watchIdRef.current !== null) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => callbackRef.current({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => console.error('Location watch error:', err.message),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 30000 }
    );
  }, []);

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  return { start, stop };
}
