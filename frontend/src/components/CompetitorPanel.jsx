import { useEffect, useState } from 'react';
import { buildApiPath, buildAuthHeaders, parseServerError } from '../http.js';
import { formatCurrency } from './dashboardUtils.js';

function formatSignalLabel(value) {
  return String(value || '')
    .trim()
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getPricePositionTone(value) {
  const safe = Number(value || 0);
  if (safe >= 10) return 'competitorDelta-high';
  if (safe <= -10) return 'competitorDelta-low';
  return 'competitorDelta-neutral';
}

function formatPriceDelta(value) {
  const safe = Number(value || 0);
  return `${safe > 0 ? '+' : ''}${safe.toFixed(2)}%`;
}

export default function CompetitorPanel({ token = '', hotelId = '' }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadPanel() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(buildApiPath('/api/intelligence/competitors', { hotel_id: hotelId }), {
          headers: buildAuthHeaders(token),
        });

        if (!response.ok) {
          const parsed = await parseServerError(response, 'Unable to load competitor intelligence');
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

        setError(loadError.message || 'Unable to load competitor intelligence.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadPanel();
    return () => {
      active = false;
    };
  }, [hotelId, token]);

  return (
    <section className="panel competitorPanel" aria-label="Competitor intelligence">
      <header className="panelHeader">
        <div className="gridMetaBlock">
          <h2>Competitor Intelligence</h2>
          <p className="metaLabel">Live price position against the current competitor pocket.</p>
        </div>
      </header>

      {loading ? <p className="metaLabel">Loading competitor intelligence…</p> : null}
      {!loading && error ? <p className="errorText">{error}</p> : null}

      {!loading && !error && payload ? (
        <>
          <div className="competitorSummaryGrid">
            <article className="competitorSummaryCard">
              <span className="metaLabel">Your Price</span>
              <strong>₹{formatCurrency(payload.your_price || 0)}</strong>
            </article>
            <article className="competitorSummaryCard">
              <span className="metaLabel">Market Median</span>
              <strong>₹{formatCurrency(payload.market_median_price || 0)}</strong>
            </article>
            <article className="competitorSummaryCard">
              <span className="metaLabel">Price Position</span>
              <strong className={getPricePositionTone(payload.price_position_percent)}>
                {formatPriceDelta(payload.price_position_percent)}
              </strong>
            </article>
            <article className="competitorSummaryCard">
              <span className="metaLabel">Recommended Adjustment</span>
              <strong>{payload.recommended_adjustment}</strong>
            </article>
          </div>

          <div className="competitorRecommendation">
            <span className="metaLabel">Radar recommendation</span>
            <p>{payload.radar_recommendation}</p>
          </div>

          <div className="tableWrap">
            <table className="gridTable competitorIntelTable">
              <thead>
                <tr>
                  <th>Hotel</th>
                  <th>Price</th>
                  <th>Rating</th>
                  <th>Review Activity</th>
                </tr>
              </thead>
              <tbody>
                {(payload.competitors || []).map((entry) => (
                  <tr key={`${entry.hotel_name}-${entry.price}`}>
                    <td>{entry.hotel_name}</td>
                    <td>₹{formatCurrency(entry.price || 0)}</td>
                    <td>{entry.rating == null ? 'N/A' : Number(entry.rating).toFixed(1)}</td>
                    <td>
                      <span className={`competitorSignalBadge ${entry.review_activity_signal ? 'signal-on' : 'signal-off'}`}>
                        {entry.review_activity_signal ? formatSignalLabel('HIGH_REVIEW_ACTIVITY') : 'No signal'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
