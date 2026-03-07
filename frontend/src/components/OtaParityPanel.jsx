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
  return parsed.toLocaleString();
}

export default function OtaParityPanel({ otaParity, marketContext }) {
  const rows = Array.isArray(otaParity?.rows) ? otaParity.rows : [];
  const summary = otaParity?.summary || {};
  const sourceStatus = otaParity?.sourceStatus || 'missing';
  const statusCopy =
    sourceStatus === 'scraped'
      ? 'Live OTA channel pricing captured for the current stay date.'
      : sourceStatus === 'estimated'
        ? 'Showing estimated OTA parity fallback until live channel pricing is captured.'
        : 'No live OTA pricing feed configured for the current stay date.';

  return (
    <section className="panel otaParityPanel" aria-label="OTA parity">
      <header className="panelHeader">
        <h2>OTA Parity</h2>
        <p className="metaLabel">
          Stay date: {marketContext?.checkinDate || 'N/A'} | Last scraped: {formatTimestamp(otaParity?.lastScrapedAt)}
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
                    <td>{formatPercent(row.gapPct, 2)}</td>
                    <td>
                      <span className={`parityBadge ${statusClass(row.status)}`}>{row.status}</span>
                    </td>
                    <td>{row.estimated ? 'Estimated' : 'Scraped'}</td>
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
                  <span className={`parityBadge ${statusClass(row.status)}`}>{row.status}</span>
                </div>
                <p>OTA Price: <strong>₹{formatCurrency(row.otaPrice)}</strong></p>
                <p>Gap: <strong>{formatPercent(row.gapPct, 2)}</strong></p>
                <p>Source: <strong>{row.estimated ? 'Estimated' : 'Scraped'}</strong></p>
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
