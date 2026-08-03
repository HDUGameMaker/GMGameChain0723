import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveManager } from '../../src/core/SaveManager.js';

test('v6 saves migrate through v7 into current historical state without retaining fantasy payloads', () => {
  const source = {
    version: 6,
    resources: {
      wood: { current: 40, max: 500 }, stone: { current: 30, max: 500 },
      food: { current: 70, max: 500 }, gold: { current: 20, max: 500 },
      herbs: { current: 99, max: 999 }, __storageMultiplier: 1.5
    },
    population: { current: 9 },
    buildings: [{ buildingId: 'farm', status: 'active' }],
    alchemy: { materials: { old: 2 } },
    spell: { zones: [{ x: 1, y: 1 }] }
  };
  const migrated = SaveManager.migrate(source);
  assert.equal(migrated.version, SaveManager.CURRENT_VERSION);
  assert.deepEqual(Object.keys(migrated.resources).sort(), ['__storageMultiplier', 'food', 'gold', 'stone', 'wood']);
  assert.equal(migrated.resources.wood.current, 40);
  assert.equal(migrated.population.satisfaction, 60);
  assert.equal(migrated.buildings[0].assignedWorkers, 0);
  assert.ok(migrated.era && migrated.luxuries && migrated.strategies);
  assert.equal('alchemy' in migrated, false);
  assert.equal('spell' in migrated, false);
  assert.equal(source.version, 6, 'migration does not mutate original save');
});

test('v5 saves pass through v6 and v7 compatibility defaults before current migration', () => {
  const migrated = SaveManager.migrate({ version: 5, resources: {}, buildings: [] });
  assert.equal(migrated.version, SaveManager.CURRENT_VERSION);
  for (const key of ['territory', 'enemyExpansion', 'buildingTech', 'diplomacy', 'heroes', 'era', 'luxuries', 'strategies']) {
    assert.ok(key in migrated, key);
  }
  assert.deepEqual(migrated.migrationHistory, [5, 6, 7, 8, 9]);
});

test('unsupported legacy or invalid saves are rejected', () => {
  assert.equal(SaveManager.migrate(null), null);
  assert.equal(SaveManager.migrate({ version: 4 }), null);
  assert.equal(SaveManager.migrate({}), null);
});
