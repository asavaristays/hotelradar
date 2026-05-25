import { motion } from 'framer-motion';

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

function formatSignalLabel(value) {
  return String(value || '')
    .trim()
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function OpportunityCard({ opportunity, index = 0 }) {
  const tone = impactTone(opportunity?.impactScore);

  return (
    <motion.article
      className={`opportunityCard opportunityCard-${tone}`}
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      drag="x"
      dragDirectionLock
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.14}
      whileTap={{ cursor: 'grabbing', scale: 0.995 }}
      transition={{ duration: 0.38, delay: Math.min(index * 0.04, 0.24), ease: 'easeOut' }}
    >
      <div className="opportunityCardTop">
        <div>
          <p className="opportunityCardType">{formatSignalLabel(opportunity?.signalType)}</p>
          <h3>{opportunity?.title || 'Revenue opportunity'}</h3>
        </div>
        <span className={`opportunityCardImpact opportunityCardImpact-${tone}`}>
          {impactLabel(opportunity?.impactScore)}
        </span>
      </div>

      <div className="opportunityCardMeta">
        <span>City: {opportunity?.city || 'Unknown'}</span>
        {opportunity?.createdAt ? <span>{opportunity.createdAt}</span> : null}
      </div>

      <p className="opportunityCardDescription">
        {opportunity?.description || 'No opportunity description available.'}
      </p>

      <div className="opportunityCardStats">
        <div>
          <span>Impact</span>
          <strong>{Math.round(Number(opportunity?.impactScore || 0))}</strong>
        </div>
        <div>
          <span>Confidence</span>
          <strong>{Math.round(Number(opportunity?.confidenceScore || 0))}%</strong>
        </div>
      </div>

      <div className="opportunityCardAction">
        <span>Recommended Action</span>
        <p>{opportunity?.recommendedAction || 'Review market opportunity and pricing response.'}</p>
      </div>
    </motion.article>
  );
}
