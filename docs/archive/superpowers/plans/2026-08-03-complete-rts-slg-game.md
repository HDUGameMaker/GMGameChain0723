# Complete RTS × SLG Game Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the existing historical-strategy Alpha as one coherent, reproducible large-world RTS × SLG: large procedural maps, map-native armies and factions, city-state colonization, deep heroes and long-form consequences, then release-grade balance, presentation, art, music, sound, saves, performance and accessibility.

**Architecture:** This file is the execution index for three detailed implementation volumes. Domain systems are the sole writers of their state; `Store`, `EventBus`, UI and rendering code consume projections. `RandomService`, `WorldMapSystem`, `ArmySystem` and `StrategicSimulationCoordinator` form the shared deterministic backbone, while save v9 wraps authoritative snapshots in an integrity-checked primary/rollback/emergency envelope.

**Tech Stack:** Native ES Modules, PixiJS v8, browser DOM/CSS, IndexedDB, Web Audio API, JSON configuration, Node `node:test`, Playwright, PowerShell/Node/Python content tooling.

## Global Constraints

- Work only in `D:\【个人内容】GameDesignProjects\GM GameChain2026\GM GameChain2026`.
- Never read or modify the sibling `GM GameChain2026 Early Assess` directory.
- Preserve every pre-existing uncommitted source, art, audio, test and documentation change.
- Keep wood, stone, food and gold as the only four main resources.
- Keep native ES Modules and PixiJS; do not add React, Vue, Angular or a bundler migration.
- Upgrade the save schema to exactly version `9`; v5, v6, v7 and v8 migrate without silent loss.
- Default generated maps are exactly `384×384`; official presets are `256×256`, `320×320` and `384×384`; custom dimensions are `192–512` in multiples of `32`.
- Generated world, AI, combat, trade risk, tavern and narrative randomness never call `Math.random()` directly.
- `WorldMapSystem`, `TerritorySystem`, `ArmySystem`, `FactionSystem`, `DiplomacySystem`, `CommerceSystem`, `WildSiteSystem`, `ColonySystem`, `EraSystem`, `HeroSystem`, `QuestSystem` and `EventSystem` each write only their owned state.
- `Store`, UI, `EventBus` listeners and renderers never mutate authoritative domain state.
- Existing 57 civilizations, 138 units, 111 runtime buildings and 72 heroes remain; integration and depth take precedence over increasing those totals.
- Authored world content is exactly 24 city-state profiles and 96 wild-site templates. Large maps may activate roughly 95–115 wild objectives, capped at 128, from deterministic density and placement rules.
- New colonies always target a generated city-state; only migrated v8 colonies may retain `legacy_offmap`.
- Hero contracts are exactly 30 notable, 24 renowned, 12 epic and 6 legendary heroes; 108 relationship edges; 36 combinations; 72 historical missions.
- Narrative contracts are exactly 84 era scenarios, 57 civilization chains, 72 hero chains and 24 city-state chains, with scheduled consequences spanning 10–40 game days where specified.
- Every production behavior change follows RED → GREEN → focused regression → commit.
- Stage only files named by the current task; never sweep unrelated dirty files into a commit.

---

## Detailed Implementation Volumes

All three volumes are mandatory parts of the same completed game. Their task numbers are qualified as `Core`, `Content` and `Release` to avoid ambiguous references.

1. [Deterministic World, Strategic Armies, and Battle Reports](./2026-08-03-complete-core-world.md) — 10 tasks covering deterministic randomness, large procedural worlds, scalable pathfinding/rendering, all-faction armies, direct map orders and sequential six-phase combat.
2. [Complete RTS × SLG Content and Narrative](./2026-08-03-complete-content-narrative.md) — 14 tasks covering 24 city-states, treaties, physical trade, city-state colonization, 96 wild targets, era goals, all 57 civilizations, 72 deep heroes and complete quest/consequence chains.
3. [Release, Presentation and Reliability](./2026-08-03-complete-release-presentation.md) — 11 tasks covering opening balance, tutorials, accessibility, art generation/optimization, map and battle presentation, seven-era BGM, complete SFX, asset lifecycle, v9 recovery, 500-day tests and release packaging.

## Locked Cross-Volume Contracts

The owning volume defines each interface once. Consumers must not add alternate facades, renamed copies or direct state writes.

