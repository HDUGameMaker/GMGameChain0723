# Complete Release Presentation Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

**Goal:** Complete release-grade balance, learning, accessibility, art, presentation, audio, resource lifecycle, v9 recovery, soak testing and release gates.

**Architecture:** Domain systems own state. UI, Store, EventBus listeners and MapRenderer consume projections. This plan consumes `MapRenderer.getRenderStats()` plus the core world's immutable `WorldMapSystem.getMapView()/getSpawnManifest()/getDimensions()/getTile()/findPath()` queries and benchmark artifacts; it does not reimplement random generation, map storage or pathfinding. `main.js` registers every runtime Coordinator command handler before UI, TimeSystem, GameLoop or any path can call `executeCommand()`.

**Tech Stack:** Native ES Modules, PixiJS v8, DOM/CSS, IndexedDB, Web Audio API, JSON, Node `node:test`, Playwright.

## Global Constraints

- Work only in `D:\【个人内容】GameDesignProjects\GM GameChain2026\GM GameChain2026`; never read or modify `GM GameChain2026 Early Assess`.
- Preserve uncommitted work; retain native ES Modules, PixiJS and four resources only.
- Save schema is exactly v9 and v5-v8 migrate without silent loss.
- Random world/AI/combat/trade/tavern/narrative paths never call `Math.random()`.
- Domain systems own state; Store/UI/EventBus listeners/MapRenderer never mutate domain state.
- Retain 57 civilizations, 138 units, 111 runtime buildings, 72 heroes, 24 city-state profiles and 96 wild-site templates.
- Every production behavior uses RED → GREEN → focused regression → commit; stage only current task files.

---

### Task 1: Early-20-day balance, 138-unit validation and batch training

**Files:** Create `src/balance/BalanceCatalog.js`, `src/balance/TrainingCommand.js`, `src/balance/EarlyGameScenario.js`, `config/balance/release-v1.json`, `test/node/balance-training.test.mjs`, `test/node/early-game-balance.test.mjs`; modify `src/systems/ArmySystem.js`, `src/ui/panels/training-panel.js`, `package.json`.

**Consumes:** ConfigRegistry, ResourceSystem, ArmySystem, capacity, era eligibility and the read-only `PopulationSystem.getAvailableWorkers()` qualification snapshot. **Produces:** `previewTraining(input)`, `ArmySystem.trainReserve(unitId,quantity,context)`, `runEarlyGameScenario(options)`.

- [ ] **Step 1: Write RED tests**

```js
test('max batch is atomic and military population is derived',()=>{const beforeTotal=population.getState().current;const beforeAvailable=population.getAvailableWorkers();const result=army.trainReserve('warrior',3,{resourceSystem:resources,availablePopulation:beforeAvailable});assert.equal(result.ok,true);assert.equal(population.getState().current,beforeTotal);assert.equal(population.getAvailableWorkers(),beforeAvailable-3);});
```

- [ ] **Step 2: Run RED** Run: `node --test test/node/balance-training.test.mjs test/node/early-game-balance.test.mjs`; Expected: FAIL missing modules.
- [ ] **Step 3: Implement** Add x1/x5/x10/max through the sole `trainReserve` writer; validate against the PopulationSystem availability snapshot, then atomically consume resources/add reserve/notify once. ArmySystem never reserves, increments, decrements or persists total population. PopulationSystem remains sole owner of total population and derives military assignment from ArmySystem state when calculating `getAvailableWorkers()`. Validate 138 units. Gate Day5 food, Day10 no three-day core cap, Day15 trainable unit, Day20 no soft lock/NaN/negative.
- [ ] **Step 4: GREEN** Run: `node --test test/node/balance-training.test.mjs test/node/early-game-balance.test.mjs test/node/army-system.test.mjs && npm run check`; Expected: PASS.
- [ ] **Step 5: Commit** `git add src/balance config/balance/release-v1.json test/node/balance-training.test.mjs test/node/early-game-balance.test.mjs src/systems/ArmySystem.js src/ui/panels/training-panel.js package.json; git commit -m "feat: add deterministic early-game balance and batch training"`

### Task 2: Tutorial director and searchable codex

**Files:** Create `src/systems/TutorialDirector.js`, `src/ui/CodexCatalog.js`, `src/ui/panels/codex-panel.js`, `config/tutorial/steps.json`, `test/node/tutorial-codex.test.mjs`; modify `src/systems/QuestSystem.js`, `src/ui/PopupManager.js`, `src/ui/panels/settings-panel.js`, `src/main.js`.

