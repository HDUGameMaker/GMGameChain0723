export const BUILDING_CATEGORIES = Object.freeze({
  housing: '住宅',
  agriculture: '农业',
  gathering: '采集',
  industry: '工业',
  commerce: '商业',
  research: '科研',
  civic: '人文',
  military: '军事',
  defense: '防御',
  naval: '海军',
  administration: '行政'
});

const ERA_NAMES = Object.freeze({
  primitive: '原始时代',
  ancient: '古典时代',
  classical: '古典时代',
  medieval: '中世纪',
  exploration: '大航海时代',
  early_modern: '近世时代',
  industrial: '工业时代',
  modern: '现代'
});

function formatUniqueFunction(key, value) {
  const names = {
    routeCapacity: '贸易路线容量',
    conversionCapacity: '本地加工容量',
    goldPerWorker: '每名工人黄金产出',
    commandCapacity: '军团指挥容量',
    heroCapacity: '英雄容量'
  };
  if (value && typeof value === 'object') return `${names[key] || key}：已启用`;
  return `${names[key] || key} +${value}`;
}

export function getBuildingPresentation(config = {}, unlockRows = []) {
  const effectRows = [];
  if (Number.isFinite(config.storageMultiplier)) {
    effectRows.push(`资源存储上限 ×${config.storageMultiplier}`);
  }
  if (Number(config.housingCapacity) > 0) effectRows.push(`人口容量 +${config.housingCapacity}`);
  if (Number(config.soldierCapacity) > 0) effectRows.push(`士兵容量 +${config.soldierCapacity}`);
  if (Number(config.territoryRadius) > 0) effectRows.push(`领土半径 +${config.territoryRadius}`);
  for (const [key, value] of Object.entries(config.uniqueFunction || {})) {
    effectRows.push(formatUniqueFunction(key, value));
  }
  if (effectRows.length === 0 && !config.production) effectRows.push('提供基础城市功能');

  return {
    categoryId: config.category || 'administration',
    categoryName: BUILDING_CATEGORIES[config.category] || BUILDING_CATEGORIES.administration,
    eraName: config.eraName || ERA_NAMES[config.eraId] || config.eraId || ERA_NAMES.primitive,
    staffingText: Number(config.maxWorkers) > 0 ? `岗位上限 ${config.maxWorkers}` : '无需人口',
    effectRows,
    inputRows: config.production?.input || [],
    outputRows: config.production?.output || [],
    unlockRows: Array.isArray(unlockRows) ? unlockRows : []
  };
}
