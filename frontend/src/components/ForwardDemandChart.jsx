import { useMemo } from 'react';
import { clamp } from './dashboardUtils.js';

function asDate(input) {
  return new Date(`${input}T00:00:00`);
}

function isWeekend(dateString) {
  const day = asDate(dateString).getDay();
  return day === 0 || day === 6;
}

export default function ForwardDemandChart({ forwardCurve = [] }) {
  const chart = useMemo(() => {
    if (!forwardCurve.length) return null;

    const width = 900;
    const height = 260;
    const padX = 24;
    const padY = 24;
    const innerWidth = width - padX * 2;
    const innerHeight = height - padY * 2;

    const values = forwardCurve.map((point) => Number(point.score || 0));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = max - min || 1;

    const points = forwardCurve.map((point, index) => {
      const x = padX + (index / Math.max(forwardCurve.length - 1, 1)) * innerWidth;
      const y = padY + (1 - (Number(point.score || 0) - min) / spread) * innerHeight;
      return { ...point, x, y };
    });

    const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');
    const peakPoint = points.reduce((current, point) => {
      if (!current) return point;
      return Number(point.score || 0) > Number(current.score || 0) ? point : current;
    }, null);

    const weekendRects = forwardCurve
      .map((point, index) => ({ index, point }))
      .filter(({ point }) => isWeekend(point.date))
      .map(({ index }) => {
        const x = padX + (index / Math.max(forwardCurve.length - 1, 1)) * innerWidth;
        const slotWidth = innerWidth / Math.max(forwardCurve.length, 1);
        return { x: x - slotWidth / 2, width: slotWidth };
      });

    return {
      width,
      height,
      padX,
      padY,
      min: clamp(min, 0, 100),
      max: clamp(max, 0, 100),
      points,
      path,
      peakPoint,
      weekendRects,
      first: forwardCurve[0],
      mid: forwardCurve[Math.floor(forwardCurve.length / 2)],
      last: forwardCurve[forwardCurve.length - 1],
    };
  }, [forwardCurve]);

  if (!chart) {
    return (
      <section className="panel forwardPanel">
        <header className="panelHeader">
          <h2>Forward 30-Day Demand Curve</h2>
        </header>
        <p className="metaLabel">No forward curve data available.</p>
      </section>
    );
  }

  return (
    <section className="panel forwardPanel" aria-label="Forward demand curve">
      <header className="panelHeader">
        <h2>Forward 30-Day Demand Curve</h2>
        <p className="metaLabel">
          Range {chart.min.toFixed(1)} to {chart.max.toFixed(1)}
        </p>
      </header>

      <div className="forwardChartWrap">
        <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Forward demand line chart">
          {chart.weekendRects.map((rect, idx) => (
            <rect
              // eslint-disable-next-line react/no-array-index-key
              key={idx}
              x={rect.x}
              y={chart.padY}
              width={rect.width}
              height={chart.height - chart.padY * 2}
              className="weekendShade"
            />
          ))}

          <line x1={chart.padX} y1={chart.padY} x2={chart.padX} y2={chart.height - chart.padY} className="axisLine" />
          <line
            x1={chart.padX}
            y1={chart.height - chart.padY}
            x2={chart.width - chart.padX}
            y2={chart.height - chart.padY}
            className="axisLine"
          />

          <path d={chart.path} className="curveLine" />

          {chart.points.map((point, index) => (
            <circle
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              cx={point.x}
              cy={point.y}
              r={index % 4 === 0 ? 3.4 : 2.4}
              className="curvePoint"
            >
              <title>
                {point.date}: {Number(point.score || 0).toFixed(2)}
              </title>
            </circle>
          ))}

          {chart.peakPoint ? (
            <circle cx={chart.peakPoint.x} cy={chart.peakPoint.y} r={5.5} className="peakPoint">
              <title>
                Peak day {chart.peakPoint.date}: {Number(chart.peakPoint.score || 0).toFixed(2)}
              </title>
            </circle>
          ) : null}
        </svg>
      </div>

      <div className="forwardAxisLabels">
        <span>{chart.first?.date}</span>
        <span>{chart.mid?.date}</span>
        <span>{chart.last?.date}</span>
      </div>
      {chart.peakPoint ? (
        <p className="forwardCallout">
          Peak forecast: <strong>{chart.peakPoint.date}</strong> at <strong>{Number(chart.peakPoint.score || 0).toFixed(1)}</strong>
        </p>
      ) : null}
    </section>
  );
}
