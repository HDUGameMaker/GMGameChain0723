import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import ConfigRegistry from '../../src/core/ConfigRegistry.js';

const mapUrl = new URL('../../config/maps/base_map.json', import.meta.url);
const projectRoot = new URL('../../', import.meta.url);
const TERRAIN_CODES = new Set(['R', 'G', 'D', 'F', 'M', 'W', 'B', 'S']);
const WATER_CODES = new Set(['W', 'S']);

function loadMap() {
  return JSON.parse(readFileSync(mapUrl, 'utf8'));
}

test('new campaigns load the committed 384 square grand map', () => {
  const map = loadMap();

  assert.equal(map.mapId, 'grand_map_v1');
  assert.equal(map.source, 'fixed_static');
  assert.equal(map.gridWidth, 384);
  assert.equal(map.gridHeight, 384);
  assert.equal(map.tileSize, 60);
  assert.equal(map.grid.length, 384);
  assert.ok(map.grid.every(row => typeof row === 'string' && row.length === 384));
  assert.deepEqual(new Set(map.grid.join('')), TERRAIN_CODES);

  const waterCells = [...map.grid.join('')].filter(code => WATER_CODES.has(code)).length;
  const waterRatio = waterCells / (384 * 384);
  assert.ok(waterRatio >= 0.29 && waterRatio <= 0.35, `water ratio ${waterRatio}`);
});

test('offline builder reproduces the committed map without rewriting it', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/build-fixed-grand-map.mjs', '--check'],
    { cwd: projectRoot, encoding: 'utf8' }
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /grand_map_v1 is reproducible/);
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
