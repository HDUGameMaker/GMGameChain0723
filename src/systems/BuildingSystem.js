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

    // 订阅 tick 事件处理建造和生产
    eventBus.on('tick', (data) => this.onTick(data));
  }

  setResourceSystem(rs) { this._resourceSystem = rs; }
  setPopulationSystem(ps) { this._populationSystem = ps; }
  setItemSystem(is) { this._itemSystem = is; }
  setTorchSystem(ts) { this._torchSystem = ts; }

  init() {
    this._mapConfig = configRegistry.get('map');
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

    // maxCount 检查
    if (config.maxCount !== null && config.maxCount !== undefined) {
      const count = this.buildings.filter(b => b.buildingId === buildingId).length;
      if (count >= config.maxCount) {
        return { valid: false, reason: '已达最大数量' };
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

    // 消耗资源
    if (config.buildCost && config.buildCost.length > 0) {
      if (!this._resourceSystem.consumeAll(config.buildCost)) return false;
    }

    // 创建建筑实例
    const building = {
      buildingId,
      gridX,
      gridY,
      status: 'constructing',
      buildProgress: 0,
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

    return { valid: true, targetId: config.upgradesTo, cost: upgradeCost };
  }

  upgradeBuilding(buildingIndex) {
    const check = this.canUpgrade(buildingIndex);
    if (!check.valid) return false;

    const building = this.buildings[buildingIndex];
    const targetConfig = configRegistry.getBuilding(check.targetId);

    // 消耗资源
    this._resourceSystem.consumeAll(check.cost);

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

  demolishBuilding(buildingIndex) {
    if (buildingIndex < 0 || buildingIndex >= this.buildings.length) return false;
    const building = this.buildings[buildingIndex];
    const config = configRegistry.getBuilding(building.buildingId);

    // demolishable 明确设为 false 的建筑不可拆除（如仓库）
    if (config && config.demolishable === false) return false;

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
    if (building.currentWorkers <= 0 && config.production.perWorker) return;

    const prod = config.production;

    // 检查输入资源
    if (prod.input) {
      const inputAmount = prod.perWorker ? building.currentWorkers : 1;
      for (const inp of prod.input) {
        const needed = inp.amount * inputAmount;
        if (!this._resourceSystem.hasEnough(inp.resourceId, needed)) return; // 原料不足跳过
      }
      // 消耗输入
      for (const inp of prod.input) {
        this._resourceSystem.tryConsume(inp.resourceId, inp.amount * inputAmount);
      }
    }

    // 产出
    if (prod.output) {
      const outputMultiplier = prod.perWorker ? building.currentWorkers : 1;
      for (const out of prod.output) {
        this._resourceSystem.addClamped(out.resourceId, out.amount * outputMultiplier);
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

  getTotalFoodCapacity() {
    let total = 0;
    for (const b of this.buildings) {
      if (b.status !== 'active') continue;
      if (b.currentWorkers <= 0) continue; // 需要分配工人
      const config = configRegistry.getBuilding(b.buildingId);
      if (config && config.foodCapacity) {
        // foodCapacity 按每工人计算（如农田 7/工人 × 5工人 = 35）
        total += config.foodCapacity * b.currentWorkers;
      }
    }
    return total;
  }

  getTotalAssignedWorkers() {
    return this.buildings.reduce((sum, b) => sum + (b.currentWorkers || 0), 0);
  }

  getBuildingCount(buildingId) {
    return this.buildings.filter(b => b.buildingId === buildingId).length;
  }

  hasBuilding(buildingId) {
    return this.buildings.some(b => b.buildingId === buildingId && b.status === 'active');
  }

  /**
   * 检查建筑是否已解锁（前置建筑已建造）
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
        default:
          return false;
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

  // ===== 存档接口 =====

  getAllStates() {
    return this.buildings.map(b => ({
      buildingId: b.buildingId,
      gridX: b.gridX,
      gridY: b.gridY,
      status: b.status,
      currentWorkers: b.currentWorkers,
      buildProgress: b.buildProgress,
      synthesisProgress: b.synthesisProgress
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
      synthesisProgress: s.synthesisProgress || null
    }));
    this._updateStorageMultiplier();
    this._updateStore();
  }
}
