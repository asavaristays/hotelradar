export function SkeletonCard({ lines = 4, compact = false }) {
  return (
    <div className={`dashboardSkeletonCard ${compact ? 'is-compact' : ''}`} aria-hidden="true">
      <div className="dashboardSkeletonBadge" />
      <div className="dashboardSkeletonTitle" />
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={`skeleton-line-${index}`}
          className={`dashboardSkeletonLine dashboardSkeletonLine-${index % 3}`}
        />
      ))}
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="dashboardSkeletonChart" aria-hidden="true">
      <div className="dashboardSkeletonChartHeader">
        <div className="dashboardSkeletonBadge" />
        <div className="dashboardSkeletonTitle short" />
      </div>
      <div className="dashboardSkeletonPlot">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
