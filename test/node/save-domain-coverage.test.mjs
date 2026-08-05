import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');

test('save snapshot covers every mutable gameplay domain', () => {
  for (const key of [
    'world', 'time', 'population', 'resources', 'resourceNodes', 'fogOfWar', 'items', 'buildings',
    'expedition', 'events', 'dailySettlement', 'torches', 'tech', 'culture', 'combat', 'quest',
    'weather', 'invasion', 'colony', 'territory', 'enemyExpansion', 'buildingTech', 'diplomacy',
    'heroes', 'era', 'luxuries', 'audio', 'camera', 'armyState', 'wildSites', 'ruins', 'blackMist',
    'economicOrders', 'commerce', 'eraMusic', 'doctrineResearched', 'doctrineResearchLevels',
    'inspiration', 'removedEventMarkers'
  ]) assert.match(source, new RegExp(`\\b${key}(?:\\s*:|\\s*,)`), `missing save domain: ${key}`);
});

test('autosave covers initial play, settlement completion, periodic play and backgrounding', () => {
  assert.match(source, /saveGame\('initial'\)/);
  assert.match(source, /saveGame\('daily_settlement'\)/);
  assert.match(source, /saveGame\('periodic'\)/);
  assert.match(source, /saveGame\('background'\)/);
  assert.match(source, /saveGame\('pagehide'\)/);
});

test('era restores before hero affinity so era caps do not truncate saved affinity', () => {
  const eraRestore = source.indexOf('this.systems.era.restoreState');
  const heroRestore = source.indexOf('this.systems.hero.restoreState');
  assert.ok(eraRestore >= 0 && heroRestore >= 0);
  assert.ok(eraRestore < heroRestore);
});

test('save snapshot cleanup removes sparse and undefined array entries', () => {
  assert.match(source, /Array\.from\(value\)[\s\S]*?\.filter\(item => item !== undefined\)/);
});
