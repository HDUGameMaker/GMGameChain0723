const DAY_PERIODS = new Set(['dawn', 'morning', 'afternoon', 'evening']);

function encodeBits(bits) {
  const runs = [];
  let expected = 0;
  let count = 0;
  for (const value of bits) {
    const bit = value ? 1 : 0;
    if (bit === expected) count += 1;
    else {
      runs.push(count);
      expected = bit;
      count = 1;
    }
  }
  runs.push(count);
  return runs;
}

function decodeBits(runs, length) {
  if (!Array.isArray(runs) || runs.some(run => !Number.isInteger(run) || run < 0)) throw new TypeError('invalid_fog_rle');
  const bits = new Uint8Array(length);
  let cursor = 0;
  let value = 0;
  for (const count of runs) {
    if (cursor + count > length) throw new RangeError('invalid_fog_rle');
    if (value) bits.fill(1, cursor, cursor + count);
    cursor += count;
    value = value ? 0 : 1;
  }
  if (cursor !== length) throw new RangeError('invalid_fog_rle');
  return bits;
}

export class FogOfWarState {
  constructor(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new TypeError('invalid_fog_dimensions');
    this.width = width;
    this.height = height;
    this._explored = new Uint8Array(width * height);
    this._visible = new Uint8Array(width * height);
    this._revealAll = false;
  }

  setRevealAll(enabled) {
    this._revealAll = enabled === true;
    if (this._revealAll) {
      this._explored.fill(1);
      this._visible.fill(1);
    } else {
      this._visible.fill(0);
    }
  }

  recalculate(sources = [], period = 'morning') {
    if (this._revealAll) {
      this._explored.fill(1);
      this._visible.fill(1);
      return;
    }
    this._visible.fill(0);
    const baseRadius = DAY_PERIODS.has(period) ? 10 : 6;
    for (const source of sources) {
      if (!Number.isFinite(source?.gridX) || !Number.isFinite(source?.gridY)) continue;
      const left = Math.floor(source.gridX);
      const top = Math.floor(source.gridY);
      const width = Math.max(1, Math.floor(Number(source.width) || 1));
      const height = Math.max(1, Math.floor(Number(source.height) || 1));
      const bonus = Math.max(0, Math.floor(Number(source.bonus) || 0));
      const radius = baseRadius + bonus;
      const startX = Math.max(0, left - radius);
      const endX = Math.min(this.width - 1, left + width - 1 + radius);
      const startY = Math.max(0, top - radius);
      const endY = Math.min(this.height - 1, top + height - 1 + radius);
      for (let y = startY; y <= endY; y += 1) {
        const offset = y * this.width;
        this._visible.fill(1, offset + startX, offset + endX + 1);
      }
    }
    for (let index = 0; index < this._visible.length; index += 1) {
      if (this._visible[index]) this._explored[index] = 1;
    }
  }

  getTileState(gridX, gridY) {
    if (!Number.isInteger(gridX) || !Number.isInteger(gridY) || gridX < 0 || gridY < 0 || gridX >= this.width || gridY >= this.height) {
      return 'unexplored';
    }
    const index = gridY * this.width + gridX;
    if (this._visible[index]) return 'visible';
    return this._explored[index] ? 'remembered' : 'unexplored';
  }

  getState() {
    return { width: this.width, height: this.height, exploredRle: encodeBits(this._explored) };
  }

  restoreState(state) {
    if (state?.width !== this.width || state?.height !== this.height) return false;
    this._explored = decodeBits(state.exploredRle, this.width * this.height);
    this._visible.fill(0);
    if (this._revealAll) this.setRevealAll(true);
    return true;
  }
}
