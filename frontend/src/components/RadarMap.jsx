import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { motion } from 'framer-motion';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import LayerControl from './LayerControl.jsx';
import { SkeletonChart } from './SkeletonCard.jsx';
import { getRadarMapSignals } from '../services/intelligenceApi.js';

const DEFAULT_CENTER = [78.9629, 20.5937];
const DEFAULT_ZOOM = 4.6;
const MAP_STYLE = 'mapbox://styles/mapbox/dark-v11';
const ALL_CITIES = 'ALL_CITIES';
const ALL_SIGNALS = 'ALL_SIGNALS';
const FOCUS_CITIES = {
  Goa: [74.124, 15.2993],
  Mumbai: [72.8777, 19.076],
  Jaipur: [75.7873, 26.9124],
};
const INITIAL_LAYERS = {
  demandHeat: true,
  signals: true,
  events: false,
  airportDemand: false,
  pricePressure: false,
};
const AIRPORT_POINTS = [
  { id: 'goa-airport', city: 'Goa', label: 'Goa Airport Demand', longitude: 73.8314, latitude: 15.3808 },
  { id: 'mumbai-airport', city: 'Mumbai', label: 'Mumbai Airport Demand', longitude: 72.8679, latitude: 19.0896 },
  { id: 'jaipur-airport', city: 'Jaipur', label: 'Jaipur Airport Demand', longitude: 75.8122, latitude: 26.8242 },
];

function formatSignalLabel(value) {
  return String(value || '')
    .trim()
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function impactLabel(score) {
  const safeScore = Number(score || 0);
  if (safeScore >= 80) return 'High';
  if (safeScore >= 55) return 'Rising';
  return 'Informational';
}

function markerTone(entry) {
  const impact = Number(entry?.impactScore || 0);
  const type = String(entry?.signalType || '').toUpperCase();
  if (impact >= 75 || type === 'WEEKEND_COMPRESSION') return 'high';
  if (impact >= 50 || type === 'TOURISM_SPIKE' || type === 'AIRPORT_DEMAND') return 'rising';
  return 'info';
}

function suggestedAction(signalType) {
  switch (String(signalType || '').toUpperCase()) {
    case 'WEEKEND_COMPRESSION':
      return 'Increase weekend pricing.';
    case 'AIRPORT_DEMAND':
      return 'Raise same-day and short-stay rates.';
    case 'TOURISM_SPIKE':
      return 'Tighten discounts and lift public pricing.';
    case 'EVENT_DEMAND_ZONE':
      return 'Open premium room types and review minimum stay rules.';
    case 'CORPORATE_EVENT_CLUSTER':
      return 'Increase weekday rates and target corporate packages.';
    default:
      return 'Monitor demand velocity and review rate positioning.';
  }
}

function popupMarkup(entry) {
  return (
    <motion.div
      className="radarMapPopupCard"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      <span className={`radarMapPopupBadge radarMapPopupBadge-${markerTone(entry)}`}>
        {formatSignalLabel(entry.signalType)}
      </span>
      <div className="radarMapPopupMetric">
        <span>Impact</span>
        <strong>{impactLabel(entry.impactScore)}</strong>
      </div>
      <div className="radarMapPopupMetric">
        <span>Confidence</span>
        <strong>{Math.round(Number(entry.confidenceScore || 0))}%</strong>
      </div>
      <div className="radarMapPopupAction">
        <span>Suggested Action</span>
        <p>{suggestedAction(entry.signalType)}</p>
      </div>
    </motion.div>
  );
}

function createPopup(entry) {
  const container = document.createElement('div');
  const root = createRoot(container);
  root.render(popupMarkup(entry));

  const popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: true,
    offset: 16,
    className: 'radarMapPopup',
  }).setDOMContent(container);

  popup.on('close', () => {
    root.unmount();
  });

  return popup;
}

