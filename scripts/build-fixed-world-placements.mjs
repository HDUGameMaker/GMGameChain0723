import { readFile, writeFile } from 'node:fs/promises';

const [map, world, integration] = await Promise.all([
  readFile('config/maps/base_map.json', 'utf8').then(JSON.parse),
  readFile('config/world-factions.json', 'utf8').then(JSON.parse),
  readFile('config/ea_integration.json', 'utf8').then(JSON.parse)
]);

const waterCodes = new Set(['S', 'W']);
const usedPositions = [
  ...map.initialBuildings.map(item => ({ x: item.gridX, y: item.gridY })),
  ...map.spawnManifest.ports.map(item => ({ x: item.gridX, y: item.gridY }))
];
const used = new Set(usedPositions.map(item => `${item.x},${item.y}`));
const spawn = map.spawnManifest.playerSpawn;

function isCompatible(domain, x, y) {
  return waterCodes.has(map.grid[y][x]) === (domain === 'naval');
}

function selectPosition(domain, anchor, minimumSeparation, minimumSpawnDistance) {
  const roundedAnchor = { x: Math.round(anchor.x), y: Math.round(anchor.y) };
  for (let radius = 0; radius < Math.max(map.gridWidth, map.gridHeight); radius += 1) {
    const candidates = [];
    for (let dx = -radius; dx <= radius; dx += 1) {
      candidates.push({ x: roundedAnchor.x + dx, y: roundedAnchor.y - radius });
      if (radius > 0) candidates.push({ x: roundedAnchor.x + dx, y: roundedAnchor.y + radius });
    }
    for (let dy = -radius + 1; dy < radius; dy += 1) {
      candidates.push({ x: roundedAnchor.x - radius, y: roundedAnchor.y + dy });
      if (radius > 0) candidates.push({ x: roundedAnchor.x + radius, y: roundedAnchor.y + dy });
    }
    for (const candidate of candidates) {
      const { x, y } = candidate;
      if (x < 6 || y < 6 || x >= map.gridWidth - 6 || y >= map.gridHeight - 6) continue;
      if (!isCompatible(domain, x, y) || used.has(`${x},${y}`)) continue;
      if (Math.hypot(x - spawn.gridX, y - spawn.gridY) < minimumSpawnDistance) continue;
      if (usedPositions.some(item => Math.hypot(x - item.x, y - item.y) < minimumSeparation)) continue;
      used.add(`${x},${y}`);
      usedPositions.push({ x, y });
      return { gridX: x, gridY: y };
    }
  }
  throw new Error(`no_${domain}_placement_near_${anchor.x}_${anchor.y}`);
}

const emblemPaths = [
  'assets/historical-icons/civilizations/han.svg',
  'assets/historical-icons/civilizations/venice.svg',
  'assets/historical-icons/civilizations/mongol.svg',
  'assets/historical-icons/civilizations/old_egypt.svg',
  'assets/historical-icons/civilizations/rome.svg',
  'assets/historical-icons/civilizations/ghana_empire.svg'
];
const personalities = ['merchant', 'guardian', 'scholar', 'expansionist', 'diplomat', 'traditionalist'];
const specialties = ['wood_trade', 'gold_trade', 'stone_trade', 'food_trade', 'knowledge_exchange', 'naval_trade'];
const extraCityStates = [
  ['amber_coast_league', '琥珀海岸同盟', 'land'],
  ['red_cliff_council', '赤岩议会', 'land'],
  ['cloudpeak_academy', '云岭学社', 'land'],
  ['black_tide_republic', '黑潮共和国', 'naval'],
  ['silver_bay_port', '银湾商港', 'naval'],
  ['azure_steppe_court', '苍原汗庭', 'land'],
  ['riverbend_federation', '河套谷仓联邦', 'land'],
  ['white_tower_order', '白塔修会', 'land'],
  ['golden_sheaf_city', '金穗自由市', 'land'],
  ['mistwood_commune', '雾林公社', 'land'],
  ['obsidian_mining_state', '曜石矿邦', 'land'],
  ['longbridge_artisans', '长桥工匠邦', 'land']
].map(([id, name, domain], index) => ({
  id,
  name,
  icon: domain === 'naval' ? '⚓' : '🏛️',
  description: `${name}在固定大世界中经营领地，并依据自身性格采取每日战略行动。`,
  domain,
  faction: id,
  develops: 'limited',
  initialRelation: -18 + (index * 7) % 48,
  militaryStrength: 24 + index * 3,
  garrison: [{ enemyId: domain === 'naval' ? 'corsair_galley' : 'outpost_guard', count: 2 + (index % 4) }],
  actions: ['talk', 'gift', 'aid', 'trade', 'open_borders', 'non_aggression', 'alliance'],
  specialty: specialties[index % specialties.length],
  personality: personalities[index % personalities.length],
  emblem: emblemPaths[index % emblemPaths.length],
  developmentProfile: { military: 0.8 + (index % 4) * 0.1, economy: 0.9 + (index % 3) * 0.1, diplomacy: 0.85 + (index % 5) * 0.08 },
  dailyActionProfile: { economy: 3 + (index % 3), military: 2 + (index % 4), diplomacy: 2 + (index % 5) },
  eraUnitBranch: domain === 'naval' ? 'navy' : ['infantry', 'ranged', 'cavalry', 'anti_cavalry'][index % 4]
}));

