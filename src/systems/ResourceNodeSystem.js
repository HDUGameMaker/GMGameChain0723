import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

function hasValidCoordinates(node) {
  return node?.gridX != null && node?.gridY != null
    && node.gridX !== '' && node.gridY !== ''
    && Number.isFinite(Number(node.gridX)) && Number.isFinite(Number(node.gridY));
}

function normalizeNode(node) {
  if (!node || node.id == null || node.type == null || !hasValidCoordinates(node)) return null;
  const permanentLuxury = node?.type === 'luxury';
  const rarity = permanentLuxury || node?.rarity === 'rare' ? 'rare' : 'common';
  const capacity = permanentLuxury ? 2 : (rarity === 'rare' ? Math.max(1, Math.floor(Number(node.capacity) || 1)) : null);
  return {
    id: String(node.id), type: String(node.type),
    gridX: Math.floor(Number(node.gridX)), gridY: Math.floor(Number(node.gridY)),
    rarity, capacity,
    remaining: rarity ? Math.max(0, Math.min(capacity, Number.isFinite(node.remaining) ? node.remaining : capacity)) : null,
    recoveryDays: rarity && !permanentLuxury ? Math.max(1, Math.floor(Number(node.recoveryDays) || 7)) : null,
    recoveryDay: rarity && Number.isFinite(node.recoveryDay) ? Math.max(1, Math.floor(node.recoveryDay)) : null,
    developedByBuildingId: node.developedByBuildingId || null,
    discovered: node.discovered !== false,
    luxuryId: node.luxuryId ? String(node.luxuryId) : null,
    visualCue: node.visualCue ? String(node.visualCue) : null,
    lockedByCityStateId: node.lockedByCityStateId ? String(node.lockedByCityStateId) : null,
    locked: node.locked === true,
    cityStateGenerated: node.cityStateGenerated === true,
    corrupted: node.corrupted === true,
    depletesPermanently: permanentLuxury || node.depletesPermanently === true,
    depleted: node.depleted === true
  };
}

export class ResourceNodeSystem {
  constructor() {
    this.nodes = [];
    this._byId = new Map();
    this._byCoordinate = new Map();
    eventBus.on('dayStart', ({ day } = {}) => this.onDayStart(day));
  }

  initNew() { this.initFromManifest(configRegistry.get('map')?.spawnManifest?.resourceNodes || []); }

  initFromManifest(records = []) {
    this.nodes = records.map(normalizeNode).filter(Boolean);
    this._reindex();
    this._notify();
  }

  _reindex() {
    this._byId = new Map(this.nodes.map(node => [node.id, node]));
    this._byCoordinate = new Map(this.nodes.filter(node => !node.depleted).map(node => [`${node.gridX}:${node.gridY}`, node]));
  }

  getNodes() { return this.nodes.filter(node => !node.depleted); }
  getNode(nodeId) { return this._byId.get(nodeId) || null; }
  getNodeAt(gridX, gridY) { return this._byCoordinate.get(`${gridX}:${gridY}`) || null; }

  setCityStateNodes(records = []) {
    const previous = new Map(this.nodes.filter(node => node.cityStateGenerated).map(node => [node.id, node]));
    const staticNodes = this.nodes.filter(node => !node.cityStateGenerated);
    const generated = records.map(record => normalizeNode({
      ...record,
      ...(previous.get(String(record.id)) || {}),
      gridX: record.gridX,
      gridY: record.gridY,
      luxuryId: record.luxuryId,
      locked: record.locked === true,
      lockedByCityStateId: record.lockedByCityStateId,
      cityStateGenerated: true
    })).filter(Boolean);
    this.nodes = [...staticNodes, ...generated];
    this._reindex();
    this._notify();
  }

  unlockCityStateNodes(cityStateId) {
    let changed = false;
    for (const node of this.nodes) {
      if (node.lockedByCityStateId !== cityStateId || !node.locked) continue;
      node.locked = false;
      changed = true;
    }
    if (changed) this._notify();
    return changed;
  }

  findNodeForArea(gridX, gridY, width, height, type, buildingInstanceId = null) {
    for (let y = gridY; y < gridY + height; y += 1) {
      for (let x = gridX; x < gridX + width; x += 1) {
        const node = this.getNodeAt(x, y);
        if (node?.type === type && !node.locked && !node.corrupted && (!node.developedByBuildingId || node.developedByBuildingId === buildingInstanceId)) return node;
      }
    }
    return null;
  }

