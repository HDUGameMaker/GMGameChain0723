import { readFile, writeFile } from 'node:fs/promises';

const paths = {
  historical: new URL('../config/historical_content.json', import.meta.url),
  resources: new URL('../config/resources.json', import.meta.url),
  enemies: new URL('../config/enemies.json', import.meta.url),
  ea: new URL('../config/ea_integration.json', import.meta.url),
  civOverrides: new URL('../config/civilization-building-overrides.json', import.meta.url)
};
const historical = JSON.parse(await readFile(paths.historical, 'utf8'));
const resources = JSON.parse(await readFile(paths.resources, 'utf8'));
const enemies = JSON.parse(await readFile(paths.enemies, 'utf8'));
const ea = JSON.parse(await readFile(paths.ea, 'utf8'));
const civOverrides = JSON.parse(await readFile(paths.civOverrides, 'utf8'));

const removedEras = new Set(['ancient', 'early_modern']);
const remainingEraIds = ['primitive', 'classical', 'medieval', 'exploration', 'modern'];
const removedMaterials = new Set(['plank', 'cut_stone', 'laminated_timber', 'reinforced_concrete']);
const resourceReplacement = {
  plank: 'wood', cut_stone: 'stone',
  laminated_timber: 'ship_timber', reinforced_concrete: 'dressed_marble'
};
const researchTarget = { ancient: 'classical', early_modern: 'modern' };
const prerequisiteTarget = { ancient: 'primitive', early_modern: 'exploration' };

const mergeModifier = (current, incoming, key = '') => {
  if (Number.isFinite(current) && Number.isFinite(incoming)) return key.endsWith('Mul')
    ? Number((current + incoming - 1).toFixed(6))
    : Number((current + incoming).toFixed(6));
  if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
    const result = { ...(current && typeof current === 'object' ? current : {}) };
    for (const [childKey, value] of Object.entries(incoming)) result[childKey] = mergeModifier(result[childKey], value, childKey);
    return result;
  }
  return current ?? structuredClone(incoming);
};
const mergeEffects = (target = {}, donor = {}) => {
  const result = structuredClone(target);
  for (const [key, value] of Object.entries(donor || {})) result[key] = mergeModifier(result[key], value, key);
  return result;
};
const mergeUnlocks = (target = {}, donor = {}) => {
  const result = structuredClone(target);
  for (const [key, values] of Object.entries(donor || {})) {
    if (Array.isArray(values)) result[key] = [...new Set([...(result[key] || []), ...values])];
    else if (result[key] == null) result[key] = structuredClone(values);
  }
  return result;
};
const replaceResourceRefs = value => {
  if (Array.isArray(value)) return value.map(replaceResourceRefs);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = key === 'resourceId' && resourceReplacement[child] ? resourceReplacement[child] : replaceResourceRefs(child);
  }
  return result;
};
const remapResearchId = (id, targets = researchTarget) => {
  const match = String(id || '').match(/^(tech|civic)_(ancient|early_modern)_(\d+)$/);
  return match ? `${match[1]}_${targets[match[2]]}_${match[3]}` : id;
};

// Merge the removed pages into the neighboring surviving pages before deleting them.
for (const collectionName of ['techs', 'civics']) {
  const collection = historical[collectionName] || [];
  const prefix = collectionName === 'techs' ? 'tech' : 'civic';
  for (const removedEra of removedEras) for (let index = 1; index <= 8; index += 1) {
    const donor = collection.find(node => node.id === `${prefix}_${removedEra}_${index}`);
    const target = collection.find(node => node.id === `${prefix}_${researchTarget[removedEra]}_${index}`);
    if (!donor || !target) continue;
    target.effects = mergeEffects(target.effects, donor.effects);
    target.unlocks = mergeUnlocks(target.unlocks, donor.unlocks);
    target.description = `${target.description || ''}（整合${removedEra === 'ancient' ? '上古' : '近代'}时代成果）`;
  }
  historical[collectionName] = collection.filter(node => !removedEras.has(node.eraId)).map(node => ({
    ...node,
    prerequisites: (node.prerequisites || []).map(id => remapResearchId(id, prerequisiteTarget))
  }));
}

