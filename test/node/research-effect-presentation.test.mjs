import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatResearchEffectsText } from '../../src/domain/ResearchEffectPresentation.js';

test('科技与文化效果显示为中文并展开资源倍率', () => {
  const text = formatResearchEffectsText({
    productionMul: 1.05,
    resourceProductionMul: { wood: 1.1, food: 1.08 },
    diplomacyMul: 1.2,
    satisfactionBonus: 3,
  });
  assert.equal(text, '全局生产效率 ×1.05 · 木材产出 ×1.1 · 食物产出 ×1.08 · 外交收益 ×1.2 · 满意度 +3');
  assert.doesNotMatch(text, /productionMul|resourceProductionMul|diplomacyMul|satisfactionBonus|\[object Object\]/);
});

test('策划编辑器与游戏树共用 historical_content 数据并保存回原文件', () => {
  const editor = readFileSync(new URL('../../editor/planner-config.html', import.meta.url), 'utf8');
  assert.match(editor, /state\.data\.techs = state\.data\.historical_content\.techs/);
  assert.match(editor, /state\.data\.culture = state\.data\.historical_content\.civics/);
  assert.match(editor, /state\.tab === 'techs' \|\| state\.tab === 'culture'/);
  assert.match(editor, /writeFile\('historical_content'/);
  assert.match(editor, /data-field="research_effects_json"/);
  assert.match(editor, /data-field="effects_json"/);
});
