import { calculateCombatStrength } from './CombatStrength.js';

export function getUnitCompositeStrength(unit = {}) { return calculateCombatStrength(unit); }

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const hash = text => [...String(text)].reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 2166136261);

export function createCityStateDevelopment({ outpost, map, eras = [], buildings = [], units = [], luxuries = [], playerEraOrder = 0, settings = {} }) {
  const spawn = map?.initialBuildings?.[0] || { gridX: Math.floor((map?.gridWidth || 1) / 2), gridY: Math.floor((map?.gridHeight || 1) / 2) };
  const maxDistance = Math.max(1, (map?.gridWidth || 1) + (map?.gridHeight || 1));
  const distance = Math.abs(outpost.gridX - spawn.gridX) + Math.abs(outpost.gridY - spawn.gridY);
  const maxLevel = Math.max(1, Math.floor(Number(settings.maxLevel) || 5));
  const distanceRatio = clamp(distance / (maxDistance * 0.55), 0, 1);
  const level = clamp(1 + Math.floor(distanceRatio * maxLevel) + Math.max(0, Math.floor(Number(settings.levelBonus) || 0)), 1, maxLevel);
  const advanced = level >= Math.max(2, Math.ceil(maxLevel * 0.75));
  const eraOrder = clamp(playerEraOrder + (advanced ? 1 : 0), 0, Math.max(0, eras.length - 1));
  const era = eras.find(item => item.order === eraOrder) || eras[eraOrder] || eras[0] || { id: 'primitive', order: 0 };
  const t = maxLevel <= 1 ? 0 : (level - 1) / (maxLevel - 1);
  const area = Math.round((Number(settings.minArea) || 36) + ((Number(settings.maxArea) || 144) - (Number(settings.minArea) || 36)) * t);
  const eraMultiplier = Math.pow(Math.max(1, Number(settings.eraStrengthMultiplier) || 2.5), eraOrder);
  const targetStrength = Math.round(((Number(settings.minEnemyStrength) || 20) + ((Number(settings.maxEnemyStrength) || 180) - (Number(settings.minEnemyStrength) || 20)) * t) * eraMultiplier);
  const eraBuildings = buildings.filter(item => !item.eraId || (eras.find(e => e.id === item.eraId)?.order ?? 0) <= eraOrder);
  const military = eraBuildings.filter(item => item.tags?.some(tag => ['military', 'fortification', 'training'].includes(tag)) || ['military', 'defense'].includes(item.category));
  const ordinary = eraBuildings.filter(item => !military.includes(item));
  const buildingCount = Math.max(3, Math.round(3 + t * 14));
  const buildingIds = ['headquarters', ...Array(10).fill('wall')];
  const pool = [...military, ...ordinary];
  const largeBuilding = pool.find(item => (Number(item.footprint?.width) || 1) > 1 || (Number(item.footprint?.height) || 1) > 1);
  if (largeBuilding) buildingIds.push(largeBuilding.id);
  for (let i = 0; i < buildingCount && pool.length; i += 1) buildingIds.push(pool[(hash(outpost.id) + i * 7) % pool.length].id);
  const eraUnits = units.filter(item => !item.eraId || (eras.find(e => e.id === item.eraId)?.order ?? 0) === eraOrder);
  const fallbackUnits = units.filter(item => !item.eraId || (eras.find(e => e.id === item.eraId)?.order ?? 0) <= eraOrder);
  const unitPool = eraUnits.length ? eraUnits : fallbackUnits;
  const armyUnits = [];
  let strength = 0;
  for (let i = 0; unitPool.length && strength < targetStrength && i < 200; i += 1) {
    const unit = unitPool[(hash(outpost.id) + i) % unitPool.length];
    armyUnits.push(unit.id);
    strength += Math.max(1, getUnitCompositeStrength(unit));
  }
  if (unitPool.length === 0) strength = targetStrength;
  const armyCount = Math.max(2, Math.round(2 + t * 6));
  const armyGroups = Array.from({ length: armyCount }, () => []);
  armyUnits.forEach((unitId, index) => armyGroups[index % armyCount].push(unitId));
  // Level 2+ settlements always protect at least one luxury deposit.
  const luxuryCount = level >= 2 ? Math.max(1, Math.round(1 + t * 4)) : 0;
  const luxuryDeposits = Array.from({ length: luxuryCount }, (_, index) => ({
    id: `${outpost.id}_luxury_${index + 1}`,
    luxuryId: luxuries[(hash(outpost.id) + index) % Math.max(1, luxuries.length)]?.id || 'luxury',
    locked: true,
    capacity: 2,
    remaining: 2,
    depletesPermanently: true
  }));
  return {
    level, distance, eraId: era.id, eraOrder, area, targetStrength,
    compositeStrength: Math.round(strength * 100) / 100,
    maxHp: Math.max(1, Math.round(strength)), hp: Math.max(1, Math.round(strength)),
    buildings: buildingIds.map((buildingId, index) => ({
      id: `${outpost.id}_building_${index}`, buildingId,
      headquarters: index === 0, defensive: buildingId === 'wall',
      width: index === 0 ? 2 : 1, height: index === 0 ? 2 : 1
    })),
    armies: armyGroups.map((unitIds, index) => ({
      id: `${outpost.id}_army_${index + 1}`,
      unitIds,
      compositeStrength: Math.round((strength / armyCount) * 100) / 100
    })),
    luxuryDeposits,
    headquartersDestroyed: false,
    aggression: clamp((Number(settings.baseAggression) || 0.05) + playerEraOrder * (Number(settings.aggressionPerEra) || 0.08) + level * 0.02, 0, 0.95)
  };
}
