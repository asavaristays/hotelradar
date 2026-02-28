import { useEffect, useMemo, useState } from 'react';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import PrivacyPage from './pages/legal/Privacy.jsx';
import TermsPage from './pages/legal/Terms.jsx';
import DisclaimerPage from './pages/legal/Disclaimer.jsx';

export default function App() {
  const [session, setSession] = useState(() => {
    try {
      const raw = localStorage.getItem('radar_session');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const isLoggedIn = useMemo(() => {
    if (!session?.token || !session?.user?.exp) return false;
    return Date.now() < Number(session.user.exp);
  }, [session]);
  const [path, setPath] = useState(() => window.location.pathname || '/');

  useEffect(() => {
    function onPopState() {
      setPath(window.location.pathname || '/');
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function navigate(nextPath) {
    const safePath = String(nextPath || '/').trim() || '/';
    if (safePath === window.location.pathname) return;
    window.history.pushState({}, '', safePath);
    setPath(safePath);
  }

  function handleLogin(nextSession) {
    localStorage.setItem('radar_session', JSON.stringify(nextSession));
    setSession(nextSession);
  }

  function handleLogout() {
    localStorage.removeItem('radar_session');
    setSession(null);
  }

  if (path === '/legal/privacy') {
    return <PrivacyPage onNavigate={navigate} />;
  }
  if (path === '/legal/terms') {
    return <TermsPage onNavigate={navigate} />;
  }
  if (path === '/legal/disclaimer') {
    return <DisclaimerPage onNavigate={navigate} />;
  }

  if (!isLoggedIn) {
    return <LoginPage onLogin={handleLogin} onNavigate={navigate} />;
  }

  return <DashboardPage session={session} onLogout={handleLogout} onNavigate={navigate} />;
}
