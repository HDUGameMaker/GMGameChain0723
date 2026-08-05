import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { BuildingSystem } from '../../src/systems/BuildingSystem.js';
import { estimateLateGameWoodBalance, getProcessingWorkerTicksPerMaterial, getRawMaterialEquivalent } from '../../src/domain/EraMaterialBalance.js';

const root = resolve(import.meta.dirname, '../..');
const resources = JSON.parse(readFileSync(resolve(root, 'config/resources.json'), 'utf8'));
const historical = JSON.parse(readFileSync(resolve(root, 'config/historical_content.json'), 'utf8'));
const enemies = JSON.parse(readFileSync(resolve(root, 'config/enemies.json'), 'utf8'));
const eaIntegration = JSON.parse(readFileSync(resolve(root, 'config/ea_integration.json'), 'utf8'));
const tierIds = {
  primitive: ['wood', 'stone'], classical: ['composite_plank', 'goldstone'],
  medieval: ['hardwood_beam', 'reinforced_stone'], exploration: ['ship_timber', 'dressed_marble'],
  modern: ['carbon_composite', 'advanced_alloy']
};

test('every post-primitive era exposes exactly two progressively unlocked materials', () => {
  for (const [eraId, ids] of Object.entries(tierIds).slice(1)) {
    const configured = resources.filter(resource => resource.unlockEraId === eraId);
    assert.deepEqual(configured.map(resource => resource.id), ids);
    assert.ok(configured.every(resource => resource.processed && resource.showInHUD && resource.initial === 0));
    assert.ok(configured.every(resource => existsSync(resolve(root, resource.icon))), eraId);
    assert.equal(new Set(configured.map(resource => resource.icon)).size, 2, eraId);
  }
});

test('unit training costs use the material tier matching the unit era', () => {
  for (const [eraId, ids] of Object.entries(tierIds)) {
    for (const unit of historical.units.filter(entry => entry.eraId === eraId)) {
      const materialIds = (unit.cost || []).filter(cost => ids.includes(cost.resourceId)).map(cost => cost.resourceId);
      assert.ok(materialIds.length > 0, unit.id);
      if (eraId !== 'primitive') {
        assert.ok(!(unit.cost || []).some(cost => cost.resourceId === 'wood' || cost.resourceId === 'stone'), unit.id);
      }
    }
  }
});

test('most unit unlocks consume both materials from their own era', () => {
  const units = [...historical.units, ...(enemies.units || []), ...(eaIntegration.units || [])];
  const candidates = units.filter(unit => tierIds[unit.eraId] && unit.unlocked !== true);
  let configured = 0;
  for (const unit of candidates) {
    const ids = tierIds[unit.eraId];
    const unlockIds = new Set((unit.unlockCost || []).map(cost => cost.resourceId));
    if (ids.every(id => unlockIds.has(id))) configured += 1;
  }
  assert.ok(configured / candidates.length >= 0.9, `${configured}/${candidates.length} unit unlocks use era materials`);
});

test('every post-primitive era has two processors consuming the previous material tier', () => {
  const eras = Object.keys(tierIds);
  for (let index = 1; index < eras.length; index += 1) {
    const eraId = eras[index];
    const previousIds = new Set(tierIds[eras[index - 1]]);
    const processors = historical.buildings.filter(building => building.eraId === eraId && building.eraMaterialProcessor);
    assert.equal(processors.length, 2, eraId);
    assert.ok(processors.every(building => building.category === 'basic_industry'));
    assert.deepEqual(processors.map(building => building.production.output[0].resourceId), tierIds[eraId]);
    const expectedInput = [4, 3, 4, 3][index - 1];
    assert.ok(processors.every(building => building.production.input.some(input => previousIds.has(input.resourceId) && input.amount === expectedInput)));
    assert.ok(processors.every(building => building.production.output[0].amount === 2));
    assert.ok(processors.every(building => building.maxCount === 6 && building.ignoreProductionMultipliers === true));
  }
  const goldstone = historical.buildings.find(building => building.id === 'classical_stone_processor');
  assert.ok(goldstone.production.input.some(input => input.resourceId === 'gold'));
});

test('late-game wood chain stays processing-limited without becoming prohibitively scarce', () => {
  assert.equal(getRawMaterialEquivalent(), 9);
  assert.equal(getProcessingWorkerTicksPerMaterial(), 5);
  const estimate = estimateLateGameWoodBalance();
  assert.ok(estimate.rawWoodPerTick > 2600 && estimate.rawWoodPerTick < 2800);
  assert.equal(estimate.processingLimitedModernPerTick, 48);
  assert.equal(estimate.modernMaterialPerTick, 14);
  assert.ok(estimate.daysForModernDemand > 18 && estimate.daysForModernDemand < 19);
});

test('raw material research bonuses are increased and weak civilization buildings cover every era', () => {
  assert.equal(historical.techs.find(node => node.id === 'tech_primitive_1').effects.resourceProductionMul.stone, 1.8);
  assert.equal(historical.techs.find(node => node.id === 'tech_primitive_3').effects.resourceProductionMul.wood, 1.8);
  assert.ok(historical.techs.every(node => node.effects.productionMul >= 1.015));
  assert.ok(historical.civics.find(node => node.id === 'civic_modern_5').effects.productionMul >= 1.45);
  for (const eraId of Object.keys(tierIds)) {
    assert.ok(historical.buildings.some(building => building.eraId === eraId
      && building.uniqueFunction?.resourceProductionMul?.wood === 1.12
      && building.uniqueFunction?.resourceProductionMul?.stone === 1.12), eraId);
  }
});

test('civilization building raw-material bonuses affect actual production multipliers', () => {
  const previous = configRegistry._configs;
  configRegistry._configs = {
    buildings: [{ id: 'weak_civ_building', uniqueFunction: { resourceProductionMul: { wood: 1.12, stone: 1.12 } } }],
    historicalContent: { eras: [], civilizations: [], buildings: [], techs: [], civics: [], units: [], heroes: [], strategies: [] },
    global: {}
  };
  try {
    const system = new BuildingSystem();
    system.buildings = [{ buildingId: 'weak_civ_building', status: 'active' }];
    assert.ok(Math.abs(system.getProductionMultiplier('wood') - 1.12) < 1e-10);
    assert.ok(Math.abs(system.getProductionMultiplier('stone') - 1.12) < 1e-10);
  } finally {
    configRegistry._configs = previous;
  }
});

test('era buildings, technologies and civics consume their matching material tier', () => {
  for (const [eraId, ids] of Object.entries(tierIds)) {
    for (const collection of [historical.techs, historical.civics]) {
      for (const node of collection.filter(entry => entry.eraId === eraId)) {
        assert.deepEqual(node.cost.slice(0, 2).map(cost => cost.resourceId), ids, node.id);
      }
    }
    if (eraId === 'primitive') continue;
    for (const building of historical.buildings.filter(entry => entry.eraId === eraId && !entry.eraMaterialProcessor)) {
      const materialCosts = (building.buildCost || []).filter(cost => ids.includes(cost.resourceId));
      assert.ok(materialCosts.length > 0, building.id);
      assert.ok(!(building.buildCost || []).some(cost => cost.resourceId === 'wood' || cost.resourceId === 'stone'), building.id);
    }
  }
});
