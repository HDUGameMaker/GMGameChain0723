# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## How to Run

```bash
node scripts/generate-asset-manifest.js && npx http-server -p 8080 -c-1 --cors
# Then open http://127.0.0.1:8080
```

Must use an HTTP server — `fetch()` loads JSON config files, so `file://` won't work. No build step; ES Modules run directly in the browser.

## Tech Stack

| Concern | Technology |
|---------|------------|
| 2D rendering | PixiJS **v8** (WebGL/Canvas) — global `PIXI` |
| Animation | GSAP — global `gsap` |
| UI | Vanilla DOM (no React/Vue/Angular) |
| State | Custom EventBus + Store singletons |
| Persistence | IndexedDB + localStorage emergency backup |
| Config | JSON files in `config/`, loaded via `fetch()` |
| Build | None — native ES Modules (`<script type="module">`) |

## Architecture

```
Layer 1: DOM UI           → src/ui/        (HUD, PopupManager, panels/)
Layer 2: Game Systems     → src/systems/   (pure logic, no DOM)
Layer 3: PixiJS Render    → src/rendering/  (read-only from state)
Layer 4: Data/Infra       → src/core/       (EventBus, ConfigRegistry, Store, SaveManager)
```

**Data flow is unidirectional:**
```
User interaction → PopupManager/HUD → System API → Store state change → UI re-render
GameLoop (rAF)  → TimeSystem.update() → tick event → each System settles → Store → UI
```

**Key architectural rules:**
- Each System has **exclusive write access** to its domain; all modifications go through System APIs.
- `MapRenderer` is **read-only** — it reads state to draw but never mutates game data.
- Systems communicate via `EventBus` events and `Store` state subscriptions, never by direct cross-references (except for the few wired in `main.js` during initialization).
- All game numeric values live in `config/*.json`; code should never hardcode tuning parameters.
- **TorchSystem** manages fog-of-war: torches illuminate circular areas (Euclidean distance), hidden tiles block interaction/building. Fog visual uses **Canvas 2D offscreen** (`createRadialGradient` + `destination-out`) → `PIXI.Texture` → `PIXI.Sprite` overlay, NOT PixiJS mask.

## Project Layout

```
config/                 ← JSON game data (buildings, resources, items, maps, events, expeditions, torches)
  buildings.json        ← Add new buildings here, no code changes needed
  resources.json        ← Add new resources here, auto-recognized by ResourceSystem
  buildings.json        ← Building & torch type definitions (torches marked with isTorch: true)
  events/               ← Add new events here following existing schema
  expeditions/          ← Expedition regions and global params
  maps/base_map.json    ← Grid layout, initial buildings, expedition entrance, initial torches
lib/                    ← Third-party (pixi.min.js, gsap.min.js)
src/
  main.js               ← Entry point: init PixiJS → load config → wire systems → start loop
  GameLoop.js           ← rAF-driven loop with multi-layer pause support
  core/                 ← EventBus, ConfigRegistry, Store, SaveManager (all singletons)
  systems/              ← TimeSystem, ResourceSystem, BuildingSystem, PopulationSystem,
                          ItemSystem, EventSystem, ExpeditionSystem, TorchSystem
  rendering/            ← MapRenderer (PixiJS drawing of grid, buildings, expedition entrances,
                          torches, fog-of-war via Canvas 2D offscreen texture)
  ui/                   ← HUD.js, PopupManager.js, panels/ (one render function per popup type)
  utils/                ← gridUtils.js (coordinate conversion, euclideanDistance), ProgressManager.js
docs/                   ← Design documents (read before modifying game logic)
```

## Key Constraints

