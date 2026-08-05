import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { BuildingSystem } from '../../src/systems/BuildingSystem.js';
import { ResourceNodeSystem } from '../../src/systems/ResourceNodeSystem.js';

const runtimeOverrides = JSON.parse(fs.readFileSync(new URL('../../config/building-runtime-overrides.json', import.meta.url), 'utf8'));

function makeNodeSystem(nodes) {
  const system = new ResourceNodeSystem();
  system.initFromManifest(nodes);
  return system;
}

test('both stone gathering buildings use a one-cell runtime footprint', () => {
  assert.deepEqual(runtimeOverrides.buildings.stope?.footprint, { width: 1, height: 1 });
  assert.deepEqual(runtimeOverrides.buildings.stone_quarry?.footprint, { width: 1, height: 1 });
});

test('a one-cell quarry places exactly on a stone node and nowhere beside it', () => {
  eventBus.clear();
  configRegistry._configs = {
    map: {
      gridWidth: 4,
      gridHeight: 4,
      grid: Array.from({ length: 4 }, () => 'RRRR'),
      groundTypes: { R: { name: '裸露岩石', buildable: 'restricted' } }
    },
    buildings: [{
      id: 'stope', name: '采石场', footprint: { width: 1, height: 1 },
      allowedGrounds: ['R'], requiredResourceNode: 'stone', unlockConditions: [],
      buildCost: [], maxCount: null, maxWorkers: 5
    }],
    historicalContent: { eras: [], civilizations: [] }
  };
  const nodes = makeNodeSystem([{ id: 'stone_1', type: 'stone', gridX: 2, gridY: 2, rarity: 'common' }]);
  const buildings = new BuildingSystem();
  buildings.setResourceSystem({ consumeAll: () => true, setStorageMultiplier() {} });
  buildings.setResourceNodeSystem(nodes);
  buildings.init();

  assert.equal(buildings.canPlaceAt(1, 2, 'stope').valid, false);
  assert.equal(buildings.canPlaceAt(2, 2, 'stope').valid, true);
  assert.equal(buildings.placeBuilding(2, 2, 'stope'), true);
  assert.equal(nodes.getNodeAt(2, 2).developedByBuildingId, 'building_1');
});

test('a gathering building claims a matching node and demolition releases it', () => {
  eventBus.clear();
  configRegistry._configs = {
    map: {
      gridWidth: 20,
      gridHeight: 20,
      grid: Array.from({ length: 20 }, () => 'R'.repeat(20)),
      groundTypes: { R: { name: '岩地', buildable: 'restricted' } }
    },
    buildings: [{
      id: 'stope', name: '采石场', footprint: { width: 2, height: 2 },
      allowedGrounds: ['R'], requiredResourceNode: 'stone', unlockConditions: [],
      buildCost: [], maxCount: null, maxWorkers: 5
    }],
    historicalContent: { eras: [], civilizations: [] }
  };
  const nodes = makeNodeSystem([
    { id: 'stone_1', type: 'stone', gridX: 5, gridY: 6, rarity: 'common', capacity: null }
  ]);
  const buildings = new BuildingSystem();
  buildings.setResourceSystem({ consumeAll: () => true, setStorageMultiplier() {} });
  buildings.setResourceNodeSystem(nodes);
  buildings.init();

  assert.equal(buildings.canPlaceAt(4, 5, 'stope').valid, true);
  assert.equal(buildings.canPlaceAt(8, 8, 'stope').valid, false);
  assert.equal(buildings.placeBuilding(4, 5, 'stope'), true);
  assert.equal(buildings.buildings[0].instanceId, 'building_1');
  assert.equal(nodes.getNodeAt(5, 6).developedByBuildingId, 'building_1');

  assert.equal(buildings.demolishBuilding(0), true);
  assert.equal(nodes.getNodeAt(5, 6).developedByBuildingId, null);
});

