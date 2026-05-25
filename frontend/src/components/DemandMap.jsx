import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { buildAuthHeaders, parseServerError } from '../http.js';

const INDIA_CENTER = [20.5937, 78.9629];
const DEFAULT_ZOOM = 5;
const ALL_CITIES = 'ALL_CITIES';
const ALL_SIGNALS = 'ALL_SIGNALS';

function formatSignalLabel(value) {
  return String(value || '')
    .trim()
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTimestamp(value) {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  return parsed.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getMarkerColor(intensity) {
  const safeIntensity = Number(intensity || 0);
  if (safeIntensity > 0.8) return '#dc2626';
  if (safeIntensity >= 0.6) return '#f97316';
  if (safeIntensity >= 0.4) return '#eab308';
  return '#16a34a';
}

function getClusterCellSize(zoom) {
  if (zoom >= 12) return 0.01;
  if (zoom >= 10) return 0.025;
  if (zoom >= 8) return 0.05;
  if (zoom >= 6) return 0.1;
  return 0.25;
}

function normalizeSignals(signals = []) {
  return signals
    .map((entry, index) => {
      const latitude = Number(entry?.latitude);
      const longitude = Number(entry?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }

      return {
        id: `${entry?.signalType || entry?.signal_type || 'signal'}-${entry?.createdAt || entry?.timestamp || index}-${index}`,
        city: entry?.city || 'Unknown',
        signalType: entry?.signalType || entry?.signal_type || 'UNKNOWN',
        latitude,
        longitude,
        intensity: Number(entry?.intensity || 0),
        timestamp: entry?.timestamp || entry?.createdAt || null,
      };
    })
    .filter(Boolean);
}

function buildClusters(signals, zoom) {
  const cellSize = getClusterCellSize(zoom);
  const buckets = new Map();

  for (const signal of signals) {
    const latKey = Math.floor(signal.latitude / cellSize);
    const lngKey = Math.floor(signal.longitude / cellSize);
    const key = `${latKey}:${lngKey}`;

    if (!buckets.has(key)) {
      buckets.set(key, []);
    }

    buckets.get(key).push(signal);
  }

  return Array.from(buckets.values()).map((entries) => {
    if (entries.length === 1) {
      return { type: 'single', signal: entries[0] };
    }

    const aggregate = entries.reduce(
      (acc, entry) => ({
        latitude: acc.latitude + entry.latitude,
        longitude: acc.longitude + entry.longitude,
        intensity: acc.intensity + Number(entry.intensity || 0),
      }),
      { latitude: 0, longitude: 0, intensity: 0 },
    );

    return {
      type: 'cluster',
      id: entries.map((entry) => entry.id).join('|'),
      count: entries.length,
      latitude: aggregate.latitude / entries.length,
      longitude: aggregate.longitude / entries.length,
      intensity: aggregate.intensity / entries.length,
      cities: [...new Set(entries.map((entry) => entry.city))],
      signalTypes: [...new Set(entries.map((entry) => entry.signalType))],
      latestTimestamp: entries
        .map((entry) => entry.timestamp)
        .filter(Boolean)
        .sort()
        .at(-1) || null,
    };
  });
}

function ZoomTracker({ onZoomChange }) {
  useMapEvents({
    zoomend(event) {
      onZoomChange(event.target.getZoom());
    },
  });

  return null;
}

export default function DemandMap({ token = '' }) {
  const [signals, setSignals] = useState([]);
  const [cityFilter, setCityFilter] = useState(ALL_CITIES);
  const [signalFilter, setSignalFilter] = useState(ALL_SIGNALS);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadSignals() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch('/api/intelligence/map', {
          headers: buildAuthHeaders(token),
        });

        if (!response.ok) {
          const parsed = await parseServerError(response, 'Unable to load market demand map');
          throw new Error(parsed.message);
        }

        const payload = await response.json();
        if (!active) {
          return;
        }

        setSignals(normalizeSignals(payload?.signals));
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(loadError.message || 'Unable to load market demand map.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadSignals();
    return () => {
      active = false;
    };
  }, [token]);

  const cities = useMemo(
    () => [...new Set(signals.map((entry) => entry.city).filter(Boolean))].sort(),
    [signals],
  );

  const signalTypes = useMemo(
    () => [...new Set(signals.map((entry) => entry.signalType).filter(Boolean))].sort(),
    [signals],
  );

  const filteredSignals = useMemo(
    () =>
      signals.filter((entry) => {
        if (cityFilter !== ALL_CITIES && entry.city !== cityFilter) {
          return false;
        }

        if (signalFilter !== ALL_SIGNALS && entry.signalType !== signalFilter) {
          return false;
        }

        return true;
      }),
    [cityFilter, signalFilter, signals],
  );

  const clusters = useMemo(() => buildClusters(filteredSignals, zoom), [filteredSignals, zoom]);

  return (
    <section className="panel demandMapPanel" aria-label="Market demand heatmap">
      <header className="panelHeader demandMapHeader">
        <div className="gridMetaBlock">
          <h2>Market Demand Heatmap</h2>
          <p className="metaLabel">Geographic view of recent demand signals across active markets.</p>
        </div>
        <div className="controls demandMapControls">
          <label>
            <span className="controlLabel">City</span>
            <select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}>
              <option value={ALL_CITIES}>All cities</option>
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="controlLabel">Signal</span>
            <select value={signalFilter} onChange={(event) => setSignalFilter(event.target.value)}>
              <option value={ALL_SIGNALS}>All signals</option>
              {signalTypes.map((signalType) => (
                <option key={signalType} value={signalType}>
                  {formatSignalLabel(signalType)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {loading ? <p className="metaLabel">Loading demand map…</p> : null}
      {!loading && error ? <p className="errorText">{error}</p> : null}

      {!loading && !error ? (
        <div className="demandMapViewport">
          <MapContainer center={INDIA_CENTER} zoom={DEFAULT_ZOOM} scrollWheelZoom className="demandHeatmapLeaflet">
            <ZoomTracker onZoomChange={setZoom} />
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {clusters.map((entry) => {
              if (entry.type === 'single') {
                const signal = entry.signal;
                const color = getMarkerColor(signal.intensity);
                return (
                  <CircleMarker
                    key={signal.id}
                    center={[signal.latitude, signal.longitude]}
                    radius={8}
                    pathOptions={{
                      color,
                      fillColor: color,
                      fillOpacity: 0.8,
                      weight: 2,
                    }}
                  >
                    <Popup>
                      <strong>{signal.city}</strong>
                      <br />
                      {formatSignalLabel(signal.signalType)}
                      <br />
                      Intensity: {Number(signal.intensity || 0).toFixed(2)}
                      <br />
                      {formatTimestamp(signal.timestamp)}
                    </Popup>
                  </CircleMarker>
                );
              }

              const color = getMarkerColor(entry.intensity);
              return (
                <CircleMarker
                  key={entry.id}
                  center={[entry.latitude, entry.longitude]}
                  radius={Math.min(20, 10 + entry.count)}
                  pathOptions={{
                    color,
                    fillColor: color,
                    fillOpacity: 0.55,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <strong>{entry.count} signals in cluster</strong>
                    <br />
                    City: {entry.cities.join(', ')}
                    <br />
                    Signals: {entry.signalTypes.map((signalType) => formatSignalLabel(signalType)).join(', ')}
                    <br />
                    Avg intensity: {Number(entry.intensity || 0).toFixed(2)}
                    <br />
                    Latest: {formatTimestamp(entry.latestTimestamp)}
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>

          <div className="demandMapLegend">
            <strong>Intensity</strong>
            <span><i className="legendDot legend-red" /> High (&gt; 0.8)</span>
            <span><i className="legendDot legend-orange" /> Elevated (0.6-0.8)</span>
            <span><i className="legendDot legend-yellow" /> Moderate (0.4-0.6)</span>
            <span><i className="legendDot legend-green" /> Low (&lt; 0.4)</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
