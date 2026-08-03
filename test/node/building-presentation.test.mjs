import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  BUILDING_CATEGORIES,
  getBuildingPresentation
} from '../../src/domain/BuildingPresentation.js';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { BuildingSystem } from '../../src/systems/BuildingSystem.js';

const root = resolve(import.meta.dirname, '../..');
const buildings = JSON.parse(readFileSync(resolve(root, 'config/buildings.json'), 'utf8'));

test('passive buildings expose category era staffing and a concrete effect', () => {
  const presentation = getBuildingPresentation({
    id: 'warehouse',
    name: '大本营',
    category: 'administration',
    eraId: 'primitive',
    maxWorkers: 0,
    storageMultiplier: 1.5,
    production: null
  }, []);

  assert.equal(presentation.categoryName, '行政');
  assert.equal(presentation.eraName, '原始时代');
  assert.equal(presentation.staffingText, '无需人口');
  assert.deepEqual(presentation.effectRows, ['资源存储上限 ×1.5']);
});

test('canonical building categories cover the complete construction menu', () => {
  assert.deepEqual(Object.keys(BUILDING_CATEGORIES), [
    'housing', 'agriculture', 'gathering', 'industry', 'commerce',
    'research', 'civic', 'military', 'defense', 'naval', 'administration'
  ]);
});

test('one unlock status supplies both era and configured gate results', () => {
  configRegistry._configs = {
    buildings: [{
      id: 'bank', name: '钱庄', eraId: 'medieval',
      unlockConditions: [{ type: 'tech', techId: 'coinage' }]
    }],
    historicalContent: {
      eras: [
        { id: 'primitive', name: '原始时代' },
        { id: 'medieval', name: '中世纪' }
      ],
      civilizations: [], buildings: [], techs: [], civics: [], units: [], heroes: [], strategies: []
    },
    techs: [{ id: 'coinage', name: '铸币术' }]
  };
  const system = new BuildingSystem();
  system.setEraSystem({ getCurrentEra: () => ({ id: 'primitive', name: '原始时代' }), getEras: () => configRegistry.getHistoricalContent().eras });
  system.setTechSystem({ isResearched: () => false });

  assert.deepEqual(system.getUnlockStatus('bank'), {
    unlocked: false,
    conditions: [
      { type: 'tech', desc: '科技: 铸币术', met: false },
      { type: 'era', desc: '时代: 中世纪', met: false }
    ]
  });
  assert.equal(system.isUnlocked('bank'), false);
});

test('runtime buildings no longer use building_tech unlock conditions', () => {
  assert.equal(buildings.flatMap(item => item.unlockConditions || []).some(item => item.type === 'building_tech'), false);
});

test('T2 resource buildings use the exact normal research gates', () => {
  const byId = new Map(buildings.map(building => [building.id, building]));
  assert.deepEqual(byId.get('logging_camp_t2').unlockConditions, [{ type: 'tech', techId: 'tech_ancient_5' }]);
  assert.deepEqual(byId.get('stope_t2').unlockConditions, [{ type: 'tech', techId: 'tech_ancient_1' }]);
  assert.deepEqual(byId.get('farm_t2').unlockConditions, [{ type: 'culture', cultureId: 'civic_ancient_4' }]);
  assert.deepEqual(byId.get('gold_mint_t2').unlockConditions, [{ type: 'culture', cultureId: 'civic_ancient_8' }]);
});

test('player-facing building tree routes are absent', () => {
  const files = [
    'index.html',
    'src/ui/HUD.js',
    'src/ui/PopupManager.js',
    'src/ui/panels/building-select-panel.js'
  ];
  for (const file of files) {
    const source = readFileSync(resolve(root, file), 'utf8');
    assert.doesNotMatch(source, /btn-building-tree|building_tree/, file);
  }
});
