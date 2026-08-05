import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('../config/historical_content.json', import.meta.url);
const content = JSON.parse(await readFile(path, 'utf8'));
const limits = { academy: 2, library: 2, monument: 2, civic_hall: 2, council_hall: 1 };

for (const building of content.buildings || []) {
  if (Object.hasOwn(limits, building.id)) {
    building.maxCount = limits[building.id];
    building.description = `${String(building.description || '').replace(/（全局最多建造\d+座）/g, '').trim()}（全局最多建造${limits[building.id]}座）`;
  }
}

for (const node of [...(content.techs || []), ...(content.civics || [])]) {
  if (node.ruinEconomyBalanced === true) continue;
  if (Number.isFinite(node.pointCost)) node.pointCost = Math.max(1, Math.round(node.pointCost * 1.75));
  if (Array.isArray(node.cost)) {
    node.cost = node.cost.map(cost => ({ ...cost, amount: Math.max(1, Math.round((Number(cost.amount) || 0) * 1.3)) }));
  }
  node.ruinEconomyBalanced = true;
}

await writeFile(path, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
console.log('Limited research buildings and increased technology/civic costs for the ruin economy.');