### Deterministic randomness and events

```js
RandomService.float({ worldSeed, namespace, stableEntityId, ordinal });
RandomService.int({ worldSeed, namespace, stableEntityId, ordinal }, min, maxInclusive);
RandomService.pickWeighted({ worldSeed, namespace, stableEntityId, ordinal }, entries);
createDeterministicRng({ worldSeed, namespace, stableEntityId, ordinal, state? });
createDomainEvent({ sequence, type, day, tick, actorId, targetId, correlationId, payload });
```

Single decisions use keyed helpers. Stateful algorithms use a persisted deterministic stream. Event identity comes from the coordinator-owned integer sequence, never time or random UUIDs.

### World queries and paths

```js
worldMap.getMapView();
worldMap.getSpawnManifest();
worldMap.getDimensions();
worldMap.getTile(x, y);
worldMap.findPath({ start, goal, profile, context });
// => { ok, reason?, path, totalCost, worldRevision, visitedNodes }
mapRenderer.getRenderStats();
```

`WorldMapSystem` alone owns terrain, hydrology and generated placements. Consumers receive immutable snapshots or query results.

### Armies, commands and daily settlement

```js
armySystem.createArmy({ ownerId, name, position, unitStacks, creationId });
armySystem.commitOrder({ armyId, actorOwnerId, order, expectedRevision });
armySystem.resolveEngagement(attackerId, defenderId, context);

coordinator.previewCommand({ commandId, type, actorId, targetId, day, tick, payload });
coordinator.executeCommand({ commandId, type, actorId, targetId, day, tick, payload });
coordinator.registerCommandHandler({ type, preview, commit, buildEvent });
coordinator.registerDayPhase({ order, id, handler }); // handler({ day, tick, submitFact }) => void
coordinator.submitFact({ type, day, tick, actorId, targetId, correlationId, payload });
coordinator.getState();
coordinator.restoreState(state);
```

`preview({ command })` returns `{ ok, reason?, prepared? }`; `commit({ command, prepared })` returns `{ ok, reason?, receipt?, order? }`; `buildEvent({ command, prepared, receipt, order })` returns `{ type, targetId, payload }`. Player, city-state and wild defenders use the same army creation/order/engagement APIs. Territory, sovereignty, diplomacy, trade and colony changes occur through validated coordinator commands; multi-domain handlers validate every captured revision before their no-fail participant commits.

### Save v9 envelope

```js
SaveManager.migrate(raw);                   // synchronous migrated v9 payload
await SaveManager.createEnvelope(payload);  // integrity-checked primary envelope
await SaveManager.verifyEnvelope(envelope);
await SaveManager.loadRecoverable();        // { source, envelope, payload, warnings }
game.restoreFromSave(payload);
```

Every authoritative system contributes versioned `getState()`/`restoreState()` data. The envelope owns primary, rollback and emergency recovery; domain plans own their payloads and do not reintroduce removed v8 mirrors.

## Program File Ownership

| Owner | Authoritative files and responsibility |
|---|---|
| Core | `src/core/RandomService.js`, domain events, world generators, `WorldMapSystem`, navigation, `ArmySystem`, coordinator, combat resolver/reports and map command integration |
| Content | faction/diplomacy/commerce/colony/wild/era/civilization/hero/quest/event systems plus their exact authored and generated catalogs |
| Release | balance and tutorial/accessibility UI, art/audio manifests and tooling, render presentation, asset lifecycle, save envelope, soak/CI/release tooling |
| Shared runtime | `src/main.js` and existing bootstrap files are changed only by the task that owns the integration point; later consumers preserve earlier contracts |

## Dependency-Safe Execution Order

The following order is the implementation sequence, not a reduction or postponement of scope. Every listed task must be completed.

