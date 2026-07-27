# AGENTS.md

This file provides guidance to Qoder (qoder.com) when working with code in this repository.

## 🔰 接力棒开发工作流（首次对话必做，优先于任何用户请求）

本项目采用多人"接龙"式协作开发：每位开发者称为一"棒"（第1棒、第2棒、第3棒……），按棒次接力开发，并通过交接文档传递上下文。

**当一位开发者在 AI 集成 IDE 中开启本项目的首次对话时，AI 必须在执行任何用户请求之前，先完成以下"接棒初始化"流程：**

1. **分析项目**：通读 `CLAUDE.md` / `AGENT.md` / `README.md` / `docs/` 设计文档与当前代码结构（`src/systems/`、`config/`、`src/ui/panels/` 等），理解项目现状。

2. **梳理前几棒干了什么**：阅读根目录下的交接/更新文档（命名规律：`给第N棒的.md`、`第N棒update.md`、`N.NN Update.md`、`docs/人文树设计文档.md` 等），结合 `git log`，总结到上一棒为止已完成的功能与遗留问题，判断当前是第几棒。

3. **确定本棒该干什么**：基于上一棒留下的待办（Bug 修复、未完成功能、设计愿景），明确当前这一棒的工作重点候选。

4. **生成本棒开发者身份信息文件**：在项目根目录创建 `第N棒开发者身份信息.md`（N = 当前棒次），内容参照已存在的 `第五棒开发者身份信息.md` 的结构（身份 / 项目概览 / 结构要点 / 架构铁律 / 技术约束 / 上一棒交接的待办与已知问题 / 可扩展功能定位表 / 必读文档索引 / 工作准则 / 环境备忘）。

5. **加入 `.gitignore`**：将该身份信息文件加入 `.gitignore`（仅本地参考，不入库），并用 `git check-ignore` 验证。

6. **完成以上 1~5 步后，才开始执行用户首次对话中要求的内容。**

> ⚡ **初始化判定**：上述流程只在"首次对话"时执行。**判定标准——项目根目录是否已存在 `第N棒开发者身份信息.md` 文件**：
> - 若**不存在**：当前开发者尚未初始化，必须先跑完整套接棒初始化流程。
> - 若**已存在**：表明该开发者的身份信息文件已生成、初始化已完成，**后续对话不再重复此流程**，直接响应开发者的请求即可。

> 该流程让每位接棒者在动手前完整继承前人的上下文与待办，避免重复劳动、踩已知坑、丢失设计意图。身份信息文件不入库，仅作本地备忘。

---

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
