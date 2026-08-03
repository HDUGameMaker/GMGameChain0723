# Complete RTS × SLG Content and Narrative Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver dynamic city-state simulation, binding diplomacy and map trade, real city-state colonization, deterministic wild-site ecology, seven-era objectives, civilization and hero depth, and idempotent long-form narrative content at the exact approved quotas.

**Architecture:** Each domain system remains the sole writer of its state. Cross-domain actions are expressed as commands submitted to `StrategicSimulationCoordinator`; deterministic choices use `RandomService`; UI and `Store` consume read-only projections. Authored manifests are validated and deterministically compiled into runtime JSON so exact content quotas and references are release gates rather than documentation claims.

**Tech Stack:** Native ES Modules, PixiJS v8, browser DOM/CSS, JSON, Node `node:test`, Playwright, PowerShell/Node content tooling.

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

## Task Dependency Order

Execute the content tasks in dependency order `1 → 3 → 2 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14`, even though task numbers preserve the specification's topical order. Task 3 requires only Task 1 faction IDs; Task 2 then consumes Task 3 treaty/diplomacy interfaces. This dependency order overrides any numeric-order assumption in an aggregate execution plan.

## Required Upstream Interfaces

These interfaces are supplied by the core/world/army plans and are consumed here without alternate implementations:

```js
// src/core/RandomService.js
RandomService.float(key); // number in [0, 1)
RandomService.int(key, min, maxInclusive); // integer
RandomService.pickWeighted(key, entries); // T; entries are Array<{ value: T, weight: number }>
createDeterministicRng(key); // independently exported; returns { nextFloat(), nextInt(min, maxInclusive), pick(values), shuffle(values), getState() }
// key is exactly { worldSeed: string, namespace: string, stableEntityId?: string, ordinal?: number }.
// Only createDeterministicRng additionally accepts key.state for restoration.

// src/systems/StrategicSimulationCoordinator.js
coordinator.previewCommand({ commandId, type, actorId, targetId, day, tick, payload });
// => { ok: boolean, reason?: string, event?: object, order?: object, receipt?: object }
coordinator.executeCommand({ commandId, type, actorId, targetId, day, tick, payload });
// => { ok: boolean, reason?: string, event?: object, order?: object, receipt?: object }
coordinator.registerCommandHandler({ type, preview, commit, buildEvent });
// preview({ command }) => { ok: boolean, reason?: string, prepared?: object }
// commit({ command, prepared }) => { ok: boolean, reason?: string, receipt?: object, order?: object }
// buildEvent({ command, prepared, receipt, order }) => { type: string, targetId: string|null, payload: object }
coordinator.registerDayPhase({ order, id, handler }); // handler({ day, tick, submitFact }) => void
coordinator.submitFact({ type, day, tick, actorId, targetId, correlationId, payload });

// src/systems/WorldMapSystem.js
worldMap.getMapView();
worldMap.getSpawnManifest();
worldMap.getDimensions();
worldMap.getTile(x, y);
worldMap.findPath({ start, goal, profile, context });
// => { ok, reason?, path, totalCost, worldRevision, visitedNodes }

// src/systems/ArmySystem.js
army.createArmy({ ownerId, name, position, unitStacks, creationId });
army.commitOrder({ armyId, actorOwnerId, order, expectedRevision });
army.getArmy(armyId);
army.resolveEngagement(attackerId, defenderId, context);

// src/systems/TerritorySystem.js
territory.getController(gridX, gridY);
territory.previewTransfer({ cells, fromOwnerId, toOwnerId, reason });
```

If an upstream implementation exposes a different name or return shape, reconcile that interface in the owning plan before starting these tasks. Do not add local compatibility shims that bypass the unique-state-owner rule.

## File Responsibility Map

- `config/factions.json`: 24 authored city-state profiles and AI/personality budgets.
- `config/treaties.json`: treaty types, obligations, duration and breach rules.
- `config/wild-sites.json`: 96 compiled wild-site templates.
- `config/era-missions.json`: seven eras × seven tracks × three tiers and three ending routes.
- `config/civilization-depth.json`: 57 civilization rule modules and cross-system effect keys.
- `config/heroes.json`: authoritative 72-hero roster, rarity, growth, appointments and skills.
- `config/hero-relationships.json`: 108 authored relationship edges.
- `config/hero-combos.json`: 36 authored combinations.
- `config/narrative/*.json`: compiled common, civilization, hero, city-state and crisis chains.
- `content-src/`: human-reviewed manifests used by deterministic content generators.
- `src/systems/FactionSystem.js`: city-state-owned economy, development, memory, goals and army references.
- `src/systems/DiplomacySystem.js`: bilateral relation, war, proposals, treaty entities and breach ledger.
- `src/systems/CommerceSystem.js`: physical trade routes, cargo movement, delivery and interruption state.
- `src/systems/ColonySystem.js`: administration over a real city-state, policy, legitimacy, compliance and resistance.
- `src/systems/WildSiteSystem.js`: placed site instances and lifecycle; defenders remain Army-owned.
- `src/systems/EraSystem.js`: mission progress, deduplicated stars and ending state.
- `src/systems/CivilizationRuleSystem.js`: read-only aggregation of selected civilization rules and legacies.
- `src/systems/HeroSystem.js`: roster instances, progression, assignments, injuries, relationships and recruitment ledger.
- `src/systems/QuestSystem.js`: chain instances, objectives, choices and progress fact ledger.
- `src/systems/EventSystem.js`: event queue, delayed consequences and applied-effect ledger.

---

### Task 1: Author 24 City-State Profiles and Establish FactionSystem Ownership

**Files:**
- Create: `content-src/factions.json`
- Create: `config/factions.json`
- Create: `schemas/factions.schema.json`
- Create: `scripts/generate-factions.mjs`
- Create: `src/systems/FactionSystem.js`
- Modify: `src/core/ConfigRegistry.js`
- Modify: `src/main.js`
- Test: `test/node/faction-system.test.mjs`
- Test: `test/node/faction-content-contract.test.mjs`

**Interfaces:**
- Consumes: `configRegistry.get('factions')`; `RandomService`; generated city-state placements shaped as `{ factionId, capital: { gridX, gridY }, regionId }`.
- Produces: `FactionSystem.initNew({ placements })`; `getFaction(id)`; `getFactions()`; `applyOwnDomainCommand(command)`; `recordArmyReference(factionId, armyId)`; `getState()`; `restoreState(state)`; `getProjection()`.

- [ ] **Step 1: Write the failing ownership and quota tests**

```js
// test/node/faction-content-contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const content = JSON.parse(readFileSync(new URL('../../config/factions.json', import.meta.url), 'utf8'));

test('faction catalog contains 24 complete unique profiles', () => {
  assert.equal(content.profiles.length, 24);
  assert.equal(new Set(content.profiles.map(f => f.id)).size, 24);
  for (const faction of content.profiles) {
    assert.ok(faction.personality?.weights);
    assert.equal(faction.garrisonByEra.length, 7);
    assert.ok(faction.specialty?.yieldTableId);
    assert.ok(faction.colonialProfile?.resistanceBase >= 0);
    assert.ok(faction.eventChainId.startsWith('city_chain_'));
  }
});
```

```js
// test/node/faction-system.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FactionSystem } from '../../src/systems/FactionSystem.js';

test('FactionSystem owns development and references armies without owning army records', () => {
  const profiles = [{ id: 'timber_league', personality: { weights: {} }, startingBudget: { treasury: 90, manpower: 12 } }];
  const system = new FactionSystem({ profiles });
  system.initNew({ placements: [{ factionId: 'timber_league', capital: { gridX: 40, gridY: 60 }, regionId: 'r1' }] });
  system.recordArmyReference('timber_league', 'army:npc:1');
  const state = system.getState().factions.timber_league;
  assert.equal(state.treasury, 90);
  assert.deepEqual(state.armyIds, ['army:npc:1']);
  assert.equal(Object.hasOwn(state, 'unitStacks'), false);
  assert.equal(Object.hasOwn(state, 'controlledCells'), false);
  assert.equal(Object.hasOwn(state, 'relation'), false);
});
```

- [ ] **Step 2: Run the tests to verify RED**

Run: `node --test test/node/faction-content-contract.test.mjs test/node/faction-system.test.mjs`

Expected: FAIL because `config/factions.json` and `src/systems/FactionSystem.js` do not exist.

- [ ] **Step 3: Implement the schema, deterministic generator, and minimum state owner**

```js
// src/systems/FactionSystem.js
export class FactionSystem {
  constructor({ profiles = [], random = null } = {}) {
    this._profiles = new Map(profiles.map(profile => [profile.id, structuredClone(profile)]));
    this._random = random;
    this._factions = {};
  }

  initNew({ placements }) {
    this._factions = Object.fromEntries(placements.map(place => {
      const profile = this._profiles.get(place.factionId);
      if (!profile) throw new Error(`unknown_faction_profile:${place.factionId}`);
      return [place.factionId, {
        id: place.factionId,
        capital: structuredClone(place.capital),
        regionId: place.regionId,
        lifecycle: 'active',
        developmentLevel: 1,
        developmentXp: 0,
        treasury: profile.startingBudget.treasury,
        manpowerBudget: profile.startingBudget.manpower,
        fortificationLevel: 1,
        currentGoal: null,
        goalUntilDay: 0,
        threatMemory: [],
        opportunityMemory: [],
        lastDecisionDay: 0,
        armyIds: []
      }];
    }));
  }

  getFaction(id) { return this._factions[id] ? structuredClone(this._factions[id]) : null; }
  getFactions() { return Object.values(this._factions).map(value => structuredClone(value)); }
  recordArmyReference(id, armyId) {
    const faction = this._factions[id];
    if (!faction) return { ok: false, reason: 'faction_not_found' };
    if (!faction.armyIds.includes(armyId)) faction.armyIds.push(armyId);
    return { ok: true };
  }
  getState() { return { factions: structuredClone(this._factions) }; }
  restoreState(state) { this._factions = structuredClone(state?.factions ?? {}); }
}
```

`scripts/generate-factions.mjs` must parse `content-src/factions.json`, validate against `schemas/factions.schema.json`, sort profiles by `id`, and write stable two-space JSON. `--check` compares generated bytes without writing. The 24 authored records must cover 18 land/6 coastal-or-naval profiles, all seven canonical era IDs in `garrisonByEra`, and unique `eventChainId` values.

- [ ] **Step 4: Run GREEN, generation check, and focused regression**

Run: `node scripts/generate-factions.mjs --check`

Expected: exit 0 and `factions: 24 profiles, output is reproducible`.

Run: `node --test test/node/faction-content-contract.test.mjs test/node/faction-system.test.mjs`

Expected: 2 tests PASS.

Run: `node --test test/node/world-factions.test.mjs test/node/city-state-expansion.test.mjs`

Expected: existing tests either PASS through the new projection adapter or are updated within this task to assert `FactionSystem`; no dual state owner remains.

- [ ] **Step 5: Commit only Task 1 files**

```bash
git add -- content-src/factions.json config/factions.json schemas/factions.schema.json scripts/generate-factions.mjs src/systems/FactionSystem.js src/core/ConfigRegistry.js src/main.js test/node/faction-system.test.mjs test/node/faction-content-contract.test.mjs test/node/world-factions.test.mjs test/node/city-state-expansion.test.mjs
git commit -m "feat: establish authored city-state factions"
```

### Task 2: Add Deterministic City-State Goals and One-Action-Per-Day AI

**Files:**
- Create: `src/systems/FactionActionScorer.js`
- Modify: `src/systems/FactionSystem.js`
- Modify: `src/main.js`
- Test: `test/node/faction-ai.test.mjs`

**Interfaces:**
- Consumes: Task 3 treaty/diplomacy interfaces; `RandomService.float(key)` and the independent `createDeterministicRng(key)` export, where `key` is `{ worldSeed, namespace, stableEntityId?, ordinal? }`; Coordinator `registerCommandHandler()`/`registerDayPhase()`/`previewCommand()`/`executeCommand()`; read-only snapshots from Faction, Diplomacy, Territory, Army, Commerce and WorldMap.
- Produces: `scoreFactionActions(context): Array<{ type, score, payload }>`; `FactionSystem.planDay({ day, snapshot }): StrategicCommand[]`; `FactionSystem.recordCommandReceipt(receipt)`; registrations for `faction_develop`, `faction_recruit`, `faction_trade_proposal`, `faction_defend` and `faction_seek_peace`; fixed phase `content.faction-ai` whose handler executes each planned command with `{ day, tick }`.

- [ ] **Step 1: Write the failing replay and budget tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { FactionSystem } from '../../src/systems/FactionSystem.js';

