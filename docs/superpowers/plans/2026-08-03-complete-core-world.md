# Deterministic World, Strategic Armies, and Battle Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic procedural world, scalable navigation and rendering, all-faction strategic army ownership, direct map commands, and sequential six-phase battle reports required by the approved complete RTS × SLG design.

**Architecture:** `WorldMapSystem` is the only runtime owner of generated terrain and exposes immutable queries to domain systems. Pure deterministic generators, placement solvers, navigation services, command rules, and combat resolution sit behind state-owning systems; `StrategicSimulationCoordinator` validates and commits cross-domain commands, while Pixi/UI code renders projections and never changes authoritative state.

**Tech Stack:** Native ES Modules, Node.js 20 `node:test`, PixiJS 8, Playwright 1.62, JSON configuration, IndexedDB save payloads through the existing `SaveManager`.

## Global Constraints

- Work only in `D:\【个人内容】GameDesignProjects\GM GameChain2026\GM GameChain2026`.
- Never read or modify the sibling `GM GameChain2026 Early Assess` directory.
- Preserve every pre-existing uncommitted source, art, audio, test and documentation change.
- Keep wood, stone, food and gold as the only four main resources.
- Keep native ES Modules and PixiJS; do not add React, Vue, Angular or a bundler migration.
- Upgrade the save schema to exactly version `9`; v5, v6, v7 and v8 must migrate without silent loss.
- Default generated maps are exactly `320×320`; official presets are `256×256`, `320×320` and `384×384`.
- The generated world, AI decisions, combat, trade risk, tavern and narrative randomness must never call `Math.random()` directly.
- `WorldMapSystem`, `TerritorySystem`, `ArmySystem`, `FactionSystem`, `DiplomacySystem`, `CommerceSystem`, `WildSiteSystem`, `ColonySystem`, `EraSystem`, `HeroSystem`, `QuestSystem` and `EventSystem` each write only their owned state.
- `Store`, UI, `EventBus` listeners and `MapRenderer` never mutate authoritative domain state.
- Existing 57 civilizations, 138 units, 111 runtime buildings and 72 heroes remain; depth and integration take precedence over adding more of those records.
- Expand the authored world content to exactly 24 city-state profiles and 96 wild-site templates.
- New colonization targets must always reference a generated city-state; only migrated v8 colonies may remain `legacy_offmap`.
- Hero content contracts are exactly 30 notable, 24 renowned, 12 epic and 6 legendary heroes; 108 relationship edges; 36 combos; 72 historical missions.
- Narrative content contracts include 84 era scenarios, 57 civilization chains, 72 hero chains and 24 city-state chains.
- Every production behavior change follows RED → GREEN → focused regression → commit.
- Stage only the files named by the current task.

---

## Locked File and Interface Boundaries

- `src/core/RandomService.js` is the only deterministic randomness primitive shared by world and content volumes. Single decisions call keyed `RandomService.float/int/pickWeighted`; sequence algorithms call `createDeterministicRng()`. No volume creates a second hash, PRNG or randomness facade.
- World content work supplies `configRegistry.getCityStateProfiles(): CityStateProfile[]` with exactly 24 records and `configRegistry.getWildSiteTemplates(): WildSiteTemplate[]` with exactly 96 records. The generator never reads fixed runtime coordinates from those profiles.
- `src/world/WorldPlacementSolver.js` exports the sole cross-volume wild-site density formula, `calculateWildSiteCounts({ landReachable, navigableWater }): { land, naval, total }`. Content-volume Task 6 consumes or re-exports this function; it must not copy, wrap with a second formula, or rename its result fields.
- `WorldMapSystem.findPath()` has one cross-volume contract: input `{ start, goal, profile, context }`; output `{ ok, reason?, path, totalCost, worldRevision, visitedNodes }`. Callers do not rename `start`/`goal`, omit `profile`/`context`, or expect a bare path array.
- Army creation, order writes and battle writes use only `ArmySystem.createArmy({ ownerId, name, position, unitStacks = [], creationId = null })`, `commitOrder(...)` and `resolveEngagement(...)`. Player, faction, city-state and wild owners use the same methods.
- Content systems join fixed day settlement through `StrategicSimulationCoordinator.registerDayPhase(...)`, report quest/narrative facts through `submitFact(...)`, and persist coordinator idempotency through `getState()/restoreState()`.
- Save-envelope work supplies a migrated v9 payload before `Game.restoreFromSave()` runs. This plan owns only the `world` and `armyState` domain payloads and must not reintroduce the removed v8 mirror keys.
- Diplomacy, faction, commerce, wild-site, colony, era, hero, quest and event implementation plans consume the command/event interfaces established here; they do not gain write access to `WorldMapSystem` or `ArmySystem` internals.
- Each task below must pass its focused tests and `npm.cmd run check` before its commit. Browser tests are additionally required for Tasks 7, 9 and 10.

## Task Dependency Order

Cross-volume execution order is owned by the complete-game master plan and overrides this document whenever work from another volume is interleaved. Within this core-world volume, execute tasks in exactly this order: **Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 8 → Task 6 → Task 7 → Task 9 → Task 10**.

- Task 1: Deterministic keyed randomness and domain-event IDs.
- Task 2: Procedural terrain, biome and hydrology blueprint.
- Task 3: Constraint placement and generation validation.
- Task 4: `WorldMapSystem` ownership, RLE state and exact restore.
- Task 5: 16×16 hierarchical navigation and cost layers.
- Task 8: All-faction `ArmySystem` state, atomic initial stacks and reserve ownership.
- Task 6: Runtime world integration and v9 world payload wiring while preserving canonical `armyState`.
- Task 7: Chunked Pixi rendering, fog and marker budgets.
- Task 9: Strategic army orders, transactional coordination and direct map command UI.
- Task 10: Sequential deterministic six-phase combat, authoritative writeback and structured battle reports.

---

### Task 1: Deterministic Keyed Randomness and Domain Event Identity

**Files:**
- Create: `src/core/RandomService.js`
- Create: `src/core/DomainEvent.js`
- Test: `test/node/deterministic-foundation.test.mjs`

**Interfaces:**
- Consumes: UTF-8 `worldSeed`, `namespace`, `stableEntityId` and integer `ordinal` values supplied by later systems.
- Produces: `hashSeedParts(parts: Array<string|number>): number`; order-independent keyed helpers `RandomService.float(key): number`, `RandomService.int(key, min, maxInclusive): number`, and `RandomService.pickWeighted(key, entries): T`; stateful `createDeterministicRng(key): DeterministicRandom`; stream methods `nextFloat()`, `nextInt(min, maxInclusive)`, `pick(values)`, `shuffle(values)` and `getState()`; and `createDomainEvent(input: DomainEventInput): DomainEvent`. A `RandomKey` is exactly `{ worldSeed: string, namespace: string, stableEntityId?: string, ordinal?: number }`; only `createDeterministicRng()` additionally accepts `state` for restoration.
- Produces event IDs in exact `evt_000000000001` form from the coordinator-owned positive integer sequence; it does not inspect `Date.now()` or generate a random UUID.

- [ ] **Step 1: Write the failing deterministic-foundation test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { RandomService, createDeterministicRng, hashSeedParts } from '../../src/core/RandomService.js';
import { createDomainEvent } from '../../src/core/DomainEvent.js';

test('keyed random streams replay exactly and remain namespace isolated', () => {
  const key = { worldSeed: '长河-2026', namespace: 'world.elevation', stableEntityId: 'chunk:4,7', ordinal: 3 };
  const first = createDeterministicRng(key);
  const second = createDeterministicRng(key);
  const a = Array.from({ length: 8 }, () => first.nextInt(0, 1_000_000));
  const b = Array.from({ length: 8 }, () => second.nextInt(0, 1_000_000));
  assert.deepEqual(a, b);
  assert.notDeepEqual(
    a,
    Array.from({ length: 8 }, () => createDeterministicRng({ ...key, namespace: 'world.rainfall' }).nextInt(0, 1_000_000))
  );
  assert.equal(hashSeedParts(['a', 1, 'bc']), hashSeedParts(['a', 1, 'bc']));
});

test('keyed helpers give content systems stable scalar and weighted choices', () => {
  const key = { worldSeed: 'content-seed', namespace: 'quest.reward', stableEntityId: 'quest_17', ordinal: 2 };
  assert.equal(RandomService.float(key), RandomService.float(key));
  assert.equal(RandomService.int(key, 4, 11), RandomService.int(key, 4, 11));
  assert.equal(
    RandomService.pickWeighted(key, [{ value: 'food', weight: 3 }, { value: 'gold', weight: 1 }]),
    RandomService.pickWeighted(key, [{ value: 'food', weight: 3 }, { value: 'gold', weight: 1 }])
  );
  assert.notEqual(RandomService.float(key), RandomService.float({ ...key, ordinal: 3 }));
});

test('random state can be persisted without calling Math.random', () => {
  const original = Math.random;
  Math.random = () => { throw new Error('direct Math.random is forbidden'); };
  try {
    const rng = createDeterministicRng({ worldSeed: 'save-seed', namespace: 'combat', stableEntityId: 'battle_4' });
    rng.nextFloat();
    const state = rng.getState();
    const expected = rng.nextFloat();
    const restored = createDeterministicRng({ worldSeed: 'save-seed', namespace: 'combat', stableEntityId: 'battle_4', state });
    assert.equal(restored.nextFloat(), expected);
  } finally {
    Math.random = original;
  }
});

test('domain events use coordinator sequence and preserve the approved envelope', () => {
  assert.deepEqual(createDomainEvent({
    sequence: 7,
    type: 'army.orderAccepted',
    day: 12,
    tick: 4,
    actorId: 'player',
    targetId: 'army_3',
    correlationId: 'cmd_move_9',
    payload: { orderType: 'move' }
  }), {
    eventId: 'evt_000000000007',
    type: 'army.orderAccepted',
    schemaVersion: 1,
    day: 12,
    tick: 4,
    actorId: 'player',
    targetId: 'army_3',
    correlationId: 'cmd_move_9',
    payload: { orderType: 'move' }
  });
});
```

- [ ] **Step 2: Run the focused RED test**

Run: `node --test test/node/deterministic-foundation.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/core/RandomService.js`.

- [ ] **Step 3: Implement the deterministic primitives**

Use a UTF-8 FNV-1a seed combiner and a non-zero xorshift32 stream. The public implementation must follow this outline and validate all integer ranges:

```js
const encoder = new TextEncoder();

export function hashSeedParts(parts) {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    for (const byte of encoder.encode(`${String(part).length}:${String(part)}|`)) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash || 0x6d2b79f5;
}

export class DeterministicRandom {
  constructor(state) { this._state = (state >>> 0) || 0x6d2b79f5; }
  nextUint32() {
    let value = this._state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this._state = value >>> 0;
    return this._state;
  }
  nextFloat() { return this.nextUint32() / 0x1_0000_0000; }
  nextInt(min, maxInclusive) {
    if (!Number.isInteger(min) || !Number.isInteger(maxInclusive) || maxInclusive < min) throw new RangeError('invalid_integer_range');
    return min + Math.floor(this.nextFloat() * (maxInclusive - min + 1));
  }
  pick(values) {
    if (!Array.isArray(values) || values.length === 0) throw new RangeError('empty_pick');
    return values[this.nextInt(0, values.length - 1)];
  }
  shuffle(values) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = this.nextInt(0, index);
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  }
  getState() { return this._state; }
}

export function createDeterministicRng({ worldSeed, namespace, stableEntityId = '', ordinal = 0, state }) {
  const seed = state === undefined ? hashSeedParts([worldSeed, namespace, stableEntityId, ordinal]) : state;
  return new DeterministicRandom(seed);
}

