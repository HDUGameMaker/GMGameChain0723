import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sound = JSON.parse(readFileSync(new URL('../../config/sound.json', import.meta.url), 'utf8'));
const root = resolve(import.meta.dirname, '../..');

test('strategic gameplay exposes categorized sound bindings for every primary action family', () => {
  const expected = new Set(['ui', 'build', 'train', 'research', 'era', 'diplomacy', 'trade', 'colony', 'wild', 'combat', 'hero', 'quest']);
  const categories = new Set(sound.eventBindings.map(binding => binding.category).filter(Boolean));
  assert.deepEqual(new Set([...expected].filter(category => categories.has(category))), expected);
  const ids = new Set(sound.sfx.map(item => item.id));
  for (const binding of sound.eventBindings.filter(item => item.category)) {
    assert.ok(ids.has(binding.sound), `${binding.category}/${binding.event}/${binding.sound}`);
  }
});

test('primary strategic action families use distinct production-ready wave cues', () => {
  const categorySounds = new Map();
  for (const binding of sound.eventBindings.filter(candidate => candidate.category)) {
    const previous = categorySounds.get(binding.category);
    assert.ok(!previous || previous === binding.sound, `${binding.category} mixes ${previous} and ${binding.sound}`);
    categorySounds.set(binding.category, binding.sound);
  }
  const sounds = new Map(sound.sfx.map(item => [item.id, item]));
  const hashes = new Set();
  for (const soundId of categorySounds.values()) {
    const configured = sounds.get(soundId);
    const bytes = readFileSync(resolve(root, configured.file));
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', configured.file);
    assert.ok(bytes.length > 10_000, `${configured.file} is too short`);
    hashes.add(createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(hashes.size, categorySounds.size, 'primary action families must not reuse identical cues');
});
