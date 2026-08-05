import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { store } from '../../src/core/Store.js';
import { HeroSystem } from '../../src/systems/HeroSystem.js';

const historicalContent = JSON.parse(readFileSync(new URL('../../config/historical_content.json', import.meta.url), 'utf8'));
const eaIntegration = JSON.parse(readFileSync(new URL('../../config/ea_integration.json', import.meta.url), 'utf8'));

function setup(order = 0) {
  eventBus.clear();
  store._state = { timeDay: 1 };
  configRegistry._configs = { historicalContent, eaIntegration };
  let eraOrder = order;
  const heroes = new HeroSystem();
  heroes.setSystems({ era: { getCurrentEra: () => ({ order: eraOrder }) } });
  heroes.initNew();
  heroes.completeHestiaArrival();
  return { heroes, setEra: value => { eraOrder = value; } };
}

test('affinity level caps follow the five eras', () => {
  const { heroes, setEra } = setup(0);
  for (const [order, cap] of [3, 5, 7, 9, 10].entries()) {
    setEra(order);
    assert.equal(heroes.getAffinityLevelCap(), cap);
    heroes._recruited.Hestia.affinityLevel = 0;
    heroes._recruited.Hestia.affinityProgress = 0;
    assert.equal(heroes.adjustAffinity('Hestia', 9999).level, cap);
  }
});

test('Hestia uses segmented stats and affinity milestone effects', () => {
  const { heroes } = setup(4);
  const expected = {
    3: { hp: 100, attack: 42, speed: 4, lifeSteal: 0.3, damageMultiplier: 2 },
    5: { hp: 200, attack: 102, speed: 5, lifeSteal: 0.3, damageMultiplier: 2 },
    7: { hp: 340, attack: 182, speed: 5, lifeSteal: 0.5, damageMultiplier: 2 },
    9: { hp: 540, attack: 282, speed: 6, lifeSteal: 0.5, damageMultiplier: 2 },
    10: { hp: 540, attack: 382, speed: 7, lifeSteal: 0.5, damageMultiplier: 3 }
  };
  for (const [levelText, values] of Object.entries(expected)) {
    heroes._recruited.Hestia.affinityLevel = Number(levelText);
    const profile = heroes.getHeroAbilityProfile('Hestia');
    assert.equal(profile.stats.hp, values.hp);
    assert.equal(profile.stats.attack, values.attack);
    assert.equal(profile.stats.speed, values.speed);
    assert.equal(profile.activeSkill.lifeSteal, values.lifeSteal);
    assert.equal(profile.activeSkill.damageMultiplier, values.damageMultiplier);
  }
});
