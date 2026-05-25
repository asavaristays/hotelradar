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
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 'Not captured';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPct(value, suffix = '%') {
  const amount = Number(value || 0);
  const sign = amount > 0 ? '+' : '';
  return `${sign}${amount.toFixed(1)}${suffix}`;
}

function actionTone(action = '', trustStatus = '') {
  const actionKey = String(action || '').toLowerCase();
  const trustKey = String(trustStatus || '').toLowerCase();
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
  const strong = actionable.find((day) => day.pricingAction === 'Strong Increase');
  if (strong) return `${formatDate(strong.stayDate)} has the clearest strong increase signal.`;
  const increase = actionable.find((day) => day.pricingAction === 'Increase');
  if (increase) return `${formatDate(increase.stayDate)} is ready for a controlled increase.`;
  const reduce = actionable.find((day) => day.pricingAction === 'Reduce');
  if (reduce) return `${formatDate(reduce.stayDate)} needs a tactical rate reduction.`;
  if (!actionable.length) return 'No date has enough fresh competitor evidence for automatic action yet.';
  return 'Market is mostly hold/watch; review top drivers before changing rates.';
}

export default function MarketDemandCockpit({ token = '', compact = false }) {
  const [city, setCity] = useState('Goa');
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadDemand() {
      setLoading(true);
      setError('');
      try {
        const nextPayload = await getMarketDemand(token, city, compact ? 14 : 30);
        if (!active) return;
        setPayload(nextPayload);
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
  }, [city, compact, token]);

  const cities = useMemo(() => {
    const markets = Array.isArray(payload?.markets) && payload.markets.length ? payload.markets : DEFAULT_CITIES;
    return [...new Set(markets)].filter(Boolean);
  }, [payload]);

  const days = Array.isArray(payload?.days) ? payload.days : [];
  const headline = pickHeadline(days);
  const nextActionDays = days.filter((day) =>
    ['Strong Increase', 'Increase', 'Reduce'].includes(day.pricingAction),
  );

  return (
    <section className={`panel marketDemandCockpit ${compact ? 'marketDemandCockpitCompact' : ''}`} aria-label="Market demand cockpit">
      <header className="panelHeader marketDemandHeader">
        <div className="gridMetaBlock">
          <span className="workspaceEyebrow">Decision-grade demand</span>
          <h2>Market Demand Cockpit</h2>
          <p className="metaLabel">
            Today-forward demand and price action for Goa, Mumbai, and Jaipur using fresh comp-set evidence.
          </p>
        </div>
        <div className="controls marketDemandControls">
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
              <strong>Fresh rates first</strong>
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
                  <p>{formatPct(day.priceAdjustmentPct)} suggested movement</p>
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
                  <th>Market price</th>
                  <th>Top reason</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => {
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
                        <span>{formatPct(day.priceAdjustmentPct)}</span>
                      </td>
                      <td>
                        <strong>{day.confidenceScore.toFixed(1)}%</strong>
                        <span>{day.competitorCount} competitors</span>
                      </td>
                      <td>
                        <strong>{formatRupees(day.marketAvgPrice)}</strong>
                        <span>{formatPct(day.rateChangePct)} vs 48h</span>
                      </td>
                      <td>
                        <strong>{topDriver?.label || 'Evidence pending'}</strong>
                        <span>{topDriver?.evidence || 'Fresh competitor data is required before action.'}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
