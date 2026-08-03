# Fixed World Lean Completion Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task by task. Work inline in this repository, preserve unrelated dirty files, and verify every task before committing it.

**Goal:** Deliver one playable, fixed 384×384 RTS/SLG campaign with preplaced city-states and wild targets, simplified but complete strategic systems, visible historical content, persistent long-term consequences, and runtime-bound art, music, and sound.

**Architecture:** `config/maps/base_map.json` is the only new-game terrain artifact and identifies itself as `fixed_static/grand_map_v1`. A deterministic offline builder may reproduce that artifact, but no runtime module may generate terrain or placements. Existing systems remain the owners of armies, diplomacy, colonies, heroes, quests, audio, and saves; additions extend those owners through small serializable state shapes and shared rule executors instead of parallel subsystems.

**Tech Stack:** Browser-native ES modules, PixiJS rendering, JSON configuration, Node.js `node:test`, Playwright, Web Audio/HTMLAudio, existing v9 `SaveManager` envelope.

**Scope precedence:** This plan and `docs/superpowers/specs/2026-08-03-fixed-world-simple-combat-design.md` supersede runtime procedural-map and six-phase-combat requirements in the four earlier 2026-08-03 grand-overhaul plans. Their content quotas, save reliability, UI, art, audio, and release-quality requirements remain in force where they do not conflict.

---

## Task 1: Freeze the 384×384 Grand Map Artifact

**Files:**
- Create: `scripts/lib/FixedWorldBuilder.js`
- Create: `scripts/build-fixed-grand-map.mjs`
- Create: `config/maps/grand_map_patches.json`
- Modify: `config/maps/base_map.json`
- Modify: `src/core/ConfigRegistry.js`
- Delete: `config/world-generation.json`
- Delete: `src/world/WorldMapGenerator.js`
- Delete: `test/node/world-map-generator.test.mjs`
- Test: `test/node/fixed-grand-map.test.mjs`

**Contract:**
- Export `buildFixedWorld({ width, height, seed, patches })` only from development tooling.
- Write `mapId: "grand_map_v1"`, `source: "fixed_static"`, `gridWidth: 384`, `gridHeight: 384`, `tileSize: 60`, rectangular string-row `grid`, and a fixed `spawnManifest` into `base_map.json`; `grid` is the stable terrain interface already consumed by every runtime map system.
- Include all terrain codes `R/G/D/F/M/W/B/S`; water coverage must be 29–35%; all placement coordinates must be unique, in bounds, and domain-compatible.
- Preserve the existing `ConfigRegistry._applyConfiguredArtPaths()` additions, but remove the canceled `worldGeneration` runtime loader and getter.
- Runtime imports under `src/` must contain no reference to `FixedWorldBuilder`, `WorldMapGenerator`, or `world-generation.json`.

**Steps:**
1. Add failing tests that load the committed artifact twice and assert its identity, dimensions, terrain coverage, spawn safety, port reachability, byte-stable offline reproduction, and absence of runtime generator imports.
2. Move the useful deterministic logic from the interrupted generator into `scripts/lib/FixedWorldBuilder.js`; adapt the builder to return the existing map schema and apply explicit patches.
3. Add `build-fixed-grand-map.mjs` with fixed production seed `GM-GRAND-MAP-V1-2026` and checked-in patch manifest.
4. Generate `base_map.json` once. Do not generate it during startup, tests, or `npm run check`.
5. Run `node --test test/node/fixed-grand-map.test.mjs` and `npm run check`.
6. Commit only Task 1 paths with message `feat: freeze 384 grand campaign map`.

## Task 2: Preplace 24 City-States and 96 Wild Targets

**Files:**
- Modify: `config/world-factions.json`
- Modify: `config/maps/base_map.json`
- Modify: `src/systems/WildSiteSystem.js`
- Modify: `src/ui/panels/world-factions-panel.js`
- Modify: `src/rendering/MapRenderer.js`
- Test: `test/node/world-factions.test.mjs`
- Test: `test/node/fixed-world-runtime.test.mjs`

