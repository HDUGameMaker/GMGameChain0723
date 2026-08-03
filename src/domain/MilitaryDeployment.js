const WATER_GROUNDS = new Set(['S', 'W']);

function footprintSize(config) {
  return {
    width: Math.max(1, Math.floor(Number(config?.footprint?.width) || 1)),
    height: Math.max(1, Math.floor(Number(config?.footprint?.height) || 1))
  };
}

export function getDeploymentCandidates(building, config) {
  const x = Math.floor(Number(building?.gridX) || 0);
  const y = Math.floor(Number(building?.gridY) || 0);
  const { width, height } = footprintSize(config);
  const middleX = x + Math.floor((width - 1) / 2);
  const middleY = y + Math.floor((height - 1) / 2);
  const right = x + width;
  const bottom = y + height;

  return [
    { x: middleX, y: y - 1, direction: 'N' },
    { x: right, y: y - 1, direction: 'NE' },
    { x: right, y: middleY, direction: 'E' },
    { x: right, y: bottom, direction: 'SE' },
    { x: middleX, y: bottom, direction: 'S' },
    { x: x - 1, y: bottom, direction: 'SW' },
    { x: x - 1, y: middleY, direction: 'W' },
    { x: x - 1, y: y - 1, direction: 'NW' }
  ];
}

function occupiesFootprint(entity, x, y) {
  const width = Math.max(1, Math.floor(Number(entity?.footprint?.width) || 1));
  const height = Math.max(1, Math.floor(Number(entity?.footprint?.height) || 1));
  return x >= entity.gridX && x < entity.gridX + width
    && y >= entity.gridY && y < entity.gridY + height;
}

export function findDeploymentTile({
  building,
  buildingConfig,
  map,
  domain,
  activeBuildings = [],
  armies = [],
  fixedTargets = []
} = {}) {
  const width = Math.max(0, Math.floor(Number(map?.gridWidth) || map?.grid?.[0]?.length || 0));
  const height = Math.max(0, Math.floor(Number(map?.gridHeight) || map?.grid?.length || 0));
  if (!building || !map?.grid || !['land', 'naval'].includes(domain)) return null;

  for (const candidate of getDeploymentCandidates(building, buildingConfig)) {
    const { x, y } = candidate;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const ground = map.grid[y]?.[x];
    if (!ground || (domain === 'naval') !== WATER_GROUNDS.has(ground)) continue;
    if (activeBuildings.some(item => (
      item
      && item.status !== 'constructing'
      && item._invalid !== true
      && occupiesFootprint(item, x, y)
    ))) continue;
    if (armies.some(army => (
      army?.garrisonBuildingIndex == null
      && army.gridX === x
      && army.gridY === y
    ))) continue;
    if (fixedTargets.some(target => (
      (target?.gridX ?? target?.x) === x
      && (target?.gridY ?? target?.y) === y
    ))) continue;
    return candidate;
  }
  return null;
}
