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

function _branchName(branch) {
  const branches = configRegistry.get('enemies')?.unitBranches || [];
  const cfg = branches.find(b => b.id === branch);
  return cfg?.name || branch;
}

function _defaultUnitDomain() {
  const domains = configRegistry.get('enemies')?.unitDomains || [];
  return domains[0]?.id || 'land';
}

function _formationReqs(f) {
  return ((f && f.requiredUnits) || []).filter(r => (r.count || 0) > 0);
}

function _matchesReq(unitId, req, unitMap) {
  if (req.unitId) return unitId === req.unitId;
  const unit = unitMap[unitId];
  if (req.branch && unit?.branch !== req.branch) return false;
  if (req.domain && (unit?.domain || _defaultUnitDomain()) !== req.domain) return false;
  return true;
}

function _isModernUnit(unit) {
  if (!unit) return false;
  if (unit.id && unit.id.startsWith('modern_')) return true;
  const prereqs = unit.prerequisiteTechs || [];
  return prereqs.some(id => id.startsWith('modern_'));
}

function _calcFormationUsage(formationId, army) {
  const f = getFormation(formationId);
  const reqs = _formationReqs(f);
  if (!f) return { groups: 0, basePower: 0, hasModern: false };
  if (reqs.length === 0) return { groups: 1, basePower: 0, hasModern: false };

  const counts = getArmyUnitCounts(army);
  const units = configRegistry.get('enemies')?.units || [];
  const unitMap = {};
  units.forEach(u => { unitMap[u.id] = u; });
  const totalUnits = Object.values(counts).reduce((s, n) => s + n, 0);

  let maxGroups = totalUnits;
  for (const r of reqs) {
    const matchingCount = Object.entries(counts).reduce((sum, [unitId, count]) => {
      return sum + (_matchesReq(unitId, r, unitMap) ? count : 0);
    }, 0);
    maxGroups = Math.min(maxGroups, Math.floor(matchingCount / r.count));
  }

  for (let groups = maxGroups; groups >= 1; groups--) {
    const remaining = { ...counts };
    let basePower = 0;
    let hasModern = false;
    let ok = true;
    for (const r of reqs) {
      let need = groups * r.count;
      const unitIds = Object.keys(remaining).filter(unitId => _matchesReq(unitId, r, unitMap));
      unitIds.sort((a, b) => {
        const wa = unitMap[a]?.weight || 100;
        const wb = unitMap[b]?.weight || 100;
        return wa - wb;
      });
      for (const unitId of unitIds) {
        if (need <= 0) break;
        const take = Math.min(remaining[unitId] || 0, need);
        const unit = unitMap[unitId];
        basePower += take * (unit?.combatPower || 1);
        if (_isModernUnit(unit)) hasModern = true;
        remaining[unitId] -= take;
        need -= take;
      }
      if (need > 0) { ok = false; break; }
    }
    if (ok) return { groups, basePower, hasModern };
  }
  return { groups: 0, basePower: 0, hasModern: false };
}

/** 计算阵型已满足的完整组数：数量不足返回 0，数量翻倍则组数翻倍 */
export function calcFormationGroups(formationId, army) {
  return _calcFormationUsage(formationId, army).groups;
}

export function calcFormationBonus(formationId, army) {
  const f = getFormation(formationId);
  if (!f) return 0;
  const usage = _calcFormationUsage(formationId, army);
  if (usage.groups <= 0) return 0;
  if (typeof f.bonusRate === 'number') {
    const rate = usage.hasModern ? (f.modernBonusRate ?? f.bonusRate) : f.bonusRate;
    return Math.floor(usage.basePower * rate);
  }
  return usage.groups * (f.combatPowerBonus || 0);
}

export function getFormationBonusText(formationId, army = null) {
  const f = getFormation(formationId);
  if (!f) return '';
  if (typeof f.bonusRate === 'number') {
    if (army) {
      const usage = _calcFormationUsage(formationId, army);
      const rate = usage.hasModern ? (f.modernBonusRate ?? f.bonusRate) : f.bonusRate;
      return '+' + Math.round(rate * 100) + '%';
    }
    return '+' + Math.round((f.bonusRate || 0) * 100) + '% / 现代+' + Math.round((f.modernBonusRate ?? f.bonusRate) * 100) + '%';
  }
  return '+' + (f.combatPowerBonus || 0);
}

export function getFormationRequirementText(formationId) {
  const f = getFormation(formationId);
  const reqs = _formationReqs(f);
  if (reqs.length === 0) return '无数量需求';
  return reqs.map(r => {
    let label = '任意单位';
    if (r.unitId) label = _unitName(r.unitId);
    else if (r.branch) label = _branchName(r.branch);
    else if (r.domain === 'land') label = '陆军';
    else if (r.domain === 'naval') label = '海军';
    return label + '×' + r.count;
  }).join(' + ');
}

export function getFormationStatusText(formationId, army) {
  const f = getFormation(formationId);
  if (!f) return '';
  const groups = calcFormationGroups(formationId, army);
  if (groups <= 0) {
    return '阵型未触发（需要 ' + getFormationRequirementText(formationId) + '）';
  }
  return '阵型触发 ×' + groups + ' (+' + calcFormationBonus(formationId, army) + ' · ' + getFormationBonusText(formationId, army) + ')';
}

export function getArmyCombatPower(army, options = {}) {
  const counts = getArmyUnitCounts(army);
  const units = configRegistry.get('enemies')?.units || [];
  const unitMap = {};
  for (const u of units) unitMap[u.id] = u;

  let base = 0;
  const filteredUnitIds = [];
  for (const [unitId, n] of Object.entries(counts)) {
    const u = unitMap[unitId];
    if (options.domain && (u?.domain || 'land') !== options.domain) continue;
    const multiplier = (u?.domain === 'naval') ? (options.navalMultiplier || 1) : 1;
    base += n * (u ? (u.combatPower || 1) : 1) * multiplier;
    for (let i = 0; i < n; i++) filteredUnitIds.push(unitId);
  }
  const formationArmy = options.domain ? { ...army, unitIds: filteredUnitIds } : army;
  const formationBonus = options.includeFormation === false ? 0 : calcFormationBonus(army?.formationId, formationArmy);
  return base + formationBonus;
}
