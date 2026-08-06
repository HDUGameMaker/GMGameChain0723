# RTS × SLG Historical Grand Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有历史文明原型升级为以人口岗位、时代双树、军团移动、城邦外交和大地图扩张为核心的可运行 RTS×SLG 游戏。

**Architecture:** 保留 EventBus、Store、系统类和 JSON 配置模式；新增 ArmySystem、EconomyOrderSystem、TradeSystem、FactionSystem 与 EraMusicDirector。MapRenderer 只订阅状态事件并渲染。存档使用 v8 迁移链。

**Tech Stack:** 原生 ES Modules、PixiJS 8、GSAP、Node `node:test`、JSON、SVG/PNG/WebP、HTML5 Audio。

## Global Constraints

- 直接在用户明确授权的 `GM GameChain2026` 主目录开发。
- 基础资源严格限制为 wood、stone、food、gold。
- 不引入构建工具或运行时网络依赖。
- 新增生产行为必须先写失败测试并观察 RED。
- 每个任务完成时运行相关测试；每个阶段运行 `npm.cmd run check`。
- 地图状态修改只能发生在系统层，MapRenderer 只读。
- 当前玩法文案不得出现炼金、法术、魔法词汇。

---

### Task 1: v8 内容契约与迁移骨架

**Files:**
- Create: `test/node/save-v8-migration.test.mjs`
- Create: `test/node/grand-overhaul-contract.test.mjs`
- Modify: `src/core/SaveManager.js`
- Modify: `src/main.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `SaveManager.CURRENT_VERSION === 8`；`migrateV7ToV8(save)`；v8 默认 `armies`、`economicOrders`、`tradeRoutes`、`factions`、`eraMusic`。

- [ ] **Step 1: Write failing v8 migration tests** asserting v7 wood, population, tech, civics, heroes and diplomacy survive while new v8 collections receive deterministic defaults.
- [ ] **Step 2: Run `node --test test/node/save-v8-migration.test.mjs`** and verify version/default assertions fail.
- [ ] **Step 3: Implement `migrateV7ToV8`** with explicit old-era mappings and add new state to `Game.saveGame()`/restore.
- [ ] **Step 4: Run migration and full save tests** and verify PASS.
- [ ] **Step 5: Add `npm run verify`** combining `npm run check` with content-contract validation.
- [ ] **Step 6: Commit** `feat: establish v8 grand overhaul state`.

### Task 2: 科技与人文的被动增长和有效节点

**Files:**
- Create: `test/node/research-passive-growth.test.mjs`
- Modify: `src/systems/TechSystem.js`
- Modify: `src/systems/CultureSystem.js`
- Modify: `config/historical-content.json`
- Modify: `src/ui/panels/tech-tree-panel.js`

**Interfaces:**
- Produces: `getPassiveRate(): number`；每 tick 基础 0.2；节点 `description`、`history`、`effects`、`unlocks`、`icon`。

- [ ] **Step 1: Write failing tests** proving zero-worker settlements gain exactly 0.2 science/civics per tick and staffed buildings add workforce output.
- [ ] **Step 2: Run the test** and verify current zero-worker expectation fails.
- [ ] **Step 3: Implement passive rates and normalized node metadata** without bypassing tree-lock buildings.
- [ ] **Step 4: Render effect and unlock summaries** in both tree panels.
- [ ] **Step 5: Add a contract assertion** rejecting nodes with no effective modifier or unlock.
- [ ] **Step 6: Run research tests and commit** `feat: make research trees continuously productive`.

### Task 3: 农作物、地图采集与人口作业

**Files:**
- Create: `config/economic-orders.json`
- Create: `src/systems/EconomyOrderSystem.js`
- Create: `src/ui/panels/economic-orders-panel.js`
- Create: `test/node/economic-orders.test.mjs`
- Modify: `src/systems/PopulationSystem.js`
- Modify: `src/systems/BuildingSystem.js`
- Modify: `src/ui/HUD.js`
- Modify: `src/main.js`

**Interfaces:**
- Produces: `createOrder({type,targetId,workers,recipeId})`；`assignWorkers(orderId,count)`；`getTickOutputs()`；`getState()`；`restoreState()`。

- [ ] **Step 1: Write failing tests** for unique worker allocation, eight crop recipes, map gathering, yield modifiers and save restoration.
- [ ] **Step 2: Run the test** and verify missing system failure.
- [ ] **Step 3: Implement EconomyOrderSystem** with shared population reservation and four-resource/luxury outputs.
- [ ] **Step 4: Add farm crop selection and gathering UI** reachable from HUD and building detail.
- [ ] **Step 5: Persist orders in v8 and reject over-assignment** with a visible reason.
- [ ] **Step 6: Run economy/population tests and commit** `feat: add staffed crops and gathering orders`.

### Task 4: 贸易、转换与建筑光环

**Files:**
- Create: `src/systems/TradeSystem.js`
- Create: `src/ui/panels/trade-routes-panel.js`
- Create: `test/node/trade-routes-aura.test.mjs`
- Modify: `config/adjacency-bonuses.json`
- Modify: `config/buildings.json`
- Modify: `src/systems/BuildingSystem.js`
- Modify: `src/ui/panels/building-detail-panel.js`
- Modify: `src/main.js`

**Interfaces:**
- Produces: `createRoute(outpostId,offer,want)`；`getRouteYield(routeId)`；`runConversion(buildingId,recipeId)`；`getAuraEffectsAt(x,y)`。

- [ ] **Step 1: Write failing tests** for friendly-only routes, distance/risk yield, daily conversion caps, radius/tag/cap aura stacking.
- [ ] **Step 2: Run the test** and verify missing trade/aura behavior.
- [ ] **Step 3: Implement TradeSystem and generalized aura evaluation** with no profitable conversion loop.
- [ ] **Step 4: Add market route UI and building aura tooltip** including affected neighbors.
- [ ] **Step 5: Persist routes and conversion counters** in v8.
- [ ] **Step 6: Run tests and commit** `feat: add trade routes conversions and building auras`.

### Task 5: 军团领域模型与数量上限

**Files:**
- Create: `src/systems/ArmySystem.js`
- Create: `test/node/army-system.test.mjs`
- Modify: `src/ui/panels/army-panel.js`
- Modify: `src/main.js`
- Modify: `src/core/Store.js`

**Interfaces:**
- Produces: `createArmy(name)`；`assignUnit(armyId,unitId,count)`；`assignCommander(armyId,heroId)`；`setFormation(armyId,formationId)`；`setTactics(armyId,tacticIds)`；`getArmyCap()`。

- [ ] **Step 1: Write failing tests** for base cap 2, building cap bonuses, unit population conservation, one commander per army and no duplicate hero assignment.
- [ ] **Step 2: Run the test** and verify current Store-only armies fail.
- [ ] **Step 3: Implement ArmySystem as source of truth** and migrate legacy Store arrays during restore.
- [ ] **Step 4: Refactor army panel** to consume ArmySystem and display cap, composition, morale, supply, commander, formation and tactics.
- [ ] **Step 5: Save/restore armies through v8**.
- [ ] **Step 6: Run tests and commit** `feat: make armies first class game entities`.

### Task 6: 军团路径、占领、驻扎与登船

**Files:**
- Create: `src/systems/ArmyMovementSystem.js`
- Create: `test/node/army-movement.test.mjs`
- Modify: `src/rendering/MapRenderer.js`
- Modify: `src/systems/TerritorySystem.js`
- Modify: `src/systems/BuildingSystem.js`
- Modify: `src/main.js`

**Interfaces:**
- Produces: `previewPath(armyId,x,y)`；`issueMove(armyId,x,y)`；`garrison(armyId,buildingId)`；`embark(armyId,portId)`；`disembark(armyId,x,y)`。

- [ ] **Step 1: Write failing tests** for land/water path legality, movement points, neutral occupation, hostile collision, garrison capacity and port-only embarkation.
- [ ] **Step 2: Run the test** and verify missing movement system.
- [ ] **Step 3: Implement deterministic A* pathing and commands** in ArmyMovementSystem.
- [ ] **Step 4: Remove friendly-unit coordinate mutation from MapRenderer** and render army tokens/path previews read-only.
- [ ] **Step 5: Add click-army/click-destination interaction** and garrison/embark actions.
- [ ] **Step 6: Run tests and commit** `feat: move and garrison armies on the world map`.

### Task 7: 六阶段战斗、阵型和战争策略

**Files:**
- Create: `config/formations.json`
- Create: `config/war-tactics.json`
- Create: `test/node/phased-army-combat.test.mjs`
- Modify: `src/systems/CombatResolver.js`
- Modify: `src/systems/CombatSystem.js`
- Modify: `src/ui/panels/combat-panel.js`

**Interfaces:**
- Produces: `resolveArmyBattle(attacker,defender,context)` returning `{winner,phases,casualties,morale,supply,modifiers}`.

- [ ] **Step 1: Write failing tests** for scouting, ranged, flank, front, siege and rout ordering plus spear/cavalry/archer counters.
- [ ] **Step 2: Run the test** and verify absent phase report.
- [ ] **Step 3: Implement phase resolver** using unit tags, terrain, supply, morale, formation, tactics and commander triggers.
- [ ] **Step 4: Add twelve universal tactics and eight formations** with unlock references.
- [ ] **Step 5: Render readable phase reports and casualty sources**.
- [ ] **Step 6: Run combat tests and commit** `feat: resolve battles in visible tactical phases`.

### Task 8: 营寨、要塞与大城堡

**Files:**
- Create: `test/node/fortifications.test.mjs`
- Modify: `config/buildings.json`
- Modify: `src/systems/BuildingSystem.js`
- Modify: `src/systems/ArmySystem.js`
- Modify: `src/rendering/MapRenderer.js`

**Interfaces:**
- Produces building ids `frontier_camp` (1×1), `field_fort` (2×2), `grand_fortress` (3×3); garrison slots, scouting, supply and zone-of-control effects.

- [ ] **Step 1: Write failing footprint, terrain, garrison and ZOC tests.**
- [ ] **Step 2: Run tests** and verify the three-tier contract fails.
- [ ] **Step 3: Add fortification configs and runtime effects.**
- [ ] **Step 4: Render multi-tile footprints, map icon, name and hover details.**
- [ ] **Step 5: Run building/army tests and commit** `feat: add tiered wilderness fortifications`.

### Task 9: 城邦并行升级与野外据点

**Files:**
- Create: `src/systems/FactionSystem.js`
- Create: `src/systems/WildSiteSystem.js`
- Create: `config/factions.json`
- Create: `config/wild-sites.json`
- Create: `test/node/factions-wild-sites.test.mjs`
- Modify: `src/systems/EnemyExpansionSystem.js`
- Modify: `src/systems/DiplomacySystem.js`
- Modify: `src/rendering/MapRenderer.js`
- Modify: `src/main.js`

**Interfaces:**
- Produces: 12 factions; `syncEra(playerEraIndex,day)`; faction relation matrix; wild sites `barbarian_camp`, `pirate_haven`, `guarded_ruin`, `guarded_resource`.

- [ ] **Step 1: Write failing tests** for delayed era sync, weaker templates, inter-faction relations, wild-site combat and loot.
- [ ] **Step 2: Run the test** and verify missing systems.
- [ ] **Step 3: Implement FactionSystem and WildSiteSystem** without giving NPCs full player trees.
- [ ] **Step 4: Extend diplomacy actions** to trade, passage, pact, alliance, threaten, war, peace, vassalage and conquest.
- [ ] **Step 5: Render faction/wild-site icons and hover summaries.**
- [ ] **Step 6: Run diplomacy/world tests and commit** `feat: add advancing factions and wilderness sites`.

### Task 10: 武将、文臣与历史酒馆

**Files:**
- Create: `test/node/hero-classes-assignments.test.mjs`
- Modify: `config/ea-integration.json`
- Modify: `config/historical-content.json`
- Modify: `src/systems/HeroSystem.js`
- Modify: `src/ui/panels/tavern-heroes-panel.js`
- Modify: `src/ui/panels/building-detail-panel.js`
- Modify: `src/ui/panels/army-panel.js`

**Interfaces:**
- Produces 72 heroes with `class: military|civil`; `assignToArmy`；`assignToBuilding`；`assignToTradeRoute`；`assignToDiplomacy`。

- [ ] **Step 1: Write failing tests** for class restrictions, prior-era tavern persistence, unique assignment, battle/civil bonuses and injury recovery.
- [ ] **Step 2: Run tests** and verify current generic assignment model fails.
- [ ] **Step 3: Normalize and expand hero data to 72 historical people.**
- [ ] **Step 4: Implement typed assignments and trigger-based military skills.**
- [ ] **Step 5: Update tavern, army and building UIs** with portraits and assignment destinations.
- [ ] **Step 6: Run hero tests and commit** `feat: split heroes into commanders and officials`.

### Task 11: 七时代与 57 文明重排

**Files:**
- Create: `test/node/seven-era-roster.test.mjs`
- Modify: `config/historical-content.json`
- Modify: `src/systems/EraSystem.js`
- Modify: `src/ui/panels/era-panel.js`
- Modify: `src/core/SaveManager.js`

**Interfaces:**
- Produces era ids `primitive,ancient,classical,medieval,exploration,early_modern,modern`; civilization counts `1,6,8,10,10,10,12`.

- [ ] **Step 1: Write failing roster tests** for exact ids/counts, no duplicate same-region dynasty per era and complete differentiation fields.
- [ ] **Step 2: Run tests** and verify current 8-per-era roster fails.
- [ ] **Step 3: Replace era/civilization records** and map v7 era/civ ids to v8 equivalents.
- [ ] **Step 4: Update era UI** for variable civilization counts and locked page navigation.
- [ ] **Step 5: Run era/save tests and commit** `feat: align civilizations to seven historical eras`.

### Task 12: 单位与文明差异内容

**Files:**
- Create: `test/node/civilization-differentiation.test.mjs`
- Modify: `config/historical-content.json`
- Modify: `src/systems/CombatResolver.js`
- Modify: `src/ui/panels/training-panel.js`

**Interfaces:**
- Produces at least 137 units; every civilization supplies legacy, trait, unique unit, unique building, tech replacement, civic replacement and diplomacy personality.

- [ ] **Step 1: Write failing content tests** for branch coverage, era progression, counters, naval units and all seven differentiation fields.
- [ ] **Step 2: Run tests** and verify incomplete fields fail.
- [ ] **Step 3: Rewrite unit availability by new eras** while preserving at least ten land branches and three naval classes.
- [ ] **Step 4: Apply civilization modifiers** in training, economy, research, diplomacy and combat.
- [ ] **Step 5: Run content/combat tests and commit** `feat: differentiate every historical civilization`.

### Task 13: 建筑地图图标与悬停信息

**Files:**
- Create: `test/node/map-visual-contract.test.mjs`
- Modify: `src/rendering/MapRenderer.js`
- Modify: `src/ui/panels/building-detail-panel.js`
- Modify: `config/buildings.json`
- Modify: `config/historical-content.json`

**Interfaces:**
- Produces every building `icon` and `mapIcon`; map layer always renders footprint tint + icon + name; hover card shows output/jobs/aura/status/upgrade.

- [ ] **Step 1: Write failing visual contract tests** for missing icons/map icons and required hover fields.
- [ ] **Step 2: Run tests** and verify existing missing building art fails.
- [ ] **Step 3: Refactor building renderer into base/icon/label layers.**
- [ ] **Step 4: Add pointer hover card and multi-tile footprint bounds.**
- [ ] **Step 5: Run tests and browser-check a house, academy, market and fortress.**
- [ ] **Step 6: Commit** `feat: render informative building map tokens`.

### Task 14: 批量单位图与英雄头像

**Files:**
- Create: `assets/art/units/cards/*.png`
- Create: `assets/art/heroes/portraits/*.png`
- Create: `assets/art/buildings/map/*.png`
- Create: `config/art-manifest.json`
- Create: `test/node/art-manifest.test.mjs`
- Modify: `src/ui/panels/training-panel.js`
- Modify: `src/ui/panels/tavern-heroes-panel.js`

**Interfaces:**
- Produces `cardArt` for every unit, `portrait` for every hero, `mapIcon` for every building and a file-backed manifest.

- [ ] **Step 1: Read and follow assetify and generate2dsprite instructions completely.**
- [ ] **Step 2: Write failing manifest test** requiring one valid image per visible record.
- [ ] **Step 3: Generate cohesive era/branch atlases and slice individual assets** with transparent or framed output as appropriate.
- [ ] **Step 4: Inspect representative files from every atlas** and regenerate invalid/cropped assets.
- [ ] **Step 5: Wire art paths into configs and UI cards.**
- [ ] **Step 6: Run art tests and commit** `feat: add complete historical unit and hero art`.

### Task 15: 七时代原创音乐和音效

**Files:**
- Create: `scripts/generate-era-music.py`
- Create: `assets/audio/bgm/era/*.wav`
- Create: `assets/audio/sfx/army_move.wav`
- Create: `assets/audio/sfx/battle_start.wav`
- Create: `assets/audio/sfx/diplomacy.wav`
- Create: `src/systems/EraMusicDirector.js`
- Create: `test/node/era-music.test.mjs`
- Modify: `config/sound.json`
- Modify: `src/systems/AudioSystem.js`
- Modify: `src/main.js`

**Interfaces:**
- Produces exactly seven loopable era tracks; `setEra(eraId)` crossfades without restarting the same track.

- [ ] **Step 1: Write failing audio-contract tests** for seven file paths, durations and era bindings.
- [ ] **Step 2: Run tests** and verify current two-track setup fails.
- [ ] **Step 3: Implement deterministic original music generator** with distinct tempo, scale and instrumentation per era.
- [ ] **Step 4: Generate tracks and new SFX, then validate WAV headers and duration.**
- [ ] **Step 5: Implement EraMusicDirector crossfade and persist state.**
- [ ] **Step 6: Run audio tests and commit** `feat: score every historical era`.

### Task 16: HUD 响应式重排与军团地图交互 QA

**Files:**
- Create: `test/browser/runtime-smoke.mjs`
- Modify: `index.html`
- Modify: `src/ui/HUD.js`
- Modify: `src/rendering/MapRenderer.js`
- Modify: `package.json`

**Interfaces:**
- Produces desktop and 390×844 layouts with reachable scrolling controls, non-overlapping top clusters and dismissible popups.

- [ ] **Step 1: Add a failing browser smoke scenario** covering menu, new game, close objective, open tech/civics/army, save, reload and continue.
- [ ] **Step 2: Capture current narrow-screen clipping evidence.**
- [ ] **Step 3: Refactor HUD breakpoints and scroll affordances** without hiding core actions.
- [ ] **Step 4: Exercise army selection, path preview, hover card and battle report in browser.**
- [ ] **Step 5: Run desktop and mobile smoke validation with zero app errors.**
- [ ] **Step 6: Commit** `fix: keep the expanded strategy UI playable`.

### Task 17: 文档、平衡与最终验收

**Files:**
- Modify: `README.md`
- Create: `docs/RTS_SLG_GRAND_OVERHAUL_2026-08-03.md`
- Create: `docs/V7_TO_V8_MIGRATION_2026-08-03.md`
- Create: `docs/UNIT_BALANCE_2026-08-03.md`
- Create: `docs/CIVILIZATION_DIFFERENTIATION_2026-08-03.md`
- Create: `docs/FIRST_20_DAYS_ECONOMY_2026-08-03.md`

**Interfaces:**
- Produces a player-facing run guide, data counts, migration table, unit counter table, civilization feature dictionary and first-20-day economy baseline.

- [ ] **Step 1: Generate source-backed counts and tables directly from configuration.**
- [ ] **Step 2: Document launch, controls, army flow, economy, research, diplomacy, heroes, naval play and saves.**
- [ ] **Step 3: Run placeholder scan and compare every design requirement against a test or browser scenario.**
- [ ] **Step 4: Run `npm.cmd run verify` and syntax/content/art/audio checks.**
- [ ] **Step 5: Run fresh desktop and mobile browser validation; inspect screenshots and console.**
- [ ] **Step 6: Review `git diff`, commit final docs and report verified remaining limitations.**
