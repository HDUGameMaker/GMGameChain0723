import { calculateCombatStrength } from './CombatStrength.js';
import { makePowerScaleBuff, applyEnemyBuffs } from './EnemyBuffs.js';

export function getUnitCompositeStrength(unit = {}) { return calculateCombatStrength(unit); }

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const hash = text => [...String(text)].reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 2166136261);

export function createCityStateDevelopment({ outpost, map, eras = [], buildings = [], units = [], luxuries = [], playerEraOrder = 0, settings = {}, playerPowerBase = 0 }) {
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
  // R3b: 守军强度 = 玩家战力基准 × 距离系数,保留"越远越强"但被玩家锚定。
  // 玩家战力为 0(未传入/无军队)时回退到 minEnemyStrength,时代保底由调用方传入。
  const garrisonBaseFactor = Number(settings.garrisonPowerBase) || 0.5;
  const garrisonPerLevel = Number(settings.garrisonPowerPerLevel) || 0.15;
  const garrisonTarget = Math.max(1, Math.round(
    (Number(playerPowerBase) || Number(settings.minEnemyStrength) || 200)
    * (garrisonBaseFactor + level * garrisonPerLevel)
  ));
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
  // R3b: 每队 1 个基础单位 + power_scale 加成(加成可 < 1,玩家弱时敌人弱于配置)。
  // 基础数值保留在 enemies.json,实例只存 buffs 与叠加后的 hp/maxHp/attack。
  const armyCount = Math.max(2, Math.round(2 + t * 6));
  const perArmyTarget = garrisonTarget / armyCount;
  const armies = Array.from({ length: armyCount }, (_, index) => {
    const unit = unitPool[(hash(outpost.id) + index) % Math.max(1, unitPool.length)];
    const baseMaxHp = Math.max(1, Number(unit?.maxHp ?? unit?.hp) || 1);
    const baseAttack = Math.max(0, Number(unit?.attack) || 0);
    const buffs = [makePowerScaleBuff(perArmyTarget, unit, settings.powerScaleMin)];
    const applied = applyEnemyBuffs({ maxHp: baseMaxHp, hp: baseMaxHp, attack: baseAttack }, buffs);
    const compositeStrength = Math.round(calculateCombatStrength({
      ...unit, maxHp: applied.maxHp, hp: applied.maxHp, attack: applied.attack
    }) * 100) / 100;
    return {
      id: `${outpost.id}_army_${index + 1}`,
      unitIds: unit ? [unit.id] : [],
      buffs,
      baseHp: baseMaxHp,
      baseAttack,
      hp: applied.hp,
      maxHp: applied.maxHp,
      attack: applied.attack,
      compositeStrength
    };
  });
  const strength = armies.reduce((sum, army) => sum + army.compositeStrength, 0);
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
    level, distance, eraId: era.id, eraOrder, area, targetStrength: garrisonTarget,
    compositeStrength: Math.round(strength * 100) / 100,
    maxHp: Math.max(1, Math.round(strength)), hp: Math.max(1, Math.round(strength)),
    buildings: buildingIds.map((buildingId, index) => ({
      id: `${outpost.id}_building_${index}`, buildingId,
      headquarters: index === 0, defensive: buildingId === 'wall',
      width: index === 0 ? 2 : 1, height: index === 0 ? 2 : 1
    })),
    armies,
    luxuryDeposits,
    headquartersDestroyed: false,
    aggression: clamp((Number(settings.baseAggression) || 0.05) + playerEraOrder * (Number(settings.aggressionPerEra) || 0.08) + level * 0.02, 0, 0.95)
  };
}
