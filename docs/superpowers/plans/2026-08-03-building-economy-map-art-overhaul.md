# Building Economy, Fixed Map, Fog, and Art Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship complete per-building operation pages, distinct agriculture/commerce/trade systems, a reference-shaped 384×384 fixed map with four-resource nodes, permanent day/night fog, and complete non-duplicated production art.

**Architecture:** Building instances remain the single owner of assigned workers and gain small typed operation state for farms and commerce. The fixed world builder consumes a committed macro template and produces a deterministic `grand_map_v2` artifact containing terrain, pre-placed targets, and resource nodes; runtime systems only read and persist that artifact. Fog visibility is calculated in grid space and rendered as unexplored, remembered, and visible layers independently of camera zoom.

**Tech Stack:** Browser ES modules, PIXI.js, JSON configuration, Node 20 test runner, Playwright Chromium, Python/Pillow asset tooling, Codex `imagegen`.

## Global Constraints

- Modify only `D:/【个人内容】GameDesignProjects/GM GameChain2026/GM GameChain2026`; do not touch `GM GameChain2026 Early Assess`.
- The new-game map is exactly one committed 384×384 fixed map; runtime random generation is forbidden.
- Water coverage must stay between 15% and 20%; target is 18%–19.5%.
- Player spawn is on the right-middle continent near `(270, 180)` on a safe buildable tile.
- City-states and wild sites have fixed, unique, terrain-valid coordinates after build time.
- The only common economy resources are `wood`, `stone`, `food`, and `gold`.
- Crop selection and worker editing are available only inside each concrete farm detail page.
- Commerce means internal commercial buildings; city-state routes and exchanges are named trade.
- Fog is always enabled: day base radius 10, night base radius 6.
- Existing valid unique art is retained; only missing, duplicate-hash, corrupt, invisible, or wrong-bound art is replaced.
- Keep save format at v9 and extend its canonical payload without creating duplicate top-level mirrors.

---

### Task 1: Normalize Building Categories, Unlocks, and Detail Contracts

**Files:**
- Create: `src/domain/BuildingPresentation.js`
- Modify: `config/buildings.json`
- Modify: `src/systems/BuildingSystem.js`
- Modify: `src/ui/panels/building-select-panel.js`
- Modify: `src/ui/panels/building-detail-panel.js`
- Test: `test/node/building-presentation.test.mjs`
- Test: `test/node/historical-buildings-units.test.mjs`

**Interfaces:**
- Produces: `getBuildingPresentation(config, unlockRows)` returning `{ categoryId, categoryName, eraName, staffingText, effectRows, inputRows, outputRows, unlockRows }`.
- Produces: `BuildingSystem.getUnlockStatus(buildingId)` returning `{ unlocked, conditions: Array<{ type, desc, met }> }` and used by both menu and placement checks.
- Consumes: existing `BuildingSystem.assignWorker`, `removeWorker`, `getBuildingDailyProductionPreview`, and adjacency APIs.

- [ ] **Step 1: Write the failing presentation and unlock parity tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { getBuildingPresentation } from '../../src/domain/BuildingPresentation.js';

test('passive buildings still expose meaningful detail rows', () => {
  const result = getBuildingPresentation({
    id: 'warehouse', name: '大本营', category: 'administration', eraId: 'primitive',
    maxWorkers: 0, storageMultiplier: 1, production: null
  }, []);
  assert.equal(result.staffingText, '无需人口');
  assert.ok(result.effectRows.some(row => row.includes('存储')));
});
```

- [ ] **Step 2: Run the focused tests and confirm the missing module/config failures**

Run: `npm.cmd test -- --test-name-pattern="passive buildings|building categories|unlock parity"`

Expected: FAIL because `BuildingPresentation.js` and normalized category metadata do not exist.

- [ ] **Step 3: Add the pure presentation mapper and canonical category dictionary**

```js
export const BUILDING_CATEGORIES = Object.freeze({
  housing: '住宅', agriculture: '农业', gathering: '采集', industry: '工业',
  commerce: '商业', research: '科研', civic: '人文', military: '军事',
  defense: '防御', naval: '海军', administration: '行政'
});

