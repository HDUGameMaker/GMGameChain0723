/**
 * RoadSystem - 道路系统
 * 管理道路的放置、建造进度、拆除、连通性检测
 * 道路从仓库延伸，建筑必须邻接道路
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';
import { isAreaInBounds } from '../utils/gridUtils.js';

export class RoadSystem {
  constructor() {
    /** @type {Array<{gridX: number, gridY: number, roadId: string, buildProgress: number|null, buildTime: number, workerAssigned?: boolean}>} */
    this.roads = [];
    this._mapConfig = null;
    this._roadConfigs = [];
    this._buildingSystem = null;
    this._resourceSystem = null;
    this._populationSystem = null;
    this._editMode = false; // 道路编辑模式
  }

  setBuildingSystem(bs) { this._buildingSystem = bs; }
  setResourceSystem(rs) { this._resourceSystem = rs; }
  setPopulationSystem(ps) { this._populationSystem = ps; }

  init() {
    this._mapConfig = configRegistry.get('map');
    this._roadConfigs = configRegistry.get('roads') || [];
    // 注意：不在这里调用 _initFromBuildings()，因为此时 BuildingSystem 还没放建筑
    // 由 main.js 在 initNewGame() 或 restoreFromSave() 中显式调用 initFromBuildings()
  }

  /**
   * 从已有建筑中生成初始道路（在 BuildingSystem 初始化之后调用）
   */
  initFromBuildings() {
    if (!this._buildingSystem) {
      console.log('[Road] initFromBuildings skipped: no buildingSystem');
      return;
    }
    const buildings = this._buildingSystem.buildings;
    console.log('[Road] initFromBuildings: buildings count:', buildings.length);
    for (const b of buildings) {
      const cfg = configRegistry.getBuilding(b.buildingId);
      if (cfg && cfg.storageMultiplier) {
        console.log('[Road] Found warehouse:', b.buildingId, 'at', b.gridX, b.gridY);
        this._autoPlaceInitialRoads(b.gridX, b.gridY, cfg.footprint.width, cfg.footprint.height);
      }
    }
    console.log('[Road] initFromBuildings done, roads:', this.roads.length);
    this._notifyChange();
  }

  _initFromBuildings() {
    if (!this._buildingSystem) return;
    const buildings = this._buildingSystem.buildings;
    // 找到仓库（warehouse 类建筑）
    for (const b of buildings) {
      const cfg = configRegistry.getBuilding(b.buildingId);
      if (cfg && cfg.storageMultiplier) {
        // 仓库类建筑：在四周自动铺路（初始道路直接是 active 状态）
        this._autoPlaceInitialRoads(b.gridX, b.gridY, cfg.footprint.width, cfg.footprint.height);
      }
    }
  }

  _autoPlaceInitialRoads(wx, wy, ww, wh) {
    // 在仓库四边铺路
    const roadId = this._getDefaultRoadId();
    if (!roadId) return;
    const roadConfig = this.getRoadConfig(roadId);
    const buildTime = roadConfig ? roadConfig.buildTime : 1;
    // 上边
    for (let x = wx; x < wx + ww; x++) {
      this._forcePlaceRoad(x, wy - 1, roadId, buildTime);
    }
    // 下边
    for (let x = wx; x < wx + ww; x++) {
      this._forcePlaceRoad(x, wy + wh, roadId, buildTime);
    }
    // 左边
    for (let y = wy; y < wy + wh; y++) {
      this._forcePlaceRoad(wx - 1, y, roadId, buildTime);
    }
    // 右边
    for (let y = wy; y < wy + wh; y++) {
      this._forcePlaceRoad(wx + ww, y, roadId, buildTime);
    }
  }

  _forcePlaceRoad(gridX, gridY, roadId, buildTime) {
    // 边界检查
    if (gridX < 0 || gridY < 0 || gridX >= this._mapConfig.gridWidth || gridY >= this._mapConfig.gridHeight) return;
    // 地形检查 - 只能在可建造地形上铺路
    const char = this._mapConfig.grid[gridY]?.[gridX];
    if (!char) return;
    const groundType = this._mapConfig.groundTypes?.[char];
    if (!groundType || groundType.buildable === false) return;
    // 不与已有道路重叠
    if (this.getRoadAt(gridX, gridY) !== null) return;
    // 初始道路直接是 active 状态
    this.roads.push({ gridX, gridY, roadId, buildProgress: null, buildTime });
  }

  _getDefaultRoadId() {
    return this._roadConfigs.length > 0 ? this._roadConfigs[0].id : null;
  }

  getRoadConfig(roadId) {
    return this._roadConfigs.find(r => r.id === roadId) || null;
  }

  getDefaultRoadConfig() {
    return this._roadConfigs.length > 0 ? this._roadConfigs[0] : null;
  }

  // ===== 编辑模式 =====

  isEditMode() { return this._editMode; }

  enterEditMode() {
    if (this._editMode) {
      this.exitEditMode();
      return false;
    }
    this._editMode = true;
    store.setState({ roadEditMode: true });
    eventBus.emit('roadEditModeChanged', { enabled: true });
    return true;
  }

  exitEditMode() {
    this._editMode = false;
    store.setState({ roadEditMode: false });
    eventBus.emit('roadEditModeChanged', { enabled: false });
  }

  toggleEditMode() {
    if (this._editMode) {
      this.exitEditMode();
    } else {
      this.enterEditMode();
    }
  }

  // ===== 操作 API =====

  /**
   * 检查是否可以在此格铺路
   */
  canBuildRoad(gridX, gridY) {
    // 边界检查
    if (!isAreaInBounds(gridX, gridY, 1, 1, this._mapConfig.gridWidth, this._mapConfig.gridHeight)) {
      return { valid: false, reason: '超出地图边界' };
    }

    // 地形检查
    const char = this._mapConfig.grid[gridY]?.[gridX];
    if (!char) return { valid: false, reason: '无效地形' };
    const groundType = this._mapConfig.groundTypes?.[char];
    if (!groundType) return { valid: false, reason: '无效地形' };
    if (groundType.buildable === false) {
      return { valid: false, reason: `${groundType.name}上不可铺路` };
    }

    // 已有道路（正在建造的也算）
    if (this.getRoadAt(gridX, gridY) !== null) {
      return { valid: false, reason: '此处已有道路' };
    }

    // 不与建筑重叠
    if (this._buildingSystem) {
      for (const b of this._buildingSystem.buildings) {
        const cfg = configRegistry.getBuilding(b.buildingId);
        if (!cfg) continue;
        const bw = cfg.footprint.width;
        const bh = cfg.footprint.height;
        if (gridX >= b.gridX && gridX < b.gridX + bw &&
            gridY >= b.gridY && gridY < b.gridY + bh) {
          return { valid: false, reason: '与建筑重叠' };
        }
      }
    }

    // 连通性检查：必须邻接已有道路或建筑
    if (!this._isConnectedToNetwork(gridX, gridY)) {
      return { valid: false, reason: '道路必须邻接已有道路或建筑' };
    }

    return { valid: true };
  }

  /**
   * 检查一格是否与已有路网连通（或邻接仓库）
   */
  _isConnectedToNetwork(gridX, gridY) {
    if (this.roads.length > 0) {
      return this._hasAdjacentRoad(gridX, gridY);
    }
    // 无道路时：第一格必须邻接任意建筑
    if (this._buildingSystem) {
      for (const b of this._buildingSystem.buildings) {
        const cfg = configRegistry.getBuilding(b.buildingId);
        if (!cfg) continue;
        const bw = cfg.footprint.width;
        const bh = cfg.footprint.height;
        if (gridX >= b.gridX - 1 && gridX < b.gridX + bw + 1 &&
            gridY >= b.gridY - 1 && gridY < b.gridY + bh + 1 &&
            !(gridX >= b.gridX && gridX < b.gridX + bw &&
              gridY >= b.gridY && gridY < b.gridY + bh)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 检查某格是否邻接已有道路（包括建造中的）
   */
  _hasAdjacentRoad(gridX, gridY) {
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    for (const [dx, dy] of dirs) {
      if (this.getRoadAt(gridX + dx, gridY + dy) !== null) return true;
    }
    // 也检查邻接建筑
    if (this._buildingSystem) {
      for (const b of this._buildingSystem.buildings) {
        const cfg = configRegistry.getBuilding(b.buildingId);
        if (!cfg) continue;
        const bw = cfg.footprint.width;
        const bh = cfg.footprint.height;
        if (gridX >= b.gridX - 1 && gridX < b.gridX + bw + 1 &&
            gridY >= b.gridY - 1 && gridY < b.gridY + bh + 1 &&
            !(gridX >= b.gridX && gridX < b.gridX + bw &&
              gridY >= b.gridY && gridY < b.gridY + bh)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 铺路（消耗资源，进入建造状态；无空闲工人时等待自动分配）
   */
  buildRoad(gridX, gridY) {
    const check = this.canBuildRoad(gridX, gridY);
    if (!check.valid) return false;

    const roadId = this._getDefaultRoadId();
    if (!roadId) return false;

    const roadConfig = this.getRoadConfig(roadId);
    if (!roadConfig) return false;

    // 消耗资源
    if (roadConfig.buildCost && roadConfig.buildCost.length > 0) {
      if (!this._resourceSystem.consumeAll(roadConfig.buildCost)) return false;
    }

    const workerAssigned = this._tryAssignConstructionWorker();

    // 创建道路（建造中状态）
    const buildTime = roadConfig.buildTime || 1;
    const state = store.getState();
    const currentTick = state.timeTick ?? 0;
    const currentT = state.timeProgress ?? 0;

    this.roads.push({
      gridX,
      gridY,
      roadId,
      buildProgress: 0,
      buildTime,
      workerAssigned,
      startTick: workerAssigned ? currentTick : undefined,
      startTimeProgress: workerAssigned ? currentT : undefined
    });

    this._notifyChange();
    eventBus.emit('roadBuilt', { gridX, gridY, roadId, constructing: true });
    return true;
  }

  /**
   * 按每条道路自己的开始时间推进建造，避免同一 tick 内新铺道路共享全局进度。
   */
  updateConstructionProgress() {
    const state = store.getState();
    const now = (state.timeTick ?? 0) + (state.timeProgress ?? 0);
    let changed = false;
    let releasedWorker = false;
    let guard = 0;

    do {
      releasedWorker = false;
      guard++;
      const result = this._updateConstructionProgressPass(now);
      changed = changed || result.changed;
      releasedWorker = result.releasedWorker;
    } while (releasedWorker && guard <= this.roads.length + 1);

    if (changed) {
      this._notifyChange();
    }
  }

  _updateConstructionProgressPass(now) {
    let changed = false;
    let releasedWorker = false;

    for (const road of this.roads) {
      if (road.buildProgress === null) continue;

      if (!road.workerAssigned) {
        if (!this._tryAssignConstructionWorker()) continue;
        road.workerAssigned = true;
        const existingProgress = road.buildProgress ?? 0;
        this._setConstructionStartFromElapsed(road, now, existingProgress);
        changed = true;
      } else if (road.startTick === undefined || road.startTimeProgress === undefined) {
        const existingProgress = road.buildProgress ?? 0;
        this._setConstructionStartFromElapsed(road, now, existingProgress);
      }

      const start = (road.startTick ?? 0) + (road.startTimeProgress ?? 0);
      const elapsed = Math.max(0, now - start);
      const buildTime = Math.max(0, road.buildTime || 0);
      const nextProgress = buildTime > 0 ? Math.min(buildTime, Math.floor(elapsed)) : 0;

      if ((road.buildProgress ?? 0) !== nextProgress) {
        road.buildProgress = nextProgress;
        changed = true;
      }

      if (elapsed >= buildTime) {
        road.buildProgress = null;
        road.workerAssigned = false;
        road.startTick = undefined;
        road.startTimeProgress = undefined;
        if (this._populationSystem) {
          this._populationSystem.releaseFromConstruction(1);
        }
        changed = true;
        releasedWorker = true;
        eventBus.emit('roadBuilt', {
          gridX: road.gridX,
          gridY: road.gridY,
          roadId: road.roadId,
          constructing: false
        });
      }
    }

    return { changed, releasedWorker };
  }

  /**
   * 检查某格道路是否正在建造中
   */
  isConstructing(gridX, gridY) {
    const road = this.getRoadAt(gridX, gridY);
    return road && road.buildProgress !== null;
  }

  /**
   * 检查某格道路是否已建成（active）
   */
  isActive(gridX, gridY) {
    const road = this.getRoadAt(gridX, gridY);
    return road && road.buildProgress === null;
  }

  /**
   * 拆除道路（返还60%资源）
   */
  removeRoad(gridX, gridY) {
    const idx = this.roads.findIndex(r => r.gridX === gridX && r.gridY === gridY);
    if (idx === -1) return false;

    // 至少保留一条邻接仓库的道路
    if (!this._canRemoveRoad(idx)) return false;

    const road = this.roads[idx];
    const roadConfig = this.getRoadConfig(road.roadId);

    // 返还60%资源
    if (roadConfig && roadConfig.buildCost && this._resourceSystem) {
      for (const cost of roadConfig.buildCost) {
        const refund = Math.floor(cost.amount * 0.6);
        if (refund > 0) {
          this._resourceSystem.add(cost.resourceId, refund);
        }
      }
    }

    // 如果正在建造中，释放工人
    if (road.buildProgress !== null && road.workerAssigned && this._populationSystem) {
      this._populationSystem.releaseFromConstruction(1);
    }

    this.roads.splice(idx, 1);
    this._notifyChange();
    eventBus.emit('roadRemoved', { gridX, gridY });

    // 道路删除后检查道路依赖建筑
    if (this._buildingSystem) {
      this._buildingSystem.checkAllBuildingsValidity();
    }
    return true;
  }

  // ===== 查询 API =====

  /**
   * 获取指定位置的道路
   */
  getRoadAt(gridX, gridY) {
    return this.roads.find(r => r.gridX === gridX && r.gridY === gridY) || null;
  }

  /**
   * 获取道路建造进度
   */
  getRoadProgress(gridX, gridY) {
    const road = this.getRoadAt(gridX, gridY);
    if (!road || road.buildProgress === null) return null;
    return { progress: road.buildProgress, total: road.buildTime };
  }

  /**
   * 检查某个建筑区域是否至少有一格邻接已建成的道路
   * 火把不需要邻接道路
   */
  hasAdjacentRoad(gridX, gridY, w, h, isTorch = false) {
    if (isTorch) return true;

    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    for (let r = gridY; r < gridY + h; r++) {
      for (let c = gridX; c < gridX + w; c++) {
        for (const [dx, dy] of dirs) {
          const road = this.getRoadAt(c + dx, r + dy);
          if (road && road.buildProgress === null) return true;
        }
      }
    }
    return false;
  }

  /**
   * 检查建筑区域是否与仓库邻接（用于在没有路网时判断初始建筑）
   */
  hasAdjacentWarehouse(gridX, gridY, w, h) {
    if (!this._buildingSystem) return false;
    for (const b of this._buildingSystem.buildings) {
      const cfg = configRegistry.getBuilding(b.buildingId);
      if (cfg && cfg.storageMultiplier) {
        const bw = cfg.footprint.width;
        const bh = cfg.footprint.height;
        // 检查两个矩形是否相邻
        const ax1 = gridX, ay1 = gridY, ax2 = gridX + w - 1, ay2 = gridY + h - 1;
        const bx1 = b.gridX, by1 = b.gridY, bx2 = b.gridX + bw - 1, by2 = b.gridY + bh - 1;
        const horizontalAdj = (ax2 + 1 === bx1 || bx2 + 1 === ax1) && !(ay2 < by1 || by2 < ay1);
        const verticalAdj = (ay2 + 1 === by1 || by2 + 1 === ay1) && !(ax2 < bx1 || bx2 < ax1);
        if (horizontalAdj || verticalAdj) return true;
      }
    }
    return false;
  }

  /**
   * 检查建筑是否可以放置在此处（建筑必须邻接已建成的道路或邻接仓库，火把除外）
   */
  canPlaceBuildingAt(gridX, gridY, w, h, buildingId) {
    const config = configRegistry.getBuilding(buildingId);
    if (!config) return true;
    // 火把不需要邻接道路
    if (config.isTorch) return true;
    // 受限地形采集建筑（伐木集散点→林地、采石场→裸石、渔场→水边、农田→草地等）
    // 按设计须建在远端资源点，而道路无法铺入山脉/林地/水域，强制邻接道路会让这类
    // 建筑永远无法放置。故对带 allowedGrounds 限制的采集建筑豁免道路/仓库邻接要求。
    if (config.allowedGrounds && config.allowedGrounds.length > 0) return true;

    if (this.hasAdjacentRoad(gridX, gridY, w, h)) return true;
    if (this.hasAdjacentWarehouse(gridX, gridY, w, h)) return true;

    return false;
  }

  // ===== 内部方法 =====

  _canRemoveRoad(idx) {
    // 计算移除后仓库是否还有至少一条邻接道路
    const remaining = this.roads.filter((_, i) => i !== idx);
    const activeRest = remaining.filter(r => r.buildProgress === null);
    if (activeRest.length === 0) return false;

    if (!this._buildingSystem) return true;
    for (const b of this._buildingSystem.buildings) {
      const cfg = configRegistry.getBuilding(b.buildingId);
      if (!cfg || !cfg.storageMultiplier) continue;
      let hasAdj = false;
      for (const r of activeRest) {
        if (this._isAdjacentToBuilding(r.gridX, r.gridY, b, cfg)) {
          hasAdj = true; break;
        }
      }
      if (!hasAdj) return false;
    }
    return true;
  }

  _isAdjacentToBuilding(gx, gy, b, cfg) {
    return gx >= b.gridX - 1 && gx < b.gridX + cfg.footprint.width + 1 &&
           gy >= b.gridY - 1 && gy < b.gridY + cfg.footprint.height + 1 &&
           !(gx >= b.gridX && gx < b.gridX + cfg.footprint.width &&
             gy >= b.gridY && gy < b.gridY + cfg.footprint.height);
  }

  _notifyChange() {
    store.setState({ roadVersion: Date.now() });
  }

  _tryAssignConstructionWorker() {
    if (!this._populationSystem) return true;
    if (this._populationSystem.getAvailableWorkers() <= 0) return false;
    this._populationSystem.occupyForConstruction(1);
    return true;
  }

  _setConstructionStartFromElapsed(road, now, elapsed) {
    const start = Math.max(0, now - elapsed);
    road.startTick = Math.floor(start);
    road.startTimeProgress = start - road.startTick;
  }

  // ===== 存档接口 =====

  getAllStates() {
    return this.roads.map(r => ({
      gridX: r.gridX,
      gridY: r.gridY,
      roadId: r.roadId,
      buildProgress: r.buildProgress,
      buildTime: r.buildTime,
      workerAssigned: r.workerAssigned === true,
      startTick: r.startTick,
      startTimeProgress: r.startTimeProgress
    }));
  }

  restoreState(states) {
    if (!states || !Array.isArray(states)) {
      this.roads = [];
      this.initFromBuildings();
      return;
    }
    const state = store.getState();
    const currentTick = state.timeTick ?? 0;
    this.roads = states.map(s => {
      const constructing = s.buildProgress != null;
      const workerAssigned = constructing && s.workerAssigned === true;
      return {
        gridX: s.gridX,
        gridY: s.gridY,
        roadId: s.roadId || this._getDefaultRoadId(),
        buildProgress: s.buildProgress !== undefined ? s.buildProgress : null,
        buildTime: s.buildTime || 1,
        workerAssigned,
        startTick: workerAssigned ? (s.startTick ?? currentTick) : undefined,
        startTimeProgress: workerAssigned ? (s.startTimeProgress ?? 0) : undefined
      };
    });
    this._notifyChange();
  }
}
