#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = resolve(root, 'config/historical_content.json');
const content = JSON.parse(readFileSync(configPath, 'utf8'));
let bound = 0;

for (const building of content.buildings || []) {
  const relativePath = `assets/buildings/historical-details/${building.id}.png`;
  if (!existsSync(resolve(root, relativePath))) throw new Error(`Missing generated building art: ${relativePath}`);
  building.imageDetail = relativePath;
  building.mapIcon = relativePath;
  bound += 1;
}

writeFileSync(configPath, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
console.log(`Bound ${bound} historical buildings to raster detail and map art.`);
