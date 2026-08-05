import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getEraTrackId } from '../../src/systems/EraMusic.js';

const root = resolve(import.meta.dirname, '../..');
const sound = JSON.parse(readFileSync(resolve(root, 'config/sound.json'), 'utf8'));
const eraIds = ['primitive', 'ancient', 'classical', 'medieval', 'exploration', 'early_modern', 'modern'];

test('every era uses the same looping Dream Away score', () => {
  const tracks = sound.bgm.filter(track => track.eraId);
  assert.deepEqual(tracks.map(track => track.eraId), eraIds);
  assert.equal(new Set(tracks.map(track => track.id)).size, 7);
  assert.deepEqual(new Set(tracks.map(track => track.file)), new Set(['assets/audio/bgm/dream-away.mp3']));
  for (const eraId of eraIds) {
    const id = getEraTrackId(sound, eraId);
    const track = tracks.find(candidate => candidate.id === id);
    assert.ok(track, eraId);
    assert.equal(track.loop, true);
    const bytes = readFileSync(resolve(root, track.file));
    assert.ok(bytes.length > 500_000, `${track.file} is too short`);
    assert.equal(bytes.subarray(0, 3).toString('ascii'), 'ID3');
  }
});

test('era advancement bindings switch to the matching score', () => {
  const bindings = sound.bgmBindings.filter(binding => binding.event === 'eraAdvanced');
  assert.equal(bindings.length, 7);
  for (const eraId of eraIds) {
    assert.ok(bindings.some(binding => binding.eraIds?.includes(eraId) && binding.bgm === getEraTrackId(sound, eraId)), eraId);
  }
});

test('pause fades BGM out and resume fades it back in without restarting', () => {
  const source = readFileSync(resolve(root, 'src/systems/AudioSystem.js'), 'utf8');
  assert.match(source, /_onPause\(\)[\s\S]*?_fadeOut\(this\._currentBGM\.element, 700\)/);
  assert.match(source, /_onResume\(\)[\s\S]*?_fadeIn\(this\._currentBGM\.element, 700\)/);
  assert.match(source, /currentConfig\?\.file === bgmConfig\.file/);
});
