/**
 * Distance & Routing helper
 * - Haversine distance for straight calculations
 * - OSRM Match API for snapping GPS traces to actual roads driven (like Uber/Swiggy/Zomato)
 * - OSRM Route API for navigation/directions to a destination
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

export function calculateGpsDistance(logs: { latitude: number; longitude: number; recorded_at?: string }[]): number {
  if (!logs || logs.length < 2) return 0;
  let total = 0;
  let lastValidPoint = logs[0];

  for (let i = 1; i < logs.length; i++) {
    const p1 = lastValidPoint;
    const p2 = logs[i];

    // 1. Strict (0,0) check
    if (
      !p2.latitude ||
      !p2.longitude ||
      (Math.abs(p2.latitude) < 0.0001 && Math.abs(p2.longitude) < 0.0001)
    ) {
      continue;
    }

    const d = haversineDistance(
      p1.latitude,
      p1.longitude,
      p2.latitude,
      p2.longitude
    );

    // 2. Ignore physically impossible jumps (GPS Glitches / multipath reflection)
    if (p1.recorded_at && p2.recorded_at) {
      const timeDiffS = Math.abs(new Date(p2.recorded_at).getTime() - new Date(p1.recorded_at).getTime()) / 1000;
      if (timeDiffS > 0) {
        const speedKmh = (d / timeDiffS) * 3600;
        // In city driving, jump > 100m at speed > 130 km/h is almost certainly a glitch
        if (speedKmh > 130 && d > 0.1) {
          continue;
        }
        // Stationary drift filter: phone resting at signal / parking drifting < 25m at crawling speed
        if (speedKmh < 2.5 && d < 0.025) {
          continue;
        }
      }
    } else if (d > 5) {
      // If no timestamps available, ignore single jump > 5km
      continue;
    }

    // 3. Accumulate distance for points moved >= 15 meters (0.015 km)
    // Ensures real curves, turns, and alternate routes are faithfully tracked
    if (d >= 0.015) {
      total += d;
      lastValidPoint = p2;
    }
  }

  // Round to 1 decimal place (standard vehicle odometer e.g. 10.6 KM)
  return Math.round(total * 10) / 10;
}

export function formatKm(km: number | null | undefined): string {
  if (km == null || isNaN(km)) return '0 KM';
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

// In-memory cache for map-matched route requests
const matchCache = new Map<string, { coordinates: [number, number][]; distanceKm: number; durationMins: number }>();

/** Clear the map-match cache so updated GPS logs always get fresh road-snapped routes */
export function clearMatchCache() {
  matchCache.clear();
}

/**
 * Uber/Swiggy style Map Matching & Trajectory:
 * 1. Takes the actual breadcrumb trail recorded during the journey.
 * 2. Attempts to snap to roads via OSRM Match API (chunked cleanly to avoid URL limits).
 * 3. CRITICAL: Never falls back to multi-waypoint /route/! If match fails, returns the exact
 *    deduplicated GPS trajectory polyline with the true odometer distance.
 * 4. Ensures the calculated distance NEVER inflates (e.g. turning an 11 km trip into 61 km).
 */
