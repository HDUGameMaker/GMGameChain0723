# Civilization Buildings And Era Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Diversify all civilization unique buildings and prove a complete campaign can advance from primitive to modern without impossible tutorial or era gates.

**Architecture:** Keep the concurrently edited historical content immutable on disk. Apply a dedicated civilization-building override after historical content is loaded, and make EraSystem own idempotent, saveable milestone stars derived from actual research, civilization, building, and quest events.

**Tech Stack:** Native ES modules, JSON configuration, Node test runner, PixiJS runtime, Playwright CLI.

## Global Constraints

- Do not modify, stage, reset, or delete `config/historical_content.json`, `assets/map/generated/`, or `tmp/`.
- Use only the four-resource economy.
- Keep all building categories within `BUILDING_CATEGORIES`.
- Write a failing behavioral test before each production change.

---

### Task 1: Civilization Building Override Layer

**Files:**
- Create: `config/civilization-building-overrides.json`
- Modify: `src/core/ConfigRegistry.js`
- Test: `test/node/civilization-building-diversity.test.mjs`

**Interfaces:**
- Consumes: historical civilizations and civilization buildings keyed by `civilizationId`.
- Produces: `ConfigRegistry._applyCivilizationBuildingOverrides()` and diversified runtime building records.

- [x] Write a failing test requiring 57 overrides, all 11 categories, maximum category count 9, matching civilization IDs, valid replacements, and category-specific usable functions.
- [x] Run the test and confirm it fails because the override config is absent.
- [x] Add archetypes and 57 civilization assignments, then apply them after `_applyHistoricalContent()`.
- [x] Run the focused tests and confirm they pass without changing `historical_content.json`.

### Task 2: Reachable Era Milestones

**Files:**
- Create: `config/campaign-progression.json`
- Modify: `src/core/ConfigRegistry.js`
- Modify: `src/systems/EraSystem.js`
- Modify: `src/main.js`
- Test: `test/node/era-progression-campaign.test.mjs`
- Test: `test/node/era-civilization.test.mjs`

**Interfaces:**
- Consumes: `civilizationSelected`, `techResearched`, `cultureResearched`, and `buildingComplete` events plus current system state.
- Produces: idempotent milestone IDs, category stars, save/restore state, and `reconcileProgressionMilestones()`.

- [x] Write a failing full-era simulation showing normal milestones cannot currently satisfy advancement.
- [x] Run it and confirm the first era fails with `时代星不足`.
- [x] Implement configured awards and state reconciliation.
- [x] Wire BuildingSystem into EraSystem and restore old saves safely.
- [x] Run progression and save-boundary tests through the modern era.

### Task 3: Tutorial And Nearby Exploration

**Files:**
- Modify: `config/quests.json`
- Modify: `scripts/build-fixed-grand-map.mjs`
- Modify: `config/maps/base_map.json`
- Test: `test/node/tutorial-progression.test.mjs`
- Test: `test/node/fixed-grand-map.test.mjs`

**Interfaces:**
- Consumes: runtime building IDs and fixed-map player spawn.
- Produces: valid tutorial targets and an expedition entrance within 25 Manhattan tiles.

- [x] Write failing tests for invalid tutorial building IDs and excessive entrance distance.
- [x] Run them and confirm `hunting_hut` and distance 139 are the failures.
- [x] Replace the tutorial target with `hunting_lodge` and prioritize the nearest valid mountain cave.
- [x] Rebuild the fixed map and confirm deterministic regeneration.

### Task 4: Full Runtime Acceptance

**Files:**
- Modify: `docs/CIVILIZATION_BUILDINGS_AND_CAMPAIGN_ACCEPTANCE_2026-08-04.md`

**Interfaces:**
- Consumes: completed implementation and test results.
- Produces: final QA evidence and remaining-risk record.

- [x] Run the complete Node suite and syntax checker.
- [x] Run `npm.cmd run test:browser`.
- [x] Verify new-game runtime panels, interactions, assets, map input and console health in Chromium.
- [ ] Record final staged-diff evidence and commit only this task's files.
