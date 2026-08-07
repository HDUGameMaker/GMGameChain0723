const RESOURCE_NAMES = { wood: '木材', stone: '石料', food: '食物', gold: '黄金' };
const STATUS_NAMES = { active: '运行中', constructing: '建造中', disabled: '停用', damaged: '受损' };
export const ROCKY_DIRT_BASE_COLOR = 0xc9ad7c;
export const MOUNTAIN_ROCK_TEXTURES = Array.from(
  { length: 6 },
  (_, index) => `assets/map/mountains/mountain_${String(index + 1).padStart(2, '0')}.png`
);
export const MOUNTAIN_RUBBLE_TEXTURES = Array.from(
  { length: 3 },
  (_, index) => `assets/map/mountains/stone_cluster_${String(index + 1).padStart(2, '0')}.png`
);

function coordinateHash(col, row, salt = 0) {
  let value = (Math.imul(col + 17, 374761393) + Math.imul(row + 31, 668265263) + Math.imul(salt + 1, 1442695041)) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function parseHexColor(colorHint, fallback = 0x333333) {
  if (typeof colorHint !== 'string' || !/^#[0-9a-f]{6}$/i.test(colorHint)) return fallback;
  return Number.parseInt(colorHint.slice(1), 16);
}

export function getTerrainFillColor(mapConfig, col, row) {
  const grid = mapConfig?.grid || [];
  const code = grid[row]?.[col];
  const groundType = mapConfig?.groundTypes?.[code];
  if (code === 'R' || code === 'M' || code === 'B') return ROCKY_DIRT_BASE_COLOR;
  return parseHexColor(groundType?.colorHint);
}

export function getResourceNodeGroundStyle(node, definition = {}, fogState = 'visible') {
  const memoryAlpha = fogState === 'remembered' ? 0.42 : 1;
  if (node?.type === 'stone') {
    return {
      color: ROCKY_DIRT_BASE_COLOR,
      fillAlpha: (node.developedByBuildingId ? 0.5 : 0.96) * memoryAlpha,
      strokeColor: 0xe8d4aa,
      strokeAlpha: 0.95 * memoryAlpha,
      shape: 'square'
    };
  }
  if (node?.type === 'luxury') {
    return {
      color: 0x3e294b,
      fillAlpha: (node.developedByBuildingId ? 0.52 : 0.94) * memoryAlpha,
      strokeColor: 0xd6a84b,
      strokeAlpha: 1 * memoryAlpha,
      shape: 'square'
    };
  }
  return {
    color: parseHexColor(definition.color, 0xd8c787),
    fillAlpha: (node?.developedByBuildingId ? 0.35 : 0.76) * memoryAlpha,
    strokeColor: 0xf6e7b0,
    strokeAlpha: 0.9 * memoryAlpha,
    shape: 'badge'
  };
}

export function getResourceNodeArtPath(node, definition = {}, luxury = null) {
  const luxuryId = String(node?.luxuryId || luxury?.id || '');
  if (node?.type === 'luxury' && /^[a-z0-9_]+$/i.test(luxuryId)) {
    return `assets/resource-nodes/luxuries/${luxuryId}.png`;
  }
  if (node?.type === 'stone') return 'assets/resource-nodes/stone-deposit.svg';
  return definition.mapArt || luxury?.icon || '';
}

export function getTerrainPropDepth(row, kind = 'terrain') {
  const safeRow = Number.isFinite(row) ? Math.max(0, Math.trunc(row)) : 0;
  const offset = kind === 'rubble' ? 20 : kind === 'mountain' ? 40 : 60;
  return safeRow * 100 + offset;
}

export function getMountainRockSpriteModel(mapConfig, col, row, tileSize = 60) {
  const code = mapConfig?.grid?.[row]?.[col];
  if ((code !== 'M' && code !== 'B') || !Number.isFinite(tileSize) || tileSize <= 0) return null;

  const ridge = code === 'M';
  const size = Math.max(8, Math.round(tileSize * (ridge ? 1.48 : 1.26)));
  return {
    texture: MOUNTAIN_ROCK_TEXTURES[coordinateHash(col, row, 0) % MOUNTAIN_ROCK_TEXTURES.length],
    x: Math.round((tileSize - size) / 2),
    y: Math.round(tileSize - size * 0.94),
    width: size,
    height: size,
    anchor: 'bottom'
  };
}

export function getMountainRubbleSpriteModels(mapConfig, col, row, tileSize = 60) {
  const grid = mapConfig?.grid || [];
  const code = grid[row]?.[col];
  if ((code !== 'M' && code !== 'B') || !Number.isFinite(tileSize) || tileSize <= 0) return [];

  const isMountain = (x, y) => grid[y]?.[x] === 'M' || grid[y]?.[x] === 'B';
  const models = [];
  if (isMountain(col + 1, row)) {
    const size = Math.max(8, Math.round(tileSize * 0.44));
    for (const [index, yRatio] of [0.12, 0.4, 0.68].entries()) {
      models.push({
        edge: 'right',
        texture: MOUNTAIN_RUBBLE_TEXTURES[coordinateHash(col, row, 17 + index * 11) % MOUNTAIN_RUBBLE_TEXTURES.length],
        x: Math.round(tileSize - size / 2),
        y: Math.round(tileSize * yRatio),
        width: size,
        height: size
      });
    }
  }
  if (isMountain(col, row + 1)) {
    const size = Math.max(8, Math.round(tileSize * 0.5));
    for (const [index, xRatio] of [0.12, 0.58].entries()) {
      models.push({
        edge: 'bottom',
        texture: MOUNTAIN_RUBBLE_TEXTURES[coordinateHash(col, row, 53 + index * 13) % MOUNTAIN_RUBBLE_TEXTURES.length],
        x: Math.round(tileSize * xRatio),
        y: Math.round(tileSize - size / 2),
        width: size,
        height: size
      });
    }
  }
  return models;
}

export function getTopDownShoreEdges(mapConfig, col, row) {
  const grid = mapConfig?.grid || [];
  const code = grid[row]?.[col];
  if (code !== 'W' && code !== 'S') return [];
  const height = grid.length;
  const width = grid[0]?.length || 0;
  const water = terrain => terrain === 'W' || terrain === 'S';
  const edges = [];
  for (const [name, dx, dy] of [['top', 0, -1], ['right', 1, 0], ['bottom', 0, 1], ['left', -1, 0]]) {
    const x = col + dx;
    const y = row + dy;
    if (x >= 0 && y >= 0 && x < width && y < height && !water(grid[y][x])) edges.push(name);
  }
  return edges;
}

export function getVisibleTileBounds({
  gridWidth,
  gridHeight,
  tileSize,
  camX,
  camY,
  screenWidth,
  screenHeight,
  zoom,
  overscanTiles = 1
}) {
  const values = [gridWidth, gridHeight, tileSize, camX, camY, screenWidth, screenHeight, zoom, overscanTiles];
  if (!values.every(Number.isFinite) || gridWidth <= 0 || gridHeight <= 0 || tileSize <= 0 || zoom <= 0 || overscanTiles < 0) {
    throw new TypeError('invalid_viewport_projection');
  }
  const viewWidth = screenWidth / zoom;
  const viewHeight = screenHeight / zoom;
  return {
    startCol: Math.max(0, Math.floor(camX / tileSize) - overscanTiles),
    endCol: Math.min(gridWidth - 1, Math.ceil((camX + viewWidth) / tileSize) + overscanTiles),
    startRow: Math.max(0, Math.floor(camY / tileSize) - overscanTiles),
    endRow: Math.min(gridHeight - 1, Math.ceil((camY + viewHeight) / tileSize) + overscanTiles)
  };
}

function describeFunction(uniqueFunction = {}) {
  const labels = [];
  if (uniqueFunction.sciencePerWorker) labels.push(`每名工人 +${uniqueFunction.sciencePerWorker} 科技值`);
  if (uniqueFunction.civicPerWorker) labels.push(`每名工人 +${uniqueFunction.civicPerWorker} 人文值`);
  if (uniqueFunction.goldPerWorker) labels.push(`每名工人 +${uniqueFunction.goldPerWorker} 黄金`);
  if (uniqueFunction.defensePower) labels.push(`防御 ${uniqueFunction.defensePower}`);
  if (uniqueFunction.soldierCapacity) labels.push(`驻军容量 ${uniqueFunction.soldierCapacity}`);
  if (uniqueFunction.routeCapacity) labels.push(`商路容量 +${uniqueFunction.routeCapacity}`);
  if (uniqueFunction.unlockSystem) labels.push(`解锁：${uniqueFunction.unlockSystem === 'tech' ? '科技树' : uniqueFunction.unlockSystem === 'civics' ? '人文树' : uniqueFunction.unlockSystem}`);
  return labels;
}

export function createBuildingHoverDetails(building, config, { upgradeName = null, hp = null, maxHp = null } = {}) {
  const lines = [
    config.description || '城市功能建筑。',
    `生命值：${hp ?? maxHp ?? config.maxHp ?? 100}/${maxHp ?? config.maxHp ?? 100}`,
    `状态：${STATUS_NAMES[building.status] || building.status || '未知'}`,
    `岗位：${building.currentWorkers || 0}/${config.maxWorkers || 0}`
  ];
  for (const output of config.production?.output || []) {
    lines.push(`产出：${RESOURCE_NAMES[output.resourceId] || output.resourceId} +${output.amount}${config.production?.perWorker ? '/工人' : ''}`);
  }
  lines.push(...describeFunction(config.uniqueFunction));
  const aura = config.aura || config.uniqueFunction?.aura;
  if (aura) lines.push(`光环：半径 ${aura.radius || 1}，${aura.effect || aura.effectType || '区域增益'} ×${aura.multiplier || 1}`);
  if (config.upgradesTo) lines.push(`升级方向：${upgradeName || config.upgradesTo}`);
  if (config.replaces) lines.push(`文明替代：${config.replaces}`);
  return { title: config.name || building.buildingId, subtitle: config.category || 'building', lines };
}

export function createMapTokenModels({ armies = [], wildSites = [], unitConfigs = [], selectedArmyId = null } = {}) {
  const unitsById = new Map(unitConfigs.map(unit => [unit.id, unit]));
  const armyTokens = armies.map(army => {
    const representative = (army.unitIds || [])
      .map(unitId => unitsById.get(unitId))
      .filter(Boolean)
      .sort((left, right) => (right.combatPower || 1) - (left.combatPower || 1))[0];
    const unitCount = army.unitCount ?? army.unitIds?.length ?? 0;
    return {
      id: army.id,
      kind: army.embarked ? 'fleet' : 'army',
      art: army.heroIcon || army.heroPortrait || representative?.icon || representative?.cardArt || '',
      fallbackArt: army.heroIcon ? (army.heroPortrait || representative?.icon || '') : (representative?.icon ? (representative.cardArt || '') : ''),
      fallbackIcon: army.embarked ? '⚓' : '⚔️',
      icon: army.embarked ? '⚓' : '⚔️',
      selected: army.id === selectedArmyId,
      unitCount,
      label: `${army.name} · ${unitCount}队`,
      detail: `攻击 ${army.attack ?? 0} · 生命 ${army.hp ?? 0}/${army.maxHp ?? 0} · 射程 ${army.attackRange ?? 0} · CP ${army.cp ?? 0}/${army.maxCp ?? 1} · 速度 ${army.speed ?? 0}`,
      gridX: army.gridX,
      gridY: army.gridY,
      color: army.factionColor || army.color || (army.embarked ? 0x2875a8 : 0x2f8f62)
    };
  });
  const siteIcons = { pirate_haven: '☠', ruin_guard: '◆', barbarian_camp: '♜', resource_guard: '✦' };
  const siteTokens = wildSites.map(site => ({
    id: site.id,
    kind: 'wild_site',
    icon: siteIcons[site.category] || '!',
    label: `${site.name} · 战力 ${site.strength ?? site.baseStrength ?? 0}`,
    detail: `野外据点 · 战力 ${site.strength ?? site.baseStrength ?? 0}`,
    gridX: site.gridX,
    gridY: site.gridY,
    color: site.domain === 'naval' ? 0x744e9b : 0x9b4c3d
  }));
  return [...armyTokens, ...siteTokens];
}

export function createArmySelectionModel(army) {
  if (!army?.id || !Number.isFinite(army.gridX) || !Number.isFinite(army.gridY)) return null;
  return {
    armyId: army.id,
    name: String(army.name || '未命名军团'),
    unitCount: Array.isArray(army.unitIds) ? army.unitIds.length : Math.max(0, Number(army.unitCount) || 0),
    gridX: army.gridX,
    gridY: army.gridY,
    attackRange: Math.max(0, Math.floor(Number(army.attackRange) || 0)),
    route: (army.movePath || [])
      .filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))
      .map(point => ({ x: point.x, y: point.y }))
  };
}

export function formatEnemyTokenStats(enemy = {}) {
  const hp = Math.max(0, Math.ceil(Number(enemy.hp ?? enemy.maxHp) || 0));
  const speed = Math.max(0, Number(enemy.speed) || 1);
  return `❤️${hp}  👟${speed}  ⚔️${calculateCombatStrength(enemy)}`;
}
import { calculateCombatStrength } from '../domain/CombatStrength.js';
