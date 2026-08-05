import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readJson = async path => JSON.parse(await readFile(new URL(`../../${path}`, import.meta.url), 'utf8'));
const removedIds = new Set(['embassy', 'siege_workshop', 'harbor', 'grand_shipyard', 'lighthouse', 'dock', 'shipyard']);
const forbiddenKeys = ['navalPowerMul', 'navalSpeedMul', 'navalSupply', 'navalTrainingMul', 'navalVisionRadius', 'navalMovementBonus', 'diplomacyMul', 'diplomacyActions', 'relationGainBonus', 'siegePowerMul'];

test('runtime building catalogs contain no naval, siege, or diplomacy buildings', async () => {
  const [historical, ea] = await Promise.all([readJson('config/historical_content.json'), readJson('config/ea_integration.json')]);
  const buildings = [...historical.buildings, ...(ea.buildings || [])];
  assert.equal(buildings.some(building => removedIds.has(building.id)), false);
  assert.equal(buildings.some(building => building.category === 'naval' || building.domain === 'naval'), false);
  assert.equal(buildings.some(building => (building.tags || []).includes('naval_facility')), false);
  for (const building of buildings) {
    const fn = building.uniqueFunction || {};
    assert.equal(forbiddenKeys.some(key => key in fn), false, building.id);
    assert.equal((fn.trainsBranches || []).some(branch => ['navy', 'siege', 'artillery'].includes(branch)), false, building.id);
  }
});

test('knowledge production and permanent global bonuses have construction caps', async () => {
  const historical = await readJson('config/historical_content.json');
  const globalKeys = ['productionMul', 'resourceProductionMul', 'researchSpeedMul', 'sciencePointMul', 'civicPointMul', 'buildSpeedMul', 'buildSpeedMultiplier', 'meleePowerMul', 'armyPowerMul', 'trainingSpeedMul', 'armyCapacityBonus', 'armyCapBonus', 'commandPointsBonus', 'storageMultiplier', 'foodStorageMul', 'territoryUpkeepMul', 'strategyCooldownMul', 'luxuryYieldBonus', 'civilizationYieldMul'];
  for (const building of historical.buildings) {
    const fn = building.uniqueFunction || {};
    if (fn.sciencePerWorker || fn.civicPerWorker) assert.ok(building.maxCount <= 2, building.id);
    if (globalKeys.some(key => key in fn)) assert.equal(building.maxCount, 1, building.id);
  }
});
