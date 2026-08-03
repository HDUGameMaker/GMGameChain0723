import test from 'node:test';
import assert from 'node:assert/strict';

import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { store } from '../../src/core/Store.js';
import { ArmySystem } from '../../src/systems/ArmySystem.js';
import { EnemyExpansionSystem } from '../../src/systems/EnemyExpansionSystem.js';
import { InvasionSystem } from '../../src/systems/InvasionSystem.js';
import { PopulationSystem } from '../../src/systems/PopulationSystem.js';

function createScenario() {
  eventBus.clear();
  store.setState({ availableUnits: {}, armies: [], armyVersion: 0 });
  configRegistry._configs = {
    global: { population: { growthPerDay: { min: 0, max: 0 } } },
    initial: {},
    enemies: {
      units: [{
        id: 'spears', name: 'Spears', combatPower: 10, commandPoints: 1,
        populationRequired: 1, branch: 'infantry', domain: 'land',
        eraId: 'primitive', unlocked: true, cost: []
      }],
      formations: [],
      invasion: { reviveDelayDays: 3 }
    },
    buildings: [{ id: 'barracks', uniqueFunction: { trainsBranches: ['infantry'] } }],
    historicalContent: {
      eras: [{ id: 'primitive', order: 0 }],
      populationSettings: { initial: 10 }
    }
  };

  const building = {
    buildings: [{ buildingId: 'barracks', status: 'active', gridX: 0, gridY: 0 }],
    getTotalSoldierCount: () => {
      const reserves = Object.values(army.getAvailableUnits()).reduce((sum, count) => sum + count, 0);
      const deployed = army.getArmies().reduce((sum, entry) => sum + entry.unitIds.length, 0);
      return reserves + deployed;
    },
    getTotalSoldierCapacity: () => 10,
    getTotalHousingCapacity: () => 20,
    getTotalAssignedWorkers: () => 0,
    getAssignedWorkersByJob: () => ({})
  };
  const population = new PopulationSystem();
  population.setBuildingSystem(building);
  population.initNew();
  const army = new ArmySystem();
  army.setSystems({
    building,
    population,
    resource: { canAfford: () => true, consumeAll: () => true },
    era: {
      getCurrentEra: () => ({ id: 'primitive', order: 0 }),
      getSelectedCivilization: () => ({ id: 'proto_civilization' })
    },
    tech: { isUnitUnlockedByTech: () => true }
  });
  army.initNew();

  const enemyExpansion = new EnemyExpansionSystem();
  enemyExpansion.setArmySystem(army);
  const invasion = new InvasionSystem();
  invasion.setArmySystem(army);
  globalThis.window = { __game: { systems: { population } } };
  return { army, enemyExpansion, invasion, population };
}

test('reserve batch mutations validate atomically and publish through ArmySystem', () => {
  const { army } = createScenario();
  army.setAvailableUnits({ spears: 2 });
  const reasons = [];
  eventBus.on('armyChanged', event => reasons.push(event.reason));

  assert.equal(army.consumeReserveUnits({ spears: 3 }, 'testLoss'), false);
  assert.equal(army.addReserveUnits({ missing: 1 }, 'testAdd'), false);
  assert.deepEqual(army.getAvailableUnits(), { spears: 2 });
  assert.deepEqual(reasons, []);

  assert.equal(army.consumeReserveUnits({ spears: 1 }, 'testLoss'), true);
  assert.equal(army.addReserveUnits({ spears: 2 }, 'testAdd'), true);
  assert.deepEqual(army.getAvailableUnits(), { spears: 3 });
  assert.deepEqual(store.getState('availableUnits'), { spears: 3 });
  assert.deepEqual(reasons, ['testLoss', 'testAdd']);
});

test('enemy expansion reserve losses remain consumed after later training', () => {
  const { army, enemyExpansion } = createScenario();
  army.setAvailableUnits({ spears: 2 });

  assert.equal(enemyExpansion._consumeArmyPower(10), true);
  assert.equal(army.trainUnitAt(0, 'spears').ok, true);

  assert.deepEqual(army.getAvailableUnits(), { spears: 2 });
  assert.deepEqual(store.getState('availableUnits'), { spears: 2 });
});

test('revived reserves remain present after later training', () => {
  const { army, invasion } = createScenario();
  army.setAvailableUnits({ spears: 1 });
  invasion._pendingRevives = [{ unitIds: ['spears'], reviveDay: 4 }];

  invasion._processPendingRevives(4);
  assert.equal(army.trainUnitAt(0, 'spears').ok, true);

  assert.deepEqual(army.getAvailableUnits(), { spears: 3 });
  assert.deepEqual(store.getState('availableUnits'), { spears: 3 });
});

test('military death and revival adjust available population exactly once', () => {
  const { army, invasion, population } = createScenario();
  army.setAvailableUnits({ spears: 1 });
  const armyId = army.createArmy('Test army').army.id;
  assert.equal(army.addUnit(armyId, 'spears').ok, true);
  const beforeDeath = population.getAvailableWorkers();

  assert.equal(army.dismissUnit(armyId, 'spears').ok, true);
  invasion._applyUnitDeaths(['spears']);
  const afterDeath = population.getAvailableWorkers();

  invasion._pendingRevives = [{ unitIds: ['spears'], reviveDay: 4 }];
  invasion._processPendingRevives(4);
  const afterRevival = population.getAvailableWorkers();

  assert.equal(population.current, 10);
  assert.equal(population.getConstructionWorkers(), 0);
  assert.deepEqual({ beforeDeath, afterDeath, afterRevival }, {
    beforeDeath: 9,
    afterDeath: 10,
    afterRevival: 9
  });
});
