const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
const files = [
  'config/initial.json', 'config/items.json', 'config/events/events_base.json',
  'config/techs.json', 'config/alchemy.json', 'config/colonies.json'
];
const mapping = {
  plank: 'wood', fur: 'food', water_pure: 'food',
  hematite: 'stone', coal: 'stone', brick: 'stone', iron_ore: 'stone',
  iron_ingot: 'gold', steel: 'gold', machine_part: 'gold', electronic_part: 'gold',
  gear: 'gold', essence_oil: 'gold', spirit_distilled: 'gold'
};

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = key === 'resourceId' && mapping[child] ? mapping[child] : normalize(child);
  }
  return result;
}

for (const file of files) {
  const path = resolve(root, file);
  const data = JSON.parse(readFileSync(path, 'utf8'));
  writeFileSync(path, `${JSON.stringify(normalize(data), null, 2)}\n`, 'utf8');
}

console.log(`Normalized ${files.length} active config files to four resources.`);
