import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { store } from '../../src/core/Store.js';
import { ResourceSystem } from '../../src/systems/ResourceSystem.js';
import { CommerceSystem } from '../../src/systems/CommerceSystem.js';

const root = resolve(import.meta.dirname, '../..');
const commerceConfig = JSON.parse(readFileSync(resolve(root, 'config/commerce.json'), 'utf8'));
const adjacency = JSON.parse(readFileSync(resolve(root, 'config/adjacency-bonuses.json'), 'utf8'));

function createScenario(status = 'friendly', commercialEffects = {}) {
  eventBus.clear();
  configRegistry._configs = {
    commerce: commerceConfig,
    resources: [
      { id: 'wood', name: '木材', initial: 100, max: 1000 },
      { id: 'stone', name: '石材', initial: 100, max: 1000 },
      { id: 'food', name: '食物', initial: 100, max: 1000 },
      { id: 'gold', name: '黄金', initial: 100, max: 1000 }
    ]
  };
  const resource = new ResourceSystem();
  resource.initFromConfig();
  const building = {
    buildings: [
      { buildingId: 'market_square', status: 'active', currentWorkers: 2 },
      { buildingId: 'trade_depot', status: 'active', currentWorkers: 1 },
      { buildingId: 'luxury_workshop', status: 'active', currentWorkers: 1 }
    ],
    getWorkforceOutputs: () => ({ gold: 2 }),
    getActiveBuildingCount(id) { return this.buildings.filter(item => item.status === 'active' && item.buildingId === id).length; }
  };
  const diplomacy = {
    getOutpost: id => id === 'free_market' ? { id, name: '自由市集' } : null,
    getOutpostState: id => id === 'free_market' ? { active: true, discovered: true, status, treaties: ['trade'] } : null
  };
  const commerce = new CommerceSystem();
  commerce.setSystems({ resource, building, diplomacy, commercial: { getEffects: () => commercialEffects } });
  commerce.initNew();
  return { resource, commerce };
}

test('trade route system does not generate internal commercial gold', () => {
  const { resource } = createScenario();
  eventBus.emit('workTick', {});
  assert.equal(resource.getAmount('gold'), 100);
});

test('friendly city-state trade routes automatically exchange resources each day', () => {
  const { resource, commerce } = createScenario();
  assert.equal(commerce.getRouteCapacity(), 2);
  const route = commerce.createTradeRoute('free_market', 'export_food').route;
  assert.ok(route);
  eventBus.emit('dayStart', { day: 2 });
  assert.equal(resource.getAmount('food'), 90);
  assert.equal(resource.getAmount('gold'), 108);
  assert.equal(commerce.getTradeRoutes()[0].completedCycles, 1);
});

test('neutral or hostile city-states cannot open automatic trade routes', () => {
  const { commerce } = createScenario('neutral');
  const result = commerce.createTradeRoute('free_market', 'export_food');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'relation_too_low');
});

test('federation outcome permanently improves automatic city-state trade value', () => {
  const { resource, commerce } = createScenario();
  store.setState({ worldConsequenceModifiers: { tradeValueMul: 1.1 } });
  commerce.createTradeRoute('free_market', 'export_food');
  eventBus.emit('dayStart', { day: 2 });
  assert.equal(resource.getAmount('gold'), 109);
  store.setState({ worldConsequenceModifiers: {} });
});

test('an active commercial buff improves trade value without worker-count stacking', () => {
  const { resource, commerce } = createScenario('friendly', { tradeValueMul: 1.08 });
  commerce.createTradeRoute('free_market', 'export_food');
  eventBus.emit('dayStart', { day: 2 });
  assert.equal(resource.getAmount('gold'), 109);
});

test('luxury workshops run configurable local conversion orders and restore them from saves', () => {
  const { resource, commerce } = createScenario();
  const conversion = commerce.createConversionOrder('charcoal_trade').order;
  eventBus.emit('dayStart', { day: 2 });
  assert.equal(resource.getAmount('wood'), 88);
  assert.equal(resource.getAmount('gold'), 106);
  const saved = commerce.getState();

  const restoredScenario = createScenario();
  restoredScenario.commerce.restoreState(saved);
  assert.equal(restoredScenario.commerce.getConversionOrders()[0].id, conversion.id);
  assert.equal(restoredScenario.commerce.getConversionOrders()[0].completedCycles, 1);
});

test('economic aura catalog buffs multiple historical production buildings', () => {
  const auraIds = new Set(adjacency.map(rule => rule.id));
  for (const id of ['grain_farm_granary_aura', 'forestry_warehouse_aura', 'quarry_warehouse_aura', 'gold_mine_market_aura']) {
    assert.ok(auraIds.has(id), id);
  }
});
