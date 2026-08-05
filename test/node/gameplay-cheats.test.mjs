import test from 'node:test';
import assert from 'node:assert/strict';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { ResourceSystem } from '../../src/systems/ResourceSystem.js';

test('unlimited basic resources fills non-rare resources to their current capacities', () => {
  configRegistry._configs = { resources: [
    { id: 'wood', initial: 2, max: 100, rare: false },
    { id: 'gold', initial: 1, max: 50, rare: false },
    { id: 'relic', initial: 0, max: 5, rare: true }
  ] };
  const resources = new ResourceSystem();
  resources.initFromConfig();
  resources.setStorageMultiplier(2);
  resources.fillBasicResourcesToCapacity();
  assert.equal(resources.getAmount('wood'), 200);
  assert.equal(resources.getAmount('gold'), 100);
  assert.equal(resources.getAmount('relic'), 0);
});
