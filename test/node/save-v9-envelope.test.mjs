import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SaveManager } from '../../src/core/SaveManager.js';

test('createEnvelope uses canonical payload JSON and a real SHA-256 digest', async () => {
  const payload = {
    version: 9,
    nested: { z: 2, a: 1 },
    a: 1,
    migrationHistory: [8, 9],
    recoveryReport: [{ code: 'migrated_v8' }]
  };
  const reordered = {
    recoveryReport: [{ code: 'migrated_v8' }],
    migrationHistory: [8, 9],
    a: 1,
    nested: { a: 1, z: 2 },
    version: 9
  };

  const first = await SaveManager.createEnvelope(payload);
  const second = await SaveManager.createEnvelope(reordered);
  const canonical = '{"a":1,"migrationHistory":[8,9],"nested":{"a":1,"z":2},"recoveryReport":[{"code":"migrated_v8"}],"version":9}';
  const expected = createHash('sha256').update(canonical).digest('hex');

  assert.deepEqual(Object.keys(first).sort(), [
    'buildId', 'checksum', 'envelopeVersion', 'format', 'migrationHistory',
    'payload', 'payloadVersion', 'recoveryReport', 'sequence'
  ]);
  assert.equal(first.checksum, expected);
  assert.equal(second.checksum, expected);
  assert.match(first.checksum, /^[a-f0-9]{64}$/);
  assert.equal(first.format, 'gmgc-save-envelope');
  assert.equal(first.envelopeVersion, 1);
  assert.equal(first.payloadVersion, 9);
  assert.equal(first.buildId, 'complete-release-v9');
  assert.ok(Number.isInteger(first.sequence) && first.sequence > 0);

  payload.nested.a = 99;
  payload.migrationHistory.push(10);
  payload.recoveryReport[0].code = 'changed';
  assert.equal(first.payload.nested.a, 1);
  assert.deepEqual(first.migrationHistory, [8, 9]);
  assert.deepEqual(first.recoveryReport, [{ code: 'migrated_v8' }]);
});

test('verifyEnvelope detects payload and checksum tampering', async () => {
  const payload = SaveManager.migrate({ version: 8, resources: {}, buildings: [] });
  const envelope = await SaveManager.createEnvelope(payload);
  assert.equal((await SaveManager.verifyEnvelope(envelope)).ok, true);

  const changedPayload = structuredClone(envelope);
  changedPayload.payload.world.mapId = 'tampered_map';
  assert.deepEqual(await SaveManager.verifyEnvelope(changedPayload), { ok: false, reason: 'checksum_mismatch' });

  const changedDigest = structuredClone(envelope);
  changedDigest.checksum = '0'.repeat(64);
  assert.deepEqual(await SaveManager.verifyEnvelope(changedDigest), { ok: false, reason: 'checksum_mismatch' });
});

test('createEnvelope rejects cycles, non-finite numbers, functions and unsupported values', async () => {
  const cyclic = { version: 9 };
  cyclic.self = cyclic;
  const invalidPayloads = [
    cyclic,
    { version: 9, value: Number.NaN },
    { version: 9, value: Infinity },
    { version: 9, value() {} },
    { version: 9, value: undefined },
    { version: 9, value: 1n },
    { version: 9, value: new Date(0) }
  ];

  for (const payload of invalidPayloads) {
    await assert.rejects(() => SaveManager.createEnvelope(payload), /canonical|unsupported|cycle|finite/i);
  }
});

test('chooseRecovery keeps strict source priority and reports each rejected candidate', async () => {
  const payload = SaveManager.migrate({ version: 8, resources: {}, buildings: [] });
  const primary = await SaveManager.createEnvelope({ ...payload, time: { day: 1 } });
  const rollback = await SaveManager.createEnvelope({ ...payload, time: { day: 2 } });
  const emergency = await SaveManager.createEnvelope({ ...payload, time: { day: 3 } });
  const imported = await SaveManager.createEnvelope({ ...payload, time: { day: 4 } });

  assert.equal((await SaveManager.chooseRecovery({ primary, rollback, emergency, import: imported })).source, 'primary');

  primary.payload.time.day = 99;
  const recovered = await SaveManager.chooseRecovery({ primary, rollback, emergency, import: imported });
  assert.equal(recovered.source, 'rollback');
  assert.equal(recovered.payload.time.day, 2);
  assert.deepEqual(recovered.warnings, ['primary_invalid']);

  rollback.checksum = 'bad';
  const fallback = await SaveManager.chooseRecovery({ primary, rollback, emergency, import: imported });
  assert.equal(fallback.source, 'emergency');
  assert.deepEqual(fallback.warnings, ['primary_invalid', 'rollback_invalid']);
});

test('chooseRecovery fails closed when every available candidate is corrupt', async () => {
  const payload = SaveManager.migrate({ version: 8, resources: {}, buildings: [] });
  const corrupt = async () => {
    const envelope = await SaveManager.createEnvelope(payload);
    envelope.checksum = 'not-a-digest';
    return envelope;
  };

  const result = await SaveManager.chooseRecovery({
    primary: await corrupt(),
    rollback: await corrupt(),
    emergency: await corrupt(),
    import: await corrupt()
  });

  assert.deepEqual(result, {
    source: null,
    envelope: null,
    payload: null,
    warnings: ['primary_invalid', 'rollback_invalid', 'emergency_invalid', 'import_invalid']
  });
});

test('v9 migration rejects corrupt inputs without mutating callers', () => {
  const source = { version: 8, resources: {}, buildings: [], nested: { keep: true } };
  const before = structuredClone(source);
  const migrated = SaveManager.migrate(source);
  assert.deepEqual(source, before);
  assert.notEqual(migrated, source);
  assert.equal(SaveManager.migrate({ version: 8, broken() {} }), null);
  assert.equal(SaveManager.migrate({ version: 9, value: Number.NaN }), null);
});
