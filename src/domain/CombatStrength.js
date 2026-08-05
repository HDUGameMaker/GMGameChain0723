export function calculateCombatStrength(stats = {}) {
  const attack = Math.max(0, Number(stats.attack) || 0);
  const hp = Math.max(0, Number(stats.hp ?? stats.maxHp) || 0);
  const speed = Math.max(1, Number(stats.speed) || 1);
  const attackRange = Math.max(1, Number(stats.attackRange) || 1);
  const cp = Math.max(1, Number(stats.cp) || 1);
  return Math.round((hp + attack * 1.2 + (speed - 1) * 30 + (attackRange - 1) * 50) * cp * 1.3 * 100) / 100;
}
