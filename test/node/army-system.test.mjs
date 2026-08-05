import test from 'node:test';
import assert from 'node:assert/strict';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { ArmySystem } from '../../src/systems/ArmySystem.js';

function createScenario() {
  eventBus.clear();
  configRegistry._configs = {
    enemies: {
      units: [
        { id: 'spears', name: '长矛兵', commandPoints: 2, combatPower: 10, hp: 5, attack: 2, attackRange: 1, cp: 1, speed: 1, domain: 'land', branch: 'anti_cavalry' },
        { id: 'archers', name: '弓箭手', commandPoints: 3, combatPower: 12, hp: 4, attack: 3, attackRange: 2, cp: 3, speed: 2, domain: 'land', branch: 'ranged' },
        { id: 'healer', name: '军医', hp: 4, attack: 3, attackRange: 1, cp: 1, speed: 1, domain: 'land', branch: 'infantry', roleTags: ['support', 'healer'], healingAfterBattle: 3 },
        { id: 'galley', name: '桨帆战船', commandPoints: 5, combatPower: 20, domain: 'naval', branch: 'navy' }
      ],
      formations: [{ id: 'shield_wall', name: '盾墙', requiredUnits: [], combatPowerBonus: 5, unlocked: true }]
    },
    buildings: [
      { id: 'war_academy', uniqueFunction: { armyCapacityBonus: 1, commandPointsBonus: 5 } },
      { id: 'castle', footprint: { width: 2, height: 2 }, uniqueFunction: { armyCapacityBonus: 1, garrisonCapacity: 2, garrisonDefenseMul: 1.35 } },
      { id: 'harbor', footprint: { width: 1, height: 1 }, uniqueFunction: { transportCapacity: 12 } }
    ],
    map: {
      gridWidth: 5,
      gridHeight: 4,
      grid: [
        ['G', 'G', 'G', 'S', 'S'],
        ['G', 'G', 'G', 'S', 'S'],
        ['G', 'G', 'G', 'S', 'S'],
        ['G', 'G', 'G', 'S', 'S']
      ]
    }
  };
  const building = {
    buildings: [
      { buildingId: 'war_academy', status: 'active', gridX: 0, gridY: 0 },
      { buildingId: 'castle', status: 'active', gridX: 0, gridY: 1 },
      { buildingId: 'harbor', status: 'active', gridX: 2, gridY: 1 }
    ]
  };
  const recruited = [
    { id: 'caesar', heroId: 'caesar', name: '恺撒', role: 'commander', status: 'active', icon: 'caesar-icon.png' },
    { id: 'confucius', heroId: 'confucius', name: '孔子', role: 'scholar', status: 'active', bonuses: { scholarPowerMul: 1.2 } }
  ];
  const hero = {
    getRecruitedHeroes: () => recruited,
    getHeroAbilityProfile: id => id === 'caesar' ? { stats: { hp: 12, attack: 4, speed: 3, attackRange: 2 } } : null,
    assignHero: () => ({ ok: true })
  };
  const culture = { getCommandPointsBonus: () => 2 };
  const army = new ArmySystem();
  army.setSystems({ building, hero, culture });
  army.initNew();
  army.setAvailableUnits({ spears: 4, archers: 2, healer: 2, galley: 1 });
  return { army };
}

test('military command buildings increase the finite army capacity', () => {
  const { army } = createScenario();
  assert.equal(army.getArmyCapacity(), 4);
  assert.equal(army.createArmy('第一军团').ok, true);
  assert.equal(army.createArmy('第二军团').ok, true);
  assert.equal(army.createArmy('第三军团').ok, true);
  assert.equal(army.createArmy('第四军团').ok, true);
  assert.equal(army.createArmy('第五军团').reason, 'army_capacity_full');
});