- [ ] **Core 1:** Deterministic keyed randomness and domain-event identity.
- [ ] **Release 8:** Establish the v9 envelope, rollback and recovery contract before new authoritative payloads are wired.
- [ ] **Core 2:** Procedural terrain, biome and hydrology blueprint.
- [ ] **Core 3:** Constraint placement and generated-world validation.
- [ ] **Core 4:** `WorldMapSystem` ownership, RLE state and exact restore.
- [ ] **Core 5:** 16×16 hierarchical navigation and explicit cost layers.
- [ ] **Core 8:** All-faction `ArmySystem` state and reserve ownership.
- [ ] **Content 1:** Author 24 city-state profiles and establish `FactionSystem` ownership.
- [ ] **Core 6:** Make generated world state, placed city-states and wild sites the runtime source and v9 payload.
- [ ] **Core 7:** Add chunked Pixi rendering, fog, aggregation and marker budgets.
- [ ] **Core 9:** Add strategic orders, transactional coordination and direct map commands.
- [ ] **Content 6:** Compile 96 wild-site templates and implement deterministic lifecycle using the registered universal-army command.
- [ ] **Core 10:** Resolve deterministic sequential six-phase combat and generate replayable reports.
- [ ] **Content 3:** Replace string diplomacy flags with binding treaty entities.
- [ ] **Content 2:** Add deterministic city-state goals and one-action-per-day AI using registered faction/diplomacy handlers.
- [ ] **Content 4:** Make trade routes physical, treaty-bound map entities.
- [ ] **Content 5:** Make real generated city-states the only new colony targets and transfer sovereignty atomically.
- [ ] **Content 7:** Implement seven-era mission tracks, deduplicated stars and three endings.
- [ ] **Content 8:** Route all 57 civilization rules through explicit consumers.
- [ ] **Content 9:** Add cross-tree prerequisites, joint unlocks and anti-softlock catch-up.
- [ ] **Content 10:** Consolidate 72 heroes with exact rarity, levels, growth and real appointments.
- [ ] **Content 11:** Execute hero skills, 108 relationships and 36 bounded combinations.
- [ ] **Content 12:** Make tavern rotation deterministic with locking and pity protection.
- [ ] **Content 13:** Unify quest chains, event queues and idempotent long-term consequences.
- [ ] **Content 14:** Generate and audit the exact era, civilization, hero and city-state narrative quotas.
- [ ] **Release 1:** Tune the first 20 days, validate all 138 units and support batch training.
- [ ] **Release 2:** Add tutorial director and searchable codex.
- [ ] **Release 3:** Make the complete UI responsive, keyboard accessible and reduced-motion aware.
- [ ] **Release 4:** Generate, unify, compress, atlas and visually QA runtime art assets.
- [ ] **Release 5:** Add presentation catalog, map LOD/aggregation and map/battle VFX.
- [ ] **Release 6:** Deliver seven-era BGM, complete categorized SFX, mix groups and listening QA.
- [ ] **Release 7:** Enforce reference-counted texture lifecycle and memory budgets.
- [ ] **Release 9:** Run deterministic 500-day soak, replay and performance budgets.
- [ ] **Release 10:** Complete data validators, CI gates and reproducible release artifact.
- [ ] **Release 11:** Pass the final browser release journey, including v8→v9 recovery and an ending.

## Spec Coverage Matrix

