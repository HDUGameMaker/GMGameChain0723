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

test('random streams reject invalid integer ranges', () => {
  const rng = createDeterministicRng({ worldSeed: 'validation', namespace: 'rng' });
  assert.throws(() => rng.nextInt(1.5, 3), RangeError);
  assert.throws(() => rng.nextInt(4, 3), RangeError);
  assert.throws(() => rng.nextInt(-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), RangeError);
});

test('random factory rejects invalid key fields and ordinals', () => {
  assert.throws(() => createDeterministicRng({ worldSeed: 7, namespace: 'rng' }), TypeError);
  assert.throws(() => createDeterministicRng({ worldSeed: 'validation', namespace: 'rng', stableEntityId: 7 }), TypeError);
  assert.throws(() => createDeterministicRng({ worldSeed: 'validation', namespace: 'rng', ordinal: -1 }), RangeError);
  assert.throws(() => createDeterministicRng({ worldSeed: 'validation', namespace: 'rng', ordinal: 1.5 }), RangeError);
  assert.throws(() => createDeterministicRng({ worldSeed: 'validation', namespace: 'rng', ordinal: Number.MAX_SAFE_INTEGER + 1 }), RangeError);
});

test('only the random factory accepts valid restoration state', () => {
  assert.throws(() => createDeterministicRng({ worldSeed: 'validation', namespace: 'rng', state: 0 }), RangeError);
  assert.throws(() => createDeterministicRng({ worldSeed: 'validation', namespace: 'rng', state: 0x1_0000_0000 }), RangeError);
  assert.throws(() => RandomService.float({ worldSeed: 'validation', namespace: 'rng', state: 123 }), TypeError);
  assert.throws(() => RandomService.int({ worldSeed: 'validation', namespace: 'rng', unexpected: true }, 0, 1), TypeError);
});

test('weighted keyed choices reject invalid entries', () => {
  assert.throws(() => RandomService.pickWeighted({ worldSeed: 'validation', namespace: 'rng' }, []), RangeError);
  assert.throws(() => RandomService.pickWeighted({ worldSeed: 'validation', namespace: 'rng' }, [{ value: 'food', weight: 0 }]), RangeError);
  assert.throws(() => RandomService.pickWeighted({ worldSeed: 'validation', namespace: 'rng' }, [{ value: 'food', weight: Infinity }]), RangeError);
});

test('stream pick and shuffle return deterministic choices without mutating inputs', () => {
  const rng = createDeterministicRng({ worldSeed: 'selection', namespace: 'stream' });
  const values = ['food', 'gold', 'wood', 'stone'];
  assert.ok(values.includes(rng.pick(values)));
  assert.throws(() => rng.pick([]), RangeError);
  const shuffled = rng.shuffle(values);
  assert.deepEqual(values, ['food', 'gold', 'wood', 'stone']);
  assert.deepEqual([...shuffled].sort(), ['food', 'gold', 'stone', 'wood']);
  assert.notStrictEqual(shuffled, values);
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

test('domain event payloads are isolated from caller mutations', () => {
  const payload = { order: { destination: 'tile_9' } };
  const event = createDomainEvent({
    sequence: 8,
    type: 'army.orderAccepted',
    day: 12,
    tick: 5,
    payload
  });
  payload.order.destination = 'tile_10';
  event.payload.order.destination = 'tile_11';
  assert.equal(payload.order.destination, 'tile_10');
  assert.equal(event.payload.order.destination, 'tile_11');
});

test('domain events reject invalid required envelope fields', () => {
  assert.throws(() => createDomainEvent({ sequence: 0, type: 'event', day: 1, tick: 1 }), RangeError);
  assert.throws(() => createDomainEvent({ sequence: 1, type: '', day: 1, tick: 1 }), TypeError);
  assert.throws(() => createDomainEvent({ sequence: 1, type: 'event', day: 1.5, tick: 1 }), RangeError);
  assert.throws(() => createDomainEvent({ sequence: 1, type: 'event', day: 1, tick: NaN }), RangeError);
});

test('domain events reject sequence values beyond the twelve-digit event-id range', () => {
  assert.throws(() => createDomainEvent({ sequence: 1_000_000_000_000, type: 'event', day: 1, tick: 1 }), RangeError);
});
