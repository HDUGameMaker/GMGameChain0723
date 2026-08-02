import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveManager } from '../../src/core/SaveManager.js';

test('v7 saves migrate to v8 without losing developed historical state', () => {
  const source = {
    version: 7,
    resources: {
      wood: { current: 237, max: 1000 },
      stone: { current: 88, max: 1000 },
      food: { current: 144, max: 1000 },
      gold: { current: 91, max: 1000 },
      __storageMultiplier: 1.25
    },
    population: { current: 19, satisfaction: 74 },
    tech: { researched: ['stone_tools'], points: 31 },
    culture: { researched: ['oral_tradition'], points: 22 },
    heroes: { availableIds: ['hero_1'], recruited: { hero_2: { id: 'hero_2' } }, lastRefreshDay: 4 },
    diplomacy: { states: { hill_clan: { relation: 62 } } },
    era: {
      currentEraId: 'industrial',
      selectedCivilizations: { ancient: 'river_tribe', industrial: 'britain_industrial' },
      legacyCivilizationIds: ['river_tribe'],
      eraStars: { ancient: 5, industrial: 2 }
    },
    armies: [{ id: 'army_1', name: '第一军团', units: [{ unitId: 'spearman', count: 8 }] }]
  };

  const migrated = SaveManager.migrate(source);

  assert.equal(SaveManager.CURRENT_VERSION, 8);
  assert.equal(migrated.version, 8);
  assert.deepEqual(migrated.migrationHistory, [7, 8]);
  assert.equal(migrated.resources.wood.current, 237);
  assert.equal(migrated.population.current, 19);
  assert.deepEqual(migrated.tech, source.tech);
  assert.deepEqual(migrated.culture, source.culture);
  assert.deepEqual(migrated.heroes, source.heroes);
  assert.deepEqual(migrated.diplomacy, source.diplomacy);
  assert.equal(migrated.era.currentEraId, 'early_modern');
  assert.equal(migrated.era.selectedCivilizations.primitive, 'river_tribe');
  assert.equal(migrated.era.selectedCivilizations.early_modern, 'britain_industrial');
  assert.equal(migrated.armies[0].id, 'army_1');
  assert.deepEqual(migrated.economicOrders, { nextId: 1, orders: [] });
  assert.deepEqual(migrated.tradeRoutes, { nextId: 1, routes: [], conversionCounters: {} });
  assert.deepEqual(migrated.factions, { states: {}, relations: {}, lastSyncDay: 0 });
  assert.deepEqual(migrated.eraMusic, { currentEraId: 'early_modern', currentTrackId: null });
  assert.equal(source.version, 7, 'migration must not mutate the source save');
});

test('v5 and v6 saves pass through every migration step to v8', () => {
  const fromV5 = SaveManager.migrate({ version: 5, resources: {}, buildings: [] });
  const fromV6 = SaveManager.migrate({ version: 6, resources: {}, buildings: [] });

  assert.equal(fromV5.version, 8);
  assert.deepEqual(fromV5.migrationHistory, [5, 6, 7, 8]);
  assert.equal(fromV6.version, 8);
  assert.deepEqual(fromV6.migrationHistory, [6, 7, 8]);
});

test('fresh v8 saves receive missing collection defaults but preserve valid collections', () => {
  const source = {
    version: 8,
    era: { currentEraId: 'modern', selectedCivilizations: {}, legacyCivilizationIds: [], eraStars: {} },
    economicOrders: { nextId: 9, orders: [{ id: 'order_8', type: 'crop' }] },
    tradeRoutes: { nextId: 3, routes: [{ id: 'route_2' }], conversionCounters: { market_1: 1 } }
  };

  const migrated = SaveManager.migrate(source);
  assert.equal(migrated.version, 8);
  assert.deepEqual(migrated.economicOrders, source.economicOrders);
  assert.deepEqual(migrated.tradeRoutes, source.tradeRoutes);
  assert.deepEqual(migrated.armies, []);
  assert.deepEqual(migrated.factions, { states: {}, relations: {}, lastSyncDay: 0 });
});
