import assert from 'node:assert/strict';
import test from 'node:test';

import { SaveManager } from '../../src/core/SaveManager.js';

function makeLegacyV9(extra = {}) {
  const base = SaveManager.migrate({ version: 8, resources: {}, buildings: [] });
  const legacy = structuredClone(base);
  if (!Object.hasOwn(extra, 'resourceNodes')) delete legacy.resourceNodes;
  if (!Object.hasOwn(extra, 'fogOfWar')) delete legacy.fogOfWar;
  return { ...legacy, ...extra };
}

test('legacy v9 buildings gain stable operation defaults', () => {
  const migrated = SaveManager.migrate(makeLegacyV9({
    buildings: [{ buildingId: 'farm', gridX: 10, gridY: 10, status: 'active', currentWorkers: 2 }]
  }));

  assert.equal(migrated.buildings[0].cropId, 'grain');
  assert.equal(migrated.buildings[0].pendingCropId, null);
  assert.equal(migrated.buildings[0].resourceNodeId, null);
  assert.match(migrated.buildings[0].instanceId, /^building_\d+$/);
  assert.deepEqual(migrated.resourceNodes, { nodes: [] });
  assert.deepEqual(migrated.fogOfWar, { width: 384, height: 384, exploredRle: [384 * 384] });
});

test('legacy building research migrates without losing army logistics or persisting selection UI', () => {
  const legacyV9 = makeLegacyV9({
    buildingTech: { unlockedNodes: ['bt_logging_t2', 'bt_farming_t2'] },
    tech: { researched: ['tech_primitive_1'], points: 12 },
    culture: { researched: [], points: 8 },
    selectedArmyId: 'army_4',
    armyState: {
      nextId: 5,
      availableUnits: { spearman: 3, archer: 1 },
      battleHistory: [],
      selectedArmyId: 'army_4',
      armies: [{
        id: 'army_4', ownerId: 'player', unitIds: ['spearman'], gridX: 12, gridY: 10,
        movePath: [{ x: 12, y: 9 }, { x: 13, y: 9 }],
        order: { type: 'move', targetX: 13, targetY: 9 },
        garrisonBuildingIndex: 2
      }]
    }
  });

  const migrated = SaveManager.migrate(legacyV9);

  assert.equal(migrated.version, 9, 'compatibility normalization does not bump the schema');
  assert.ok(migrated.tech.researched.includes('tech_ancient_5'));
  assert.ok(migrated.culture.researched.includes('civic_ancient_4'));
  assert.deepEqual(migrated.buildingTech, legacyV9.buildingTech, 'legacy state remains readable');
  assert.deepEqual(migrated.armyState.availableUnits, legacyV9.armyState.availableUnits);
  assert.deepEqual(migrated.armyState.armies[0].movePath, legacyV9.armyState.armies[0].movePath);
  assert.deepEqual(migrated.armyState.armies[0].order, legacyV9.armyState.armies[0].order);
  assert.equal(migrated.armyState.armies[0].garrisonBuildingIndex, 2);
  assert.equal(Object.hasOwn(migrated, 'selectedArmyId'), false);
  assert.equal(Object.hasOwn(migrated.armyState, 'selectedArmyId'), false);
});

test('overhaul state remains canonical through an envelope round trip', async () => {
  const payload = SaveManager.migrate(makeLegacyV9({
    resourceNodes: { nodes: [{
      id: 'wood_node_001', type: 'wood', gridX: 15, gridY: 16, rarity: 'common',
      capacity: null, remaining: null, recoveryDays: null, recoveryDay: null,
      developedByBuildingId: 'building_1', discovered: true
    }] },
    fogOfWar: { width: 4, height: 3, exploredRle: [2, 3, 7] },
    buildings: [{
      instanceId: 'building_1', resourceNodeId: 'wood_node_001', buildingId: 'logging_camp',
      gridX: 15, gridY: 16, status: 'active', currentWorkers: 2,
      cropId: null, pendingCropId: null
    }]
  }));
  const envelope = await SaveManager.createEnvelope(payload);
  const verification = await SaveManager.verifyEnvelope(envelope);

  assert.equal(verification.ok, true);
  assert.equal(envelope.payload.resourceNodes.nodes[0].developedByBuildingId, 'building_1');
  assert.deepEqual(envelope.payload.fogOfWar.exploredRle, [2, 3, 7]);
  assert.equal(Object.hasOwn(envelope.payload, 'tradeRoutes'), false);
});

test('invalid coordinates, duplicate building ids and malformed fog runs are rejected', () => {
  const duplicate = SaveManager.migrate(makeLegacyV9({
    buildings: [
      { instanceId: 'building_1', buildingId: 'farm', gridX: 1, gridY: 1 },
      { instanceId: 'building_1', buildingId: 'farm', gridX: 2, gridY: 2 }
    ]
  }));
  assert.equal(duplicate, null);

  const invalidNode = makeLegacyV9({ resourceNodes: { nodes: [{ id: 'bad', type: 'wood', gridX: -1, gridY: 0 }] } });
  invalidNode.fogOfWar = { width: 4, height: 3, exploredRle: [12] };
  assert.equal(SaveManager.migrate(invalidNode), null);

  const invalidFog = makeLegacyV9();
  invalidFog.fogOfWar = { width: 4, height: 3, exploredRle: [11] };
  assert.equal(SaveManager.migrate(invalidFog), null);
});
