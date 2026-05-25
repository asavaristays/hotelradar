const SIGNAL_LABELS = {
  LOW_RATING: 'Low Rating',
  HIGH_REVIEW_VOLUME: 'High Review Volume',
  NO_CHATBOT: 'No Chatbot',
  OTA_PRESENT: 'OTA Present',
};

function signalClassName(signal = '') {
  const normalized = String(signal || '').trim().toLowerCase();
  if (normalized === 'low_rating') return 'leadSignalBadge leadSignalBadge-low';
  if (normalized === 'high_review_volume') return 'leadSignalBadge leadSignalBadge-review';
  if (normalized === 'no_chatbot') return 'leadSignalBadge leadSignalBadge-chatbot';
  if (normalized === 'ota_present') return 'leadSignalBadge leadSignalBadge-ota';
  return 'leadSignalBadge';
}

export default function LeadSignalsBadge({ signal }) {
  const code = String(signal || '').trim();
  if (!code) return null;

  return (
    <span className={signalClassName(code)}>
      {SIGNAL_LABELS[code] || code}
    </span>
  );
}
