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

function createSystems(outputs = { science: 0, civics: 0 }) {
  eventBus.clear();
  configRegistry._configs = {
    historicalContent: content,
    techs: content.techs,
    culture: content.civics,
    doctrines: [],
    enemies: { units: [], formations: [] }
  };
  const era = { getCurrentEra: () => content.eras[0] };
  const buildings = { getWorkforceOutputs: () => outputs };
  const tech = new TechSystem();
  tech.setBuildingSystem(buildings);
  tech.setEraSystem(era);
  tech.init();
  const culture = new CultureSystem();
  culture.setBuildingSystem(buildings);
  culture.setEraSystem(era);
  culture.init();
  return { tech, culture };
}

test('settlements always produce a small passive amount of science and civics', () => {
  const { tech, culture } = createSystems();
  assert.equal(tech.getPassiveRate(), 0.2);
  assert.equal(culture.getPassiveRate(), 0.2);

  eventBus.emit('tick', {});
  assert.equal(tech.getSciencePoints(), 0.2);
  assert.equal(culture.getCivicPoints(), 0.2);
});

test('staffed research buildings add their output on top of passive growth', () => {
  const { tech, culture } = createSystems({ science: 3, civics: 4 });
  eventBus.emit('tick', {});
  assert.equal(tech.getSciencePoints(), 3.2);
  assert.equal(culture.getCivicPoints(), 4.2);

  for (let index = 0; index < 4; index += 1) eventBus.emit('tick', {});
  assert.equal(tech.getSciencePoints(), 16);
  assert.equal(culture.getCivicPoints(), 21);
});

test('researched historical nodes expose metadata and apply real runtime effects or unlocks', () => {
  const { tech, culture } = createSystems();
  for (const node of [...content.techs, ...content.civics]) {
    assert.ok(node.description?.length > 8, `${node.id} description`);
    assert.ok(node.history?.length > 8, `${node.id} history`);
    assert.ok(node.icon, `${node.id} icon`);
    assert.ok(Object.keys(node.effects || {}).length > 0, `${node.id} effects`);
    assert.ok(Object.keys(node.unlocks || {}).length > 0, `${node.id} unlocks`);
  }

  tech.restoreState({ researched: ['tech_ancient_1'], unitResearch: [], sciencePoints: 0 });
  culture.restoreState({ researched: ['civic_ancient_1'], civicPoints: 0 });
  assert.equal(tech.getEffects().productionMul, 1.01);
  assert.equal(culture.getEffects().satisfactionBonus, 1);
  assert.ok(culture.getUnlockedDiplomacyActions().includes('negotiate'));
});
