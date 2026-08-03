import { hashSeedParts } from '../core/RandomService.js';

const STRONG_BONUS = 0.35;
const WEAK_PENALTY = 0.25;
const MIN_MULTIPLIER = 0.45;
const MAX_MULTIPLIER = 1.65;

const intersects = (tags = [], targets = []) => targets.some(target => tags.includes(target));
const round = (value, digits = 2) => Number(value.toFixed(digits));
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function isDomainCompatible(domain = 'land', groundType = 'G') {
  return domain === 'naval' ? ['S', 'W'].includes(groundType) : !['S', 'W'].includes(groundType);
}

export function getMatchupMultiplier(attacker, defender) {
  if (!attacker || !defender) return 1;
  if ((attacker.domain || 'land') !== (defender.domain || 'land')) return 0.5;
  let multiplier = 1;
  if (intersects(defender.roleTags, attacker.strongAgainst)) multiplier += STRONG_BONUS;
  if (intersects(defender.roleTags, attacker.weakAgainst)) multiplier -= WEAK_PENALTY;
  return clamp(multiplier, MIN_MULTIPLIER, MAX_MULTIPLIER);
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
  return { rawPower: round(rawPower), adjustedPower: round(scaledPower), counterMultiplier: round(counterMultiplier, 3) };
}

export function describeCounter(multiplier) {
  if (multiplier >= 1.2) return '兵种克制有利';
  if (multiplier <= 0.8) return '兵种克制不利';
  return '兵种对抗均势';
}

export function resolveBattleLines(attackerIds, defenderIds, unitConfigs, context = {}) {
  const unitMap = new Map((unitConfigs || []).map(unit => [unit.id, unit]));
  const attackers = (attackerIds || []).map(id => unitMap.get(id)).filter(Boolean);
  const laneNames = ['front', 'rear', 'flank', 'siege', 'support', 'naval'];
  const lines = Object.fromEntries(laneNames.map(name => [name, { count: 0, rawPower: 0 }]));
  for (const unit of attackers) {
    const lane = laneNames.includes(unit.lane) ? unit.lane : (unit.domain === 'naval' ? 'naval' : 'front');
    lines[lane].count += 1;
    lines[lane].rawPower += unit.combatPower || unit.attack || 1;
  }
  const counter = getCounterAdjustedArmyPower(attackerIds, unitConfigs, (defenderIds || []).map(id => unitMap.get(id)).filter(Boolean));
  const moraleMultiplier = 0.5 + clamp(context.morale ?? 100, 0, 100) / 200;
  const supplyMultiplier = clamp(context.supply ?? 1, 0.25, 1.25);
  const terrainMultiplier = ['M', 'F'].includes(context.terrain) ? (context.terrain === 'M' ? 0.85 : 0.92) : 1;
  return {
    lines,
    rawPower: counter.rawPower,
    counterAdjustedPower: counter.adjustedPower,
    counterMultiplier: counter.counterMultiplier,
    moraleMultiplier: round(moraleMultiplier, 3),
    supplyMultiplier,
    terrainMultiplier,
    adjustedPower: round(counter.adjustedPower * moraleMultiplier * supplyMultiplier * terrainMultiplier)
  };
}

function tacticMultiplier(tactics, tacticId) {
  const tactic = (tactics || []).find(item => item.id === tacticId);
  if (!tactic) return { id: tacticId || null, multiplier: 1 };
  const values = Object.values(tactic.phaseModifiers || {}).filter(Number.isFinite);
  const phaseAverage = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 1;
  const multiplier = phaseAverage * (tactic.attackMultiplier || 1) * Math.sqrt(tactic.navalMultiplier || 1);
  return { id: tactic.id, multiplier: clamp(multiplier, 0.8, 1.25) };
}

function terrainMultipliers(terrain) {
  if (terrain === 'F') return { attacker: 0.94, defender: 1.06, label: '森林地形' };
  if (terrain === 'M' || terrain === 'B') return { attacker: 0.88, defender: 1.12, label: '山地地形' };
  if (terrain === 'D') return { attacker: 0.97, defender: 1.02, label: '荒地地形' };
  if (terrain === 'S' || terrain === 'W') return { attacker: 1, defender: 1.04, label: '水域地形' };
  return { attacker: 1, defender: 1, label: '开阔地形' };
}

function calculateSide(army, opponents, unitConfigs, tactics, context, side) {
  const unitMap = new Map((unitConfigs || []).map(unit => [unit.id, unit]));
  const opponentUnits = (opponents.unitIds || []).map(id => unitMap.get(id)).filter(Boolean);
  const counter = getCounterAdjustedArmyPower(army.unitIds, unitConfigs, opponentUnits);
  const morale = clamp(army.morale ?? 100, 0, 100);
  const supply = clamp(army.supply ?? 1, 0.25, 1.25);
  const moraleMultiplier = 0.5 + morale / 200;
  const tactic = tacticMultiplier(tactics, army.tacticId);
  const terrain = terrainMultipliers(context.terrain);
  const terrainMultiplier = terrain[side];
  const heroMultiplier = clamp(context[`${side}HeroMultiplier`] || 1, 0.75, 1.5);
  const fortificationMultiplier = clamp(context[`${side}DefenseMultiplier`] || 1, 0.75, 2);
  const power = counter.adjustedPower * moraleMultiplier * supply * tactic.multiplier
    * terrainMultiplier * heroMultiplier * fortificationMultiplier;
  return {
    power: round(power),
    count: army.unitIds?.length || 0,
    modifiers: [
      { side, id: 'counter', label: describeCounter(counter.counterMultiplier), multiplier: counter.counterMultiplier },
      { side, id: 'morale', label: `士气 ${Math.round(morale)}`, multiplier: round(moraleMultiplier, 3) },
      { side, id: 'supply', label: `补给 ${Math.round(supply * 100)}%`, multiplier: round(supply, 3) },
      { side, id: 'tactic', label: tactic.id ? `战术 ${tactic.id}` : '标准战术', multiplier: round(tactic.multiplier, 3) },
      { side, id: 'terrain', label: terrain.label, multiplier: terrainMultiplier },
      ...(heroMultiplier !== 1 ? [{ side, id: 'hero', label: '英雄指挥', multiplier: heroMultiplier }] : []),
      ...(fortificationMultiplier !== 1 ? [{ side, id: 'fortification', label: '防御工事', multiplier: fortificationMultiplier }] : [])
    ]
  };
}