export const RandomService = Object.freeze({
  float(key) {
    return createDeterministicRng(key).nextFloat();
  },
  int(key, min, maxInclusive) {
    return createDeterministicRng(key).nextInt(min, maxInclusive);
  },
  pickWeighted(key, entries) {
    if (!Array.isArray(entries) || entries.length === 0) throw new RangeError('empty_weighted_pick');
    const normalized = entries.map(({ value, weight }) => {
      if (!Number.isFinite(weight) || weight <= 0) throw new RangeError('invalid_weight');
      return { value, weight };
    });
    const total = normalized.reduce((sum, entry) => sum + entry.weight, 0);
    let cursor = createDeterministicRng(key).nextFloat() * total;
    for (const entry of normalized) {
      cursor -= entry.weight;
      if (cursor < 0) return entry.value;
    }
    return normalized.at(-1).value;
  }
});
```

The three `RandomService` helpers must be pure keyed operations: repeated calls with the same complete key return the same result and never share or advance hidden state. Content systems use those helpers for isolated single decisions and increment `ordinal` explicitly for repeated decisions; simulation algorithms that need a sequence use `createDeterministicRng()`. `createDomainEvent()` must reject missing type, non-positive sequence and non-integer day/tick, clone the payload with `structuredClone`, and never retain the caller's mutable payload reference.

- [ ] **Step 4: Run GREEN and focused regression**

Run: `node --test test/node/deterministic-foundation.test.mjs`

Expected: PASS, 4 tests.

Run: `npm.cmd run check`

Expected: all Node tests pass and the syntax checker exits 0.

- [ ] **Step 5: Commit only Task 1 files**

```powershell
git diff --cached --name-only
git add -- 'src/core/RandomService.js' 'src/core/DomainEvent.js' 'test/node/deterministic-foundation.test.mjs'
git diff --cached --name-only
git commit -m "feat: add deterministic world primitives"
```

Expected staged paths before commit: exactly the three Task 1 files above.

---

### Task 2: Procedural Terrain, Biome, and Hydrology Blueprint

**Files:**
- Create: `config/world-generation.json`
- Create: `src/world/WorldMapGenerator.js`
- Modify: `src/core/ConfigRegistry.js:14-46`
- Test: `test/node/world-map-generator.test.mjs`

**Interfaces:**
- Consumes: `createDeterministicRng()` and `hashSeedParts()` imported from `src/core/RandomService.js`; no global RNG or second random utility.
- Produces: `generateTerrainBlueprint(input: { seedText: string, width: number, height: number, generatorConfig: object }): WorldBlueprint`.
- `WorldBlueprint` contains `{ schemaVersion: 1, seedText, seedHash, generatorVersion, width, height, tileSize, terrainRows: string[], biomeRows: string[], hydrology: { riverCells, lakes }, metrics: { waterRatio, majorContinents, islandChains, riverCount, lakeCount }, generationChecksum }`.
- Produces: `configRegistry.getWorldGenerationConfig(): object`.

- [ ] **Step 1: Write the failing topology test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateTerrainBlueprint } from '../../src/world/WorldMapGenerator.js';

const config = JSON.parse(readFileSync(new URL('../../config/world-generation.json', import.meta.url), 'utf8'));

function differenceRatio(left, right) {
  let changed = 0;
  let total = 0;
  for (let y = 0; y < left.length; y += 1) for (let x = 0; x < left[y].length; x += 1) {
    total += 1;
    if (left[y][x] !== right[y][x]) changed += 1;
  }
  return changed / total;
}

test('official presets have exact approved dimensions and the large preset is default', () => {
  assert.deepEqual(config.presets.standard, { width: 256, height: 256, cityStateCount: 14 });
  assert.deepEqual(config.presets.large, { width: 320, height: 320, cityStateCount: 18 });
  assert.deepEqual(config.presets.huge, { width: 384, height: 384, cityStateCount: 24 });
  assert.equal(config.defaultPreset, 'large');
});

test('terrain generation is replayable and satisfies large-map topology budgets', () => {
  const input = { seedText: '黄河入海', width: 320, height: 320, generatorConfig: config };
  const first = generateTerrainBlueprint(input);
  const replay = generateTerrainBlueprint(input);
  assert.equal(first.generationChecksum, replay.generationChecksum);
  assert.deepEqual(first.terrainRows, replay.terrainRows);
  assert.equal(first.terrainRows.length, 320);
  assert.ok(first.terrainRows.every(row => row.length === 320));
  assert.ok(first.metrics.waterRatio >= 0.29 && first.metrics.waterRatio <= 0.35, String(first.metrics.waterRatio));
  assert.ok(first.metrics.majorContinents >= 2 && first.metrics.majorContinents <= 4);
  assert.ok(first.metrics.islandChains >= 3 && first.metrics.islandChains <= 6);
  assert.ok(first.metrics.riverCount >= 4 && first.metrics.riverCount <= 8);
  assert.ok(first.metrics.lakeCount >= 3 && first.metrics.lakeCount <= 7);
  assert.match(first.terrainRows.join(''), /^[RGDFMWBS]+$/);
});

test('different seeds materially change terrain without changing dimensions', () => {
  const left = generateTerrainBlueprint({ seedText: 'seed-left', width: 256, height: 256, generatorConfig: config });
  const right = generateTerrainBlueprint({ seedText: 'seed-right', width: 256, height: 256, generatorConfig: config });
  assert.ok(differenceRatio(left.terrainRows, right.terrainRows) >= 0.35);
});
```

- [ ] **Step 2: Run the focused RED test**

Run: `node --test test/node/world-map-generator.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/world/WorldMapGenerator.js`.

- [ ] **Step 3: Add exact generation configuration and minimal generator**

Create `config/world-generation.json` with these values:

```json
{
  "generatorVersion": 1,
  "defaultPreset": "large",
  "tileSize": 60,
  "customSize": { "min": 192, "max": 512, "multiple": 32, "maxCells": 262144 },
  "presets": {
    "standard": { "width": 256, "height": 256, "cityStateCount": 14 },
    "large": { "width": 320, "height": 320, "cityStateCount": 18 },
    "huge": { "width": 384, "height": 384, "cityStateCount": 24 }
  },
  "topology": {
    "waterRatio": 0.32,
    "waterTolerance": 0.03,
    "majorContinents": { "min": 2, "max": 4, "minimumLandShare": 0.08 },
    "islandChains": { "min": 3, "max": 6 },
    "rivers": { "min": 4, "max": 8 },
    "lakes": { "min": 3, "max": 7 },
    "maxRetries": 8
  },
  "chunkSize": 16,
  "groundCodes": ["R", "G", "D", "F", "M", "W", "B", "S"],
  "biomeCodes": ["o", "c", "g", "f", "d", "h", "w", "t"]
}
```

Implement the generator as a pure pipeline with these private stages: `normalizeDimensions`, `buildContinentalElevation`, `chooseSeaLevelByQuantile`, `classifyLandAndWater`, `labelConnectedComponents`, `addIslandChains`, `buildClimateFields`, `classifyBiomes`, `carveRiversAndLakes`, `mapToLegacyGroundCodes`, and `checksumBlueprint`. The exported orchestration must be:

```js
export function generateTerrainBlueprint({ seedText, width, height, generatorConfig }) {
  const dimensions = normalizeDimensions(width, height, generatorConfig.customSize);
  const root = createDeterministicRng({ worldSeed: seedText, namespace: 'world.topology' });
  const elevation = buildContinentalElevation(dimensions, root, generatorConfig.topology);
  const seaLevel = chooseSeaLevelByQuantile(elevation, generatorConfig.topology.waterRatio);
  const landWater = classifyLandAndWater(elevation, seaLevel);
  addIslandChains(landWater, elevation, seedText, generatorConfig.topology.islandChains);
  const climate = buildClimateFields(elevation, landWater, seedText, dimensions);
  const biomeRows = classifyBiomes(climate, elevation, landWater, dimensions);
  const hydrology = carveRiversAndLakes(elevation, landWater, seedText, generatorConfig.topology);
  const terrainRows = mapToLegacyGroundCodes({ elevation, landWater, biomeRows, hydrology, dimensions });
  const metrics = measureTopology(terrainRows, hydrology, generatorConfig.topology.majorContinents.minimumLandShare);
  const blueprint = {
    schemaVersion: 1,
    seedText,
    seedHash: hashSeedParts([seedText]),
    generatorVersion: generatorConfig.generatorVersion,
    width: dimensions.width,
    height: dimensions.height,
    tileSize: generatorConfig.tileSize,
    terrainRows,
    biomeRows,
    hydrology,
    metrics
  };
  return { ...blueprint, generationChecksum: checksumBlueprint(blueprint) };
}
```

The helpers must use stable row-major iteration and sorted component IDs. They must tune sea level by quantile rather than repeated random rolls, choose river heads from high-elevation cells, follow strictly decreasing neighboring elevation, and terminate rivers in `S/W` or a generated lake. `ConfigRegistry.loadAll()` must load the file under key `worldGeneration`, and `getWorldGenerationConfig()` must return it without mutation.

- [ ] **Step 4: Run GREEN and generator regressions**

Run: `node --test test/node/world-map-generator.test.mjs`

Expected: PASS, 3 tests.

Run: `node --test test/node/map-waterways.test.mjs test/node/main-config-validation.test.mjs`

Expected: existing fixed-map and configuration tests remain PASS.

Run: `npm.cmd run check`

Expected: all Node tests pass and syntax validation exits 0.

- [ ] **Step 5: Commit only Task 2 files**

```powershell
git diff --cached --name-only
git add -- 'config/world-generation.json' 'src/world/WorldMapGenerator.js' 'src/core/ConfigRegistry.js' 'test/node/world-map-generator.test.mjs'
git diff --cached --name-only
git commit -m "feat: generate deterministic world topology"
```

Expected staged paths before commit: exactly the four Task 2 files above.

---

### Task 3: Constraint Placement and Generated-World Validation

**Files:**
- Create: `src/world/WorldPlacementSolver.js`
- Create: `src/world/WorldGenerationValidator.js`
- Create: `scripts/validate-world-generation.mjs`
- Test: `test/node/world-placement.test.mjs`

**Interfaces:**
- Consumes: `WorldBlueprint` from Task 2, `createDeterministicRng()` from `src/core/RandomService.js`, `CityStateProfile[]` from `configRegistry.getCityStateProfiles()`, `WildSiteTemplate[]` from `configRegistry.getWildSiteTemplates()`, and the preset block from `getWorldGenerationConfig()`.
- Produces: `calculateWildSiteCounts({ landReachable: number, navigableWater: number }): { land: number, naval: number, total: number }` as the only density formula shared with the content volume, plus `calculateWildQuota(blueprint): { land, naval, total }` as the blueprint-measurement adapter.
- Produces: `placeWorldEntities(input: { blueprint, cityStateProfiles, wildSiteTemplates, generationConfig, preset }): PlacementManifest`.
- `PlacementManifest` is `{ playerStart, cityStates: Array<{instanceId, profileId, gridX, gridY, domain}>, wildSites: Array<{instanceId, templateId, gridX, gridY, domain, threatTier}>, resourceNodes: Array<{instanceId, resourceId, gridX, gridY}> }`.
- Produces: `validateGeneratedWorld(input): { ok: boolean, errors: Array<{code, entityId, detail}>, metrics: object }` and `WorldGenerationError` with stable `reasonCode` and structured `diagnostics`.

- [ ] **Step 1: Write the failing placement and validation test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateTerrainBlueprint } from '../../src/world/WorldMapGenerator.js';
import {
  calculateWildSiteCounts,
  placeWorldEntities
} from '../../src/world/WorldPlacementSolver.js';
import { validateGeneratedWorld } from '../../src/world/WorldGenerationValidator.js';

const generationConfig = JSON.parse(readFileSync(new URL('../../config/world-generation.json', import.meta.url), 'utf8'));
const cityStateProfiles = Array.from({ length: 24 }, (_, index) => ({
  id: `city_profile_${index + 1}`,
  domain: index < 6 ? 'naval' : 'land',
  personality: index % 2 ? 'mercantile' : 'militarist'
}));
const categories = ['resource_guard', 'bandit_camp', 'ruin_guard', 'roaming_host', 'rebel_fort', 'pirate_fleet', 'blockade_fleet', 'wreck_guard'];
const wildSiteTemplates = Array.from({ length: 96 }, (_, index) => ({
  id: `wild_template_${index + 1}`,
  category: categories[index % categories.length],
  domain: index % categories.length >= 5 ? 'naval' : 'land',
  threatTier: ['low', 'medium', 'high', 'landmark'][index % 4]
}));

test('shared wild-site density formula returns the exact large-world quota fields', () => {
  assert.deepEqual(
    calculateWildSiteCounts({ landReachable: 76_500, navigableWater: 24_000 }),
    { land: 90, naval: 20, total: 110 }
  );
});

test('large preset places 18 city-states and the density-derived wild-site quota', () => {
  const blueprint = generateTerrainBlueprint({ seedText: 'placement-large', width: 320, height: 320, generatorConfig: generationConfig });
  const manifest = placeWorldEntities({ blueprint, cityStateProfiles, wildSiteTemplates, generationConfig, preset: 'large' });
  const result = validateGeneratedWorld({ blueprint, manifest, generationConfig, preset: 'large' });
  assert.equal(manifest.cityStates.length, 18);
  assert.ok(manifest.wildSites.length >= 95 && manifest.wildSites.length <= 115, String(manifest.wildSites.length));
  assert.equal(new Set(manifest.cityStates.map(item => item.instanceId)).size, 18);
  assert.equal(new Set(manifest.wildSites.map(item => item.instanceId)).size, manifest.wildSites.length);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.errors.length, 0);
});

test('spawn safety and domain legality are enforced as validator facts', () => {
  const blueprint = generateTerrainBlueprint({ seedText: 'placement-safety', width: 256, height: 256, generatorConfig: generationConfig });
  const manifest = placeWorldEntities({ blueprint, cityStateProfiles, wildSiteTemplates, generationConfig, preset: 'standard' });
  const result = validateGeneratedWorld({ blueprint, manifest, generationConfig, preset: 'standard' });
  assert.equal(result.metrics.hostileSitesWithinSpawn20, 0);
  assert.ok(result.metrics.spawnLandComponentSize >= 2500);
  assert.ok(result.metrics.nearestPortPathLength <= 24);
  assert.ok(manifest.cityStates.every(instance => ['S', 'W'].includes(blueprint.terrainRows[instance.gridY][instance.gridX]) === (instance.domain === 'naval')));
  assert.ok(manifest.wildSites.every(instance => ['S', 'W'].includes(blueprint.terrainRows[instance.gridY][instance.gridX]) === (instance.domain === 'naval')));
});

test('validator reports stable codes for overlapping generated entities', () => {
  const blueprint = generateTerrainBlueprint({ seedText: 'placement-invalid', width: 256, height: 256, generatorConfig: generationConfig });
  const manifest = placeWorldEntities({ blueprint, cityStateProfiles, wildSiteTemplates, generationConfig, preset: 'standard' });
  manifest.wildSites[1].gridX = manifest.wildSites[0].gridX;
  manifest.wildSites[1].gridY = manifest.wildSites[0].gridY;
  const result = validateGeneratedWorld({ blueprint, manifest, generationConfig, preset: 'standard' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.code === 'placement_overlap'));
});
```

- [ ] **Step 2: Run the focused RED test**

Run: `node --test test/node/world-placement.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/world/WorldPlacementSolver.js`.

- [ ] **Step 3: Implement deterministic placement, validation and retry diagnostics**

The solver must use stable candidate lists sorted by `y`, then `x`; shuffle only with `createDeterministicRng({ worldSeed: blueprint.seedText, namespace: 'world.placement', stableEntityId: preset })`. Use exact runtime quotas:

```js
const CITY_COUNTS = Object.freeze({ standard: 14, large: 18, huge: 24 });

