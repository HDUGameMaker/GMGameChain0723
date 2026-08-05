import test from 'node:test';
import assert from 'node:assert/strict';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { LuxurySystem } from '../../src/systems/LuxurySystem.js';
import { HeroSystem } from '../../src/systems/HeroSystem.js';

test('every luxury grants three percent army attack and hp without duplicate stacking', () => {
  eventBus.clear();
  configRegistry._configs = {
    historicalContent: {
      luxuries: [
        { id: 'silk', effects: { goldProductionMul: 1.07 } },
        { id: 'ivory', effects: { armyHpMul: 1.07 } }
      ]
    }
  };
  const luxuries = new LuxurySystem();
  luxuries.initNew();
  assert.ok(luxuries.getLuxuries().every(luxury => luxury.effects.armyAttackMul >= 1.03 && luxury.effects.armyHpMul >= 1.03));
  luxuries.addLuxury('silk', 2);
  assert.equal(luxuries.getBonuses().armyAttackMul, 1.03);
  assert.equal(luxuries.getBonuses().armyHpMul, 1.03);
  luxuries.addLuxury('ivory', 1);
  assert.equal(luxuries.getBonuses().armyAttackMul, 1.06);
  assert.equal(luxuries.getBonuses().armyHpMul, 1.13);
  eventBus.clear();
});

test('Hestia hint rotation includes city-state combat and stele teleport guidance', () => {
  eventBus.clear();
  const heroes = new HeroSystem();
  heroes._recruited.Hestia = { affinityLevel: 0, dialogueProgress: {} };
  const hints = Array.from({ length: 7 }, () => heroes.beginHint('Hestia').conversation.nodes[0].text);
  assert.ok(hints.some(text => text.includes('攻打远处的城邦获取稀有资源')));
  assert.ok(hints.some(text => text.includes('选择远方另一个激活的石碑')));
  eventBus.clear();
});
