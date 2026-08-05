import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { classifyArmyInteractionTarget } from '../../src/domain/ArmyInteractionTarget.js';
import { RuinSystem } from '../../src/systems/RuinSystem.js';
import { TechSystem } from '../../src/systems/TechSystem.js';
import { CultureSystem } from '../../src/systems/CultureSystem.js';

function createMap() {
  const gridWidth = 120, gridHeight = 100;
  return {
    gridWidth, gridHeight,
    grid: Array.from({ length: gridHeight }, () => Array(gridWidth).fill('G')),
    spawnManifest: { playerSpawn: { gridX: 60, gridY: 50 }, cityStates: [], wildSites: [] },
    initialBuildings: []
  };
}

test('fifteen spaced ruins scale level and guard count with spawn distance', () => {
  eventBus.clear();
  configRegistry._configs = { map: createMap() };
  const ruins = new RuinSystem();
  ruins.initNew({ seed: 20260805 });
  const all = ruins.getRuins();
  assert.equal(all.length, 15);
  const rowBands = [0, 0, 0];
  for (const ruin of all) rowBands[Math.min(2, Math.floor(ruin.gridY / (100 / 3)))] += 1;
  assert.deepEqual(rowBands, [5, 5, 5]);
  assert.ok(all.every(ruin => ruin.guards.length === ruin.level && ruin.guards.length <= 5));
  for (let i = 0; i < all.length; i += 1) for (let j = i + 1; j < all.length; j += 1) {
    assert.ok(Math.hypot(all[i].gridX - all[j].gridX, all[i].gridY - all[j].gridY) >= 10);
  }
  const ordered = [...all].sort((a, b) => Math.hypot(a.gridX - 60, a.gridY - 50) - Math.hypot(b.gridX - 60, b.gridY - 50));
  for (let index = 1; index < ordered.length; index += 1) assert.ok(ordered[index].level >= ordered[index - 1].level);
  const highest = all.reduce((best, ruin) => ruin.level > best.level ? ruin : best);
  const lowest = all.reduce((best, ruin) => ruin.level < best.level ? ruin : best);
  assert.ok(highest.guards[0].maxHp > lowest.guards[0].maxHp);
  assert.ok(highest.guards[0].attack > lowest.guards[0].attack);
});

test('a fixed level-one ruin is placed west across the river from the player', () => {
  eventBus.clear();
  const map = createMap();
  for (let y = 0; y < map.gridHeight; y += 1) map.grid[y][52] = 'S';
  configRegistry._configs = { map };
  const ruins = new RuinSystem();
  ruins.initNew({ seed: 88 });
  const fixed = ruins.getRuins().find(ruin => ruin.fixedWestRiver);
  assert.ok(fixed);
  assert.equal(fixed.level, 1);
  assert.ok(fixed.gridX < 52 && fixed.gridX < map.spawnManifest.playerSpawn.gridX);
  assert.equal(fixed.guards.length, 1);
});

test('all guards must fall and an adjacent army must activate the stele', () => {
  eventBus.clear();
  configRegistry._configs = { map: createMap() };
  const army = { id: 'army_1', gridX: 0, gridY: 0, attack: 9999, attackRange: 1, speed: 5 };
  const armies = {
    getArmy: id => id === army.id ? army : null,
    consumeAttackCp: () => ({ ok: true }),
    applyDamage: () => ({ ok: true, destroyed: false }),
    healArmyAfterBattle: () => ({ healed: 0 })
  };
  const ruins = new RuinSystem();
  ruins.setSystems({ army: armies });
  ruins.initNew({ seed: 7 });
  const ruin = ruins.ruins[0];
  army.gridX = ruin.gridX - 1; army.gridY = ruin.gridY;
  assert.equal(ruins.activateStele(ruin.id, army.id).reason, 'ruin_guards_remaining');
  for (const guard of ruin.guards) guard.hp = 0;
  army.gridX = ruin.gridX - 3;
  assert.equal(ruins.activateStele(ruin.id, army.id).reason, 'stele_too_far');
  army.gridX = ruin.gridX - 1;
  assert.equal(ruins.activateStele(ruin.id, army.id).ok, true);
  assert.equal(ruins.getScienceMultiplier(), 1.35);
  assert.equal(ruins.getCultureMultiplier(), 1.35);
  const restored = new RuinSystem();
  restored.restoreState(ruins.getState());
  assert.equal(restored.getActivatedCount(), 1);
});

test('an army beside one activated stele can teleport beside another', () => {
  eventBus.clear();
  configRegistry._configs = { map: createMap() };
  const army = { id: 'army_1', gridX: 0, gridY: 0, attack: 1, attackRange: 1, speed: 1 };
  const armySystem = {
    getArmy: id => id === army.id ? { ...army } : null,
    teleportArmyNear: (id, x, y) => { army.gridX = x + 1; army.gridY = y; return { ok: true, gridX: army.gridX, gridY: army.gridY }; }
  };
  const ruins = new RuinSystem();
  ruins.setSystems({ army: armySystem });
  ruins.initNew({ seed: 55 });
  const [source, target] = ruins.ruins;
  source.activated = true; target.activated = true;
  army.gridX = source.gridX - 1; army.gridY = source.gridY;
  const result = ruins.activateStele(target.id, army.id);
  assert.equal(result.teleported, true);
  assert.equal(result.sourceRuinId, source.id);
  assert.equal(result.targetRuinId, target.id);
  assert.deepEqual([army.gridX, army.gridY], [target.gridX + 1, target.gridY]);
});

test('ruin guards and steles are classified as distinct army interactions', () => {
  const guard = { id: 'guard', gridX: 5, gridY: 5, source: 'ruin_guard' };
  const ruin = { id: 'ruin', gridX: 6, gridY: 5 };
  assert.equal(classifyArmyInteractionTarget({ gridX: 5, gridY: 5, enemies: [guard], ruins: [ruin] }).source, 'ruin_guard');
  assert.equal(classifyArmyInteractionTarget({ gridX: 6, gridY: 5, enemies: [guard], ruins: [ruin] }).kind, 'ruin_stele');
});

test('activated steles multiply both technology and civic point income', () => {
  const building = { getWorkforceOutputs: () => ({ science: 2, civics: 2 }) };
  const era = { getBonuses: () => ({}) };
  const ruinBonus = { getScienceMultiplier: () => 2.4, getCultureMultiplier: () => 2.4 };
  const tech = new TechSystem();
  tech.setBuildingSystem(building); tech.setEraSystem(era); tech.setRuinSystem(ruinBonus);
  const culture = new CultureSystem();
  culture.setBuildingSystem(building); culture.setEraSystem(era); culture.setRuinSystem(ruinBonus);
  assert.equal(tech.getPointIncomeBreakdown().total, (0.2 + 2) * 2.4);
  assert.equal(culture.getPointIncomeBreakdown().total, (0.2 + 2) * 2.4);
});

test('research buildings are capped and all normal tree nodes use the scarce-cost balance', async () => {
  const content = JSON.parse(await readFile(new URL('../../config/historical_content.json', import.meta.url), 'utf8'));
  const expected = { academy: 2, library: 2, monument: 2, civic_hall: 2, council_hall: 1 };
  for (const [id, limit] of Object.entries(expected)) assert.equal(content.buildings.find(building => building.id === id)?.maxCount, limit);
  assert.ok([...content.techs, ...content.civics].every(node => node.ruinEconomyBalanced === true && node.pointCost >= 21));
});