function createMarker(entry) {
  const host = document.createElement('div');
  const root = createRoot(host);

  root.render(
    <motion.button
      type="button"
      className={`radarMapMarker radarMapMarker-${markerTone(entry)}`}
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{
        scale: [1, 1.08, 1],
        opacity: 1,
      }}
      transition={{
        opacity: { duration: 0.2, ease: 'easeOut' },
        scale: {
          duration: 1.9,
          ease: 'easeInOut',
          repeat: Number.POSITIVE_INFINITY,
        },
      }}
      aria-label={`${formatSignalLabel(entry.signalType)} marker`}
    >
      <span className="radarMapMarkerCore" />
      <span className="radarMapMarkerHalo" />
    </motion.button>,
  );

  return { element: host, root };
}

function buildFeatureCollection(rows, propertyBuilder) {
  return {
    type: 'FeatureCollection',
    features: rows.map((entry) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [entry.longitude, entry.latitude],
      },
      properties: propertyBuilder(entry),
    })),
  };
}

function buildEventFeatures(signals) {
  return buildFeatureCollection(
    signals.filter((entry) => ['EVENT_DEMAND_ZONE', 'CORPORATE_EVENT_CLUSTER'].includes(entry.signalType)),
    (entry) => ({
      title: `${formatSignalLabel(entry.signalType)} Event`,
      weight: Math.max(0.3, Number(entry.intensity || 0)),
    }),
  );
}

function buildAirportFeatures(signals, cityFilter) {
  const airportSignals = signals.filter((entry) => entry.signalType === 'AIRPORT_DEMAND');
  const activeCities =
    cityFilter !== ALL_CITIES
      ? AIRPORT_POINTS.filter((entry) => entry.city === cityFilter)
      : AIRPORT_POINTS;

  const merged = activeCities.map((airport) => {
    const matchedSignal = airportSignals.find((signal) => signal.city === airport.city);
    return {
      ...airport,
      weight: Math.max(0.35, Number(matchedSignal?.intensity || 0.45)),
    };
  });

  return buildFeatureCollection(merged, (entry) => ({
    title: entry.label,
    weight: entry.weight,
  }));
}

function buildPricePressureFeatures(signals) {
  return buildFeatureCollection(
    signals.filter((entry) => entry.signalType === 'PRICE_PRESSURE'),
    (entry) => ({
      weight: Math.max(0.35, Number(entry.intensity || 0)),
    }),
  );
}

