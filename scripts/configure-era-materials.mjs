import { readFile, writeFile } from 'node:fs/promises';

const resourcePath = new URL('../config/resources.json', import.meta.url);
const historicalPath = new URL('../config/historical_content.json', import.meta.url);
const enemiesPath = new URL('../config/enemies.json', import.meta.url);
const eaIntegrationPath = new URL('../config/ea_integration.json', import.meta.url);

const tiers = [
  { eraId: 'primitive', wood: 'wood', stone: 'stone' },
  { eraId: 'ancient', wood: 'plank', woodName: '木板', stone: 'cut_stone', stoneName: '石材' },
  { eraId: 'classical', wood: 'composite_plank', woodName: '复合木板', stone: 'goldstone', stoneName: '金石', mineralGold: 1 },
  { eraId: 'medieval', wood: 'hardwood_beam', woodName: '硬木梁', stone: 'reinforced_stone', stoneName: '强化石材' },
  { eraId: 'exploration', wood: 'ship_timber', woodName: '船用木料', stone: 'dressed_marble', stoneName: '精琢大理石' },
  { eraId: 'early_modern', wood: 'laminated_timber', woodName: '层压木材', stone: 'reinforced_concrete', stoneName: '钢筋混凝土' },
  { eraId: 'modern', wood: 'carbon_composite', woodName: '碳纤维复材', stone: 'advanced_alloy', stoneName: '先进合金' }
];

const resources = JSON.parse(await readFile(resourcePath, 'utf8'));
const historical = JSON.parse(await readFile(historicalPath, 'utf8'));
const enemies = JSON.parse(await readFile(enemiesPath, 'utf8'));
const eaIntegration = JSON.parse(await readFile(eaIntegrationPath, 'utf8'));
const iconByBranch = {
  wood: resources.find(resource => resource.id === 'wood')?.icon || '',
  stone: resources.find(resource => resource.id === 'stone')?.icon || ''
};

const processedResources = tiers.slice(1).flatMap(tier => ([
  { id: tier.wood, name: tier.woodName, icon: `assets/icon/era-materials/${tier.wood}.png`, initial: 0, max: 5000, rare: false, processed: true, unlockEraId: tier.eraId, showInHUD: true },
  { id: tier.stone, name: tier.stoneName, icon: `assets/icon/era-materials/${tier.stone}.png`, initial: 0, max: 5000, rare: false, processed: true, unlockEraId: tier.eraId, showInHUD: true }
]));
const processedIds = new Set(processedResources.map(resource => resource.id));
const baseResources = resources.filter(resource => !processedIds.has(resource.id));
const goldIndex = baseResources.findIndex(resource => resource.id === 'gold');
baseResources.splice(goldIndex + 1, 0, ...processedResources);

const tierByEra = new Map(tiers.map(tier => [tier.eraId, tier]));
const tierIndexByEra = new Map(tiers.map((tier, index) => [tier.eraId, index]));
const eraMaterialCostScale = eraId => 1 / (1 + 0.18 * (tierIndexByEra.get(eraId) || 0));
const mergeCosts = costs => Object.entries((costs || []).reduce((sum, cost) => {
  if (!cost?.resourceId || !(Number(cost.amount) > 0)) return sum;
  sum[cost.resourceId] = (sum[cost.resourceId] || 0) + Math.max(1, Math.round(cost.amount));
  return sum;
}, {})).map(([resourceId, amount]) => ({ resourceId, amount }));

const migrateBuildingCost = building => {
  const tier = tierByEra.get(building.eraId);
  if (!tier || tier.eraId === 'primitive') return;
  for (const field of ['buildCost', 'upgradeCost']) {
    if (!Array.isArray(building[field])) continue;
    building[field] = mergeCosts(building[field].map(cost => ({
      ...cost,
      resourceId: cost.resourceId === 'wood' ? tier.wood : cost.resourceId === 'stone' ? tier.stone : cost.resourceId
    })));
    if (!building.eraMaterialCostBalanced) {
      const scale = eraMaterialCostScale(building.eraId);
      building[field] = building[field].map(cost => tier.wood === cost.resourceId || tier.stone === cost.resourceId
        ? { ...cost, amount: Math.max(4, Math.round(cost.amount * scale)) }
        : cost);
    }
  }
  building.eraMaterialCostBalanced = true;
};

const woodMaterialIds = new Set(tiers.map(tier => tier.wood));
const stoneMaterialIds = new Set(tiers.map(tier => tier.stone));
const migrateUnitCost = unit => {
  const tier = tierByEra.get(unit.eraId);
  if (!tier) return;
  for (const field of ['cost', 'unlockCost']) {
    if (!Array.isArray(unit[field])) continue;
    unit[field] = mergeCosts(unit[field].map(cost => ({
      ...cost,
      resourceId: woodMaterialIds.has(cost.resourceId) ? tier.wood
        : stoneMaterialIds.has(cost.resourceId) ? tier.stone
          : cost.resourceId
    })));
    if (!unit.eraMaterialCostBalanced && tier.eraId !== 'primitive') {
      const scale = eraMaterialCostScale(unit.eraId);
      unit[field] = unit[field].map(cost => tier.wood === cost.resourceId || tier.stone === cost.resourceId
        ? { ...cost, amount: Math.max(2, Math.round(cost.amount * scale)) }
        : cost);
    }
  }
  unit.eraMaterialCostBalanced = true;
};

const researchCost = (node, tier) => {
  const pointCost = Math.max(10, Number(node.pointCost) || 20);
  const scale = eraMaterialCostScale(node.eraId);
  const extras = (node.cost || []).filter(cost => !['wood', 'stone', ...processedIds].includes(cost.resourceId));
  return mergeCosts([
    { resourceId: tier.wood, amount: Math.max(6, Math.round(pointCost * 0.8 * scale)) },
    { resourceId: tier.stone, amount: Math.max(4, Math.round(pointCost * 0.6 * scale)) },
    ...extras
  ]);
};

