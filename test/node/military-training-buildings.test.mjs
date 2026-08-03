import test from 'node:test';
import assert from 'node:assert/strict';

import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { ArmySystem } from '../../src/systems/ArmySystem.js';

function createScenario() {
  eventBus.clear();
  configRegistry._configs = {
    enemies: {
      units: [
        {
          id: 'primitive_infantry_1', name: '氏族战士', branch: 'infantry', domain: 'land',
          eraId: 'primitive', populationRequired: 1, commandPoints: 1, unlocked: true,
          cost: [{ resourceId: 'wood', amount: 10 }]
        },
        {
          id: 'primitive_anti_cavalry_3', name: '猎矛手', branch: 'anti_cavalry', domain: 'land',
          eraId: 'primitive', populationRequired: 1, commandPoints: 1, unlocked: true,
          cost: [{ resourceId: 'stone', amount: 4 }]
        },
        {
          id: 'primitive_ranged_2', name: '投石手', branch: 'ranged', domain: 'land',
          eraId: 'primitive', populationRequired: 1, commandPoints: 1, unlocked: true,
          cost: [{ resourceId: 'wood', amount: 8 }]
        },
        {
          id: 'ancient_infantry_1', name: '古代步兵', branch: 'infantry', domain: 'land',
          eraId: 'ancient', populationRequired: 1, commandPoints: 1, unlocked: false,
          cost: [{ resourceId: 'wood', amount: 12 }]
        }
      ],
      formations: []
    },
    buildings: [
      { id: 'work_shed', soldierCapacity: 3, uniqueFunction: { trainsBranches: ['infantry', 'anti_cavalry'] } },
      { id: 'archery_range', uniqueFunction: { trainsBranches: ['ranged', 'archer'] } },
      { id: 'warehouse', uniqueFunction: {} }
    ],
    historicalContent: {
      eras: [
        { id: 'primitive', order: 0 },
        { id: 'ancient', order: 1 }
      ]
    }
  };

  const building = {
    buildings: [
      { buildingId: 'work_shed', status: 'active' },
      { buildingId: 'archery_range', status: 'active' },
      { buildingId: 'warehouse', status: 'active' }
    ],
    getTotalSoldierCount: () => Object.values(army.getAvailableUnits()).reduce((sum, count) => sum + count, 0),
    getTotalSoldierCapacity: () => 3
  };
  const resourceAmounts = { wood: 20, stone: 20 };
  const consumed = [];
  const resource = {
    canAfford: costs => costs.every(cost => resourceAmounts[cost.resourceId] >= cost.amount),
    consumeAll: costs => {
      if (!resource.canAfford(costs)) return false;
      for (const cost of costs) resourceAmounts[cost.resourceId] -= cost.amount;
      consumed.push(structuredClone(costs));
      return true;
    }
  };
  const tech = { isUnitUnlockedByTech: unitId => unitId !== 'ancient_infantry_1' };
  const era = {
    getCurrentEra: () => ({ id: 'primitive', order: 0 }),
    getSelectedCivilization: () => ({ id: 'proto_civilization' })
  };
  const population = {
    getAvailableWorkers: () => 2 - Object.entries(army.getAvailableUnits()).reduce((sum, [unitId, count]) => {
      const unit = configRegistry.get('enemies').units.find(item => item.id === unitId);
      return sum + count * (unit.populationRequired || 1);
    }, 0)
  };
  const army = new ArmySystem();
  army.setSystems({ building, resource, population, tech, era });
  army.initNew();
  return { army, building, resourceAmounts, consumed };
}

test('training buildings expose only their configured branches', () => {
  const { army } = createScenario();
  assert.deepEqual(army.getTrainableUnitsAt(0).map(unit => unit.branch), ['infantry', 'anti_cavalry', 'infantry']);
  assert.ok(army.getTrainableUnitsAt(1).every(unit => ['ranged', 'archer'].includes(unit.branch)));
  assert.deepEqual(army.getTrainableUnitsAt(2), []);
});

test('training atomically consumes cost and population capacity into one reserve without deploying an army', () => {
  const { army, resourceAmounts, consumed } = createScenario();
  const trainedEvents = [];
  eventBus.on('unitTrained', payload => trainedEvents.push(payload));

  const result = army.trainUnitAt(0, 'primitive_infantry_1');

  assert.deepEqual(result, { ok: true, reserve: 1 });
  assert.equal(resourceAmounts.wood, 10);
  assert.deepEqual(consumed, [[{ resourceId: 'wood', amount: 10 }]]);
  assert.equal(army.getAvailableUnits().primitive_infantry_1, 1);
  assert.equal(army.getArmies().length, 0);
  assert.deepEqual(trainedEvents, [{ unitId: 'primitive_infantry_1', amount: 1, buildingIndex: 0 }]);
});

test('training rejects incompatible, inactive, invalid and missing buildings', () => {
  const { army, building } = createScenario();
  assert.equal(army.trainUnitAt(1, 'primitive_infantry_1').reason, 'branch_not_supported');
  building.buildings[1].status = 'constructing';
  assert.equal(army.trainUnitAt(1, 'primitive_ranged_2').reason, 'invalid_training_building');
  assert.equal(army.trainUnitAt(2, 'primitive_infantry_1').reason, 'invalid_training_building');
  assert.equal(army.trainUnitAt(99, 'primitive_infantry_1').reason, 'invalid_training_building');
  assert.equal(army.trainUnitAt(0, 'missing_unit').reason, 'unknown_unit');
});

test('failed resource, population, unlock and era checks leave resources and reserves unchanged', () => {
  const { army, resourceAmounts, consumed } = createScenario();
  resourceAmounts.wood = 0;
  assert.equal(army.trainUnitAt(0, 'primitive_infantry_1').reason, 'insufficient_resources');
  assert.deepEqual(army.getAvailableUnits(), {});
  assert.deepEqual(consumed, []);

  resourceAmounts.wood = 20;
  assert.equal(army.trainUnitAt(0, 'ancient_infantry_1').reason, 'unit_locked');
  assert.deepEqual(army.getAvailableUnits(), {});

  assert.equal(army.trainUnitAt(0, 'primitive_infantry_1').ok, true);
  assert.equal(army.trainUnitAt(0, 'primitive_anti_cavalry_3').ok, true);
  assert.equal(army.trainUnitAt(0, 'primitive_infantry_1').reason, 'insufficient_population');
  assert.equal(army.getAvailableUnits().primitive_infantry_1, 1);
  assert.equal(army.getAvailableUnits().primitive_anti_cavalry_3, 1);
});
