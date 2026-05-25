const AXES = [
  {
    key: 'LOW_RATING',
    label: 'Reputation Weakness',
    shortLabel: 'LOW_RATING',
  },
  {
    key: 'NO_CHATBOT',
    label: 'Automation Gap',
    shortLabel: 'NO_CHATBOT',
  },
  {
    key: 'HIGH_REVIEW_VOLUME',
    label: 'Popularity Potential',
    shortLabel: 'HIGH_REVIEW_VOLUME',
  },
  {
    key: 'OTA_PRESENT',
    label: 'OTA Dependence',
    shortLabel: 'OTA_PRESENT',
  },
];

function getSignalCount(hotels, signalKey) {
  return hotels.reduce((count, hotel) => {
    const signals = Array.isArray(hotel?.signals) ? hotel.signals : [];
    return signals.includes(signalKey) ? count + 1 : count;
  }, 0);
}

function buildMetrics(hotels = []) {
  return AXES.map((axis) => ({
    ...axis,
    count: getSignalCount(hotels, axis.key),
  }));
}

function buildRadarPoints(metrics, maxCount) {
  const center = 120;
  const radius = 82;

  return metrics.map((metric, index) => {
    const angle = (-Math.PI / 2) + (index * Math.PI * 2) / metrics.length;
    const normalized = maxCount > 0 ? metric.count / maxCount : 0;
    const pointRadius = radius * normalized;
    const x = center + Math.cos(angle) * pointRadius;
    const y = center + Math.sin(angle) * pointRadius;
    return `${x},${y}`;
  }).join(' ');
}

function buildAxisPoint(index, total, distance) {
  const center = 120;
  const angle = (-Math.PI / 2) + (index * Math.PI * 2) / total;
  return {
    x: center + Math.cos(angle) * distance,
    y: center + Math.sin(angle) * distance,
  };
}

export default function MarketWeaknessRadar({
  hotels = [],
  activeAxis = null,
  onSelectAxis = () => {},
  onOpenCategoryHotel = () => {},
}) {
  if (!Array.isArray(hotels) || hotels.length < 5) {
    return null;
  }

  const metrics = buildMetrics(hotels);
  const maxCount = Math.max(...metrics.map((metric) => metric.count), 1);
  const polygonPoints = buildRadarPoints(metrics, maxCount);
  const hotelCount = hotels.length;

  return (
    <section className="panel leadRadarWeaknessRadar">
      <div className="panelHeader">
        <div className="gridMetaBlock">
          <h3>Market Weakness Radar</h3>
          <p className="metaLabel">Signal concentration across the currently visible market leads.</p>
        </div>
        <p className="metaLabel leadRadarWeaknessRadarCount">Hotels analyzed: {hotelCount}</p>
      </div>
      <div className="leadRadarWeaknessRadarContent">
        <div className="leadRadarWeaknessRadarChart">
          <svg viewBox="0 0 240 240" aria-label="Market weakness radar">
            <circle cx="120" cy="120" r="82" className="leadRadarWeaknessRadarRing" />
            <circle cx="120" cy="120" r="55" className="leadRadarWeaknessRadarRing" />
            <circle cx="120" cy="120" r="28" className="leadRadarWeaknessRadarRing" />
            {metrics.map((metric, index) => {
              const outerPoint = buildAxisPoint(index, metrics.length, 82);
              return (
                <line
                  key={metric.key}
                  x1="120"
                  y1="120"
                  x2={outerPoint.x}
                  y2={outerPoint.y}
                  className={`leadRadarWeaknessRadarAxis ${activeAxis === metric.key ? 'leadRadarWeaknessRadarAxis-active' : ''}`}
                />
              );
            })}
            <polygon points={polygonPoints} className="leadRadarWeaknessRadarPolygon" />
            {metrics.map((metric, index) => {
              const point = buildAxisPoint(index, metrics.length, 104);
              return (
                <text
                  key={`${metric.key}-label`}
                  x={point.x}
                  y={point.y}
                  textAnchor="middle"
                  className={`leadRadarWeaknessRadarSvgLabel ${activeAxis === metric.key ? 'leadRadarWeaknessRadarSvgLabel-active' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={activeAxis === metric.key}
                  onClick={() => onSelectAxis(metric.key)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectAxis(metric.key);
                    }
                  }}
                >
                  {metric.shortLabel}
                </text>
              );
            })}
          </svg>
        </div>
        <div className="leadRadarWeaknessRadarLegend">
          {metrics.map((metric) => (
            <article
              key={metric.key}
              className={`leadRadarWeaknessRadarMetric ${activeAxis === metric.key ? 'leadRadarWeaknessRadarMetric-active' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`Open strongest hotel for ${metric.label}`}
              onClick={() => onOpenCategoryHotel(metric.key)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onOpenCategoryHotel(metric.key);
                }
              }}
            >
              <strong>{metric.count}</strong>
              <span>{metric.label}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