export function calculateWildSiteCounts({ landReachable, navigableWater }) {
  if (!Number.isInteger(landReachable) || landReachable < 0) throw new RangeError('invalid_land_reachable');
  if (!Number.isInteger(navigableWater) || navigableWater < 0) throw new RangeError('invalid_navigable_water');
  const land = Math.max(24, Math.min(96, Math.round(landReachable / 850)));
  const naval = navigableWater < 800 ? 0 : Math.max(4, Math.min(32, Math.round(navigableWater / 1200)));
  return { land, naval, total: land + naval };
}

export function calculateWildQuota(blueprint) {
  const { landReachable, navigableWater } = countReachablePlacementCells(blueprint);
  return calculateWildSiteCounts({ landReachable, navigableWater });
}

export function placeWorldEntities({ blueprint, cityStateProfiles, wildSiteTemplates, generationConfig, preset }) {
  if (cityStateProfiles.length !== 24) throw new WorldGenerationError('city_profile_contract', { actual: cityStateProfiles.length, expected: 24 });
  if (wildSiteTemplates.length !== 96) throw new WorldGenerationError('wild_template_contract', { actual: wildSiteTemplates.length, expected: 96 });
  const playerStart = choosePlayerStart(blueprint, generationConfig);
  const cityStates = placeCityStates({ blueprint, profiles: cityStateProfiles, count: CITY_COUNTS[preset], playerStart });
  const quota = calculateWildQuota(blueprint);
  const wildSites = placeWildSites({ blueprint, templates: wildSiteTemplates, quota, playerStart, cityStates });
  const resourceNodes = placeGuaranteedResources({ blueprint, playerStart, cityStates });
  return { playerStart, cityStates, wildSites, resourceNodes };
}
```

`countReachablePlacementCells(blueprint)` is measurement only: count land cells in components reachable from valid land placement candidates as `landReachable`, and count `S`/`W` cells in navigable water components as `navigableWater`. It must not contain division, clamping or preset-specific density logic. `calculateWildQuota()` returns the shared `{ land, naval, total }` object unchanged, and `placeWildSites()` consumes those exact field names. Content-volume Task 6 may directly import or re-export `calculateWildSiteCounts`, but may not reproduce the `/850`, `/1200`, clamp or water-threshold expressions.

Enforce city-to-player path distance 30, city-to-city distance 28, wild-to-wild 12, wild-to-city 16, no hostile wild site within spawn radius 20, three to seven land targets per eligible 64×64 macro-region, no more than three targets per 32×32 region, at least two naval targets in each large navigable water body, and the 35/40/20/5 threat distribution within one rounding unit. `validateGeneratedWorld()` must return all violations in deterministic code/entity order instead of throwing on the first one.

Create `scripts/validate-world-generation.mjs` with CLI `--preset=<standard|large|huge> --seeds=<positive integer>`. It must generate seed names `release-seed-000000` upward, exit 1 on the first invalid world after printing its structured errors, and print JSON summary `{ preset, seeds, failures, minWildSites, maxWildSites }` on success.

- [ ] **Step 4: Run GREEN and multi-seed regression**

Run: `node --test test/node/world-placement.test.mjs`

Expected: PASS, 4 tests, including exact `{ land: 90, naval: 20, total: 110 }` density output.

Run: `node scripts/validate-world-generation.mjs --preset=large --seeds=25`

Expected: exit 0 with JSON containing `"failures":0`, `"minWildSites"` at least 95 and `"maxWildSites"` at most 115.

Run: `npm.cmd run check`

Expected: all Node tests pass and syntax validation exits 0.

- [ ] **Step 5: Commit only Task 3 files**

```powershell
git diff --cached --name-only
git add -- 'src/world/WorldPlacementSolver.js' 'src/world/WorldGenerationValidator.js' 'scripts/validate-world-generation.mjs' 'test/node/world-placement.test.mjs'
git diff --cached --name-only
git commit -m "feat: enforce generated world placement constraints"
```

Expected staged paths before commit: exactly the four Task 3 files above.

---

### Task 4: WorldMapSystem Ownership, RLE State, and Exact Restore

**Files:**
- Create: `src/world/WorldMapCodec.js`
- Create: `src/systems/WorldMapSystem.js`
- Test: `test/node/world-map-system.test.mjs`

**Interfaces:**
- Consumes: `generateTerrainBlueprint()`, `placeWorldEntities()` and `validateGeneratedWorld()` from Tasks 2–3.
- Produces: `WorldMapSystem.initNew({ seedText: string, preset: 'standard'|'large'|'huge' }): PlacementManifest`, `restoreState(state: WorldMapSaveState): void`, `getState(): WorldMapSaveState`, `getDimensions(): { width, height, tileSize }`, `getTile(x, y): string|null`, `getBiome(x, y): string|null`, `getMapView(): ReadonlyMapView`, `getSpawnManifest(): PlacementManifest`, `getNavigationRevision(): number`, and `applyTerrainDelta(delta): { ok, reason? }`.
- Produces codec functions `encodeRleRows(rows: string[]): string[]` and `decodeRleRows(rows: string[], width: number, height: number): string[]`.
- `getMapView()` exposes a frozen compatibility view `{ gridWidth, gridHeight, tileSize, groundTypes, grid }`; callers may read but cannot replace rows or ground definitions.

- [ ] **Step 1: Write the failing state-owner test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeRleRows, decodeRleRows } from '../../src/world/WorldMapCodec.js';
import { WorldMapSystem } from '../../src/systems/WorldMapSystem.js';

const generationConfig = {
  generatorVersion: 1,
  defaultPreset: 'large',
  tileSize: 60,
  presets: { large: { width: 4, height: 3, cityStateCount: 1 } },
  groundTypes: { G: { buildable: true }, S: { buildable: 'restricted' } }
};
const blueprint = {
  schemaVersion: 1,
  seedText: 'world-state', seedHash: 7, generatorVersion: 1,
  width: 4, height: 3, tileSize: 60,
  terrainRows: ['GGGS', 'GGSS', 'GGGS'],
  biomeRows: ['gggc', 'ggcc', 'gggc'],
  hydrology: { riverCells: [], lakes: [] }, metrics: {}, generationChecksum: 'checksum-7'
};
const manifest = { playerStart: { x: 1, y: 1 }, cityStates: [], wildSites: [], resourceNodes: [] };

function createSystem() {
  return new WorldMapSystem({
    generationConfig,
    cityStateProfiles: [],
    wildSiteTemplates: [],
    generateBlueprint: () => structuredClone(blueprint),
    placeEntities: () => structuredClone(manifest),
    validateWorld: () => ({ ok: true, errors: [], metrics: {} }),
    legacyMaps: { base_map_v1: { gridWidth: 2, gridHeight: 2, tileSize: 60, groundTypes: generationConfig.groundTypes, grid: ['GG', 'GS'] } }
  });
}

test('RLE rows round-trip repeated and single terrain codes', () => {
  const rows = ['GGGGSSG', 'RDFMWBS'];
  assert.deepEqual(decodeRleRows(encodeRleRows(rows), 7, 2), rows);
});

test('generated world state restores exact terrain and placement checksum', () => {
  const system = createSystem();
  system.initNew({ seedText: 'world-state', preset: 'large' });
  const state = system.getState();
  assert.equal(state.source, 'generated');
  assert.deepEqual(state.size, { width: 4, height: 3, tileSize: 60 });
  assert.equal(state.generationChecksum, 'checksum-7');
  assert.notDeepEqual(state.terrainRleRows, blueprint.terrainRows);
  const restored = createSystem();
  restored.restoreState(state);
  assert.equal(restored.getTile(3, 0), 'S');
  assert.deepEqual(restored.getSpawnManifest(), manifest);
  assert.equal(restored.getState().generationChecksum, state.generationChecksum);
});

test('legacy_static v8 world uses immutable base_map_v1 coordinates', () => {
  const system = createSystem();
  system.restoreState({ schemaVersion: 1, source: 'legacy_static', mapId: 'base_map_v1' });
  assert.deepEqual(system.getDimensions(), { width: 2, height: 2, tileSize: 60 });
  assert.equal(system.getTile(1, 1), 'S');
  assert.throws(() => { system.getMapView().grid[0] = 'SS'; }, TypeError);
});
```

- [ ] **Step 2: Run the focused RED test**

Run: `node --test test/node/world-map-system.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/world/WorldMapCodec.js`.

- [ ] **Step 3: Implement the map owner and exact codec**

Use unambiguous RLE tokens `<base36 count>:<code>` separated by commas. Reject zero counts, unknown codes, wrong decoded width, wrong row count and oversized output before allocating the full result.

`WorldMapSystem` must keep `_terrainRows`, `_biomeRows`, `_spawnManifest`, `_terrainDeltas`, `_navigationRevision` and generation metadata private. Its save state must follow this shape:

```js
{
  schemaVersion: 1,
  source: 'generated',
  mapId: null,
  seedText: 'world-state',
  seedHash: 7,
  generatorVersion: 1,
  size: { width: 4, height: 3, tileSize: 60 },
  generationParams: { preset: 'large' },
  terrainRleRows: ['3:G,1:S', '2:G,2:S', '3:G,1:S'],
  biomeRleRows: ['3:g,1:c', '2:g,2:c', '3:g,1:c'],
  hydrology: { riverCells: [], lakes: [] },
  playerStart: { x: 1, y: 1 },
  initialPlacementManifest: manifest,
  terrainDeltas: [],
  navigationRevision: 0,
  generationChecksum: 'checksum-7'
}
```

`initNew()` must validate the completed blueprint/manifest before assigning any private field. `restoreState()` must decode into local variables, verify dimensions and checksum, then commit all fields together. `applyTerrainDelta({ deltaId, gridX, gridY, fromCode, toCode, reason })` must reject a stale `fromCode`, apply one change, increment navigation revision once and preserve an idempotent set of `deltaId` values.

- [ ] **Step 4: Run GREEN and state regression**

Run: `node --test test/node/world-map-system.test.mjs`

Expected: PASS, 3 tests.

Run: `node --test test/node/world-map-generator.test.mjs test/node/world-placement.test.mjs`

Expected: all generator and placement tests PASS.

Run: `npm.cmd run check`

Expected: all Node tests pass and syntax validation exits 0.

- [ ] **Step 5: Commit only Task 4 files**

```powershell
git diff --cached --name-only
git add -- 'src/world/WorldMapCodec.js' 'src/systems/WorldMapSystem.js' 'test/node/world-map-system.test.mjs'
git diff --cached --name-only
git commit -m "feat: own and restore generated world state"
```

Expected staged paths before commit: exactly the three Task 4 files above.

---

### Task 5: 16×16 Hierarchical Navigation and Explicit Cost Layers

**Files:**
- Create: `src/world/HierarchicalPathfinder.js`
- Modify: `src/systems/WorldMapSystem.js`
- Create: `scripts/benchmark-world-paths.mjs`
- Test: `test/node/hierarchical-pathfinder.test.mjs`

**Interfaces:**
- Consumes: read-only `WorldMapSystem.getTile(x, y)`, `getDimensions()` and `getNavigationRevision()` queries plus a caller-provided navigation profile.
- Produces: `createNavigationProfile({ id, domain, allowedTerrainCodes, terrainCosts, costLayers }): NavigationProfile`, `new HierarchicalPathfinder({ worldMap, chunkSize: 16 })`, and `findPath({ start, goal, profile, context }): { ok, reason?: string, path: Array<{x:number,y:number}>, totalCost: number, worldRevision: number, visitedNodes: number }`.
- Produces: `WorldMapSystem.findPath({ start, goal, profile, context }): { ok, reason?: string, path: Array<{x:number,y:number}>, totalCost: number, worldRevision: number, visitedNodes: number }` as the single routing entry point. This exact request/result shape is shared by world, content and army volumes. Callers supply cost layers such as roads, friendly borders, hostile borders and danger; they never edit map cells to influence routing.

- [ ] **Step 1: Write the failing navigation tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HierarchicalPathfinder,
  createNavigationProfile
} from '../../src/world/HierarchicalPathfinder.js';

function createWorld() {
  const rows = Array.from({ length: 64 }, (_, y) =>
    Array.from({ length: 64 }, (_, x) => (x === 31 && y !== 40 ? 'S' : 'G'))
  );
  let revision = 3;
  return {
    getDimensions: () => ({ width: 64, height: 64, tileSize: 60 }),
    getTile: (x, y) => rows[y]?.[x] ?? null,
    getNavigationRevision: () => revision,
    setTileForTest: (x, y, code) => { rows[y][x] = code; revision += 1; }
  };
}

const land = createNavigationProfile({
  id: 'land-default',
  domain: 'land',
  allowedTerrainCodes: ['G'],
  terrainCosts: { G: 1 },
  costLayers: []
});

test('hierarchical path is deterministic, passable and crosses the only river gap', () => {
  const world = createWorld();
  const pathfinder = new HierarchicalPathfinder({ worldMap: world, chunkSize: 16 });
  const request = { start: { x: 4, y: 5 }, goal: { x: 58, y: 52 }, profile: land, context: {} };
  const first = pathfinder.findPath(request);
  const second = pathfinder.findPath(request);
  assert.equal(first.ok, true);
  assert.deepEqual(second, first);
  assert.ok(first.path.some(({ x, y }) => x === 31 && y === 40));
  assert.ok(first.path.every(({ x, y }) => world.getTile(x, y) === 'G'));
  assert.ok(first.visitedNodes < 64 * 64 / 2);
});