  corruptCovered(predicate) {
    let changed = false;
    for (const node of this.nodes) {
      if (node.corrupted || !predicate(node.gridX, node.gridY)) continue;
      node.corrupted = true; node.locked = true; node.developedByBuildingId = null; changed = true;
    }
    if (changed) this._notify();
  }

  claimNode(nodeId, buildingInstanceId, expectedType = null) {
    const node = this.getNode(nodeId);
    if (!node) return { ok: false, reason: 'node_missing' };
    if (node.corrupted) return { ok: false, reason: 'black_mist_corrupted' };
    if (node.locked) return { ok: false, reason: 'city_state_headquarters_intact' };
    if (expectedType && node.type !== expectedType) return { ok: false, reason: 'type_mismatch' };
    if (node.developedByBuildingId && node.developedByBuildingId !== buildingInstanceId) return { ok: false, reason: 'already_developed' };
    node.developedByBuildingId = buildingInstanceId;
    this._notify();
    return { ok: true };
  }

  releaseNodeByBuilding(buildingInstanceId) {
    let released = false;
    for (const node of this.nodes) {
      if (node.developedByBuildingId !== buildingInstanceId) continue;
      node.developedByBuildingId = null;
      released = true;
    }
    if (released) this._notify();
    return released;
  }

  consume(nodeId, amount = 1, currentDay = 1) {
    const node = this.getNode(nodeId);
    if (!node) return { ok: false, reason: 'node_missing' };
    if (node.depleted) return { ok: false, reason: 'depleted', remaining: 0 };
    if (node.corrupted) return { ok: false, reason: 'black_mist_corrupted' };
    if (node.locked) return { ok: false, reason: 'city_state_headquarters_intact' };
    if (node.rarity === 'common') return { ok: true, remaining: null };
    const requested = Math.max(1, Math.floor(Number(amount) || 1));
    if (node.remaining < requested) return { ok: false, reason: 'depleted', remaining: node.remaining };
    node.remaining -= requested;
    if (node.remaining === 0) {
      if (node.depletesPermanently) {
        node.depleted = true;
        node.developedByBuildingId = null;
        this._reindex();
      } else node.recoveryDay = Math.max(1, Math.floor(Number(currentDay) || 1)) + node.recoveryDays;
    }
    this._notify();
    return { ok: true, remaining: node.remaining, recoveryDay: node.recoveryDay };
  }

  onDayStart(day = 1) {
    const currentDay = Math.max(1, Math.floor(Number(day) || 1));
    let recovered = false;
    for (const node of this.nodes) {
      if (node.depletesPermanently || node.rarity !== 'rare' || node.remaining > 0 || !node.recoveryDay || currentDay < node.recoveryDay) continue;
      node.remaining = node.capacity;
      node.recoveryDay = null;
      recovered = true;
    }
    if (recovered) this._notify();
    return recovered;
  }

  getState() {
    // Last line of defence: a malformed runtime node must not poison the whole
    // autosave. Invalid nodes cannot be rendered or harvested, so discarding
    // them is lossless from the player's perspective.
    const validNodes = this.nodes.filter(hasValidCoordinates);
    if (validNodes.length !== this.nodes.length) {
      console.warn(`[ResourceNodeSystem] Removed ${this.nodes.length - validNodes.length} resource node(s) with invalid coordinates before saving.`);
      this.nodes = validNodes;
      this._reindex();
    }
    return { nodes: this.nodes.map(node => ({ ...node })) };
  }

  restoreState(state) {
    const records = Array.isArray(state) ? state : state?.nodes;
    if (!Array.isArray(records)) return this.initNew();
    const manifest = configRegistry.get('map')?.spawnManifest?.resourceNodes || [];
    if (manifest.length === 0) return this.initFromManifest(records);
    const saved = new Map(records.map(node => [node.id, node]));
    const merged = manifest.map(node => ({ ...node, ...(saved.get(node.id) || {}) }));
    for (const node of records) if (!manifest.some(base => base.id === node.id)) merged.push(node);
    this.initFromManifest(merged);
  }

  _notify() {
    store.setState({ resourceNodeVersion: Date.now() });
    eventBus.emit('resourceNodesChanged', { count: this.nodes.length });
  }
}
