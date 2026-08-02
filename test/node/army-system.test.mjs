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
        { id: 'spears', name: '长矛兵', commandPoints: 2, combatPower: 10, domain: 'land', branch: 'anti_cavalry' },
        { id: 'archers', name: '弓箭手', commandPoints: 3, combatPower: 12, domain: 'land', branch: 'ranged' },
        { id: 'galley', name: '桨帆战船', commandPoints: 5, combatPower: 20, domain: 'naval', branch: 'navy' }
      ],
      formations: [{ id: 'shield_wall', name: '盾墙', requiredUnits: [], combatPowerBonus: 5, unlocked: true }]
    },
    buildings: [
      { id: 'war_academy', uniqueFunction: { armyCapacityBonus: 1, commandPointsBonus: 5 } },
      { id: 'castle', uniqueFunction: { armyCapacityBonus: 1 } }
    ]
  };
  const building = {
    buildings: [{ buildingId: 'war_academy', status: 'active' }]
  };
  const recruited = [
    { id: 'caesar', heroId: 'caesar', name: '恺撒', role: 'commander', status: 'active', bonuses: { commanderPowerMul: 1.2 } },
    { id: 'confucius', heroId: 'confucius', name: '孔子', role: 'scholar', status: 'active', bonuses: { scholarPowerMul: 1.2 } }
  ];
  const hero = {
    getRecruitedHeroes: () => recruited,
    assignHero: () => ({ ok: true })
  };
  const culture = { getCommandPointsBonus: () => 2 };
  const army = new ArmySystem();
  army.setSystems({ building, hero, culture });
  army.initNew();
  army.setAvailableUnits({ spears: 4, archers: 2, galley: 1 });
  return { army };
}

test('military command buildings increase the finite army and command-point caps', () => {
  const { army } = createScenario();
  assert.equal(army.getArmyCapacity(), 3);
  assert.equal(army.getCommandPointLimit(), 27);
  assert.equal(army.createArmy('第一军团').ok, true);
  assert.equal(army.createArmy('第二军团').ok, true);
  assert.equal(army.createArmy('第三军团').ok, true);
  assert.equal(army.createArmy('第四军团').reason, 'army_capacity_full');
});

test('army composition moves trained units out of reserves and respects command points', () => {
  const { army } = createScenario();
  const created = army.createArmy('北方军团').army;
  assert.equal(army.addUnit(created.id, 'spears', 3).ok, true);
  assert.equal(army.addUnit(created.id, 'archers', 2).ok, true);
  assert.equal(army.getArmy(created.id).usedCommandPoints, 12);
  assert.equal(army.getAvailableUnits().spears, 1);
  assert.equal(army.removeUnit(created.id, 'spears', 1).ok, true);
  assert.equal(army.getAvailableUnits().spears, 2);
});

test('only recruited military commanders can lead an army and affect its power', () => {
  const { army } = createScenario();
  const created = army.createArmy('英雄军团').army;
  army.addUnit(created.id, 'spears', 2);
  assert.equal(army.assignHero(created.id, 'confucius').reason, 'hero_not_military');
  assert.equal(army.assignHero(created.id, 'caesar').ok, true);
  assert.equal(army.getArmy(created.id).heroId, 'caesar');
  assert.equal(army.getArmyPower(created.id), 24);
});

test('formal army state and reserve pool survive save restore', () => {
  const { army } = createScenario();
  const created = army.createArmy('远征军').army;
  army.addUnit(created.id, 'archers', 1);
  army.setFormation(created.id, 'shield_wall');
  const saved = army.getState();

  const restoredScenario = createScenario();
  restoredScenario.army.restoreState(saved);
  assert.equal(restoredScenario.army.getArmies()[0].name, '远征军');
  assert.deepEqual(restoredScenario.army.getArmies()[0].unitIds, ['archers']);
  assert.equal(restoredScenario.army.getArmies()[0].formationId, 'shield_wall');
  assert.equal(restoredScenario.army.getAvailableUnits().archers, 1);
});
