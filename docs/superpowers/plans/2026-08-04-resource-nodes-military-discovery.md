# Resource Nodes And Military Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make stone and luxury deposits visible and buildable, densify mountain rubble seams, and expose unit research and heroes directly from the HUD.

**Architecture:** Keep the committed fixed map and save schema unchanged. Apply clean runtime building overrides for 1×1 quarries, resolve resource-node art through pure presentation helpers, compose extra deterministic rubble sprites, and add HUD buttons that reuse existing popup panels.

**Tech Stack:** ES modules, PixiJS 8, DOM panels, JSON runtime overrides, PNG assets, Node test runner, Playwright Chromium.

## Global Constraints

- Preserve the 400 stone nodes and 60 luxury nodes already committed to `config/maps/base_map.json`.
- Keep all 20 luxury types at 3 deposits each.
- Do not modify or stage dirty parallel-process configuration or `tmp/`.
- Use `config/building-runtime-overrides.json` for quarry footprint changes.
- Use `assets/resource-nodes/luxuries/<luxuryId>.png` for map icons.
- Every runtime behavior change starts with a failing test.

---

### Task 1: One-Cell Quarry Runtime Contract

**Files:**
- Modify: `config/building-runtime-overrides.json`
- Modify: `test/node/resource-nodes.test.mjs`

**Interfaces:**
- Consumes: `ConfigRegistry._applyBuildingRuntimeOverrides()` deep-merges `footprint` onto building records.
- Produces: runtime `stope.footprint` and `stone_quarry.footprint` equal `{ width: 1, height: 1 }`.

- [ ] Add a test loading the runtime overrides and asserting both quarry IDs are 1×1.
- [ ] Run `node --test test/node/resource-nodes.test.mjs` and observe the 2×2 mismatch.
- [ ] Add explicit 1×1 footprints for both IDs to `config/building-runtime-overrides.json`.
- [ ] Extend the real placement fixture so a quarry placed exactly on one `stone` node succeeds and an adjacent empty `R` cell fails.
- [ ] Run the focused resource-node tests until green.

### Task 2: Stone And Luxury Square Markers

**Files:**
- Modify: `src/rendering/MapPresentation.js`
- Modify: `src/rendering/MapRenderer.js`
- Modify: `test/node/map-presentation.test.mjs`

**Interfaces:**
- Produces: `getResourceNodeArtPath(node, definition, luxury)` returning the runtime texture path.
- Produces: `getResourceNodeGroundStyle()` returning `shape: 'square'` for `stone` and `luxury`.

- [ ] Add failing tests that stone uses `assets/resource-nodes/stone.png`, every luxury ID maps to `assets/resource-nodes/luxuries/<id>.png`, and both marker shapes are square.
- [ ] Run the focused presentation tests and verify the missing resolver/wrong shapes fail.
- [ ] Implement the resolver and square marker styles with distinct stone and purple-gold luxury borders.
- [ ] Update resource-node preloading and rendering to use the resolver, a rounded single-cell square, and the existing developed-node transparency.
- [ ] Run the focused presentation tests until green.

### Task 3: Twenty Luxury PNG Assets

**Files:**
- Create: `assets/resource-nodes/luxuries/silk.png` through `cotton.png`
- Modify: `test/node/historical-icon-assets.test.mjs`

**Interfaces:**
- Consumes: the path contract from Task 2.
- Produces: 20 transparent, decodable square PNGs.

- [ ] Add a failing asset test requiring all 20 runtime luxury PNG paths to exist, decode, and contain a non-empty alpha channel.
- [ ] Generate four 5-subject asset boards with native image generation in one historical 2.5D style.
- [ ] Inspect every board, slice only after verifying module boundaries, and export the 20 named PNGs.
- [ ] Verify alpha extrema and visually inspect a contact sheet.
- [ ] Run the focused asset test until green.

### Task 4: Denser Mountain Rubble Seams

**Files:**
- Modify: `src/rendering/MapPresentation.js`
- Modify: `test/node/map-presentation.test.mjs`

**Interfaces:**
- Consumes: `getMountainRubbleSpriteModels(mapConfig, col, row, tileSize)`.
- Produces: two `right` fillers and two `bottom` fillers for each corresponding shared edge.

- [ ] Change the seam test to require two right-edge and two bottom-edge rubble models with stable results.
- [ ] Run the focused test and observe the old one-per-edge count fail.
- [ ] Generate two stable positions per shared edge using separate coordinate-hash salts.
- [ ] Confirm all models cross their intended shared edge and remain below pillars in depth order.
- [ ] Run the focused presentation test until green.

### Task 5: HUD Unit Research And Hero Directory

**Files:**
- Modify: `index.html`
- Modify: `src/ui/HUD.js`
- Modify: `src/ui/panels/tavern-heroes-panel.js`
- Modify: `test/browser-smoke.spec.js`

**Interfaces:**
- Produces: `#btn-unit-research` opening `unit_research`.
- Produces: `#btn-heroes` opening `tavern_heroes`.
- Produces: `[data-testid="tavern-required-guidance"]` when no active tavern exists.

- [ ] Extend Chromium smoke acceptance to click both new buttons, assert their panel titles, and assert the no-tavern construction guidance.
- [ ] Run the browser test and verify it fails because the buttons do not exist.
- [ ] Add the two bottom-bar buttons and bind them in `HUD`.
- [ ] Add the locked tavern guidance, keep the recruited roster visible, and disable offer recruitment when no tavern is active.
- [ ] Run Chromium acceptance and capture the two panels.

### Task 6: Full Acceptance And Isolated Commit

**Files:**
- Create: `docs/RESOURCE_NODE_DISCOVERY_ACCEPTANCE_2026-08-04.md`
- Modify: `test/browser-smoke.spec.js`

**Interfaces:**
- Produces: screenshots for stone/luxury markers, unit research, and hero guidance.

- [ ] Move the browser camera to visible stone and luxury nodes with fog hidden only for QA, then capture screenshots.
- [ ] Run `npm.cmd run check` and require zero failures.
- [ ] Run `npm.cmd run test:browser` and require 1/1 pass with no browser errors.
- [ ] Document node counts, asset paths, placement contract, UI routes, screenshots, and test evidence.
- [ ] Stage only owned files, run `git diff --cached --check`, confirm dirty parallel configs remain unstaged, and commit.
