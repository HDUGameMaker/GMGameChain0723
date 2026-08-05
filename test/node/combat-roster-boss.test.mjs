import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { calculateCombatStrength } from '../../src/domain/CombatStrength.js';
import { CombatSystem } from '../../src/systems/CombatSystem.js';

const readJson = async relativePath => JSON.parse(await readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8'));

test('each era roster stays within 15 percent and reaches late-game speed/range limits', async () => {
  const historical = await readJson('config/historical_content.json');
  const enemies = await readJson('config/enemies.json');
  const ea = await readJson('config/ea_integration.json');
  const units = [...historical.units, ...(enemies.units || []), ...(ea.units || [])];
  for (const era of historical.eras) {
    const eraUnits = units.filter(unit => unit.eraId === era.id);
    assert.ok(eraUnits.length > 0, `${era.id} has units`);
    const scores = eraUnits.filter(unit => !unit.roleTags?.includes('healer') && !unit.civilizationId).map(unit => calculateCombatStrength(unit));
    assert.ok(Math.max(...scores) / Math.min(...scores) <= 1.15, `${era.id} spread exceeds 15%`);
    const healer = eraUnits.find(unit => unit.roleTags?.includes('healer'));
    assert.equal(healer.healingAfterBattle, healer.attack);
    assert.match(healer.description, /恢复量/);
  }
  const modern = units.filter(unit => unit.eraId === 'modern');
  assert.equal(Math.max(...modern.map(unit => unit.speed)), 5);
  assert.equal(Math.max(...modern.map(unit => unit.attackRange)), 5);
  assert.equal(historical.units.some(unit => /_navy_8$/.test(unit.id)), false);
});

test('modern heavy and swift full armies meet the boss survivability floor', async () => {
  const historical = await readJson('config/historical_content.json');
  const modern = historical.units.filter(unit => unit.eraId === 'modern' && unit.attackRange === 1 && !unit.roleTags?.includes('healer'));
  for (const archetype of ['swift', 'heavy', 'balanced']) {
    const unit = modern.find(candidate => candidate.archetype === archetype);
    assert.ok(unit, `missing ${archetype} benchmark`);
    const armyHp = unit.hp * 10;
    assert.ok(unit.attack * 10 >= 1400, `${archetype} attack is too low`);
    if (archetype === 'heavy') assert.ok(armyHp >= 3000);
    if (archetype === 'swift') assert.ok(armyHp >= 1500);
  }
});

test('eastern ruin boss spawns 2x2 in the east, turns hostile, returns and heals', async () => {
  eventBus.clear();
  const enemies = await readJson('config/enemies.json');
  const grid = Array.from({ length: 24 }, () => Array(32).fill('G'));
  configRegistry._configs = { enemies, map: { gridWidth: 32, gridHeight: 24, grid }, buildings: [] };
  const combat = new CombatSystem();
  combat.setBuildingSystem({ buildings: [] });
  const armies = [{ id: 'army_test', gridX: 0, gridY: 0, attack: 1000, attackRange: 3, speed: 5 }];
  combat.setArmySystem({
    getArmies: () => armies,
    getArmy: id => armies.find(army => army.id === id) || null,
    consumeAttackCp: () => ({ ok: true }),
    applyDamage: () => ({ ok: true, destroyed: false }),
    healArmyAfterBattle: () => ({ healed: 0 })
  });
  combat.init();
  const boss = combat.enemies.find(enemy => enemy.enemyId === 'eastern_ruin_guardian');
  assert.ok(boss.gridX >= 21);
  assert.deepEqual(boss.footprint, { width: 2, height: 2 });
  assert.equal(combat.getEnemyAt(boss.gridX + 1, boss.gridY + 1), boss);
  armies[0].gridX = boss.gridX - 1;
  armies[0].gridY = boss.gridY;
  const battle = combat.attackBossWithArmy(boss.id, armies[0].id);
  assert.equal(battle.ok, true);
  assert.equal(boss.hostile, true);
  assert.equal(boss.hp, 18000);
  armies.length = 0;
  boss.gridX -= 2;
  combat._updateEasternRuinBoss(boss, enemies.enemies.find(enemy => enemy.id === boss.enemyId));
  assert.equal(boss.gridX, boss.originX);
  combat._updateEasternRuinBoss(boss, enemies.enemies.find(enemy => enemy.id === boss.enemyId));
  assert.equal(boss.hp, 18200);
});

test('defeating the eastern ruin boss emits the game victory condition', async () => {
  eventBus.clear();
  const enemies = await readJson('config/enemies.json');
  const grid = Array.from({ length: 24 }, () => Array(32).fill('G'));
  configRegistry._configs = { enemies, map: { gridWidth: 32, gridHeight: 24, grid }, buildings: [] };
  const combat = new CombatSystem();
  combat.setBuildingSystem({ buildings: [] });
  const army = { id: 'victory_army', gridX: 0, gridY: 0, attack: 25000, attackRange: 3, speed: 10 };
  combat.setArmySystem({
    getArmies: () => [army], getArmy: id => id === army.id ? army : null,
    consumeAttackCp: () => ({ ok: true }), applyDamage: () => ({ destroyed: false }),
    healArmyAfterBattle: () => ({ healed: 0 })
  });
  combat.init();
  const boss = combat.enemies.find(enemy => enemy.enemyId === 'eastern_ruin_guardian');
  army.gridX = boss.gridX - 1;
  army.gridY = boss.gridY;
  let gameOver = null;
  eventBus.on('gameOver', payload => { gameOver = payload; });
  combat.attackBossWithArmy(boss.id, army.id);
  assert.deepEqual(gameOver, { win: true, reason: 'easternBossDefeated', armyId: army.id });
});