**Contract:**
- Exactly 24 named city-state instances and 96 named wild-site instances use fixed manifest IDs and coordinates.
- Each city-state has `domain`, `personality`, `specialty`, `initialRelation`, `militaryStrength`, `emblem`, and a single daily strategic-action profile.
- Wild sites cover at least six categories, three threat bands, land and naval domains, fixed coordinates, deterministic garrisons/rewards/refreshes, and no hostile site within 20 tiles of the player spawn.
- `WildSiteSystem` may refresh state at an existing site but must never relocate it or scan for a new coordinate.
- Map markers use real asset paths with a visible fallback marker; panels can filter city-states and wild sites.

**Steps:**
1. Replace the old count assertions with failing exact-count, ID, coordinate, territory, asset-path, and spawn-distance tests.
2. Expand configuration by generating distinct records from reviewed templates, then keep the generated JSON checked in.
3. Bind the fixed manifest into `WildSiteSystem`, `MapRenderer`, and the world-factions panel.
4. Verify two new campaigns with different `campaignSeed` values load identical coordinates but deterministic campaign behavior.
5. Run `node --test test/node/world-factions.test.mjs test/node/fixed-world-runtime.test.mjs` and `npm run check`.
6. Commit Task 2 paths with message `feat: populate fixed strategic world`.

## Task 3: Make the Large Map Playable and Fast

**Files:**
- Modify: `src/rendering/MapRenderer.js`
- Modify: `src/rendering/MapPresentation.js`
- Modify: `src/main.js`
- Modify: `src/core/SaveManager.js`
- Modify: `test/node/save-v8-migration.test.mjs`
- Test: `test/node/large-map-performance.test.mjs`
- Test: `test/browser-fixed-world.spec.js`

**Contract:**
- New games use `{ schemaVersion: 1, source: "fixed_static", mapId: "grand_map_v1" }`.
- Migrated v5–v8 games retain `{ source: "legacy_static", mapId: "base_map_v1" }`; they are not remapped to 384×384.
- Renderer creates display objects only for visible chunks plus one-chunk margin and reuses them while panning.
- The browser journey can pan from spawn to a city-state and a wild target without loading all 147,456 tiles as sprites.

**Steps:**
1. Add failing save identity, culling-object-budget, panning, and legacy migration tests.
2. Add chunk visibility projection and marker layers without duplicating the base terrain array.
3. Set the new-game world identity and retain legacy migration branches.
4. Run focused Node tests, then `npx playwright test test/browser-fixed-world.spec.js --project=chromium` and `npm run check`.
5. Commit Task 3 paths with message `feat: run the fixed grand map efficiently`.

## Task 4: Complete Map Armies and Simplified Combat

**Files:**
- Modify: `src/systems/ArmySystem.js`
- Modify: `src/systems/CombatResolver.js`
- Modify: `src/systems/CombatSystem.js`
- Modify: `src/ui/panels/army-panel.js`
- Modify: `src/rendering/MapRenderer.js`
- Modify: `test/node/army-system.test.mjs`
- Replace: `test/node/phased-combat.test.mjs`
- Test: `test/node/simple-strategic-combat.test.mjs`

**Contract:**
- All owners use one army record: `id`, `ownerId`, `position`, `units`, `heroId`, `morale`, `supply`, `order`, `revision`.
- Orders are `hold`, `move`, `attack`, `return`; paths come from the fixed map and reject invalid domains.
- `CombatResolver.preview(snapshot)` is side-effect-free and returns relative strength, known modifiers, casualty ranges, and retreat risk.
- `CombatResolver.resolve(snapshot, battleId)` performs one deterministic pass for unit counters, hero, tactic, terrain, fortification, morale, supply, and limited seeded variance.
- `CombatSystem.commit(result, expectedRevisions)` atomically writes both armies once and rejects stale/repeated commits.
- The concise report shows winner, losses, remaining morale/supply, top modifiers, and a decisive-reason sentence; it contains no fabricated phase list.

