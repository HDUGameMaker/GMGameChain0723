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

const [committedText, patchText, worldText, integrationText, resourceNodeText, macroTemplateText] = await Promise.all([
  readFile(mapPath, 'utf8'),
  readFile(patchPath, 'utf8'),
  readFile(resolve(projectRoot, 'config/world-factions.json'), 'utf8'),
  readFile(resolve(projectRoot, 'config/ea_integration.json'), 'utf8'),
  readFile(resolve(projectRoot, 'config/resource-nodes.json'), 'utf8'),
  readFile(resolve(projectRoot, 'config/maps/grand_map_macro_template.json'), 'utf8')
]);
const template = JSON.parse(committedText);
const patches = JSON.parse(patchText);
const world = JSON.parse(worldText);
const integration = JSON.parse(integrationText);
const resourceNodeConfig = JSON.parse(resourceNodeText);
const macroTemplate = JSON.parse(macroTemplateText);

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

function buildResourceNodes(map, config, seed) {
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
    if (type === 'stone') return ground === 'R'
      && map.grid[y]?.[x + 1] === 'R'
      && map.grid[y + 1]?.[x] === 'R'
      && map.grid[y + 1]?.[x + 1] === 'R';
    if (type === 'gold') return ground === 'R' || ground === 'M';
    if (type === 'food') return ground === 'G' || ground === 'D' || ground === 'F';
    return (config.types[type]?.allowedGrounds || []).includes(ground);
  };
  const nodes = [];
  for (const type of Object.keys(config.types || {})) {
    const buckets = new Map();
    for (let y = 1; y < map.gridHeight - 1; y += 1) {
      for (let x = 1; x < map.gridWidth - 1; x += 1) {
        if (!compatible(type, x, y)) continue;
        const bucket = `${Math.floor(x / regionSize)}:${Math.floor(y / regionSize)}`;
        const list = buckets.get(bucket) || [];
        list.push({ x, y, score: hashSeedParts([seed, 'resource-node', type, x, y]) });
        buckets.set(bucket, list);
      }
    }
    for (const list of buckets.values()) list.sort((left, right) => left.score - right.score || left.y - right.y || left.x - right.x);
    const bucketKeys = [...buckets.keys()].sort();
    const quota = Math.floor(targetPerType / Math.max(1, bucketKeys.length));
    const selected = [];
    const trySelect = candidate => {
      const key = `${candidate.x}:${candidate.y}`;
      if (used.has(key)) return false;
      used.add(key);
      selected.push(candidate);
      return true;
    };
    for (const key of bucketKeys) {
      let added = 0;
      for (const candidate of buckets.get(key)) {
        if (added >= quota || selected.length >= targetPerType) break;
        if (trySelect(candidate)) added += 1;
      }
    }
    const remainder = [...buckets.values()].flat().sort((left, right) => left.score - right.score || left.y - right.y || left.x - right.x);
    for (const candidate of remainder) {
      if (selected.length >= targetPerType) break;
      trySelect(candidate);
    }
    if (selected.length !== targetPerType) throw new RangeError(`insufficient_${type}_resource_nodes`);
    selected.sort((left, right) => left.y - right.y || left.x - right.x);
    selected.forEach((candidate, index) => nodes.push({
      id: `${type}_node_${String(index + 1).padStart(3, '0')}`,
      type,
      gridX: candidate.x,
      gridY: candidate.y,
      rarity: 'common',
      capacity: null
    }));
  }
  return nodes;
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
map.spawnManifest.resourceNodes = buildResourceNodes(map, resourceNodeConfig, patches.productionSeed);
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