const profile = {
  id: 'sea_republic', startingBudget: { treasury: 120, manpower: 20 },
  personality: { weights: { develop: 1, recruit: 1.1, trade_proposal: 1.3, declare_war: 0.2 } }
};
const random = { float: key => `${key.worldSeed}|${key.namespace}|${key.stableEntityId ?? ''}|${key.ordinal ?? 0}`.length % 17 / 17 };
const placement = [{ factionId: 'sea_republic', capital: { gridX: 10, gridY: 10 }, regionId: 'coast' }];
const snapshot = { worldSeed: 'faction-ai-test', diplomacy: {}, armies: {}, territory: {}, commerce: {}, world: {}, eraId: 'ancient' };

test('same day and snapshot produce one replayable action without mutating foreign snapshots', () => {
  const a = new FactionSystem({ profiles: [profile], random });
  const b = new FactionSystem({ profiles: [profile], random });
  a.initNew({ placements: placement });
  b.initNew({ placements: placement });
  const frozen = structuredClone(snapshot);
  const left = a.planDay({ day: 9, snapshot });
  const right = b.planDay({ day: 9, snapshot });
  assert.deepEqual(left, right);
  assert.equal(left.length, 1);
  assert.deepEqual(snapshot, frozen);
  assert.match(left[0].commandId, /^faction:sea_republic:day:9:/);
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node --test test/node/faction-ai.test.mjs`

Expected: FAIL with `a.planDay is not a function`.

- [ ] **Step 3: Implement pure scoring and command planning**

```js
// src/systems/FactionActionScorer.js
export function scoreFactionActions({ faction, profile, diplomacy, borderThreat, tradeOptions }) {
  const weight = profile.personality.weights;
  return [
    { type: 'faction_develop', score: weight.develop * (faction.treasury >= 40 ? 1 : 0), payload: {} },
    { type: 'faction_recruit', score: weight.recruit * (faction.manpowerBudget >= 4 ? 1 : 0), payload: {} },
    { type: 'faction_trade_proposal', score: weight.trade_proposal * (tradeOptions.length > 0 ? 1 : 0), payload: { targetId: tradeOptions[0]?.id } },
    { type: 'faction_defend', score: weight.defend * Math.min(2, borderThreat), payload: {} },
    { type: 'faction_seek_peace', score: weight.seek_peace * (diplomacy.atWar ? 1 : 0), payload: {} }
  ].filter(action => Number.isFinite(action.score) && action.score > 0);
}
```

```js
// src/main.js — registrations use owning-domain participant adapters; FactionSystem receives no foreign mutator.
for (const [type, participant] of Object.entries(factionAiParticipants)) {
  coordinator.registerCommandHandler({
    type,
    preview: ({ command }) => participant.preview({ command }),
    commit: ({ command, prepared }) => participant.commit({ command, prepared }),
    buildEvent: ({ command, prepared, receipt, order }) => ({
      type: `${command.type}.committed`, targetId: command.targetId,
      payload: { prepared, receipt, order }
    })
  });
}
coordinator.registerDayPhase({
  order: 40,
  id: 'content.faction-ai',
  handler: ({ day, tick }) => {
    const snapshot = buildFactionPlanningSnapshot({ day, tick });
    for (const planned of factionSystem.planDay({ day, snapshot })) {
      const result = coordinator.executeCommand({ ...planned, day, tick });
      factionSystem.recordCommandReceipt(result.receipt ?? { commandId: planned.commandId, ok: result.ok, reason: result.reason });
    }
  }
});
```

`factionAiParticipants` has exactly the five produced keys and is assembled in `main.js` from the public participant of the owning domain: Faction for development, Army for recruitment/defence, and Diplomacy for trade/peace proposals. Each participant obeys the Required Upstream preview/commit receipt shapes; multi-domain recruitment previews every captured revision before no-fail commits. `planDay` must skip a faction already processed that day, perform complex scoring only when `(day + stableFactionOffset) % 3 === 0`, and emit at most one complete command `{ commandId, type, actorId, targetId, payload }` per faction; the fixed phase supplies integer `day` and `tick` before execution. A single tie-break uses `RandomService.float({ worldSeed: snapshot.worldSeed, namespace: 'faction.plan_action', stableEntityId: faction.id, ordinal: day })`; a sequential search imports and calls `createDeterministicRng()` with the same object key and persists its stream state. `recordCommandReceipt` may alter only treasury, manpower, goal and memory fields after a committed receipt; it never receives foreign mutators.

- [ ] **Step 4: Run GREEN and 30-day replay regression**

Run: `node --test test/node/faction-ai.test.mjs`

Expected: PASS.

Run: `node --test test/node/faction-ai.test.mjs --test-name-pattern="30 day"`

Expected: identical command sequences for two runs; zero commands with insufficient treasury/manpower; zero more than one action for a faction/day.

- [ ] **Step 5: Commit only Task 2 files**

```bash
git add -- src/systems/FactionActionScorer.js src/systems/FactionSystem.js src/main.js test/node/faction-ai.test.mjs
git commit -m "feat: add deterministic city-state planning"
```

### Task 3: Replace String Diplomacy Flags with Binding Treaty Entities

**Files:**
- Create: `config/treaties.json`
- Create: `src/systems/TreatyRules.js`
- Modify: `src/core/ConfigRegistry.js`
- Modify: `src/systems/DiplomacySystem.js`
- Modify: `src/main.js`
- Test: `test/node/treaty-entities.test.mjs`
- Test: `test/node/integrated-diplomacy.test.mjs`

**Interfaces:**
- Consumes: faction IDs from `FactionSystem`; domain facts submitted by Coordinator; canonical day from `TimeSystem`.
- Produces: `proposeTreaty(input)`; `acceptProposal(proposalId, commandId)`; `evaluateAccess({ actorId, targetId, action, day })`; `recordViolation({ commandId, treatyId, ruleId, actorId, day })`; `advanceDay(day)`; treaty/proposal/breach projections.

- [ ] **Step 1: Write the failing entity and legality tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { DiplomacySystem } from '../../src/systems/DiplomacySystem.js';

test('an accepted treaty governs border, trade and colonization until expiry', () => {
  const system = new DiplomacySystem({ treatyDefinitions: [{
    id: 'open_borders', durationDays: 20,
    permissions: ['cross_border'], obligations: [], breachRules: ['hostile_entry']
  }] });
  system.initNew({ factionIds: ['player', 'hill_republic'] });
  const proposal = system.proposeTreaty({ proposerId: 'player', recipientId: 'hill_republic', typeId: 'open_borders', day: 4 });
  assert.equal(system.acceptProposal(proposal.proposalId, 'cmd:accept:1').ok, true);
  assert.equal(system.evaluateAccess({ actorId: 'player', targetId: 'hill_republic', action: 'cross_border', day: 5 }).ok, true);
  assert.equal(system.evaluateAccess({ actorId: 'player', targetId: 'hill_republic', action: 'colonize', day: 5 }).ok, false);
  system.advanceDay(24);
  assert.equal(system.evaluateAccess({ actorId: 'player', targetId: 'hill_republic', action: 'cross_border', day: 24 }).reason, 'treaty_expired');
});

test('replaying a breach command produces one breach entry', () => {
  const system = new DiplomacySystem({ treatyDefinitions: [] });
  system.initNew({ factionIds: ['player', 'hill_republic'] });
  const input = { commandId: 'cmd:breach:9', treatyId: 'treaty:1', ruleId: 'attack_partner', actorId: 'player', day: 9 };
  system.recordViolation(input);
  system.recordViolation(input);
  assert.equal(system.getState().breachLedger.length, 1);
});
```

- [ ] **Step 2: Run the tests to verify RED**

Run: `node --test test/node/treaty-entities.test.mjs`

Expected: FAIL because constructor injection, treaty proposals and `evaluateAccess` are absent.

- [ ] **Step 3: Implement treaty state and pure access evaluation**

```js
// src/systems/TreatyRules.js
export function treatyIsActive(treaty, day) {
  return treaty.status === 'active' && day >= treaty.effectiveDay && (treaty.expiryDay == null || day < treaty.expiryDay);
}

export function evaluateTreatyAccess({ treaties, definitions, actorId, targetId, action, day }) {
  const pair = treaties.filter(t => t.partyIds.includes(actorId) && t.partyIds.includes(targetId));
  const active = pair.filter(t => treatyIsActive(t, day));
  if (active.some(t => definitions.get(t.typeId)?.permissions.includes(action))) return { ok: true, treatyId: active.find(t => definitions.get(t.typeId)?.permissions.includes(action)).id };
  const expired = pair.some(t => t.status === 'expired');
  return { ok: false, reason: expired ? 'treaty_expired' : `permission_missing:${action}` };
}
```

Treaty entities must include `id`, `typeId`, `partyIds`, `proposedDay`, `effectiveDay`, `expiryDay`, `noticeDays`, `autoRenew`, `obligations`, `revision`, `status` and `sourceProposalId`. Supported definitions are `ceasefire`, `trade_agreement`, `open_borders`, `non_aggression`, `defensive_alliance`, `vassalage` and `territory_cession`. Acceptance and breach must be idempotent by command ID.

- [ ] **Step 4: Run GREEN and diplomacy regression**

Run: `node --test test/node/treaty-entities.test.mjs test/node/integrated-diplomacy.test.mjs`

Expected: all tests PASS; access failures return stable reason codes; treaty expiry occurs once.

- [ ] **Step 5: Commit only Task 3 files**

```bash
git add -- config/treaties.json src/systems/TreatyRules.js src/core/ConfigRegistry.js src/systems/DiplomacySystem.js src/main.js test/node/treaty-entities.test.mjs test/node/integrated-diplomacy.test.mjs
git commit -m "feat: enforce diplomacy through treaty entities"
```

### Task 4: Make Trade Routes Physical, Treaty-Bound Map Entities

**Files:**
- Create: `src/systems/TradeRoutePlanner.js`
- Modify: `config/commerce.json`
- Modify: `src/systems/CommerceSystem.js`
- Modify: `src/systems/ResourceSystem.js`
- Modify: `src/main.js`
- Test: `test/node/map-trade-routes.test.mjs`
- Test: `test/node/commerce-system.test.mjs`

**Interfaces:**
- Consumes: `worldMap.findPath({ start, goal, profile, context })`; a complete upstream `NavigationProfile` `{ id, domain, allowedTerrainCodes, terrainCosts, costLayers }`; `DiplomacySystem.evaluateAccess()`; `ArmySystem.getArmy(escortArmyId)`; `RandomService.float(key)` with `{ worldSeed, namespace, stableEntityId?, ordinal? }`; Coordinator `registerCommandHandler()`/`previewCommand()`/`executeCommand()`.
- Produces: `previewTradeRoute(input)`; `createTradeRoute(input, commandId)`; `advanceDay({ day, worldRevision })`; `handleWorldFact(event)`; `ResourceSystem.previewDelivery(input)`/`commitDelivery(prepared)`; registered command type `resource.deliver`; route projection containing path, cargo, progress, risk, escort and pause reason.

- [ ] **Step 1: Write the failing arrival-only-delivery test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { CommerceSystem } from '../../src/systems/CommerceSystem.js';

test('cargo pays only on arrival and pauses when its trade permission disappears', () => {
  const deliveries = [];
  const pathfinder = { findPath: () => ({ ok: true, path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], totalCost: 3, worldRevision: 7, visitedNodes: 9 }) };
  const landProfile = { id: 'trade-land', domain: 'land', allowedTerrainCodes: ['G', 'F'], terrainCosts: { G: 1, F: 2 }, costLayers: [] };
  let treatyOk = true;
  const diplomacy = { evaluateAccess: () => treatyOk ? { ok: true, treatyId: 't:1' } : { ok: false, reason: 'permission_missing:trade' } };
  const coordinator = {
    previewCommand: () => ({ ok: true }),
    executeCommand: command => { deliveries.push(command); return { ok: true, event: { eventId: `event:${command.commandId}` } }; }
  };
  const system = new CommerceSystem({
    worldSeed: 'trade-test', pathfinder, diplomacy, coordinator, navigationProfiles: { land: landProfile },
    random: { float: key => {
      assert.deepEqual(key, { worldSeed: 'trade-test', namespace: 'commerce.trade_risk', stableEntityId: 'cmd:route:1', ordinal: 2 });
      return 0.99;
    } }
  });
  system.initNew();
  const created = system.createTradeRoute({ originNodeId: 'capital', destinationFactionId: 'sea_republic', mode: 'land', cargoRecipeId: 'grain_export', escortArmyId: null }, 'cmd:route:1');
  assert.equal(created.ok, true);
  system.advanceDay({ day: 2, worldRevision: 7 });
  assert.equal(deliveries.length, 0);
  system.advanceDay({ day: 3, worldRevision: 7 });
  assert.equal(deliveries.filter(c => c.type === 'resource.deliver').length, 1);
  assert.equal(deliveries[0].day, 3);
  assert.equal(deliveries[0].tick, 0);
  treatyOk = false;
  system.advanceDay({ day: 4, worldRevision: 7 });
  assert.equal(system.getTradeRoutes()[0].status, 'paused');
  assert.equal(system.getTradeRoutes()[0].pauseReason, 'permission_missing:trade');
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node --test test/node/map-trade-routes.test.mjs`

Expected: FAIL because current trade routes have no map path, progress or arrival delivery.

- [ ] **Step 3: Implement route planning and daily movement**

```js
// src/systems/TradeRoutePlanner.js
export function previewPhysicalRoute({ worldMap, diplomacy, origin, destination, navigationProfile, actorId, targetId, day }) {
  const permission = diplomacy.evaluateAccess({ actorId, targetId, action: 'trade', day });
  if (!permission.ok) return permission;
  if (!navigationProfile?.id || !navigationProfile.domain || !navigationProfile.allowedTerrainCodes?.length || !navigationProfile.terrainCosts) return { ok: false, reason: 'navigation_profile_missing' };
  const path = worldMap.findPath({
    start: origin,
    goal: destination,
    profile: navigationProfile,
    context: { actorId, targetId, day }
  });
  if (!path.ok) return { ok: false, reason: path.reason };
  return { ok: true, treatyId: permission.treatyId, path: path.path, worldRevision: path.worldRevision, travelCost: path.totalCost, visitedNodes: path.visitedNodes };
}
```

```js
// src/main.js — the ResourceSystem remains the only resource writer.
coordinator.registerCommandHandler({
  type: 'resource.deliver',
  preview: ({ command }) => resourceSystem.previewDelivery({ deliveryId: command.commandId, ...command.payload }),
  commit: ({ command, prepared }) => {
    const receipt = resourceSystem.commitDelivery(prepared);
    return receipt.ok ? { ok: true, receipt: { commandId: command.commandId, deliveryId: command.commandId, resourceRevision: receipt.revision } } : receipt;
  },
  buildEvent: ({ command, receipt }) => ({ type: 'resource.delivered', targetId: command.targetId, payload: receipt })
});
```

Persist `originNodeId`, `destinationFactionId`, `mode`, `navigationProfileId`, `path`, `worldRevision`, `outboundCargo`, `returnCargo`, `pathIndex`, `movementProgress`, `treatyId`, `escortArmyId`, `status`, `pauseReason`, `deliveryCount`, `riskSeed` and `lastProcessedDay`. World revision or treaty changes re-plan or pause; they never delete a route. On arrival, Commerce submits exactly `{ commandId, type: 'resource.deliver', actorId, targetId, day, tick: 0, payload }`; it never writes ResourceSystem state. Conversion orders remain a separate collection.

- [ ] **Step 4: Run GREEN and commerce regression**

Run: `node --test test/node/map-trade-routes.test.mjs test/node/commerce-system.test.mjs`

Expected: all tests PASS; exactly one delivery command per arrival correlation ID; no delivery while paused.

- [ ] **Step 5: Commit only Task 4 files**

```bash
git add -- src/systems/TradeRoutePlanner.js config/commerce.json src/systems/CommerceSystem.js src/systems/ResourceSystem.js src/main.js test/node/map-trade-routes.test.mjs test/node/commerce-system.test.mjs
git commit -m "feat: move trade across treaty-bound map routes"
```

### Task 5: Replace Off-Map Colony Offers with Real City-State Administration

**Files:**
- Modify: `config/colonies.json`
- Modify: `src/systems/ColonySystem.js`
- Modify: `src/systems/FactionSystem.js`
- Modify: `src/systems/TerritorySystem.js`
- Modify: `src/main.js`
- Modify: `src/ui/panels/event-panel.js`
- Test: `test/node/city-state-colonies.test.mjs`
- Test: `test/node/integration-events-save.test.mjs`

**Interfaces:**
- Consumes: `FactionSystem.getFaction()`; `FactionSystem.previewSovereigntyChange(input)`/`commitSovereigntyChange(input)`; `TerritorySystem.previewTransfer(input)`/`commitTransfer(input)`; `DiplomacySystem.evaluateAccess()`; `CommerceSystem` connection projection; `ArmySystem` army/engagement references; Coordinator `registerCommandHandler()`/`previewCommand()`/`executeCommand()`; current era from `EraSystem`.
- Produces: registered command types `colony.establish_administration` and `colony.release_administration`; `listEligibleTargets(context)`; `previewAdministration(input)`; `establishAdministration(input, commandId)`; `releaseAdministration(input, commandId)`; `setPolicy(colonyId, policyId, commandId)`; `advanceDay(day)`; `handleRebellionResult(input)`; `getColonies()`. Colony records contain policy/legitimacy/compliance/resistance only; sovereignty remains Faction-owned and territory remains Territory-owned.

- [ ] **Step 1: Write the failing real-target and no-free-population tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ColonySystem } from '../../src/systems/ColonySystem.js';

test('new colonial administrations always reference a generated city-state', () => {
  const authority = { sovereignty: 'independent', controllerId: null, territoryOwner: 'sea_republic' };
  const factions = {
    getFaction: id => id === 'sea_republic' ? { id, developmentLevel: 3, lifecycle: 'active', sovereignty: authority.sovereignty } : null,
    previewSovereigntyChange: input => input.factionId === 'sea_republic' ? { ok: true } : { ok: false, reason: 'city_state_not_found' },
    commitSovereigntyChange: input => { authority.sovereignty = input.sovereignty; authority.controllerId = input.controllerId; return { ok: true }; }
  };
  const territory = {
    previewTransfer: input => input.cells.length > 0 ? { ok: true } : { ok: false, reason: 'territory_empty' },
    commitTransfer: input => { authority.territoryOwner = input.toOwnerId; return { ok: true }; }
  };
  const diplomacy = { evaluateAccess: () => ({ ok: true, treatyId: 'vassal:1' }) };
  const commerce = { getConnection: () => ({ connected: true, throughput: 0.8 }) };
  const coordinator = {
    previewCommand: command => {
      const factionPreview = factions.previewSovereigntyChange(command.payload.factionChange);
      if (!factionPreview.ok) return factionPreview;
      return territory.previewTransfer(command.payload.territoryTransfer);
    },
    executeCommand: command => {
      factions.commitSovereigntyChange(command.payload.factionChange);
      territory.commitTransfer(command.payload.territoryTransfer);
      return { ok: true, event: { eventId: 'evt:colonize:1' }, receipt: { colonyId: 'colony:sea_republic' } };
    }
  };
  const system = new ColonySystem({ factions, diplomacy, commerce, coordinator, settings: { baseCapacity: 1 } });
  system.initNew();
  const result = system.establishAdministration({ cityStateId: 'sea_republic', capitalCells: ['40,60'], path: 'protectorate', policyId: 'indirect_rule', day: 40 }, 'cmd:colonize:1');
  assert.equal(result.ok, true);
  assert.equal(system.getColonies()[0].cityStateId, 'sea_republic');
  assert.equal(system.getColonies()[0].legacyOffmap, false);
  assert.equal(Object.hasOwn(system.getColonies()[0], 'sovereignty'), false);
  assert.equal(Object.hasOwn(system.getColonies()[0], 'dailyPopulation'), false);
  assert.equal(authority.sovereignty, 'protectorate');
  assert.equal(authority.controllerId, 'player');
  assert.equal(authority.territoryOwner, 'player');
  assert.equal(system.establishAdministration({ cityStateId: 'missing', capitalCells: ['0,0'], path: 'occupation', policyId: 'direct_rule', day: 40 }, 'cmd:colonize:2').reason, 'city_state_not_found');
  assert.equal(system.releaseAdministration({ cityStateId: 'sea_republic', capitalCells: ['40,60'], nextSovereignty: 'independent', day: 50 }, 'cmd:release:1').ok, true);
  assert.equal(authority.sovereignty, 'independent');
  assert.equal(authority.territoryOwner, 'sea_republic');
});
```

- [ ] **Step 2: Run the tests to verify RED**

Run: `node --test test/node/city-state-colonies.test.mjs`

Expected: FAIL because the current system selects from `config.colonies` and accepts off-map colony IDs.

- [ ] **Step 3: Implement administration over an existing faction**

```js
// src/systems/ColonySystem.js (state shape and command entry)
establishAdministration(input, commandId) {
  if (this._commandLedger[commandId]) return structuredClone(this._commandLedger[commandId]);
  const faction = this._factions.getFaction(input.cityStateId);
  if (!faction) return { ok: false, reason: 'city_state_not_found' };
  if (this._colonies[input.cityStateId]) return { ok: false, reason: 'administration_exists' };
  if (Object.keys(this._colonies).length >= this.getCapacity()) return { ok: false, reason: 'colony_capacity_reached' };
  const access = this._validateLegalPath(input);
  if (!access.ok) return access;
  const nextSovereignty = input.path === 'occupation' ? 'occupied' : 'protectorate';
  const command = {
    commandId,
    type: 'colony.establish_administration',
    actorId: 'player',
    targetId: input.cityStateId,
    day: input.day,
    tick: 0,
    payload: {
      factionChange: { factionId: input.cityStateId, sovereignty: nextSovereignty, controllerId: 'player' },
      territoryTransfer: { transferId: `${commandId}:territory`, cells: input.capitalCells, fromOwnerId: input.cityStateId, toOwnerId: 'player', reason: 'colony_administration' }
    }
  };
  const preview = this._coordinator.previewCommand(command);
  if (!preview.ok) return preview;
  const committed = this._coordinator.executeCommand(command);
  if (!committed.ok) return committed;
  this._colonies[input.cityStateId] = {
    id: `colony:${input.cityStateId}`,
    cityStateId: input.cityStateId,
    legacyOffmap: false,
    policyId: input.policyId,
    autonomy: input.path === 'protectorate' ? 70 : 30,
    legitimacy: access.legitimacy,
    compliance: access.compliance,
    resistance: access.resistance,
    tradeConnection: this._commerce.getConnection(input.cityStateId),
    garrisonArmyId: input.garrisonArmyId ?? null,
    establishedDay: input.day,
    lastYieldDay: 0
  };
  const receipt = { ok: true, colonyId: committed.receipt?.colonyId ?? `colony:${input.cityStateId}`, event: committed.event };
  this._commandLedger[commandId] = receipt;
  return structuredClone(receipt);
}

releaseAdministration(input, commandId) {
  if (this._commandLedger[commandId]) return structuredClone(this._commandLedger[commandId]);
  const existing = this._colonies[input.cityStateId];
  if (!existing) return { ok: false, reason: 'administration_not_found' };
  const command = {
    commandId,
    type: 'colony.release_administration',
    actorId: 'player',
    targetId: input.cityStateId,
    day: input.day,
    tick: 0,
    payload: {
      factionChange: { factionId: input.cityStateId, sovereignty: input.nextSovereignty, controllerId: null },
      territoryTransfer: { transferId: `${commandId}:territory`, cells: input.capitalCells, fromOwnerId: 'player', toOwnerId: input.cityStateId, reason: 'colony_released' }
    }
  };
  const preview = this._coordinator.previewCommand(command);
  if (!preview.ok) return preview;
  const committed = this._coordinator.executeCommand(command);
  if (!committed.ok) return committed;
  delete this._colonies[input.cityStateId];
  const receipt = { ok: true, colonyId: existing.id, event: committed.event };
  this._commandLedger[commandId] = receipt;
  return structuredClone(receipt);
}
```

```js
// src/main.js — two owning systems participate; ColonySystem receives only the canonical receipt.
function registerColonyTransaction(type, eventType) {
  coordinator.registerCommandHandler({
    type,
    preview: ({ command }) => {
      const faction = factionSystem.previewSovereigntyChange(command.payload.factionChange);
      if (!faction.ok) return faction;
      const territory = territorySystem.previewTransfer(command.payload.territoryTransfer);
      if (!territory.ok) return territory;
      return {
        ok: true,
        prepared: {
          factionChange: { ...command.payload.factionChange, expectedRevision: faction.revision },
          territoryTransfer: { ...command.payload.territoryTransfer, expectedRevision: territory.revision },
          colonyId: `colony:${command.targetId}`
        }
      };
    },
    commit: ({ command, prepared }) => {
      const faction = factionSystem.commitSovereigntyChange(prepared.factionChange);
      const territory = territorySystem.commitTransfer(prepared.territoryTransfer);
      if (!faction.ok || !territory.ok) throw new Error('colony_no_fail_commit_contract_broken');
      return { ok: true, receipt: { commandId: command.commandId, colonyId: prepared.colonyId, factionRevision: faction.revision, territoryRevision: territory.revision } };
    },
    buildEvent: ({ command, receipt }) => ({ type: eventType, targetId: command.targetId, payload: receipt })
  });
}
registerColonyTransaction('colony.establish_administration', 'colony.administration_established');
registerColonyTransaction('colony.release_administration', 'colony.administration_released');
```

`config/colonies.json` becomes policy/capacity/resistance settings only. Keep `legacy_offmap` records loadable but exclude them from target generation. `FactionSystem.commitSovereigntyChange()` is the only sovereignty writer and `TerritorySystem.commitTransfer()` is the only territory writer; both are transaction participants invoked by the registered Coordinator handler only after every participant preview captures and validates its authoritative revision. Commits are no-fail for those captured revisions, and any mismatch rejects before either commit. Establishment and loss use symmetric handlers and exact receipts, so a failed preview leaves Faction, Territory and Colony unchanged. Daily yields submit the Task 4 registered `resource.deliver` command with integer `day`/`tick`; resistance submits the Task 6 registered `army.create` command with integer `day`/`tick`. ColonySystem stores only canonical receipts and resulting army references.

- [ ] **Step 4: Run GREEN and save/event regression**

Run: `node --test test/node/city-state-colonies.test.mjs test/node/integration-events-save.test.mjs`

Expected: all tests PASS; new records all resolve through `FactionSystem`; establishment and release atomically change Faction sovereignty and Territory ownership; Colony records never contain sovereignty; repeated command IDs do not duplicate administration or yields.

- [ ] **Step 5: Commit only Task 5 files**

```bash
git add -- config/colonies.json src/systems/ColonySystem.js src/systems/FactionSystem.js src/systems/TerritorySystem.js src/main.js src/ui/panels/event-panel.js test/node/city-state-colonies.test.mjs test/node/integration-events-save.test.mjs
git commit -m "feat: colonize generated city-states"
```

### Task 6: Compile 96 Wild-Site Templates and Implement Deterministic Lifecycle

**Files:**
- Create: `content-src/wild-sites.json`
- Create: `schemas/wild-sites.schema.json`
- Create: `scripts/generate-wild-sites.mjs`
- Create: `scripts/sample-strategic-content.mjs`
- Create: `config/wild-sites.json`
- Modify: `src/core/ConfigRegistry.js`
- Modify: `src/systems/WildSiteSystem.js`
- Modify: `src/main.js`
- Test: `test/node/wild-site-content-contract.test.mjs`
- Test: `test/node/wild-site-lifecycle.test.mjs`
- Test: `test/node/world-factions.test.mjs`

**Interfaces:**
- Consumes: Core Task 3's `calculateWildSiteCounts({ landReachable, navigableWater })` export and `PlacementManifest.wildSites: Array<{ instanceId, templateId, gridX, gridY, domain, threatTier }>` from `src/world/WorldPlacementSolver.js`; `RandomService.float(key)`, `RandomService.int(key, min, maxInclusive)`, `RandomService.pickWeighted(key, entries)` and the independent `createDeterministicRng(key)` export, all using `{ worldSeed, namespace, stableEntityId?, ordinal? }` keys and `{ value, weight }` weighted entries; Coordinator `registerCommandHandler()`/`previewCommand()`/`executeCommand()`; `ArmySystem.createArmy({ ownerId, name, position, unitStacks, creationId })`; current era.
- Produces: registered command type `army.create`; `initializeFromPlacements({ placements, currentEra })`; `advanceDay(day)`; `handleDefenderResult(input)`; instance projection with the Core-owned coordinates, lifecycle state and defender army reference. It does not produce quotas or initial coordinates.

- [ ] **Step 1: Write the failing shared-quota, manifest hydration and lifecycle tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateWildSiteCounts } from '../../src/world/WorldPlacementSolver.js';

const content = JSON.parse(readFileSync(new URL('../../config/wild-sites.json', import.meta.url), 'utf8'));

test('wild-site catalog meets the exact category contract', () => {
  const counts = Object.fromEntries(Object.entries(Object.groupBy(content.templates, x => x.category)).map(([key, values]) => [key, values.length]));
  assert.equal(content.templates.length, 96);
  assert.deepEqual(counts, {
    resource_guard: 24, barbarian_camp: 18, ruin_guard: 12, roaming_host: 10,
    rebel_fort: 8, pirate_fleet: 12, blockade_fleet: 6, wreck_guard: 6
  });
});

test('large-map counts use reachable areas and hard caps', () => {
  assert.deepEqual(calculateWildSiteCounts({ landReachable: 76500, navigableWater: 24000 }), { land: 90, naval: 20, total: 110 });
  assert.deepEqual(calculateWildSiteCounts({ landReachable: 20000, navigableWater: 0 }), { land: 24, naval: 0, total: 24 });
});
```

```js
import { WildSiteSystem } from '../../src/systems/WildSiteSystem.js';

test('initialization preserves the exact Core PlacementManifest coordinates', () => {
  const system = new WildSiteSystem({
    worldSeed: 'placement-test',
    templates: [{ id: 'ruin_a', category: 'ruin_guard', lifecycle: { mode: 'oneShot' } }]
  });
  const placement = { instanceId: 'site:manifest:1', templateId: 'ruin_a', gridX: 117, gridY: 42, domain: 'land', threatTier: 2 };
  assert.deepEqual(system.initializeFromPlacements({ placements: [placement], currentEra: 'ancient' }), { ok: true, initialized: 1 });
  const site = system.getSiteState(placement.instanceId);
  assert.deepEqual(
    { instanceId: site.instanceId, templateId: site.templateId, gridX: site.gridX, gridY: site.gridY, domain: site.domain, threatTier: site.threatTier },
    placement
  );
  assert.equal(site.state, 'active');
  assert.equal(site.cycle, 0);
  assert.equal(site.defenderArmyId, null);
});

test('one-shot sites stay cleared while camps repopulate as a new deterministic instance', () => {
  const commands = [];
  const armyCreations = [];
  const army = { createArmy: input => { armyCreations.push(input); return { ok: true, armyId: `army:${input.creationId}` }; } };
  const coordinator = {
    previewCommand: () => ({ ok: true }),
    executeCommand: command => {
      commands.push(command);
      const { ownerId, name, position, unitStacks, creationId } = command.payload;
      const result = army.createArmy({ ownerId, name, position, unitStacks, creationId });
      return { ok: true, event: { eventId: `event:${command.commandId}` }, receipt: result };
    }
  };
  const system = new WildSiteSystem({
    worldSeed: 'wild-test',
    templates: [
      { id: 'ruin_a', category: 'ruin_guard', lifecycle: { mode: 'oneShot' } },
      { id: 'camp_a', category: 'barbarian_camp', lifecycle: { mode: 'repopulate', minDays: 8, maxDays: 8, replacementPool: ['camp_b'] } },
      { id: 'camp_b', category: 'barbarian_camp', lifecycle: { mode: 'repopulate', minDays: 8, maxDays: 8, replacementPool: ['camp_a'] } }
    ],
    random: { int: (key, min, maxInclusive) => {
      assert.deepEqual(key, { worldSeed: 'wild-test', namespace: 'wild.repopulation_delay', stableEntityId: 'site:camp', ordinal: 1 });
      assert.deepEqual([min, maxInclusive], [8, 8]);
      return 8;
    } }, coordinator
  });
  system.restoreState({ instances: {
    'site:ruin': { instanceId: 'site:ruin', templateId: 'ruin_a', state: 'active', gridX: 10, gridY: 10, cycle: 0 },
    'site:camp': { instanceId: 'site:camp', templateId: 'camp_a', state: 'active', gridX: 30, gridY: 30, cycle: 0 }
  } });
  system.handleDefenderResult({ instanceId: 'site:ruin', victory: true, day: 4, eventId: 'battle:1' });
  system.handleDefenderResult({ instanceId: 'site:camp', victory: true, day: 4, eventId: 'battle:2' });
  system.advanceDay(12);
  assert.equal(system.getSiteState('site:ruin').state, 'cleared');
  assert.equal(system.getSiteState('site:camp').templateId, 'camp_b');
  assert.equal(system.getSiteState('site:camp').cycle, 1);
  assert.equal(commands.filter(c => c.type === 'army.create').length, 1);
  assert.equal(commands[0].day, 12);
  assert.equal(commands[0].tick, 0);
  assert.equal(armyCreations[0].ownerId, 'wild:site:camp');
  assert.equal(armyCreations[0].name, 'camp_b');
  assert.equal(armyCreations[0].creationId, 'wild:site:camp:cycle:1');
});
```

- [ ] **Step 2: Run the tests to verify RED**

Run: `node --test test/node/wild-site-content-contract.test.mjs test/node/wild-site-lifecycle.test.mjs`

Expected: FAIL because compiled content, manifest initialization and instance lifecycle are absent.

- [ ] **Step 3: Implement reproducible compilation, Core-manifest hydration and lifecycle**

```js
// src/systems/WildSiteSystem.js
const PLACEMENT_KEYS = ['domain', 'gridX', 'gridY', 'instanceId', 'templateId', 'threatTier'];

initializeFromPlacements({ placements, currentEra }) {
  if (Object.keys(this._instances).length > 0) return { ok: false, reason: 'wild_sites_already_initialized' };
  const knownTemplates = new Set(this._templates.map(template => template.id));
  const next = {};
  for (const placement of [...placements].sort((a, b) => a.instanceId.localeCompare(b.instanceId))) {
    if (Object.keys(placement).sort().join('|') !== PLACEMENT_KEYS.join('|')) throw new Error('invalid_wild_placement_shape');
    if (next[placement.instanceId]) throw new Error('duplicate_wild_instance_id');
    if (!knownTemplates.has(placement.templateId)) throw new Error('unknown_wild_template');
    if (!Number.isInteger(placement.gridX) || !Number.isInteger(placement.gridY)) throw new Error('invalid_wild_coordinates');
    if (!['land', 'naval'].includes(placement.domain)) throw new Error('invalid_wild_domain');
    next[placement.instanceId] = {
      ...structuredClone(placement), currentEra, state: 'active', cycle: 0,
      defenderArmyId: null, repopulateOnDay: null
    };
  }
  this._instances = next;
  return { ok: true, initialized: placements.length };
}
```

```js
// src/main.js — generic for player, faction and wild owners; ArmySystem remains the only army writer.
coordinator.registerCommandHandler({
  type: 'army.create',
  preview: ({ command }) => {
    const input = command.payload;
    if (!Number.isInteger(command.day) || !Number.isInteger(command.tick)) return { ok: false, reason: 'invalid_command_time' };
    if (!input.ownerId || !input.name || !input.position || !Array.isArray(input.unitStacks) || !input.creationId) return { ok: false, reason: 'invalid_army_create' };
    return { ok: true, prepared: { input: structuredClone(input) } };
  },
  commit: ({ command, prepared }) => {
    const created = armySystem.createArmy(prepared.input);
    return created.ok ? { ok: true, receipt: { commandId: command.commandId, armyId: created.armyId, creationId: prepared.input.creationId } } : created;
  },
  buildEvent: ({ command, receipt }) => ({ type: 'army.created', targetId: receipt.armyId, payload: receipt })
});
```

Core Task 3's `PlacementManifest.wildSites` is the only source of initial wild-site IDs and coordinates. Content Task 6 never scans terrain, searches candidate cells, recalculates density, changes a manifest coordinate or defines a second placement/quota formula; its quota test imports the shared Core function directly. `initializeFromPlacements` only validates the exact manifest shape and instantiates lifecycle state. A repopulating site keeps its original `instanceId`, `gridX`, `gridY`, `domain` and `threatTier`, increments `cycle`, and chooses the next allowed template using the keyed random contract. Each defender submits `{ commandId, type: 'army.create', actorId: 'wild:<instanceId>', targetId: instanceId, day, tick: 0, payload: { ownerId: 'wild:<instanceId>', name: template.id, position, unitStacks, creationId } }`; after registered preview succeeds, the handler alone calls `ArmySystem.createArmy(...)`. WildSiteSystem owns only lifecycle data and the returned `defenderArmyId` reference.

`scripts/generate-wild-sites.mjs --check` validates the schema, exact category counts, four-resource references and canonical eras, then compares stable JSON bytes. `scripts/sample-strategic-content.mjs --kind wild-site --seed review-20260803 --count 12` must always print the same twelve IDs and their threat/reward summaries for manual review.

- [ ] **Step 4: Run GREEN, reproducibility and manual sample checks**

Run: `node scripts/generate-wild-sites.mjs --check`

Expected: `wild-sites: 96 templates, category contract valid, output is reproducible`.

Run: `node scripts/sample-strategic-content.mjs --kind wild-site --seed review-20260803 --count 12`

Expected: 12 stable, unique records including at least one land resource guard, ruin, mobile host, pirate and blockade.

Run: `node --test test/node/wild-site-content-contract.test.mjs test/node/wild-site-lifecycle.test.mjs test/node/world-factions.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit only Task 6 files**

```bash
git add -- content-src/wild-sites.json schemas/wild-sites.schema.json scripts/generate-wild-sites.mjs scripts/sample-strategic-content.mjs config/wild-sites.json src/core/ConfigRegistry.js src/systems/WildSiteSystem.js src/main.js test/node/wild-site-content-contract.test.mjs test/node/wild-site-lifecycle.test.mjs test/node/world-factions.test.mjs
git commit -m "feat: add deterministic wild-site ecology"
```

### Task 7: Implement Seven-Era Mission Tracks, Deduplicated Stars and Three Endings

**Files:**
- Create: `config/era-missions.json`
- Create: `src/systems/EraMissionEvaluator.js`
- Modify: `src/core/ConfigRegistry.js`
- Modify: `src/systems/EraSystem.js`
- Modify: `src/main.js`
- Test: `test/node/era-missions-endings.test.mjs`
- Test: `test/node/strategies-era-heroes.test.mjs`

**Interfaces:**
- Consumes: committed domain fact envelopes; Tech/Culture era progress; read-only faction, treaty, commerce, colony, territory and satisfaction projections.
- Produces: `consumeFact(eventEnvelope)`; `getMissionProgress(eraId)`; `awardStar({ eraId, trackId, tier, sourceId })`; `evaluateEnding(snapshot)`; `getVictoryState()`.

- [ ] **Step 1: Write the failing mission and ending tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EraSystem } from '../../src/systems/EraSystem.js';

const missions = JSON.parse(readFileSync(new URL('../../config/era-missions.json', import.meta.url), 'utf8'));

test('mission contract is seven tracks by three tiers in all seven eras', () => {
  assert.equal(missions.eras.length, 7);
  for (const era of missions.eras) {
    assert.equal(era.tracks.length, 7);
    assert.ok(era.tracks.every(track => track.tiers.length === 3));
  }
  assert.deepEqual(missions.advanceThresholds, [5, 8, 11, 14, 17, 20]);
});

test('the same source never awards a star twice and harmony ending requires a clean 20-day window', () => {
  const system = new EraSystem({ missionConfig: missions });
  system.initNew();
  system.awardStar({ eraId: 'primitive', trackId: 'settlement', tier: 1, sourceId: 'building:hall:first' });
  system.awardStar({ eraId: 'primitive', trackId: 'settlement', tier: 1, sourceId: 'building:hall:first' });
  assert.equal(system.getEraStars('primitive'), 1);
  const result = system.evaluateEnding({
    eraId: 'modern', eraStars: 20, techProgress: 1, civicProgress: 1,
    alliedCapitalRatio: 0.64, activeMapRoutes: 4, daysSinceLastBreach: 20,
    controlledCapitalRatio: 0.2, crossContinentRoutes: 1, stableColonies: 1, capitalSatisfactionStreak: 2
  });
  assert.deepEqual(result, { achieved: true, route: 'harmony' });
});
```

- [ ] **Step 2: Run the tests to verify RED**

Run: `node --test test/node/era-missions-endings.test.mjs`

Expected: FAIL because mission config, `awardStar` ledger and ending evaluation are absent.

- [ ] **Step 3: Implement pure evaluators and authoritative star ledger**

```js
// src/systems/EraMissionEvaluator.js
export function evaluateEnding(snapshot) {
  const ready = snapshot.eraId === 'modern' && snapshot.eraStars >= 20 && snapshot.techProgress === 1 && snapshot.civicProgress === 1;
  if (!ready) return { achieved: false, reason: 'modern_completion_required' };
  if (snapshot.controlledCapitalRatio >= 0.6) return { achieved: true, route: 'hegemony' };
  if (snapshot.alliedCapitalRatio >= 0.6 && snapshot.activeMapRoutes >= 4 && snapshot.daysSinceLastBreach >= 20) return { achieved: true, route: 'harmony' };
  if (snapshot.crossContinentRoutes >= 3 && snapshot.stableColonies >= 2 && snapshot.capitalSatisfactionStreak >= 10) return { achieved: true, route: 'prosperity' };
  return { achieved: false, reason: 'ending_route_incomplete' };
}
```

Each mission tier declares evaluator type `cumulative`, `snapshot`, `unique_set` or `sequence`, an event type allowlist and a stable star `sourceId`. `EraSystem` stores `starAwardsLedger`, mission progress and ending state. Remove production calls that increment anonymous category totals.

- [ ] **Step 4: Run GREEN and era regression**

Run: `node --test test/node/era-missions-endings.test.mjs test/node/strategies-era-heroes.test.mjs`

Expected: all tests PASS; 147 mission tiers validate; all three endings are reachable; duplicate facts and source IDs award nothing twice.

- [ ] **Step 5: Commit only Task 7 files**

```bash
git add -- config/era-missions.json src/systems/EraMissionEvaluator.js src/core/ConfigRegistry.js src/systems/EraSystem.js src/main.js test/node/era-missions-endings.test.mjs test/node/strategies-era-heroes.test.mjs
git commit -m "feat: add era missions and campaign endings"
```

### Task 8: Route All 57 Civilization Rules Through Explicit Consumers

**Files:**
- Create: `content-src/civilization-depth.json`
- Create: `config/civilization-depth.json`
- Create: `schemas/civilization-depth.schema.json`
- Create: `scripts/generate-civilization-depth.mjs`
- Create: `src/systems/CivilizationRuleSystem.js`
- Modify: `src/core/ConfigRegistry.js`
- Modify: `src/systems/EraSystem.js`
- Modify: `src/systems/BuildingSystem.js`
- Modify: `src/systems/ArmySystem.js`
- Modify: `src/systems/CommerceSystem.js`
- Modify: `src/systems/DiplomacySystem.js`
- Modify: `src/systems/CombatResolver.js`
- Modify: `src/main.js`
- Test: `test/node/civilization-rule-consumers.test.mjs`
- Test: `test/node/civilization-differentiation.test.mjs`

**Interfaces:**
- Consumes: selected civilization and legacy IDs from `EraSystem`; configured rule records keyed by civilization ID.
- Produces: `CivilizationRuleSystem.getModifiers(consumer, context)`; `getUnlocks(consumer, context)`; `getDialogueProfile(civilizationId)`; `getActiveLegacyIds()`; a consumer registry used by config validation.

- [ ] **Step 1: Write the failing coverage and consumer tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CivilizationRuleSystem } from '../../src/systems/CivilizationRuleSystem.js';

const config = JSON.parse(readFileSync(new URL('../../config/civilization-depth.json', import.meta.url), 'utf8'));
const consumers = new Set(['building', 'training', 'economy', 'research', 'diplomacy', 'trade', 'naval', 'combat', 'legacy']);

test('all 57 civilizations have live rule keys and narrative references', () => {
  assert.equal(config.civilizations.length, 57);
  for (const civ of config.civilizations) {
    assert.ok(civ.rules.length >= 3, civ.id);
    assert.ok(civ.rules.every(rule => consumers.has(rule.consumer)), civ.id);
    assert.ok(civ.chainId === `civ_chain_${civ.id}`);
    assert.ok(civ.randomEventIds.length >= 1);
    assert.ok(civ.cityPalette.primary);
  }
});

test('selected trait and inherited legacy are aggregated without mutating source config', () => {
  const source = structuredClone(config);
  const system = new CivilizationRuleSystem({ config });
  system.setSelection({ currentCivilizationId: 'rome', legacyCivilizationIds: ['zhou'] });
  const modifiers = system.getModifiers('building', { tags: ['infrastructure'] });
  assert.ok(Object.keys(modifiers).length > 0);
  assert.deepEqual(config, source);
});
```

- [ ] **Step 2: Run the tests to verify RED**

Run: `node --test test/node/civilization-rule-consumers.test.mjs`

Expected: FAIL because the depth config and rule aggregator do not exist.

- [ ] **Step 3: Implement a typed rule aggregator and wire consumers**

```js
// src/systems/CivilizationRuleSystem.js
export class CivilizationRuleSystem {
  constructor({ config }) {
    this._records = new Map(config.civilizations.map(record => [record.id, structuredClone(record)]));
    this._currentId = null;
    this._legacyIds = [];
  }
  setSelection({ currentCivilizationId, legacyCivilizationIds }) {
    this._currentId = currentCivilizationId;
    this._legacyIds = [...legacyCivilizationIds];
  }
  getModifiers(consumer, context = {}) {
    const active = [this._currentId, ...this._legacyIds].filter(Boolean);
    const rules = active.flatMap(id => this._records.get(id)?.rules ?? []).filter(rule => rule.consumer === consumer && matchesRule(rule, context));
    return combineModifiers(rules.map(rule => rule.modifiers));
  }
}

function matchesRule(rule, context) {
  return (rule.requiredTags ?? []).every(tag => (context.tags ?? []).includes(tag));
}

function combineModifiers(items) {
  const result = {};
  for (const item of items) for (const [key, value] of Object.entries(item ?? {})) result[key] = key.endsWith('Mul') ? (result[key] ?? 1) * value : (result[key] ?? 0) + value;
  return result;
}
```

Every rule has stable `id`, `consumer`, optional tags/conditions, modifiers/unlocks and `scope: current|legacy`. The generator rejects unknown consumer/effect keys. Each modified consumer asks the rule system for a read-only modifier and remains the only writer of its own state.

- [ ] **Step 4: Run GREEN, generation and differentiation regression**

Run: `node scripts/generate-civilization-depth.mjs --check`

Expected: `civilization-depth: 57 records, all rule keys have consumers`.

Run: `node --test test/node/civilization-rule-consumers.test.mjs test/node/civilization-differentiation.test.mjs`

Expected: all tests PASS; no configured rule is orphaned.

- [ ] **Step 5: Commit only Task 8 files**

```bash
git add -- content-src/civilization-depth.json config/civilization-depth.json schemas/civilization-depth.schema.json scripts/generate-civilization-depth.mjs src/systems/CivilizationRuleSystem.js src/core/ConfigRegistry.js src/systems/EraSystem.js src/systems/BuildingSystem.js src/systems/ArmySystem.js src/systems/CommerceSystem.js src/systems/DiplomacySystem.js src/systems/CombatResolver.js src/main.js test/node/civilization-rule-consumers.test.mjs test/node/civilization-differentiation.test.mjs
git commit -m "feat: activate civilization rule depth"
```

### Task 9: Add Cross-Tree Prerequisites, Joint Unlocks and Anti-Softlock Catch-Up

**Files:**
- Create: `src/systems/ResearchGraph.js`
- Modify: `config/historical_content.json`
- Modify: `src/systems/TechSystem.js`
- Modify: `src/systems/CultureSystem.js`
- Modify: `src/ui/panels/tech-tree-panel.js`
- Modify: `src/ui/panels/culture-tree-panel.js`
- Test: `test/node/cross-tree-research.test.mjs`
- Test: `test/node/era-research-trees.test.mjs`

**Interfaces:**
- Consumes: canonical tech/civic nodes and EraSystem selection/progress.
- Produces: `buildResearchGraph({ techs, civics })`; `canResearchNode({ kind, id, researchedTechs, researchedCivics })`; `getJointUnlocks(state)`; `getCatchUpMultiplier({ techProgress, civicProgress })`.

- [ ] **Step 1: Write the failing cross-tree and reachability tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResearchGraph, canResearchNode, getCatchUpMultiplier } from '../../src/systems/ResearchGraph.js';

