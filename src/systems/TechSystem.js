/**
 * TechSystem - 科技树系统
 * 管理科技研究队列、进度推进、解锁分发
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';
import { mergeModifierValue } from '../utils/BonusUtils.js';

const PASSIVE_SCIENCE_PER_TICK = 0.2;

export class TechSystem {
  constructor() {
    /** @type {Set<string>} 已研究的科技ID */
    this._researched = new Set();
    /** @type {{ techId: string, progressTicks: number } | null} */
    this._currentResearch = null;
    /** @type {Set<string>} 已完成专项研发的兵种ID */
    this._unitResearch = new Set();
    this._sciencePoints = 0;
    this._resourceSystem = null;
    this._buildingSystem = null;
    this._itemSystem = null;

    eventBus.on('tick', (data) => this._onTick(data));
  }

  setResourceSystem(rs) { this._resourceSystem = rs; }
  setBuildingSystem(bs) { this._buildingSystem = bs; }
  setItemSystem(is) { this._itemSystem = is; }
  setCultureSystem(cs) { this._cultureSystem = cs; }
  setHeroSystem(hs) { this._heroSystem = hs; }
  setEraSystem(es) { this._eraSystem = es; }

  init() {
    // Tier 0 科技自动完成
    const allTechs = this._getAllTechs();
    for (const tech of allTechs) {
      if (tech.tier === 0 && !tech.eraId) {
        this._researched.add(tech.id);
        this._applyUnlocks(tech);
      }
    }
    this._ensureBaseUnitResearch();
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

  _getAllUnits() {
    return configRegistry.get('enemies')?.units || [];
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

  getSciencePoints() { return this._sciencePoints; }

  getPassiveRate() { return PASSIVE_SCIENCE_PER_TICK; }

  getPointIncomeBreakdown() {
    const workforce = this._buildingSystem?.getWorkforceOutputs?.().science || 0;
    return {
      passive: PASSIVE_SCIENCE_PER_TICK,
      workforce,
      total: PASSIVE_SCIENCE_PER_TICK + workforce
    };
  }

  getEffects() {
    const result = { productionMul: 1, researchSpeedMul: 1 };
    for (const techId of this._researched) {
      const effects = this.getTech(techId)?.effects || {};
      for (const [key, value] of Object.entries(effects)) {
        if (!Number.isFinite(value)) continue;
        if (key.endsWith('Mul')) mergeModifierValue(result, key, value);
        else mergeModifierValue(result, key, value, 'add');
      }
    }
    return result;
  }

  getEraProgress(eraId) {
    const nodes = this._getAllTechs().filter(tech => tech.eraId === eraId);
    if (nodes.length === 0) return 0;
    return nodes.filter(tech => this._researched.has(tech.id)).length / nodes.length;
  }

  getUnitResearch() {
    this._ensureBaseUnitResearch();
    return [...this._unitResearch];
  }

  getAvailableUnitResearch() {
    this._ensureBaseUnitResearch();
    return this._getAllUnits().filter(u => this.canResearchUnit(u.id).valid);
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
    if (tech.eraId) {
      const currentOrder = this._eraSystem?.getCurrentEra?.()?.order ?? 0;
      const targetOrder = configRegistry.getHistoricalContent().eras.find(era => era.id === tech.eraId)?.order ?? 0;
      if (targetOrder > currentOrder) return { valid: false, reason: '尚未进入该科技所属时代' };
    }
    if (this._researched.has(techId)) return { valid: false, reason: '已研究完成' };
    if (!this._canResearch(tech)) return { valid: false, reason: '前置科技未完成' };
    if (tech.pointCost && this._sciencePoints < tech.pointCost) return { valid: false, reason: `科技点不足（${this._sciencePoints}/${tech.pointCost}）` };

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

    if (tech.pointCost) this._sciencePoints = Number(Math.max(0, this._sciencePoints - tech.pointCost).toFixed(4));

    // 消耗资源
    if (tech.cost && tech.cost.length > 0 && this._resourceSystem) {
      this._resourceSystem.consumeAll(tech.cost);
    }

    this._currentResearch = { techId, progressTicks: 0 };
    this._updateStore();
    eventBus.emit('techResearchStarted', { techId });
    return true;
  }

  canResearchUnit(unitId) {
    this._ensureBaseUnitResearch();
    const unit = this._getAllUnits().find(u => u.id === unitId);
    if (!unit) return { valid: false, reason: '兵种不存在' };
    if (unit.eraId) {
      const currentEra = this._eraSystem?.getCurrentEra?.();
      const unitEra = configRegistry.getHistoricalContent().eras.find(era => era.id === unit.eraId);
      if (unitEra && currentEra && unitEra.order > currentEra.order) return { valid: false, reason: '尚未进入该兵种所属时代' };
    }
    if (unit.civilizationId) {
      const selectedId = this._eraSystem?.getSelectedCivilization?.()?.id;
      if (selectedId !== unit.civilizationId) return { valid: false, reason: '该特色兵种属于其他文明' };
    }
    if (this._unitResearch.has(unitId)) return { valid: false, reason: '已研发完成' };
    // 兵种链前置（prerequisiteTechs 来自已休眠的科技树，不再检查）
    const unitPrereqs = Array.isArray(unit.prerequisiteUnits) ? unit.prerequisiteUnits : [];
    for (const preUnitId of unitPrereqs) {
      if (!this._unitResearch.has(preUnitId)) return { valid: false, reason: '前置兵种未研发' };
    }
    // 解锁消耗四基础资源（原灵感机制已废弃）
    const unlockCost = Array.isArray(unit.unlockCost) ? unit.unlockCost : [];
    if (unlockCost.length && this._resourceSystem && !this._resourceSystem.canAfford(unlockCost)) {
      return { valid: false, reason: '资源不足' };
    }
    return { valid: true };
  }

  researchUnit(unitId) {
    const check = this.canResearchUnit(unitId);
    if (!check.valid) return false;
    const unit = this._getAllUnits().find(u => u.id === unitId);
    const unlockCost = Array.isArray(unit?.unlockCost) ? unit.unlockCost : [];
    if (unlockCost.length && this._resourceSystem) this._resourceSystem.consumeAll(unlockCost);
    this._unitResearch.add(unitId);
    this._updateStore();
    eventBus.emit('unitResearched', { unitId });
    eventBus.emit('combatBroadcast', { message: '⚔️ 完成兵种研发: ' + (unit?.name || unitId) });
    return true;
  }

  _ensureBaseUnitResearch() {
    for (const unit of this._getAllUnits()) {
      // 仅 unlocked:true 自动解锁（旧 researchCost===0 灵感机制已废弃）
      if (unit.unlocked === true) {
        this._unitResearch.add(unit.id);
      }
    }
  }

  /** Tick推进 */
  _onTick(data) {
    const scienceOutput = this.getPointIncomeBreakdown().total;
    this._sciencePoints = Number((this._sciencePoints + scienceOutput).toFixed(4));
    if (!this._currentResearch) {
      this._updateStore();
      return;
    }

    const tech = this.getTech(this._currentResearch.techId);
    if (!tech) {
      this._currentResearch = null;
      this._updateStore();
      return;
    }

    this._currentResearch.progressTicks += (this._cultureSystem ? (this._cultureSystem.getEffects().researchSpeedMul || 1) : 1) * (this._heroSystem?.getBonuses?.().researchSpeedMul || 1);
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
        this._unitResearch.add(unitId);
        console.log('[Tech] Unlocked unit:', unitId);
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
    this._ensureBaseUnitResearch();
    return this._unitResearch.has(unitId);
  }

  // ===== Store =====

  _updateStore() {
    store.setState({
      techResearched: [...this._researched],
      techCurrent: this._currentResearch ? { ...this._currentResearch } : null,
      unitResearch: [...this._unitResearch],
      sciencePoints: this._sciencePoints
    });
  }

  // ===== 存档 =====

  getState() {
    return {
      researched: [...this._researched],
      currentResearch: this._currentResearch ? { ...this._currentResearch } : null,
      unitResearch: [...this._unitResearch],
      sciencePoints: this._sciencePoints
    };
  }

  restoreState(state) {
    if (!state) return;
    this._researched = new Set(state.researched || []);
    this._currentResearch = state.currentResearch || null;
    this._unitResearch = new Set(state.unitResearch || []);
    this._sciencePoints = Number.isFinite(state.sciencePoints) ? state.sciencePoints : 0;
    this._ensureBaseUnitResearch();
    this._updateStore();
  }
}
