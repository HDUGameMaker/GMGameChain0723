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

test('passable bridges are classified as movement targets', () => {
  const result = classifyArmyInteractionTarget({
    ...emptyContext,
    gridX: 4,
    gridY: 3,
    buildings: [{ buildingId: 'classical_bridge', status: 'active', gridX: 4, gridY: 3 }],
    getBuildingConfig: () => ({ footprint: { width: 1, height: 1 }, passable: true })
  });
  assert.equal(result.kind, 'move');
});

test('coordinator moves toward enemies beyond the army weighted attack range without an alert', async () => {
  const alerts = [];
  const moves = [];
  let confirmations = 0;
  const coordinator = new ArmyInteractionSystem({
    army: {
      getArmy: () => ({ id: 'army-1', ownerId: 'player', gridX: 1, gridY: 1, unitIds: ['spear'] }),
      getArmies: () => [{ id: 'army-1', ownerId: 'player', gridX: 1, gridY: 1, unitIds: ['spear'] }],
      canAttackTarget: () => ({ ok: false, reason: 'target_out_of_range', distance: 5, attackRange: 1 }),
      issueMoveOrder: (...args) => { moves.push(args); return { ok: true, path: [{ x: 2, y: 1 }] }; }
    },
    popupManager: {
      confirm: async () => { confirmations += 1; return true; },
      alert: async message => alerts.push(message)
    }
  });
  const result = await coordinator.request({
    armyId: 'army-1', gridX: 6, gridY: 1,
    target: { kind: 'enemy', source: 'expansion', gridX: 6, gridY: 1, enemy: { name: '远处敌军' } }
  });

  assert.equal(result.ok, true);
  assert.equal(result.movingTowardEnemy, true);
  assert.equal(confirmations, 0);
  assert.deepEqual(moves, [['army-1', 6, 1]]);
  assert.deepEqual(alerts, []);
});

test('selected armies clear expansion enemies through army-scoped combat', async () => {
  const calls = [];
  const coordinator = new ArmyInteractionSystem({
    army: {
      getArmy: () => ({ id: 'army-1', ownerId: 'player', unitIds: ['spear'] }),
      getArmies: () => [{ id: 'army-1', ownerId: 'player', unitIds: ['spear'] }]
    },
    enemyExpansion: {
      clearEnemyCellWithArmy: (...args) => { calls.push(args); return { ok: true, casualties: 0 }; }
    },
    popupManager: { confirm: async () => true, alert: async () => {} }
  });
  const result = await coordinator.request({
    armyId: 'army-1', gridX: 8, gridY: 9,
    target: { kind: 'enemy', source: 'expansion', gridX: 8, gridY: 9, enemy: { name: '敌占区' } }
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [[8, 9, 'army-1']]);
});

test('map selection gives player armies precedence and clicking the selected army again cancels selection', () => {
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
  assert.equal(renderer.selectedArmyId, null);
  assert.deepEqual(details, []);
  assert.equal(renderer._handleArmyMapClick(4, 2), false);
  assert.deepEqual(requests, []);
  assert.equal(renderer._handleArmyMapClick(3, 2), true);
  assert.equal(renderer.selectedArmyId, 'army-2');
  eventBus.clear();
});

test('left click toggles enemy selection while right click opens enemy or army details', () => {
  eventBus.clear();
  const renderer = Object.create(MapRenderer.prototype);
  renderer.selectedArmyId = null;
  renderer.selectedEnemyTarget = null;
  renderer._drawStrategicTokens = () => {};
  renderer._armySystem = {
    getArmies: () => [{ id: 'army-1', ownerId: 'player', gridX: 2, gridY: 2, unitIds: ['spear'] }]
  };
  const enemyTarget = {
    kind: 'enemy', source: 'expansion', enemyId: 'enemy-force', gridX: 5, gridY: 4,
    enemy: { id: 'enemy-force', name: '敌军', attackRange: 3 }
  };
  renderer._classifyArmyInteractionTarget = (gridX, gridY) => gridX === 5 && gridY === 4
    ? enemyTarget
    : { kind: 'move', gridX, gridY };

  assert.equal(renderer._handleArmyMapClick(5, 4), true);
  assert.deepEqual(renderer.selectedEnemyTarget, {
    key: 'expansion:enemy-force:5,4', source: 'expansion', enemyId: 'enemy-force', gridX: 5, gridY: 4, attackRange: 3
  });
  assert.equal(renderer._handleArmyMapClick(5, 4), true);
  assert.equal(renderer.selectedEnemyTarget, null);

  const armyDetails = [];
  const enemyDetails = [];
  eventBus.on('armyDetailRequested', data => armyDetails.push(data));
  eventBus.on('enemyDetailRequested', data => enemyDetails.push(data));
  assert.equal(renderer._handleStrategicContextMenu(2, 2), true);
  assert.equal(renderer._handleStrategicContextMenu(5, 4), true);
  assert.deepEqual(armyDetails, [{ armyId: 'army-1' }]);
  assert.deepEqual(enemyDetails, [{ enemy: enemyTarget.enemy, source: 'expansion', gridX: 5, gridY: 4 }]);
  eventBus.clear();
});

test('marking a movement destination clears selection after publishing the route order', () => {
  eventBus.clear();
  const renderer = Object.create(MapRenderer.prototype);
  renderer.selectedArmyId = 'army-1';
  renderer.selectedEnemyTarget = null;
  renderer._drawStrategicTokens = () => {};
  renderer._armySystem = {
    getArmies: () => [{ id: 'army-1', ownerId: 'player', gridX: 1, gridY: 1, unitIds: ['spear'] }]
  };
  renderer._classifyArmyInteractionTarget = (gridX, gridY) => ({ kind: 'move', gridX, gridY });
  const requests = [];
  eventBus.on('armyInteractionRequested', data => requests.push(data));

  assert.equal(renderer._handleArmyMapClick(4, 1), true);
  assert.equal(renderer.selectedArmyId, null);
  assert.deepEqual(requests, [{ armyId: 'army-1', gridX: 4, gridY: 1, target: { kind: 'move', gridX: 4, gridY: 1 } }]);
  eventBus.clear();
});

test('clicking an out-of-range enemy publishes an approach order and clears army selection', () => {
  eventBus.clear();
  const renderer = Object.create(MapRenderer.prototype);
  renderer.selectedArmyId = 'army-1';
  renderer.selectedEnemyTarget = null;
  renderer._drawStrategicTokens = () => {};
  renderer._armySystem = {
    getArmies: () => [{ id: 'army-1', ownerId: 'player', gridX: 1, gridY: 1, unitIds: ['spear'] }],
    canAttackTarget: () => ({ ok: false, reason: 'target_out_of_range', distance: 5, attackRange: 1 })
  };
  const target = { kind: 'enemy', source: 'expansion', gridX: 6, gridY: 1, enemy: { id: 'enemy-1' } };
  renderer._classifyArmyInteractionTarget = () => target;
  const requests = [];
  eventBus.on('armyInteractionRequested', data => requests.push(data));

  assert.equal(renderer._handleArmyMapClick(6, 1), true);
  assert.equal(renderer.selectedArmyId, null);
  assert.deepEqual(requests, [{ armyId: 'army-1', gridX: 6, gridY: 1, target }]);
  eventBus.clear();
});
