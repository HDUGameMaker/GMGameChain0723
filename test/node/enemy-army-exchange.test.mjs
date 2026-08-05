import test from 'node:test';
import assert from 'node:assert/strict';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { EnemyExpansionSystem } from '../../src/systems/EnemyExpansionSystem.js';

test('faster strategic enemies strike first and actively attack armies in range', () => {
  eventBus.clear();
  configRegistry._configs = {
    enemies: { enemies: [{ id: 'enemy_force', name: '袭击者', faction: '北方敌军', maxHp: 10, attack: 4, attackRange: 1, speed: 2, strategicOnly: true }] }
  };
  const armyState = { id: 'army-1', ownerId: 'player', name: '守军', gridX: 0, gridY: 0, unitIds: ['guard'], hp: 10 };
  const army = {
    getArmy: () => ({ ...armyState, unitIds: [...armyState.unitIds] }),
    getArmies: () => [{ ...armyState, unitIds: [...armyState.unitIds] }],
    getArmyStats: () => ({ attack: 6, maxHp: 10, hp: armyState.hp, attackRange: 1, speed: 1 }),
    applyDamage: (_id, damage) => {
      armyState.hp -= damage;
      if (armyState.hp <= 0) armyState.unitIds = [];
      return { ok: true, destroyed: armyState.hp <= 0, hp: Math.max(0, armyState.hp) };
    }
  };
  const system = new EnemyExpansionSystem();
  system.setArmySystem(army);
  system._cells.set('1,0', { enemyId: 'enemy_force', hp: 10, strength: 1, countdown: 2 });

  const first = system.clearEnemyCellWithArmy(1, 0, 'army-1');
  assert.deepEqual(first.attacks, [{ side: 'enemy', damage: 4 }, { side: 'player', damage: 6 }]);
  assert.equal(armyState.hp, 6);
  assert.equal(system.getCellAt(1, 0).hp, 4);

  system._attackArmiesInRange();
  assert.equal(armyState.hp, 2);
  assert.equal(system.getCellAt(1, 0), null);
});

test('enemy detail data exposes configured identity and combat attributes', () => {
  configRegistry._configs = {
    enemies: { enemies: [{ id: 'enemy_force', name: '袭击者', icon: 'enemy.svg', faction: '北方敌军', maxHp: 10, attack: 4, attackRange: 3, speed: 1.5, strategicOnly: true }] }
  };
  const system = new EnemyExpansionSystem();
  system._cells.set('2,3', { enemyId: 'enemy_force', hp: 7, strength: 1, countdown: 2 });
  assert.deepEqual(system.getAllCells()[0], {
    x: 2, y: 3, enemyId: 'enemy_force', hp: 7, strength: 1, countdown: 2,
    name: '袭击者', icon: 'enemy.svg', faction: '北方敌军', maxHp: 10, attack: 4, attackRange: 3, speed: 1.5, cp: 1
  });
});

test('enemy initiated combat waits for the blocking battle preview before applying damage', async () => {
  configRegistry._configs = { enemies: { enemies: [{ id: 'enemy_force', maxHp: 10, attack: 4, attackRange: 1, speed: 2, strategicOnly: true }] } };
  const armyState = { id: 'army-1', ownerId: 'player', gridX: 0, gridY: 0, unitIds: ['guard'], hp: 10 };
  const army = {
    getArmy: () => ({ ...armyState }), getArmies: () => [{ ...armyState }],
    getArmyStats: () => ({ attack: 6, maxHp: 10, hp: armyState.hp, attackRange: 1, speed: 1 }),
    applyDamage: (_id, damage) => { armyState.hp -= damage; return { destroyed: armyState.hp <= 0 }; }
  };
  const system = new EnemyExpansionSystem();
  system.setArmySystem(army);
  system._cells.set('1,0', { enemyId: 'enemy_force', hp: 10, strength: 1, countdown: 2 });
  let preview = null;
  system.setBattlePreviewHandler(data => { preview = data; });
  system._attackArmiesInRange();
  assert.ok(preview);
  assert.equal(armyState.hp, 10);
  assert.equal(system.getCellAt(1, 0).hp, 10);
  preview.resolveBattle();
  assert.equal(armyState.hp, 6);
  assert.equal(system.getCellAt(1, 0).hp, 4);
  await Promise.resolve();
});
