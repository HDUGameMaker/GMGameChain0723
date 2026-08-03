import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as resolver from '../../src/systems/CombatResolver.js';
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

const attacker = { id: 'army_a', name: '甲军', unitIds: ['spear', 'archer', 'cavalry'], morale: 90, supply: 1, tacticId: 'focused_volley', heroId: 'hero_a', revision: 4 };
const defender = { id: 'army_d', name: '乙军', unitIds: ['spear', 'spear', 'archer'], morale: 80, supply: 0.8, tacticId: 'shield_discipline', revision: 7 };

test('all civilizations share a fixed historical catalog of at least eight tactics', () => {
  assert.ok(tactics.tactics.length >= 8);
  assert.equal(new Set(tactics.tactics.map(tactic => tactic.id)).size, tactics.tactics.length);
  assert.ok(tactics.tactics.every(tactic => tactic.description && tactic.phaseModifiers));
  assert.equal(JSON.stringify(tactics).match(/法术|魔法|spell|magic/gi), null);
});

test('strategic battle preview is side-effect free and reports only decisive modifiers', () => {
  assert.equal(typeof resolver.previewStrategicBattle, 'function');
  const left = structuredClone(attacker);
  const right = structuredClone(defender);
  const preview = resolver.previewStrategicBattle(left, right, units, tactics.tactics, {
    terrain: 'F',
    attackerHeroMultiplier: 1.15,
    defenderDefenseMultiplier: 1.25
  });

  assert.deepEqual(left, attacker);
  assert.deepEqual(right, defender);
  assert.ok(preview.attackerPower > 0 && preview.defenderPower > 0);
  assert.ok(['attacker_advantage', 'defender_advantage', 'even'].includes(preview.outlook));
  assert.equal('phases' in preview, false);
  assert.deepEqual(Object.keys(preview.casualtyRanges), ['attacker', 'defender']);
  assert.ok(preview.modifiers.some(item => item.id === 'hero'));
  assert.ok(preview.modifiers.some(item => item.id === 'terrain'));
  assert.ok(preview.modifiers.some(item => item.id === 'fortification'));
});

test('one-pass resolution is deterministic for a stable campaign seed and battle id', () => {
  assert.equal(typeof resolver.resolveStrategicBattle, 'function');
  const context = { campaignSeed: 'campaign-42', battleId: 'battle_9', terrain: 'G' };
  const first = resolver.resolveStrategicBattle(attacker, defender, units, tactics.tactics, context);
  const replay = resolver.resolveStrategicBattle(attacker, defender, units, tactics.tactics, context);

  assert.deepEqual(first, replay);
  assert.equal('phases' in first, false);
  assert.ok(['attacker', 'defender', 'draw'].includes(first.winner));
  assert.ok(first.casualties.attacker >= 0 && first.casualties.attacker <= attacker.unitIds.length);
  assert.ok(first.casualties.defender >= 0 && first.casualties.defender <= defender.unitIds.length);
  assert.match(first.report.decisiveReason, /克制|英雄|战术|地形|工事|士气|补给|战力/);
});

test('army battle preview becomes stale after composition changes and a battle commits only once', () => {
  eventBus.clear();
  configRegistry._configs = {
    enemies: { units, formations: [] },
    militaryTactics: tactics,
    buildings: [],
    map: { gridWidth: 3, gridHeight: 3, grid: Array.from({ length: 3 }, () => 'GGG') }
  };
  const system = new ArmySystem();
  assert.equal(typeof system.previewEngagement, 'function');
  assert.equal(typeof system.commitEngagement, 'function');
  system.setSystems({ building: { buildings: [] } });
  system.initNew();
  system.setAvailableUnits({ spear: 9, archer: 4, cavalry: 2 });
  const first = system.createArmy('甲军').army;
  const second = system.createArmy('乙军').army;
  system.addUnit(first.id, 'archer', 2);
  system.addUnit(second.id, 'spear', 3);

  const stale = system.previewEngagement(first.id, second.id, { campaignSeed: 'campaign-42' });
  system.addUnit(first.id, 'cavalry', 1);
  assert.deepEqual(system.commitEngagement(stale), { ok: false, reason: 'stale_army_revision' });

  const prepared = system.previewEngagement(first.id, second.id, { campaignSeed: 'campaign-42' });
  const committed = system.commitEngagement(prepared);
  assert.equal(committed.ok, true);
  assert.equal('phases' in committed, false);
  assert.deepEqual(system.commitEngagement(prepared), { ok: false, reason: 'battle_already_resolved' });
  assert.equal(system.getBattleHistory().length, 1);
});
