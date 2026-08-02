import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolvePhasedArmyBattle } from '../../src/systems/CombatResolver.js';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { ArmySystem } from '../../src/systems/ArmySystem.js';

const tactics = JSON.parse(readFileSync(new URL('../../config/military-tactics.json', import.meta.url), 'utf8'));
const units = [
  { id: 'spear', name: '长矛兵', combatPower: 10, commandPoints: 2, branch: 'anti_cavalry', lane: 'front', domain: 'land', roleTags: ['spear'], strongAgainst: ['cavalry'], weakAgainst: ['ranged'] },
  { id: 'archer', name: '弓箭手', combatPower: 12, commandPoints: 2, branch: 'ranged', lane: 'rear', domain: 'land', roleTags: ['ranged'], strongAgainst: ['infantry'], weakAgainst: ['cavalry'] },
  { id: 'cavalry', name: '骑兵', combatPower: 16, commandPoints: 3, branch: 'cavalry', lane: 'flank', domain: 'land', roleTags: ['cavalry'], strongAgainst: ['ranged'], weakAgainst: ['spear'] },
  { id: 'catapult', name: '投石车', combatPower: 20, commandPoints: 4, branch: 'siege', lane: 'siege', domain: 'land', roleTags: ['siege'], strongAgainst: ['building'], weakAgainst: ['cavalry'] }
];

test('all civilizations share a fixed historical catalog of at least eight tactics', () => {
  assert.ok(tactics.tactics.length >= 8);
  assert.equal(new Set(tactics.tactics.map(tactic => tactic.id)).size, tactics.tactics.length);
  assert.ok(tactics.tactics.every(tactic => tactic.description && tactic.phaseModifiers));
  assert.equal(JSON.stringify(tactics).match(/法术|魔法|spell|magic/gi), null);
});

test('battle resolution exposes reconnaissance, ranged, charge, melee, siege and pursuit phases', () => {
  const result = resolvePhasedArmyBattle(
    { unitIds: ['spear', 'archer', 'cavalry', 'catapult'], morale: 90, supply: 1, tacticId: 'steady_advance' },
    { unitIds: ['spear', 'spear', 'archer'], morale: 85, supply: 0.9, tacticId: 'shield_discipline' },
    units,
    tactics.tactics
  );
  assert.deepEqual(result.phases.map(phase => phase.id), ['reconnaissance', 'ranged', 'charge', 'melee', 'siege', 'pursuit']);
  assert.ok(result.attackerScore > 0);
  assert.ok(result.defenderScore > 0);
  assert.ok(['attacker', 'defender', 'draw'].includes(result.winner));
  assert.ok(result.casualties.attacker >= 0);
  assert.ok(result.casualties.defender >= 0);
});

test('army tactic selection changes its strongest phase without changing unit roster', () => {
  const roster = { unitIds: ['archer', 'archer', 'spear'], morale: 100, supply: 1 };
  const defender = { unitIds: ['spear', 'spear', 'spear'], morale: 100, supply: 1 };
  const steady = resolvePhasedArmyBattle({ ...roster, tacticId: 'steady_advance' }, defender, units, tactics.tactics);
  const volley = resolvePhasedArmyBattle({ ...roster, tacticId: 'focused_volley' }, defender, units, tactics.tactics);
  const steadyRanged = steady.phases.find(phase => phase.id === 'ranged').attackerPower;
  const volleyRanged = volley.phases.find(phase => phase.id === 'ranged').attackerPower;
  assert.ok(volleyRanged > steadyRanged);
});

test('resolved army engagements apply casualties, morale and supply to persistent armies', () => {
  eventBus.clear();
  configRegistry._configs = {
    enemies: { units, formations: [] },
    militaryTactics: tactics,
    buildings: [],
    map: { gridWidth: 3, gridHeight: 3, grid: Array.from({ length: 3 }, () => Array(3).fill('G')) }
  };
  const army = new ArmySystem();
  army.setSystems({ building: { buildings: [] } });
  army.initNew();
  army.setAvailableUnits({ spear: 8, archer: 4, cavalry: 2, catapult: 1 });
  const attacker = army.createArmy('甲军').army;
  const defender = army.createArmy('乙军').army;
  army.addUnit(attacker.id, 'archer', 3);
  army.addUnit(attacker.id, 'cavalry', 1);
  army.addUnit(defender.id, 'spear', 4);
  army.setTactic(attacker.id, 'focused_volley');
  army.setTactic(defender.id, 'shield_discipline');
  const beforeTotal = army.getArmy(attacker.id).unitIds.length + army.getArmy(defender.id).unitIds.length;
  const result = army.resolveEngagement(attacker.id, defender.id);
  const afterTotal = army.getArmy(attacker.id).unitIds.length + army.getArmy(defender.id).unitIds.length;
  assert.equal(result.ok, true);
  assert.ok(afterTotal < beforeTotal);
  assert.ok(army.getArmy(attacker.id).supply < 1);
  assert.ok(army.getArmy(defender.id).morale < 100);
});