export function getBuildingPresentation(config, unlockRows = []) {
  const passive = [];
  if (config.storageMultiplier) passive.push(`存储倍率 ×${config.storageMultiplier}`);
  if (config.housingCapacity) passive.push(`人口容量 +${config.housingCapacity}`);
  if (config.soldierCapacity) passive.push(`士兵容量 +${config.soldierCapacity}`);
  for (const [key, value] of Object.entries(config.uniqueFunction || {})) passive.push(`${key}: ${value}`);
  return {
    categoryId: config.category,
    categoryName: BUILDING_CATEGORIES[config.category] || '行政',
    eraName: config.eraName || config.eraId || '原始时代',
    staffingText: (config.maxWorkers || 0) > 0 ? `岗位上限 ${config.maxWorkers}` : '无需人口',
    effectRows: passive.length ? passive : ['提供基础城市功能'],
    inputRows: config.production?.input || [],
    outputRows: config.production?.output || [],
    unlockRows
  };
}
```

- [ ] **Step 4: Normalize every building to one category and explicit era/tech/civic conditions**

Use the eleven category IDs in `BUILDING_CATEGORIES`; keep secondary meanings in `tags`. Add `eraId` and appropriate `unlockConditions` while preserving existing `building_tech`, civilization, building, and terrain gates.

- [ ] **Step 5: Make menu and placement consume the same unlock result**

Implement `getUnlockStatus(buildingId)` as the only public aggregate around existing condition checks. The select panel displays all buildings grouped by category, leaves locked items visible, and renders every unmet reason. `canPlaceAt` returns the first unmet reason from the same result.

- [ ] **Step 6: Render a complete detail skeleton for every building**

Always render identity, category/era/status, description, unlock source, staffing, effects, input/output, adjacency, and actions. Only hide `-`/`+` for zero-slot buildings; show `无需人口` instead.

- [ ] **Step 7: Run tests and commit**

Run: `npm.cmd test -- --test-name-pattern="building|unlock|presentation"`

Expected: PASS.

Commit: `feat: complete building categories and detail contracts`

---

### Task 2: Move Crop Choice and Agricultural Staffing Into Farm Instances

**Files:**
- Modify: `config/economic-orders.json`
- Modify: `src/systems/BuildingSystem.js`
- Modify: `src/systems/EconomyOrderSystem.js`
- Modify: `src/ui/panels/building-detail-panel.js`
- Modify: `src/ui/panels/economic-orders-panel.js`
- Modify: `src/ui/PopupManager.js`
- Test: `test/node/farm-operations.test.mjs`
- Modify: `test/node/economic-orders.test.mjs`

**Interfaces:**
- Produces: building state fields `cropId: string|null` and `pendingCropId: string|null`.
- Produces: `BuildingSystem.setFarmCrop(buildingIndex, cropId)` returning `{ ok, reason?, effectiveOnDay? }`.
- Produces: `BuildingSystem.getFarmOperation(buildingIndex)` returning current/pending crop, workers, outputs, warnings, and unlock state.
- Changes: `EconomyOrderSystem` owns gathering orders only; legacy crop orders migrate into matching empty farms during restore and are then discarded.

- [ ] **Step 1: Write failing farm ownership tests**

```js
test('each farm owns one crop and pending changes wait for the next day', () => {
  const farm = { buildingId: 'farm', status: 'active', currentWorkers: 3, cropId: 'grain', pendingCropId: null };
  const system = makeBuildingSystem([farm], { day: 12 });
  assert.deepEqual(system.setFarmCrop(0, 'vegetables'), { ok: true, effectiveOnDay: 13 });
  assert.equal(system.getFarmOperation(0).cropId, 'grain');
  assert.equal(system.getFarmOperation(0).pendingCropId, 'vegetables');
  system.applyPendingFarmCrops(13);
  assert.equal(system.getFarmOperation(0).cropId, 'vegetables');
});
```

- [ ] **Step 2: Run the focused farm tests and confirm failure**

Run: `node --test test/node/farm-operations.test.mjs test/node/economic-orders.test.mjs`

Expected: FAIL because farm operation APIs do not exist and crop orders are global.

- [ ] **Step 3: Add crop definitions with terrain and unlock metadata**

Keep the existing eight crop IDs but give each readable UTF-8 Chinese copy, `allowedGrounds`, `unlockConditions`, and per-worker outputs. Grain remains the default unlocked crop; cash crops retain luxury production without becoming fifth basic resources.

- [ ] **Step 4: Implement farm state, delayed switching, and crop-driven production**

Initialize new farm records with `cropId: 'grain'`. During production, farm buildings use the selected crop's outputs and luxury interval instead of `config.production.output`. `setFarmCrop` validates farm type, crop unlocks, and terrain, then only sets `pendingCropId`.

- [ ] **Step 5: Put crop and worker controls in farm details only**

The farm detail renders crop cards, current/pending labels, terrain fit, per-worker yield, and the existing building worker `-`/`+` controls. No other panel calls `setFarmCrop`, `assignWorker`, or `removeWorker` for farms.

- [ ] **Step 6: Convert agriculture overview into read-only summary and locator**

List each farm with coordinate, crop, worker count, projected output, and warning. Its only action is:

```js
pm.open('building_detail', { buildingIndex: row.buildingIndex });
```

Gathering orders may remain in their own read-only section but crop order creation and editing controls are removed.

- [ ] **Step 7: Run tests and commit**

Run: `node --test test/node/farm-operations.test.mjs test/node/economic-orders.test.mjs`

Expected: PASS.

Commit: `feat: bind crops and agricultural workers to farms`

---

### Task 3: Separate Internal Commerce From City-State Trade

**Files:**
- Create: `config/commercial-buildings.json`
- Create: `src/systems/CommercialBuildingSystem.js`
- Create: `src/ui/panels/commercial-overview-panel.js`
- Rename: `src/ui/panels/commerce-panel.js` to `src/ui/panels/trade-panel.js`
- Modify: `config/buildings.json`
- Modify: `src/systems/CommerceSystem.js`
- Modify: `src/ui/panels/building-detail-panel.js`
- Modify: `src/ui/PopupManager.js`
- Modify: `src/ui/HUD.js`
- Modify: `index.html`
- Modify: `src/main.js`
- Create: `test/node/commercial-buildings.test.mjs`
- Modify: `test/node/commerce-system.test.mjs`

**Interfaces:**
- Produces: `CommercialBuildingSystem.getBuildingState(buildingIndex)` returning `{ active, workers, goldPerTick, buff }`.
- Produces: `CommercialBuildingSystem.getActiveBuffs()` deduplicated by buff ID.
- Preserves: `CommerceSystem.getTradeRoutes`, route IDs, and `commerce` save key; UI labels call it “贸易”.

- [ ] **Step 1: Write failing activation, scaling, and buff deduplication tests**

```js
test('one commercial worker enables one unique buff while extra workers scale gold only', () => {
  const system = makeCommercialSystem([
    { buildingId: 'market', currentWorkers: 3, status: 'active' },
    { buildingId: 'market', currentWorkers: 1, status: 'active' }
  ]);
  assert.equal(system.getBuildingState(0).goldPerTick, 3);
  assert.equal(system.getActiveBuffs().filter(buff => buff.id === 'market_supply').length, 1);
});
```

- [ ] **Step 2: Run commerce and trade tests and confirm missing system failures**

Run: `node --test test/node/commercial-buildings.test.mjs test/node/commerce-system.test.mjs`

Expected: FAIL because internal commercial behavior is not modeled separately.

- [ ] **Step 3: Configure differentiated commercial buildings**

Add market, trading hall, bank, and exchange definitions with era/unlock gates, `goldPerWorker`, and distinct buff IDs. A buff has `{ id, name, description, effect }`; it is inactive at zero workers and never multiplies by worker count.

- [ ] **Step 4: Implement commercial output and buff aggregation**

Subscribe to work ticks, add total gold through `ResourceSystem.addClamped('gold', amount)`, and expose buff aggregation for systems that consume satisfaction, storage, construction cost, and route value.

- [ ] **Step 5: Add commercial details and overview**

Commercial building details show base/current gold and whether the unique buff is enabled. The overview summarizes buildings and opens their detail pages; it does not edit workers.

- [ ] **Step 6: Rename all route UI to trade without changing persisted IDs**

Register popup key `trade`; retain `commerce` as a load-time/UI alias for compatibility. Change button copy and panel titles to “贸易”, “城邦贸易路线”, and “本地加工”, while `CommerceSystem` remains the route implementation class.

- [ ] **Step 7: Run tests and commit**

Run: `node --test test/node/commercial-buildings.test.mjs test/node/commerce-system.test.mjs`

Expected: PASS.

Commit: `feat: separate commercial buildings from trade routes`

---

### Task 4: Add Fixed Resource Nodes and Node-Bound Buildings

**Files:**
- Create: `config/resource-nodes.json`
- Create: `src/systems/ResourceNodeSystem.js`
- Modify: `src/systems/BuildingSystem.js`
- Modify: `src/rendering/MapRenderer.js`
- Modify: `src/main.js`
- Create: `test/node/resource-nodes.test.mjs`
- Modify: `test/node/fixed-grand-map.test.mjs`

**Interfaces:**
- Consumes: `map.spawnManifest.resourceNodes` records.
- Produces: `ResourceNodeSystem.getNodeAt(x, y)`, `claimNode(nodeId, buildingInstanceId)`, `releaseNodeByBuilding(buildingInstanceId)`, `consume(nodeId, amount)`, `onDayStart(day)`, `getState()`, and `restoreState(state)`.
- Produces: common node types `wood`, `stone`, `food`, `gold`; rare nodes delegate awards to the existing luxury system.

- [ ] **Step 1: Write failing node persistence and placement tests**

```js
test('a mine claims a matching node and demolition releases it', () => {
  const nodes = makeNodeSystem([{ id: 'stone_1', type: 'stone', gridX: 20, gridY: 30, rarity: 'common', capacity: null }]);
  assert.deepEqual(nodes.claimNode('stone_1', 'building_7'), { ok: true });
  assert.equal(nodes.getNodeAt(20, 30).developedByBuildingId, 'building_7');
  nodes.releaseNodeByBuilding('building_7');
  assert.equal(nodes.getNodeAt(20, 30).developedByBuildingId, null);
});
```

- [ ] **Step 2: Run the node tests and confirm failure**

Run: `node --test test/node/resource-nodes.test.mjs test/node/fixed-grand-map.test.mjs`

Expected: FAIL because the map has zero nodes and no node system.

- [ ] **Step 3: Define terrain compatibility and persistence rules**

Common nodes use `capacity: null`, `remaining: null`, and never deplete. Rare nodes use finite `capacity`, decrease `remaining`, pause at zero, and restore to capacity when `currentDay >= recoveryDay`.

- [ ] **Step 4: Enforce resource-node placement in `BuildingSystem.canPlaceAt`**

Buildings with `requiredResourceNode: 'stone'` or another type must cover a free matching node. Assign a stable `instanceId` when placed, claim after cost succeeds, and release on demolition or invalidation.

- [ ] **Step 5: Render discoverable and developed node tokens**

Add a resource-node container below units and above terrain. Hidden/unexplored nodes are not drawn; remembered nodes show their last-known state; visible nodes use type art and a developed marker.

- [ ] **Step 6: Run tests and commit**

Run: `node --test test/node/resource-nodes.test.mjs test/node/fixed-grand-map.test.mjs`

Expected: PASS.

Commit: `feat: add persistent terrain resource nodes`

---

### Task 5: Build the Reference-Shaped `grand_map_v2` Fixed World

**Files:**
- Create: `config/maps/grand_map_macro_template.json`
- Create: `config/maps/grand_map_v1.json`
- Modify: `config/maps/grand_map_patches.json`
- Modify: `scripts/lib/FixedWorldBuilder.js`
- Modify: `scripts/build-fixed-grand-map.mjs`
- Modify: `config/maps/base_map.json`
- Modify: `src/world/WorldMapState.js`
- Modify: `src/core/ConfigRegistry.js`
- Modify: `src/main.js`
- Modify: `test/node/fixed-grand-map.test.mjs`
- Modify: `test/node/map-presentation.test.mjs`

**Interfaces:**
- Produces: `buildTemplateDrivenWorld({ width, height, macroTemplate, seed, patches })` returning committed terrain/biome rows and spawn manifest.
- Produces: `grand_map_v2`, while `grand_map_v1.json` preserves the previous artifact for v9 saves whose `world.mapId` is `grand_map_v1`.

- [ ] **Step 1: Write failing topology, spawn, and distribution tests**

```js
test('grand map v2 follows the approved fixed-world budget', () => {
  assert.equal(map.mapId, 'grand_map_v2');
  assert.equal(map.gridWidth, 384);
  assert.equal(map.gridHeight, 384);
  assert.ok(map.generation.metrics.waterRatio >= 0.15 && map.generation.metrics.waterRatio <= 0.20);
  assert.ok(Math.abs(map.spawnManifest.playerSpawn.gridX - 270) <= 12);
  assert.ok(Math.abs(map.spawnManifest.playerSpawn.gridY - 180) <= 12);
  assert.equal(map.spawnManifest.cityStates.length, 24);
  assert.equal(map.spawnManifest.wildSites.length, 96);
});
```

- [ ] **Step 2: Run fixed-map tests and confirm v1/procedural-shape failure**

Run: `node --test test/node/fixed-grand-map.test.mjs test/node/map-presentation.test.mjs`

Expected: FAIL because current artifact is `grand_map_v1` and has no macro template/resource distribution.

- [ ] **Step 3: Commit a compact macro template matching the reference composition**

Encode polygons/ellipses for major right, upper-left, upper-right, lower-left, lower-right, and central landmasses; encode inland seas, straits, island chains, continuous mountain bands, forest belts, plains, and dry regions. The builder rasterizes this deterministic template before edge refinement.

- [ ] **Step 4: Place fixed spawn, 24 city-states, and 96 wild sites against valid terrain**

Use deterministic constraint search only during the build script. Verify unique coordinates, land compatibility, route reachability, and spawn safety radius. Persist the final coordinates in `base_map.json`.

- [ ] **Step 5: Place balanced common and rare nodes**

For every major land component, enforce at least one cluster of all four common node types. Use denser wood/food/stone placement and slightly lower gold density. Rare nodes follow terrain constraints and remain substantially fewer than common nodes.

- [ ] **Step 6: Preserve the old artifact and load by saved map ID**

Copy the pre-overhaul committed artifact to `grand_map_v1.json`. New games create `grand_map_v2`; loading a v9 save selects the matching artifact without moving saved buildings or armies.

- [ ] **Step 7: Generate, check, and commit the fixed map**

Run: `node scripts/build-fixed-grand-map.mjs`

Run: `node scripts/build-fixed-grand-map.mjs --check`

Run: `node --test test/node/fixed-grand-map.test.mjs test/node/map-waterways.test.mjs test/node/map-presentation.test.mjs`

Expected: all commands PASS and a second build produces no diff.

Commit: `feat: redraw the fixed grand map from a macro template`

---

### Task 6: Restore Permanent Three-State Fog of War

**Files:**
- Create: `src/world/FogOfWarState.js`
- Modify: `src/rendering/MapRenderer.js`
- Modify: `src/main.js`
- Create: `test/node/fog-of-war.test.mjs`
- Modify: `test/node/map-presentation.test.mjs`

**Interfaces:**
- Produces: `FogOfWarState.recalculate(sources, period)` and `getTileState(x, y)` returning `'unexplored' | 'remembered' | 'visible'`.
- Produces: `getState()` as `{ width, height, exploredRle }`; current visibility is recalculated rather than trusted from save.
- Consumes: day radius 10, night radius 6, plus integer source bonuses.

- [ ] **Step 1: Write failing grid-space fog tests**

```js
test('day reveals ten tiles and night reveals six while retaining memory', () => {
  const fog = new FogOfWarState(384, 384);
  fog.recalculate([{ gridX: 100, gridY: 100, bonus: 0 }], 'morning');
  assert.equal(fog.getTileState(110, 100), 'visible');
  fog.recalculate([{ gridX: 100, gridY: 100, bonus: 0 }], 'night');
  assert.equal(fog.getTileState(110, 100), 'remembered');
  assert.equal(fog.getTileState(106, 100), 'visible');
});
```

- [ ] **Step 2: Run fog tests and confirm `_isTileRevealed` failure**

Run: `node --test test/node/fog-of-war.test.mjs test/node/map-presentation.test.mjs`

Expected: FAIL because `_isTileRevealed` currently always returns true.

- [ ] **Step 3: Implement explored/visible bitsets and RLE persistence**

Use Chebyshev grid distance for strategy visibility. Recalculation clears only the visible bitset, unions visible tiles into explored, and leaves unexplored false.

- [ ] **Step 4: Replace lighting-only fog rendering with three alpha states**

Draw unexplored at approximately 0.94 alpha, remembered at approximately 0.58 alpha, and visible transparent. Day/night color grading may vary but never disables either fog layer. Token and resource renderers query the same tile state.

- [ ] **Step 5: Make zoom-invariant source collection**

Collect sources from active buildings, player armies, heroes, and explicit tech bonuses in grid coordinates. Camera and `tileSize` are used only when painting the already-calculated state.

- [ ] **Step 6: Run tests and commit**

Run: `node --test test/node/fog-of-war.test.mjs test/node/map-presentation.test.mjs`

Expected: PASS.

Commit: `feat: restore persistent day and night fog of war`

---

### Task 7: Extend Canonical v9 Saves for Farm, Node, and Fog State

**Files:**
- Modify: `src/core/SaveManager.js`
- Modify: `src/main.js`
- Modify: `src/systems/BuildingSystem.js`
- Modify: `test/node/save-v9-envelope.test.mjs`
- Create: `test/node/save-v9-overhaul-state.test.mjs`

**Interfaces:**
- Extends canonical v9 with `resourceNodes` and `fogOfWar` records.
- Extends each building record with `instanceId`, `cropId`, and `pendingCropId` while preserving existing keys.
- Keeps `commerce` as the canonical trade-route key and does not create `tradeRoutes` mirrors.

- [ ] **Step 1: Write failing migration and round-trip tests**

```js
test('legacy v9 buildings gain stable operation defaults', () => {
  const migrated = SaveManager.migrate(makeV9({
    buildings: [{ buildingId: 'farm', gridX: 10, gridY: 10, status: 'active', currentWorkers: 2 }]
  }));
  assert.equal(migrated.buildings[0].cropId, 'grain');
  assert.equal(migrated.buildings[0].pendingCropId, null);
  assert.match(migrated.buildings[0].instanceId, /^building_/);
});
```

- [ ] **Step 2: Run save tests and confirm canonical validation failure**

Run: `node --test test/node/save-v9-envelope.test.mjs test/node/save-v9-overhaul-state.test.mjs`

Expected: FAIL because the new fields/defaults are absent.

- [ ] **Step 3: Add in-version v9 normalization before canonical validation**

Normalize missing operation fields, empty node state, and empty fog exploration for existing v9 payloads. Validate dimensions, IDs, coordinate bounds, and arrays before accepting the save.

- [ ] **Step 4: Wire new-game, load, and save order**

Initialize the selected map, then resource nodes, buildings, and fog. On load, restore nodes before buildings so claims can be validated; restore explored fog after map dimensions are known.

- [ ] **Step 5: Run save tests and commit**

Run: `node --test test/node/save-v9-envelope.test.mjs test/node/save-v9-overhaul-state.test.mjs test/node/integration-events-save.test.mjs`

Expected: PASS.

Commit: `feat: persist overhaul state in canonical v9 saves`

---

### Task 8: Audit, Generate, Slice, and Bind Complete Production Art

**Files:**
- Create: `scripts/audit-runtime-art.mjs`
- Modify: `scripts/generate-asset-manifest.js`
- Modify: `scripts/slice_asset_board_windows.py`
- Create: `test/node/runtime-art-integrity.test.mjs`
- Modify: `config/buildings.json`
- Modify: unit configuration files reported by the audit
- Create/Modify: files under `assets/buildings/`, `assets/units/`, and `assets/resources/`

**Interfaces:**
- Produces: `art-audit.json` records `{ contentType, contentId, configPath, resolvedPath, exists, decodes, width, height, sha256, runtimeSurface, status }`.
- Produces: one board manifest per redraw group as `{ input, outputDir, grid, names }`, where `names` is populated directly from audited content IDs.
- Produces: a non-zero process exit when required runtime art is missing, corrupt, too small, duplicate across distinct content IDs, or bound to a fallback.

- [ ] **Step 1: Write the failing runtime art integrity test**

```js
test('every runtime building, unit, and resource node has unique valid art', async () => {
  const report = await auditRuntimeArt(projectRoot);
  assert.deepEqual(report.filter(item => item.status !== 'ok'), []);
});
```

- [ ] **Step 2: Generate the first audit report and record exact redraw groups**

Run: `node scripts/audit-runtime-art.mjs --write-report artifacts/art-audit-before.json`

Expected: non-zero exit with explicit missing, duplicate-hash, wrong-binding, and decode groups.

- [ ] **Step 3: Read and follow the installed `imagegen` skill before live generation**

Use one approved existing 2.5D building/unit image as the style reference. Generate coherent boards grouped by buildings, unit era/civilization/branch, and resource nodes. Require isolated subjects, no labels, no UI, consistent camera, and real transparent background.

- [ ] **Step 4: Slice each generated board and create contact sheets**

Run with the bundled Python runtime and the board manifest written by the audit grouping step:

```powershell
& 'C:/Users/sherlingwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' scripts/slice_asset_board_windows.py --manifest artifacts/boards/units-board-01.json --contact-sheet
```

The slicer reads `input`, `outputDir`, `grid`, and exact audited content IDs from the manifest and refuses duplicate names or a cell/name count mismatch.

- [ ] **Step 5: Harden alpha/checkerboard validation and bind exact content paths**

Reject opaque checkerboard pixels, empty alpha, tiny subjects, invalid PNGs, and accidental identical hashes. Update configuration so every runtime surface resolves to the intended file.

- [ ] **Step 6: Inspect every contact sheet and rerun the audit**

Run: `node scripts/audit-runtime-art.mjs --write-report artifacts/art-audit-after.json`

Run: `node --test test/node/runtime-art-integrity.test.mjs test/node/character-art-assets.test.mjs test/node/historical-icon-assets.test.mjs`

Expected: zero audit findings and all tests PASS.

- [ ] **Step 7: Commit**

Commit: `feat: complete unique building unit and resource art`

---

### Task 9: Verify the Complete Player Journey in Chromium

**Files:**
- Modify: `test/browser-smoke.spec.js`
- Modify: `test/browser/runtime-smoke.mjs`
- Modify: `src/ui/PopupManager.js`
- Modify: `src/ui/HUD.js`
- Modify: `src/rendering/MapRenderer.js`
- Modify: `index.html`

**Interfaces:**
- Verifies the same runtime paths players use, including image decode and console errors.
- Captures desktop screenshots for map/spawn, building detail, farm detail, commercial detail, trade panel, and day/night fog.

- [ ] **Step 1: Add failing browser journeys for the new modules**

The scenario starts a new game, opens a passive building detail, assigns a farm worker, schedules a crop, verifies agriculture overview is read-only, enables a market buff, opens trade, pans to resource nodes, and switches day/night while checking fog remains present.

- [ ] **Step 2: Run Chromium and collect the first visual/console failures**

Run: `npm.cmd run test:browser`

Expected: FAIL until all new controls, titles, images, and fog states are wired.

- [ ] **Step 3: Fix integration and responsive layout issues surfaced by the journey**

Keep controls reachable at desktop and 390×844, keep building images fully visible, and ensure lists scroll inside the panel instead of behind the close button.

- [ ] **Step 4: Capture and visually inspect final screenshots**

Inspect every screenshot with `view_image`; compare map macro composition to the supplied reference and building detail hierarchy to Figure 1. Correct visible duplicate images, broken bindings, clipped text, and missing fog before acceptance.

- [ ] **Step 5: Run browser tests and commit**

Run: `npm.cmd run test:browser`

Expected: PASS with zero page errors and zero failed image requests.

Commit: `test: cover the economy map fog and art journey`

---

### Task 10: Full Verification and Source-Backed Handoff

**Files:**
- Modify: `README.md`
- Modify: `docs/RTS_SLG_GRAND_OVERHAUL_2026-08-03.md`
- Create: `docs/BUILDING_ECONOMY_MAP_ART_OVERHAUL_2026-08-03.md`

**Interfaces:**
- Produces a final report generated from committed configuration and test output, not estimated counts.

- [ ] **Step 1: Generate final counts from configuration**

Record building totals/categories, farm crops, commercial buildings/buffs, trade recipes, city-states, wild sites, common/rare nodes, water ratio, spawn coordinate, and art audit totals.

- [ ] **Step 2: Update player-facing instructions**

Document where to build, how to open building details, how farms/commerce/trade differ, resource-node rules, and day/night fog behavior.

- [ ] **Step 3: Run full static and runtime verification**

Run: `npm.cmd run verify`

Run: `node scripts/build-fixed-grand-map.mjs --check`

Run: `node scripts/audit-runtime-art.mjs`

Run: `npm.cmd run test:browser`

Expected: every command exits 0.

- [ ] **Step 4: Review scope and diff**

Run: `git status --short`

Run: `git diff --check`

Confirm no path under `GM GameChain2026 Early Assess` was touched and no required runtime art falls back.

- [ ] **Step 5: Commit final documentation**

Commit: `docs: record building economy map and art acceptance`
