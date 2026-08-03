import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

function normalizeNode(node) {
  const rarity = node?.rarity === 'rare' ? 'rare' : 'common';
  const capacity = rarity === 'rare' ? Math.max(1, Math.floor(Number(node.capacity) || 1)) : null;
  return {
    id: String(node.id), type: String(node.type),
    gridX: Math.floor(Number(node.gridX)), gridY: Math.floor(Number(node.gridY)),
    rarity, capacity,
    remaining: rarity ? Math.max(0, Math.min(capacity, Number.isFinite(node.remaining) ? node.remaining : capacity)) : null,
    recoveryDays: rarity ? Math.max(1, Math.floor(Number(node.recoveryDays) || 7)) : null,
    recoveryDay: rarity && Number.isFinite(node.recoveryDay) ? Math.max(1, Math.floor(node.recoveryDay)) : null,
    developedByBuildingId: node.developedByBuildingId || null,
    discovered: node.discovered !== false,
    luxuryId: node.luxuryId ? String(node.luxuryId) : null,
    visualCue: node.visualCue ? String(node.visualCue) : null
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
    this.nodes = records.map(normalizeNode);
    this._reindex();
    this._notify();
  }

  _reindex() {
    this._byId = new Map(this.nodes.map(node => [node.id, node]));
    this._byCoordinate = new Map(this.nodes.map(node => [`${node.gridX}:${node.gridY}`, node]));
  }

  getNodes() { return this.nodes; }
  getNode(nodeId) { return this._byId.get(nodeId) || null; }
  getNodeAt(gridX, gridY) { return this._byCoordinate.get(`${gridX}:${gridY}`) || null; }

  findNodeForArea(gridX, gridY, width, height, type, buildingInstanceId = null) {
    for (let y = gridY; y < gridY + height; y += 1) {
      for (let x = gridX; x < gridX + width; x += 1) {
        const node = this.getNodeAt(x, y);
        if (node?.type === type && (!node.developedByBuildingId || node.developedByBuildingId === buildingInstanceId)) return node;
      }
    }
    return null;
  }

  claimNode(nodeId, buildingInstanceId, expectedType = null) {
    const node = this.getNode(nodeId);
    if (!node) return { ok: false, reason: 'node_missing' };
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
    if (node.rarity === 'common') return { ok: true, remaining: null };
    const requested = Math.max(1, Math.floor(Number(amount) || 1));
    if (node.remaining < requested) return { ok: false, reason: 'depleted', remaining: node.remaining };
    node.remaining -= requested;
    if (node.remaining === 0) node.recoveryDay = Math.max(1, Math.floor(Number(currentDay) || 1)) + node.recoveryDays;
    this._notify();
    return { ok: true, remaining: node.remaining, recoveryDay: node.recoveryDay };
  }

  onDayStart(day = 1) {
    const currentDay = Math.max(1, Math.floor(Number(day) || 1));
    let recovered = false;
    for (const node of this.nodes) {
      if (node.rarity !== 'rare' || node.remaining > 0 || !node.recoveryDay || currentDay < node.recoveryDay) continue;
      node.remaining = node.capacity;
      node.recoveryDay = null;
      recovered = true;
    }
    if (recovered) this._notify();
    return recovered;
  }

  getState() { return { nodes: this.nodes.map(node => ({ ...node })) }; }

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
