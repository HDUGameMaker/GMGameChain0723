import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SaveManager } from '../../src/core/SaveManager.js';
import { createEnvelopeRecord } from '../../src/core/SaveEnvelope.js';

function canonicalForTest(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalForTest).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalForTest(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function integrityBody(envelope) {
  const { checksum: _checksum, ...body } = envelope;
  return body;
}

function checksumForEnvelope(envelope) {
  return createHash('sha256').update(canonicalForTest(integrityBody(envelope))).digest('hex');
}

function validPayload(extra = {}) {
  return { ...SaveManager.migrate({ version: 8, resources: {}, buildings: [] }), ...extra };
}

test('real building snapshots may omit optional crop and resource-node fields', async () => {
  const payload = validPayload({
    buildings: [{ instanceId: 'building_1', buildingId: 'headquarters', gridX: 10, gridY: 10 }],
    resourceNodes: { nodes: [{ id: 'wood_1', type: 'wood', gridX: 12, gridY: 10 }] }
  });
  const envelope = await SaveManager.createEnvelope(payload);
  assert.equal((await SaveManager.verifyEnvelope(envelope)).ok, true);
});

test('localStorage quota failure does not invalidate the IndexedDB save', () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    setItem() { throw new DOMException('quota full', 'QuotaExceededError'); },
    removeItem() { throw new DOMException('storage unavailable', 'SecurityError'); }
  };
  try {
    assert.equal(SaveManager._writeLocalEmergency({ format: 'test' }), false);
    assert.equal(SaveManager._writeLocalEmergency(null), false);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test('save diagnostics report the exact validation stage and schema code', async () => {
  const progress = [];
  const invalid = validPayload();
  invalid.commerce = {};
  assert.equal(await SaveManager.save(invalid, { onProgress: entry => progress.push(entry) }), false);
  assert.equal(progress[0].stage, 'validate');
  assert.deepEqual(progress.at(-1), {
    stage: 'validate', status: 'failed', detail: 'commerce', timestamp: progress.at(-1).timestamp
  });
  assert.equal(SaveManager.getLastSaveDiagnostic().detail, 'commerce');
});

test('non-finite save diagnostics put the field path before the compact error', async () => {
  const progress = [];
  const invalid = validPayload({ camera: { camX: 1, camY: 2, zoom: Number.NaN } });
  assert.equal(await SaveManager.save(invalid, { onProgress: entry => progress.push(entry) }), false);
  assert.equal(progress.at(-1).detail, '$.camera.zoom / 非有限数字(NaN或Infinity)');
});

test('createEnvelope uses canonical payload JSON and a real SHA-256 digest', async () => {
  const payload = validPayload({
    nested: { z: 2, a: 1 },
    a: 1,
    recoveryReport: [{ code: 'migrated_v8' }]
  });
  const reordered = validPayload({
    recoveryReport: [{ code: 'migrated_v8' }],
    a: 1,
    nested: { a: 1, z: 2 }
  });

  const first = await SaveManager.createEnvelope(payload);
  const second = await SaveManager.createEnvelope(reordered);
  assert.deepEqual(Object.keys(first).sort(), [
    'buildId', 'checksum', 'envelopeVersion', 'format', 'migrationHistory',
    'payload', 'payloadVersion', 'recoveryReport', 'sequence'
  ]);
  assert.equal(first.checksum, checksumForEnvelope(first));
  assert.equal(second.checksum, checksumForEnvelope(second));
  assert.notEqual(first.checksum, second.checksum, 'sequence is part of envelope integrity');
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

test('canonicalization preserves root and nested __proto__ keys in checksum integrity', async () => {
  const payload = validPayload();
  Object.defineProperty(payload, '__proto__', { enumerable: true, value: { marker: 'root-original' } });
  Object.defineProperty(payload.world, '__proto__', { enumerable: true, value: { marker: 'nested-original' } });
  const envelope = await SaveManager.createEnvelope(payload);
  assert.equal((await SaveManager.verifyEnvelope(envelope)).ok, true);

  const rootTamper = structuredClone(envelope);
  rootTamper.payload.__proto__.marker = 'root-tampered';
  assert.deepEqual(await SaveManager.verifyEnvelope(rootTamper), { ok: false, reason: 'checksum_mismatch' });

  const nestedTamper = structuredClone(envelope);
  nestedTamper.payload.world.__proto__.marker = 'nested-tampered';
  assert.deepEqual(await SaveManager.verifyEnvelope(nestedTamper), { ok: false, reason: 'checksum_mismatch' });
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

test('checksum binds sequence and cloned outer metadata', async () => {
  const envelope = await SaveManager.createEnvelope(validPayload({ recoveryReport: [{ code: 'original' }] }));

  const sequenceTamper = structuredClone(envelope);
  sequenceTamper.sequence += 1;
  assert.deepEqual(await SaveManager.verifyEnvelope(sequenceTamper), { ok: false, reason: 'checksum_mismatch' });

  const metadataTamper = structuredClone(envelope);
  metadataTamper.migrationHistory.push(10);
  metadataTamper.payload.migrationHistory.push(10);
  metadataTamper.recoveryReport[0].code = 'tampered';
  metadataTamper.payload.recoveryReport[0].code = 'tampered';
  assert.deepEqual(await SaveManager.verifyEnvelope(metadataTamper), { ok: false, reason: 'checksum_mismatch' });
});

test('public envelope APIs reject noncanonical v9 schema without mutating callers', async () => {
  assert.equal(SaveManager.createEnvelope.length, 1);
  const canonical = validPayload();
  const invalidPayloads = [];
  for (const key of ['world', 'armyState', 'commerce']) {
    const missing = structuredClone(canonical);
    delete missing[key];
    invalidPayloads.push(missing);
  }
  for (const key of ['armies', 'availableUnits', 'tradeRoutes', 'factions']) {
    invalidPayloads.push({ ...structuredClone(canonical), [key]: {} });
  }
  invalidPayloads.push({ ...structuredClone(canonical), version: 9.5 });
  invalidPayloads.push({ ...structuredClone(canonical), version: '9' });
  invalidPayloads.push({ ...structuredClone(canonical), armyState: { nextId: 1, armies: [], availableUnits: {} } });
  invalidPayloads.push({ ...structuredClone(canonical), commerce: { nextId: 1, routes: [], factions: {} } });

  for (const invalid of invalidPayloads) {
    const before = structuredClone(invalid);
    await assert.rejects(() => SaveManager.createEnvelope(invalid), /canonical v9|schema/i);
    assert.deepEqual(invalid, before);
  }

  const noncanonicalPayload = { ...structuredClone(canonical), armies: [] };
  const checksumValidButNoncanonical = await createEnvelopeRecord(noncanonicalPayload, { sequence: 101 });
  assert.deepEqual(await SaveManager.verifyEnvelope(checksumValidButNoncanonical), { ok: false, reason: 'invalid_payload' });
});

test('recovery skips checksum-valid envelopes with invalid v9 schema', async () => {
  const invalidPayload = validPayload({ marker: 'invalid-primary', tradeRoutes: { nextId: 1, routes: [] } });
  const primary = await createEnvelopeRecord(invalidPayload, { sequence: 102 });
  const rollback = await SaveManager.createEnvelope(validPayload({ marker: 'valid-rollback' }));

  const recovered = await SaveManager.chooseRecovery({ primary, rollback });
  assert.equal(recovered.source, 'rollback');
  assert.equal(recovered.payload.marker, 'valid-rollback');
  assert.deepEqual(recovered.warnings, ['primary_invalid']);
});

test('createEnvelope rejects cycles, non-finite numbers, functions and unsupported values', async () => {
  const cyclic = validPayload();
  cyclic.self = cyclic;
  const invalidPayloads = [
    cyclic,
    validPayload({ value: Number.NaN }),
    validPayload({ value: Infinity }),
    validPayload({ value() {} }),
    validPayload({ value: undefined }),
    validPayload({ value: 1n }),
    validPayload({ value: new Date(0) })
  ];

  for (const payload of invalidPayloads) {
    await assert.rejects(() => SaveManager.createEnvelope(payload), /canonical|unsupported|cycle|finite/i);
  }
});

test('canonical errors include the exact nested data path', async () => {
  const payload = validPayload({ heroes: { recruited: [{ id: 'Hestia', runtime: new Map([['bad', true]]) }] } });
  await assert.rejects(() => SaveManager.createEnvelope(payload), /\$\.heroes\.recruited\[0\]\.runtime \(Map\)/);
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
  assert.equal(SaveManager.migrate({ version: 8.5, resources: {}, buildings: [] }), null);
  assert.equal(SaveManager.migrate({ version: 9.5, resources: {}, buildings: [] }), null);
  assert.equal(SaveManager.migrate({ version: '9', resources: {}, buildings: [] }), null);
});
