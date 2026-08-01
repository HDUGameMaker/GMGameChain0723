/**
 * ExpeditionSystem - 探险系统
 * 管理探险准备、进行、循环和结算
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';
import { applyFlatAndMultiplier, collectExpeditionBonuses } from '../utils/BonusUtils.js';

export class ExpeditionSystem {
  constructor() {
    this._expeditions = [];
    this._expedition = null; // 兼容旧调用：始终指向第一个队列或 null
    this._resourceSystem = null;
    this._itemSystem = null;
    this._buildingSystem = null;
    this._populationSystem = null;
    this._alchemySystem = null;
    this._cultureSystem = null;
    this._timeSystem = null;

    eventBus.on('tick', (data) => this.onTick(data));
  }

  setSystems({ resource, item, building, population, alchemy, culture, time }) {
    this._resourceSystem = resource;
    this._itemSystem = item;
    this._buildingSystem = building;
    this._populationSystem = population;
    this._alchemySystem = alchemy || null;
    this._cultureSystem = culture || null;
    this._timeSystem = time || null;
  }

  /**
   * 多阶段探索占用的是同一批工人：所需人数取选中区域中的最大 workerCost。
   */
  getTotalWorkerCost(regionIds) {
    let maxCost = 0;
    for (const regionId of regionIds) {
      if (!regionId) continue;
      const region = configRegistry.getRegion(regionId);
      if (region && region.workerCost) {
        maxCost = Math.max(maxCost, region.workerCost);
      }
    }
    return maxCost;
  }

  getExpeditionConfig() {
    return configRegistry.get('expeditionGlobal') || {
      expeditionPeriods: 3,
      baseBackpackCapacity: 10,
      baseResourceCapacity: 100,
      baseQueueLimit: 1
    };
  }

  getQueueLimit() {
    const expConfig = this.getExpeditionConfig();
    const base = Number.isFinite(expConfig.baseQueueLimit) ? expConfig.baseQueueLimit : 1;
    const cultureEffects = this._cultureSystem?.getEffects ? this._cultureSystem.getEffects() : {};
    const bonus = cultureEffects.expeditionQueueBonus || 0;
    return Math.max(1, base + bonus);
  }

  getPeriodNames() {
    const globalConfig = configRegistry.get('global') || {};
    const periodNames = Array.isArray(globalConfig.PERIOD_NAMES) ? globalConfig.PERIOD_NAMES : [];
    return periodNames.length > 0 ? periodNames : ['morning', 'afternoon', 'evening', 'night'];
  }

  getActiveCount() {
    return this._expeditions.length;
  }

  // ===== 区域解锁 =====

  getAvailableRegions(entranceRegionIds) {
    const regions = configRegistry.get('regions') || [];
    const equippedItems = this._itemSystem ? this._itemSystem.getEquippedInstances() : [];
    const equippedItemIds = equippedItems.map(i => i.itemId);

    const filteredRegions = entranceRegionIds && entranceRegionIds.length > 0
      ? regions.filter(r => entranceRegionIds.includes(r.id))
      : regions;

    return filteredRegions.map(region => {
      const unlocked = this._isRegionUnlocked(region, equippedItemIds);
      let unlockHint = '';
      if (!unlocked && region.unlockConditions) {
        const hints = region.unlockConditions.map(c => {
          if (c.type === 'item') {
            const itemCfg = configRegistry.getItem(c.itemId);
            return `携带: ${itemCfg ? itemCfg.name : c.itemId}`;
          }
          if (c.type === 'building') {
            const bCfg = configRegistry.getBuilding(c.buildingId);
            return `建造: ${bCfg ? bCfg.name : c.buildingId}`;
          }
          return '';
        });
        unlockHint = hints.join(' 或 ');
      }
      return { region, unlocked, unlockHint };
    });
  }

  _isRegionUnlocked(region, equippedItemIds) {
    const conditions = region.unlockConditions;
    if (!conditions || conditions.length === 0) return true;

    return conditions.some(cond => {
      switch (cond.type) {
        case 'item':
          return equippedItemIds.includes(cond.itemId);
        case 'building':
          return this._buildingSystem ? this._buildingSystem.hasBuilding(cond.buildingId) : false;
        default:
          return false;
      }
    });
  }

  isRegionUnlocked(regionId) {
    const region = configRegistry.getRegion(regionId);
    if (!region) return false;
    const equippedItems = this._itemSystem ? this._itemSystem.getEquippedInstances() : [];
    return this._isRegionUnlocked(region, equippedItems.map(i => i.itemId));
  }

  // ===== 出发 =====

  canStartExpedition(regionIds, instanceIds = []) {
    const expConfig = this.getExpeditionConfig();
    const queueLimit = this.getQueueLimit();

    if (this._expeditions.length >= queueLimit) {
      return { valid: false, reason: `探索队列已满（${this._expeditions.length}/${queueLimit}）` };
    }

    const compacted = this._compactRegions(regionIds);

    if (compacted.length === 0) {
      return { valid: false, reason: '请至少选择一个区域' };
    }

    if (this._hasGaps(regionIds)) {
      return { valid: false, reason: '区域选择不能有空隙，请从第一个阶段开始连续选择' };
    }

    if (compacted.length > expConfig.expeditionPeriods) {
      return { valid: false, reason: `最多选择 ${expConfig.expeditionPeriods} 个区域` };
    }

    const equippedItems = this._itemSystem ? this._itemSystem.getEquippedInstances() : [];
    const equippedItemIds = equippedItems.map(i => i.itemId);
    for (const regionId of compacted) {
      const region = configRegistry.getRegion(regionId);
      if (!region) return { valid: false, reason: '区域不存在' };
      if (!this._isRegionUnlocked(region, equippedItemIds)) {
        return { valid: false, reason: `区域 ${region.name} 未解锁` };
      }
    }

    const totalWorkerCost = this.getTotalWorkerCost(compacted);
    if (this._populationSystem) {
      const available = this._populationSystem.getAvailableWorkers();
      if (available < totalWorkerCost) {
        return { valid: false, reason: `可用工人不足（需要 ${totalWorkerCost} 人，当前可用 ${available} 人）` };
      }
    }

    const selectedItems = this._getOwnedInstancesByIds(instanceIds);
    if (selectedItems.length !== instanceIds.length) {
      return { valid: false, reason: '携带物品状态异常' };
    }
    if (selectedItems.some(i => i.inExpedition)) {
      return { valid: false, reason: '携带物品正在其他探索队列中' };
    }

    return { valid: true, compactedRegions: compacted, totalWorkerCost };
  }

  _compactRegions(regionIds) {
    const result = [...regionIds];
    while (result.length > 0 && result[result.length - 1] === null) {
      result.pop();
    }
    return result;
  }

  _hasGaps(regionIds) {
    let seenNull = false;
    for (const id of regionIds) {
      if (id !== null && seenNull) return true;
      if (id === null) seenNull = true;
    }
    return false;
  }

  startExpedition(regionIds, instanceIds = []) {
    const check = this.canStartExpedition(regionIds, instanceIds);
    if (!check.valid) return false;

    const expConfig = this.getExpeditionConfig();
    const compactedRegions = check.compactedRegions || this._compactRegions(regionIds);

    if (this._itemSystem && instanceIds.length > 0) {
      if (!this._itemSystem.markExpedition(instanceIds)) return false;
    }

    const occupiedWorkers = check.totalWorkerCost || this.getTotalWorkerCost(compactedRegions);
    if (this._populationSystem && occupiedWorkers > 0) {
      this._populationSystem.occupyForExpedition(occupiedWorkers);
    }

    const selectedItems = this._getOwnedInstancesByIds(instanceIds);
    const itemBonuses = collectExpeditionBonuses(selectedItems);

    const expedition = {
      id: this._createExpeditionId(),
      status: 'active',
      autoLoop: true,
      cyclesCompleted: 0,
      regions: [...compactedRegions],
      currentPeriodIndex: 0,
      ticksInCurrentPeriod: 0,
      items: [...instanceIds],
      resourcePool: {},
      materialPool: {},
      totalDiscarded: {},
      triggeredEvents: [],
      yieldMultipliers: itemBonuses.yieldMultipliers,
      yieldFlatBonuses: itemBonuses.yieldFlatBonuses,
      backpackCapacity: expConfig.baseBackpackCapacity + itemBonuses.backpackCapacityBonus,
      resourceCapacity: expConfig.baseResourceCapacity + itemBonuses.resourceCapacityBonus,
      occupiedWorkers
    };

    this._expeditions.push(expedition);
    this._syncLegacy();
    this._updateStore();
    eventBus.emit('expeditionStarted', { expedition });
    return true;
  }

  // ===== Tick 推进 =====

  onTick(data) {
    if (this._expeditions.length === 0) return;

    let changed = false;
    const activeExpeditions = [...this._expeditions];
    for (const exp of activeExpeditions) {
      if (!this._expeditions.includes(exp) || exp.status !== 'active') continue;

      exp.ticksInCurrentPeriod++;
      changed = true;

      if (exp.ticksInCurrentPeriod >= this.getTicksPerPeriod()) {
        this._settlePeriodYield(exp, data?.period);
        exp.ticksInCurrentPeriod = 0;
        exp.currentPeriodIndex++;

        if (exp.currentPeriodIndex >= exp.regions.length) {
          this._completeCycle(exp);
        }
      }
    }

    if (changed) {
      this._syncLegacy();
      this._updateStore();
    }
  }

  _settlePeriodYield(exp, periodName = null) {
    const regionId = exp.regions[exp.currentPeriodIndex];
    const region = configRegistry.getRegion(regionId);
    if (!region) return;

    const expeditionItems = this._getOwnedInstancesByIds(exp.items || []);
    const regionBonuses = expeditionItems.length > 0
      ? collectExpeditionBonuses(expeditionItems, { regionId })
      : {
          yieldMultipliers: exp.yieldMultipliers || {},
          yieldFlatBonuses: exp.yieldFlatBonuses || {}
        };

    const periodNames = this.getPeriodNames();
    const resolvedPeriod = periodName || periodNames[exp.currentPeriodIndex % periodNames.length];
    const baseYields = region.baseYields?.[resolvedPeriod];
    if (!baseYields) return;

    let poolTotal = Object.values(exp.resourcePool).reduce((s, v) => s + v, 0);

    for (const [resourceId, baseAmount] of Object.entries(baseYields)) {
      if (baseAmount <= 0) continue;

      const actualYield = Math.floor(applyFlatAndMultiplier(
        baseAmount, resourceId, regionBonuses.yieldMultipliers, regionBonuses.yieldFlatBonuses
      ));
      if (actualYield <= 0) continue;

      const remaining = exp.resourceCapacity - poolTotal;
      if (remaining <= 0) {
        exp.totalDiscarded[resourceId] = (exp.totalDiscarded[resourceId] || 0) + actualYield;
        continue;
      }

      const added = Math.min(actualYield, remaining);
      const discarded = actualYield - added;

      exp.resourcePool[resourceId] = (exp.resourcePool[resourceId] || 0) + added;
      poolTotal += added;

      if (discarded > 0) {
        exp.totalDiscarded[resourceId] = (exp.totalDiscarded[resourceId] || 0) + discarded;
      }
    }

    const materialDrops = region.materialDrops;
    if (materialDrops && materialDrops.length > 0) {
      for (const drop of materialDrops) {
        if (Math.random() > (drop.chance || 0)) continue;
        const min = drop.min || 1;
        const max = drop.max || min;
        const amount = min + Math.floor(Math.random() * (max - min + 1));
        if (amount <= 0) continue;
        exp.materialPool[drop.materialId] = (exp.materialPool[drop.materialId] || 0) + amount;
      }
    }
  }

  getTicksPerPeriod() {
    return Math.max(1, this._timeSystem?.TICKS_PER_PERIOD || 3);
  }

  // ===== 完成 / 召回 =====

  _completeCycle(exp) {
    const result = this._depositCycleResult(exp, false);
    exp.cyclesCompleted = (exp.cyclesCompleted || 0) + 1;

    eventBus.emit('expeditionComplete', result);

    if (exp.autoLoop) {
      this._resetForNextCycle(exp);
      return result;
    }

    this._removeExpedition(exp, true);
    return result;
  }

  completeExpedition(id) {
    const exp = this._findExpedition(id);
    if (!exp) return null;
    const result = this._depositCycleResult(exp, true);
    this._removeExpedition(exp, true);
    this._updateStore();
    eventBus.emit('expeditionComplete', result);
    return result;
  }

  cancelExpedition(id) {
    const exp = this._findExpedition(id);
    if (!exp) return false;
    const result = this._depositCycleResult(exp, true);
    this._removeExpedition(exp, true);
    this._updateStore();
    eventBus.emit('expeditionCancelled', { expeditionId: exp.id, result });
    return true;
  }

  _depositCycleResult(exp, returned) {
    if (this._resourceSystem) {
      for (const [resourceId, amount] of Object.entries(exp.resourcePool || {})) {
        this._resourceSystem.addClamped(resourceId, amount);
      }
    }

    const materialYielded = { ...(exp.materialPool || {}) };
    if (this._alchemySystem) {
      for (const [materialId, amount] of Object.entries(materialYielded)) {
        this._alchemySystem.addMaterial(materialId, amount);
      }
    }

    return {
      expeditionId: exp.id,
      cycle: returned ? (exp.cyclesCompleted || 0) + 1 : (exp.cyclesCompleted || 0) + 1,
      autoLoop: exp.autoLoop,
      returned,
      regions: [...exp.regions],
      totalYielded: { ...(exp.resourcePool || {}) },
      totalDiscarded: { ...(exp.totalDiscarded || {}) },
      materialYielded,
      triggeredEvents: [...(exp.triggeredEvents || [])],
      returnedItems: returned ? [...(exp.items || [])] : []
    };
  }

  _resetForNextCycle(exp) {
    exp.currentPeriodIndex = 0;
    exp.ticksInCurrentPeriod = 0;
    exp.resourcePool = {};
    exp.materialPool = {};
    exp.totalDiscarded = {};
    exp.triggeredEvents = [];
  }

  _removeExpedition(exp, releaseResources) {
    this._expeditions = this._expeditions.filter(e => e !== exp);

    if (releaseResources && this._populationSystem && exp.occupiedWorkers > 0) {
      this._populationSystem.releaseFromExpedition(exp.occupiedWorkers);
    }

    if (releaseResources && this._itemSystem && exp.items && exp.items.length > 0) {
      this._itemSystem.returnFromExpedition(exp.items);
    }

    this._syncLegacy();
  }

  // ===== 查询 =====

  getCurrentExpedition(id) {
    if (id) return this._findExpedition(id);
    return this._expeditions[0] || null;
  }

  getExpeditions() {
    return this._expeditions.map(exp => ({ ...exp }));
  }

  getExpectedYields(regionIds, instanceIds) {
    const yields = {};

    let itemBonuses = { yieldMultipliers: {}, yieldFlatBonuses: {} };
    let selectedItems = [];
    if (this._itemSystem) {
      selectedItems = this._getOwnedInstancesByIds(instanceIds || []);
      itemBonuses = collectExpeditionBonuses(selectedItems);
    }

    for (let i = 0; i < regionIds.length; i++) {
      const regionId = regionIds[i];
      if (!regionId) continue;
      const region = configRegistry.getRegion(regionId);
      if (!region) continue;
      const regionBonuses = this._itemSystem
        ? collectExpeditionBonuses(selectedItems, { regionId })
        : itemBonuses;
      const periodName = this._getProjectedSettlementPeriodName(i);
      const baseYields = region.baseYields?.[periodName];
      if (!baseYields) continue;

      for (const [resourceId, baseAmount] of Object.entries(baseYields)) {
        const actual = Math.floor(applyFlatAndMultiplier(
          baseAmount, resourceId, regionBonuses.yieldMultipliers, regionBonuses.yieldFlatBonuses
        ));
        yields[resourceId] = (yields[resourceId] || 0) + actual;
      }
    }

    return yields;
  }

  _getProjectedSettlementPeriodName(stageIndex) {
    const periodNames = this.getPeriodNames();
    if (periodNames.length === 0) return null;
    const ticksPerPeriod = this.getTicksPerPeriod();
    const currentPeriodIndex = this._timeSystem?.periodIndex ?? 0;
    const tickInPeriod = this._timeSystem?.tickInPeriod ?? 0;
    const currentTickInDay = currentPeriodIndex * ticksPerPeriod + tickInPeriod;
    const settlementTickInDay = currentTickInDay + ticksPerPeriod * (stageIndex + 1) - 1;
    const periodIndex = Math.floor(settlementTickInDay / ticksPerPeriod) % periodNames.length;
    return periodNames[periodIndex] || periodNames[0];
  }

  _getOwnedInstancesByIds(instanceIds) {
    if (!this._itemSystem || !instanceIds || instanceIds.length === 0) return [];
    const wanted = new Set(instanceIds);
    return this._itemSystem.getOwnedInstances().filter(i => wanted.has(i.instanceId));
  }

  _findExpedition(id) {
    if (!id) return this._expeditions[0] || null;
    return this._expeditions.find(e => e.id === id) || null;
  }

  _createExpeditionId() {
    return `exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  _syncLegacy() {
    this._expedition = this._expeditions[0] || null;
  }

  _normalizeExpedition(state) {
    if (!state) return null;
    return {
      id: state.id || this._createExpeditionId(),
      status: state.status || 'active',
      autoLoop: state.autoLoop !== false,
      cyclesCompleted: state.cyclesCompleted || 0,
      regions: [...(state.regions || [])],
      currentPeriodIndex: state.currentPeriodIndex || 0,
      ticksInCurrentPeriod: state.ticksInCurrentPeriod || 0,
      items: [...(state.items || [])],
      resourcePool: { ...(state.resourcePool || {}) },
      materialPool: { ...(state.materialPool || {}) },
      totalDiscarded: { ...(state.totalDiscarded || {}) },
      triggeredEvents: [...(state.triggeredEvents || [])],
      yieldMultipliers: { ...(state.yieldMultipliers || {}) },
      yieldFlatBonuses: { ...(state.yieldFlatBonuses || {}) },
      backpackCapacity: state.backpackCapacity || this.getExpeditionConfig().baseBackpackCapacity,
      resourceCapacity: state.resourceCapacity || this.getExpeditionConfig().baseResourceCapacity,
      occupiedWorkers: state.occupiedWorkers || 0
    };
  }

  _updateStore() {
    const states = this._expeditions.map(exp => ({ ...exp }));
    store.setState({
      expeditionState: states[0] || null,
      expeditionStates: states,
      expeditionQueueLimit: this.getQueueLimit()
    });
  }

  // ===== 存档接口 =====

  getState() {
    return {
      expeditions: this._expeditions.map(exp => ({ ...exp }))
    };
  }

  restoreState(state) {
    if (!state) return;
    let source = [];
    if (Array.isArray(state)) {
      source = state;
    } else if (Array.isArray(state.expeditions)) {
      source = state.expeditions;
    } else if (state.regions) {
      source = [state];
    }

    this._expeditions = source
      .map(exp => this._normalizeExpedition(exp))
      .filter(Boolean);
    this._syncLegacy();
    this._updateStore();
  }
}
