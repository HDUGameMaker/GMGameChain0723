# Military Logistics and Map Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge building research into technology/civics, make soldiers flow from specific training buildings into reserves and then into deployed armies, add building-aware movement/garrison rules, lighten fog, and connect existing military art to every new surface.

**Architecture:** Keep `BuildingSystem`, `PopulationSystem`, and `ArmySystem` authoritative for buildings, workers, reserves, and armies. Add small pure helpers for legacy unlock migration, deployment geometry, and fog presentation; UI panels call system APIs rather than mutating store state. `MapRenderer` owns only selection/rendering and emits interaction requests, while a coordinator resolves confirmation dialogs and domain actions.

**Tech Stack:** Browser-native ES modules, PixiJS, JSON configuration, Node.js 20 test runner, Playwright, existing runtime art audit scripts.

## Global Constraints

- Work only in `D:/【个人内容】GameDesignProjects/GM GameChain2026/GM GameChain2026`.
- Do not modify `GM GameChain2026 Early Assess`.
- Preserve the fixed 384×384 `grand_map_v2` and v9 save compatibility.
- Day vision remains 10 tiles and night vision remains 6 tiles.
- Training buildings and assembly buildings remain separate.
- Land assembly buildings are headquarters, field camp, frontier fort, castle, and grand fortress.
- Naval deployment is limited to harbor and shipyard buildings.
- Use existing `cardArt`, `icon`, `imageDetail`, and `mapIcon` before creating any new art.
- Write a failing test and verify the expected failure before every production change.
- Commit after every independently passing task.

---

### Task 1: Merge Building Research Into Technology, Civics, and Era Gates

**Files:**
- Create: `src/domain/BuildingResearchMigration.js`
- Modify: `config/buildings.json`
- Modify: `config/historical_content.json`
- Modify: `src/systems/BuildingSystem.js`
- Modify: `src/systems/TechSystem.js`
- Modify: `src/systems/CultureSystem.js`
- Modify: `src/main.js`
- Modify: `src/ui/HUD.js`
- Modify: `src/ui/PopupManager.js`
- Modify: `src/ui/panels/building-select-panel.js`
- Modify: `index.html`
- Test: `test/node/building-research-migration.test.mjs`
- Test: `test/node/building-presentation.test.mjs`
- Test: `test/node/main-config-validation.test.mjs`

**Interfaces:**
- Consumes: legacy `save.buildingTech.unlockedNodes: string[]`, `save.tech.researched: string[]`, and `save.culture.researched: string[]`.
- Produces: `migrateLegacyBuildingResearch(saveData): object` and building conditions limited to `era`, `tech`, `culture`, `civilization`, and `building`.

- [ ] **Step 1: Write the failing migration and configuration tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateLegacyBuildingResearch } from '../../src/domain/BuildingResearchMigration.js';

test('legacy building research becomes normal tech and civic completion', () => {
  const migrated = migrateLegacyBuildingResearch({
    buildingTech: { unlockedNodes: ['bt_logging_t2', 'bt_farming_t2'] },
    tech: { researched: ['tech_primitive_1'] },
    culture: { researched: [] }
  });
  assert.ok(migrated.tech.researched.includes('tech_ancient_5'));
  assert.ok(migrated.culture.researched.includes('civic_ancient_4'));
  assert.deepEqual(migrated.buildingTech.unlockedNodes, ['bt_logging_t2', 'bt_farming_t2']);
});

