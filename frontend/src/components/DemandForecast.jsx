import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getDemandForecast } from '../services/intelligenceApi.js';

function formatDateLabel(value) {
  if (!value) return 'Unknown';
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', {
    weekday: 'short',
    timeZone: 'UTC',
  });
}

function formatFullDate(value) {
  if (!value) return 'Unknown';
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function scoreTone(score) {
  const safeScore = Number(score || 0);
  if (safeScore >= 70) return 'high';
  if (safeScore >= 40) return 'moderate';
  return 'low';
}

function segmentColor(score) {
  const tone = scoreTone(score);
  if (tone === 'high') return '#ff5454';
  if (tone === 'moderate') return '#ff9e57';
  return '#50a7ff';
}

function TooltipCard({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  return (
    <div className="demandForecastTooltip">
      <span>{formatFullDate(label)}</span>
      <strong>{Math.round(Number(point?.demandScore || 0))}</strong>
      <p>{point?.demandLevel || 'Low'} demand expected.</p>
    </div>
  );
}

export default function DemandForecast({ token = '', hotelId = '' }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadForecast() {
      setLoading(true);
      setError('');

      try {
        const nextPayload = await getDemandForecast(token, hotelId);
        if (!active) {
          return;
        }

        setPayload(nextPayload);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(loadError.message || 'Unable to load demand forecast.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadForecast();
    return () => {
      active = false;
    };
  }, [hotelId, token]);

  const forecast = useMemo(
    () =>
      (Array.isArray(payload?.forecast) ? payload.forecast : []).map((entry) => ({
        ...entry,
        shortDate: formatDateLabel(entry.date),
      })),
    [payload],
  );

  const peakDay = payload?.peakDay || null;
  const selectedPoint =
    forecast[selectedIndex] ||
    peakDay ||
    forecast[0] ||
    null;

  useEffect(() => {
    if (!forecast.length) {
      setSelectedIndex(0);
      return;
    }

    const peakIndex = forecast.findIndex((entry) => entry.id === peakDay?.id);
    setSelectedIndex(peakIndex >= 0 ? peakIndex : 0);
  }, [forecast, peakDay]);

  const chartGradientStops = useMemo(
    () =>
      forecast.map((entry, index) => ({
        offset: forecast.length <= 1 ? 100 : (index / (forecast.length - 1)) * 100,
        color: segmentColor(entry.demandScore),
      })),
    [forecast],
  );

  return (
    <motion.section
      className="demandForecastHero"
      aria-label="Demand forecast"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <header className="demandForecastHeroHeader">
        <div className="gridMetaBlock">
          <h2>Demand Forecast</h2>
          <p className="metaLabel">Next 7 Days</p>
        </div>
        {payload?.city ? <span className="demandForecastCity">{payload.city}</span> : null}
      </header>

      {loading ? <p className="metaLabel">Loading demand forecast…</p> : null}
      {!loading && error ? <p className="errorText">{error}</p> : null}
      {!loading && !error && !forecast.length ? (
        <p className="metaLabel">No demand forecast is available right now.</p>
      ) : null}

      {!loading && !error && forecast.length ? (
        <div className="demandForecastHeroBody">
          <div className="demandForecastSummary">
            <div className="demandForecastSummaryLabel">Selected Day</div>
            <strong>{selectedPoint ? formatFullDate(selectedPoint.date) : 'Unknown'}</strong>
            <span>
              {selectedPoint ? `${Math.round(Number(selectedPoint.demandScore || 0))}/100` : 'No peak data'}
            </span>
            {peakDay ? (
              <small className="demandForecastPeakNote">
                Peak: {formatDateLabel(peakDay.date)} at {Math.round(Number(peakDay.demandScore || 0))}/100
              </small>
            ) : null}
          </div>

          <div className="demandForecastChartScroll">
            <div className="demandForecastChartFrame">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={forecast} margin={{ top: 18, right: 18, left: -18, bottom: 6 }}>
                  <defs>
                    <linearGradient id="demandForecastLine" x1="0%" y1="0%" x2="100%" y2="0%">
                      {chartGradientStops.map((stop) => (
                        <stop key={stop.offset} offset={`${stop.offset}%`} stopColor={stop.color} />
                      ))}
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                  <XAxis
                    dataKey="shortDate"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'rgba(207, 220, 235, 0.76)', fontSize: 12 }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'rgba(207, 220, 235, 0.76)', fontSize: 12 }}
                  />
                  <Tooltip content={<TooltipCard />} cursor={{ stroke: 'rgba(255,255,255,0.08)' }} />
                  <Line
                    type="monotone"
                    dataKey="demandScore"
                    stroke="url(#demandForecastLine)"
                    strokeWidth={4}
                    dot={{ r: 0 }}
                    activeDot={{ r: 6, fill: '#ffffff', stroke: '#00E5FF', strokeWidth: 2 }}
                  />
                  {peakDay ? (
                    <ReferenceDot
                      x={formatDateLabel(selectedPoint?.date || peakDay.date)}
                      y={Number(selectedPoint?.demandScore || peakDay.demandScore || 0)}
                      r={7}
                      fill="#ff5454"
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                  ) : null}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {forecast.length > 1 ? (
            <div className="demandForecastMobileSlider">
              <div className="demandForecastSliderMeta">
                <span>Selected day</span>
                <strong>{selectedPoint ? formatDateLabel(selectedPoint.date) : 'Unknown'}</strong>
              </div>
              <input
                type="range"
                min="0"
                max={String(Math.max(forecast.length - 1, 0))}
                step="1"
                value={selectedIndex}
                onChange={(event) => setSelectedIndex(Number(event.target.value || 0))}
                aria-label="Demand forecast day selector"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </motion.section>
  );
}
