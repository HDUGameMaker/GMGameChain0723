/**
 * BonusUtils - shared helpers for additive and multiplicative bonuses.
 */
import { configRegistry } from '../core/ConfigRegistry.js';

export const BONUS_ALL = '_all';

export function getBonusTargetKey(resourceId) {
  return resourceId || BONUS_ALL;
}

export function addFlatBonus(bucket, resourceId, value) {
  const key = getBonusTargetKey(resourceId);
  bucket[key] = (bucket[key] || 0) + (value || 0);
}

export function addMultiplierBonus(bucket, resourceId, multiplier) {
  const key = getBonusTargetKey(resourceId);
  bucket[key] = (bucket[key] || 0) + ((multiplier || 1) - 1);
}

export function getScopedBonus(bucket, resourceId) {
  if (!bucket) return 0;
  return (bucket[BONUS_ALL] || 0) + (bucket[resourceId] || 0);
}

export function applyFlatAndMultiplier(baseAmount, resourceId, multipliers, flatBonuses) {
  const multiplier = 1 + getScopedBonus(multipliers, resourceId);
  const flat = getScopedBonus(flatBonuses, resourceId);
  return baseAmount * multiplier + flat;
}

export function collectExpeditionBonuses(items = [], options = {}) {
  const bonuses = {
    backpackCapacityBonus: 0,
    resourceCapacityBonus: 0,
    yieldMultipliers: {},
    yieldFlatBonuses: {}
  };
  const regionId = options.regionId || null;

  for (const item of items) {
    for (const effect of (item.expeditionEffects || [])) {
      if (regionId && Array.isArray(effect.regions) && effect.regions.length > 0 && !effect.regions.includes(regionId)) {
        continue;
      }
      switch (effect.type) {
        case 'backpack_capacity_bonus':
          bonuses.backpackCapacityBonus += effect.value || 0;
          break;
        case 'resource_capacity_bonus':
          bonuses.resourceCapacityBonus += effect.value || 0;
          break;
        case 'yield_multiplier':
          addMultiplierBonus(bonuses.yieldMultipliers, effect.resourceId, effect.value);
          break;
        case 'yield_flat_bonus':
          addFlatBonus(bonuses.yieldFlatBonuses, effect.resourceId, effect.value);
          break;
        default:
          break;
      }
    }
  }

  return bonuses;
}

export function mergeModifierTree(target, source, schema = {}) {
  if (!source) return target;
  for (const [category, mods] of Object.entries(source)) {
    if (!mods || typeof mods !== 'object') continue;
    if (!target[category]) target[category] = {};
    for (const [key, value] of Object.entries(mods)) {
      mergeModifierValue(target[category], key, value, schema[key]);
    }
  }
  return target;
}

export function mergeModifierValue(target, key, value, mode = 'mul') {
  if (typeof value === 'boolean') {
    target[key] = target[key] || value;
    return;
  }
  if (mode === 'add') {
    target[key] = (target[key] || 0) + (value || 0);
  } else {
    target[key] = (target[key] || 1) * (value || 1);
  }
}

export function getResourceName(resourceId) {
  if (resourceId === 'inspiration' || resourceId === 'icon_inspiration') return '灵感';
  if (resourceId === 'all' || resourceId === BONUS_ALL) return '全部产出';
  const cfg = configRegistry.getResource(resourceId);
  return cfg ? cfg.name : resourceId;
}

export function formatBonusEffect(rule) {
  const target = rule.applyTo === 'all' ? '全部产出' : getResourceName(rule.applyTo);
  const field = rule.applyToField === 'production'
    ? target
    : (rule.applyToField || '产出');
  if (rule.effectType === 'multiplier') {
    return `${field} ×${rule.effectValue}`;
  }
  return `${field} ${rule.effectValue >= 0 ? '+' : ''}${rule.effectValue}`;
}
