import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import ConfigRegistry from '../../src/core/ConfigRegistry.js';

const mapUrl = new URL('../../config/maps/base_map.json', import.meta.url);
const legacyMapUrl = new URL('../../config/maps/grand_map_v1.json', import.meta.url);
const buildingsUrl = new URL('../../config/buildings.json', import.meta.url);
const historicalContentUrl = new URL('../../config/historical_content.json', import.meta.url);
const projectRoot = new URL('../../', import.meta.url);
const TERRAIN_CODES = new Set(['R', 'G', 'D', 'F', 'M', 'W', 'B', 'S']);
const WATER_CODES = new Set(['W', 'S']);
const MICRO_REGION_SIZE = 25;
const LOCKED_WATER_MASK_HASH = '763a3760a6f936e2828c7f1341e1a0856d722e831b9668a85ff3e47128ffc1b9';

function loadMap() {
  return JSON.parse(readFileSync(mapUrl, 'utf8'));
}

function footprintFitsNode(map, node, building) {
  const width = building.footprint?.width || 1;
  const height = building.footprint?.height || 1;
  const allowed = new Set(building.allowedGrounds || []);
  for (let top = node.gridY - height + 1; top <= node.gridY; top += 1) {
    for (let left = node.gridX - width + 1; left <= node.gridX; left += 1) {
      if (left < 0 || top < 0 || left + width > map.gridWidth || top + height > map.gridHeight) continue;
      let valid = true;
      for (let y = top; y < top + height && valid; y += 1) for (let x = left; x < left + width; x += 1) {
        if (!allowed.has(map.grid[y][x])) valid = false;
      }
      if (valid) return true;
    }
  }
  return false;
}

test('new campaigns load the committed 384 square grand map', () => {
  const map = loadMap();

  assert.equal(map.mapId, 'grand_map_v2');
  assert.equal(map.source, 'fixed_static');
  assert.equal(map.gridWidth, 384);
  assert.equal(map.gridHeight, 384);
  assert.equal(map.tileSize, 60);
  assert.equal(map.grid.length, 384);
  assert.ok(map.grid.every(row => typeof row === 'string' && row.length === 384));
  assert.deepEqual(new Set(map.grid.join('')), TERRAIN_CODES);

  const waterCells = [...map.grid.join('')].filter(code => WATER_CODES.has(code)).length;
  const waterRatio = waterCells / (384 * 384);
  assert.ok(waterRatio >= 0.15 && waterRatio <= 0.20, `water ratio ${waterRatio}`);
  assert.equal(map.generation?.templateId, 'reference_world_2026');
  assert.ok(Math.abs(map.spawnManifest.playerSpawn.gridX - 270) <= 12);
  assert.ok(Math.abs(map.spawnManifest.playerSpawn.gridY - 180) <= 12);
  assert.equal(map.spawnManifest.cityStates.length, 24);
  assert.equal(map.spawnManifest.wildSites.length, 96);

  const nodes = map.spawnManifest.resourceNodes;
  assert.ok(Array.isArray(nodes) && nodes.length >= 1200, `resource nodes ${nodes?.length || 0}`);
  for (const type of ['wood', 'stone', 'food', 'gold']) {
    const typed = nodes.filter(node => node.type === type);
    assert.ok(typed.length >= 250, `${type} nodes ${typed.length}`);
    assert.ok(new Set(typed.map(node => `${Math.floor(node.gridX / 96)}:${Math.floor(node.gridY / 96)}`)).size >= 8,
      `${type} nodes should cover the fixed world's macro regions`);
  }
});

test('the micro-biome pass preserves the approved macro water mask', () => {
  const map = loadMap();
  const serializedMask = map.grid.flatMap((row, y) => [...row].flatMap((code, x) => (
    WATER_CODES.has(code) ? [`${x},${y}:${code};`] : []
  ))).join('');
  assert.equal(createHash('sha256').update(serializedMask).digest('hex'), LOCKED_WATER_MASK_HASH);
});

test('active water terrain uses top-down water art instead of side-view cross-section tiles', () => {
  const map = loadMap();
  assert.equal(map.groundTypes.S.texture, 'assets/map/water.png');
  assert.ok(map.groundTypes.S.textureTint, 'shallow water keeps a distinct top-down tint');
  for (const groundType of Object.values(map.groundTypes)) {
    assert.doesNotMatch(groundType.texture || '', /(grasswater|watergrass)/i);
    for (const override of groundType.neighborOverrides || []) {
      if (WATER_CODES.has(override.match)) assert.doesNotMatch(override.texture || '', /(grasswater|watergrass)/i);
    }
  }
});

