import test from 'node:test';
import assert from 'node:assert/strict';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { calculateCombatStrength } from '../../src/domain/CombatStrength.js';

test('headquarters and node-free gold producers are limited while research gains food costs', () => {
  const headquarters = { id: 'hq', isHeadquarters: true, maxCount: null };
  const mint = { id: 'mint', production: { output: [{ resourceId: 'gold', amount: 2 }] }, maxCount: null };
  const mine = { id: 'mine', requiredResourceNode: 'gold', production: { output: [{ resourceId: 'gold', amount: 2 }] }, maxCount: null };
  const academy = { id: 'academy', uniqueFunction: { sciencePerWorker: 2 } };
  const monument = { id: 'monument', uniqueFunction: { civicPerWorker: 1.5 } };
  const enemy = { id: 'wild_enemy', maxHp: 100, attack: 20, speed: 2, attackRange: 2, cp: 1 };
  const boss = { id: 'eastern_ruin_guardian', boss: true, maxHp: 20000, attack: 1500, speed: 3, attackRange: 3 };
  const originalEnemyStrength = calculateCombatStrength({ ...enemy, hp: enemy.maxHp });
  const tech = { id: 'tech', eraId: 'classical', pointCost: 100, cost: [{ resourceId: 'wood', amount: 10 }] };
  const civic = { id: 'civic', eraId: 'classical', pointCost: 80, cost: [] };
  configRegistry._configs = {
    buildings: [headquarters, mint, mine, academy, monument], techs: [tech], culture: [civic],
    enemies: { enemies: [enemy, boss] },
    historicalContent: { eras: [{ id: 'classical', order: 1 }], buildings: [], techs: [], civics: [] }
  };

  configRegistry._applyGameplayBalanceOverrides();

  assert.equal(headquarters.maxCount, 1);
  assert.equal(mint.maxCount, 2);
  assert.equal(mine.maxCount, null);
  assert.equal(academy.uniqueFunction.sciencePerWorker, 0.4);
  assert.equal(monument.uniqueFunction.civicPerWorker, 0.3);
  assert.ok(Math.abs(calculateCombatStrength({ ...enemy, hp: enemy.maxHp }) / originalEnemyStrength - 2) < 0.02);
  assert.equal(boss.maxHp, 20000);
  assert.equal(boss.attack, 1500);
  assert.ok(tech.cost.find(cost => cost.resourceId === 'food').amount >= 150);
  assert.ok(civic.cost.find(cost => cost.resourceId === 'food').amount >= 125);
});