test('cost layers change the chosen route without changing authoritative terrain', () => {
  const world = createWorld();
  const profile = createNavigationProfile({
    ...land,
    id: 'land-hostile-aware',
    costLayers: [{ id: 'hostile-border', getCost: ({ x, y }, context) => context.hostile.has(`${x},${y}`) ? 30 : 0 }]
  });
  const hostile = new Set(Array.from({ length: 25 }, (_, i) => `${10 + i},40`));
  const result = new HierarchicalPathfinder({ worldMap: world, chunkSize: 16 }).findPath({
    start: { x: 4, y: 40 }, goal: { x: 58, y: 40 }, profile, context: { hostile }
  });
  assert.equal(result.ok, true);
  assert.ok(result.path.some(({ y }) => y !== 40));
  assert.equal(world.getTile(20, 40), 'G');
});

test('navigation revision invalidates cached entrances and impossible domains fail explicitly', () => {
  const world = createWorld();
  const pathfinder = new HierarchicalPathfinder({ worldMap: world, chunkSize: 16 });
  const first = pathfinder.findPath({ start: { x: 4, y: 5 }, goal: { x: 58, y: 52 }, profile: land, context: {} });
  world.setTileForTest(31, 40, 'S');
  const second = pathfinder.findPath({ start: { x: 4, y: 5 }, goal: { x: 58, y: 52 }, profile: land, context: {} });
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'unreachable');
  assert.equal(second.worldRevision, 4);
});
```

- [ ] **Step 2: Run the focused RED test**

Run: `node --test test/node/hierarchical-pathfinder.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/world/HierarchicalPathfinder.js`.

- [ ] **Step 3: Implement deterministic hierarchical routing**

Divide the world into fixed 16×16 clusters. On each cluster edge, collapse each contiguous passable run to a stable midpoint entrance. Cache intra-cluster paths and the entrance graph by `navigationRevision` and `profile.id`; do not cache context-dependent layer costs across calls. Run high-level A* over entrances, then deterministic local A* to refine each segment. Use neighbor order north, east, south, west and compare open nodes by `(fCost, gCost, y, x)` so ties replay exactly.

`createNavigationProfile()` must freeze a normalized copy and reject duplicate layer IDs, non-positive terrain costs and empty allowed-terrain sets. A cost layer is a pure `getCost(cell, context)` callback and may only return a finite non-negative number. Both `HierarchicalPathfinder.findPath()` and `WorldMapSystem.findPath()` must accept only `{ start, goal, profile, context }` and return only `{ ok, reason?, path, totalCost, worldRevision, visitedNodes }`; failures keep `path: []`, `totalCost: 0` and a measured `visitedNodes`. They return `invalid_start`, `invalid_goal` or `unreachable`, never a partial path. `WorldMapSystem.applyTerrainDelta()` already changes the revision; `WorldMapSystem.findPath()` must delegate without exposing the pathfinder cache.

Implement `scripts/benchmark-world-paths.mjs` with deterministic query sets for 256×256, 320×320 and 384×384 generated worlds. Run 120 land queries per preset after 10 warm-ups, sort recorded durations, compute P95, and exit non-zero if standard exceeds 50 ms or large/huge exceeds 100 ms. Print one JSON line per preset with `preset`, `queryCount`, `p95Ms`, `maxMs` and `unreachableCount`.

- [ ] **Step 4: Run GREEN, performance and world regression**

Run: `node --test test/node/hierarchical-pathfinder.test.mjs`

Expected: PASS, 3 tests.

Run: `node scripts/benchmark-world-paths.mjs`

Expected: three JSON lines; `standard.p95Ms < 50`, `large.p95Ms < 100`, `huge.p95Ms < 100`; exit 0.

Run: `node --test test/node/world-map-system.test.mjs test/node/world-map-generator.test.mjs`

Expected: all map ownership and generation tests PASS.

Run: `npm.cmd run check`

Expected: all Node tests pass and syntax validation exits 0.

- [ ] **Step 5: Commit only Task 5 files**

```powershell
git diff --cached --name-only
git add -- 'src/world/HierarchicalPathfinder.js' 'src/systems/WorldMapSystem.js' 'scripts/benchmark-world-paths.mjs' 'test/node/hierarchical-pathfinder.test.mjs'
git diff --cached --name-only
git commit -m "feat: add deterministic hierarchical world paths"
```

Expected staged paths before commit: exactly the four Task 5 files above.

---

### Task 6: Make Generated World State the Runtime Map Source

**Files:**
- Modify: `src/main.js`
- Modify: `src/core/ConfigRegistry.js`
- Modify: `src/systems/BuildingSystem.js`
- Modify: `src/systems/RoadSystem.js`
- Modify: `src/systems/TorchSystem.js`
- Modify: `src/systems/TerritorySystem.js`
- Modify: `src/systems/CombatSystem.js`
- Modify: `src/systems/EnemyExpansionSystem.js`
- Modify: `src/systems/ArmySystem.js`
- Modify: `src/rendering/MapRenderer.js`
- Test: `test/node/world-runtime-integration.test.mjs`

**Interfaces:**
- Consumes: the already-migrated v9 save object supplied by the save-envelope work, including `save.world`, or new-game options `{ worldSeed, mapPreset }`.
- Produces: `Game.initializeWorld({ migratedSave, worldSeed, mapPreset }): WorldMapSystem`, `Game.startNewGame({ worldSeed, mapPreset })`, and `setWorldMapSystem(worldMapSystem)` injection on every map-consuming system named above.
- Produces: `Game.getSaveData().world = WorldMapSystem.getState()`. It does not produce legacy `map`, fixed-coordinate, `armies` or `armyUnits` mirror fields.

- [ ] **Step 1: Write the failing runtime integration test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BuildingSystem } from '../../src/systems/BuildingSystem.js';
import { RoadSystem } from '../../src/systems/RoadSystem.js';
import { ArmySystem } from '../../src/systems/ArmySystem.js';

function worldSpy() {
  const calls = [];
  return {
    calls,
    getDimensions: () => ({ width: 3, height: 2, tileSize: 60 }),
    getMapView: () => {
      calls.push('getMapView');
      return Object.freeze({ width: 3, height: 2, tileSize: 60, grid: Object.freeze(['GGG', 'GSG']) });
    },
    getTile: (x, y) => (['GGG', 'GSG'][y]?.[x] ?? null),
    getSpawnManifest: () => ({ playerStart: { x: 0, y: 0 }, cityStates: [], wildSites: [] }),
    findPath: ({ start, goal, profile, context }) => {
      calls.push({ method: 'findPath', start, goal, profileId: profile.id, context });
      return { ok: true, path: [start, goal], totalCost: 1, worldRevision: 0, visitedNodes: 2 };
    }
  };
}

test('map consumers require the injected WorldMapSystem projection', () => {
  const world = worldSpy();
  const building = new BuildingSystem();
  const road = new RoadSystem();
  const army = new ArmySystem();
  for (const system of [building, road, army]) {
    assert.equal(typeof system.setWorldMapSystem, 'function');
    system.setWorldMapSystem(world);
  }
  building.init();
  road.init();
  army.initNew();
  const created = army.createArmy({ ownerId: 'player', name: 'Scout', position: { x: 0, y: 0 } });
  assert.equal(created.ok, true);
  assert.ok(world.calls.length >= 2);
});

test('main initializes or restores world before constructing map consumers and saves one world payload', async () => {
  const source = await readFile(new URL('../../src/main.js', import.meta.url), 'utf8');
  const loadIndex = source.indexOf('loadAndMigrateSave');
  const worldIndex = source.indexOf('initializeWorld');
  const buildingIndex = source.indexOf('new BuildingSystem');
  assert.ok(loadIndex >= 0 && loadIndex < worldIndex);
  assert.ok(worldIndex < buildingIndex);
  assert.match(source, /world:\s*this\.systems\.worldMap\.getState\(\)/);
  assert.doesNotMatch(source, /\bmap:\s*this\.configRegistry\.getMapConfig\(\)/);
});
```

- [ ] **Step 2: Run the focused RED test**

Run: `node --test test/node/world-runtime-integration.test.mjs`

Expected: FAIL because map-consuming systems do not yet expose `setWorldMapSystem()` and `src/main.js` has no early `initializeWorld` sequence.

- [ ] **Step 3: Wire one immutable world projection through runtime initialization**

Add `ConfigRegistry.getWorldGenerationConfig()` as a frozen read-only configuration getter; leave authored map data available only for `legacy_static/base_map_v1` restoration. Add a `_worldMap` field plus `setWorldMapSystem()` to each listed system. Each setter validates the exact query methods its consumer needs. Replace every runtime `configRegistry.getMapConfig()` lookup in those consumers with a `_worldMap` query. Do not copy the grid into system-owned state.

In `Game.init()`, load and migrate the save immediately after configuration loading and before constructing map consumers. `initializeWorld()` must construct one `WorldMapSystem`, restore `migratedSave.world` when present, otherwise call `initNew({ seedText: worldSeed ?? crypto.randomUUID(), preset: mapPreset ?? 'large' })`, and register it as `this.systems.worldMap`. Inject that instance into map consumers before their `init()` calls. A legacy static map remains available only because the v9 migrator emits `{ source: 'legacy_static', mapId: 'base_map_v1' }`.

Update `MapRenderer` to consume `worldMap.getMapView()` and `getSpawnManifest()` and to retain only rendering projections. Update `Game.getSaveData()` to write one `world` payload. Task 8 has already made `armyState` canonical before this task runs; preserve that exact payload and its creation-id idempotency data, and do not reintroduce any v8 army mirror key.

- [ ] **Step 4: Run GREEN and runtime regression**

Run: `node --test test/node/world-runtime-integration.test.mjs`

Expected: PASS, 2 tests.

Run: `node --test test/node/world-map-system.test.mjs test/node/army-system.test.mjs test/node/map-waterways.test.mjs`

Expected: all world, army and waterway tests PASS.

Run: `npm.cmd run check`

Expected: all Node tests pass and syntax validation exits 0.

- [ ] **Step 5: Commit only Task 6 files**

```powershell
git diff --cached --name-only
git add -- 'src/main.js' 'src/core/ConfigRegistry.js' 'src/systems/BuildingSystem.js' 'src/systems/RoadSystem.js' 'src/systems/TorchSystem.js' 'src/systems/TerritorySystem.js' 'src/systems/CombatSystem.js' 'src/systems/EnemyExpansionSystem.js' 'src/systems/ArmySystem.js' 'src/rendering/MapRenderer.js' 'test/node/world-runtime-integration.test.mjs'
git diff --cached --name-only
git commit -m "feat: make generated world the runtime map source"
```

Expected staged paths before commit: exactly the eleven Task 6 files above.

---

### Task 7: Chunked Pixi Rendering, Fog and Marker Budgets

**Files:**
- Create: `src/rendering/MapChunkManager.js`
- Modify: `src/rendering/MapRenderer.js`
- Modify: `src/rendering/MapPresentation.js`
- Modify: `playwright.config.js`
- Create: `test/map-strategy.spec.js`
- Test: `test/node/map-chunk-manager.test.mjs`

**Interfaces:**
- Consumes: immutable `WorldMapSystem.getMapView()`, `getNavigationRevision()`, domain projection arrays and camera `{ camX, camY, screenWidth, screenHeight, zoom }`.
- Produces: `new MapChunkManager({ chunkSize: 16 })`, `getVisibleChunks(view): Array<{ key, chunkX, chunkY, minX, minY, maxX, maxY }>`, `markDirty({ layer, minX, minY, maxX, maxY })`, and `consumeDirtyVisible(layer, visibleChunks): string[]`.
- Produces: `MapRenderer.getRenderStats(): { visibleChunkCount, terrainObjects, fogObjects, markerObjects, totalDisplayObjects }`; the total must remain below 2,500 on every official preset.

- [ ] **Step 1: Write the failing chunk-manager and browser budget tests**

```js
// test/node/map-chunk-manager.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { MapChunkManager } from '../../src/rendering/MapChunkManager.js';

test('visible chunks are clipped, stable and padded by one chunk', () => {
  const manager = new MapChunkManager({ chunkSize: 16 });
  const visible = manager.getVisibleChunks({
    camX: 16 * 60,
    camY: 16 * 60,
    screenWidth: 960,
    screenHeight: 960,
    zoom: 1,
    tileSize: 60,
    mapWidth: 320,
    mapHeight: 320,
    paddingChunks: 1
  });
  assert.deepEqual(visible.map(chunk => chunk.key), ['0,0', '1,0', '2,0', '0,1', '1,1', '2,1', '0,2', '1,2', '2,2']);
  assert.ok(visible.every(chunk => chunk.minX >= 0 && chunk.maxX < 320));
});

test('dirty layers redraw only intersecting visible chunks and consume once', () => {
  const manager = new MapChunkManager({ chunkSize: 16 });
  const visible = manager.getVisibleChunks({
    camX: 0, camY: 0, screenWidth: 1920, screenHeight: 960, zoom: 1,
    tileSize: 60, mapWidth: 320, mapHeight: 320, paddingChunks: 0
  });
  manager.markDirty({ layer: 'fog', minX: 18, minY: 2, maxX: 19, maxY: 4 });
  assert.deepEqual(manager.consumeDirtyVisible('fog', visible), ['1,0']);
  assert.deepEqual(manager.consumeDirtyVisible('fog', visible), []);
  manager.markAllDirty('terrain', { mapWidth: 320, mapHeight: 320 });
  assert.deepEqual(manager.consumeDirtyVisible('terrain', visible), visible.map(chunk => chunk.key));
});
```

```js
// test/map-strategy.spec.js
import { test, expect } from '@playwright/test';

test('huge generated map stays within the Pixi display-object budget while panning', async ({ page }) => {
  await page.goto('/?e2eWorldSeed=render-budget&e2eMapPreset=huge');
  await page.getByText('新游戏', { exact: true }).click();
  await page.waitForFunction(() => window.__game?.mapRenderer?.getRenderStats);
  const samples = [];
  for (const point of [{ x: 0, y: 0 }, { x: 10000, y: 10000 }, { x: 21000, y: 21000 }]) {
    samples.push(await page.evaluate(({ x, y }) => {
      const renderer = window.__game.mapRenderer;
      renderer.setCameraForTest({ camX: x, camY: y, zoom: 0.55 });
      renderer.renderFrameForTest();
      return renderer.getRenderStats();
    }, point));
  }
  for (const stats of samples) {
    expect(stats.visibleChunkCount).toBeGreaterThan(0);
    expect(stats.totalDisplayObjects).toBeLessThan(2500);
    expect(stats.terrainObjects).toBeLessThan(1200);
  }
});
```

