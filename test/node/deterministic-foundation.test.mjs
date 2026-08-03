import test from 'node:test';
import assert from 'node:assert/strict';
import { RandomService, createDeterministicRng, hashSeedParts } from '../../src/core/RandomService.js';
import { createDomainEvent } from '../../src/core/DomainEvent.js';

test('keyed random streams replay exactly and remain namespace isolated', () => {
  const key = { worldSeed: '闀挎渤-2026', namespace: 'world.elevation', stableEntityId: 'chunk:4,7', ordinal: 3 };
  const first = createDeterministicRng(key);
  const second = createDeterministicRng(key);
  const a = Array.from({ length: 8 }, () => first.nextInt(0, 1_000_000));
  const b = Array.from({ length: 8 }, () => second.nextInt(0, 1_000_000));
  assert.deepEqual(a, b);
  assert.notDeepEqual(
    a,
    Array.from({ length: 8 }, () => createDeterministicRng({ ...key, namespace: 'world.rainfall' }).nextInt(0, 1_000_000))
  );
  assert.equal(hashSeedParts(['a', 1, 'bc']), hashSeedParts(['a', 1, 'bc']));
});

test('keyed helpers give content systems stable scalar and weighted choices', () => {
  const key = { worldSeed: 'content-seed', namespace: 'quest.reward', stableEntityId: 'quest_17', ordinal: 2 };
  assert.equal(RandomService.float(key), RandomService.float(key));
  assert.equal(RandomService.int(key, 4, 11), RandomService.int(key, 4, 11));
  assert.equal(
    RandomService.pickWeighted(key, [{ value: 'food', weight: 3 }, { value: 'gold', weight: 1 }]),
    RandomService.pickWeighted(key, [{ value: 'food', weight: 3 }, { value: 'gold', weight: 1 }])
  );
  assert.notEqual(RandomService.float(key), RandomService.float({ ...key, ordinal: 3 }));
});

test('random state can be persisted without calling Math.random', () => {
  const original = Math.random;
  Math.random = () => { throw new Error('direct Math.random is forbidden'); };
  try {
    const rng = createDeterministicRng({ worldSeed: 'save-seed', namespace: 'combat', stableEntityId: 'battle_4' });
    rng.nextFloat();
    const state = rng.getState();
    const expected = rng.nextFloat();
    const restored = createDeterministicRng({ worldSeed: 'save-seed', namespace: 'combat', stableEntityId: 'battle_4', state });
    assert.equal(restored.nextFloat(), expected);
  } finally {
    Math.random = original;
  }
});

test('domain events use coordinator sequence and preserve the approved envelope', () => {
  assert.deepEqual(createDomainEvent({
    sequence: 7,
    type: 'army.orderAccepted',
    day: 12,
    tick: 4,
    actorId: 'player',
    targetId: 'army_3',
    correlationId: 'cmd_move_9',
    payload: { orderType: 'move' }
  }), {
    eventId: 'evt_000000000007',
    type: 'army.orderAccepted',
    schemaVersion: 1,
    day: 12,
    tick: 4,
    actorId: 'player',
    targetId: 'army_3',
    correlationId: 'cmd_move_9',
    payload: { orderType: 'move' }
  });
});
