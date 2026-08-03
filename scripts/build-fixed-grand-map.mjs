import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { buildTemplateDrivenWorld } from './lib/FixedWorldBuilder.js';
import { hashSeedParts } from '../src/core/RandomService.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const mapPath = resolve(projectRoot, 'config/maps/base_map.json');
const legacyMapPath = resolve(projectRoot, 'config/maps/grand_map_v1.json');
const patchPath = resolve(projectRoot, 'config/maps/grand_map_patches.json');
const checking = process.argv.includes('--check');

const [committedText, patchText, worldText, integrationText, resourceNodeText, macroTemplateText, historicalContentText] = await Promise.all([
  readFile(mapPath, 'utf8'),
  readFile(patchPath, 'utf8'),
  readFile(resolve(projectRoot, 'config/world-factions.json'), 'utf8'),
  readFile(resolve(projectRoot, 'config/ea_integration.json'), 'utf8'),
  readFile(resolve(projectRoot, 'config/resource-nodes.json'), 'utf8'),
  readFile(resolve(projectRoot, 'config/maps/grand_map_macro_template.json'), 'utf8'),
  readFile(resolve(projectRoot, 'config/historical_content.json'), 'utf8')
]);
const template = JSON.parse(committedText);
const patches = JSON.parse(patchText);
const world = JSON.parse(worldText);
const integration = JSON.parse(integrationText);
const resourceNodeConfig = JSON.parse(resourceNodeText);
const macroTemplate = JSON.parse(macroTemplateText);
const historicalContent = JSON.parse(historicalContentText);

function placeRecords(map, records, { namespace, used, spawn, minimumSpacing, spawnRadius }) {
  const water = new Set(['W', 'S']);
  const placed = [];
  for (let ordinal = 0; ordinal < records.length; ordinal += 1) {
    const record = records[ordinal];
    const candidates = [];
    const sectorColumn = ordinal % 6;
    const sectorRow = Math.floor(ordinal / 6) % 4;
    const startX = Math.max(4, Math.floor(sectorColumn * map.gridWidth / 6));
    const endX = Math.min(map.gridWidth - 4, Math.ceil((sectorColumn + 1) * map.gridWidth / 6));
    const startY = Math.max(4, Math.floor(sectorRow * map.gridHeight / 4));
    const endY = Math.min(map.gridHeight - 4, Math.ceil((sectorRow + 1) * map.gridHeight / 4));
    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        const isWater = water.has(map.grid[y][x]);
        if ((record.domain === 'naval') !== isWater) continue;
        if (record.domain !== 'naval' && map.grid[y][x] === 'M') continue;
        if (used.has(`${x}:${y}`)) continue;
        if (Math.max(Math.abs(x - spawn.gridX), Math.abs(y - spawn.gridY)) < spawnRadius) continue;
        if (placed.some(item => Math.max(Math.abs(x - item.gridX), Math.abs(y - item.gridY)) < minimumSpacing)) continue;
        const sectorX = (sectorColumn + 0.5) * map.gridWidth / 6;
        const sectorY = (sectorRow + 0.5) * map.gridHeight / 4;
        const sectorPenalty = Math.abs(x - sectorX) + Math.abs(y - sectorY);
        const jitter = hashSeedParts([patches.productionSeed, namespace, record.id, x, y]) / 0x1_0000_0000;
        candidates.push({ x, y, score: sectorPenalty + jitter * 28 });
      }
    }
    candidates.sort((left, right) => left.score - right.score || left.y - right.y || left.x - right.x);
    const selected = candidates[0];
    if (!selected) throw new RangeError(`unable_to_place_${namespace}_${record.id}`);
    used.add(`${selected.x}:${selected.y}`);
    placed.push({ ...record, gridX: selected.x, gridY: selected.y });
  }
  return placed;
}

function terrainComponents(map, acceptedCodes) {
  const remaining = new Set();
  for (let y = 0; y < map.gridHeight; y += 1) for (let x = 0; x < map.gridWidth; x += 1) {
    if (acceptedCodes.has(map.grid[y][x])) remaining.add(`${x}:${y}`);
  }
  const components = [];
  while (remaining.size) {
    const first = remaining.values().next().value;
    remaining.delete(first);
    const queue = [first];
    const cells = [];
    for (let head = 0; head < queue.length; head += 1) {
      const [x, y] = queue[head].split(':').map(Number);
      cells.push({ x, y });
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = `${x + dx}:${y + dy}`;
        if (remaining.delete(next)) queue.push(next);
      }
    }
    components.push(cells);
  }
  return components.sort((left, right) => right.length - left.length || left[0].y - right[0].y || left[0].x - right[0].x);
}