**Consumes:** committed events, quests/configs, reason codes and v9 profile. **Produces:** `TutorialDirector.handle(event)`, `buildCodexCatalog(configs)`, `searchCodex(entries,query,filters)`.

- [ ] **Step 1: Write RED test** `test('tutorial resumes',()=>{const d=new TutorialDirector([{id:'road',trigger:'roadBuilt'}]);d.restoreState({mode:'active',activeStepId:'road'});assert.equal(d.handle({type:'roadBuilt'}).completedStepId,'road');});`
- [ ] **Step 2: Run RED** Run: `node --test test/node/tutorial-codex.test.mjs`; Expected: FAIL missing module.
- [ ] **Step 3: Implement** Persist start/later/disable state; catalog building/unit/tech/resource/era entries, aliases every block reason, filters text/era/tag/category.
- [ ] **Step 4: GREEN** Run: `node --test test/node/tutorial-codex.test.mjs test/node/main-config-validation.test.mjs && npm run check`; Expected: PASS.
- [ ] **Step 5: Commit** `git add src/systems/TutorialDirector.js src/ui/CodexCatalog.js src/ui/panels/codex-panel.js config/tutorial/steps.json test/node/tutorial-codex.test.mjs src/systems/QuestSystem.js src/ui/PopupManager.js src/ui/panels/settings-panel.js src/main.js; git commit -m "feat: add resumable tutorial and searchable codex"`

### Task 3: Responsive and accessible UI shell

**Files:** Create `src/ui/AccessibilityController.js`, `test/browser-accessibility.spec.js`, `test/browser-responsive.spec.js`; modify `index.html`, `src/ui/PopupManager.js`, `src/ui/HUD.js`, `src/ui/panels/settings-panel.js`, `src/main.js`.

**Consumes:** popup/HUD/viewport/preferences. **Produces:** `openDialog`, `closeDialog`, `getPreferences`.

- [ ] **Step 1: Write RED test** `test('dialog restores focus',async({page})=>{await page.locator('#btn-settings').press('Enter');await expect(page.locator('#popup-overlay')).toHaveAttribute('role','dialog');});`
- [ ] **Step 2: Run RED** Run: `npx playwright test test/browser-accessibility.spec.js test/browser-responsive.spec.js`; Expected: FAIL.
- [ ] **Step 3: Implement** Remove zoom suppression; add dialog semantics/focus trap/restore, polite live region, aria labels, 44px targets, 320/360/768/1024/1280 layout, high contrast, font scale, reduced motion and DPR cap.
- [ ] **Step 4: GREEN** Run: `npx playwright test test/browser-accessibility.spec.js test/browser-responsive.spec.js test/browser-smoke.spec.js && npm run check`; Expected: PASS.
- [ ] **Step 5: Commit** `git add src/ui/AccessibilityController.js test/browser-accessibility.spec.js test/browser-responsive.spec.js index.html src/ui/PopupManager.js src/ui/HUD.js src/ui/panels/settings-panel.js src/main.js; git commit -m "feat: make game UI responsive and keyboard accessible"`

### Task 4: Art asset unification and optimization

**Files:** Create `config/art-style.json`, `scripts/build-art-atlas.mjs`, `scripts/validate-art-assets.mjs`, `test/node/art-assets.test.mjs`, `test/browser-art-qa.spec.js`; modify `assets/manifest.json`, `config/historical_content.json`, `config/world-generation.json`; create/replace `assets/biomes/*.webp`, `assets/unit-cards/*.webp`, `assets/hero-portraits/*.webp`, `assets/city-emblems/*.svg`, `assets/atlas/*`.

**Consumes:** 57 civilizations, 24 city states, 138 units, 72 heroes, core biome IDs. **Produces:** manifest art groups and `validateArtAssets()`.

- [ ] **Step 1: RED** `test('art manifest complete',async()=>{const r=await validateArtAssets();assert.deepEqual(r.missing,[]);assert.equal(r.oversize.length,0);});`
- [ ] **Step 2: Run RED** Run: `node --test test/node/art-assets.test.mjs`; Expected: FAIL.
- [ ] **Step 3: Implement** Use the imagegen skill to generate/edit source art. Produce seamless 256px biomes, civilization/city palettes/emblems, 512px cards/portraits; compress WebP (AVIF only browser-verified), atlas ≤2048²/4MiB, card≤180KiB, portrait≤220KiB, SVG≤24KiB. QA primitive/ancient/modern terrain, three civilizations/cities, infantry/naval/siege and notable/epic/legendary portraits at DPR1/2, 360/1280.
- [ ] **Step 4: GREEN** Run: `node --test test/node/art-assets.test.mjs && npx playwright test test/browser-art-qa.spec.js && node scripts/validate-art-assets.mjs`; Expected: PASS.
- [ ] **Step 5: Commit** `git add config/art-style.json scripts/build-art-atlas.mjs scripts/validate-art-assets.mjs test/node/art-assets.test.mjs test/browser-art-qa.spec.js assets/manifest.json config/historical_content.json config/world-generation.json assets/biomes assets/unit-cards assets/hero-portraits assets/city-emblems assets/atlas; git commit -m "feat: unify and optimize release art assets"`

