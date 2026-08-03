import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { DiplomacySystem } from '../../src/systems/DiplomacySystem.js';

const integration = JSON.parse(await readFile(new URL('../../config/ea_integration.json', import.meta.url), 'utf8'));
const map = JSON.parse(await readFile(new URL('../../config/maps/base_map.json', import.meta.url), 'utf8'));

function setup(unlocked = ['talk', 'gift', 'aid', 'negotiate', 'trade', 'ceasefire', 'alliance']) {
  configRegistry._configs.eaIntegration = integration;
  configRegistry._configs.map = map;
  const resources = { wood: 200, stone: 200, food: 200, gold: 200 };
  const resource = {
    canAfford: costs => costs.every(cost => (resources[cost.resourceId] || 0) >= cost.amount),
    consumeAll: costs => costs.forEach(cost => { resources[cost.resourceId] -= cost.amount; }),
    add: (id, amount) => { resources[id] = (resources[id] || 0) + amount; }
  };
  const culture = { getUnlockedDiplomacyActions: () => unlocked };
  const system = new DiplomacySystem();
  system.setSystems({ resource, culture });
  system.initNew();
  return { system, resources };
}

test('six fixed NPC outposts occupy terrain matching their domain', () => {
  assert.equal(integration.outposts.length, 6);
  const positions = new Map(map.spawnManifest.cityStates.map(outpost => [outpost.id, outpost]));
  for (const configured of integration.outposts) {
    const outpost = { ...configured, ...positions.get(configured.id) };
    const terrain = map.grid[outpost.gridY][outpost.gridX];
    assert.equal(outpost.domain === 'naval' ? ['S', 'W'].includes(terrain) : !['S', 'W'].includes(terrain), true, outpost.id);
    assert.equal(outpost.develops, false);
    assert.ok(Number.isFinite(outpost.militaryStrength));
  }
});

test('basic diplomacy costs only four main resources and persists relation changes', () => {
  const { system, resources } = setup();
  const before = system.getOutpostState('forest_camp').relation;
  const result = system.performAction('forest_camp', 'gift');
  assert.equal(result.ok, true);
  assert.ok(system.getOutpostState('forest_camp').relation > before);
  assert.ok(resources.food < 200);
  for (const action of Object.values(integration.outpostActions)) {
    for (const cost of action.cost || []) assert.ok(['wood', 'stone', 'food', 'gold'].includes(cost.resourceId));
  }
});

test('culture gates advanced diplomacy while talk, gift and aid remain basic', () => {
  const { system } = setup(['talk']);
  assert.ok(system.getAvailableActions('forest_camp').includes('gift'));
  assert.ok(system.getAvailableActions('forest_camp').includes('aid'));
  assert.equal(system.performAction('forest_camp', 'alliance').ok, false);
});

test('conquest preserves the fixed outpost and its defeated state through save restore', () => {
  const { system } = setup();
  const result = system.attackOutpost('forest_camp', { power: 999, armyId: 'army-1' });
  assert.equal(result.victory, true);
  assert.equal(system.getOutpostState('forest_camp').status, 'defeated');
  assert.ok(system.getAllOutposts().some(outpost => outpost.id === 'forest_camp'));

  const restored = new DiplomacySystem();
  restored.restoreState(system.getState());
  assert.equal(restored.getOutpostState('forest_camp').status, 'defeated');
});
