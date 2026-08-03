import assert from 'node:assert/strict';
import test from 'node:test';

import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { BuildingSystem } from '../../src/systems/BuildingSystem.js';
import { ResourceNodeSystem } from '../../src/systems/ResourceNodeSystem.js';

function makeNodeSystem(nodes) {
  const system = new ResourceNodeSystem();
  system.initFromManifest(nodes);
  return system;
}

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

test('node claims reject mismatches and duplicate development', () => {
  const nodes = makeNodeSystem([
    { id: 'gold_1', type: 'gold', gridX: 7, gridY: 8, rarity: 'common', capacity: null }
  ]);

  assert.deepEqual(nodes.claimNode('gold_1', 'building_1', 'stone'), { ok: false, reason: 'type_mismatch' });
  assert.deepEqual(nodes.claimNode('gold_1', 'building_1', 'gold'), { ok: true });
  assert.deepEqual(nodes.claimNode('gold_1', 'building_2', 'gold'), { ok: false, reason: 'already_developed' });
});
