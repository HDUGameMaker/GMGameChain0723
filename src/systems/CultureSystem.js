/**
 * CultureSystem - 人文政策树系统
 * 管理政策/政体的研究、激活、效果分发
 * 框架照搬 TechSystem，新增：政策卡激活 + 政体选定（不可逆）+ 效果聚合
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';
import { mergeModifierValue } from '../utils/BonusUtils.js';

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
    /** @type {Set<string>} 已研发的军事传统/阵型ID */
    this._formationResearch = new Set();
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
  setTechSystem(ts) { this._techSystem = ts; }
  setHeroSystem(hs) { this._heroSystem = hs; }

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

  /** 外交扩展只读取已有文化节点状态，不替换主版本文化树。 */
  getUnlockedDiplomacyActions() {
    const result = new Set(['talk', 'gift', 'aid']);
    const unlocks = configRegistry.get('eaIntegration')?.cultureDiplomacyUnlocks || {};
    const doctrines = new Set(this.getDoctrineResearched());
    for (const [cultureId, actionIds] of Object.entries(unlocks)) {
      if (!this._researched.has(cultureId) && !this._activatedPolicies.has(cultureId) && this._government !== cultureId && !doctrines.has(cultureId)) continue;
      for (const actionId of actionIds || []) result.add(actionId);
    }
    return [...result];
  }

  /** 已通过灵感研究的信条（doctrines.json） */
  getDoctrineResearched() { return store.getState('doctrineResearched') || []; }
  getDoctrineResearchLevels() { return store.getState('doctrineResearchLevels') || {}; }
  getDoctrineLevel(id) {
    const levels = this.getDoctrineResearchLevels();
    return Math.max(0, levels[id] || 0);
  }

  _getDoctrineConfigs() { return configRegistry.get('doctrines') || []; }
  _getFormationConfigs() { return configRegistry.get('enemies')?.formations || []; }
  _getUnitConfigs() { return configRegistry.get('enemies')?.units || []; }

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
    const speedMul = (this.getEffects().researchSpeedMul || 1) * (this._heroSystem?.getBonuses?.().researchSpeedMul || 1);
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
      eventBus.emit('combatBroadcast', { message: `🏛️ 选定政体：${c.name}` });
    } else if (c && c.policyType === 'policy') {
      // 政策卡研究完成默认激活
      this._activatedPolicies.add(id);
    }
    this._updateStore();
    eventBus.emit('cultureResearched', { id });
  }

  /** 检查阵型是否被文化政策解锁 */
  isFormationUnlockedByCulture(formationId) {
    const f = this._getFormationConfigs().find(x => x.id === formationId);
    if (f?.unlocked === true) return true;
    return this._formationResearch.has(formationId);
  }

  getFormationResearch() {
    return [...this._formationResearch];
  }

  _getLowestUnitForReq(req) {
    const units = this._getUnitConfigs().filter(u => {
      if (req.unitId) return u.id === req.unitId;
      if (req.branch && u.branch !== req.branch) return false;
      if (req.domain && (u.domain || 'land') !== req.domain) return false;
      return true;
    });
    units.sort((a, b) => (a.tier || 0) - (b.tier || 0) || (a.combatPower || 0) - (b.combatPower || 0));
    return units[0] || null;
  }

  getFormationRequirements(formationId) {
    const f = this._getFormationConfigs().find(x => x.id === formationId);
    if (!f) return [];
    const seen = new Set();
    const result = [];
    for (const req of f.requiredUnits || []) {
      const unit = this._getLowestUnitForReq(req);
      if (!unit || seen.has(unit.id)) continue;
      seen.add(unit.id);
      result.push(unit);
    }
    return result;
  }

  canResearchFormation(formationId) {
    const f = this._getFormationConfigs().find(x => x.id === formationId);
    if (!f) return { valid: false, reason: '阵型不存在' };
    if (this.isFormationUnlockedByCulture(formationId)) return { valid: false, reason: '已研发完成' };
    const unitResearch = store.getState('unitResearch') || [];
    const requiredUnits = this.getFormationRequirements(formationId);
    for (const unit of requiredUnits) {
      if (!unitResearch.includes(unit.id)) return { valid: false, reason: '前置兵种未研发: ' + unit.name };
    }
    const cost = f.researchCost || 0;
    if ((store.getState('inspiration') || 0) < cost) return { valid: false, reason: '灵感不足' };
    return { valid: true };
  }

  researchFormation(formationId) {
    const check = this.canResearchFormation(formationId);
    if (!check.valid) return false;
    const f = this._getFormationConfigs().find(x => x.id === formationId);
    const cost = f?.researchCost || 0;
    this._formationResearch.add(formationId);
    store.setState({ inspiration: Math.max(0, (store.getState('inspiration') || 0) - cost) });
    this._updateStore();
    eventBus.emit('formationResearched', { formationId });
    eventBus.emit('combatBroadcast', { message: '📜 完成军事传统研发: ' + (f?.name || formationId) });
    return true;
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
      meleeDamageMul: 1,
      rangedDamageMul: 1,
      unitHpMul: 1,
      productionMul: 1,
      resourceProductionMul: {},
      buildCostMul: 1,
      growthMul: 1,
      maxPopBonus: 0,
      foodConsumeMul: 1,
      researchSpeedMul: 1,
      commandPointsBonus: 0,
      expeditionQueueBonus: 0
    };
    const apply = (cfg) => {
      if (!cfg || !cfg.effects) return;
      const ce = cfg.effects.combat || {};
      const ee = cfg.effects.economy || {};
      const pe = cfg.effects.population || {};
      const meleeDamageMul = ce.meleeDamageMul || ce.warriorDamageMul;
      const rangedDamageMul = ce.rangedDamageMul || ce.archerDamageMul;
      if (meleeDamageMul) mergeModifierValue(e, 'meleeDamageMul', meleeDamageMul);
      if (rangedDamageMul) mergeModifierValue(e, 'rangedDamageMul', rangedDamageMul);
      if (ce.unitHpMul) mergeModifierValue(e, 'unitHpMul', ce.unitHpMul);
      if (ee.productionMul) mergeModifierValue(e, 'productionMul', ee.productionMul);
      if (ee.resourceProductionMul && typeof ee.resourceProductionMul === 'object') {
        for (const [resourceId, mul] of Object.entries(ee.resourceProductionMul)) {
          mergeModifierValue(e.resourceProductionMul, resourceId, mul);
        }
      }
      if (ee.buildCostMul) mergeModifierValue(e, 'buildCostMul', ee.buildCostMul);
      if (ee.researchSpeedMul) mergeModifierValue(e, 'researchSpeedMul', ee.researchSpeedMul);
      if (ee.commandPointsBonus) mergeModifierValue(e, 'commandPointsBonus', ee.commandPointsBonus, 'add');
      if (ee.expeditionQueueBonus) mergeModifierValue(e, 'expeditionQueueBonus', ee.expeditionQueueBonus, 'add');
      if (pe.growthMul) mergeModifierValue(e, 'growthMul', pe.growthMul);
      if (pe.foodConsumeMul) mergeModifierValue(e, 'foodConsumeMul', pe.foodConsumeMul);
      if (pe.maxPopBonus) mergeModifierValue(e, 'maxPopBonus', pe.maxPopBonus, 'add');
    };
    for (const id of this._activatedPolicies) apply(this.get(id));
    if (this._government) apply(this.get(this._government));
    /* 灵感研究的信条：直接加算到对应效果 */
    const researchedDoctrines = this.getDoctrineResearched();
    const doctrineLevels = this.getDoctrineResearchLevels();
    for (const d of this._getDoctrineConfigs()) {
      const level = d.repeatable ? Math.max(0, doctrineLevels[d.id] || 0) : (researchedDoctrines.includes(d.id) ? 1 : 0);
      if (level <= 0) continue;
      if (d.commandPointsBonus) mergeModifierValue(e, 'commandPointsBonus', d.commandPointsBonus * level, 'add');
      if (d.growthSpeedBonus) mergeModifierValue(e, 'growthMul', d.growthSpeedBonus * level, 'add');
      if (d.expeditionQueueBonus) mergeModifierValue(e, 'expeditionQueueBonus', d.expeditionQueueBonus * level, 'add');
      if (d.foodConsumeMul) mergeModifierValue(e, 'foodConsumeMul', Math.pow(d.foodConsumeMul, level));
      if (d.productionMul) mergeModifierValue(e, 'productionMul', Math.pow(d.productionMul, level));
      if (d.resourceProductionMul && typeof d.resourceProductionMul === 'object') {
        for (const [resourceId, mul] of Object.entries(d.resourceProductionMul)) {
          mergeModifierValue(e.resourceProductionMul, resourceId, Math.pow(mul, level));
        }
      }
      if (d.meleeDamageMul) mergeModifierValue(e, 'meleeDamageMul', Math.pow(d.meleeDamageMul, level));
      if (d.rangedDamageMul) mergeModifierValue(e, 'rangedDamageMul', Math.pow(d.rangedDamageMul, level));
      if (d.unitHpMul) mergeModifierValue(e, 'unitHpMul', Math.pow(d.unitHpMul, level));
    }
    return e;
  }

  _updateStore() {
    store.setState({
      cultureResearched: [...this._researched],
      cultureCurrent: this._currentResearch ? { ...this._currentResearch } : null,
      cultureActivated: [...this._activatedPolicies],
      cultureGovernment: this._government,
      formationResearch: [...this._formationResearch],
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
      policyCooldownUntilDay: this._policyCooldownUntilDay,
      formationResearch: [...this._formationResearch]
    };
  }

  restoreState(state) {
    if (!state) return;
    this._researched = new Set(state.researched || []);
    this._currentResearch = state.currentResearch || null;
    this._activatedPolicies = new Set(state.activatedPolicies || []);
    this._government = state.government || null;
    this._policyCooldownUntilDay = state.policyCooldownUntilDay || 0;
    this._formationResearch = new Set(state.formationResearch || []);
    this._updateStore();
  }
}
