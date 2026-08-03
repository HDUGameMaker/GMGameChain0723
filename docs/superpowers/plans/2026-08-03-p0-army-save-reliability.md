# P0 Army and Save Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ArmySystem the only owner of armies and reserves while preserving every valid unit through v7→v8 migration and save round-trips.

**Architecture:** SaveManager normalizes every supported legacy army representation into one v8 `armyState`. InvasionSystem, ColonySystem, and EnemyExpansionSystem receive ArmySystem through dependency injection and mutate armies only through atomic public commands; Store remains a notification mirror for UI consumers.

**Tech Stack:** Native ES Modules, Node `node:test`, custom EventBus/Store, IndexedDB SaveManager, JSON configuration.

## Global Constraints

- Work only in `D:\【个人内容】GameDesignProjects\GM GameChain2026\GM GameChain2026`.
- Do not read or modify the sibling Early Assess directory.
- Preserve all pre-existing uncommitted art, audio, docs, tests, and source changes.
- Keep save version exactly `8`; this is a corrective migration, not a v9 schema.
- Keep wood, stone, food, and gold as the only main resources.
- Do not change combat balance, invasion timing, colony rewards, UI layout, or loading behavior.
- Every production change follows RED → GREEN → focused regression → commit.
- Stage only files named by the current task.

---

### Task 1: Normalize legacy and current army save shapes

**Files:**
- Modify: `src/core/SaveManager.js`
- Modify: `test/node/save-v8-migration.test.mjs`

**Interfaces:**
- Produces: `SaveManager._normalizeArmyState(state): { nextId, armies, availableUnits, battleHistory }`
- Produces: `SaveManager._normalizeArmyRecord(army, index): object`
- Produces: `SaveManager._normalizeAvailableUnits(value): Record<string, number>`
- Guarantees: `state.armyState` is authoritative and top-level `state.armies/state.availableUnits` are compatible mirrors.

- [ ] **Step 1: Add failing migration assertions**

Extend the v7 fixture so its army and reserves are:

```js
armies: [{
  id: 'army_1',
  name: '第一军团',
  units: [{ unitId: 'spearman', count: 2 }, { unitId: 'archer', count: 1 }],
  morale: 73,
  supply: 0.8
}],
availableUnits: { spearman: 4, archer: 0 }
```

Assert:

```js
assert.deepEqual(migrated.armyState.armies[0].unitIds, ['spearman', 'spearman', 'archer']);
assert.deepEqual(migrated.armyState.availableUnits, { spearman: 4, archer: 0 });
assert.equal(migrated.armyState.armies[0].morale, 73);
assert.equal(migrated.armyState.armies[0].supply, 0.8);
assert.deepEqual(migrated.armies, migrated.armyState.armies);
assert.deepEqual(migrated.availableUnits, migrated.armyState.availableUnits);
```

Add a separate v8 case for array reserves:

```js
const migrated = SaveManager.migrate({
  version: 8,
  armies: [{ id: 'army_3', unitIds: ['spearman'] }],
  availableUnits: [{ unitId: 'spearman', count: 2 }, { id: 'archer', count: 1 }]
});
assert.deepEqual(migrated.armyState.availableUnits, { spearman: 2, archer: 1 });
assert.equal(migrated.armyState.nextId, 4);
```

- [ ] **Step 2: Run the migration test and observe RED**

Run:

```powershell
node --test test/node/save-v8-migration.test.mjs
```

Expected: FAIL because `armyState` is absent, legacy `units` are not expanded, and object reserves are replaced by the current array default.

- [ ] **Step 3: Implement deterministic normalization**

Add pure static helpers to `SaveManager`:

```js
static _normalizeAvailableUnits(value) {
  const result = {};
  const entries = Array.isArray(value)
    ? value.map(item => [item?.unitId || item?.id, item?.count])
    : Object.entries(value && typeof value === 'object' ? value : {});
  for (const [unitId, rawCount] of entries) {
    if (!unitId) continue;
    const count = Math.max(0, Math.floor(Number(rawCount) || 0));
    result[unitId] = (result[unitId] || 0) + count;
  }
  return result;
}

static _normalizeArmyRecord(army, index) {
  const legacyIds = Array.isArray(army?.units)
    ? army.units.flatMap(item => {
        if (typeof item === 'string') return [item];
        const unitId = item?.unitId || item?.id;
        const count = Math.max(0, Math.floor(Number(item?.count) || 0));
        return unitId ? Array(count).fill(unitId) : [];
      })
    : [];
  return {
    ...army,
    id: String(army?.id || `army_${index + 1}`),
    unitIds: Array.isArray(army?.unitIds) ? [...army.unitIds] : legacyIds
  };
}
```

