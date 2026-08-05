import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const hud = readFileSync(new URL('../../src/ui/HUD.js', import.meta.url), 'utf8');
const popup = readFileSync(new URL('../../src/ui/PopupManager.js', import.meta.url), 'utf8');

test('4K and high-density screens receive larger HUD and popup controls', () => {
  assert.match(hud, /innerWidth \* \(window\.devicePixelRatio \|\| 1\)/);
  assert.match(hud, /dataset\.uiDensity = density/);
  assert.match(html, /data-ui-density="high"/);
  assert.match(html, /data-ui-density="ultra"/);
  assert.match(html, /\.hud-btn-icon \{ font-size: 28px/);
  assert.match(html, /\.res-icon-wrap img \{ width: 30px; height: 30px/);
});

test('hero interaction popup keeps a readable responsive width', () => {
  assert.match(popup, /container\.dataset\.popupType = current\.type/);
  assert.match(html, /data-popup-type="hero_interaction"/);
  assert.match(html, /width: min\(94vw, 820px\)/);
  assert.match(html, /flex: 0 0 auto/);
});
