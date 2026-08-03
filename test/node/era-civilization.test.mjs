import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';

const root = resolve(import.meta.dirname, '../..');
const content = JSON.parse(readFileSync(resolve(root, 'config/historical_content.json'), 'utf8'));
const module = await import('../../src/systems/EraSystem.js').catch(() => ({}));

function createSystem(progress = 0.75) {
  assert.equal(typeof module.EraSystem, 'function');
  eventBus.clear();
  configRegistry._configs = { historicalContent: content };
  const era = new module.EraSystem();
  era.setTechSystem({ getEraProgress: () => progress });
  era.setCultureSystem({ getEraProgress: () => progress });
  era.initNew();
  return era;
}

test('era system starts with the single original civilization', () => {
  const era = createSystem();
  assert.equal(era.getCurrentEra().id, 'primitive');
  assert.equal(era.getAvailableCivilizations().length, 1);
  assert.ok(era.getAvailableCivilizations().every(civ => civ.eraId === 'primitive'));
  assert.equal(era.selectCivilization('proto_civilization').ok, true);
  assert.equal(era.selectCivilization('zhou').ok, false);
});

test('era advancement converts civilization and tree milestones into the required stars', () => {
  const era = createSystem();
  assert.equal(era.canAdvance().ok, false);
  era.selectCivilization('zhou');
  assert.equal(era.getSelectedCivilization(), null, 'future civilization cannot be selected');
  era.selectCivilization('proto_civilization');
  assert.equal(era.getEraStars().total, 5);
  assert.equal(era.canAdvance().ok, true);
  assert.equal(era.advanceEra().ok, true);
  assert.equal(era.getCurrentEra().id, 'ancient');
  assert.ok(era.getLegacyCivilizationIds().includes('proto_civilization'));
});

test('insufficient research progress blocks advancement and state restores safely', () => {
  const blocked = createSystem(0.69);
  blocked.selectCivilization('proto_civilization');
  blocked.addEraStars('growth', 10);
  assert.equal(blocked.canAdvance().ok, false);
  assert.match(blocked.canAdvance().reason, /70%/);

  const source = createSystem();
  source.selectCivilization('proto_civilization');
  source.addEraStars('growth', 5);
  source.advanceEra();
  source.selectCivilization('zhou');
  const restored = createSystem();
  restored.restoreState(source.getState());
  assert.equal(restored.getCurrentEra().id, 'ancient');
  assert.equal(restored.getSelectedCivilization().id, 'zhou');
  assert.deepEqual(restored.getLegacyCivilizationIds(), ['proto_civilization', 'zhou']);
});

test('era guidance exposes every advancement requirement and its live progress', () => {
  const era = createSystem(0.69);
  assert.equal(typeof era.getAdvancementRequirements, 'function');
  const guidance = era.getAdvancementRequirements();
  assert.equal(guidance.nextEra.id, 'ancient');
  assert.deepEqual(guidance.requirements.map(item => item.id), [
    'civilization', 'technology', 'civics', 'stars'
  ]);
  assert.deepEqual(guidance.requirements.map(item => item.complete), [false, false, false, false]);
  assert.equal(guidance.requirements[1].current, 0.69);
  assert.equal(guidance.requirements[1].required, 0.7);
  assert.equal(guidance.requirements[3].current, 0);
  assert.equal(guidance.requirements[3].required, 5);
  assert.deepEqual(guidance.starSources.map(source => source.amount), [1, 1, 1, 2, 2, 3]);
});
