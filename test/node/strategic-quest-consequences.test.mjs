import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { configRegistry } from '../../src/core/ConfigRegistry.js';
import { eventBus } from '../../src/core/EventBus.js';
import { store } from '../../src/core/Store.js';
import { QuestSystem } from '../../src/systems/QuestSystem.js';
import { HeroSystem } from '../../src/systems/HeroSystem.js';

const campaign = {
  chapters: [{
    id: 'frontier',
    name: '边疆抉择',
    stages: [
      { id: 'clear_sites', name: '清理荒野', event: 'wildSiteBattleResolved', count: 2, where: { victory: true } },
      {
        id: 'settle_city', name: '城邦新秩序', event: 'colonyEstablished', count: 1,
        outcomes: [
          { id: 'stewardship', name: '守护自治', effects: { colonyCompliancePerDay: 1, tradeValueMul: 1.05 } },
          { id: 'dominion', name: '强势统治', effects: { colonyIncomeMul: 1.15, colonyUnrestPerDay: 1 } }
        ]
      }
    ]
  }]
};

test('shipped strategic campaign contains four complete three-stage chapters with outcomes', () => {
  const shipped = JSON.parse(readFileSync(new URL('../../config/strategic_quests.json', import.meta.url), 'utf8'));
  assert.equal(shipped.chapters.length, 4);
  assert.equal(shipped.chapters.flatMap(chapter => chapter.stages).length, 12);
  for (const chapter of shipped.chapters) {
    assert.equal(chapter.stages.length, 3, chapter.id);
    assert.ok(chapter.stages.at(-1).outcomes.length >= 2, chapter.id);
  }
});

function createQuestSystem() {
  eventBus.clear();
  store._state = {};
  configRegistry._configs = { quests: { tutorial: [] }, strategicQuests: campaign };
  const quests = new QuestSystem();
  quests.init();
  quests.enable();
  return quests;
}

test('strategic quest chapters advance only from matching post-activation world events', () => {
  const quests = createQuestSystem();
  assert.equal(quests.getActiveQuest().id, 'clear_sites');

  eventBus.emit('wildSiteBattleResolved', { victory: false });
  assert.equal(quests.getActiveQuest().progress.current, 0);
  eventBus.emit('wildSiteBattleResolved', { victory: true });
  assert.equal(quests.getActiveQuest().progress.current, 1);
  eventBus.emit('wildSiteBattleResolved', { victory: true });
  assert.equal(quests.getActiveQuest().id, 'settle_city');

  eventBus.emit('colonyEstablished', { targetId: 'city_1' });
  assert.equal(quests.getActiveQuest().awaitingOutcome, true);
});

test('chapter outcome creates persistent cumulative world consequences', () => {
  const quests = createQuestSystem();
  eventBus.emit('wildSiteBattleResolved', { victory: true });
  eventBus.emit('wildSiteBattleResolved', { victory: true });
  eventBus.emit('colonyEstablished', { targetId: 'city_1' });

  const result = quests.chooseStrategicOutcome('stewardship');
  assert.equal(result.ok, true);
  assert.equal(quests.getActiveQuest(), null);
  assert.deepEqual(quests.getWorldConsequences(), [{
    chapterId: 'frontier', stageId: 'settle_city', outcomeId: 'stewardship',
    name: '守护自治', effects: { colonyCompliancePerDay: 1, tradeValueMul: 1.05 }
  }]);
  assert.deepEqual(store.getState('worldConsequenceModifiers'), { colonyCompliancePerDay: 1, tradeValueMul: 1.05 });

  const saved = quests.getState();
  const restored = createQuestSystem();
  restored.restoreState(saved);
  assert.deepEqual(restored.getWorldConsequences(), quests.getWorldConsequences());
  assert.deepEqual(store.getState('worldConsequenceModifiers'), { colonyCompliancePerDay: 1, tradeValueMul: 1.05 });
});

test('heroic legacy adds real assignment capacity and assignments emit quest progress', () => {
  eventBus.clear();
  store._state = { worldConsequenceModifiers: { heroAssignmentSlots: 1 } };
  configRegistry._configs = {
    eaIntegration: { heroSettings: { baseAssignmentSlots: 2 }, heroes: [{ id: 'hero_1', name: '英雄', role: 'commander' }] },
    historicalContent: { eras: [], heroes: [] }
  };
  const heroes = new HeroSystem();
  heroes._recruited.hero_1 = { heroId: 'hero_1', assignment: null };
  let assigned = null;
  eventBus.on('heroAssigned', event => { assigned = event; });

  assert.equal(heroes.getAssignmentLimit(), 3);
  assert.equal(heroes.assignHero('hero_1', { type: 'army', id: 'army_1' }).ok, true);
  assert.deepEqual(assigned, { heroId: 'hero_1', assignment: { type: 'army', id: 'army_1' } });
});
