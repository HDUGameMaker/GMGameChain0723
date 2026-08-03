export function createNewWorldState(mapConfig) {
  if (mapConfig?.source !== 'fixed_static' || !['grand_map_v1', 'grand_map_v2'].includes(mapConfig?.mapId)) {
    throw new TypeError('invalid_fixed_map');
  }
  return {
    schemaVersion: Number.isInteger(mapConfig.schemaVersion) ? mapConfig.schemaVersion : 1,
    source: mapConfig.source,
    mapId: mapConfig.mapId
  };
}
