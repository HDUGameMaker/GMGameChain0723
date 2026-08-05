import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  BUILDING_CATEGORIES,
  formatBuildingEffect,
  getBuildingPrimaryFunctionRows,
  getBuildingPresentation
} from '../../src/domain/BuildingPresentation.js';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { BuildingSystem } from '../../src/systems/BuildingSystem.js';
import { getBuildingCivilizationIds, isBuildingVisibleForCivilization, isBuildingVisibleForEra } from '../../src/ui/panels/building-select-panel.js';

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

test('building primary functions expose detailed production and capacity values', () => {
  const rows = getBuildingPrimaryFunctionRows({
    maxWorkers: 5,
    housingCapacity: 18,
    productionCycle: 'tick',
    production: {
      perWorker: true,
      input: [{ resourceId: 'food', amount: 1 }],
      output: [{ resourceId: 'wood', amount: 2 }]
    }
  }, resourceId => ({ food: '食物', wood: '木材' })[resourceId] || resourceId);

  assert.equal(rows[0], '产出 木材 +2／每名工人／每时段');
  assert.equal(rows[1], '消耗 食物 1／每名工人／每时段');
  assert.ok(rows.includes('人口容量 +18'));
  assert.ok(rows.includes('岗位上限 5 人'));
});

test('building effects use translated player-facing labels and typed values', () => {
  assert.equal(formatBuildingEffect('productionMul', 1.2), '生产效率 ×1.2');
  assert.equal(formatBuildingEffect('blocksEnemyMovement', true), '阻挡敌军移动：启用');
  assert.equal(formatBuildingEffect('armyAssemblyDomains', ['land', 'naval']), '可集结军团领域：陆军、海军');
  assert.equal(formatBuildingEffect('workerRecruitment', { resourceId: 'food' }), '工人招募：已配置');
  assert.equal(formatBuildingEffect('internalFutureKey', 3), '自定义建筑效果 +3');
});

test('canonical building categories cover the complete construction menu', () => {
  assert.deepEqual(Object.keys(BUILDING_CATEGORIES), [
    'housing', 'agriculture', 'gathering', 'basic_industry', 'industry', 'commerce',
    'research', 'civic', 'military', 'defense', 'administration'
  ]);
});

test('construction menu hides future-era buildings but keeps current and legacy buildings', () => {
  const eras = [{ id: 'primitive' }, { id: 'ancient' }, { id: 'classical' }];
  const currentEra = eras[1];
  assert.equal(isBuildingVisibleForEra({ eraId: 'primitive' }, currentEra, eras), true);
  assert.equal(isBuildingVisibleForEra({ eraId: 'ancient' }, currentEra, eras), true);
  assert.equal(isBuildingVisibleForEra({ eraId: 'classical' }, currentEra, eras), false);
  assert.equal(isBuildingVisibleForEra({}, currentEra, eras), true);
});

test('construction menu hides foreign civilization buildings and labels owned unique buildings', () => {
  const building = { civilizationId: 'zhou', unlockConditions: [{ type: 'civilization', civilizationId: 'zhou' }] };
  const ownedEra = { getLegacyCivilizationIds: () => ['zhou'], getSelectedCivilization: () => ({ id: 'assyria' }) };
  const foreignEra = { getLegacyCivilizationIds: () => ['egypt'], getSelectedCivilization: () => ({ id: 'assyria' }) };
  assert.deepEqual(getBuildingCivilizationIds(building), ['zhou']);
  assert.equal(isBuildingVisibleForCivilization(building, ownedEra), true);
  assert.equal(isBuildingVisibleForCivilization(building, foreignEra), false);
  assert.equal(isBuildingVisibleForCivilization({}, foreignEra), true);
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
  assert.deepEqual(byId.get('logging_camp_t2').unlockConditions, [{ type: 'tech', techId: 'tech_classical_5' }]);
  assert.deepEqual(byId.get('stope_t2').unlockConditions, [{ type: 'tech', techId: 'tech_classical_1' }]);
  assert.deepEqual(byId.get('farm_t2').unlockConditions, [{ type: 'culture', cultureId: 'civic_classical_4' }]);
  assert.deepEqual(byId.get('gold_mint_t2').unlockConditions, [{ type: 'culture', cultureId: 'civic_classical_8' }]);
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
