function toneFromStatus(status = '') {
  const value = String(status || '').toLowerCase();
  if (value.includes('reliable') || value.includes('fresh') || value.includes('parity') || value.includes('strong')) {
    return 'good';
  }
  if (value.includes('calibrating') || value.includes('watch') || value.includes('moderate') || value.includes('unknown')) {
    return 'watch';
  }
  return 'risk';
}

function formatTimestamp(value) {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleString();
}

export default function DataHealthPanel({ dataHealth, viewerRole, marketContext = null }) {
  if (!dataHealth) {
    return (
      <section className="panel dataHealthPanel" aria-label="Data health">
        <header className="panelHeader">
          <h2>Data Health</h2>
        </header>
        <p className="metaLabel">Data health snapshot is not available yet.</p>
      </section>
    );
  }

  const statuses = dataHealth.statuses || {};
  const knownIssues = Array.isArray(dataHealth.knownIssues) ? dataHealth.knownIssues : [];
  const resolvedRecently = Array.isArray(dataHealth.resolvedRecently) ? dataHealth.resolvedRecently : [];
  const openCount = Number(dataHealth?.issueCounts?.open || 0);
  const resolvedCount = Number(dataHealth?.issueCounts?.resolved || 0);
  const isAdmin = viewerRole === 'admin' || viewerRole === 'super_admin';
  const signalQuality = dataHealth?.signalQuality || null;

  return (
    <section className="panel dataHealthPanel" aria-label="Data health">
      <header className="panelHeader">
        <h2>Data Health</h2>
        <p className="metaLabel">
          Stay date: {marketContext?.checkinDate || 'N/A'} | Last checked: {formatTimestamp(dataHealth.lastCheckedAt)}
        </p>
      </header>

      {signalQuality?.summary && <p className="metaLabel">{signalQuality.summary}</p>}

      <div className="snapshotList dataHealthStatuses">
        <div>
          <span>Accuracy</span>
          <span className={`metricBadge metric-${toneFromStatus(statuses.accuracyStatus)}`}>
            {statuses.accuracyStatus || 'Unknown'}
          </span>
        </div>
        <div>
          <span>OTA Parity</span>
          <span className={`metricBadge metric-${toneFromStatus(statuses.otaParityStatus)}`}>
            {statuses.otaParityStatus || 'Unknown'}
          </span>
        </div>
        <div>
          <span>Freshness</span>
          <span className={`metricBadge metric-${toneFromStatus(statuses.freshnessStatus)}`}>
            {statuses.freshnessStatus || 'Unknown'}
          </span>
        </div>
        <div>
          <span>Signal Consistency</span>
          <span className={`metricBadge metric-${toneFromStatus(statuses.signalConsistency)}`}>
            {statuses.signalConsistency || 'Unknown'}
          </span>
        </div>
      </div>

      <p className="metaLabel">
        Open issues: <strong>{openCount}</strong> | Resolved issues: <strong>{resolvedCount}</strong> | Last scraped:{' '}
        <strong>{formatTimestamp(dataHealth.lastScrapedAt)}</strong>
      </p>

      <details className="collapsiblePanel" open>
        <summary>Known Issues</summary>
        {knownIssues.length ? (
          <ul className="detailList">
            {knownIssues.map((row) => (
              <li key={`${row.issueCode}-${row.updatedAt}`}>
                <strong>{row.title}</strong> ({String(row.severity || '').toUpperCase()}): {row.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="metaLabel">No open data issues detected.</p>
        )}
      </details>

      {!!resolvedRecently.length && (
        <details className="collapsiblePanel">
          <summary>Recently Resolved</summary>
          <ul className="detailList">
            {resolvedRecently.map((row) => (
              <li key={`${row.issueCode}-${row.updatedAt}`}>
                <strong>{row.title}</strong> resolved at {formatTimestamp(row.updatedAt)}
              </li>
            ))}
          </ul>
        </details>
      )}

      {!isAdmin && dataHealth.note && <p className="metaLabel">{dataHealth.note}</p>}
    </section>
  );
}
