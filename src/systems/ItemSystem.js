/**
 * ItemSystem - 物品系统
 * 实例模型管理所有物品的获得、失去、装备、探险
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class ItemSystem {
  constructor() {
    // { itemId: { instances: [{ instanceId, equipped, inExpedition }] } }
    this._items = {};
    this._nextInstanceId = {}; // 自增序号

    // 监听合成完成事件
    eventBus.on('synthesisComplete', ({ itemId, count }) => {
      for (let i = 0; i < count; i++) {
        this.obtain(itemId);
      }
    });
  }

  initNew() {
    this._items = {};
    this._nextInstanceId = {};
    this._notifyChange();
  }

  // ===== 修改类 API =====

  /**
   * 获得物品
   * @param {string} id - 物品ID
   * @param {Object} [metadata] - 可选实例元数据（如药剂品质 quality）
   * @returns {string|false} instanceId 或 false
   */
  obtain(id, metadata) {
    const config = configRegistry.getItem(id);
    if (!config) return false;

    // unique 检查
    if (config.unique) {
      const existing = this._items[id];
      if (existing && existing.instances.length >= 1) return false;
    }

    // 创建实例
    if (!this._nextInstanceId[id]) this._nextInstanceId[id] = 0;
    this._nextInstanceId[id]++;
    const instanceId = `${id}_${this._nextInstanceId[id]}`;

    if (!this._items[id]) {
      this._items[id] = { instances: [] };
    }
    this._items[id].instances.push({
      instanceId,
      equipped: false,
      inExpedition: false,
      metadata: metadata || {}
    });

    this._notifyChange();
    eventBus.emit('itemObtained', { itemId: id, instanceId });
    return instanceId;
  }

  /**
   * 失去物品
   * @returns {boolean}
   */
  lose(instanceId) {
    const { itemId, instance } = this._findInstance(instanceId);
    if (!instance) return false;
    if (instance.inExpedition) return false;

    const items = this._items[itemId];
    items.instances = items.instances.filter(i => i.instanceId !== instanceId);
    if (items.instances.length === 0) delete this._items[itemId];

    this._notifyChange();
    eventBus.emit('itemLost', { itemId, instanceId });
    return true;
  }

  /**
   * 装备物品（探险准备勾选）
   */
  equip(instanceId) {
    const { instance } = this._findInstance(instanceId);
    if (!instance) return false;
    if (instance.equipped) return false;
    if (instance.inExpedition) return false;

    instance.equipped = true;
    this._notifyChange();
    return true;
  }

  /**
   * 取消装备
   */
  unequip(instanceId) {
    const { instance } = this._findInstance(instanceId);
    if (!instance) return false;
    if (!instance.equipped) return false;
    if (instance.inExpedition) return false;

    instance.equipped = false;
    this._notifyChange();
    return true;
  }

  /**
   * 标记为探险中（出发时）
   */
  markExpedition(instanceIds) {
    // 验证
    for (const id of instanceIds) {
      const { instance } = this._findInstance(id);
      if (!instance || !instance.equipped || instance.inExpedition) return false;
    }
    // 执行
    for (const id of instanceIds) {
      const { instance } = this._findInstance(id);
      instance.inExpedition = true;
      // 保留 equipped 状态，以便下次打开探险面板时记住玩家选择
    }
    this._notifyChange();
    return true;
  }

  /**
   * 探险归来
   */
  returnFromExpedition(instanceIds) {
    for (const id of instanceIds) {
      const { itemId, instance } = this._findInstance(id);
      if (!instance) continue;

      const config = configRegistry.getItem(itemId);
      if (config && config.consumable) {
        // 消耗品消失
        const items = this._items[itemId];
        items.instances = items.instances.filter(i => i.instanceId !== id);
        if (items.instances.length === 0) delete this._items[itemId];
      } else {
        // 非消耗品归还，保留 equipped 状态以记住玩家偏好
        instance.inExpedition = false;
      }
    }
    this._notifyChange();
  }

  // ===== 查询类 API =====

  isOwned(id) {
    const items = this._items[id];
    return items && items.instances.length > 0;
  }

  getOwnedInstances() {
    const result = [];
    for (const [itemId, data] of Object.entries(this._items)) {
      const config = configRegistry.getItem(itemId);
      for (const inst of data.instances) {
        result.push({
          instanceId: inst.instanceId,
          itemId,
          name: config ? config.name : itemId,
          icon: config ? config.icon : '',
          description: config ? config.description : '',
          equipped: inst.equipped,
          inExpedition: inst.inExpedition,
          capacityCost: config ? config.capacityCost : 0,
          unique: config ? config.unique : false,
          consumable: config ? config.consumable : false,
          expeditionEffects: config ? config.expeditionEffects : [],
          metadata: inst.metadata || {}
        });
      }
    }
    return result;
  }

  getEquippedInstances() {
    return this.getOwnedInstances().filter(i => i.equipped);
  }

  getExpeditionInstances() {
    return this.getOwnedInstances().filter(i => i.inExpedition);
  }

  _findInstance(instanceId) {
    for (const [itemId, data] of Object.entries(this._items)) {
      const instance = data.instances.find(i => i.instanceId === instanceId);
      if (instance) return { itemId, instance };
    }
    return { itemId: null, instance: null };
  }

  _notifyChange() {
    store.setState({ itemVersion: Date.now() });
    eventBus.emit('itemsChanged');
  }

  // ===== 存档接口 =====

  getAllStates() {
    const state = {};
    for (const [itemId, data] of Object.entries(this._items)) {
      state[itemId] = {
        instances: data.instances.map(i => ({
          instanceId: i.instanceId,
          equipped: i.equipped,
          inExpedition: i.inExpedition,
          metadata: i.metadata || {}
        }))
      };
    }
    return state;
  }

  restoreState(state) {
    if (!state) return;
    this._items = {};
    this._nextInstanceId = {};

    for (const [itemId, data] of Object.entries(state)) {
      this._items[itemId] = {
        instances: data.instances.map(i => ({
          instanceId: i.instanceId,
          equipped: i.equipped || false,
          inExpedition: i.inExpedition || false,
          metadata: i.metadata || {}
        }))
      };
      // 恢复序号计数器
      let maxNum = 0;
      for (const inst of data.instances) {
        const parts = inst.instanceId.split('_');
        const num = parseInt(parts[parts.length - 1]);
        if (!isNaN(num)) maxNum = Math.max(maxNum, num);
      }
      this._nextInstanceId[itemId] = maxNum;
    }
    this._notifyChange();
  }
}
