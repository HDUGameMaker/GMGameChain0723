# Reference Rock Composition Implementation Plan

**Goal:** Compose every mountain and mining-rock area from a yellow dirt foundation, overlapping warm-gray rock pillars, and small rubble fillers.

**Architecture:** Use six transparent pillar assets and three transparent cluster assets. The presentation model provides the shared dirt color, cross-cell pillar bounds and shared-edge rubble models; PixiJS renders rubble before pillars. Gameplay rules and fixed-map texture paths remain unchanged.

## Constraints

- Do not modify or stage `config/historical_content.json`, `assets/map/generated/`, `tmp/`, or unrelated dirty configuration.
- Use the attached image as the material, silhouette and lighting reference.
- Do not place a generated terrain panorama on the map; compose transparent props at runtime.
- Write a failing behavior test before changing runtime behavior.

## Completed tasks

- [x] Generate and split six mountain pillars and three low stone clusters.
- [x] Preserve the four fixed-map rock texture paths and the stone resource-node path.
- [x] Add failing tests for stable texture selection, yellow dirt, cross-cell pillar overlap and shared-edge rubble.
- [x] Replace the gray mountain and exposed-rock foundations with forest-root yellow dirt `#C9AD7C`.
- [x] Increase pillar coverage so adjacent props form one stacked mass.
- [x] Add deterministic right/bottom rubble fillers across shared mountain edges.
- [x] Render rubble below pillars and use row order for 2.5D overlap.
- [x] Put forests, mountain pillars and rubble into one foot-row depth order so foreground trees cover background rocks.
- [x] Replace the stone resource node's gray badge with a yellow dirt patch.
- [x] Extend browser acceptance to assert both pillar and rubble layers.
- [x] Inspect `test-results/qa-mountain-rock-piles.png` and run full regression checks.
