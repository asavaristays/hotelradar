import { useMemo, useState } from 'react';
import { formatCurrency } from './dashboardUtils.js';

function movementNumber(value) {
  if (typeof value === 'number') return value;
  return Number(String(value || '0').replace('%', '')) || 0;
}

function sortRows(rows, sortBy, direction) {
  const factor = direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    if (sortBy === 'name') return left.name.localeCompare(right.name) * factor;
    if (sortBy === 'movement48h') return (movementNumber(left.movement48h) - movementNumber(right.movement48h)) * factor;
    return (Number(left[sortBy] || 0) - Number(right[sortBy] || 0)) * factor;
  });
}

function movementClass(movement) {
  const value = movementNumber(movement);
  if (value > 0) return 'positiveMove';
  if (value < 0) return 'negativeMove';
  return 'neutralMove';
}

export default function CompetitiveGrid({ rows = [], ownHotelName = '' }) {
  const [sortBy, setSortBy] = useState('price');
  const [direction, setDirection] = useState('desc');
  const [query, setQuery] = useState('');

  const sorted = useMemo(() => {
    const filtered = rows.filter((row) =>
      String(row.name || '')
        .toLowerCase()
        .includes(String(query || '').trim().toLowerCase()),
    );
    return sortRows(filtered, sortBy, direction);
  }, [rows, sortBy, direction, query]);

  function movementIcon(value) {
    const numeric = movementNumber(value);
    if (numeric > 0) return '▲';
    if (numeric < 0) return '▼';
    return '■';
  }

  function toggle(next) {
    if (next === sortBy) {
      setDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(next);
    setDirection('desc');
  }

  return (
    <section className="panel gridPanel" aria-label="Competitive grid">
      <header className="panelHeader">
        <h2>Competitive Grid</h2>
        <input
          type="search"
          className="gridSearch"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter hotel"
          aria-label="Filter competitive grid"
        />
      </header>

      <div className="tableWrap desktopOnly">
        <table className="gridTable">
          <thead>
            <tr>
              <th>
                <button type="button" className="sortButton" onClick={() => toggle('name')}>
                  Hotel
                </button>
              </th>
              <th>
                <button type="button" className="sortButton" onClick={() => toggle('price')}>
                  Price
                </button>
              </th>
              <th>
                <button type="button" className="sortButton" onClick={() => toggle('movement48h')}>
                  48h Movement
                </button>
              </th>
              <th>
                <button type="button" className="sortButton" onClick={() => toggle('positionPct')}>
                  Position %
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const ownHotel = row.name === ownHotelName;
              return (
                <tr key={`${row.name}-${row.price}`} className={ownHotel ? 'ownHotelRow' : ''}>
                  <td>{row.name}</td>
                  <td>₹{formatCurrency(row.price)}</td>
                  <td className={movementClass(row.movement48h)}>
                    {movementIcon(row.movement48h)} {row.movement48h}
                  </td>
                  <td>{Number(row.positionPct || 0).toFixed(2)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mobileGridCards mobileOnly">
        {sorted.map((row) => {
          const ownHotel = row.name === ownHotelName;
          return (
            <details key={`${row.name}-${row.price}`} className={`compCard ${ownHotel ? 'ownHotelRow' : ''}`}>
              <summary>
                <span>{row.name}</span>
                <strong>₹{formatCurrency(row.price)}</strong>
              </summary>
              <div className="compCardBody">
                <p>
                  48h Movement: <strong className={movementClass(row.movement48h)}>{row.movement48h}</strong>
                </p>
                <p>
                  Position: <strong>{Number(row.positionPct || 0).toFixed(2)}%</strong>
                </p>
                <p>
                  Occupancy Proxy: <strong>{Math.round(Number(row.occupancyProxy || 0))}%</strong>
                </p>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