**Steps:**
1. Write failing owner-agnostic movement, preview purity, deterministic resolve, modifier, bounds, stale-revision, and idempotency tests.
2. Normalize existing armies and orders without introducing a second military currency or tactical minigame.
3. Replace phased resolution with the one-pass resolver and adapt existing callers/UI.
4. Bind army markers, attack selection, preview, resolve, and report to the map/panel.
5. Run the focused combat/army suite, `npm run check`, and the fixed-world browser combat journey.
6. Commit Task 4 paths with message `feat: complete simple strategic combat`.

## Task 5: Close Diplomacy, Trade, Wild, and City-State Colonization Loops

**Files:**
- Modify: `src/systems/DiplomacySystem.js`
- Modify: `src/systems/CommerceSystem.js`
- Modify: `src/systems/ColonySystem.js`
- Modify: `src/systems/WildSiteSystem.js`
- Modify: `src/ui/panels/world-factions-panel.js`
- Modify: `src/ui/panels/commerce-panel.js`
- Test: `test/node/integrated-diplomacy.test.mjs`
- Test: `test/node/commerce-system.test.mjs`
- Test: `test/node/city-state-colonies.test.mjs`
- Test: `test/node/wild-site-lifecycle.test.mjs`

**Contract:**
- Each city-state takes no more than one major action per settlement day.
- Diplomacy supports relation, war/peace, open borders, trade pact, non-aggression pact, and alliance with duration/breach effects.
- Trade uses fixed-map paths, capacity, duration, a single risk roll, and four existing primary resources.
- A new colony target must be one of the 24 real city-state IDs. Founding requires reachability plus treaty/conquest eligibility and produces persistent `compliance`, `unrest`, `policy`, and `income`; only migrated records may use `legacyOffmap`.
- Clearing a wild site grants its configured reward and updates its fixed lifecycle state; refresh never changes the instance coordinate.

**Steps:**
1. Add failing end-to-end tests for one daily AI action, treaty expiry/breach, route settlement, eligible/ineligible colony targets, colony unrest, wild clearing, and fixed refresh.
2. Extend the existing systems with the minimum serializable fields and reuse their event bus/save hooks.
3. Expose actions and status in the existing world-factions and commerce panels.
4. Run all focused tests and `npm run check`.
5. Commit Task 5 paths with message `feat: close world interaction loops`.

## Task 6: Complete Era, Civilization, and Hero Progression

**Files:**
- Modify: `config/historical-content.json`
- Modify: `src/systems/EraSystem.js`
- Modify: `src/systems/HeroSystem.js`
- Modify: `src/ui/panels/era-civilization-panel.js`
- Modify: `src/ui/panels/tavern-heroes-panel.js`
- Modify: `src/core/ConfigRegistry.js`
- Modify: `test/node/era-civilization.test.mjs`
- Modify: `test/node/hero-classes-roster.test.mjs`
- Test: `test/node/hero-progression.test.mjs`

**Contract:**
- Preserve the approved seven-era progression, 57 playable civilization profiles, and 72 named hero profiles.
- Every civilization has a real emblem, era, passive, unit/building identity, and a shared validated effect schema.
- Every hero has a portrait, class, level/experience, appointment, two skills, two relationship tags, and at least one possible combination; one shared executor applies all skill/appointment/combination effects.
- Hero assignment affects at least combat, settlement production, diplomacy, or exploration through explicit modifiers and survives save/restore.

**Steps:**
1. Add failing exact-quota, asset, effect-schema, progression, relationship, appointment, and persistence tests.
2. Complete missing profile fields through the existing content catalog generator, keeping the final JSON checked in.
3. Implement the small shared hero effect executor and wire visible effects into existing systems/panels.
4. Run the era/hero/content suites and `npm run check`.
5. Commit Task 6 paths with message `feat: complete civilization and hero progression`.

## Task 7: Complete Quest Chains and Long-Term Consequences