function buildFallbackSummary(signals = []) {
  const counts = new Map();
  for (const signal of signals) {
    const key = formatSignalLabel(signal.signalType);
    counts.set(key, Number(counts.get(key) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 4);
}

function setLayerVisibility(map, layerId, enabled) {
  if (!map.getLayer(layerId)) return;
  map.setLayoutProperty(layerId, 'visibility', enabled ? 'visible' : 'none');
}

function RadarMap({ token = '', focusCity = '' }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cityFilter, setCityFilter] = useState(String(focusCity || '').trim() || ALL_CITIES);
  const [signalFilter, setSignalFilter] = useState(ALL_SIGNALS);
  const [layerVisibility, setLayerVisibility] = useState(INITIAL_LAYERS);
  const [layersCollapsed, setLayersCollapsed] = useState(false);

  useEffect(() => {
    if (focusCity) {
      setCityFilter(String(focusCity).trim());
    }
  }, [focusCity]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const media = window.matchMedia('(max-width: 767px)');
    const sync = () => setLayersCollapsed(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSignals() {
      setLoading(true);
      setError('');

      try {
        const nextSignals = await getRadarMapSignals(token);
        if (!active) return;
        setSignals(nextSignals);
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message || 'Unable to load RADAR map.');
      } finally {
        if (active) setLoading(false);
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
        if (cityFilter !== ALL_CITIES && entry.city !== cityFilter) return false;
        if (signalFilter !== ALL_SIGNALS && entry.signalType !== signalFilter) return false;
        return true;
      }),
    [cityFilter, signalFilter, signals],
  );

  const heatFeatureCollection = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: filteredSignals.map((entry) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [entry.longitude, entry.latitude],
        },
        properties: {
          weight: Math.max(0.15, Number(entry.intensity || 0)),
        },
      })),
    }),
    [filteredSignals],
  );
  const eventFeatureCollection = useMemo(() => buildEventFeatures(filteredSignals), [filteredSignals]);
  const airportFeatureCollection = useMemo(
    () => buildAirportFeatures(filteredSignals, cityFilter),
    [cityFilter, filteredSignals],
  );
  const pricePressureFeatureCollection = useMemo(
    () => buildPricePressureFeatures(filteredSignals),
    [filteredSignals],
  );

  useEffect(() => {
    const tokenValue = String(import.meta.env.VITE_MAPBOX_TOKEN || '').trim();
    if (!tokenValue || mapRef.current || !mapContainerRef.current) {
      return undefined;
    }

    mapboxgl.accessToken = tokenValue;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      cooperativeGestures: true,
      attributionControl: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      map.addSource('radar-demand-zones', {
        type: 'geojson',
        data: heatFeatureCollection,
      });
      map.addSource('radar-events', {
        type: 'geojson',
        data: eventFeatureCollection,
      });
      map.addSource('radar-airport-demand', {
        type: 'geojson',
        data: airportFeatureCollection,
      });
      map.addSource('radar-price-pressure', {
        type: 'geojson',
        data: pricePressureFeatureCollection,
      });

      map.addLayer({
        id: 'radar-demand-heat',
        type: 'heatmap',
        source: 'radar-demand-zones',
        maxzoom: 11,
        paint: {
          'heatmap-weight': ['get', 'weight'],
          'heatmap-intensity': 1.15,
          'heatmap-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0,
            18,
            6,
            30,
            10,
            44,
          ],
          'heatmap-opacity': 0.72,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,
            'rgba(11,15,25,0)',
            0.2,
            'rgba(56,189,248,0.22)',
            0.45,
            'rgba(249,115,22,0.32)',
            0.7,
            'rgba(239,68,68,0.5)',
            1,
            'rgba(255,76,76,0.72)',
          ],
        },
      });

      map.addLayer({
        id: 'radar-demand-circles',
        type: 'circle',
        source: 'radar-demand-zones',
        minzoom: 7,
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            7,
            10,
            11,
            18,
          ],
          'circle-color': [
            'interpolate',
            ['linear'],
            ['get', 'weight'],
            0,
            '#38bdf8',
            0.5,
            '#f97316',
            1,
            '#ef4444',
          ],
          'circle-opacity': 0.18,
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(255,255,255,0.12)',
        },
      });

      map.addLayer({
        id: 'radar-events-circles',
        type: 'circle',
        source: 'radar-events',
        paint: {
          'circle-radius': 8,
          'circle-color': '#d946ef',
          'circle-stroke-width': 2,
          'circle-stroke-color': 'rgba(255,255,255,0.85)',
          'circle-opacity': 0.82,
        },
      });

      map.addLayer({
        id: 'radar-events-labels',
        type: 'symbol',
        source: 'radar-events',
        layout: {
          'text-field': ['get', 'title'],
          'text-size': 11,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': '#f5d0fe',
        },
      });

      map.addLayer({
        id: 'radar-airport-circles',
        type: 'circle',
        source: 'radar-airport-demand',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'weight'],
            0,
            10,
            1,
            18,
          ],
          'circle-color': '#38bdf8',
          'circle-stroke-width': 2,
          'circle-stroke-color': 'rgba(255,255,255,0.8)',
          'circle-opacity': 0.22,
        },
      });

      map.addLayer({
        id: 'radar-price-pressure-circles',
        type: 'circle',
        source: 'radar-price-pressure',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'weight'],
            0,
            14,
            1,
            24,
          ],
          'circle-color': '#f59e0b',
          'circle-stroke-width': 2,
          'circle-stroke-color': 'rgba(255,255,255,0.7)',
          'circle-opacity': 0.2,
        },
      });
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach(({ marker, root }) => {
        marker.remove();
        root.unmount();
      });
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [heatFeatureCollection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded?.()) {
      return;
    }

    const heatSource = map.getSource('radar-demand-zones');
    if (heatSource) heatSource.setData(heatFeatureCollection);
    const eventSource = map.getSource('radar-events');
    if (eventSource) eventSource.setData(eventFeatureCollection);
    const airportSource = map.getSource('radar-airport-demand');
    if (airportSource) airportSource.setData(airportFeatureCollection);
    const pricePressureSource = map.getSource('radar-price-pressure');
    if (pricePressureSource) pricePressureSource.setData(pricePressureFeatureCollection);
  }, [
    airportFeatureCollection,
    eventFeatureCollection,
    heatFeatureCollection,
    pricePressureFeatureCollection,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded?.()) return;

    setLayerVisibility(map, 'radar-demand-heat', layerVisibility.demandHeat);
    setLayerVisibility(map, 'radar-demand-circles', layerVisibility.demandHeat);
    setLayerVisibility(map, 'radar-events-circles', layerVisibility.events);
    setLayerVisibility(map, 'radar-events-labels', layerVisibility.events);
    setLayerVisibility(map, 'radar-airport-circles', layerVisibility.airportDemand);
    setLayerVisibility(map, 'radar-price-pressure-circles', layerVisibility.pricePressure);
  }, [layerVisibility]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach(({ marker, root }) => {
      marker.remove();
      root.unmount();
    });
    markersRef.current = [];

    if (layerVisibility.signals) {
      filteredSignals.forEach((entry) => {
        const { element, root } = createMarker(entry);
        const marker = new mapboxgl.Marker({ element, anchor: 'center' })
          .setLngLat([entry.longitude, entry.latitude])
          .setPopup(createPopup(entry))
          .addTo(map);

        markersRef.current.push({ marker, root });
      });
    }

    if (filteredSignals.length) {
      const firstSignalCity = cityFilter !== ALL_CITIES ? FOCUS_CITIES[cityFilter] : null;
      if (firstSignalCity) {
        map.flyTo({
          center: firstSignalCity,
          zoom: cityFilter === 'Goa' ? 8.2 : 9,
          duration: 900,
          essential: true,
        });
        return;
      }

      const bounds = new mapboxgl.LngLatBounds();
      filteredSignals.forEach((entry) => {
        bounds.extend([entry.longitude, entry.latitude]);
      });
      map.fitBounds(bounds, { padding: 48, maxZoom: 10.5, duration: 900 });
      return;
    }

    map.flyTo({
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      duration: 900,
      essential: true,
    });
  }, [cityFilter, filteredSignals, layerVisibility.signals]);

  function handleToggleLayer(key) {
    setLayerVisibility((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  const tokenMissing = !String(import.meta.env.VITE_MAPBOX_TOKEN || '').trim();
  const fallbackSummary = useMemo(() => buildFallbackSummary(filteredSignals), [filteredSignals]);

  return (
    <motion.section
      className="radarMapShell"
      aria-label="RADAR market map"
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
    >
      <header className="radarMapHeader">
        <div className="gridMetaBlock">
          <h2>RADAR Map</h2>
          <p className="metaLabel">Live compression, airport, tourism, and event signals across the market.</p>
        </div>
        <div className="controls radarMapControls">
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

      {loading ? <SkeletonChart /> : null}
      {!loading && error ? <p className="errorText">{error}</p> : null}
      {!loading && !error && tokenMissing ? (
        <div className="radarMapFallback">
          <p className="metaLabel">Interactive map is temporarily unavailable on this device.</p>
          {fallbackSummary.length ? (
            <div className="radarMapFallbackGrid">
              {fallbackSummary.map((entry) => (
                <div key={entry.label} className="radarMapFallbackCard">
                  <span>{entry.label}</span>
                  <strong>{entry.count}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="metaLabel">No mapped signals are available right now.</p>
          )}
        </div>
      ) : null}

      {!loading && !error && !tokenMissing ? (
        <div className="radarMapCanvasWrap">
          <div ref={mapContainerRef} className="radarMapCanvas" />
          <LayerControl
            collapsed={layersCollapsed}
            onToggleCollapse={() => setLayersCollapsed((prev) => !prev)}
            layers={layerVisibility}
            onToggleLayer={handleToggleLayer}
          />
          <div className="radarMapLegend" aria-hidden="true">
            <div><span className="radarMapLegendDot radarMapLegendDot-high" /> High demand</div>
            <div><span className="radarMapLegendDot radarMapLegendDot-rising" /> Rising demand</div>
            <div><span className="radarMapLegendDot radarMapLegendDot-info" /> Informational</div>
          </div>
        </div>
      ) : null}
    </motion.section>
  );
}

export default memo(RadarMap);
