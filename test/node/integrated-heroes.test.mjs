import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { store } from '../../src/core/Store.js';
import { HeroSystem } from '../../src/systems/HeroSystem.js';

const integration = JSON.parse(await readFile(new URL('../../config/ea_integration.json', import.meta.url), 'utf8'));

function setup(hasTavern = true) {
  configRegistry._configs.eaIntegration = integration;
  store.setState({ inspiration: 400, timeDay: 1 });
  const stock = { wood: 500, stone: 500, food: 500, gold: 500 };
  const system = new HeroSystem();
  system.setSystems({
    building: { buildings: hasTavern ? [{ buildingId: 'tavern', status: 'active' }] : [] },
    resource: {
      canAfford: costs => costs.every(cost => (stock[cost.resourceId] || 0) >= cost.amount),
      consumeAll: costs => costs.forEach(cost => { stock[cost.resourceId] -= cost.amount; })
    },
    culture: { getHeroSlotsBonus: () => 1 }
  });
  system.initNew();
  return system;
}

test('integration contains a worker-free tavern and at least twelve historical heroes', () => {
  const tavern = integration.buildings.find(building => building.id === 'tavern');
  assert.ok(tavern);
  assert.equal(tavern.maxWorkers, 0);
  assert.ok(integration.heroes.length >= 12);
  const roles = new Set(integration.heroes.map(hero => hero.role));
  for (const role of ['commander', 'diplomat', 'engineer', 'explorer', 'physician', 'scholar']) assert.ok(roles.has(role));
});

test('all hero and tavern costs use only the main four resources', () => {
  const allowed = new Set(['wood', 'stone', 'food', 'gold']);
  for (const hero of integration.heroes) for (const cost of hero.cost || []) assert.ok(allowed.has(cost.resourceId));
  const tavern = integration.buildings.find(building => building.id === 'tavern');
  for (const cost of tavern.buildCost || []) assert.ok(allowed.has(cost.resourceId));
});

test('heroes require an active tavern and assigned heroes aggregate bonuses', () => {
  const blocked = setup(false);
  assert.equal(blocked.recruitHero(blocked.getAvailableHeroes()[0].id).ok, false);

  const system = setup(true);
  const hero = system.getAvailableHeroes()[0];
  assert.equal(system.recruitHero(hero.id).ok, true);
  assert.equal(system.assignHero(hero.id, 'council').ok, true);
  assert.ok(Object.keys(system.getBonuses()).length > 0);
  assert.equal(system.getAssignmentLimit(), 3);
});

test('hero recruitment and assignment survive save restore', () => {
  const system = setup(true);
  const hero = system.getAvailableHeroes()[0];
  system.recruitHero(hero.id);
  system.assignHero(hero.id, 'army');
  const restored = setup(true);
  restored.restoreState(system.getState());
  assert.equal(restored.getRecruitedHeroes()[0].assignment, 'army');
});
