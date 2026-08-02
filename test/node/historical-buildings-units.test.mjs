import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateTrainingEligibility } from '../../src/systems/TrainingRules.js';
import { resolveBattleLines, isDomainCompatible } from '../../src/systems/CombatResolver.js';

const root = resolve(import.meta.dirname, '../..');
const load = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const content = load('config/historical_content.json');

test('historical building additions all have a distinct gameplay function and workforce role', () => {
  assert.ok(content.buildings.length >= 32);
  for (const building of content.buildings) {
    assert.ok(Object.keys(building.uniqueFunction || {}).length > 0, `${building.id} unique function`);
    assert.ok(building.jobType, `${building.id} job type`);
    assert.ok(Number.isInteger(building.maxWorkers), `${building.id} max workers`);
  }
});

test('historical roster covers every era and combat branch with land and naval units', () => {
  assert.ok(content.units.length >= 100);
  const expectedBranches = ['infantry', 'ranged', 'anti_cavalry', 'cavalry', 'siege', 'special', 'navy'];
  for (const era of content.eras) assert.ok(content.units.filter(unit => unit.eraId === era.id).length >= 16, era.id);
  for (const branch of expectedBranches) assert.ok(content.units.some(unit => unit.branch === branch), branch);
  assert.ok(content.units.filter(unit => unit.domain === 'naval').length >= 20);
});

test('training checks era, training building, civilization, population, resources and unlock state', () => {
  const future = evaluateTrainingEligibility({
    unit: { eraId: 'medieval', trainingBuildingId: 'stable', populationRequired: 2 }, canAfford: true,
    soldierCount: 1, soldierCap: 10, isUnlocked: true, hasNavalFacility: true,
    currentEraOrder: 0, unitEraOrder: 2, activeBuildingIds: ['stable'], availablePopulation: 5
  });
  assert.equal(future.ok, false);
  assert.ok(future.reasons.some(reason => reason.includes('时代')));

  const unique = evaluateTrainingEligibility({
    unit: { eraId: 'ancient', civilizationId: 'sumer', trainingBuildingId: 'barracks_hall', populationRequired: 1 },
    canAfford: true, soldierCount: 1, soldierCap: 10, isUnlocked: true, hasNavalFacility: true,
    currentEraOrder: 0, unitEraOrder: 0, activeBuildingIds: [], selectedCivilizationId: 'old_egypt', availablePopulation: 0
  });
  assert.equal(unique.ok, false);
  assert.ok(unique.reasons.some(reason => reason.includes('训练建筑')));
  assert.ok(unique.reasons.some(reason => reason.includes('文明')));
  assert.ok(unique.reasons.some(reason => reason.includes('空闲人口')));
});

test('battle resolver separates front, rear, flank, siege and naval lines and applies morale and supply', () => {
  const units = [
    { id: 'shield', domain: 'land', lane: 'front', combatPower: 10, roleTags: ['infantry', 'shield'], strongAgainst: ['light'], weakAgainst: ['ranged'] },
    { id: 'bow', domain: 'land', lane: 'rear', combatPower: 9, roleTags: ['ranged'], strongAgainst: ['infantry'], weakAgainst: ['cavalry'] },
    { id: 'horse', domain: 'land', lane: 'flank', combatPower: 12, roleTags: ['cavalry'], strongAgainst: ['ranged'], weakAgainst: ['spear'] },
    { id: 'engine', domain: 'land', lane: 'siege', combatPower: 15, roleTags: ['siege'], strongAgainst: ['building'], weakAgainst: ['light'] }
  ];
  const result = resolveBattleLines(['shield', 'bow', 'horse', 'engine'], ['shield', 'bow'], units, { morale: 80, supply: 0.75, terrain: 'G' });
  assert.equal(result.lines.front.count, 1);
  assert.equal(result.lines.rear.count, 1);
  assert.equal(result.lines.flank.count, 1);
  assert.equal(result.lines.siege.count, 1);
  assert.ok(result.adjustedPower < result.counterAdjustedPower, 'supply and morale reduce field power');
  assert.equal(isDomainCompatible('naval', 'S'), true);
  assert.equal(isDomainCompatible('naval', 'W'), true);
});
