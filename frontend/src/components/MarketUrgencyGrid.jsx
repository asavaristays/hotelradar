import { clamp } from './dashboardUtils.js';

function cellClass(metric, intensity) {
  if (metric === 'risk') {
    if (intensity >= 0.75) return 'urgency-high';
    if (intensity >= 0.45) return 'urgency-medium';
    return 'urgency-low';
  }

  if (metric === 'confidence') {
    if (intensity >= 0.9) return 'urgency-low';
    if (intensity >= 0.65) return 'urgency-medium';
    return 'urgency-high';
  }

  if (intensity >= 0.75) return 'urgency-high';
  if (intensity >= 0.45) return 'urgency-medium';
  return 'urgency-low';
}

function makeScale(value, max) {
  const intensity = clamp(Number(value || 0) / Number(max || 1), 0, 1);
  return [1, 2, 3, 4].map((slot) => {
    const threshold = slot / 4;
    return intensity >= threshold;
  });
}

export default function MarketUrgencyGrid({
  demandScore,
  marketHeat,
  riskLevel,
  confidenceScore,
  calibrationMode = false,
}) {
  const riskScore = riskLevel === 'High' ? 100 : riskLevel === 'Medium' ? 65 : 30;
  const confidenceFlags = calibrationMode ? [true, false, false, false] : makeScale(confidenceScore, 100);
  const rows = [
    { key: 'demand', label: 'Demand', flags: makeScale(demandScore, 100), value: Number(demandScore || 0).toFixed(1) },
    { key: 'heat', label: 'Heat', flags: makeScale(marketHeat, 5), value: `${Math.max(1, Math.min(5, Number(marketHeat || 1)))}/5` },
    { key: 'risk', label: 'Risk', flags: makeScale(riskScore, 100), value: riskLevel || 'Low' },
    {
      key: 'confidence',
      label: 'Confidence',
      flags: confidenceFlags,
      value: calibrationMode ? 'Calibrating' : `${Number(confidenceScore || 0).toFixed(0)}`,
      calibration: calibrationMode,
    },
  ];

  return (
    <section className="urgencyGrid" aria-label="Market urgency grid">
      <header className="urgencyHeader">
        <h3>Market Urgency Grid</h3>
      </header>
      <div className="urgencyBody">
        {rows.map((row) => (
          <div key={row.key} className="urgencyRow">
            <div className="urgencyRowMeta">
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
            <div className="urgencyCells">
              {row.flags.map((active, index) => (
                <span
                  // eslint-disable-next-line react/no-array-index-key
                  key={index}
                  className={`urgencyCell ${
                    active
                      ? row.calibration
                        ? 'urgency-medium'
                        : cellClass(row.key, (index + 1) / 4)
                      : 'urgency-off'
                  }`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