test('runtime buildings no longer use building_tech unlock conditions', () => {
  const allBuildings = configRegistry.get('buildings') || [];
  assert.equal(allBuildings.flatMap(item => item.unlockConditions || []).some(item => item.type === 'building_tech'), false);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test test/node/building-research-migration.test.mjs test/node/building-presentation.test.mjs`

Expected: FAIL because `BuildingResearchMigration.js` does not exist and four T2 buildings still use `building_tech` conditions.

- [ ] **Step 3: Implement the compatibility mapping**

```js
const LEGACY_RESEARCH_MAP = Object.freeze({
  bt_logging: { tech: 'tech_primitive_3' },
  bt_mining: { tech: 'tech_primitive_1' },
  bt_farming: { civic: 'civic_primitive_5' },
  bt_minting: { civic: 'civic_primitive_6' },
  bt_logging_t2: { tech: 'tech_ancient_5' },
  bt_mining_t2: { tech: 'tech_ancient_1' },
  bt_farming_t2: { civic: 'civic_ancient_4' },
  bt_minting_t2: { civic: 'civic_ancient_8' },
  bt_industry: { tech: 'tech_early_modern_7' },
  bt_efficiency: { civic: 'civic_early_modern_5' },
  bt_terraforming: { tech: 'tech_exploration_8' }
});

export function migrateLegacyBuildingResearch(saveData = {}) {
  const result = structuredClone(saveData);
  result.tech ||= {};
  result.culture ||= {};
  const tech = new Set(result.tech.researched || []);
  const civics = new Set(result.culture.researched || []);
  for (const id of result.buildingTech?.unlockedNodes || []) {
    const mapped = LEGACY_RESEARCH_MAP[id];
    if (mapped?.tech) tech.add(mapped.tech);
    if (mapped?.civic) civics.add(mapped.civic);
  }
  result.tech.researched = [...tech];
  result.culture.researched = [...civics];
  return result;
}
```

Call the migration once at the start of `restoreFromSave`, before restoring technology, culture, buildings, and legacy building-tech compatibility state.

- [ ] **Step 4: Replace T2 gates and attach former bonuses to normal research nodes**

Use these exact gates:

```json
{ "id": "logging_camp_t2", "unlockConditions": [{ "type": "tech", "techId": "tech_ancient_5" }] }
{ "id": "stope_t2", "unlockConditions": [{ "type": "tech", "techId": "tech_ancient_1" }] }
{ "id": "farm_t2", "unlockConditions": [{ "type": "culture", "cultureId": "civic_ancient_4" }] }
{ "id": "gold_mint_t2", "unlockConditions": [{ "type": "culture", "cultureId": "civic_ancient_8" }] }
```

Extend `TechSystem.getEffects()` and `CultureSystem.getEffects()` to merge `resourceProductionMul` objects additively, then add the former wood/stone/food/gold and global production bonuses to the mapped historical nodes.

- [ ] **Step 5: Remove player-facing building-tree routes**

Remove `btn-building-tree` from `index.html`, its HUD listener, the building-select tree banner, and the popup registration. Keep `BuildingTechSystem` only as a read-only legacy save adapter during this release; it must not expose an unlock UI or drive any new building gate.

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run: `node --test test/node/building-research-migration.test.mjs test/node/building-presentation.test.mjs test/node/main-config-validation.test.mjs`

Expected: all focused tests pass; no active building condition has type `building_tech`.

- [ ] **Step 7: Commit**

```powershell
git add config/buildings.json config/historical_content.json src/domain/BuildingResearchMigration.js src/systems/BuildingSystem.js src/systems/TechSystem.js src/systems/CultureSystem.js src/main.js src/ui/HUD.js src/ui/PopupManager.js src/ui/panels/building-select-panel.js index.html test/node/building-research-migration.test.mjs test/node/building-presentation.test.mjs test/node/main-config-validation.test.mjs
git commit -m "feat: merge building research into tech and civics"
```

### Task 2: Recruit Workers From Headquarters

**Files:**
- Modify: `config/buildings.json`
- Modify: `src/systems/BuildingSystem.js`
- Modify: `src/systems/PopulationSystem.js`
- Modify: `src/ui/panels/building-detail-panel.js`
- Test: `test/node/population-workforce.test.mjs`

**Interfaces:**
- Consumes: `warehouse.uniqueFunction.workerRecruitment.cost` and an active warehouse building index.
- Produces: `BuildingSystem.recruitWorker(buildingIndex): {ok:boolean, reason?:string, population?:number}`.

- [ ] **Step 1: Write failing worker-recruitment tests**

```js
test('active headquarters recruits one idle worker for configured food', () => {
  const result = buildings.recruitWorker(warehouseIndex);
  assert.deepEqual(result, { ok: true, population: 13 });
  assert.equal(resources.getAmount('food'), 80);
  assert.equal(population.getAvailableWorkers(), 13);
});

test('headquarters recruitment fails without food or housing room', () => {
  resources._resources.food.current = 19;
  assert.equal(buildings.recruitWorker(warehouseIndex).reason, 'insufficient_resources');
  resources.setAmount('food', 100);
  population.current = population.getHousingCapacity();
  assert.equal(buildings.recruitWorker(warehouseIndex).reason, 'housing_full');
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/node/population-workforce.test.mjs`

Expected: FAIL because `recruitWorker` is undefined.

- [ ] **Step 3: Add the configured recruitment contract**

```json
"uniqueFunction": {
  "workerRecruitment": {
    "amount": 1,
    "cost": [{ "resourceId": "food", "amount": 20 }]
  }
}
```

Implement `PopulationSystem.addPopulation(amount)` with integer and housing checks. Implement `BuildingSystem.recruitWorker` so it validates building id/status, housing, and resources before consuming the cost atomically.

- [ ] **Step 4: Add the headquarters detail control**

Render a “招募工人” section only when `config.uniqueFunction.workerRecruitment` exists. Show cost, current population/housing, available workers, a disabled reason, and refresh the same building detail after success.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `node --test test/node/population-workforce.test.mjs`

Expected: all workforce tests pass.

- [ ] **Step 6: Commit**

```powershell
git add config/buildings.json src/systems/BuildingSystem.js src/systems/PopulationSystem.js src/ui/panels/building-detail-panel.js test/node/population-workforce.test.mjs
git commit -m "feat: recruit configurable workers from headquarters"
```

### Task 3: Train Units Only Inside Compatible Buildings

**Files:**
- Modify: `config/buildings.json`
- Modify: `config/historical_content.json`
- Modify: `src/systems/ArmySystem.js`
- Modify: `src/systems/TrainingRules.js`
- Modify: `src/main.js`
- Modify: `src/ui/HUD.js`
- Modify: `src/ui/panels/training-panel.js`
- Modify: `src/ui/panels/building-detail-panel.js`
- Modify: `index.html`
- Test: `test/node/military-training-buildings.test.mjs`
- Test: `test/node/army-system.test.mjs`

**Interfaces:**
- Consumes: active building index, unit id, building `uniqueFunction.trainsBranches`, resources, population, technology, civilization, and era.
- Produces: `ArmySystem.getTrainableUnitsAt(buildingIndex): object[]`, `ArmySystem.canTrainUnitAt(buildingIndex, unitId)`, and `ArmySystem.trainUnitAt(buildingIndex, unitId)`.

- [ ] **Step 1: Write failing building-specific training tests**

```js
test('training buildings expose only their configured branches', () => {
  assert.deepEqual(army.getTrainableUnitsAt(barracksIndex).map(unit => unit.branch), ['infantry', 'anti_cavalry']);
  assert.ok(army.getTrainableUnitsAt(archeryIndex).every(unit => ['ranged', 'archer'].includes(unit.branch)));
});

test('training adds a unit to reserves but never creates an army', () => {
  const result = army.trainUnitAt(barracksIndex, 'primitive_infantry_1');
  assert.equal(result.ok, true);
  assert.equal(army.getAvailableUnits().primitive_infantry_1, 1);
  assert.equal(army.getArmies().length, 0);
});

test('a unit cannot be trained from an incompatible or inactive building', () => {
  assert.equal(army.trainUnitAt(archeryIndex, 'primitive_infantry_1').reason, 'branch_not_supported');
  building.buildings[archeryIndex].status = 'constructing';
  assert.equal(army.trainUnitAt(archeryIndex, 'primitive_archer_1').reason, 'invalid_training_building');
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test test/node/military-training-buildings.test.mjs`

Expected: FAIL because the three `ArmySystem` training APIs do not exist.

- [ ] **Step 3: Move training mutation from UI into ArmySystem**

Extend `ArmySystem.setSystems` with `resource`, `population`, and `tech`. Use `evaluateTrainingEligibility` after first checking the selected building and branch. Consume resources and call `addReserveUnit` only after all checks pass.

```js
trainUnitAt(buildingIndex, unitId) {
  const check = this.canTrainUnitAt(buildingIndex, unitId);
  if (!check.ok) return check;
  this._resource.consumeAll(check.unit.cost || []);
  this.addReserveUnit(unitId, 1);
  eventBus.emit('unitTrained', { unitId, amount: 1, buildingIndex });
  return { ok: true, reserve: this._availableUnits[unitId] };
}
```

- [ ] **Step 4: Change UI entry points**

Open `training_panel` with `{buildingIndex}` only from compatible building details. Remove `btn-training` from the HUD and HTML. The training panel must reject a missing/invalid building index and must render only `getTrainableUnitsAt(buildingIndex)`. Add `data-testid="open-building-training"` to the entry button and `data-testid="train-unit-${u.id}"` to each unit button for stable browser acceptance.

- [ ] **Step 5: Remove free reserve initialization**

Delete the `if (Object.keys(av).length === 0)` block from `army-panel.js`. A new campaign starts with no trained reserves unless configuration explicitly grants them.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `node --test test/node/military-training-buildings.test.mjs test/node/army-system.test.mjs`

Expected: all focused tests pass and training never bypasses its building.

- [ ] **Step 7: Commit**

```powershell
git add config/buildings.json config/historical_content.json src/systems/ArmySystem.js src/systems/TrainingRules.js src/main.js src/ui/HUD.js src/ui/panels/training-panel.js src/ui/panels/building-detail-panel.js index.html test/node/military-training-buildings.test.mjs test/node/army-system.test.mjs
git commit -m "feat: train reserve units inside military buildings"
```

### Task 4: Deploy Armies Atomically Around Assembly Buildings

**Files:**
- Create: `src/domain/MilitaryDeployment.js`
- Modify: `config/buildings.json`
- Modify: `config/historical_content.json`
- Modify: `src/systems/ArmySystem.js`
- Modify: `src/ui/panels/army-panel.js`
- Modify: `src/ui/panels/building-detail-panel.js`
- Test: `test/node/military-deployment.test.mjs`
- Test: `test/node/army-system.test.mjs`

**Interfaces:**
- Consumes: assembly building footprint, map grid, active buildings, armies, fixed targets, requested unit counts, and requested army name.
- Produces: `getDeploymentCandidates(building, config): {x:number,y:number,direction:string}[]`, `findDeploymentTile(context)`, and `ArmySystem.deployArmyFromBuilding(request)`.

- [ ] **Step 1: Write failing deployment geometry tests**

```js
test('deployment candidates follow the fixed compass priority', () => {
  const candidates = getDeploymentCandidates({ gridX: 10, gridY: 10 }, { footprint: { width: 1, height: 1 } });
  assert.deepEqual(candidates.map(item => item.direction), ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
  assert.deepEqual(candidates.map(({ x, y }) => [x, y]), [[10,9],[11,9],[11,10],[11,11],[10,11],[9,11],[9,10],[9,9]]);
});

test('deployment is atomic when all eight candidates are occupied', () => {
  const before = army.getAvailableUnits();
  const result = army.deployArmyFromBuilding({ buildingIndex: fortIndex, name: '第一军团', unitCounts: { spear: 2 } });
  assert.equal(result.reason, 'no_deployment_tile');
  assert.deepEqual(army.getAvailableUnits(), before);
  assert.equal(army.getArmies().length, 0);
});

test('naval armies deploy only to water around harbor or shipyard', () => {
  const result = army.deployArmyFromBuilding({ buildingIndex: shipyardIndex, name: '第一舰队', unitCounts: { galley: 1 } });
  assert.equal(result.ok, true);
  assert.equal(['S', 'W'].includes(map.grid[result.army.gridY][result.army.gridX]), true);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/node/military-deployment.test.mjs`

Expected: FAIL because `MilitaryDeployment.js` and `deployArmyFromBuilding` do not exist.

- [ ] **Step 3: Add assembly configuration**

Add `uniqueFunction.armyAssemblyDomains: ["land"]` to warehouse, field camp, frontier fort, castle, and grand fortress. Add `["naval"]` to harbor and shipyard classes. Do not add assembly domains to barracks, ranges, stables, or workshops.

- [ ] **Step 4: Implement pure candidate and occupation helpers**

`findDeploymentTile` must reject map boundaries, incompatible terrain, every active building footprint, every ungarrisoned army, and fixed hostile targets. It returns the first valid candidate or `null`.

- [ ] **Step 5: Implement atomic ArmySystem deployment**

Validate non-empty reserves, a single land/naval domain, command points, army capacity, and building assembly domain. Find the tile before changing reserves. On success create the army with selected units in one operation; on failure leave `_armies`, `_availableUnits`, and `_nextId` unchanged.

- [ ] **Step 6: Replace global empty-army creation with a building-scoped assembly form**

The army panel receives `{assemblyBuildingIndex}` for creation mode. Render army name, reserve unit cards, plus/minus counts, command point preview, domain warning, and “部署军团”. Add `data-testid="open-building-assembly"`, `data-testid="reserve-add-${unit.id}"`, and `data-testid="deploy-army"`. The normal HUD army panel remains a read-only/manage-existing-armies entry and cannot create a new army without an assembly building.

- [ ] **Step 7: Run tests and verify GREEN**

Run: `node --test test/node/military-deployment.test.mjs test/node/army-system.test.mjs`

Expected: all tests pass, including atomic failure and naval placement.

- [ ] **Step 8: Commit**

```powershell
git add src/domain/MilitaryDeployment.js config/buildings.json config/historical_content.json src/systems/ArmySystem.js src/ui/panels/army-panel.js src/ui/panels/building-detail-panel.js test/node/military-deployment.test.mjs test/node/army-system.test.mjs
git commit -m "feat: deploy armies from assembly buildings"
```

### Task 5: Enforce Building Collision and Complete Fortification Garrisoning

**Files:**
- Modify: `config/historical_content.json`
- Modify: `src/systems/ArmySystem.js`
- Modify: `src/systems/BuildingSystem.js`
- Modify: `src/main.js`
- Modify: `src/ui/panels/army-panel.js`
- Modify: `src/ui/panels/building-detail-panel.js`
- Test: `test/node/army-building-occupation.test.mjs`
- Test: `test/node/fortifications.test.mjs`

**Interfaces:**
- Consumes: building footprints and `uniqueFunction.garrisonCapacity`.
- Produces: `ArmySystem.isTileOccupiedByBuilding(x,y,{allowGarrisonIndex})`, `ArmySystem.ungarrisonArmy(armyId)` with a real exit tile, and `ArmySystem.hasGarrisonAtBuilding(buildingIndex)`.

- [ ] **Step 1: Write failing collision and ungarrison tests**

```js
test('army paths never enter or cross ordinary building footprints', () => {
  const result = army.issueMoveOrder(armyId, blockedTarget.x, blockedTarget.y);
  assert.equal(result.reason, 'tile_occupied_by_building');
  assert.equal(army.getArmy(armyId).movePath.some(step => step.x === warehouse.gridX && step.y === warehouse.gridY), false);
});

test('ungarrison uses the same compass exit priority', () => {
  const result = army.ungarrisonArmy(armyId);
  assert.equal(result.ok, true);
  assert.deepEqual([result.army.gridX, result.army.gridY], [fort.gridX, fort.gridY - 1]);
});

test('ungarrison fails without moving when every exit is blocked', () => {
  const result = army.ungarrisonArmy(armyId);
  assert.equal(result.reason, 'no_ungarrison_tile');
  assert.equal(army.getArmy(armyId).garrisonBuildingIndex, fortIndex);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test test/node/army-building-occupation.test.mjs test/node/fortifications.test.mjs`

Expected: FAIL because movement ignores building footprints and ungarrison leaves the army overlapping its fort.

- [ ] **Step 3: Enforce occupation in pathfinding and order validation**

Reject ordinary building tiles both in `_canOccupyForMovement` and at the requested destination. Preserve harbor embark/disembark exceptions only through their explicit APIs.

- [ ] **Step 4: Complete fortification configuration**

Give `watchtower` a capacity of 1, defense multiplier 1.18, and vision radius 4. Preserve increasing effects for field camp, frontier fort, castle, and grand fortress. Make building details list occupied capacity and effect values.

- [ ] **Step 5: Block destructive building operations while garrisoned**

Wire `BuildingSystem.setArmySystem(army)` in `main.js`. `canUpgrade`, move, and demolition checks return `building_garrisoned` while an army is inside. Do not silently detach or delete a garrison.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `node --test test/node/army-building-occupation.test.mjs test/node/fortifications.test.mjs`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```powershell
git add config/historical_content.json src/systems/ArmySystem.js src/systems/BuildingSystem.js src/main.js src/ui/panels/army-panel.js src/ui/panels/building-detail-panel.js test/node/army-building-occupation.test.mjs test/node/fortifications.test.mjs
git commit -m "feat: enforce army building collision and garrisons"
```

### Task 6: Add Click-to-Select, Click-to-Move, and Confirmed Target Interactions

**Files:**
- Create: `src/domain/ArmyInteractionTarget.js`
- Create: `src/systems/ArmyInteractionSystem.js`
- Modify: `src/main.js`
- Modify: `src/rendering/MapRenderer.js`
- Modify: `src/rendering/MapPresentation.js`
- Modify: `src/ui/PopupManager.js`
- Test: `test/node/army-map-interaction.test.mjs`
- Test: `test/node/map-presentation.test.mjs`

**Interfaces:**
- Consumes: selected army id, clicked grid coordinate, armies, buildings, wild sites, city-states, and enemies.
- Produces: `classifyArmyInteractionTarget(context): {kind:string,...}`, `ArmyInteractionSystem.request(request): Promise<object>`, and transient `MapRenderer.selectedArmyId`.

- [ ] **Step 1: Write failing target-classification tests**

```js
test('an empty reachable tile becomes an immediate move target', () => {
  assert.deepEqual(classifyArmyInteractionTarget({ gridX: 7, gridY: 8, ...emptyContext }), { kind: 'move', gridX: 7, gridY: 8 });
});

test('wild sites, city states, enemies and garrisons require interaction', () => {
  assert.equal(classifyArmyInteractionTarget(wildContext).kind, 'wild_site');
  assert.equal(classifyArmyInteractionTarget(cityContext).kind, 'city_state');
  assert.equal(classifyArmyInteractionTarget(enemyContext).kind, 'enemy');
  assert.equal(classifyArmyInteractionTarget(garrisonContext).kind, 'garrison');
});

test('ordinary own buildings block the selected army', () => {
  assert.equal(classifyArmyInteractionTarget(warehouseContext).kind, 'blocked_building');
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test test/node/army-map-interaction.test.mjs test/node/map-presentation.test.mjs`

Expected: FAIL because the classifier and selected-army presentation do not exist.

- [ ] **Step 3: Implement the pure target classifier and coordinator**

The coordinator immediately calls `issueMoveOrder` for `move`. For `enemy`, `wild_site`, `city_state`, and `garrison`, it uses `PopupManager.confirm` before calling the existing battle, wild-site, diplomacy, or garrison API. It translates reason codes into Chinese alerts.

- [ ] **Step 4: Add selection-first click precedence to MapRenderer**

Before outpost/building handling, detect a player army at the clicked tile. First click selects it; a second click on the same army opens its detail. While selected, the next revealed-map click emits `armyInteractionRequested` with the classified target. Escape and mutually exclusive editing modes clear the selection.

- [ ] **Step 5: Render selection and path feedback**

Add a gold/green selection ring, selected army name, unit count, and a thin route line through `movePath`. The ring must remain above terrain/buildings but below popup UI.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `node --test test/node/army-map-interaction.test.mjs test/node/map-presentation.test.mjs test/node/army-system.test.mjs`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```powershell
git add src/domain/ArmyInteractionTarget.js src/systems/ArmyInteractionSystem.js src/main.js src/rendering/MapRenderer.js src/rendering/MapPresentation.js src/ui/PopupManager.js test/node/army-map-interaction.test.mjs test/node/map-presentation.test.mjs
git commit -m "feat: add direct strategic army map interaction"
```

### Task 7: Remove the Full-Screen Black Layer and Lighten Persistent Fog

**Files:**
- Create: `src/rendering/FogPresentation.js`
- Modify: `src/rendering/MapRenderer.js`
- Test: `test/node/fog-presentation.test.mjs`
- Test: `test/node/fog-of-war.test.mjs`
- Test: `test/browser-smoke.spec.js`

**Interfaces:**
- Consumes: fog state `visible|remembered|unexplored` and period.
- Produces: `getStrategicFogStyle(state, period): {alpha:number,color:[number,number,number]} | null`.

- [ ] **Step 1: Write failing alpha-contract tests**

```js
test('strategic fog leaves visible tiles fully clear', () => {
  assert.equal(getStrategicFogStyle('visible', 'morning'), null);
});

test('day and night use the approved lighter fog values', () => {
  assert.equal(getStrategicFogStyle('remembered', 'morning').alpha, 0.22);
  assert.equal(getStrategicFogStyle('unexplored', 'morning').alpha, 0.56);
  assert.equal(getStrategicFogStyle('remembered', 'night').alpha, 0.34);
  assert.equal(getStrategicFogStyle('unexplored', 'night').alpha, 0.70);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test test/node/fog-presentation.test.mjs test/node/fog-of-war.test.mjs`

Expected: FAIL because `FogPresentation.js` does not exist and current alphas are 0.58–0.97.

- [ ] **Step 3: Implement the fog presentation helper and use it for strategic runs**

`_updateStrategicFogTexture` must clear the entire offscreen canvas, skip visible runs, and use only the helper values. It must not call `_getFogBaseAlpha` while `FogOfWarState` is active.

- [ ] **Step 4: Fix canvas lifecycle and viewport boundaries**

Before recreating fog, destroy the old sprite/texture and remove its children. Recreate it after resize/zoom with `ceil(screen/zoom)` dimensions, explicitly size the sprite to that logical viewport, and update it after camera changes. Add a browser assertion that the fog sprite covers the viewport without a rectangular edge or uncovered strip.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `node --test test/node/fog-presentation.test.mjs test/node/fog-of-war.test.mjs`

Expected: all fog tests pass; day/night reveal radii remain 10/6.

- [ ] **Step 6: Commit**

```powershell
git add src/rendering/FogPresentation.js src/rendering/MapRenderer.js test/node/fog-presentation.test.mjs test/node/fog-of-war.test.mjs test/browser-smoke.spec.js
git commit -m "fix: lighten persistent fog without screen overlay"
```

### Task 8: Bind Existing Military Art to Assembly, Army, and Map Surfaces

**Files:**
- Modify: `src/rendering/MapPresentation.js`
- Modify: `src/rendering/MapRenderer.js`
- Modify: `src/ui/panels/army-panel.js`
- Modify: `src/ui/panels/training-panel.js`
- Modify: `src/ui/panels/building-detail-panel.js`
- Modify: `scripts/audit-runtime-art.mjs`
- Test: `test/node/runtime-art-integrity.test.mjs`
- Test: `test/node/map-presentation.test.mjs`
- Test: `test/browser-smoke.spec.js`

**Interfaces:**
- Consumes: unit `cardArt`/`icon`, building `imageDetail`/`mapIcon`, and army unit composition.
- Produces: strategic token model `art`, `fallbackIcon`, `selected`, and `unitCount` fields.

- [ ] **Step 1: Write failing military-art surface tests**

```js
test('army map tokens resolve representative unit art', () => {
  const [token] = createMapTokenModels({ armies: [{ id: 'army_1', unitIds: ['spear'], gridX: 1, gridY: 1 }], wildSites: [], unitConfigs });
  assert.equal(token.art, 'assets/unit-cards/spear.png');
  assert.equal(token.fallbackIcon, unitConfigs[0].icon);
});

test('all training assembly and garrison content resolves to decodable runtime art', async () => {
  const result = await auditRuntimeArt({ militaryOnly: true });
  assert.equal(result.statuses.missing || 0, 0);
  assert.equal(result.statuses.decode_error || 0, 0);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test test/node/runtime-art-integrity.test.mjs test/node/map-presentation.test.mjs`

Expected: FAIL because army tokens currently expose Emoji only and the audit has no military-surface binding category.

- [ ] **Step 3: Add real art to composition and deployment controls**

Render unit `cardArt` in reserve selection and army composition cards. Render the assembly building `imageDetail` in the deployment header and its `mapIcon` beside the spawn rule. Retain `icon` only as small badge/fallback.

- [ ] **Step 4: Render map army tokens with Pixi textures**

Choose the first/highest-command-point unit as the representative. Load its `icon` first for map clarity; use a cropped `cardArt` only when no icon exists. Display fallback text only after image load failure. Preserve selection ring, faction color, unit count, and label.

- [ ] **Step 5: Expand the audit**

Audit every building with `trainsBranches`, `armyAssemblyDomains`, or `garrisonCapacity`, plus every trainable unit. Require real decodable image paths and include the military runtime surfaces in the compact summary.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `node --test test/node/runtime-art-integrity.test.mjs test/node/map-presentation.test.mjs`

Expected: all art and presentation tests pass with zero missing/decode errors.

- [ ] **Step 7: Commit**

```powershell
git add src/rendering/MapPresentation.js src/rendering/MapRenderer.js src/ui/panels/army-panel.js src/ui/panels/training-panel.js src/ui/panels/building-detail-panel.js scripts/audit-runtime-art.mjs test/node/runtime-art-integrity.test.mjs test/node/map-presentation.test.mjs test/browser-smoke.spec.js
git commit -m "feat: connect military art to every runtime surface"
```

### Task 9: Complete Save Compatibility, Browser Acceptance, and Documentation

**Files:**
- Modify: `src/core/SaveManager.js`
- Modify: `test/node/save-v9-overhaul-state.test.mjs`
- Modify: `test/node/save-v8-migration.test.mjs`
- Modify: `test/browser-smoke.spec.js`
- Modify: `README.md`
- Create: `docs/MILITARY_LOGISTICS_AND_MAP_INTERACTION_2026-08-03.md`

**Interfaces:**
- Consumes: v7/v8/v9 saves with optional `buildingTech`, current v9 army state, and all UI flows from Tasks 1–8.
- Produces: canonical v9 state that preserves reserves, deployed armies, paths, and garrisons while accepting legacy building research.

- [ ] **Step 1: Write failing save and end-to-end assertions**

```js
test('legacy building research migrates without losing army logistics', () => {
  const migrated = SaveManager.migrateToCurrent(legacyV9);
  assert.ok(migrated.tech.researched.includes('tech_ancient_5'));
  assert.deepEqual(migrated.armyState.availableUnits, legacyV9.armyState.availableUnits);
  assert.deepEqual(migrated.armyState.armies[0].movePath, legacyV9.armyState.armies[0].movePath);
});
```

Extend Playwright with this exact user flow, using the new stable test ids:

```js
await page.evaluate(() => {
  const game = window.__game;
  const index = game.systems.building.buildings.findIndex(item => item.buildingId === 'work_shed');
  game.popupManager.open('building_detail', { buildingIndex: index });
});
await page.getByTestId('open-building-training').click();
const train = page.locator('[data-testid^="train-unit-"]:not([disabled])').first();
await train.click();
await closeVisiblePopup(page);

await page.evaluate(() => {
  const game = window.__game;
  const index = game.systems.building.buildings.findIndex(item => item.buildingId === 'warehouse');
  game.popupManager.open('building_detail', { buildingIndex: index });
});
await page.getByTestId('open-building-assembly').click();
await page.locator('[data-testid^="reserve-add-"]').first().click();
await page.getByTestId('deploy-army').click();
await closeVisiblePopup(page);

const points = await page.evaluate(() => {
  const renderer = window.__game.mapRenderer;
  const army = window.__game.systems.army.getArmies()[0];
  const toClient = (x, y) => ({
    x: (x * renderer.tileSize + renderer.tileSize / 2 - renderer.camX) * renderer.zoom,
    y: (y * renderer.tileSize + renderer.tileSize / 2 - renderer.camY) * renderer.zoom
  });
  return { army: toClient(army.gridX, army.gridY), target: toClient(army.gridX, army.gridY - 1) };
});
await page.mouse.click(points.army.x, points.army.y);
await page.mouse.click(points.target.x, points.target.y);
await expect.poll(() => page.evaluate(() => window.__game.systems.army.getArmies()[0].order.type)).toBe('move');
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test test/node/save-v9-overhaul-state.test.mjs test/node/save-v8-migration.test.mjs`

Expected: FAIL until legacy research normalization is integrated into canonical migration.

- [ ] **Step 3: Normalize legacy research without changing schema version**

Call `migrateLegacyBuildingResearch` from the current v9 normalization path. Keep `buildingTech` optional/readable for compatibility, but do not require it for new games. Do not persist selected-army UI state.

- [ ] **Step 4: Run the complete automated suite**

Run: `npm.cmd run verify`

Expected: all Node tests pass and all JavaScript files pass syntax validation.

- [ ] **Step 5: Run deterministic and art checks**

Run: `node scripts/build-fixed-grand-map.mjs --check`

Expected: `grand_map_v2 is reproducible`.

Run: `node scripts/audit-runtime-art.mjs --compact`

Expected: every record has status `ok`, including military surfaces.

- [ ] **Step 6: Run Playwright and capture evidence outside committed source**

Run: `npm.cmd run test:browser`

Expected: the browser flow passes with no console errors, no black rectangular fog layer, real military images in assembly/army/map surfaces, successful click-to-move, and an interaction confirmation dialog.

- [ ] **Step 7: Update documentation with exact verified counts**

Document the merged building research, headquarters worker recruitment, training-to-reserve flow, assembly buildings, eight-direction deployment, collision/garrison rules, click interaction, lighter fog values, military art binding, save compatibility, and the exact fresh test results.

- [ ] **Step 8: Verify the branch diff and commit**

```powershell
git diff --check
git status --short
git add src/core/SaveManager.js test/node/save-v9-overhaul-state.test.mjs test/node/save-v8-migration.test.mjs test/browser-smoke.spec.js README.md docs/MILITARY_LOGISTICS_AND_MAP_INTERACTION_2026-08-03.md
git commit -m "docs: record military logistics acceptance"
```

Expected: commit succeeds and `git status --short` is empty afterward.