function buildResourceNodes(map, config, seed, luxuries) {
  const regionSize = config.macroRegionSize || 96;
  const targetPerType = config.commonNodeCountPerType || 320;
  const used = new Set();
  for (const record of [
    map.spawnManifest.playerSpawn,
    ...(map.spawnManifest.initialBuildings || []),
    ...(map.spawnManifest.cityStates || []),
    ...(map.spawnManifest.wildSites || [])
  ]) {
    if (Number.isInteger(record?.gridX) && Number.isInteger(record?.gridY)) used.add(`${record.gridX}:${record.gridY}`);
  }
  const compatible = (type, x, y) => {
    const ground = map.grid[y][x];
    if (type === 'wood') return ground === 'F';
    if (type === 'stone') {
      for (let top = y - 1; top <= y; top += 1) for (let left = x - 1; left <= x; left += 1) {
        if (left < 0 || top < 0 || left + 1 >= map.gridWidth || top + 1 >= map.gridHeight) continue;
        if (map.grid[top][left] === 'R' && map.grid[top][left + 1] === 'R'
          && map.grid[top + 1][left] === 'R' && map.grid[top + 1][left + 1] === 'R') return true;
      }
      return false;
    }
    if (type === 'gold') return ground === 'R';
    if (type === 'food') return ground === 'G' || ground === 'D';
    return (config.types[type]?.allowedGrounds || []).includes(ground);
  };
  const types = ['wood', 'stone', 'food', 'gold'];
  const candidatesByType = new Map();
  for (const type of types) {
    const buckets = new Map();
    for (let y = 0; y < map.gridHeight; y += 1) {
      for (let x = 0; x < map.gridWidth; x += 1) {
        if (!compatible(type, x, y)) continue;
        const bucket = `${Math.floor(x / regionSize)}:${Math.floor(y / regionSize)}`;
        const list = buckets.get(bucket) || [];
        list.push({ x, y, score: hashSeedParts([seed, 'resource-node', type, x, y]) });
        buckets.set(bucket, list);
      }
    }
    for (const list of buckets.values()) list.sort((left, right) => left.score - right.score || left.y - right.y || left.x - right.x);
    candidatesByType.set(type, buckets);
  }

  const selectedByType = Object.fromEntries(types.map(type => [type, []]));
  const trySelect = (type, candidate) => {
    const key = `${candidate.x}:${candidate.y}`;
    if (used.has(key)) return false;
    used.add(key);
    selectedByType[type].push(candidate);
    return true;
  };

  const allCandidates = type => [...candidatesByType.get(type).values()].flat()
    .sort((left, right) => left.score - right.score || left.y - right.y || left.x - right.x);

  // Bind natural resources to their visible terrain formations before regional density filling.
  for (const forest of terrainComponents(map, new Set(['F']))) {
    const forestKeys = new Set(forest.map(cell => `${cell.x}:${cell.y}`));
    const candidate = allCandidates('wood').find(cell => forestKeys.has(`${cell.x}:${cell.y}`) && !used.has(`${cell.x}:${cell.y}`));
    if (!candidate || !trySelect('wood', candidate)) throw new RangeError('forest_without_wood_node');
  }
  for (const mountain of terrainComponents(map, new Set(['M']))) {
    const nearMountain = candidate => mountain.some(cell => Math.max(Math.abs(candidate.x - cell.x), Math.abs(candidate.y - cell.y)) <= 2);
    for (const type of ['stone', 'gold']) {
      const candidate = allCandidates(type).find(cell => nearMountain(cell) && !used.has(`${cell.x}:${cell.y}`));
      if (!candidate || !trySelect(type, candidate)) throw new RangeError(`mountain_without_${type}_node`);
    }
  }

  // Coverage pass first: every resource type claims one point in every compatible
  // 25x25 micro-region before any type may spend its remaining quota. This prevents
  // stone nodes from consuming all of a small ore patch before gold is placed.
  for (const type of types) {
    const buckets = candidatesByType.get(type);
    for (const key of [...buckets.keys()].sort()) {
      for (const candidate of buckets.get(key)) {
        if (trySelect(type, candidate)) break;
      }
    }
  }

  // Density pass: fill the global 320-per-type budget after access is guaranteed.
  for (const type of types) {
    const buckets = candidatesByType.get(type);
    const selected = selectedByType[type];
    const remainder = [...buckets.values()].flat()
      .sort((left, right) => left.score - right.score || left.y - right.y || left.x - right.x);
    for (const candidate of remainder) {
      if (selected.length >= targetPerType) break;
      trySelect(type, candidate);
    }
    if (selected.length < targetPerType) throw new RangeError(`insufficient_${type}_resource_nodes_${selected.length}_of_${targetPerType}_from_${remainder.length}`);
  }

  const nodes = [];
  for (const type of types) {
    selectedByType[type].sort((left, right) => left.y - right.y || left.x - right.x);
    selectedByType[type].forEach((candidate, index) => nodes.push({
      id: `${type}_node_${String(index + 1).padStart(3, '0')}`,
      type,
      gridX: candidate.x,
      gridY: candidate.y,
      rarity: 'common',
      capacity: null,
      ...(type === 'food' ? {
        visualCue: ['deer', 'boar', 'wild_sheep', 'berry_bush', 'grain_patch'][hashSeedParts([seed, 'food-cue', candidate.x, candidate.y]) % 5]
      } : {})
    }));
  }

  const luxuryCount = Math.max(2, Math.floor(Number(config.luxuryNodeCountPerType) || 3));
  for (const luxury of luxuries) {
    const candidates = [];
    for (let y = 0; y < map.gridHeight; y += 1) for (let x = 0; x < map.gridWidth; x += 1) {
      if (map.grid[y][x] !== luxury.groundType || used.has(`${x}:${y}`)) continue;
      candidates.push({ x, y, score: hashSeedParts([seed, 'luxury-node', luxury.id, x, y]) });
    }
    candidates.sort((left, right) => left.score - right.score || left.y - right.y || left.x - right.x);
    const selected = [];
    for (const candidate of candidates) {
      if (selected.some(other => Math.hypot(other.x - candidate.x, other.y - candidate.y) < 36)) continue;
      used.add(`${candidate.x}:${candidate.y}`);
      selected.push(candidate);
      if (selected.length >= luxuryCount) break;
    }
    if (selected.length < luxuryCount) throw new RangeError(`insufficient_luxury_${luxury.id}_nodes`);
    selected.sort((left, right) => left.y - right.y || left.x - right.x).forEach((candidate, index) => nodes.push({
      id: `luxury_${luxury.id}_${String(index + 1).padStart(2, '0')}`,
      type: 'luxury',
      luxuryId: luxury.id,
      visualCue: luxury.id,
      gridX: candidate.x,
      gridY: candidate.y,
      rarity: 'common',
      capacity: null
    }));
  }
  return nodes;
}

