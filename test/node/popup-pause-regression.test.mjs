import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('opening a second popup replaces the first without adding another pause lock', () => {
  const source = readFileSync(new URL('../../src/ui/PopupManager.js', import.meta.url), 'utf8');
  const openMethod = source.match(/open\(type, data\) \{[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(openMethod, /const wasOpen = this\._isOpen/);
  assert.match(openMethod, /if \(!wasOpen\)/);
});

test('new-game objective and tutorial are opened sequentially', () => {
  const source = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /eventBus\.once\('popupClosed',[\s\S]*open\('tutorial_prompt'[\s\S]*open\('objective'/);
});
