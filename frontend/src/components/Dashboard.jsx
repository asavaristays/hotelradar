import { useEffect, useState } from 'react';
import AlertsPanel from './AlertsPanel.jsx';
import CompressionSnapshot from './CompressionSnapshot.jsx';
import CompetitiveGrid from './CompetitiveGrid.jsx';
import ConfidenceCard from './ConfidenceCard.jsx';
import DataHealthPanel from './DataHealthPanel.jsx';
import DemandScoreCard from './DemandScoreCard.jsx';
import ForwardDemandChart from './ForwardDemandChart.jsx';
import MarketPositionBar from './MarketPositionBar.jsx';
import OtaParityPanel from './OtaParityPanel.jsx';
import SignalReadinessPanel from './SignalReadinessPanel.jsx';
import SignalBreakdownChart from './SignalBreakdownChart.jsx';
import StabilityCard from './StabilityCard.jsx';
import SuggestedPricingCard from './SuggestedPricingCard.jsx';
import { formatCurrency, formatPercent } from './dashboardUtils.js';

function LoadingSkeleton() {
  return (
    <section className="dashboardLayout" aria-label="Loading dashboard">
      <div className="panel skeletonPanel">
        <div className="skeletonLine long" />
        <div className="skeletonLine medium" />
        <div className="skeletonLine short" />
      </div>
      <div className="panel skeletonPanel">
        <div className="skeletonLine long" />
        <div className="skeletonLine medium" />
        <div className="skeletonLine short" />
      </div>
      <div className="panel skeletonPanel">
        <div className="skeletonLine long" />
        <div className="skeletonLine medium" />
      </div>
    </section>
  );
}

function fallbackExplanation(dashboard) {
  const lines = [];
  const position = Number(dashboard?.marketPosition?.positionPct || 0).toFixed(2);
  lines.push(`Current market position is ${position}% versus the observed competitive average.`);

  if (dashboard?.confidence?.level) {
    lines.push(`Confidence is ${dashboard.confidence.level} based on data completeness and signal consistency.`);
  }
  if (dashboard?.marketStability?.status) {
    lines.push(`Market stability is currently ${dashboard.marketStability.status}.`);
  }

  return lines;
}

function formatTimestamp(value) {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleString();
}

