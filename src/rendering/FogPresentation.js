const NIGHT_PERIODS = new Set(['night', 'midnight']);

export function getStrategicFogStyle(state, period = 'morning') {
  if (state === 'visible') return null;
  const night = NIGHT_PERIODS.has(period);
  const alpha = state === 'remembered'
    ? (night ? 0.34 : 0.22)
    : (night ? 0.70 : 0.56);
  return {
    alpha,
    color: night ? [4, 6, 16] : [10, 14, 26]
  };
}
