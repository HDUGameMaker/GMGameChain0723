export const BUILDING_CATEGORIES = Object.freeze({
  housing: '住宅',
  agriculture: '农业',
  gathering: '采集',
  basic_industry: '基础工业',
  industry: '工业',
  commerce: '商业',
  research: '科研',
  civic: '人文',
  military: '军事',
  defense: '防御',
  administration: '行政'
});

const ERA_NAMES = Object.freeze({
  primitive: '原始时代',
  classical: '古典时代',
  medieval: '中世纪',
  exploration: '大航海时代',
  industrial: '工业时代',
  modern: '现代'
});

export function formatBuildingEffect(key, value) {
  const names = {
    administrationMul: '行政效率', amount: '基础产量', armyAssemblyDomains: '可集结军团领域', armyCapacityBonus: '军团容量', armyPowerMul: '军团战力',
    blocksEnemyMovement: '阻挡敌军移动', buildSpeedMul: '建造速度', civicPerWorker: '每名工人人文产出', civicPointMul: '人文点数',
    civilizationId: '所属文明', civilizationYieldMul: '文明特色产出', defensePower: '防御力', expeditionAccess: '组织探险',
    foodStorageMul: '食物储存', garrisonCapacity: '驻军容量', garrisonDefenseMul: '驻军防御', garrisonMoraleRecovery: '每日驻军士气恢复', garrisonSupplyRecovery: '每日驻军补给恢复',
    goldPerWorker: '每名工人黄金产出', heroOfferBonus: '英雄候选数量', housingCapacity: '人口容量', luxuryYieldBonus: '奢侈品产量', meleePowerMul: '军队攻击力（旧配置）', armyAttackMul: '军队攻击力', armyHpMul: '军队生命值', eraMaterialProcessing: '时代材料加工',
    navalPowerMul: '海军战力', navalSpeedMul: '海军移动速度', navalSupply: '海军补给', navalVisionRadius: '海上视野半径',
    productionMul: '生产效率', relationGainBonus: '外交关系收益', repairMul: '维修效率', replaces: '替代建筑',
    researchSpeedMul: '研究速度', resourceId: '资源类型', resourceProductionMul: '资源产出', routeCapacity: '贸易路线容量', routeCapacityBonus: '贸易路线容量', satisfactionBonus: '满意度',
    sciencePerWorker: '每名工人科研产出', sciencePointMul: '科研点数', siegePowerMul: '攻城战力', soldierCapacity: '士兵容量', spoilageMul: '食物腐坏',
    storageMultiplier: '资源储存', strategyCooldownMul: '策略冷却', territoryUpkeepMul: '领土维护费', tradeValueMul: '贸易价值', trainingSpeedMul: '训练速度',
    trainsBranches: '可训练兵种', transportCapacity: '运输容量', unlockEliteUnits: '解锁精锐单位', unlockSystem: '解锁系统', visionRadius: '视野半径', workerRecruitment: '工人招募'
  };
  const supplementalNames = {
    armyCapBonus: '军团数量上限',
    buildSpeedMultiplier: '建造速度',
    defenseMultiplier: '防御强度',
    tradeValueMultiplier: '贸易价值',
    workerCapacityBonus: '工人容量'
    ,buildingHpMul: '所有建筑生命上限'
    ,repairNearbyBuildingsPerTick: '每时段修复附近建筑'
    ,repairRadius: '建筑修复范围'
  };
  const label = names[key] || supplementalNames[key] || '自定义建筑效果';
  const values = { land: '陆军', naval: '海军', infantry: '步兵', anti_cavalry: '反骑兵', ranged: '远程兵', cavalry: '骑兵', siege: '攻城单位', special: '特殊单位', research: '科研系统', culture: '人文系统', commerce: '商业系统', diplomacy: '外交系统' };
  if (typeof value === 'boolean') return `${label}：${value ? '启用' : '停用'}`;
  if (Array.isArray(value)) return `${label}：${value.map(item => values[item] || item).join('、') || '无'}`;
  if (key === 'resourceProductionMul' && value && typeof value === 'object') {
    const resourceNames = { wood: '原木', stone: '石头', food: '食物', gold: '黄金' };
    return `${label}：${Object.entries(value).map(([id, multiplier]) => `${resourceNames[id] || id} ×${multiplier}`).join('、')}`;
  }
  if (value && typeof value === 'object') return `${label}：已配置`;
  if (typeof value === 'number' && (key.endsWith('Mul') || key.endsWith('Multiplier'))) return `${label} ×${value}`;
  if (typeof value === 'number') return `${label} ${value >= 0 ? '+' : ''}${value}`;
  return `${label}：${values[value] || value}`;
}

export function getBuildingPrimaryFunctionRows(config = {}, getResourceName = id => id) {
  const rows = [];
  const cycleNames = { tick: '每时段', day: '每日', immediate: '立即' };
  const cycle = cycleNames[config.productionCycle] || (config.productionCycle ? `每${config.productionCycle}` : '每时段');
  const workerSuffix = config.production?.perWorker ? '／每名工人' : '';
  for (const output of config.production?.output || []) {
    rows.push(`产出 ${getResourceName(output.resourceId)} +${output.amount}${workerSuffix}／${cycle}`);
  }
  for (const input of config.production?.input || []) {
    rows.push(`消耗 ${getResourceName(input.resourceId)} ${input.amount}${workerSuffix}／${cycle}`);
  }
  if (Number(config.housingCapacity) > 0) rows.push(`人口容量 +${config.housingCapacity}`);
  if (Number(config.soldierCapacity) > 0) rows.push(`士兵容量 +${config.soldierCapacity}`);
  if (Number.isFinite(config.storageMultiplier) && config.storageMultiplier !== 1) rows.push(`资源存储上限 ×${config.storageMultiplier}`);
  if (Number(config.territoryRadius) > 0) rows.push(`领土范围半径 ${config.territoryRadius} 格`);
  for (const [key, value] of Object.entries(config.uniqueFunction || {})) rows.push(formatBuildingEffect(key, value));
  // 军事生产建筑（兵营/靶场等训练设施）不消耗工人，不显示岗位
  const isMilitaryProduction = config.uniqueFunction?.trainsBranches?.length > 0 || config.category === 'military';
  if (Number(config.maxWorkers) > 0 && !isMilitaryProduction) rows.push(`岗位上限 ${config.maxWorkers} 人`);
  return [...new Set(rows)];
}

export function getBuildingPresentation(config = {}, unlockRows = []) {
  const effectRows = getBuildingPrimaryFunctionRows(config);
  if (effectRows.length === 0 && !config.production) effectRows.push('提供基础城市功能');

  return {
    categoryId: config.category || 'administration',
    categoryName: BUILDING_CATEGORIES[config.category] || BUILDING_CATEGORIES.administration,
    eraName: config.eraName || ERA_NAMES[config.eraId] || config.eraId || ERA_NAMES.primitive,
    staffingText: Number(config.maxWorkers) > 0 ? `岗位上限 ${config.maxWorkers}` : '无需人口',
    isMilitaryProduction: config.uniqueFunction?.trainsBranches?.length > 0 || config.category === 'military',
    effectRows,
    inputRows: config.production?.input || [],
    outputRows: config.production?.output || [],
    unlockRows: Array.isArray(unlockRows) ? unlockRows : []
  };
}
