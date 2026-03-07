import { useEffect, useMemo, useState } from 'react';
import { clamp, formatCurrency } from './dashboardUtils.js';

function asDate(input) {
  return new Date(`${input}T00:00:00`);
}

function isWeekend(dateString) {
  const day = asDate(dateString).getDay();
  return day === 0 || day === 6;
}

function formatHoverDate(value) {
  if (!value) return 'N/A';
  const parsed = asDate(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function demandBucket(score) {
  if (score <= 40) return 'Low';
  if (score <= 65) return 'Moderate';
  if (score <= 85) return 'High';
  return 'Surge';
}

function dateStatus(score) {
  const numeric = Number(score || 0);
  if (numeric >= 85) return { label: 'Surge Opportunity', tone: 'surge' };
  if (numeric >= 65) return { label: 'Premium Window', tone: 'high' };
  if (numeric >= 45) return { label: 'Monitor Closely', tone: 'watch' };
  return { label: 'Soft Demand', tone: 'soft' };
}

function indicativeRate(baseRate, currentScore, targetScore) {
  const safeBaseRate = Number(baseRate || 0);
  if (!Number.isFinite(safeBaseRate) || safeBaseRate <= 0) return null;

  const current = Number(currentScore || 0);
  const target = Number(targetScore || 0);
  const factor = clamp(1 + ((target - current) / 100) * 0.6, 0.82, 1.28);
  return Math.round(safeBaseRate * factor);
}

export default function ForwardDemandChart({
  forwardCurve = [],
  suggestedBase = 0,
  onPointChange = null,
}) {
  const [activeIndex, setActiveIndex] = useState(null);

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
    const currentScore = Number(forwardCurve[0]?.score || 0);

    const points = forwardCurve.map((point, index) => {
      const x = padX + (index / Math.max(forwardCurve.length - 1, 1)) * innerWidth;
      const y = padY + (1 - (Number(point.score || 0) - min) / spread) * innerHeight;
      return {
        ...point,
        x,
        y,
        index,
        label: demandBucket(Number(point.score || 0)),
        indicativeRate: indicativeRate(suggestedBase, currentScore, point.score),
      };
    });

    const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');
    const peakPoint = points.reduce((current, point) => {
      if (!current) return point;
      return Number(point.score || 0) > Number(current.score || 0) ? point : current;
    }, null);
    const peakIndex = peakPoint?.index ?? 0;

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
      peakIndex,
      weekendRects,
      first: forwardCurve[0],
      mid: forwardCurve[Math.floor(forwardCurve.length / 2)],
      last: forwardCurve[forwardCurve.length - 1],
    };
  }, [forwardCurve, suggestedBase]);

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

  const resolvedIndex = activeIndex == null ? chart.peakIndex : activeIndex;
  const activePoint = chart.points[resolvedIndex] || chart.peakPoint || chart.points[0];
  const baselinePoint = chart.points[0] || activePoint;
  const baselineRate = Number(baselinePoint?.indicativeRate || 0);
  const activeRate = Number(activePoint?.indicativeRate || 0);
  const revenueDeltaPerRoom = activeRate > 0 && baselineRate > 0 ? activeRate - baselineRate : 0;
  const revenueDeltaPct =
    activeRate > 0 && baselineRate > 0 ? ((activeRate - baselineRate) / baselineRate) * 100 : 0;
  const status = dateStatus(activePoint?.score);

  useEffect(() => {
    if (typeof onPointChange !== 'function' || !activePoint) return;
    onPointChange({
      index: resolvedIndex,
      date: activePoint.date,
      score: Number(activePoint.score || 0),
      demandLabel: activePoint.label || demandBucket(Number(activePoint.score || 0)),
      indicativeRate: activeRate || null,
      revenueDeltaPerRoom: revenueDeltaPerRoom || 0,
      revenueDeltaPct: revenueDeltaPct || 0,
      statusLabel: status.label,
      statusTone: status.tone,
    });
  }, [
    activePoint,
    activeRate,
    onPointChange,
    resolvedIndex,
    revenueDeltaPerRoom,
    revenueDeltaPct,
    status.label,
    status.tone,
  ]);

  function updateActiveFromPointer(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const safeWidth = bounds.width || 1;
    const ratio = clamp((event.clientX - bounds.left) / safeWidth, 0, 1);
    const nextIndex = Math.round(ratio * Math.max(chart.points.length - 1, 0));
    setActiveIndex(nextIndex);
  }

  return (
    <section className="panel forwardPanel" aria-label="Forward demand curve">
      <header className="panelHeader">
        <h2>Forward 30-Day Demand Curve</h2>
        <p className="metaLabel">
          Range {chart.min.toFixed(1)} to {chart.max.toFixed(1)}
        </p>
      </header>

      <div className="forwardHoverCard" aria-live="polite">
        <div>
          <span>Selected date</span>
          <strong>{formatHoverDate(activePoint?.date)}</strong>
        </div>
        <div>
          <span>Demand score</span>
          <strong>{Number(activePoint?.score || 0).toFixed(1)} ({activePoint?.label || 'Moderate'})</strong>
        </div>
        <div>
          <span>Indicative rate</span>
          <strong>
            {activePoint?.indicativeRate ? `₹${formatCurrency(activePoint.indicativeRate)}` : 'Unavailable'}
          </strong>
        </div>
        <div>
          <span>Date status</span>
          <strong className={`curveStatus curveStatus-${status.tone}`}>{status.label}</strong>
          <small className="curveRevenueDelta">
            {revenueDeltaPerRoom >= 0 ? '+' : '-'}₹{formatCurrency(Math.abs(revenueDeltaPerRoom))} / room ({revenueDeltaPct >= 0 ? '+' : ''}
            {revenueDeltaPct.toFixed(1)}%)
          </small>
        </div>
      </div>

      <div className="forwardChartWrap">
        <svg
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          role="img"
          aria-label="Forward demand line chart"
          onMouseMove={updateActiveFromPointer}
          onMouseLeave={() => setActiveIndex(chart.peakIndex)}
        >
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

          {activePoint ? (
            <>
              <line
                x1={activePoint.x}
                y1={chart.padY}
                x2={activePoint.x}
                y2={chart.height - chart.padY}
                className="curveFocusLine"
              />
              <circle cx={activePoint.x} cy={activePoint.y} r={6.5} className="curveFocusHalo" />
            </>
          ) : null}

          {chart.points.map((point, index) => (
            <circle
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              cx={point.x}
              cy={point.y}
              r={index === resolvedIndex ? 4.6 : index % 4 === 0 ? 3.4 : 2.4}
              className={`curvePoint ${index === resolvedIndex ? 'curvePointActive' : ''}`}
              tabIndex="0"
              onFocus={() => setActiveIndex(index)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <title>
                {point.date}: {Number(point.score || 0).toFixed(2)} | Indicative rate:{' '}
                {point.indicativeRate ? `₹${formatCurrency(point.indicativeRate)}` : 'Unavailable'}
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
      <p className="metaLabel">Hover the curve to inspect stay date, demand score, and indicative rate.</p>
    </section>
  );
}