test('common nodes never deplete while rare nodes recover and persist', () => {
  const nodes = makeNodeSystem([
    { id: 'wood_1', type: 'wood', gridX: 1, gridY: 2, rarity: 'common', capacity: null },
    { id: 'amber_1', type: 'amber', gridX: 3, gridY: 4, rarity: 'rare', capacity: 2, recoveryDays: 3 }
  ]);

  assert.deepEqual(nodes.consume('wood_1', 500), { ok: true, remaining: null });
  assert.deepEqual(nodes.consume('amber_1', 2, 10), { ok: true, remaining: 0, recoveryDay: 13 });
  assert.equal(nodes.consume('amber_1', 1, 11).ok, false);

  const saved = nodes.getState();
  const restored = makeNodeSystem([]);
  restored.restoreState(saved);
  assert.equal(restored.getNodeAt(3, 4).remaining, 0);
  restored.onDayStart(13);
  assert.equal(restored.getNodeAt(3, 4).remaining, 2);
});

test('luxury deposits retain their luxury identity and map cue through save restore', () => {
  const nodes = makeNodeSystem([
    { id: 'luxury_silk_1', type: 'luxury', luxuryId: 'silk', visualCue: 'silk_bales', gridX: 3, gridY: 4, rarity: 'common', cityStateGenerated: true, lockedByCityStateId: 'city', locked: false }
  ]);
  assert.equal(nodes.getNode('luxury_silk_1').luxuryId, 'silk');
  assert.equal(nodes.getNode('luxury_silk_1').visualCue, 'silk_bales');
  const restored = makeNodeSystem([]);
  restored.restoreState(nodes.getState());
  assert.equal(restored.getNode('luxury_silk_1').luxuryId, 'silk');
  assert.equal(restored.getNode('luxury_silk_1').visualCue, 'silk_bales');
});

test('node claims reject mismatches and duplicate development', () => {
  const nodes = makeNodeSystem([
    { id: 'gold_1', type: 'gold', gridX: 7, gridY: 8, rarity: 'common', capacity: null }
  ]);

  assert.deepEqual(nodes.claimNode('gold_1', 'building_1', 'stone'), { ok: false, reason: 'type_mismatch' });
  assert.deepEqual(nodes.claimNode('gold_1', 'building_1', 'gold'), { ok: true });
  assert.deepEqual(nodes.claimNode('gold_1', 'building_2', 'gold'), { ok: false, reason: 'already_developed' });
});

test('all four gathering buildings place on and claim their matching resource nodes', () => {
  eventBus.clear();
  configRegistry._configs = {
    map: {
      gridWidth: 8,
      gridHeight: 4,
      grid: ['FFGGRRRR', 'FFGGRRRR', 'GGDDRRRR', 'GGDDRRRR'],
      groundTypes: {
        F: { name: '林地', buildable: true },
        G: { name: '草地', buildable: true },
        D: { name: '土地', buildable: true },
        R: { name: '矿脉', buildable: 'restricted' }
      }
    },
    buildings: [
      { id: 'logging_camp', name: '伐木集散点', footprint: { width: 1, height: 1 }, allowedGrounds: ['F'], requiredResourceNode: 'wood', unlockConditions: [], buildCost: [], maxCount: null, maxWorkers: 3 },
      { id: 'grain_farm', name: '粮食农场', footprint: { width: 1, height: 1 }, allowedGrounds: ['G', 'D'], requiredResourceNode: 'food', unlockConditions: [], buildCost: [], maxCount: null, maxWorkers: 3 },
      { id: 'stope', name: '采石场', footprint: { width: 2, height: 2 }, allowedGrounds: ['R'], requiredResourceNode: 'stone', unlockConditions: [], buildCost: [], maxCount: null, maxWorkers: 3 },
      { id: 'gold_mine', name: '金矿', footprint: { width: 1, height: 1 }, allowedGrounds: ['R'], requiredResourceNode: 'gold', unlockConditions: [], buildCost: [], maxCount: null, maxWorkers: 3 }
    ],
    historicalContent: { eras: [], civilizations: [] }
  };
  const nodes = makeNodeSystem([
    { id: 'wood_1', type: 'wood', gridX: 0, gridY: 0, rarity: 'common', capacity: null },
    { id: 'food_1', type: 'food', gridX: 2, gridY: 0, rarity: 'common', capacity: null },
    { id: 'stone_1', type: 'stone', gridX: 4, gridY: 0, rarity: 'common', capacity: null },
    { id: 'gold_1', type: 'gold', gridX: 7, gridY: 2, rarity: 'common', capacity: null }
  ]);
  const buildings = new BuildingSystem();
  buildings.setResourceSystem({ consumeAll: () => true, setStorageMultiplier() {} });
  buildings.setResourceNodeSystem(nodes);
  buildings.init();

  for (const [buildingId, gridX, gridY, nodeId] of [
    ['logging_camp', 0, 0, 'wood_1'],
    ['grain_farm', 2, 0, 'food_1'],
    ['stope', 4, 0, 'stone_1'],
    ['gold_mine', 7, 2, 'gold_1']
  ]) {
    assert.equal(buildings.canPlaceAt(gridX, gridY, buildingId).valid, true, buildingId);
    assert.equal(buildings.placeBuilding(gridX, gridY, buildingId), true, buildingId);
    assert.ok(nodes.getNode(nodeId).developedByBuildingId, `${nodeId} claimed`);
  }
});

