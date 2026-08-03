import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyArmyInteractionTarget } from '../../src/domain/ArmyInteractionTarget.js';
import { ArmyInteractionSystem } from '../../src/systems/ArmyInteractionSystem.js';
import { eventBus } from '../../src/core/EventBus.js';
import { MapRenderer } from '../../src/rendering/MapRenderer.js';

const emptyContext = {
  armies: [],
  buildings: [],
  wildSites: [],
  cityStates: [],
  enemies: []
};

test('an empty reachable tile becomes an immediate move target', () => {
  assert.deepEqual(
    classifyArmyInteractionTarget({ gridX: 7, gridY: 8, ...emptyContext }),
    { kind: 'move', gridX: 7, gridY: 8 }
  );
});

test('wild sites, city states, enemies and garrisons require interaction', () => {
  const target = { gridX: 4, gridY: 5 };
  assert.equal(classifyArmyInteractionTarget({ ...emptyContext, ...target, wildSites: [{ id: 'wild-1', ...target }] }).kind, 'wild_site');
  assert.equal(classifyArmyInteractionTarget({ ...emptyContext, ...target, cityStates: [{ id: 'city-1', ...target }] }).kind, 'city_state');
  assert.equal(classifyArmyInteractionTarget({ ...emptyContext, ...target, enemies: [{ id: 'enemy-1', ...target }] }).kind, 'enemy');
  assert.equal(classifyArmyInteractionTarget({
    ...emptyContext,
    ...target,
    buildings: [{ buildingId: 'castle', status: 'active', ...target }],
    getBuildingConfig: () => ({ footprint: { width: 1, height: 1 }, uniqueFunction: { garrisonCapacity: 1 } })
  }).kind, 'garrison');
});

test('ordinary own buildings block the selected army across their footprint', () => {
  const result = classifyArmyInteractionTarget({
    ...emptyContext,
    gridX: 4,
    gridY: 3,
    buildings: [{ buildingId: 'warehouse', status: 'active', gridX: 3, gridY: 3 }],
    getBuildingConfig: () => ({ footprint: { width: 2, height: 1 } })
  });
  assert.equal(result.kind, 'blocked_building');
});

test('coordinator moves immediately and confirms strategic interactions before acting', async () => {
  const calls = [];
  const confirmations = [];
  const popupManager = {
    async confirm(message) { confirmations.push(message); return true; },
    async alert(message) { calls.push(['alert', message]); }
  };
  const systems = {
    army: {
      getArmies: () => [{ id: 'army-1', ownerId: 'player', name: '第一军团', gridX: 1, gridY: 1, unitIds: ['spear'] }],
      getArmy: () => ({ id: 'army-1', unitIds: ['spear'] }),
      getArmyPower: () => 42,
      issueMoveOrder: (...args) => { calls.push(['move', ...args]); return { ok: true }; },
      garrisonArmy: (...args) => { calls.push(['garrison', ...args]); return { ok: true }; }
    },
    building: {
      buildings: [{ buildingId: 'castle', status: 'active', gridX: 3, gridY: 3 }],
      getBuildingConfig: () => ({ footprint: { width: 1, height: 1 }, uniqueFunction: { garrisonCapacity: 1 } })
    },
    wildSites: {
      getVisibleSites: () => [{ id: 'wild-1', name: '山贼营地', gridX: 5, gridY: 5 }],
      attackWithArmy: (...args) => { calls.push(['wild', ...args]); return { ok: true }; }
    },
    diplomacy: {
      getVisibleOutposts: () => [{ id: 'city-1', name: '林地城邦', gridX: 6, gridY: 6 }],
      attackOutpost: (...args) => { calls.push(['city', ...args]); return { ok: true }; }
    }
  };
  const coordinator = new ArmyInteractionSystem({ ...systems, popupManager });

  await coordinator.request({ armyId: 'army-1', gridX: 2, gridY: 1 });
  assert.deepEqual(calls.shift(), ['move', 'army-1', 2, 1]);
  assert.equal(confirmations.length, 0);

  await coordinator.request({ armyId: 'army-1', gridX: 5, gridY: 5 });
  assert.deepEqual(calls.shift(), ['wild', 'wild-1', 'army-1']);
  await coordinator.request({ armyId: 'army-1', gridX: 6, gridY: 6 });
  assert.deepEqual(calls.shift(), ['city', 'city-1', { power: 42, armyId: 'army-1' }]);
  await coordinator.request({ armyId: 'army-1', gridX: 3, gridY: 3 });
  assert.deepEqual(calls.shift(), ['garrison', 'army-1', 0]);
  assert.equal(confirmations.length, 3);
});

test('coordinator translates failed move reasons into Chinese alerts', async () => {
  const alerts = [];
  const coordinator = new ArmyInteractionSystem({
    army: {
      getArmies: () => [{ id: 'army-1', ownerId: 'player', gridX: 1, gridY: 1, unitIds: ['spear'] }],
      issueMoveOrder: () => ({ ok: false, reason: 'no_path' })
    },
    popupManager: { alert: async message => alerts.push(message) }
  });
  const result = await coordinator.request({ armyId: 'army-1', gridX: 9, gridY: 9 });
  assert.equal(result.reason, 'no_path');
  assert.deepEqual(alerts, ['无法到达目标格，路径可能被阻挡。']);
});

test('map selection gives player armies precedence and emits detail then target requests', () => {
  eventBus.clear();
  const renderer = Object.create(MapRenderer.prototype);
  renderer.selectedArmyId = null;
  renderer._armySystem = {
    getArmies: () => [
      { id: 'army-1', ownerId: 'player', gridX: 2, gridY: 2, unitIds: ['spear'] },
      { id: 'army-2', ownerId: 'player', gridX: 3, gridY: 2, unitIds: ['archer'] }
    ]
  };
  renderer._drawStrategicTokens = () => {};
  renderer._classifyArmyInteractionTarget = (gridX, gridY) => ({ kind: 'move', gridX, gridY });
  const details = [];
  const requests = [];
  eventBus.on('armyDetailRequested', payload => details.push(payload));
  eventBus.on('armyInteractionRequested', payload => requests.push(payload));

  assert.equal(renderer._handleArmyMapClick(2, 2), true);
  assert.equal(renderer.selectedArmyId, 'army-1');
  assert.equal(renderer._handleArmyMapClick(2, 2), true);
  assert.deepEqual(details, [{ armyId: 'army-1' }]);
  assert.equal(renderer._handleArmyMapClick(4, 2), true);
  assert.deepEqual(requests, [{ armyId: 'army-1', gridX: 4, gridY: 2, target: { kind: 'move', gridX: 4, gridY: 2 } }]);
  assert.equal(renderer._handleArmyMapClick(3, 2), true);
  assert.equal(renderer.selectedArmyId, 'army-2');
  eventBus.clear();
});
