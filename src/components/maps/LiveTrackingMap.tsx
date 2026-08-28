import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Navigation, MapPin, ExternalLink, Route, RefreshCw, Radio, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';
import type { JobLocationLog } from '@/types/database';
import { calculateGpsDistance } from '@/lib/distance';
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
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
    } else if (center) {
      map.setView(center, map.getZoom() || 15);
    }
  }, [bounds, center, map]);
  return null;
}

interface LiveTrackingMapProps {
  currentLocation: { latitude: number; longitude: number } | null;
  startLocation?: { latitude: number; longitude: number } | null;
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
  onReconnectGps?: () => void;
}

export function LiveTrackingMap({
  currentLocation,
  startLocation,
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
  onReconnectGps,
}: LiveTrackingMapProps) {
  const [mapLayer, setMapLayer] = useState<'streets' | 'hybrid' | 'terrain'>('streets');

  // Traveled GPS checkpoints from trip start to current place
  const historyPoints: [number, number][] = routeLogs.map((l) => [l.latitude, l.longitude]);

  // Ensure current location is appended to history points for continuous track
  if (
    currentLocation &&
    (historyPoints.length === 0 ||
      historyPoints[historyPoints.length - 1][0] !== currentLocation.latitude ||
      historyPoints[historyPoints.length - 1][1] !== currentLocation.longitude)
  ) {
    historyPoints.push([currentLocation.latitude, currentLocation.longitude]);
  }

  const startPoint =
    routeLogs.length > 0
      ? { latitude: routeLogs[0].latitude, longitude: routeLogs[0].longitude }
      : startLocation
      ? startLocation
      : null;

  const defaultPos: [number, number] = currentLocation
    ? [currentLocation.latitude, currentLocation.longitude]
    : startPoint
    ? [startPoint.latitude, startPoint.longitude]
    : clientLocation?.latitude && clientLocation?.longitude
    ? [clientLocation.latitude, clientLocation.longitude]
    : [11.0168, 76.9558]; // Default Coimbatore area center if no GPS

  // Calculate Map Bounds
  const allCoordinates: [number, number][] = [...historyPoints];
  if (currentLocation) {
    allCoordinates.push([currentLocation.latitude, currentLocation.longitude]);
  }
  if (clientLocation?.latitude && clientLocation?.longitude) {
    allCoordinates.push([clientLocation.latitude, clientLocation.longitude]);
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

  const traveledKm = calculateGpsDistance(
    routeLogs.map((l) => ({ latitude: l.latitude, longitude: l.longitude }))
  );

  return (
    <div
      className="relative isolate z-0 overflow-hidden rounded-2xl border border-slate-300 shadow-lg bg-slate-100"
      style={{ height }}
    >
      {/* Top Left: Live GPS Status Badge & Traveled Road Journey Metrics */}
      <div className="absolute left-3 top-3 z-10 flex flex-col gap-1.5 pointer-events-auto max-w-[70%] sm:max-w-none">
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

        {/* Traveled Distance Badge */}
        {historyPoints.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-800 shadow-md backdrop-blur-md border border-slate-200">
            <span className="flex items-center gap-1 text-blue-600">
              <Route className="h-3.5 w-3.5 text-blue-600" /> Traveled: {traveledKm} KM
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-[11px] text-slate-500">
              {historyPoints.length} Checkpoints
            </span>
          </div>
        )}
      </div>

      {/* Top Right: Layer Switcher & Google Maps Shortcut */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
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
        zoom={15}
        scrollWheelZoom={interactive}
        dragging={interactive}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          key={mapLayer}
          url={tileLayers[mapLayer].url}
          attribution={tileLayers[mapLayer].attribution}
          subdomains={tileLayers[mapLayer].subdomains}
          maxZoom={20}
        />

        <ChangeMapView bounds={bounds} center={currentLocation ? [currentLocation.latitude, currentLocation.longitude] : undefined} />

        {/* High-visibility Live Road Traveled Track (On-Call to Current Place) */}
        {historyPoints.length > 1 && (
          <>
            {/* Outer Cyan/Blue Glow line */}
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
            {/* Solid Core Vivid Blue Navigation Track */}
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

        {/* Live Engineer Vehicle Pin (Uber Pulsing Blue Radar) */}
        {currentLocation && (
          <Marker position={[currentLocation.latitude, currentLocation.longitude]} icon={createEngineerIcon()}>
            <Popup className="custom-popup">
              <div className="p-1">
                <div className="flex items-center gap-1.5 font-bold text-blue-700">
                  <Navigation className="h-4 w-4" /> {engineerName}
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Status: <span className="font-semibold capitalize text-slate-900">{status}</span>
                </p>
                {accuracy != null && (
                  <p className="text-[11px] text-slate-500">
                    GPS Accuracy: <span className="font-mono text-emerald-600 font-bold">±{accuracy}m</span>
                  </p>
                )}
                {lastUpdate && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Updated: {lastUpdate.toLocaleTimeString()}
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        )}

        {/* Client Destination Pin (if client coordinates available) */}
        {clientLocation?.latitude && clientLocation?.longitude && (
          <Marker position={[clientLocation.latitude, clientLocation.longitude]} icon={createClientIcon()}>
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
      </MapContainer>
    </div>
  );
}