test('cross-tree prerequisites are enforced and every node stays reachable', () => {
  const graph = buildResearchGraph({
    techs: [{ id: 'surveying', eraId: 'ancient', prerequisites: [], crossPrerequisites: [{ kind: 'civic', id: 'land_charters' }] }],
    civics: [{ id: 'land_charters', eraId: 'ancient', prerequisites: [], crossPrerequisites: [] }]
  });
  assert.equal(graph.unreachable.length, 0);
  assert.equal(canResearchNode({ graph, kind: 'tech', id: 'surveying', researchedTechs: [], researchedCivics: [] }).reason, 'missing_civic:land_charters');
  assert.equal(canResearchNode({ graph, kind: 'tech', id: 'surveying', researchedTechs: [], researchedCivics: ['land_charters'] }).ok, true);
});

test('catch-up helps only the tree trailing by at least 25 percentage points', () => {
  assert.deepEqual(getCatchUpMultiplier({ techProgress: 0.3, civicProgress: 0.7 }), { tech: 1.25, civic: 1 });
  assert.deepEqual(getCatchUpMultiplier({ techProgress: 0.7, civicProgress: 0.3 }), { tech: 1, civic: 1.25 });
  assert.deepEqual(getCatchUpMultiplier({ techProgress: 0.5, civicProgress: 0.6 }), { tech: 1, civic: 1 });
});
```

- [ ] **Step 2: Run the tests to verify RED**

Run: `node --test test/node/cross-tree-research.test.mjs`

Expected: FAIL because `ResearchGraph.js` is absent.

- [ ] **Step 3: Implement a combined DAG and controlled catch-up**

```js
export function getCatchUpMultiplier({ techProgress, civicProgress }) {
  const gap = techProgress - civicProgress;
  if (gap <= -0.25) return { tech: 1.25, civic: 1 };
  if (gap >= 0.25) return { tech: 1, civic: 1.25 };
  return { tech: 1, civic: 1 };
}

