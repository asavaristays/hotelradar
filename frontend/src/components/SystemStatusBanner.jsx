function formatDateTime(value) {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SystemStatusBanner({ status = null }) {
  if (!status?.systemMessage) return null;

  const tone = String(status.scrapeStatus || 'pending').trim().toLowerCase();

  return (
    <section className={`panel systemStatusBanner systemStatusBanner-${tone}`} aria-label="System scrape status">
      <div className="systemStatusBannerBody">
        <strong>System message</strong>
        <p>{status.systemMessage}</p>
      </div>
      <div className="systemStatusBannerMeta">
        <span>Last hotel scrape: {formatDateTime(status.lastHotelScrapeAt)}</span>
        <span>Last signal refresh: {formatDateTime(status.lastSignalRefreshAt)}</span>
      </div>
    </section>
  );
}
