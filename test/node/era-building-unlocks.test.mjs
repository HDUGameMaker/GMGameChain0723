import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('era advancement exposes the buildings unlocked by the new era, including the classical bridge', async () => {
  const content = JSON.parse(await readFile(new URL('../../config/historical_content.json', import.meta.url), 'utf8'));
  const classicalBuildings = content.buildings.filter(building => building.eraId === 'classical' && !building.civilizationId);
  assert.ok(classicalBuildings.some(building => building.id === 'classical_bridge' || /桥梁/.test(building.name)), 'classical bridge is listed');

  const eraSource = await readFile(new URL('../../src/systems/EraSystem.js', import.meta.url), 'utf8');
  const panelSource = await readFile(new URL('../../src/ui/panels/era-civilization-panel.js', import.meta.url), 'utf8');
  assert.match(eraSource, /getEraUnlockedBuildings/);
  assert.match(eraSource, /unlockedBuildings/);
  assert.match(panelSource, /本时代解锁建筑/);
});
