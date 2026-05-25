import { useEffect, useState } from 'react';
import NotificationCard from './NotificationCard.jsx';
import { getNotifications } from '../services/intelligenceApi.js';

export default function NotificationsPanel({ token = '' }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadNotifications() {
      setLoading(true);
      setError('');

      try {
        const rows = await getNotifications(token);
        if (!active) return;
        setNotifications(rows);
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message || 'Unable to load notifications.');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadNotifications();
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <section className="notificationsPanelShell" aria-label="Notifications panel">
      <header className="notificationsPanelHeader">
        <div className="gridMetaBlock">
          <h2>Notifications</h2>
          <p className="metaLabel">Important market alerts and opportunity signals from the intelligence engine.</p>
        </div>
      </header>

      {loading ? <p className="metaLabel">Loading notifications…</p> : null}
      {!loading && error ? <p className="errorText">{error}</p> : null}
      {!loading && !error && !notifications.length ? (
        <p className="metaLabel">No active notifications right now.</p>
      ) : null}

      {!loading && !error && notifications.length ? (
        <div className="notificationsPanelList">
          {notifications.map((notification, index) => (
            <NotificationCard
              key={`${notification.id}-${notification.createdAt || index}`}
              notification={notification}
              index={index}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