### Task 5: PresentationCatalog, map LOD, aggregation and VFX

**Files:** Create `src/rendering/PresentationCatalog.js`, `src/rendering/EffectSystem.js`, `test/node/presentation.test.mjs`, `test/browser-presentation.spec.js`; modify `src/rendering/MapRenderer.js`, `src/main.js`.

**Consumes:** Task 4 atlas/manifest, `MapRenderer.getRenderStats()`, immutable `WorldMapSystem.getMapView()/getDimensions()/getTile()` queries, committed command/combat events. **Produces:** `PresentationCatalog.get`, `EffectSystem.play`, `EffectSystem.getActiveEffects`.

- [ ] **Step 1: RED** `test('effect state is not canvas DOM',()=>{const e=new EffectSystem({catalog:{get:()=>({frames:2})}});e.play('charge',{x:2,y:2});assert.equal(e.getActiveEffects()[0].id,'charge');});`
- [ ] **Step 2: Run RED** Run: `node --test test/node/presentation.test.mjs`; Expected: FAIL.
- [ ] **Step 3: Implement** Pixi LOD full/16×16 clusters/city-army-wild clusters; never use DOM dataset on canvas. Present march, reconnaissance, ranged, charge, melee, siege, pursuit, victory/defeat. Browser verifies `getActiveEffects()` then screenshots.
- [ ] **Step 4: GREEN** Run: `node --test test/node/presentation.test.mjs && npx playwright test test/browser-presentation.spec.js`; Expected: PASS and core render stats meet budget.
- [ ] **Step 5: Commit** `git add src/rendering/PresentationCatalog.js src/rendering/EffectSystem.js test/node/presentation.test.mjs test/browser-presentation.spec.js src/rendering/MapRenderer.js src/main.js; git commit -m "feat: add map LOD and battle presentation effects"`

### Task 6: Seven-era BGM, complete SFX mix and audio groups

**Files:** Create `config/audio-mix.json`, `scripts/validate-audio-assets.mjs`, `test/node/audio-manifest.test.mjs`, `test/browser-audio.spec.js`; modify `config/sound.json`, `src/systems/AudioSystem.js`, `src/systems/EraMusic.js`, `assets/manifest.json`; create seven `assets/audio/bgm/era-*.ogg` and `assets/audio/sfx/{ui,building,unit,battle,research,culture,civilization,era,diplomacy,trade,colony}/*`.

**Consumes:** event bindings/era IDs/gesture. **Produces:** `acquireGroup`, `releaseGroup`, `playSFX`, `setMixPreset`.

- [ ] **Step 1: RED** `test('audio complete',async()=>{const r=await validateAudioManifest();assert.equal(r.eraTracks,7);assert.deepEqual(r.missingCategories,[]);});`
- [ ] **Step 2: Run RED** Run: `node --test test/node/audio-manifest.test.mjs`; Expected: FAIL.
- [ ] **Step 3: Implement** Human-polish all seven loops: 44.1kHz Ogg/Opus, click <-60dB, BGM -16LUFS/SFX -14LUFS/peak≤-1dBTP; current BGM+UI boot≤3MiB/decoded≤12MiB, crossfade750ms. Cover construction, every unit category, six battle phases, research, culture, civilization, era, diplomacy, trade, colony; validate mapping and sample every category/listen all era transitions.
- [ ] **Step 4: GREEN** Run: `node --test test/node/audio-manifest.test.mjs && npx playwright test test/browser-audio.spec.js && node scripts/validate-audio-assets.mjs`; Expected: PASS.
- [ ] **Step 5: Commit** `git add config/audio-mix.json scripts/validate-audio-assets.mjs test/node/audio-manifest.test.mjs test/browser-audio.spec.js config/sound.json src/systems/AudioSystem.js src/systems/EraMusic.js assets/manifest.json assets/audio/bgm assets/audio/sfx; git commit -m "feat: add complete release audio mix"`

### Task 7: Texture AssetManager lifecycle