test('army composition moves trained units out of reserves without command points', () => {
  const { army } = createScenario();
  const created = army.createArmy('北方军团').army;
  assert.equal(army.addUnit(created.id, 'spears', 3).ok, true);
  assert.equal(army.addUnit(created.id, 'archers', 2).ok, true);
  assert.equal(Object.hasOwn(army.getArmy(created.id), 'usedCommandPoints'), false);
  assert.equal(army.getAvailableUnits().spears, 1);
  assert.equal(army.removeUnit(created.id, 'spears', 1).ok, true);
  assert.equal(army.getAvailableUnits().spears, 2);
});

test('army unit capacity starts at 5, gains research bonuses, and never exceeds 10', () => {
  const { army } = createScenario();
  assert.equal(army.getArmyUnitCapacity(), 5);
  const created = army.createArmy('容量测试').army;
  army.addReserveUnit('spears', 1);
  assert.equal(army.addUnit(created.id, 'spears', 5).ok, true);
  assert.equal(army.addUnit(created.id, 'archers', 1).reason, 'army_unit_capacity_full');
  army._tech = { getEffects: () => ({ armyUnitCapacityBonus: 20 }) };
  assert.equal(army.getArmyUnitCapacity(), 10);
});

test('healers restore their attack value after an engagement', () => {
  const { army } = createScenario();
  const wounded = army.createArmy('治疗测试', { x: 0, y: 0 }).army;
  army.addUnit(wounded.id, 'spears', 1);
  army.addUnit(wounded.id, 'healer', 1);
  army.applyDamage(wounded.id, 5);
  assert.equal(army.healArmyAfterBattle(wounded.id).healed, 3);
  assert.equal(army.getArmy(wounded.id).hp, 7);
});

test('healers restore half their healing amount every tick', () => {
  const { army } = createScenario();
  const group = army.createArmy('时段治疗').army;
  army.addUnit(group.id, 'healer', 1);
  army.applyDamage(group.id, 3);
  eventBus.emit('tick', {});
  assert.equal(army.getArmyStats(group.id).hp, 2.5);
});

test('army attack range is the unit-count weighted average rounded down', () => {
  const { army } = createScenario();
  const created = army.createArmy('混编军团', { x: 0, y: 0 }).army;
  army.addUnit(created.id, 'spears', 3);
  army.addUnit(created.id, 'archers', 2);

  // (3 × 1 + 2 × 2) / 5 = 1.4，向下取整为 1。
  assert.equal(army.getArmyAttackRange(created.id), 1);
  assert.equal(army.getArmy(created.id).attackRange, 1);
  assert.deepEqual(army.canAttackTarget(created.id, 1, 0), { ok: true, distance: 1, attackRange: 1 });
  assert.deepEqual(army.canAttackTarget(created.id, 2, 0), { ok: false, reason: 'target_out_of_range', distance: 2, attackRange: 1 });
});

test('army CP is weighted, spent by attacks, blocks at zero, and refills every tick', () => {
  const { army } = createScenario();
  const attacker = army.createArmy('CP军团', { x: 0, y: 0 }).army;
  const defender = army.createArmy('目标军团', { x: 1, y: 0 }).army;
  army.addUnit(attacker.id, 'spears', 3);
  army.addUnit(attacker.id, 'archers', 2);
  army.addUnit(defender.id, 'spears', 1);
  assert.equal(army.getArmyCpMax(attacker.id), 1); // floor((3*1 + 2*3) / 5)
  assert.equal(army.resolveEngagement(attacker.id, defender.id).ok, true);
  assert.equal(army.getArmy(attacker.id).cp, 0);
  assert.equal(army.canAttackTarget(attacker.id, 1, 0).reason, 'insufficient_cp');
  eventBus.emit('tick', {});
  assert.equal(army.getArmy(attacker.id).cp, 1);
});

test('army attack and hp add while speed uses the unit-count average', () => {
  const { army } = createScenario();
  const created = army.createArmy('属性军团').army;
  army.addUnit(created.id, 'spears', 3);
  army.addUnit(created.id, 'archers', 2);
  assert.deepEqual(army.getArmyStats(created.id), { attack: 12, maxHp: 23, hp: 23, attackRange: 1, speed: 1.4 });
});