export function canResearchNode({ graph, kind, id, researchedTechs, researchedCivics }) {
  const node = graph.nodes.get(`${kind}:${id}`);
  if (!node) return { ok: false, reason: 'research_node_not_found' };
  const techSet = new Set(researchedTechs);
  const civicSet = new Set(researchedCivics);
  for (const req of node.crossPrerequisites ?? []) {
    const met = req.kind === 'tech' ? techSet.has(req.id) : civicSet.has(req.id);
    if (!met) return { ok: false, reason: `missing_${req.kind}:${req.id}` };
  }
  return { ok: true };
}
```

Author at least two cross-tree links and one joint unlock per era. The combined graph validator must reject cycles, missing references and a node with no valid path from an era root. Catch-up changes effective research speed only and never marks a node complete.

- [ ] **Step 4: Run GREEN and full tree regression**

Run: `node --test test/node/cross-tree-research.test.mjs test/node/era-research-trees.test.mjs`

Expected: all tests PASS; combined DAG has zero cycles/unreachable nodes; UI reason text includes the opposite-tree node name.

- [ ] **Step 5: Commit only Task 9 files**

```bash
git add -- src/systems/ResearchGraph.js config/historical_content.json src/systems/TechSystem.js src/systems/CultureSystem.js src/ui/panels/tech-tree-panel.js src/ui/panels/culture-tree-panel.js test/node/cross-tree-research.test.mjs test/node/era-research-trees.test.mjs
git commit -m "feat: connect technology and civic research"
```

### Task 10: Consolidate 72 Heroes with Rarity, Growth and Real Appointments

**Files:**
- Create: `content-src/heroes.json`
- Create: `schemas/heroes.schema.json`
- Create: `scripts/generate-heroes.mjs`
- Create: `config/heroes.json`
- Create: `src/systems/HeroAssignmentRules.js`
- Modify: `src/core/ConfigRegistry.js`
- Modify: `src/systems/HeroSystem.js`
- Modify: `src/systems/ArmySystem.js`
- Modify: `src/main.js`
- Test: `test/node/hero-progression-appointments.test.mjs`
- Test: `test/node/hero-classes-roster.test.mjs`

**Interfaces:**
- Consumes: authoritative target directory `resolveTarget({ targetType, targetId, slotId }) => { exists, occupiedBy, tags }`; committed battle/assignment/quest facts; Coordinator assignment commands.
- Produces: `gainExperience(heroId, amount, sourceEventId)`; `selectTalent(heroId, talentId, commandId)`; `assignHero(heroId, assignment, commandId)`; `suspendInvalidAssignments()`; roster projections.

- [ ] **Step 1: Write the failing roster, XP and assignment tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HeroSystem } from '../../src/systems/HeroSystem.js';

const heroes = JSON.parse(readFileSync(new URL('../../config/heroes.json', import.meta.url), 'utf8')).heroes;

test('hero rarity, level and content quotas are exact', () => {
  assert.equal(heroes.length, 72);
  const rarity = Object.fromEntries(Object.entries(Object.groupBy(heroes, h => h.rarity)).map(([key, values]) => [key, values.length]));
  assert.deepEqual(rarity, { notable: 30, renowned: 24, epic: 12, legendary: 6 });
  assert.ok(heroes.every(h => h.growth.xpThresholds.join(',') === '0,80,200,380,640,1000,1500,2180,3080,4280'));
});

test('experience facts deduplicate and appointments name a real target slot', () => {
  const directory = { resolveTarget: value => value.targetId === 'army:1' ? { exists: true, occupiedBy: null, tags: ['land_army'] } : { exists: false } };
  const system = new HeroSystem({ definitions: heroes, targetDirectory: directory });
  system.restoreState({ recruited: { fu_hao: { heroId: 'fu_hao', level: 1, xp: 0, assignment: null } }, xpEventLedger: [] });
  system.gainExperience('fu_hao', 80, 'battle:1');
  system.gainExperience('fu_hao', 80, 'battle:1');
  assert.equal(system.getHeroState('fu_hao').level, 2);
  assert.equal(system.assignHero('fu_hao', { targetType: 'army', targetId: 'army:1', slotId: 'commander' }, 'cmd:assign:1').ok, true);
  assert.equal(system.assignHero('fu_hao', { targetType: 'settlement', targetId: 'capital', slotId: 'governor' }, 'cmd:assign:2').reason, 'appointment_not_allowed');
});
```

