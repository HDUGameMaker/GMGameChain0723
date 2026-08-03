/**
 * BuildingSystem - 建筑系统
 * 管理建筑放置、建造、生产、升级、工人分配、合成
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';
import { isAreaInBounds, isAreaOverlap } from '../utils/gridUtils.js';
import { formatBonusEffect } from '../utils/BonusUtils.js';

export class BuildingSystem {
  constructor() {
    this.buildings = []; // 运行时建筑实例列表
    this.placingState = 'IDLE'; // IDLE | SELECTING | PLACING
    this.placingBuildingId = null;
    this._roadSystem = null;
    this._resourceSystem = null;
    this._populationSystem = null;
    this._resourceNodeSystem = null;
    this._armySystem = null;
    this._nextInstanceId = 1;
    this._mapConfig = null;
    this._newlyUnlocked = new Set(); // 本轮新解锁的建筑ID
    this._adjacencyConfig = []; // 相邻加成配置
    this._spellSystem = null; // 炼金法术系统（区域效率乘法）

    // 订阅 tick 事件处理建造和生产
    this._strategySystem = null;
    eventBus.on('workTick', (data) => this._onWorkTick(data));
    eventBus.on('tick', (data) => this._onAnyTick(data));
    eventBus.on('dayProductionTick', (data) => this._onDayProductionTick(data));
    eventBus.on('dayStart', (data) => this.applyPendingFarmCrops(data?.day));
  }

  _isWorkPeriodNow(timeData = null) {
    if (timeData && typeof timeData.isWorkPeriod === 'boolean') return timeData.isWorkPeriod;
    if (timeData?.period) {
      const globalConfig = configRegistry.get('global') || {};
      const workPeriods = globalConfig.WORK_PERIODS || ['morning', 'afternoon'];
      return workPeriods.includes(timeData.period);
    }
    const period = store.getState('timePeriod');
    return period === 'morning' || period === 'afternoon';
  }

  setResourceSystem(rs) { this._resourceSystem = rs; }
  setArmySystem(system) { this._armySystem = system; }
  setResourceNodeSystem(system) { this._resourceNodeSystem = system; }
  setPopulationSystem(ps) { this._populationSystem = ps; }
  setItemSystem(is) { this._itemSystem = is; }
  setTorchSystem(ts) { this._torchSystem = ts; }
  setRoadSystem(rs) { this._roadSystem = rs; }
  setTechSystem(ts) { this._techSystem = ts; }
  setWeatherSystem(ws) { this._weatherSystem = ws; }
  setCultureSystem(cs) { this._cultureSystem = cs; }
  setAlchemySystem(as) { this._alchemySystem = as; }
  setSpellSystem(ss) { this._spellSystem = ss; }
  setStrategySystem(ss) { this._strategySystem = ss; }
  setTerritorySystem(ts) { this._territorySystem = ts; }
  setHeroSystem(hs) { this._heroSystem = hs; }
  setLuxurySystem(ls) { this._luxurySystem = ls; }
  setEraSystem(es) { this._eraSystem = es; }

  init() {
    this._mapConfig = configRegistry.get('map');
    this._adjacencyConfig = configRegistry.get('adjacency_bonuses') || [];
  }

  // ===== 放置模式 =====

  enterPlacingMode(buildingId) {
    if (this._roadSystem?.isEditMode?.()) {
      this._roadSystem.exitEditMode();
    }
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
   * 地形改造解锁：完成「殖民补给」科技后，带 allowedGrounds 的资源采集建筑
   * 可忽略地形限制（仍不可建在 buildable:false 的山脉/屏障上）。
   */
  _terrainRestrictionBypassed(config) {
    if (!this._techSystem || !config?.allowedGrounds || config.allowedGrounds.length === 0) return false;
    return this._techSystem.isResearched('tech_exploration_8');
  }

  /**
   * 检查放置合法性
   */
  canPlaceAt(gridX, gridY, buildingId) {
    const config = configRegistry.getBuilding(buildingId);
    if (!config) return { valid: false, reason: '建筑不存在' };
    const unlockStatus = this.getUnlockStatus(buildingId);
    if (!unlockStatus.unlocked) {
      const reason = unlockStatus.conditions.find(condition => !condition.met)?.desc || '建筑尚未解锁';
      return { valid: false, reason: `尚未解锁：${reason}` };
    }

    const w = config.footprint.width;
    const h = config.footprint.height;
    const map = this._mapConfig;

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
        if (groundType.buildable === 'restricted' && !this._terrainRestrictionBypassed(config)) {
          if (!config.allowedGrounds || !config.allowedGrounds.includes(char)) {
            return { valid: false, reason: `该建筑不能建造在${groundType.name}上` };
          }
        }
        // 建筑有指定地形限制（如农田→草地、伐木营地→林地边缘）
        if (!this._terrainRestrictionBypassed(config) && config.allowedGrounds && config.allowedGrounds.length > 0) {
          if (!config.allowedGrounds.includes(char)) {
            const allowedNames = config.allowedGrounds
              .map(g => map.groundTypes[g]?.name || g).join('、');
            return { valid: false, reason: `该建筑只能建造在: ${allowedNames}` };
          }
        }
      }
    }

    // 道路上不可修建建筑
    if (config.requiredResourceNode && this._resourceNodeSystem) {
      const node = this._resourceNodeSystem.findNodeForArea(gridX, gridY, w, h, config.requiredResourceNode);
      if (!node) return { valid: false, reason: `必须覆盖空闲的${config.requiredResourceNode}资源点` };
    }

    if (this._roadSystem) {
      for (const road of this._roadSystem.roads) {
        if (isAreaOverlap(gridX, gridY, w, h, road.gridX, road.gridY, 1, 1)) {
          return { valid: false, reason: '道路上不能修建建筑' };
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

    // 建筑数量上限（占有术系统）：超上限只能用占术占地
    if (this._territorySystem) {
      if (this.buildings.length >= this._territorySystem.getBuildingCap()) {
        return { valid: false, reason: `已达建筑数量上限 ${this._territorySystem.getBuildingCap()}（升上限或用占术占地）` };
      }
    }

    // 道路依赖建筑：必须邻接道路
    if (config.roadRequired && this._roadSystem) {
      if (!this._satisfiesRoadDependency(gridX, gridY, w, h, buildingId)) {
        return { valid: false, reason: buildingId === 'work_shed' ? '工棚需要紧邻道路、工棚或仓库' : '该建筑需要紧邻道路（道路依赖）' };
      }
    }

    const adjacentCheck = this._checkAdjacentRequirements(config, gridX, gridY, w, h);
    if (!adjacentCheck.valid) return adjacentCheck;

    return { valid: true };
  }

  /**
   * 确认放置建筑
   */
  placeBuilding(gridX, gridY, buildingId, options = {}) {
    const config = configRegistry.getBuilding(buildingId);
    if (!config) return false;

    const check = this.canPlaceAt(gridX, gridY, buildingId);
    if (!check.valid) return false;

    // 消耗资源（应用人文政策建造成本倍率）
    const buildCostMul = (this._cultureSystem ? (this._cultureSystem.getEffects().buildCostMul || 1) : 1) * (this._alchemySystem ? ((this._alchemySystem.getEffects().building || {}).buildCostMul || 1) : 1) * (this._heroSystem?.getBonuses?.().buildCostMul || 1);
    if (config.buildCost && config.buildCost.length > 0) {
      const scaledCost = config.buildCost.map(c => ({ ...c, amount: Math.max(1, Math.round(c.amount * buildCostMul)) }));
      if (!this._resourceSystem.consumeAll(scaledCost)) return false;
    }

    // 取消建造时间机制：放下即落成可用（status 直接 active，不再走 constructing 倒计时）
    const instanceId = `building_${this._nextInstanceId++}`;
    const requiredNode = config.requiredResourceNode && this._resourceNodeSystem
      ? this._resourceNodeSystem.findNodeForArea(
        gridX, gridY, config.footprint.width, config.footprint.height, config.requiredResourceNode
      )
      : null;
    if (requiredNode && !this._resourceNodeSystem.claimNode(requiredNode.id, instanceId, config.requiredResourceNode).ok) return false;
    const building = {
      instanceId,
      resourceNodeId: requiredNode?.id || null,
      buildingId,
      gridX,
      gridY,
      status: 'active',
      buildProgress: null,
      currentWorkers: 0,
      synthesisProgress: null, // { recipeId, progress }
      cropId: this._isFarmConfig(config) ? 'grain' : null,
      pendingCropId: null,
      cropLuxuryProgress: 0
    };

    this.buildings.push(building);
    if (!options.keepPlacing) {
      this.exitPlacingMode();
    }
    this._updateStore();
    eventBus.emit('buildingPlaced', { building });
    // 落成即完成：触发完成回调（存储上限重算 / 连锁解锁 / buildingComplete 事件）
    this._completeConstruction(building, config);
    return true;
  }

  /**
   * 放置初始建筑（无消耗，直接 active）
   */
  placeInitialBuilding(buildingId, gridX, gridY) {
    const config = configRegistry.getBuilding(buildingId);
    const building = {
      instanceId: `building_${this._nextInstanceId++}`,
      resourceNodeId: null,
      buildingId,
      gridX,
      gridY,
      status: 'active',
      buildProgress: null,
      currentWorkers: 0,
      synthesisProgress: null,
      cropId: this._isFarmConfig(config) ? 'grain' : null,
      pendingCropId: null,
      cropLuxuryProgress: 0
    };
    this.buildings.push(building);
    this._updateStore();
  }

  // ===== 升级 =====

  canUpgrade(buildingIndex) {
    const building = this.buildings[buildingIndex];
    if (this._armySystem?.hasGarrisonAtBuilding?.(buildingIndex)) return { valid: false, reason: 'building_garrisoned' };
    if (!building || building.status !== 'active') return { valid: false, reason: '建筑不可升级' };

    const config = configRegistry.getBuilding(building.buildingId);
    if (!config || !config.upgradesTo) return { valid: false, reason: '无升级目标' };

    const targetConfig = configRegistry.getBuilding(config.upgradesTo);
    if (!targetConfig) return { valid: false, reason: '目标建筑不存在' };

    // 合成中不可升级（避免合成产物与升级冲突）
    if (building.synthesisProgress) return { valid: false, reason: '正在合成中' };

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
    const buildCostMul = (this._cultureSystem ? (this._cultureSystem.getEffects().buildCostMul || 1) : 1) * (this._alchemySystem ? ((this._alchemySystem.getEffects().building || {}).buildCostMul || 1) : 1) * (this._heroSystem?.getBonuses?.().buildCostMul || 1);
    const scaledUpgradeCost = check.cost.map(c => ({ ...c, amount: Math.max(1, Math.round(c.amount * buildCostMul)) }));
    this._resourceSystem.consumeAll(scaledUpgradeCost);

    // 取消建造时间机制：升级即落成可用（status 直接 active，不再走 constructing 倒计时）
    building.buildingId = check.targetId;
    building.status = 'active';
    building.buildProgress = null;
    building.startTick = undefined;
    building.startTimeProgress = undefined;
    building.currentWorkers = 0; // 工人遣返
    // 清除遗留的合成进度（升级后建筑变体可能无对应合成配方，残留进度会导致 UI/逻辑异常）
    building.synthesisProgress = null;
    if (this._isFarmConfig(targetConfig)) {
      building.cropId ||= 'grain';
    } else {
      building.cropId = null;
      building.pendingCropId = null;
      building.cropLuxuryProgress = 0;
    }

    this._updateStore();
    // 升级即落成：触发完成回调（存储上限重算 / 连锁解锁 / buildingComplete 事件）
    this._completeConstruction(building, targetConfig);
    eventBus.emit('buildingUpgraded', { building });
    return true;
  }

  // ===== 工人分配 =====

  recruitWorker(buildingIndex) {
    const building = this.buildings[buildingIndex];
    const config = building ? configRegistry.getBuilding(building.buildingId) : null;
    const recruitment = config?.uniqueFunction?.workerRecruitment;
    if (!building || building.status !== 'active' || !recruitment) {
      return { ok: false, reason: 'invalid_recruitment_building' };
    }

    const amount = recruitment.amount;
    const configuredCosts = recruitment.cost;
    if (!Number.isInteger(amount) || amount <= 0 || !Array.isArray(configuredCosts)
      || configuredCosts.some(cost => !cost?.resourceId || !Number.isFinite(cost.amount) || cost.amount <= 0)) {
      return { ok: false, reason: 'invalid_recruitment_config' };
    }

    const costsByResource = new Map();
    for (const cost of configuredCosts) {
      costsByResource.set(cost.resourceId, (costsByResource.get(cost.resourceId) || 0) + cost.amount);
    }
    const costs = [...costsByResource].map(([resourceId, costAmount]) => ({ resourceId, amount: costAmount }));

    if (!this._populationSystem
      || this._populationSystem.current + amount > this._populationSystem.getHousingCapacity()) {
      return { ok: false, reason: 'housing_full' };
    }
    if (!this._resourceSystem?.canAfford(costs)) {
      return { ok: false, reason: 'insufficient_resources' };
    }
    if (!this._resourceSystem.consumeAll(costs)) {
      return { ok: false, reason: 'insufficient_resources' };
    }
    if (!this._populationSystem.addPopulation(amount)) {
      for (const cost of costs) this._resourceSystem.addClamped(cost.resourceId, cost.amount);
      return { ok: false, reason: 'housing_full' };
    }

    return { ok: true, population: this._populationSystem.current };
  }

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

  _isFarmConfig(config) {
    return !!config && (config.category === 'agriculture' || (config.tags || []).includes('farm'));
  }

  _getCropDefinitions() {
    const config = configRegistry.get('economicOrders') || {};
    return Array.isArray(config.crops) ? config.crops : [];
  }

  _getCropDefinition(cropId) {
    return this._getCropDefinitions().find(crop => crop.id === cropId) || null;
  }

  _getEraGateState(eraId) {
    if (!eraId || !this._eraSystem) return true;
    const eras = this._eraSystem.getEras?.() || configRegistry.getHistoricalContent().eras || [];
    const currentId = this._eraSystem.getCurrentEra?.()?.id;
    const currentIndex = eras.findIndex(era => era.id === currentId);
    const requiredIndex = eras.findIndex(era => era.id === eraId);
    return requiredIndex < 0 || (currentIndex >= 0 && currentIndex >= requiredIndex);
  }

  _getCropUnlockState(crop) {
    const reasons = [];
    if (crop?.eraId && !this._getEraGateState(crop.eraId)) reasons.push(`需要时代 ${crop.eraId}`);
    for (const condition of crop?.unlockConditions || []) {
      if (condition.type === 'tech' && !this._techSystem?.isResearched?.(condition.techId)) {
        reasons.push(`需要科技 ${condition.techId}`);
      }
      if (condition.type === 'culture' && !this._cultureSystem?.isResearched?.(condition.cultureId)) {
        reasons.push(`需要人文 ${condition.cultureId}`);
      }
    }
    return { unlocked: reasons.length === 0, reasons };
  }

  _getBuildingGround(building) {
    const row = this._mapConfig?.grid?.[building?.gridY];
    return typeof row === 'string' ? row[building.gridX] : Array.isArray(row) ? row[building.gridX] : null;
  }

  setFarmCrop(buildingIndex, cropId) {
    const building = this.buildings[buildingIndex];
    const config = building ? configRegistry.getBuilding(building.buildingId) : null;
    if (!building || building.status !== 'active' || !this._isFarmConfig(config)) {
      return { ok: false, reason: 'not_farm' };
    }
    const crop = this._getCropDefinition(cropId);
    if (!crop) return { ok: false, reason: 'unknown_crop' };
    const unlock = this._getCropUnlockState(crop);
    if (!unlock.unlocked) return { ok: false, reason: 'crop_locked', details: unlock.reasons };
    const ground = this._getBuildingGround(building);
    if (ground && Array.isArray(crop.allowedGrounds) && !crop.allowedGrounds.includes(ground)) {
      return { ok: false, reason: 'terrain_mismatch' };
    }
    const effectiveOnDay = Math.max(1, Math.floor(store.getState('timeDay') || 1)) + 1;
    building.pendingCropId = crop.id;
    building.pendingCropDay = effectiveOnDay;
    this._updateStore();
    eventBus.emit('farmCropScheduled', { buildingIndex, cropId: crop.id, effectiveOnDay });
    return { ok: true, effectiveOnDay };
  }

  applyPendingFarmCrops(day = store.getState('timeDay') || 1) {
    const currentDay = Math.max(1, Math.floor(Number(day) || 1));
    let changed = false;
    for (let buildingIndex = 0; buildingIndex < this.buildings.length; buildingIndex++) {
      const building = this.buildings[buildingIndex];
      if (!building.pendingCropId || currentDay < (building.pendingCropDay || currentDay)) continue;
      building.cropId = building.pendingCropId;
      building.pendingCropId = null;
      building.pendingCropDay = null;
      building.cropLuxuryProgress = 0;
      changed = true;
      eventBus.emit('farmCropChanged', { buildingIndex, cropId: building.cropId, day: currentDay });
    }
    if (changed) this._updateStore();
    return changed;
  }

  getFarmOperation(buildingIndex) {
    const building = this.buildings[buildingIndex];
    const config = building ? configRegistry.getBuilding(building.buildingId) : null;
    if (!building || !this._isFarmConfig(config)) return null;
    const crop = this._getCropDefinition(building.cropId || 'grain');
    const workers = Math.max(0, building.currentWorkers || 0);
    return {
      buildingIndex,
      cropId: crop?.id || null,
      crop,
      pendingCropId: building.pendingCropId || null,
      pendingCropDay: building.pendingCropDay || null,
      workers,
      maxWorkers: config.maxWorkers || 0,
      outputs: (crop?.outputs || []).map(output => ({
        resourceId: output.resourceId,
        amount: Number((output.amount * workers).toFixed(4))
      })),
      availableCrops: this._getCropDefinitions().map(definition => ({
        ...definition,
        ...this._getCropUnlockState(definition)
      }))
    };
  }

  getFarmOperations() {
    return this.buildings.map((_, index) => this.getFarmOperation(index)).filter(Boolean);
  }

  _getProductionForBuilding(building, config) {
    if (!this._isFarmConfig(config)) return config?.production || null;
    const crop = this._getCropDefinition(building.cropId || 'grain');
    return crop ? { perWorker: true, output: crop.outputs || [] } : config?.production || null;
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
          if (['S', 'W'].includes(map.grid[cy][cx])) waterCount++;
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

  canDemolish(buildingIndex, forced = false) {
    if (buildingIndex < 0 || buildingIndex >= this.buildings.length) return { valid: false, reason: 'invalid_building' };
    if (this._armySystem?.hasGarrisonAtBuilding?.(buildingIndex)) return { valid: false, reason: 'building_garrisoned' };
    const config = configRegistry.getBuilding(this.buildings[buildingIndex].buildingId);
    if (!forced && config?.demolishable === false) return { valid: false, reason: 'building_not_demolishable' };
    return { valid: true };
  }

  demolishBuilding(buildingIndex, forced = false) {
    if (!this.canDemolish(buildingIndex, forced).valid) return false;
    const building = this.buildings[buildingIndex];
    const config = configRegistry.getBuilding(building.buildingId);

    // demolishable 明确设为 false 的建筑不可拆除（如大本营），但敌人摧毁时忽略
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
        for (const [resId, res] of Object.entries(this._resourceSystem._resources)) {
          const current = res.current;
          const loss = Math.floor(current * 0.5);
          if (loss > 0) {
            this._resourceSystem.tryConsume(resId, loss);
          }
        }
      }
    }

    this._resourceNodeSystem?.releaseNodeByBuilding(building.instanceId);
    this.buildings.splice(buildingIndex, 1);
    // 拆除仓库类建筑后需重算存储倍率（否则上限保持旧虚高值）
    this._updateStorageMultiplier();
    this._updateStore();
    eventBus.emit('buildingDemolished', { buildingId: building.buildingId });
    return true;
  }

  /** 找到覆盖 (x,y) 的建筑索引（无则 -1） */
  getBuildingIndexAt(x, y) {
    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      const config = configRegistry.getBuilding(b.buildingId);
      if (!config) continue;
      const w = config.footprint.width;
      const h = config.footprint.height;
      if (x >= b.gridX && x < b.gridX + w && y >= b.gridY && y < b.gridY + h) return i;
    }
    return -1;
  }

  /**
   * 检查建筑能否移动到新位置（与 canPlaceAt 类似，但排除建筑自身）
   */
  canMoveTo(buildingIndex, newGridX, newGridY) {
    const building = this.buildings[buildingIndex];
    if (this._armySystem?.hasGarrisonAtBuilding?.(buildingIndex)) return { valid: false, reason: 'building_garrisoned' };
    if (!building || building.status !== 'active') return { valid: false, reason: '建筑不可移动' };

    const config = configRegistry.getBuilding(building.buildingId);
    if (!config) return { valid: false, reason: '建筑不存在' };

    // draggable 明确设为 false 的建筑不可拖动
    if (config.draggable === false) return { valid: false, reason: '该建筑不可拖动' };

    const w = config.footprint.width;
    const h = config.footprint.height;
    const map = this._mapConfig;

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
        if (groundType.buildable === 'restricted' && !this._terrainRestrictionBypassed(config)) {
          if (!config.allowedGrounds || !config.allowedGrounds.includes(char)) {
            return { valid: false, reason: `该建筑不能建造在${groundType.name}上` };
          }
        }
        if (!this._terrainRestrictionBypassed(config) && config.allowedGrounds && config.allowedGrounds.length > 0) {
          if (!config.allowedGrounds.includes(char)) {
            const allowedNames = config.allowedGrounds
              .map(g => map.groundTypes[g]?.name || g).join('、');
            return { valid: false, reason: `该建筑只能建造在: ${allowedNames}` };
          }
        }
      }
    }

    // 道路上不可修建建筑
    if (config.requiredResourceNode && this._resourceNodeSystem) {
      const node = this._resourceNodeSystem.findNodeForArea(
        newGridX, newGridY, w, h, config.requiredResourceNode, building.instanceId
      );
      if (!node) return { valid: false, reason: `必须覆盖空闲的${config.requiredResourceNode}资源点` };
    }

    if (this._roadSystem) {
      for (const road of this._roadSystem.roads) {
        if (isAreaOverlap(newGridX, newGridY, w, h, road.gridX, road.gridY, 1, 1)) {
          return { valid: false, reason: '道路上不能修建建筑' };
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

    // 重叠检查（活跃的事件标记）
    const removedIds = new Set(store.getState('removedEventMarkers') || []);
    const eventMarkers = map.eventMarkers || [];
    for (const marker of eventMarkers) {
      if (removedIds.has(marker.id)) continue;
      if (isAreaOverlap(newGridX, newGridY, w, h, marker.gridX, marker.gridY, 1, 1)) {
        return { valid: false, reason: '与事件标记重叠' };
      }
    }

    // 道路依赖建筑：必须邻接道路
    if (config.roadRequired && this._roadSystem) {
      if (!this._satisfiesRoadDependency(newGridX, newGridY, w, h, building.buildingId, buildingIndex)) {
        return { valid: false, reason: building.buildingId === 'work_shed' ? '工棚需要紧邻道路、工棚或仓库' : '该建筑需要紧邻道路（道路依赖）' };
      }
    }

    const adjacentCheck = this._checkAdjacentRequirements(config, newGridX, newGridY, w, h, buildingIndex);
    if (!adjacentCheck.valid) return adjacentCheck;

    return { valid: true };
  }

  /**
   * 移动建筑到新位置
   */
  moveBuilding(buildingIndex, newGridX, newGridY) {
    const check = this.canMoveTo(buildingIndex, newGridX, newGridY);
    if (!check.valid) return false;

    const building = this.buildings[buildingIndex];
    const config = configRegistry.getBuilding(building.buildingId);
    const nextNode = config?.requiredResourceNode && this._resourceNodeSystem
      ? this._resourceNodeSystem.findNodeForArea(
        newGridX, newGridY, config.footprint.width, config.footprint.height,
        config.requiredResourceNode, building.instanceId
      )
      : null;
    if (nextNode?.id !== building.resourceNodeId) {
      this._resourceNodeSystem?.releaseNodeByBuilding(building.instanceId);
      if (nextNode && !this._resourceNodeSystem.claimNode(nextNode.id, building.instanceId, config.requiredResourceNode).ok) return false;
      building.resourceNodeId = nextNode?.id || null;
    }
    building.gridX = newGridX;
    building.gridY = newGridY;

    // 检查移动后建筑有效性
    const validity = this.checkBuildingValidity(buildingIndex);
    building._invalid = !validity.valid;
    building._invalidReason = validity.reason || '';

    this._updateStore();
    eventBus.emit('buildingMoved', { buildingIndex, building });
    return true;
  }

  checkBuildingValidity(buildingIndex) {
    const building = this.buildings[buildingIndex];
    if (!building) return { valid: true };
    const config = configRegistry.getBuilding(building.buildingId);
    if (!config) return { valid: true };
    // 道路依赖建筑检查
    if (config.roadRequired && this._roadSystem) {
      if (!this._satisfiesRoadDependency(building.gridX, building.gridY, config.footprint.width, config.footprint.height, building.buildingId, buildingIndex)) {
        return { valid: false, reason: building.buildingId === 'work_shed' ? '需要紧邻道路、工棚或仓库' : '需要紧邻道路' };
      }
    }
    const adjacentCheck = this._checkAdjacentRequirements(
      config,
      building.gridX,
      building.gridY,
      config.footprint.width,
      config.footprint.height,
      buildingIndex
    );
    if (!adjacentCheck.valid) return adjacentCheck;
    return { valid: true };
  }

  _satisfiesRoadDependency(gridX, gridY, w, h, buildingId, ignoreIndex = -1) {
    if (this._roadSystem?.hasAdjacentRoad(gridX, gridY, w, h)) return true;
    if (buildingId !== 'work_shed') return false;
    return this._hasAdjacentWorkShedAnchor(gridX, gridY, w, h, ignoreIndex);
  }

  _hasAdjacentWorkShedAnchor(gridX, gridY, w, h, ignoreIndex = -1) {
    for (let i = 0; i < this.buildings.length; i++) {
      if (i === ignoreIndex) continue;
      const other = this.buildings[i];
      const otherConfig = configRegistry.getBuilding(other.buildingId);
      if (!otherConfig) continue;
      const isAnchor = other.buildingId === 'work_shed' || otherConfig.storageMultiplier || otherConfig.tags?.includes('warehouse');
      if (!isAnchor) continue;
      if (this._areRectsSideAdjacent(
        gridX, gridY, w, h,
        other.gridX, other.gridY, otherConfig.footprint.width, otherConfig.footprint.height
      )) {
        return true;
      }
    }
    return false;
  }

  _areRectsSideAdjacent(ax, ay, aw, ah, bx, by, bw, bh) {
    const ax2 = ax + aw - 1;
    const ay2 = ay + ah - 1;
    const bx2 = bx + bw - 1;
    const by2 = by + bh - 1;
    const horizontalAdj = (ax2 + 1 === bx || bx2 + 1 === ax) && !(ay2 < by || by2 < ay);
    const verticalAdj = (ay2 + 1 === by || by2 + 1 === ay) && !(ax2 < bx || bx2 < ax);
    return horizontalAdj || verticalAdj;
  }

  /** 检查所有建筑有效性，更新_invalid标记并重绘 */
  checkAllBuildingsValidity() {
    let changed = false;
    for (let i = 0; i < this.buildings.length; i++) {
      const check = this.checkBuildingValidity(i);
      const wasInvalid = this.buildings[i]._invalid;
      this.buildings[i]._invalid = !check.valid;
      this.buildings[i]._invalidReason = check.valid ? '' : (check.reason || '');
      if (wasInvalid !== this.buildings[i]._invalid) changed = true;
    }
    if (changed) this._updateStore();
  }

  // ===== Tick 处理 =====

  _onWorkTick(data) {
    this._processProductionTick(data, { cycle: 'tick', attachmentsOnly: false, processSynthesis: true });
  }

  _onAnyTick(data) {
    this._processProductionTick(data, { cycle: 'tick', attachmentsOnly: true, processSynthesis: true });
    this._processAttachmentWeatherTick();
  }

  _onDayProductionTick(data) {
    this._processDailyFoodProduction();
    this._processProductionTick(data, { cycle: 'day', attachmentsOnly: false, processSynthesis: false, skipOutputResourceIds: ['food'] });
    this._processProductionTick(data, { cycle: 'day', attachmentsOnly: true, processSynthesis: false, skipOutputResourceIds: ['food'] });
  }

  _processProductionTick(data, options) {
    const { cycle, attachmentsOnly, processSynthesis, skipOutputResourceIds } = options;
    let changed = false;
    for (const building of this.buildings) {
      if (building.status !== 'active') continue;
      if (!!building._attachmentType !== attachmentsOnly) continue;
      if (!building._attachmentType && !data?.isWorkPeriod) continue;

      const config = configRegistry.getBuilding(building.buildingId);
      if (config?.production && (config.productionCycle || 'tick') === cycle) {
        this._processProduction(building, { skipOutputResourceIds });
        changed = true;
      }
      if (processSynthesis) {
        this._processSynthesis(building);
        changed = true;
      }
    }

    if (changed) {
      this._updateStore();
      this._updateProgressStore();
    }
  }

  _processDailyFoodProduction() {
    let amount = this.getTotalFoodProduction({ cycle: 'day' });
    if (amount > 0 && this._weatherSystem) {
      amount = Math.round(amount * this._weatherSystem.getFoodModifier());
      const population = this._populationSystem?.current || store.getState('populationCurrent') || 0;
      const rainBonus = this._weatherSystem.getRainBonus();
      if (rainBonus > 0) {
        amount += rainBonus * Math.max(1, population);
      }
    }
    if (amount > 0) {
      this._resourceSystem?.addClamped('food', amount);
    }
  }

  _processAttachmentWeatherTick() {
    let changed = false;
    for (const building of this.buildings) {
      // 装置天气损坏检测（每tick）
      if (building._attachmentType && this._weatherSystem) {
        const mod = this._weatherSystem.getAttachmentModifier();
        if (mod.damageChance > 0 && Math.random() < mod.damageChance) {
          const typeName = building._attachmentType === 'hydro' ? '水力' : '风力';
          building._attachmentType = null;
          eventBus.emit('combatBroadcast', { message: `💥 ${typeName}装置被暴风摧毁！` });
          eventBus.emit('attachmentChanged', { buildingIndex: this.buildings.indexOf(building), type: null });
          changed = true;
        }
      }
    }

    if (changed) {
      this._updateStore();
      this._updateProgressStore();
    }
  }

  /**
   * 按每个建筑自己的开始时间推进建造，避免同一 tick 内新放置建筑共享全局进度。
   */
  updateConstructionProgress() {
    const state = store.getState();
    const now = (state.timeTick ?? 0) + (state.timeProgress ?? 0);
    let changed = false;

    for (const building of this.buildings) {
      if (building.status !== 'constructing') continue;

      const config = configRegistry.getBuilding(building.buildingId);
      if (!config) continue;

      if (building.startTick === undefined || building.startTimeProgress === undefined) {
        const existingProgress = building.buildProgress ?? 0;
        building.startTick = Math.max(0, Math.floor(now - existingProgress));
        building.startTimeProgress = 0;
      }

      const start = (building.startTick ?? 0) + (building.startTimeProgress ?? 0);
      const elapsed = Math.max(0, now - start);
      const buildTime = Math.max(0, config.buildTime || 0);
      const nextProgress = buildTime > 0 ? Math.min(buildTime, Math.floor(elapsed)) : 0;

      if ((building.buildProgress ?? 0) !== nextProgress) {
        building.buildProgress = nextProgress;
        changed = true;
      }

      if (elapsed >= buildTime) {
        this._completeConstruction(building, config);
        changed = true;
      }
    }

    if (changed) {
      this._updateStore();
      this._updateProgressStore();
    }
  }

  _completeConstruction(building, config) {
    building.status = 'active';
    building.buildProgress = null;
    building.startTick = undefined;
    building.startTimeProgress = undefined;
    // 岗位由玩家显式分配；建筑落成只保留合法的既有岗位数。
    building.currentWorkers = Math.min(building.currentWorkers || 0, config.maxWorkers || 0);
    eventBus.emit('buildingComplete', { building });
    this._updateStorageMultiplier();
    this._checkNewUnlocks(building.buildingId);
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

  _processProduction(building, options = {}) {
    const config = configRegistry.getBuilding(building.buildingId);
    const prod = this._getProductionForBuilding(building, config);
    if (!config || !prod) return;
    if (building.currentWorkers <= 0 && prod.perWorker) {
      // 没有工人但有装置？装置替代工人
      if (!building._attachmentType) return;
    }

    const effectiveWorkers = this._getEffectiveProductionWorkers(building, config);

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
      const skipOutputResourceIds = new Set(options.skipOutputResourceIds || []);
      for (const out of prod.output) {
        if (skipOutputResourceIds.has(out.resourceId)) continue;
        const cultureProdMul = this._getProductionMultiplier(out.resourceId, building);
        const baseAmount = out.amount * outputMultiplier * cultureProdMul;
        const adjusted = this.applyAdjacencyToProduction(
          building.buildingId, out.resourceId, baseAmount, 'production', bonuses
        );
        const amount = Math.round(adjusted);
        if (out.resourceId === 'icon_inspiration') {
          // 酒馆产出的灵感走独立的灵感储备，供文化研究使用
          store.setState({ inspiration: (store.getState('inspiration') || 0) + amount });
        } else {
          this._resourceSystem.addClamped(out.resourceId, amount);
        }
      }
    }

    if (this._isFarmConfig(config)) {
      const crop = this._getCropDefinition(building.cropId || 'grain');
      if (crop?.luxury && effectiveWorkers > 0) {
        building.cropLuxuryProgress = Math.max(0, Number(building.cropLuxuryProgress) || 0) + effectiveWorkers;
        while (building.cropLuxuryProgress >= crop.luxury.intervalWorkerTicks) {
          building.cropLuxuryProgress -= crop.luxury.intervalWorkerTicks;
          this._luxurySystem?.addLuxury?.(crop.luxury.id, 1);
        }
      }
    }

    // 炼金材料副产品（概率×数量模型）
    const boundLuxuryYield = config.boundLuxuryYield;
    if (boundLuxuryYield && effectiveWorkers > 0 && building.resourceNodeId) {
      const node = this._resourceNodeSystem?.getNode?.(building.resourceNodeId);
      if (node?.type === 'luxury' && node.luxuryId) {
        const interval = Math.max(1, Math.floor(Number(boundLuxuryYield.intervalWorkerTicks) || 12));
        const amount = Math.max(1, Math.floor(Number(boundLuxuryYield.amount) || 1));
        building.boundLuxuryProgress = Math.max(0, Number(building.boundLuxuryProgress) || 0) + effectiveWorkers;
        while (building.boundLuxuryProgress >= interval) {
          building.boundLuxuryProgress -= interval;
          this._luxurySystem?.addLuxury?.(node.luxuryId, amount);
        }
      }
    }

    if (prod.alchemyYields && this._alchemySystem) {
      for (const drop of prod.alchemyYields) {
        if (Math.random() > (drop.chance || 0)) continue;
        const min = drop.min || 1;
        const max = drop.max || min;
        const amount = min + Math.floor(Math.random() * (max - min + 1));
        if (amount <= 0) continue;
        this._alchemySystem.addMaterial(drop.materialId, amount);
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
      if (b._invalid) continue; // 失效建筑不提供住宅上限
      const config = configRegistry.getBuilding(b.buildingId);
      const capacity = config?.housingCapacity ?? config?.uniqueFunction?.housingCapacity ?? 0;
      if (capacity) {
        total += capacity;
      }
    }
    return total;
  }

  /**
   * 获取士兵容纳上限（军营/营房的 soldierCapacity 之和）
   */
  getTotalSoldierCapacity() {
    let total = 0;
    for (const b of this.buildings) {
      if (b.status !== 'active') continue;
      if (b._invalid) continue; // 失效建筑不提供士兵上限
      const config = configRegistry.getBuilding(b.buildingId);
      if (config && config.soldierCapacity) {
        total += config.soldierCapacity;
      }
    }
    return total;
  }

  /**
   * 获取当前士兵总数（训练储备 + 军团编制，1 单位 = 1 士兵）
   * 战斗部署单位属于已砍系统，实际为 0，故不计入。
   */
  getTotalSoldierCount() {
    let total = 0;
    const avail = store.getState('availableUnits') || {};
    for (const n of Object.values(avail)) total += Math.max(0, n || 0);
    const armies = store.getState('armies') || [];
    for (const army of armies) {
      total += (army.unitIds || []).length;
    }
    return total;
  }

  /**
   * 获取每天食物产出量（每工人每天产出 foodCapacity 食物）
   */

  /**
   * 获取每天食物产出量（每工人每天产出 foodCapacity 食物）
   */
  getTotalFoodProduction(options = {}) {
    const cycleFilter = options.cycle || null;
    let total = 0;
    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      if (b.status !== 'active') continue;
      const config = configRegistry.getBuilding(b.buildingId);
      const cycle = config?.productionCycle || 'tick';
      if (cycleFilter && cycle !== cycleFilter) continue;
      const prod = this._getProductionForBuilding(b, config);
      if (config && config.foodCapacity) {
        if (b.currentWorkers <= 0) continue;
        const baseAmount = config.foodCapacity * b.currentWorkers * this._getProductionMultiplier('food', b);
        const bonuses = this.getAdjacencyBonuses(i);
        const adjusted = this.applyAdjacencyToProduction(
          b.buildingId, 'food', baseAmount, 'foodCapacity', bonuses
        );
        total += Math.round(adjusted);
      }
      if (prod?.output) {
        const effectiveWorkers = this._getEffectiveProductionWorkers(b, config);
        const multiplier = prod.perWorker ? effectiveWorkers : 1;
        if (multiplier <= 0) continue;
        const cyclesPerDay = config.productionCycle === 'day' ? 1 : this._getProductionCyclesPerDay(b, config);
        const bonuses = this.getAdjacencyBonuses(i);
        for (const out of prod.output) {
          if (out.resourceId !== 'food') continue;
          const baseAmount = out.amount * multiplier * this._getProductionMultiplier('food', b);
          const adjusted = this.applyAdjacencyToProduction(
            b.buildingId, 'food', baseAmount, 'production', bonuses
          );
          total += Math.round(adjusted) * cyclesPerDay;
        }
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

  getAssignedWorkersByJob() {
    const result = {};
    for (const building of this.buildings) {
      if (building.status !== 'active' || !building.currentWorkers) continue;
      const config = configRegistry.getBuilding(building.buildingId);
      const job = config?.jobType || config?.category || 'general';
      result[job] = (result[job] || 0) + building.currentWorkers;
    }
    return result;
  }

  getWorkforceOutputs() {
    const output = { science: 0, civics: 0, gold: 0, satisfaction: 0 };
    for (const building of this.buildings) {
      if (building.status !== 'active' || building._invalid) continue;
      const config = configRegistry.getBuilding(building.buildingId);
      const fn = config?.uniqueFunction || {};
      const workers = Math.max(0, building.currentWorkers || 0);
      output.science += workers * (fn.sciencePerWorker || 0);
      output.civics += workers * (fn.civicPerWorker || 0);
      output.gold += workers * (fn.goldPerWorker || 0);
      output.satisfaction += fn.satisfactionBonus || 0;
    }
    const luxury = this._luxurySystem?.getBonuses?.() || {};
    output.science *= luxury.sciencePointMul || 1;
    output.civics *= luxury.civicPointMul || 1;
    output.gold *= luxury.goldProductionMul || 1;
    return output;
  }

  getBuildingFunctionState(buildingIndex) {
    const building = this.buildings[buildingIndex];
    if (!building) return null;
    const config = configRegistry.getBuilding(building.buildingId);
    if (!config) return null;
    const fn = config.uniqueFunction || {};
    const workers = Math.max(0, building.currentWorkers || 0);
    const perWorker = fn.sciencePerWorker || fn.civicPerWorker || fn.goldPerWorker || 0;
    return {
      unlockedSystem: fn.unlockSystem || null,
      workers,
      maxWorkers: config.maxWorkers || 0,
      outputPerTick: workers * perWorker,
      jobType: config.jobType || config.category || 'general'
    };
  }

  /**
   * 计算所有活跃建筑折算到每日的资源产出/消耗。
   * 显示层统一使用日口径；底层 tick 建筑按一天内实际工作次数折算。
   * @returns {Object} { resourceId: { produced, consumed, net } }
   */
  getDailyResourceFlow() {
    const flow = {};

    for (let i = 0; i < this.buildings.length; i++) {
      const building = this.buildings[i];
      if (building.status !== 'active') continue;

      const config = configRegistry.getBuilding(building.buildingId);
      const prod = this._getProductionForBuilding(building, config);
      if (!config || !prod) continue;

      const cyclesPerDay = this._getProductionCyclesPerDay(building, config);
      const effectiveWorkers = this._getEffectiveProductionWorkers(building, config);
      const multiplier = prod.perWorker ? effectiveWorkers : 1;
      if (multiplier <= 0) continue;

      // 获取相邻加成
      const bonuses = this.getAdjacencyBonuses(i);

      // 消耗
      if (prod.input) {
        for (const inp of prod.input) {
          this._addResourceFlow(flow, inp.resourceId, 0, inp.amount * multiplier * cyclesPerDay);
        }
      }

      // 产出（应用相邻加成）
      if (prod.output) {
        for (const out of prod.output) {
          const cultureProdMul = this._getProductionMultiplier(out.resourceId, building);
          const baseAmount = out.amount * multiplier * cultureProdMul;
          const adjusted = this.applyAdjacencyToProduction(
            building.buildingId, out.resourceId, baseAmount, 'production', bonuses
          );
          const amount = Math.round(adjusted) * cyclesPerDay;
          const resourceId = out.resourceId === 'icon_inspiration' ? 'inspiration' : out.resourceId;
          this._addResourceFlow(flow, resourceId, amount, 0);
        }
      }
    }

    return flow;
  }

  _addResourceFlow(flow, resourceId, produced, consumed) {
    if (!resourceId) return;
    if (!flow[resourceId]) flow[resourceId] = { produced: 0, consumed: 0, net: 0 };
    flow[resourceId].produced += produced || 0;
    flow[resourceId].consumed += consumed || 0;
    flow[resourceId].net = flow[resourceId].produced - flow[resourceId].consumed;
  }

  /**
   * @deprecated HUD 统一使用 getDailyResourceFlow() 的日口径。
   */
  getProductionRates() {
    const daily = this.getDailyResourceFlow();
    const rates = {};
    for (const [resourceId, entry] of Object.entries(daily)) {
      rates[resourceId] = entry.net;
    }
    return rates;
  }

  getBuildingDailyProductionPreview(buildingIndex) {
    const building = this.buildings[buildingIndex];
    if (!building) return null;
    const config = configRegistry.getBuilding(building.buildingId);
    const prod = this._getProductionForBuilding(building, config);
    if (!config || !prod) return null;

    const cyclesPerDay = this._getProductionCyclesPerDay(building, config);
    const effectiveWorkers = building.status === 'active' ? this._getEffectiveProductionWorkers(building, config) : 0;
    const multiplier = prod.perWorker ? effectiveWorkers : 1;
    const bonuses = this.getAdjacencyBonuses(buildingIndex);

    const inputStandard = (prod.input || []).map(inp => ({
      resourceId: inp.resourceId,
      amount: inp.amount
    }));
    const outputStandard = (prod.output || []).map(out => ({
      resourceId: out.resourceId === 'icon_inspiration' ? 'inspiration' : out.resourceId,
      amount: out.amount
    }));

    const dailyInput = inputStandard.map(inp => ({
      resourceId: inp.resourceId,
      amount: Math.round(inp.amount * multiplier * cyclesPerDay)
    }));
    const dailyOutput = (prod.output || []).map(out => {
      const cultureProdMul = this._getProductionMultiplier(out.resourceId, building);
      const baseAmount = out.amount * multiplier * cultureProdMul;
      const adjusted = this.applyAdjacencyToProduction(
        building.buildingId, out.resourceId, baseAmount, 'production', bonuses
      );
      return {
        resourceId: out.resourceId === 'icon_inspiration' ? 'inspiration' : out.resourceId,
        amount: Math.round(adjusted) * cyclesPerDay
      };
    });

    return {
      perWorker: !!prod.perWorker,
      cycle: config.productionCycle || 'tick',
      cyclesPerDay,
      currentWorkers: building.currentWorkers || 0,
      effectiveWorkers,
      hasAttachment: !!building._attachmentType,
      inputStandard,
      outputStandard,
      dailyInput,
      dailyOutput
    };
  }

  _getEffectiveProductionWorkers(building, config) {
    const prod = config?.production;
    if (!prod?.perWorker) return 1;
    let effectiveWorkers = building.currentWorkers || 0;
    if (building._attachmentType && effectiveWorkers <= 0) {
      effectiveWorkers = 1;
      if (this._weatherSystem) {
        const mod = this._weatherSystem.getAttachmentModifier();
        if (mod.efficiency > 1) {
          effectiveWorkers = Math.ceil(effectiveWorkers * mod.efficiency);
        }
      }
    }
    return effectiveWorkers;
  }

  _getProductionCyclesPerDay(building, config) {
    const cycle = config?.productionCycle || 'tick';
    if (cycle === 'day') return 1;
    const ticksPerPeriod = this._getTicksPerPeriod();
    const globalConfig = configRegistry.get('global') || {};
    const periodNames = globalConfig.PERIOD_NAMES || ['morning', 'afternoon', 'evening', 'night'];
    const workPeriods = globalConfig.WORK_PERIODS || ['morning', 'afternoon'];
    return ticksPerPeriod * (building._attachmentType ? periodNames.length : workPeriods.length);
  }

  _getTicksPerPeriod() {
    const globalConfig = configRegistry.get('global') || {};
    const periodDuration = globalConfig.PERIOD_DURATION || 30;
    const tickInterval = globalConfig.TICK_INTERVAL || 10;
    return Math.max(1, Math.floor(periodDuration / tickInterval));
  }

  _getProductionMultiplier(resourceId, building = null) {
    const cultureEffects = this._cultureSystem ? this._cultureSystem.getEffects() : null;
    const globalCultureMul = cultureEffects?.productionMul || 1;
    const techEffects = this._techSystem?.getEffects?.() || null;
    const techMul = techEffects?.productionMul || 1;
    const scopedTechMul = resourceId ? (techEffects?.resourceProductionMul?.[resourceId] || 1) : 1;
    const scopedCultureMul = resourceId ? (cultureEffects?.resourceProductionMul?.[resourceId] || 1) : 1;
    const alchemyMul = this._alchemySystem ? ((this._alchemySystem.getEffects().building || {}).productionMul || 1) : 1;
    // 炼金法术：区域内生产建筑效率乘法（按建筑所在区域连乘），叠入产出链
    const spellMul = this._strategySystem?.getProductionMultiplier?.(resourceId) || 1;
    const heroMul = this._heroSystem?.getBonuses?.().productionMul || 1;
    const luxuryEffects = this._luxurySystem?.getBonuses?.() || {};
    const luxuryMul = resourceId === 'gold' ? (luxuryEffects.goldProductionMul || 1) : 1;
    return globalCultureMul * techMul * scopedTechMul * scopedCultureMul * alchemyMul * spellMul * heroMul * luxuryMul;
  }

  getBuildingCount(buildingId) {
    return this.buildings.filter(b => b.buildingId === buildingId).length;
  }

  hasBuilding(buildingId) {
    return this.buildings.some(b => b.buildingId === buildingId && b.status === 'active');
  }

  _checkAdjacentRequirements(config, gridX, gridY, width, height, excludeIndex = -1) {
    const groups = this._normalizeAdjacentRequirementGroups(config);
    if (groups.length === 0) return { valid: true };

    const failed = [];
    for (const group of groups) {
      const conditions = group.conditions || [];
      if (conditions.length === 0) continue;
      const checks = conditions.map(req => this._checkAdjacentRequirement(req, gridX, gridY, width, height, excludeIndex));
      if (checks.every(check => check.valid)) return { valid: true };
      failed.push(checks.filter(check => !check.valid).map(check => check.label).join(' + '));
    }

    return {
      valid: false,
      reason: failed.length > 0 ? `需要满足临近条件之一：${failed.join(' 或 ')}` : '临近条件未满足'
    };
  }

  _normalizeAdjacentRequirementGroups(config) {
    if (Array.isArray(config?.adjacentRequirementGroups)) {
      return config.adjacentRequirementGroups
        .map(group => Array.isArray(group) ? { conditions: group } : group)
        .filter(group => Array.isArray(group?.conditions) && group.conditions.length > 0);
    }
    if (Array.isArray(config?.adjacentRequirements) && config.adjacentRequirements.length > 0) {
      return [{ conditions: config.adjacentRequirements }];
    }
    return [];
  }

  _checkAdjacentRequirement(req, gridX, gridY, width, height, excludeIndex = -1) {
    const type = req?.type || (req?.buildingId ? 'building' : '');
    const maxDistance = Math.max(1, Number.isFinite(req?.maxDistance) ? req.maxDistance : 1);

    if (type === 'road') {
      const valid = this._hasRoadWithinDistance(gridX, gridY, width, height, maxDistance);
      return { valid, label: `道路（${maxDistance}格内）` };
    }

    if (type === 'building') {
      const buildingId = req?.buildingId || '';
      const matched = this._hasBuildingWithinDistance(
        gridX, gridY, width, height,
        other => other.buildingId === buildingId,
        maxDistance,
        excludeIndex
      );
      const requiredConfig = configRegistry.getBuilding(buildingId);
      const name = requiredConfig ? requiredConfig.name : buildingId;
      return { valid: matched, label: `${name || '建筑'}（${maxDistance}格内）` };
    }

    if (type === 'tag') {
      const tag = req?.tag || '';
      const matched = this._hasBuildingWithinDistance(
        gridX, gridY, width, height,
        other => {
          const otherConfig = configRegistry.getBuilding(other.buildingId);
          return !!otherConfig?.tags?.includes(tag);
        },
        maxDistance,
        excludeIndex
      );
      return { valid: matched, label: `标签 ${tag || '-'}（${maxDistance}格内）` };
    }

    return { valid: true, label: '' };
  }

  _hasRoadWithinDistance(gridX, gridY, width, height, maxDistance) {
    if (!this._roadSystem) return false;
    if (maxDistance <= 1 && typeof this._roadSystem.hasAdjacentRoad === 'function') {
      return this._roadSystem.hasAdjacentRoad(gridX, gridY, width, height);
    }
    for (const road of this._roadSystem.roads || []) {
      if (road.buildProgress !== null && road.buildProgress !== undefined) continue;
      const dist = this._chebyshevDistance(gridX, gridY, width, height, road.gridX, road.gridY, 1, 1);
      if (dist <= maxDistance) return true;
    }
    return false;
  }

  _hasBuildingWithinDistance(gridX, gridY, width, height, predicate, maxDistance, excludeIndex = -1) {
    for (let i = 0; i < this.buildings.length; i++) {
      if (i === excludeIndex) continue;
      const other = this.buildings[i];
      if (!other || other.status !== 'active') continue;
      if (!predicate(other)) continue;
      const otherConfig = configRegistry.getBuilding(other.buildingId);
      if (!otherConfig) continue;

      const otherWidth = otherConfig.footprint.width;
      const otherHeight = otherConfig.footprint.height;
      if (maxDistance <= 1) {
        if (this._areRectsSideAdjacent(
          gridX, gridY, width, height,
          other.gridX, other.gridY,
          otherWidth, otherHeight
        )) {
          return true;
        }
        continue;
      }
      const dist = this._chebyshevDistance(
        gridX, gridY, width, height,
        other.gridX, other.gridY,
        otherWidth, otherHeight
      );
      if (dist <= maxDistance) return true;
    }
    return false;
  }

  /**
   * 检查建筑是否已解锁（前置建筑已建造或科技已研究）
   */
  isUnlocked(buildingId) {
    return this.getUnlockStatus(buildingId).unlocked;
  }

  getUnlockStatus(buildingId) {
    const config = configRegistry.getBuilding(buildingId);
    if (!config) return { unlocked: false, conditions: [] };
    const conditions = this.getUnlockConditions(buildingId);
    return { unlocked: conditions.every(condition => condition.met), conditions };
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
    const result = [];
    let eraCondition = null;
    if (config.eraId && this._eraSystem) {
      const eras = this._eraSystem.getEras?.() || configRegistry.getHistoricalContent().eras || [];
      const currentEra = this._eraSystem.getCurrentEra?.();
      const currentIndex = eras.findIndex(era => era.id === currentEra?.id);
      const requiredIndex = eras.findIndex(era => era.id === config.eraId);
      const requiredEra = eras[requiredIndex];
      eraCondition = {
        type: 'era',
        desc: `时代: ${requiredEra?.name || config.eraId}`,
        met: requiredIndex < 0 || (currentIndex >= 0 && currentIndex >= requiredIndex)
      };
    }

    for (const cond of conditions || []) {
      result.push((() => {
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
        case 'culture': {
          const cultures = configRegistry.get('culture') || [];
          const culture = cultures.find(x => x.id === cond.cultureId);
          const met = this._cultureSystem ? this._cultureSystem.isResearched(cond.cultureId) : false;
          return { type: 'culture', desc: `文化: ${culture ? culture.name : cond.cultureId}`, met };
        }
        case 'doctrine': {
          const doctrines = configRegistry.get('doctrines') || [];
          const id = cond.doctrineId;
          const d = doctrines.find(x => x.id === id);
          const met = this._cultureSystem ? this._cultureSystem.getDoctrineResearched().includes(id) : false;
          return { type: 'culture', desc: `文化: ${d ? d.name : id}`, met };
        }
        case 'civilization': {
          const civilization = this._eraSystem?.getCivilizations?.().find(item => item.id === cond.civilizationId)
            || configRegistry.getHistoricalContent().civilizations.find(item => item.id === cond.civilizationId);
          const met = this._eraSystem?.getCivilizationForEra?.(config.eraId)?.id === cond.civilizationId;
          return { type: 'civilization', desc: `文明限定: ${civilization?.name || cond.civilizationId}`, met };
        }
        default:
          return { type: 'unknown', desc: `条件: ${cond.type}`, met: false };
      }
      })());
    }
    if (eraCondition) result.push(eraCondition);
    if (result.length === 0) result.push({ type: 'always', desc: '初始可用', met: true });
    return result;
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
   * 获取某建筑当前提供给其他建筑的相邻加成。
   * @returns {Array} [{ rule, receiverBuilding, otherName, distance, isPositive, bonusDesc }]
   */
  getProvidedAdjacencyBonuses(buildingIndex) {
    const building = this.buildings[buildingIndex];
    if (!building || building.status !== 'active') return [];
    const config = configRegistry.getBuilding(building.buildingId);
    if (!config) return [];

    const results = [];
    for (const rule of this._adjacencyConfig) {
      if (rule.targetBuildingId !== building.buildingId) continue;

      for (const other of this.buildings) {
        if (other.buildingId !== rule.sourceBuildingId) continue;
        if (other.status !== 'active') continue;
        const otherConfig = configRegistry.getBuilding(other.buildingId);
        if (!otherConfig) continue;

        const dist = this._chebyshevDistance(
          building.gridX, building.gridY,
          config.footprint.width, config.footprint.height,
          other.gridX, other.gridY,
          otherConfig.footprint.width, otherConfig.footprint.height
        );
        if (dist > rule.maxDistance) continue;

        const isPositive = rule.effectType === 'multiplier'
          ? rule.effectValue >= 1
          : rule.effectValue >= 0;
        const otherName = otherConfig.name || other.buildingId;
        const effectDesc = formatBonusEffect(rule);

        results.push({
          rule,
          receiverBuilding: other,
          otherName,
          distance: dist,
          isPositive,
          bonusDesc: `提供给${otherName} (${dist}格): ${effectDesc}`
        });
      }
    }

    return results;
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
          const effectDesc = formatBonusEffect(rule);

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
          const effectDesc = formatBonusEffect(rule);

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
          const effectDesc = formatBonusEffect(rule);

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
      instanceId: b.instanceId,
      resourceNodeId: b.resourceNodeId || null,
      buildingId: b.buildingId,
      gridX: b.gridX,
      gridY: b.gridY,
      status: b.status,
      currentWorkers: b.currentWorkers,
      buildProgress: b.buildProgress,
      startTick: b.startTick,
      startTimeProgress: b.startTimeProgress,
      synthesisProgress: b.synthesisProgress,
      _attachmentType: b._attachmentType,
      cropId: b.cropId || null,
      pendingCropId: b.pendingCropId || null,
      pendingCropDay: b.pendingCropDay || null,
      cropLuxuryProgress: Math.max(0, Number(b.cropLuxuryProgress) || 0)
    }));
  }

  restoreState(states) {
    if (!states) return;
    let maximumInstance = 0;
    this.buildings = states.map((s, index) => {
      const config = configRegistry.getBuilding(s.buildingId);
      const isFarm = this._isFarmConfig(config);
      const cropId = isFarm && this._getCropDefinition(s.cropId || 'grain') ? (s.cropId || 'grain') : null;
      const pendingCropId = isFarm && this._getCropDefinition(s.pendingCropId) ? s.pendingCropId : null;
      const instanceId = s.instanceId || `building_${index + 1}`;
      const instanceNumber = Number.parseInt(instanceId.replace('building_', ''), 10);
      if (Number.isFinite(instanceNumber)) maximumInstance = Math.max(maximumInstance, instanceNumber);
      return {
        instanceId,
        resourceNodeId: s.resourceNodeId || null,
        buildingId: s.buildingId,
        gridX: s.gridX,
        gridY: s.gridY,
        status: s.status,
        currentWorkers: s.currentWorkers || 0,
        buildProgress: s.buildProgress !== undefined ? s.buildProgress : null,
        startTick: s.startTick,
        startTimeProgress: s.startTimeProgress,
        synthesisProgress: s.synthesisProgress || null,
        _attachmentType: s._attachmentType || null,
        cropId,
        pendingCropId,
        pendingCropDay: pendingCropId ? Math.max(1, Math.floor(Number(s.pendingCropDay) || 1)) : null,
        cropLuxuryProgress: Math.max(0, Number(s.cropLuxuryProgress) || 0)
      };
    });
    this._nextInstanceId = maximumInstance + 1;
    for (const building of this.buildings) {
      const config = configRegistry.getBuilding(building.buildingId);
      if (!config?.requiredResourceNode || !this._resourceNodeSystem) continue;
      const node = (building.resourceNodeId && this._resourceNodeSystem.getNode(building.resourceNodeId))
        || this._resourceNodeSystem.findNodeForArea(
          building.gridX, building.gridY, config.footprint.width, config.footprint.height,
          config.requiredResourceNode, building.instanceId
        );
      if (!node) continue;
      this._resourceNodeSystem.claimNode(node.id, building.instanceId, config.requiredResourceNode);
      building.resourceNodeId = node.id;
    }
    this._updateStorageMultiplier();
    this._updateStore();
  }
}
