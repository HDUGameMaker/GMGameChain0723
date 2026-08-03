import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveManager } from '../../src/core/SaveManager.js';

test('v7 saves migrate to v9 without losing developed historical state', () => {
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
    armies: [{
      id: 'army_1',
      name: '第一军团',
      units: [{ unitId: 'spearman', count: 2 }, { unitId: 'archer', count: 1 }],
      morale: 73,
      supply: 0.8
    }],
    availableUnits: { spearman: 4, archer: 0 }
  };

  const migrated = SaveManager.migrate(source);

  assert.equal(SaveManager.CURRENT_VERSION, 9);
  assert.equal(migrated.version, 9);
  assert.deepEqual(migrated.migrationHistory, [7, 8, 9]);
  assert.equal(migrated.resources.wood.current, 237);
  assert.equal(migrated.population.current, 19);
  assert.deepEqual(migrated.tech, source.tech);
  assert.deepEqual(migrated.culture, source.culture);
  assert.deepEqual(migrated.heroes, source.heroes);
  assert.deepEqual(migrated.diplomacy, source.diplomacy);
  assert.equal(migrated.era.currentEraId, 'early_modern');
  assert.equal(migrated.era.selectedCivilizations.primitive, 'river_tribe');
  assert.equal(migrated.era.selectedCivilizations.early_modern, 'britain_industrial');
  assert.deepEqual(migrated.armyState.armies[0].unitIds, ['spearman', 'spearman', 'archer']);
  assert.equal(migrated.armyState.armies[0].ownerId, 'player');
  assert.deepEqual(migrated.armyState.availableUnits, { spearman: 4, archer: 0 });
  assert.equal(migrated.armyState.armies[0].morale, 73);
  assert.equal(migrated.armyState.armies[0].supply, 0.8);
  assert.deepEqual(migrated.economicOrders, { nextId: 1, orders: [] });
  assert.deepEqual(migrated.commerce, {
    nextId: 1,
    lastProcessedDay: 0,
    routes: [],
    conversions: [],
    factions: { states: {}, relations: {}, lastSyncDay: 0 }
  });
  assert.deepEqual(migrated.world, { schemaVersion: 1, source: 'legacy_static', mapId: 'base_map_v1' });
  for (const mirrorKey of ['armies', 'availableUnits', 'tradeRoutes', 'factions']) {
    assert.equal(mirrorKey in migrated, false, `${mirrorKey} mirror removed`);
  }
  assert.deepEqual(migrated.eraMusic, { currentEraId: 'early_modern', currentTrackId: null });
  assert.equal(source.version, 7, 'migration must not mutate the source save');
});

test('v5 and v6 saves pass through every migration step to v9', () => {
  const fromV5 = SaveManager.migrate({ version: 5, resources: {}, buildings: [] });
  const fromV6 = SaveManager.migrate({ version: 6, resources: {}, buildings: [] });

  assert.equal(fromV5.version, 9);
  assert.deepEqual(fromV5.migrationHistory, [5, 6, 7, 8, 9]);
  assert.equal(fromV6.version, 9);
  assert.deepEqual(fromV6.migrationHistory, [6, 7, 8, 9]);
});

test('fresh v8 saves receive canonical domain defaults and preserve valid collections', () => {
  const source = {
    version: 8,
    era: { currentEraId: 'modern', selectedCivilizations: {}, legacyCivilizationIds: [], eraStars: {} },
    economicOrders: { nextId: 9, orders: [{ id: 'order_8', type: 'crop' }] },
    tradeRoutes: { nextId: 3, routes: [{ id: 'route_2' }], conversionCounters: { market_1: 1 } }
  };

  const migrated = SaveManager.migrate(source);
  assert.equal(migrated.version, 9);
  assert.deepEqual(migrated.economicOrders, source.economicOrders);
  assert.deepEqual(migrated.commerce, {
    nextId: source.tradeRoutes.nextId,
    lastProcessedDay: 0,
    routes: source.tradeRoutes.routes,
    conversions: [],
    factions: { states: {}, relations: {}, lastSyncDay: 0 }
  });
  assert.deepEqual(migrated.armyState.armies, []);
});

test('v8 saves normalize array reserves and derive the next army id', () => {
  const migrated = SaveManager.migrate({
    version: 8,
    armies: [{ id: 'army_3', unitIds: ['spearman'] }],
    availableUnits: [{ unitId: 'spearman', count: 2 }, { id: 'archer', count: 1 }]
  });

  assert.deepEqual(migrated.armyState.availableUnits, { spearman: 2, archer: 1 });
  assert.equal(migrated.armyState.nextId, 4);
});

test('v8 migration preserves era stars and marks abstract occupied colonies as legacy off-map', () => {
  const source = {
    version: 8,
    era: {
      currentEraId: 'medieval',
      selectedCivilizations: {},
      legacyCivilizationIds: ['river_tribe'],
      eraStars: { primitive: 5, classical: 2, medieval: 1 }
    },
    colony: {
      occupied: {
        spice_island: { id: 'spice_island', defense: 7, occupiedDay: 12 }
      }
    },
    buildingTech: { unlockedNodes: ['bt_logging_t2'] },
    armies: [{
      id: 'army_2', unitIds: ['archer'], ownerId: 'ally',
      movePath: [{ x: 7, y: 8 }], order: { type: 'move', targetX: 7, targetY: 8 },
      garrisonBuildingIndex: 3
    }],
    availableUnits: { spearman: 2 },
    factions: { states: { city_1: { status: 'friendly' } }, relations: {}, lastSyncDay: 8 }
  };
  const before = structuredClone(source);

  const migrated = SaveManager.migrate(source);

  assert.deepEqual(source, before, 'v8 source remains byte-for-byte equivalent');
  assert.deepEqual(migrated.era.eraStars, { primitive: 5, classical: 2, medieval: 1 });
  assert.equal(migrated.colony.occupied.spice_island.legacyOffmap, true);
  assert.equal(migrated.armyState.armies[0].ownerId, 'ally', 'an explicit owner is preserved');
  assert.deepEqual(migrated.armyState.armies[0].movePath, source.armies[0].movePath);
  assert.equal(migrated.armyState.armies[0].garrisonBuildingIndex, 3);
  assert.deepEqual(migrated.armyState.availableUnits, source.availableUnits);
  assert.ok(migrated.tech.researched.includes('tech_ancient_5'));
  assert.deepEqual(migrated.buildingTech, source.buildingTech);
  assert.deepEqual(migrated.commerce.factions, source.factions);
});

test('already-v9 payloads gain overhaul defaults without mutating the input', () => {
  const source = {
    version: 9,
    world: { schemaVersion: 1, source: 'procedural', mapId: 'world_7' },
    armyState: { nextId: 1, armies: [], availableUnits: {}, battleHistory: [] },
    commerce: { nextId: 2, lastProcessedDay: 0, routes: [], conversions: [], factions: { states: {}, relations: {}, lastSyncDay: 4 } },
    migrationHistory: [7, 8, 9]
  };
  const before = structuredClone(source);

  const migrated = SaveManager.migrate(source);

  assert.deepEqual(source, before);
  assert.deepEqual(migrated, {
    ...source,
    tech: { researched: [] },
    culture: { researched: [] },
    buildings: [],
    resourceNodes: { nodes: [] },
    fogOfWar: { width: 384, height: 384, exploredRle: [384 * 384] }
  });
  assert.notEqual(migrated, source);
});
