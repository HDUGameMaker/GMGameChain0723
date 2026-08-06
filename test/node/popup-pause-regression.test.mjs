import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('popup opens enqueue into the pending display queue instead of replacing', () => {
  const source = readFileSync(new URL('../../src/ui/PopupManager.js', import.meta.url), 'utf8');
  assert.match(source, /_pendingQueue/);
  const openMethod = source.match(/open\(type, data\) \{[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(openMethod, /_pendingQueue\.push/);
  assert.match(openMethod, /_drainQueue\(\)/);
  const drainMethod = source.match(/_drainQueue\(\) \{[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(drainMethod, /if \(this\._isOpen \|\| this\._closing\) return/);
  assert.match(drainMethod, /_pendingQueue\.shift/);
});

test('new-game objective and tutorial are opened sequentially', () => {
  const source = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /eventBus\.once\('popupClosed',[\s\S]*open\('tutorial_prompt'[\s\S]*open\('objective'/);
});
