const encoder = new TextEncoder();
const UINT32_MAX = 0xffff_ffff;
const RANDOM_KEY_FIELDS = new Set(['worldSeed', 'namespace', 'stableEntityId', 'ordinal']);
const RNG_KEY_FIELDS = new Set([...RANDOM_KEY_FIELDS, 'state']);

export function hashSeedParts(parts) {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    for (const byte of encoder.encode(`${String(part).length}:${String(part)}|`)) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash || 0x6d2b79f5;
}

function validateKey(key, allowedFields) {
  if (key === null || typeof key !== 'object' || Array.isArray(key)) throw new TypeError('invalid_random_key');
  for (const field of Reflect.ownKeys(key)) {
    if (typeof field !== 'string' || !allowedFields.has(field)) throw new TypeError('invalid_random_key_field');
  }
  if (typeof key.worldSeed !== 'string' || typeof key.namespace !== 'string') {
    throw new TypeError('invalid_random_key');
  }
  if (key.stableEntityId !== undefined && typeof key.stableEntityId !== 'string') {
    throw new TypeError('invalid_stable_entity_id');
  }
  if (key.ordinal !== undefined && (!Number.isSafeInteger(key.ordinal) || key.ordinal < 0)) {
    throw new RangeError('invalid_random_ordinal');
  }
  return {
    worldSeed: key.worldSeed,
    namespace: key.namespace,
    stableEntityId: key.stableEntityId ?? '',
    ordinal: key.ordinal ?? 0
  };
}

function validateRestorationState(state) {
  if (!Number.isInteger(state) || state <= 0 || state > UINT32_MAX) {
    throw new RangeError('invalid_rng_state');
  }
  return state;
}

function validateIntegerRange(min, maxInclusive) {
  if (
    !Number.isSafeInteger(min)
    || !Number.isSafeInteger(maxInclusive)
    || maxInclusive < min
    || maxInclusive - min >= Number.MAX_SAFE_INTEGER
  ) {
    throw new RangeError('invalid_integer_range');
  }
}

export class DeterministicRandom {
  constructor(state) {
    this._state = validateRestorationState(state);
  }

  nextUint32() {
    let value = this._state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this._state = value >>> 0;
    return this._state;
  }

  nextFloat() {
    return this.nextUint32() / 0x1_0000_0000;
  }

  nextInt(min, maxInclusive) {
    validateIntegerRange(min, maxInclusive);
    return min + Math.floor(this.nextFloat() * (maxInclusive - min + 1));
  }

  pick(values) {
    if (!Array.isArray(values) || values.length === 0) throw new RangeError('empty_pick');
    return values[this.nextInt(0, values.length - 1)];
  }

  shuffle(values) {
    if (!Array.isArray(values)) throw new TypeError('invalid_shuffle_values');
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = this.nextInt(0, index);
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  }

  getState() {
    return this._state;
  }
}

export function createDeterministicRng(key) {
  const randomKey = validateKey(key, RNG_KEY_FIELDS);
  const seed = key.state === undefined
    ? hashSeedParts([randomKey.worldSeed, randomKey.namespace, randomKey.stableEntityId, randomKey.ordinal])
    : validateRestorationState(key.state);
  return new DeterministicRandom(seed);
}

function keyedRng(key) {
  return createDeterministicRng(validateKey(key, RANDOM_KEY_FIELDS));
}

export const RandomService = Object.freeze({
  float(key) {
    return keyedRng(key).nextFloat();
  },

  int(key, min, maxInclusive) {
    return keyedRng(key).nextInt(min, maxInclusive);
  },

  pickWeighted(key, entries) {
    if (!Array.isArray(entries) || entries.length === 0) throw new RangeError('empty_weighted_pick');
    const normalized = entries.map(({ value, weight }) => {
      if (!Number.isFinite(weight) || weight <= 0) throw new RangeError('invalid_weight');
      return { value, weight };
    });
    const total = normalized.reduce((sum, entry) => sum + entry.weight, 0);
    if (!Number.isFinite(total)) throw new RangeError('invalid_weight');
    let cursor = keyedRng(key).nextFloat() * total;
    for (const entry of normalized) {
      cursor -= entry.weight;
      if (cursor < 0) return entry.value;
    }
    return normalized.at(-1).value;
  }
});
