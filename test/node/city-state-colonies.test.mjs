import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { ColonySystem } from '../../src/systems/ColonySystem.js';

const world = JSON.parse(readFileSync(new URL('../../config/world-factions.json', import.meta.url), 'utf8'));
const integration = JSON.parse(readFileSync(new URL('../../config/ea_integration.json', import.meta.url), 'utf8'));
const colonies = JSON.parse(readFileSync(new URL('../../config/colonies.json', import.meta.url), 'utf8'));
const cityStates = [...integration.outposts, ...world.cityStates];

function createScenario() {
  eventBus.clear();
  configRegistry._configs = { worldFactions: world, eaIntegration: integration, colonies, enemies: { units: [] } };
  const states = Object.fromEntries(cityStates.map((state, index) => [state.id, {
    status: index === 0 ? 'allied' : index === 1 ? 'defeated' : 'neutral',
    treaties: index === 0 ? ['alliance'] : []
  }]));
  const diplomacy = {
    getAllOutposts: () => cityStates,
    getOutpost: id => cityStates.find(item => item.id === id) || null,
    getOutpostState: id => states[id] || null
  };
  const colony = new ColonySystem();
  colony.setSystems({ diplomacy, population: { current: 30, refresh() {} }, resource: null });
  colony.initNew();
  return { colony, states };
}

test('all fixed city-states are colony targets but only allied or conquered targets are eligible', () => {
  const { colony } = createScenario();
  assert.equal(typeof colony.getColonyTargets, 'function');
  const targets = colony.getColonyTargets();
  assert.equal(targets.length, 24);
  assert.deepEqual(new Set(targets.map(target => target.id)), new Set(cityStates.map(target => target.id)));
  assert.ok(targets.every(target => Number.isInteger(target.gridX) && Number.isInteger(target.gridY)));

  assert.equal(colony.establishColony(cityStates[2].id, { policy: 'autonomy' }).reason, 'target_not_eligible');
  assert.equal(colony.establishColony('missing_city', { policy: 'autonomy' }).reason, 'unknown_city_state');
});

test('city-state colony stores governance, compliance, unrest, income and fixed coordinates', () => {
  const { colony } = createScenario();
  const target = cityStates[0];
  const result = colony.establishColony(target.id, { policy: 'autonomy' });
  assert.equal(result.ok, true);

  const state = colony.getColony(target.id);
  assert.equal(state.targetId, target.id);
  assert.equal(state.gridX, target.gridX);
  assert.equal(state.gridY, target.gridY);
  assert.equal(state.policy, 'autonomy');
  assert.ok(state.compliance >= 0 && state.compliance <= 100);
  assert.ok(state.unrest >= 0 && state.unrest <= 100);
  assert.ok(state.dailyIncome.resources.length > 0);
  assert.equal(state.legacyOffmap, false);

  eventBus.emit('dayStart', { day: 2 });
  const governed = colony.getColony(target.id);
  assert.equal(governed.compliance, state.compliance + 1);
  assert.equal(governed.unrest, state.unrest - 1);

  const saved = colony.getState();
  const restored = createScenario().colony;
  restored.restoreState(saved);
  assert.deepEqual(restored.getColony(target.id), governed);
});

test('legacy off-map colonies remain loadable but cannot become new targets', () => {
  const { colony } = createScenario();
  colony.restoreState({
    occupied: { old_island: { id: 'old_island', name: '旧岛殖民地', legacyOffmap: true, defense: 4 } }
  });
  assert.equal(colony.getColony('old_island').legacyOffmap, true);
  assert.equal(colony.getColonyTargets().some(target => target.id === 'old_island'), false);
});
