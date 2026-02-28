import { clamp, demandTone } from './dashboardUtils.js';

export default function DemandScoreCard({ demandScore, demandLevel, confidence }) {
  const score = clamp(Number(demandScore || 0), 0, 100);
  const tone = demandTone(demandLevel);
  const confidenceLabel = confidence?.level || 'N/A';
  const confidenceScore = Number(confidence?.score || 0);

  return (
    <section className={`panel demandCard demandCard-${tone}`} aria-label="Demand score card">
      <header className="panelHeader">
        <h2>Demand Score</h2>
        <span className={`levelPill level-${tone}`}>{demandLevel}</span>
      </header>

      <div className={`radial radial-${tone}`} style={{ '--progress': score }}>
        <div className="radialInner">
          <strong>{score.toFixed(2)}</strong>
          <span>/100</span>
        </div>
      </div>

      <div className="metaRow">
        <p className="metaLabel">Confidence</p>
        <p className="metaValue">
          {confidenceLabel} ({confidenceScore})
        </p>
      </div>
      <p className="demandHint">
        {tone === 'surge'
          ? 'Market compression is elevated; protect yield.'
          : tone === 'high'
            ? 'Demand momentum supports controlled rate expansion.'
            : tone === 'low'
              ? 'Protect occupancy and monitor competitor response.'
              : 'Balanced market conditions; optimize with caution.'}
      </p>
    </section>
  );
}
