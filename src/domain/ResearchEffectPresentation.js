const RESOURCE_NAMES = {
  food: '食物', wood: '木材', stone: '石料', gold: '黄金', iron: '铁',
  copper: '铜', coal: '煤炭', science: '科技点', culture: '人文点',
  influence: '影响力', faith: '信仰', manpower: '人力',
};

const EFFECT_NAMES = {
  productionMul: '全局生产效率', researchSpeedMul: '研究速度', buildSpeedMul: '建造速度',
  sciencePointMul: '科技点获取', civicPointMul: '人文点获取',
  armyAttackMul: '军队攻击力', meleeDamageMul: '军队攻击力', armyHpMul: '军队生命值', unitHpMul: '军队生命值',
  armySpeedMul: '军队移动速度', trainingSpeedMul: '兵种训练速度', buildingHpMul: '建筑生命上限',
  populationGrowthMul: '人口增长速度', foodConsumeMul: '人口食物消耗', storageMul: '资源储存上限',
  satisfactionBonus: '满意度', armyUnitCapacityBonus: '每支军队士兵上限', attackRangeBonus: '军队攻击距离',
  healingBonus: '战后治疗量', tradeValueMul: '商业收益', civilizationYieldMul: '文明综合产出'
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
    else if (EFFECT_NAMES[key]) lines.push(`${EFFECT_NAMES[key]} ${key.endsWith('Mul') ? '×' : '+'}${formatNumber(value)}`);
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      lines.push(...formatResearchEffects(value, options));
    } else {
      lines.push(`其他正面效果：${formatNumber(value)}`);
    }
  }
  return lines;
}

export function formatResearchCostText(costs = [], resourceNames = {}) {
  const rows = (Array.isArray(costs) ? costs : []).filter(cost => Number(cost?.amount) > 0).map(cost => {
    const name = resourceNames[cost.resourceId] || RESOURCE_NAMES[cost.resourceId] || cost.resourceId;
    return `${name} ${formatNumber(cost.amount)}`;
  });
  return rows.length ? rows.join(' · ') : '无额外物资消耗';
}

export function formatResearchEffectsText(effects = {}, options = {}) {
  const lines = formatResearchEffects(effects, options);
  return lines.length ? lines.join(' · ') : '无';
}
