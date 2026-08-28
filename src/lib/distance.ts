/**
 * Distance & Routing helper
 * - Haversine distance for straight calculations
 * - Real Google Maps / OSRM Road Driving Directions (snaps path to actual roads like Uber & Google Maps)
 */

export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function calculateGpsDistance(logs: { latitude: number; longitude: number }[]): number {
  if (!logs || logs.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < logs.length; i++) {
    const d = haversineDistance(
      logs[i - 1].latitude,
      logs[i - 1].longitude,
      logs[i].latitude,
      logs[i].longitude
    );
    // Ignore micro-drift noise between stationary points (< 15 meters / 0.015 km)
    if (d >= 0.015) {
      total += d;
    }
  }
  return Math.round(total * 100) / 100;
}

export function formatKm(km: number | null | undefined): string {
  if (km == null) return '0 KM';
  return `${Number(km).toFixed(1)} KM`;
}

export function formatDuration(startTs: string | null | undefined, endTs: string | null | undefined): string {
  if (!startTs) return '—';
  const start = new Date(startTs).getTime();
  const end = endTs ? new Date(endTs).getTime() : Date.now();
  const diffMs = Math.max(0, end - start);
  const diffMins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

// In-memory cache for road driving route requests
const routeCache = new Map<string, { coordinates: [number, number][]; distanceKm: number; durationMins: number }>();

/**
 * Fetch true road driving directions between 2 GPS coordinates
 * (Uses OSRM Driving Engine / OpenStreetMap highway data compatible format)
 */
export async function fetchRoadDrivingRoute(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<{ coordinates: [number, number][]; distanceKm: number; durationMins: number } | null> {
  const cacheKey = `${originLat.toFixed(4)},${originLng.toFixed(4)}_${destLat.toFixed(4)},${destLng.toFixed(4)}`;
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey)!;
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Route fetch failed');
    const data = await res.json();

    if (data.routes && data.routes.length > 0) {
      const primaryRoute = data.routes[0];
      // GeoJSON is [longitude, latitude], convert to Leaflet [latitude, longitude]
      const coordinates: [number, number][] = primaryRoute.geometry.coordinates.map(
        (c: [number, number]) => [c[1], c[0]]
      );
      const distanceKm = Math.round((primaryRoute.distance / 1000) * 10) / 10;
      const durationMins = Math.round(primaryRoute.duration / 60);

      const result = { coordinates, distanceKm, durationMins };
      routeCache.set(cacheKey, result);
      return result;
    }
  } catch (err) {
    console.warn('Real-time road routing warning:', err);
  }

  return null;
}

/**
 * Fetch true road route along an array of waypoints
 * Snaps the path to real road turns and returns exact road-driving distance
 */
export async function fetchMultiWaypointRoadRoute(
  points: { latitude: number; longitude: number }[]
): Promise<{ coordinates: [number, number][]; distanceKm: number; durationMins: number } | null> {
  if (!points || points.length < 2) return null;

  // If points are many, sample key waypoints (max 25 waypoints for OSRM URL limit)
  let sampled = points;
  if (points.length > 25) {
    const step = (points.length - 1) / 24;
    sampled = [points[0]];
    for (let i = 1; i < 24; i++) {
      sampled.push(points[Math.round(i * step)]);
    }
    sampled.push(points[points.length - 1]);
  }

  const coordinatesStr = sampled
    .map((p) => `${p.longitude.toFixed(5)},${p.latitude.toFixed(5)}`)
    .join(';');
  const cacheKey = `multi_${coordinatesStr}`;
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey)!;
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${coordinatesStr}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Multi-waypoint route fetch failed');
    const data = await res.json();

    if (data.routes && data.routes.length > 0) {
      const primaryRoute = data.routes[0];
      const coordinates: [number, number][] = primaryRoute.geometry.coordinates.map(
        (c: [number, number]) => [c[1], c[0]]
      );
      const distanceKm = Math.round((primaryRoute.distance / 1000) * 10) / 10;
      const durationMins = Math.round(primaryRoute.duration / 60);

      const result = { coordinates, distanceKm, durationMins };
      routeCache.set(cacheKey, result);
      return result;
    }
  } catch (err) {
    console.warn('Multi-waypoint road routing warning:', err);
  }

  // Fallback to start->end road route
  if (points.length >= 2) {
    return fetchRoadDrivingRoute(
      points[0].latitude,
      points[0].longitude,
      points[points.length - 1].latitude,
      points[points.length - 1].longitude
    );
  }

  return null;
}
