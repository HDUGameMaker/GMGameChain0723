import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const load = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const historical = load('config/historical_content.json');
const events = load('config/events/events_historical.json');

function filesUnder(directory) {
  return readdirSync(directory).flatMap(name => {
    const path = resolve(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

test('every visible historical content record resolves to a real SVG icon', () => {
  for (const collection of ['eras', 'civilizations', 'luxuries', 'buildings', 'techs', 'civics', 'units', 'heroes', 'strategies']) {
    for (const item of historical[collection]) {
      assert.ok(item.icon?.endsWith('.svg'), `${collection}:${item.id}`);
      assert.ok(existsSync(resolve(root, item.icon)), item.icon);
    }
  }
  for (const event of events) assert.ok(existsSync(resolve(root, event.icon)), event.icon);
});

test('legacy and expansion content also has generated icon coverage', () => {
  const expected = [
    ...load('config/techs.json').map(item => ['techs', item.id]),
    ...load('config/buildings.json').map(item => ['buildings', item.id]),
    ...load('config/enemies.json').units.map(item => ['units', item.id]),
    ...load('config/ea_integration.json').heroes.map(item => ['heroes', item.id])
  ];
  for (const [type, id] of expected) assert.ok(existsSync(resolve(root, `assets/historical-icons/${type}/${id}.svg`)), `${type}:${id}`);
});

test('icon pack is broad, valid and individually generated', () => {
  const files = filesUnder(resolve(root, 'assets/historical-icons')).filter(path => path.endsWith('.svg'));
  assert.ok(files.length >= 500, files.length);
  const contents = files.map(path => readFileSync(path, 'utf8'));
  assert.ok(contents.every(svg => svg.startsWith('<svg') && svg.includes('viewBox="0 0 64 64"')));
  assert.equal(new Set(contents).size, contents.length);
});
