import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { DiplomacySystem } from '../../src/systems/DiplomacySystem.js';

const root = resolve(import.meta.dirname, '../..');
const integration = JSON.parse(readFileSync(resolve(root, 'config/ea_integration.json'), 'utf8'));

function setup() {
  configRegistry._configs = { eaIntegration: integration };
  const system = new DiplomacySystem();
  system.setSystems({
    resource: { canAfford: () => true, consumeAll: () => true, add: () => true },
    culture: { getUnlockedDiplomacyActions: () => Object.keys(integration.outpostActions) }
  });
  system.initNew();
  return system;
}

test('fixed city-states enter the map on day ten and hostile sites expand modestly', () => {
  const system = setup();
  assert.equal(system.getVisibleOutposts().length, 0);
  system.advanceDay(10);
  assert.equal(system.getVisibleOutposts().length, 6);
  const initial = system.getOutpostState('forest_camp');
  assert.equal(initial.active, true);
  assert.equal(initial.controlledCells.length, 1);
  system.advanceDay(13);
  const expanded = system.getOutpostState('forest_camp');
  assert.ok(expanded.controlledCells.length > 1);
  assert.ok(expanded.controlledCells.length <= 12, 'city-states remain much smaller than the player civilization');
});

test('neutral relations stop expansion while war and conquest remain available', () => {
  const system = setup();
  system.advanceDay(10);
  system.adjustRelation('forest_camp', 40, '停战谈判');
  const before = system.getOutpostState('forest_camp').controlledCells.length;
  system.advanceDay(16);
  assert.equal(system.getOutpostState('forest_camp').controlledCells.length, before);
  assert.ok(system.getDiplomaticSummary('forest_camp').availableTreaties.length >= 3);
  const battle = system.attackOutpost('forest_camp', { power: 999, armyId: 'army-1' });
  assert.equal(battle.victory, true);
  assert.equal(system.getOutpostState('forest_camp').status, 'defeated');
});

test('city-state activation, territory and treaties survive save restore', () => {
  const system = setup();
  system.advanceDay(13);
  const restored = setup();
  restored.restoreState(system.getState());
  assert.deepEqual(restored.getState(), system.getState());
});
