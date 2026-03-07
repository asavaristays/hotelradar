import { clamp, riskTone } from './dashboardUtils.js';
import MarketUrgencyGrid from './MarketUrgencyGrid.jsx';

function HeatScale({ value }) {
  const safeValue = clamp(Number(value || 1), 1, 5);
  return (
    <div className="heatScaleBlock" aria-label={`Market heat ${safeValue} out of 5`}>
      <div className="heatScaleTrack">
        {[1, 2, 3, 4, 5].map((unit) => (
          <span key={unit} className={unit <= safeValue ? 'heatScaleUnit active' : 'heatScaleUnit'} />
        ))}
      </div>
      <p className="metaLabel">{safeValue} / 5</p>
    </div>
  );
}

function RiskStrip({ level }) {
  const active = level === 'High' ? 5 : level === 'Medium' ? 3 : 2;
  return (
    <div className="riskStrip" aria-label={`Risk strip ${level}`}>
      {[1, 2, 3, 4, 5].map((index) => (
        <span key={index} className={index <= active ? `riskDot riskDot-${riskTone(level)}` : 'riskDot'} />
      ))}
    </div>
  );
}

function formatForecastAccuracy(value) {
  const safe = Number(value);
  if (!Number.isFinite(safe)) return '0%';
  return `${Math.round(safe)}%`;
}

function formatVolatilityError(value) {
  const safe = Number(value);
  if (!Number.isFinite(safe)) return '±0.0%';
  return `±${safe.toFixed(1)}%`;
}

export default function ConfidenceCard({
  confidence,
  suggestedPricing,
  demandScore,
  performanceSummary = null,
  signalQuality = null,
}) {
  const riskLevel = suggestedPricing?.riskLevel || 'Low';
  const riskClass = `riskBadge risk-${riskTone(riskLevel)}`;
  const factors = Array.isArray(confidence?.factors) ? confidence.factors : [];
  const confidenceScore = Number(confidence?.score || 0);
  const forecastAccuracy60d = Number(confidence?.forecastAccuracy60d || 0);
  const volatilityError = Number(confidence?.volatilityError || 0);
  const marketHeat = Number(suggestedPricing?.marketHeat || 1);
  const sampleSize = Number(signalQuality?.sampleSize ?? performanceSummary?.sampleSize ?? 0);
  const mode = String(signalQuality?.mode || '').toLowerCase();
  const calibrationMode = mode === 'calibrating' || sampleSize < 7;
  const verifyMode = mode === 'verify';
  const suppressedConfidence = calibrationMode || verifyMode;
  const confidenceHeadline = verifyMode
    ? 'Verify before acting'
    : calibrationMode
      ? 'Calibrating - verify before acting'
    : `${confidence?.level || 'N/A'} (${confidenceScore})`;

  return (
    <section className="panel confidenceCard" aria-label="Risk heat confidence card">
      <header className="panelHeader">
        <h2>Risk, Heat & Confidence</h2>
      </header>

      <div className="metaStack">
        <div>
          <p className="metaLabel">Risk Level</p>
          <span className={riskClass}>{riskLevel}</span>
          <RiskStrip level={riskLevel} />
        </div>
        <div>
          <p className="metaLabel">Market Heat</p>
          <HeatScale value={suggestedPricing?.marketHeat} />
        </div>
      </div>

      <div className="confidenceSummary">
        <p className="metaLabel">Demand Confidence</p>
        <p className="confidenceValue">{confidenceHeadline}</p>
        {suppressedConfidence ? (
          <p className="metaLabel">
            {verifyMode
              ? 'Signal quality is below trusted threshold. Verify market inputs before rate action.'
              : `Forecast diagnostics are calibrating (${sampleSize}/7 validated snapshots).`}
          </p>
        ) : (
          <>
            <p className="metaLabel">Forecast Accuracy (60d): {formatForecastAccuracy(forecastAccuracy60d)}</p>
            <p className="metaLabel">Volatility Error Margin: {formatVolatilityError(volatilityError)}</p>
          </>
        )}
      </div>

      <ul className="compactList">
        {factors.map((factor) => (
          <li key={factor}>{factor}</li>
        ))}
      </ul>

      <MarketUrgencyGrid
        demandScore={Number(demandScore || 0)}
        marketHeat={marketHeat}
        riskLevel={riskLevel}
        confidenceScore={confidenceScore}
        calibrationMode={suppressedConfidence}
      />
    </section>
  );
}
