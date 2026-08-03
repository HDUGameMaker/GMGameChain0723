import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { store } from '../../src/core/Store.js';
import { BuildingSystem } from '../../src/systems/BuildingSystem.js';
import { ResourceSystem } from '../../src/systems/ResourceSystem.js';

const root = resolve(import.meta.dirname, '../..');
const economicOrders = JSON.parse(readFileSync(resolve(root, 'config/economic-orders.json'), 'utf8'));

function createFarmSystem() {
  eventBus.clear();
  configRegistry._configs = {
    economicOrders,
    buildings: [{
      id: 'farm', name: '农田', category: 'agriculture', eraId: 'primitive',
      tags: ['farm'], maxWorkers: 6, allowedGrounds: ['G', 'D'],
      footprint: { width: 3, height: 3 }, productionCycle: 'tick',
      production: { perWorker: true, output: [{ resourceId: 'food', amount: 3 }] },
      unlockConditions: []
    }],
    resources: [
      { id: 'wood', name: '木材', initial: 0, max: 1000 },
      { id: 'stone', name: '石头', initial: 0, max: 1000 },
      { id: 'food', name: '食物', initial: 0, max: 1000 },
      { id: 'gold', name: '黄金', initial: 0, max: 1000 }
    ],
    historicalContent: { eras: [{ id: 'primitive', name: '原始时代' }], civilizations: [] }
  };
  store.setState({ timeDay: 12 });
  const system = new BuildingSystem();
  system.setTechSystem({ isResearched: techId => techId === 'farming' });
  system.buildings = [{
    buildingId: 'farm', gridX: 10, gridY: 10, status: 'active', currentWorkers: 3,
    cropId: 'grain', pendingCropId: null, cropLuxuryProgress: 0
  }];
  return system;
}

test('a farm owns its crop and schedules crop changes for the next day', () => {
  const system = createFarmSystem();

  assert.deepEqual(system.setFarmCrop(0, 'vegetables'), { ok: true, effectiveOnDay: 13 });
  assert.equal(system.getFarmOperation(0).cropId, 'grain');
  assert.equal(system.getFarmOperation(0).pendingCropId, 'vegetables');

  system.applyPendingFarmCrops(13);
  assert.equal(system.getFarmOperation(0).cropId, 'vegetables');
  assert.equal(system.getFarmOperation(0).pendingCropId, null);
});

test('farm output comes from the selected crop and current farm workers', () => {
  const system = createFarmSystem();
  const operation = system.getFarmOperation(0);

  assert.deepEqual(operation.outputs, [{ resourceId: 'food', amount: 4.2 }]);
  assert.equal(operation.workers, 3);
  assert.equal(operation.maxWorkers, 6);
});

test('farm work ticks produce the selected crop instead of the generic building recipe', () => {
  const system = createFarmSystem();
  const resources = new ResourceSystem();
  resources.initFromConfig();
  system.setResourceSystem(resources);

  eventBus.emit('workTick', { isWorkPeriod: true });

  assert.equal(resources.getAmount('food'), 4);
});

test('farm production preview reports the selected crop recipe', () => {
  const system = createFarmSystem();
  const preview = system.getBuildingDailyProductionPreview(0);

  assert.deepEqual(preview.outputStandard, [{ resourceId: 'food', amount: 1.4 }]);
  assert.deepEqual(preview.dailyOutput, [{ resourceId: 'food', amount: 24 }]);
});

test('farm crop state survives the building save boundary', () => {
  const system = createFarmSystem();
  system.setFarmCrop(0, 'vegetables');
  const saved = system.getAllStates();

  const restored = createFarmSystem();
  restored.restoreState(saved);

  assert.equal(restored.getFarmOperation(0).cropId, 'grain');
  assert.equal(restored.getFarmOperation(0).pendingCropId, 'vegetables');
  assert.equal(restored.getFarmOperation(0).pendingCropDay, 13);
});
