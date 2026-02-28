import { formatCurrency, formatPercent } from './dashboardUtils.js';

function strategyFallback(level, positionPct) {
  if (level === 'Low') return 'Protect occupancy and avoid aggressive upside moves.';
  if (level === 'Moderate' && positionPct < -20) return 'Moderate demand with meaningful underpricing versus market.';
  if (level === 'High') return 'Close the price gap in controlled steps while preserving conversion.';
  if (level === 'Surge') return 'Capture premium willingness-to-pay while monitoring booking pace.';
  return 'Maintain current level and monitor incremental demand changes.';
}

function projectedPosition(basePrice, marketAvg) {
  const base = Number(basePrice || 0);
  const market = Number(marketAvg || 0);
  if (!market) return 0;
  return ((base - market) / market) * 100;
}

function Band({ title, range, variant }) {
  return (
    <article className={`bandCard band-${variant}`} aria-label={`${title} band`}>
      <p className="bandTitle">{title}</p>
      <p className="bandValue">
        ₹{formatCurrency(range.min)} - ₹{formatCurrency(range.max)}
      </p>
    </article>
  );
}

function formatRevenue(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

export default function SuggestedPricingCard({
  suggestedPricing,
  marketPosition,
  demandLevel,
  revenueImpact,
}) {
  const base = Number(suggestedPricing?.base || 0);
  const hotelPrice = Number(marketPosition?.hotelPrice || 0);
  const bands = suggestedPricing?.bands || {
    safe: { min: 0, max: 0 },
    aggressive: { min: 0, max: 0 },
    premium: { min: 0, max: 0 },
  };
  const projectedPct = projectedPosition(base, marketPosition?.marketAvg);
  const strategy = suggestedPricing?.strategy || strategyFallback(demandLevel, marketPosition?.positionPct);
  const impactAbsolute = base - hotelPrice;
  const impactPct = hotelPrice > 0 ? (impactAbsolute / hotelPrice) * 100 : 0;
  const trendSymbol = impactAbsolute > 0 ? '▲' : impactAbsolute < 0 ? '▼' : '■';
  const trendLabel = impactAbsolute > 0 ? 'Increase' : impactAbsolute < 0 ? 'Reduce' : 'Maintain';
  const trendClass = impactAbsolute > 0 ? 'trend-up' : impactAbsolute < 0 ? 'trend-down' : 'trend-flat';
  const revenue = {
    maintain: Number(revenueImpact?.maintain || 0),
    plus2: Number(revenueImpact?.plus2 || 0),
    minus2: Number(revenueImpact?.minus2 || 0),
    recommended: revenueImpact?.recommended || 'maintain',
  };

  return (
    <section className={`panel pricingCard ${trendClass}`} aria-label="Suggested pricing card">
      <header className="panelHeader">
        <h2>Suggested Price</h2>
        <p className="metaLabel">Calibrated Recommendation</p>
      </header>

      <p className="priceValue">₹{formatCurrency(base)}</p>
      <p className="strategyMeta">
        <strong>{trendSymbol} {trendLabel}</strong>
      </p>

      <div className="bandGrid">
        <Band title="Safe Zone" range={bands.safe} variant="safe" />
        <Band title="Aggressive Zone" range={bands.aggressive} variant="aggressive" />
        <Band title="Premium Zone" range={bands.premium} variant="premium" />
      </div>

      <p className="strategyLine">{strategy}</p>

      {/* Revenue impact block: 7-day deterministic projection for key pricing scenarios. */}
      <div className="bandCard" aria-label="Revenue impact projection">
        <p className="bandTitle">Revenue Impact (7-Day Projection)</p>

        {/* Highlight only the recommended row with subtle typography emphasis. */}
        <p className="metaLabel" style={revenue.recommended === 'maintain' ? { fontWeight: 600 } : undefined}>
          Maintain → {formatRevenue(revenue.maintain)}
        </p>
        <p className="metaLabel" style={revenue.recommended === 'plus2' ? { fontWeight: 600 } : undefined}>
          +2% → {formatRevenue(revenue.plus2)}
        </p>
        <p className="metaLabel" style={revenue.recommended === 'minus2' ? { fontWeight: 600 } : undefined}>
          -2% → {formatRevenue(revenue.minus2)}
        </p>
      </div>

      <p className="metaLabel">
        Projected market position if applied: <strong>{formatPercent(projectedPct, 2)}</strong>
      </p>
      <p className="metaLabel">
        Rate impact vs current: <strong>₹{formatCurrency(impactAbsolute)}</strong> ({formatPercent(impactPct, 2)})
      </p>
    </section>
  );
}
