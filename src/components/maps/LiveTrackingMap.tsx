import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Navigation, MapPin, ExternalLink, Route, Clock } from 'lucide-react';
import type { JobLocationLog } from '@/types/database';
import { fetchRoadDrivingRoute } from '@/lib/distance';

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom Uber / Google Maps Styled 3D Vehicle Marker with pulse radar
const createEngineerIcon = (heading = 0) =>
  L.divIcon({
    className: 'custom-rider-icon',
    html: `
    <div style="position:relative; width:48px; height:48px; display:flex; align-items:center; justify-content:center;">
      <div style="position:absolute; width:100%; height:100%; border-radius:50%; background:rgba(66,133,244,0.28); animation:pulse-ring 2s infinite cubic-bezier(0.215, 0.61, 0.355, 1);"></div>
      <div style="width:36px; height:36px; border-radius:50%; background:#1a73e8; border:3px solid #ffffff; box-shadow:0 4px 14px rgba(26,115,232,0.6); display:flex; align-items:center; justify-content:center; transform:rotate(${heading}deg); transition:transform 0.4s ease;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="none">
          <polygon points="12 2 19 21 12 17 5 21 12 2"/>
        </svg>
      </div>
    </div>
  `,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });

// Google Maps Style Destination Pin (Uber / Google Red Drop Pin with shadow)
const createClientIcon = () =>
  L.divIcon({
    className: 'custom-dest-icon',
    html: `
    <div style="position:relative; width:42px; height:42px; display:flex; align-items:center; justify-content:center;">
      <div style="width:34px; height:34px; border-radius:50%; background:#ea4335; border:3px solid #ffffff; box-shadow:0 6px 16px rgba(234,67,53,0.55); display:flex; align-items:center; justify-content:center;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
          <circle cx="12" cy="10" r="3" fill="white"/>
        </svg>
      </div>
    </div>
  `,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });

// Map View auto-fitter for bounds
function ChangeMapView({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [bounds, map]);
  return null;
}

interface LiveTrackingMapProps {
  currentLocation: { latitude: number; longitude: number } | null;
  clientLocation?: { latitude: number; longitude: number } | null;
  clientName?: string;
  clientAddress?: string;
  engineerName?: string;
  routeLogs?: JobLocationLog[];
  status?: string;
  height?: string;
  interactive?: boolean;
}

