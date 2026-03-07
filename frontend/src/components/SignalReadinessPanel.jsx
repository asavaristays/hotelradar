function badgeTone(grade = '') {
  const value = String(grade || '').toLowerCase();
  if (value.includes('trusted')) return 'good';
  if (value.includes('review')) return 'watch';
  return 'pending';
}

function sourceLabel(status = '') {
  if (status === 'scraped') return 'Live OTA channels';
  if (status === 'estimated') return 'Estimated fallback';
  return 'Not captured';
}

function formatTimestamp(value) {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleString();
}

export default function SignalReadinessPanel({ signalQuality, marketContext, lastScrapedAt }) {
  const summary =
    signalQuality?.summary ||
    'Signal quality is not available yet. Capture competitor and OTA rows before trusting price actions.';

  return (
    <section className="panel signalReadinessPanel" aria-label="Signal readiness">
      <header className="panelHeader">
        <h2>Signal Readiness</h2>
        <span className={`metricBadge metric-${badgeTone(signalQuality?.grade)}`}>
          {signalQuality?.grade || 'Unknown'}
        </span>
      </header>

      <p className="metaLabel">{summary}</p>

      <div className="snapshotList signalSnapshotList">
        <div>
          <span>Stay date basis</span>
          <strong>{marketContext?.checkinDate || 'Not fixed yet'}</strong>
        </div>
        <div>
          <span>Competitor rows</span>
          <strong>{Number(signalQuality?.competitorRows ?? marketContext?.competitorRows ?? 0)}</strong>
        </div>
        <div>
          <span>OTA feed</span>
          <strong>{sourceLabel(signalQuality?.otaSourceStatus)}</strong>
        </div>
        <div>
          <span>Live OTA rows</span>
          <strong>{Number(signalQuality?.otaLiveRows || 0)}</strong>
        </div>
        <div>
          <span>Observed at</span>
          <strong>{formatTimestamp(marketContext?.observedAt || lastScrapedAt)}</strong>
        </div>
        <div>
          <span>Last event sync</span>
          <strong>{formatTimestamp(marketContext?.lastEventSync)}</strong>
        </div>
        <div>
          <span>Validated snapshots</span>
          <strong>{Number(signalQuality?.sampleSize || 0)}</strong>
        </div>
      </div>
    </section>
  );
}
