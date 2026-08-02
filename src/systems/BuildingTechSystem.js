/**
 * BuildingTechSystem - 建筑科技树（永久被动加成 + 解锁 T2 建筑）
 *
 * 与炼金法术树互补：
 * - 炼金树 = 临时·主动·区域法术（爆发乘法）
 * - 建筑树 = 永久·被动·全局加成（常驻乘法）+ 解锁更强力建筑
 *
 * 节点即时解锁（消耗四基础资源），无需研究倒计时。
 * 效果两类：
 *   1. effect.resourceProductionMul / productionMul -> 注入 BuildingSystem._getProductionMultiplier
 *   2. unlocksBuilding -> 解锁 T2 升级建筑（通过 unlockConditions type='building_tech' 门禁）
 *
 * 同轴加成按加法聚合（与 culture 一致）：两个 ×1.4 -> ×1.8；跨轴（文化×炼金×法术×建筑树）连乘。
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class BuildingTechSystem {
  constructor() {
    /** @type {Set<string>} 已解锁的树节点 id */
    this._unlockedNodes = new Set();
    this._resourceSystem = null;
  }

  setResourceSystem(rs) { this._resourceSystem = rs; }

  init() {
    this._updateStore();
  }

  initNew() {
    this._unlockedNodes = new Set();
    this._updateStore();
  }

  // ===== 配置读取 =====
  getNodes() { return configRegistry.getBuildingTech(); }
  getNode(id) { return this.getNodes().find(n => n.id === id) || null; }

  // ===== 查询 =====
  getUnlockedNodes() { return [...this._unlockedNodes]; }
  isNodeUnlocked(id) { return this._unlockedNodes.has(id); }

  /** 节点是否可解锁（未解锁 + 前置全满足） */
  canUnlockNode(id) {
    const node = this.getNode(id);
    if (!node) return { valid: false, reason: '节点不存在' };
    if (this._unlockedNodes.has(id)) return { valid: false, reason: '已解锁' };
    const prereqs = Array.isArray(node.prerequisites) ? node.prerequisites : [];
    for (const p of prereqs) {
      if (!this._unlockedNodes.has(p)) return { valid: false, reason: '前置未解锁' };
    }
    return { valid: true, node };
  }

  /** 节点资源是否足够 */
  canAffordNode(node) {
    if (!this._resourceSystem) return false;
    return this._resourceSystem.canAfford(node.cost || []);
  }

  /** 地形改造最终节点是否已解锁（取消资源建筑地形限制） */
  isTerrainRestrictionRemoved() {
    for (const n of this.getNodes()) {
      if (n.special === 'remove_terrain_restriction' && this._unlockedNodes.has(n.id)) return true;
    }
    return false;
  }

  /** 解锁节点（消耗四资源） */
  unlockNode(id) {
    const check = this.canUnlockNode(id);
    if (!check.valid) {
      eventBus.emit('combatBroadcast', { message: '⛔ ' + check.reason });
      return false;
    }
    const node = check.node;
    if (!this.canAffordNode(node)) {
      eventBus.emit('combatBroadcast', { message: '💰 资源不足' });
      return false;
    }
    this._resourceSystem.consumeAll(node.cost || []);
    this._unlockedNodes.add(id);
    this._updateStore();
    eventBus.emit('buildingTechChanged');
    eventBus.emit('combatBroadcast', { message: '🏗️ 解锁建筑科技：' + node.name });
    return true;
  }

  // ===== 效果聚合（被 BuildingSystem 调用） =====
  /**
   * 聚合所有已解锁节点的产出乘法。
   * 同轴加法聚合：productionMul = 1 + Σ(mul-1)；resourceProductionMul[res] = 1 + Σ(mul-1)。
   * @returns {{productionMul:number, resourceProductionMul:Object.<string,number>}}
   */
  getEffects() {
    let globalBonus = 0;
    const resBonus = {};
    for (const node of this.getNodes()) {
      if (!this._unlockedNodes.has(node.id)) continue;
      const eff = node.effect || {};
      if (eff.productionMul) globalBonus += (eff.productionMul - 1);
      if (eff.resourceProductionMul) {
        for (const [res, mul] of Object.entries(eff.resourceProductionMul)) {
          resBonus[res] = (resBonus[res] || 0) + (mul - 1);
        }
      }
    }
    const resourceProductionMul = {};
    for (const [res, b] of Object.entries(resBonus)) resourceProductionMul[res] = 1 + b;
    return {
      productionMul: 1 + globalBonus,
      resourceProductionMul
    };
  }

  // ===== Store =====
  _updateStore() {
    store.setState({
      buildingTechUnlockedCount: this._unlockedNodes.size,
      buildingTechTotal: this.getNodes().length,
      buildingTechVersion: Date.now()
    });
  }

  // ===== 存档 =====
  getState() {
    return { unlockedNodes: [...this._unlockedNodes] };
  }

  restoreState(state) {
    if (!state) { this.initNew(); return; }
    this._unlockedNodes = new Set(state.unlockedNodes || []);
    this._updateStore();
  }
}
