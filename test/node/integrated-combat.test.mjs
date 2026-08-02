import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const load = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const integrationPath = resolve(root, 'config/ea_integration.json');
const integration = existsSync(integrationPath) ? load('config/ea_integration.json') : {};
const base = load('config/enemies.json');
const resolver = await import('../../src/systems/CombatResolver.js').catch(() => ({}));
const trainingRules = await import('../../src/systems/TrainingRules.js').catch(() => ({}));
const units = [
  ...(base.units || []).map(unit => ({ ...unit, ...(integration.unitProfiles?.[unit.id] || {}) })),
  ...(integration.units || [])
];

test('integration provides 25 counter-tagged units and at least three naval units', () => {
  assert.equal(units.length, 25);
  assert.ok(units.filter(unit => unit.domain === 'naval').length >= 3);
  for (const unit of units) {
    assert.ok(unit.roleTags?.length, `${unit.id} roleTags`);
    assert.ok(Array.isArray(unit.strongAgainst), `${unit.id} strongAgainst`);
    assert.ok(Array.isArray(unit.weakAgainst), `${unit.id} weakAgainst`);
  }
});

test('all integrated costs use the main four-resource model', () => {
  const allowed = new Set(['wood', 'stone', 'food', 'gold']);
  for (const collection of [integration.units || [], integration.buildings || [], integration.enemies || []]) {
    for (const entry of collection) {
      for (const cost of [...(entry.cost || []), ...(entry.buildCost || []), ...(entry.upgradeCost || [])]) {
        assert.ok(allowed.has(cost.resourceId), `${entry.id}:${cost.resourceId}`);
      }
    }
  }
});

test('spears counter cavalry while cavalry counters archers', () => {
  assert.equal(typeof resolver.getMatchupMultiplier, 'function');
  const spear = units.find(unit => unit.id === 'spearman');
  const knight = units.find(unit => unit.id === 'knight');
  const archer = units.find(unit => unit.id === 'archer');
  assert.ok(resolver.getMatchupMultiplier(spear, knight) > 1);
  assert.ok(resolver.getMatchupMultiplier(knight, spear) < 1);
  assert.ok(resolver.getMatchupMultiplier(knight, archer) > 1);
});

test('army power reflects composition counters', () => {
  assert.equal(typeof resolver.getCounterAdjustedArmyPower, 'function');
  const knight = units.find(unit => unit.id === 'knight');
  const spears = resolver.getCounterAdjustedArmyPower(['spearman', 'spearman'], units, [knight]);
  const archers = resolver.getCounterAdjustedArmyPower(['archer', 'archer'], units, [knight]);
  assert.ok(spears.adjustedPower > archers.adjustedPower);
});

test('land and naval units are constrained to matching terrain domains', () => {
  assert.equal(typeof resolver.isDomainCompatible, 'function');
  assert.equal(resolver.isDomainCompatible('naval', 'W'), true);
  assert.equal(resolver.isDomainCompatible('naval', 'G'), false);
  assert.equal(resolver.isDomainCompatible('land', 'W'), false);
  assert.equal(resolver.isDomainCompatible('land', 'G'), true);
});

test('naval infrastructure is additive and water-placeable', () => {
  const dock = integration.buildings?.find(building => building.id === 'dock');
  const shipyard = integration.buildings?.find(building => building.id === 'shipyard');
  assert.ok(dock.allowedGrounds.includes('W'));
  assert.equal(dock.upgradesTo, 'shipyard');
  assert.equal(shipyard.upgradesFrom, 'dock');
  assert.ok(shipyard.tags.includes('naval_facility'));
});

test('training rules use capacity, unlocks and naval facilities without workers', () => {
  assert.equal(typeof trainingRules.evaluateTrainingEligibility, 'function');
  const naval = trainingRules.evaluateTrainingEligibility({
    unit: { domain: 'naval' }, canAfford: true, soldierCount: 1, soldierCap: 3,
    isUnlocked: true, hasNavalFacility: false
  });
  assert.equal(naval.ok, false);
  assert.ok(naval.reasons.some(reason => reason.includes('海军设施')));
  const land = trainingRules.evaluateTrainingEligibility({
    unit: { domain: 'land', populationRequired: 99 }, canAfford: true,
    soldierCount: 1, soldierCap: 3, isUnlocked: true, hasNavalFacility: false
  });
  assert.equal(land.ok, true);
});
