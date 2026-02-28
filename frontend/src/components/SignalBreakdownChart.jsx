import { formatPercent } from './dashboardUtils.js';

const SIGNAL_META = [
  { key: 'competitorMomentum', label: 'Competitor Momentum', className: 'signal-competitor' },
  { key: 'holidayImpact', label: 'Holiday Impact', className: 'signal-holiday' },
  { key: 'airfareImpact', label: 'Airfare Impact', className: 'signal-airfare' },
  { key: 'seasonImpact', label: 'Season Impact', className: 'signal-season' },
];

export default function SignalBreakdownChart({ signalBreakdown }) {
  const entries = SIGNAL_META.map((meta) => ({
    ...meta,
    value: Number(signalBreakdown?.[meta.key] || 0),
  }));

  const total = entries.reduce((sum, entry) => sum + Math.abs(entry.value), 0) || 1;

  return (
    <section className="panel signalPanel" aria-label="Signal breakdown chart">
      <header className="panelHeader">
        <h2>Signal Breakdown</h2>
      </header>

      <div className="signalRows">
        {entries.map((entry) => {
          const width = (Math.abs(entry.value) / total) * 100;
          return (
            <div key={entry.key} className="signalRow">
              <div className="signalRowHeader">
                <span>{entry.label}</span>
                <strong>{formatPercent(entry.value, 2)}</strong>
              </div>
              <div className="signalTrack" title={`${entry.label}: ${formatPercent(entry.value, 2)}`}>
                <div className={`signalFill ${entry.className}`} style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