test('key 5 cheat spawns a fixed-stat Hestia-led army', () => {
  const { army } = createScenario();
  const result = army.spawnCheatHestiaArmyNearHeadquarters();
  assert.equal(result.ok, true);
  assert.equal(result.army.heroId, 'Hestia');
  assert.deepEqual(result.army.unitIds, ['primitive_healer']);
  assert.equal(result.army.healingAfterBattle, 10);
  assert.deepEqual(army.getArmyStats(result.army.id), {
    attack: 20, maxHp: 50, hp: 50, attackRange: 1, speed: 6
  });
  assert.equal(result.army.cp, 1);
  assert.equal(result.army.maxCp, 1);
});

test('key 6 cheat spawns a fixed super army', () => {
  const { army } = createScenario();
  const result = army.spawnCheatSuperArmyNearHeadquarters();
  assert.equal(result.ok, true);
  assert.equal(result.army.heroId, null);
  assert.deepEqual(army.getArmyStats(result.army.id), {
    attack: 10000, maxHp: 10000, hp: 10000, attackRange: 1, speed: 10
  });
  assert.equal(result.army.cp, 10);
  assert.equal(result.army.maxCp, 10);
});

test('Hestia active-attack lifesteal restores the leading army', () => {
  const { army } = createScenario();
  const created = army.createArmy('月光吸血测试').army;
  army.addUnit(created.id, 'spears', 2);
  army._findArmy(created.id).heroId = 'Hestia';
  army._hero = {
    getHeroAbilityProfile: () => ({ activeSkill: { activeAttackLifeSteal: 0.3 } }),
    getRecruitedHeroes: () => []
  };
  army.applyDamage(created.id, 5);
  assert.equal(army._applyHeroActiveAttackLifesteal(created.id, 10), 3);
  assert.equal(army._findArmy(created.id).hpDamage, 2);
});

test('faster armies attack first and an out-ranged defender cannot retaliate', () => {
  const { army } = createScenario();
  const melee = army.createArmy('近战军', { x: 0, y: 0 }).army;
  const ranged = army.createArmy('远程军', { x: 1, y: 0 }).army;
  army.addUnit(melee.id, 'spears', 1);
  army.addUnit(ranged.id, 'archers', 1);
  const closeBattle = army.resolveEngagement(melee.id, ranged.id);
  assert.deepEqual(closeBattle.attacks.map(attack => attack.attackerId), [ranged.id, melee.id]);
  assert.equal(army.getArmy(melee.id).hp, 2);
  assert.equal(army.getArmy(ranged.id).hp, 2);

  const secondScenario = createScenario().army;
  const rangedAttacker = secondScenario.createArmy('远射军', { x: 0, y: 0 }).army;
  const meleeDefender = secondScenario.createArmy('守军', { x: 2, y: 0 }).army;
  secondScenario.addUnit(rangedAttacker.id, 'archers', 1);
  secondScenario.addUnit(meleeDefender.id, 'spears', 1);
  const rangedBattle = secondScenario.resolveEngagement(rangedAttacker.id, meleeDefender.id);
  assert.deepEqual(rangedBattle.attacks.map(attack => attack.attackerId), [rangedAttacker.id]);
  assert.equal(secondScenario.getArmy(rangedAttacker.id).hp, 4);
  assert.equal(secondScenario.getArmy(meleeDefender.id).hp, 2);
});

test('a unit destroyed by the first strike cannot counterattack', () => {
  const { army } = createScenario();
  configRegistry._configs.enemies.units.find(unit => unit.id === 'archers').attack = 10;
  const fast = army.createArmy('先攻军', { x: 0, y: 0 }).army;
  const fragile = army.createArmy('反击军', { x: 1, y: 0 }).army;
  army.addUnit(fast.id, 'archers', 1);
  army.addUnit(fragile.id, 'spears', 1);
  const battle = army.resolveEngagement(fast.id, fragile.id);
  assert.deepEqual(battle.attacks.map(attack => attack.attackerId), [fast.id]);
  assert.equal(army.getArmy(fragile.id), null, 'destroyed armies are removed immediately');
  assert.equal(army.getArmy(fast.id).hp, 4);
});

