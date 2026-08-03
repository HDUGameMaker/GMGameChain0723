# Military Logistics and Map Interaction — 2026-08-03

This delivery connects building research, worker recruitment, military logistics, direct strategic-map control, fog presentation, and existing military art into one coherent player flow. It retains save schema v9.

## Delivered scope (Tasks 1–8)

1. **Building research merge.** Legacy building-research nodes map into the authoritative technology and civics trees. Era and prerequisite gates consume those unified records while the old `buildingTech` field remains optional and readable for compatibility.
2. **Headquarters worker recruitment.** The headquarters building detail exposes population recruitment with resource and population rules enforced by the owning systems.
3. **Building-scoped training.** Compatible active training buildings expose the training panel from their detail view. Training eligibility is derived from the building's declared branches and current unlock state, and completed units enter ArmySystem reserves.
4. **Assembly and deployment.** Domain-compatible assembly buildings form armies from reserves. Deployment is atomic and searches all eight neighboring tiles while respecting terrain, fixed targets, buildings, existing armies, capacity, and command points.
5. **Collision and garrisons.** Ordinary buildings block army occupation. Fortifications declare garrison capacity and defensive, vision, supply, and morale effects; enter/leave garrison rules and upgrade/removal protection are enforced.
6. **Direct map interaction.** Player armies can be clicked to select, then sent to a reachable tile by a second click. Wild sites, city-states, enemies, and garrisons use explicit confirmation before the authoritative interaction executes. Selection is renderer-only UI state and is not persisted.
7. **Persistent fog presentation.** The opaque full-screen black overlay was removed. Unexplored and remembered areas retain lighter persistent fog treatment while the day/night visibility contract remains intact.
8. **Military art binding.** Existing unit/building assets are bound to training, assembly, army-panel, and strategic-map surfaces with presentation fallbacks and runtime-art auditing.

## Save compatibility

`SaveManager.CURRENT_VERSION` remains `9`. Every v8→v9 migration and every already-v9 normalization now invokes `migrateLegacyBuildingResearch`. The normalizer preserves `armyState.availableUnits`, army records, `movePath`, movement `order`, and `garrisonBuildingIndex`. It removes transient `selectedArmy`/`selectedArmyId` fields from both the root payload and `armyState`.

New games are not required to create `buildingTech`. If an imported v7/v8/v9 save includes `buildingTech.unlockedNodes`, recognized legacy nodes are merged idempotently into `tech.researched` and `culture.researched`, and the source field remains readable.

## Acceptance flow maintained in Playwright

The browser smoke artifact now describes this end-to-end route:

1. Open the active work-shed building detail.
2. Enter building-scoped training, verify unit art, and train one eligible unit into reserve.
3. Open the warehouse building detail, verify assembly art, enter assembly, and add the reserve unit.
4. Deploy an army, click it on the strategic map, and click a destination to issue a move order.
5. Exercise a target interaction and assert that the confirmation dialog is shown before mutation.
6. Retain the existing deterministic fog contract and resource/building art assertions.

The stale global `#btn-training` selector is no longer part of this flow.

## Verification evidence

Evidence is reported exactly; no unrun check is represented as passing.

- Latest full automated suite before Task 8: **232 tests passed**.
- Task 8 focused tests: **16/16 passed**.
- Military runtime-art audit after Task 8: **zero military findings**.
- Task 9 deadline checks: JavaScript syntax checks and `git diff --check` only (recorded in the Task 9 handoff).
- A post-Task-8 full suite was **not run under the delivery deadline**.
- A post-Task-8 browser/Playwright run was **not run under the delivery deadline**.

Accordingly, the maintained Playwright flow is acceptance code awaiting a fresh browser execution; it is not claimed here as fresh passing browser evidence.