- [ ] **Step 2: Run the tests to verify RED**

Run: `node --test test/node/hero-progression-appointments.test.mjs`

Expected: FAIL because `config/heroes.json`, progression and structured appointments are absent.

- [ ] **Step 3: Implement authoritative hero definitions and progression**

```js
// src/systems/HeroAssignmentRules.js
export const ROLE_SLOTS = {
  commander: ['army.commander'], strategist: ['army.staff'], admiral: ['fleet.admiral'],
  governor: ['settlement.governor', 'council.minister', 'dependent_city.administrator'],
  scholar: ['academy.chair', 'library.curator', 'research.project'],
  engineer: ['engineers_guild.master', 'construction.project', 'fortification.project'],
  diplomat: ['embassy.envoy', 'city_state.mission', 'trade_route.negotiator'],
  explorer: ['expedition.leader', 'trade_route.scout', 'settlement.surveyor'],
  physician: ['hospital.director', 'settlement.physician', 'recovery.mission']
};

export function validateHeroAssignment(definition, assignment, target) {
  const key = `${assignment.targetType}.${assignment.slotId}`;
  if (!ROLE_SLOTS[definition.role]?.includes(key)) return { ok: false, reason: 'appointment_not_allowed' };
  if (!target.exists) return { ok: false, reason: 'appointment_target_missing' };
  if (target.occupiedBy && target.occupiedBy !== definition.id) return { ok: false, reason: 'appointment_slot_occupied' };
  return { ok: true };
}
```

