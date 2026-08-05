import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FogOfWarState } from '../../src/world/FogOfWarState.js';

test('clear-all-fog cheat is stored as a boolean', () => {
  const initial = JSON.parse(readFileSync(new URL('../../config/initial.json', import.meta.url), 'utf8'));
  assert.equal(typeof initial.cheats.clearAllFog, 'boolean');
});

test('additional gameplay cheats are booleans and are exposed in the planner', () => {
  const initial = JSON.parse(readFileSync(new URL('../../config/initial.json', import.meta.url), 'utf8'));
  assert.equal(typeof initial.cheats.unlimitedBasicResources, 'boolean');
  assert.equal(typeof initial.cheats.extremeArmyMovementSpeed, 'boolean');
  assert.equal(typeof initial.cheats.cityStatesAttackImmediately, 'boolean');
  assert.equal(typeof initial.cheats.increaseCurrentHeroAffinityHotkey, 'boolean');
  assert.equal(typeof initial.cheats.spawnTestEnemyHotkey, 'boolean');
  assert.equal(typeof initial.cheats.spawnHestiaArmyHotkey, 'boolean');
  assert.equal(typeof initial.cheats.spawnSuperArmyHotkey, 'boolean');
  assert.equal(typeof initial.cheats.grantAllLuxuries, 'boolean');
  const editor = readFileSync(new URL('../../editor/planner-config.html', import.meta.url), 'utf8');
  assert.match(editor, /无限基础资源/);
  assert.match(editor, /极大提高军队移动速度/);
  assert.match(editor, /城邦立刻派遣敌人攻击玩家/);
  assert.match(editor, /获得所有奢侈品各1份/);
});

test('reveal-all fog mode keeps every tile visible after recalculation and save restore', () => {
  const fog = new FogOfWarState(4, 3);
  assert.equal(fog.getTileState(3, 2), 'unexplored');
  fog.setRevealAll(true);
  fog.recalculate([], 'night');
  assert.equal(fog.getTileState(3, 2), 'visible');
  fog.restoreState({ width: 4, height: 3, exploredRle: [12] });
  assert.equal(fog.getTileState(0, 0), 'visible');
});

test('every configured cheat is disabled by default', () => {
  const initial = JSON.parse(readFileSync(new URL('../../config/initial.json', import.meta.url), 'utf8'));
  for (const [id, enabled] of Object.entries(initial.cheats)) {
    assert.equal(enabled, false, `${id} should default to false`);
  }
});

test('planner editor exposes the cheat as a singleton checkbox', () => {
  const editor = readFileSync(new URL('../../editor/planner-config.html', import.meta.url), 'utf8');
  assert.match(editor, /data-tab="cheats"/);
  assert.match(editor, /按4键在大本营附近生成测试敌人/);
  assert.match(editor, /按5键在大本营附近生成赫斯提亚军团/);
  assert.match(editor, /按6键在大本营附近生成超级军团/);
  assert.match(editor, /field\('clearAllFog',[\s\S]*type: 'checkbox'/);
});
