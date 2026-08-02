import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const contentPath = resolve(root, 'config/historical_content.json');
const loadContent = () => JSON.parse(readFileSync(contentPath, 'utf8'));
const allowedResources = new Set(['wood', 'stone', 'food', 'gold']);

function assertUnique(items, label) {
  const ids = items.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length, `${label} contains duplicate ids`);
}

function collectResourceIds(value, result = []) {
  if (Array.isArray(value)) value.forEach(entry => collectResourceIds(entry, result));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'resourceId') result.push(child);
      else collectResourceIds(child, result);
    }
  }
  return result;
}

test('historical content provides seven eras with eight civilizations and symmetric research pages', () => {
  assert.ok(existsSync(contentPath), 'historical content config is missing');
  const content = loadContent();
  assert.equal(content.eras.length, 7);
  assert.equal(content.civilizations.length, 56);
  for (const era of content.eras) {
    assert.equal(content.civilizations.filter(civ => civ.eraId === era.id).length, 8, `${era.id} civilizations`);
    assert.equal(content.techs.filter(node => node.eraId === era.id).length, 8, `${era.id} techs`);
    assert.equal(content.civics.filter(node => node.eraId === era.id).length, 8, `${era.id} civics`);
  }
  for (const civ of content.civilizations) {
    assert.ok(civ.legacy?.description, `${civ.id} legacy`);
    assert.ok(civ.trait?.description, `${civ.id} trait`);
    assert.ok(civ.uniqueUnitId, `${civ.id} unique unit`);
    assert.ok(civ.uniqueBuilding?.name, `${civ.id} unique building`);
    assert.ok(civ.icon, `${civ.id} icon`);
  }
});

test('historical economy and content breadth meet the design contract', () => {
  const content = loadContent();
  assert.equal(content.luxuries.length, 20);
  assert.ok(content.buildings.length >= 24, 'historical building additions');
  assert.ok(content.units.length >= 70, 'historical units');
  assert.ok(content.heroes.length >= 35, 'historical heroes');
  assert.ok(content.strategies.length >= 20, 'historical strategies');
  for (const luxury of content.luxuries) {
    assert.ok(Object.keys(luxury.effects || {}).length > 0, `${luxury.id} has no effect`);
    assert.ok(luxury.icon, `${luxury.id} icon`);
  }
});

test('historical ids, references, costs and icons are internally consistent', () => {
  const content = loadContent();
  for (const key of ['eras', 'civilizations', 'luxuries', 'buildings', 'techs', 'civics', 'units', 'heroes', 'strategies']) {
    assertUnique(content[key], key);
    for (const item of content[key]) assert.ok(item.icon, `${key}:${item.id} missing icon`);
  }
  const eraIds = new Set(content.eras.map(era => era.id));
  const unitIds = new Set(content.units.map(unit => unit.id));
  for (const item of [...content.civilizations, ...content.techs, ...content.civics, ...content.units, ...content.heroes]) {
    assert.ok(eraIds.has(item.eraId), `${item.id} invalid era ${item.eraId}`);
  }
  for (const civ of content.civilizations) assert.ok(unitIds.has(civ.uniqueUnitId), `${civ.id} missing unique unit`);
  for (const id of collectResourceIds(content)) assert.ok(allowedResources.has(id), `invalid resource ${id}`);
});

test('ConfigRegistry merges historical additions without overriding main ids', async () => {
  const { default: ConfigRegistry } = await import('../../src/core/ConfigRegistry.js');
  const registry = new ConfigRegistry();
  registry._configs = {
    historicalContent: {
      ...loadContent(),
      buildings: [{ id: 'academy', name: '扩展学院' }, { id: 'new_hall', name: '新建筑' }],
      units: [{ id: 'warrior', name: '扩展战士' }, { id: 'new_guard', name: '新卫队' }],
      techs: [{ id: 'base_tech', name: '扩展科技' }, { id: 'new_tech', name: '新科技' }],
      civics: [{ id: 'base_civic', name: '扩展人文' }, { id: 'new_civic', name: '新人文' }]
    },
    buildings: [{ id: 'academy', name: '主版学院' }],
    enemies: { units: [{ id: 'warrior', name: '主版战士' }] },
    techs: [{ id: 'base_tech', name: '主版科技' }],
    culture: [{ id: 'base_civic', name: '主版人文' }]
  };
  registry._applyHistoricalContent();
  assert.equal(registry.getBuilding('academy').name, '主版学院');
  assert.equal(registry.get('enemies').units.find(unit => unit.id === 'warrior').name, '主版战士');
  assert.ok(registry.getBuilding('new_hall'));
  assert.ok(registry.get('enemies').units.some(unit => unit.id === 'new_guard'));
  assert.ok(registry.get('techs').some(node => node.id === 'new_tech'));
  assert.ok(registry.get('culture').some(node => node.id === 'new_civic'));
  assert.equal(registry.getHistoricalContent().eras.length, 7);
});
