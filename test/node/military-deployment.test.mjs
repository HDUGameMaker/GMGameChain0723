import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { findDeploymentTile, getDeploymentCandidates } from '../../src/domain/MilitaryDeployment.js';
import { ArmySystem } from '../../src/systems/ArmySystem.js';

const load = relativePath => JSON.parse(readFileSync(resolve(import.meta.dirname, '../..', relativePath), 'utf8'));

function createArmyScenario() {
  eventBus.clear();
  const grid = Array.from({ length: 7 }, () => Array(7).fill('G'));
  grid[5][4] = 'S';
  grid[4][3] = 'W';
  configRegistry._configs = {
    enemies: {
      units: [
        { id: 'spear', name: '长矛兵', commandPoints: 2, domain: 'land' },
        { id: 'heavy', name: '重装兵', commandPoints: 12, domain: 'land' },
        { id: 'galley', name: '桨帆舰', commandPoints: 5, domain: 'naval' }
      ],
      formations: []
    },
    buildings: [
      { id: 'warehouse', footprint: { width: 1, height: 1 }, uniqueFunction: { armyAssemblyDomains: ['land'] } },
      { id: 'grand_shipyard', footprint: { width: 1, height: 1 }, uniqueFunction: { armyAssemblyDomains: ['naval'] } },
      { id: 'barracks_hall', footprint: { width: 1, height: 1 }, uniqueFunction: { trainsBranches: ['infantry'] } }
    ],
    map: { gridWidth: 7, gridHeight: 7, grid, spawnManifest: { cityStates: [], wildSites: [] } }
  };
  const building = {
    buildings: [
      { buildingId: 'warehouse', status: 'active', gridX: 2, gridY: 2 },
      { buildingId: 'grand_shipyard', status: 'active', gridX: 4, gridY: 4 },
      { buildingId: 'barracks_hall', status: 'active', gridX: 0, gridY: 0 }
    ]
  };
  const army = new ArmySystem();
  army.setSystems({ building });
  army.initNew();
  army.setAvailableUnits({ spear: 4, heavy: 2, galley: 2 });
  return { army, building, map: configRegistry.get('map') };
}