Implement `_normalizeArmyState(state)` using `state.armyState` first, then compatible top-level fields. Derive `nextId` from the greatest numeric `army_N` suffix when it is missing, preserve `battleHistory`, assign `state.armyState`, and clone its armies/reserves into the two top-level mirrors inside `_applyV8Defaults()`.

- [ ] **Step 4: Run focused migration tests and verify GREEN**

Run:

```powershell
node --test test/node/save-v8-migration.test.mjs test/node/save-v7-migration.test.mjs
```

Expected: all migration tests PASS and the source fixture remains unchanged.

- [ ] **Step 5: Commit only migration files**

```powershell
git add -- src/core/SaveManager.js test/node/save-v8-migration.test.mjs
git commit -m "fix: preserve armies through v8 migration"
```

---

### Task 2: Add atomic ArmySystem mutation commands

**Files:**
- Modify: `src/systems/ArmySystem.js`
- Modify: `test/node/army-system.test.mjs`

**Interfaces:**
- Produces: `replaceArmyUnits(armyId, unitIds, reason = 'replaceUnits'): { ok, army?, reason? }`
- Produces: `removeArmyUnits(armyId, unitIds, reason = 'casualties'): { ok, removedUnitIds?, army?, reason? }`
- Produces: `addReserveUnits(unitIds, reason = 'reserveReturn'): { ok, addedUnitIds?, reason? }`
- Produces: `getReserveCombatPower(opponents = []): number`
- Produces: `consumeReservePower(amount, reason = 'reserveAttrition'): { ok, consumedUnitIds, consumedPower, remainingPower }`

- [ ] **Step 1: Add failing atomicity and ownership tests**

Add tests that create an army with `['spears', 'spears', 'archers']` and assert:

```js
assert.equal(army.removeArmyUnits(id, ['spears', 'archers'], 'testLoss').ok, true);
assert.deepEqual(army.getArmy(id).unitIds, ['spears']);
assert.equal(army.removeArmyUnits(id, ['archers'], 'invalidLoss').ok, false);
assert.deepEqual(army.getArmy(id).unitIds, ['spears']);

const storeMirror = store.getState('armies');
storeMirror[0].unitIds.push('galley');
assert.deepEqual(army.getArmy(id).unitIds, ['spears']);
```

Add reserve tests:

```js
assert.equal(army.addReserveUnits(['spears', 'archers']).ok, true);
const result = army.consumeReservePower(21, 'clearEnemy');
assert.equal(result.ok, true);
assert.ok(result.consumedPower >= 21);
assert.deepEqual(army.getAvailableUnits(), store.getState('availableUnits'));
```

Import `store` in the test file.

- [ ] **Step 2: Run the ArmySystem test and observe RED**

Run:

```powershell
node --test test/node/army-system.test.mjs
```

Expected: FAIL because the new public methods do not exist.

- [ ] **Step 3: Implement mutation commands with one notify per success**

Implement `replaceArmyUnits()` with full validation before mutation. Implement `removeArmyUnits()` using a requested-count map so repeated unit IDs are removed exactly and an insufficient request returns without changes. Implement `addReserveUnits()` with full unit validation before incrementing counts.

Implement reserve power with the same rule currently in `EnemyExpansionSystem`: expand configured reserve counts, sort unit types by `combatPower` ascending, and consume enough units to meet or exceed the requested amount. Return `ok: false` without mutation when the full reserve cannot cover the amount; otherwise update `_availableUnits` and call `_notify(reason)` once.

Use `getCounterAdjustedArmyPower()` from `FormationUtils.js` for `getReserveCombatPower(opponents)`, matching the old EnemyExpansion calculation and current hero multiplier at the caller.

- [ ] **Step 4: Run ArmySystem and combat regressions**

Run:

