# Reference Rock Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every visible white mining rock and procedural mountain with one reference-matched warm-gray rock asset family.

**Architecture:** Generate a 3×3 compact prop pack, split it into six mountain pillars and three mining clusters, then use a deterministic presentation model to select mountain sprites. Preserve existing fixed-map texture paths by replacing their binary assets, and preserve all gameplay rules.

**Tech Stack:** Native image generation, generate2dsprite processor, transparent PNG, PixiJS 8, Node test runner, Playwright.

## Global Constraints

- Do not modify or stage `config/historical_content.json`, `assets/map/generated/`, `tmp/`, or unrelated dirty configuration.
- Use the attached image as the material, silhouette and lighting reference.
- No generated terrain panorama may be placed on the map; only transparent single-cell props are allowed.
- Write a failing behavior test before changing runtime code.

---

### Task 1: Reference-Matched Rock Asset Pack

**Files:**
- Create: `assets/map/mountains/mountain_01.png` through `mountain_06.png`
- Create: `assets/map/mountains/stone_cluster_01.png` through `stone_cluster_03.png`
- Replace: `assets/map/rock.png`, `assets/map/rock1.png`, `assets/map/stone.png`, `assets/map/stone1.png`
- Replace: `assets/resource-nodes/stone.png`

- [x] Generate one exact 3×3 prop pack on solid magenta using the attached reference.
- [x] Process the pack with `generate2dsprite.py`, split all nine cells, remove magenta and verify alpha.
- [x] Inspect all frames and copy the six pillars and three clusters to their runtime paths.

### Task 2: Deterministic Mountain Sprite Presentation

**Files:**
- Modify: `src/rendering/MapPresentation.js`
- Modify: `src/rendering/MapRenderer.js`
- Modify: `test/node/map-presentation.test.mjs`

- [x] Add a failing test requiring only new mountain texture paths, stable coordinate selection and in-cell bounds.
- [x] Replace procedural rock shape models with `getMountainRockSpriteModel(mapConfig, col, row, tileSize)`.
- [x] Preload and draw selected PixiJS sprites; delete the polygon rock layer.
- [x] Run the focused presentation test until green.

### Task 3: Browser And Full Acceptance

**Files:**
- Modify: `test/browser-smoke.spec.js`
- Create: `docs/REFERENCE_ROCK_STYLE_ACCEPTANCE_2026-08-04.md`

- [x] Extend the mountain preview to include a visible stone resource node and assert all new textures loaded.
- [x] Run all Node tests, syntax checking and Chromium smoke.
- [x] Inspect the mountain/mining screenshot, document evidence and commit only owned files.