function InsightsCard({ dashboard, viewerRole }) {
  const explanation = Array.isArray(dashboard.explanation) && dashboard.explanation.length
    ? dashboard.explanation
    : fallbackExplanation(dashboard);

  return (
    <section className="panel notesPanel" aria-label="Recommendation explanation">
      <header className="panelHeader">
        <h2>Narrative Summary</h2>
        <div className="metaStackSimple">
          <p className="metaLabel">Last updated {formatTimestamp(dashboard.lastUpdated)}</p>
          {(viewerRole === 'admin' || viewerRole === 'super_admin') && (
            <p className="metaLabel">
              Role: {viewerRole === 'super_admin' ? 'Super Admin' : 'Admin'} | Last scraped:{' '}
              {formatTimestamp(dashboard.lastScrapedAt)}
            </p>
          )}
        </div>
      </header>

      <ul className="detailList">
        <li>{dashboard.narrative?.summary || 'No narrative summary available.'}</li>
        <li>{dashboard.narrative?.marketStory || 'No market story available.'}</li>
        <li>{dashboard.narrative?.pricingRationale || 'No pricing rationale available.'}</li>
        <li>{dashboard.narrative?.actionGuidance || 'No action guidance available.'}</li>
      </ul>

      <details className="collapsiblePanel" open>
        <summary>Why This Recommendation</summary>
        <ul className="detailList">
          {explanation.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>

    </section>
  );
}

function actionTone(action) {
  if (action === 'increase') return 'high';
  if (action === 'reduce') return 'low';
  return 'medium';
}

function TodayActionCard({ actionSummary }) {
  const action = actionSummary?.action || 'maintain';
  const title = actionSummary?.title || 'Hold With Control';
  const message = actionSummary?.message || 'Monitor demand and keep pricing stable.';

  return (
    <section className="panel actionPanel" aria-label="Today action">
      <header className="panelHeader">
        <h2>Today&apos;s Action</h2>
        <span className={`riskBadge risk-${actionTone(action)}`}>{action.toUpperCase()}</span>
      </header>
      <p className="actionTitle">{title}</p>
      <p className="metaLabel">{message}</p>
    </section>
  );
}

function ChangeSummaryCard({ changeSummary }) {
  const summary = changeSummary?.summary || 'No prior snapshot available for comparison.';
  const scoreDelta = Number(changeSummary?.scoreDelta || 0);
  const positionDelta = Number(changeSummary?.positionDeltaPct || 0);

  return (
    <section className="panel changePanel" aria-label="Change summary">
      <header className="panelHeader">
        <h2>Change Since Last Snapshot</h2>
      </header>
      <p className="metaLabel">{summary}</p>
      <div className="snapshotList">
        <div>
          <span>Demand Score Delta</span>
          <strong>{formatPercent(scoreDelta, 2)}</strong>
        </div>
        <div>
          <span>Market Position Delta</span>
          <strong>{formatPercent(positionDelta, 2)}</strong>
        </div>
      </div>
    </section>
  );
}

function MobileSummaryStrip({ dashboard }) {
  const currentPrice = Number(dashboard?.marketPosition?.hotelPrice || 0);
  const suggestedPrice = Number(dashboard?.suggestedPricing?.base || 0);
  const deltaAmount = suggestedPrice - currentPrice;
  const deltaPct = currentPrice > 0 ? (deltaAmount / currentPrice) * 100 : 0;
  const confidenceScore = Number(dashboard?.confidence?.score || 0);
  const stayDate = dashboard?.marketContext?.checkinDate || 'N/A';

  return (
    <section className="panel mobileSummaryStrip" aria-label="Mobile summary">
      <div>
        <span className="metaLabel">Demand</span>
        <strong>{Number(dashboard.demandScore || 0).toFixed(1)} ({dashboard.demandLevel})</strong>
      </div>
      <div>
        <span className="metaLabel">Current</span>
        <strong>₹{formatCurrency(currentPrice)}</strong>
      </div>
      <div>
        <span className="metaLabel">Suggested</span>
        <strong>₹{formatCurrency(suggestedPrice)}</strong>
      </div>
      <div>
        <span className="metaLabel">Delta</span>
        <strong>{deltaAmount >= 0 ? '+' : '-'}₹{formatCurrency(Math.abs(deltaAmount))}</strong>
      </div>
      <div>
        <span className="metaLabel">Heat</span>
        <strong>{Number(dashboard.suggestedPricing?.marketHeat || 1)}/5</strong>
      </div>
      <div>
        <span className="metaLabel">Confidence</span>
        <strong>{dashboard.confidence?.level || 'Unknown'} ({confidenceScore.toFixed(0)})</strong>
      </div>
      <div>
        <span className="metaLabel">Stay Date</span>
        <strong>{stayDate}</strong>
      </div>
    </section>
  );
}

function PerformanceCard({ summary, signalQuality }) {
  const sampleSize = Number(summary?.sampleSize || 0);
  const alertPrecision = Number(summary?.alertPrecision || 0);
  const calibrationMode = signalQuality?.mode === 'calibrating' || sampleSize < 7;
  const precisionTone = alertPrecision >= 75 ? 'good' : alertPrecision >= 55 ? 'watch' : 'risk';
  const calibrationSummary =
    signalQuality?.mode === 'calibrating' && signalQuality?.summary
      ? signalQuality.summary
      : 'Model calibration in progress. Performance KPIs stabilize after at least 7 validated snapshots.';

  return (
    <section className="panel performancePanel" aria-label="Performance summary">
      <header className="panelHeader">
        <h2>Performance Summary</h2>
        <span className={`metricBadge metric-${calibrationMode ? 'pending' : precisionTone}`}>
          {calibrationMode ? 'Calibrating' : `Alert Precision ${alertPrecision.toFixed(1)}%`}
        </span>
      </header>
      {calibrationMode ? (
        <p className="metaLabel">
          {calibrationSummary} Current sample size: <strong>{sampleSize}</strong>.
        </p>
      ) : (
        <div className="snapshotList">
          <div>
            <span>Direction Accuracy</span>
            <strong>{Number(summary?.directionAccuracy || 0).toFixed(1)}%</strong>
          </div>
          <div>
            <span>Alert Precision</span>
            <strong>{alertPrecision.toFixed(1)}%</strong>
          </div>
          <div>
            <span>Position Improvement</span>
            <strong>{Number(summary?.positionImprovementPct || 0).toFixed(1)}%</strong>
          </div>
          <div>
            <span>30D Rolling Accuracy</span>
            <strong>{Number(summary?.rollingAccuracy30d || 0).toFixed(1)}%</strong>
          </div>
        </div>
      )}
    </section>
  );
}

function ExecutiveStrip({ dashboard, preview = null }) {
  const score = Number(dashboard?.demandScore || 0).toFixed(1);
  const currentPrice = Number(dashboard?.marketPosition?.hotelPrice || 0);
  const suggestedPrice = Number(dashboard?.suggestedPricing?.base || 0);
  const deltaAmount = suggestedPrice - currentPrice;
  const deltaPct = currentPrice > 0 ? (deltaAmount / currentPrice) * 100 : 0;
  const heat = Number(dashboard?.suggestedPricing?.marketHeat || 1);
  const confidenceScore = Number(dashboard?.confidence?.score || 0);
  const confidenceLabel = dashboard?.confidence?.level || 'Unknown';
  const stayDate = dashboard?.marketContext?.checkinDate || 'N/A';
  const observedAt = formatTimestamp(dashboard?.marketContext?.observedAt || dashboard?.lastScrapedAt);
  const deltaDirection = deltaAmount > 0 ? 'Increase' : deltaAmount < 0 ? 'Reduce' : 'Hold';
  const previewDate = preview?.date || null;
  const previewStatus = preview?.statusLabel || '';
  const previewRevenueDelta = Number(preview?.revenueDeltaPerRoom || 0);

  return (
    <section className="panel executiveStripPanel" aria-label="Executive decision strip">
      <div className="executiveStrip">
        <article>
          <span>Demand Score</span>
          <strong>{score}</strong>
          <small>{dashboard?.demandLevel || 'Unknown'}</small>
        </article>
        <article>
          <span>Current Price</span>
          <strong>₹{formatCurrency(currentPrice)}</strong>
          <small>Current hotel rate</small>
        </article>
        <article>
          <span>Suggested Price</span>
          <strong>₹{formatCurrency(suggestedPrice)}</strong>
          <small>Radar recommendation</small>
        </article>
        <article>
          <span>Delta</span>
          <strong>{deltaAmount >= 0 ? '+' : '-'}₹{formatCurrency(Math.abs(deltaAmount))}</strong>
          <small>
            {deltaDirection} {formatPercent(deltaPct, 1)} vs current
          </small>
        </article>
        <article>
          <span>Heat</span>
          <strong>{heat}/5</strong>
          <small>Market heat</small>
        </article>
        <article>
          <span>Confidence</span>
          <strong>{confidenceLabel} ({confidenceScore.toFixed(0)})</strong>
          <small>Recommendation confidence</small>
        </article>
      </div>
      <div className="executiveStripMeta">
        <span>Stay date: <strong>{stayDate}</strong></span>
        <span>Observed at: <strong>{observedAt}</strong></span>
        {previewDate ? (
          <span>
            Curve preview: <strong>{previewDate}</strong> | <strong>{previewStatus}</strong> | Revenue delta:{' '}
            <strong>{previewRevenueDelta >= 0 ? '+' : '-'}₹{formatCurrency(Math.abs(previewRevenueDelta))}/room</strong>
          </span>
        ) : null}
      </div>
    </section>
  );
}

function ColorLegendFooter() {
  return (
    <section className="panel legendPanel" aria-label="Color meaning legend">
      <header className="panelHeader">
        <h2>Color Meaning</h2>
      </header>
      <div className="legendGrid">
        <div>
          <span className="legendTitle">Demand</span>
          <div className="legendTokens">
            <span className="token token-demand-low">Low</span>
            <span className="token token-demand-moderate">Moderate</span>
            <span className="token token-demand-high">High</span>
            <span className="token token-demand-surge">Surge</span>
          </div>
        </div>
        <div>
          <span className="legendTitle">Risk</span>
          <div className="legendTokens">
            <span className="token token-risk-low">Low</span>
            <span className="token token-risk-medium">Medium</span>
            <span className="token token-risk-high">High</span>
          </div>
        </div>
        <div>
          <span className="legendTitle">Market Stability</span>
          <div className="legendTokens">
            <span className="token token-stable">Stable</span>
            <span className="token token-volatile">Volatile</span>
            <span className="token token-highly-volatile">Highly Volatile</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Dashboard({ dashboard, loading, error }) {
  const [curvePreview, setCurvePreview] = useState(null);

  useEffect(() => {
    setCurvePreview(null);
  }, [dashboard?.hotelId, dashboard?.lastUpdated]);

  if (loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <section className="panel">
        <p className="errorText">{error}</p>
      </section>
    );
  }

  if (!dashboard) {
    return (
      <section className="panel">
        <p className="metaLabel">Select a hotel and load dashboard intelligence.</p>
      </section>
    );
  }

  const groupedAlerts =
    Array.isArray(dashboard.alertGroups) && dashboard.alertGroups.length
      ? dashboard.alertGroups
      : Array.isArray(dashboard.alerts)
        ? dashboard.alerts
        : [];

  return (
    <section id="hotel-dashboard-panel" className="dashboardLayout" aria-label="HotelRADAR dashboard">
      <MobileSummaryStrip dashboard={dashboard} />
      <ExecutiveStrip dashboard={dashboard} preview={curvePreview} />

      <div className="row rowTop decisionRow">
        <DemandScoreCard
          demandScore={dashboard.demandScore}
          demandLevel={dashboard.demandLevel}
          confidence={dashboard.confidence}
        />
        <SuggestedPricingCard
          suggestedPricing={dashboard.suggestedPricing}
          marketPosition={dashboard.marketPosition}
          demandLevel={dashboard.demandLevel}
          revenueImpact={dashboard.revenueImpact}
        />
        <ConfidenceCard
          confidence={dashboard.confidence}
          suggestedPricing={dashboard.suggestedPricing}
          demandScore={dashboard.demandScore}
          performanceSummary={dashboard.performanceSummary}
          signalQuality={dashboard.signalQuality}
        />
      </div>

      <div className="row rowWide marketRow">
        <MarketPositionBar
          marketPosition={dashboard.marketPosition}
          suggestedBase={dashboard.suggestedPricing?.base}
        />
      </div>

      <div className="row rowWide">
        <SignalReadinessPanel
          signalQuality={dashboard.signalQuality}
          marketContext={dashboard.marketContext}
          lastScrapedAt={dashboard.lastScrapedAt}
        />
      </div>

      <div className="row rowMid signalRow">
        <details className="collapsiblePanel signalCollapse" open>
          <summary>Signal Breakdown</summary>
          <SignalBreakdownChart
            signalBreakdown={dashboard.signalBreakdown}
            preview={curvePreview}
            baseScore={Number(dashboard?.forwardCurve?.[0]?.score || dashboard?.demandScore || 50)}
          />
        </details>
        <StabilityCard
          marketStability={dashboard.marketStability}
          preview={curvePreview}
          baseDemandScore={Number(dashboard?.demandScore || 50)}
        />
      </div>

      <div className="row rowWide">
        <ForwardDemandChart
          forwardCurve={dashboard.forwardCurve}
          suggestedBase={dashboard.suggestedPricing?.base}
          onPointChange={setCurvePreview}
        />
      </div>

      <div className="row rowMid">
        <TodayActionCard actionSummary={dashboard.actionSummary} />
        <ChangeSummaryCard changeSummary={dashboard.changeSummary} />
      </div>

      <div className="row rowBottom">
        <CompetitiveGrid
          rows={dashboard.competitiveGrid}
          ownHotelName={dashboard.competitiveGrid?.[0]?.name}
          marketContext={dashboard.marketContext}
        />
        <CompressionSnapshot
          forwardCurve={dashboard.forwardCurve}
          alerts={groupedAlerts}
          compression={dashboard.compression}
        />
      </div>

      <div className="row rowWide">
        <OtaParityPanel otaParity={dashboard.otaParity} marketContext={dashboard.marketContext} />
      </div>

      <div className="row rowWide">
        <DataHealthPanel
          dataHealth={dashboard.dataHealth}
          viewerRole={dashboard.viewerRole}
          marketContext={dashboard.marketContext}
        />
      </div>

      <div className="row rowMid">
        <InsightsCard dashboard={dashboard} viewerRole={dashboard.viewerRole} />
        <AlertsPanel alerts={dashboard.alerts || []} alertGroups={dashboard.alertGroups || []} />
      </div>

      <div className="row rowWide">
        <PerformanceCard summary={dashboard.performanceSummary} signalQuality={dashboard.signalQuality} />
      </div>

      <div className="row rowWide">
        <ColorLegendFooter />
      </div>
    </section>
  );
}
