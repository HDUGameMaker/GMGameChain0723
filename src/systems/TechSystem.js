/**
 * TechSystem - 科技树系统
 * 管理科技研究队列、进度推进、解锁分发
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class TechSystem {
  constructor() {
    /** @type {Set<string>} 已研究的科技ID */
    this._researched = new Set();
    /** @type {{ techId: string, progressTicks: number } | null} */
    this._currentResearch = null;
    this._resourceSystem = null;
    this._buildingSystem = null;
    this._itemSystem = null;

    eventBus.on('tick', (data) => this._onTick(data));
  }

  setResourceSystem(rs) { this._resourceSystem = rs; }
  setBuildingSystem(bs) { this._buildingSystem = bs; }
  setItemSystem(is) { this._itemSystem = is; }
  setCultureSystem(cs) { this._cultureSystem = cs; }

  init() {
    // Tier 0 科技自动完成
    const allTechs = this._getAllTechs();
    for (const tech of allTechs) {
      if (tech.tier === 0) {
        this._researched.add(tech.id);
        this._applyUnlocks(tech);
      }
    }
    this._updateStore();
  }

  /** 获取所有科技配置 */
  _getAllTechs() {
    return configRegistry.get('techs') || [];
  }

  /** 获取科技配置 */
  getTech(id) {
    return this._getAllTechs().find(t => t.id === id) || null;
  }

  /** 获取已研究列表 */
  getResearched() {
    return [...this._researched];
  }

  /** 是否已研究 */
  isResearched(techId) {
    return this._researched.has(techId);
  }

  /** 获取当前研究进度 */
  getCurrentResearch() {
    return this._currentResearch ? { ...this._currentResearch } : null;
  }

  /** 获取可研究的科技（前置满足且未研究） */
  getAvailableTechs() {
    const allTechs = this._getAllTechs();
    return allTechs.filter(t => this._canResearch(t));
  }

  /** 检查单个科技是否可研究 */
  _canResearch(tech) {
    if (this._researched.has(tech.id)) return false;
    // 防御：处理配置中心可能把数组存成字符串的情况
    let prereqs = tech.prerequisites;
    if (!Array.isArray(prereqs)) {
      if (typeof prereqs === 'string' && prereqs.trim()) {
        prereqs = prereqs.split(',').map(s => s.trim()).filter(Boolean);
      } else {
        prereqs = [];
      }
    }
    if (prereqs.length === 0) return true;
    return prereqs.every(preId => this._researched.has(preId));
  }

  /** 检查是否可以开始研究 */
  canStartResearch(techId) {
    if (this._currentResearch) return { valid: false, reason: '正在研究中' };
    const tech = this.getTech(techId);
    if (!tech) return { valid: false, reason: '科技不存在' };
    if (this._researched.has(techId)) return { valid: false, reason: '已研究完成' };
    if (!this._canResearch(tech)) return { valid: false, reason: '前置科技未完成' };

    // 检查资源消耗
    if (tech.cost && tech.cost.length > 0 && this._resourceSystem) {
      if (!this._resourceSystem.canAfford(tech.cost)) return { valid: false, reason: '资源不足' };
    }

    return { valid: true };
  }

  /** 开始研究 */
  startResearch(techId) {
    const check = this.canStartResearch(techId);
    if (!check.valid) return false;

    const tech = this.getTech(techId);

    // 消耗资源
    if (tech.cost && tech.cost.length > 0 && this._resourceSystem) {
      this._resourceSystem.consumeAll(tech.cost);
    }

    this._currentResearch = { techId, progressTicks: 0 };
    this._updateStore();
    eventBus.emit('techResearchStarted', { techId });
    return true;
  }

  /** Tick推进 */
  _onTick(data) {
    if (!this._currentResearch) return;

    const tech = this.getTech(this._currentResearch.techId);
    if (!tech) {
      this._currentResearch = null;
      this._updateStore();
      return;
    }

    this._currentResearch.progressTicks += (this._cultureSystem ? (this._cultureSystem.getEffects().researchSpeedMul || 1) : 1);
    if (this._currentResearch.progressTicks >= tech.researchTime) {
      // 研究完成
      const completedId = this._currentResearch.techId;
      this._researched.add(completedId);
      this._currentResearch = null;
      this._applyUnlocks(this.getTech(completedId));
      this._updateStore();
      eventBus.emit('techResearched', { techId: completedId });
    } else {
      this._updateStore();
    }
  }

  /** 应用科技解锁内容 */
  _applyUnlocks(tech) {
    if (!tech.unlocks) return;

    // 解锁建筑
    if (tech.unlocks.buildings) {
      for (const bId of tech.unlocks.buildings) {
        console.log('[Tech] Unlocked building:', bId);
      }
    }

    // 解锁物品（在 ItemSystem 中标记为可合成）
    if (tech.unlocks.items) {
      for (const itemId of tech.unlocks.items) {
        console.log('[Tech] Unlocked item:', itemId);
      }
    }

    // 解锁单位
    if (tech.unlocks.units) {
      for (const unitId of tech.unlocks.units) {
        console.log('[Tech] Unlocked unit:', unitId);
      }
    }

    // 解锁阵型
    if (tech.unlocks.formations) {
      for (const fId of tech.unlocks.formations) {
        console.log('[Tech] Unlocked formation:', fId);
      }
    }
  }

  /** 检查建筑是否被科技解锁 */
  isBuildingUnlockedByTech(buildingId) {
    const allTechs = this._getAllTechs();
    for (const tech of allTechs) {
      if (!this._researched.has(tech.id)) continue;
      if (tech.unlocks?.buildings?.includes(buildingId)) return true;
    }
    return false;
  }

  /** 检查单位是否被科技解锁 */
  isUnitUnlockedByTech(unitId) {
    const allTechs = this._getAllTechs();
    for (const tech of allTechs) {
      if (!this._researched.has(tech.id)) continue;
      if (tech.unlocks?.units?.includes(unitId)) return true;
    }
    return false;
  }

  /** 检查阵型是否被科技解锁 */
  isFormationUnlockedByTech(formationId) {
    const allTechs = this._getAllTechs();
    for (const tech of allTechs) {
      if (!this._researched.has(tech.id)) continue;
      if (tech.unlocks?.formations?.includes(formationId)) return true;
    }
    return false;
  }

  // ===== Store =====

  _updateStore() {
    store.setState({
      techResearched: [...this._researched],
      techCurrent: this._currentResearch ? { ...this._currentResearch } : null
    });
  }

  // ===== 存档 =====

  getState() {
    return {
      researched: [...this._researched],
      currentResearch: this._currentResearch ? { ...this._currentResearch } : null
    };
  }

  restoreState(state) {
    if (!state) return;
    this._researched = new Set(state.researched || []);
    this._currentResearch = state.currentResearch || null;
    this._updateStore();
  }
}
