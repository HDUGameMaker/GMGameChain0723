import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { EventSystem } from '../../src/systems/EventSystem.js';
import { store } from '../../src/core/Store.js';

const root = resolve(import.meta.dirname, '../..');
const load = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const events = load('config/events/events_historical.json');

test('historical random event pack has forty-two era-aware events across twelve categories', () => {
  assert.equal(events.length, 42);
  assert.ok(new Set(events.map(event => event.category)).size >= 12);
  assert.ok(events.every(event => event.icon && event.options?.length >= 2));
  assert.ok(events.every(event => event.triggerConditions?.eraIds?.length === 1));
  const allowed = new Set(['wood', 'stone', 'food', 'gold']);
  for (const event of events) for (const option of event.options) for (const effect of option.effects || []) {
    if (effect.resourceId) assert.ok(allowed.has(effect.resourceId), `${event.id}:${effect.resourceId}`);
  }
});

test('event system gates historical events by era and supports luxury, strategy and civic effects', () => {
  configRegistry._configs = { eventsHistorical: events };
  store.setState({ timeDay: 100 });
  const system = new EventSystem();
  system.setSystems({ era: { getCurrentEra: () => ({ id: 'medieval' }) } });
  const medieval = events.find(event => event.triggerConditions.eraIds.includes('medieval'));
  const modern = events.find(event => event.triggerConditions.eraIds.includes('modern'));
  assert.equal(system._checkTriggerConditions(medieval, 'morning'), true);
  assert.equal(system._checkTriggerConditions(modern, 'morning'), false);
  for (const type of ['add_luxury', 'add_strategy_card', 'modify_satisfaction', 'add_science', 'add_civic']) {
    assert.equal(typeof system._effectHandlers[type], 'function', type);
  }
});

test('config registry appends historical events without replacing base events', () => {
  configRegistry._configs = {
    eventsBase: [{ id: 'base' }], eventsExpedition: [], eventsMap: [],
    eaIntegration: { events: [] }, eventsHistorical: events
  };
  const ids = configRegistry.getAllEvents().map(event => event.id);
  assert.ok(ids.includes('base'));
  assert.ok(ids.includes(events[0].id));
});
