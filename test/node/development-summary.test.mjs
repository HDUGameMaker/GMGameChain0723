import assert from 'node:assert/strict';
import test from 'node:test';

import { getDevelopmentSummary } from '../../src/domain/DevelopmentSummary.js';

test('development summary reports identity, population and final multipliers', () => {
  const summary = getDevelopmentSummary({
    era: {
      getCurrentEra: () => ({ name: '古典时代' }),
      getSelectedCivilization: () => ({ name: '罗马' }),
      getBonuses: () => ({ civicPointMul: 1.1 })
    },
    population: { current: 24, getPopulationStats: () => ({ total: 24, housing: 30 }) },
    building: { getProductionMultiplier: id => id === 'wood' ? 1.5 : 1.2 },
    culture: { getEffects: () => ({ researchSpeedMul: 1.25, growthMul: 1.1, foodConsumeMul: 0.9, buildCostMul: 0.8 }) },
    hero: { getBonuses: () => ({ researchSpeedMul: 1.2, buildCostMul: 0.9 }) },
    luxury: { getBonuses: () => ({ civicPointMul: 1.05 }) },
    army: { getArmyStatMultipliers: () => ({ attack: 1.3, hp: 1.4 }) }
  });

  assert.equal(summary.eraName, '古典时代');
  assert.equal(summary.civilizationName, '罗马');
  assert.equal(summary.population, 24);
  assert.equal(summary.housing, 30);
  assert.equal(summary.multipliers.find(item => item.id === 'production_wood').value, 1.5);
  assert.equal(summary.multipliers.find(item => item.id === 'research').value, 1.5);
  assert.equal(summary.multipliers.find(item => item.id === 'army_attack').value, 1.3);
  assert.equal(summary.multipliers.find(item => item.id === 'army_hp').value, 1.4);
  assert.ok(Math.abs(summary.multipliers.find(item => item.id === 'build_cost').value - 0.72) < 1e-10);
  assert.ok(summary.multipliers.some(item => item.id === 'science'));
  assert.ok(summary.multipliers.some(item => item.id === 'army_speed'));
  assert.ok(summary.metrics.some(item => item.id === 'unit_capacity'));
});

test('main HUD exposes the development details entry', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const hud = await readFile(new URL('../../src/ui/HUD.js', import.meta.url), 'utf8');
  const popup = await readFile(new URL('../../src/ui/PopupManager.js', import.meta.url), 'utf8');
  assert.match(html, /id="btn-development-details"/);
  assert.match(hud, /open\('development_details'/);
  assert.match(popup, /development-details-panel\.js/);
});
