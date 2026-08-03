import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ConfigRegistry from '../../src/core/ConfigRegistry.js';

const root = resolve(import.meta.dirname, '../..');
const overridePath = resolve(root, 'config/civilization-building-overrides.json');
const canonicalCategories = new Set([
  'housing', 'agriculture', 'gathering', 'industry', 'commerce', 'research',
  'civic', 'military', 'defense', 'naval', 'administration'
]);
const expectedCounts = {
  housing: 1,
  agriculture: 1,
  gathering: 1,
  industry: 8,
  commerce: 9,
  research: 7,
  civic: 9,
  military: 6,
  defense: 6,
  naval: 3,
  administration: 6
};

function loadRuntimeContent() {
  assert.ok(existsSync(overridePath), 'civilization building override config must exist');
  const historicalContent = JSON.parse(readFileSync(resolve(root, 'config/historical_content.json'), 'utf8'));
  const baseBuildings = JSON.parse(readFileSync(resolve(root, 'config/buildings.json'), 'utf8'));
  const registry = new ConfigRegistry();
  registry._configs = {
    historicalContent: structuredClone(historicalContent),
    buildings: structuredClone(baseBuildings),
    techs: [],
    culture: [],
    enemies: { units: [] },
    civilizationBuildingOverrides: JSON.parse(readFileSync(overridePath, 'utf8'))
  };
  registry._applyHistoricalContent();
  assert.equal(typeof registry._applyCivilizationBuildingOverrides, 'function');
  registry._applyCivilizationBuildingOverrides();
  return registry;
}

test('57 civilization buildings cover every canonical gameplay category', () => {
  const registry = loadRuntimeContent();
  const content = registry.getHistoricalContent();
  const uniqueBuildings = content.buildings.filter(building => building.civilizationId);
  assert.equal(uniqueBuildings.length, 57);

  const counts = Object.fromEntries([...canonicalCategories].map(category => [category, 0]));
  for (const building of uniqueBuildings) {
    assert.ok(canonicalCategories.has(building.category), `${building.id}: canonical category`);
    counts[building.category] += 1;
  }
  assert.deepEqual(counts, expectedCounts);
  assert.ok(Math.max(...Object.values(counts)) <= 9, 'no single category should dominate the roster');
});

test('every civilization points to a functional and historically described unique building', () => {
  const registry = loadRuntimeContent();
  const content = registry.getHistoricalContent();
  const runtimeIds = new Set(registry.get('buildings').map(building => building.id));

  for (const civilization of content.civilizations) {
    const building = content.buildings.find(item => item.id === civilization.uniqueBuilding.id);
    assert.ok(building, `${civilization.id}: unique building exists`);
    assert.equal(building.civilizationId, civilization.id);
    assert.ok(runtimeIds.has(building.replaces), `${building.id}: replacement exists`);
    assert.ok(building.description.length >= 18, `${building.id}: useful description`);
    assert.doesNotMatch(building.description, /科技与人文研究|特色建筑替代项/);

    const fn = building.uniqueFunction || {};
    const production = building.production?.output || [];
    const functional = {
      housing: building.housingCapacity > 0,
      agriculture: production.some(entry => entry.resourceId === 'food' && entry.amount > 0),
      gathering: production.some(entry => ['wood', 'stone', 'food', 'gold'].includes(entry.resourceId) && entry.amount > 0),
      industry: production.length > 0 || fn.buildSpeedMultiplier > 1,
      commerce: production.some(entry => entry.resourceId === 'gold' && entry.amount > 0) || fn.tradeValueMultiplier > 1,
      research: fn.sciencePerWorker > 0,
      civic: fn.civicPerWorker > 0,
      military: building.soldierCapacity > 0 && fn.trainsBranches?.length > 0,
      defense: fn.garrisonCapacity > 0,
      naval: building.allowedGrounds?.includes('S') && fn.trainsBranches?.includes('navy'),
      administration: fn.workerCapacityBonus > 0 || fn.armyCapBonus > 0 || production.length > 0
    }[building.category];
    assert.equal(functional, true, `${building.id}: ${building.category} has a live gameplay effect`);
  }
});
