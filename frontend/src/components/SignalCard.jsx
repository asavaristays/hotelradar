import { motion } from 'framer-motion';

function formatSignalLabel(value) {
  return String(value || '')
    .trim()
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function impactTone(score) {
  const safeScore = Number(score || 0);
  if (safeScore > 80) return 'high';
  if (safeScore >= 60) return 'medium';
  return 'low';
}

function impactLabel(score) {
  const safeScore = Number(score || 0);
  if (safeScore > 80) return 'High';
  if (safeScore >= 60) return 'Rising';
  return 'Informational';
}

export default function SignalCard({ signal, index = 0 }) {
  const tone = impactTone(signal?.impactScore);

  return (
    <motion.article
      className={`signalCard signalCard-${tone}`}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      drag="x"
      dragDirectionLock
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.14}
      whileTap={{ cursor: 'grabbing', scale: 0.995 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.24), ease: 'easeOut' }}
    >
      <div className="signalCardTop">
        <div>
          <p className="signalCardType">{formatSignalLabel(signal?.signalType)}</p>
          <h3>{signal?.title || 'Market signal'}</h3>
        </div>
        <span className={`signalCardImpact signalCardImpact-${tone}`}>{impactLabel(signal?.impactScore)}</span>
      </div>

      <div className="signalCardMeta">
        <span>City: {signal?.city || 'Unknown'}</span>
        {signal?.createdAt ? <span>{signal.createdAt}</span> : null}
      </div>

      <p className="signalCardDescription">{signal?.description || 'No description available.'}</p>

      <div className="signalCardStats">
        <div>
          <span>Impact</span>
          <strong>{Math.round(Number(signal?.impactScore || 0))}</strong>
        </div>
        <div>
          <span>Confidence</span>
          <strong>{Math.round(Number(signal?.confidenceScore || 0))}%</strong>
        </div>
      </div>

      <div className="signalCardAction">
        <span>Recommended Action</span>
        <p>{signal?.recommendedAction || 'Review pricing and market positioning.'}</p>
      </div>
    </motion.article>
  );
}
