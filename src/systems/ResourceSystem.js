/**
 * ResourceSystem - 资源系统
 * 管理所有资源的增减、上限、查询
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class ResourceSystem {
  constructor() {
    this._resources = {}; // { id: { current, max } }
    this._storageMultiplier = 1; // 仓库倍率
  }

  /**
   * 从配置初始化（新游戏）
   */
  initFromConfig() {
    const configs = configRegistry.get('resources') || [];
    this._resources = {};
    for (const cfg of configs) {
      this._resources[cfg.id] = {
        current: cfg.initial,
        max: cfg.max
      };
    }
    this._storageMultiplier = 1;
    this._notifyChange();
  }

  /**
   * 获取资源有效上限（配置max × 仓库倍率）
   */
  getMaxResourceCapacity(id) {
    const res = this._resources[id];
    if (!res) return 0;
    return Math.floor(res.max * this._storageMultiplier);
  }

  /**
   * 更新仓库倍率
   */
  setStorageMultiplier(multiplier) {
    this._storageMultiplier = multiplier;
    this._notifyChange();
  }

  getStorageMultiplier() {
    return this._storageMultiplier;
  }

  fillBasicResourcesToCapacity() {
    const basicIds = (configRegistry.get('resources') || [])
      .filter(resource => resource.rare !== true && resource.processed !== true)
      .map(resource => resource.id);
    for (const id of basicIds) {
      const resource = this._resources[id];
      if (resource) resource.current = this.getMaxResourceCapacity(id);
    }
    this._notifyChange();
    return basicIds;
  }

  fillEraMaterialsToCapacity(currentEraId) {
    const eras = configRegistry.getHistoricalContent().eras || [];
    const eraOrder = new Map(eras.map((era, index) => [era.id, Number.isFinite(era.order) ? era.order : index]));
    const currentOrder = eraOrder.get(currentEraId) ?? 0;
    const materialIds = (configRegistry.get('resources') || [])
      .filter(resource => ['wood', 'stone'].includes(resource.id) || (
        resource.processed === true && (eraOrder.get(resource.unlockEraId) ?? Infinity) <= currentOrder
      ))
      .map(resource => resource.id);
    for (const id of materialIds) {
      const resource = this._resources[id];
      if (resource) resource.current = this.getMaxResourceCapacity(id);
    }
    this._notifyChange();
    return materialIds;
  }

  // ===== 修改类 API =====

  /**
   * 增加资源
   * @returns {boolean} 是否成功
   */
  add(id, amount) {
    if (amount <= 0) return false;
    const res = this._resources[id];
    if (!res) return false;

    const maxCap = this.getMaxResourceCapacity(id);
    if (res.current + amount > maxCap) return false;

    res.current += amount;
    this._notifyChange(id);
    return true;
  }

  /**
   * 增加资源（允许溢出截断到上限）
   * @returns {number} 实际增加的数量
   */
  addClamped(id, amount) {
    if (amount <= 0) return 0;
    const res = this._resources[id];
    if (!res) return 0;

    const maxCap = this.getMaxResourceCapacity(id);
    const actual = Math.min(amount, maxCap - res.current);
    if (actual <= 0) return 0;

    res.current += actual;
    this._notifyChange(id);
    return actual;
  }

  /**
   * 尝试消耗资源
   * @returns {boolean} 是否成功
   */
  tryConsume(id, amount) {
    if (amount <= 0) return false;
    const res = this._resources[id];
    if (!res) return false;
    if (res.current < amount) return false;

    res.current -= amount;
    this._notifyChange(id);
    return true;
  }

  /**
   * 设置资源上限
   * @returns {boolean}
   */
  setMax(id, newMax) {
    const res = this._resources[id];
    if (!res) return false;
    if (newMax < res.current) return false;
    if (newMax <= 0) return false;

    res.max = newMax;
    this._notifyChange(id);
    return true;
  }

  // ===== 查询类 API =====

  getAmount(id) {
    const res = this._resources[id];
    return res ? res.current : 0;
  }

  getAll() {
    const configs = configRegistry.get('resources') || [];
    return configs.map(cfg => ({
      id: cfg.id,
      name: cfg.name,
      icon: cfg.icon,
      current: this._resources[cfg.id]?.current || 0,
      max: this.getMaxResourceCapacity(cfg.id),
      rare: cfg.rare,
      showInHUD: cfg.showInHUD
    }));
  }

  getHUDResources() {
    const configs = configRegistry.get('resources') || [];
    const currentEraIndex = Number(store.getState('eraCurrentIndex') || 0);
    const eras = configRegistry.getHistoricalContent().eras || [];
    const eraOrder = new Map(eras.map((era, index) => [era.id, Number.isFinite(era.order) ? era.order : index]));
    return configs
      .filter(cfg => cfg.showInHUD && (!cfg.unlockEraId || (eraOrder.get(cfg.unlockEraId) ?? Infinity) <= currentEraIndex))
      .map(cfg => ({
        id: cfg.id,
        name: cfg.name,
        icon: cfg.icon,
        current: this._resources[cfg.id]?.current || 0,
        max: this.getMaxResourceCapacity(cfg.id)
      }));
  }

  hasEnough(id, amount) {
    const res = this._resources[id];
    if (!res) return false;
    return res.current >= amount;
  }

  /**
   * 检查一组资源消耗是否都满足
   * @param {Array} costs - [{resourceId, amount}]
   */
  canAfford(costs) {
    if (!costs || costs.length === 0) return true;
    return costs.every(c => this.hasEnough(c.resourceId, c.amount));
  }

  /**
   * 消耗一组资源
   * @param {Array} costs - [{resourceId, amount}]
   * @returns {boolean}
   */
  consumeAll(costs) {
    if (!costs || costs.length === 0) return true;
    // 先检查
    if (!this.canAfford(costs)) return false;
    // 再消耗
    for (const c of costs) {
      this.tryConsume(c.resourceId, c.amount);
    }
    return true;
  }

  _notifyChange(id) {
    eventBus.emit('resourceChanged', { id });
    store.setState({ resourceVersion: Date.now() });
  }

  // ===== 存档接口 =====

  getSaveState() {
    const state = {};
    for (const [id, res] of Object.entries(this._resources)) {
      state[id] = { current: res.current, max: res.max };
    }
    // 保存存储倍率，读档后才能恢复正确的资源上限
    state.__storageMultiplier = this._storageMultiplier;
    return state;
  }

  restoreState(state) {
    if (!state) return;
    // 先恢复存储倍率，供后续 current 钳制使用
    const savedMultiplier = state.__storageMultiplier;
    if (typeof savedMultiplier === 'number') {
      this._storageMultiplier = savedMultiplier;
    }
    for (const [id, data] of Object.entries(state)) {
      if (id === '__storageMultiplier') continue;
      if (this._resources[id]) {
        this._resources[id].current = data.current;
        this._resources[id].max = data.max;
      } else {
        // 存档中的资源在 _resources 中尚不存在时（直接从存档恢复，未经过 initFromConfig），
        // 直接根据存档数据创建条目
        this._resources[id] = { current: data.current, max: data.max };
      }
    }
    // 钳制：恢复后 current 不应超过实际容量上限（防止倍率丢失或配置下调导致非法状态）
    for (const [id, res] of Object.entries(this._resources)) {
      const maxCap = this.getMaxResourceCapacity(id);
      if (res.current > maxCap) res.current = maxCap;
    }
    this._notifyChange();
  }
}