for (const building of historical.buildings || []) migrateBuildingCost(building);
for (const unit of historical.units || []) migrateUnitCost(unit);
for (const unit of enemies.units || []) migrateUnitCost(unit);
for (const unit of eaIntegration.units || []) migrateUnitCost(unit);
for (const node of [...(historical.techs || []), ...(historical.civics || [])]) {
  const tier = tierByEra.get(node.eraId) || tiers[0];
  node.cost = researchCost(node, tier);
  if (!node.eraMaterialYieldBoosted && Number.isFinite(node.effects?.productionMul)) {
    node.effects.productionMul = Number((1 + (node.effects.productionMul - 1) * 1.5).toFixed(3));
    node.eraMaterialYieldBoosted = true;
  }
}

const primitiveStoneTech = historical.techs?.find(node => node.id === 'tech_primitive_1');
const primitiveWoodTech = historical.techs?.find(node => node.id === 'tech_primitive_3');
if (primitiveStoneTech?.effects?.resourceProductionMul) primitiveStoneTech.effects.resourceProductionMul.stone = 1.8;
if (primitiveWoodTech?.effects?.resourceProductionMul) primitiveWoodTech.effects.resourceProductionMul.wood = 1.8;
const productionCivic = historical.civics?.find(node => Number.isFinite(node.effects?.productionMul));
if (productionCivic) {
  productionCivic.effects.productionMul = Math.max(productionCivic.effects.productionMul, 1.45);
  productionCivic.eraMaterialYieldBoosted = true;
}

const rawMaterialCivilizationBuildings = new Set([
  'proto_civilization_unique_building',
  'old_egypt_unique_building', 'vedic_india_unique_building',
  'kushan_unique_building', 'teotihuacan_unique_building',
  'franks_unique_building', 'toltec_unique_building',
  'spain_unique_building', 'aztec_unique_building',
  'french_empire_unique_building', 'ottoman_reform_unique_building',
  'uk_modern_unique_building', 'indonesia_modern_unique_building'
]);
for (const building of historical.buildings || []) {
  if (!rawMaterialCivilizationBuildings.has(building.id)) continue;
  building.uniqueFunction ||= {};
  building.uniqueFunction.resourceProductionMul = { wood: 1.12, stone: 1.12 };
}

const buildingIcon = 'assets/historical-icons/buildings/blacksmith.svg';
const processors = [];
for (let index = 1; index < tiers.length; index += 1) {
  const tier = tiers[index];
  const previous = tiers[index - 1];
  const eraName = historical.eras.find(era => era.id === tier.eraId)?.name || tier.eraId;
  const makeProcessor = (branch, suffix, name, description, extraInput = []) => ({
    id: `${tier.eraId}_${suffix}`,
    name,
    category: 'basic_industry',
    eraId: tier.eraId,
    description,
    footprint: { width: 2, height: 2 },
    maxCount: 8,
    initialBuilding: false,
    maxWorkers: 4,
    jobType: 'industry',
    buildCost: mergeCosts([
      { resourceId: previous.wood, amount: branch === 'wood' ? 30 : 15 },
      { resourceId: previous.stone, amount: branch === 'stone' ? 30 : 15 },
      { resourceId: 'gold', amount: 8 + index * 4 }
    ]),
    buildTime: Math.min(8, 2 + index),
    unlockConditions: [],
    productionCycle: 'tick',
    ignoreProductionMultipliers: true,
    production: {
      perWorker: true,
      input: mergeCosts([{ resourceId: previous[branch], amount: 3 }, ...extraInput]),
      output: [{ resourceId: tier[branch], amount: 2 }]
    },
    uniqueFunction: { eraMaterialProcessing: true },
    icon: buildingIcon,
    imageDetail: buildingIcon,
    mapIcon: buildingIcon,
    tags: ['industry', 'era_processor', `${branch}_processing`],
    eraMaterialProcessor: true,
    eraLabel: eraName
  });
  processors.push(makeProcessor(
    'wood', 'wood_processor', `${tier.woodName}工坊`,
    `${eraName}的木料加工设施。每名工人每时段消耗3份${index === 1 ? '原木' : previous.woodName}，加工为2份${tier.woodName}；加工产量不受通用资源增产倍率重复放大。`
  ));
  processors.push(makeProcessor(
    'stone', 'stone_processor', `${tier.stoneName}工坊`,
    `${eraName}的矿物加工设施。每名工人每时段消耗3份${index === 1 ? '石头' : previous.stoneName}${tier.mineralGold ? '和黄金' : ''}，加工为2份${tier.stoneName}；加工产量不受通用资源增产倍率重复放大。`,
    tier.mineralGold ? [{ resourceId: 'gold', amount: tier.mineralGold }] : []
  ));
}

const processorIds = new Set(processors.map(building => building.id));
historical.buildings = [...(historical.buildings || []).filter(building => !processorIds.has(building.id)), ...processors];

await writeFile(resourcePath, `${JSON.stringify(baseResources, null, 2)}\n`, 'utf8');
await writeFile(historicalPath, `${JSON.stringify(historical, null, 2)}\n`, 'utf8');
await writeFile(enemiesPath, `${JSON.stringify(enemies, null, 2)}\n`, 'utf8');
await writeFile(eaIntegrationPath, `${JSON.stringify(eaIntegration, null, 2)}\n`, 'utf8');
console.log(`Configured ${processedResources.length} processed resources, ${processors.length} processing buildings, and era unit costs.`);
