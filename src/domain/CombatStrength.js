export function calculateCombatStrength(stats = {}) {
  const attack = Math.max(0, Number(stats.attack) || 0);
  const hp = Math.max(0, Number(stats.hp ?? stats.maxHp) || 0);
  const speed = Math.max(1, Number(stats.speed) || 1);
  const attackRange = Math.max(1, Number(stats.attackRange) || 1);
  const cp = Math.max(1, Number(stats.cp) || 1);
  return Math.round((hp + attack * 1.2 + (speed - 1) * 30 + (attackRange - 1) * 50) * cp * 1.3 * 100) / 100;
}

/** 在保持速度、射程和 CP 不变时，将生命/攻击缩放到目标综合强度倍率。 */
export function scaleCombatStatsToStrength(stats = {}, multiplier = 1) {
  const factor = Math.max(0, Number(multiplier) || 0);
  const maxHp = Math.max(1, Number(stats.maxHp ?? stats.hp) || 1);
  const currentHp = Math.max(0, Number(stats.hp ?? maxHp) || 0);
  const attack = Math.max(0, Number(stats.attack) || 0);
  const speed = Math.max(1, Number(stats.speed) || 1);
  const attackRange = Math.max(1, Number(stats.attackRange) || 1);
  const fixedCore = (speed - 1) * 30 + (attackRange - 1) * 50;
  const variableCore = maxHp + attack * 1.2;
  const statScale = variableCore > 0
    ? Math.max(0, (factor * (variableCore + fixedCore) - fixedCore) / variableCore)
    : factor;
  const scaledMaxHp = Math.max(1, Math.round(maxHp * statScale));
  const scaledAttack = Math.max(0, Math.round(attack * statScale));
  const hpRatio = maxHp > 0 ? currentHp / maxHp : 1;
  return {
    ...stats,
    maxHp: scaledMaxHp,
    hp: Math.max(0, Math.min(scaledMaxHp, Math.round(scaledMaxHp * hpRatio))),
    attack: scaledAttack
  };
}