test('a staffed trade post slowly gathers the luxury bound to its deposit', () => {
  eventBus.clear();
  configRegistry._configs = {
    map: {
      gridWidth: 4, gridHeight: 4, grid: Array.from({ length: 4 }, () => 'GGGG'),
      groundTypes: { G: { name: '草地', buildable: true } }
    },
    buildings: [{
      id: 'trade_post', name: '贸易站', footprint: { width: 1, height: 1 },
      allowedGrounds: ['G'], requiredResourceNode: 'luxury', unlockConditions: [],
      buildCost: [], maxCount: null, maxWorkers: 3,
      production: { perWorker: true, output: [] },
      boundLuxuryYield: { intervalWorkerTicks: 6, amount: 1 }
    }],
    historicalContent: { eras: [], civilizations: [] }
  };
  const nodes = makeNodeSystem([
    { id: 'luxury_tea_1', type: 'luxury', luxuryId: 'tea', gridX: 1, gridY: 1, rarity: 'common', cityStateGenerated: true, lockedByCityStateId: 'city', locked: false }
  ]);
  const gathered = [];
  const buildings = new BuildingSystem();
  buildings.setResourceSystem({ consumeAll: () => true, setStorageMultiplier() {} });
  buildings.setResourceNodeSystem(nodes);
  buildings.setLuxurySystem({ addLuxury: (id, amount) => gathered.push([id, amount]) });
  buildings.init();
  assert.equal(buildings.placeBuilding(1, 1, 'trade_post'), true);
  buildings.buildings[0].currentWorkers = 2;
  buildings._processProduction(buildings.buildings[0]);
  buildings._processProduction(buildings.buildings[0]);
  assert.deepEqual(gathered, []);
  buildings._processProduction(buildings.buildings[0]);
  assert.deepEqual(gathered, [['tea', 1]]);
});
test('static and city-state luxury deposits both remain on the map', () => {
  const system = new ResourceNodeSystem();
  system.initFromManifest([
    { id: 'wild_luxury', type: 'luxury', luxuryId: 'silk', gridX: 1, gridY: 1 },
    { id: 'wood', type: 'wood', gridX: 2, gridY: 2 }
  ]);
  system.setCityStateNodes([{ id: 'city_luxury', type: 'luxury', luxuryId: 'jade', gridX: 3, gridY: 3, locked: true, lockedByCityStateId: 'city' }]);
  assert.deepEqual(system.getNodes().map(node => node.id).sort(), ['city_luxury', 'wild_luxury', 'wood']);
});

test('luxury deposits disappear permanently after yielding two copies', () => {
  const system = makeNodeSystem([{ id: 'silk', type: 'luxury', luxuryId: 'silk', gridX: 1, gridY: 1 }]);
  assert.equal(system.getNode('silk').remaining, 2);
  assert.equal(system.consume('silk', 1).remaining, 1);
  assert.equal(system.consume('silk', 1).remaining, 0);
  assert.equal(system.getNodeAt(1, 1), null);
  system.onDayStart(999);
  assert.equal(system.getNodeAt(1, 1), null);
});
