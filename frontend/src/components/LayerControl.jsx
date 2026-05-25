import { motion } from 'framer-motion';

export default function LayerControl({
  collapsed = false,
  onToggleCollapse,
  layers = {},
  onToggleLayer,
}) {
  const items = [
    { key: 'demandHeat', label: 'Demand Heat' },
    { key: 'signals', label: 'Signals' },
    { key: 'events', label: 'Events' },
    { key: 'airportDemand', label: 'Airport Demand' },
    { key: 'pricePressure', label: 'Price Pressure' },
  ];

  return (
    <motion.div
      className={`radarMapLayerPanel ${collapsed ? 'is-collapsed' : ''}`}
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <div className="radarMapLayerPanelHeader">
        <strong>Map Layers</strong>
        <button type="button" className="radarMapLayerToggleButton" onClick={onToggleCollapse}>
          {collapsed ? 'Layers' : 'Hide'}
        </button>
      </div>

      {!collapsed ? (
        <div className="radarMapLayerList">
          {items.map((item) => (
            <label key={item.key} className="radarMapLayerItem">
              <input
                type="checkbox"
                checked={Boolean(layers[item.key])}
                onChange={() => onToggleLayer(item.key)}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      ) : null}
    </motion.div>
  );
}