**Files:** Create `src/rendering/AssetManager.js`, `test/node/asset-manager.test.mjs`, `test/browser-asset-lifecycle.spec.js`; modify `src/rendering/MapRenderer.js`, `src/rendering/AnimatedSpriteHelper.js`, `src/ui/panels/training-panel.js`, `src/ui/panels/tavern-heroes-panel.js`, `src/main.js`.

**Consumes:** image atlas/manifest/panel cleanup. **Produces:** texture-only `acquire/release/evict/stats`; AudioSystem retains all audio-group leases.

- [ ] **Step 1: RED** `test('shared texture survives release',async()=>{const m=new AssetManager({ttlMs:1});const a=await m.acquire({key:'x',group:'p',bytes:1,loader:async()=>({destroy(){}})}),b=await m.acquire({key:'x',group:'p',bytes:1,loader:async()=>null});m.release(a);m.evict(2);assert.equal(m.stats().entries,1);m.release(b);});`
- [ ] **Step 2: Run RED** Run: `node --test test/node/asset-manager.test.mjs`; Expected: FAIL.
- [ ] **Step 3: Implement** Ref-count texture leases; destroy zero-ref LRU at 60s. GPU budgets high/medium/low 256/128/64MiB; 30 panel cycles settle ±10%; fog destroyed before resize.
- [ ] **Step 4: GREEN** Run: `node --test test/node/asset-manager.test.mjs && npx playwright test test/browser-asset-lifecycle.spec.js`; Expected: PASS.
- [ ] **Step 5: Commit** `git add src/rendering/AssetManager.js test/node/asset-manager.test.mjs test/browser-asset-lifecycle.spec.js src/rendering/MapRenderer.js src/rendering/AnimatedSpriteHelper.js src/ui/panels/training-panel.js src/ui/panels/tavern-heroes-panel.js src/main.js; git commit -m "feat: add texture asset lifecycle"`

### Task 8: v9 envelope, rollback and recovery

**Files:** Create `src/core/SaveEnvelope.js`, `src/ui/panels/save-recovery-panel.js`, `test/node/save-v9-envelope.test.mjs`, `test/browser-save-recovery.spec.js`; modify `src/core/SaveManager.js`, `src/main.js`, `src/ui/PopupManager.js`.

**Consumes:** v5-v8 fixtures/IndexedDB/emergency. **Produces:** sync `SaveManager.migrate(raw)->v9Payload`; async static `SaveManager.createEnvelope(payload)` and `SaveManager.verifyEnvelope(envelope)`; static `SaveManager.loadRecoverable()->{source,envelope,payload,warnings}` and `SaveManager.chooseRecovery(candidates)`. `src/core/SaveEnvelope.js` exports only pure hashing/canonicalization helpers delegated to by SaveManager.

- [ ] **Step 1: RED** `test('payload then envelope',async()=>{const payload=SaveManager.migrate({version:8,resources:{},buildings:[]});const primary=await SaveManager.createEnvelope(payload),rollback=await SaveManager.createEnvelope({...payload,time:{day:2}});assert.equal((await SaveManager.verifyEnvelope(primary)).ok,true);assert.equal((await SaveManager.chooseRecovery({primary,rollback,emergency:null})).source,'primary');});`
- [ ] **Step 2: Run RED** Run: `node --test test/node/save-v9-envelope.test.mjs`; Expected: FAIL.
- [ ] **Step 3: Implement** Keep `SaveEnvelope.js` pure (`canonicalizePayload`, `sha256`, `createEnvelopeRecord`, `verifyEnvelopeRecord`); expose and test only the five static SaveManager methods. SaveManager delegates to the pure helpers, writes verified primary/rollback, selects primary/rollback/emergency/import and returns warnings for limited repair. Never use a fake digest.
- [ ] **Step 4: GREEN** Run: `node --test test/node/save-v9-envelope.test.mjs test/node/save-v7-migration.test.mjs test/node/save-v8-migration.test.mjs && npx playwright test test/browser-save-recovery.spec.js`; Expected: PASS.
- [ ] **Step 5: Commit** `git add src/core/SaveEnvelope.js src/ui/panels/save-recovery-panel.js test/node/save-v9-envelope.test.mjs test/browser-save-recovery.spec.js src/core/SaveManager.js src/main.js src/ui/PopupManager.js; git commit -m "feat: add v9 save recovery"`

### Task 9: 500-day deterministic soak

**Files:** Create `src/simulation/SimulationHarness.js`, `src/simulation/StateInvariant.js`, `scripts/simulate-days.mjs`, `test/node/simulation-500-day.test.mjs`; modify `src/systems/TimeSystem.js`, `package.json`.

**Consumes:** committed daily order/RandomService/v9/world snapshot. **Produces:** `advanceDays`, `StateInvariant.validate`.

