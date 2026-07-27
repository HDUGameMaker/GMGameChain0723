/**
 * BuildingSystem - 建筑系统
 * 管理建筑放置、建造、生产、升级、工人分配、合成
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';
import { isAreaInBounds, isAreaOverlap } from '../utils/gridUtils.js';

export class BuildingSystem {
  constructor() {
    this.buildings = []; // 运行时建筑实例列表
    this.placingState = 'IDLE'; // IDLE | SELECTING | PLACING
    this.placingBuildingId = null;
    this._resourceSystem = null;
    this._populationSystem = null;
    this._mapConfig = null;
    this._newlyUnlocked = new Set(); // 本轮新解锁的建筑ID
    this._adjacencyConfig = []; // 相邻加成配置

    // 订阅 tick 事件处理建造和生产
    eventBus.on('tick', (data) => this.onTick(data));
  }

  setResourceSystem(rs) { this._resourceSystem = rs; }
  setPopulationSystem(ps) { this._populationSystem = ps; }
  setItemSystem(is) { this._itemSystem = is; }
  setTorchSystem(ts) { this._torchSystem = ts; }
  setRoadSystem(rs) { this._roadSystem = rs; }
  setTechSystem(ts) { this._techSystem = ts; }
  setWeatherSystem(ws) { this._weatherSystem = ws; }
  setCultureSystem(cs) { this._cultureSystem = cs; }
  setAlchemySystem(as) { this._alchemySystem = as; }

  init() {
    this._mapConfig = configRegistry.get('map');
    this._adjacencyConfig = configRegistry.get('adjacency_bonuses') || [];
  }

  // ===== 放置模式 =====

  enterPlacingMode(buildingId) {
    this.placingState = 'PLACING';
    this.placingBuildingId = buildingId;
    store.setState({ placingState: 'PLACING', placingBuildingId: buildingId });
  }

  exitPlacingMode() {
    this.placingState = 'IDLE';
    this.placingBuildingId = null;
    store.setState({ placingState: 'IDLE', placingBuildingId: null });
  }

  /**
   * 检查放置合法性
   */
  canPlaceAt(gridX, gridY, buildingId) {
    const config = configRegistry.getBuilding(buildingId);
    if (!config) return { valid: false, reason: '建筑不存在' };

    const w = config.footprint.width;
    const h = config.footprint.height;
    const map = this._mapConfig;

    // 迷雾检查：区域必须全部可见
    if (this._torchSystem && !this._torchSystem.canBuild(gridX, gridY, w, h)) {
      return { valid: false, reason: '该区域尚未探索' };
    }

    // 边界检查
    if (!isAreaInBounds(gridX, gridY, w, h, map.gridWidth, map.gridHeight)) {
      return { valid: false, reason: '超出地图边界' };
    }

    // 地形检查
    for (let r = gridY; r < gridY + h; r++) {
      for (let c = gridX; c < gridX + w; c++) {
        const char = map.grid[r][c];
        const groundType = map.groundTypes[char];
        if (!groundType) {
          return { valid: false, reason: '无效地形' };
        }
        // 不可建造地形（山脉、水源）
        if (groundType.buildable === false) {
          return { valid: false, reason: `${groundType.name}上不可建造` };
        }
        // 受限地形：仅特定建筑可建造（如采石场→裸露石头）
        if (groundType.buildable === 'restricted') {
          if (!config.allowedGrounds || !config.allowedGrounds.includes(char)) {
            return { valid: false, reason: `该建筑不能建造在${groundType.name}上` };
          }
        }
        // 建筑有指定地形限制（如农田→草地、伐木营地→林地边缘）
        if (config.allowedGrounds && config.allowedGrounds.length > 0) {
          if (!config.allowedGrounds.includes(char)) {
            const allowedNames = config.allowedGrounds
              .map(g => map.groundTypes[g]?.name || g).join('、');
            return { valid: false, reason: `该建筑只能建造在: ${allowedNames}` };
          }
        }
      }
    }

    // 重叠检查（已有建筑）
    for (const b of this.buildings) {
      const bConfig = configRegistry.getBuilding(b.buildingId);
      if (isAreaOverlap(gridX, gridY, w, h, b.gridX, b.gridY, bConfig.footprint.width, bConfig.footprint.height)) {
        return { valid: false, reason: '与已有建筑重叠' };
      }
    }

    // 重叠检查（已有火把）
    if (this._torchSystem) {
      for (const t of this._torchSystem.torches) {
        if (isAreaOverlap(gridX, gridY, w, h, t.gridX, t.gridY, 1, 1)) {
          return { valid: false, reason: '与已有火把重叠' };
        }
      }
    }

    // 重叠检查（活跃的事件标记）
    const removedIds = new Set(store.getState('removedEventMarkers') || []);
    const eventMarkers = map.eventMarkers || [];
    for (const marker of eventMarkers) {
      if (removedIds.has(marker.id)) continue;
      if (isAreaOverlap(gridX, gridY, w, h, marker.gridX, marker.gridY, 1, 1)) {
        return { valid: false, reason: '与事件标记重叠' };
      }
    }

    // maxCount 检查
    if (config.maxCount !== null && config.maxCount !== undefined) {
      const count = this.buildings.filter(b => b.buildingId === buildingId).length;
      if (count >= config.maxCount) {
        return { valid: false, reason: '已达最大数量' };
      }
    }

    // 道路邻接检查（非火把建筑必须邻接道路或仓库）
    if (this._roadSystem) {
      if (!this._roadSystem.canPlaceBuildingAt(gridX, gridY, w, h, buildingId)) {
        return { valid: false, reason: '建筑必须邻接道路或仓库' };
      }
    }

    return { valid: true };
  }

  /**
   * 确认放置建筑
   */
  placeBuilding(gridX, gridY, buildingId) {
    const config = configRegistry.getBuilding(buildingId);
    if (!config) return false;

    const check = this.canPlaceAt(gridX, gridY, buildingId);
    if (!check.valid) return false;

    // 消耗资源（应用人文政策建造成本倍率）
    const buildCostMul = (this._cultureSystem ? (this._cultureSystem.getEffects().buildCostMul || 1) : 1) * (this._alchemySystem ? ((this._alchemySystem.getEffects().building || {}).buildCostMul || 1) : 1);
    if (config.buildCost && config.buildCost.length > 0) {
      const scaledCost = config.buildCost.map(c => ({ ...c, amount: Math.max(1, Math.round(c.amount * buildCostMul)) }));
      if (!this._resourceSystem.consumeAll(scaledCost)) return false;
    }

    // 获取当前时间状态
    const state = store.getState();
    const currentTick = state.timeTick ?? 0;
    const currentT = state.timeProgress ?? 0;
    const building = {
      buildingId,
      gridX,
      gridY,
      status: 'constructing',
      buildProgress: 0,
      startTick: currentTick,
      startTimeProgress: currentT,
      currentWorkers: 0,
      synthesisProgress: null // { recipeId, progress }
    };

    this.buildings.push(building);
    this.exitPlacingMode();
    this._updateStore();
    eventBus.emit('buildingPlaced', { building });
    return true;
  }

  /**
   * 放置初始建筑（无消耗，直接 active）
   */
  placeInitialBuilding(buildingId, gridX, gridY) {
    const building = {
      buildingId,
      gridX,
      gridY,
      status: 'active',
      buildProgress: null,
      currentWorkers: 0,
      synthesisProgress: null
    };
    this.buildings.push(building);
    this._updateStore();
  }

  // ===== 升级 =====

  canUpgrade(buildingIndex) {
    const building = this.buildings[buildingIndex];
    if (!building || building.status !== 'active') return { valid: false, reason: '建筑不可升级' };

    const config = configRegistry.getBuilding(building.buildingId);
    if (!config || !config.upgradesTo) return { valid: false, reason: '无升级目标' };

    const targetConfig = configRegistry.getBuilding(config.upgradesTo);
    if (!targetConfig) return { valid: false, reason: '目标建筑不存在' };

    // 检查升级消耗
    const upgradeCost = targetConfig.upgradeCost || [];
    if (!this._resourceSystem.canAfford(upgradeCost)) {
      return { valid: false, reason: '资源不足' };
    }

    // 检查目标建筑是否已解锁（科技限制）
    if (!this.isUnlocked(config.upgradesTo)) {
      return { valid: false, reason: '目标建筑尚未解锁' };
    }

    return { valid: true, targetId: config.upgradesTo, cost: upgradeCost };
  }

  upgradeBuilding(buildingIndex) {
    const check = this.canUpgrade(buildingIndex);
    if (!check.valid) return false;

    const building = this.buildings[buildingIndex];
    const targetConfig = configRegistry.getBuilding(check.targetId);

    // 消耗资源（升级也应用人文政策建造成本倍率）
    const buildCostMul = (this._cultureSystem ? (this._cultureSystem.getEffects().buildCostMul || 1) : 1) * (this._alchemySystem ? ((this._alchemySystem.getEffects().building || {}).buildCostMul || 1) : 1);
    const scaledUpgradeCost = check.cost.map(c => ({ ...c, amount: Math.max(1, Math.round(c.amount * buildCostMul)) }));
    this._resourceSystem.consumeAll(scaledUpgradeCost);

    // 变为目标建筑，进入建造状态
    building.buildingId = check.targetId;
    building.status = 'constructing';
    building.buildProgress = 0;
    building.currentWorkers = 0; // 工人遣返

    this._updateStore();
    eventBus.emit('buildingUpgraded', { building });
    return true;
  }

  // ===== 工人分配 =====

  assignWorker(buildingIndex) {
    const building = this.buildings[buildingIndex];
    if (!building || building.status !== 'active') return false;

    const config = configRegistry.getBuilding(building.buildingId);
    if (!config || !config.maxWorkers) return false;
    if (building.currentWorkers >= config.maxWorkers) return false;
    if (this._populationSystem.getAvailableWorkers() <= 0) return false;

    building.currentWorkers++;
    this._updateStore();
    this._populationSystem.refresh();
    eventBus.emit('workerChanged', { buildingIndex });
    return true;
  }

  removeWorker(buildingIndex) {
    const building = this.buildings[buildingIndex];
    if (!building || building.currentWorkers <= 0) return false;

    building.currentWorkers--;
    this._updateStore();
    this._populationSystem.refresh();
    eventBus.emit('workerChanged', { buildingIndex });
    return true;
  }

  // ===== 合成 =====

  canSynthesize(buildingIndex, recipeId) {
    const building = this.buildings[buildingIndex];
    if (!building || building.status !== 'active') return { valid: false, reason: '建筑不可用' };
    if (building.synthesisProgress) return { valid: false, reason: '正在合成中' };

    const config = configRegistry.getBuilding(building.buildingId);
    const recipe = (config.synthesisRecipes || []).find(r => r.id === recipeId);
    if (!recipe) return { valid: false, reason: '配方不存在' };

    // 检查资源消耗
    if (recipe.resourceCost && !this._resourceSystem.canAfford(recipe.resourceCost)) {
      return { valid: false, reason: '资源不足' };
    }

    // 检查是否已拥有该物品（unique 物品已有则不可再造）
    if (recipe.output && recipe.output.type === 'item' && this._itemSystem) {
      const itemConfig = configRegistry.getItem(recipe.output.itemId);
      if (itemConfig && itemConfig.unique) {
        const owned = this._itemSystem.getOwnedInstances();
        if (owned.some(i => i.itemId === recipe.output.itemId)) {
          return { valid: false, reason: '已拥有此物品' };
        }
      }
    }

    return { valid: true, recipe };
  }

  startSynthesis(buildingIndex, recipeId) {
    const check = this.canSynthesize(buildingIndex, recipeId);
    if (!check.valid) return false;

    const building = this.buildings[buildingIndex];
    const recipe = check.recipe;

    // 消耗资源
    if (recipe.resourceCost) {
      this._resourceSystem.consumeAll(recipe.resourceCost);
    }

    building.synthesisProgress = { recipeId, progress: 0, total: recipe.workTicks };
    this._updateStore();
    eventBus.emit('synthesisStarted', { buildingIndex, recipeId });
    return true;
  }

  // ===== 拆除 =====

  // ===== 水力/风力装置 =====

  /** 可加装装置的工厂类建筑ID集合（有maxWorkers的生产建筑） */
  _getAttachmentBuildings() {
    return this.buildings.filter(b => {
      if (b.status !== 'active') return false;
      const cfg = configRegistry.getBuilding(b.buildingId);
      return cfg && cfg.maxWorkers && cfg.maxWorkers > 0 && cfg.production;
    });
  }

  /** 获取建筑当前装置类型 */
  getAttachmentType(buildingIndex) {
    const b = this.buildings[buildingIndex];
    if (!b) return null;
    return b._attachmentType || null; // 'hydro' | 'wind' | null
  }

  /** 检查能否装装置 */
  canInstallAttachment(buildingIndex, type) {
    const b = this.buildings[buildingIndex];
    if (!b || b.status !== 'active') return { valid: false, reason: '建筑不可用' };
    if (b._attachmentType) return { valid: false, reason: `已安装${b._attachmentType === 'hydro' ? '水力' : '风力'}装置` };
    if (!this._resourceSystem) return { valid: false, reason: '资源系统未就绪' };

    // 科技解锁检查
    if (this._techSystem) {
      if (type === 'hydro' && !this._techSystem.isResearched('waterwheel')) {
        return { valid: false, reason: '需要先研究「水车」科技' };
      }
      if (type === 'wind' && !this._techSystem.isResearched('sail')) {
        return { valid: false, reason: '需要先研究「风帆」科技' };
      }
    }

    const cfg = configRegistry.getBuilding(b.buildingId);
    if (!cfg || !cfg.maxWorkers || cfg.maxWorkers <= 0 || !cfg.production) {
      return { valid: false, reason: '该建筑不能加装装置' };
    }

    const costs = this._getAttachmentCost(type);
    if (!this._resourceSystem.canAfford(costs)) return { valid: false, reason: '资源不足' };

    // 水力：附近至少2格水
    if (type === 'hydro') {
      const map = this._mapConfig;
      if (!map) return { valid: false, reason: '地图未就绪' };
      let waterCount = 0;
      for (let dx = -3; dx <= 3; dx++) {
        for (let dy = -3; dy <= 3; dy++) {
          const cx = b.gridX + dx;
          const cy = b.gridY + dy;
          if (cx < 0 || cy < 0 || cx >= map.gridWidth || cy >= map.gridHeight) continue;
          if (map.grid[cy][cx] === 'W') waterCount++;
          if (waterCount >= 2) break;
        }
        if (waterCount >= 2) break;
      }
      if (waterCount < 2) return { valid: false, reason: '附近水源不足（需要至少2格水）' };
    }

    return { valid: true };
  }

  _getAttachmentCost(type) {
    if (type === 'hydro') {
      return [
        { resourceId: 'gear', amount: 20 },
        { resourceId: 'plank', amount: 50 },
        { resourceId: 'electronic_part', amount: 10 },
        { resourceId: 'steel', amount: 40 }
      ];
    }
    // wind
    return [
      { resourceId: 'gear', amount: 15 },
      { resourceId: 'plank', amount: 75 },
      { resourceId: 'electronic_part', amount: 10 },
      { resourceId: 'steel', amount: 35 },
      { resourceId: 'fur', amount: 30 }
    ];
  }

  /** 安装装置 */
  installAttachment(buildingIndex, type) {
    const check = this.canInstallAttachment(buildingIndex, type);
    if (!check.valid) return false;

    const b = this.buildings[buildingIndex];
    const costs = this._getAttachmentCost(type);
    this._resourceSystem.consumeAll(costs);
    b._attachmentType = type;
    // 装置替代工人：清空工人
    b.currentWorkers = 0;

    this._updateStore();
    eventBus.emit('workerChanged', { buildingIndex });
    eventBus.emit('attachmentChanged', { buildingIndex, type });
    return true;
  }

  /** 卸载装置 */
  uninstallAttachment(buildingIndex) {
    const b = this.buildings[buildingIndex];
    if (!b || !b._attachmentType) return false;

    const oldType = b._attachmentType;
    b._attachmentType = null;

    this._updateStore();
    eventBus.emit('attachmentChanged', { buildingIndex, type: null, oldType });
    return true;
  }

  demolishBuilding(buildingIndex, forced = false) {
    if (buildingIndex < 0 || buildingIndex >= this.buildings.length) return false;
    const building = this.buildings[buildingIndex];
    const config = configRegistry.getBuilding(building.buildingId);

    // demolishable 明确设为 false 的建筑不可拆除（如仓库），但敌人摧毁时忽略
    if (!forced && config && config.demolishable === false) return false;

    // 建筑被摧毁时处理
    const bConfig = configRegistry.getBuilding(building.buildingId);
    if (bConfig && building.status === 'active') {
      // 宿舍建筑：住在里面的人全部死亡
      if (bConfig.housingCapacity && bConfig.housingCapacity > 0) {
        const capacity = bConfig.housingCapacity;
        const killed = Math.min(capacity, Math.max(0, this._populationSystem.current - 1));
        if (killed > 0 && this._populationSystem) {
          this._populationSystem.current = Math.max(1, this._populationSystem.current - killed);
          this._populationSystem._updateStore();
          eventBus.emit('populationChanged', { current: this._populationSystem.current, direction: 'enemy' });
        }
      }
      // 仓库类建筑：物资丢失50%
      if (bConfig.storageMultiplier && this._resourceSystem) {
        for (const res of this._resourceSystem._resources) {
          const loss = Math.floor(res.amount * 0.5);
          if (loss > 0) {
            this._resourceSystem.tryConsume(res.id, loss);
          }
        }
      }
    }

    this.buildings.splice(buildingIndex, 1);
    this._updateStore();
    eventBus.emit('buildingDemolished', { buildingId: building.buildingId });
    return true;
  }

  /**
   * 检查建筑能否移动到新位置（与 canPlaceAt 类似，但排除建筑自身）
   */
  canMoveTo(buildingIndex, newGridX, newGridY) {
    const building = this.buildings[buildingIndex];
    if (!building || building.status !== 'active') return { valid: false, reason: '建筑不可移动' };

    const config = configRegistry.getBuilding(building.buildingId);
    if (!config) return { valid: false, reason: '建筑不存在' };

    // draggable 明确设为 false 的建筑不可拖动
    if (config.draggable === false) return { valid: false, reason: '该建筑不可拖动' };

    const w = config.footprint.width;
    const h = config.footprint.height;
    const map = this._mapConfig;

    // 迷雾检查：目标区域必须全部可见
    if (this._torchSystem && !this._torchSystem.canBuild(newGridX, newGridY, w, h)) {
      return { valid: false, reason: '目标区域尚未探索' };
    }

    // 边界检查
    if (!isAreaInBounds(newGridX, newGridY, w, h, map.gridWidth, map.gridHeight)) {
      return { valid: false, reason: '超出地图边界' };
    }

    // 地形检查
    for (let r = newGridY; r < newGridY + h; r++) {
      for (let c = newGridX; c < newGridX + w; c++) {
        const char = map.grid[r][c];
        const groundType = map.groundTypes[char];
        if (!groundType) {
          return { valid: false, reason: '无效地形' };
        }
        if (groundType.buildable === false) {
          return { valid: false, reason: `${groundType.name}上不可建造` };
        }
        if (groundType.buildable === 'restricted') {
          if (!config.allowedGrounds || !config.allowedGrounds.includes(char)) {
            return { valid: false, reason: `该建筑不能建造在${groundType.name}上` };
          }
        }
        if (config.allowedGrounds && config.allowedGrounds.length > 0) {
          if (!config.allowedGrounds.includes(char)) {
            const allowedNames = config.allowedGrounds
              .map(g => map.groundTypes[g]?.name || g).join('、');
            return { valid: false, reason: `该建筑只能建造在: ${allowedNames}` };
          }
        }
      }
    }

    // 重叠检查（排除自身）
    for (let i = 0; i < this.buildings.length; i++) {
      if (i === buildingIndex) continue;
      const b = this.buildings[i];
      const bConfig = configRegistry.getBuilding(b.buildingId);
      if (isAreaOverlap(newGridX, newGridY, w, h, b.gridX, b.gridY, bConfig.footprint.width, bConfig.footprint.height)) {
        return { valid: false, reason: '与已有建筑重叠' };
      }
    }

    // 重叠检查（已有火把，排除自身的火把）
    if (this._torchSystem) {
      const bldg = this.buildings[buildingIndex];
      for (const t of this._torchSystem.torches) {
        // 排除自身（火把建筑移动到新位置时，旧位置的火把还在）
        if (t.gridX === bldg.gridX && t.gridY === bldg.gridY && t.torchId === bldg.buildingId) continue;
        if (isAreaOverlap(newGridX, newGridY, w, h, t.gridX, t.gridY, 1, 1)) {
          return { valid: false, reason: '与已有火把重叠' };
        }
      }
    }

    // 重叠检查（活跃的事件标记）
    const removedIds = new Set(store.getState('removedEventMarkers') || []);
    const eventMarkers = map.eventMarkers || [];
    for (const marker of eventMarkers) {
      if (removedIds.has(marker.id)) continue;
      if (isAreaOverlap(newGridX, newGridY, w, h, marker.gridX, marker.gridY, 1, 1)) {
        return { valid: false, reason: '与事件标记重叠' };
      }
    }

    return { valid: true };
  }

  /**
   * 移动建筑到新位置
   */
  moveBuilding(buildingIndex, newGridX, newGridY) {
    const check = this.canMoveTo(buildingIndex, newGridX, newGridY);
    if (!check.valid) return false;

    const building = this.buildings[buildingIndex];
    building.gridX = newGridX;
    building.gridY = newGridY;

    this._updateStore();
    eventBus.emit('buildingMoved', { buildingIndex, building });
    return true;
  }

  // ===== Tick 处理 =====

  onTick(data) {
    const { isWorkPeriod } = data;

    for (const building of this.buildings) {
      if (building.status === 'constructing') {
        building.buildProgress++;
        const config = configRegistry.getBuilding(building.buildingId);
        if (building.buildProgress >= config.buildTime) {
          building.status = 'active';
          building.buildProgress = null;
          // 自动填充可用工人
          if (config.maxWorkers && config.maxWorkers > 0 && this._populationSystem) {
            const available = this._populationSystem.getAvailableWorkers();
            const toAssign = Math.min(config.maxWorkers, available);
            building.currentWorkers = toAssign;
          }
          eventBus.emit('buildingComplete', { building });
          this._updateStorageMultiplier();
          this._checkNewUnlocks(building.buildingId);
        }
      } else if (building.status === 'active' && isWorkPeriod) {
        this._processProduction(building);
        this._processSynthesis(building);
      } else if (building.status === 'active' && !isWorkPeriod && building._attachmentType) {
        // 有装置的建筑不受时段限制，全天24小时工作
        this._processProduction(building);
        this._processSynthesis(building);
      }

      // 装置天气损坏检测（每tick）
      if (building._attachmentType && this._weatherSystem) {
        const mod = this._weatherSystem.getAttachmentModifier();
        if (mod.damageChance > 0 && Math.random() < mod.damageChance) {
          const typeName = building._attachmentType === 'hydro' ? '水力' : '风力';
          building._attachmentType = null;
          eventBus.emit('combatBroadcast', { message: `💥 ${typeName}装置被暴风摧毁！` });
          eventBus.emit('attachmentChanged', { buildingIndex: this.buildings.indexOf(building), type: null });
        }
      }
    }

    this._updateStore();
    this._updateProgressStore();
  }

  /**
   * 更新 Store 中的建筑进度信息（供 UI 进度条使用）
   */
  _updateProgressStore() {
    const progresses = {};
    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      if (b.status === 'constructing') {
        const config = configRegistry.getBuilding(b.buildingId);
        progresses[i] = {
          progress: b.buildProgress,
          total: config ? config.buildTime : 999
        };
      }
      if (b.synthesisProgress) {
        progresses[i] = progresses[i] || {};
        progresses[i].synthProgress = b.synthesisProgress.progress;
        progresses[i].synthTotal = b.synthesisProgress.total;
      }
    }
    store.setState({ buildingProgresses: progresses, buildingProgressVersion: Date.now() });
  }

  _processProduction(building) {
    const config = configRegistry.getBuilding(building.buildingId);
    if (!config || !config.production) return;
    if (building.currentWorkers <= 0 && config.production.perWorker) {
      // 没有工人但有装置？装置替代工人
      if (!building._attachmentType) return;
    }

    const prod = config.production;
    let effectiveWorkers = building.currentWorkers || 0;

    // 装置逻辑：替代工人
    if (building._attachmentType && effectiveWorkers <= 0 && prod.perWorker) {
      effectiveWorkers = 1; // 装置算1个"工人"
      // 应用天气效率加成
      if (this._weatherSystem) {
        const mod = this._weatherSystem.getAttachmentModifier();
        if (mod.efficiency > 1) {
          effectiveWorkers = Math.ceil(effectiveWorkers * mod.efficiency);
        }
      }
    }

    // 获取相邻加成
    const bIndex = this.buildings.indexOf(building);
    const bonuses = bIndex >= 0 ? this.getAdjacencyBonuses(bIndex) : [];

    // 检查输入资源
    if (prod.input) {
      const inputAmount = prod.perWorker ? effectiveWorkers : 1;
      for (const inp of prod.input) {
        const needed = inp.amount * inputAmount;
        if (!this._resourceSystem.hasEnough(inp.resourceId, needed)) return; // 原料不足跳过
      }
      // 消耗输入
      for (const inp of prod.input) {
        this._resourceSystem.tryConsume(inp.resourceId, inp.amount * inputAmount);
      }
    }

    // 产出（应用相邻加成 + 人文政策产出倍率）
    if (prod.output) {
      const outputMultiplier = prod.perWorker ? effectiveWorkers : 1;
      const cultureProdMul = (this._cultureSystem ? (this._cultureSystem.getEffects().productionMul || 1) : 1) * (this._alchemySystem ? ((this._alchemySystem.getEffects().building || {}).productionMul || 1) : 1);
      for (const out of prod.output) {
        const baseAmount = out.amount * outputMultiplier * cultureProdMul;
        const adjusted = this.applyAdjacencyToProduction(
          building.buildingId, out.resourceId, baseAmount, 'production', bonuses
        );
        this._resourceSystem.addClamped(out.resourceId, Math.round(adjusted));
      }
    }
  }

  _processSynthesis(building) {
    if (!building.synthesisProgress) return;

    building.synthesisProgress.progress++;
    if (building.synthesisProgress.progress >= building.synthesisProgress.total) {
      // 合成完成，产出物品
      const config = configRegistry.getBuilding(building.buildingId);
      const recipe = (config.synthesisRecipes || []).find(r => r.id === building.synthesisProgress.recipeId);
      if (recipe && recipe.output && recipe.output.type === 'item') {
        eventBus.emit('synthesisComplete', { itemId: recipe.output.itemId, count: recipe.output.count });
      }
      building.synthesisProgress = null;
    }
  }

  // ===== 查询 =====

  getTotalHousingCapacity() {
    let total = 0;
    for (const b of this.buildings) {
      if (b.status !== 'active') continue;
      const config = configRegistry.getBuilding(b.buildingId);
      if (config && config.housingCapacity) {
        total += config.housingCapacity;
      }
    }
    return total;
  }

  /**
   * 获取每天食物产出量（每工人每天产出 foodCapacity 食物）
   */
  getTotalFoodProduction() {
    let total = 0;
    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      if (b.status !== 'active') continue;
      if (b.currentWorkers <= 0) continue;
      const config = configRegistry.getBuilding(b.buildingId);
      if (config && config.foodCapacity) {
        const baseAmount = config.foodCapacity * b.currentWorkers;
        const bonuses = this.getAdjacencyBonuses(i);
        const adjusted = this.applyAdjacencyToProduction(
          b.buildingId, 'food', baseAmount, 'foodCapacity', bonuses
        );
        total += Math.round(adjusted);
      }
    }
    return total;
  }

  /**
   * @deprecated 使用 getTotalFoodProduction() 替代
   */
  getTotalFoodCapacity() {
    return this.getTotalFoodProduction();
  }

  getTotalAssignedWorkers() {
    return this.buildings.reduce((sum, b) => sum + (b.currentWorkers || 0), 0);
  }

  /**
   * 计算所有活跃建筑的每Tick净资源产量
   * @returns {Object} { resourceId: netAmountPerTick }
   *   正数 = 净产出，负数 = 净消耗，0 不出现在结果中
   */
  getProductionRates() {
    const rates = {};

    for (let i = 0; i < this.buildings.length; i++) {
      const building = this.buildings[i];
      if (building.status !== 'active') continue;

      const config = configRegistry.getBuilding(building.buildingId);
      if (!config || !config.production) continue;

      const prod = config.production;
      const multiplier = prod.perWorker ? (building.currentWorkers || 0) : 1;
      if (multiplier <= 0) continue;

      // 获取相邻加成
      const bonuses = this.getAdjacencyBonuses(i);

      // 消耗（负数）
      if (prod.input) {
        for (const inp of prod.input) {
          rates[inp.resourceId] = (rates[inp.resourceId] || 0) - inp.amount * multiplier;
        }
      }

      // 产出（正数，应用相邻加成）
      if (prod.output) {
        for (const out of prod.output) {
          const baseAmount = out.amount * multiplier;
          const adjusted = this.applyAdjacencyToProduction(
            building.buildingId, out.resourceId, baseAmount, 'production', bonuses
          );
          rates[out.resourceId] = (rates[out.resourceId] || 0) + Math.round(adjusted);
        }
      }
    }

    return rates;
  }

  getBuildingCount(buildingId) {
    return this.buildings.filter(b => b.buildingId === buildingId).length;
  }

  hasBuilding(buildingId) {
    return this.buildings.some(b => b.buildingId === buildingId && b.status === 'active');
  }

  /**
   * 检查建筑是否已解锁（前置建筑已建造或科技已研究）
   */
  isUnlocked(buildingId) {
    const config = configRegistry.getBuilding(buildingId);
    if (!config) return false;

    const conditions = config.unlockConditions;
    if (!conditions || conditions.length === 0) return true;

    return conditions.every(cond => {
      switch (cond.type) {
        case 'building':
          return this.hasBuilding(cond.buildingId);
        case 'tech':
          return this._techSystem ? this._techSystem.isResearched(cond.techId) : false;
        default:
          return false;
      }
    });
  }

  /**
   * 获取建筑的解锁条件（用于UI展示）
   */
  getUnlockConditions(buildingId) {
    const config = configRegistry.getBuilding(buildingId);
    if (!config) return [];
    const conditions = config.unlockConditions;
    if (!conditions || conditions.length === 0) return [{ type: 'always', desc: '初始可用', met: true }];

    return conditions.map(cond => {
      switch (cond.type) {
        case 'building': {
          const bCfg = configRegistry.getBuilding(cond.buildingId);
          const name = bCfg ? bCfg.name : cond.buildingId;
          const met = this.hasBuilding(cond.buildingId);
          return { type: 'building', desc: `建造: ${name}`, met };
        }
        case 'tech': {
          const techConfig = configRegistry.get('techs') || [];
          const t = techConfig.find(t => t.id === cond.techId);
          const name = t ? t.name : cond.techId;
          const met = this._techSystem ? this._techSystem.isResearched(cond.techId) : false;
          return { type: 'tech', desc: `科技: ${name}`, met };
        }
        default:
          return { type: 'unknown', desc: `条件: ${cond.type}`, met: false };
      }
    });
  }

  /**
   * 获取建筑的解锁条件（用于UI展示）
   * @param {string} buildingId
   * @returns {Array<{type: string, desc: string, met: boolean}>}
   */
  getUnlockConditions(buildingId) {
    const config = configRegistry.getBuilding(buildingId);
    if (!config) return [];
    const conditions = config.unlockConditions;
    if (!conditions || conditions.length === 0) return [{ type: 'always', desc: '初始可用', met: true }];

    return conditions.map(cond => {
      switch (cond.type) {
        case 'building': {
          const bCfg = configRegistry.getBuilding(cond.buildingId);
          const name = bCfg ? bCfg.name : cond.buildingId;
          const met = this.hasBuilding(cond.buildingId);
          return { type: 'building', desc: `建造: ${name}`, met };
        }
        default:
          return { type: 'unknown', desc: `条件: ${cond.type}`, met: false };
      }
    });
  }

  /**
   * 获取本轮新解锁的建筑ID列表（UI读取后清除）
   */
  getNewlyUnlocked() {
    return [...this._newlyUnlocked];
  }

  /**
   * 清除新解锁标记（UI渲染后调用）
   */
  clearNewlyUnlocked() {
    this._newlyUnlocked.clear();
  }

  /**
   * 当建筑建造完成时，检查是否触发了其他建筑的解锁
   */
  _checkNewUnlocks(completedBuildingId) {
    const allBuildings = configRegistry.get('buildings') || [];
    for (const bConfig of allBuildings) {
      if (!bConfig.unlockConditions || bConfig.unlockConditions.length === 0) continue;

      // 检查这个新完成的建筑是否是解锁条件之一
      const isRelevant = bConfig.unlockConditions.some(c =>
        c.type === 'building' && c.buildingId === completedBuildingId
      );
      if (!isRelevant) continue;

      // 检查是否所有条件都已满足（建筑现在完全解锁）
      if (this.isUnlocked(bConfig.id)) {
        this._newlyUnlocked.add(bConfig.id);
      }
    }
  }

  _updateStorageMultiplier() {
    // 查找仓库类建筑的最大倍率
    let maxMultiplier = 1;
    for (const b of this.buildings) {
      if (b.status !== 'active') continue;
      const config = configRegistry.getBuilding(b.buildingId);
      if (config && config.storageMultiplier) {
        maxMultiplier = Math.max(maxMultiplier, config.storageMultiplier);
      }
    }
    if (this._resourceSystem) {
      this._resourceSystem.setStorageMultiplier(maxMultiplier);
    }
  }

  _updateStore() {
    store.setState({ buildingVersion: Date.now() });
  }

  // ===== 相邻加成系统 =====

  /**
   * 计算两个矩形区域之间的 Chebyshev 距离
   * 距离 0 = 相邻（紧挨着），距离 1 = 隔一格，以此类推
   */
  _chebyshevDistance(ax, ay, aw, ah, bx, by, bw, bh) {
    const aRight = ax + aw - 1;
    const aBottom = ay + ah - 1;
    const bRight = bx + bw - 1;
    const bBottom = by + bh - 1;

    // 水平间隙（负数表示重叠，0 表示相邻无间隙）
    const dx = Math.max(0, bx - aRight - 1, ax - bRight - 1);
    // 垂直间隙
    const dy = Math.max(0, by - aBottom - 1, ay - bBottom - 1);

    return Math.max(dx, dy);
  }

  /**
   * 获取某建筑当前生效的相邻加成
   * @returns {Array} [{ rule, targetBuilding, distance, bonusDesc }]
   */
  getAdjacencyBonuses(buildingIndex) {
    const building = this.buildings[buildingIndex];
    if (!building || building.status !== 'active') return [];
    const config = configRegistry.getBuilding(building.buildingId);
    if (!config) return [];
    return this._calcAdjacencyBonuses(
      building.buildingId, building.gridX, building.gridY,
      config.footprint.width, config.footprint.height
    );
  }

  /**
   * 计算假设位置下的相邻加成（用于放置预览/拖动预览）
   * @param {string} buildingId 建筑配置ID
   * @param {number} gridX 假设的X坐标
   * @param {number} gridY 假设的Y坐标
   * @returns {Array} [{ rule, targetBuilding, distance, bonusDesc, isPositive }]
   */
  getAdjacencyBonusesAt(buildingId, gridX, gridY) {
    const config = configRegistry.getBuilding(buildingId);
    if (!config) return [];
    return this._calcAdjacencyBonuses(
      buildingId, gridX, gridY,
      config.footprint.width, config.footprint.height
    );
  }

  /**
   * 计算假设位置下的所有相邻交互（双向、全距离）
   * 包括：placed building 作为接收方 + placed building 作为提供方
   * @param {string} buildingId 建筑配置ID
   * @param {number} gridX 假设的X坐标
   * @param {number} gridY 假设的Y坐标
   * @returns {Array} [{ rule, otherBuilding, otherName, distance, inRange, direction, isPositive, effectDesc }]
   */
  getAllAdjacencyInteractionsAt(buildingId, gridX, gridY) {
    const config = configRegistry.getBuilding(buildingId);
    if (!config) return [];
    const w = config.footprint.width;
    const h = config.footprint.height;

    const results = [];

    for (const rule of this._adjacencyConfig) {
      // Direction 1: placed building is the SOURCE (receiver) — other buildings give it bonuses
      if (rule.sourceBuildingId === buildingId) {
        for (const other of this.buildings) {
          if (other.buildingId !== rule.targetBuildingId) continue;
          if (other.status !== 'active') continue;
          const otherConfig = configRegistry.getBuilding(other.buildingId);
          if (!otherConfig) continue;

          const dist = this._chebyshevDistance(
            gridX, gridY, w, h,
            other.gridX, other.gridY,
            otherConfig.footprint.width, otherConfig.footprint.height
          );

          const inRange = dist <= rule.maxDistance;
          const isPositive = rule.effectType === 'multiplier'
            ? rule.effectValue >= 1
            : rule.effectValue >= 0;
          const otherName = otherConfig.name || other.buildingId;
          const effectDesc = rule.effectType === 'multiplier'
            ? `×${rule.effectValue}`
            : `${rule.effectValue >= 0 ? '+' : ''}${rule.effectValue}`;

          results.push({
            rule, otherBuilding: other, otherName,
            distance: dist, inRange,
            direction: 'receiving', // placed building receives the bonus
            isPositive,
            effectDesc
          });
        }
      }

      // Direction 2: placed building is the TARGET (provider) — it gives bonuses to other buildings
      if (rule.targetBuildingId === buildingId) {
        for (const other of this.buildings) {
          if (other.buildingId !== rule.sourceBuildingId) continue;
          if (other.status !== 'active') continue;
          const otherConfig = configRegistry.getBuilding(other.buildingId);
          if (!otherConfig) continue;

          const dist = this._chebyshevDistance(
            gridX, gridY, w, h,
            other.gridX, other.gridY,
            otherConfig.footprint.width, otherConfig.footprint.height
          );

          const inRange = dist <= rule.maxDistance;
          const isPositive = rule.effectType === 'multiplier'
            ? rule.effectValue >= 1
            : rule.effectValue >= 0;
          const otherName = otherConfig.name || other.buildingId;
          const effectDesc = rule.effectType === 'multiplier'
            ? `×${rule.effectValue}`
            : `${rule.effectValue >= 0 ? '+' : ''}${rule.effectValue}`;

          results.push({
            rule, otherBuilding: other, otherName,
            distance: dist, inRange,
            direction: 'providing', // placed building provides the bonus
            isPositive,
            effectDesc
          });
        }
      }
    }

    return results;
  }

  /**
   * 内部：计算给定建筑在给定位置下的相邻加成
   */
  _calcAdjacencyBonuses(sourceBuildingId, gridX, gridY, width, height) {
    const results = [];

    for (const rule of this._adjacencyConfig) {
      if (rule.sourceBuildingId !== sourceBuildingId) continue;

      // 查找范围内所有 targetBuildingId 的建筑
      for (const other of this.buildings) {
        if (other.buildingId !== rule.targetBuildingId) continue;
        if (other.status !== 'active') continue;

        const otherConfig = configRegistry.getBuilding(other.buildingId);
        if (!otherConfig) continue;

        const dist = this._chebyshevDistance(
          gridX, gridY, width, height,
          other.gridX, other.gridY,
          otherConfig.footprint.width, otherConfig.footprint.height
        );

        if (dist <= rule.maxDistance) {
          const isPositive = rule.effectType === 'multiplier'
            ? rule.effectValue >= 1
            : rule.effectValue >= 0;

          const otherName = otherConfig.name || other.buildingId;
          const effectDesc = rule.effectType === 'multiplier'
            ? `产出 ×${rule.effectValue}`
            : `产出 ${rule.effectValue >= 0 ? '+' : ''}${rule.effectValue}`;

          results.push({
            rule,
            targetBuilding: other,
            otherName,
            distance: dist,
            isPositive,
            bonusDesc: `靠近${otherName} (${dist}格): ${effectDesc}`
          });
        }
      }
    }

    return results;
  }

  /**
   * 应用相邻加成到产出值
   * @param {string} buildingId 建筑配置ID
   * @param {string} resourceId 产出的资源ID
   * @param {number} baseAmount 基础产出量
   * @param {string} applyToField 'production' | 'foodCapacity' | 'housingCapacity'
   * @param {Array} bonuses 已计算的加成列表（可选，不传则用 buildingIndex 查询）
   * @returns {number} 加成后的产出量
   */
  applyAdjacencyToProduction(buildingId, resourceId, baseAmount, applyToField, bonuses) {
    if (!bonuses) return baseAmount;

    let result = baseAmount;
    for (const bonus of bonuses) {
      const rule = bonus.rule;
      if (rule.applyToField !== applyToField) continue;
      if (rule.applyTo !== 'all' && rule.applyTo !== resourceId) continue;

      if (rule.effectType === 'multiplier') {
        result *= rule.effectValue;
      } else {
        result += rule.effectValue;
      }
    }

    // 确保不会变成负数
    return Math.max(0, result);
  }

  // ===== 存档接口 =====

  getAllStates() {
    return this.buildings.map(b => ({
      buildingId: b.buildingId,
      gridX: b.gridX,
      gridY: b.gridY,
      status: b.status,
      currentWorkers: b.currentWorkers,
      buildProgress: b.buildProgress,
      synthesisProgress: b.synthesisProgress,
      _attachmentType: b._attachmentType
    }));
  }

  restoreState(states) {
    if (!states) return;
    this.buildings = states.map(s => ({
      buildingId: s.buildingId,
      gridX: s.gridX,
      gridY: s.gridY,
      status: s.status,
      currentWorkers: s.currentWorkers || 0,
      buildProgress: s.buildProgress || null,
      synthesisProgress: s.synthesisProgress || null,
      _attachmentType: s._attachmentType || null
    }));
    this._updateStorageMultiplier();
    this._updateStore();
  }
}
