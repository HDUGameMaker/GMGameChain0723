import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { store } from '../../src/core/Store.js';
import { HeroSystem } from '../../src/systems/HeroSystem.js';

const historicalContent = JSON.parse(readFileSync(new URL('../../config/historical_content.json', import.meta.url), 'utf8'));
const eaIntegration = JSON.parse(readFileSync(new URL('../../config/ea_integration.json', import.meta.url), 'utf8'));

function createHeroes() {
  eventBus.clear();
  store._state = { timeDay: 1 };
  configRegistry._configs = { historicalContent, eaIntegration };
  return new HeroSystem();
}

test('all 72 heroes expose two skills, two relationship tags and a roster combination', () => {
  const heroes = createHeroes().getAllHeroes();
  assert.equal(heroes.length, 72);
  for (const hero of heroes) {
    assert.ok(hero.skills.length >= 2, `${hero.id} skills`);
    assert.ok(hero.relationshipTags.length >= 2, `${hero.id} relationship tags`);
    assert.ok(hero.combinations.length >= 1, `${hero.id} combinations`);
  }
});

test('hero experience levels up, unlocks skills and survives save restore', () => {
  const heroes = createHeroes();
  heroes.restoreState({ recruited: { sun_tzu: { heroId: 'sun_tzu', assignment: { type: 'army', id: 'army_1' } } } });
  assert.equal(heroes.grantExperience('sun_tzu', 250).ok, true);
  const progressed = heroes.getRecruitedHeroes().find(hero => hero.id === 'sun_tzu');
  assert.equal(progressed.level, 3);
  assert.equal(progressed.experience, 50);
  assert.ok(progressed.unlockedSkills.length >= 2);

  const restored = createHeroes();
  restored.restoreState(heroes.getState());
  const savedHero = restored.getRecruitedHeroes().find(hero => hero.id === 'sun_tzu');
  assert.equal(savedHero.level, 3);
  assert.equal(savedHero.experience, 50);
});

test('assigned compatible heroes activate a shared combination effect', () => {
  const heroes = createHeroes();
  const [first, second] = heroes.getAllHeroes();
  heroes.restoreState({ recruited: {
    [first.id]: { heroId: first.id, assignment: { type: 'army', id: 'army_1' }, level: 1, experience: 0 },
    [second.id]: { heroId: second.id, assignment: { type: 'army', id: 'army_2' }, level: 1, experience: 0 }
  } });
  assert.ok(Array.isArray(heroes.getActiveCombinations()));
  assert.ok(heroes.getActiveCombinations().length >= 1);
  assert.ok(Object.keys(heroes.getBonuses()).length > 0);
});
