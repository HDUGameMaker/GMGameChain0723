import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('main HUD removes World and gates Luxury behind inventory', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const hud = readFileSync(new URL('../../src/ui/HUD.js', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /id="btn-world"/);
  assert.match(hud, /Object\.values\(inventory\)\.some/);
  assert.match(hud, /eventBus\.on\('luxuryChanged'/);
});
