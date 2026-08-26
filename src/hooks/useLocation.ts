import { useCallback, useRef } from 'react';

interface Coordinates {
  latitude: number;
  longitude: number;
}

export function getCurrentPosition(): Promise<Coordinates> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ latitude: 12.9716, longitude: 77.5946 });
      return;
    }

    // Try high accuracy with a quick timeout, fallback gracefully to cached or default
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => {
        // Fallback attempt: low accuracy (cell tower / Wi-Fi IP)
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
          () => {
            // Default fallback if GPS hardware unavailable or blocked
            resolve({ latitude: 12.9716, longitude: 77.5946 });
          },
          { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 }
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
