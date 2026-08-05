import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateCombatStrength } from '../../src/domain/CombatStrength.js';

const historical = JSON.parse(await readFile(new URL('../../config/historical_content.json', import.meta.url), 'utf8'));
const familyOf = unit => unit.roleTags?.includes('mounted_ranged')
  ? 'mounted_ranged'
  : unit.branch === 'ranged' || unit.roleTags?.includes('ranged') ? 'ranged' : unit.archetype || 'balanced';

test('civilization units are 50 to 70 percent stronger and use at most three variants per family', () => {
  for (const era of historical.eras) {
    const ordinary = historical.units.filter(unit => unit.eraId === era.id && !unit.civilizationId && !unit.roleTags?.includes('healer'));
    const baseline = ordinary.reduce((sum, unit) => sum + calculateCombatStrength(unit), 0) / ordinary.length;
    const unique = historical.units.filter(unit => unit.eraId === era.id && unit.civilizationId && !unit.roleTags?.includes('healer'));
    assert.ok(unique.length > 0, `${era.id} has civilization units`);
    for (const unit of unique) {
      const ratio = calculateCombatStrength(unit) / baseline;
      assert.ok(ratio >= 1.49 && ratio <= 1.71, `${unit.id} ratio ${ratio.toFixed(3)}`);
      assert.ok(['坚韧型', '强攻型', '精锐型', '骑射型'].includes(unit.balanceVariant), `${unit.id} variant`);
    }
    const families = Map.groupBy(unique, familyOf);
    for (const [family, units] of families) {
      const variants = new Set(units.map(unit => `${unit.hp}/${unit.attack}/${unit.cp || 1}`));
      assert.equal(variants.size, Math.min(3, units.length), `${era.id}/${family} variant count`);
    }
  }
});

test('mounted archers are faster and longer-ranged but frailer and weaker than melee cavalry', () => {
  const horseArcher = historical.units.find(unit => unit.id === 'parthia_unique_unit');
  const meleeCavalry = historical.units.find(unit => unit.id === 'classical_cavalry_4');
  assert.ok(horseArcher.roleTags.includes('mounted_ranged'));
  assert.ok(horseArcher.attackRange > meleeCavalry.attackRange);
  assert.ok(horseArcher.speed > meleeCavalry.speed);
  assert.ok(horseArcher.hp < meleeCavalry.hp);
  assert.ok(horseArcher.attack < meleeCavalry.attack);
});

test('civilization selection exposes unique unit stats and building effects', async () => {
  const source = await readFile(new URL('../../src/ui/panels/era-civilization-panel.js', import.meta.url), 'utf8');
  assert.match(source, /综合强度/);
  assert.match(source, /civilization-unique-unit-stats/);
  assert.match(source, /civilization-unique-building-effects/);
  assert.match(source, /getBuildingPrimaryFunctionRows/);
});