test('army movement consumes average speed as cells per tick', () => {
  const { army } = createScenario();
  const created = army.createArmy('快速军团', { x: 0, y: 0 }).army;
  army.addUnit(created.id, 'archers', 1);
  assert.equal(army.issueMoveOrder(created.id, 2, 0).ok, true);
  eventBus.emit('tick', {});
  assert.deepEqual([army.getArmy(created.id).gridX, army.getArmy(created.id).gridY], [2, 0]);
});

test('activated ruin travel teleports a land army beside the destination stele', () => {
  const { army } = createScenario();
  const created = army.createArmy('遗迹旅团', { x: 0, y: 0 }).army;
  army.addUnit(created.id, 'spears', 1);
  army.issueMoveOrder(created.id, 2, 0);
  const result = army.teleportArmyNear(created.id, 2, 2);
  assert.equal(result.ok, true);
  assert.equal(Math.max(Math.abs(result.gridX - 2), Math.abs(result.gridY - 2)), 1);
  assert.deepEqual(army.getArmy(created.id).movePath, []);
});

test('army creation and simultaneous movement never stack two armies on one tile', () => {
  const { army } = createScenario();
  const first = army.createArmy('first', { x: 0, y: 0 }).army;
  const second = army.createArmy('second', { x: 0, y: 0 }).army;
  assert.notDeepEqual([first.gridX, first.gridY], [second.gridX, second.gridY]);
  army.addUnit(first.id, 'spears', 1);
  army.addUnit(second.id, 'spears', 1);
  army.issueMoveOrder(first.id, 1, 1);
  army.issueMoveOrder(second.id, 1, 1);
  army._advanceMovement();
  const positions = army.getArmies().map(item => `${item.gridX},${item.gridY}`);
  assert.equal(new Set(positions).size, positions.length);
});

test('a recruited military hero becomes a real army unit and supplies the army icon', () => {
  const { army } = createScenario();
  const created = army.createArmy('英雄军团').army;
  army.addUnit(created.id, 'spears', 2);
  assert.equal(army.assignHero(created.id, 'confucius').reason, 'hero_not_military');
  assert.equal(army.assignHero(created.id, 'caesar').ok, true);
  const decorated = army.getArmy(created.id);
  assert.equal(decorated.heroId, 'caesar');
  assert.equal(decorated.heroIcon, 'caesar-icon.png');
  assert.deepEqual(
    { attack: decorated.attack, maxHp: decorated.maxHp, hp: decorated.hp, attackRange: decorated.attackRange, speed: decorated.speed },
    { attack: 8, maxHp: 22, hp: 22, attackRange: 1, speed: 1.67 }
  );
});

test('heroes cannot be assigned, removed, or switched while either army has missing hp or cp', () => {
  const damagedScenario = createScenario();
  const damaged = damagedScenario.army.createArmy('damaged').army;
  damagedScenario.army.addUnit(damaged.id, 'spears', 1);
  damagedScenario.army.applyDamage(damaged.id, 1);
  assert.match(damagedScenario.army.assignHero(damaged.id, 'caesar').reason, /生命值未满/);

  const cpScenario = createScenario();
  const led = cpScenario.army.createArmy('led').army;
  const target = cpScenario.army.createArmy('target').army;
  cpScenario.army.addUnit(led.id, 'spears', 1);
  cpScenario.army.addUnit(target.id, 'spears', 1);
  assert.equal(cpScenario.army.assignHero(led.id, 'caesar').ok, true);
  cpScenario.army.consumeAttackCp(led.id);
  assert.equal(cpScenario.army.unassignHero(led.id), false);
  assert.match(cpScenario.army.assignHero(target.id, 'caesar').reason, /无法切换部队/);
});

