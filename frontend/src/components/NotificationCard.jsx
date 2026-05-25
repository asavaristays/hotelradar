import { motion } from 'framer-motion';

function priorityLabel(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'high') return 'High';
  if (text === 'medium') return 'Medium';
  return 'Low';
}

function formatTimestamp(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function NotificationCard({ notification, index = 0 }) {
  const priority = String(notification?.priority || 'low').trim().toLowerCase();

  return (
    <motion.article
      className={`notificationCard notificationCard-${priority}`}
      initial={{ opacity: 0, y: -18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, delay: Math.min(index * 0.05, 0.22), ease: 'easeOut' }}
    >
      <div className="notificationCardTop">
        <div>
          <h3>{notification?.title || 'Market notification'}</h3>
          <p className="notificationCardCity">City: {notification?.city || 'Unknown'}</p>
        </div>
        <span className={`notificationPriority notificationPriority-${priority}`}>
          {priorityLabel(priority)}
        </span>
      </div>

      <p className="notificationCardMessage">
        {notification?.message || 'No notification message available.'}
      </p>

      <div className="notificationCardFooter">
        <span>Priority: {priorityLabel(priority)}</span>
        {notification?.createdAt ? <span>{formatTimestamp(notification.createdAt)}</span> : null}
      </div>
    </motion.article>
  );
}
