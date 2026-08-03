import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { buildFixedWorld } from './lib/FixedWorldBuilder.js';
import { hashSeedParts } from '../src/core/RandomService.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const mapPath = resolve(projectRoot, 'config/maps/base_map.json');
const patchPath = resolve(projectRoot, 'config/maps/grand_map_patches.json');
const checking = process.argv.includes('--check');

const [committedText, patchText, worldText, integrationText, resourceNodeText] = await Promise.all([
  readFile(mapPath, 'utf8'),
  readFile(patchPath, 'utf8'),
  readFile(resolve(projectRoot, 'config/world-factions.json'), 'utf8'),
  readFile(resolve(projectRoot, 'config/ea_integration.json'), 'utf8'),
  readFile(resolve(projectRoot, 'config/resource-nodes.json'), 'utf8')
]);
const template = JSON.parse(committedText);
const patches = JSON.parse(patchText);
const world = JSON.parse(worldText);
const integration = JSON.parse(integrationText);
const resourceNodeConfig = JSON.parse(resourceNodeText);

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
const map = buildFixedWorld({
  width: 384,
  height: 384,
  seed: patches.productionSeed,
  patches,
  template
});
map.spawnManifest.cityStates = [...integration.outposts, ...world.cityStates].map(state => ({
  id: state.id,
  gridX: state.gridX,
  gridY: state.gridY,
  domain: state.domain
}));
map.spawnManifest.wildSites = world.wildSites.map(site => ({
  id: site.id,
  gridX: site.gridX,
  gridY: site.gridY,
  domain: site.domain,
  territoryRadius: site.territoryRadius,
  threatBand: site.threatBand
}));
map.spawnManifest.resourceNodes = buildResourceNodes(map, resourceNodeConfig, patches.productionSeed);
const generatedText = `${JSON.stringify(map, null, 2)}\n`;

if (checking) {
  if (generatedText !== committedText.replace(/\r\n/g, '\n')) {
    console.error('grand_map_v1 differs from the reproducible offline build');
    process.exitCode = 1;
  } else {
    console.log('grand_map_v1 is reproducible');
  }
} else {
  await writeFile(mapPath, generatedText, 'utf8');
  console.log(`wrote fixed grand_map_v1 (${map.gridWidth}x${map.gridHeight})`);
}
