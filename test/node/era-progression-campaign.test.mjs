import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { EraSystem } from '../../src/systems/EraSystem.js';

const root = resolve(import.meta.dirname, '../..');
const progressionPath = resolve(root, 'config/campaign-progression.json');
const content = JSON.parse(readFileSync(resolve(root, 'config/historical_content.json'), 'utf8'));

function createCampaign() {
  assert.ok(existsSync(progressionPath), 'campaign progression config must exist');
  eventBus.clear();
  configRegistry._configs = {
    historicalContent: structuredClone(content),
    campaignProgression: JSON.parse(readFileSync(progressionPath, 'utf8'))
  };
  const research = { tech: [], civic: [] };
  const buildings = { buildings: [] };
  const era = new EraSystem();
  era.setTechSystem({
    getResearched: () => research.tech,
    getEraProgress: eraId => research.tech.filter(id => id.includes(`_${eraId}_`)).length / 8
  });
  era.setCultureSystem({
    getResearched: () => research.civic,
    getEraProgress: eraId => research.civic.filter(id => id.includes(`_${eraId}_`)).length / 8
  });
  assert.equal(typeof era.setBuildingSystem, 'function');
  era.setBuildingSystem(buildings);
  era.initNew();
  return { era, research, buildings };
}

test('normal research and a civilization landmark can advance through every era', () => {
  const { era, research, buildings } = createCampaign();

  for (let eraIndex = 0; eraIndex < content.eras.length; eraIndex += 1) {
    const current = era.getCurrentEra();
    assert.equal(current.id, content.eras[eraIndex].id);
    const civilization = era.getAvailableCivilizations()[0];
    assert.equal(era.selectCivilization(civilization.id).ok, true);

    research.tech = content.techs.filter(node => node.eraId === current.id).slice(0, 6).map(node => node.id);
    research.civic = content.civics.filter(node => node.eraId === current.id).slice(0, 6).map(node => node.id);
    buildings.buildings = [{ buildingId: civilization.uniqueBuilding.id, status: 'active' }];
    era.reconcileProgressionMilestones();

    const stars = era.getEraStars(current.id);
    assert.equal(stars.total, 20, `${current.id}: deterministic milestone total`);
    era.reconcileProgressionMilestones();
    assert.equal(era.getEraStars(current.id).total, 20, `${current.id}: milestones are idempotent`);

    if (eraIndex < content.eras.length - 1) {
      assert.equal(era.canAdvance().ok, true, `${current.id}: campaign is not blocked`);
      assert.equal(era.advanceEra().ok, true);
    } else {
      assert.match(era.canAdvance().reason, /最终时代/);
    }
  }
});

test('milestone award ids survive saving and prevent duplicate stars after restore', () => {
  const source = createCampaign();
  const civ = source.era.getAvailableCivilizations()[0];
  source.era.selectCivilization(civ.id);
  source.research.tech = content.techs.filter(node => node.eraId === 'primitive').slice(0, 6).map(node => node.id);
  source.research.civic = content.civics.filter(node => node.eraId === 'primitive').slice(0, 6).map(node => node.id);
  source.buildings.buildings = [{ buildingId: civ.uniqueBuilding.id, status: 'active' }];
  source.era.reconcileProgressionMilestones();
  const state = source.era.getState();
  assert.ok(state.progressionMilestoneIds.length >= 15);

  const restored = createCampaign();
  restored.research.tech = [...source.research.tech];
  restored.research.civic = [...source.research.civic];
  restored.buildings.buildings = [...source.buildings.buildings];
  restored.era.restoreState(state);
  restored.era.reconcileProgressionMilestones();
  assert.equal(restored.era.getEraStars('primitive').total, 20);
});
