import assert from 'node:assert/strict';
import test from 'node:test';

import { getStrategicFogStyle } from '../../src/rendering/FogPresentation.js';

test('strategic fog leaves visible tiles fully clear', () => {
  assert.equal(getStrategicFogStyle('visible', 'morning'), null);
});

test('day and night use the approved lighter fog values', () => {
  assert.equal(getStrategicFogStyle('remembered', 'morning').alpha, 0.22);
  assert.equal(getStrategicFogStyle('unexplored', 'morning').alpha, 0.56);
  assert.equal(getStrategicFogStyle('remembered', 'night').alpha, 0.34);
  assert.equal(getStrategicFogStyle('unexplored', 'night').alpha, 0.70);
});
