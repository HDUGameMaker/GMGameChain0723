import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { store } from '../../src/core/Store.js';
import { StrategySystem } from '../../src/systems/StrategySystem.js';
import { HeroSystem } from '../../src/systems/HeroSystem.js';

const root = resolve(import.meta.dirname, '../..');
const load = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const historicalContent = load('config/historical_content.json');
const eaIntegration = load('config/ea_integration.json');

test('strategy cards are consumed, timed, cooled down and saveable', () => {
  configRegistry._configs = { historicalContent };
  const system = new StrategySystem();
  system.initNew();
  system.gainCard('harvest_drive', 1);
  const before = system.getCardCount('harvest_drive');
  assert.equal(system.play('harvest_drive').ok, true);
  assert.equal(system.getCardCount('harvest_drive'), before - 1);
  assert.equal(system.getProductionMultiplier('food'), 1.5);
  assert.equal(system.canPlay('harvest_drive').ok, false);
  system.advanceTicks(8);
  assert.equal(system.getProductionMultiplier('food'), 1);

  const restored = new StrategySystem();
  restored.restoreState(system.getState());
  assert.deepEqual(restored.getState(), system.getState());
});

test('historical operational strategies replace magic effects', () => {
  configRegistry._configs = { historicalContent };
  const system = new StrategySystem();
  system.initNew();
  const freeze = historicalContent.strategies.find(item => item.effectType === 'freeze_enemy_countdown');
  const debuff = historicalContent.strategies.find(item => item.effectType === 'enemy_power_debuff');
  assert.ok(freeze && debuff, 'content pack must include countdown and enemy-power strategies');
  system.gainCard(freeze.id, 1);
  system.gainCard(debuff.id, 1);
  assert.equal(system.play(freeze.id).ok, true);
  assert.equal(system.play(debuff.id).ok, true);
  assert.equal(system.isCountdownFrozen(10, 10), true);
  assert.ok(system.getStrengthPenaltyAt(10, 10, 100) > 0);
});

test('tavern offers era-appropriate heroes and injured heroes recover', () => {
  configRegistry._configs = { historicalContent, eaIntegration };
  store.setState({ timeDay: 10, inspiration: 999 });
  const consumed = [];
  const system = new HeroSystem();
  system.setSystems({
    building: { buildings: [{ buildingId: 'tavern_hall', status: 'active' }] },
    resource: { canAfford: () => true, consumeAll: costs => consumed.push(costs) },
    culture: { getHeroSlotsBonus: () => 8 },
    era: { getCurrentEra: () => ({ id: 'medieval', order: 2 }) }
  });
  system.initNew();
  const expectedHeroes = new Set([
    ...(eaIntegration.heroes || []).map(item => item.id),
    ...(historicalContent.heroes || []).map(item => item.id)
  ]).size;
  assert.equal(system.getAllHeroes().length, expectedHeroes);
  assert.ok(system.getAvailableHeroes().every(hero => {
    const era = historicalContent.eras.find(item => item.id === hero.eraId);
    return !era || era.order <= 2;
  }));

  const hero = system.getAvailableHeroes().find(item => item.eraId);
  assert.ok(hero);
  assert.equal(system.recruitHero(hero.id).ok, true);
  assert.equal(consumed.length, 1);
  assert.equal(system.assignHero(hero.id, 'army').ok, true);
  assert.equal(system.injureHero(hero.id, 10).ok, true);
  assert.equal(system.getRecruitedHeroes().find(item => item.id === hero.id).status, 'injured');
  assert.deepEqual(system.getBonuses(), {});
  system.recoverInjuredHeroes(10 + (hero.recoveryDays || 3));
  assert.equal(system.getRecruitedHeroes().find(item => item.id === hero.id).status, 'active');
});