function casualtyRange(ownCount, ownPower, enemyPower) {
  if (ownCount <= 0) return [0, 0];
  const disadvantage = enemyPower / Math.max(1, ownPower + enemyPower);
  const minimum = Math.min(ownCount, Math.max(0, Math.floor(ownCount * (0.12 + disadvantage * 0.2))));
  const maximum = Math.min(ownCount, Math.max(minimum, Math.ceil(ownCount * (0.24 + disadvantage * 0.35))));
  return [minimum, maximum];
}

export function previewStrategicBattle(attackerArmy, defenderArmy, unitConfigs, tactics = [], context = {}) {
  const attacker = calculateSide(attackerArmy || {}, defenderArmy || {}, unitConfigs, tactics, context, 'attacker');
  const defender = calculateSide(defenderArmy || {}, attackerArmy || {}, unitConfigs, tactics, context, 'defender');
  const ratio = attacker.power / Math.max(1, defender.power);
  return {
    attackerPower: attacker.power,
    defenderPower: defender.power,
    outlook: ratio > 1.15 ? 'attacker_advantage' : ratio < 1 / 1.15 ? 'defender_advantage' : 'even',
    casualtyRanges: {
      attacker: casualtyRange(attacker.count, attacker.power, defender.power),
      defender: casualtyRange(defender.count, defender.power, attacker.power)
    },
    retreatRisk: {
      attacker: round(clamp((50 - (attackerArmy?.morale ?? 100)) / 100 + (1 - (attackerArmy?.supply ?? 1)) * 0.4, 0, 0.9), 3),
      defender: round(clamp((50 - (defenderArmy?.morale ?? 100)) / 100 + (1 - (defenderArmy?.supply ?? 1)) * 0.4, 0, 0.9), 3)
    },
    modifiers: [...attacker.modifiers, ...defender.modifiers]
  };
}

function deterministicVariance(campaignSeed, battleId, side) {
  const hash = hashSeedParts([String(campaignSeed || 'campaign_default'), String(battleId), side]);
  return 0.94 + (hash / 0xffffffff) * 0.12;
}

function chooseDecisiveReason(preview, winner) {
  const side = winner === 'defender' ? 'defender' : 'attacker';
  const ranked = preview.modifiers
    .filter(item => item.side === side)
    .sort((left, right) => Math.abs(right.multiplier - 1) - Math.abs(left.multiplier - 1));
  const strongest = ranked[0];
  if (!strongest || Math.abs(strongest.multiplier - 1) < 0.03) return '基础战力与兵力规模决定了结果';
  if (strongest.id === 'counter') return `${strongest.label}成为决定性因素`;
  return `${strongest.label}带来的战力修正成为决定性因素`;
}

export function resolveStrategicBattle(attackerArmy, defenderArmy, unitConfigs, tactics = [], context = {}) {
  if (!context.battleId) throw new TypeError('battle_id_required');
  const preview = previewStrategicBattle(attackerArmy, defenderArmy, unitConfigs, tactics, context);
  const attackerScore = preview.attackerPower * deterministicVariance(context.campaignSeed, context.battleId, 'attacker');
  const defenderScore = preview.defenderPower * deterministicVariance(context.campaignSeed, context.battleId, 'defender');
  const winner = attackerScore > defenderScore * 1.05 ? 'attacker' : defenderScore > attackerScore * 1.05 ? 'defender' : 'draw';
  const selectCasualties = (range, side) => {
    const [minimum, maximum] = range;
    const roll = deterministicVariance(context.campaignSeed, context.battleId, `casualties.${side}`);
    return Math.min(maximum, minimum + Math.floor(((roll - 0.94) / 0.12) * (maximum - minimum + 1)));
  };
  const casualties = {
    attacker: selectCasualties(preview.casualtyRanges.attacker, 'attacker'),
    defender: selectCasualties(preview.casualtyRanges.defender, 'defender')
  };
  const moraleDelta = winner === 'attacker'
    ? { attacker: 4, defender: -20 }
    : winner === 'defender' ? { attacker: -20, defender: 4 } : { attacker: -10, defender: -10 };
  const retreat = {
    attacker: winner === 'defender' && (attackerArmy?.morale ?? 100) + moraleDelta.attacker < 25,
    defender: winner === 'attacker' && (defenderArmy?.morale ?? 100) + moraleDelta.defender < 25
  };
  return {
    winner,
    finalPower: { attacker: round(attackerScore), defender: round(defenderScore) },
    casualties,
    moraleDelta,
    supplyDelta: { attacker: -0.15, defender: -0.15 },
    retreat,
    modifiers: preview.modifiers,
    report: {
      decisiveReason: chooseDecisiveReason(preview, winner),
      summary: `${winner === 'attacker' ? '进攻方获胜' : winner === 'defender' ? '防守方获胜' : '双方战平'}；进攻方损失 ${casualties.attacker}，防守方损失 ${casualties.defender}`
    }
  };
}
