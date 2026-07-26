/**
 * ExpeditionSystem - 探险系统
 * 管理探险准备、进行、结算
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class ExpeditionSystem {
  constructor() {
    this._expedition = null; // ExpeditionState | null
    this._resourceSystem = null;
    this._itemSystem = null;
    this._buildingSystem = null;

    // 订阅 tick 推进探险
    eventBus.on('tick', (data) => this.onTick(data));
  }

  setSystems({ resource, item, building, population }) {
    this._resourceSystem = resource;
    this._itemSystem = item;
    this._buildingSystem = building;
    this._populationSystem = population;
  }

  /**
   * 计算所选区域的总工人消耗
   * @param {Array<string>} regionIds - 选中的区域ID列表（紧凑化后）
   * @param {object} [entrance] - 入口配置（可选，含 regions[] 和 differentWorkersPerPeriod）
   *   - 当 entrance.differentWorkersPerPeriod === false 时，使用"所有时段相同工人"模式，
   *     工人数 = 各选中区域所需工人数的最大值
   *   - 否则（默认）使用"每时段不同工人"模式，工人数 = 各选中区域所需工人数之和
   *   - 入口 regions[].workerCost 覆盖 region.workerCost
   */
  getTotalWorkerCost(regionIds, entrance) {
    // 解析入口的区块工人数映射（如果提供）
    const entranceWorkerCost = new Map();
    if (entrance && Array.isArray(entrance.regions)) {
      for (const r of entrance.regions) {
        if (r && r.regionId) entranceWorkerCost.set(r.regionId, r.workerCost);
      }
    }
    const useSameWorkers = entrance && entrance.differentWorkersPerPeriod === false;

    let result = 0;
    let maxCost = 0;
    for (const regionId of regionIds) {
      if (!regionId) continue;
      // 优先使用入口定义的工人数，其次使用 region 配置
      let cost = entranceWorkerCost.has(regionId)
        ? entranceWorkerCost.get(regionId)
        : (configRegistry.getRegion(regionId)?.workerCost || 0);
      cost = Number(cost) || 0;
      result += cost;
      if (cost > maxCost) maxCost = cost;
    }
    return useSameWorkers ? maxCost : result;
  }

  getExpeditionConfig() {
    const expConfig = configRegistry.get('expeditionGlobal') || {
      expeditionPeriods: 3,
      baseBackpackCapacity: 10,
      baseResourceCapacity: 100
    };
    
    // 从 initial 配置读取容量，如果存在则覆盖
    const initialConfig = configRegistry.get('initial') || {};
    const capacities = initialConfig.capacities || {};
    if (capacities.backpackCapacity !== undefined) {
      expConfig.baseBackpackCapacity = capacities.backpackCapacity;
    }
    if (capacities.expeditionResourceCapacity !== undefined) {
      expConfig.baseResourceCapacity = capacities.expeditionResourceCapacity;
    }
    
    return expConfig;
  }

  // ===== 区域解锁 =====

  getAvailableRegions(entranceRegionIds) {
    const regions = configRegistry.get('regions') || [];
    const equippedItems = this._itemSystem ? this._itemSystem.getEquippedInstances() : [];
    const equippedItemIds = equippedItems.map(i => i.itemId);

    // 过滤：如果指定了入口区域列表，只返回入口绑定的区域
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
          if (c.type === 'tag') {
            const tagCfg = configRegistry.get('tags')?.find(t => t.id === c.tag);
            const tagName = tagCfg ? tagCfg.name : c.tag;
            return `需要: ${tagName}`;
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
        case 'tag':
          return this._hasBuildingWithTag(cond.tag);
        default:
          return false;
      }
    });
  }

  /**
   * 检查当前基地中是否存在拥有指定 tag 的建筑
   * @param {string} tag
   * @returns {boolean}
   */
  _hasBuildingWithTag(tag) {
    if (!this._buildingSystem || !tag) return false;
    const buildings = this._buildingSystem.buildings || [];
    for (const b of buildings) {
      const cfg = configRegistry.getBuilding(b.buildingId);
      if (cfg && Array.isArray(cfg.tags) && cfg.tags.includes(tag)) return true;
    }
    return false;
  }

  isRegionUnlocked(regionId) {
    const region = configRegistry.getRegion(regionId);
    if (!region) return false;
    const equippedItems = this._itemSystem ? this._itemSystem.getEquippedInstances() : [];
    return this._isRegionUnlocked(region, equippedItems.map(i => i.itemId));
  }

  // ===== 出发 =====

  canStartExpedition(regionIds, instanceIds, entrance) {
    const expConfig = this.getExpeditionConfig();

    // 紧凑化：去掉末尾的 null（允许只选 1 或 2 个阶段）
    const compacted = this._compactRegions(regionIds);

    if (compacted.length === 0) {
      return { valid: false, reason: '请至少选择一个区域' };
    }

    // 检查是否有空隙（null 夹在中间，如 [A, null, C]）
    if (this._hasGaps(regionIds)) {
      return { valid: false, reason: '区域选择不能有空隙，请从第一个阶段开始连续选择' };
    }

    if (compacted.length > expConfig.expeditionPeriods) {
      return { valid: false, reason: `最多选择 ${expConfig.expeditionPeriods} 个区域` };
    }

    // 检查区域解锁
    const equippedItems = this._itemSystem ? this._itemSystem.getEquippedInstances() : [];
    const equippedItemIds = equippedItems.map(i => i.itemId);
    for (const regionId of compacted) {
      const region = configRegistry.getRegion(regionId);
      if (!region) return { valid: false, reason: '区域不存在' };
      if (!this._isRegionUnlocked(region, equippedItemIds)) {
        return { valid: false, reason: `区域 ${region.name} 未解锁` };
      }
    }

    // 检查可用工人（传入 entrance 以使用入口特定工人数和时段模式）
    const totalWorkerCost = this.getTotalWorkerCost(compacted, entrance);
    if (this._populationSystem) {
      const available = this._populationSystem.getAvailableWorkers();
      if (available < totalWorkerCost) {
        return { valid: false, reason: `可用工人不足（需要 ${totalWorkerCost} 人，当前可用 ${available} 人）` };
      }
    }

    return { valid: true, compactedRegions: compacted, totalWorkerCost };
  }

  /**
   * 去掉末尾的 null 值，返回紧凑的区域数组
   */
  _compactRegions(regionIds) {
    const result = [...regionIds];
    while (result.length > 0 && result[result.length - 1] === null) {
      result.pop();
    }
    return result;
  }

  /**
   * 检查区域选择是否有空隙（null 出现在非 null 之前）
   * 合法: [A,B,C], [A,B,null], [A,null,null]
   * 非法: [A,null,C], [null,A,B], [null,A,null]
   */
  _hasGaps(regionIds) {
    let seenNull = false;
    for (const id of regionIds) {
      if (id !== null && seenNull) return true; // null 之后又出现了非 null
      if (id === null) seenNull = true;
    }
    return false;
  }

  startExpedition(regionIds, instanceIds, entrance) {
    const check = this.canStartExpedition(regionIds, instanceIds, entrance);
    if (!check.valid) return false;

    const expConfig = this.getExpeditionConfig();
    const compactedRegions = check.compactedRegions || this._compactRegions(regionIds);

    // 标记物品为探险中
    if (this._itemSystem && instanceIds.length > 0) {
      if (!this._itemSystem.markExpedition(instanceIds)) return false;
    }

    // 占用工人（使用 check 中已计算好的工人数，已考虑入口模式）
    const occupiedWorkers = check.totalWorkerCost || this.getTotalWorkerCost(compactedRegions, entrance);
    if (this._populationSystem && occupiedWorkers > 0) {
      this._populationSystem.occupyForExpedition(occupiedWorkers);
    }

    // 计算背包容量和资源容量
    let backpackCapacity = expConfig.baseBackpackCapacity;
    let resourceCapacity = expConfig.baseResourceCapacity;

    const expeditionItems = this._itemSystem ? this._itemSystem.getExpeditionInstances() : [];
    for (const item of expeditionItems) {
      for (const effect of (item.expeditionEffects || [])) {
        if (effect.type === 'backpack_capacity_bonus') backpackCapacity += effect.value;
        if (effect.type === 'resource_capacity_bonus') resourceCapacity += effect.value;
      }
    }

    // 计算产出倍率和固定加成
    const yieldMultipliers = {};
    const yieldFlatBonuses = {};
    for (const item of expeditionItems) {
      for (const effect of (item.expeditionEffects || [])) {
        if (effect.type === 'yield_multiplier') {
          const key = effect.resourceId || '_all';
          yieldMultipliers[key] = (yieldMultipliers[key] || 0) + (effect.value - 1);
        }
        if (effect.type === 'yield_flat_bonus') {
          const key = effect.resourceId || '_all';
          yieldFlatBonuses[key] = (yieldFlatBonuses[key] || 0) + effect.value;
        }
      }
    }

    this._expedition = {
      status: 'active',
      regions: [...compactedRegions],
      currentPeriodIndex: 0,
      ticksInCurrentPeriod: 0,
      items: [...instanceIds],
      resourcePool: {},
      totalDiscarded: {},
      triggeredEvents: [],
      yieldMultipliers,
      yieldFlatBonuses,
      backpackCapacity,
      resourceCapacity,
      occupiedWorkers
    };

    this._updateStore();
    eventBus.emit('expeditionStarted', { expedition: this._expedition });
    return true;
  }

  // ===== Tick 推进 =====

  onTick(data) {
    if (!this._expedition || this._expedition.status !== 'active') return;

    const ticksPerPeriod = 3; // 与基地相同

    this._expedition.ticksInCurrentPeriod++;

    // 时段末结算产出
    if (this._expedition.ticksInCurrentPeriod >= ticksPerPeriod) {
      this._settlePeriodYield();
      this._expedition.ticksInCurrentPeriod = 0;
      this._expedition.currentPeriodIndex++;

      // 探险结束（根据实际选择的区域数判断）
      if (this._expedition.currentPeriodIndex >= this._expedition.regions.length) {
        this.completeExpedition();
        return;
      }
    }

    this._updateStore();
  }

  _settlePeriodYield() {
    const exp = this._expedition;
    const regionId = exp.regions[exp.currentPeriodIndex];
    const region = configRegistry.getRegion(regionId);
    if (!region) return;

    // 确定时段名
    const periodNames = ['morning', 'afternoon', 'evening', 'night'];
    const periodName = periodNames[exp.currentPeriodIndex % periodNames.length];
    const baseYields = region.baseYields[periodName];
    if (!baseYields) return;

    // 计算当前资源池总量
    let poolTotal = Object.values(exp.resourcePool).reduce((s, v) => s + v, 0);

    // 按 baseYields 的 key 顺序逐个填充
    for (const [resourceId, baseAmount] of Object.entries(baseYields)) {
      if (baseAmount <= 0) continue;

      // 计算实际产量
      let multiplier = 1;
      let flatBonus = 0;

      // 全局倍率
      if (exp.yieldMultipliers['_all']) multiplier += exp.yieldMultipliers['_all'];
      if (exp.yieldMultipliers[resourceId]) multiplier += exp.yieldMultipliers[resourceId];
      if (exp.yieldFlatBonuses['_all']) flatBonus += exp.yieldFlatBonuses['_all'];
      if (exp.yieldFlatBonuses[resourceId]) flatBonus += exp.yieldFlatBonuses[resourceId];

      const actualYield = Math.floor(baseAmount * multiplier + flatBonus);
      if (actualYield <= 0) continue;

      // 容量截断
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
  }

  // ===== 完成探险 =====

  completeExpedition() {
    const exp = this._expedition;
    if (!exp) return null;

    // 资源写入基地
    if (this._resourceSystem) {
      for (const [resourceId, amount] of Object.entries(exp.resourcePool)) {
        this._resourceSystem.addClamped(resourceId, amount);
      }
    }

    // 归还工人
    if (this._populationSystem && exp.occupiedWorkers > 0) {
      this._populationSystem.releaseFromExpedition(exp.occupiedWorkers);
    }

    // 物品归还
    if (this._itemSystem && exp.items.length > 0) {
      this._itemSystem.returnFromExpedition(exp.items);
    }

    const result = {
      regions: exp.regions,
      totalYielded: { ...exp.resourcePool },
      totalDiscarded: { ...exp.totalDiscarded },
      triggeredEvents: [...exp.triggeredEvents],
      returnedItems: exp.items
    };

    this._expedition = null;
    this._updateStore();
    eventBus.emit('expeditionComplete', result);
    return result;
  }

  // ===== 查询 =====

  getCurrentExpedition() {
    return this._expedition;
  }

  getExpectedYields(regionIds, instanceIds) {
    // 预览产出（不计容量截断）
    const yields = {};
    const periodNames = ['morning', 'afternoon', 'evening'];

    // 计算物品加成
    let multipliers = {};
    let flatBonuses = {};
    if (this._itemSystem) {
      const allItems = this._itemSystem.getOwnedInstances();
      const selectedItems = allItems.filter(i => instanceIds.includes(i.instanceId));
      for (const item of selectedItems) {
        for (const effect of (item.expeditionEffects || [])) {
          if (effect.type === 'yield_multiplier') {
            const key = effect.resourceId || '_all';
            multipliers[key] = (multipliers[key] || 0) + (effect.value - 1);
          }
          if (effect.type === 'yield_flat_bonus') {
            const key = effect.resourceId || '_all';
            flatBonuses[key] = (flatBonuses[key] || 0) + effect.value;
          }
        }
      }
    }

    for (let i = 0; i < regionIds.length; i++) {
      const regionId = regionIds[i];
      if (!regionId) continue; // 跳过 null（未选择的阶段）
      const region = configRegistry.getRegion(regionId);
      if (!region) continue;
      const periodName = periodNames[i] || 'morning';
      const baseYields = region.baseYields[periodName];
      if (!baseYields) continue;

      for (const [resourceId, baseAmount] of Object.entries(baseYields)) {
        let multiplier = 1;
        let flatBonus = 0;
        if (multipliers['_all']) multiplier += multipliers['_all'];
        if (multipliers[resourceId]) multiplier += multipliers[resourceId];
        if (flatBonuses['_all']) flatBonus += flatBonuses['_all'];
        if (flatBonuses[resourceId]) flatBonus += flatBonuses[resourceId];

        const actual = Math.floor(baseAmount * multiplier + flatBonus);
        yields[resourceId] = (yields[resourceId] || 0) + actual;
      }
    }

    return yields;
  }

  _updateStore() {
    store.setState({ expeditionState: this._expedition ? { ...this._expedition } : null });
  }

  // ===== 存档接口 =====

  restoreState(state) {
    if (!state) return;
    // 兼容旧存档：没有 occupiedWorkers 字段时默认 0
    if (state.occupiedWorkers === undefined) {
      state.occupiedWorkers = 0;
    }
    this._expedition = state;
    this._updateStore();
  }
}
