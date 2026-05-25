import { useEffect, useState } from 'react';
import AlertsPanel from './AlertsPanel.jsx';
import CompressionSnapshot from './CompressionSnapshot.jsx';
import CompetitiveGrid from './CompetitiveGrid.jsx';
import ConfidenceCard from './ConfidenceCard.jsx';
import DataHealthPanel from './DataHealthPanel.jsx';
import DemandForecast from './DemandForecast.jsx';
import DemandScoreCard from './DemandScoreCard.jsx';
import ForwardDemandChart from './ForwardDemandChart.jsx';
import MarketPositionBar from './MarketPositionBar.jsx';
import OtaParityPanel from './OtaParityPanel.jsx';
import RadarScoreCard from './RadarScoreCard.jsx';
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
  return parsed.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatStayDate(value) {
  if (!value) return 'N/A';
  const raw = String(value).trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`) : new Date(raw);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
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
  if (action === 'locked') return 'high';
  if (action === 'reduce') return 'low';
  return 'medium';
}

function TodayActionCard({ actionSummary, productLock = null }) {
  const lockEnabled = Boolean(productLock?.enabled);
  const action = lockEnabled ? 'locked' : actionSummary?.action || 'maintain';
  const title = lockEnabled ? 'Product Lock Active' : actionSummary?.title || 'Hold With Control';
  const message = lockEnabled
    ? productLock?.reason || 'Pricing actions are locked until signal quality is actionable.'
    : actionSummary?.message || 'Monitor demand and keep pricing stable.';
  const badge = lockEnabled ? 'LOCKED' : action.toUpperCase();

  return (
    <section className="panel actionPanel" aria-label="Today action">
      <header className="panelHeader">
        <h2>Today&apos;s Action</h2>
        <span className={`riskBadge risk-${actionTone(action)}`}>{badge}</span>
      </header>
      <p className="actionTitle">{title}</p>
      <p className="metaLabel">{message}</p>
      {lockEnabled ? <p className="metaLabel">{productLock?.unlockCriteria}</p> : null}
    </section>
  );
}

function ChangeSummaryCard({ changeSummary }) {
  const summary = changeSummary?.summary || 'No prior snapshot available for comparison.';
  const scoreDelta = Number(changeSummary?.scoreDelta || 0);
  const positionDelta = Number(changeSummary?.positionDeltaPct || 0);
  const scoreTone = scoreDelta > 0 ? 'up' : scoreDelta < 0 ? 'down' : 'flat';
  const positionTone = positionDelta > 0 ? 'up' : positionDelta < 0 ? 'down' : 'flat';
  const scoreLabel = scoreDelta > 0 ? 'Demand score up' : scoreDelta < 0 ? 'Demand score down' : 'Demand score steady';
  const positionLabel =
    positionDelta > 0 ? 'Market position improved' : positionDelta < 0 ? 'Market position softened' : 'Market position steady';

  return (
    <section className="panel changePanel" aria-label="Change summary">
      <header className="panelHeader">
        <h2>Change Since Last Snapshot</h2>
        <span className="metricBadge metric-info">Critical Shift</span>
      </header>
      <p className="metaLabel">{summary}</p>
      <div className="snapshotList">
        <div className={`snapshotShift snapshotShift-${scoreTone}`}>
          <span>{scoreLabel}</span>
          <strong>{formatPercent(scoreDelta, 2)}</strong>
        </div>
        <div className={`snapshotShift snapshotShift-${positionTone}`}>
          <span>{positionLabel}</span>
          <strong>{formatPercent(positionDelta, 2)}</strong>
        </div>
      </div>
    </section>
  );
}

function MobileSummaryStrip({ dashboard, signalQuality = null, productLock = null }) {
  const currentPrice = Number(dashboard?.marketPosition?.hotelPrice || 0);
  const suggestedPrice = Number(dashboard?.suggestedPricing?.base || 0);
  const deltaAmount = suggestedPrice - currentPrice;
  const deltaPct = currentPrice > 0 ? (deltaAmount / currentPrice) * 100 : 0;
  const confidenceScore = Number(dashboard?.confidence?.score || 0);
  const stayDate = formatStayDate(dashboard?.marketContext?.checkinDate);
  const sampleSize = Number(signalQuality?.sampleSize || 0);
  const mode = String(signalQuality?.mode || '').toLowerCase();
  const calibrationMode = mode === 'calibrating' || sampleSize < 7;
  const verifyMode = mode === 'verify';
  const lockEnabled = Boolean(productLock?.enabled);
  const confidenceDisplay = verifyMode
    ? 'Verify'
    : calibrationMode
      ? 'Calibrating'
      : `${dashboard.confidence?.level || 'Unknown'} (${confidenceScore.toFixed(0)})`;

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
        <strong>{lockEnabled ? 'Locked' : `₹${formatCurrency(suggestedPrice)}`}</strong>
      </div>
      <div>
        <span className="metaLabel">Delta</span>
        <strong>
          {lockEnabled ? 'Locked' : `${deltaAmount >= 0 ? '+' : '-'}₹${formatCurrency(Math.abs(deltaAmount))}`}
        </strong>
      </div>
      <div>
        <span className="metaLabel">Heat</span>
        <strong>{Number(dashboard.suggestedPricing?.marketHeat || 1)}/5</strong>
      </div>
      <div>
        <span className="metaLabel">Confidence</span>
        <strong>{confidenceDisplay}</strong>
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

function ExecutiveStrip({ dashboard, signalQuality = null, productLock = null }) {
  const score = Number(dashboard?.demandScore || 0).toFixed(1);
  const currentPrice = Number(dashboard?.marketPosition?.hotelPrice || 0);
  const suggestedPrice = Number(dashboard?.suggestedPricing?.base || 0);
  const deltaAmount = suggestedPrice - currentPrice;
  const deltaPct = currentPrice > 0 ? (deltaAmount / currentPrice) * 100 : 0;
  const heat = Number(dashboard?.suggestedPricing?.marketHeat || 1);
  const confidenceScore = Number(dashboard?.confidence?.score || 0);
  const confidenceLabel = dashboard?.confidence?.level || 'Unknown';
  const stayDate = formatStayDate(dashboard?.marketContext?.checkinDate);
  const observedAt = formatTimestamp(dashboard?.marketContext?.observedAt || dashboard?.lastScrapedAt);
  const deltaDirection = deltaAmount > 0 ? 'Increase' : deltaAmount < 0 ? 'Reduce' : 'Hold';
  const sampleSize = Number(signalQuality?.sampleSize || 0);
  const mode = String(signalQuality?.mode || '').toLowerCase();
  const calibrationMode = mode === 'calibrating' || sampleSize < 7;
  const verifyMode = mode === 'verify';
  const lockEnabled = Boolean(productLock?.enabled);
  const confidenceValue = verifyMode
    ? 'Verify'
    : calibrationMode
      ? 'Calibrating'
      : `${confidenceLabel} (${confidenceScore.toFixed(0)})`;
  const confidenceNote = verifyMode
    ? 'Signal verification required'
    : calibrationMode
      ? 'Verify before acting'
      : 'Recommendation confidence';

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
          <strong>{lockEnabled ? 'Locked' : `₹${formatCurrency(suggestedPrice)}`}</strong>
          <small>{lockEnabled ? 'Awaiting trusted signal readiness' : 'Radar recommendation'}</small>
        </article>
        <article>
          <span>Delta</span>
          <strong>{lockEnabled ? 'Locked' : `${deltaAmount >= 0 ? '+' : '-'}₹${formatCurrency(Math.abs(deltaAmount))}`}</strong>
          <small>
            {lockEnabled ? 'Unlock required for pricing action' : `${deltaDirection} ${formatPercent(deltaPct, 1)} vs current`}
          </small>
        </article>
        <article>
          <span>Heat</span>
          <strong>{heat}/5</strong>
          <small>Market heat</small>
        </article>
        <article>
          <span>Confidence</span>
          <strong>{confidenceValue}</strong>
          <small>{confidenceNote}</small>
        </article>
      </div>
      <div className="executiveStripMeta">
        <span>Stay date: <strong>{stayDate}</strong></span>
        <span>Observed at: <strong>{observedAt}</strong></span>
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

export default function Dashboard({ dashboard, loading, error, token = '', hotelId = '' }) {
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
      <RadarScoreCard
        token={token}
        hotelId={String(hotelId || dashboard?.hotelId || '').trim()}
        fallbackData={{
          marketStatus: dashboard?.demandLevel || '',
          recommendedPrice: dashboard?.suggestedPricing?.base || 0,
          positionVsMarket: dashboard?.marketPosition?.positionPct || 0,
          generatedAt: dashboard?.lastUpdated || '',
        }}
      />
      <ExecutiveStrip dashboard={dashboard} signalQuality={dashboard.signalQuality} productLock={dashboard.productLock} />
      <div className="row rowMid">
        <ChangeSummaryCard changeSummary={dashboard.changeSummary} />
        <TodayActionCard actionSummary={dashboard.actionSummary} productLock={dashboard.productLock} />
      </div>
      <DemandForecast token={token} hotelId={String(hotelId || dashboard?.hotelId || '').trim()} />
      <MobileSummaryStrip dashboard={dashboard} signalQuality={dashboard.signalQuality} productLock={dashboard.productLock} />

      {dashboard.productLock?.enabled ? (
        <section className="panel productLockBanner" aria-label="Product lock status">
          <header className="panelHeader">
            <h2>Product Lock Active</h2>
            <span className="metricBadge metric-risk">LOCKED</span>
          </header>
          <p className="metaLabel">{dashboard.productLock.reason}</p>
          <p className="metaLabel">{dashboard.productLock.unlockCriteria}</p>
        </section>
      ) : null}

      <div className="row rowTop decisionRow">
        <DemandScoreCard
          demandScore={dashboard.demandScore}
          demandLevel={dashboard.demandLevel}
          confidence={dashboard.confidence}
          signalQuality={dashboard.signalQuality}
        />
        <SuggestedPricingCard
          suggestedPricing={dashboard.suggestedPricing}
          marketPosition={dashboard.marketPosition}
          demandLevel={dashboard.demandLevel}
          revenueImpact={dashboard.revenueImpact}
          productLock={dashboard.productLock}
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
          suggestedBase={
            dashboard.productLock?.enabled
              ? dashboard.marketPosition?.hotelPrice
              : dashboard.suggestedPricing?.base
          }
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
          <summary>Signals</summary>
          <SignalBreakdownChart
            signalBreakdown={dashboard.signalBreakdown}
            preview={curvePreview}
            baseScore={Number(dashboard?.demandScore || 50)}
            showHeading={false}
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
      <details className="collapsiblePanel dashboardSecondarySection">
        <summary>Deep Dive: diagnostics, parity, alerts, and market detail</summary>

        <div className="dashboardSecondarySectionBody">
          <details className="collapsiblePanel dashboardNestedSection" open>
            <summary>Market Detail</summary>
            <div className="dashboardNestedSectionBody">
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
            </div>
          </details>

          <details className="collapsiblePanel dashboardNestedSection">
            <summary>Competitor &amp; Parity</summary>
            <div className="dashboardNestedSectionBody">
              <div className="row rowWide">
                <OtaParityPanel otaParity={dashboard.otaParity} marketContext={dashboard.marketContext} />
              </div>
            </div>
          </details>

          <details className="collapsiblePanel dashboardNestedSection">
            <summary>Alerts &amp; Signals</summary>
            <div className="dashboardNestedSectionBody">
              <div className="row rowMid">
                <InsightsCard dashboard={dashboard} viewerRole={dashboard.viewerRole} />
                <AlertsPanel alerts={dashboard.alerts || []} alertGroups={dashboard.alertGroups || []} />
              </div>
            </div>
          </details>

          <details className="collapsiblePanel dashboardNestedSection">
            <summary>Diagnostics</summary>
            <div className="dashboardNestedSectionBody">
              <div className="row rowWide">
                <DataHealthPanel
                  dataHealth={dashboard.dataHealth}
                  viewerRole={dashboard.viewerRole}
                  marketContext={dashboard.marketContext}
                />
              </div>

              <div className="row rowWide">
                <PerformanceCard summary={dashboard.performanceSummary} signalQuality={dashboard.signalQuality} />
              </div>

              <div className="row rowWide">
                <ColorLegendFooter />
              </div>
            </div>
          </details>
        </div>
      </details>
    </section>
  );
}
