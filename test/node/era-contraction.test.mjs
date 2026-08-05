import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readJson = async path => JSON.parse(await readFile(new URL(`../../${path}`, import.meta.url), 'utf8'));
const removedEras = new Set(['ancient', 'early_modern']);
const removedMaterials = new Set(['plank', 'cut_stone', 'laminated_timber', 'reinforced_concrete']);

test('historical progression contains only the five retained eras', async () => {
  const content = await readJson('config/historical_content.json');
  assert.deepEqual(content.eras.map(era => era.id), ['primitive', 'classical', 'medieval', 'exploration', 'modern']);
  for (const collection of ['civilizations', 'buildings', 'techs', 'civics', 'units']) {
    assert.equal(content[collection].some(entry => removedEras.has(entry.eraId)), false, collection);
  }
  assert.equal(content.units.some(unit => unit.domain === 'naval' || ['navy', 'siege'].includes(unit.branch)), false);
  assert.equal(content.units.some(unit => (unit.roleTags || []).includes('siege')), false);
});

test('deleted materials are absent and modern army capacity still reaches ten', async () => {
  const [content, resources] = await Promise.all([
    readJson('config/historical_content.json'),
    readJson('config/resources.json')
  ]);
  assert.equal(resources.some(resource => removedMaterials.has(resource.id)), false);
  const serialized = JSON.stringify(content);
  for (const material of removedMaterials) assert.equal(serialized.includes(`\"resourceId\":\"${material}\"`), false);
  const capacityBonus = [...content.techs, ...content.civics]
    .reduce((sum, node) => sum + (node.effects?.armyUnitCapacityBonus || 0), 0);
  assert.equal(5 + capacityBonus, 10);
});
