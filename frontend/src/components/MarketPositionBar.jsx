import { clamp, formatCurrency, formatPercent } from './dashboardUtils.js';

function markerOffset(positionPct) {
  const clamped = clamp(Number(positionPct || 0), -50, 50);
  return ((clamped + 50) / 100) * 100;
}

export default function MarketPositionBar({ marketPosition, suggestedBase }) {
  const hotelPrice = Number(marketPosition?.hotelPrice || 0);
  const marketAvg = Number(marketPosition?.marketAvg || 0);
  const hasObservedMarket = hotelPrice > 0 && marketAvg > 0;
  const currentPct = Number(marketPosition?.positionPct || 0);
  const suggestedPct = marketAvg ? ((Number(suggestedBase || hotelPrice) - marketAvg) / marketAvg) * 100 : currentPct;
  const overlayLabel = currentPct < 0 ? `Under Market: ${formatPercent(currentPct, 2)}` : `Above Market: ${formatPercent(currentPct, 2)}`;
  const gapAmount = marketAvg - hotelPrice;

  return (
    <section className="panel positionPanel" aria-label="Market position bar">
      <header className="panelHeader">
        <h2>Market Position</h2>
        <p className="metaLabel">
          {hasObservedMarket
            ? `Hotel ₹${formatCurrency(hotelPrice)} vs Market ₹${formatCurrency(marketAvg)}`
            : 'Awaiting verified hotel and competitor rates'}
        </p>
      </header>

      <p className="positionOverlayPill">{hasObservedMarket ? overlayLabel : 'Not captured'}</p>

      {!hasObservedMarket ? (
        <div className="evidenceEmptyState">
          <strong>Market position is unavailable for this stay date.</strong>
          <p>
            Capture the hotel&apos;s live rate and enough fresh competitor rates before showing premium/discount
            position, suggested position, or gap-to-market values.
          </p>
          <div className="evidenceEmptyGrid">
            <span className={hotelPrice > 0 ? 'signalState signalState-ready' : 'signalState signalState-missing'}>
              Own hotel rate: {hotelPrice > 0 ? 'Captured' : 'Not captured'}
            </span>
            <span className={marketAvg > 0 ? 'signalState signalState-ready' : 'signalState signalState-missing'}>
              Market average: {marketAvg > 0 ? 'Captured' : 'Not captured'}
            </span>
          </div>
        </div>
      ) : null}

      {hasObservedMarket ? (
        <>
          <div className="positionScale">
            <div className="positionMarker current" style={{ left: `${markerOffset(currentPct)}%` }} title="Current position" />
            <div
              className="positionMarker suggested"
              style={{ left: `${markerOffset(suggestedPct)}%` }}
              title="Projected position"
            />
          </div>

          <div className="positionAxisLabels">
            <span>Deep Discount</span>
            <span>Near Market</span>
            <span>Premium</span>
          </div>

          <div className="positionLegend">
            <span>
              <i className="legendDot current" />
              Current: {formatPercent(currentPct, 2)}
            </span>
            <span>
              <i className="legendDot suggested" />
              Suggested: {formatPercent(suggestedPct, 2)}
            </span>
          </div>

          <div className="positionKpis">
            <span>Gap to market avg</span>
            <strong>{gapAmount >= 0 ? '+' : ''}₹{formatCurrency(Math.abs(gapAmount))}</strong>
          </div>
        </>
      ) : null}
    </section>
  );
}