- [ ] **Step 1: RED** `test('500 days',async()=>{const h=await SimulationHarness.create({seed:'soak',profile:'default',headless:true});const r=h.advanceDays(500);assert.deepEqual(r.violations,[]);assert.ok(r.elapsedMs<10000);});`
- [ ] **Step 2: Run RED** Run: `node --test test/node/simulation-500-day.test.mjs`; Expected: FAIL.
- [ ] **Step 3: Implement** Formal headless daily order; no RAF/Pixi/audio; validate v9/checksum/numbers/resources/refs/histories. Run three profiles×10 seeds; P95<10s and Day500 save≤3×Day20.
- [ ] **Step 4: GREEN** Run: `node --test test/node/simulation-500-day.test.mjs && node scripts/simulate-days.mjs --days 500 --profile default --seeds 10`; Expected: PASS.
- [ ] **Step 5: Commit** `git add src/simulation/SimulationHarness.js src/simulation/StateInvariant.js scripts/simulate-days.mjs test/node/simulation-500-day.test.mjs src/systems/TimeSystem.js package.json; git commit -m "test: add 500 day deterministic soak"`

### Task 10: Data tools, CI and release artifact

**Files:** Create `scripts/validate-content.mjs`, `scripts/balance-report.mjs`, `scripts/release-verify.mjs`, `.github/workflows/verify.yml`, `.github/workflows/nightly-soak.yml`, `test/node/release-tools.test.mjs`; modify `package.json`, `README.md`.

**Consumes:** config/manifests/benchmarks/soak/browser tests. **Produces:** `validateContent`, balance CSV/JSON/MD and SHA-256 release manifest.

- [ ] **Step 1: RED** `test('contracts',async()=>{const r=await validateContent({root:process.cwd()});assert.deepEqual(r.errors,[]);assert.equal(r.counts.units,138);});`
- [ ] **Step 2: Run RED** Run: `node --test test/node/release-tools.test.mjs`; Expected: FAIL.
- [ ] **Step 3: Implement** PR runs npm ci/syntax/Node/config-art-audio/migration/browser; nightly world benchmarks/500-day/screenshots; release fails closed and writes hashes/results/budgets.
- [ ] **Step 4: GREEN** Run: `node --test test/node/release-tools.test.mjs && npm run validate:content && npm run balance:report && npm run release:verify`; Expected: PASS.
- [ ] **Step 5: Commit** `git add scripts/validate-content.mjs scripts/balance-report.mjs scripts/release-verify.mjs .github/workflows/verify.yml .github/workflows/nightly-soak.yml test/node/release-tools.test.mjs package.json README.md; git commit -m "ci: add release verification"`

### Task 11: Final browser release journey

**Files:** Create `test/browser-release-journey.spec.js`, `test/manual/release-checklist.md`; modify `playwright.config.js`, `package.json`.

**Consumes:** Tasks 1-10. **Produces:** complete browser path/manual hardware sign-off.

- [ ] **Step 1: RED** `test('journey',async({page})=>{await page.goto('/');await page.getByLabel('世界种子').fill('release-e2e');await page.getByText('新游戏',{exact:true}).click();await page.getByRole('button',{name:'训练 x5'}).click();await page.reload();await expect(page.locator('#hud')).toBeVisible();});`
- [ ] **Step 2: Run RED** Run: `npx playwright test test/browser-release-journey.spec.js`; Expected: FAIL before prior interfaces.
- [ ] **Step 3: Implement** Screenshot-on-failure/trace; checklist hardware/browser, generation P95, audio, 320 keyboard route, asset 30-cycle, three save sources, 500-day artifact, explicit pass/fail.
- [ ] **Step 4: GREEN** Run: `npm run release:verify && npx playwright test test/browser-release-journey.spec.js test/browser-smoke.spec.js test/browser-accessibility.spec.js test/browser-responsive.spec.js test/browser-art-qa.spec.js test/browser-presentation.spec.js test/browser-audio.spec.js test/browser-save-recovery.spec.js`; Expected: PASS zero page errors.
- [ ] **Step 5: Commit** `git add test/browser-release-journey.spec.js test/manual/release-checklist.md playwright.config.js package.json; git commit -m "test: add final release browser journey"`

## Self-review

- Eleven tasks are present; core world generation is consumed only.
- Art/imagegen and runtime Pixi presentation are independent tasks; audio covers seven eras and all required SFX categories.
- Texture AssetManager is `src/rendering/AssetManager.js`; AudioSystem owns audio leases.
- v9 uses synchronous payload migration and async envelopes with genuine rollback envelopes.
