import assert from 'node:assert/strict';
import test from 'node:test';

import { FogOfWarState } from '../../src/world/FogOfWarState.js';

test('day reveals ten tiles and night reveals six while retaining memory', () => {
  const fog = new FogOfWarState(384, 384);
  fog.recalculate([{ gridX: 100, gridY: 100, bonus: 0 }], 'morning');
  assert.equal(fog.getTileState(110, 100), 'visible');
  assert.equal(fog.getTileState(111, 100), 'unexplored');

  fog.recalculate([{ gridX: 100, gridY: 100, bonus: 0 }], 'night');
  assert.equal(fog.getTileState(110, 100), 'remembered');
  assert.equal(fog.getTileState(106, 100), 'visible');
  assert.equal(fog.getTileState(107, 100), 'remembered');
});

test('visibility uses grid coordinates, footprints and integer bonuses', () => {
  const fog = new FogOfWarState(40, 40);
  fog.recalculate([{ gridX: 10, gridY: 10, width: 3, height: 2, bonus: 2 }], 'night');

  assert.equal(fog.getTileState(5, 4), 'visible');
  assert.equal(fog.getTileState(20, 10), 'visible');
  assert.equal(fog.getTileState(21, 10), 'unexplored');
});

test('explored memory round-trips through compact RLE state', () => {
  const fog = new FogOfWarState(32, 24);
  fog.recalculate([{ gridX: 8, gridY: 9 }], 'morning');
  const saved = fog.getState();
  assert.ok(Array.isArray(saved.exploredRle));
  assert.ok(saved.exploredRle.length < 32 * 24);

  const restored = new FogOfWarState(32, 24);
  restored.restoreState(saved);
  assert.equal(restored.getTileState(8, 9), 'remembered');
  assert.equal(restored.getTileState(31, 23), 'unexplored');
});