**Files:**
- Modify: `config/quests.json`
- Modify: `config/events/events_historical.json`
- Modify: `src/systems/QuestSystem.js`
- Modify: `src/systems/EventSystem.js`
- Modify: `src/ui/panels/quest-panel.js`
- Modify: `src/ui/panels/event-panel.js`
- Test: `test/node/quest-consequences.test.mjs`
- Test: `test/node/integration-events-save.test.mjs`

**Contract:**
- Supply at least 12 multi-step chains distributed across eras; each chain has an opening condition, two or more decisions, visible immediate effects, and at least one delayed consequence 10–40 settlement days later.
- Facts reference stable city-state, wild-site, hero, region, or landmark IDs and are evaluated by one predicate/effect schema.
- `QuestSystem.enqueueConsequence({ id, dueDay, sourceId, factKey, effects })` is serializable and deduplicates by `id`.
- Consequences survive save/restore, fire once when due, write history, and can alter later quest options or one of diplomacy/colony/hero/world states.

**Steps:**
1. Add failing branch, delayed timing, deduplication, save/restore, and cross-system consequence tests.
2. Complete chain data using shared predicates/effects rather than per-quest code.
3. Add queue/history presentation and consequence previews to the existing panels.
4. Run focused quest/event tests and `npm run check`.
5. Commit Task 7 paths with message `feat: complete consequential quest chains`.

## Task 8: Bind and Validate Required Visual Art

**Files:**
- Add: `assets/hero-portraits/*.png`
- Add: `assets/unit-cards/*.png`
- Modify/Add: `assets/historical-icons/city-states/*.svg`
- Modify/Add: `assets/historical-icons/map-markers/*.svg`
- Modify: `scripts/generate-asset-manifest.js`
- Modify: `src/core/ConfigRegistry.js`
- Modify: `src/ui/panels/tavern-heroes-panel.js`
- Modify: `src/ui/panels/training-panel.js`
- Modify: `src/ui/panels/world-factions-panel.js`
- Modify: `src/rendering/MapPresentation.js`
- Test: `test/node/character-art-assets.test.mjs`
- Test: `test/node/visual-asset-binding.test.mjs`
- Test: `test/browser-visual-assets.spec.js`

**Contract:**
- Hero portraits, unit cards, civilization emblems, city-state emblems, event illustrations, and map markers resolve to real image files and render in their primary runtime views.
- Missing/corrupt images display a styled fallback without breaking the panel.
- Manifest validation decodes PNG dimensions/signatures, parses SVGs, rejects zero-byte files, verifies referenced paths, and records intended UI usage.
- Primary panels use consistent crops/aspect ratios and avoid emoji/text-only final presentation where a required image category applies.

**Steps:**
1. Inventory current assets and add failing binding/decoding tests for every required content record.
2. Keep the existing generated portraits/cards that pass quality and dimension checks; create only missing city-state/marker assets in the established historical visual style.
3. Bind paths through `ConfigRegistry` and update the four primary runtime views.
4. Generate the manifest, run Node validation, and use Playwright screenshots at desktop and narrow widths to inspect cropping, fallback behavior, and readability.
5. Commit Task 8 paths with message `feat: ship bound historical art`.

## Task 9: Bind Seven-Era Music and Complete SFX Categories

**Files:**
- Add: `assets/audio/bgm/era-*.wav`
- Add/Modify: `assets/audio/sfx/*`
- Modify: `config/sound.json`
- Add: `src/systems/EraMusic.js`
- Modify: `src/systems/AudioSystem.js`
- Modify: `src/systems/EraSystem.js`
- Test: `test/node/era-music.test.mjs`
- Test: `test/node/audio-binding.test.mjs`

**Contract:**
- Exactly seven era themes are loadable and era transitions crossfade without starting duplicate loops.
- SFX categories cover UI, build, train, research, era, diplomacy, trade, colony, wild-site, and combat start/clash/victory/defeat/retreat.
- Master/music/SFX volume and mute state are independent, clamped, persistent, and applied to active playback.
- Missing audio logs once and fails safely; user-gesture unlock remains browser-compatible.

