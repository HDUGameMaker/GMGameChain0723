import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/rendering/MapRenderer.js', import.meta.url), 'utf8');

test('enemy intelligence renders above fog while unexplored details remain gated', () => {
  assert.match(source, /this\.gameView\.addChild\(this\.fogContainer\);[\s\S]*this\.gameView\.addChild\(this\.intelLayer\);/);
  assert.match(source, /this\.intelLayer\.addChild\(container\);/);
  assert.match(source, /isUnknown \? '⚠'/);
  assert.match(source, /只能确认此处存在敌对建筑，探索地格后才能查看详情/);
});

test('outpost rendering no longer references an undefined enemy model', () => {
  const drawOutposts = source.slice(source.indexOf('_drawOutposts()'), source.indexOf('_isClickOnOutpost'));
  assert.doesNotMatch(drawOutposts, /formatEnemyTokenStats\(enemy\)/);
  assert.match(drawOutposts, /state\.buildings/);
});
