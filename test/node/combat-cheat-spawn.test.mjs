import test from 'node:test';
import assert from 'node:assert/strict';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { CombatSystem } from '../../src/systems/CombatSystem.js';

test('key 4 cheat enemy uses fixed stats and spawns beside headquarters', () => {
  eventBus.clear();
  configRegistry._configs = {
    enemies: { enemies: [{ id: 'enemy_expansion_force', name: '测试敌人', domain: 'land' }], units: [] },
    buildings: [{ id: 'hq', isHeadquarters: true, footprint: { width: 2, height: 2 } }],
    map: { gridWidth: 8, gridHeight: 8, grid: Array.from({ length: 8 }, () => Array(8).fill('G')), initialBuildings: [{ buildingId: 'hq', gridX: 3, gridY: 3 }] }
  };
  const combat = new CombatSystem();
  combat.setBuildingSystem({ buildings: [{ buildingId: 'hq', status: 'active', gridX: 3, gridY: 3 }] });
  combat.setArmySystem({ getArmies: () => [] });
  combat._mapConfig = configRegistry.get('map');
  const result = combat.spawnCheatEnemyNearHeadquarters();
  assert.equal(result.ok, true);
  assert.equal(result.enemy.maxHp, 50);
  assert.equal(result.enemy.attack, 20);
  assert.equal(result.enemy.cp, 1);
  assert.equal(result.enemy.speed, 1);
  assert.ok(Math.max(Math.abs(result.enemy.gridX - 3), Math.abs(result.enemy.gridY - 3)) <= 3);
  const army = { id: 'test_army', gridX: result.enemy.gridX - 1, gridY: result.enemy.gridY, attack: 20, attackRange: 1, speed: 6 };
  combat.setArmySystem({
    getArmies: () => [army], getArmy: id => id === army.id ? army : null,
    consumeAttackCp: () => ({ ok: true }), applyDamage: () => ({ ok: true, destroyed: false }),
    healArmyAfterBattle: () => ({ healed: 0 }), _applyHeroActiveAttackLifesteal: () => 0
  });
  const battle = combat.attackEnemyWithArmy(result.enemy.id, army.id);
  assert.equal(battle.ok, true);
  assert.equal(result.enemy.hp, 10, 'normal strike plus speed bonus strike must persist on the real enemy');
});
