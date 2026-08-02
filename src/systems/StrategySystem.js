import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

/**
 * 一次性历史策略卡。策略来自任务、事件、英雄与时代奖励，持续效果按游戏刻或天数结算。
 */
export class StrategySystem {
  constructor() {
    this._cards = {};
    this._cooldowns = {};
    this._activeEffects = [];
    this._resourceSystem = null;
    eventBus.on('tick', () => this.advanceTicks(1));
    eventBus.on('dayStart', () => this.advanceDays(1));
  }

  setSystems({ resource } = {}) {
    if (resource) this._resourceSystem = resource;
  }

  getStrategies() { return configRegistry.getHistoricalContent().strategies || []; }
  getStrategy(id) { return this.getStrategies().find(item => item.id === id) || null; }
  getCards() { return { ...this._cards }; }
  getCardCount(id) { return this._cards[id] || 0; }
  getActiveEffects() { return structuredClone(this._activeEffects); }

  initNew() {
    this._cards = { forced_march: 1, harvest_drive: 1, fortify: 1 };
    this._cooldowns = {};
    this._activeEffects = [];
    this._notify();
  }

  gainCard(id, amount = 1) {
    if (!this.getStrategy(id) || amount <= 0) return false;
    this._cards[id] = (this._cards[id] || 0) + Math.floor(amount);
    this._notify();
    eventBus.emit('strategyCardGained', { strategyId: id, amount: Math.floor(amount) });
    return true;
  }

  canPlay(id) {
    const strategy = this.getStrategy(id);
    if (!strategy) return { ok: false, reason: '未知策略' };
    if ((this._cards[id] || 0) <= 0) return { ok: false, reason: '没有这张策略卡' };
    if ((this._cooldowns[id] || 0) > 0) return { ok: false, reason: `还需等待 ${this._cooldowns[id]} 天` };
    return { ok: true };
  }

  play(id) {
    const eligibility = this.canPlay(id);
    if (!eligibility.ok) return eligibility;
    const strategy = this.getStrategy(id);
    this._cards[id] -= 1;
    if (this._cards[id] <= 0) delete this._cards[id];
    if (strategy.cooldownDays > 0) this._cooldowns[id] = strategy.cooldownDays;
    const durationTicks = strategy.params?.durationTicks || 0;
    const durationDays = strategy.params?.durationDays || 0;
    if (durationTicks || durationDays) {
      this._activeEffects = this._activeEffects.filter(effect => effect.strategyId !== id);
      this._activeEffects.push({
        strategyId: id,
        effectType: strategy.effectType,
        params: structuredClone(strategy.params || {}),
        remainingTicks: durationTicks,
        remainingDays: durationDays
      });
    } else {
      this._applyImmediate(strategy);
    }
    this._notify();
    eventBus.emit('strategyPlayed', { strategyId: id, effectType: strategy.effectType, params: strategy.params || {} });
    eventBus.emit('combatBroadcast', { message: `📜 已执行策略：${strategy.name}` });
    return { ok: true };
  }

  _applyImmediate(strategy) {
    const params = strategy.params || {};
    if (strategy.effectType === 'instant_resource' && this._resourceSystem) {
      this._resourceSystem.addClamped(params.resourceId, params.amount || 0);
      if (params.satisfactionCost) {
        store.setState({ populationSatisfaction: Math.max(0, (store.getState('populationSatisfaction') || 50) - params.satisfactionCost) });
      }
    }
    eventBus.emit('strategyImmediateEffect', { effectType: strategy.effectType, params });
  }

  advanceTicks(amount = 1) {
    if (amount <= 0) return;
    let changed = false;
    for (const effect of this._activeEffects) {
      if (effect.remainingTicks > 0) {
        effect.remainingTicks = Math.max(0, effect.remainingTicks - amount);
        changed = true;
      }
    }
    const before = this._activeEffects.length;
    this._activeEffects = this._activeEffects.filter(effect => effect.remainingTicks > 0 || effect.remainingDays > 0);
    if (changed || before !== this._activeEffects.length) this._notify();
  }

  advanceDays(amount = 1) {
    if (amount <= 0) return;
    for (const id of Object.keys(this._cooldowns)) {
      this._cooldowns[id] = Math.max(0, this._cooldowns[id] - amount);
      if (!this._cooldowns[id]) delete this._cooldowns[id];
    }
    for (const effect of this._activeEffects) {
      if (effect.remainingDays > 0) effect.remainingDays = Math.max(0, effect.remainingDays - amount);
    }
    this._activeEffects = this._activeEffects.filter(effect => effect.remainingTicks > 0 || effect.remainingDays > 0);
    this._notify();
  }

  _effectsOf(type) { return this._activeEffects.filter(effect => effect.effectType === type); }

  getEffectMultiplier(type) {
    return this._effectsOf(type).reduce((value, effect) => value * (effect.params?.multiplier || 1), 1);
  }

  getProductionMultiplier(resourceId) {
    return this._effectsOf('regional_production')
      .filter(effect => !effect.params?.resourceId || effect.params.resourceId === resourceId)
      .reduce((value, effect) => value * (effect.params?.multiplier || 1), 1);
  }

  isCountdownFrozen() { return this._effectsOf('freeze_enemy_countdown').length > 0; }

  getStrengthPenaltyAt(_x, _y, baseStrength = 100) {
    const multiplier = ['enemy_power_debuff', 'enemy_supply']
      .flatMap(type => this._effectsOf(type))
      .reduce((value, effect) => value * (effect.params?.multiplier || 1), 1);
    return Math.max(0, Math.round(baseStrength * (1 - multiplier)));
  }

  _notify() {
    store.setState({
      strategyCards: { ...this._cards },
      strategyCooldowns: { ...this._cooldowns },
      activeStrategies: structuredClone(this._activeEffects),
      strategyVersion: (store.getState('strategyVersion') || 0) + 1
    });
  }

  getState() {
    return {
      cards: { ...this._cards },
      cooldowns: { ...this._cooldowns },
      activeEffects: structuredClone(this._activeEffects)
    };
  }

  restoreState(state) {
    this._cards = { ...(state?.cards || {}) };
    this._cooldowns = { ...(state?.cooldowns || {}) };
    this._activeEffects = structuredClone(state?.activeEffects || []);
    this._notify();
  }
}

