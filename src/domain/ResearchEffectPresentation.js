const RESOURCE_NAMES = {
  food: '食物', wood: '木材', stone: '石料', gold: '黄金', iron: '铁',
  copper: '铜', coal: '煤炭', science: '科技点', culture: '人文点',
  influence: '影响力', faith: '信仰', manpower: '人力',
};

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? String(Number(value)) : String(value ?? '');
}

function formatResourceMultipliers(value, resourceNames) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).map(([resourceId, multiplier]) => {
    const name = resourceNames?.[resourceId] || RESOURCE_NAMES[resourceId] || resourceId;
    return `${name}产出 ×${formatNumber(multiplier)}`;
  });
}

/** 将科技/文化节点的运行时效果转成玩家可读的中文。 */
export function formatResearchEffects(effects = {}, options = {}) {
  if (!effects || typeof effects !== 'object') return [];
  const lines = [];
  for (const [key, value] of Object.entries(effects)) {
    if (key === 'productionMul') lines.push(`全局生产效率 ×${formatNumber(value)}`);
    else if (key === 'resourceProductionMul') lines.push(...formatResourceMultipliers(value, options.resourceNames));
    else if (key === 'armyUnitCapacityBonus') lines.push(`每支军队士兵上限 +${formatNumber(value)}`);
    else if (key === 'diplomacyMul') lines.push(`外交收益 ×${formatNumber(value)}`);
    else if (key === 'satisfactionBonus') lines.push(`满意度 +${formatNumber(value)}`);
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      lines.push(...formatResearchEffects(value, options));
    } else {
      lines.push(`特殊效果：${formatNumber(value)}`);
    }
  }
  return lines;
}

export function formatResearchEffectsText(effects = {}, options = {}) {
  const lines = formatResearchEffects(effects, options);
  return lines.length ? lines.join(' · ') : '无';
}
