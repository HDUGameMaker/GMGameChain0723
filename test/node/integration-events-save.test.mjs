import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { EventSystem } from '../../src/systems/EventSystem.js';

const integration = JSON.parse(await readFile(new URL('../../config/ea_integration.json', import.meta.url), 'utf8'));
const buildings = JSON.parse(await readFile(new URL('../../config/buildings.json', import.meta.url), 'utf8'));
const mainSource = await readFile(new URL('../../src/main.js', import.meta.url), 'utf8');

test('integrated random events span at least eight gameplay categories', () => {
  assert.ok(integration.events.length >= 16);
  assert.ok(new Set(integration.events.map(event => event.category)).size >= 8);
});

test('event resource effects use four resources and building requirements exist after integration', () => {
  const allowed = new Set(['wood', 'stone', 'food', 'gold']);
  const buildingIds = new Set([...buildings, ...integration.buildings].map(building => building.id));
  for (const event of integration.events.filter(item => item.category !== 'alchemy')) {
    for (const buildingId of event.triggerConditions?.requiredBuildings || []) assert.ok(buildingIds.has(buildingId), `${event.id}:${buildingId}`);
    for (const option of event.options || []) {
      for (const effect of option.effects || []) {
        if (effect.resourceId) assert.ok(allowed.has(effect.resourceId), `${event.id}:${effect.resourceId}`);
      }
    }
  }
});

test('event system supports inspiration and fixed-outpost relation effects', () => {
  const system = new EventSystem();
  assert.equal(typeof system._effectHandlers.add_inspiration, 'function');
  assert.equal(typeof system._effectHandlers.modify_outpost_relation, 'function');
});

test('save schema is v7 and persists historical state after SaveManager migration', () => {
  assert.match(mainSource, /rawSave\.version\s*===\s*7/);
  assert.match(mainSource, /version:\s*7/);
  for (const key of ['territory', 'enemyExpansion', 'buildingTech', 'diplomacy', 'heroes', 'era', 'luxuries', 'strategies']) {
    assert.match(mainSource, new RegExp(`${key}:\\s*this\\.systems\\.`));
  }
  assert.doesNotMatch(mainSource, /\b(alchemy|spell):\s*this\.systems\./);
});

test('config registry appends compatible events without replacing main event files', async () => {
  configRegistry._configs.eventsBase = [{ id: 'main_event' }];
  configRegistry._configs.eventsExpedition = [];
  configRegistry._configs.eventsMap = [];
  configRegistry._configs.eaIntegration = integration;
  const ids = configRegistry.getAllEvents().map(event => event.id);
  assert.ok(ids.includes('main_event'));
  assert.ok(ids.includes(integration.events[0].id));
});
