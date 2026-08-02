import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { TechSystem } from '../../src/systems/TechSystem.js';
import { CultureSystem } from '../../src/systems/CultureSystem.js';

const root = resolve(import.meta.dirname, '../..');
const content = JSON.parse(readFileSync(resolve(root, 'config/historical_content.json'), 'utf8'));

function setup({ science = 0, civics = 0 } = {}) {
  eventBus.clear();
  configRegistry._configs = {
    historicalContent: content,
    techs: content.techs,
    culture: content.civics,
    doctrines: [],
    enemies: { units: [], formations: [] }
  };
  const era = { getCurrentEra: () => content.eras[0] };
  const buildings = { getWorkforceOutputs: () => ({ science, civics }) };
  const tech = new TechSystem();
  tech.setBuildingSystem(buildings);
  tech.setEraSystem(era);
  tech.init();
  const culture = new CultureSystem();
  culture.setBuildingSystem(buildings);
  culture.setEraSystem(era);
  culture.init();
  return { tech, culture, era };
}

test('zero research workers unlock tree access but produce no science or civic points', () => {
  const { tech, culture } = setup();
  eventBus.emit('tick', {});
  assert.equal(tech.getSciencePoints(), 0);
  assert.equal(culture.getCivicPoints(), 0);
  assert.equal(tech.canStartResearch('tech_ancient_1').valid, false);
  assert.match(tech.canStartResearch('tech_ancient_1').reason, /科技点/);
  assert.equal(culture.canStartResearch('civic_ancient_1').valid, false);
  assert.match(culture.canStartResearch('civic_ancient_1').reason, /人文点/);
});

test('staffed academy and civic hall generate points that pay for current-era research', () => {
  const { tech, culture } = setup({ science: 3, civics: 4 });
  for (let i = 0; i < 4; i++) eventBus.emit('tick', {});
  assert.equal(tech.getSciencePoints(), 12);
  assert.equal(culture.getCivicPoints(), 16);
  assert.equal(tech.startResearch('tech_ancient_1'), true);
  assert.equal(culture.startResearch('civic_ancient_1'), true);
  assert.equal(tech.getSciencePoints(), 0);
  assert.equal(culture.getCivicPoints(), 4);
  for (let i = 0; i < 4; i++) eventBus.emit('tick', {});
  assert.equal(tech.isResearched('tech_ancient_1'), true);
  assert.equal(culture.isResearched('civic_ancient_1'), true);
  assert.equal(tech.getEraProgress('ancient'), 1 / 8);
  assert.equal(culture.getEraProgress('ancient'), 1 / 8);
});

test('future-era research remains locked even when points are abundant', () => {
  const { tech, culture } = setup();
  tech.restoreState({ researched: [], unitResearch: [], sciencePoints: 999 });
  culture.restoreState({ researched: [], civicPoints: 999 });
  assert.equal(tech.canStartResearch('tech_classical_1').valid, false);
  assert.match(tech.canStartResearch('tech_classical_1').reason, /时代/);
  assert.equal(culture.canStartResearch('civic_classical_1').valid, false);
  assert.match(culture.canStartResearch('civic_classical_1').reason, /时代/);
});
