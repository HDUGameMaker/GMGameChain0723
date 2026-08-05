import { readFile, writeFile } from 'node:fs/promises';

const buildingPaths = [
  new URL('../config/buildings.json', import.meta.url),
  new URL('../config/historical_content.json', import.meta.url)
];
const enemiesPath = new URL('../config/enemies.json', import.meta.url);

const maxHpFor = building => {
  const area = Math.max(1, Number(building.footprint?.width) || 1) * Math.max(1, Number(building.footprint?.height) || 1);
  const categoryBase = { defense: 650, military: 520, administration: 500, basic_industry: 420, industry: 420 }[building.category] || 360;
  return building.isHeadquarters ? 2000 : categoryBase + area * 110;
};

const configure = building => {
  const next = { ...building, maxHp: Math.max(1, Number(building.maxHp) || maxHpFor(building)) };
  next.uniqueFunction = { ...(next.uniqueFunction || {}) };
  if (next.isHeadquarters) next.uniqueFunction.buildingHpMul = Math.max(1.15, Number(next.uniqueFunction.buildingHpMul) || 0);
  const repairFacility = next.category === 'defense' && next.maxCount === 1;
  if (repairFacility) {
    next.uniqueFunction.buildingHpMul = Math.max(1.05, Number(next.uniqueFunction.buildingHpMul) || 0);
    next.uniqueFunction.repairNearbyBuildingsPerTick = Math.max(12, Number(next.uniqueFunction.repairNearbyBuildingsPerTick) || 0);
    next.uniqueFunction.repairRadius = Math.max(3, Number(next.uniqueFunction.repairRadius) || 0);
  }
  return next;
};

const [buildings, historical, enemies] = await Promise.all([
  readFile(buildingPaths[0], 'utf8').then(JSON.parse),
  readFile(buildingPaths[1], 'utf8').then(JSON.parse),
  readFile(enemiesPath, 'utf8').then(JSON.parse)
]);

const nextBuildings = buildings.map(configure);
historical.buildings = (historical.buildings || []).map(configure);
const waveProfiles = [
  { id: 'ancient_ruin_berserker', name: '遗迹狂战士', description: '近距离破坏建筑的重型遗迹造物。', icon: '🗿', faction: '远古遗迹', maxHp: 260, attack: 70, attackRange: 1, speed: 2, cp: 1, strategicOnly: true },
  { id: 'ancient_ruin_archer', name: '遗迹晶弓手', description: '高速远程攻击的遗迹造物。', icon: '🏹', faction: '远古遗迹', maxHp: 170, attack: 48, attackRange: 3, speed: 3, cp: 1, strategicOnly: true },
  { id: 'ancient_ruin_overseer', name: '遗迹多核监军', description: '拥有多CP的中距离遗迹指挥造物。', icon: '🔷', faction: '远古遗迹', maxHp: 210, attack: 42, attackRange: 2, speed: 2, cp: 3, strategicOnly: true }
];
const waveIds = new Set(waveProfiles.map(profile => profile.id));
enemies.enemies = [...(enemies.enemies || []).filter(profile => !waveIds.has(profile.id)), ...waveProfiles];
enemies.invasion = { ...(enemies.invasion || {}), firstDay: 7, nextDelayMinDays: 7, nextDelayMaxDays: 7, waveIntervalDays: 7, warningDays: 1 };

await Promise.all([
  writeFile(buildingPaths[0], `${JSON.stringify(nextBuildings, null, 2)}\n`, 'utf8'),
  writeFile(buildingPaths[1], `${JSON.stringify(historical, null, 2)}\n`, 'utf8'),
  writeFile(enemiesPath, `${JSON.stringify(enemies, null, 2)}\n`, 'utf8')
]);
console.log(`Configured durability for ${nextBuildings.length + historical.buildings.length} buildings and ${waveProfiles.length} ancient-ruin enemy types.`);
