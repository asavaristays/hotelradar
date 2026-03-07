import { clamp, formatPercent } from './dashboardUtils.js';

const BASE_SIGNAL_META = [
  { key: 'competitorMomentum', label: 'Competitor Momentum', className: 'signal-competitor' },
  { key: 'holidayImpact', label: 'Holiday Impact', className: 'signal-holiday' },
  { key: 'airfareImpact', label: 'Airfare Impact', className: 'signal-airfare' },
  { key: 'seasonImpact', label: 'Season Impact', className: 'signal-season' },
];

function formatPreviewDate(value) {
  if (!value) return 'N/A';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function SignalBreakdownChart({ signalBreakdown, preview = null, baseScore = 50 }) {
  const previewScore = Number(preview?.score || 0);
  const safeBaseScore = Number(baseScore || 50);
  const curveDelta = safeBaseScore > 0 ? (previewScore - safeBaseScore) / 50 : 0;
  const previewMultiplier = preview ? clamp(1 + curveDelta, 0.55, 1.55) : 1;

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

  const rawEntries = [
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
  const entries = rawEntries.map((entry) => ({
    ...entry,
    baseValue: Number(entry.value || 0),
    value: Number(entry.value || 0) * previewMultiplier,
  }));

  const total = entries.reduce((sum, entry) => sum + Math.abs(entry.value), 0) || 1;
  const previewDateLabel = preview?.date ? formatPreviewDate(preview.date) : '';
  const previewHint = previewDateLabel
    ? `Previewing ${previewDateLabel} (${Number(previewScore || 0).toFixed(1)})`
    : '';

  return (
    <section className={`panel signalPanel ${previewHint ? 'signalPanelPreview' : ''}`} aria-label="Signal breakdown chart">
      <header className="panelHeader">
        <h2>Signal Breakdown</h2>
        {previewHint ? (
          <p className="metaLabel signalPreviewMeta">
            {previewHint} | Multiplier {previewMultiplier.toFixed(2)}x
          </p>
        ) : null}
      </header>

      <div className="signalRows">
        {entries.map((entry) => {
          const width = (Math.abs(entry.value) / total) * 100;
          const delta = entry.value - entry.baseValue;
          return (
            <div key={entry.key} className="signalRow">
              <div className="signalRowHeader">
                <span>{entry.label}</span>
                <div className="signalValueWrap">
                  <strong>{formatPercent(entry.value, 2)}</strong>
                  {previewHint ? (
                    <small className={`signalDelta ${delta >= 0 ? 'up' : 'down'}`}>
                      {delta >= 0 ? '+' : ''}
                      {delta.toFixed(2)}
                    </small>
                  ) : null}
                </div>
              </div>
              <div className="signalTrack" title={`${entry.label}: ${formatPercent(entry.value, 2)}`}>
                <div
                  className={`signalFill ${entry.className} ${previewHint ? 'signalFillPreview' : ''}`}
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
