const STRONG_BONUS = 0.35;
const WEAK_PENALTY = 0.25;
const MIN_MULTIPLIER = 0.45;
const MAX_MULTIPLIER = 1.65;

const intersects = (tags = [], targets = []) => targets.some(target => tags.includes(target));

export function isDomainCompatible(domain = 'land', groundType = 'G') {
  return domain === 'naval' ? ['S', 'W'].includes(groundType) : !['S', 'W'].includes(groundType);
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

export function resolveBattleLines(attackerIds, defenderIds, unitConfigs, context = {}) {
  const configById = new Map((unitConfigs || []).map(unit => [unit.id, unit]));
  const attackers = (attackerIds || []).map(id => configById.get(id)).filter(Boolean);
  const defenders = (defenderIds || []).map(id => configById.get(id)).filter(Boolean);
  const laneNames = ['front', 'rear', 'flank', 'siege', 'support', 'naval'];
  const lines = Object.fromEntries(laneNames.map(name => [name, { count: 0, rawPower: 0 }]));
  for (const unit of attackers) {
    const lane = laneNames.includes(unit.lane) ? unit.lane : (unit.domain === 'naval' ? 'naval' : 'front');
    lines[lane].count += 1;
    lines[lane].rawPower += unit.combatPower || unit.attack || 1;
  }

  const counter = getCounterAdjustedArmyPower(attackerIds, unitConfigs, defenders);
  const morale = Math.max(0, Math.min(100, context.morale ?? 100));
  const supply = Math.max(0.25, Math.min(1.25, context.supply ?? 1));
  const moraleMultiplier = 0.5 + morale / 200;
  const terrainMultiplier = context.terrain === 'M' ? 0.85 : (context.terrain === 'F' ? 0.92 : 1);
  const adjustedPower = counter.adjustedPower * moraleMultiplier * supply * terrainMultiplier;
  return {
    lines,
    rawPower: counter.rawPower,
    counterAdjustedPower: counter.adjustedPower,
    counterMultiplier: counter.counterMultiplier,
    moraleMultiplier: Math.round(moraleMultiplier * 1000) / 1000,
    supplyMultiplier: supply,
    terrainMultiplier,
    adjustedPower: Math.round(adjustedPower * 100) / 100
  };
}

const BATTLE_PHASES = [
  { id: 'reconnaissance', name: '侦察接敌', weights: { flank: 0.55, support: 0.5, rear: 0.18, front: 0.1, siege: 0.05, naval: 0.3 } },
  { id: 'ranged', name: '远程交锋', weights: { rear: 1, siege: 0.6, naval: 0.65, support: 0.3, front: 0.12, flank: 0.15 } },
  { id: 'charge', name: '冲锋与反冲锋', weights: { flank: 1, front: 0.42, support: 0.18, rear: 0.08, siege: 0.03, naval: 0.35 } },
  { id: 'melee', name: '近战主战线', weights: { front: 1, flank: 0.58, support: 0.3, rear: 0.16, siege: 0.08, naval: 0.7 } },
  { id: 'siege', name: '攻坚与舰炮', weights: { siege: 1, naval: 0.9, rear: 0.2, support: 0.15, front: 0.08, flank: 0.05 } },
  { id: 'pursuit', name: '追击与撤收', weights: { flank: 0.85, naval: 0.55, front: 0.3, rear: 0.22, support: 0.2, siege: 0.04 } }
];

function battleTactic(tactics, id) {
  return (tactics || []).find(tactic => tactic.id === id) || (tactics || []).find(tactic => tactic.id === 'steady_advance') || { phaseModifiers: {} };
}

function phasePower(unitIds, opponents, unitMap, phase, tactic, army, context = {}) {
  const morale = Math.max(0, Math.min(100, army.morale ?? 100));
  const supplyPenalty = Number(context.enemySupplyPenalty) || 0;
  const supply = Math.max(0.25, Math.min(1.25, (army.supply ?? 1) - supplyPenalty));
  const contextual = (0.5 + morale / 200) * supply * (context.defenseMultiplier || 1);
  const phaseModifier = tactic.phaseModifiers?.[phase.id] || 1;
  let total = 0;
  for (const unitId of unitIds || []) {
    const unit = unitMap.get(unitId);
    if (!unit) continue;
    const lane = unit.lane || (unit.domain === 'naval' ? 'naval' : 'front');
    const laneWeight = phase.weights[lane] || 0.05;
    const matchup = opponents.length
      ? opponents.reduce((sum, opponent) => sum + getMatchupMultiplier(unit, opponent), 0) / opponents.length
      : 1;
    const naval = unit.domain === 'naval' ? (tactic.navalMultiplier || 1) : 1;
    total += (unit.combatPower || unit.attack || 1) * laneWeight * matchup * naval;
  }
  return total * contextual * phaseModifier;
}

/**
 * 军团级分阶段战斗。结果完全由编成、克制、士气、补给、阵型外部倍率与战术决定，便于回放和测试。
 */
export function resolvePhasedArmyBattle(attackerArmy, defenderArmy, unitConfigs, tactics = [], context = {}) {
  const unitMap = new Map((unitConfigs || []).map(unit => [unit.id, unit]));
  const attackers = (attackerArmy?.unitIds || []).map(id => unitMap.get(id)).filter(Boolean);
  const defenders = (defenderArmy?.unitIds || []).map(id => unitMap.get(id)).filter(Boolean);
  const attackerTactic = battleTactic(tactics, attackerArmy?.tacticId);
  const defenderTactic = battleTactic(tactics, defenderArmy?.tacticId);
  const attackerContext = {
    defenseMultiplier: context.attackerDefenseMultiplier || attackerTactic.defenseMultiplier || 1,
    enemySupplyPenalty: defenderTactic.enemySupplyPenalty || 0
  };
  const defenderContext = {
    defenseMultiplier: context.defenderDefenseMultiplier || defenderTactic.defenseMultiplier || 1,
    enemySupplyPenalty: attackerTactic.enemySupplyPenalty || 0
  };
  const phases = BATTLE_PHASES.map(phase => {
    const attackerPower = phasePower(attackerArmy?.unitIds, defenders, unitMap, phase, attackerTactic, attackerArmy || {}, attackerContext);
    const defenderPower = phasePower(defenderArmy?.unitIds, attackers, unitMap, phase, defenderTactic, defenderArmy || {}, defenderContext);
    return {
      id: phase.id,
      name: phase.name,
      attackerPower: Math.round(attackerPower * 100) / 100,
      defenderPower: Math.round(defenderPower * 100) / 100,
      advantage: attackerPower > defenderPower * 1.05 ? 'attacker' : defenderPower > attackerPower * 1.05 ? 'defender' : 'draw'
    };
  });
  const attackerScore = phases.reduce((sum, phase) => sum + phase.attackerPower, 0);
  const defenderScore = phases.reduce((sum, phase) => sum + phase.defenderPower, 0);
  const winner = attackerScore > defenderScore * 1.05 ? 'attacker' : defenderScore > attackerScore * 1.05 ? 'defender' : 'draw';
  const ratio = Math.max(attackerScore, defenderScore) / Math.max(1, Math.min(attackerScore, defenderScore));
  const attackerCount = attackers.length;
  const defenderCount = defenders.length;
  const attackerLossRate = winner === 'attacker' ? Math.min(0.35, 0.18 + 0.1 / ratio) : winner === 'defender' ? Math.min(0.75, 0.48 + ratio * 0.06) : 0.35;
  const defenderLossRate = winner === 'defender' ? Math.min(0.35, 0.18 + 0.1 / ratio) : winner === 'attacker' ? Math.min(0.75, 0.48 + ratio * 0.06) : 0.35;
  const casualtyCount = (count, rate) => count <= 0 ? 0 : Math.min(count, Math.max(1, Math.round(count * rate)));
  return {
    winner,
    attackerScore: Math.round(attackerScore * 100) / 100,
    defenderScore: Math.round(defenderScore * 100) / 100,
    phases,
    casualties: {
      attacker: casualtyCount(attackerCount, attackerLossRate),
      defender: casualtyCount(defenderCount, defenderLossRate)
    },
    tactics: { attacker: attackerTactic.id || null, defender: defenderTactic.id || null }
  };
}