| Approved design section | Implementing tasks | Required proof |
|---|---|---|
| 1–3 Goal, completion and architecture | All tasks; Core 1, Core 9, Release 8 | ownership tests, deterministic replay and v9 round-trip |
| 4 Larger, more random maps | Core 1–7 | same-seed equality, different-seed divergence, placement/path/render budgets at 256/320/384 |
| 5 City-states and more wild objectives | Content 1, Content 2, Content 6, Core 6–7 | exact 24/96 catalogs, deterministic active density and visible map lifecycle |
| 6 Seven-era missions and endings | Content 7, Content 14, Release 11 | 7×7×3 missions, exact star gates 5/8/11/14/17/20 and three ending routes |
| 7 Strategic map armies | Core 8–9 | all owners, reserves, map selection/order, movement and persistence |
| 8 Six-stage explainable combat | Core 10, Release 5–6 | reconnaissance/ranged/charge/melee/siege/pursuit provenance, report replay and matching VFX/SFX |
| 9 Dynamic city-state AI/diplomacy | Content 1–3 | goals, budgets, one committed action/day, memory, binding treaties and breach effects |
| 10 Physical trade | Content 3–4 | map path, cargo, escort/risk/interruption/delivery and treaty linkage |
| 11 Colonize other city-states | Content 1, Content 3, Content 5 | target is a real city-state, sovereignty transfer, policy/legitimacy/compliance/resistance and v8 legacy migration |
| 12 All 57 civilizations | Content 8, Content 14 | exact manifest and tests proving every effect key has a runtime consumer |
| 13 Technology/civic interaction | Content 9 | cross-tree prerequisites, joint unlocks and deterministic catch-up without softlock |
| 14 Deeper 72-hero system | Content 10–12, Content 14 | rarity 30/24/12/6, levels 1–10, assignments, injury, skills, 108 edges, 36 combos and 72 missions |
| 15 Quest chains and long-term consequences | Content 13–14 | 84/57/72/24 chain quotas, idempotent facts, delayed queue and 10–40-day consequences |
| 16 Economy/population/training/unit balance | Release 1, Content 8–9 | viable first 20 days, 138-unit coverage, batch training and no blocked required path |
| 17 Tutorial/codex/information hierarchy | Release 2 | playable guided journey, skip/resume, event-driven steps and searchable entries |
| 18 UI/accessibility/map information | Core 7, Core 9, Release 3, Release 5 | responsive layouts, keyboard/focus, labels, contrast, reduced motion, readable map LOD |
| 19 Art, music and sound | Release 4–7 | generated/reworked assets, manifest validation, compression/atlas budgets, visual QA, seven BGM loops, all SFX categories and listening QA |
| 20 v9 save and corruption recovery | Release 8 plus every system state task | v5–v8 migration, checksum rejection, rollback/emergency recovery and exact deterministic continuation |
| 21 500-day/performance/resource lifecycle | Core 5–7, Release 7, Release 9 | path/render budgets, texture/audio leases, 500-day invariants and replay equality |
| 22 Data/balance/CI/release | Content 14, Release 10–11 | exact quota validators, full verification, browser journey and reproducible archive |
| 23 Acceptance matrix | Release 9–11 | automated evidence for every gameplay, data, UX, save, performance and presentation gate |
| 24 Constraints | All tasks | four-resource invariant, no framework migration, exact folder scope and clean task commits |

## Per-Task Working Protocol

For each of the 35 tasks:

1. Create a fresh subagent task brief containing only that task, its locked upstream contracts and current repository evidence.
2. Write the focused failing test before production implementation and record the expected failure.
3. Implement the smallest complete behavior described by the task; generated content must be reproducible from checked-in manifests and tools.
4. Run the focused test, affected regressions and `npm.cmd run check`; browser tasks also run their named Playwright specs.
5. Review twice: first against the approved design/task contract, then for code/data quality, determinism and ownership boundaries.
6. Fix every blocking review finding and rerun verification before committing only the named files.
7. Update the execution ledger with commit, test evidence, remaining dependencies and any preserved pre-existing dirty paths.

## Final Completion Gates

- [ ] All 35 task checkboxes and both review gates are complete with no waived mandatory requirement.
- [ ] `npm.cmd run verify` passes from the exact target directory.
- [ ] All named Playwright journeys pass in a repository-supported browser without modifying the sibling project.
- [ ] Same seed plus same commands reproduces world, AI, combat, narrative, save restore and ending; different seeds materially change world topology and placements.
- [ ] A new default 384×384 campaign exposes 24 city-state profiles, deterministic dense wild objectives, map-native armies and real city-state colony targets.
- [ ] Exact content audits pass for 57 civilizations, 138 units, 111 buildings, 72 heroes, 108 relationships, 36 combos, 72 hero missions, 84 era scenarios, 57 civilization chains, 72 hero chains and 24 city-state chains.
- [ ] Visual QA passes at 360/768/1280/1920 widths and DPR 1/2; no required control is inaccessible by keyboard and reduced motion is respected.
- [ ] Art paths, dimensions, compression and atlases pass their budgets; representative biomes, units, heroes, civilizations and city emblems pass human visual inspection.
- [ ] All seven era BGM tracks loop cleanly; construction, unit classes, six battle phases, research, culture, civilization, era, diplomacy, trade and colony SFX are bound and pass listening/clipping checks.
- [ ] v5, v6, v7 and v8 fixtures migrate to v9; corrupted primary falls back to rollback/emergency without silent authoritative-state loss.
- [ ] The deterministic 500-day soak and full release journey pass within documented CPU, rendering and memory budgets.
- [ ] Release archive, checksum, content audit and generated reports reproduce from checked-in source and commands.
