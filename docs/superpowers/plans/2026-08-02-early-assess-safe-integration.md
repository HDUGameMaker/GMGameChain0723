# Early Assess Safe Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely port compatible Early Assess combat, naval, outpost diplomacy, historical hero, and event content into the current four-resource territory-conquest version.

**Architecture:** The current main version remains the host. New content lives in additive config files and focused systems, while ConfigRegistry merges it without replacing main-version IDs. Main systems expose narrow integration hooks; all EA costs and gates are translated to the main version's four-resource and soldier-capacity model.

**Tech Stack:** Native ES Modules, Node.js built-in test runner, PixiJS v8, DOM panels, JSON configuration, IndexedDB saves.

## Global Constraints

- Work only in `E:\G-Game Design\Game Design Projects\GM GameChain2026` on branch `integrate-early-assess-safe`.
- Main-version behavior wins every conflict.
- Runtime resources are only `wood`, `stone`, `food`, `gold`; `inspiration` is Store state.
- Population/workers cannot gate production or training.
- Existing TerritorySystem, EnemyExpansionSystem, SpellSystem, BuildingTechSystem and 13 base buildings remain authoritative.
- Save version becomes 6 and version 5 saves remain loadable.
- Every production behavior starts with a failing Node test.

---

### Task 1: Test Harness and Four-Resource Baseline

**Files:**
- Create: `package.json`
- Create: `scripts/check-js-syntax.cjs`
- Create: `test/node/main-config-validation.test.mjs`
- Modify: `config/items.json`
- Modify: `config/initial.json`
- Modify: `config/events/events_base.json`
- Modify: `config/techs.json`

**Interfaces:**
- Produces: `npm test` and `npm run check` commands.
- Produces: active configuration invariant that every `resourceId` is in `wood|stone|food|gold|inspiration`.

- [ ] Write `main-config-validation.test.mjs` to load active runtime config files and fail for unknown resource IDs, malformed JSON, missing building upgrades, or missing unit prerequisite tech IDs.
- [ ] Run `node --test test/node/main-config-validation.test.mjs` and verify it fails on current coal/hematite/processed-resource references.
- [ ] Add package scripts and the syntax checker; translate active item, initial, event and technology costs/rewards to four resources while preserving relative rarity with `gold`.
- [ ] Run `npm run check` and `node scripts/verify_bonus_interfaces.js`; verify both pass.
- [ ] Commit as `fix: normalize active content to four resources`.

### Task 2: Counter-Based Land and Naval Combat

**Files:**
- Create: `config/ea_integration.json`
- Create: `src/systems/CombatResolver.js`
- Create: `test/node/integrated-combat.test.mjs`
- Modify: `src/core/ConfigRegistry.js`
- Modify: `src/systems/CombatSystem.js`
- Modify: `src/systems/EnemyExpansionSystem.js`
- Modify: `src/ui/panels/training-panel.js`

**Interfaces:**
- Produces: `CombatResolver.getArmyPower(army, unitLookup, context) -> number`.
- Produces: ConfigRegistry runtime merge of additive `buildings`, `units`, `enemies`, and `unitProfiles`.
- Consumes: `BuildingSystem.getTotalSoldierCapacity()` and active-building tags.

- [ ] Write tests asserting 25 total units, at least three naval units, four-resource costs, counter tags on every unit, spear-over-cavalry and cavalry-over-archer outcomes, and naval-facility training gates without worker checks.
- [ ] Run the combat test and verify failures for missing integration config/resolver.
- [ ] Add four-resource dock, shipyard, coastal watch, 10 units, 8 enemy templates and profiles for the existing 15 units; merge them by ID without replacing main data.
- [ ] Implement CombatResolver and connect it to CombatSystem and EnemyExpansionSystem army-power calculations.
- [ ] Rewrite the training gate to combine resource affordability, soldier capacity, research unlock and naval facility; omit population availability.
- [ ] Run combat tests plus full checks and commit as `feat: integrate counter based land and naval combat`.

### Task 3: Fixed Outposts and Diplomacy

