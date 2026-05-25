import { useEffect, useState } from 'react';
import { buildApiPath, buildAuthHeaders, parseServerError } from '../http.js';
import { formatCurrency } from './dashboardUtils.js';

function formatPercentValue(value) {
  const safe = Number(value || 0);
  return `${Math.round(safe * 100)}%`;
}

function formatPeriod(value) {
  return String(value || '')
    .trim()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function RevenueLeakDetector({ token = '', hotelId = '' }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadLeakage() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(buildApiPath('/api/intelligence/missed-revenue', { hotel_id: hotelId }), {
          headers: buildAuthHeaders(token),
        });

        if (!response.ok) {
          const parsed = await parseServerError(response, 'Unable to load missed revenue estimate');
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

        setError(loadError.message || 'Unable to load missed revenue estimate.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadLeakage();
    return () => {
      active = false;
    };
  }, [hotelId, token]);

  return (
    <section className="panel revenueLeakCard" aria-label="Missed revenue detector">
      <header className="panelHeader">
        <div className="gridMetaBlock">
          <h2>Missed Revenue Detector</h2>
          <p className="metaLabel">Estimate of revenue lost from underpricing versus the market.</p>
        </div>
      </header>

      {loading ? <p className="metaLabel">Loading missed revenue estimate…</p> : null}
      {!loading && error ? <p className="errorText">{error}</p> : null}

      {!loading && !error && payload ? (
        <>
          <div className="revenueLeakHero">
            <span className="metaLabel">Estimated missed revenue</span>
            <strong>₹{formatCurrency(payload.estimated_missed_revenue || 0)}</strong>
          </div>

          <div className="revenueLeakGrid">
            <article className="revenueLeakMetric">
              <span className="metaLabel">Period</span>
              <strong>{formatPeriod(payload.period)}</strong>
            </article>
            <article className="revenueLeakMetric">
              <span className="metaLabel">Your Avg Price</span>
              <strong>₹{formatCurrency(payload.your_avg_price || 0)}</strong>
            </article>
            <article className="revenueLeakMetric">
              <span className="metaLabel">Market Avg Price</span>
              <strong>₹{formatCurrency(payload.market_avg_price || 0)}</strong>
            </article>
            <article className="revenueLeakMetric">
              <span className="metaLabel">Rooms Available</span>
              <strong>{Number(payload.rooms_available || 0)}</strong>
            </article>
            <article className="revenueLeakMetric">
              <span className="metaLabel">Occupancy Estimate</span>
              <strong>{formatPercentValue(payload.occupancy_estimate || 0)}</strong>
            </article>
          </div>
        </>
      ) : null}
    </section>
  );
}
