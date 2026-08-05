import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { store } from '../../src/core/Store.js';
import { LuxurySystem } from '../../src/systems/LuxurySystem.js';
import { ArmySystem } from '../../src/systems/ArmySystem.js';

const root = resolve(import.meta.dirname, '../..');
const historicalContent = JSON.parse(readFileSync(resolve(root, 'config/historical_content.json'), 'utf8'));

function giftSetup() {
  configRegistry._configs = { historicalContent, buildings: historicalContent.buildings };
  store.setState({ timeDay: 4 });
  const hero = {
    value: 0,
    getRecruitedHeroes: () => [{ id: 'hero_a', heroId: 'hero_a' }],
    adjustAffinity(id, amount) { this.value += amount; return { ok: true }; }
  };
  const luxury = new LuxurySystem();
  luxury.setSystems({ hero });
  luxury.initNew();
  return { luxury, hero };
}

test('only duplicate luxuries can be gifted once per day for fifty affinity', () => {
  const { luxury, hero } = giftSetup();
  luxury.addLuxury('jade', 1);
  assert.equal(luxury.canGiftToHero('jade', 'hero_a').ok, false);
  luxury.addLuxury('jade', 1);
  assert.equal(luxury.giftToHero('jade', 'hero_a').ok, true);
  assert.equal(hero.value, 50);
  assert.equal(luxury.getInventory().jade, 1);
  luxury.addLuxury('tea', 2);
  assert.equal(luxury.giftToHero('tea', 'hero_a').ok, false);
  store.setState({ timeDay: 5 });
  assert.equal(luxury.giftToHero('tea', 'hero_a').ok, true);
  assert.equal(hero.value, 100);
  assert.equal(luxury.tradeWithOutpost('tea', 'outpost').ok, false);
});

test('luxury effects are unique per type and use only translated active effect keys', () => {
  const { luxury } = giftSetup();
  luxury.addLuxury('tea', 5);
  assert.equal(luxury.getBonuses().sciencePointMul, 1.08);
  const allowed = new Set(['goldProductionMul', 'civicPointMul', 'sciencePointMul', 'foodConsumeMul', 'satisfactionBonus', 'growthMul', 'housingCapacityMul', 'woodProductionMul', 'stoneProductionMul', 'foodProductionMul', 'buildCostMul', 'armyHpMul', 'armyAttackMul', 'armySpeedMul']);
  for (const item of historicalContent.luxuries) {
    assert.equal(item.stackable, false);
    assert.equal(item.giftable, true);
    assert.ok(Object.keys(item.effects).every(key => allowed.has(key)), item.id);
  }
  const signatures = new Set(historicalContent.luxuries.map(item => JSON.stringify(item.effects)));
  assert.ok(signatures.size >= 18, `only ${signatures.size} distinct luxury effects`);
});

test('classical bridge uses era materials and makes its water tile passable to land armies', () => {
  const bridge = historicalContent.buildings.find(building => building.id === 'classical_bridge');
  assert.equal(bridge.eraId, 'classical');
  assert.deepEqual(bridge.buildCost.map(cost => cost.resourceId), ['composite_plank', 'goldstone']);
  assert.deepEqual(bridge.allowedGrounds, ['S', 'W']);
  const army = new ArmySystem();
  army.setSystems({ building: { buildings: [{ buildingId: bridge.id, gridX: 1, gridY: 0, status: 'active' }] } });
  configRegistry._configs.map = { gridWidth: 3, gridHeight: 1, grid: [['G', 'W', 'G']] };
  assert.equal(army.isLandPassableAt(1, 0), true);
  assert.equal(army.isTileOccupiedByBuilding(1, 0), false);
});
