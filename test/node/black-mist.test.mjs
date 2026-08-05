import test from 'node:test';
import assert from 'node:assert/strict';
import { BlackMistSystem } from '../../src/systems/BlackMistSystem.js';
import { eventBus } from '../../src/core/EventBus.js';

test('eastern black mist expands one circular radius every two days and exposes tile damage', () => {
  const calls = [];
  const mist = new BlackMistSystem();
  mist.setSystems({
    combat: { enemies: [{ enemyId: 'eastern_ruin_guardian', originX: 20, originY: 10 }] },
    resourceNodes: { corruptCovered: predicate => calls.push(predicate(20, 10)) }
  });
  mist.initNew();
  assert.equal(mist.radius, 5);
  eventBus.emit('dayStart', { day: 2 });
  assert.equal(mist.radius, 5);
  eventBus.emit('dayStart', { day: 3 });
  assert.equal(mist.radius, 6);
  assert.equal(mist.isCovered(26, 10), true);
  assert.equal(mist.isCovered(26, 11), false);
  assert.equal(mist.getTileEffect(20, 10).hpPerTick, -30);
  assert.deepEqual(calls, [true, true]);
});
