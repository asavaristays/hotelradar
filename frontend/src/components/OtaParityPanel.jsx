import { formatCurrency, formatPercent } from './dashboardUtils.js';

function statusClass(status) {
  if (status === 'In Parity') return 'parity-ok';
  if (status === 'Overpriced vs OTA') return 'parity-over';
  return 'parity-under';
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

function formatGap(gapPct, estimated = false) {
  const numeric = Number(gapPct || 0);
  if (!estimated) return formatPercent(numeric, 2);
  const absValue = Math.abs(numeric).toFixed(1);
  const sign = numeric > 0 ? '+' : numeric < 0 ? '-' : '';
  return `~${sign}${absValue}% (estimated +/-5%)`;
}

function sourceBadgeTone(estimated = false) {
  return estimated ? 'watch' : 'good';
}

function sourceLabel(estimated = false) {
  return estimated ? 'Estimated' : 'Live OTA';
}

function softenedStatus(row = {}) {
  if (!row?.estimated) return row?.status || 'Unknown';
  if (row.status === 'Overpriced vs OTA') return 'Likely overpriced (estimated)';
  if (row.status === 'Underpriced vs OTA') return 'Likely underpriced (estimated)';
  return 'Likely in parity (estimated)';
}

export default function OtaParityPanel({ otaParity, marketContext }) {
  const rows = Array.isArray(otaParity?.rows) ? otaParity.rows : [];
  const summary = otaParity?.summary || {};
  const sourceStatus = otaParity?.sourceStatus || 'missing';
  const liveRows = rows.filter((row) => !row.estimated).length;
  const statusCopy =
    sourceStatus === 'scraped'
      ? `Live OTA channel pricing captured for the current stay date (${liveRows} row${liveRows === 1 ? '' : 's'}).`
      : sourceStatus === 'estimated'
        ? 'Estimated OTA fallback is active. Prices are market-derived proxies until live OTA channel rows are captured for this stay date.'
        : 'No OTA channel pricing has been captured for the current stay date yet.';

  return (
    <section className="panel otaParityPanel" aria-label="OTA parity">
      <header className="panelHeader">
        <h2>OTA Parity</h2>
        <p className="metaLabel">
          Stay date: {formatStayDate(marketContext?.checkinDate)} | Last scraped: {formatTimestamp(otaParity?.lastScrapedAt)}
        </p>
      </header>

      <p className="metaLabel">{statusCopy}</p>

      {!rows.length ? (
        <p className="metaLabel">No OTA channel rows are available yet.</p>
      ) : (
        <>
          <div className="tableWrap desktopOnly">
            <table className="gridTable">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>OTA Price</th>
                  <th>Gap %</th>
                  <th>Status</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.channel}>
                    <td>{row.channel}</td>
                    <td>₹{formatCurrency(row.otaPrice)}</td>
                    <td>{formatGap(row.gapPct, row.estimated)}</td>
                    <td>
                      <span className={`parityBadge ${statusClass(row.status)}`}>{softenedStatus(row)}</span>
                    </td>
                    <td>
                      <span className={`metricBadge metric-${sourceBadgeTone(row.estimated)} otaTrustBadge`}>
                        {sourceLabel(row.estimated)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobileGridCards mobileOnly">
            {rows.map((row) => (
              <article key={row.channel} className="compCard">
                <div className="parityCardHeader">
                  <strong>{row.channel}</strong>
                  <span className={`parityBadge ${statusClass(row.status)}`}>{softenedStatus(row)}</span>
                </div>
                <p>OTA Price: <strong>₹{formatCurrency(row.otaPrice)}</strong></p>
                <p>Gap: <strong>{formatGap(row.gapPct, row.estimated)}</strong></p>
                <p>
                  Source:{' '}
                  <strong>
                    <span className={`metricBadge metric-${sourceBadgeTone(row.estimated)} otaTrustBadge`}>
                      {sourceLabel(row.estimated)}
                    </span>
                  </strong>
                </p>
              </article>
            ))}
          </div>

          <div className="otaSummaryRow">
            <span className="metaLabel">In parity: <strong>{Number(summary.inParity || 0)}</strong></span>
            <span className="metaLabel">Underpriced: <strong>{Number(summary.underpriced || 0)}</strong></span>
            <span className="metaLabel">Overpriced: <strong>{Number(summary.overpriced || 0)}</strong></span>
            <span className="metaLabel">Max gap: <strong>{formatPercent(summary.maxAbsGapPct || 0, 2)}</strong></span>
          </div>
        </>
      )}
    </section>
  );
}