**Files:**
- Extend: `config/ea_integration.json`
- Create: `src/systems/DiplomacySystem.js`
- Create: `src/ui/panels/outpost-diplomacy-panel.js`
- Create: `test/node/integrated-diplomacy.test.mjs`
- Modify: `src/main.js`
- Modify: `src/rendering/MapRenderer.js`
- Modify: `src/ui/PopupManager.js`

**Interfaces:**
- Produces: `DiplomacySystem.performAction(outpostId, actionId) -> {ok, reason?, relation?, status?}`.
- Produces: `DiplomacySystem.attackOutpost(outpostId, force) -> {ok, result?, reason?}`.
- Produces: serializable `getState()/restoreState()`.
- Consumes: CultureSystem action unlock queries, ResourceSystem, CombatSystem army data and CombatResolver power.

- [ ] Write tests for six fixed outposts, terrain-compatible domains, four-resource action costs, persistent relation changes, culture-gated treaties and defeated-outpost persistence.
- [ ] Run the diplomacy test and verify it fails because the system/config is absent.
- [ ] Add six outposts and four-resource diplomacy actions; implement state transitions without NPC production or development.
- [ ] Register and wire DiplomacySystem in main, add MapRenderer markers/click handling, and register the diplomacy panel.
- [ ] Add save/restore fields while retaining all main-version state; temporarily keep save version 5 until Task 5 migration tests.
- [ ] Run diplomacy and full tests; commit as `feat: integrate fixed outposts and diplomacy`.

### Task 4: Tavern and Historical Heroes

**Files:**
- Extend: `config/ea_integration.json`
- Create: `src/systems/HeroSystem.js`
- Create: `src/ui/panels/tavern-heroes-panel.js`
- Create: `test/node/integrated-heroes.test.mjs`
- Modify: `src/main.js`
- Modify: `src/ui/PopupManager.js`
- Modify: `src/ui/panels/building-detail-panel.js`
- Modify: `src/systems/BuildingSystem.js`
- Modify: `src/systems/EnemyExpansionSystem.js`

**Interfaces:**
- Produces: `HeroSystem.recruitHero(id)`, `assignHero(id, assignment)`, `getBonuses()`, `getState()`, `restoreState(state)`.
- Consumes: active tavern building, ResourceSystem, Store inspiration, CultureSystem assignment slots.
- Produces converted bonuses that affect production, army power, diplomacy and expedition without population growth.

- [ ] Write tests for one tavern, 12 historical heroes, four-resource costs, tavern requirement, inspiration spending, assignment limits, useful bonuses and save restoration.
- [ ] Run the hero test and verify missing system/config failures.
- [ ] Add the worker-free tavern and converted hero roster; implement deterministic offer rotation, recruitment, assignment and aggregation.
- [ ] Wire hero bonuses into BuildingSystem, EnemyExpansionSystem and DiplomacySystem through read-only bonus queries.
- [ ] Register the tavern panel and building-detail entry; add hero state to save/restore.
- [ ] Run hero and full tests; commit as `feat: integrate tavern and historical heroes`.

### Task 5: Compatible Events, Save v6 and Browser Regression

**Files:**
- Extend: `config/ea_integration.json`
- Create: `test/node/integrated-events-save.test.mjs`
- Modify: `src/systems/EventSystem.js`
- Modify: `src/main.js`
- Modify: `README.md`
- Create: `docs/EA-SAFE-INTEGRATION.md`

**Interfaces:**
- Produces EventSystem handlers `add_inspiration` and `modify_outpost_relation`.
- Produces save schema version 6 with v5 migration defaults for diplomacy and heroes.

- [ ] Write tests for compatible event categories/effects, four-resource references, save version 6, and v5 default initialization.
- [ ] Run the event/save test and verify expected failures.
- [ ] Add compatible settlement, diplomacy, military and naval events and register their effect handlers.
- [ ] Bump saves to version 6, accept version 5, preserve all main state and initialize absent EA-integrated state safely.
- [ ] Document content, controls, migration and validation commands.
- [ ] Run `npm run check`, `node scripts/verify_bonus_interfaces.js`, and `git diff --check`.
- [ ] Start the game through HTTP and verify new game, objective, territory, enemy expansion, training, outpost diplomacy, tavern heroes, save/load and a clean console.
- [ ] Commit as `docs: complete safe early assess integration`.
