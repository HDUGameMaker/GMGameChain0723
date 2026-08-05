import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { ResourceSystem } from '../../src/systems/ResourceSystem.js';

test('era material cheat fills raw materials and unlocked processed tiers only', () => {
  configRegistry._configs = {
    resources: [
      { id: 'wood', initial: 0, max: 100 },
      { id: 'stone', initial: 0, max: 100 },
      { id: 'food', initial: 0, max: 100 },
      { id: 'classical_wood', initial: 0, max: 80, processed: true, unlockEraId: 'classical' },
      { id: 'medieval_wood', initial: 0, max: 60, processed: true, unlockEraId: 'medieval' },
      { id: 'modern_wood', initial: 0, max: 40, processed: true, unlockEraId: 'modern' }
    ],
    historicalContent: { eras: [
      { id: 'primitive', order: 0 }, { id: 'classical', order: 1 }, { id: 'medieval', order: 2 }, { id: 'modern', order: 3 }
    ] }
  };
  const resources = new ResourceSystem();
  resources.initFromConfig();
  const filled = resources.fillEraMaterialsToCapacity('medieval');
  assert.deepEqual(filled, ['wood', 'stone', 'classical_wood', 'medieval_wood']);
  assert.equal(resources.getAmount('wood'), 100);
  assert.equal(resources.getAmount('medieval_wood'), 60);
  assert.equal(resources.getAmount('modern_wood'), 0);
  assert.equal(resources.getAmount('food'), 0);
});

test('strategy runtime, button, buildings and event rewards are removed', async () => {
  const [main, hud, popup, html, buildings, historical, events] = await Promise.all([
    readFile(new URL('../../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../../src/ui/HUD.js', import.meta.url), 'utf8'),
    readFile(new URL('../../src/ui/PopupManager.js', import.meta.url), 'utf8'),
    readFile(new URL('../../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../../config/buildings.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../../config/historical_content.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../../config/events/events_historical.json', import.meta.url), 'utf8').then(JSON.parse)
  ]);
  assert.doesNotMatch(main, /StrategySystem|systems\.strategy/);
  assert.doesNotMatch(hud, /btnStrategy|strategy_cards/);
  assert.doesNotMatch(popup, /strategy_cards/);
  assert.doesNotMatch(html, /btn-strategy/);
  assert.equal(buildings.some(building => ['strategy_archive', 'strategy_office'].includes(building.id)), false);
  assert.equal('strategies' in historical, false);
  assert.doesNotMatch(JSON.stringify(events), /add_strategy_card/);
});

test('construction cards show finite building count limits before construction', async () => {
  const source = await readFile(new URL('../../src/ui/panels/building-select-panel.js', import.meta.url), 'utf8');
  assert.match(source, /建造数量 \$\{buildingSystem\.getBuildingCount\(b\.id\)\}\/\$\{b\.maxCount\}/);
});