historical.eras = historical.eras.filter(era => !removedEras.has(era.id)).map((era, order) => ({
  ...era, order, starRequirement: order === 0 ? 0 : order * 5
}));
const removedCivilizationIds = new Set(historical.civilizations.filter(civ => removedEras.has(civ.eraId)).map(civ => civ.id));
historical.civilizations = historical.civilizations.filter(civ => !removedCivilizationIds.has(civ.id));
historical.buildings = historical.buildings.filter(building => !removedEras.has(building.eraId) && !removedCivilizationIds.has(building.civilizationId));

// Five-era material chain: raw -> classical -> medieval -> exploration -> modern.
const tiers = [
  { eraId: 'primitive', wood: 'wood', stone: 'stone' },
  { eraId: 'classical', wood: 'composite_plank', stone: 'goldstone', input: 4 },
  { eraId: 'medieval', wood: 'hardwood_beam', stone: 'reinforced_stone', input: 3 },
  { eraId: 'exploration', wood: 'ship_timber', stone: 'dressed_marble', input: 4 },
  { eraId: 'modern', wood: 'carbon_composite', stone: 'advanced_alloy', input: 3 }
];
const tierByEra = new Map(tiers.map(tier => [tier.eraId, tier]));
const allWood = new Set(['wood', 'plank', 'composite_plank', 'hardwood_beam', 'ship_timber', 'laminated_timber', 'carbon_composite']);
const allStone = new Set(['stone', 'cut_stone', 'goldstone', 'reinforced_stone', 'dressed_marble', 'reinforced_concrete', 'advanced_alloy']);
const normalizeCost = (costs, eraId) => {
  const tier = tierByEra.get(eraId) || tiers[0];
  const totals = {};
  for (const cost of costs || []) {
    let resourceId = resourceReplacement[cost.resourceId] || cost.resourceId;
    if (allWood.has(resourceId)) resourceId = tier.wood;
    if (allStone.has(resourceId)) resourceId = tier.stone;
    totals[resourceId] = (totals[resourceId] || 0) + Math.max(1, Math.round(Number(cost.amount) || 0));
  }
  return Object.entries(totals).map(([resourceId, amount]) => ({ resourceId, amount }));
};

historical.buildings = historical.buildings.map(building => {
  const result = replaceResourceRefs(building);
  if (Array.isArray(result.buildCost)) result.buildCost = normalizeCost(result.buildCost, result.eraId);
  if (Array.isArray(result.upgradeCost)) result.upgradeCost = normalizeCost(result.upgradeCost, result.eraId);
  return result;
});

const processorIds = new Set(historical.buildings.filter(building => building.eraMaterialProcessor).map(building => building.id));
historical.buildings = historical.buildings.filter(building => !processorIds.has(building.id));
const resourceNames = Object.fromEntries(resources.map(resource => [resource.id, resource.name]));
for (let index = 1; index < tiers.length; index += 1) {
  const tier = tiers[index], previous = tiers[index - 1];
  for (const branch of ['wood', 'stone']) {
    const outputId = tier[branch], inputId = previous[branch];
    const extra = branch === 'stone' && tier.eraId === 'classical' ? [{ resourceId: 'gold', amount: 1 }] : [];
    historical.buildings.push({
      id: `${tier.eraId}_${branch}_processor`, name: `${resourceNames[outputId]}工坊`, category: 'basic_industry', eraId: tier.eraId,
      description: `每名工人每时段消耗${tier.input}份${resourceNames[inputId]}${extra.length ? '和1份黄金' : ''}，产出2份${resourceNames[outputId]}。`,
      footprint: { width: 2, height: 2 }, maxCount: 6, initialBuilding: false, maxWorkers: 4, jobType: 'industry',
      buildCost: [{ resourceId: previous.wood, amount: branch === 'wood' ? 24 : 12 }, { resourceId: previous.stone, amount: branch === 'stone' ? 24 : 12 }, { resourceId: 'gold', amount: 12 + index * 5 }],
      buildTime: 2 + index, unlockConditions: [], productionCycle: 'tick', ignoreProductionMultipliers: true,
      production: { perWorker: true, input: [{ resourceId: inputId, amount: tier.input }, ...extra], output: [{ resourceId: outputId, amount: 2 }] },
      uniqueFunction: { eraMaterialProcessing: true }, icon: 'assets/historical-icons/buildings/blacksmith.svg',
      imageDetail: 'assets/historical-icons/buildings/blacksmith.svg', mapIcon: 'assets/historical-icons/buildings/blacksmith.svg',
      tags: ['basic_industry', 'era_processor', `${branch}_processing`], eraMaterialProcessor: true
    });
  }
}

