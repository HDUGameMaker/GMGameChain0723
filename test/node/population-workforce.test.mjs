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
      { id: 'civic_hall', maxWorkers: 4, jobType: 'civic', uniqueFunction: { unlockSystem: 'civics', civicPerWorker: 1.25 } },
      {
        id: 'warehouse',
        maxWorkers: 0,
        uniqueFunction: {
          workerRecruitment: {
            amount: 1,
            cost: [{ resourceId: 'food', amount: 20 }]
          }
        }
      }
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
    { buildingId: 'civic_hall', status: 'active', currentWorkers: 0 },
    { buildingId: 'warehouse', status: 'active', currentWorkers: 0 }
  ];
  population.initNew();
  return { resources, population, buildings, warehouseIndex: 4 };
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

test('food shortage lowers satisfaction but never removes recruited civilians', () => {
  const { resources, population } = createScenario();
  population.onDayStart();
  assert.equal(resources.getAmount('food'), 88);
  assert.equal(population.current, 12);
  resources._resources.food.current = 2;
  const beforeSatisfaction = population.satisfaction;
  for (let day = 0; day < 5; day += 1) population.onDayStart();
  assert.equal(resources.getAmount('food'), 0);
  assert.equal(population.current, 12);
  assert.ok(population.satisfaction < beforeSatisfaction);
  assert.equal(population.getDailyGrowthPreview().max, 0);
});

test('completed job buildings no longer auto-fill every available worker', () => {
  const { buildings } = createScenario();
  const building = buildings.buildings[2];
  buildings._completeConstruction(building, configRegistry.getBuilding('academy'));
  assert.equal(building.currentWorkers, 0);
});

test('active headquarters recruits one idle worker for configured food', () => {
  const { resources, population, buildings, warehouseIndex } = createScenario();
  const result = buildings.recruitWorker(warehouseIndex);
  assert.deepEqual(result, { ok: true, population: 13 });
  assert.equal(resources.getAmount('food'), 80);
  assert.equal(population.getAvailableWorkers(), 13);
});

test('headquarters recruitment fails atomically without food or housing room', () => {
  const { resources, population, buildings, warehouseIndex } = createScenario();
  resources._resources.food.current = 19;
  assert.deepEqual(buildings.recruitWorker(warehouseIndex), { ok: false, reason: 'insufficient_resources' });
  assert.equal(resources.getAmount('food'), 19);
  assert.equal(population.current, 12);

  resources._resources.food.current = 100;
  population.current = population.getHousingCapacity();
  assert.deepEqual(buildings.recruitWorker(warehouseIndex), { ok: false, reason: 'housing_full' });
  assert.equal(resources.getAmount('food'), 100);
  assert.equal(population.current, 20);
});

test('worker recruitment rejects missing, incompatible, and inactive buildings', () => {
  const { resources, population, buildings, warehouseIndex } = createScenario();
  assert.deepEqual(buildings.recruitWorker(-1), { ok: false, reason: 'invalid_recruitment_building' });
  assert.deepEqual(buildings.recruitWorker(1), { ok: false, reason: 'invalid_recruitment_building' });
  buildings.buildings[warehouseIndex].status = 'constructing';
  assert.deepEqual(buildings.recruitWorker(warehouseIndex), { ok: false, reason: 'invalid_recruitment_building' });
  assert.equal(resources.getAmount('food'), 100);
  assert.equal(population.current, 12);
});

test('population additions require a positive integer and available housing', () => {
  const { population } = createScenario();
  assert.equal(population.addPopulation(1.5), false);
  assert.equal(population.addPopulation(0), false);
  assert.equal(population.current, 12);
  assert.equal(population.addPopulation(8), true);
  assert.equal(population.current, 20);
  assert.equal(population.addPopulation(1), false);
  assert.equal(population.current, 20);
});
