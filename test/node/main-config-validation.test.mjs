import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const load = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const activeFiles = [
  'config/initial.json', 'config/items.json', 'config/buildings.json',
  'config/events/events_base.json', 'config/events/events_expedition.json', 'config/events/events_map.json',
  'config/techs.json', 'config/enemies.json', 'config/alchemy.json', 'config/colonies.json',
  'config/building_tech.json', 'config/territory.json', 'config/enemy_expansion.json',
  'config/ea_integration.json'
];

function collectResourceIds(value, found = []) {
  if (Array.isArray(value)) value.forEach(item => collectResourceIds(item, found));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'resourceId' && typeof child === 'string') found.push(child);
      else collectResourceIds(child, found);
    }
  }
  return found;
}

test('all active runtime configuration uses the four-resource economy', () => {
  const allowed = new Set(['wood', 'stone', 'food', 'gold', 'inspiration']);
  const invalid = [];
  for (const file of activeFiles) {
    for (const id of collectResourceIds(load(file))) {
      if (!allowed.has(id)) invalid.push(`${file}:${id}`);
    }
  }
  assert.deepEqual(invalid, []);
});

test('building upgrade chains reference existing ids in both directions', () => {
  const buildings = load('config/buildings.json');
  const byId = new Map(buildings.map(building => [building.id, building]));
  for (const building of buildings) {
    if (building.upgradesTo) {
      assert.ok(byId.has(building.upgradesTo), `${building.id} missing upgradesTo ${building.upgradesTo}`);
      assert.equal(byId.get(building.upgradesTo).upgradesFrom, building.id);
    }
    if (building.upgradesFrom) assert.ok(byId.has(building.upgradesFrom), `${building.id} missing upgradesFrom ${building.upgradesFrom}`);
  }
});

test('unit prerequisite technologies reference existing tech ids', () => {
  const techIds = new Set(load('config/techs.json').map(tech => tech.id));
  const units = load('config/enemies.json').units || [];
  for (const unit of units) {
    for (const techId of unit.prerequisiteTechs || []) assert.ok(techIds.has(techId), `${unit.id} missing tech ${techId}`);
  }
});

test('configured audio files exist in the project', () => {
  const sound = load('config/sound.json');
  for (const entry of [...(sound.bgm || []), ...(sound.sfx || [])]) {
    assert.ok(existsSync(resolve(root, entry.file)), `missing audio ${entry.file}`);
  }
});
