function isAt(target, gridX, gridY) {
  return (target?.gridX ?? target?.x) === gridX && (target?.gridY ?? target?.y) === gridY;
}

function buildingContains(building, config, gridX, gridY) {
  const width = Math.max(1, Number(config?.footprint?.width) || 1);
  const height = Math.max(1, Number(config?.footprint?.height) || 1);
  return gridX >= building.gridX
    && gridX < building.gridX + width
    && gridY >= building.gridY
    && gridY < building.gridY + height;
}

/** Classifies a revealed strategic-map click without mutating game state. */
export function classifyArmyInteractionTarget({
  gridX,
  gridY,
  armies = [],
  buildings = [],
  wildSites = [],
  cityStates = [],
  outposts = [],
  enemies = [],
  getBuildingConfig = () => null
} = {}) {
  if (!Number.isInteger(gridX) || !Number.isInteger(gridY)) {
    return { kind: 'move', gridX, gridY };
  }

  const enemyArmy = armies.find(army => army?.ownerId && army.ownerId !== 'player' && isAt(army, gridX, gridY));
  const enemy = enemyArmy || enemies.find(item => isAt(item, gridX, gridY));
  if (enemy) {
    return {
      kind: 'enemy',
      gridX,
      gridY,
      enemyId: enemy.id ?? enemy.enemyId ?? null,
      enemy,
      enemyArmyId: enemyArmy?.id ?? null,
      source: enemyArmy ? 'army' : (enemy.source || 'combat')
    };
  }

  const wildSite = wildSites.find(site => isAt(site, gridX, gridY));
  if (wildSite) return { kind: 'wild_site', gridX, gridY, siteId: wildSite.id, site: wildSite };

  const cityState = [...cityStates, ...outposts].find(city => isAt(city, gridX, gridY));
  if (cityState) return { kind: 'city_state', gridX, gridY, cityStateId: cityState.id, cityState };

  const buildingIndex = buildings.findIndex(building => {
    if (!building || building.status === 'demolished' || building._invalid) return false;
    const config = getBuildingConfig(building.buildingId, building) || building.config || building.definition;
    return buildingContains(building, config, gridX, gridY);
  });
  if (buildingIndex >= 0) {
    const building = buildings[buildingIndex];
    const config = getBuildingConfig(building.buildingId, building) || building.config || building.definition || {};
    const capacity = Math.max(0, Number(config.uniqueFunction?.garrisonCapacity) || 0);
    return {
      kind: capacity > 0 && building.status === 'active' ? 'garrison' : 'blocked_building',
      gridX,
      gridY,
      buildingIndex,
      building,
      buildingConfig: config
    };
  }

  return { kind: 'move', gridX, gridY };
}
