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

test('era system exposes only the eight civilizations of the current era', () => {
  const era = createSystem();
  assert.equal(era.getCurrentEra().id, 'ancient');
  assert.equal(era.getAvailableCivilizations().length, 8);
  assert.ok(era.getAvailableCivilizations().every(civ => civ.eraId === 'ancient'));
  assert.equal(era.selectCivilization('sumer').ok, true);
  assert.equal(era.selectCivilization('old_egypt').ok, false);
});

test('era advancement requires civilization, five stars and seventy percent of both trees', () => {
  const era = createSystem();
  assert.equal(era.canAdvance().ok, false);
  era.selectCivilization('han');
  assert.equal(era.getSelectedCivilization(), null, 'future civilization cannot be selected');
  era.selectCivilization('sumer');
  era.addEraStars('expansion', 4);
  assert.equal(era.canAdvance().ok, false);
  era.addEraStars('science', 1);
  assert.equal(era.canAdvance().ok, true);
  assert.equal(era.advanceEra().ok, true);
  assert.equal(era.getCurrentEra().id, 'classical');
  assert.ok(era.getLegacyCivilizationIds().includes('sumer'));
});

test('insufficient research progress blocks advancement and state restores safely', () => {
  const blocked = createSystem(0.69);
  blocked.selectCivilization('sumer');
  blocked.addEraStars('growth', 10);
  assert.equal(blocked.canAdvance().ok, false);
  assert.match(blocked.canAdvance().reason, /70%/);

  const source = createSystem();
  source.selectCivilization('sumer');
  source.addEraStars('growth', 5);
  source.advanceEra();
  source.selectCivilization('han');
  const restored = createSystem();
  restored.restoreState(source.getState());
  assert.equal(restored.getCurrentEra().id, 'classical');
  assert.equal(restored.getSelectedCivilization().id, 'han');
  assert.deepEqual(restored.getLegacyCivilizationIds(), ['sumer', 'han']);
});
