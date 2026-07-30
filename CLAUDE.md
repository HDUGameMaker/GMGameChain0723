# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🔰 接力棒开发工作流（首次对话必做，优先于任何用户请求）

本项目采用多人"接龙"式协作开发：每位开发者称为一"棒"（第1棒、第2棒、第3棒……），按棒次接力开发，并通过交接文档传递上下文。

**当一位开发者在 AI 集成 IDE 中开启本项目的首次对话时，AI 必须在执行任何用户请求之前，先完成以下"接棒初始化"流程：**

1. **分析项目**：通读 `CLAUDE.md` / `AGENT.md` / `README.md` / `docs/` 设计文档，以及当前代码结构（`src/systems/`、`config/`、`src/ui/panels/` 等），理解项目现状。

2. **梳理前几棒干了什么**：阅读根目录下的交接/更新文档（命名规律：`给第N棒的.md`、`第N棒update.md`、`N.NN Update.md`、`docs/人文树设计文档.md` 等），结合 `git log`，总结到上一棒为止已完成的功能与遗留问题，判断当前是第几棒。

3. **确定本棒该干什么**：基于上一棒留下的待办（Bug 修复、未完成功能、设计愿景），明确当前这一棒的工作重点候选。

4. **生成本棒开发者身份信息文件**：在项目根目录创建 `第N棒开发者身份信息.md`（N = 当前棒次），内容包括：身份、项目概览、结构要点、架构铁律、技术约束、上一棒交接的待办与已知问题、可扩展功能定位表、必读文档索引、工作准则、环境备忘。**参照已存在的 `第五棒开发者身份信息.md` 的结构。**

5. **加入 `.gitignore`**：将该身份信息文件加入 `.gitignore`（仅本地参考，不入库），并用 `git check-ignore` 验证。

6. **完成以上 1~5 步后，才开始执行用户首次对话中要求的内容。**

> ⚡ **初始化判定**：上述流程只在"首次对话"时执行。**判定标准——项目根目录是否已存在 `第N棒开发者身份信息.md` 文件**：
> - 若**不存在**：当前开发者尚未初始化，必须先跑完整套接棒初始化流程。
> - 若**已存在**：表明该开发者的身份信息文件已生成、初始化已完成，**后续对话不再重复此流程**，直接响应开发者的请求即可。

> 🏁 **当前棒次 / 开发结束判定**（重要，避免误判棒次）：
> - **当前棒次** = 当前已存在的最高棒次身份信息文件 N。例如根目录有 `第五棒开发者身份信息.md`、但没有 `给第六棒的.md`，则当前仍在**第5棒**。
> - **只有当当前开发者明确要求"为下一位（第 N+1 棒）开发者生成交接文档"，且该交接文档（`给第N+1棒的.md`，建议同时配 `第N棒update.md` 更新日志）已在根目录生成时，才表明第 N 棒的开发工作正式结束、棒次推进到第 N+1 棒。**
> - 即：身份信息文件 + 交接文档二者**同时**满足才视为本棒收尾。仅有身份信息而无交接文档 → 本棒尚未结束，仍属当前棒次。

> 该流程的意义：让每位接棒者在动手前完整继承前人的上下文与待办，避免重复劳动、踩已知坑、丢失设计意图。身份信息文件不入库是为了保持仓库整洁，仅作本地备忘。

