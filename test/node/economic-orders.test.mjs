import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { ResourceSystem } from '../../src/systems/ResourceSystem.js';
import { PopulationSystem } from '../../src/systems/PopulationSystem.js';
import { EconomyOrderSystem } from '../../src/systems/EconomyOrderSystem.js';

const root = resolve(import.meta.dirname, '../..');
const orderConfig = JSON.parse(readFileSync(resolve(root, 'config/economic-orders.json'), 'utf8'));

function createScenario(populationTotal = 12) {
  eventBus.clear();
  configRegistry._configs = {
    global: { population: { growthPerDay: { min: 0, max: 0 }, declineDelayDays: 2 } },
    initial: { population: { initial: populationTotal }, populationGrowth: { min: 0, max: 0 }, foodPerPerson: 1 },
    historicalContent: { populationSettings: { initial: populationTotal, foodPerPerson: 1, baseSatisfaction: 60 } },
    economicOrders: orderConfig,
    resources: [
      { id: 'wood', name: '木材', initial: 0, max: 1000 },
      { id: 'stone', name: '石材', initial: 0, max: 1000 },
      { id: 'food', name: '食物', initial: 0, max: 1000 },
      { id: 'gold', name: '黄金', initial: 0, max: 1000 }
    ],
    enemies: { units: [] },
    buildings: []
  };

  const resource = new ResourceSystem();
  resource.initFromConfig();
  const population = new PopulationSystem();
  population.setBuildingSystem({
    getTotalHousingCapacity: () => populationTotal + 10,
    getTotalAssignedWorkers: () => 2,
    getAssignedWorkersByJob: () => ({ research: 2 })
  });
  population.initNew();
  const luxury = {
    inventory: {},
    addLuxury(id, amount) { this.inventory[id] = (this.inventory[id] || 0) + amount; }
  };
  const economy = new EconomyOrderSystem();
  economy.setSystems({ population, resource, luxury });
  economy.initNew();
  return { resource, population, luxury, economy };
}

test('economic orders expose eight crops and four gathering jobs', () => {
  assert.equal(orderConfig.crops.length, 8);
  assert.equal(orderConfig.gathering.length, 4);
  assert.deepEqual(orderConfig.crops.map(crop => crop.id), [
    'grain', 'legumes', 'vegetables', 'grapes', 'cotton', 'flax', 'spices', 'sugarcane'
  ]);
});

test('economic orders and buildings share the same finite worker pool', () => {
  const { population, economy } = createScenario(6);
  const order = economy.createOrder({ type: 'crop', targetId: 'grain' }).order;
  assert.equal(population.getAvailableWorkers(), 4);
  assert.equal(economy.assignWorkers(order.id, 4).ok, true);
  assert.equal(population.getAvailableWorkers(), 0);
  assert.equal(economy.assignWorkers(order.id, 5).ok, false);
  assert.equal(economy.assignWorkers(order.id, 1).ok, true);
  assert.equal(population.getAvailableWorkers(), 3);
  assert.equal(population.getPopulationStats().jobs.agriculture, 1);
});

test('staffed crop and gathering orders produce base resources and luxuries each tick', () => {
  const { resource, luxury, economy } = createScenario(12);
  const crop = economy.createOrder({ type: 'crop', targetId: 'grapes' }).order;
  const gather = economy.createOrder({ type: 'gathering', targetId: 'woodcutting' }).order;
  economy.assignWorkers(crop.id, 2);
  economy.assignWorkers(gather.id, 3);

  for (let tick = 0; tick < 4; tick += 1) eventBus.emit('tick', {});
  assert.equal(resource.getAmount('food'), 4.8);
  assert.equal(resource.getAmount('gold'), 2.8);
  assert.ok(Math.abs(resource.getAmount('wood') - 14.4) < 1e-9);
  assert.equal(luxury.inventory.wine, 1);
});

test('economic order save state preserves assignments and luxury progress', () => {
  const { economy } = createScenario(12);
  const crop = economy.createOrder({ type: 'crop', targetId: 'spices' }).order;
  economy.assignWorkers(crop.id, 3);
  eventBus.emit('tick', {});
  const saved = economy.getState();

  const restoredScenario = createScenario(12);
  restoredScenario.economy.restoreState(saved);
  const restored = restoredScenario.economy.getOrders()[0];
  assert.equal(restored.targetId, 'spices');
  assert.equal(restored.workers, 3);
  assert.equal(restored.luxuryProgress, 3);
});
