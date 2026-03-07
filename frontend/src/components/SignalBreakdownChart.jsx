import { formatPercent } from './dashboardUtils.js';

const BASE_SIGNAL_META = [
  { key: 'competitorMomentum', label: 'Competitor Momentum', className: 'signal-competitor' },
  { key: 'holidayImpact', label: 'Holiday Impact', className: 'signal-holiday' },
  { key: 'airfareImpact', label: 'Airfare Impact', className: 'signal-airfare' },
  { key: 'seasonImpact', label: 'Season Impact', className: 'signal-season' },
];

export default function SignalBreakdownChart({ signalBreakdown }) {
  const weddingImpact = Number(signalBreakdown?.weddingImpact || 0);
  const corporateEventImpact = Number(signalBreakdown?.corporateEventImpact || 0);
  const otherEventImpact = Number(signalBreakdown?.otherEventImpact || 0);
  const eventImpact = Number(signalBreakdown?.eventImpact || 0);
  const showCategoryBreakout = Math.abs(weddingImpact) + Math.abs(corporateEventImpact) > 0;

  const eventRows = showCategoryBreakout
    ? [
        { key: 'weddingImpact', label: 'Wedding Signal', className: 'signal-wedding', value: weddingImpact },
        {
          key: 'corporateEventImpact',
          label: 'Corporate Event Signal',
          className: 'signal-corporate',
          value: corporateEventImpact,
        },
        ...(Math.abs(otherEventImpact) > 0
          ? [{ key: 'otherEventImpact', label: 'Other Event Signal', className: 'signal-event-other', value: otherEventImpact }]
          : []),
      ]
    : [{ key: 'eventImpact', label: 'Event Impact', className: 'signal-event', value: eventImpact }];

  const entries = [
    ...BASE_SIGNAL_META.slice(0, 2).map((meta) => ({
      ...meta,
      value: Number(signalBreakdown?.[meta.key] || 0),
    })),
    ...eventRows,
    ...BASE_SIGNAL_META.slice(2).map((meta) => ({
      ...meta,
      value: Number(signalBreakdown?.[meta.key] || 0),
    })),
  ];

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