---

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
- **AlchemySystem** manages potion brewing: experiment engine (weighted scoring of material elements × potency × base bias → top-3 random selection → quality thresholds), recipe discovery, five-salt auxiliary system (void/moon/sun/life/philosopher), Magnum Opus five-stage progression (Nigredo→Albedo→Citrinitas→Rubedo→Philosopher's Stone), and active potion effects that modify Combat/Building/Population systems. All alchemy data lives in `config/alchemy.json`.

## Project Layout

```
config/                 ← JSON game data (buildings, resources, items, maps, events, expeditions, torches, sound, alchemy)
  buildings.json        ← Add new buildings here, no code changes needed
  resources.json        ← Add new resources here, auto-recognized by ResourceSystem
  buildings.json        ← Building & torch type definitions (torches marked with isTorch: true)
  sound.json            ← BGM/SFX definitions + SFX event bindings + BGM event bindings
  alchemy.json          ← Alchemy config: 24 materials, 25+ recipes, 23 effects, 5 MagnumOpus stages, 5 salts, 3 bases
  events/               ← Add new events here following existing schema
  expeditions/          ← Expedition regions and global params
  maps/base_map.json    ← Grid layout, initial buildings, expedition entrance, initial torches
lib/                    ← Third-party (pixi.min.js, gsap.min.js)
scripts/                ← Build/dev scripts (generate-asset-manifest.js)
src/
  main.js               ← Entry point: init PixiJS → load config → wire systems → start loop
  GameLoop.js           ← rAF-driven loop with multi-layer pause support
  core/                 ← EventBus, ConfigRegistry, Store, SaveManager (all singletons)
  systems/              ← TimeSystem, ResourceSystem, BuildingSystem, PopulationSystem,
                          ItemSystem, EventSystem, ExpeditionSystem, TorchSystem, AudioSystem,
                          RoadSystem, TechSystem, CultureSystem, AlchemySystem, CombatSystem, WeatherSystem
  rendering/            ← MapRenderer (PixiJS drawing of grid, buildings, expedition entrances,
                          torches, fog-of-war via Canvas 2D offscreen texture)
  ui/                   ← HUD.js, PopupManager.js, MessageLog.js, panels/ (one render function per popup type)
                          panels/ includes: alchemy-panel.js, potion-inventory-panel.js
  utils/                ← gridUtils.js (coordinate conversion, euclideanDistance), ProgressManager.js
docs/                   ← Design documents (read before modifying game logic)
planner-config.html     ← Config editor HTML shell (CSS + layout)
planner/                ← Config editor JS (8 files: core/render/map-draw/map-edit/forms/actions/analysis/main)
artist-config.html      ← Art config editor (standalone single-file)
sound-config.html       ← Sound config editor HTML shell
sound-editor/           ← Sound config editor JS (4 files: core/render/actions/main)
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

Certain popups **block the game loop** (pause) while open: `event`, `expedition_prep`. Others do not: `building_select`, `building_detail`, `settings`, `expedition_detail`, `alchemy_lab`, `potion_inventory`. GameLoop uses a multi-layer pause counter — each blocking popup increments it, each close decrements; game resumes only when count hits zero.

## Adding Features (Quick Reference)

| Task | Where |
|------|-------|
| New building type | `config/buildings.json` only |
| New resource type | `config/resources.json` only |
| New torch type | `config/buildings.json` — add `isTorch: true` + torch fields |
| New sound effect | `config/sound.json` — add SFX entry + event binding |
| New BGM event binding | `config/sound.json` — add entry in `bgmBindings[]` or use sound-config editor |
| Change audio volumes | Settings panel (persisted) or `config/sound.json` (defaults) |
| New event | `config/events/` — follow existing schema |
| New popup/panel | `src/ui/panels/xxx-panel.js` + register in `PopupManager._registerBuiltinPanels()` |
| New event effect handler | `EventSystem._registerBuiltinEffects()` via `registerEffect()` |
| New alchemy material/recipe/effect | `config/alchemy.json` only — materials, recipes, effects, salts, magnumOpus |
| New alchemy panel or UI | `src/ui/panels/alchemy-panel.js` or `potion-inventory-panel.js` + register in `PopupManager._registerBuiltinPanels()` |
| Modify alchemy formulas | `AlchemySystem._calculateExperimentResult()` — scoring/selection logic |
| Modify potion effects on systems | `AlchemySystem.getEffects()` returns modifiers; CombatSystem/BuildingSystem/PopulationSystem read them |
| New map element rendering | `MapRenderer` — add draw method + click detection in `_onClick` |
| Modify resource caps | `ResourceSystem.getMaxResourceCapacity()` — cap = config max × warehouse multiplier |
| Modify torch behavior | `TorchSystem` — fuel consumption in `onPeriodEnd()`, upgrade in `onTick()`, visibility in `getVisibilityMatrix()` |
| Modify BGM switching | `AudioSystem._bindGameEvents()` — reads `bgmBindings[]` from `sound.json`, supports `periods` filter |
| Modify fog rendering | `MapRenderer._updateFogTexture()` — Canvas 2D radialGradient + destination-out |
| Modify map editor | `planner/planner-config-map-edit.js` (interaction/tools/undo) + `planner/planner-config-map-draw.js` (Canvas rendering) + `planner/planner-config-forms.js` (form binding) — Canvas 2D brush editor: `drawMapCanvas()` layers, `setTile()`, `handleBuildingClick()`, `setMapEditorMode()` |

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
| `config-editors-design.md` | **Config editors (planner, artist & sound).** Planner: HTML shell + 8 JS files in `planner/` with File System Access API auto-save, 7 tabs covering buildings/resources/items/events/expeditions/map/analysis. Map tab: Canvas 2D brush editor with terrain painting, interactive building placement (footprint preview), entrance drag-to-edit, zoom/pan with viewport culling. Artist: standalone single-file editor with color palette, label layout preview, asset reference scanning. Sound: HTML shell + 4 JS files, 5 tabs (BGM/SFX/SFX bindings/BGM bindings/settings), audio preview, File System Access API auto-save. |
| `炼金的三重镜像——翠玉录·Noita·药剂工艺完全整理.md` | **Alchemy design research.** Source material for the alchemy system: Emerald Tablet philosophy (elements, Magnum Opus stages), Noita material reaction system (element interaction), Potion Craft workflow (base→material→process→output). Read this for the design rationale behind the alchemy system's material system, experiment engine, and five-salt auxiliary mechanics. |
| `config/alchemy.json` | **Alchemy configuration reference.** Complete alchemy data: 24 materials (5 elements × 4 rarities × 3 categories), 25+ recipes (10 levels), 23 effects (with combat/building/population modifiers), 5 Magnum Opus stages, 5 salts, 3 bases, and global tuning parameters (XP table, quality thresholds, experiment scores). |

## Reference: AGENT.md

The file `AGENT.md` contains the detailed API reference: complete EventBus event list with payloads, Store state keys with types, every System's public method signatures, save data schema, and more. Consult it when working with system internals.
