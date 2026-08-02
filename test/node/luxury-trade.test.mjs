import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { LuxurySystem } from '../../src/systems/LuxurySystem.js';
import { DiplomacySystem } from '../../src/systems/DiplomacySystem.js';

const root = resolve(import.meta.dirname, '../..');
const load = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const historicalContent = load('config/historical_content.json');
const eaIntegration = load('config/ea_integration.json');

function setup() {
  configRegistry._configs = { historicalContent, eaIntegration };
  const wallet = { gold: 0 };
  const resource = { addClamped: (id, amount) => { wallet[id] = (wallet[id] || 0) + amount; return amount; } };
  const building = { buildings: [{ buildingId: 'market_square', status: 'active' }] };
  const diplomacy = new DiplomacySystem();
  diplomacy.initNew();
  const luxuries = new LuxurySystem();
  luxuries.setSystems({ resource, building, diplomacy });
  luxuries.initNew();
  return { luxuries, diplomacy, wallet };
}

test('first copy activates the luxury effect while duplicate copies are tradeable', () => {
  const { luxuries } = setup();
  assert.equal(luxuries.addLuxury('silk', 1), true);
  assert.equal(luxuries.getInventory().silk, 1);
  assert.equal(luxuries.getBonuses().diplomacyMul, 1.08);
  assert.equal(luxuries.canTrade('silk', 1).ok, false);
  luxuries.addLuxury('silk', 1);
  assert.equal(luxuries.canTrade('silk', 1).ok, true);
  assert.equal(luxuries.getBonuses().diplomacyMul, 1.08, 'duplicate does not stack first-copy effect');
});

test('market trade consumes only duplicate luxury, grants gold and improves outpost relation', () => {
  const { luxuries, diplomacy, wallet } = setup();
  diplomacy.discoverOutpost('forest_camp');
  const before = diplomacy.getOutpostState('forest_camp').relation;
  luxuries.addLuxury('jade', 2);
  const result = luxuries.tradeWithOutpost('jade', 'forest_camp', 1);
  assert.equal(result.ok, true);
  assert.equal(luxuries.getInventory().jade, 1);
  assert.ok(wallet.gold > 0);
  assert.ok(diplomacy.getOutpostState('forest_camp').relation > before);
});

test('luxury deposits, inventories and discoveries survive save restore', () => {
  const { luxuries } = setup();
  luxuries.discoverDeposit({ id: 'deposit-1', luxuryId: 'pearls', gridX: 20, gridY: 30 });
  luxuries.addLuxury('pearls', 3);
  const restored = setup().luxuries;
  restored.restoreState(luxuries.getState());
  assert.equal(restored.getInventory().pearls, 3);
  assert.equal(restored.getDiscoveredDeposits()[0].id, 'deposit-1');
  assert.equal(restored.addLuxury('unknown_luxury', 1), false);
});
