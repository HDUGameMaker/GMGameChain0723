import assert from 'node:assert/strict';
import test from 'node:test';

import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { ResourceSystem } from '../../src/systems/ResourceSystem.js';
import { CommercialBuildingSystem } from '../../src/systems/CommercialBuildingSystem.js';

function createScenario() {
  eventBus.clear();
  configRegistry._configs = {
    commercialBuildings: {
      buildings: [
        { buildingId: 'market_square', goldPerWorker: 1, buff: { id: 'market_supply', name: '市场供给', effect: { commercialGoldMul: 1.05 } } },
        { buildingId: 'trade_depot', goldPerWorker: 1.5, buff: { id: 'merchant_network', name: '商旅网络', effect: { tradeValueMul: 1.05 } } }
      ]
    },
    resources: [
      { id: 'wood', name: '木材', initial: 0, max: 1000 },
      { id: 'stone', name: '石头', initial: 0, max: 1000 },
      { id: 'food', name: '食物', initial: 0, max: 1000 },
      { id: 'gold', name: '黄金', initial: 0, max: 1000 }
    ]
  };
  const building = { buildings: [
    { buildingId: 'market_square', currentWorkers: 3, status: 'active' },
    { buildingId: 'market_square', currentWorkers: 1, status: 'active' },
    { buildingId: 'trade_depot', currentWorkers: 2, status: 'active' },
    { buildingId: 'trade_depot', currentWorkers: 0, status: 'active' }
  ] };
  const resource = new ResourceSystem();
  resource.initFromConfig();
  const commercial = new CommercialBuildingSystem();
  commercial.setSystems({ building, resource });
  return { commercial, resource };
}

test('one worker enables a commercial buff and extra workers scale gold only', () => {
  const { commercial } = createScenario();

  assert.deepEqual(commercial.getBuildingState(0), {
    buildingIndex: 0,
    active: true,
    workers: 3,
    goldPerTick: 3,
    buff: { id: 'market_supply', name: '市场供给', effect: { commercialGoldMul: 1.05 } }
  });
  assert.equal(commercial.getActiveBuffs().filter(buff => buff.id === 'market_supply').length, 1);
  assert.equal(commercial.getBuildingState(3).active, false);
});

test('commercial work ticks add staffed gold from every active commercial building', () => {
  const { resource } = createScenario();

  eventBus.emit('workTick', {});

  assert.equal(resource.getAmount('gold'), 7.35);
});