test('every meaningful 25 by 25 land region has nearby forest and mine access', () => {
  const map = loadMap();
  const nodes = map.spawnManifest.resourceNodes || [];
  for (let startY = 0; startY < map.gridHeight; startY += MICRO_REGION_SIZE) {
    for (let startX = 0; startX < map.gridWidth; startX += MICRO_REGION_SIZE) {
      const endX = Math.min(map.gridWidth, startX + MICRO_REGION_SIZE);
      const endY = Math.min(map.gridHeight, startY + MICRO_REGION_SIZE);
      const terrain = [];
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          if (!WATER_CODES.has(map.grid[y][x])) terrain.push(map.grid[y][x]);
        }
      }
      if (terrain.length < 25) continue;
      const label = `${startX},${startY}`;
      assert.ok(terrain.filter(code => code === 'F').length >= 4, `${label} lacks a forest patch`);
      assert.ok(terrain.filter(code => code === 'R').length >= 4, `${label} lacks a mine patch`);
      const localNodes = nodes.filter(node => (
        node.gridX >= startX && node.gridX < endX && node.gridY >= startY && node.gridY < endY
      ));
      assert.ok(localNodes.some(node => node.type === 'wood'), `${label} lacks a wood node`);
      assert.ok(localNodes.some(node => node.type === 'food'), `${label} lacks a food node`);
      assert.ok(localNodes.some(node => node.type === 'stone'), `${label} lacks a stone node`);
      assert.ok(localNodes.some(node => node.type === 'gold'), `${label} lacks a gold node`);
    }
  }
});

test('mountains form compact multi-tile ranges instead of one-cell black walls', () => {
  const map = loadMap();
  const mountain = new Set();
  for (let y = 0; y < map.gridHeight; y += 1) for (let x = 0; x < map.gridWidth; x += 1) {
    if (map.grid[y][x] === 'M') mountain.add(`${x},${y}`);
  }
  const components = [];
  while (mountain.size) {
    const first = mountain.values().next().value;
    mountain.delete(first);
    const queue = [first];
    const cells = [];
    for (let head = 0; head < queue.length; head += 1) {
      const key = queue[head];
      cells.push(key);
      const [x, y] = key.split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = `${x + dx},${y + dy}`;
        if (mountain.delete(next)) queue.push(next);
      }
    }
    components.push(cells);
  }
  assert.ok(components.length >= 8, 'multiple mountain ranges should remain represented');
  for (const cells of components) {
    const points = cells.map(key => key.split(',').map(Number));
    const width = Math.max(...points.map(([x]) => x)) - Math.min(...points.map(([x]) => x)) + 1;
    const height = Math.max(...points.map(([, y]) => y)) - Math.min(...points.map(([, y]) => y)) + 1;
    assert.ok(cells.length >= 6 && width >= 3 && height >= 3, `thin mountain component ${width}x${height}/${cells.length}`);
  }
});

test('wood food stone and gold nodes all accept their dedicated gathering buildings', () => {
  const map = loadMap();
  const baseBuildings = JSON.parse(readFileSync(buildingsUrl, 'utf8'));
  const historical = JSON.parse(readFileSync(historicalContentUrl, 'utf8'));
  const gatherers = [...baseBuildings, ...(historical.buildings || [])]
    .filter(building => building.requiredResourceNode);
  const preferredIds = {
    wood: 'logging_camp', food: 'grain_farm', stone: 'stope', gold: 'gold_mine'
  };
  for (const [resourceType, buildingId] of Object.entries(preferredIds)) {
    const building = gatherers.find(candidate => candidate.id === buildingId);
    assert.ok(building, `${resourceType} gathering building is configured`);
    assert.equal(building.requiredResourceNode, resourceType);
    const nodes = map.spawnManifest.resourceNodes.filter(node => node.type === resourceType);
    assert.equal(nodes.length, 320, `${resourceType} node count`);
    for (const node of nodes) {
      assert.ok(footprintFitsNode(map, node, building), `${buildingId} cannot cover ${node.id} at ${node.gridX},${node.gridY}`);
    }
  }
});

test('offline builder reproduces the committed map without rewriting it', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/build-fixed-grand-map.mjs', '--check'],
    { cwd: projectRoot, encoding: 'utf8' }
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /grand_map_v2 is reproducible/);
});

test('the previous fixed map remains available for existing v9 saves', () => {
  const legacy = JSON.parse(readFileSync(legacyMapUrl, 'utf8'));
  assert.equal(legacy.mapId, 'grand_map_v1');
  assert.equal(legacy.gridWidth, 384);
  assert.equal(legacy.gridHeight, 384);
});

test('runtime configuration loading does not request a world generator', async () => {
  const registry = new ConfigRegistry();
  const requested = [];
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const originalLog = console.log;
  globalThis.fetch = async path => {
    requested.push(path);
    return { ok: false, status: 404 };
  };
  console.warn = () => {};
  console.log = () => {};
  try {
    await registry.loadAll();
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    console.log = originalLog;
  }

  assert.equal(requested.includes('config/world-generation.json'), false);
});
