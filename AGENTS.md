# AGENTS.md

This file provides guidance to Qoder (qoder.com) when working with code in this repository.

## Running the Project

```bash
npx http-server -p 8080 -c-1 --cors
# Open http://127.0.0.1:8080
```

Must use HTTP server — `fetch()` loads JSON configs, `file://` won't work. No build step, no tests, no linter.

## Tech Stack & Constraints

- **PixiJS v8** (global `PIXI`) for 2D rendering, **GSAP** (global `gsap`) for animation
- **No frameworks** (no React/Vue/Angular) — all UI is hand-written DOM
- **No build tools** (no webpack/vite) — native ES Modules via `<script type="module">`
- **Configuration-driven** — all game numeric values in `config/*.json`, code never hardcodes tuning parameters
- Persistence: IndexedDB (primary) + localStorage (emergency `beforeunload` backup)

## Architecture

```
Layer 1: DOM UI           → src/ui/ (HUD, PopupManager, panels/)
Layer 2: Game Systems     → src/systems/ (pure logic, no DOM manipulation)
Layer 3: PixiJS Render    → src/rendering/MapRenderer.js (read-only from state)
Layer 4: Data/Infra       → src/core/ (EventBus, ConfigRegistry, Store, SaveManager — all singletons)
```

**Data flow is unidirectional:**
```
User interaction → PopupManager/HUD → System API → Store/EventBus → UI re-render
GameLoop (rAF)  → TimeSystem.update() → tick event → each System settles → Store → UI
```

**Key rules:**
- Each System has **exclusive write access** to its domain; external code only calls System APIs
- `MapRenderer` is **read-only** — draws state, never mutates game data
- Systems communicate via `EventBus` events and `Store` subscriptions, not direct cross-references (except wiring in `main.js` at init)
- `GameLoop` uses a multi-layer pause counter — blocking popups (`event`, `expedition_prep`) increment it; game resumes only when count hits zero

## PixiJS v8 API Gotchas

- Init: `new Application()` then `await app.init({...})` (not v7's constructor options)
- Graphics: `graphics.rect(x,y,w,h).fill({color, alpha})` and `.stroke({color, width, alpha})` are **separate calls** — cannot chain fill+stroke on one shape, must draw twice
- Text: `new PIXI.Text({ text: '...', style: { fontSize, fill } })` (object constructor, not positional args)

## Coordinate System

- Origin `(0,0)` top-left; `gridX` = column (→), `gridY` = row (↓)
- `screenX = gridX * 64`, `screenY = gridY * 64` (tileSize = 64px)
- Map: 20 columns × 15 rows

## Time Model

```
4 periods/day: [morning, afternoon, evening, night]
Buildings produce only during WORK_PERIODS = [morning, afternoon]
PERIOD_DURATION = 120s real time, TICK_INTERVAL = 40s, 3 ticks per period
```

## Adding Features

| Task | Where |
|------|-------|
| New building/resource type | `config/buildings.json` / `config/resources.json` only — no code changes |
| New event | `config/events/` — follow existing JSON schema |
| New popup panel | Create `src/ui/panels/xxx-panel.js` exporting `renderXxxPanel(data, body, pm)`, register in `PopupManager._registerBuiltinPanels()` via dynamic import |
| New event effect type | `EventSystem._registerBuiltinEffects()` → `this.registerEffect('type', handler)` |
| New map element | `MapRenderer` — add draw method + click detection in `_onClick` |
| Modify resource caps | `ResourceSystem.getMaxResourceCapacity()` — cap = config max × warehouse `storageMultiplier` |

## Design Documents

Read the relevant doc in `docs/` before modifying a subsystem's logic. Key ones:
- `architecture-plan.md` — overall blueprint and phased roadmap
- `map-and-building-revision.md` — grid system, placement state machine, ground types
- `event-system-design.md` — trigger conditions, effect types, event queue
- `expedition-system-design.md` — region selection, yield formula, lifecycle
- `popup-system-design.md` — panel registration pattern, blocking rules
- `save-system-design.md` — save schema, auto-save triggers, migration

## Detailed API Reference

See `AGENT.md` for complete EventBus event list with payloads, Store state keys, and every System's public method signatures.
