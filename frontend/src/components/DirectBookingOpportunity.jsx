import { useEffect, useState } from 'react';
import { buildApiPath, buildAuthHeaders, parseServerError } from '../http.js';
import { formatCurrency } from './dashboardUtils.js';

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`;
}

function formatConfidence(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

export default function DirectBookingOpportunity({ token = '', hotelId = '' }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadOpportunity() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(
          buildApiPath('/api/intelligence/direct-booking-opportunity', { hotel_id: hotelId }),
          {
          headers: buildAuthHeaders(token),
          },
        );

        if (!response.ok) {
          const parsed = await parseServerError(response, 'Unable to load direct booking opportunity');
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

        setError(loadError.message || 'Unable to load direct booking opportunity.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadOpportunity();
    return () => {
      active = false;
    };
  }, [hotelId, token]);

  return (
    <section className="panel directBookingCard" aria-label="Direct booking opportunity detector">
      <header className="panelHeader">
        <div className="gridMetaBlock">
          <h2>Direct Booking Opportunity</h2>
          <p className="metaLabel">Estimate of revenue leaking to OTA-heavy demand mix.</p>
        </div>
      </header>

      {loading ? <p className="metaLabel">Loading direct booking opportunity…</p> : null}
      {!loading && error ? <p className="errorText">{error}</p> : null}

      {!loading && !error && payload ? (
        <>
          <div className="directBookingHero">
            <span className="metaLabel">Estimated lost direct revenue</span>
            <strong>₹{formatCurrency(payload.estimated_lost_direct_revenue || 0)}</strong>
          </div>

          <div className="directBookingGrid">
            <article className="directBookingMetric">
              <span className="metaLabel">OTA Dependence</span>
              <strong>{formatPercent(payload.ota_dependence_percent)}</strong>
            </article>
            <article className="directBookingMetric">
              <span className="metaLabel">Monthly Revenue</span>
              <strong>₹{formatCurrency(payload.estimated_monthly_revenue || 0)}</strong>
            </article>
            <article className="directBookingMetric">
              <span className="metaLabel">Confidence</span>
              <strong>{formatConfidence(payload.confidence)}</strong>
            </article>
            <article className="directBookingMetric">
              <span className="metaLabel">City</span>
              <strong>{payload.city}</strong>
            </article>
          </div>

          <div className="directBookingAction">
            <span className="metaLabel">Suggested action</span>
            <p>{payload.suggested_action}</p>
          </div>
        </>
      ) : null}
    </section>
  );
}
