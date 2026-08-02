/**
 * TerritorySystem - 占领系统 / 占有术
 *
 * 格子所有权状态：empty / building（建筑覆盖）/ possession（占有术）/ enemy（Phase C）。
 *
 * 设计要点（见 docs/玩法重设计-改造计划.md Phase B）：
 * - 占有术默认只能从已有领地（建筑/占术）邻接格往外铺（BFS 生长）；
 *   炼金解锁"远程预铸"后可对任意空格施法（含不可建地形如水域）。
 * - 占术成本随已铺数量通胀（约束 1：保持"贵到铺不满"）。
 * - 建筑也算占有；建筑数量上限逼迫玩家用占术进行大规模占领。
 * - 胜利 = 占术 + 建筑铺满 claimArea 内所有格子。
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class TerritorySystem {
  constructor() {
    this._possessions = new Set();     // "x,y" 占有术标记的格子
    this._buildingCells = new Set();   // "x,y" 被建筑覆盖的格子（从 BuildingSystem 重建）
    this._buildingCap = 10;
    this._capUpgradeLevel = 0;
    this._remoteUnlocked = false;      // 炼金解锁远程预铸
    this._castingMode = false;
    this._config = null;
    this._mapConfig = null;
    this._buildingSystem = null;
    this._resourceSystem = null;

    // 建筑变化时重建覆盖并复查胜利
    eventBus.on('buildingPlaced', () => this._onBuildingsChanged());
    eventBus.on('buildingDemolished', () => this._onBuildingsChanged());
    eventBus.on('buildingMoved', () => this._onBuildingsChanged());
    eventBus.on('buildingUpgraded', () => this._onBuildingsChanged());
  }

  setBuildingSystem(bs) { this._buildingSystem = bs; }
  setResourceSystem(rs) { this._resourceSystem = rs; }

  /** 加载配置（在 main.js 装配阶段调用一次） */
  init() {
    this._config = configRegistry.get('territory') || {};
    this._mapConfig = configRegistry.get('map');
    this._buildingCap = this._config?.buildingCap?.initial ?? 10;
    this._buildClaimableCells();
  }

  /** 新游戏：重置占有术状态并重建覆盖 */
  initNew() {
    if (!this._config) this.init();
    this._possessions = new Set();
    this._buildingCap = this._config?.buildingCap?.initial ?? 10;
    this._capUpgradeLevel = 0;
    this._remoteUnlocked = false;
    this._castingMode = false;
    store.setState({ territoryCasting: false });
    this.refreshCoverage();
  }

  _key(x, y) { return x + ',' + y; }

  _onBuildingsChanged() {
    this._rebuildBuildingCoverage();
    this._updateStore();
    eventBus.emit('territoryChanged');
    this._checkWin();
  }

  /** 公开：重建建筑覆盖（初始建筑放置 / 读档后调用） */
  refreshCoverage() {
    this._rebuildBuildingCoverage();
    this._updateStore();
  }

  _rebuildBuildingCoverage() {
    this._buildingCells = new Set();
    if (!this._buildingSystem) return;
    for (const b of this._buildingSystem.buildings) {
      const config = configRegistry.getBuilding(b.buildingId);
      if (!config) continue;
      const w = config.footprint.width;
      const h = config.footprint.height;
      for (let r = b.gridY; r < b.gridY + h; r++) {
        for (let c = b.gridX; c < b.gridX + w; c++) {
          this._buildingCells.add(this._key(c, r));
        }
      }
    }
  }

  // ===== 查询 =====
  isPossession(x, y) { return this._possessions.has(this._key(x, y)); }
  isBuildingCell(x, y) { return this._buildingCells.has(this._key(x, y)); }
  isOwned(x, y) { return this.isPossession(x, y) || this.isBuildingCell(x, y); }

  /** 4 邻接（正交）BFS 生长 */
  hasOwnedNeighbor(x, y) {
    return this.isOwned(x - 1, y) || this.isOwned(x + 1, y) ||
           this.isOwned(x, y - 1) || this.isOwned(x, y + 1);
  }

  inBounds(x, y) {
    if (!this._mapConfig) return false;
    return x >= 0 && y >= 0 && x < this._mapConfig.gridWidth && y < this._mapConfig.gridHeight;
  }

  /** 该格地形是否可占领（buildable !== false，排除山脉/屏障） */
  _isClaimableTerrain(x, y) {
    if (!this._mapConfig) return false;
    const grid = this._mapConfig.grid;
    if (y < 0 || y >= grid.length) return false;
    const row = grid[y];
    if (x < 0 || x >= row.length) return false;
    const type = this._mapConfig.groundTypes?.[row[x]];
    return !!type && type.buildable !== false;
  }

  /** 构建全图可占领格缓存（地图不变，init 时算一次） */
  _buildClaimableCells() {
    this._claimableCells = [];
    if (!this._mapConfig) return;
    const grid = this._mapConfig.grid;
    const gt = this._mapConfig.groundTypes || {};
    for (let y = 0; y < grid.length; y++) {
      const row = grid[y];
      for (let x = 0; x < row.length; x++) {
        const type = gt[row[x]];
        if (type && type.buildable !== false) {
          this._claimableCells.push({ x, y });
        }
      }
    }
  }

  isClaimable(x, y) {
    return this._isClaimableTerrain(x, y);
  }

  /**
   * 能否在 (x,y) 施占术
   * - 空格（未被建筑/占术占用）
   * - 默认需邻接已有领地；远程解锁后可对任意空格施法
   */
  canCastAt(x, y) {
    if (!this.inBounds(x, y)) return { valid: false, reason: '超出地图' };
    if (!this._isClaimableTerrain(x, y)) return { valid: false, reason: '该地形不可占领' };
    if (this.isOwned(x, y)) return { valid: false, reason: '该格已被占据' };
    // 自由施法：玩家可在任意可占领空格施术（无邻接限制），空间压力由敌人 x2 扩张提供
    return { valid: true };
  }

  /** 占术成本：随已铺占术数量通胀 */
  getCastCost() {
    const base = this._config?.possession?.baseCost?.gold ?? 5;
    const rate = this._config?.possession?.inflationRate ?? 0.1;
    const count = this._possessions.size;
    return Math.max(1, Math.round(base * (1 + rate * count)));
  }

  /** 施放占有术 */
  castPossession(x, y) {
    const check = this.canCastAt(x, y);
    if (!check.valid) {
      eventBus.emit('combatBroadcast', { message: '⛔ ' + check.reason });
      return false;
    }
    const cost = this.getCastCost();
    if (!this._resourceSystem || !this._resourceSystem.tryConsume('gold', cost)) {
      eventBus.emit('combatBroadcast', { message: `💰 黄金不足（需 ${cost}）` });
      return false;
    }
    this._possessions.add(this._key(x, y));
    this._updateStore();
    eventBus.emit('territoryChanged');
    this._checkWin();
    return true;
  }

  /** 移除占有术（敌人扩张覆盖时调用，Phase C） */
  removePossession(x, y) {
    if (this._possessions.delete(this._key(x, y))) {
      this._updateStore();
      eventBus.emit('territoryChanged');
    }
  }

  /** 敌人摧毁建筑后调用（Phase C）：建筑覆盖在 buildingDemolished 事件里已重建 */
  notifyBuildingDestroyed() {
    this._updateStore();
    eventBus.emit('territoryChanged');
  }

  // ===== 胜利条件（全图可占领格占比） =====
  getClaimableCount() {
    return this._claimableCells ? this._claimableCells.length : 0;
  }

  getOwnedClaimableCount() {
    if (!this._claimableCells) return 0;
    let n = 0;
    for (const c of this._claimableCells) {
      if (this.isOwned(c.x, c.y)) n++;
    }
    return n;
  }

  /** 全图可占领格列表（供敌人系统刷新用） */
  getClaimableCells() {
    return this._claimableCells || [];
  }

  getWinProgress() {
    const total = this.getClaimableCount();
    if (total <= 0) return 0;
    return this.getOwnedClaimableCount() / total;
  }

  _checkWin() {
    const total = this.getClaimableCount();
    if (total <= 0) return;
    const threshold = this._config?.winThreshold ?? 0.5;
    if (this.getOwnedClaimableCount() / total >= threshold) {
      eventBus.emit('gameOver', { win: true, reason: 'territory' });
    }
  }

  // ===== 建筑数量上限 =====
  getBuildingCap() { return this._buildingCap; }
  getCapUpgradeLevel() { return this._capUpgradeLevel; }
  /** 每次升级提升的建筑上限数量 */
  getCapUpgradeAmount() { return this._config?.buildingCap?.upgradeAmount ?? 20; }

  getCapUpgradeCost() {
    const cfg = this._config?.buildingCap;
    if (!cfg) return [];
    const base = cfg.upgradeCostBase || [{ resourceId: 'gold', amount: 50 }];
    const growth = cfg.upgradeCostGrowth ?? 1.5;
    const factor = Math.pow(growth, this._capUpgradeLevel);
    return base.map(c => ({ resourceId: c.resourceId, amount: Math.max(1, Math.round(c.amount * factor)) }));
  }

  upgradeBuildingCap() {
    const cfg = this._config?.buildingCap;
    if (!cfg) return false;
    const maxLevel = cfg.maxLevel ?? 20;
    if (this._capUpgradeLevel >= maxLevel) {
      eventBus.emit('combatBroadcast', { message: '已达建筑上限最高等级' });
      return false;
    }
    const cost = this.getCapUpgradeCost();
    if (!this._resourceSystem || !this._resourceSystem.consumeAll(cost)) {
      eventBus.emit('combatBroadcast', { message: '升上限资源不足' });
      return false;
    }
    this._capUpgradeLevel++;
    const perLevel = cfg.upgradeAmount ?? 20;
    this._buildingCap += perLevel;
    this._updateStore();
    eventBus.emit('combatBroadcast', { message: `建筑数量上限 +${perLevel}（当前 ${this._buildingCap}）` });
    return true;
  }

  // ===== 远程预铸（炼金 Phase D 调用） =====
  setRemoteUnlocked(v) {
    this._remoteUnlocked = !!v;
    this._updateStore();
  }
  isRemoteUnlocked() { return this._remoteUnlocked; }
  getRemoteUnlockStage() { return this._config?.possession?.remoteUnlockAlchemyStage || null; }

  // ===== 施法模式 =====
  enterCastingMode() {
    if (this._buildingSystem?.placingState === 'PLACING') this._buildingSystem.exitPlacingMode();
    this._castingMode = true;
    store.setState({ territoryCasting: true });
    eventBus.emit('territoryCastingModeChanged', { enabled: true });
  }
  exitCastingMode() {
    this._castingMode = false;
    store.setState({ territoryCasting: false });
    eventBus.emit('territoryCastingModeChanged', { enabled: false });
  }
  isCastingMode() { return this._castingMode; }

  _updateStore() {
    store.setState({
      territoryPossessions: this._possessions.size,
      territoryBuildingCells: this._buildingCells.size,
      territoryClaimable: this.getClaimableCount(),
      territoryOwnedClaimable: this.getOwnedClaimableCount(),
      territoryWinProgress: this.getWinProgress(),
      buildingCap: this._buildingCap,
      buildingCapLevel: this._capUpgradeLevel,
      remoteUnlocked: this._remoteUnlocked,
      territoryVersion: Date.now()
    });
  }

  // ===== 存档 =====
  getState() {
    return {
      possessions: Array.from(this._possessions),
      buildingCap: this._buildingCap,
      capUpgradeLevel: this._capUpgradeLevel,
      remoteUnlocked: this._remoteUnlocked
    };
  }

  restoreState(state) {
    if (!this._config) this.init();
    if (!state) { this.initNew(); return; }
    this._possessions = new Set(state.possessions || []);
    this._buildingCap = state.buildingCap ?? (this._config?.buildingCap?.initial ?? 10);
    this._capUpgradeLevel = state.capUpgradeLevel || 0;
    this._remoteUnlocked = !!state.remoteUnlocked;
    this._castingMode = false;
    store.setState({ territoryCasting: false });
    this.refreshCoverage();
  }
}