for (const node of [...historical.techs, ...historical.civics]) {
  node.cost = normalizeCost(replaceResourceRefs(node.cost || []), node.eraId);
  if (node.unlocks?.buildings) node.unlocks.buildings = node.unlocks.buildings.filter(id => historical.buildings.some(building => building.id === id));
}

const statTable = {
  primitive: { balanced: [85, 60, 2], heavy: [120, 50, 1], swift: [60, 80, 2], ranged: [70, 15, 2, 2], healer: [90, 35, 2] },
  classical: { balanced: [120, 85, 2], heavy: [170, 75, 1], swift: [85, 115, 3], ranged: [100, 20, 2, 3], healer: [125, 55, 2] },
  medieval: { balanced: [160, 105, 2], heavy: [220, 95, 1], swift: [110, 145, 3], ranged: [135, 30, 2, 3], healer: [165, 70, 2] },
  exploration: { balanced: [200, 130, 3], heavy: [275, 115, 1], swift: [135, 175, 4], ranged: [165, 30, 3, 4], healer: [205, 90, 3] },
  modern: { balanced: [240, 150, 3], heavy: [330, 140, 1], swift: [160, 210, 5], ranged: [200, 20, 3, 5], healer: [245, 120, 3] }
};
const strength = unit => Math.round((unit.hp + unit.attack * 1.2 + (unit.speed - 1) * 30 + (unit.attackRange - 1) * 50) * (unit.cp || 1) * 1.3);
const isMountedRanged = unit => unit.branch === 'cavalry' && (
  unit.roleTags?.includes('mounted_ranged')
  || unit.roleTags?.includes('horse_archer')
  || /骑射|弓骑/.test(unit.name || '')
);
const convertUniqueRemovedBranch = unit => {
  if (!unit.civilizationId || (!['navy', 'siege'].includes(unit.branch) && unit.domain !== 'naval')) return unit;
  return { ...unit, domain: 'land', branch: unit.branch === 'siege' ? 'anti_cavalry' : 'ranged', lane: unit.branch === 'siege' ? 'front' : 'rear', roleTags: unit.branch === 'siege' ? ['spear', 'melee'] : ['ranged', 'light'], trainingBuildingId: unit.branch === 'siege' ? 'barracks_hall' : 'archery_range' };
};
const balanceUnit = original => {
  const unit = convertUniqueRemovedBranch(replaceResourceRefs(original));
  const table = statTable[unit.eraId];
  if (!table) return unit;
  const healer = unit.roleTags?.includes('healer');
  const mountedRanged = isMountedRanged(unit);
  const ranged = !mountedRanged && (unit.branch === 'ranged' || unit.roleTags?.includes('ranged'));
  const archetype = healer ? 'healer' : ranged ? 'ranged' : ['anti_cavalry'].includes(unit.branch) ? 'heavy' : ['cavalry', 'special'].includes(unit.branch) ? 'swift' : 'balanced';
  let [hp, attack, speed, range = 1] = table[archetype];
  if (mountedRanged) {
    hp = Math.max(1, Math.round(hp * 0.94));
    attack = Math.max(1, Math.round(attack * 0.91));
    speed = Math.min(5, speed + 1);
    range = table.ranged[3] || 2;
    unit.roleTags = [...new Set([...(unit.roleTags || []), 'cavalry', 'ranged', 'mounted_ranged'])];
    unit.lane = 'rear';
  }
  Object.assign(unit, { hp, attack, speed, attackRange: range, cp: 1, archetype: mountedRanged ? 'mounted_ranged' : archetype === 'ranged' || archetype === 'healer' ? 'balanced' : archetype });
  unit.healingAfterBattle = healer ? attack : 0;
  unit.combatPower = unit.comprehensiveStrength = strength(unit);
  unit.cost = normalizeCost(unit.cost || [], unit.eraId);
  unit.unlockCost = normalizeCost(unit.unlockCost || [], unit.eraId);
  const label = healer ? `治疗型：生命${hp}，恢复量${attack}，速度${speed}，射程${range}` : `${mountedRanged ? '骑射' : archetype === 'heavy' ? '重装' : archetype === 'swift' ? '敏捷' : ranged ? '远程' : '均衡'}型：生命${hp}，攻击${attack}，速度${speed}，射程${range}`;
  unit.description = `${String(unit.description || unit.name).replace(/【[^】]+型】.*?。$/u, '').replace(/【(?:治疗|迅捷|重装|均衡)型】.*?。$/u, '').trim()}【${label}，CP 1】`;
  return unit;
};

