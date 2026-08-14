import { useEffect, useMemo, useState } from 'react';
import { getMarketDemand } from '../services/intelligenceApi.js';

const DEFAULT_CITIES = ['Goa', 'Mumbai', 'Jaipur'];

function formatDate(value) {
  if (!value) return 'Unknown date';
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function formatRupees(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 'Not captured';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPct(value, suffix = '%') {
  if (value == null || value === '') return 'Not captured';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Not captured';
  const sign = amount > 0 ? '+' : '';
  return `${sign}${amount.toFixed(1)}${suffix}`;
}

function formatAdjustment(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount === 0) return 'No rate change';
  const sign = amount > 0 ? '+' : '';
  return `${sign}${amount.toFixed(1)}% suggested movement`;
}

function actionTone(action = '', trustStatus = '') {
  const actionKey = String(action || '').toLowerCase();
  const trustKey = String(trustStatus || '').toLowerCase();
  if (actionKey.includes('need more data')) return 'review';
  if (actionKey.includes('increase watch')) return 'watch';
  if (actionKey.includes('reduce watch')) return 'watch';
  if (trustKey !== 'actionable') return 'review';
  if (actionKey.includes('strong')) return 'strong';
  if (actionKey === 'increase') return 'increase';
  if (actionKey === 'reduce') return 'reduce';
  if (actionKey === 'watch') return 'watch';
  return 'hold';
}

function trustLabel(value = '') {
  return String(value || 'review_only')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function pickHeadline(days = []) {
  const actionable = days.filter((day) => day.trustStatus === 'actionable');
  const increase = actionable.find((day) => day.pricingAction === 'Increase');
  if (increase) return `${formatDate(increase.stayDate)} is ready for a controlled increase.`;
  const reduce = actionable.find((day) => day.pricingAction === 'Reduce');
  if (reduce) return `${formatDate(reduce.stayDate)} needs a tactical rate reduction.`;
  const watch = days.find((day) => ['Increase Watch', 'Reduce Watch', 'Watch'].includes(day.pricingAction));
  if (watch) return `${formatDate(watch.stayDate)} needs review; product lock is protecting the final action.`;
  if (!actionable.length) return 'No date has enough complete evidence for final revenue action yet.';
  return 'Market is mostly hold/watch; review top drivers before changing rates.';
}

export default function MarketDemandCockpit({ token = '', compact = false, selectedDate = '' }) {
  const [city, setCity] = useState('Goa');
  const [viewFilter, setViewFilter] = useState('selected');
  const [matrixDate, setMatrixDate] = useState(selectedDate);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (selectedDate) {
      setMatrixDate(selectedDate);
      setViewFilter('selected');
    }
  }, [selectedDate]);

  useEffect(() => {
    let active = true;

    async function loadDemand() {
      setLoading(true);
      setError('');
      try {
        const baseHorizon = compact ? 14 : 30;
        const today = new Date();
        const requested = matrixDate ? new Date(`${matrixDate}T00:00:00`) : null;
        const requestedOffset = requested && !Number.isNaN(requested.getTime())
          ? Math.ceil((requested.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000) + 1
          : 0;
        const horizonDays = Math.max(baseHorizon, Math.min(60, requestedOffset));
        const nextPayload = await getMarketDemand(token, city, horizonDays);
        if (!active) return;
        setPayload(nextPayload);
        if (!matrixDate && nextPayload?.days?.[0]?.stayDate) {
          setMatrixDate(nextPayload.days[0].stayDate);
        }
      } catch (loadError) {
        if (!active) return;
        setPayload(null);
        setError(loadError.message || 'Unable to load market demand.');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDemand();
    return () => {
      active = false;
    };
  }, [city, compact, token, refreshKey, matrixDate]);

  useEffect(() => {
    const timer = window.setInterval(() => setRefreshKey((value) => value + 1), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const cities = useMemo(() => {
    const markets = Array.isArray(payload?.markets) && payload.markets.length ? payload.markets : DEFAULT_CITIES;
    return [...new Set(markets)].filter(Boolean);
  }, [payload]);

  const days = Array.isArray(payload?.days) ? payload.days : [];
  const filteredDays = useMemo(() => {
    if (viewFilter === 'selected') {
      return days.filter((day) => day.stayDate === matrixDate);
    }
    if (viewFilter === 'actionable') {
      return days.filter((day) => day.trustStatus === 'actionable');
    }
    if (viewFilter === 'review') {
      return days.filter((day) => day.trustStatus !== 'actionable');
    }
    return days;
  }, [days, matrixDate, viewFilter]);
  const headline = pickHeadline(filteredDays.length ? filteredDays : days);
  const nextActionDays = filteredDays.filter((day) =>
    ['Increase', 'Reduce', 'Increase Watch', 'Reduce Watch'].includes(day.pricingAction),
  );

  return (
    <section className={`panel marketDemandCockpit ${compact ? 'marketDemandCockpitCompact' : ''}`} aria-label="Market demand cockpit">
      <header className="marketDemandFilterBar">
        <div className="marketDemandFilterTitle">
          <span className="workspaceEyebrow">Decision-grade demand</span>
          <h2>Market Demand Cockpit</h2>
        </div>
        <div className="marketDemandFilters" aria-label="Market demand filters">
          <label>
            <span className="controlLabel">Market</span>
            <select value={city} onChange={(event) => setCity(event.target.value)}>
              {cities.map((market) => (
                <option key={market} value={market}>
                  {market}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="controlLabel">Stay date</span>
            <input
              type="date"
              value={matrixDate}
              min={days[0]?.stayDate || undefined}
              max={days[days.length - 1]?.stayDate || undefined}
              onChange={(event) => {
                setMatrixDate(event.target.value);
                setViewFilter('selected');
              }}
            />
          </label>
          <label>
            <span className="controlLabel">Show</span>
            <select value={viewFilter} onChange={(event) => setViewFilter(event.target.value)}>
              <option value="selected">Selected date</option>
              <option value="all">Full horizon</option>
              <option value="actionable">Actionable only</option>
              <option value="review">Review only</option>
            </select>
          </label>
          <div className="marketDemandFilterCount">
            <span>Visible</span>
            <strong>{filteredDays.length} / {days.length || 0}</strong>
          </div>
          <button type="button" className="secondaryButton" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
            {loading ? 'Calibrating…' : 'Refresh live matrix'}
          </button>
        </div>
      </header>

      {loading ? <p className="metaLabel">Loading market demand model…</p> : null}
      {!loading && error ? <p className="errorText">{error}</p> : null}

      {!loading && !error ? (
        <>
          <div className="marketDemandSummaryGrid">
            <article>
              <span className="metaLabel">Primary call</span>
              <strong>{headline}</strong>
            </article>
            <article>
              <span className="metaLabel">Actionable dates</span>
              <strong>{Number(payload?.actionableDays || 0)} / {Number(payload?.horizonDays || days.length || 0)}</strong>
            </article>
            <article>
              <span className="metaLabel">Model basis</span>
              <strong>Live evidence calibration</strong>
              <span className="metaLabel">
                {payload?.generatedAt ? `Updated ${new Date(payload.generatedAt).toLocaleTimeString('en-IN')}` : 'Refreshing every 5 minutes'}
              </span>
            </article>
          </div>

          <div className="marketDemandPolicy">
            <p>{payload?.dataPolicy || 'Increase/Reduce actions require fresh competitor price evidence.'}</p>
            {Array.isArray(payload?.removedFromPriceAction) && payload.removedFromPriceAction.length ? (
              <p className="metaLabel">
                Removed from price action: {payload.removedFromPriceAction.join(', ')}.
              </p>
            ) : null}
          </div>

          {nextActionDays.length ? (
            <div className="marketDemandActionStrip" aria-label="Immediate pricing actions">
              {nextActionDays.slice(0, 4).map((day) => (
                <article key={`action-${day.id}`} className={`marketDemandActionCard marketDemand-${actionTone(day.pricingAction, day.trustStatus)}`}>
                  <span>{formatDate(day.stayDate)}</span>
                  <strong>{day.pricingAction}</strong>
                  <p>{formatAdjustment(day.priceAdjustmentPct)}</p>
                </article>
              ))}
            </div>
          ) : null}

          <div className="marketDemandTableWrap">
            <table className="marketDemandTable">
              <thead>
                <tr>
                  <th>Stay date</th>
                  <th>Demand</th>
                  <th>Action</th>
                  <th>Confidence</th>
                  <th>Hotel rate</th>
                  <th>Market price</th>
                  <th>Top reason</th>
                </tr>
              </thead>
              <tbody>
                {filteredDays.map((day) => {
                  const topDriver = day.topDrivers?.[0];
                  const tone = actionTone(day.pricingAction, day.trustStatus);
                  return (
                    <tr key={day.id}>
                      <td>
                        <strong>{formatDate(day.stayDate)}</strong>
                        <span>{trustLabel(day.trustStatus)}</span>
                      </td>
                      <td>
                        <strong>{day.demandScore.toFixed(1)}</strong>
                        <span>{day.demandLevel}</span>
                      </td>
                      <td>
                        <span className={`marketDemandBadge marketDemand-${tone}`}>
                          {day.pricingAction}
                        </span>
                        <span>{formatAdjustment(day.priceAdjustmentPct)}</span>
                      </td>
                      <td>
                        <strong>{day.confidenceScore.toFixed(1)}%</strong>
                        <span>{day.competitorCount > 0 ? `${day.competitorCount} competitors` : 'Competitors not captured'}</span>
                      </td>
                      <td>
                        <strong>{formatRupees(day.hotelAvgPrice)}</strong>
                        <span>{Number(day.hotelAvgPrice) > 0 ? 'Observed stay-date rate' : 'Awaiting property rate'}</span>
                      </td>
                      <td>
                        <strong>{formatRupees(day.marketAvgPrice)}</strong>
                        <span>{day.rateChangePct == null ? '48h movement not captured' : `${formatPct(day.rateChangePct)} vs 48h`}</span>
                      </td>
                      <td>
                        <strong>{topDriver?.label || 'Evidence pending'}</strong>
                        <span>{topDriver?.evidence || day.missingEvidence?.[0] || 'Fresh competitor data is required before action.'}</span>
                      </td>
                    </tr>
                  );
                })}
                {filteredDays.length === 0 ? (
                  <tr>
                    <td className="marketDemandEmpty" colSpan="7">
                      No calibrated evidence is available for this stay date. Select another date or open “Full horizon”.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
