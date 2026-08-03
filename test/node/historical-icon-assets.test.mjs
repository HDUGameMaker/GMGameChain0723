import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

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

function pngAlphaExtrema(path) {
  const bytes = readFileSync(path);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${path} is not PNG`);
  let offset = 8;
  let width = 0;
  let height = 0;
  const compressed = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, `${path} must use 8-bit channels`);
      assert.equal(data[9], 6, `${path} must be RGBA`);
      assert.equal(data[12], 0, `${path} must not be interlaced`);
    } else if (type === 'IDAT') compressed.push(data);
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(compressed));
  const stride = width * 4;
  let previous = Buffer.alloc(stride);
  let cursor = 0;
  let min = 255;
  let max = 0;
  const paeth = (left, up, upperLeft) => {
    const estimate = left + up - upperLeft;
    const leftDistance = Math.abs(estimate - left);
    const upDistance = Math.abs(estimate - up);
    const diagonalDistance = Math.abs(estimate - upperLeft);
    return leftDistance <= upDistance && leftDistance <= diagonalDistance ? left : upDistance <= diagonalDistance ? up : upperLeft;
  };
  for (let row = 0; row < height; row += 1) {
    const filter = raw[cursor++];
    const current = Buffer.alloc(stride);
    for (let index = 0; index < stride; index += 1) {
      const encoded = raw[cursor++];
      const left = index >= 4 ? current[index - 4] : 0;
      const up = previous[index] || 0;
      const upperLeft = index >= 4 ? previous[index - 4] : 0;
      const predictor = filter === 1 ? left
        : filter === 2 ? up
          : filter === 3 ? Math.floor((left + up) / 2)
            : filter === 4 ? paeth(left, up, upperLeft) : 0;
      current[index] = (encoded + predictor) & 0xff;
    }
    for (let index = 3; index < stride; index += 4) {
      min = Math.min(min, current[index]);
      max = Math.max(max, current[index]);
    }
    previous = current;
  }
  return { width, height, min, max };
}

test('all twenty luxury deposits have distinct transparent PNG map markers', () => {
  assert.equal(historical.luxuries.length, 20);
  const contents = [];
  for (const luxury of historical.luxuries) {
    const path = resolve(root, `assets/resource-nodes/luxuries/${luxury.id}.png`);
    assert.ok(existsSync(path), path);
    const image = pngAlphaExtrema(path);
    assert.equal(image.width, image.height, `${luxury.id} marker must be square`);
    assert.equal(image.min, 0, `${luxury.id} marker needs transparent background pixels`);
    assert.ok(image.max >= 240, `${luxury.id} marker needs opaque subject pixels`);
    contents.push(readFileSync(path).toString('base64'));
  }
  assert.equal(new Set(contents).size, 20, 'luxury markers must not reuse one generic image');
});

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
