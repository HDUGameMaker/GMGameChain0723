import test from 'node:test';
import assert from 'node:assert/strict';
import { createCityStateDevelopment, getUnitCompositeStrength } from '../../src/domain/CityStateGeneration.js';
import { ResourceNodeSystem } from '../../src/systems/ResourceNodeSystem.js';

const eras = [
  { id: 'primitive', order: 0 },
  { id: 'ancient', order: 1 }
];
const map = { gridWidth: 100, gridHeight: 100, initialBuildings: [{ gridX: 5, gridY: 5 }] };
const settings = {
  maxLevel: 5, minEnemyStrength: 20, maxEnemyStrength: 180,
  minArea: 36, maxArea: 144, eraStrengthMultiplier: 2
};

test('city-state unit composite strength includes speed and attack range', () => {
  assert.equal(getUnitCompositeStrength({ attack: 20, hp: 100, speed: 1 }), 120);
  assert.equal(getUnitCompositeStrength({ attack: 20, hp: 100, speed: 2.5 }), 165);
  assert.equal(getUnitCompositeStrength({ attack: 20, hp: 100, speed: 2.5, attackRange: 3 }), 265);
});

test('farther city-states are larger, stronger, richer, and may use the next era', () => {
  const args = {
    map, eras, settings,
    buildings: [{ id: 'hut', eraId: 'primitive' }, { id: 'barracks', eraId: 'ancient', category: 'military' }],
    units: [{ id: 'club', eraId: 'primitive', attack: 10, hp: 20, speed: 1 }, { id: 'spear', eraId: 'ancient', attack: 20, hp: 40, speed: 1 }],
    luxuries: [{ id: 'silk' }], playerEraOrder: 0
  };
  const near = createCityStateDevelopment({ ...args, outpost: { id: 'near', gridX: 8, gridY: 8 } });
  const far = createCityStateDevelopment({ ...args, outpost: { id: 'far', gridX: 95, gridY: 95 } });
  assert.ok(far.level > near.level);
  assert.ok(far.area > near.area);
  assert.ok(far.targetStrength > near.targetStrength);
  assert.ok(far.luxuryDeposits.length > near.luxuryDeposits.length);
  assert.ok(near.level <= 2);
  if (near.level === 2) assert.ok(near.luxuryDeposits.length >= 1, 'level 2 city-states have a luxury deposit');
  assert.equal(far.eraId, 'ancient');
});

test('every generated city-state has a 2x2 headquarters and a defensive wall ring', () => {
  const city = createCityStateDevelopment({
    outpost: { id: 'fortified', gridX: 20, gridY: 20 }, map, eras, settings,
    buildings: [], units: [], luxuries: [{ id: 'silk' }], playerEraOrder: 0
  });
  assert.deepEqual(
    { width: city.buildings[0].width, height: city.buildings[0].height, headquarters: city.buildings[0].headquarters },
    { width: 2, height: 2, headquarters: true }
  );
  assert.equal(city.buildings.filter(building => building.defensive).length, 10);
  assert.ok(city.armies.length >= 2, 'each city-state has several garrison armies');
  assert.ok(city.area >= 36);
});

test('city-state luxury resource nodes remain unusable until headquarters is destroyed', () => {
  const nodes = new ResourceNodeSystem();
  nodes.initFromManifest([]);
  nodes.setCityStateNodes([{ id: 'cs_luxury', type: 'luxury', luxuryId: 'silk', gridX: 3, gridY: 4, locked: true, lockedByCityStateId: 'cs_1' }]);
  assert.equal(nodes.findNodeForArea(3, 4, 1, 1, 'luxury'), null);
  assert.equal(nodes.claimNode('cs_luxury', 'building_1', 'luxury').reason, 'city_state_headquarters_intact');
  assert.equal(nodes.unlockCityStateNodes('cs_1'), true);
  assert.equal(nodes.claimNode('cs_luxury', 'building_1', 'luxury').ok, true);
  assert.deepEqual(nodes.consume('cs_luxury', 1), { ok: true, remaining: 1, recoveryDay: null });
  assert.deepEqual(nodes.consume('cs_luxury', 1), { ok: true, remaining: 0, recoveryDay: null });
  assert.equal(nodes.getNodeAt(3, 4), null);
});

test('resource nodes with missing or non-finite coordinates are rejected before saving', () => {
  const nodes = new ResourceNodeSystem();
  nodes.initFromManifest([
    { id: 'valid', type: 'wood', gridX: 3, gridY: 4 },
    { id: 'missing_x', type: 'luxury', gridY: 5 },
    { id: 'nan_x', type: 'stone', gridX: Number.NaN, gridY: 6 }
  ]);
  assert.deepEqual(nodes.getState().nodes.map(node => node.id), ['valid']);

  nodes.setCityStateNodes([
    { id: 'city_valid', type: 'luxury', gridX: 8, gridY: 9 },
    { id: 'city_missing', type: 'luxury', gridX: undefined, gridY: undefined }
  ]);
  assert.deepEqual(nodes.getState().nodes.map(node => node.id), ['valid', 'city_valid']);
});
