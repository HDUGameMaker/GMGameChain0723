const STRONG_BONUS = 0.35;
const WEAK_PENALTY = 0.25;
const MIN_MULTIPLIER = 0.45;
const MAX_MULTIPLIER = 1.65;

const intersects = (tags = [], targets = []) => targets.some(target => tags.includes(target));

export function isDomainCompatible(domain = 'land', groundType = 'G') {
  return domain === 'naval' ? groundType === 'W' : groundType !== 'W';
}

export function getMatchupMultiplier(attacker, defender) {
  if (!attacker || !defender) return 1;
  if ((attacker.domain || 'land') !== (defender.domain || 'land')) return 0.5;
  let multiplier = 1;
  if (intersects(defender.roleTags, attacker.strongAgainst)) multiplier += STRONG_BONUS;
  if (intersects(defender.roleTags, attacker.weakAgainst)) multiplier -= WEAK_PENALTY;
  return Math.max(MIN_MULTIPLIER, Math.min(MAX_MULTIPLIER, multiplier));
}

export function getCounterAdjustedArmyPower(unitIds, unitConfigs, opponents = [], basePowerOverride = null) {
  const configById = new Map((unitConfigs || []).map(unit => [unit.id, unit]));
  let rawPower = 0;
  let adjustedPower = 0;
  for (const unitId of unitIds || []) {
    const unit = configById.get(unitId);
    if (!unit) continue;
    const power = unit.combatPower || unit.attack || 1;
    const matchup = opponents.length
      ? opponents.reduce((sum, opponent) => sum + getMatchupMultiplier(unit, opponent), 0) / opponents.length
      : 1;
    rawPower += power;
    adjustedPower += power * matchup;
  }
  const counterMultiplier = rawPower > 0 ? adjustedPower / rawPower : 1;
  const scaledPower = basePowerOverride == null ? adjustedPower : basePowerOverride * counterMultiplier;
  return {
    rawPower: Math.round(rawPower * 100) / 100,
    adjustedPower: Math.round(scaledPower * 100) / 100,
    counterMultiplier: Math.round(counterMultiplier * 1000) / 1000
  };
}

export function describeCounter(multiplier) {
  if (multiplier >= 1.2) return '兵种克制有利';
  if (multiplier <= 0.8) return '兵种克制不利';
  return '兵种对抗均势';
}
