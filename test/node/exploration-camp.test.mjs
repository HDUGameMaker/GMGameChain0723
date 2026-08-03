import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ConfigRegistry, { configRegistry } from '../../src/core/ConfigRegistry.js';
import { BuildingSystem } from '../../src/systems/BuildingSystem.js';

const root = resolve(import.meta.dirname, '../..');
const explorationPath = resolve(root, 'config/exploration-buildings.json');
const overridePath = resolve(root, 'config/building-runtime-overrides.json');

function createRuntime() {
  assert.ok(existsSync(explorationPath), 'exploration building config must exist');
  assert.ok(existsSync(overridePath), 'building runtime override config must exist');
  const registry = new ConfigRegistry();
  registry._configs = {
    buildings: JSON.parse(readFileSync(resolve(root, 'config/buildings.json'), 'utf8')),
    explorationBuildings: JSON.parse(readFileSync(explorationPath, 'utf8')),
    buildingRuntimeOverrides: JSON.parse(readFileSync(overridePath, 'utf8'))
  };
  assert.equal(typeof registry._applyExplorationBuildings, 'function');
  assert.equal(typeof registry._applyBuildingRuntimeOverrides, 'function');
  registry._applyExplorationBuildings();
  registry._applyBuildingRuntimeOverrides();
  return registry;
}

function createBuildingSystem() {
  const registry = createRuntime();
  const rows = Array.from({ length: 12 }, () => 'GGGGGGGGGGGG');
  rows[5] = 'GGGGGMGGGGGG';
  rows[8] = 'GGGMGGGGGGGG';
  const map = {
    gridWidth: 12,
    gridHeight: 12,
    grid: rows,
    groundTypes: {
      G: { name: '草地', buildable: true },
      M: { name: '山脉', buildable: false }
    },
    expeditionEntrances: [{ id: 'cave_a', name: '测试洞穴', gridX: 5, gridY: 5, regionIds: ['mine_periphery'] }],
    eventMarkers: []
  };
  configRegistry._configs = { ...registry._configs, map, adjacency_bonuses: [] };
  const buildings = new BuildingSystem();
  buildings.init();
  buildings.buildings = [{ buildingId: 'warehouse', gridX: 0, gridY: 0, status: 'active', currentWorkers: 0 }];
  return { buildings, map };
}

test('headquarters is a repeatable construction option after the initial settlement', () => {
  const { buildings } = createBuildingSystem();
  assert.equal(configRegistry.getBuilding('warehouse').maxCount, null);
  assert.equal(buildings.canPlaceAt(8, 0, 'warehouse').valid, true);
});

test('exploration camps can cover cave entrances but no other mountain or grass tile', () => {
  const { buildings } = createBuildingSystem();
  assert.equal(buildings.canPlaceAt(5, 5, 'exploration_camp').valid, true);
  assert.deepEqual(buildings.canPlaceAt(3, 8, 'exploration_camp'), {
    valid: false,
    reason: '必须覆盖地图上的洞穴入口'
  });
  assert.deepEqual(buildings.canPlaceAt(6, 6, 'exploration_camp'), {
    valid: false,
    reason: '必须覆盖地图上的洞穴入口'
  });
});

test('a completed exploration camp unlocks its cave without any road dependency', () => {
  const { buildings, map } = createBuildingSystem();
  const entrance = map.expeditionEntrances[0];
  assert.deepEqual(buildings.getExpeditionAccessStatus(entrance), {
    ok: false,
    reason: 'exploration_camp_required'
  });
  buildings.buildings.push({
    buildingId: 'exploration_camp', gridX: 5, gridY: 5, status: 'active', currentWorkers: 0
  });
  assert.deepEqual(buildings.getExpeditionAccessStatus(entrance), { ok: true });
  assert.equal(buildings.getExpeditionEntranceForBuilding(1).id, 'cave_a');
});