export function LiveTrackingMap({
  currentLocation,
  clientLocation,
  clientName = 'Client Location',
  clientAddress = '',
  engineerName = 'Engineer',
  routeLogs = [],
  status = 'traveling',
  height = '380px',
  interactive = true,
}: LiveTrackingMapProps) {
  const [mapLayer, setMapLayer] = useState<'streets' | 'hybrid' | 'terrain'>('streets');
  const [roadRoute, setRoadRoute] = useState<[number, number][]>([]);
  const [etaInfo, setEtaInfo] = useState<{ distanceKm: number; durationMins: number } | null>(null);

  const defaultPos: [number, number] = currentLocation
    ? [currentLocation.latitude, currentLocation.longitude]
    : clientLocation?.latitude && clientLocation?.longitude
    ? [clientLocation.latitude, clientLocation.longitude]
    : [12.9716, 77.5946];

  // Fetch real road highway/street route (snaps along actual road lines like Uber)
  useEffect(() => {
    let isMounted = true;
    async function loadRoadRoute() {
      if (
        currentLocation?.latitude &&
        currentLocation?.longitude &&
        clientLocation?.latitude &&
        clientLocation?.longitude
      ) {
        const routeData = await fetchRoadDrivingRoute(
          currentLocation.latitude,
          currentLocation.longitude,
          clientLocation.latitude,
          clientLocation.longitude
        );

        if (isMounted && routeData) {
          setRoadRoute(routeData.coordinates);
          setEtaInfo({
            distanceKm: routeData.distanceKm,
            durationMins: routeData.durationMins,
          });
        }
      }
    }
    loadRoadRoute();
    return () => {
      isMounted = false;
    };
  }, [currentLocation?.latitude, currentLocation?.longitude, clientLocation?.latitude, clientLocation?.longitude]);

  const historyPoints: [number, number][] = routeLogs.map((l) => [l.latitude, l.longitude]);

  // Calculate Map Bounds
  const allCoordinates: [number, number][] = [
    ...historyPoints,
    ...roadRoute,
  ];
  if (currentLocation) {
    allCoordinates.push([currentLocation.latitude, currentLocation.longitude]);
  }
  if (clientLocation?.latitude && clientLocation?.longitude) {
    allCoordinates.push([clientLocation.latitude, clientLocation.longitude]);
  }
  const bounds = allCoordinates.length > 1 ? L.latLngBounds(allCoordinates) : null;

  // Google Maps external turn-by-turn navigation URL
  const googleMapsDirectionsUrl =
    currentLocation && clientLocation?.latitude && clientLocation?.longitude
      ? `https://www.google.com/maps/dir/?api=1&origin=${currentLocation.latitude},${currentLocation.longitude}&destination=${clientLocation.latitude},${clientLocation.longitude}&travelmode=driving`
      : clientLocation?.latitude && clientLocation?.longitude
      ? `https://www.google.com/maps/search/?api=1&query=${clientLocation.latitude},${clientLocation.longitude}`
      : currentLocation
      ? `https://www.google.com/maps/search/?api=1&query=${currentLocation.latitude},${currentLocation.longitude}`
      : 'https://www.google.com/maps';

  // Tile layer URLs for Google Maps style views
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

  return (
    <div
      className="relative isolate z-0 overflow-hidden rounded-2xl border border-slate-300 shadow-lg bg-slate-100"
      style={{ height }}
    >
      {/* Top Left: Uber-style Floating Status Badge & Live Traveled KM */}
      <div className="absolute left-3 top-3 z-10 flex flex-col gap-1.5 pointer-events-auto">
        <div className="flex items-center gap-2 rounded-xl bg-slate-900/90 px-3.5 py-2 text-xs font-semibold text-white shadow-xl backdrop-blur-md border border-slate-700">
          <div className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
          </div>
          <span className="font-bold text-white flex items-center gap-1.5">
            <span>Live GPS Tracking (5s Refresh)</span>
            <span className="text-[10px] bg-blue-600 px-1.5 py-0.2 rounded text-white font-mono uppercase">
              {status}
            </span>
          </span>
        </div>

        {routeLogs.length > 0 && (
          <div className="flex items-center gap-3 rounded-xl bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-800 shadow-md backdrop-blur-md border border-slate-200 animate-in fade-in">
            <span className="flex items-center gap-1 text-emerald-600">
              <Route className="h-3.5 w-3.5 animate-pulse" /> Traveled: {calculateGpsDistance(routeLogs)} KM
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-[11px] text-slate-500">
              {routeLogs.length} Checkpoints
            </span>
          </div>
        )}
      </div>

      {/* Top Right: Layer Switcher & Open in Google Maps Button */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
        <div className="flex rounded-xl bg-white/95 p-0.5 shadow-md border border-slate-200 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setMapLayer('streets')}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
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
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
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
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
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
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-md hover:bg-blue-700 transition"
          title="Open Directions in Google Maps"
        >
          <span>Google Maps</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <MapContainer
        center={defaultPos}
        zoom={14}
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

        {bounds && <ChangeMapView bounds={bounds} />}

        {/* Real Turn-by-Turn Road Driving Route (Uber / Google Maps Solid Blue Highway Route) */}
        {roadRoute.length > 0 && (
          <>
            {/* Outer Cyan Glow */}
            <Polyline
              positions={roadRoute}
              pathOptions={{
                color: '#60a5fa',
                weight: 10,
                opacity: 0.45,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
            {/* Core Solid Uber/Google Road Highway Navigation Line */}
            <Polyline
              positions={roadRoute}
              pathOptions={{
                color: '#1a73e8',
                weight: 5.5,
                opacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </>
        )}

        {/* Previous Traveled GPS Trail (Gray/Blue Historical trail) */}
        {historyPoints.length > 1 && (
          <Polyline
            positions={historyPoints}
            pathOptions={{
              color: '#475569',
              weight: 3.5,
              opacity: 0.75,
              dashArray: '4, 6',
            }}
          />
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
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {currentLocation.latitude.toFixed(5)}, {currentLocation.longitude.toFixed(5)}
                </p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Client Destination Pin (Google Red Drop Pin) */}
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
