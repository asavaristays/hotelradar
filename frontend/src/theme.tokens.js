export const breakpoints = {
  mobile: 480,
  tablet: 768,
  desktop: 769,
};

export const spacing = {
  base: 8,
  scale: [8, 16, 24, 32],
};

export const typography = {
  sizes: [14, 16, 20, 24, 32, 40, 56],
  primary: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

export const colors = {
  background: '#F8FAFC',
  card: '#FFFFFF',
  border: '#E2E8F0',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  demand: {
    low: '#3B82F6',
    moderate: '#14B8A6',
    high: '#F97316',
    surge: '#EF4444',
  },
  risk: {
    low: '#16A34A',
    medium: '#F59E0B',
    high: '#DC2626',
  },
  stability: {
    stable: '#16A34A',
    volatile: '#F59E0B',
    highlyVolatile: '#DC2626',
  },
  confidence: {
    low: '#F59E0B',
    medium: '#14B8A6',
    high: '#3B82F6',
    veryHigh: '#16A34A',
  },
};