- [ ] **Step 2: Run the focused RED tests**

Run: `node --test test/node/map-chunk-manager.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/rendering/MapChunkManager.js`.

Run: `npx.cmd playwright test test/map-strategy.spec.js --project=chromium`

Expected: FAIL because the configured test match does not include the new spec or `MapRenderer.getRenderStats()` is missing.

- [ ] **Step 3: Replace full-map redraws with pooled visible chunks**

Make `MapChunkManager` pure and independent of Pixi. Store dirty keys in a `Map<layer, Set<chunkKey>>`; expand dirty rectangles to intersected 16×16 chunks, return keys in row-major order and remove only consumed visible keys.

In `MapRenderer`, create pooled Pixi containers for `terrain`, `fog`, `territory`, `roads` and `strategicMarkers` per visible chunk. Entering chunks obtain a pooled container and draw from `getMapView()`; leaving chunks are cleared and returned to the pool. Replace the full-map fog matrix in `_updateFogTexture()` with one 256-byte visibility buffer per dirty visible chunk. A terrain delta marks its terrain and fog chunk dirty; ownership, road and visibility events mark only their corresponding bounds and layers. Camera movement changes membership but does not dirty unchanged chunks.

At `zoom <= 0.65`, aggregate wild sites, city states and armies by chunk and render one count marker per type/chunk. Above that threshold render only markers within the padded visible bounds. `MapPresentation.createMapTokenModels()` must stay pure and return aggregation keys; it must not inspect Pixi containers. Count only managed map display objects in `getRenderStats()` and expose `setCameraForTest()` and `renderFrameForTest()` only when the URL has an `e2eWorldSeed` parameter.

Change `playwright.config.js` from the single smoke filename to `testMatch: ['browser-smoke.spec.js', 'map-strategy.spec.js']`. The application must read the two e2e query parameters only as new-game defaults; production new games still use `crypto.randomUUID()` and preset `large`.

- [ ] **Step 4: Run GREEN, visual smoke and full regression**

Run: `node --test test/node/map-chunk-manager.test.mjs test/node/map-presentation.test.mjs`

Expected: all chunk and presentation tests PASS.

Run: `npx.cmd playwright test test/map-strategy.spec.js --project=chromium`

Expected: PASS, 1 browser test; every sampled `totalDisplayObjects` is below 2,500.

Run: `npx.cmd playwright test test/browser-smoke.spec.js --project=chromium`

Expected: existing browser smoke PASS with no console or page errors.

Run: `npm.cmd run check`

Expected: all Node tests pass and syntax validation exits 0.

- [ ] **Step 5: Commit only Task 7 files**

```powershell
git diff --cached --name-only
git add -- 'src/rendering/MapChunkManager.js' 'src/rendering/MapRenderer.js' 'src/rendering/MapPresentation.js' 'playwright.config.js' 'test/map-strategy.spec.js' 'test/node/map-chunk-manager.test.mjs'
git diff --cached --name-only
git commit -m "perf: render generated worlds in dirty chunks"
```

Expected staged paths before commit: exactly the six Task 7 files above.

---

### Task 8: Give Every Strategic Army and Reserve Pool an Owner

**Files:**
- Modify: `src/systems/ArmySystem.js`
- Modify: `src/ui/panels/army-panel.js`
- Test: `test/node/army-system.test.mjs`

**Interfaces:**
- Consumes: stable faction/city-state owner IDs, unit catalog IDs, optional owner-rule queries from `FactionSystem`, and player building/hero bonuses already injected through `setSystems()`.
- Produces: `createArmy({ ownerId, name, position, unitStacks = [], creationId = null }): { ok: true, armyId: string, army: ArmyView, created: boolean } | { ok: false, reason: string }`, `getArmy(armyId)`, `getArmies({ ownerId?, includeEmpty? }): ArmyView[]`, `setReserveUnits(ownerId, counts)`, `addReserveUnit(ownerId, unitId, count)`, `getReserveUnits(ownerId)` and owner-checked unit assignment/disband APIs.
- Produces canonical `armyState` `{ schemaVersion: 2, nextArmyOrdinal, armies, reservesByOwner, battleHistory }`. Every army record has `ownerId`, `creationId`, `revision`, `order`, position, formation, morale and supply. Legacy v8 armies and reserves restore as owner `player` with `creationId: null`.

- [ ] **Step 1: Add failing all-faction ownership tests**

Append these tests to `test/node/army-system.test.mjs`:

```js
test('player, faction and city-state armies own separate reserves and queries', () => {
  const { army } = createScenario();
  army.setReserveUnits('player', { spears: 2 });
  army.setReserveUnits('faction_han', { archers: 3 });
  army.setReserveUnits('citystate_tyros', { galley: 1 });

  const player = army.createArmy({ ownerId: 'player', name: 'Home Guard', position: { x: 0, y: 0 } }).army;
  const han = army.createArmy({ ownerId: 'faction_han', name: 'Northern Host', position: { x: 2, y: 0 } }).army;
  const tyros = army.createArmy({ ownerId: 'citystate_tyros', name: 'Harbor Watch', position: { x: 4, y: 1 } }).army;

  assert.equal(army.addUnitToArmy(player.id, 'spears', { actorOwnerId: 'player' }), true);
  assert.equal(army.addUnitToArmy(han.id, 'archers', { actorOwnerId: 'player' }), false);
  assert.equal(army.addUnitToArmy(han.id, 'archers', { actorOwnerId: 'faction_han' }), true);
  assert.deepEqual(army.getArmies({ ownerId: 'faction_han' }).map(item => item.id), [han.id]);
  assert.equal(army.getArmy(tyros.id).ownerId, 'citystate_tyros');
  assert.deepEqual(army.getReserveUnits('player'), { spears: 1 });
  assert.deepEqual(army.getReserveUnits('faction_han'), { archers: 2 });
  assert.deepEqual(army.getReserveUnits('citystate_tyros'), { galley: 1 });
});

test('non-player initial unit stacks are atomic and creationId is idempotent', () => {
  const { army } = createScenario();
  const beforeInvalid = army.getState();
  const invalid = army.createArmy({
    ownerId: 'citystate_tyros',
    name: 'Invalid Guard',
    position: { x: 4, y: 1 },
    unitStacks: [{ unitId: 'spears', count: 2 }, { unitId: 'unknown_unit', count: 1 }],
    creationId: 'citystate_tyros:initial_guard'
  });
  assert.equal(invalid.reason, 'unknown_unit');
  assert.deepEqual(army.getState(), beforeInvalid);

  const request = {
    ownerId: 'citystate_tyros',
    name: 'Tyros Initial Guard',
    position: { x: 4, y: 1 },
    unitStacks: [{ unitId: 'spears', count: 2 }, { unitId: 'archers', count: 1 }],
    creationId: 'citystate_tyros:initial_guard'
  };
  const first = army.createArmy(request);
  const repeated = army.createArmy(structuredClone(request));
  assert.equal(first.ok, true);
  assert.equal(first.created, true);
  assert.equal(first.armyId, first.army.id);
  assert.deepEqual(first.army.unitIds, ['spears', 'spears', 'archers']);
  assert.equal(repeated.ok, true);
  assert.equal(repeated.created, false);
  assert.equal(repeated.armyId, first.armyId);
  assert.deepEqual(repeated.army, first.army);
  assert.equal(army.getArmies({ ownerId: 'citystate_tyros' }).length, 1);
  assert.equal(army.createArmy({ ...request, name: 'Conflicting Guard' }).reason, 'creation_id_conflict');
  assert.equal(army.getArmies({ ownerId: 'citystate_tyros' }).length, 1);
});

test('canonical armyState restores all owners and migrates the v8 player shape', () => {
  const { army } = createScenario();
  army.setReserveUnits('faction_han', { archers: 2 });
  const created = army.createArmy({ ownerId: 'faction_han', name: 'Han Host', position: { x: 1, y: 1 } }).army;
  const state = army.getState();
  assert.equal(state.schemaVersion, 2);
  assert.equal(state.armies[0].ownerId, 'faction_han');
  assert.deepEqual(state.reservesByOwner.faction_han, { archers: 2 });

  const restored = createScenario().army;
  restored.restoreState(state);
  assert.equal(restored.getArmy(created.id).ownerId, 'faction_han');
  assert.deepEqual(restored.getReserveUnits('faction_han'), { archers: 2 });

  restored.restoreState({
    nextId: 2,
    armies: [{ id: 'army_1', name: 'Legacy', unitIds: [], gridX: 0, gridY: 0 }],
    availableUnits: { spears: 2 },
    battleHistory: []
  });
  assert.equal(restored.getArmy('army_1').ownerId, 'player');
  assert.deepEqual(restored.getReserveUnits('player'), { spears: 2 });
});
```

- [ ] **Step 2: Run the focused RED test**

Run: `node --test test/node/army-system.test.mjs`

Expected: FAIL with `TypeError: army.setReserveUnits is not a function`.

- [ ] **Step 3: Refactor state by owner without breaking migrated player calls**

Replace `_availableUnits` with `_reservesByOwner = new Map()` and keep one `_armies` collection because army IDs are globally unique. New IDs are `army_<sanitizedOwnerId>_<zero-padded ordinal>` and `_nextArmyOrdinal` advances once per accepted creation. Capacity and command-point checks filter by the army's owner; player bonuses continue to use active player buildings and other owners may use optional `faction.getArmyCapacity(ownerId)` and `faction.getCommandPointLimit(ownerId)` queries.

Every mutator that changes one army must accept or derive `actorOwnerId`, reject cross-owner writes with no side effects, increment that army's `revision` exactly once, and call `_notify()` after commit. `getArmy()`, `getArmies()` and reserve getters must return clones, never backing objects. Sort army queries by ID so save and rendering order are stable.

Use only the object signature `createArmy({ ownerId, name, position, unitStacks = [], creationId = null })`; do not add `createNpcArmy()`, positional `createArmy(name, position)` or any other creation alias. Normalize `unitStacks` as an ordered array of unique `{ unitId, count }` entries. Before changing `_armies`, `_nextArmyOrdinal` or reserves, validate the owner, position, every catalog unit ID, every positive integer count, duplicate stack IDs, army capacity and total command-point limit. Player stacks must be available in and atomically deducted from the player's reserve; non-player stacks are the authoritative bootstrap composition for generated faction, city-state and wild initial guards and do not require a pre-populated player reserve. Expand validated stacks to the stable `unitIds` order supplied by the request.

When `creationId` is non-null, require a non-empty stable string and persist it on the army. Repeating a normalized-identical request with the same `creationId` returns the existing clone as `{ ok: true, armyId, army, created: false }` without consuming an ordinal, reserve unit or notification. Reusing the ID with different owner, name, position or stacks returns `creation_id_conflict` with no state change. A new successful creation returns both `armyId` and `army` plus `created: true`. Restore must reject duplicate non-null creation IDs, so idempotency survives save/load without a second index payload.

Mechanically update every earlier `createArmy()` call in `test/node/army-system.test.mjs` and the army panel to pass the object signature. Reserve methods use only the owner-aware names in this task; the v8 restore path may read legacy `availableUnits` data but must not expose a legacy mutator. `restoreState()` recognizes schema 2 directly and the old `{ nextId, armies, availableUnits }` shape as v8 data. Reject duplicate army IDs and unknown unit IDs before atomically assigning restored state.

- [ ] **Step 4: Run GREEN and army regression**

Run: `node --test test/node/army-system.test.mjs`

Expected: all army tests PASS, including ownership, atomic initial stacks and repeated-`creationId` idempotency.

Run: `node --test test/node/world-map-system.test.mjs test/node/hierarchical-pathfinder.test.mjs`

Expected: the map owner and hierarchical pathfinding tests that exist at this execution point PASS.

Run: `npm.cmd run check`

Expected: all Node tests pass and syntax validation exits 0.

- [ ] **Step 5: Commit only Task 8 files**

```powershell
git diff --cached --name-only
git add -- 'src/systems/ArmySystem.js' 'src/ui/panels/army-panel.js' 'test/node/army-system.test.mjs'
git diff --cached --name-only
git commit -m "feat: support strategic armies for every owner"
```

Expected staged paths before commit: exactly the three Task 8 files above.

---

### Task 9: Strategic Orders, Transactional Coordination and Direct Map Commands

**Files:**
- Create: `src/systems/ArmyOrderRules.js`
- Create: `src/systems/StrategicSimulationCoordinator.js`
- Create: `src/rendering/MapInteractionController.js`
- Modify: `src/systems/ArmySystem.js`
- Modify: `src/rendering/MapRenderer.js`
- Modify: `src/rendering/MapPresentation.js`
- Modify: `src/ui/panels/army-panel.js`
- Modify: `src/main.js`
- Modify: `test/map-strategy.spec.js`
- Test: `test/node/strategic-command.test.mjs`

