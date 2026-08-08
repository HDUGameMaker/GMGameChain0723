import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { BuildingSystem } from '../../src/systems/BuildingSystem.js';
import { EnemyExpansionSystem } from '../../src/systems/EnemyExpansionSystem.js';
import { InvasionSystem } from '../../src/systems/InvasionSystem.js';
import { getTickInterval } from '../../src/utils/gameTime.js';
import { getDevelopmentSummary } from '../../src/domain/DevelopmentSummary.js';
import { calculateCombatStrength } from '../../src/domain/CombatStrength.js';

const baseBuildings = [
  { id: 'hq', name: '大本营', maxHp: 1000, isHeadquarters: true, footprint: { width: 2, height: 2 }, uniqueFunction: { buildingHpMul: 1.2 } },
  { id: 'repair_fort', name: '维修要塞', maxHp: 500, footprint: { width: 1, height: 1 }, uniqueFunction: { buildingHpMul: 1.05, repairNearbyBuildingsPerTick: 20, repairRadius: 3 } },
  { id: 'workshop', name: '工坊', maxHp: 300, footprint: { width: 1, height: 1 }, uniqueFunction: {} }
];

test('buildings have scaled hp, take damage, receive nearby repairs and headquarters loss ends the game', () => {
  eventBus.clear();
  configRegistry._configs = { buildings: baseBuildings, historicalContent: { eras: [] } };
  const buildings = new BuildingSystem();
  buildings.buildings = [
    { instanceId: 'hq-1', buildingId: 'hq', gridX: 1, gridY: 1, status: 'active', hpDamage: 0 },
    { instanceId: 'fort-1', buildingId: 'repair_fort', gridX: 3, gridY: 1, status: 'active', hpDamage: 0 },
    { instanceId: 'shop-1', buildingId: 'workshop', gridX: 4, gridY: 1, status: 'active', hpDamage: 0 }
  ];
  assert.equal(buildings.getBuildingHpMultiplier(), 1.26);
  assert.equal(buildings.getBuildingMaxHp(2), 378);
  assert.equal(buildings.damageBuilding(2, 100).hp, 278);
  buildings._repairNearbyBuildings();
  assert.equal(buildings.getBuildingHp(2), 298);
  const gameOvers = [];
  eventBus.on('gameOver', payload => gameOvers.push(payload));
  assert.equal(buildings.damageBuilding(0, 99999).headquartersDestroyed, true);
  assert.equal(gameOvers.at(-1).reason, 'hqLost');
  eventBus.clear();
});

test('enemy attacks on buildings resolve directly and buildings never retaliate', () => {
  eventBus.clear();
  const enemyProfile = { id: 'raider', name: '遗迹袭击者', maxHp: 100, attack: 40, attackRange: 2, speed: 2, cp: 1, strategicOnly: true };
  configRegistry._configs = {
    global: { TICK_INTERVAL: 10 },
    buildings: baseBuildings,
    enemies: { enemies: [enemyProfile] },
    historicalContent: { eras: [], luxuries: [] },
    map: { gridWidth: 8, gridHeight: 8, grid: Array.from({ length: 8 }, () => Array(8).fill('G')) },
    enemyExpansion: {}
  };
  const buildings = new BuildingSystem();
  buildings.buildings = [{ instanceId: 'shop-1', buildingId: 'workshop', gridX: 2, gridY: 2, status: 'active', hpDamage: 0 }];
  const enemies = new EnemyExpansionSystem();
  enemies.setBuildingSystem(buildings);
  enemies.setArmySystem({ getArmies: () => [] });
  enemies.init();
  enemies.spawnCityStateRaid({ gridX: 4, gridY: 2, targetX: 2, targetY: 2, strength: 100, enemyId: 'raider' });
  // 8.8 起敌人袭击不再弹预览,由帧级 update 直接结算;建筑不还手(hp 只减不增)。
  const before = buildings.getBuildingHp(0);
  enemies.update(getTickInterval(), 1);
  assert.ok(buildings.getBuildingHp(0) < before, '敌人袭击直接扣减建筑血量');
  assert.equal(enemies.getAllCells().length, 1, '建筑不还手,袭击军仍存活');
  eventBus.clear();
});

test('ancient ruin waves warn one day early and scale to player armies from about twenty tiles east', () => {
  eventBus.clear();
  const grid = Array.from({ length: 12 }, () => Array(20).fill('G'));
  configRegistry._configs = { map: { gridWidth: 20, gridHeight: 12, grid }, enemies: { invasion: {} }, buildings: baseBuildings };
  const spawned = [];
  const invasion = new InvasionSystem();
  invasion.setArmySystem({
    getArmies: () => [
      { id: 'army-a', ownerId: 'player', unitIds: ['warrior'], gridX: 2, gridY: 5 },
      { id: 'army-b', ownerId: 'player', unitIds: ['warrior'], gridX: 3, gridY: 5 }
    ],
    getArmyStats: () => ({ hp: 100, maxHp: 100, attack: 20, speed: 2, attackRange: 1 }),
    getArmyCpMax: () => 1
  });
  invasion.setSystems({
    enemyExpansion: { spawnCityStateRaid: payload => { spawned.push(payload); return true; } },
    building: { buildings: [{ buildingId: 'hq', gridX: 2, gridY: 5 }] },
    era: { getCurrentEra: () => ({ id: 'classical', order: 1 }) },
    tech: { getEraProgress: () => 0.5 }, culture: { getEraProgress: () => 0.5 }
  });
  const warnings = [];
  eventBus.on('ancientRuinWaveWarning', data => warnings.push(data));
  invasion.initNew();
  invasion._onDayStart({ day: 6 });
  invasion._onDayStart({ day: 7 });
  assert.equal(warnings[0].arrivalDay, 7);
  assert.equal(spawned.length, 4);
  assert.ok(spawned.every(entry => entry.gridX >= 17 && entry.targetX === 2));
  assert.ok(spawned.every(entry => entry.strength <= 5000));
  assert.ok(spawned.every(entry => calculateCombatStrength(entry.combatStats) <= 5000));
  assert.ok(spawned.some(entry => entry.combatStats.attackRange === 3));
  assert.ok(spawned.some(entry => entry.combatStats.cp === 3));
  eventBus.clear();
});

test('building durability and ancient ruin profiles are fully configured and development details expose hp bonus', async () => {
  const [buildings, historical, enemies] = await Promise.all([
    readFile(new URL('../../config/buildings.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../../config/historical_content.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../../config/enemies.json', import.meta.url), 'utf8').then(JSON.parse)
  ]);
  assert.ok([...buildings, ...historical.buildings].every(building => building.maxHp > 0));
  for (const id of ['ancient_ruin_berserker', 'ancient_ruin_archer', 'ancient_ruin_overseer']) {
    assert.ok(enemies.enemies.some(enemy => enemy.id === id));
  }
  const summary = getDevelopmentSummary({ building: { getBuildingHpMultiplier: () => 1.4 } });
  assert.equal(summary.multipliers.find(item => item.id === 'building_hp').value, 1.4);
});
