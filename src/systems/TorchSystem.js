/**
 * TorchSystem - 光照系统（v2: 建筑+道路提供光源，替代火把）
 * 计算可见性矩阵：道路3×3，n×n建筑(n+2)×(n+2)，取联合光照
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class TorchSystem {
  constructor() {
    this._resourceSystem = null;
    this._buildingSystem = null;
    this._roadSystem = null;
    this._mapConfig = null;
    this._lastLightVersion = -1;
    this._cachedVisible = null;
    this._cachedVersion = -1;

    eventBus.on('buildingPlaced', () => this._notifyChange());
    eventBus.on('buildingComplete', () => this._notifyChange());
    eventBus.on('buildingDemolished', () => this._notifyChange());
    eventBus.on('buildingMoved', () => this._notifyChange());
  }

  setResourceSystem(rs) { this._resourceSystem = rs; }
  setBuildingSystem(bs) { this._buildingSystem = bs; }
  setRoadSystem(rs) { this._roadSystem = rs; }

  init() {
    this._mapConfig = configRegistry.get('map');
    console.log('[TorchSystem] Light system initialized (building+road based)');
  }

  initFromConfig() {
    this._notifyChange();
  }

  // 兼容旧接口（不再需要火把操作）
  getAll() { return []; }
  getLitTorches() { return []; }
  getTorchAt() { return -1; }
  getTorchConfig() { return null; }
  canLightTorch() { return { valid: false, reason: '火把系统已移除' }; }
  lightTorch() { return false; }
  addFuel() { return false; }
  onBuildingComplete() {}
  onBuildingUpgraded() {}
  onBuildingMoved() {}
  syncFromBuildings() {}
  onTick() {}
  onPeriodEnd() {}
  isDarknessMode() { return false; }
  setDarknessMode() {}
  getAllStates() { return []; }
  restoreState() { this._notifyChange(); }

  _markLight(gx, gy, w, h, visible, gw, gh) {
    for (let r = gy; r < gy + h && r < gh; r++) {
      for (let c = gx; c < gx + w && c < gw; c++) {
        if (r >= 0 && c >= 0) visible[r][c] = true;
      }
    }
  }

  getVisibilityMatrix() {
    const { gridWidth: gw, gridHeight: gh } = this._mapConfig;
    const visible = Array.from({ length: gh }, () => Array(gw).fill(false));

    // 建筑提供(n+2)×(n+2)光照
    if (this._buildingSystem) {
      for (const b of this._buildingSystem.buildings) {
        if (b.status !== 'active') continue;
        const cfg = configRegistry.getBuilding(b.buildingId);
        if (!cfg) continue;
        const w = cfg.footprint.width;
        const h = cfg.footprint.height;
        this._markLight(b.gridX - 1, b.gridY - 1, w + 2, h + 2, visible, gw, gh);
      }
    }

    // 道路提供3×3光照
    if (this._roadSystem) {
      for (const road of this._roadSystem.roads) {
        if (road.buildProgress !== null) continue;
        this._markLight(road.gridX - 1, road.gridY - 1, 3, 3, visible, gw, gh);
      }
    }

    return visible;
  }

  canInteract(col, row) {
    const matrix = this.getVisibilityMatrix();
    if (row < 0 || row >= matrix.length) return false;
    if (col < 0 || col >= matrix[0].length) return false;
    return matrix[row][col];
  }

  canBuild() { return true; }

  _notifyChange() {
    store.setState({ torchVersion: Date.now() });
  }
}
