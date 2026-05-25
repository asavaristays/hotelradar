import { motion } from 'framer-motion';

function deltaTone(delta = 0) {
  if (delta > 0) return 'good';
  if (delta < 0) return 'risk';
  return 'pending';
}

function formatDelta(delta = 0) {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

export default function MetricCard({ label, value, index = 0, delta = null }) {
  return (
    <motion.article
      className="adminMetricCard"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.05, 0.2), ease: 'easeOut' }}
    >
      <span className="adminMetricLabel">{label}</span>
      <strong>{value}</strong>
      {delta ? (
        <span className={`metricBadge metric-${deltaTone(delta.delta)}`}>
          {formatDelta(delta.delta)} vs yesterday
        </span>
      ) : null}
    </motion.article>
  );
}
