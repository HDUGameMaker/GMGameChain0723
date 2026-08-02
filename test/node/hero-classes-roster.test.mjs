import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { store } from '../../src/core/Store.js';
import { HeroSystem } from '../../src/systems/HeroSystem.js';

const root = resolve(import.meta.dirname, '../..');
const load = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const historicalContent = load('config/historical_content.json');
const eaIntegration = load('config/ea_integration.json');

function createSystem(order = 6) {
  configRegistry._configs = { historicalContent, eaIntegration };
  store.setState({ timeDay: 20, inspiration: 99999 });
  const system = new HeroSystem();
  system.setSystems({
    building: { buildings: [{ buildingId: 'tavern_hall', status: 'active' }] },
    resource: { canAfford: () => true, consumeAll: () => {} },
    culture: { getHeroSlotsBonus: () => 100 },
    era: { getCurrentEra: () => ({ id: historicalContent.eras[order].id, order }) }
  });
  system.initNew();
  return system;
}

test('runtime roster contains exactly 72 unique heroes split into substantial military and civil pools', () => {
  const heroes = createSystem().getAllHeroes();
  assert.equal(heroes.length, 72);
  assert.equal(new Set(heroes.map(hero => hero.id)).size, 72);
  assert.ok(heroes.filter(hero => hero.heroClass === 'military').length >= 25);
  assert.ok(heroes.filter(hero => hero.heroClass === 'civil').length >= 25);
  for (const hero of heroes) {
    assert.ok(['military', 'civil'].includes(hero.heroClass), `${hero.id} heroClass`);
    assert.ok(hero.description, `${hero.id} description`);
    assert.ok(hero.icon, `${hero.id} icon`);
    assert.ok(hero.skills?.length, `${hero.id} skills`);
    assert.ok(hero.assignmentTargets?.length, `${hero.id} assignmentTargets`);
  }
});

test('new eras keep every unowned hero from the current and previous eras recruitable', () => {
  const system = createSystem(4);
  const pool = system.getRecruitableHeroes();
  const eraOrder = Object.fromEntries(historicalContent.eras.map(era => [era.id, era.order]));
  assert.ok(pool.some(hero => eraOrder[hero.eraId] === 1));
  assert.ok(pool.some(hero => eraOrder[hero.eraId] === 4));
  assert.ok(pool.every(hero => !hero.eraId || eraOrder[hero.eraId] <= 4));
});

test('military heroes only command armies while civil heroes use non-combat assignments', () => {
  const system = createSystem();
  const military = system.getAllHeroes().find(hero => hero.heroClass === 'military');
  const civil = system.getAllHeroes().find(hero => hero.heroClass === 'civil');
  system._availableIds = [military.id, civil.id];
  assert.equal(system.recruitHero(military.id).ok, true);
  assert.equal(system.recruitHero(civil.id).ok, true);
  assert.equal(system.assignHero(military.id, { type: 'academy', buildingId: 'academy-1' }).ok, false);
  assert.equal(system.assignHero(civil.id, { type: 'army', armyId: 'army-1' }).ok, false);
  assert.equal(system.assignHero(military.id, { type: 'army', armyId: 'army-1' }).ok, true);
  assert.equal(system.assignHero(civil.id, { type: 'academy', buildingId: 'academy-1' }).ok, true);
});
