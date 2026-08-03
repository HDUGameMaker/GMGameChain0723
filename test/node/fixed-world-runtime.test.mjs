import test from 'node:test';
import assert from 'node:assert/strict';

let createNewWorldState;
try {
  ({ createNewWorldState } = await import('../../src/world/WorldMapState.js'));
} catch {}

let getVisibleTileBounds;
try {
  ({ getVisibleTileBounds } = await import('../../src/rendering/MapPresentation.js'));
} catch {}

test('new world identity comes from the committed fixed map while legacy identity stays explicit', () => {
  assert.equal(typeof createNewWorldState, 'function');
  const map = { schemaVersion: 1, source: 'fixed_static', mapId: 'grand_map_v1' };
  assert.deepEqual(createNewWorldState(map), {
    schemaVersion: 1,
    source: 'fixed_static',
    mapId: 'grand_map_v1'
  });
  assert.throws(() => createNewWorldState({ source: 'procedural', mapId: 'random_1' }), /invalid_fixed_map/);
});

test('large-map viewport projection bounds tile work to the visible area plus overscan', () => {
  assert.equal(typeof getVisibleTileBounds, 'function');
  const bounds = getVisibleTileBounds({
    gridWidth: 384,
    gridHeight: 384,
    tileSize: 60,
    camX: 600,
    camY: 1200,
    screenWidth: 1920,
    screenHeight: 1080,
    zoom: 1,
    overscanTiles: 1
  });
  assert.deepEqual(bounds, { startCol: 9, endCol: 43, startRow: 19, endRow: 39 });
  assert.equal(bounds.tileCount, undefined);
  const tileCount = (bounds.endCol - bounds.startCol + 1) * (bounds.endRow - bounds.startRow + 1);
  assert.equal(tileCount, 735);
  assert.ok(tileCount < 384 * 384 / 100);
});
