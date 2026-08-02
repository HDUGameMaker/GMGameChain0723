import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { ArmySystem } from '../../src/systems/ArmySystem.js';

const historical = JSON.parse(readFileSync(new URL('../../config/historical_content.json', import.meta.url), 'utf8'));

test('historical building roster has three distinct field fortification levels', () => {
  const ids = ['field_camp', 'frontier_fort', 'grand_fortress'];
  const forts = ids.map(id => historical.buildings.find(building => building.id === id));
  assert.ok(forts.every(Boolean));
  assert.deepEqual(forts.map(fort => fort.footprint.width), [1, 2, 3]);
  assert.ok(forts[0].uniqueFunction.garrisonDefenseMul < forts[1].uniqueFunction.garrisonDefenseMul);
  assert.ok(forts[1].uniqueFunction.garrisonDefenseMul < forts[2].uniqueFunction.garrisonDefenseMul);
  assert.ok(forts.every(fort => fort.uniqueFunction.visionRadius > 0));
});

test('garrisoned armies recover supply and morale from their fortification each day', () => {
  eventBus.clear();
  const fort = {
    id: 'frontier_fort', footprint: { width: 2, height: 2 },
    uniqueFunction: { garrisonCapacity: 2, garrisonDefenseMul: 1.3, garrisonSupplyRecovery: 0.2, garrisonMoraleRecovery: 8, visionRadius: 6 }
  };
  configRegistry._configs = {
    buildings: [fort],
    enemies: { units: [{ id: 'spear', combatPower: 10, commandPoints: 1, domain: 'land' }], formations: [] },
    militaryTactics: { tactics: [] },
    map: { gridWidth: 4, gridHeight: 4, grid: Array.from({ length: 4 }, () => Array(4).fill('G')) }
  };
  const building = { buildings: [{ buildingId: 'frontier_fort', status: 'active', gridX: 1, gridY: 1 }] };
  const army = new ArmySystem();
  army.setSystems({ building });
  army.restoreState({
    nextId: 2,
    availableUnits: {},
    armies: [{ id: 'army_1', name: '守军', unitIds: ['spear'], gridX: 1, gridY: 1, morale: 50, supply: 0.5, garrisonBuildingIndex: 0 }]
  });
  const effects = army.getFortificationEffects('army_1');
  assert.equal(effects.defenseMultiplier, 1.3);
  assert.equal(effects.visionRadius, 6);
  eventBus.emit('dayStart', { day: 2 });
  assert.equal(army.getArmy('army_1').supply, 0.7);
  assert.equal(army.getArmy('army_1').morale, 58);
});