const keepHistoricalUnit = unit => {
  if (removedEras.has(unit.eraId) || removedCivilizationIds.has(unit.civilizationId)) return false;
  if (unit.civilizationId) return true;
  if (unit.domain === 'naval' || ['navy', 'siege', 'special'].includes(unit.branch)) return false;
  return true;
};
historical.units = historical.units.filter(keepHistoricalUnit).map(balanceUnit);

// Civilization units keep their identity, speed and range, while each combat
// family uses no more than three stat variants. Their final strength is
// deliberately 150%, 160% or 170% of the ordinary roster's era average.
const variantRatios = [1.5, 1.6, 1.7];
const getVariantFamily = unit => unit.roleTags?.includes('healer') ? 'healer'
  : isMountedRanged(unit) ? 'mounted_ranged'
    : (unit.branch === 'ranged' || unit.roleTags?.includes('ranged')) ? 'ranged'
    : unit.archetype || 'balanced';
for (const eraId of remainingEraIds) {
  const ordinary = historical.units.filter(unit => unit.eraId === eraId && !unit.civilizationId && !unit.roleTags?.includes('healer'));
  if (ordinary.length === 0) continue;
  const baseline = ordinary.reduce((total, unit) => total + strength(unit), 0) / ordinary.length;
  const families = new Map();
  for (const unit of historical.units.filter(item => item.eraId === eraId && item.civilizationId && !item.roleTags?.includes('healer'))) {
    const family = getVariantFamily(unit);
    if (!families.has(family)) families.set(family, []);
    families.get(family).push(unit);
  }
  for (const units of families.values()) units.forEach((unit, index) => {
    const variant = index % 3;
    const ratio = variantRatios[variant];
    const mountedRanged = isMountedRanged(unit);
    unit.cp = 1;
    const targetRaw = baseline * ratio / ((unit.cp || 1) * 1.3);
    const fixed = (unit.speed - 1) * 30 + (unit.attackRange - 1) * 50;
    if (mountedRanged) {
      unit.attack = Math.max(1, Math.round((targetRaw - unit.hp - fixed) / 1.2));
    } else if (variant === 0) {
      unit.hp = Math.max(1, Math.round(targetRaw - unit.attack * 1.2 - fixed));
    } else if (variant === 1) {
      unit.attack = Math.max(1, Math.round((targetRaw - unit.hp - fixed) / 1.2));
    } else {
      const available = Math.max(2, targetRaw - fixed);
      unit.hp = Math.max(1, Math.round(available * 0.55));
      unit.attack = Math.max(1, Math.round((available - unit.hp) / 1.2));
    }
    unit.combatPower = unit.comprehensiveStrength = strength(unit);
    unit.balanceVariant = mountedRanged ? '骑射型' : ['坚韧型', '强攻型', '精锐型'][variant];
    const cleanDescription = String(unit.description || unit.name).replace(/【[^】]+】/gu, '').trim();
    unit.description = `${cleanDescription}【文明特色·${unit.balanceVariant}：生命${unit.hp}，攻击${unit.attack}，速度${unit.speed}，射程${unit.attackRange}，CP ${unit.cp}，综合强度${unit.comprehensiveStrength}】`;
  });
}
for (const civ of historical.civilizations) {
  if (historical.units.some(unit => unit.id === civ.uniqueUnitId)) continue;
  civ.uniqueUnitId = historical.units.find(unit => unit.eraId === civ.eraId && unit.branch === 'infantry')?.id
    || historical.units.find(unit => unit.eraId === civ.eraId)?.id;
}
for (const node of [...historical.techs, ...historical.civics]) {
  if (node.unlocks?.units) node.unlocks.units = node.unlocks.units.filter(id => historical.units.some(unit => unit.id === id));
}

