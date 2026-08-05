import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const editor = readFileSync(new URL('../../editor/planner-config.html', import.meta.url), 'utf8');

test('planner exposes the runtime hero roster and all social configuration fields', () => {
  assert.match(editor, /data-tab="heroes"/);
  assert.match(editor, /mergeRuntimeHeroes/);
  assert.match(editor, /syncRuntimeHeroSources/);
  assert.match(editor, /field\('defaultSpawn', '开局默认生成'/);
  assert.match(editor, /field\('hero_unit_hp'/);
  assert.match(editor, /field\('hero_growth_hp'/);
  assert.match(editor, /field\('hero_special_effects_json'/);
  assert.match(editor, /field\('hero_active_skill_json'/);
  assert.match(editor, /field\('hero_dialogue_document_json'/);
});
