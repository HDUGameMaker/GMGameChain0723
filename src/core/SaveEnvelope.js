const FORMAT = 'gmgc-save-envelope';
const ENVELOPE_VERSION = 1;
const BUILD_ID = 'complete-release-v9';

function normalize(value, active) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical payload numbers must be finite');
    return value;
  }
  if (typeof value !== 'object') throw new TypeError(`Unsupported canonical payload value: ${typeof value}`);
  if (active.has(value)) throw new TypeError('Canonical payload contains a cycle');

  active.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) throw new TypeError('Canonical payload arrays cannot be sparse');
      }
      return value.map(item => normalize(item, active));
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Unsupported canonical payload object');
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError('Unsupported canonical payload symbol key');
    }

    const result = Object.create(null);
    for (const key of Object.keys(value).sort()) {
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value: normalize(value[key], active),
        writable: true
      });
    }
    return result;
  } finally {
    active.delete(value);
  }
}

export function canonicalizePayload(payload) {
  return JSON.stringify(normalize(payload, new Set()));
}

export async function sha256(canonicalText) {
  if (typeof canonicalText !== 'string') throw new TypeError('SHA-256 input must be canonical text');
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto SHA-256 is unavailable');
  const bytes = new TextEncoder().encode(canonicalText);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function createEnvelopeRecord(payload, { sequence = 1 } = {}) {
  if (!Number.isInteger(sequence) || sequence <= 0) throw new TypeError('Envelope sequence must be a positive integer');
  const payloadClone = structuredClone(payload);
  const migrationHistory = structuredClone(payloadClone.migrationHistory || []);
  const recoveryReport = structuredClone(payloadClone.recoveryReport || []);
  const integrityBody = {
    format: FORMAT,
    envelopeVersion: ENVELOPE_VERSION,
    payloadVersion: payloadClone.version,
    buildId: BUILD_ID,
    sequence,
    payload: payloadClone,
    migrationHistory,
    recoveryReport
  };
  return {
    ...integrityBody,
    checksum: await sha256(canonicalizePayload(integrityBody))
  };
}

export async function verifyEnvelopeRecord(envelope) {
  try {
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return { ok: false, reason: 'invalid_envelope' };
    const expectedKeys = [
      'buildId', 'checksum', 'envelopeVersion', 'format', 'migrationHistory',
      'payload', 'payloadVersion', 'recoveryReport', 'sequence'
    ];
    if (JSON.stringify(Object.keys(envelope).sort()) !== JSON.stringify(expectedKeys)) {
      return { ok: false, reason: 'invalid_envelope' };
    }
    if (envelope.format !== FORMAT || envelope.envelopeVersion !== ENVELOPE_VERSION || envelope.buildId !== BUILD_ID) {
      return { ok: false, reason: 'unsupported_envelope' };
    }
    if (!Number.isInteger(envelope.sequence) || envelope.sequence <= 0 || envelope.payloadVersion !== 9) {
      return { ok: false, reason: 'invalid_envelope' };
    }
    if (!envelope.payload || envelope.payload.version !== envelope.payloadVersion) {
      return { ok: false, reason: 'invalid_payload' };
    }
    if (!/^[a-f0-9]{64}$/.test(envelope.checksum)) return { ok: false, reason: 'checksum_mismatch' };
    if (canonicalizePayload(envelope.migrationHistory) !== canonicalizePayload(envelope.payload.migrationHistory || [])) {
      return { ok: false, reason: 'metadata_mismatch' };
    }
    if (canonicalizePayload(envelope.recoveryReport) !== canonicalizePayload(envelope.payload.recoveryReport || [])) {
      return { ok: false, reason: 'metadata_mismatch' };
    }
    const {
      format, envelopeVersion, payloadVersion, buildId, sequence,
      payload, migrationHistory, recoveryReport
    } = envelope;
    const expectedChecksum = await sha256(canonicalizePayload({
      format, envelopeVersion, payloadVersion, buildId, sequence,
      payload, migrationHistory, recoveryReport
    }));
    if (expectedChecksum !== envelope.checksum) return { ok: false, reason: 'checksum_mismatch' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'invalid_payload' };
  }
}