The generator enforces 72 unique IDs, exact rarity quotas, nine roles, one signature skill, one mission and one legacy per hero. `HeroSystem` stores level 1–10, XP, chosen level-3 talent, level-6 mastery, level-9 combo bonus and level-10 mission gate. Assignment XP is capped at 16/day and injured heroes gain none.

- [ ] **Step 4: Run GREEN, generator and existing roster regression**

Run: `node scripts/generate-heroes.mjs --check`

Expected: `heroes: 72 records, rarity 30/24/12/6, output is reproducible`.

Run: `node --test test/node/hero-progression-appointments.test.mjs test/node/hero-classes-roster.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit only Task 10 files**

```bash
git add -- content-src/heroes.json schemas/heroes.schema.json scripts/generate-heroes.mjs config/heroes.json src/systems/HeroAssignmentRules.js src/core/ConfigRegistry.js src/systems/HeroSystem.js src/systems/ArmySystem.js src/main.js test/node/hero-progression-appointments.test.mjs test/node/hero-classes-roster.test.mjs
git commit -m "feat: add hero growth and real appointments"
```

### Task 11: Execute Hero Skills, Relationships and 36 Bounded Combinations

**Files:**
- Create: `content-src/hero-relationships.json`
- Create: `content-src/hero-combos.json`
- Create: `config/hero-relationships.json`
- Create: `config/hero-combos.json`
- Create: `src/systems/HeroSkillEngine.js`
- Create: `src/systems/HeroRelationshipRules.js`
- Modify: `src/core/ConfigRegistry.js`
- Modify: `src/systems/HeroSystem.js`
- Modify: `src/systems/CombatResolver.js`
- Test: `test/node/hero-skills-relationships-combos.test.mjs`

**Interfaces:**
- Consumes: committed trigger fact envelopes; active structured assignments; `HeroSystem` states; battle modifier collector.
- Produces: `HeroSkillEngine.evaluateTrigger(fact, context)`; `HeroSystem.adjustRelationship(input)`; `getActiveCombos(context)`; effect commands with stable source keys.

- [ ] **Step 1: Write the failing graph, trigger and stacking tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HeroSkillEngine } from '../../src/systems/HeroSkillEngine.js';

const relations = JSON.parse(readFileSync(new URL('../../config/hero-relationships.json', import.meta.url), 'utf8')).edges;
const combos = JSON.parse(readFileSync(new URL('../../config/hero-combos.json', import.meta.url), 'utf8')).combos;

test('relationship graph and combo coverage match the exact contracts', () => {
  assert.equal(relations.length, 108);
  assert.equal(combos.length, 36);
  const degrees = {};
  for (const edge of relations) for (const id of edge.heroIds) degrees[id] = (degrees[id] ?? 0) + 1;
  assert.ok(Object.values(degrees).every(value => value >= 2 && value <= 4));
  const participation = {};
  for (const combo of combos) for (const id of combo.heroIds) participation[id] = (participation[id] ?? 0) + 1;
  assert.equal(Object.keys(participation).length, 72);
  assert.ok(Object.values(participation).every(value => value <= 3));
});

test('one trigger applies at most one attack and one support combo', () => {
  const engine = new HeroSkillEngine({
    skills: [], combos: [
      { id: 'a1', heroIds: ['h1', 'h2'], category: 'attack', priority: 5, trigger: 'battle_start', effects: [{ type: 'combat_modifier', key: 'powerMul', value: 1.1 }] },
      { id: 'a2', heroIds: ['h1', 'h2'], category: 'attack', priority: 2, trigger: 'battle_start', effects: [{ type: 'combat_modifier', key: 'powerMul', value: 1.1 }] },
      { id: 's1', heroIds: ['h1', 'h2'], category: 'support', priority: 1, trigger: 'battle_start', effects: [{ type: 'combat_modifier', key: 'morale', value: 4 }] }
    ]
  });
  const effects = engine.evaluateTrigger({ eventId: 'battle:1:start', type: 'battle_start' }, { activeHeroIds: ['h1', 'h2'], relationships: { 'h1|h2': 50 } });
  assert.deepEqual(effects.map(x => x.sourceId), ['combo:a1', 'combo:s1']);
});
```

- [ ] **Step 2: Run the tests to verify RED**

Run: `node --test test/node/hero-skills-relationships-combos.test.mjs`

Expected: FAIL because relationship/combo configs and trigger engine are absent.

- [ ] **Step 3: Implement bounded trigger evaluation and relationship rules**

```js
// src/systems/HeroSkillEngine.js
export class HeroSkillEngine {
  constructor({ skills, combos }) { this._skills = skills; this._combos = combos; this._triggerLedger = new Set(); }
  evaluateTrigger(fact, context) {
    const key = fact.eventId;
    if (this._triggerLedger.has(key)) return [];
    this._triggerLedger.add(key);
    const eligible = this._combos.filter(combo => combo.trigger === fact.type && combo.heroIds.every(id => context.activeHeroIds.includes(id)) && relationshipAllows(combo, context.relationships));
    const chosen = ['attack', 'support'].flatMap(category => eligible.filter(combo => combo.category === category).sort((a, b) => b.priority - a.priority).slice(0, 1));
    return chosen.flatMap(combo => combo.effects.map(effect => ({ ...effect, sourceId: `combo:${combo.id}` })));
  }
}

function relationshipAllows(combo, scores) {
  const pairKey = [...combo.heroIds].sort().slice(0, 2).join('|');
  const score = scores[pairKey] ?? 0;
  return combo.relationshipMode === 'rivalry' ? score <= -40 : score >= 40;
}
```

Supported skill triggers are exactly the approved 13 trigger families. Every skill declares conditions, probability, cooldown, per-battle/per-day limits, stack group and priority. Relation adjustments deduplicate by source event; co-assignment is +2/day with +10 per pair per rolling seven days. Compile relation edge quotas as 48 affinity, 36 complement and 24 rivalry.

- [ ] **Step 4: Run GREEN and combat regression**

Run: `node --test test/node/hero-skills-relationships-combos.test.mjs test/node/phased-combat.test.mjs`

Expected: all tests PASS; repeated trigger event IDs produce no second effects; no trigger applies more than one attack and one support combo.

- [ ] **Step 5: Commit only Task 11 files**

```bash
git add -- content-src/hero-relationships.json content-src/hero-combos.json config/hero-relationships.json config/hero-combos.json src/systems/HeroSkillEngine.js src/systems/HeroRelationshipRules.js src/core/ConfigRegistry.js src/systems/HeroSystem.js src/systems/CombatResolver.js test/node/hero-skills-relationships-combos.test.mjs
git commit -m "feat: add hero relationships and bounded combos"
```

### Task 12: Make Tavern Rotation Deterministic with Locking and Pity Protection

**Files:**
- Create: `src/systems/TavernOfferGenerator.js`
- Modify: `src/systems/HeroSystem.js`
- Modify: `src/ui/panels/tavern-heroes-panel.js`
- Test: `test/node/tavern-protection.test.mjs`

