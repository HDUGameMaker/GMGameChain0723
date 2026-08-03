import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const map = JSON.parse(readFileSync(resolve(root, 'config/maps/base_map.json'), 'utf8'));
const integration = JSON.parse(readFileSync(resolve(root, 'config/ea_integration.json'), 'utf8'));

test('grand map dedicates fifteen to twenty percent to connected shallow and deep water', () => {
  const water = [];
  for (let y = 0; y < map.gridHeight; y++) for (let x = 0; x < map.gridWidth; x++) {
    if (['S', 'W'].includes(map.grid[y][x])) water.push({ x, y });
  }
  const ratio = water.length / (map.gridWidth * map.gridHeight);
  assert.ok(ratio >= 0.15 && ratio <= 0.20, `water ratio ${ratio}`);
  assert.ok(map.grid.some(row => row.includes('S')), 'shallow water exists');
  assert.ok(map.grid.some(row => row.includes('W')), 'deep water exists');

  const keys = new Set(water.map(cell => `${cell.x},${cell.y}`));
  const visited = new Set();
  const queue = [water[0]];
  while (queue.length) {
    const cell = queue.shift();
    const key = `${cell.x},${cell.y}`;
    if (visited.has(key)) continue;
    visited.add(key);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = `${cell.x + dx},${cell.y + dy}`;
      if (keys.has(next) && !visited.has(next)) queue.push({ x: cell.x + dx, y: cell.y + dy });
    }
  }
  assert.ok(visited.size / water.length >= 0.9, 'the primary navigable water network covers at least ninety percent');
});

test('starting settlement stays on land and fixed naval city-state stays in water', () => {
  for (const building of map.initialBuildings) assert.ok(!['S', 'W'].includes(map.grid[building.gridY][building.gridX]), building.buildingId);
  for (const outpost of map.spawnManifest.cityStates) {
    const water = ['S', 'W'].includes(map.grid[outpost.gridY][outpost.gridX]);
    assert.equal(water, outpost.domain === 'naval', outpost.id);
  }
  const landTypes = new Set(map.grid.flat().filter(cell => !['S', 'W'].includes(cell)));
  assert.ok(landTypes.size >= 5, 'forests, mountains, grassland, desert and rock remain represented');
});
