import { clamp, stabilityTone } from './dashboardUtils.js';

function formatPreviewDate(value) {
  if (!value) return 'N/A';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function statusFromVolatility(score) {
  if (score >= 66) return 'Highly Volatile';
  if (score >= 36) return 'Volatile';
  return 'Stable';
}

export default function StabilityCard({ marketStability, preview = null, baseDemandScore = 50 }) {
  const baseStatus = marketStability?.status || 'Stable';
  const baseScore = clamp(Number(marketStability?.volatilityScore || 0), 0, 100);
  const demandDelta = preview ? Math.abs(Number(preview?.score || 0) - Number(baseDemandScore || 50)) : 0;
  const previewScore = preview ? clamp(baseScore + demandDelta * 0.9, 0, 100) : baseScore;
  const status = preview ? statusFromVolatility(previewScore) : baseStatus;
  const score = previewScore;
  const tone = stabilityTone(status);
  const previewLabel = preview?.date ? `Previewing ${formatPreviewDate(preview.date)}` : '';

  return (
    <section className="panel stabilityPanel" aria-label="Market stability card">
      <header className="panelHeader">
        <h2>Market Stability</h2>
        {previewLabel ? <p className="metaLabel">{previewLabel}</p> : null}
      </header>

      <p className={`stabilityStatus stabilityStatus-${tone}`}>{status}</p>
      <div className="stabilityTrack" title={`Volatility score ${score.toFixed(1)}`}>
        <div
          className={`stabilityFill stabilityFill-${tone} ${previewLabel ? 'stabilityFillPreview' : ''}`}
          style={{ width: `${score}%` }}
        />
      </div>

      <p className="metaLabel">Volatility score: {score.toFixed(1)}</p>
    </section>
  );
}
