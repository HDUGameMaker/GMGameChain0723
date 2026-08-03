import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sound = JSON.parse(readFileSync(new URL('../../config/sound.json', import.meta.url), 'utf8'));

test('strategic gameplay exposes categorized sound bindings for every primary action family', () => {
  const expected = new Set(['ui', 'build', 'train', 'research', 'era', 'diplomacy', 'trade', 'colony', 'wild', 'combat', 'hero', 'quest']);
  const categories = new Set(sound.eventBindings.map(binding => binding.category).filter(Boolean));
  assert.deepEqual(new Set([...expected].filter(category => categories.has(category))), expected);
  const ids = new Set(sound.sfx.map(item => item.id));
  for (const binding of sound.eventBindings.filter(item => item.category)) {
    assert.ok(ids.has(binding.sound), `${binding.category}/${binding.event}/${binding.sound}`);
  }
});

