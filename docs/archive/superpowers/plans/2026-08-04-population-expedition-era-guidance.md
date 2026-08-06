# Population Expedition And Era Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make civilian workers permanent under food shortage, add repeatable headquarters construction, gate cave exploration with an exploration camp instead of roads, expose complete era advancement guidance, and redraw mountains as varied piles of individual grid-scale rocks.

**Architecture:** Population loss is removed at its daily settlement source. Exploration content is isolated in a new config merged by `ConfigRegistry`; `BuildingSystem` owns the entrance-placement contract, while the click handler owns expedition authorization. `EraSystem` exposes a presentation-neutral requirements snapshot consumed by the panel.

**Tech Stack:** Native ES modules, JSON configuration, Node test runner, DOM panels, Playwright.

## Global Constraints

- Preserve and do not stage `config/historical_content.json`, `assets/map/generated/`, `tmp/`, or unrelated dirty configuration.
- Write a failing behavior test before each production change.
- Use the existing four-resource economy and canonical building categories.

---

### Task 1: Permanent Civilian Population

**Files:**
- Modify: `test/node/population-workforce.test.mjs`
- Modify: `src/systems/PopulationSystem.js`

**Interfaces:**
- Consumes: `PopulationSystem.onDayStart()` with insufficient food.
- Produces: stable `current`, reduced satisfaction, zero food and no growth.

- [x] Change the shortage test to require unchanged population after repeated zero-food days and run it to observe the current population-loss failure.
- [x] Remove only food-shortage emigration/death and population-zero game over from daily settlement.
- [x] Run the focused population suite.

### Task 2: Repeatable Headquarters And Exploration Camp

**Files:**
- Create: `config/exploration-buildings.json`
- Create: `config/building-runtime-overrides.json`
- Modify: `src/core/ConfigRegistry.js`
- Modify: `src/systems/BuildingSystem.js`
- Modify: `src/main.js`
- Modify: `src/ui/panels/building-detail-panel.js`
- Modify: `config/quests.json`
- Create: `assets/buildings/exploration_camp.png`
- Create: `assets/historical-icons/buildings/exploration_camp.svg`
- Create: `test/node/exploration-camp.test.mjs`

**Interfaces:**
- Consumes: fixed-map `expeditionEntrances` and active building instances.
- Produces: `BuildingSystem.getExpeditionEntranceForBuilding(index)` and `hasExplorationCampAt(entrance)`.

- [x] Write tests requiring repeatable warehouse construction, exact entrance placement, bare-cave rejection and road-free camp exploration; run red.
- [x] Add and merge the two isolated configs, then implement the placement and lookup contracts.
- [x] Replace the road gate with exploration-camp authorization and add the building-detail action.
- [x] Generate and inspect exploration-camp art, wire both assets, and update tutorial wording.
- [x] Run focused building, tutorial and expedition tests.

### Task 3: Explicit Era Advancement Guidance

**Files:**
- Modify: `src/systems/EraSystem.js`
- Modify: `src/ui/panels/era-civilization-panel.js`
- Modify: `test/node/era-civilization.test.mjs`
- Create: `test/node/era-guidance-panel.test.mjs`

**Interfaces:**
- Produces: `EraSystem.getAdvancementRequirements()` with four requirement records and star source rows.

- [x] Write API and DOM tests requiring all four conditions, literal progress and star-source help; run red.
- [x] Implement the requirements snapshot and render a visible checklist above the advancement button.
- [x] Run focused era tests.

### Task 4: Grid-Scale Mountain Rock Piles

**Files:**
- Modify: `src/rendering/MapPresentation.js`
- Modify: `src/rendering/MapRenderer.js`
- Modify: `test/node/map-presentation.test.mjs`
- Modify: `test/browser-smoke.spec.js`

- [x] Replace depth-based contour fill bands with stable mountain foundations.
- [x] Add deterministic 1–2 rock foothill tiles and 2–3 rock ridge tiles with varied silhouettes and palettes.
- [x] Render each rock from trapezoid top, sloped front and shaded side faces without large terrain art.
- [x] Add model tests and a browser screenshot focused on a large mountain group.

### Task 5: Full Acceptance

**Files:**
- Modify: `test/browser-smoke.spec.js`
- Create: `docs/POPULATION_EXPLORATION_ERA_GUIDANCE_ACCEPTANCE_2026-08-04.md`

- [x] Add browser assertions for the exploration camp, era checklist and mountain rock layer.
- [x] Run all Node tests, syntax checking and Chromium smoke on the final tree.
- [x] Verify staged files exclude parallel work, write acceptance evidence and commit only this task.