world.cityStates = [...world.cityStates.slice(0, 6), ...extraCityStates];
const cityStates = [...integration.outposts, ...world.cityStates];
const cityAnchors = Array.from({ length: cityStates.length }, (_, index) => ({
  x: 30 + (index % 6) * 64 + ((index * 17) % 19),
  y: 32 + Math.floor(index / 6) * 82 + ((index * 29) % 23)
}));

for (let index = 0; index < cityStates.length; index += 1) {
  const state = cityStates[index];
  Object.assign(state, selectPosition(state.domain || 'land', cityAnchors[index], 18, 32));
  state.personality ||= personalities[index % personalities.length];
  state.specialty ||= specialties[index % specialties.length];
  state.emblem ||= emblemPaths[index % emblemPaths.length];
  state.dailyActionProfile ||= { economy: 3, military: 2, diplomacy: 3 };
  state.developmentProfile ||= { military: 0.9, economy: 0.9, diplomacy: 0.9 };
}

const originalWild = world.wildSites.slice(0, 18);
const categoryNames = {
  barbarian_camp: '边地营寨',
  resource_guard: '资源守卫',
  roaming_host: '游荡军团',
  ruin_guard: '遗迹守卫',
  pirate_fleet: '海盗舰队',
  ancient_beast: '荒野兽群'
};
const markerByCategory = {
  barbarian_camp: 'assets/historical-icons/events/ea_border_incident.svg',
  resource_guard: 'assets/historical-icons/events/ea_herb_patch.svg',
  roaming_host: 'assets/historical-icons/events/ea_deserter_warning.svg',
  ruin_guard: 'assets/historical-icons/events/ea_old_battlefield.svg',
  pirate_fleet: 'assets/historical-icons/events/ea_pirate_rumor.svg',
  ancient_beast: 'assets/historical-icons/events/ea_tavern_challenge.svg'
};
const categories = Object.keys(categoryNames);
const resources = ['wood', 'food', 'stone', 'gold'];

world.wildSites = Array.from({ length: 96 }, (_, index) => {
  const source = originalWild[index % originalWild.length];
  const category = index < originalWild.length ? source.category : categories[index % categories.length];
  const domain = category === 'pirate_fleet' || (index >= 18 && index % 11 === 0) ? 'naval' : 'land';
  const threatBand = index < 32 ? 'low' : index < 72 ? 'medium' : 'high';
  const multiplier = threatBand === 'low' ? 1 : threatBand === 'medium' ? 1.55 : 2.15;
  return {
    ...source,
    id: index < originalWild.length ? source.id : `wild_site_${String(index + 1).padStart(3, '0')}`,
    name: index < originalWild.length ? source.name : `${categoryNames[category]}·${String(index + 1).padStart(2, '0')}`,
    category,
    domain,
    baseStrength: Math.round((16 + (index % 18) * 2) * multiplier),
    respawnDays: 4 + (index % 7),
    rewards: [{ resourceId: resources[index % resources.length], amount: 24 + (index % 9) * 4 }],
    threatBand,
    territoryRadius: 2 + (index % 4),
    markerArt: markerByCategory[category]
  };
});

for (let index = 0; index < world.wildSites.length; index += 1) {
  const site = world.wildSites[index];
  const anchor = {
    x: 10 + ((index * 83 + 31) % 364),
    y: 10 + ((index * 137 + 47) % 364)
  };
  Object.assign(site, selectPosition(site.domain, anchor, 4, 20));
}

await Promise.all([
  writeFile('config/world-factions.json', `${JSON.stringify(world, null, 2)}\n`, 'utf8'),
  writeFile('config/ea_integration.json', `${JSON.stringify(integration, null, 2)}\n`, 'utf8')
]);
console.log(`wrote ${cityStates.length} city-states and ${world.wildSites.length} wild sites`);
