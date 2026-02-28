import Dashboard from './components/Dashboard.jsx';
import mock from '../docs/dashboard.mock.json' assert { type: 'json' };

export default {
  title: 'HotelRADAR/Dashboard',
  component: Dashboard,
};

export const GoaModerate = {
  render: () => <Dashboard dashboard={mock} loading={false} error="" />,
};

export const Loading = {
  render: () => <Dashboard dashboard={null} loading error="" />,
};