function buildCaveEntrances(map, seed) {
  const regionSets = [
    ['mine_periphery', 'mine_interior'],
    ['mountain_summit', 'summit_ruins'],
    ['mine_periphery', 'iron_ridge'],
    ['mine_interior', 'coal_seam']
  ];
  const mountains = terrainComponents(map, new Set(['M'])).filter(component => component.length >= 12);
  const candidates = mountains.map((component, index) => [...component].sort((left, right) => (
    right.y - left.y
    || hashSeedParts([seed, 'cave-mouth', index, left.x, left.y]) - hashSeedParts([seed, 'cave-mouth', index, right.x, right.y])
  ))[0]);
  const entrances = [];
  for (const candidate of candidates) {
    if (entrances.some(item => Math.hypot(item.gridX - candidate.x, item.gridY - candidate.y) < 18)) continue;
    const index = entrances.length;
    const regionIds = regionSets[index % regionSets.length];
    entrances.push({
      id: `cave_entrance_${String(index + 1).padStart(2, '0')}`,
      name: ['岩穴入口', '矿洞入口', '山麓洞口', '古道洞口'][index % 4],
      gridX: candidate.x,
      gridY: candidate.y,
      regionIds,
      regions: regionIds.map((regionId, ordinal) => ({ regionId, workerCost: 2 + ordinal }))
    });
    if (entrances.length >= 12) break;
  }
  if (entrances.length < 8) throw new RangeError('insufficient_cave_entrances');
  return entrances;
}
const map = buildTemplateDrivenWorld({
  width: 384,
  height: 384,
  seed: patches.productionSeed,
  patches,
  template,
  macroTemplate
});
const occupied = new Set((map.spawnManifest.initialBuildings || []).map(record => `${record.gridX}:${record.gridY}`));
occupied.add(`${map.spawnManifest.playerSpawn.gridX}:${map.spawnManifest.playerSpawn.gridY}`);
map.spawnManifest.resourceNodes = buildResourceNodes(map, resourceNodeConfig, patches.productionSeed, historicalContent.luxuries || []);
for (const node of map.spawnManifest.resourceNodes) occupied.add(`${node.gridX}:${node.gridY}`);
map.spawnManifest.cityStates = placeRecords(
  map,
  [...integration.outposts, ...world.cityStates].map(state => ({ id: state.id, domain: state.domain })),
  { namespace: 'city-state', used: occupied, spawn: map.spawnManifest.playerSpawn, minimumSpacing: 16, spawnRadius: 28 }
);
map.spawnManifest.wildSites = placeRecords(
  map,
  world.wildSites.map(site => ({
    id: site.id, domain: site.domain, territoryRadius: site.territoryRadius, threatBand: site.threatBand
  })),
  { namespace: 'wild-site', used: occupied, spawn: map.spawnManifest.playerSpawn, minimumSpacing: 4, spawnRadius: 12 }
);
map.expeditionEntrances = buildCaveEntrances(map, patches.productionSeed);
const generatedText = `${JSON.stringify(map, null, 2)}\n`;

if (checking) {
  if (generatedText !== committedText.replace(/\r\n/g, '\n')) {
    console.error('grand_map_v2 differs from the reproducible offline build');
    process.exitCode = 1;
  } else {
    console.log('grand_map_v2 is reproducible');
  }
} else {
  try {
    await readFile(legacyMapPath, 'utf8');
  } catch {
    const legacy = JSON.parse(committedText);
    if (legacy.mapId !== 'grand_map_v1') throw new TypeError('missing_grand_map_v1_snapshot');
    await writeFile(legacyMapPath, committedText.replace(/\r\n/g, '\n'), 'utf8');
  }
  await writeFile(mapPath, generatedText, 'utf8');
  console.log(`wrote fixed grand_map_v2 (${map.gridWidth}x${map.gridHeight})`);
}
