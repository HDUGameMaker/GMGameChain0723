import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const quests = JSON.parse(readFileSync(resolve(root, 'config/quests.json'), 'utf8'));
const baseBuildings = JSON.parse(readFileSync(resolve(root, 'config/buildings.json'), 'utf8'));
const historical = JSON.parse(readFileSync(resolve(root, 'config/historical_content.json'), 'utf8'));
const map = JSON.parse(readFileSync(resolve(root, 'config/maps/base_map.json'), 'utf8'));

test('every tutorial building objective references a constructible building', () => {
  const buildingIds = new Set([...baseBuildings, ...(historical.buildings || [])].map(building => building.id));
  const requested = quests.tutorial
    .filter(quest => quest.type === 'build_building')
    .flatMap(quest => quest.target?.buildings || []);
  assert.ok(requested.length > 0);
  for (const buildingId of requested) {
    assert.ok(buildingIds.has(buildingId), `tutorial references missing building ${buildingId}`);
  }
});

test('the first expedition cave is reachable from the initial settlement', () => {
  const spawn = map.spawnManifest.playerSpawn;
  const distances = map.expeditionEntrances.map(entrance => ({
    entrance,
    distance: Math.abs(entrance.gridX - spawn.gridX) + Math.abs(entrance.gridY - spawn.gridY)
  })).sort((left, right) => left.distance - right.distance);
  assert.ok(distances.length >= 8);
  assert.ok(distances[0].distance <= 25, `nearest cave is ${distances[0].distance} road tiles away`);
  assert.ok(['M', 'B'].includes(map.grid[distances[0].entrance.gridY][distances[0].entrance.gridX]));
});
