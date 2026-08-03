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

test('fixed grand world contains twenty-four city-states and ninety-six wild sites on valid unique coordinates', () => {
  const cityStates = [...integration.outposts, ...world.cityStates];
  const placements = [...map.spawnManifest.cityStates, ...map.spawnManifest.wildSites];
  assert.equal(cityStates.length, 24);
  assert.equal(world.wildSites.length, 96);
  assert.equal(new Set(placements.map(site => `${site.gridX},${site.gridY}`)).size, placements.length);
  assert.equal(new Set(placements.map(site => site.id)).size, placements.length);
  for (const site of placements) {
    const ground = map.grid[site.gridY]?.[site.gridX];
    assert.ok(ground, site.id);
    assert.equal(['S', 'W'].includes(ground), site.domain === 'naval', `${site.id} domain`);
  }
  assert.ok(cityStates.every(state => state.personality && state.specialty && state.emblem));
  const spawn = map.spawnManifest.playerSpawn;
  assert.ok(map.spawnManifest.wildSites.every(site => Math.hypot(site.gridX - spawn.gridX, site.gridY - spawn.gridY) >= 12));
  assert.deepEqual(
    map.spawnManifest.cityStates.map(site => site.id).sort(),
    cityStates.map(site => site.id).sort()
  );
  assert.deepEqual(
    map.spawnManifest.wildSites.map(site => site.id).sort(),
    world.wildSites.map(site => site.id).sort()
  );
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
  assert.equal(Object.keys(diplomacy.getInterFactionRelations()).length, 276);
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