```powershell
node --test test/node/army-system.test.mjs test/node/integrated-combat.test.mjs test/node/phased-combat.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 5: Commit only ArmySystem files**

```powershell
git add -- src/systems/ArmySystem.js test/node/army-system.test.mjs
git commit -m "feat: centralize army state mutations"
```

---

### Task 3: Route invasion, colony, and enemy-expansion writes through ArmySystem

**Files:**
- Create: `test/node/army-state-integration.test.mjs`
- Modify: `src/systems/InvasionSystem.js`
- Modify: `src/systems/ColonySystem.js`
- Modify: `src/systems/EnemyExpansionSystem.js`
- Modify: `src/main.js`

**Interfaces:**
- Consumes: all Task 2 ArmySystem commands.
- Produces: `InvasionSystem.setSystems({ army, population, resource })`
- Produces: `ColonySystem.setSystems({ popupManager, population, resource, army })`
- Produces: `EnemyExpansionSystem.setArmySystem(army)`

- [ ] **Step 1: Create a failing integration test for authoritative writes**

Build a minimal configuration with `spears` (10 power) and `archers` (12 power), instantiate real ArmySystem, and inject it into each legacy system. Cover these observable outcomes:

```js
// Invasion defeat removes land units from ArmySystem, not only Store.
invasion.spawnInvasion(1000);
const result = invasion.sendArmy(army.getArmy(armyId));
assert.equal(result.ok, true);
assert.deepEqual(army.getArmy(armyId).unitIds, []);
assert.deepEqual(army.getState().armies, store.getState('armies'));

// Colony occupation losses remain gone after getState/restoreState.
const savedAfterLoss = army.getState();
const restored = createArmySystem();
restored.restoreState(savedAfterLoss);
assert.deepEqual(restored.getArmy(armyId).unitIds, savedAfterLoss.armies[0].unitIds);

// Enemy clearing consumes the authoritative reserve.
const before = army.getAvailableUnits();
enemyExpansion._consumeArmyPower(10);
assert.notDeepEqual(army.getAvailableUnits(), before);
```

For the colony case, configure one colony, set `_activeEvent` to `{ type: 'offer', colonyId, nativePower: 1 }` in the test fixture, then call the public `attackColony(colonyId, armyId)` method that reaches `_applyOccupationLosses()`.

- [ ] **Step 2: Run the integration test and observe RED**

Run:

```powershell
node --test test/node/army-state-integration.test.mjs
```

Expected: FAIL because the three systems read/write Store instead of ArmySystem.

- [ ] **Step 3: Refactor InvasionSystem**

Add `_armySystem`, `_populationSystem`, and `_resourceSystem` fields plus:

```js
setSystems({ army, population, resource } = {}) {
  this._armySystem = army || null;
  this._populationSystem = population || null;
  this._resourceSystem = resource || null;
}
```

In `sendArmy()`, re-read the authoritative army with `this._armySystem.getArmy(army.id)`, calculate losses exactly as before, and call `replaceArmyUnits()` once for victory/draw/defeat. In `_processPendingRevives()`, call `addReserveUnits()` once. Replace new-path `window.__game` population/resource lookups with injected references while preserving guarded fallback only for backwards-compatible standalone use.

- [ ] **Step 4: Refactor ColonySystem and EnemyExpansionSystem**

Add `army` to ColonySystem injection. Replace `_getTotalArmyPower()` and `_getArmyById()` Store reads with `getArmies()` and `getArmy()`. Replace `_applyOccupationLosses()` Store writes with:

```js
const mutation = this._armySystem?.removeArmyUnits(army.id, lostIds, 'colonyOccupationLoss');
if (!mutation?.ok) return { lostCount: 0, defenseGain: 0, remainingCount: army.unitIds.length };
```

Add `setArmySystem()` to EnemyExpansionSystem. Replace reserve reads with `getAvailableUnits()/getReserveCombatPower()` and `_consumeArmyPower()` with `consumeReservePower(amount, 'clearEnemy').ok`.

- [ ] **Step 5: Wire dependencies in main.js**

After ArmySystem construction and before gameplay starts, add:

```js
this.systems.invasion.setSystems({
  army: this.systems.army,
  population: this.systems.population,
  resource: this.systems.resource
});
this.systems.colony.setSystems({
  popupManager: this.popupManager,
  population: this.systems.population,
  resource: this.systems.resource,
  army: this.systems.army
});
this.systems.enemyExpansion.setArmySystem(this.systems.army);
```

Remove the earlier duplicate ColonySystem `setSystems()` block rather than calling it twice.

- [ ] **Step 6: Run integration and subsystem regressions**

Run:

```powershell
node --test test/node/army-state-integration.test.mjs test/node/army-system.test.mjs test/node/city-state-expansion.test.mjs test/node/integrated-combat.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 7: Prove direct Store writes are gone and commit**