export async function fetchMapMatchedRoute(
  points: { latitude: number; longitude: number; recorded_at?: string }[]
): Promise<{ coordinates: [number, number][]; distanceKm: number; durationMins: number } | null> {
  if (!points || points.length < 2) return null;

  // Filter stationary noise and deduplicate points closer than 15 meters
  const deduped: typeof points = [];
  deduped.push(points[0]);
  let lastValid = points[0];

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (!p.latitude || !p.longitude) continue;
    if (Math.abs(p.latitude) < 0.0001 && Math.abs(p.longitude) < 0.0001) continue;

    const d = haversineDistance(
      lastValid.latitude,
      lastValid.longitude,
      p.latitude,
      p.longitude
    );

    if (d >= 0.015) {
      deduped.push(p);
      lastValid = p;
    }
  }

  if (deduped.length < 2) {
    deduped.push(points[points.length - 1]);
  }

  // True ground-truth GPS odometer distance along the driven path
  const trueGpsKm = calculateGpsDistance(deduped);

  // Default duration from first and last timestamp
  let durationMins = 0;
  if (deduped[0]?.recorded_at && deduped[deduped.length - 1]?.recorded_at) {
    const diffMs = Math.abs(
      new Date(deduped[deduped.length - 1].recorded_at!).getTime() -
      new Date(deduped[0].recorded_at!).getTime()
    );
    durationMins = Math.round(diffMs / 60000);
  }

  // For long traces, sample down to at most 40 waypoints for OSRM Match API to avoid 414 URL too long
  const matchSample = sampleWaypoints(deduped, 40);
  const coordinatesStr = matchSample
    .map((p) => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`)
    .join(';');

  const cacheKey = `match_${matchSample.length}_${coordinatesStr.slice(0, 150)}`;
  if (matchCache.has(cacheKey)) {
    return matchCache.get(cacheKey)!;
  }

  try {
    const radiuses = matchSample.map(() => '40').join(';');
    const url = `https://router.project-osrm.org/match/v1/driving/${coordinatesStr}?overview=full&geometries=geojson&tidy=true&radiuses=${radiuses}`;
    const res = await fetch(url);

    if (res.ok) {
      const data = await res.json();
      if (data.code === 'Ok' && data.matchings && data.matchings.length > 0) {
        let allMatchedCoords: [number, number][] = [];
        let totalMatchedDistance = 0;

        for (const matching of data.matchings) {
          if (matching.geometry?.coordinates) {
            const coords: [number, number][] = matching.geometry.coordinates.map(
              (c: [number, number]) => [c[1], c[0]]
            );
            allMatchedCoords = allMatchedCoords.concat(coords);
          }
          totalMatchedDistance += matching.distance || 0;
        }

        if (allMatchedCoords.length > 0) {
          const matchedKm = Math.round((totalMatchedDistance / 1000) * 10) / 10;
          // Guard against erratic routing: if matched distance deviates by >25% from GPS odometer,
          // it means OSRM introduced artificial block loops. Return the true GPS breadcrumb polyline instead!
          if (trueGpsKm > 0 && Math.abs(matchedKm - trueGpsKm) > Math.max(0.3, trueGpsKm * 0.25)) {
            const cleanGpsResult = {
              coordinates: deduped.map((p) => [p.latitude, p.longitude] as [number, number]),
              distanceKm: trueGpsKm,
              durationMins,
            };
            matchCache.set(cacheKey, cleanGpsResult);
            return cleanGpsResult;
          }

          const result = {
            coordinates: allMatchedCoords,
            distanceKm: matchedKm > 0 ? matchedKm : trueGpsKm,
            durationMins,
          };
          matchCache.set(cacheKey, result);
          return result;
        }
      }
    }
  } catch (err) {
    console.warn('OSRM Match API unavailable, using GPS trajectory polyline:', err);
  }

  // Safe Fallback: Return the actual deduplicated GPS breadcrumbs polyline directly!
  // This traces the EXACT road the engineer drove on, without any zig-zags, loops, or distance inflation.
  const cleanResult = {
    coordinates: deduped.map((p) => [p.latitude, p.longitude] as [number, number]),
    distanceKm: trueGpsKm,
    durationMins,
  };
  matchCache.set(cacheKey, cleanResult);
  return cleanResult;
}

/**
 * Sample waypoints evenly while preserving the exact start and end GPS coordinates
 */
export function sampleWaypoints<T>(points: T[], maxCount = 40): T[] {
  if (points.length <= maxCount) return [...points];
  const step = (points.length - 1) / (maxCount - 1);
  const sampled: T[] = [];
  for (let i = 0; i < maxCount; i++) {
    const idx = Math.min(points.length - 1, Math.round(i * step));
    sampled.push(points[idx]);
  }
  return sampled;
}

/**
 * Fetch true road driving directions between 2 GPS coordinates
 * (Uses OSRM Route API — for navigation/directions to a destination NOT yet visited)
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
 * Uses OSRM Route API — for calculating navigation paths (NOT for showing traveled routes)
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
