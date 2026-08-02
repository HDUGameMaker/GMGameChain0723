import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const historical = load('config/historical_content.json');
const eventsHistorical = load('config/events/events_historical.json');
const ea = load('config/ea_integration.json');
const enemies = load('config/enemies.json');

const collections = {
  eras: historical.eras,
  civilizations: historical.civilizations,
  luxuries: historical.luxuries,
  buildings: [...historical.buildings, ...load('config/buildings.json'), ...(ea.buildings || [])],
  techs: [...historical.techs, ...load('config/techs.json')],
  civics: [...historical.civics, ...load('config/culture.json')],
  units: [...historical.units, ...(enemies.units || []), ...(ea.units || [])],
  heroes: [...historical.heroes, ...(ea.heroes || [])],
  strategies: historical.strategies,
  events: [...eventsHistorical, ...(ea.events || [])],
  outposts: ea.outposts || []
};

const palettes = [
  ['#0c1b24', '#c89b50', '#e8d8ab', '#547b68'], ['#111827', '#b78342', '#f0d7a1', '#865547'],
  ['#0b2232', '#d1a45d', '#dce7df', '#356f8c'], ['#171b26', '#c68b4a', '#ead5b5', '#695985'],
  ['#10201c', '#b99552', '#e4d5a4', '#47765f'], ['#201713', '#d0a25c', '#ecd9b7', '#8b5a3c']
];
const hash = value => [...value].reduce((n, char) => Math.imul(n ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261);

function motif(type, variant, accent, light) {
  const common = `fill="none" stroke="${light}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"`;
  const motifs = {
    eras: `<path ${common} d="M16 42h32M20 38a12 12 0 0 1 24 0M32 18v7M17 25l5 5M47 25l-5 5"/>`,
    civilizations: `<path fill="${accent}" stroke="${light}" stroke-width="2.5" d="M18 14h28v17c0 10-6 16-14 20-8-4-14-10-14-20z"/><path ${common} d="M24 28h16M32 20v21"/>`,
    luxuries: `<path fill="${accent}" stroke="${light}" stroke-width="2.5" d="M20 23l8-9h8l8 9-12 25z"/><path ${common} d="M20 23h24M28 14l4 9 4-9M32 23v25"/>`,
    buildings: `<path ${common} d="M13 47h38M17 43h30M20 24h24v19H20zM16 24l16-10 16 10M26 29v14M38 29v14"/>`,
    techs: `<circle cx="32" cy="32" r="10" fill="${accent}" stroke="${light}" stroke-width="3"/><path ${common} d="M32 13v7M32 44v7M13 32h7M44 32h7M18.5 18.5l5 5M40.5 40.5l5 5M45.5 18.5l-5 5M23.5 40.5l-5 5"/>`,
    civics: `<path ${common} d="M15 48h34M19 43h26M21 25h22M18 25l14-10 14 10M24 27v14M32 27v14M40 27v14"/><path stroke="${accent}" stroke-width="3" d="M22 48h20"/>`,
    units: variant % 3 === 0
      ? `<path ${common} d="M18 47l28-30M22 17l25 27M14 49h36"/><path fill="${accent}" stroke="${light}" stroke-width="2" d="M43 14l6 1-2 6z"/>`
      : variant % 3 === 1
        ? `<path ${common} d="M18 44c15-5 15-19 0-25M46 44c-15-5-15-19 0-25M18 31h28"/><path fill="${accent}" d="M44 27l7 4-7 4z"/>`
        : `<path ${common} d="M14 43h36M18 39l6-18h16l6 18M25 21v-7M39 21v-7M21 31h22"/>`,
    heroes: `<circle cx="32" cy="23" r="9" fill="${accent}" stroke="${light}" stroke-width="2.5"/><path fill="${accent}" stroke="${light}" stroke-width="2.5" d="M16 49c2-12 9-17 16-17s14 5 16 17z"/><path ${common} d="M24 18c4-5 12-5 16 0"/>`,
    strategies: `<path fill="${accent}" stroke="${light}" stroke-width="2.5" d="M18 15h24v32H18z"/><path ${common} d="M23 23h14M23 30h14M23 37h9M14 19h4M42 43h6"/>`,
    events: `<path fill="${accent}" stroke="${light}" stroke-width="2.5" d="M32 13l18 35H14z"/><path ${common} d="M32 24v12M32 42h.1"/>`,
    outposts: `<path ${common} d="M14 48h36M18 44V25h8v7h12v-7h8v19M18 25v-8h8v8M38 25v-8h8v8M27 44V34h10v10"/>`
  };
  return motifs[type] || motifs.events;
}

function svgFor(type, item) {
  const seed = hash(`${type}:${item.id}`);
  const [background, bronze, light, accent] = palettes[seed % palettes.length];
  const variant = seed % 7;
  const dots = Array.from({ length: 1 + variant % 4 }, (_, index) => `<circle cx="${17 + index * 10}" cy="54" r="1.4" fill="${bronze}" opacity=".75"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${item.name || item.id}">
  <title>${item.name || item.id}</title>
  <metadata>${type}:${item.id}</metadata>
  <defs><radialGradient id="bg"><stop offset="0" stop-color="${background}"/><stop offset="1" stop-color="#05090d"/></radialGradient><filter id="shadow"><feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity=".55"/></filter></defs>
  <rect x="2" y="2" width="60" height="60" rx="12" fill="url(#bg)" stroke="${bronze}" stroke-width="2"/>
  <circle cx="32" cy="31" r="25" fill="none" stroke="${bronze}" stroke-width="1" opacity=".46"/>
  <g filter="url(#shadow)">${motif(type, variant, accent, light)}</g>${dots}
  <path d="M10 9h12M42 9h12" stroke="${bronze}" stroke-width="1.5" opacity=".7"/>
</svg>\n`;
}

let count = 0;
for (const [type, items] of Object.entries(collections)) {
  const seen = new Set();
  for (const item of items || []) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    const target = resolve(root, 'assets', 'historical-icons', type, `${item.id}.svg`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, svgFor(type, item));
    count++;
  }
}
console.log(`Generated ${count} historical SVG icons.`);
