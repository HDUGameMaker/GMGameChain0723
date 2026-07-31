/**
 * FormationUtils - 阵型触发检测与战斗力计算
 * requiredUnits 定义每组需要的兵种数量；完整组数不足不加成，组数翻倍则加成翻倍。
 */
import { configRegistry } from '../core/ConfigRegistry.js';

export function getFormations() {
  return configRegistry.get('enemies')?.formations || [];
}

export function getFormation(formationId) {
  return getFormations().find(f => f.id === formationId) || null;
}

export function getArmyUnitCounts(army) {
  const counts = {};
  for (const id of (army && army.unitIds) || []) {
    counts[id] = (counts[id] || 0) + 1;
  }
  return counts;
}

function _unitName(unitId) {
  const units = configRegistry.get('enemies')?.units || [];
  const u = units.find(x => x.id === unitId);
  return u ? u.name : unitId;
}

function _formationReqs(f) {
  return ((f && f.requiredUnits) || []).filter(r => (r.count || 0) > 0);
}

/** 计算阵型已满足的完整组数：数量不足返回 0，数量翻倍则组数翻倍 */
export function calcFormationGroups(formationId, army) {
  const f = getFormation(formationId);
  const reqs = _formationReqs(f);
  if (reqs.length === 0) return f ? 1 : 0;

  const counts = getArmyUnitCounts(army);
  const totalUnits = Object.values(counts).reduce((s, n) => s + n, 0);
  const specific = reqs.filter(r => r.unitId);
  const emptyCount = reqs.filter(r => !r.unitId).reduce((s, r) => s + r.count, 0);

  let maxGroups = totalUnits;
  for (const r of specific) {
    maxGroups = Math.min(maxGroups, Math.floor((counts[r.unitId] || 0) / r.count));
  }
  if (emptyCount > 0) {
    maxGroups = Math.min(maxGroups, Math.floor(totalUnits / emptyCount));
  }

  for (let groups = maxGroups; groups >= 1; groups--) {
    let specificConsumed = 0;
    let ok = true;
    for (const r of specific) {
      if ((counts[r.unitId] || 0) < groups * r.count) { ok = false; break; }
      specificConsumed += groups * r.count;
    }
    if (!ok) continue;
    if (totalUnits - specificConsumed >= groups * emptyCount) return groups;
  }
  return 0;
}

export function calcFormationBonus(formationId, army) {
  const f = getFormation(formationId);
  if (!f) return 0;
  return calcFormationGroups(formationId, army) * (f.combatPowerBonus || 0);
}

export function getFormationRequirementText(formationId) {
  const f = getFormation(formationId);
  const reqs = _formationReqs(f);
  if (reqs.length === 0) return '无数量需求';
  return reqs.map(r => (r.unitId ? _unitName(r.unitId) : '任意单位') + '×' + r.count).join(' + ');
}

export function getFormationStatusText(formationId, army) {
  const f = getFormation(formationId);
  if (!f) return '';
  const groups = calcFormationGroups(formationId, army);
  if (groups <= 0) {
    return '阵型未触发（需要 ' + getFormationRequirementText(formationId) + '）';
  }
  return '阵型触发 ×' + groups + ' (+' + (groups * (f.combatPowerBonus || 0)) + ')';
}

export function getArmyCombatPower(army) {
  const counts = getArmyUnitCounts(army);
  const units = configRegistry.get('enemies')?.units || [];
  const unitMap = {};
  for (const u of units) unitMap[u.id] = u;

  let base = 0;
  for (const [unitId, n] of Object.entries(counts)) {
    const u = unitMap[unitId];
    base += n * (u ? (u.combatPower || 1) : 1);
  }
  return base + calcFormationBonus(army?.formationId, army);
}