test('deployment candidates follow fixed compass priority around a one-tile footprint', () => {
  const candidates = getDeploymentCandidates(
    { gridX: 10, gridY: 10 },
    { footprint: { width: 1, height: 1 } }
  );

  assert.deepEqual(candidates.map(item => item.direction), ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
  assert.deepEqual(candidates.map(({ x, y }) => [x, y]), [
    [10, 9], [11, 9], [11, 10], [11, 11],
    [10, 11], [9, 11], [9, 10], [9, 9]
  ]);
});

test('deployment candidates wrap the full footprint instead of its origin tile', () => {
  const candidates = getDeploymentCandidates(
    { gridX: 10, gridY: 20 },
    { footprint: { width: 3, height: 2 } }
  );

  assert.deepEqual(candidates.map(({ x, y }) => [x, y]), [
    [11, 19], [13, 19], [13, 20], [13, 22],
    [11, 22], [9, 22], [9, 20], [9, 19]
  ]);
});

test('tile search rejects bounds terrain active footprints ungarrisoned armies and fixed targets', () => {
  const map = {
    gridWidth: 6,
    gridHeight: 6,
    grid: Array.from({ length: 6 }, () => Array(6).fill('G'))
  };
  map.grid[1][3] = 'S';
  const result = findDeploymentTile({
    building: { gridX: 2, gridY: 2 },
    buildingConfig: { footprint: { width: 1, height: 1 } },
    map,
    domain: 'land',
    activeBuildings: [
      { gridX: 3, gridY: 2, footprint: { width: 2, height: 1 } }
    ],
    armies: [
      { gridX: 3, gridY: 3, garrisonBuildingIndex: null },
      { gridX: 2, gridY: 3, garrisonBuildingIndex: 0 }
    ],
    fixedTargets: [
      { gridX: 2, gridY: 1 },
      { gridX: 1, gridY: 3 },
      { gridX: 1, gridY: 2 },
      { gridX: 1, gridY: 1 }
    ]
  });

  assert.deepEqual(result, { x: 2, y: 3, direction: 'S' });
});

test('naval tile search accepts only sea and water candidates', () => {
  const map = {
    gridWidth: 4,
    gridHeight: 4,
    grid: [
      ['G', 'G', 'G', 'G'],
      ['G', 'G', 'G', 'G'],
      ['G', 'G', 'G', 'W'],
      ['G', 'G', 'S', 'G']
    ]
  };

  assert.deepEqual(findDeploymentTile({
    building: { gridX: 2, gridY: 2 },
    buildingConfig: { footprint: { width: 1, height: 1 } },
    map,
    domain: 'naval',
    activeBuildings: [],
    armies: [],
    fixedTargets: []
  }), { x: 3, y: 2, direction: 'E' });
});

test('assembly domains belong only to the prescribed headquarters forts harbor and shipyard', () => {
  const buildings = [...load('config/buildings.json'), ...load('config/historical_content.json').buildings];
  const domains = Object.fromEntries(buildings
    .filter(building => building.uniqueFunction?.armyAssemblyDomains)
    .map(building => [building.id, building.uniqueFunction.armyAssemblyDomains]));

  assert.deepEqual(domains, {
    warehouse: ['land'],
    castle: ['land'],
    harbor: ['naval'],
    grand_shipyard: ['naval'],
    field_camp: ['land'],
    frontier_fort: ['land'],
    grand_fortress: ['land']
  });
  for (const id of ['barracks_hall', 'archery_range', 'stable', 'siege_workshop']) {
    assert.equal(buildings.find(building => building.id === id)?.uniqueFunction?.armyAssemblyDomains, undefined);
  }
});

test('army deployment consumes selected reserves once and creates one populated army', () => {
  const { army } = createArmyScenario();

  const result = army.deployArmyFromBuilding({
    buildingIndex: 0,
    name: '第一军团',
    unitCounts: { spear: 2 }
  });

  assert.equal(result.ok, true);
  assert.deepEqual([result.army.gridX, result.army.gridY], [2, 1]);
  assert.equal(result.army.name, '第一军团');
  assert.deepEqual(result.army.unitIds, ['spear', 'spear']);
  assert.deepEqual(army.getAvailableUnits(), { spear: 2, heavy: 2, galley: 2 });
  assert.equal(army.getState().nextId, 2);
  assert.equal(army.getArmies().length, 1);
});

test('naval armies deploy only onto water around a naval assembly building', () => {
  const { army, map } = createArmyScenario();

  const result = army.deployArmyFromBuilding({
    buildingIndex: 1,
    name: '第一舰队',
    unitCounts: { galley: 1 }
  });

  assert.equal(result.ok, true);
  assert.equal(['S', 'W'].includes(map.grid[result.army.gridY][result.army.gridX]), true);
  assert.deepEqual([result.army.gridX, result.army.gridY], [4, 5]);
});

test('deployment is atomic when all eight footprint candidates are fixed targets', () => {
  const { army, map } = createArmyScenario();
  map.spawnManifest.wildSites = getDeploymentCandidates(
    { gridX: 2, gridY: 2 },
    { footprint: { width: 1, height: 1 } }
  ).map(({ x: gridX, y: gridY }, index) => ({ id: `target_${index}`, gridX, gridY }));
  const before = army.getState();

  const result = army.deployArmyFromBuilding({
    buildingIndex: 0,
    name: '受阻军团',
    unitCounts: { spear: 2 }
  });

  assert.equal(result.reason, 'no_deployment_tile');
  assert.deepEqual(army.getState(), before);
});

test('every deployment validation failure preserves armies reserves and next id', () => {
  const cases = [
    ['invalid assembly building', ({ building }) => { building.buildings[0].status = 'constructing'; }, { buildingIndex: 0, unitCounts: { spear: 1 } }, 'invalid_assembly_building'],
    ['training-only building', () => {}, { buildingIndex: 2, unitCounts: { spear: 1 } }, 'invalid_assembly_building'],
    ['empty selection', () => {}, { buildingIndex: 0, unitCounts: {} }, 'empty_unit_selection'],
    ['invalid count', () => {}, { buildingIndex: 0, unitCounts: { spear: 0 } }, 'invalid_unit_count'],
    ['unknown unit', () => {}, { buildingIndex: 0, unitCounts: { unknown: 1 } }, 'unknown_unit'],
    ['insufficient reserve', () => {}, { buildingIndex: 0, unitCounts: { spear: 5 } }, 'insufficient_reserve'],
    ['mixed domains', () => {}, { buildingIndex: 0, unitCounts: { spear: 1, galley: 1 } }, 'mixed_unit_domains'],
    ['unsupported domain', () => {}, { buildingIndex: 0, unitCounts: { galley: 1 } }, 'assembly_domain_not_supported'],
    ['army capacity', ({ army }) => {
      army.createArmy('一');
      army.createArmy('二');
    }, { buildingIndex: 0, unitCounts: { spear: 1 } }, 'army_capacity_full']
  ];

  for (const [label, arrange, request, reason] of cases) {
    const scenario = createArmyScenario();
    arrange(scenario);
    const before = scenario.army.getState();
    const result = scenario.army.deployArmyFromBuilding({ name: label, ...request });
    assert.equal(result.reason, reason, label);
    assert.deepEqual(scenario.army.getState(), before, label);
  }
});
