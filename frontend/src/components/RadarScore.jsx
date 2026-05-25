import { useEffect, useMemo, useState } from 'react';
import { buildApiPath, buildAuthHeaders, parseServerError } from '../http.js';

function scoreTone(score) {
  const safe = Number(score || 0);
  if (safe >= 80) return 'good';
  if (safe >= 60) return 'watch';
  return 'risk';
}

function formatComponentLabel(value) {
  return String(value || '')
    .trim()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function RadarScore({ token = '', hotelId = '' }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadScore() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(buildApiPath('/api/intelligence/radar-score', { hotel_id: hotelId }), {
          headers: buildAuthHeaders(token),
        });

        if (!response.ok) {
          const parsed = await parseServerError(response, 'Unable to load RADAR score');
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

        setError(loadError.message || 'Unable to load RADAR score.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadScore();
    return () => {
      active = false;
    };
  }, [hotelId, token]);

  const tone = scoreTone(payload?.radar_score);
  const components = useMemo(
    () => Object.entries(payload?.components || {}),
    [payload],
  );

  return (
    <section className={`panel radarScoreCard radarScoreCard-${tone}`} aria-label="RADAR score">
      <header className="panelHeader">
        <div className="gridMetaBlock">
          <h2>RADAR Score</h2>
          <p className="metaLabel">Single-view intelligence score for market performance.</p>
        </div>
      </header>

      {loading ? <p className="metaLabel">Loading RADAR score…</p> : null}
      {!loading && error ? <p className="errorText">{error}</p> : null}

      {!loading && !error && payload ? (
        <div className="radarScoreLayout">
          <div className={`radial radarScoreRadial radarScoreRadial-${tone}`} style={{ '--progress': Number(payload.radar_score || 0) }}>
            <div className="radialInner">
              <strong>{Number(payload.radar_score || 0)}</strong>
              <span>/100</span>
            </div>
          </div>

          <div className="radarScoreMeta">
            <p className="metaLabel">City</p>
            <p className="radarScoreCity">{payload.city}</p>
            <p className="metaLabel">Generated</p>
            <p className="radarScoreGenerated">{payload.generated_at}</p>
          </div>

          <div className="radarBreakdown">
            {components.map(([key, value]) => (
              <article key={key} className="radarBreakdownRow">
                <div className="radarBreakdownHead">
                  <span>{formatComponentLabel(key)}</span>
                  <strong>{Number(value || 0)}</strong>
                </div>
                <div className="radarBreakdownTrack">
                  <span style={{ width: `${Number(value || 0)}%` }} />
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
