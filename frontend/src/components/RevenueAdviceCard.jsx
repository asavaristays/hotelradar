import { useEffect, useState } from 'react';
import { buildApiPath, buildAuthHeaders, parseServerError } from '../http.js';
import { formatCurrency } from './dashboardUtils.js';

function demandTone(value) {
  const text = String(value || '').toLowerCase();
  if (text === 'surge' || text === 'high') return 'hot';
  if (text === 'moderate') return 'warm';
  return 'cool';
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

export default function RevenueAdviceCard({ token = '', hotelId = '' }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadAdvice() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(buildApiPath('/api/intelligence/advice', { hotel_id: hotelId }), {
          headers: buildAuthHeaders(token),
        });

        if (!response.ok) {
          const parsed = await parseServerError(response, 'Unable to load revenue advice');
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

        setError(loadError.message || 'Unable to load revenue advice.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadAdvice();
    return () => {
      active = false;
    };
  }, [hotelId, token]);

  const tone = demandTone(payload?.market_demand);
  const verification = payload?.verification || null;
  const verificationLabel = verification?.label || 'Awaiting verification';

  return (
    <section className={`panel revenueAdviceCard revenueAdviceCard-${tone}`} aria-label="AI revenue advice">
      <header className="panelHeader">
        <div className="gridMetaBlock">
          <h2>AI Revenue Advice</h2>
          <p className="metaLabel">Daily pricing recommendation from the live intelligence engine.</p>
        </div>
        <div className="badgeCluster">
          {payload ? <span className={`revenueDemandBadge revenueDemandBadge-${tone}`}>{payload.market_demand} demand</span> : null}
          {verification ? (
            <span className={`revenueDemandBadge revenueDemandBadge-${verification.status === 'verified' ? 'good' : 'watch'}`}>
              {verificationLabel}
            </span>
          ) : null}
        </div>
      </header>

      {loading ? <p className="metaLabel">Loading revenue advice…</p> : null}
      {!loading && error ? <p className="errorText">{error}</p> : null}

      {!loading && !error && payload ? (
        <>
          <div className="revenueAdviceGrid">
            <article className="revenueAdviceMetric">
              <span className="metaLabel">Current Price</span>
              <strong>₹{formatCurrency(payload.current_price || 0)}</strong>
            </article>
            <article className="revenueAdviceMetric">
              <span className="metaLabel">Suggested Price</span>
              <strong>₹{formatCurrency(payload.suggested_price || 0)}</strong>
            </article>
            <article className="revenueAdviceMetric">
              <span className="metaLabel">Revenue Gain Estimate</span>
              <strong>₹{formatCurrency(payload.expected_revenue_gain || 0)}</strong>
            </article>
            <article className="revenueAdviceMetric">
              <span className="metaLabel">Confidence Score</span>
              <strong>{Number(payload.confidence_score || 0)}%</strong>
            </article>
          </div>

          <div className="revenueAdviceFooter">
            <div>
              <span className="metaLabel">Risk level</span>
              <p>{payload.risk_level}</p>
            </div>
            <div>
              <span className="metaLabel">Generated</span>
              <p>{formatTimestamp(payload.generated_at)}</p>
            </div>
            <div>
              <span className="metaLabel">City</span>
              <p>{payload.city}</p>
            </div>
          </div>
          {verification ? (
            <div className="morningBriefInsight">
              <span className="metaLabel">Verification</span>
              <p>
                {verificationLabel}. {Number(verification.pass_count || 0)} checks passed before display.
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
