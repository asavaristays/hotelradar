function demandBucket(score) {
  if (score <= 40) return 'Low';
  if (score <= 65) return 'Moderate';
  if (score <= 85) return 'High';
  return 'Surge';
}

function formatDateLabel(value) {
  if (!value) return 'N/A';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CompressionSnapshot({ forwardCurve = [], alerts = [], compression = null }) {
  const next14 = forwardCurve.slice(0, 14);
  const highCompression = next14.filter((day) => Number(day.score || 0) >= 75);
  const surgeDays = next14.filter((day) => demandBucket(Number(day.score || 0)) === 'Surge');
  const peak = next14.reduce((current, day) => {
    if (!current) return day;
    return Number(day.score || 0) > Number(current.score || 0) ? day : current;
  }, null);

  return (
    <section className="panel compressionPanel" aria-label="Compression snapshot">
      <header className="panelHeader">
        <h2>Compression Snapshot</h2>
      </header>

      <div className="snapshotList">
        <div>
          <span>Compression level</span>
          <strong>{compression?.compressionLevel || 'Moderate'}</strong>
        </div>
        <div>
          <span>Scarcity score</span>
          <strong>{Number(compression?.scarcityScore || 0).toFixed(1)}</strong>
        </div>
        <div>
          <span>High-heat days (14d)</span>
          <strong>{highCompression.length}</strong>
        </div>
        <div>
          <span>Surge-tagged days (14d)</span>
          <strong>{surgeDays.length}</strong>
        </div>
        <div>
          <span>Peak day</span>
          <strong>{peak ? `${formatDateLabel(peak.date)} (${Number(peak.score || 0).toFixed(1)})` : 'N/A'}</strong>
        </div>
        <div>
          <span>Active alerts</span>
          <strong>{alerts.length}</strong>
        </div>
      </div>
    </section>
  );
}