**Interfaces:**
- Consumes: `RandomService.pickWeighted(key, entries)` with `key` `{ worldSeed, namespace, stableEntityId?, ordinal? }` and `entries` `Array<{ value, weight }>`; the independent `createDeterministicRng(key)` export; current era/order; 72 hero definitions; recruited and recent-offer state.
- Produces: `refreshOffers({ day, eraId, eraOrder })`; `lockOffer(heroId, commandId)`; `recruitHero(heroId, commandId)`; persisted pity/recent/lock/RNG ordinal state.

- [ ] **Step 1: Write the failing 12-rotation protection simulation**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { TavernOfferGenerator } from '../../src/systems/TavernOfferGenerator.js';

const heroes = Array.from({ length: 72 }, (_, index) => ({
  id: `h${index}`, eraId: index < 12 ? 'ancient' : 'classical',
  heroClass: index % 2 ? 'civil' : 'military',
  rarity: index < 6 ? 'legendary' : index < 18 ? 'epic' : index < 42 ? 'renowned' : 'notable'
}));
const random = { pickWeighted: (key, entries) => {
  assert.equal(key.worldSeed, 'tavern-test');
  assert.equal(key.namespace, 'tavern.offer');
  assert.ok(entries.every(entry => Object.hasOwn(entry, 'value') && Number.isFinite(entry.weight)));
  return entries[(key.ordinal ?? 0) % entries.length].value;
} };

