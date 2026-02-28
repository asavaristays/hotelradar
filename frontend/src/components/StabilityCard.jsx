import { clamp, stabilityTone } from './dashboardUtils.js';

export default function StabilityCard({ marketStability }) {
  const status = marketStability?.status || 'Stable';
  const score = clamp(Number(marketStability?.volatilityScore || 0), 0, 100);
  const tone = stabilityTone(status);

  return (
    <section className="panel stabilityPanel" aria-label="Market stability card">
      <header className="panelHeader">
        <h2>Market Stability</h2>
      </header>

      <p className={`stabilityStatus stability-${tone}`}>{status}</p>
      <div className="stabilityTrack" title={`Volatility score ${score.toFixed(1)}`}>
        <div className={`stabilityFill stability-${tone}`} style={{ width: `${score}%` }} />
      </div>

      <p className="metaLabel">Volatility score: {score.toFixed(1)}</p>
    </section>
  );
}

