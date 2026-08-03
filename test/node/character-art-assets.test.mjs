import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ConfigRegistry from '../../src/core/ConfigRegistry.js';

const root = resolve(import.meta.dirname, '../..');
const load = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const mergeUnique = (...collections) => {
  const records = new Map();
  for (const collection of collections) {
    for (const record of collection || []) {
      if (!records.has(record.id)) records.set(record.id, record);
    }
  }
  return [...records.values()];
};

const historical = load('config/historical_content.json');
const ea = load('config/ea_integration.json');
const enemies = load('config/enemies.json');
const units = mergeUnique(enemies.units, ea.units, historical.units);
const heroes = mergeUnique(ea.heroes, historical.heroes);

function assertPng(path) {
  const absolute = resolve(root, path);
  assert.ok(existsSync(absolute), path);
  const bytes = readFileSync(absolute);
  assert.ok(bytes.length > 20_000, `${path} is too small to be production card art`);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${path} is not PNG`);
}

test('all runtime unit definitions have individual 2.5D recruitment card art', () => {
  assert.equal(units.length, 138);
  for (const unit of units) assertPng(`assets/unit-cards/${unit.id}.png`);
});

test('all runtime historical heroes have individual portrait art', () => {
  assert.equal(heroes.length, 72);
  for (const hero of heroes) assertPng(`assets/hero-portraits/${hero.id}.png`);
});

test('ConfigRegistry exposes large-format card and portrait paths to UI systems', () => {
  const registry = new ConfigRegistry();
  registry._configs = {
    buildings: [], techs: [], culture: [], eventsHistorical: [],
    enemies: { units: [{ id: 'test_unit' }] },
    eaIntegration: { heroes: [{ id: 'test_hero' }], outposts: [] },
    historicalContent: { heroes: [{ id: 'historical_hero' }] }
  };

  registry._ensureContentIcons();

  assert.equal(registry._configs.enemies.units[0].cardArt, 'assets/unit-cards/test_unit.png');
  assert.equal(registry._configs.eaIntegration.heroes[0].portrait, 'assets/hero-portraits/test_hero.png');
  assert.equal(registry._configs.historicalContent.heroes[0].portrait, 'assets/hero-portraits/historical_hero.png');
});
