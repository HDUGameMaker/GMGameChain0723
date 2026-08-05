import test from 'node:test';
import assert from 'node:assert/strict';
import { eventBus } from '../../src/core/EventBus.js';
import { DailySettlementSystem } from '../../src/systems/DailySettlementSystem.js';

test('day end pauses through a settlement popup and reports net resources territory and defeated enemies', () => {
  eventBus.clear();
  const amounts = { wood: 10, food: 20 };
  let territory = 4;
  const opened = [];
  const system = new DailySettlementSystem({
    resource: { getAll: () => Object.entries(amounts).map(([id, current]) => ({ id, name: id, icon: '', current })) },
    territory: { getOwnedClaimableCount: () => territory },
    event: {},
    popupManager: { open: (type, data) => opened.push({ type, data }) }
  });
  system.init();
  amounts.wood += 7;
  amounts.food -= 3;
  territory += 2;
  eventBus.emit('enemyDefeated', {});
  eventBus.emit('enemyDefeated', {});
  eventBus.emit('dayEnd', { day: 3 });
  assert.equal(opened[0].type, 'daily_settlement');
  assert.deepEqual(opened[0].data.resourceChanges.map(item => [item.id, item.amount]), [['wood', 7], ['food', -3]]);
  assert.equal(opened[0].data.territoryGained, 2);
  assert.equal(opened[0].data.enemiesDefeated, 2);
});

test('daily tracking baseline and counters survive save restore', () => {
  eventBus.clear();
  const resource = { getAll: () => [{ id: 'wood', name: '木材', current: 12 }] };
  const first = new DailySettlementSystem({ resource, territory: { getOwnedClaimableCount: () => 2 } });
  first.init();
  eventBus.emit('enemyDefeated', {});
  const restored = new DailySettlementSystem({ resource, territory: { getOwnedClaimableCount: () => 2 } });
  restored.restoreState(first.getState());
  assert.equal(restored.getState().defeatedEnemies, 1);
  assert.equal(restored.getState().resourceBaseline.wood.amount, 12);
});
