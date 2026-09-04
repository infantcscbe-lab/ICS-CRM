import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Navigation, MapPin, ExternalLink, Route, RefreshCw, Users, Phone, ArrowLeft, Car } from 'lucide-react';
import type { JobLocationLog } from '@/types/database';
import { calculateGpsDistance, fetchMapMatchedRoute, fetchRoadDrivingRoute, haversineDistance, clearMatchCache } from '@/lib/distance';
import type { GpsStatus } from '@/hooks/useLocation';

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Trip Start Marker (Green Start Flag)
const createStartIcon = () =>
  L.divIcon({
    className: 'custom-start-icon',
    html: `
    <div style="position:relative; width:34px; height:34px; display:flex; align-items:center; justify-content:center;">
      <div style="width:28px; height:28px; border-radius:50%; background:#10b981; border:2.5px solid #ffffff; box-shadow:0 3px 10px rgba(16,185,129,0.6); display:flex; align-items:center; justify-content:center; color:white; font-size:13px; font-weight:bold;">
        🚩
      </div>
    </div>
  `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });

// Trip End / Arrived Marker (Checkered Finish Flag 🏁)
const createEndIcon = () =>
  L.divIcon({
    className: 'custom-end-icon',
    html: `
    <div style="position:relative; width:36px; height:36px; display:flex; align-items:center; justify-content:center;">
      <div style="position:absolute; width:100%; height:100%; border-radius:50%; background:rgba(239,68,68,0.28); animation:pulse-ring 2s infinite;"></div>
      <div style="width:30px; height:30px; border-radius:50%; background:#dc2626; border:2.5px solid #ffffff; box-shadow:0 3px 12px rgba(220,38,38,0.65); display:flex; align-items:center; justify-content:center; color:white; font-size:14px; font-weight:bold;">
        🏁
      </div>
    </div>
  `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });



// Custom Live Vehicle Navigation Marker with pulse radar
const createEngineerIcon = (heading = 0) =>
  L.divIcon({
    className: 'custom-rider-icon',
    html: `
    <div style="position:relative; width:48px; height:48px; display:flex; align-items:center; justify-content:center;">
      <div style="position:absolute; width:100%; height:100%; border-radius:50%; background:rgba(37,99,235,0.3); animation:pulse-ring 2s infinite cubic-bezier(0.215, 0.61, 0.355, 1);"></div>
      <div style="width:36px; height:36px; border-radius:50%; background:#2563eb; border:3px solid #ffffff; box-shadow:0 4px 14px rgba(37,99,235,0.6); display:flex; align-items:center; justify-content:center; transform:rotate(${heading}deg); transition:transform 0.4s ease;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="none">
          <polygon points="12 2 19 21 12 17 5 21 12 2"/>
        </svg>
      </div>
    </div>
  `,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });

