import { readFile, writeFile } from 'node:fs/promises';

const load = async path => JSON.parse(await readFile(path, 'utf8'));
const save = async (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

const historicalPath = 'config/historical_content.json';
const eaPath = 'config/ea_integration.json';
const runtimeOverridesPath = 'config/building-runtime-overrides.json';
const civilizationOverridesPath = 'config/civilization-building-overrides.json';
const [historical, ea, runtimeOverrides, civilizationOverrides] = await Promise.all([
  load(historicalPath), load(eaPath), load(runtimeOverridesPath), load(civilizationOverridesPath)
]);

const removedBuildingIds = new Set([
  'embassy', 'siege_workshop', 'harbor', 'grand_shipyard', 'lighthouse', 'dock', 'shipyard'
]);
const navalKeys = new Set([
  'navalPowerMul', 'navalSpeedMul', 'navalSupply', 'navalTrainingMul', 'navalVisionRadius',
  'navalMovementBonus'
]);
const diplomacyKeys = new Set(['diplomacyMul', 'diplomacyActions', 'relationGainBonus']);
const permanentGlobalKeys = new Set([
  'productionMul', 'resourceProductionMul', 'researchSpeedMul', 'sciencePointMul', 'civicPointMul',
  'buildSpeedMul', 'buildSpeedMultiplier', 'meleePowerMul', 'armyPowerMul', 'trainingSpeedMul',
  'armyCapacityBonus', 'armyCapBonus', 'commandPointsBonus', 'storageMultiplier', 'foodStorageMul',
  'territoryUpkeepMul', 'strategyCooldownMul', 'luxuryYieldBonus', 'civilizationYieldMul'
]);

const uniqueConversions = {
  ming_unique_building: {
    name: '官营工造局', category: 'industry',
    description: '集中工匠、火器与大型工程技术的官营工造机构，提高生产与建设效率。'
  },
  indonesia_modern_unique_building: {
    name: '群岛物流中心', category: 'commerce',
    description: '连接群岛公路、仓储与陆空运输的综合物流中心，提高物资周转效率。'
  },
  srivijaya_unique_building: {
    name: '商旅佛寺', category: 'commerce',
    description: '为远途商旅提供住宿、契约见证与物资集散的人文商业中心。'
  }
};

function cleanFunction(fn = {}) {
  for (const key of [...navalKeys, ...diplomacyKeys, 'siegePowerMul']) delete fn[key];
  if (Array.isArray(fn.trainsBranches)) {
    fn.trainsBranches = fn.trainsBranches.filter(branch => !['navy', 'siege', 'artillery'].includes(branch));
    if (fn.trainsBranches.length === 0) delete fn.trainsBranches;
  }
  if (Array.isArray(fn.armyAssemblyDomains)) {
    fn.armyAssemblyDomains = fn.armyAssemblyDomains.filter(domain => domain !== 'naval');
    if (fn.armyAssemblyDomains.length === 0) delete fn.armyAssemblyDomains;
  }
  return fn;
}

function cleanBuilding(building) {
  const converted = uniqueConversions[building.id];
  if (converted) Object.assign(building, converted);
  building.uniqueFunction = cleanFunction(building.uniqueFunction || {});
  building.tags = (building.tags || []).filter(tag => tag !== 'naval_facility');
  if (building.category === 'naval') building.category = building.production ? 'basic_industry' : 'commerce';
  if (building.domain === 'naval') delete building.domain;

  const fn = building.uniqueFunction;
  const producesKnowledge = Number(fn.sciencePerWorker || 0) > 0 || Number(fn.civicPerWorker || 0) > 0;
  const grantsPermanentGlobalBonus = Object.keys(fn).some(key => permanentGlobalKeys.has(key));
  if (producesKnowledge) building.maxCount = Math.min(Number.isFinite(building.maxCount) ? building.maxCount : 2, 2);
  if (grantsPermanentGlobalBonus) building.maxCount = Math.min(Number.isFinite(building.maxCount) ? building.maxCount : 1, 1);
  return building;
}

historical.buildings = (historical.buildings || [])
  .filter(building => !removedBuildingIds.has(building.id))
  .map(cleanBuilding);
ea.buildings = (ea.buildings || [])
  .filter(building => !removedBuildingIds.has(building.id))
  .map(cleanBuilding);

for (const civilization of historical.civilizations || []) {
  civilization.trait ||= {};
  civilization.trait.effects = cleanFunction(civilization.trait.effects || {});
  if (civilization.uniqueBuilding && uniqueConversions[civilization.uniqueBuilding.id]) {
    Object.assign(civilization.uniqueBuilding, uniqueConversions[civilization.uniqueBuilding.id]);
  }
}
for (const node of [...(historical.techs || []), ...(historical.civics || []), ...(ea.techs || []), ...(ea.civics || [])]) {
  if (node.unlocks?.buildings) node.unlocks.buildings = node.unlocks.buildings.filter(id => !removedBuildingIds.has(id));
  if (node.effects) cleanFunction(node.effects);
}

if (runtimeOverrides.buildings) {
  for (const id of removedBuildingIds) delete runtimeOverrides.buildings[id];
}
for (const archetype of Object.values(civilizationOverrides.archetypes || {})) cleanFunction(archetype.uniqueFunction || {});
for (const civilization of Object.values(civilizationOverrides.civilizations || {})) cleanFunction(civilization.uniqueFunction || {});

await Promise.all([
  save(historicalPath, historical), save(eaPath, ea), save(runtimeOverridesPath, runtimeOverrides),
  save(civilizationOverridesPath, civilizationOverrides)
]);
console.log(`Removed ${[...removedBuildingIds].join(', ')} and capped permanent-benefit buildings.`);