test('formal army state and reserve pool survive save restore', () => {
  const { army } = createScenario();
  const created = army.createArmy('远征军').army;
  army.addUnit(created.id, 'archers', 1);
  army.setFormation(created.id, 'shield_wall');
  army._armies.find(item => item.id === created.id).heroSkillCooldown = 7;
  const saved = army.getState();

  const restoredScenario = createScenario();
  restoredScenario.army.restoreState(saved);
  assert.equal(restoredScenario.army.getArmies()[0].name, '远征军');
  assert.deepEqual(restoredScenario.army.getArmies()[0].unitIds, ['archers']);
  assert.equal(restoredScenario.army.getArmies()[0].formationId, 'shield_wall');
  assert.equal(restoredScenario.army.getArmies()[0].heroSkillCooldown, 7);
  assert.equal(restoredScenario.army.getAvailableUnits().archers, 1);
});

test('land armies path across land one cell per tick and cannot enter water directly', () => {
  const { army } = createScenario();
  const created = army.createArmy('机动军团', { x: 0, y: 0 }).army;
  army.addUnit(created.id, 'spears', 1);
  assert.equal(army.issueMoveOrder(created.id, 2, 0).ok, true);
  eventBus.emit('tick', {});
  assert.deepEqual([army.getArmy(created.id).gridX, army.getArmy(created.id).gridY], [1, 0]);
  eventBus.emit('tick', {});
  assert.deepEqual([army.getArmy(created.id).gridX, army.getArmy(created.id).gridY], [2, 0]);
  assert.equal(army.issueMoveOrder(created.id, 3, 0).reason, 'incompatible_terrain');
});

test('land armies can use a passable bridge as their movement destination', () => {
  const { army } = createScenario();
  configRegistry._configs.buildings.push({ id: 'classical_bridge', footprint: { width: 1, height: 1 }, passable: true });
  army._building.buildings.push({ buildingId: 'classical_bridge', status: 'active', gridX: 3, gridY: 2 });
  const created = army.createArmy('bridge_test', { x: 2, y: 2 }).army;
  army.addUnit(created.id, 'spears', 1);
  const result = army.issueMoveOrder(created.id, 3, 2);
  assert.equal(result.ok, true);
  assert.deepEqual(result.path, [{ x: 3, y: 2 }]);
});

test('harbors let land armies embark, cross connected water and disembark on adjacent land', () => {
  const { army } = createScenario();
  const created = army.createArmy('渡海军团', { x: 2, y: 1 }).army;
  army.addUnit(created.id, 'spears', 2);
  assert.equal(army.embarkArmy(created.id).ok, true);
  assert.equal(army.issueMoveOrder(created.id, 4, 1).ok, true);
  eventBus.emit('tick', {});
  eventBus.emit('tick', {});
  assert.deepEqual([army.getArmy(created.id).gridX, army.getArmy(created.id).gridY], [4, 1]);
  assert.equal(army.disembarkArmy(created.id, 2, 1).reason, 'landing_not_adjacent');
  assert.equal(army.issueMoveOrder(created.id, 3, 1).ok, true);
  eventBus.emit('tick', {});
  assert.equal(army.disembarkArmy(created.id, 2, 1).ok, true);
  assert.equal(army.getArmy(created.id).embarked, false);
});

test('fortifications accept nearby garrisons and provide a defensive multiplier', () => {
  const { army } = createScenario();
  const created = army.createArmy('守备军团', { x: 2, y: 2 }).army;
  army.addUnit(created.id, 'archers', 1);
  assert.equal(army.garrisonArmy(created.id, 1).ok, true);
  assert.equal(army.getArmy(created.id).garrisonBuildingIndex, 1);
  assert.equal(army.getArmyDefenseMultiplier(created.id), 1.35);
  assert.equal(army.ungarrisonArmy(created.id).ok, true);
  assert.equal(army.getArmy(created.id).garrisonBuildingIndex, null);
});
