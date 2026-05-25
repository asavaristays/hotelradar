import { useEffect, useState } from 'react';
import { buildApiPath, buildAuthHeaders, parseServerError } from '../http.js';
import { formatCurrency } from './dashboardUtils.js';

function demandTone(value) {
  const text = String(value || '').toLowerCase();
  if (text === 'strong') return 'strong';
  if (text === 'moderate') return 'moderate';
  return 'weak';
}

function formatDate(value) {
  if (!value) return 'Unknown';
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function MorningBrief({ token = '', hotelId = '' }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadMorningBrief() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(buildApiPath('/api/intelligence/morning-brief', { hotel_id: hotelId }), {
          headers: buildAuthHeaders(token),
        });

        if (!response.ok) {
          const parsed = await parseServerError(response, 'Unable to load morning brief');
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

        setError(loadError.message || 'Unable to load morning brief.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadMorningBrief();
    return () => {
      active = false;
    };
  }, [hotelId, token]);

  const tone = demandTone(payload?.market_demand);
  const verification = payload?.verification || null;
  const verificationLabel = verification?.label || 'Awaiting verification';

  return (
    <section className={`panel morningBriefCard morningBriefCard-${tone}`} aria-label="WhatsApp morning brief">
      <header className="panelHeader">
        <div className="gridMetaBlock">
          <h2>WhatsApp Morning Brief</h2>
          <p className="metaLabel">Compact daily summary for hotel owners and commercial leads.</p>
        </div>
        <div className="badgeCluster">
          {payload ? <span className={`morningBriefBadge morningBriefBadge-${tone}`}>{payload.market_demand}</span> : null}
          {verification ? (
            <span className={`morningBriefBadge morningBriefBadge-${verification.status === 'verified' ? 'good' : 'watch'}`}>
              {verificationLabel}
            </span>
          ) : null}
        </div>
      </header>

      {loading ? <p className="metaLabel">Loading morning brief…</p> : null}
      {!loading && error ? <p className="errorText">{error}</p> : null}

      {!loading && !error && payload ? (
        <>
          <div className="morningBriefGrid">
            <article className="morningBriefMetric">
              <span className="metaLabel">Current Price</span>
              <strong>₹{formatCurrency(payload.current_price || 0)}</strong>
            </article>
            <article className="morningBriefMetric">
              <span className="metaLabel">Recommended Price</span>
              <strong>₹{formatCurrency(payload.recommended_price || 0)}</strong>
            </article>
            <article className="morningBriefMetric">
              <span className="metaLabel">Confidence</span>
              <strong>{Number(payload.confidence || 0)}%</strong>
            </article>
            <article className="morningBriefMetric">
              <span className="metaLabel">City</span>
              <strong>{payload.city}</strong>
            </article>
          </div>

          <div className="morningBriefInsight">
            <span className="metaLabel">Competitor alert</span>
            <p>{payload.competitor_alert}</p>
          </div>

          <div className="morningBriefInsight">
            <span className="metaLabel">Top opportunity</span>
            <p>{payload.top_opportunity}</p>
          </div>

          <div className="morningBriefFooter">
            <span className="metaLabel">Generated</span>
            <p>{formatDate(payload.generated_at)}</p>
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
