import test from 'node:test';
import assert from 'node:assert/strict';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { ResourceSystem } from '../../src/systems/ResourceSystem.js';
import { PopulationSystem } from '../../src/systems/PopulationSystem.js';
import { BuildingSystem } from '../../src/systems/BuildingSystem.js';

function createScenario() {
  eventBus.clear();
  configRegistry._configs = {
    global: { population: { growthPerDay: { min: 0, max: 0 }, declineDelayDays: 2 } },
    initial: { population: { initial: 12 }, populationGrowth: { min: 0, max: 0 }, foodPerPerson: 1, inspirationPerPerson: 1 },
    historicalContent: { populationSettings: { initial: 12, foodPerPerson: 1, baseSatisfaction: 60, starvationEmigrationThreshold: 35 } },
    resources: [
      { id: 'wood', name: '木材', initial: 100, max: 1000 },
      { id: 'stone', name: '石材', initial: 100, max: 1000 },
      { id: 'food', name: '食物', initial: 100, max: 1000 },
      { id: 'gold', name: '黄金', initial: 100, max: 1000 }
    ],
    buildings: [
      { id: 'house', housingCapacity: 20, maxWorkers: 0 },
      { id: 'farm', maxWorkers: 4, jobType: 'gathering', productionCycle: 'day', production: { perWorker: true, output: [{ resourceId: 'food', amount: 3 }] } },
      { id: 'academy', maxWorkers: 4, jobType: 'research', uniqueFunction: { unlockSystem: 'tech', sciencePerWorker: 1.5 } },
      { id: 'civic_hall', maxWorkers: 4, jobType: 'civic', uniqueFunction: { unlockSystem: 'civics', civicPerWorker: 1.25 } }
    ],
    adjacency_bonuses: [],
    enemies: { units: [] }
  };
  const resources = new ResourceSystem();
  resources.initFromConfig();
  const population = new PopulationSystem();
  const buildings = new BuildingSystem();
  buildings.setResourceSystem(resources);
  buildings.setPopulationSystem(population);
  population.setResourceSystem(resources);
  population.setBuildingSystem(buildings);
  buildings.buildings = [
    { buildingId: 'house', status: 'active', currentWorkers: 0 },
    { buildingId: 'farm', status: 'active', currentWorkers: 0 },
    { buildingId: 'academy', status: 'active', currentWorkers: 0 },
    { buildingId: 'civic_hall', status: 'active', currentWorkers: 0 }
  ];
  population.initNew();
  return { resources, population, buildings };
}

test('new settlements restore population, housing and assignable building jobs', () => {
  const { population, buildings } = createScenario();
  assert.equal(population.current, 12);
  assert.equal(population.getHousingCapacity(), 20);
  assert.equal(population.getAvailableWorkers(), 12);
  assert.equal(buildings.assignWorker(2), true);
  assert.equal(buildings.assignWorker(2), true);
  assert.equal(population.getAvailableWorkers(), 10);
  assert.equal(buildings.getWorkforceOutputs().science, 3);
  assert.equal(buildings.getWorkforceOutputs().civics, 0);
});

test('research and civic buildings unlock their systems with zero workers but produce zero points', () => {
  const { buildings } = createScenario();
  const academy = buildings.getBuildingFunctionState(2);
  const civicHall = buildings.getBuildingFunctionState(3);
  assert.equal(academy.unlockedSystem, 'tech');
  assert.equal(academy.outputPerTick, 0);
  assert.equal(civicHall.unlockedSystem, 'civics');
  assert.equal(civicHall.outputPerTick, 0);
});

test('daily settlement consumes food and shortage lowers satisfaction and population', () => {
  const { resources, population } = createScenario();
  population.onDayStart();
  assert.equal(resources.getAmount('food'), 88);
  assert.equal(population.current, 12);
  resources._resources.food.current = 2;
  const beforeSatisfaction = population.satisfaction;
  population.onDayStart();
  assert.equal(resources.getAmount('food'), 0);
  assert.ok(population.current < 12);
  assert.ok(population.satisfaction < beforeSatisfaction);
});

test('completed job buildings no longer auto-fill every available worker', () => {
  const { buildings } = createScenario();
  const building = buildings.buildings[2];
  buildings._completeConstruction(building, configRegistry.getBuilding('academy'));
  assert.equal(building.currentWorkers, 0);
});
