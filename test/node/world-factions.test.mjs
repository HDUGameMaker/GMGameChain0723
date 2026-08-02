import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { DiplomacySystem } from '../../src/systems/DiplomacySystem.js';
import { WildSiteSystem } from '../../src/systems/WildSiteSystem.js';

const world = JSON.parse(readFileSync(new URL('../../config/world-factions.json', import.meta.url), 'utf8'));
const integration = JSON.parse(readFileSync(new URL('../../config/ea_integration.json', import.meta.url), 'utf8'));
const map = JSON.parse(readFileSync(new URL('../../config/maps/base_map.json', import.meta.url), 'utf8'));

test('world contains twelve weaker city-states and eighteen separate wild sites on valid terrain', () => {
  assert.equal(integration.outposts.length + world.cityStates.length, 12);
  assert.equal(world.wildSites.length, 18);
  for (const site of [...world.cityStates, ...world.wildSites]) {
    const ground = map.grid[site.gridY]?.[site.gridX];
    assert.ok(ground, site.id);
    assert.equal(['S', 'W'].includes(ground), site.domain === 'naval', `${site.id} domain`);
  }
  assert.ok(world.cityStates.every(state => state.developmentProfile && state.specialty));
});

test('city-states synchronize their limited development and garrisons to the player era', () => {
  eventBus.clear();
  configRegistry._configs = {
    eaIntegration: integration,
    worldFactions: world,
    historicalContent: { eras: [
      { id: 'primitive', order: 0, name: '原始时代' },
      { id: 'medieval', order: 3, name: '中世纪' }
    ] }
  };
  const era = { getCurrentEra: () => ({ id: 'medieval', order: 3, name: '中世纪' }) };
  const diplomacy = new DiplomacySystem();
  diplomacy.setSystems({ era });
  diplomacy.initNew();
  diplomacy.advanceDay(10);
  const state = diplomacy.getOutpostState(world.cityStates[0].id);
  assert.equal(state.currentEraId, 'medieval');
  assert.equal(state.developmentLevel, 4);
  assert.ok(diplomacy.getOutpostDefense(world.cityStates[0].id) > world.cityStates[0].militaryStrength);
  assert.equal(Object.keys(diplomacy.getInterFactionRelations()).length, 66);
});

test('wild sites can be cleared for rewards and respawn without entering diplomacy', () => {
  eventBus.clear();
  configRegistry._configs = { worldFactions: world };
  const rewards = {};
  const resource = { addClamped(id, amount) { rewards[id] = (rewards[id] || 0) + amount; } };
  const era = { getCurrentEra: () => ({ id: 'ancient', order: 1 }) };
  const wild = new WildSiteSystem();
  wild.setSystems({ resource, era });
  wild.initNew();
  const site = world.wildSites[0];
  const result = wild.attackSite(site.id, 9999, 'army_1');
  assert.equal(result.victory, true);
  assert.ok(Object.values(rewards).some(amount => amount > 0));
  assert.equal(wild.getSiteState(site.id).active, false);
  assert.equal(typeof wild.performDiplomacy, 'undefined');
  eventBus.emit('dayStart', { day: site.respawnDays + 1 });
  assert.equal(wild.getSiteState(site.id).active, true);
});