Run:

```powershell
rg -n "setState\(\{\s*(armies|availableUnits)|store\.getState\('(armies|availableUnits)'" src/systems/InvasionSystem.js src/systems/ColonySystem.js src/systems/EnemyExpansionSystem.js
```

Expected: no matches.

Commit:

```powershell
git add -- src/main.js src/systems/InvasionSystem.js src/systems/ColonySystem.js src/systems/EnemyExpansionSystem.js test/node/army-state-integration.test.mjs
git commit -m "fix: keep army losses in authoritative state"
```

---

### Task 4: Add end-to-end migration and round-trip regression

**Files:**
- Create: `test/node/army-save-roundtrip.test.mjs`
- Modify: `docs/save-system-design.md`

**Interfaces:**
- Consumes: `SaveManager.migrate()`, `ArmySystem.restoreState()`, `ArmySystem.getState()`.
- Produces: an executable regression proving v7 migration and repeated v8 round-trips preserve the authoritative army schema.

- [ ] **Step 1: Write the end-to-end test**

Use a v7 fixture with mixed legacy unit stacks, zero-count reserves, morale, supply, formation, hero, coordinates, and a pending revive. Execute:

```js
const migrated = SaveManager.migrate(v7Save);
const first = createConfiguredArmySystem();
first.restoreState(migrated.armyState);
first.removeArmyUnits('army_1', ['spearman'], 'roundTripLoss');
first.addReserveUnits(['archer'], 'roundTripRevive');

const savedV8 = SaveManager.migrate({
  version: 8,
  armyState: first.getState(),
  invasion: migrated.invasion
});
const second = createConfiguredArmySystem();
second.restoreState(savedV8.armyState);

assert.deepEqual(second.getState(), savedV8.armyState);
assert.deepEqual(second.getArmy('army_1').unitIds, ['spearman', 'archer']);
assert.equal(second.getAvailableUnits().archer, 2);
```

- [ ] **Step 2: Run the new test**

Run:

```powershell
node --test test/node/army-save-roundtrip.test.mjs
```

Expected: PASS using Tasks 1–3 behavior. If it fails, fix only the normalization or ArmySystem boundary revealed by the assertion and rerun.

- [ ] **Step 3: Update the save design to current v8 authority**

Replace the obsolete v1/per-period/beforeunload claims with:

- current schema version 8;
- daily `dayAutosaveTick` after completed daily settlement;
- `armyState` as authoritative, with top-level mirrors marked compatibility-only;
- v5→v6→v7→v8 migration chain;
- invalid versions rejected;
- browser unload recovery explicitly listed as not currently active and deferred to the corrupt-save recovery subproject.

- [ ] **Step 4: Run full verification**

Run:

```powershell
npm.cmd run verify
```

Expected: all previous 108 tests plus new tests PASS, followed by a successful syntax check.

- [ ] **Step 5: Review scope and commit**

Run:

```powershell
git diff --check
git status --short
```

Verify no pre-existing art/audio/UI changes are staged. Then:

```powershell
git add -- test/node/army-save-roundtrip.test.mjs docs/save-system-design.md
git commit -m "test: cover army save round trips"
```

---

## Final Verification

- [ ] Run `npm.cmd run verify` from the main repository.
- [ ] Run the three focused files together: `node --test test/node/save-v8-migration.test.mjs test/node/army-state-integration.test.mjs test/node/army-save-roundtrip.test.mjs`.
- [ ] Confirm the direct Store-write `rg` query returns no matches for the three refactored systems.
- [ ] Confirm `git diff --cached --name-only` is empty after commits.
- [ ] Record that Playwright remains environment-blocked by the missing bundled Chromium; do not install outside the authorized repository.