test('offers are five wide, avoid three-round repeats and meet epic and legendary pity', () => {
  const generator = new TavernOfferGenerator({ heroes, random, worldSeed: 'tavern-test' });
  const history = [];
  for (let rotation = 1; rotation <= 12; rotation++) history.push(generator.refresh({ day: rotation * 3, eraId: 'classical', eraOrder: 2 }));
  assert.ok(history.every(offer => offer.length === 5));
  for (let i = 3; i < history.length; i++) {
    const recent = new Set(history.slice(i - 3, i).flat());
    assert.ok(history[i].every(id => !recent.has(id)));
  }
  assert.ok(history.slice(0, 5).flat().some(id => ['epic', 'legendary'].includes(heroes.find(h => h.id === id).rarity)));
  assert.ok(history.flat().some(id => heroes.find(h => h.id === id).rarity === 'legendary'));
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node --test test/node/tavern-protection.test.mjs`

Expected: FAIL because the deterministic offer generator does not exist.

- [ ] **Step 3: Implement offer slots, pity and atomic recruit receipts**

```js
// src/systems/TavernOfferGenerator.js
export class TavernOfferGenerator {
  constructor({ heroes, random, worldSeed, state = {} }) {
    this._heroes = heroes;
    this._random = random;
    this._worldSeed = worldSeed;
    this._state = { rotation: 0, epicMisses: 0, legendaryMisses: 0, recent: [], lockedHeroId: null, ...state };
  }
  refresh({ day, eraId, eraOrder }) {
    const eligible = this._eligible(eraOrder);
    const blocked = new Set(this._state.recent.slice(-3).flat());
    const result = this._state.lockedHeroId ? [this._state.lockedHeroId] : [];
    const forceLegendary = this._state.legendaryMisses >= 11;
    const forceEpic = !forceLegendary && this._state.epicMisses >= 4;
    this._fillFive(result, eligible.filter(hero => !blocked.has(hero.id)), { forceLegendary, forceEpic, eraId, day });
    this._record(result);
    return [...result];
  }
}
```

The first two rotations after an era change each guarantee at least one current-era military and civil hero. One hero may be locked for one additional rotation. Recruitment consumes a stable command ID; repeat invocation returns the stored receipt and never repeats cost. Offers, recent three rotations, pity counters, lock and random ordinal enter `HeroSystem.getState()`.

- [ ] **Step 4: Run GREEN and long simulation**

Run: `node --test test/node/tavern-protection.test.mjs test/node/strategies-era-heroes.test.mjs`

Expected: all tests PASS, including 10,000 deterministic rotations with no pity or repeat-window violation.

- [ ] **Step 5: Commit only Task 12 files**

```bash
git add -- src/systems/TavernOfferGenerator.js src/systems/HeroSystem.js src/ui/panels/tavern-heroes-panel.js test/node/tavern-protection.test.mjs test/node/strategies-era-heroes.test.mjs
git commit -m "feat: protect deterministic tavern recruitment"
```

### Task 13: Unify Quest Chains, Event Queues and Idempotent Long-Term Consequences

**Files:**
- Create: `src/systems/NarrativeChainRuntime.js`
- Create: `src/systems/ConsequenceScheduler.js`
- Create: `src/systems/NarrativeEffectCommands.js`
- Modify: `src/systems/QuestSystem.js`
- Modify: `src/systems/EventSystem.js`
- Modify: `src/systems/FactionSystem.js`
- Modify: `src/systems/HeroSystem.js`
- Modify: `src/ui/panels/quest-panel.js`
- Modify: `src/ui/panels/event-panel.js`
- Modify: `src/main.js`
- Test: `test/node/narrative-chain-runtime.test.mjs`
- Test: `test/node/delayed-consequences.test.mjs`
- Test: `test/node/integration-events-save.test.mjs`

**Interfaces:**
- Consumes: committed domain fact envelopes; `RandomService.int(key, min, maxInclusive)` with `key` `{ worldSeed, namespace, stableEntityId?, ordinal? }`; Coordinator `registerCommandHandler()`/`previewCommand()`/`executeCommand()` receipts; Task 4's registered `resource.deliver` handler; chain definitions from ConfigRegistry; canonical day/tick.
- Produces: exact effect mapping `{ set_world_flag: 'quest.set_world_flag', modify_faction_memory: 'faction.modify_memory', add_resource: 'resource.deliver', unlock_hero_legacy: 'hero.unlock_legacy' }`; registered owning-domain handlers for `quest.set_world_flag`, `faction.modify_memory` and `hero.unlock_legacy`; `QuestSystem.startChain(chainId, ownerId, commandId)`; `consumeFact(eventEnvelope)`; `chooseOption(instanceId, nodeId, optionId, commandId)`; `getChainInstances()`; `EventSystem.scheduleConsequence(input)`; `advanceDay(day)`; causal-log projection.

- [ ] **Step 1: Write failing fact, choice and delayed-effect idempotency tests**

```js
// test/node/narrative-chain-runtime.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { NarrativeChainRuntime } from '../../src/systems/NarrativeChainRuntime.js';

const chain = {
  id: 'civ_chain_rome', ownerType: 'civilization', entryNodeId: 'commission', maxStarts: 1,
  nodes: [
    { id: 'commission', kind: 'event', options: [{ id: 'accept', effects: [], transitionTo: 'roads' }] },
    { id: 'roads', kind: 'objective', objectives: [{ id: 'build_two', factType: 'road_completed', target: 2 }], transitionTo: 'choice' },
    { id: 'choice', kind: 'event', options: [{ id: 'public', effects: [{ type: 'set_world_flag', flagId: 'rome_public_roads' }], transitionTo: 'echo' }] },
    { id: 'echo', kind: 'timer', delayDaysMin: 20, delayDaysMax: 20, effects: [{ type: 'modify_faction_memory', key: 'roman_roads', amount: 1 }] }
  ]
};

test('fact IDs and option commands apply progress and effects once', () => {
  const commands = [];
  const coordinator = {
    previewCommand: () => ({ ok: true }),
    executeCommand: command => { commands.push(command); return { ok: true, event: { eventId: `event:${command.commandId}` }, receipt: { commandId: command.commandId } }; }
  };
  const runtime = new NarrativeChainRuntime({ definitions: [chain], worldSeed: 'narrative-test', random: { int: () => 20 }, coordinator });
  const started = runtime.startChain('civ_chain_rome', 'rome', 'cmd:start:1', 5);
  runtime.chooseOption(started.instanceId, 'commission', 'accept', 'cmd:choose:1', 5);
  const fact = { eventId: 'road:1', type: 'road_completed', schemaVersion: 1, day: 6, tick: 1, actorId: 'player', targetId: null, correlationId: 'build:1', payload: {} };
  runtime.consumeFact(fact);
  runtime.consumeFact(fact);
  assert.equal(runtime.getInstance(started.instanceId).objectiveProgress.build_two, 1);
  runtime.consumeFact({ ...fact, eventId: 'road:2', correlationId: 'build:2' });
  runtime.chooseOption(started.instanceId, 'choice', 'public', 'cmd:choose:2', 7);
  runtime.chooseOption(started.instanceId, 'choice', 'public', 'cmd:choose:2', 7);
  assert.equal(commands.filter(c => c.type === 'quest.set_world_flag').length, 1);
  assert.equal(commands[0].day, 7);
  assert.equal(commands[0].tick, 0);
});
```

```js
// test/node/delayed-consequences.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { ConsequenceScheduler } from '../../src/systems/ConsequenceScheduler.js';

test('a saved due day is not rerolled and fires once after repeated reloads', () => {
  const fired = [];
  const create = state => new ConsequenceScheduler({
    worldSeed: 'narrative-test',
    random: { int: () => { throw new Error('due day must not reroll during restore'); } },
    coordinator: {
      previewCommand: () => ({ ok: true }),
      executeCommand: command => { fired.push(command); return { ok: true, event: { eventId: `event:${command.commandId}` } }; }
    },
    state
  });
  const initial = new ConsequenceScheduler({
    worldSeed: 'narrative-test',
    random: { int: (key, min, maxInclusive) => {
      assert.deepEqual(key, { worldSeed: 'narrative-test', namespace: 'narrative.delay', stableEntityId: 'chain:1/echo', ordinal: 0 });
      assert.deepEqual([min, maxInclusive], [10, 40]);
      return 30;
    } },
    coordinator: {
      previewCommand: () => ({ ok: true }),
      executeCommand: command => { fired.push(command); return { ok: true, event: { eventId: `event:${command.commandId}` } }; }
    }
  });
  initial.schedule({ scheduleId: 'chain:1/echo', instanceId: 'chain:1', nodeId: 'echo', createdDay: 4, delayDaysMin: 10, delayDaysMax: 40, effects: [{ type: 'modify_faction_memory', targetId: 'sea_republic', amount: 1 }] });
  assert.equal(initial.getState().pending[0].dueDay, 34);
  const restored = create(initial.getState());
  restored.advanceDay(34);
  const restoredAgain = create(restored.getState());
  restoredAgain.advanceDay(34);
  assert.equal(fired.length, 1);
});
```

- [ ] **Step 2: Run the tests to verify RED**

Run: `node --test test/node/narrative-chain-runtime.test.mjs test/node/delayed-consequences.test.mjs`

Expected: FAIL because chain runtime and consequence scheduler do not exist.

- [ ] **Step 3: Implement the chain state machine and stable effect keys**

```js
// src/systems/NarrativeEffectCommands.js
export const EFFECT_COMMAND_TYPES = Object.freeze({
  set_world_flag: 'quest.set_world_flag',
  modify_faction_memory: 'faction.modify_memory',
  add_resource: 'resource.deliver',
  unlock_hero_legacy: 'hero.unlock_legacy'
});

// src/systems/ConsequenceScheduler.js
import { EFFECT_COMMAND_TYPES } from './NarrativeEffectCommands.js';

export class ConsequenceScheduler {
  constructor({ random, coordinator, worldSeed, state } = {}) {
    this._random = random;
    this._coordinator = coordinator;
    this._worldSeed = worldSeed;
    this._pending = structuredClone(state?.pending ?? []);
    this._fired = new Set(state?.fired ?? []);
  }
  schedule(input) {
    if (this._pending.some(item => item.scheduleId === input.scheduleId) || this._fired.has(input.scheduleId)) return { ok: true, duplicate: true };
    const delay = this._random.int({ worldSeed: this._worldSeed, namespace: 'narrative.delay', stableEntityId: input.scheduleId, ordinal: 0 }, input.delayDaysMin, input.delayDaysMax);
    this._pending.push({ ...structuredClone(input), dueDay: input.createdDay + delay, status: 'pending' });
    return { ok: true, dueDay: input.createdDay + delay };
  }
  advanceDay(day) {
    for (const item of this._pending.filter(value => value.status === 'pending' && value.dueDay <= day).sort((a, b) => a.dueDay - b.dueDay || a.scheduleId.localeCompare(b.scheduleId))) {
      item.effects.forEach((effect, index) => {
        const type = EFFECT_COMMAND_TYPES[effect.type];
        if (!type) throw new Error(`unregistered_narrative_effect:${effect.type}`);
        const command = { commandId: `${item.scheduleId}/${index}`, type, actorId: 'narrative', targetId: effect.targetId ?? null, day, tick: 0, payload: { ...effect, effectKey: `${item.scheduleId}/${index}` } };
        const preview = this._coordinator.previewCommand(command);
        if (!preview.ok) return;
        this._coordinator.executeCommand(command);
      });
      item.status = 'fired';
      this._fired.add(item.scheduleId);
    }
  }
  getState() { return { pending: structuredClone(this._pending), fired: [...this._fired] }; }
}
```

```js
// src/main.js — adapters call only the matching owning domain.
const narrativeParticipants = {
  'quest.set_world_flag': {
    preview: ({ command }) => questSystem.previewSetWorldFlag(command.payload),
    commit: ({ command, prepared }) => questSystem.commitSetWorldFlag({ ...prepared, commandId: command.commandId })
  },
  'faction.modify_memory': {
    preview: ({ command }) => factionSystem.previewMemoryChange(command.payload),
    commit: ({ command, prepared }) => factionSystem.commitMemoryChange({ ...prepared, commandId: command.commandId })
  },
  'hero.unlock_legacy': {
    preview: ({ command }) => heroSystem.previewLegacyUnlock(command.payload),
    commit: ({ command, prepared }) => heroSystem.commitLegacyUnlock({ ...prepared, commandId: command.commandId })
  }
};
for (const [type, participant] of Object.entries(narrativeParticipants)) {
  coordinator.registerCommandHandler({
    type,
    preview: participant.preview,
    commit: ({ command, prepared }) => {
      const result = participant.commit({ command, prepared });
      return result.ok ? { ok: true, receipt: result.receipt } : result;
    },
    buildEvent: ({ command, receipt }) => ({ type: `${command.type}.committed`, targetId: command.targetId, payload: receipt })
  });
}
```

`NarrativeChainRuntime` supports node kinds `event`, `objective`, `timer`, `resolution`; objective combiners `all|any`; transitions by stable node ID; expiry/default choice; and instance IDs `chainId#startOrdinal`. It stores choice receipts, consumed fact IDs, objective progress and effect keys. Every effect key is `instanceId/nodeId/optionId/effectIndex`. Immediate and delayed effects both resolve through `EFFECT_COMMAND_TYPES`, submit the full `{ commandId, type, actorId, targetId, day, tick, payload }` envelope, then consume the canonical receipt; an effect type absent from the mapping is rejected before `executeCommand`. Quest, Faction, Resource and Hero handlers alone mutate their owned state. `EventSystem` owns only presentation queue and delayed scheduling. UI shows separate immediate effects, known long-term effects and unknown risk, plus `active`, `awaiting_echo` and `completed` journal sections.

- [ ] **Step 4: Run GREEN, reload and queue regression**

Run: `node --test test/node/narrative-chain-runtime.test.mjs test/node/delayed-consequences.test.mjs test/node/integration-events-save.test.mjs`

Expected: all tests PASS; duplicate option commands/facts/effect keys are harmless; a due consequence fires once after three save/restore cycles; active chains remain reachable.

- [ ] **Step 5: Commit only Task 13 files**

```bash
git add -- src/systems/NarrativeChainRuntime.js src/systems/ConsequenceScheduler.js src/systems/NarrativeEffectCommands.js src/systems/QuestSystem.js src/systems/EventSystem.js src/systems/FactionSystem.js src/systems/HeroSystem.js src/ui/panels/quest-panel.js src/ui/panels/event-panel.js src/main.js test/node/narrative-chain-runtime.test.mjs test/node/delayed-consequences.test.mjs test/node/integration-events-save.test.mjs
git commit -m "feat: add idempotent long-form narrative chains"
```

### Task 14: Generate and Audit the Exact Era, Civilization, Hero and City-State Content Quotas

**Files:**
- Create: `content-src/narrative/era-scenarios.json`
- Create: `content-src/narrative/civilization-chains.json`
- Create: `content-src/narrative/hero-chains.json`
- Create: `content-src/narrative/city-state-chains.json`
- Create: `content-src/narrative/global-crises.json`
- Create: `content-src/narrative/maritime-chains.json`
- Create: `schemas/narrative-chain.schema.json`
- Create: `scripts/generate-narrative-content.mjs`
- Modify: `scripts/sample-strategic-content.mjs`
- Create: `config/narrative/era-scenarios.json`
- Create: `config/narrative/civilization-chains.json`
- Create: `config/narrative/hero-chains.json`
- Create: `config/narrative/city-state-chains.json`
- Create: `config/narrative/global-crises.json`
- Create: `config/narrative/maritime-chains.json`
- Create: `docs/content/NARRATIVE_CATALOG.md`
- Modify: `src/core/ConfigRegistry.js`
- Test: `test/node/narrative-content-contract.test.mjs`
- Test: `test/node/narrative-content-reachability.test.mjs`

**Interfaces:**
- Consumes: 57 civilization IDs, 72 hero IDs, 24 faction IDs, canonical eras, approved effect/condition/fact-type registries.
- Produces: stable compiled chain arrays loaded by ConfigRegistry; generated catalog; `--check` byte comparison; deterministic manual review samples.

- [ ] **Step 1: Write the failing exact-quota and reachability tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = name => JSON.parse(readFileSync(new URL(`../../config/narrative/${name}.json`, import.meta.url), 'utf8'));

test('narrative catalogs meet every exact count and per-era shape', () => {
  const era = load('era-scenarios').scenarios;
  const civ = load('civilization-chains').chains;
  const hero = load('hero-chains').chains;
  const city = load('city-state-chains').chains;
  assert.equal(era.length, 84);
  assert.equal(era.flatMap(x => x.nodes).length, 119);
  assert.equal(civ.length, 57);
  assert.equal(civ.flatMap(x => x.nodes).length, 228);
  assert.equal(hero.length, 72);
  assert.equal(hero.flatMap(x => x.nodes).length, 216);
  assert.equal(city.length, 24);
  assert.equal(city.flatMap(x => x.nodes).length, 72);
  for (const eraId of ['primitive', 'ancient', 'classical', 'medieval', 'exploration', 'early_modern', 'modern']) {
    const scenarios = era.filter(x => x.eraIds.includes(eraId));
    assert.equal(scenarios.length, 12);
    assert.deepEqual(Object.fromEntries(Object.entries(Object.groupBy(scenarios, x => x.nodes.length)).map(([key, values]) => [key, values.length])), { 1: 8, 2: 3, 3: 1 });
    assert.ok(scenarios.filter(x => x.hasDelayedEcho).length >= 4);
    assert.ok(scenarios.some(x => x.tags.includes('map_mutation')));
  }
});

test('civilization and hero chains contain their required branch and echo structure', () => {
  for (const chain of load('civilization-chains').chains) {
    assert.equal(chain.nodes.length, 4);
    assert.ok(chain.nodes.some(node => (node.options ?? []).length >= 2));
    assert.ok(chain.nodes.some(node => node.kind === 'timer' && node.delayDaysMin >= 15 && node.delayDaysMax <= 30));
    assert.ok(chain.nodes.some(node => (node.effects ?? []).some(effect => effect.type !== 'add_resource')));
  }
  for (const chain of load('hero-chains').chains) {
    assert.equal(chain.nodes.length, 3);
    assert.equal(chain.entryConditions.some(condition => condition.type === 'hero_level' && condition.minLevel === 2), true);
    assert.ok(chain.nodes.some(node => node.kind === 'timer' && node.delayDaysMin >= 7 && node.delayDaysMax <= 21));
    assert.ok(chain.nodes.some(node => (node.effects ?? []).some(effect => effect.type === 'unlock_hero_legacy')));
  }
});
```

```js
// test/node/narrative-content-reachability.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNarrativeGraph } from '../../scripts/generate-narrative-content.mjs';

test('every transition resolves and every node is reachable from its entry', () => {
  const report = validateNarrativeGraph({
    id: 'chain_ok', entryNodeId: 'a',
    nodes: [
      { id: 'a', kind: 'event', options: [{ id: 'go', transitionTo: 'b', effects: [] }] },
      { id: 'b', kind: 'resolution', effects: [] }
    ]
  });
  assert.deepEqual(report, { missingReferences: [], unreachableNodeIds: [], duplicateNodeIds: [] });
});
```

- [ ] **Step 2: Run the tests to verify RED**

Run: `node --test test/node/narrative-content-contract.test.mjs test/node/narrative-content-reachability.test.mjs`

Expected: FAIL because the six authored and compiled catalogs do not exist.

- [ ] **Step 3: Author, validate and deterministically compile all content**

```js
// scripts/generate-narrative-content.mjs
export function validateNarrativeGraph(chain) {
  const ids = chain.nodes.map(node => node.id);
  const idSet = new Set(ids);
  const duplicateNodeIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const references = chain.nodes.flatMap(node => [node.transitionTo, ...(node.options ?? []).map(option => option.transitionTo)].filter(Boolean));
  const missingReferences = [...new Set(references.filter(id => !idSet.has(id)))];
  const reachable = new Set([chain.entryNodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of chain.nodes.filter(value => reachable.has(value.id))) {
      const next = [node.transitionTo, ...(node.options ?? []).map(option => option.transitionTo)].filter(Boolean);
      for (const id of next) if (!reachable.has(id)) { reachable.add(id); changed = true; }
    }
  }
  return { missingReferences, unreachableNodeIds: ids.filter(id => !reachable.has(id)), duplicateNodeIds: [...new Set(duplicateNodeIds)] };
}
```

The generator validates every owner/reference/effect/condition/fact type, sorts catalogs and nodes by stable authored order, writes two-space JSON and produces `NARRATIVE_CATALOG.md`. It must also enforce:

- 84 era scenarios with six theme pairs per era: economy/population, military/order, science/civics, diplomacy/factions, exploration/wild sites, disaster/trade.
- 57 civilization chains with one four-node chain, two endings and one 15–30 day non-resource echo per civilization.
- 72 hero chains with one three-node mission, level-2 gate, 7–21 day echo and legacy unlock per hero; at most two are active by runtime rule.
- 24 three-node city-state chains, one for each faction profile, each changing faction memory, diplomacy, trade, sovereignty or a map entity.
- 12 global crisis chains of 3–5 nodes covering famine, epidemic, war, reform, revolution and industrialization, with two authored chains per theme.
- 8 maritime chains: two exploration, two long-distance trade, two piracy and two colonization/resistance chains.
- No duplicate normalized title/description pair; every option has a stable ID and consequence hint; every delayed day range is bounded 10–40 unless the stricter civilization/hero range applies.

- [ ] **Step 4: Run GREEN, reproducibility, contract tests and manual sampling**

Run: `node scripts/generate-narrative-content.mjs --check`

Expected: `narrative: 84 era, 57 civilization, 72 hero, 24 city-state, 12 crisis, 8 maritime; graph and references valid; output is reproducible`.

Run: `node --test test/node/narrative-content-contract.test.mjs test/node/narrative-content-reachability.test.mjs`

Expected: all tests PASS.

Run: `node scripts/sample-strategic-content.mjs --kind narrative --seed review-20260803 --era-each 2 --civilizations 8 --heroes 10 --city-states 6 --crises 4`

Expected: stable sample of 42 chains. A human reviewer checks historical framing, option clarity, immediate/long-term trade-offs, map-entity relevance and absence of repeated prose; review result is recorded in the commit message body or review system, not in generated JSON.

Run: `npm.cmd test`

Expected: complete Node suite PASS with no invalid owner, era, effect, transition or resource reference.

- [ ] **Step 5: Commit only Task 14 files**

```bash
git add -- content-src/narrative/era-scenarios.json content-src/narrative/civilization-chains.json content-src/narrative/hero-chains.json content-src/narrative/city-state-chains.json content-src/narrative/global-crises.json content-src/narrative/maritime-chains.json schemas/narrative-chain.schema.json scripts/generate-narrative-content.mjs scripts/sample-strategic-content.mjs config/narrative/era-scenarios.json config/narrative/civilization-chains.json config/narrative/hero-chains.json config/narrative/city-state-chains.json config/narrative/global-crises.json config/narrative/maritime-chains.json docs/content/NARRATIVE_CATALOG.md src/core/ConfigRegistry.js test/node/narrative-content-contract.test.mjs test/node/narrative-content-reachability.test.mjs
git commit -m "feat: deliver complete strategic narrative catalogs"
```

## Plan Self-Review Result

- Spec coverage: all requested content/narrative systems map to Tasks 1–14; map generation, shared coordinator, unified armies, v9 envelope and general accessibility remain owned by their separate core plans.
- Completeness: every task has exact files, interfaces, executable RED test code, expected failure, minimum production outline, GREEN/regression commands and explicit staging commands.
- Type consistency: `factionId`/`cityStateId`, `instanceId`, `eventId`, `commandId`, `sourceId`, `targetType + targetId + slotId`, `scheduleId`, result field `reason`, path field `worldRevision`, RandomKey `{ worldSeed, namespace, stableEntityId?, ordinal? }`, `RandomService.float/int/pickWeighted`, independent `createDeterministicRng`, Army `createArmy({ ownerId, name, position, unitStacks, creationId })`/`commitOrder`/`resolveEngagement`, and the Coordinator `{ ok, reason?, event?, order?, receipt? }` shape are stable across tasks.
- Scope: content generation is separated from runtime behavior; each task ends in an independently testable and reviewable commit.
