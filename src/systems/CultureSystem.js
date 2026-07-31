/**
 * CultureSystem - 人文政策树系统
 * 管理政策/政体的研究、激活、效果分发
 * 框架照搬 TechSystem，新增：政策卡激活 + 政体选定（不可逆）+ 效果聚合
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

const POLICY_COOLDOWN_DAYS = 3; // 政策卡切换冷却（游戏日）

export class CultureSystem {
  constructor() {
    /** @type {Set<string>} 已研究（解锁）的政策/政体ID */
    this._researched = new Set();
    /** @type {{ id: string, progressTicks: number } | null} 当前研究 */
    this._currentResearch = null;
    /** @type {Set<string>} 已激活的政策卡ID（政体不在此集合） */
    this._activatedPolicies = new Set();
    /** @type {string | null} 当前政体ID（选定不可改） */
    this._government = null;
    /** 政策卡切换冷却：下次可切换的游戏日 */
    this._policyCooldownUntilDay = 0;

    this._resourceSystem = null;
    this._buildingSystem = null;
    this._populationSystem = null;
    this._timeSystem = null;

    eventBus.on('tick', (data) => this._onTick(data));
    eventBus.on('dayStart', (data) => this._onDayStart(data));
  }

  setResourceSystem(rs) { this._resourceSystem = rs; }
  setBuildingSystem(bs) { this._buildingSystem = bs; }
  setPopulationSystem(ps) { this._populationSystem = ps; }
  setTimeSystem(ts) { this._timeSystem = ts; }

  init() {
    // tier 0 自动完成
    for (const c of this._getAll()) {
      if (c.tier === 0) {
        this._researched.add(c.id);
        // tier 0 政策卡默认激活
        if (c.policyType === 'policy') this._activatedPolicies.add(c.id);
      }
    }
    this._updateStore();
  }

  _getAll() { return configRegistry.get('culture') || []; }
  get(id) { return this._getAll().find(c => c.id === id) || null; }

  getResearched() { return [...this._researched]; }
  getActivatedPolicies() { return [...this._activatedPolicies]; }
  getGovernment() { return this._government; }

  isResearched(id) { return this._researched.has(id); }
  isActivated(id) { return this._activatedPolicies.has(id); }

  /** 已通过灵感研究的信条（doctrines.json） */
  getDoctrineResearched() { return store.getState('doctrineResearched') || []; }

  _getDoctrineConfigs() { return configRegistry.get('doctrines') || []; }

  getCurrentResearch() { return this._currentResearch ? { ...this._currentResearch } : null; }

  /** 可研究：前置满足且未研究 */
  _canResearch(c) {
    if (this._researched.has(c.id)) return false;
    let prereqs = c.prerequisites;
    if (!Array.isArray(prereqs)) {
      if (typeof prereqs === 'string' && prereqs.trim()) {
        prereqs = prereqs.split(',').map(s => s.trim()).filter(Boolean);
      } else { prereqs = []; }
    }
    if (prereqs.length === 0) return true;
    return prereqs.every(p => this._researched.has(p));
  }

  getAvailable() { return this._getAll().filter(c => this._canResearch(c)); }

  canStartResearch(id) {
    if (this._currentResearch) return { valid: false, reason: '正在研究中' };
    const c = this.get(id);
    if (!c) return { valid: false, reason: '节点不存在' };
    if (this._researched.has(id)) return { valid: false, reason: '已研究完成' };
    if (!this._canResearch(c)) return { valid: false, reason: '前置未完成' };
    // 政体：已选过任何政体则不可再研究
    if (c.policyType === 'government' && this._government) {
      return { valid: false, reason: '已选定政体，不可更改' };
    }
    if (c.cost && c.cost.length > 0 && this._resourceSystem) {
      if (!this._resourceSystem.canAfford(c.cost)) return { valid: false, reason: '资源不足' };
    }
    return { valid: true };
  }

  startResearch(id) {
    const check = this.canStartResearch(id);
    if (!check.valid) return false;
    const c = this.get(id);
    if (c.cost && c.cost.length > 0 && this._resourceSystem) {
      this._resourceSystem.consumeAll(c.cost);
    }
    // researchTime === 0 直接完成（资源购买型）
    if (!c.researchTime || c.researchTime <= 0) {
      this._completeResearch(id);
    } else {
      this._currentResearch = { id, progressTicks: 0 };
      this._updateStore();
      eventBus.emit('cultureResearchStarted', { id });
    }
    return true;
  }

  _onTick(data) {
    if (!this._currentResearch) return;
    const c = this.get(this._currentResearch.id);
    if (!c) { this._currentResearch = null; this._updateStore(); return; }
    // 研究速度受政体/政策效果影响
    const speedMul = this.getEffects().researchSpeedMul || 1;
    this._currentResearch.progressTicks += speedMul;
    if (this._currentResearch.progressTicks >= c.researchTime) {
      this._completeResearch(this._currentResearch.id);
    } else {
      this._updateStore();
    }
  }

  _completeResearch(id) {
    this._researched.add(id);
    const c = this.get(id);
    this._currentResearch = null;
    if (c && c.policyType === 'government') {
      // 政体研究完成即选定，不可改
      this._government = id;
      this._unlockFormationsFrom(c);
      eventBus.emit('combatBroadcast', { message: `🏛️ 选定政体：${c.name}` });
    } else if (c && c.policyType === 'policy') {
      // 政策卡研究完成默认激活
      this._activatedPolicies.add(id);
      this._unlockFormationsFrom(c);
    }
    this._updateStore();
    eventBus.emit('cultureResearched', { id });
  }

  /** 激活政策/政体时解锁阵型 */
  _unlockFormationsFrom(c) {
    if (!c || !c.unlocks || !c.unlocks.formations) return;
    for (const fId of c.unlocks.formations) {
      console.log('[Culture] Unlocked formation:', fId);
    }
  }

  /** 检查阵型是否被文化政策解锁 */
  isFormationUnlockedByCulture(formationId) {
    const researchedDoctrines = this.getDoctrineResearched();
    for (const d of this._getDoctrineConfigs()) {
      if (researchedDoctrines.includes(d.id) && d.unlocks?.formations?.includes(formationId)) return true;
    }
    const all = this._getAll();
    for (const p of all) {
      if (!this._researched.has(p.id)) continue;
      if (p.unlocks?.formations?.includes(formationId)) return true;
    }
    return false;
  }

  /** 总指挥点上限加成 */
  getCommandPointsBonus() {
    var e = this.getEffects();
    var total = e.commandPointsBonus || 0;
    /* 兼容旧格式：直接从政策数据的 cp_bonus 字段读取 */
    for (const id of this._activatedPolicies) {
      var c = this.get(id);
      if (c && c.cp_bonus) total += c.cp_bonus;
    }
    if (this._government) {
      var g = this.get(this._government);
      if (g && g.cp_bonus) total += g.cp_bonus;
    }
    return total;
  }

  _onDayStart(data) {
    // 冷却到期无需额外处理，激活时读取 _policyCooldownUntilDay 判断
  }

  /** 激活政策卡（带冷却） */
  activatePolicy(id) {
    const c = this.get(id);
    if (!c || c.policyType !== 'policy') return { valid: false, reason: '非政策卡' };
    if (!this._researched.has(id)) return { valid: false, reason: '未研究' };
    if (this._activatedPolicies.has(id)) return { valid: false, reason: '已激活' };
    const day = this._timeSystem ? this._timeSystem.day : 0;
    if (day < this._policyCooldownUntilDay) {
      return { valid: false, reason: `切换冷却中（第${this._policyCooldownUntilDay}日）` };
    }
    this._activatedPolicies.add(id);
    this._policyCooldownUntilDay = day + POLICY_COOLDOWN_DAYS;
    this._updateStore();
    eventBus.emit('culturePolicyToggled', { id, activated: true });
    return { valid: true };
  }

  /** 取消激活政策卡（带冷却） */
  deactivatePolicy(id) {
    const c = this.get(id);
    if (!c || c.policyType !== 'policy') return { valid: false, reason: '非政策卡' };
    if (!this._activatedPolicies.has(id)) return { valid: false, reason: '未激活' };
    if (c.tier === 0) return { valid: false, reason: '基础政策不可取消' };
    const day = this._timeSystem ? this._timeSystem.day : 0;
    if (day < this._policyCooldownUntilDay) {
      return { valid: false, reason: `切换冷却中（第${this._policyCooldownUntilDay}日）` };
    }
    this._activatedPolicies.delete(id);
    this._policyCooldownUntilDay = day + POLICY_COOLDOWN_DAYS;
    this._updateStore();
    eventBus.emit('culturePolicyToggled', { id, activated: false });
    return { valid: true };
  }

  /**
   * 聚合所有已激活政策 + 当前政体的效果修饰符
   * @returns {Object} 乘性修饰符（1 = 无影响）
   */
  getEffects() {
    const e = {
      warriorDamageMul: 1,
      archerDamageMul: 1,
      unitHpMul: 1,
      productionMul: 1,
      buildCostMul: 1,
      growthMul: 1,
      maxPopBonus: 0,
      foodConsumeMul: 1,
      researchSpeedMul: 1,
      commandPointsBonus: 0
    };
    const apply = (cfg) => {
      if (!cfg || !cfg.effects) return;
      const ce = cfg.effects.combat || {};
      const ee = cfg.effects.economy || {};
      const pe = cfg.effects.population || {};
      if (ce.warriorDamageMul) e.warriorDamageMul *= ce.warriorDamageMul;
      if (ce.archerDamageMul) e.archerDamageMul *= ce.archerDamageMul;
      if (ce.unitHpMul) e.unitHpMul *= ce.unitHpMul;
      if (ee.productionMul) e.productionMul *= ee.productionMul;
      if (ee.buildCostMul) e.buildCostMul *= ee.buildCostMul;
      if (ee.researchSpeedMul) e.researchSpeedMul *= ee.researchSpeedMul;
      if (ee.commandPointsBonus) e.commandPointsBonus += ee.commandPointsBonus;
      if (pe.growthMul) e.growthMul *= pe.growthMul;
      if (pe.foodConsumeMul) e.foodConsumeMul *= pe.foodConsumeMul;
      if (pe.maxPopBonus) e.maxPopBonus += pe.maxPopBonus;
    };
    for (const id of this._activatedPolicies) apply(this.get(id));
    if (this._government) apply(this.get(this._government));
    /* 灵感研究的信条：直接加算到对应效果 */
    const researchedDoctrines = this.getDoctrineResearched();
    for (const d of this._getDoctrineConfigs()) {
      if (!researchedDoctrines.includes(d.id)) continue;
      if (d.commandPointsBonus) e.commandPointsBonus += d.commandPointsBonus;
      if (d.growthSpeedBonus) e.growthMul += d.growthSpeedBonus;
    }
    return e;
  }

  _updateStore() {
    store.setState({
      cultureResearched: [...this._researched],
      cultureCurrent: this._currentResearch ? { ...this._currentResearch } : null,
      cultureActivated: [...this._activatedPolicies],
      cultureGovernment: this._government,
      cultureVersion: Date.now()
    });
  }

  // ===== 存档 =====
  getState() {
    return {
      researched: [...this._researched],
      currentResearch: this._currentResearch ? { ...this._currentResearch } : null,
      activatedPolicies: [...this._activatedPolicies],
      government: this._government,
      policyCooldownUntilDay: this._policyCooldownUntilDay
    };
  }

  restoreState(state) {
    if (!state) return;
    this._researched = new Set(state.researched || []);
    this._currentResearch = state.currentResearch || null;
    this._activatedPolicies = new Set(state.activatedPolicies || []);
    this._government = state.government || null;
    this._policyCooldownUntilDay = state.policyCooldownUntilDay || 0;
    this._updateStore();
  }
}
