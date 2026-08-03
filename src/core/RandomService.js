const encoder = new TextEncoder();

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

export class DeterministicRandom {
  constructor(state) {
    this._state = (state >>> 0) || 0x6d2b79f5;
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
    if (!Number.isInteger(min) || !Number.isInteger(maxInclusive) || maxInclusive < min) {
      throw new RangeError('invalid_integer_range');
    }
    return min + Math.floor(this.nextFloat() * (maxInclusive - min + 1));
  }

  pick(values) {
    if (!Array.isArray(values) || values.length === 0) throw new RangeError('empty_pick');
    return values[this.nextInt(0, values.length - 1)];
  }

  shuffle(values) {
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

export function createDeterministicRng({ worldSeed, namespace, stableEntityId = '', ordinal = 0, state }) {
  const seed = state === undefined ? hashSeedParts([worldSeed, namespace, stableEntityId, ordinal]) : state;
  return new DeterministicRandom(seed);
}

export const RandomService = Object.freeze({
  float(key) {
    return createDeterministicRng(key).nextFloat();
  },

  int(key, min, maxInclusive) {
    return createDeterministicRng(key).nextInt(min, maxInclusive);
  },

  pickWeighted(key, entries) {
    if (!Array.isArray(entries) || entries.length === 0) throw new RangeError('empty_weighted_pick');
    const normalized = entries.map(({ value, weight }) => {
      if (!Number.isFinite(weight) || weight <= 0) throw new RangeError('invalid_weight');
      return { value, weight };
    });
    const total = normalized.reduce((sum, entry) => sum + entry.weight, 0);
    let cursor = createDeterministicRng(key).nextFloat() * total;
    for (const entry of normalized) {
      cursor -= entry.weight;
      if (cursor < 0) return entry.value;
    }
    return normalized.at(-1).value;
  }
});
