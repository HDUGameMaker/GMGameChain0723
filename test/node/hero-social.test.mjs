import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { store } from '../../src/core/Store.js';
import { HeroSystem } from '../../src/systems/HeroSystem.js';

const historicalContent = JSON.parse(readFileSync(new URL('../../config/historical_content.json', import.meta.url), 'utf8'));
const eaIntegration = JSON.parse(readFileSync(new URL('../../config/ea_integration.json', import.meta.url), 'utf8'));
const defaultHero = [...(eaIntegration.heroes || []), ...(historicalContent.heroes || [])].find(hero => hero.defaultSpawn);

function createSystem() {
  eventBus.clear();
  store._state = { timeDay: 1 };
  configRegistry._configs = { historicalContent, eaIntegration };
  const heroes = new HeroSystem();
  heroes.setSystems({ era: { getCurrentEra: () => historicalContent.eras.at(-1) } });
  heroes.initNew();
  if (defaultHero?.id === 'Hestia') heroes.completeHestiaArrival();
  return heroes;
}

test('planner default-spawn hero joins the new-game roster with configured affinity', () => {
  const heroes = createSystem();
  assert.ok(defaultHero, 'the planner should configure one default-spawn hero');
  const recruited = heroes.getRecruitedHeroes().find(hero => hero.id === defaultHero.id);
  assert.ok(recruited);
  assert.equal(recruited.defaultSpawn, true);
  assert.equal(recruited.affinityLevel, defaultHero.initialAffinityLevel || 0);
  assert.equal(recruited.affinityProgress, defaultHero.initialAffinityProgress || 0);
});

test('affinity crosses 100-point levels, clamps at ten and strengthens hero stats', () => {
  const heroes = createSystem();
  assert.deepEqual(heroes.adjustAffinity(defaultHero.id, 250), { ok: true, level: 2, progress: 50 });
  const profile = heroes.getHeroAbilityProfile(defaultHero.id);
  assert.deepEqual(profile.stats, { hp: 90, attack: 38, speed: 4, attackRange: 1 });
  assert.deepEqual(heroes.adjustAffinity(defaultHero.id, 9999), { ok: true, level: 10, progress: 0 });
});

test('affinity survives save restore', () => {
  const heroes = createSystem();
  heroes.adjustAffinity(defaultHero.id, 135);
  const restored = createSystem();
  restored.restoreState(heroes.getState());
  const recruited = restored.getRecruitedHeroes().find(hero => hero.id === defaultHero.id);
  assert.equal(recruited.affinityLevel, 1);
  assert.equal(recruited.affinityProgress, 35);
});
