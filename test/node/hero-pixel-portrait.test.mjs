import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panel = readFileSync(new URL('../../src/ui/panels/hero-social-panel.js', import.meta.url), 'utf8');

test('hero portraits retain their aspect ratio and use integer pixel-art scaling', () => {
  assert.match(panel, /image-rendering:pixelated/);
  assert.match(panel, /image-rendering:crisp-edges/);
  assert.match(panel, /availableWidth \* 0\.88/);
  assert.match(panel, /availableHeight \* 1\.55/);
  assert.match(panel, /sourceWidth \* integerScale/);
  assert.match(panel, /sourceHeight \* integerScale/);
  assert.doesNotMatch(panel, /object-fit:cover/);
});
