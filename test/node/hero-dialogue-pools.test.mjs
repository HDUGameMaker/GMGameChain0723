import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { store } from '../../src/core/Store.js';
import { HeroSystem } from '../../src/systems/HeroSystem.js';

const root = resolve(import.meta.dirname, '../..');
const historicalContent = JSON.parse(readFileSync(resolve(root, 'config/historical_content.json'), 'utf8'));
const eaIntegration = JSON.parse(readFileSync(resolve(root, 'config/ea_integration.json'), 'utf8'));

function setup() {
  configRegistry._configs = { historicalContent, eaIntegration };
  store.setState({ timeDay: 2 });
  const system = new HeroSystem();
  system.setSystems({ era: { getCurrentEra: () => historicalContent.eras.at(-1) } });
  system.initNew();
  system.completeHestiaArrival();
  return system;
}

test('Hestia cannot be assigned or interacted with before her arrival event', () => {
  configRegistry._configs = { historicalContent, eaIntegration };
  const system = new HeroSystem();
  system.initNew();
  assert.equal(system.getRecruitedHeroes().some(hero => hero.id === 'Hestia'), false);
  assert.equal(system.beginDialogue('Hestia', 1).ok, false);
});

test('Hestia contains ten base dailies, two per level, and ten specials', () => {
  const hero = historicalContent.heroes.find(entry => entry.id === 'Hestia');
  assert.equal(hero.dialogueDocument.daily.length, 10);
  assert.ok(hero.dialogueDocument.daily.every(conversation => conversation.nodes.some(node => node.choices?.length === 2)));
  for (let level = 1; level <= 10; level += 1) {
    assert.equal(hero.dialogueDocument.affinityDaily[level].length, 2, `level ${level} daily`);
    assert.ok(hero.dialogueDocument.affinitySpecial[level], `level ${level} special`);
  }
  assert.equal(hero.dialogueDocument.affinitySpecial[10].id, 'hestia_special_level_10_trust');
  const all = [
    ...hero.dialogueDocument.daily,
    ...Object.values(hero.dialogueDocument.affinityDaily).flat(),
    ...Object.values(hero.dialogueDocument.affinitySpecial)
  ];
  const optionPairs = all.map(conversation => conversation.nodes.find(node => node.choices?.length === 2)?.choices.map(choice => choice.text).join('|'));
  assert.equal(new Set(optionPairs).size, all.length, 'every conversation needs context-specific options');
});

test('daily dialogue grants fixed affinity once per day and queues special dialogue by level', () => {
  const heroes = setup();
  const first = heroes.beginDialogue('Hestia', 2);
  assert.equal(first.kind, 'daily');
  assert.equal(heroes.completeDialogue('Hestia', first, 2).affinity, 30);
  assert.equal(heroes.beginDialogue('Hestia', 2).ok, false);
  heroes.adjustAffinity('Hestia', 970);
  for (let level = 1; level <= 10; level += 1) {
    const special = heroes.beginDialogue('Hestia', 2);
    assert.equal(special.kind, 'special');
    assert.equal(special.level, level);
    assert.equal(heroes.completeDialogue('Hestia', special, 2).affinity, 0);
  }
  assert.equal(heroes.beginDialogue('Hestia', 2).ok, false, 'special does not reset the consumed daily conversation');
});

test('level-exclusive daily conversations are exhausted before the base pool', () => {
  const heroes = setup();
  const hero = heroes.getHero('Hestia');
  hero.dialogueDocument.affinityDaily = { 0: [
    { id: 'exclusive_a', start: 'a', nodes: [{ id: 'a', text: 'a', end: true }] },
    { id: 'exclusive_b', start: 'b', nodes: [{ id: 'b', text: 'b', end: true }] }
  ] };
  const originalGetHero = heroes.getHero.bind(heroes);
  heroes.getHero = id => id === 'Hestia' ? hero : originalGetHero(id);
  const first = heroes.beginDialogue('Hestia', 3);
  assert.equal(first.conversation.id, 'exclusive_a');
  heroes.completeDialogue('Hestia', first, 3);
  const second = heroes.beginDialogue('Hestia', 4);
  assert.equal(second.conversation.id, 'exclusive_b');
  heroes.completeDialogue('Hestia', second, 4);
  const third = heroes.beginDialogue('Hestia', 5);
  assert.ok(hero.dialogueDocument.daily.some(item => item.id === third.conversation.id));
});