**Interfaces:**
- Consumes: immutable army/world/faction/settlement/wild-site projections, actor owner ID, current `{ day, tick }`, target IDs or cells, and only `WorldMapSystem.findPath({ start, goal, profile, context })` with the Task 5 result shape.
- Produces: `previewArmyOrder(input): ArmyOrderPreview` with no state changes and exact order types `move`, `attack_army`, `attack_settlement`, `attack_site`, `colonize`, `garrison`, `escort`, `patrol`.
- Produces: `registerCommandHandler({ type, preview, commit, buildEvent }): void`, where `preview({ command }): { ok, reason?, prepared? }`, `commit({ command, prepared }): { ok, reason?, receipt?, order? }`, and `buildEvent({ command, prepared, receipt, order }): { type, targetId, payload }`.
- Produces: `StrategicSimulationCoordinator.previewCommand(command): { ok, reason?, prepared? }` and `executeCommand(command): { ok, reason?, event?, order?, receipt? }` for every registered command type. The built-in `{ commandId, type: 'army.issueOrder', actorId, day, tick, payload: { armyId, orderType, target } }` command is registered through this same handler mechanism.
- Produces: `registerDayPhase({ order: number, id: string, handler: ({ day, tick, submitFact }) => void }): void`, `runDaySettlement({ day, tick }): { ok, reason?, completedPhaseIds, facts }`, and `submitFact(domainEvent): { ok, reason?, event? }`, where `domainEvent` omits `eventId` and the coordinator assigns it.
- Produces: `getState(): StrategicCoordinatorState` and `restoreState(state): void`, with exact state `{ schemaVersion: 1, nextEventSequence, acceptedCommandIds, acceptedCorrelationIds, lastSettledDay }`. Registered command handlers and day-phase handler functions are runtime wiring and are never serialized.
- Produces: `MapInteractionController.getViewState(): { selectedArmyId, hoverTarget, preview }`; `ArmySystem.commitOrder({ armyId, actorOwnerId, order, expectedRevision })` is the only order-state write. The cross-volume ArmySystem mutators are exactly `createArmy({ ownerId, name, position, unitStacks = [], creationId = null })`, `commitOrder(...)` and `resolveEngagement(...)`; do not add `createNpcArmy()` or `issueStrategicOrder()` aliases.

- [ ] **Step 1: Write failing command transaction and interaction tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { StrategicSimulationCoordinator } from '../../src/systems/StrategicSimulationCoordinator.js';
import { MapInteractionController } from '../../src/rendering/MapInteractionController.js';

function harness() {
  let army = { id: 'army_player_0001', ownerId: 'player', revision: 4, gridX: 2, gridY: 2, order: null };
  const commits = [];
  const events = [];
  const pathRequests = [];
  const armySystem = {
    getArmy: id => id === army.id ? structuredClone(army) : null,
    commitOrder: input => {
      if (input.expectedRevision !== army.revision) return { ok: false, reason: 'stale_army' };
      commits.push(structuredClone(input));
      army = { ...army, order: structuredClone(input.order), revision: army.revision + 1 };
      return { ok: true, army: structuredClone(army) };
    }
  };
  const worldMap = {
    getNavigationRevision: () => 8,
    findPath: request => {
      assert.deepEqual(Object.keys(request).sort(), ['context', 'goal', 'profile', 'start']);
      pathRequests.push(structuredClone({ ...request, profile: { id: request.profile.id } }));
      return { ok: true, path: [request.start, request.goal], totalCost: 3, worldRevision: 8, visitedNodes: 2 };
    }
  };
  const coordinator = new StrategicSimulationCoordinator({
    worldSeed: 'commands',
    armySystem,
    worldMap,
    resolveTarget: target => target.id === 'enemy_army'
      ? { kind: 'army', id: target.id, ownerId: 'faction_han', gridX: 5, gridY: 2, revision: 2 }
      : { kind: 'cell', gridX: target.gridX, gridY: target.gridY, ownerId: target.ownerId ?? null },
    canTraverse: ({ actorId, target }) => !(actorId === 'player' && target.ownerId === 'closed_border'),
    canAttack: ({ actorId, target }) => actorId === 'player' && target.ownerId === 'faction_han',
    navigationProfiles: { land: { id: 'land-default', domain: 'land' } },
    emit: event => events.push(event)
  });
  return { coordinator, armySystem, commits, events, pathRequests };
}

test('preview is side-effect free and a denied command emits no event', () => {
  const { coordinator, commits, events } = harness();
  const command = {
    commandId: 'cmd_1', type: 'army.issueOrder', actorId: 'player', day: 3, tick: 9,
    payload: { armyId: 'army_player_0001', orderType: 'move', target: { gridX: 8, gridY: 2, ownerId: 'closed_border' } }
  };
  assert.deepEqual(coordinator.previewCommand(command), { ok: false, reason: 'closed_border' });
  assert.equal(coordinator.executeCommand(command).reason, 'closed_border');
  assert.equal(commits.length, 0);
  assert.equal(events.length, 0);
});

test('accepted attack commits once, uses the fixed path contract and emits one stable domain event', () => {
  const { coordinator, commits, events, pathRequests } = harness();
  assert.throws(() => coordinator.registerCommandHandler({
    type: 'army.issueOrder', preview: () => ({ ok: true }), commit: () => ({ ok: true }), buildEvent: () => ({})
  }), /duplicate_command_type/);
  const command = {
    commandId: 'cmd_attack_7', type: 'army.issueOrder', actorId: 'player', day: 4, tick: 2,
    payload: { armyId: 'army_player_0001', orderType: 'attack_army', target: { id: 'enemy_army' } }
  };
  const result = coordinator.executeCommand(command);
  assert.equal(result.ok, true);
  assert.equal(commits.length, 1);
  assert.equal(commits[0].expectedRevision, 4);
  assert.deepEqual(commits[0].order.path, [{ x: 2, y: 2 }, { x: 5, y: 2 }]);
  assert.equal(pathRequests[0].profile.id, 'land-default');
  assert.equal(pathRequests[0].context.actorId, 'player');
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    eventId: 'evt_000000000001', type: 'army.orderAccepted', schemaVersion: 1,
    day: 4, tick: 2, actorId: 'player', targetId: 'army_player_0001', correlationId: 'cmd_attack_7',
    payload: { orderType: 'attack_army', targetKind: 'army', targetId: 'enemy_army' }
  });
});

test('generic army.create handler previews without writes and commits once with a copied receipt', () => {
  const { coordinator, events } = harness();
  let commitCalls = 0;
  const handlerReceipt = { armyId: 'army_tyros_0001', detail: { created: true } };
  coordinator.registerCommandHandler({
    type: 'army.create',
    preview: ({ command }) => ({
      ok: true,
      prepared: {
        ownerId: command.payload.ownerId,
        expectedRevisions: [{ domain: 'faction', id: command.payload.ownerId, revision: 3 }]
      }
    }),
    commit: ({ command, prepared }) => {
      commitCalls += 1;
      assert.equal(command.payload.creationId, 'citystate_tyros:initial_guard');
      assert.equal(prepared.expectedRevisions[0].revision, 3);
      return { ok: true, receipt: handlerReceipt };
    },
    buildEvent: ({ command, receipt }) => ({
      type: 'army.created',
      targetId: receipt.armyId,
      payload: { ownerId: command.payload.ownerId, created: receipt.detail.created }
    })
  });
  assert.equal(Object.hasOwn(coordinator.getState(), 'commandHandlers'), false);
  assert.throws(() => coordinator.registerCommandHandler({
    type: 'army.create', preview: () => ({ ok: true }), commit: () => ({ ok: true }), buildEvent: () => ({})
  }), /duplicate_command_type/);

  const command = {
    commandId: 'cmd_create_tyros_guard', type: 'army.create', actorId: 'citystate_tyros', day: 4, tick: 1,
    payload: { ownerId: 'citystate_tyros', creationId: 'citystate_tyros:initial_guard' }
  };
  assert.deepEqual(coordinator.previewCommand(command), {
    ok: true,
    prepared: {
      ownerId: 'citystate_tyros',
      expectedRevisions: [{ domain: 'faction', id: 'citystate_tyros', revision: 3 }]
    }
  });
  assert.equal(commitCalls, 0);
  assert.equal(events.length, 0);

  const result = coordinator.executeCommand(command);
  assert.equal(result.ok, true);
  assert.deepEqual(result.receipt, { armyId: 'army_tyros_0001', detail: { created: true } });
  assert.equal(commitCalls, 1);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    eventId: 'evt_000000000001', type: 'army.created', schemaVersion: 1,
    day: 4, tick: 1, actorId: 'citystate_tyros', targetId: 'army_tyros_0001',
    correlationId: 'cmd_create_tyros_guard', payload: { ownerId: 'citystate_tyros', created: true }
  });
  result.receipt.detail.created = false;
  assert.equal(handlerReceipt.detail.created, true);
  assert.equal(events[0].payload.created, true);

  assert.equal(coordinator.executeCommand(command).reason, 'duplicate_command');
  assert.equal(commitCalls, 1);
  assert.equal(events.length, 1);
  assert.throws(() => coordinator.registerCommandHandler({
    type: 'quest.accept', preview: () => ({ ok: true }), commit: () => ({ ok: true }), buildEvent: () => ({})
  }), /command_registration_closed/);
});

test('unknown command types are rejected through the same registry and close registration', () => {
  const { coordinator } = harness();
  assert.deepEqual(coordinator.previewCommand({
    commandId: 'cmd_unknown_preview', type: 'unknown.command', actorId: 'player', day: 1, tick: 0, payload: {}
  }), { ok: false, reason: 'unknown_command_type' });
  assert.deepEqual(coordinator.executeCommand({
    commandId: 'cmd_unknown_execute', type: 'unknown.command', actorId: 'player', day: 1, tick: 0, payload: {}
  }), { ok: false, reason: 'unknown_command_type' });
  assert.throws(() => coordinator.registerCommandHandler({
    type: 'late.command', preview: () => ({ ok: true }), commit: () => ({ ok: true }), buildEvent: () => ({})
  }), /command_registration_closed/);
});

test('map interaction selects only an owned army, previews, then executes on context action', () => {
  const { coordinator, commits } = harness();
  const controller = new MapInteractionController({
    coordinator,
    actorIdProvider: () => 'player',
    clockProvider: () => ({ day: 5, tick: 1 }),
    hitTest: ({ screenX }) => screenX < 50
      ? { kind: 'army', id: 'army_player_0001', ownerId: 'player' }
      : { kind: 'cell', gridX: 9, gridY: 2 },
    commandIdProvider: () => 'cmd_map_1'
  });
  controller.handlePrimaryAction({ screenX: 10, screenY: 10 });
  controller.handlePointerMove({ screenX: 90, screenY: 10 });
  assert.equal(controller.getViewState().selectedArmyId, 'army_player_0001');
  assert.equal(controller.getViewState().preview.ok, true);
  assert.equal(controller.handleContextAction({ screenX: 90, screenY: 10 }).ok, true);
  assert.equal(commits.length, 1);
});

