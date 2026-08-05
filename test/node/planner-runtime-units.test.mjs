import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const editor = readFileSync(new URL('../../editor/planner-config.html', import.meta.url), 'utf8');

test('兵种编辑器合并游戏运行时的全部兵种来源并按来源保存', () => {
  assert.match(editor, /mergeRuntimeUnits\(state\.data\.base_units, state\.data\.ea_integration, state\.data\.historical_content\)/);
  assert.match(editor, /state\.data\.ea_integration\.units = units\.filter/);
  assert.match(editor, /state\.data\.historical_content\.units = units\.filter/);
  assert.match(editor, /writeFile\('ea_integration'/);
  assert.match(editor, /writeFile\('historical_content'/);
});

test('兵种编辑器提供游戏单位使用的时代和战斗字段', () => {
  for (const field of ['eraId', 'hp', 'attack', 'attackRange', 'cp', 'speed', 'lane', 'trainingBuildingId', 'roleTags', 'strongAgainst', 'weakAgainst']) {
    assert.match(editor, new RegExp(`field\\('${field}'`));
  }
});

test('敌人模板可配置名称图标势力和完整战斗属性', () => {
  for (const key of ['name', 'icon', 'faction', 'maxHp', 'attack', 'attackRange', 'speed']) {
    assert.match(editor, new RegExp(`data-key="${key}"`));
  }
});

test('科技、人文和兵种列表按游戏时代顺序分组', () => {
  assert.match(editor, /const eraGroupedTabs = \['techs', 'culture', 'units'\]/);
  assert.match(editor, /state\.data\.historical_content\?\.eras/);
  assert.match(editor, /eraOrder\.get\(a\.eraId\)/);
  assert.match(editor, /无时代限制/);
});