const filterAndBalanceExternalUnits = units => (units || [])
  .filter(unit => !removedEras.has(unit.eraId) && unit.domain !== 'naval' && !['navy', 'siege'].includes(unit.branch))
  .map(balanceUnit);
enemies.units = filterAndBalanceExternalUnits(enemies.units);
ea.units = filterAndBalanceExternalUnits(ea.units);
enemies.unitBranches = (enemies.unitBranches || []).filter(branch => !['navy', 'siege', 'artillery'].includes(branch.id));
enemies.unitDomains = (enemies.unitDomains || []).filter(domain => domain.id !== 'naval');
ea.unitBranches = (ea.unitBranches || []).filter(branch => !['navy', 'siege', 'artillery'].includes(branch.id));
enemies.formations = (enemies.formations || []).filter(formation => !(formation.requiredUnits || []).some(req => ['navy', 'siege'].includes(req.branch) || req.domain === 'naval'));

for (const building of historical.buildings) {
  if (building.uniqueFunction?.trainsBranches) {
    building.uniqueFunction.trainsBranches = building.uniqueFunction.trainsBranches
      .filter(branch => !['navy', 'siege', 'artillery'].includes(branch));
  }
}

historical.heroes = (historical.heroes || []).map(hero => ({ ...hero, eraId: researchTarget[hero.eraId] || hero.eraId }));
delete historical.strategies;
historical.buildings = historical.buildings.filter(building => !['strategy_archive', 'strategy_office'].includes(building.id) && building.jobType !== 'strategy' && !building.tags?.includes('strategy'));
historical.buildings = historical.buildings.map(building => {
  const area = Math.max(1, Number(building.footprint?.width) || 1) * Math.max(1, Number(building.footprint?.height) || 1);
  const categoryBase = { defense: 650, military: 520, administration: 500, basic_industry: 420, industry: 420 }[building.category] || 360;
  const result = { ...building, maxHp: Math.max(1, Number(building.maxHp) || (building.isHeadquarters ? 2000 : categoryBase + area * 110)) };
  result.uniqueFunction = { ...(result.uniqueFunction || {}) };
  if (result.isHeadquarters) result.uniqueFunction.buildingHpMul = Math.max(1.15, Number(result.uniqueFunction.buildingHpMul) || 0);
  if (result.category === 'defense' && result.maxCount === 1) {
    result.uniqueFunction.buildingHpMul = Math.max(1.05, Number(result.uniqueFunction.buildingHpMul) || 0);
    result.uniqueFunction.repairNearbyBuildingsPerTick = Math.max(12, Number(result.uniqueFunction.repairNearbyBuildingsPerTick) || 0);
    result.uniqueFunction.repairRadius = Math.max(3, Number(result.uniqueFunction.repairRadius) || 0);
  }
  return result;
});
for (const key of Object.keys(civOverrides.civilizations || {})) if (removedCivilizationIds.has(key)) delete civOverrides.civilizations[key];

const nextResources = resources.filter(resource => !removedMaterials.has(resource.id));
for (const resource of nextResources) if (resource.unlockEraId) resource.unlockEraId = researchTarget[resource.unlockEraId] || resource.unlockEraId;

await writeFile(paths.historical, `${JSON.stringify(historical, null, 2)}\n`, 'utf8');
await writeFile(paths.resources, `${JSON.stringify(nextResources, null, 2)}\n`, 'utf8');
await writeFile(paths.enemies, `${JSON.stringify(enemies, null, 2)}\n`, 'utf8');
await writeFile(paths.ea, `${JSON.stringify(ea, null, 2)}\n`, 'utf8');
await writeFile(paths.civOverrides, `${JSON.stringify(civOverrides, null, 2)}\n`, 'utf8');
console.log(`Contracted to ${historical.eras.length} eras, ${historical.civilizations.length} civilizations, ${historical.units.length} historical units and ${historical.buildings.filter(b => b.eraMaterialProcessor).length} processors.`);