test('registered day phases run by order and submit canonical facts', () => {
  const { coordinator, events } = harness();
  const trace = [];
  coordinator.registerDayPhase({
    order: 40,
    id: 'army.advance-orders',
    handler: ({ day, submitFact }) => {
      trace.push(`army:${day}`);
      submitFact({
        type: 'army.arrived', day, tick: 0, actorId: 'player', targetId: 'army_player_0001',
        correlationId: `arrival:${day}:army_player_0001`, payload: { gridX: 5, gridY: 2 }
      });
    }
  });
  coordinator.registerDayPhase({
    order: 10,
    id: 'world.apply-deltas',
    handler: ({ day }) => trace.push(`world:${day}`)
  });
  assert.throws(
    () => coordinator.registerDayPhase({ order: 50, id: 'army.advance-orders', handler: () => {} }),
    /duplicate_day_phase/
  );
  const result = coordinator.runDaySettlement({ day: 7, tick: 0 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.completedPhaseIds, ['world.apply-deltas', 'army.advance-orders']);
  assert.deepEqual(trace, ['world:7', 'army:7']);
  assert.equal(result.facts[0].eventId, 'evt_000000000001');
  assert.equal(events[0].type, 'army.arrived');
  assert.equal(coordinator.runDaySettlement({ day: 7, tick: 0 }).reason, 'day_already_settled');
});

test('coordinator state restores command and fact idempotency plus event sequence', () => {
  const first = harness();
  const command = {
    commandId: 'cmd_restore_1', type: 'army.issueOrder', actorId: 'player', day: 8, tick: 2,
    payload: { armyId: 'army_player_0001', orderType: 'attack_army', target: { id: 'enemy_army' } }
  };
  assert.equal(first.coordinator.executeCommand(command).ok, true);
  assert.equal(first.coordinator.submitFact({
    type: 'quest.conditionMet', day: 8, tick: 3, actorId: 'player', targetId: 'quest_4',
    correlationId: 'quest_4:condition_2', payload: { conditionId: 'condition_2' }
  }).event.eventId, 'evt_000000000002');
  const saved = first.coordinator.getState();
  assert.deepEqual(saved, {
    schemaVersion: 1,
    nextEventSequence: 3,
    acceptedCommandIds: ['cmd_restore_1'],
    acceptedCorrelationIds: ['cmd_restore_1', 'quest_4:condition_2'],
    lastSettledDay: null
  });

  const restored = harness();
  restored.coordinator.restoreState(saved);
  assert.equal(restored.coordinator.executeCommand(command).reason, 'duplicate_command');
  assert.equal(restored.coordinator.submitFact({
    type: 'quest.completed', day: 9, tick: 0, actorId: 'player', targetId: 'quest_4',
    correlationId: 'quest_4:completed', payload: {}
  }).event.eventId, 'evt_000000000003');
  assert.equal(restored.coordinator.submitFact({
    type: 'quest.conditionMet', day: 8, tick: 3, actorId: 'player', targetId: 'quest_4',
    correlationId: 'quest_4:condition_2', payload: {}
  }).reason, 'duplicate_correlation');
  const beforeInvalidRestore = restored.coordinator.getState();
  assert.throws(() => restored.coordinator.restoreState({
    ...beforeInvalidRestore,
    acceptedCommandIds: ['cmd_restore_1', 'cmd_restore_1']
  }), /duplicate_command_id/);
  assert.deepEqual(restored.coordinator.getState(), beforeInvalidRestore);
});
```

- [ ] **Step 2: Run the focused RED test**

Run: `node --test test/node/strategic-command.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/systems/StrategicSimulationCoordinator.js`.

- [ ] **Step 3: Implement pure order rules and one commit gateway**

Implement `previewArmyOrder()` as an exhaustive switch. All orders validate army ownership, target kind/existence, relation permission, domain/path reachability and order-specific rules: attack targets must be hostile; colonize targets must be generated city states; garrison targets must be friendly settlements with capacity; escort targets must be friendly armies or caravans; patrol requires two or more reachable cells. The returned accepted preview contains a normalized target, path, expected army/world/target revisions and predicted movement/supply cost. It is deeply frozen.

Store command handlers in a private registry keyed by exact command type. `registerCommandHandler()` validates a non-empty unique `type` and three function properties. Duplicate types throw `duplicate_command_type`; after the first `executeCommand()` call begins, every registration throws `command_registration_closed`, including registration after an unknown or rejected execution. `previewCommand()` does not close registration. Command handlers remain runtime-only wiring: `getState()` omits them and `restoreState()` neither clears nor replaces them.

Both `previewCommand()` and `executeCommand()` must look up every type in this one registry; unknown types return `{ ok: false, reason: 'unknown_command_type' }`, and there is no command-type switch outside registered handlers. Register built-in `army.issueOrder` during coordinator construction with `preview` delegating to `previewArmyOrder()`, `commit` delegating only to `ArmySystem.commitOrder()`, and `buildEvent` returning the `army.orderAccepted` descriptor. Do not special-case it inside either coordinator method and do not add `issueStrategicOrder()` or retain `issueMoveOrder()` as an alias.

`previewCommand()` calls only `handler.preview({ command: clonedCommand })`, clones and deeply freezes `prepared`, and never invokes `commit` or `buildEvent`. `executeCommand()` rejects an accepted `commandId` before invoking the handler, re-runs that handler's preview against current projections, calls `commit({ command, prepared })` once, then calls the same handler's pure `buildEvent({ command, prepared, receipt, order })` once. Validate the event descriptor, create and emit exactly one domain event, then return `{ ok: true, event, order?, receipt? }`. Clone `receipt` independently for `buildEvent` and the caller so later mutation cannot affect handler state or emitted payload. A rejected preview or commit emits no event and does not record the command ID.

For a multi-domain transaction, the handler preview must capture every participant as stable ID plus expected revision inside `prepared`. The commit function must re-read and compare all participant revisions before the first write and return `revision_mismatch` with zero writes if any differ. After that gate succeeds, all participant commit operations must be prevalidated, synchronous and no-fail: no new lookup, permission check, allocation decision or fallible validation may occur between the first and last authoritative write. `buildEvent` is pure and no-fail. This is the required transaction discipline because the coordinator does not expose rollback or direct access to domain internals.

The built-in order handler calls `WorldMapSystem.findPath()` with all four keys `{ start, goal, profile, context }` and forwards its result without renaming fields. Arrival effects are later routed to the target domain's public command handler.

`registerDayPhase()` validates a unique non-empty ID, unique integer order and function handler, stores registrations sorted by `(order, id)`, and rejects registration after the first settlement starts. `runDaySettlement()` rejects a repeated or decreasing day, invokes each handler once in sorted order, and provides a bound `submitFact`. `submitFact(domainEvent)` validates `{ type, day, tick, actorId, targetId, correlationId, payload }`, rejects caller-supplied `eventId`, deduplicates non-empty correlation IDs, assigns the next event sequence through `createDomainEvent()`, clones the payload, records the correlation, emits once and returns the canonical event. A handler exception aborts before later handlers and leaves `lastSettledDay` unchanged; already submitted facts remain valid observations and their correlations prevent replay duplication.

`getState()` returns sorted cloned ID arrays and the next unused positive event sequence. `restoreState()` validates the complete schema into local variables, rejects duplicates and non-monotonic values, then atomically replaces persistence state without touching runtime phase registrations. `ArmySystem` advances order paths for every owner only from its registered `army.advance-orders` day phase and submits arrival facts, never by directly subscribing to `dayStart` and never by calling another domain's private mutator.

`MapInteractionController` owns only transient selection/hover/preview state. `MapRenderer` forwards pointer move, primary click and context-menu actions through hit-test projections, draws reachable paths and valid/invalid target cursors, and clears previews after command completion. Update `MapPresentation` with stable strategic hit-test models. The army panel must remove target X/Y inputs and same-panel battle simulation controls; replace them with selected-army status, order summary, cancel-order action and the text “在地图上选择目标并右键下令”. Player clicks cannot select a foreign army as the command actor, though foreign tokens remain valid targets.

In `main.js`, create one coordinator after all domain systems, inject public projections/permission queries, register the fixed settlement phases, create one map interaction controller and pass it to `MapRenderer`. On save, persist `coordinator.getState()` under `strategicCoordinator`; on load, call `restoreState()` before the first day settlement and then register runtime handlers. Content systems use `registerDayPhase()` for their assigned settlement slot and `submitFact()` for quest/narrative facts rather than subscribing mutating listeners directly to `EventBus`.

- [ ] **Step 4: Add direct-map browser coverage and run GREEN**

Append to `test/map-strategy.spec.js`:

```js
test('owned army is selected and receives a move order directly on the map', async ({ page }) => {
  await page.goto('/?e2eWorldSeed=map-command&e2eMapPreset=standard');
  await page.getByText('新游戏', { exact: true }).click();
  const points = await page.evaluate(() => {
    const game = window.__game;
    const armySystem = game.systems.army;
    let army = armySystem.getArmies({ ownerId: 'player' })[0];
    if (!army) army = armySystem.createArmy({ ownerId: 'player', name: 'E2E Army', position: game.systems.worldMap.getSpawnManifest().playerStart }).army;
    const start = game.mapRenderer.gridToScreen(army.gridX, army.gridY);
    const target = game.mapRenderer.gridToScreen(army.gridX + 2, army.gridY);
    return { start, target, armyId: army.id };
  });
  await page.mouse.click(points.start.x, points.start.y);
  await page.mouse.move(points.target.x, points.target.y);
  expect(await page.evaluate(() => window.__game.mapInteractionController.getViewState().preview.ok)).toBe(true);
  await page.mouse.click(points.target.x, points.target.y, { button: 'right' });
  const order = await page.evaluate(id => window.__game.systems.army.getArmy(id).order, points.armyId);
  expect(order.type).toBe('move');
  expect(order.path.length).toBeGreaterThan(1);
});
```

Run: `node --test test/node/strategic-command.test.mjs test/node/army-system.test.mjs`

Expected: all strategic command and army tests PASS.

Run: `npx.cmd playwright test test/map-strategy.spec.js --project=chromium`

Expected: PASS, 2 browser tests: render budget and direct army order.

Run: `npm.cmd run check`

Expected: all Node tests pass and syntax validation exits 0.

- [ ] **Step 5: Commit only Task 9 files**

```powershell
git diff --cached --name-only
git add -- 'src/systems/ArmyOrderRules.js' 'src/systems/StrategicSimulationCoordinator.js' 'src/rendering/MapInteractionController.js' 'src/systems/ArmySystem.js' 'src/rendering/MapRenderer.js' 'src/rendering/MapPresentation.js' 'src/ui/panels/army-panel.js' 'src/main.js' 'test/map-strategy.spec.js' 'test/node/strategic-command.test.mjs'
git diff --cached --name-only
git commit -m "feat: issue strategic army orders on the map"
```

Expected staged paths before commit: exactly the ten Task 9 files above.

---

### Task 10: Sequential Six-Phase Combat, Modifier Provenance and Replayable Battle Reports

**Files:**
- Modify: `src/systems/CombatResolver.js`
- Modify: `src/systems/ArmySystem.js`
- Create: `src/rendering/BattleReportPresentation.js`
- Create: `src/ui/panels/battle-report-panel.js`
- Modify: `src/ui/PopupManager.js`
- Modify: `src/ui/panels/army-panel.js`
- Modify: `test/node/phased-combat.test.mjs`
- Create: `test/node/battle-report.test.mjs`
- Modify: `test/map-strategy.spec.js`

**Interfaces:**
- Consumes: immutable attacker/defender snapshots, unit and tactic catalogs, `worldSeed`, stable `battleId`, `createDeterministicRng()` from `src/core/RandomService.js`, and battle context `{ terrainCode, weatherId, settlementId, wallLevel, attackerCommander, defenderCommander, attackerFormation, defenderFormation, extraModifiers }`.
- Produces: `previewSequentialArmyBattle(input): BattlePreview` without consuming random state or mutating armies; it returns six phase forecasts, relative strength, casualty ranges, retreat risk and all currently known modifier provenance.
- Produces: `resolveSequentialArmyBattle(input): BattleRecord` and compatibility wrapper `resolvePhasedArmyBattle(attacker, defender, units, tactics)`. Phase order is exactly `reconnaissance`, `ranged`, `charge`, `melee`, `siege`, `pursuit`.
- Produces: read-only `ArmySystem.previewEngagement(attackerId, defenderId, context)`, mutating `resolveEngagement(preview, { actorOwnerId }): { ok, reason?, record? }`, `getBattleRecord(battleId)` and `getBattleHistory({ ownerId?, limit? })`. `resolveEngagement()` is the sole combat write entry point; do not add `commitEngagement()` or owner-specific combat aliases.
- Produces: `createBattleReportModel(record, catalogs): BattleReportModel` and `replayBattleRecord(record, catalogs): { ok, reason?, replayedRecord? }`; replay is read-only and verifies the stored deterministic checksum.

- [ ] **Step 1: Add failing sequential resolution and provenance tests**

Append to `test/node/phased-combat.test.mjs`:

```js
import {
  previewSequentialArmyBattle,
  resolveSequentialArmyBattle
} from '../../src/systems/CombatResolver.js';

function sequentialInput() {
  return {
    schemaVersion: 2,
    worldSeed: 'battle-sequence',
    battleId: 'battle_0007',
    attacker: {
      armyId: 'army_player_0001', ownerId: 'player', revision: 3,
      unitIds: ['archer', 'archer', 'cavalry', 'spear', 'catapult'],
      morale: 92, supply: 1, tacticId: 'focused_volley', formationId: 'line'
    },
    defender: {
      armyId: 'army_han_0001', ownerId: 'faction_han', revision: 6,
      unitIds: ['spear', 'spear', 'spear', 'archer', 'catapult'],
      morale: 88, supply: 0.9, tacticId: 'shield_discipline', formationId: 'wall'
    },
    unitCatalog: units,
    tacticCatalog: tactics.tactics,
    context: {
      terrainCode: 'G', weatherId: 'clear', settlementId: null, wallLevel: 0,
      extraModifiers: [
        { sourceType: 'commander', sourceId: 'hero_caesar', side: 'attacker', phaseId: 'charge', stat: 'power', operation: 'multiply', value: 1.1 },
        { sourceType: 'terrain', sourceId: 'grassland', side: 'defender', phaseId: 'melee', stat: 'power', operation: 'add', value: 4 }
      ]
    },
    rules: { baseCasualtyRate: 0.18, moraleLossPerCasualty: 4, supplyCostPerPhase: 0.025 }
  };
}

test('preview is deterministic, bounded and does not expose or consume resolution draws', () => {
  const input = sequentialInput();
  const before = structuredClone(input);
  const first = previewSequentialArmyBattle(input);
  const second = previewSequentialArmyBattle(input);
  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
  assert.deepEqual(first.phases.map(phase => phase.phaseId), ['reconnaissance', 'ranged', 'charge', 'melee', 'siege', 'pursuit']);
  assert.ok(first.casualtyRange.attacker.min >= 0);
  assert.ok(first.casualtyRange.attacker.max <= input.attacker.unitIds.length);
  assert.ok(first.casualtyRange.defender.max <= input.defender.unitIds.length);
  assert.equal(Object.hasOwn(first, 'randomTrace'), false);
});

test('each phase starts from the prior phase ending state and updates losses, morale and supply', () => {
  const originalRandom = Math.random;
  Math.random = () => { throw new Error('combat must not call Math.random'); };
  try {
    const record = resolveSequentialArmyBattle(sequentialInput());
    assert.deepEqual(record.phases.map(phase => phase.phaseId), ['reconnaissance', 'ranged', 'charge', 'melee', 'siege', 'pursuit']);
    for (let index = 1; index < record.phases.length; index += 1) {
      assert.deepEqual(record.phases[index].startingState, record.phases[index - 1].endingState);
    }
    for (const phase of record.phases) {
      assert.equal(
        phase.endingState.attacker.unitIds.length,
        phase.startingState.attacker.unitIds.length - phase.casualties.attacker.length
      );
      assert.equal(
        phase.endingState.defender.unitIds.length,
        phase.startingState.defender.unitIds.length - phase.casualties.defender.length
      );
      assert.ok(phase.endingState.attacker.morale <= phase.startingState.attacker.morale);
      assert.ok(phase.endingState.defender.morale <= phase.startingState.defender.morale);
      assert.ok(phase.endingState.attacker.supply <= phase.startingState.attacker.supply);
      assert.ok(phase.endingState.defender.supply <= phase.startingState.defender.supply);
    }
    const finalPhase = record.phases.at(-1);
    assert.deepEqual(record.finalState, finalPhase.endingState);
    assert.equal(record.casualties.attacker, sequentialInput().attacker.unitIds.length - record.finalState.attacker.unitIds.length);
    assert.equal(record.casualties.defender, sequentialInput().defender.unitIds.length - record.finalState.defender.unitIds.length);
  } finally {
    Math.random = originalRandom;
  }
});

test('every applied modifier has provenance and its arithmetic reconciles to phase power', () => {
  const record = resolveSequentialArmyBattle(sequentialInput());
  for (const phase of record.phases) {
    for (const side of ['attacker', 'defender']) {
      const calculation = phase.powerCalculation[side];
      for (const modifier of calculation.modifiers) {
        assert.equal(typeof modifier.sourceType, 'string');
        assert.equal(typeof modifier.sourceId, 'string');
        assert.equal(modifier.side, side);
        assert.equal(modifier.phaseId, phase.phaseId);
        assert.ok(['add', 'multiply'].includes(modifier.operation));
        assert.ok(Number.isFinite(modifier.value));
      }
      const additive = calculation.modifiers
        .filter(item => item.operation === 'add')
        .reduce((sum, item) => sum + item.value, 0);
      const multiplier = calculation.modifiers
        .filter(item => item.operation === 'multiply')
        .reduce((product, item) => product * item.value, 1);
      assert.equal(calculation.finalPower, Math.round((calculation.basePower + additive) * multiplier * 1000) / 1000);
    }
  }
});
```

- [ ] **Step 2: Write the failing authoritative writeback, report and replay test**

Create `test/node/battle-report.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { ArmySystem } from '../../src/systems/ArmySystem.js';
import { createBattleReportModel, replayBattleRecord } from '../../src/rendering/BattleReportPresentation.js';

const units = [
  { id: 'spear', name: 'Spears', combatPower: 10, commandPoints: 2, branch: 'anti_cavalry', lane: 'front', domain: 'land', roleTags: ['spear'] },
  { id: 'archer', name: 'Archers', combatPower: 12, commandPoints: 2, branch: 'ranged', lane: 'rear', domain: 'land', roleTags: ['ranged'] },
  { id: 'cavalry', name: 'Cavalry', combatPower: 16, commandPoints: 3, branch: 'cavalry', lane: 'flank', domain: 'land', roleTags: ['cavalry'] }
];
const tactics = [
  { id: 'steady', name: 'Steady', phaseModifiers: { melee: 1.08 } },
  { id: 'volley', name: 'Volley', phaseModifiers: { ranged: 1.12 } }
];

function createArmies() {
  eventBus.clear();
  configRegistry._configs = { enemies: { units, formations: [] }, militaryTactics: { tactics }, buildings: [] };
  const army = new ArmySystem();
  army.setSystems({ building: { buildings: [] } });
  army.initNew();
  army.setReserveUnits('player', { archer: 3, cavalry: 2 });
  army.setReserveUnits('faction_han', { spear: 5 });
  const attacker = army.createArmy({ ownerId: 'player', name: 'Attackers', position: { x: 2, y: 2 } }).army;
  const defender = army.createArmy({ ownerId: 'faction_han', name: 'Defenders', position: { x: 3, y: 2 } }).army;
  for (const unitId of ['archer', 'archer', 'cavalry']) army.addUnitToArmy(attacker.id, unitId, { actorOwnerId: 'player' });
  for (const unitId of ['spear', 'spear', 'spear']) army.addUnitToArmy(defender.id, unitId, { actorOwnerId: 'faction_han' });
  return { army, attackerId: attacker.id, defenderId: defender.id };
}

test('preview has no side effects and commit writes both armies plus one bounded report', () => {
  const { army, attackerId, defenderId } = createArmies();
  const before = army.getState();
  const preview = army.previewEngagement(attackerId, defenderId, {
    actorOwnerId: 'player', worldSeed: 'writeback', battleId: 'battle_writeback_1', terrainCode: 'G'
  });
  assert.equal(preview.ok, true);
  assert.deepEqual(army.getState(), before);

  const committed = army.resolveEngagement(preview, { actorOwnerId: 'player' });
  assert.equal(committed.ok, true);
  assert.equal(army.getArmy(attackerId).revision, before.armies.find(item => item.id === attackerId).revision + 1);
  assert.equal(army.getArmy(defenderId).revision, before.armies.find(item => item.id === defenderId).revision + 1);
  assert.equal(army.getBattleHistory({ ownerId: 'player' }).length, 1);
  assert.deepEqual(army.getBattleRecord('battle_writeback_1'), committed.record);
  assert.equal(army.resolveEngagement(preview, { actorOwnerId: 'player' }).reason, 'stale_army');
});

test('report model exposes every phase and replay verifies exactly with no domain writes', () => {
  const { army, attackerId, defenderId } = createArmies();
  const preview = army.previewEngagement(attackerId, defenderId, {
    actorOwnerId: 'player', worldSeed: 'replay', battleId: 'battle_replay_1', terrainCode: 'G'
  });
  const record = army.resolveEngagement(preview, { actorOwnerId: 'player' }).record;
  const stateAfterCommit = army.getState();
  const model = createBattleReportModel(record, { units, tactics });
  assert.equal(model.phaseRows.length, 6);
  assert.deepEqual(model.phaseRows.map(row => row.phaseId), ['reconnaissance', 'ranged', 'charge', 'melee', 'siege', 'pursuit']);
  assert.ok(model.phaseRows.every(row => Array.isArray(row.modifierRows.attacker) && Array.isArray(row.modifierRows.defender)));
  const replay = replayBattleRecord(record, { units, tactics });
  assert.equal(replay.ok, true);
  assert.equal(replay.replayedRecord.resolutionChecksum, record.resolutionChecksum);
  assert.deepEqual(army.getState(), stateAfterCommit);
  const tampered = structuredClone(record);
  tampered.phases[2].casualties.attacker.push('forged-unit');
  assert.equal(replayBattleRecord(tampered, { units, tactics }).reason, 'checksum_mismatch');
});
```

- [ ] **Step 3: Run the focused RED tests**

Run: `node --test test/node/phased-combat.test.mjs test/node/battle-report.test.mjs`

Expected: FAIL because `previewSequentialArmyBattle`, `resolveSequentialArmyBattle` and `BattleReportPresentation.js` do not exist.

- [ ] **Step 4: Implement preview and deterministic sequential phase resolution**

Normalize and deep-freeze one `resolutionInput` before calculation. Reject missing armies, duplicate unit instances, unknown unit/tactic IDs, equal owners, invalid morale/supply, non-adjacent unsupported engagement targets and malformed modifiers. `previewSequentialArmyBattle()` uses deterministic min/max formulas only; it must not create an RNG or advance a saved RNG state.

For resolution, create phase-local keyed streams with `createDeterministicRng({ worldSeed, namespace: 'combat.<phaseId>.<side>', stableEntityId: battleId })`. At each phase, take one immutable `startingState` snapshot. Derive base power only from surviving units in that snapshot. Normalize built-in unit counter, tactic, formation, commander, terrain, weather, wall, morale, supply and reconnaissance carry-over effects into modifier objects with exact fields:

```js
{
  sourceType: 'tactic',
  sourceId: 'focused_volley',
  side: 'attacker',
  phaseId: 'ranged',
  stat: 'power',
  operation: 'multiply',
  value: 1.12
}
```

Sort modifiers by `(side, phaseId, stat, operation, sourceType, sourceId)`. Apply all `add` modifiers first and then all `multiply` modifiers, storing `{ basePower, modifiers, additiveTotal, multiplierProduct, finalPower }`. Calculate both sides' phase losses from the same phase starting snapshot, then apply those losses simultaneously. Select lost unit instances by stable vulnerability score and unit-instance ID, using the phase-local stream only to break exact ties. After casualties, update morale and supply with clamping, evaluate rout/retreat, and freeze the resulting `endingState`; the next phase must copy that exact ending state. A routed side cannot inflict power in later combat phases, but pursuit still resolves against its surviving retreating units.

The `BattleRecord` must contain schema version 2, battle ID, seed hash, deterministic normalized `resolutionInput`, participants, winner/outcome, all six `PhaseRecord` objects, totals, final state, random stream terminal states, and `resolutionChecksum`. Compute the checksum over canonical JSON excluding the checksum field. The compatibility `resolvePhasedArmyBattle()` builds a version-2 input with a stable legacy seed and returns the version-2 record while preserving current top-level `phases`, `attackerScore`, `defenderScore`, `winner` and `casualties` reads.

- [ ] **Step 5: Implement atomic ArmySystem writeback and bounded report persistence**

`previewEngagement()` must snapshot both armies, include their revisions, validate hostility/position/context, call the pure preview function and return a frozen commit token containing normalized resolver input. It must not alter rosters, morale, supply, orders, history, event sequence or RNG state.

`resolveEngagement(preview, { actorOwnerId })` must re-check actor ownership, attacker/defender existence, both expected revisions, target position and duplicate battle ID before resolution. Resolve into local data first. If resolution succeeds, atomically replace both armies' unit lists, morale and supply from `record.finalState`, clear completed attack orders, increment each army revision once, append the record, keep the newest 50 records, then publish one `battleResolved` observation. A failure before commit changes nothing. Do not implement `commitEngagement()` or preserve the prior positional `resolveEngagement(attackerId, defenderId)` signature. Mechanically update the existing persistent-engagement fixture in `test/node/phased-combat.test.mjs`: call `setReserveUnits()` for `player` and `faction_han`, create both armies with the object signature and different owners, pass `actorOwnerId` when assigning units, then preview and call the canonical resolver. `getBattleRecord()` and `getBattleHistory()` return clones; owner filtering includes records where that owner controlled either participant. Persist the full bounded records inside canonical `armyState.battleHistory` and validate their checksums during restore.

- [ ] **Step 6: Implement pure report/replay presentation and UI**

`replayBattleRecord()` must canonicalize the stored input, run the resolver, compare the recomputed checksum to the stored checksum and return `checksum_mismatch` for altered input or phase output. It must not receive `ArmySystem` or any mutator. `createBattleReportModel()` must turn each phase into a row containing starting/final unit counts, inflicted and received casualties, morale delta, supply delta, calculated power, rout state and human-readable modifier rows that retain source type, source ID, operation and numeric value.

Register `battle_report` in `PopupManager`. The new panel must render battle summary, winner, both participant names, total casualties, final morale/supply, exactly six expandable phase sections, modifier provenance tables and a “验证回放” button. The button calls the pure replay helper and displays verified/mismatch status; it never rewrites army state. Add `data-testid="battle-phase-row"`, `data-testid="battle-modifier-row"` and `data-testid="battle-replay-status"`. In the army panel, add a newest-first “战报” section whose buttons open records by ID; no panel control may directly invoke the resolver.

- [ ] **Step 7: Add browser verification and run GREEN**

Append to `test/map-strategy.spec.js`:

```js
test('battle report renders six phases, provenance and verified replay', async ({ page }) => {
  await page.goto('/?e2eWorldSeed=battle-report&e2eMapPreset=standard');
  await page.getByText('新游戏', { exact: true }).click();
  await page.evaluate(() => {
    const game = window.__game;
    const system = game.systems.army;
    const unitIds = game.configRegistry.get('enemies').units.slice(0, 3).map(unit => unit.id);
    system.setReserveUnits('player', Object.fromEntries(unitIds.map(id => [id, 3])));
    system.setReserveUnits('faction_e2e', Object.fromEntries(unitIds.map(id => [id, 3])));
    const start = game.systems.worldMap.getSpawnManifest().playerStart;
    const attacker = system.createArmy({ ownerId: 'player', name: 'E2E Attackers', position: start }).army;
    const defender = system.createArmy({ ownerId: 'faction_e2e', name: 'E2E Defenders', position: { x: start.x + 1, y: start.y } }).army;
    for (const id of unitIds) {
      system.addUnitToArmy(attacker.id, id, { actorOwnerId: 'player' });
      system.addUnitToArmy(defender.id, id, { actorOwnerId: 'faction_e2e' });
    }
    const preview = system.previewEngagement(attacker.id, defender.id, {
      actorOwnerId: 'player', worldSeed: 'battle-report', battleId: 'battle_e2e_1', terrainCode: 'G'
    });
    const result = system.resolveEngagement(preview, { actorOwnerId: 'player' });
    game.popupManager.open('battle_report', { battleId: result.record.battleId });
  });
  await expect(page.locator('[data-testid="battle-phase-row"]')).toHaveCount(6);
  await page.locator('[data-testid="battle-phase-row"]').nth(1).click();
  await expect(page.locator('[data-testid="battle-modifier-row"]').first()).toBeVisible();
  await page.getByRole('button', { name: '验证回放' }).click();
  await expect(page.locator('[data-testid="battle-replay-status"]')).toHaveText('回放校验通过');
});
```

Run: `node --test test/node/phased-combat.test.mjs test/node/battle-report.test.mjs`

Expected: all phase, preview, provenance, writeback and replay tests PASS.

Run: `node --test test/node/army-system.test.mjs test/node/strategic-command.test.mjs`

Expected: army ownership and strategic command regressions PASS.

Run: `npx.cmd playwright test test/map-strategy.spec.js --project=chromium`

Expected: PASS, 3 browser tests: render budget, direct map order and six-phase battle report replay.

Run: `npx.cmd playwright test test/browser-smoke.spec.js --project=chromium`

Expected: existing browser smoke PASS with no console or page errors.

Run: `npm.cmd run check`

Expected: all Node tests pass and syntax validation exits 0.

- [ ] **Step 8: Commit only Task 10 files**

```powershell
git diff --cached --name-only
git add -- 'src/systems/CombatResolver.js' 'src/systems/ArmySystem.js' 'src/rendering/BattleReportPresentation.js' 'src/ui/panels/battle-report-panel.js' 'src/ui/PopupManager.js' 'src/ui/panels/army-panel.js' 'test/node/phased-combat.test.mjs' 'test/node/battle-report.test.mjs' 'test/map-strategy.spec.js'
git diff --cached --name-only
git commit -m "feat: resolve and replay sequential phase battles"
```

Expected staged paths before commit: exactly the nine Task 10 files above.
