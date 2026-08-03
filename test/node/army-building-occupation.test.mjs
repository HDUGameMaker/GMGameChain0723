import test from 'node:test';
import assert from 'node:assert/strict';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { ArmySystem } from '../../src/systems/ArmySystem.js';
import { BuildingSystem } from '../../src/systems/BuildingSystem.js';

function setup({ mapWidth = 5, mapHeight = 3, buildings = [], armies = [] } = {}) {
  eventBus.clear();
  const configs = [
    { id: 'warehouse', footprint: { width: 1, height: 1 }, upgradesTo: 'warehouse_t2' },
    { id: 'warehouse_t2', footprint: { width: 2, height: 2 }, upgradeCost: [] },
    {
      id: 'frontier_fort', footprint: { width: 2, height: 2 },
      uniqueFunction: { garrisonCapacity: 2, garrisonDefenseMul: 1.3, visionRadius: 7 }
    }
  ];
  configRegistry._configs = {
    buildings: configs,
    enemies: { units: [{ id: 'spear', combatPower: 10, commandPoints: 1, domain: 'land' }], formations: [] },
    militaryTactics: { tactics: [] },
    map: {
      gridWidth: mapWidth,
      gridHeight: mapHeight,
      grid: Array.from({ length: mapHeight }, () => Array(mapWidth).fill('G'))
    }
  };
  const building = new BuildingSystem();
  building.buildings = buildings;
  const army = new ArmySystem();
  army.setSystems({ building });
  building.setArmySystem(army);
  army.restoreState({ nextId: armies.length + 1, availableUnits: {}, armies });
  return { army, building };
}

test('army destinations and paths never enter ordinary building footprints', () => {
  const warehouse = { buildingId: 'warehouse', status: 'active', gridX: 2, gridY: 1 };
  const { army } = setup({
    buildings: [warehouse],
    armies: [{ id: 'army_1', unitIds: ['spear'], gridX: 0, gridY: 1 }]
  });

  const blocked = army.issueMoveOrder('army_1', warehouse.gridX, warehouse.gridY);
  assert.equal(blocked.reason, 'tile_occupied_by_building');

  const routed = army.issueMoveOrder('army_1', 4, 1);
  assert.equal(routed.ok, true);
  assert.equal(routed.path.some(step => step.x === warehouse.gridX && step.y === warehouse.gridY), false);
});

test('ungarrison uses N through NW compass exit priority', () => {
  const fort = { buildingId: 'frontier_fort', status: 'active', gridX: 1, gridY: 1 };
  const { army } = setup({
    mapWidth: 5,
    mapHeight: 5,
    buildings: [fort],
    armies: [{ id: 'army_1', unitIds: ['spear'], gridX: 1, gridY: 1, garrisonBuildingIndex: 0 }]
  });

  const result = army.ungarrisonArmy('army_1');
  assert.equal(result.ok, true);
  assert.deepEqual([result.army.gridX, result.army.gridY], [fort.gridX, fort.gridY - 1]);
});

test('ungarrison fails atomically when every exit is blocked', () => {
  const fort = { buildingId: 'frontier_fort', status: 'active', gridX: 0, gridY: 0 };
  const { army } = setup({
    mapWidth: 2,
    mapHeight: 2,
    buildings: [fort],
    armies: [{ id: 'army_1', unitIds: ['spear'], gridX: 0, gridY: 0, garrisonBuildingIndex: 0 }]
  });

  const result = army.ungarrisonArmy('army_1');
  assert.equal(result.reason, 'no_ungarrison_tile');
  assert.equal(army.getArmy('army_1').garrisonBuildingIndex, 0);
  assert.deepEqual([army.getArmy('army_1').gridX, army.getArmy('army_1').gridY], [0, 0]);
});

test('garrisoned buildings cannot be upgraded, moved, or demolished', () => {
  const fort = { instanceId: 'building_1', buildingId: 'warehouse', status: 'active', gridX: 1, gridY: 1 };
  const { army, building } = setup({
    buildings: [fort],
    armies: [{ id: 'army_1', unitIds: ['spear'], gridX: 1, gridY: 1, garrisonBuildingIndex: 0 }]
  });

  assert.equal(army.hasGarrisonAtBuilding(0), true);
  assert.equal(building.canUpgrade(0).reason, 'building_garrisoned');
  assert.equal(building.canMoveTo(0, 2, 1).reason, 'building_garrisoned');
  assert.equal(building.canDemolish(0).reason, 'building_garrisoned');
  assert.equal(building.demolishBuilding(0), false);
  assert.equal(building.buildings[0], fort);
});
