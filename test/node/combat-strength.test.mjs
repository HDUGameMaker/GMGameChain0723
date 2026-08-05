import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCombatStrength } from '../../src/domain/CombatStrength.js';
import { WildSiteSystem } from '../../src/systems/WildSiteSystem.js';
import { configRegistry } from '../../src/core/ConfigRegistry.js';

test('combat strength uses attack, hp, speed, range, CP and the 1.3 multiplier', () => {
  assert.equal(calculateCombatStrength({ attack: 10, hp: 40, speed: 2, attackRange: 3 }), 236.6);
});

test('wild-site battle strength is approximately doubled from its concrete combat attributes', () => {
  configRegistry._configs = { worldFactions: { wildSites: [{ id: 'camp', name: '营地', baseStrength: 20, attack: 8, maxHp: 30, speed: 2, attackRange: 2 }] }, map: { spawnManifest: { wildSites: [] } } };
  const sites = new WildSiteSystem();
  sites.setSystems({ era: { getCurrentEra: () => ({ order: 0 }) } });
  sites.initNew();
  const profile = sites.getSiteCombatProfile('camp');
  assert.deepEqual(
    { attack: profile.attack, hp: profile.hp, speed: profile.speed, attackRange: profile.attackRange, strength: sites.getSiteStrength('camp') },
    { attack: 32, hp: 121, speed: 2, attackRange: 2, strength: 311.22 }
  );
});
