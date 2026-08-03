const RESOURCE_NAMES = { wood: '木材', stone: '石料', food: '食物', gold: '黄金' };
const STATUS_NAMES = { active: '运行中', constructing: '建造中', disabled: '停用', damaged: '受损' };

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

export function createBuildingHoverDetails(building, config, { upgradeName = null } = {}) {
  const lines = [
    config.description || '城市功能建筑。',
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
      .sort((left, right) => (right.commandPoints || 1) - (left.commandPoints || 1))[0];
    const unitCount = army.unitCount ?? army.unitIds?.length ?? 0;
    return {
      id: army.id,
      kind: army.embarked ? 'fleet' : 'army',
      art: representative?.icon || representative?.cardArt || '',
      fallbackArt: representative?.icon ? (representative.cardArt || '') : '',
      fallbackIcon: army.embarked ? '⚓' : '⚔️',
      icon: army.embarked ? '⚓' : '⚔️',
      selected: army.id === selectedArmyId,
      unitCount,
      label: `${army.name} · ${unitCount}队`,
      detail: `战力 ${army.power ?? 0} · 士气 ${Math.round(army.morale ?? 100)} · 补给 ${Math.round((army.supply ?? 1) * 100)}%`,
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
    label: site.name,
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
    route: (army.movePath || [])
      .filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))
      .map(point => ({ x: point.x, y: point.y }))
  };
}
