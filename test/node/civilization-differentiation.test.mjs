import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { EraSystem } from '../../src/systems/EraSystem.js';
import { BuildingSystem } from '../../src/systems/BuildingSystem.js';

const root = resolve(import.meta.dirname, '../..');
const historicalContent = JSON.parse(readFileSync(resolve(root, 'config/historical_content.json'), 'utf8'));

function createEra(eraIndex, civilizationId) {
  configRegistry._configs = {
    historicalContent,
    buildings: historicalContent.buildings,
    techs: historicalContent.techs,
    culture: historicalContent.civics,
    map: { gridWidth: 4, gridHeight: 4, grid: ['GGGG', 'GGGG', 'GGGG', 'GGGG'], groundTypes: { G: { name: '草地', buildable: true } }, eventMarkers: [] },
    adjacency_bonuses: []
  };
  const era = new EraSystem();
  era.initNew();
  era.restoreState({
    currentEraIndex: eraIndex,
    selectedByEra: { [historicalContent.eras[eraIndex].id]: civilizationId },
    legacyCivilizationIds: [civilizationId],
    starsByEra: {}
  });
  return era;
}

test('every civilization supplies gameplay replacements, a personality and a constructible unique building', () => {
  assert.equal(historicalContent.buildings.filter(building => building.civilizationId).length, 57);
  assert.equal(new Set(historicalContent.civilizations.map(civilization => JSON.stringify(civilization.trait.effects))).size, 57,
    'every civilization should have a numerically distinct gameplay trait');
  for (const civilization of historicalContent.civilizations) {
    assert.ok(civilization.technologyReplacement?.replaces, `${civilization.id} technology replacement`);
    assert.ok(civilization.civicReplacement?.replaces, `${civilization.id} civic replacement`);
    assert.ok(civilization.diplomaticPersonality, `${civilization.id} diplomatic personality`);
    const building = historicalContent.buildings.find(item => item.id === civilization.uniqueBuilding.id);
    assert.ok(building, `${civilization.id} unique building config`);
    assert.equal(building.civilizationId, civilization.id);
    assert.ok(building.unlockConditions.some(condition => condition.type === 'civilization' && condition.civilizationId === civilization.id));
  }
});

test('selected civilization replaces names and effects without changing research node ids', () => {
  const era = createEra(1, 'zhou');
  const baseTech = historicalContent.techs.find(node => node.id === 'tech_ancient_1');
  const baseCivic = historicalContent.civics.find(node => node.id === 'civic_ancient_4');
  const tech = era.getEffectiveResearchNode('tech', baseTech);
  const civic = era.getEffectiveResearchNode('civic', baseCivic);
  assert.equal(tech.id, baseTech.id);
  assert.notEqual(tech.name, baseTech.name);
  assert.equal(tech.civilizationId, 'zhou');
  assert.equal(civic.id, baseCivic.id);
  assert.notEqual(civic.name, baseCivic.name);
  assert.equal(civic.civilizationId, 'zhou');
});

test('only the selected civilization can unlock its unique building', () => {
  const era = createEra(1, 'zhou');
  const buildings = new BuildingSystem();
  buildings.setEraSystem(era);
  buildings.init();
  assert.equal(buildings.isUnlocked('zhou_unique_building'), true);
  assert.equal(buildings.isUnlocked('assyria_unique_building'), false);
  assert.equal(buildings.canPlaceAt(0, 0, 'assyria_unique_building').valid, false);
  assert.match(buildings.getUnlockConditions('assyria_unique_building')[0].desc, /亚述/);
});
