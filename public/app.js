import React, { useEffect, useState } from 'https://esm.sh/react@18.3.1';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client';

function RadarDashboardApp() {
  const [hotels, setHotels] = useState([]);
  const [selectedHotelId, setSelectedHotelId] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [hotelLoadError, setHotelLoadError] = useState('');
  const [dashboardError, setDashboardError] = useState('');
  const [isHotelsLoading, setIsHotelsLoading] = useState(true);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadHotels() {
      setIsHotelsLoading(true);
      setHotelLoadError('');

      try {
        const response = await fetch('/hotels');
        if (!response.ok) {
          throw new Error('Unable to load hotel list.');
        }

        const data = await response.json();
        if (!cancelled) {
          setHotels(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        if (!cancelled) {
          setHotelLoadError(error.message || 'Unable to load hotel list.');
        }
      } finally {
        if (!cancelled) {
          setIsHotelsLoading(false);
        }
      }
    }

    loadHotels();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLoadDashboard() {
    if (!selectedHotelId) return;

    setIsDashboardLoading(true);
    setDashboardError('');

    try {
      const response = await fetch(`/hotel/${selectedHotelId}/dashboard`);
      if (!response.ok) {
        throw new Error('Unable to load dashboard.');
      }
      const data = await response.json();
      setDashboard(data);
    } catch (error) {
      setDashboard(null);
      setDashboardError(error.message || 'Unable to load dashboard.');
    } finally {
      setIsDashboardLoading(false);
    }
  }

  return React.createElement(
    'div',
    { className: 'shell' },
    React.createElement(
      'div',
      { className: 'card' },
      React.createElement('h1', null, 'Radar Light'),
      React.createElement('p', { className: 'muted' }, 'Deterministic demand intelligence for Goa and Mumbai'),
      React.createElement(
        'div',
        { className: 'controls' },
        React.createElement(
          'select',
          {
            value: selectedHotelId,
            onChange: (event) => setSelectedHotelId(event.target.value),
            disabled: isHotelsLoading || !!hotelLoadError,
          },
          React.createElement('option', { value: '' }, isHotelsLoading ? 'Loading hotels...' : 'Select Hotel'),
          hotels.map((hotel) =>
            React.createElement(
              'option',
              { key: hotel.id, value: hotel.id },
              `${hotel.hotel_name} (${hotel.city})`,
            ),
          ),
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: handleLoadDashboard,
            disabled: !selectedHotelId || isDashboardLoading || isHotelsLoading,
          },
          isDashboardLoading ? 'Loading...' : 'Load Dashboard',
        ),
      ),
      hotelLoadError && React.createElement('p', { className: 'error' }, hotelLoadError),
      dashboardError && React.createElement('p', { className: 'error' }, dashboardError),
    ),
    React.createElement(
      'div',
      { className: 'card' },
      React.createElement('h3', null, 'Dashboard'),
      !dashboard && React.createElement('p', { className: 'muted' }, 'Select a hotel and load the dashboard.'),
      dashboard &&
        React.createElement(
          React.Fragment,
          null,
          React.createElement('p', null, React.createElement('strong', null, 'Hotel: '), `${dashboard.hotel.hotel_name} (${dashboard.hotel.city})`),
          dashboard.latestDemand
            ? React.createElement(
                React.Fragment,
                null,
                React.createElement('p', null, React.createElement('strong', null, 'Demand Score: '), dashboard.latestDemand.score),
                React.createElement('p', null, React.createElement('strong', null, 'Level: '), dashboard.latestDemand.level),
                React.createElement('p', null, React.createElement('strong', null, 'Recommendation: '), dashboard.latestDemand.recommendation),
                React.createElement('p', null, React.createElement('strong', null, 'Explanation: '), dashboard.latestDemand.explanation),
              )
            : React.createElement('p', { className: 'muted' }, 'No demand score available yet.'),
          React.createElement('h4', null, 'Alerts'),
          dashboard.alerts.length
            ? React.createElement(
                'ul',
                { className: 'alerts' },
                dashboard.alerts.map((alert) =>
                  React.createElement(
                    'li',
                    { key: `${alert.created_at}-${alert.message}` },
                    `${alert.severity.toUpperCase()}: ${alert.message}`,
                  ),
                ),
              )
            : React.createElement('p', { className: 'muted' }, 'No alerts found.'),
        ),
    ),
  );
}

const root = createRoot(document.getElementById('app'));
root.render(React.createElement(RadarDashboardApp));
