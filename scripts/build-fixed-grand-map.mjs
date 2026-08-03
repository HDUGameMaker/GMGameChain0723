import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { buildFixedWorld } from './lib/FixedWorldBuilder.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const mapPath = resolve(projectRoot, 'config/maps/base_map.json');
const patchPath = resolve(projectRoot, 'config/maps/grand_map_patches.json');
const checking = process.argv.includes('--check');

const [committedText, patchText, worldText, integrationText] = await Promise.all([
  readFile(mapPath, 'utf8'),
  readFile(patchPath, 'utf8'),
  readFile(resolve(projectRoot, 'config/world-factions.json'), 'utf8'),
  readFile(resolve(projectRoot, 'config/ea_integration.json'), 'utf8')
]);
const template = JSON.parse(committedText);
const patches = JSON.parse(patchText);
const world = JSON.parse(worldText);
const integration = JSON.parse(integrationText);
const map = buildFixedWorld({
  width: 384,
  height: 384,
  seed: patches.productionSeed,
  patches,
  template
});
map.spawnManifest.cityStates = [...integration.outposts, ...world.cityStates].map(state => ({
  id: state.id,
  gridX: state.gridX,
  gridY: state.gridY,
  domain: state.domain
}));
map.spawnManifest.wildSites = world.wildSites.map(site => ({
  id: site.id,
  gridX: site.gridX,
  gridY: site.gridY,
  domain: site.domain,
  territoryRadius: site.territoryRadius,
  threatBand: site.threatBand
}));
const generatedText = `${JSON.stringify(map, null, 2)}\n`;

if (checking) {
  if (generatedText !== committedText.replace(/\r\n/g, '\n')) {
    console.error('grand_map_v1 differs from the reproducible offline build');
    process.exitCode = 1;
  } else {
    console.log('grand_map_v1 is reproducible');
  }
} else {
  await writeFile(mapPath, generatedText, 'utf8');
  console.log(`wrote fixed grand_map_v1 (${map.gridWidth}x${map.gridHeight})`);
}
