import { useEffect, useMemo, useState } from 'react';
import { buildApiPath, buildAuthHeaders, parseServerError } from '../http.js';
import { clamp, formatCurrency, formatPercent } from './dashboardUtils.js';

function meterOffset(positionPercent) {
  const safe = clamp(Number(positionPercent || 0), -25, 25);
  return ((safe + 25) / 50) * 100;
}

function adjustmentLabel(value) {
  const safe = Number(value || 0);
  if (safe > 0) return `Increase by ₹${formatCurrency(safe)}`;
  if (safe < 0) return `Reduce by ₹${formatCurrency(Math.abs(safe))}`;
  return 'Maintain current rate';
}

export default function PositionMeter({ token = '', hotelId = '' }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadPosition() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(buildApiPath('/api/intelligence/market-position', { hotel_id: hotelId }), {
          headers: buildAuthHeaders(token),
        });

        if (!response.ok) {
          const parsed = await parseServerError(response, 'Unable to load market position meter');
          throw new Error(parsed.message);
        }

        const nextPayload = await response.json();
        if (!active) {
          return;
        }

        setPayload(nextPayload);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(loadError.message || 'Unable to load market position meter.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadPosition();
    return () => {
      active = false;
    };
  }, [hotelId, token]);

  const markerLeft = useMemo(
    () => meterOffset(payload?.position_percent),
    [payload],
  );

  return (
    <section className="panel positionMeterCard" aria-label="Market position meter">
      <header className="panelHeader">
        <div className="gridMetaBlock">
          <h2>Market Position Meter</h2>
          <p className="metaLabel">Pricing position relative to the local market pocket.</p>
        </div>
      </header>

      {loading ? <p className="metaLabel">Loading market position…</p> : null}
      {!loading && error ? <p className="errorText">{error}</p> : null}

      {!loading && !error && payload ? (
        <>
          <div className="positionMeterSummary">
            <article className="positionMeterMetric">
              <span className="metaLabel">Current Price</span>
              <strong>₹{formatCurrency(payload.current_price || 0)}</strong>
            </article>
            <article className="positionMeterMetric">
              <span className="metaLabel">Market Median</span>
              <strong>₹{formatCurrency(payload.market_median_price || 0)}</strong>
            </article>
            <article className="positionMeterMetric">
              <span className="metaLabel">Optimal Price</span>
              <strong>₹{formatCurrency(payload.optimal_price || 0)}</strong>
            </article>
          </div>

          <div className="positionMeterTrackWrap">
            <div className="positionMeterTrack">
              <div className="positionMeterZone positionMeterZone-below" />
              <div className="positionMeterZone positionMeterZone-optimal" />
              <div className="positionMeterZone positionMeterZone-above" />
              <div className="positionMeterNeedle" style={{ left: `${markerLeft}%` }} />
            </div>
            <div className="positionMeterLabels">
              <span>Below Market</span>
              <span>Optimal</span>
              <span>Above Market</span>
            </div>
          </div>

          <div className="positionMeterFooter">
            <p className="metaLabel">
              Position: <strong>{formatPercent(payload.position_percent, 0)}</strong>
            </p>
            <p className="metaLabel">
              Suggested adjustment: <strong>{adjustmentLabel(payload.suggested_adjustment)}</strong>
            </p>
          </div>
        </>
      ) : null}
    </section>
  );
}
