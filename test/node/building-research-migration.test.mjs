import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { migrateLegacyBuildingResearch } from '../../src/domain/BuildingResearchMigration.js';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { TechSystem } from '../../src/systems/TechSystem.js';
import { CultureSystem } from '../../src/systems/CultureSystem.js';

const root = resolve(import.meta.dirname, '../..');
const historicalContent = JSON.parse(readFileSync(resolve(root, 'config/historical_content.json'), 'utf8'));

test('legacy building research becomes normal tech and civic completion', () => {
  const migrated = migrateLegacyBuildingResearch({
    buildingTech: { unlockedNodes: ['bt_logging_t2', 'bt_farming_t2'] },
    tech: { researched: ['tech_primitive_1'] },
    culture: { researched: [] }
  });
  assert.ok(migrated.tech.researched.includes('tech_ancient_5'));
  assert.ok(migrated.culture.researched.includes('civic_ancient_4'));
  assert.deepEqual(migrated.buildingTech.unlockedNodes, ['bt_logging_t2', 'bt_farming_t2']);
});

test('all legacy building research nodes map to their exact normal research nodes', () => {
  const migrated = migrateLegacyBuildingResearch({
    buildingTech: {
      unlockedNodes: [
        'bt_logging', 'bt_mining', 'bt_farming', 'bt_minting',
        'bt_logging_t2', 'bt_mining_t2', 'bt_farming_t2', 'bt_minting_t2',
        'bt_industry', 'bt_efficiency', 'bt_terraforming'
      ]
    },
    tech: { researched: [] },
    culture: { researched: [] }
  });

  assert.deepEqual(migrated.tech.researched, [
    'tech_primitive_3', 'tech_primitive_1', 'tech_ancient_5',
    'tech_ancient_1', 'tech_early_modern_7', 'tech_exploration_8'
  ]);
  assert.deepEqual(migrated.culture.researched, [
    'civic_primitive_5', 'civic_primitive_6', 'civic_ancient_4',
    'civic_ancient_8', 'civic_early_modern_5'
  ]);
});

test('legacy migration is immutable and idempotent', () => {
  const original = {
    buildingTech: { unlockedNodes: ['bt_logging_t2', 'unknown_legacy_node'] },
    tech: { researched: ['tech_ancient_5'] },
    culture: { researched: ['civic_primitive_1'] }
  };
  const snapshot = structuredClone(original);
  const once = migrateLegacyBuildingResearch(original);
  const twice = migrateLegacyBuildingResearch(once);

  assert.deepEqual(original, snapshot);
  assert.deepEqual(twice, once);
  assert.deepEqual(once.tech.researched, ['tech_ancient_5']);
  assert.deepEqual(once.buildingTech.unlockedNodes, ['bt_logging_t2', 'unknown_legacy_node']);
});

test('restoring migrated legacy research also unlocks every unit granted by mapped techs', () => {
  eventBus.clear();
  configRegistry._configs = {
    historicalContent,
    techs: historicalContent.techs,
    enemies: { units: [] }
  };
  const migrated = migrateLegacyBuildingResearch({
    buildingTech: {
      unlockedNodes: [
        'bt_logging', 'bt_mining', 'bt_logging_t2',
        'bt_mining_t2', 'bt_industry', 'bt_terraforming'
      ]
    },
    tech: { researched: [], unitResearch: [] },
    culture: { researched: [] }
  });
  const tech = new TechSystem();

  tech.restoreState(migrated.tech);

  for (const unitId of [
    'primitive_anti_cavalry_3', 'primitive_infantry_1', 'ancient_siege_5',
    'ancient_infantry_1', 'early_modern_navy_7'
  ]) {
    assert.equal(tech.isUnitUnlockedByTech(unitId), true, unitId);
  }
});

test('normal research aggregates former building production bonuses additively by resource', () => {
  eventBus.clear();
  configRegistry._configs = {
    historicalContent,
    techs: [
      { id: 'tech_a', effects: { resourceProductionMul: { wood: 1.4 } } },
      { id: 'tech_b', effects: { resourceProductionMul: { wood: 1.2, stone: 1.4 } } }
    ],
    culture: [
      { id: 'civic_a', eraId: 'primitive', effects: { resourceProductionMul: { food: 1.4 } } },
      { id: 'civic_b', eraId: 'primitive', effects: { resourceProductionMul: { food: 1.2, gold: 1.4 } } }
    ],
    doctrines: [],
    enemies: { units: [], formations: [] }
  };
  const tech = new TechSystem();
  tech.restoreState({ researched: ['tech_a', 'tech_b'] });
  const culture = new CultureSystem();
  culture.restoreState({ researched: ['civic_a', 'civic_b'] });

  assert.deepEqual(tech.getEffects().resourceProductionMul, { wood: 1.6, stone: 1.4 });
  assert.deepEqual(culture.getEffects().resourceProductionMul, { food: 1.6, gold: 1.4 });
});

test('mapped historical nodes carry every former production bonus', () => {
  const byId = new Map([
    ...historicalContent.techs,
    ...historicalContent.civics
  ].map(node => [node.id, node]));

  assert.deepEqual(byId.get('tech_primitive_3').effects.resourceProductionMul, { wood: 1.8 });
  assert.deepEqual(byId.get('tech_primitive_1').effects.resourceProductionMul, { stone: 1.8 });
  assert.deepEqual(byId.get('civic_primitive_5').effects.resourceProductionMul, { food: 1.4 });
  assert.deepEqual(byId.get('civic_primitive_6').effects.resourceProductionMul, { gold: 1.4 });
  assert.equal(byId.get('tech_early_modern_7').effects.productionMul, 1.555);
  assert.equal(byId.get('civic_early_modern_5').effects.productionMul, 1.45);
});