**Steps:**
1. Add failing WAV/OGG parse, category coverage, routing, crossfade, duplicate-loop, volume, mute, and fallback tests.
2. Complete `sound.json`, integrate `EraMusic` through `AudioSystem`, and bind existing event-bus actions to categories.
3. Run focused audio tests and `npm run check`.
4. Perform a listening sample of all seven themes plus at least one SFX in each category at normalized volume.
5. Commit Task 9 paths with message `feat: ship era music and strategic sound`.

## Task 10: Finish UX, Tutorial, Accessibility, and Balance

**Files:**
- Modify: `src/ui/panels/tutorial-prompt-panel.js`
- Modify: `src/ui/panels/training-panel.js`
- Modify: `src/ui/panels/quest-panel.js`
- Modify: `src/ui/HUD.js`
- Modify: `styles.css`
- Create: `config/tutorial.json`
- Test: `test/node/tutorial-flow.test.mjs`
- Test: `test/browser-responsive-accessibility.spec.js`
- Test: `test/node/first-20-days-balance.test.mjs`

**Contract:**
- A dismissible first-20-day tutorial points to map movement, economy, training, heroes, diplomacy, a wild target, a city-state colony target, battle preview, quests, and save/restore.
- Training supports explicit batch size with one cost preview and atomic validation.
- Primary panels work at desktop and narrow widths, retain keyboard focus order, expose button names/status text, and honor `prefers-reduced-motion`.
- A deterministic 20-day simulation proves the player can train an army, clear one nearby wild target, establish one trade/diplomatic relationship, and progress a quest without deadlock.

**Steps:**
1. Add failing tutorial-state, batch-training, keyboard, narrow-layout, reduced-motion, and 20-day balance tests.
2. Reuse existing panels and CSS; add only the navigation and state needed for the critical journey.
3. Run focused tests, Playwright responsive/accessibility tests, and `npm run check`.
4. Commit Task 10 paths with message `feat: complete campaign onboarding and usability`.

## Task 11: Release Verification and Handoff

**Files:**
- Modify: `package.json`
- Modify: `scripts/verify-startup.ps1`
- Create: `scripts/validate-release-content.mjs`
- Create: `scripts/simulate-campaign.mjs`
- Modify: `test/browser-smoke.spec.js`
- Create: `test/browser-release-journey.spec.js`
- Create: `docs/RELEASE_ACCEPTANCE_2026-08-03.md`

**Contract:**
- `npm run verify` runs Node tests, syntax checks, fixed-map/content/art/audio validators, and the deterministic campaign soak.
- The soak advances 500 days, performs legal representative actions, and asserts finite values, bounded queues, stable IDs, no duplicate consequence payouts, and successful v9 round trips.
- Browser release journey shows real map textures/markers, hero portrait, unit card, city-state/wild interactions, one simplified battle, a colony target, one delayed consequence, era music routing, representative SFX, and save/restore.
- Acceptance document records exact counts, commands, results, known non-blocking limitations, and screenshot/audio sample locations. It must not label an unexecuted check as passed.

**Steps:**
1. Add release validation scripts and the full browser journey.
2. Run `npm run verify`.
3. Start the local server with `npx http-server . -p 4173 -c-1`, run `npx playwright test test/browser-release-journey.spec.js test/browser-smoke.spec.js --project=chromium`, then stop the server.
4. Run `node scripts/simulate-campaign.mjs --days 500 --seed GM-RELEASE-SOAK-2026`.
5. Inspect desktop/narrow screenshots and listen to the recorded audio sample set; record evidence in the acceptance document.
6. Review `git diff --check`, `git status --short`, and the final scoped diff. Preserve unrelated user changes and exclude scratch artifacts.
7. Commit Task 11 paths with message `test: verify fixed world release candidate`.

---

## Completion Gate

The overhaul is complete only when all eleven task contracts are implemented, `npm run verify` passes, the Chromium release journey passes, the 500-day soak passes, required image categories are visibly rendered, and the seven themes plus categorized SFX are loadable and sampled. Partial completion must be reported by named task and failing gate; elapsed time alone is never evidence of completion.
