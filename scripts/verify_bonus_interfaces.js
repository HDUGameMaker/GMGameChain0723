const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

function asSet(items, key = 'id') {
  return new Set((items || []).map(item => item && item[key]).filter(Boolean));
}

function main() {
  const buildings = readJson('config/buildings.json');
  const resources = readJson('config/resources.json');
  const items = readJson('config/items.json');
  const regions = readJson('config/expeditions/regions.json');
  const adjacency = readJson('config/adjacency-bonuses.json');
  const alchemy = readJson('config/alchemy.json');
  const enemies = readJson('config/enemies.json');

  const buildingIds = asSet(buildings);
  const resourceIds = asSet(resources);
  const regionIds = asSet(regions);
  const unitIds = asSet(enemies.units || []);
  const errors = [];

  const fail = (scope, msg) => errors.push(`[${scope}] ${msg}`);

  for (const rule of adjacency) {
    const scope = `adjacency:${rule.id || '(missing id)'}`;
    if (!buildingIds.has(rule.sourceBuildingId)) fail(scope, `unknown sourceBuildingId ${rule.sourceBuildingId}`);
    if (!buildingIds.has(rule.targetBuildingId)) fail(scope, `unknown targetBuildingId ${rule.targetBuildingId}`);
    if (!['flat', 'multiplier'].includes(rule.effectType)) fail(scope, `unknown effectType ${rule.effectType}`);
    if (typeof rule.effectValue !== 'number') fail(scope, 'effectValue must be number');
    if (!['production', 'foodCapacity', 'housingCapacity'].includes(rule.applyToField)) {
      fail(scope, `unknown applyToField ${rule.applyToField}`);
    }
    if (rule.applyTo !== 'all' && !resourceIds.has(rule.applyTo)) fail(scope, `unknown applyTo ${rule.applyTo}`);
  }

  const expeditionEffectTypes = new Set([
    'backpack_capacity_bonus',
    'resource_capacity_bonus',
    'yield_multiplier',
    'yield_flat_bonus'
  ]);
  for (const item of items) {
    for (const effect of (item.expeditionEffects || [])) {
      const scope = `item:${item.id}`;
      if (!expeditionEffectTypes.has(effect.type)) fail(scope, `unknown expedition effect ${effect.type}`);
      if (typeof effect.value !== 'number') fail(scope, `${effect.type} value must be number`);
      if (effect.resourceId && !resourceIds.has(effect.resourceId)) fail(scope, `unknown resourceId ${effect.resourceId}`);
      for (const regionId of (effect.regions || [])) {
        if (!regionIds.has(regionId)) fail(scope, `unknown region ${regionId}`);
      }
    }
  }

  for (const effect of (alchemy.effects || [])) {
    const scope = `alchemy:${effect.id}`;
    if (effect.modifiers && typeof effect.modifiers !== 'object') fail(scope, 'modifiers must be object');
  }

  for (const formation of (enemies.formations || [])) {
    const scope = `formation:${formation.id}`;
    for (const req of (formation.requiredUnits || [])) {
      if (req.unitId && !unitIds.has(req.unitId)) fail(scope, `unknown unitId ${req.unitId}`);
      if (typeof req.count !== 'number' || req.count <= 0) fail(scope, 'requiredUnits count must be positive number');
    }
  }

  if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log('bonus interfaces ok');
}

main();
