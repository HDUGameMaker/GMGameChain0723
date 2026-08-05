import test from 'node:test';
import assert from 'node:assert/strict';
import { TimeSystem } from '../../src/systems/TimeSystem.js';

test('time save restores selected speed without restoring a stale pause', () => {
  const original = new TimeSystem();
  original.setSpeed(4);
  original.userPaused = true;

  const restored = new TimeSystem();
  restored.restoreState(original.getState());

  assert.equal(restored.speed, 4);
  assert.equal(restored.userPaused, false);
});
