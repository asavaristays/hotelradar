import { clamp } from './dashboardUtils.js';

function formatDelta(delta7d) {
  const value = Number(delta7d || 0);
  if (value > 0) return `↑ +${value.toFixed(1)} vs 7d`;
  if (value < 0) return `↓ ${value.toFixed(1)} vs 7d`;
  return '→ 0.0 vs 7d';
}

function deltaBadgeClass(delta7d) {
  const value = Number(delta7d || 0);
  if (value > 0) return 'metric-good';
  if (value < 0) return 'metric-risk';
  return 'metric-watch';
}

/**
 * StrategicPositionCard
 * Displays Strategic Position Index (SPI) as a top-level metric card.
 * Uses existing panel/metric utility classes to stay consistent with the dashboard system.
 */
export default function StrategicPositionCard({ strategicPosition }) {
  const spiScore = clamp(Number(strategicPosition?.spiScore || 0), 0, 100);
  const category = strategicPosition?.category || 'Neutral';
  const delta7d = Number(strategicPosition?.delta7d || 0);
  const positive = delta7d > 0;

  return (
    <section
      className="panel"
      aria-label="Strategic position card"
      style={positive ? { borderColor: '#bfdbfe' } : undefined}
    >
      <header className="panelHeader">
        <h2>Strategic Position</h2>
        <span className={`metricBadge ${deltaBadgeClass(delta7d)}`}>7d delta</span>
      </header>

      <p className="priceValue">
        {spiScore.toFixed(0)} <span className="metaLabel">/ 100</span>
      </p>

      <p className="metaValue">{category}</p>
      <p className="metaLabel" style={positive ? { color: '#166534', fontWeight: 600 } : undefined}>
        {formatDelta(delta7d)}
      </p>
    </section>
  );
}
