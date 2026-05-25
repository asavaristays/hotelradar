import { useEffect, useState } from 'react';
import { buildApiPath, buildAuthHeaders, parseServerError } from '../http.js';

function compressionTone(value) {
  const text = String(value || '').toLowerCase();
  if (text === 'high') return 'high';
  if (text === 'moderate') return 'moderate';
  return 'low';
}

function formatConfidence(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

export default function CompressionAlert({ token = '', hotelId = '' }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadCompression() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(buildApiPath('/api/intelligence/market-compression', { hotel_id: hotelId }), {
          headers: buildAuthHeaders(token),
        });

        if (!response.ok) {
          const parsed = await parseServerError(response, 'Unable to load market compression alert');
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

        setError(loadError.message || 'Unable to load market compression alert.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadCompression();
    return () => {
      active = false;
    };
  }, [hotelId, token]);

  const tone = compressionTone(payload?.compression_level);

  return (
    <section className={`panel compressionAlertCard compressionAlertCard-${tone}`} aria-label="Market compression alert">
      <header className="panelHeader">
        <div className="gridMetaBlock">
          <h2>Market Compression Alert</h2>
          <p className="metaLabel">Warning when the market is filling fast and sell-out risk is rising.</p>
        </div>
        {payload ? (
          <span className={`compressionAlertBadge compressionAlertBadge-${tone}`}>{payload.compression_level}</span>
        ) : null}
      </header>

      {loading ? <p className="metaLabel">Loading market compression alert…</p> : null}
      {!loading && error ? <p className="errorText">{error}</p> : null}

      {!loading && !error && payload ? (
        <>
          <div className="compressionAlertGrid">
            <article className="compressionAlertMetric">
              <span className="metaLabel">City</span>
              <strong>{payload.city}</strong>
            </article>
            <article className="compressionAlertMetric">
              <span className="metaLabel">Sell-out window</span>
              <strong>{payload.expected_sellout_window}</strong>
            </article>
            <article className="compressionAlertMetric">
              <span className="metaLabel">Confidence</span>
              <strong>{formatConfidence(payload.confidence)}</strong>
            </article>
          </div>

          <div className="compressionAlertAction">
            <span className="metaLabel">Recommended action</span>
            <p>{payload.recommended_action}</p>
          </div>
        </>
      ) : null}
    </section>
  );
}