1. **No frameworks** — all UI is hand-written DOM manipulation.
2. **No build tools** — everything is native ES Modules (`import`/`export`).
3. **PixiJS v8 (not v7)** — `new Application()` then `await app.init({...})`. Graphics API changed: `graphics.rect(x,y,w,h).fill({color, alpha})` and `.stroke({color, width, alpha})` are separate calls (can't chain fill+stroke on one rect). Text is `new PIXI.Text({text, style: {fontSize, fill}})`.
4. **Configuration-driven** — game balance belongs in JSON, not JS.
5. **Systems own their data** — external code never mutates a system's internal state directly.

## Game Loop & Time Model

```
PERIOD_NAMES = [morning, afternoon, evening, night]   (4 periods per day)
WORK_PERIODS = [morning, afternoon]                    (buildings only produce during these)
```

The loop: `requestAnimationFrame` → `TimeSystem.update(delta)` accumulates real time → when tick interval elapses, emits `tick` → each System responds to `tick`. At period boundaries, `periodEnd` fires (auto-save trigger), then `periodChange` and potentially `dayStart`.

## Coordinate System

- Origin `(0,0)` is top-left. `gridX` = column (right), `gridY` = row (down).
- `screenX = gridX * tileSize`, `screenY = gridY * tileSize` where `tileSize = 64px`.
- Map is 20 columns × 15 rows.

## Popup Modal Rules

Certain popups **block the game loop** (pause) while open: `event`, `expedition_prep`. Others do not: `building_select`, `building_detail`, `settings`, `expedition_detail`. GameLoop uses a multi-layer pause counter — each blocking popup increments it, each close decrements; game resumes only when count hits zero.

## Adding Features (Quick Reference)

| Task | Where |
|------|-------|
| New building type | `config/buildings.json` only |
| New resource type | `config/resources.json` only |
| New torch type | `config/buildings.json` — add `isTorch: true` + torch fields |
| New event | `config/events/` — follow existing schema |
| New popup/panel | `src/ui/panels/xxx-panel.js` + register in `PopupManager._registerBuiltinPanels()` |
| New event effect handler | `EventSystem._registerBuiltinEffects()` via `registerEffect()` |
| New map element rendering | `MapRenderer` — add draw method + click detection in `_onClick` |
| Modify resource caps | `ResourceSystem.getMaxResourceCapacity()` — cap = config max × warehouse multiplier |
| Modify torch behavior | `TorchSystem` — fuel consumption in `onPeriodEnd()`, upgrade in `onTick()`, visibility in `getVisibilityMatrix()` |
| Modify fog rendering | `MapRenderer._updateFogTexture()` — Canvas 2D radialGradient + destination-out |
| Modify map editor | `planner-config.html` — Canvas 2D brush editor: `drawMapCanvas()` layers, `setTile()`, `handleBuildingClick()`, `setMapEditorMode()` |

## Design Documents (`docs/`)

Each design doc covers one subsystem in depth. Read the relevant doc before modifying that subsystem's logic.

| Document | Covers |
|----------|--------|
| `architecture-plan.md` | **Overall blueprint.** 5-layer architecture (UI / Systems / Render / Data / Config Editors), data flow diagram, every subsystem at a glance, HUD layout specs, mobile/fullscreen behavior, and phased development roadmap. Start here for the big picture. |
| `map-and-building-revision.md` | **Map & building interaction.** Decision to go 2D top-down (not isometric), grid coordinate system, building placement state machine (`IDLE → SELECTING → PLACING → PLACED → ACTIVE`), ghost preview + validity highlighting, ground types (`G/D/F/R/M/W`) with `buildable` tri-state and per-building `allowedGrounds`, and complete `buildings.json` field reference. |
| `resource-item-system-api.md` | **Resource & item system APIs.** ResourceSystem: `add`/`tryConsume`/`setMax`/`getHUDResources`, validation flows, storage cap formula (config max × warehouse multiplier). ItemSystem: instance-based model (`instanceId`, `equipped`, `inExpedition` states), `obtain`/`lose`/`equip`/`unequip`/`markExpedition`/`returnFromExpedition`, `unique` vs `consumable` semantics, `expeditionEffects` types and stacking. |
| `event-system-design.md` | **Event system.** Trigger conditions (3 fields AND for base, 5 fields AND for expedition), invalidation conditions (OR), chain-only events (empty conditions + probability=1), global probability system (single roll per tick + weighted candidate pool), event processing queue (serialized, dedup by id), effect types (`add_resource`/`consume_resource`/`obtain_item`/`consume_item`/`unlock_building`/`trigger_event`/`schedule_event`), and branch-narrative patterns with `trigger_event` + `schedule_event`. |
| `expedition-system-design.md` | **Expedition system.** Three-slot sequential region selection with auto-advance, dual-capacity (backpack for items, resource pool for yields), output formula (base yield × item multipliers + flat bonuses, truncated by capacity), expedition lifecycle (N periods of ticks, base runs concurrently), item synthesis bound to workshop buildings, region unlock via OR-logic (item OR building conditions). |
| `popup-system-design.md` | **Popup system.** Unified chrome (header/body/footer) + navigation stack (`open`/`push`/`pop`/`close`), panel registration pattern (render function signature: `(data, bodyElement, popupManager) => void`), blocking vs non-blocking popup types, GSAP entry animations, CSS design tokens (glassmorphism), and step-by-step guide for adding new panels. |
| `save-system-design.md` | **Save system.** Single-slot IndexedDB save, auto-save on `periodEnd` + emergency `beforeunload` localStorage backup, complete save data schema (time/resources/items/buildings/expedition/events), versioned migration path, load vs new-game initialization flow. |
| `progress-bar-system-design.md` | **Progress bar system.** Single rAF-driven `ProgressManager` singleton that smooth-interpolates discrete tick progress using `timeProgress` (0→1). Two modes: DOM (width-based) and callback (for PIXI Graphics). Covers HUD tick bar, build progress, synthesis progress, expedition progress. |
| `label-layout-config.md` | **Building label layout.** Per-building `labelLayout` config in `buildings.json` (`nameOffsetY`/`progressBarOffsetY`/`workersOffsetY`) to fine-tune name/progress/worker text positions on the map. Default layout described for 1×1 buildings. |
| `config-editors-design.md` | **Config editors (planner & artist).** Single-file HTML editors with File System Access API auto-save. Planner: 7 tabs for buildings/resources/items/events/expeditions/map/analysis. Map tab: Canvas 2D brush editor with terrain painting, interactive building placement (footprint preview), entrance drag-to-edit, zoom/pan with viewport culling. Artist: color palette, label layout preview, asset reference scanning. |

## Reference: AGENT.md

The file `AGENT.md` contains the detailed API reference: complete EventBus event list with payloads, Store state keys with types, every System's public method signatures, save data schema, and more. Consult it when working with system internals.