// Custom Fleet Engineer Pin for Multi-Engineer Overview
const createFleetEngineerIcon = (name: string, status: string) => {
  const isTraveling = status === 'traveling';
  const isReached = status === 'reached' || status === 'in_progress';
  const bgColor = isTraveling ? '#2563eb' : isReached ? '#ea580c' : '#10b981';
  const ringColor = isTraveling
    ? 'rgba(37,99,235,0.35)'
    : isReached
    ? 'rgba(234,88,12,0.35)'
    : 'rgba(16,185,129,0.35)';
  const initial = name ? name.charAt(0).toUpperCase() : 'E';

  return L.divIcon({
    className: 'custom-fleet-marker',
    html: `
      <div style="position:relative; width:44px; height:44px; display:flex; align-items:center; justify-content:center; cursor:pointer;">
        ${
          isTraveling
            ? `<div style="position:absolute; width:100%; height:100%; border-radius:50%; background:${ringColor}; animation:pulse-ring 2s infinite cubic-bezier(0.215, 0.61, 0.355, 1);"></div>`
            : ''
        }
        <div style="width:34px; height:34px; border-radius:50%; background:${bgColor}; border:2.5px solid #ffffff; box-shadow:0 4px 12px rgba(0,0,0,0.28); display:flex; align-items:center; justify-content:center; color:#ffffff; font-weight:bold; font-size:13px; font-family:sans-serif;">
          ${initial}
        </div>
        <div style="position:absolute; bottom:-6px; background:#0f172a; color:#ffffff; font-size:9px; font-weight:bold; padding:1px 5px; border-radius:8px; border:1px solid #ffffff; white-space:nowrap; box-shadow:0 2px 4px rgba(0,0,0,0.25);">
          ${name.split(' ')[0]}
        </div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
};

// Destination Pin (Red drop pin)
const createClientIcon = () =>
  L.divIcon({
    className: 'custom-dest-icon',
    html: `
    <div style="position:relative; width:40px; height:40px; display:flex; align-items:center; justify-content:center;">
      <div style="width:32px; height:32px; border-radius:50%; background:#ea4335; border:3px solid #ffffff; box-shadow:0 6px 16px rgba(234,67,53,0.55); display:flex; align-items:center; justify-content:center;">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
          <circle cx="12" cy="10" r="3" fill="white"/>
        </svg>
      </div>
    </div>
  `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });

// Map View auto-fitter for bounds
function ChangeMapView({ bounds, center }: { bounds: L.LatLngBoundsExpression | null; center?: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [45, 45], maxZoom: 16 });
    } else if (center) {
      map.setView(center, map.getZoom() || 15);
    }
  }, [bounds, center, map]);
  return null;
}

export interface FleetEngineerLocation {
  id: string;
  name: string;
  phone?: string;
  status: string;
  statusLabel: string;
  location: { latitude: number; longitude: number };
  activeJobNumber?: string;
  activeClientName?: string;
  lastSeen?: string;
}

interface LiveTrackingMapProps {
  currentLocation: { latitude: number; longitude: number } | null;
  startLocation?: { latitude: number; longitude: number } | null;
  reachedLocation?: { latitude: number; longitude: number } | null;
  clientLocation?: { latitude: number; longitude: number } | null;
  clientName?: string;
  clientAddress?: string;
  engineerName?: string;
  routeLogs?: JobLocationLog[];
  status?: string;
  height?: string;
  interactive?: boolean;
  gpsStatus?: GpsStatus;
  accuracy?: number | null;
  lastUpdate?: Date | null;
  speedKmH?: number | null;
  totalKm?: number | null;
  onReconnectGps?: () => void;
  onRoadDistanceCalculated?: (distanceKm: number) => void;
  // Multi-Engineer Fleet Mode Props
  fleetEngineers?: FleetEngineerLocation[];
  onSelectFleetEngineer?: (engineerId: string) => void;
  onBackToFleet?: () => void;
  showAllFleet?: boolean;
}

export function LiveTrackingMap({
  currentLocation,
  startLocation,
  reachedLocation,
  clientLocation,
  clientName = 'Client Location',
  clientAddress = '',
  engineerName = 'Engineer',
  routeLogs = [],
  status = 'traveling',
  height = '380px',
  interactive = true,
  gpsStatus = 'connected',
  accuracy = null,
  lastUpdate = null,
  speedKmH = null,
  totalKm = null,
  onReconnectGps,
  onRoadDistanceCalculated,
  fleetEngineers = [],
  onSelectFleetEngineer,
  onBackToFleet,
  showAllFleet = false,
}: LiveTrackingMapProps) {
  const [mapLayer, setMapLayer] = useState<'streets' | 'hybrid' | 'terrain'>('streets');
  // Traveled path: snapped to actual roads via OSRM Match / Route API
  const [traveledRoute, setTraveledRoute] = useState<[number, number][]>([]);
  const [traveledDistanceKm, setTraveledDistanceKm] = useState<number | null>(null);
  // Remaining path: navigation route to client via OSRM Route API
  const [remainingRoute, setRemainingRoute] = useState<[number, number][]>([]);

  const isTripArrived = status === 'reached' || status === 'in_progress' || status === 'solved' || status === 'completed';

  const startPoint =
    startLocation && startLocation.latitude && startLocation.longitude
      ? startLocation
      : routeLogs.length > 0
      ? { latitude: routeLogs[0].latitude, longitude: routeLogs[0].longitude }
      : null;

  const endPoint =
    reachedLocation && reachedLocation.latitude && reachedLocation.longitude
      ? reachedLocation
      : isTripArrived && routeLogs.length > 0
      ? { latitude: routeLogs[routeLogs.length - 1].latitude, longitude: routeLogs[routeLogs.length - 1].longitude }
      : isTripArrived && currentLocation
      ? currentLocation
      : null;

  // Traveled GPS checkpoints from trip start to current place
  const historyPoints: [number, number][] = routeLogs.map((l) => [l.latitude, l.longitude]);

  // Ensure startPoint is at start of history points
  if (
    startPoint &&
    (historyPoints.length === 0 ||
      historyPoints[0][0] !== startPoint.latitude ||
      historyPoints[0][1] !== startPoint.longitude)
  ) {
    historyPoints.unshift([startPoint.latitude, startPoint.longitude]);
  }

  // Ensure destination/current location is appended to history points
  const destPoint = isTripArrived ? endPoint : currentLocation;
  if (
    destPoint &&
    (historyPoints.length === 0 ||
      historyPoints[historyPoints.length - 1][0] !== destPoint.latitude ||
      historyPoints[historyPoints.length - 1][1] !== destPoint.longitude)
  ) {
    historyPoints.push([destPoint.latitude, destPoint.longitude]);
  }

  const defaultPos: [number, number] = currentLocation
    ? [currentLocation.latitude, currentLocation.longitude]
    : endPoint
    ? [endPoint.latitude, endPoint.longitude]
    : startPoint
    ? [startPoint.latitude, startPoint.longitude]
    : clientLocation?.latitude && clientLocation?.longitude
    ? [clientLocation.latitude, clientLocation.longitude]
    : fleetEngineers.length > 0
    ? [fleetEngineers[0].location.latitude, fleetEngineers[0].location.longitude]
    : [11.0168, 76.9558]; // Default Coimbatore area center



  // ─── TRAVELED PATH: Use OSRM Match / Route API to snap GPS trail to actual roads driven ───
  useEffect(() => {
    let isMounted = true;
    if (showAllFleet) {
      setTraveledRoute([]);
      setTraveledDistanceKm(null);
      return;
    }

    async function loadTraveledPath() {
      // Clear stale cache so new GPS logs always get fresh road-matched results
      clearMatchCache();

      const fromPoint = startPoint;
      const toPoint = isTripArrived ? endPoint : currentLocation;

      // Scenario A: When routeLogs < 2 (e.g. 0 or 1 log recorded due to mobile background sleep or direct start/end saved)
      if (routeLogs.length < 2) {
        if (
          fromPoint &&
          toPoint &&
          (Math.abs(fromPoint.latitude - toPoint.latitude) > 0.0001 ||
            Math.abs(fromPoint.longitude - toPoint.longitude) > 0.0001)
        ) {
          const roadResult = await fetchRoadDrivingRoute(
            fromPoint.latitude,
            fromPoint.longitude,
            toPoint.latitude,
            toPoint.longitude
          );
          if (isMounted && roadResult && roadResult.coordinates.length > 0) {
            setTraveledRoute(roadResult.coordinates);
            setTraveledDistanceKm(roadResult.distanceKm);
            if (onRoadDistanceCalculated && roadResult.distanceKm > 0) {
              onRoadDistanceCalculated(roadResult.distanceKm);
            }
            return;
          }
        }
        if (isMounted) {
          setTraveledRoute(historyPoints.length > 1 ? historyPoints : []);
          setTraveledDistanceKm(totalKm || null);
        }
        return;
      }

      // Scenario B: When routeLogs >= 2, build full waypoint path
      const matchPoints: { latitude: number; longitude: number; recorded_at?: string }[] = routeLogs.map((l) => ({
        latitude: l.latitude,
        longitude: l.longitude,
        recorded_at: l.recorded_at,
      }));

      // Prepend startPoint if not already matching the first log
      if (
        fromPoint &&
        matchPoints.length > 0 &&
        (Math.abs(matchPoints[0].latitude - fromPoint.latitude) > 0.0005 ||
          Math.abs(matchPoints[0].longitude - fromPoint.longitude) > 0.0005)
      ) {
        matchPoints.unshift({
          latitude: fromPoint.latitude,
          longitude: fromPoint.longitude,
          recorded_at: routeLogs[0]?.recorded_at,
        });
      }

      // Append destination/current if not already matching the last log
      if (
        toPoint &&
        matchPoints.length > 0 &&
        (Math.abs(matchPoints[matchPoints.length - 1].latitude - toPoint.latitude) > 0.0005 ||
          Math.abs(matchPoints[matchPoints.length - 1].longitude - toPoint.longitude) > 0.0005)
      ) {
        matchPoints.push({
          latitude: toPoint.latitude,
          longitude: toPoint.longitude,
          recorded_at: new Date().toISOString(),
        });
      }

      const matchResult = await fetchMapMatchedRoute(matchPoints);
      if (isMounted && matchResult && matchResult.coordinates.length > 0) {
        // If matched distance is available and within 25% of totalKm, use it; otherwise enforce totalKm
        const finalKm =
          totalKm && totalKm > 0 && Math.abs(matchResult.distanceKm - totalKm) > Math.max(0.3, totalKm * 0.25)
            ? totalKm
            : matchResult.distanceKm;
        setTraveledRoute(matchResult.coordinates);
        setTraveledDistanceKm(finalKm);
        if (onRoadDistanceCalculated && finalKm > 0) {
          onRoadDistanceCalculated(finalKm);
        }
        return;
      }

      // Safe Fallback: When match is unavailable, render the true GPS breadcrumbs directly!
      // NEVER call multi-waypoint /route/ which generates block loops through one-way streets.
      if (isMounted) {
        const gpsDist = totalKm && totalKm > 0 ? totalKm : calculateGpsDistance(matchPoints);
        setTraveledRoute(matchPoints.map((p) => [p.latitude, p.longitude]));
        setTraveledDistanceKm(gpsDist > 0 ? gpsDist : totalKm || null);
        if (onRoadDistanceCalculated && gpsDist > 0) {
          onRoadDistanceCalculated(gpsDist);
        }
      }
    }

    loadTraveledPath();
    return () => {
      isMounted = false;
    };
  }, [
    showAllFleet,
    routeLogs.length,
    routeLogs[0]?.latitude,
    routeLogs[0]?.longitude,
    routeLogs[routeLogs.length - 1]?.latitude,
    routeLogs[routeLogs.length - 1]?.longitude,
    currentLocation?.latitude,
    currentLocation?.longitude,
    startPoint?.latitude,
    startPoint?.longitude,
    endPoint?.latitude,
    endPoint?.longitude,
    startLocation?.latitude,
    startLocation?.longitude,
    reachedLocation?.latitude,
    reachedLocation?.longitude,
    status,
    totalKm,
  ]);

  // ─── REMAINING PATH: Use OSRM Route API for navigation to client destination ───
  useEffect(() => {
    let isMounted = true;
    if (
      showAllFleet ||
      !clientLocation?.latitude ||
      !clientLocation?.longitude ||
      status === 'completed' ||
      status === 'reached' ||
      status === 'solved' ||
      status === 'in_progress'
    ) {
      setRemainingRoute([]);
      return;
    }

    async function loadRemainingPath() {
      // Get the "from" point: current location or last GPS log
      const fromPoint = currentLocation ||
        (routeLogs.length > 0
          ? { latitude: routeLogs[routeLogs.length - 1].latitude, longitude: routeLogs[routeLogs.length - 1].longitude }
          : startPoint);

      if (!fromPoint || !clientLocation?.latitude || !clientLocation?.longitude) {
        setRemainingRoute([]);
        return;
      }

      // Don't show remaining route if already at/near client (<200m)
      const distToClient = haversineDistance(
        fromPoint.latitude,
        fromPoint.longitude,
        clientLocation.latitude,
        clientLocation.longitude
      );
      if (distToClient < 0.2) {
        setRemainingRoute([]);
        return;
      }

      const routeData = await fetchRoadDrivingRoute(
        fromPoint.latitude,
        fromPoint.longitude,
        clientLocation.latitude,
        clientLocation.longitude
      );
      if (isMounted && routeData && routeData.coordinates.length > 0) {
        setRemainingRoute(routeData.coordinates);
      }
    }

    loadRemainingPath();
    return () => {
      isMounted = false;
    };
  }, [
    showAllFleet,
    currentLocation?.latitude,
    currentLocation?.longitude,
    clientLocation?.latitude,
    clientLocation?.longitude,
  ]);

  // Calculate Map Bounds
  const allCoordinates: [number, number][] = [];
  if (showAllFleet && fleetEngineers.length > 0) {
    fleetEngineers.forEach((e) => allCoordinates.push([e.location.latitude, e.location.longitude]));
  } else {
    historyPoints.forEach((p) => allCoordinates.push(p));
    traveledRoute.forEach((p) => allCoordinates.push(p));
    remainingRoute.forEach((p) => allCoordinates.push(p));
    if (startPoint) {
      allCoordinates.push([startPoint.latitude, startPoint.longitude]);
    }
    if (endPoint) {
      allCoordinates.push([endPoint.latitude, endPoint.longitude]);
    }
    if (currentLocation) {
      allCoordinates.push([currentLocation.latitude, currentLocation.longitude]);
    }
    if (clientLocation?.latitude && clientLocation?.longitude) {
      allCoordinates.push([clientLocation.latitude, clientLocation.longitude]);
    }
  }

  const bounds = allCoordinates.length > 1 ? L.latLngBounds(allCoordinates) : null;

  // External Google Maps directions URL
  const googleMapsDirectionsUrl =
    currentLocation && clientLocation?.latitude && clientLocation?.longitude
      ? `https://www.google.com/maps/dir/?api=1&origin=${currentLocation.latitude},${currentLocation.longitude}&destination=${clientLocation.latitude},${clientLocation.longitude}&travelmode=driving`
      : currentLocation
      ? `https://www.google.com/maps/search/?api=1&query=${currentLocation.latitude},${currentLocation.longitude}`
      : 'https://www.google.com/maps';

  // Tile layer URLs
  const tileLayers = {
    streets: {
      url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
      attribution: '&copy; Google Maps',
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    },
    hybrid: {
      url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
      attribution: '&copy; Google Maps',
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    },
    terrain: {
      url: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
      attribution: '&copy; Google Maps',
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    },
  };

  const displayedKm =
    totalKm != null && totalKm > 0
      ? totalKm
      : traveledDistanceKm != null && traveledDistanceKm > 0
      ? traveledDistanceKm
      : calculateGpsDistance(routeLogs.map((l) => ({ latitude: l.latitude, longitude: l.longitude })));

  return (
    <div
      className="relative isolate z-0 overflow-hidden rounded-2xl border border-slate-300 shadow-lg bg-slate-100"
      style={{ height }}
    >
      {/* Top Left: Live Status Badge & Back to Fleet Button */}
      <div className="absolute left-3 top-3 z-[1000] flex flex-col gap-1.5 pointer-events-auto max-w-[70%] sm:max-w-none">
        {showAllFleet ? (
          <div className="flex items-center gap-2 rounded-xl bg-slate-900/90 px-3.5 py-2 text-xs font-bold text-white shadow-xl backdrop-blur-md border border-slate-700">
            <Users className="h-4 w-4 text-emerald-400" />
            <span>All Engineers Overview ({fleetEngineers.length} Live)</span>
          </div>
        ) : (
          <>
            {onBackToFleet && (
              <button
                type="button"
                onClick={onBackToFleet}
                className="flex items-center gap-1.5 rounded-xl bg-slate-900/90 px-3 py-1.5 text-xs font-bold text-white shadow-xl backdrop-blur-md border border-slate-700 hover:bg-slate-800 transition"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Show All Engineers
              </button>
            )}

            {/* GPS Live Status Pill */}
            <div className="flex items-center gap-2 rounded-xl bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-white shadow-xl backdrop-blur-md border border-slate-700">
              {gpsStatus === 'connected' ? (
                <div className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
                </div>
              ) : gpsStatus === 'searching' ? (
                <div className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500"></span>
                </div>
              ) : (
                <span className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0"></span>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-bold text-white text-[11px] sm:text-xs">
                  {gpsStatus === 'connected' && 'GPS Connected'}
                  {gpsStatus === 'searching' && 'GPS Searching...'}
                  {gpsStatus === 'lost' && 'GPS Signal Lost'}
                  {gpsStatus === 'denied' && 'GPS Denied'}
                  {gpsStatus === 'idle' && 'GPS Standby'}
                </span>

                {accuracy != null && gpsStatus === 'connected' && (
                  <span className="text-[10px] text-emerald-400 font-mono">
                    (±{accuracy}m)
                  </span>
                )}

                {speedKmH != null && speedKmH > 0 && (
                  <span className="text-[10px] text-blue-300 font-mono">
                    • {speedKmH} km/h
                  </span>
                )}
              </div>

              {(gpsStatus === 'lost' || gpsStatus === 'searching') && onReconnectGps && (
                <button
                  type="button"
                  onClick={onReconnectGps}
                  className="ml-1 flex items-center gap-1 rounded-md bg-amber-500/30 px-1.5 py-0.5 text-[10px] font-bold text-amber-200 hover:bg-amber-500/50 transition border border-amber-400/40"
                  title="Click to reconnect GPS hardware"
                >
                  <RefreshCw className="h-2.5 w-2.5 animate-spin" /> Fix GPS
                </button>
              )}
            </div>

            {/* Traveled Road Distance Badge */}
            {(displayedKm > 0 || historyPoints.length > 0) && (
              <div className="flex items-center gap-2 rounded-xl bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-800 shadow-md backdrop-blur-md border border-slate-200">
                <span className="flex items-center gap-1 text-blue-600">
                  <Route className="h-3.5 w-3.5 text-blue-600" />{' '}
                  {routeLogs.length >= 2 ? 'GPS Route:' : 'Estimated Route:'} {displayedKm.toFixed(1)} KM
                </span>
                {routeLogs.length > 0 ? (
                  <>
                    <span className="text-slate-300">•</span>
                    <span className="text-[11px] text-slate-500">
                      {routeLogs.length} Checkpoints
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-slate-300">•</span>
                    <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">
                      Direct Route
                    </span>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Top Right: Layer Switcher & Google Maps Shortcut */}
      <div className="absolute right-3 top-3 z-[1000] flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
        <div className="flex rounded-xl bg-white/95 p-0.5 shadow-md border border-slate-200 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setMapLayer('streets')}
            className={`rounded-lg px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-bold transition ${
              mapLayer === 'streets'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Map
          </button>
          <button
            type="button"
            onClick={() => setMapLayer('hybrid')}
            className={`rounded-lg px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-bold transition ${
              mapLayer === 'hybrid'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Satellite
          </button>
          <button
            type="button"
            onClick={() => setMapLayer('terrain')}
            className={`rounded-lg px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-bold transition ${
              mapLayer === 'terrain'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Terrain
          </button>
        </div>

        <a
          href={googleMapsDirectionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded-xl bg-blue-600 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold text-white shadow-md hover:bg-blue-700 transition"
          title="Open Directions in Google Maps"
        >
          <span>Google Maps</span>
          <ExternalLink className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
        </a>
      </div>

      <MapContainer
        center={defaultPos}
        zoom={14}
        zoomControl={false}
        scrollWheelZoom={interactive}
        dragging={interactive}
        style={{ height: '100%', width: '100%' }}
      >
        <ZoomControl position="bottomright" />
        <TileLayer
          key={mapLayer}
          url={tileLayers[mapLayer].url}
          attribution={tileLayers[mapLayer].attribution}
          subdomains={tileLayers[mapLayer].subdomains}
          maxZoom={20}
        />

        <ChangeMapView
          bounds={bounds}
          center={currentLocation ? [currentLocation.latitude, currentLocation.longitude] : undefined}
        />

        {/* ----------------- FLEET MODE (ALL ENGINEERS OVERVIEW) ----------------- */}
        {showAllFleet &&
          fleetEngineers.map((eng) => (
            <Marker
              key={eng.id}
              position={[eng.location.latitude, eng.location.longitude]}
              icon={createFleetEngineerIcon(eng.name, eng.status)}
            >
              <Popup className="custom-popup">
                <div className="p-1 min-w-[200px]">
                  <div className="flex items-center justify-between gap-2 border-b pb-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-slate-900">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">
                        {eng.name.charAt(0)}
                      </div>
                      <span>{eng.name}</span>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        eng.status === 'traveling'
                          ? 'bg-blue-100 text-blue-700 border border-blue-200'
                          : eng.status === 'reached' || eng.status === 'in_progress'
                          ? 'bg-amber-100 text-amber-700 border border-amber-200'
                          : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {eng.statusLabel}
                    </span>
                  </div>

                  {eng.activeJobNumber && (
                    <div className="mt-2 rounded-lg bg-blue-50/80 p-2 text-xs border border-blue-100">
                      <p className="font-bold text-blue-900 flex items-center gap-1">
                        <Car className="h-3.5 w-3.5" /> Job #{eng.activeJobNumber}
                      </p>
                      {eng.activeClientName && (
                        <p className="text-slate-600 text-[11px] mt-0.5">
                          Client: <strong>{eng.activeClientName}</strong>
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-2 text-[11px] text-slate-500 space-y-0.5">
                    <p>
                      GPS: {eng.location.latitude.toFixed(4)}, {eng.location.longitude.toFixed(4)}
                    </p>
                    {eng.lastSeen && <p>Last Seen: {eng.lastSeen}</p>}
                  </div>

                  <div className="mt-3 flex items-center gap-2 pt-1 border-t">
                    {eng.phone && (
                      <a
                        href={`tel:${eng.phone}`}
                        className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                      >
                        <Phone className="h-3 w-3" /> Call
                      </a>
                    )}
                    {onSelectFleetEngineer && (
                      <button
                        type="button"
                        onClick={() => onSelectFleetEngineer(eng.id)}
                        className="flex-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-blue-700 text-center shadow-sm"
                      >
                        {eng.status === 'traveling' ? 'View Route Map →' : 'Focus Engineer →'}
                      </button>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

        {/* ----------------- SINGLE ENGINEER TRIP ROUTE MODE ----------------- */}
        {!showAllFleet && (
          <>
            {/* ── TRAVELED PATH: Actual roads driven (OSRM Map Matched) ── */}
            {traveledRoute.length > 0 ? (
              <>
                {/* Outer Glow */}
                <Polyline
                  positions={traveledRoute}
                  pathOptions={{
                    color: '#60a5fa',
                    weight: 8,
                    opacity: 0.5,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
                {/* Solid Core — actual traveled road */}
                <Polyline
                  positions={traveledRoute}
                  pathOptions={{
                    color: '#1d4ed8',
                    weight: 5,
                    opacity: 0.95,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
              </>
            ) : historyPoints.length > 1 ? (
              <>
                {/* Fallback: raw GPS trail when match API hasn't loaded */}
                <Polyline
                  positions={historyPoints}
                  pathOptions={{
                    color: '#60a5fa',
                    weight: 8,
                    opacity: 0.5,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
                <Polyline
                  positions={historyPoints}
                  pathOptions={{
                    color: '#1d4ed8',
                    weight: 4.5,
                    opacity: 0.95,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
              </>
            ) : null}

            {/* ── REMAINING PATH: Navigation route to client destination (dashed) ── */}
            {remainingRoute.length > 0 && (
              <>
                <Polyline
                  positions={remainingRoute}
                  pathOptions={{
                    color: '#94a3b8',
                    weight: 5,
                    opacity: 0.6,
                    lineCap: 'round',
                    lineJoin: 'round',
                    dashArray: '12, 8',
                  }}
                />
                <Polyline
                  positions={remainingRoute}
                  pathOptions={{
                    color: '#64748b',
                    weight: 3,
                    opacity: 0.8,
                    lineCap: 'round',
                    lineJoin: 'round',
                    dashArray: '12, 8',
                  }}
                />
              </>
            )}

            {/* Start Point Marker (Where travel started) */}
            {startPoint && (
              <Marker position={[startPoint.latitude, startPoint.longitude]} icon={createStartIcon()}>
                <Popup className="custom-popup">
                  <div className="p-1">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-700">
                      <span>🚩 Trip Started Here</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {startPoint.latitude.toFixed(5)}, {startPoint.longitude.toFixed(5)}
                    </p>
                  </div>
                </Popup>
              </Marker>
            )}



            {/* End Point / Arrived Marker (Checkered Finish Flag 🏁 where arrived) */}
            {endPoint && (
              <Marker position={[endPoint.latitude, endPoint.longitude]} icon={createEndIcon()}>
                <Popup className="custom-popup">
                  <div className="p-1 min-w-[150px]">
                    <div className="flex items-center gap-1.5 font-bold text-red-600">
                      <span>🏁 Arrived at Destination</span>
                    </div>
                    <p className="text-xs text-slate-700 font-semibold mt-0.5">
                      Client Place Reached
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {endPoint.latitude.toFixed(5)}, {endPoint.longitude.toFixed(5)}
                    </p>
                    {traveledDistanceKm != null && (
                      <p className="text-[10px] font-bold text-emerald-600 mt-0.5">
                        Total Traveled: {traveledDistanceKm.toFixed(1)} KM
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Live Engineer Vehicle Pin (Uber Pulsing Blue Radar - active ONLY while traveling) */}
            {currentLocation && status === 'traveling' && (
              <Marker
                position={[currentLocation.latitude, currentLocation.longitude]}
                icon={createEngineerIcon()}
              >
                <Popup className="custom-popup">
                  <div className="p-1 min-w-[200px]">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                      <div className="flex items-center gap-1.5 font-black text-slate-900">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white shadow-sm">
                          {engineerName ? engineerName.charAt(0) : 'E'}
                        </div>
                        <span>{engineerName || 'Service Engineer'}</span>
                      </div>
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          status === 'traveling'
                            ? 'bg-blue-100 text-blue-700 border border-blue-200'
                            : status === 'reached'
                            ? 'bg-amber-100 text-amber-700 border border-amber-200'
                            : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {status === 'traveling' ? 'Traveling' : status === 'reached' ? 'At Client' : 'On Duty'}
                      </span>
                    </div>

                    {clientName && (
                      <div className="mt-2 rounded-lg bg-blue-50/90 p-2 text-xs border border-blue-100">
                        <p className="font-bold text-blue-900 flex items-center gap-1">
                          <Navigation className="h-3 w-3 text-blue-600" /> Destination: {clientName}
                        </p>
                        {clientAddress && (
                          <p className="text-[11px] text-slate-600 mt-0.5 truncate">{clientAddress}</p>
                        )}
                      </div>
                    )}

                    <div className="mt-2 space-y-0.5 text-[11px] text-slate-500 font-mono">
                      <p>
                        GPS: {currentLocation.latitude.toFixed(4)}, {currentLocation.longitude.toFixed(4)}
                      </p>
                      {accuracy != null && (
                        <p className="text-emerald-700 font-sans">
                          Accuracy: <span className="font-bold">±{accuracy}m</span>
                        </p>
                      )}
                      {lastUpdate && (
                        <p className="text-[10px] text-slate-400 font-sans">
                          Updated: {lastUpdate.toLocaleTimeString()}
                        </p>
                      )}
                    </div>

                    <div className="mt-2.5 pt-1.5 border-t border-slate-100 flex items-center justify-between">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${currentLocation.latitude},${currentLocation.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-bold text-blue-600 hover:underline"
                      >
                        Google Maps ↗
                      </a>
                    </div>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Client Destination Pin (if client coordinates available and not overlapping with reached endPoint) */}
            {clientLocation?.latitude &&
              clientLocation?.longitude &&
              (!endPoint ||
                haversineDistance(
                  clientLocation.latitude,
                  clientLocation.longitude,
                  endPoint.latitude,
                  endPoint.longitude
                ) > 0.05) && (
              <Marker
                position={[clientLocation.latitude, clientLocation.longitude]}
                icon={createClientIcon()}
              >
                <Popup className="custom-popup">
                  <div className="p-1">
                    <div className="flex items-center gap-1.5 font-bold text-red-600">
                      <MapPin className="h-4 w-4" /> {clientName}
                    </div>
                    {clientAddress && <p className="text-xs text-slate-600 mt-1">{clientAddress}</p>}
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${clientLocation.latitude},${clientLocation.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline"
                    >
                      Open in Google Maps →
                    </a>
                  </div>
                </Popup>
              </Marker>
            )}
          </>
        )}
      </MapContainer>
    </div>
  );
}
