import { clamp, formatPercent } from './dashboardUtils.js';

const BASE_SIGNAL_META = [
  { key: 'competitorMomentum', label: 'Competitor Momentum', className: 'signal-competitor' },
  { key: 'holidayImpact', label: 'Holiday Impact', className: 'signal-holiday' },
  { key: 'airfareImpact', label: 'Airfare Impact', className: 'signal-airfare' },
  { key: 'seasonImpact', label: 'Season Impact', className: 'signal-season' },
];

const SIGNAL_SENSITIVITY = {
  competitorMomentum: 0.35,
  holidayImpact: 0.55,
  eventImpact: 0.7,
  weddingImpact: 0.75,
  corporateEventImpact: 0.65,
  otherEventImpact: 0.5,
  airfareImpact: 0.25,
  seasonImpact: 0.2,
};

function formatPreviewDate(value) {
  if (!value) return 'N/A';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function SignalBreakdownChart({
  signalBreakdown,
  preview = null,
  baseScore = 50,
  showHeading = true,
}) {
  const previewScore = Number(preview?.score || 0);
  const safeBaseScore = Number(baseScore || 50);
  const curveDelta = preview ? clamp((previewScore - safeBaseScore) / 100, -0.5, 0.5) : 0;

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
        {
          key: 'otherEventImpact',
          label: 'Other Event Signal',
          className: 'signal-event-other',
          value: otherEventImpact,
        },
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

  const adjustPreviewValue = (entryKey, rawValue) => {
    const baseValue = Number(rawValue || 0);
    if (!preview) return baseValue;

    const sensitivity = SIGNAL_SENSITIVITY[entryKey] ?? 0.35;
    const adjusted = baseValue * (1 + curveDelta * sensitivity);
    const floor = Math.sign(baseValue || 1) * curveDelta * sensitivity * 4;
    return adjusted + floor;
  };

  const entries = rawEntries.map((entry) => ({
    ...entry,
    baseValue: Number(entry.value || 0),
    value: adjustPreviewValue(entry.key, entry.value),
  }));

  const referenceMax = rawEntries.reduce((maxValue, entry) => {
    const magnitude = Math.abs(Number(entry.value || 0));
    return magnitude > maxValue ? magnitude : maxValue;
  }, 1);
  const previewDateLabel = preview?.date ? formatPreviewDate(preview.date) : '';
  const previewHint = previewDateLabel
    ? `Previewing ${previewDateLabel} (${Number(previewScore || 0).toFixed(1)})`
    : '';

  return (
    <section className={`panel signalPanel ${previewHint ? 'signalPanelPreview' : ''}`} aria-label="Signal breakdown chart">
      {showHeading || previewHint ? (
        <header className="panelHeader">
          {showHeading ? <h2>Signal Breakdown</h2> : null}
          {previewHint ? <p className="metaLabel signalPreviewMeta">{previewHint}</p> : null}
        </header>
      ) : null}

      <div className="signalRows">
        {entries.map((entry) => {
          const baseWidth = (Math.abs(entry.baseValue) / referenceMax) * 100;
          const sensitivity = SIGNAL_SENSITIVITY[entry.key] ?? 0.35;
          const previewPulse = preview ? curveDelta * sensitivity * 70 : 0;
          // Keep width anchored to the base contribution, then apply a hover pulse so
          // low-magnitude rows (for example "Other Event Signal") visibly react too.
          let width = clamp(baseWidth + previewPulse, 0, 100);
          const delta = entry.value - entry.baseValue;
          if (preview && Math.abs(entry.baseValue) < 0.25) {
            const previewVisibleWidth = clamp(Math.abs(previewPulse) * 1.8 + 4, 4, 24);
            width = Math.max(width, previewVisibleWidth);
          }
          const previewIntensity = preview ? clamp(Math.abs(delta) / Math.max(Math.abs(entry.baseValue), 1), 0, 1) : 0;
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
                  className={`signalFill ${entry.className} ${previewHint ? 'signalFillPreview' : ''} ${
                    previewHint ? (delta >= 0 ? 'signalFillPreviewUp' : 'signalFillPreviewDown') : ''
                  }`}
                  style={{
                    width: `${width}%`,
                    '--signal-preview-intensity': previewIntensity.toFixed(3),
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
