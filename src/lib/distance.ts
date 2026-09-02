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

    // 1. Strict (0,0) / Equator-Prime-Meridian intersection check (common GPS failure point)
    if (Math.abs(p2.latitude) < 0.000001 && Math.abs(p2.longitude) < 0.000001) {
      continue;
    }

    const d = haversineDistance(
      p1.latitude,
      p1.longitude,
      p2.latitude,
      p2.longitude
    );

    // 2. Ignore physically impossible jumps (GPS Glitches)
    // If distance > 10km between 2 points recorded closely together, it's likely a jump
    if (p1.recorded_at && p2.recorded_at) {
      const timeDiffS = Math.abs(new Date(p2.recorded_at).getTime() - new Date(p1.recorded_at).getTime()) / 1000;
      if (timeDiffS > 0) {
        const speedKmh = (d / timeDiffS) * 3600;
        // If speed > 250 km/h, it's almost certainly a GPS glitch/jump
        if (speedKmh > 250 && d > 1) {
          console.warn(`Ignoring GPS jump: ${d.toFixed(2)}km in ${timeDiffS.toFixed(1)}s (${speedKmh.toFixed(0)} km/h)`);
          continue;
        }
      }
    } else if (d > 50) {
      // If no timestamps available, ignore any single jump > 50km as noise
      continue;
    }

    // 3. Accumulate distance for points moved >= 15 meters (0.015 km)
    // By comparing to lastValidPoint, we ensure distance accumulates whenever 15m threshold is reached
    if (d >= 0.015) {
      total += d;
      lastValidPoint = p2;
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

// In-memory cache for map-matched route requests
const matchCache = new Map<string, { coordinates: [number, number][]; distanceKm: number; durationMins: number }>();

/** Clear the map-match cache so updated GPS logs always get fresh road-snapped routes */
export function clearMatchCache() {
  matchCache.clear();
}

/**
 * OSRM Map Matching: Snap a GPS breadcrumb trail to the ACTUAL roads driven.
 * Uses Hidden Markov Model to find the most probable road path from noisy GPS data.
 * This is the same approach used by Uber, Swiggy, and Zomato for showing driven routes.
 *
 * Key difference from /route/:
 * - /route/ finds the OPTIMAL path → may pick a different road than what was actually driven
 * - /match/ finds the ACTUAL path → snaps GPS points to the roads they were recorded on
 */
export async function fetchMapMatchedRoute(
  points: { latitude: number; longitude: number; recorded_at?: string }[]
): Promise<{ coordinates: [number, number][]; distanceKm: number; durationMins: number } | null> {
  if (!points || points.length < 2) return null;

  // Deduplicate exact-same coordinates (stationary noise)
  const deduped = points.filter(
    (p, idx, arr) =>
      idx === 0 ||
      p.latitude !== arr[idx - 1].latitude ||
      p.longitude !== arr[idx - 1].longitude
  );

  if (deduped.length < 2) return null;

  // OSRM Match API has a limit of 100 coordinates per request.
  // For longer traces, batch in chunks of 80 with 5-point overlap for continuity.
  const CHUNK_SIZE = 80;
  const OVERLAP = 5;

  if (deduped.length <= 100) {
    // Single request — most common case
    return _fetchMatchChunk(deduped);
  }

  // Batch mode: split into chunks, match each, combine results
  let allCoords: [number, number][] = [];
  let totalDistanceM = 0;
  let totalDurationS = 0;

  for (let start = 0; start < deduped.length; start += CHUNK_SIZE - OVERLAP) {
    const end = Math.min(start + CHUNK_SIZE, deduped.length);
    const chunk = deduped.slice(start, end);
    if (chunk.length < 2) break;

    const result = await _fetchMatchChunk(chunk);
    if (result) {
      // Skip overlapping coordinates from previous chunk
      const skipFirst = start > 0 && allCoords.length > 0 ? OVERLAP : 0;
      const newCoords = skipFirst > 0 ? result.coordinates.slice(skipFirst * 2) : result.coordinates;
      allCoords = allCoords.concat(newCoords);
      totalDistanceM += result.distanceKm * 1000;
      totalDurationS += result.durationMins * 60;
    }

    if (end >= deduped.length) break;
  }

  if (allCoords.length > 0) {
    return {
      coordinates: allCoords,
      distanceKm: Math.round((totalDistanceM / 1000) * 10) / 10,
      durationMins: Math.round(totalDurationS / 60),
    };
  }

  // Final fallback: plain GPS distance calculation
  return null;
}

/**
 * Internal: Send a single batch of points to OSRM Match API
 */
async function _fetchMatchChunk(
  points: { latitude: number; longitude: number; recorded_at?: string }[]
): Promise<{ coordinates: [number, number][]; distanceKm: number; durationMins: number } | null> {
  const coordinatesStr = points
    .map((p) => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`)
    .join(';');

  // Build cache key from coordinate string (truncated for performance)
  const cacheKey = `match_${points.length}_${coordinatesStr.slice(0, 200)}`;
  if (matchCache.has(cacheKey)) {
    return matchCache.get(cacheKey)!;
  }

  // Build radiuses: 50m for rural/highway GPS, allows OSRM to snap to nearby roads
  // Higher radius = more forgiving for rural areas where roads are 30-50m away from GPS fix
  const radiuses = points.map(() => '50').join(';');

  // Build timestamps if available (improves match accuracy significantly)
  let timestampParam = '';
  if (points[0]?.recorded_at && points[points.length - 1]?.recorded_at) {
    const timestamps = points.map((p) => {
      if (p.recorded_at) {
        return Math.round(new Date(p.recorded_at).getTime() / 1000);
      }
      return '';
    });
    // Only include if all timestamps are valid
    if (timestamps.every((t) => t !== '')) {
      timestampParam = `&timestamps=${timestamps.join(';')}`;
    }
  }

  try {
    const url = `https://router.project-osrm.org/match/v1/driving/${coordinatesStr}?overview=full&geometries=geojson&gaps=split&tidy=true&radiuses=${radiuses}${timestampParam}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Match API HTTP ${res.status}`);
    const data = await res.json();

    if (data.code !== 'Ok' || !data.matchings || data.matchings.length === 0) {
      console.warn('OSRM Match: no matchings returned, code:', data.code, '— will try route fallback');
      // Try fallback: route between first and last point
      return await _fetchRouteAsFallback(points);
    }

    // Combine all matched sub-traces (OSRM may split if there are time gaps)
    let allMatchedCoords: [number, number][] = [];
    let totalDistance = 0;
    let totalDuration = 0;

    for (const matching of data.matchings) {
      if (matching.geometry?.coordinates) {
        // GeoJSON is [longitude, latitude], convert to Leaflet [latitude, longitude]
        const coords: [number, number][] = matching.geometry.coordinates.map(
          (c: [number, number]) => [c[1], c[0]]
        );
        allMatchedCoords = allMatchedCoords.concat(coords);
      }
      totalDistance += matching.distance || 0;
      totalDuration += matching.duration || 0;
    }

    if (allMatchedCoords.length > 0) {
      const result = {
        coordinates: allMatchedCoords,
        distanceKm: Math.round((totalDistance / 1000) * 10) / 10,
        durationMins: Math.round(totalDuration / 60),
      };
      matchCache.set(cacheKey, result);
      return result;
    }
  } catch (err) {
    console.warn('OSRM Map Match warning:', err, '— falling back to route API');
  }
  return await _fetchRouteAsFallback(points);
}

/**
 * Sample waypoints evenly while preserving the exact start and end GPS coordinates
 */
export function sampleWaypoints<T>(points: T[], maxCount = 60): T[] {
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
 * Route through ALL intermediate GPS waypoints (Start -> GPS A -> GPS B -> ... -> End GPS)
 * Forces the routing engine to follow the exact road path traveled (e.g. via Palladam)
 * instead of generating a generic 2-point shortest path.
 */
export async function _fetchRouteAsFallback(
  points: { latitude: number; longitude: number; recorded_at?: string }[]
): Promise<{ coordinates: [number, number][]; distanceKm: number; durationMins: number } | null> {
  if (!points || points.length < 2) return null;

  // Deduplicate nearby points (< 20m) to keep waypoints clean for OSRM
  const filtered: { latitude: number; longitude: number }[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const last = filtered[filtered.length - 1];
    const dist = haversineDistance(last.latitude, last.longitude, points[i].latitude, points[i].longitude);
    if (dist >= 0.02 || i === points.length - 1) {
      filtered.push(points[i]);
    }
  }

  // Sample up to 60 waypoints (OSRM limit safe margin)
  const waypoints = sampleWaypoints(filtered, 60);
  const coordsStr = waypoints
    .map((p) => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`)
    .join(';');

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OSRM Route HTTP ${res.status}`);
    const data = await res.json();
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const coordinates: [number, number][] = route.geometry.coordinates.map(
        (c: [number, number]) => [c[1], c[0]]
      );
      return {
        coordinates,
        distanceKm: Math.round((route.distance / 1000) * 10) / 10,
        durationMins: Math.round(route.duration / 60),
      };
    }
  } catch (err) {
    console.warn('Multi-waypoint route calculation fallback warning:', err);
  }

  // If OSRM network fails, return raw waypoint coordinates as polyline
  const rawDist = calculateGpsDistance(filtered);
  return {
    coordinates: filtered.map((p) => [p.latitude, p.longitude]),
    distanceKm: rawDist,
    durationMins: 0,
  };
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
