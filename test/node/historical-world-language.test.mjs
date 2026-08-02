import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configRegistry } from '../../src/core/ConfigRegistry.js';

const root = resolve(import.meta.dirname, '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const load = path => JSON.parse(read(path));

test('active player surfaces present a historical world without magic vocabulary', () => {
  const forbidden = /炼金|法术|药剂|驯养|占有术|占术/;
  for (const path of ['index.html', 'src/ui/PopupManager.js', 'src/ui/panels/objective-panel.js', 'src/ui/panels/strategy-cards-panel.js']) {
    assert.doesNotMatch(read(path), forbidden, path);
  }
  assert.doesNotMatch(read('src/main.js'), /AlchemySystem|SpellSystem|systems\.(alchemy|spell)/);
});

test('runtime building and event catalog excludes retired fantasy content', () => {
  configRegistry._configs = {
    buildings: load('config/buildings.json'),
    eventsBase: load('config/events/events_base.json'),
    eventsExpedition: load('config/events/events_expedition.json'),
    eventsMap: load('config/events/events_map.json'),
    eaIntegration: load('config/ea_integration.json')
  };
  const serialized = JSON.stringify({ buildings: configRegistry.get('buildings'), events: configRegistry.getAllEvents() });
  assert.doesNotMatch(serialized, /炼金|法术|药剂|驯养|占有术|占术|alchemy_lab/);
});
