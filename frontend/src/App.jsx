import { useEffect, useMemo, useState } from 'react';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import HotelDashboard from './pages/HotelDashboard.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import PrivacyPage from './pages/legal/Privacy.jsx';
import TermsPage from './pages/legal/Terms.jsx';
import DisclaimerPage from './pages/legal/Disclaimer.jsx';
import { SESSION_EXPIRED_EVENT } from './http.js';

export default function App() {
  const [authNotice, setAuthNotice] = useState('');
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

  useEffect(() => {
    function onSessionExpired(event) {
      const detail = event?.detail || {};
      setAuthNotice(String(detail.message || 'Session expired. Please sign in again.'));
      setSession(null);
      localStorage.removeItem('radar_session');
      window.history.pushState({}, '', '/');
      setPath('/');
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
  }, []);

  function navigate(nextPath) {
    const safePath = String(nextPath || '/').trim() || '/';
    if (safePath === window.location.pathname) return;
    window.history.pushState({}, '', safePath);
    setPath(safePath);
  }

  function handleLogin(nextSession) {
    localStorage.setItem('radar_session', JSON.stringify(nextSession));
    setAuthNotice('');
    setSession(nextSession);
  }

  function handleLogout() {
    localStorage.removeItem('radar_session');
    setAuthNotice('');
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
    return <LoginPage notice={authNotice} onLogin={handleLogin} onNavigate={navigate} />;
  }

  if (path === '/dashboard') {
    return <HotelDashboard session={session} onLogout={handleLogout} onNavigate={navigate} />;
  }

  if (path === '/admin') {
    return <AdminDashboard session={session} onLogout={handleLogout} onNavigate={navigate} />;
  }

  return <DashboardPage session={session} onLogout={handleLogout} onNavigate={navigate} />;
}
