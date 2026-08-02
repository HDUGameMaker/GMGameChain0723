import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

const BASIC_ACTIONS = new Set(['talk', 'gift', 'aid']);

export class DiplomacySystem {
  constructor() {
    this._states = {};
    this._resourceSystem = null;
    this._cultureSystem = null;
    this._heroSystem = null;
  }

  setSystems(systems = {}) {
    if (systems.resource) this._resourceSystem = systems.resource;
    if (systems.culture) this._cultureSystem = systems.culture;
    if (systems.hero) this._heroSystem = systems.hero;
  }

  get _config() {
    const integration = configRegistry.get('eaIntegration') || {};
    return { actions: integration.outpostActions || {}, outposts: integration.outposts || [] };
  }

  getAllOutposts() { return this._config.outposts; }
  getOutpost(id) { return this.getAllOutposts().find(outpost => outpost.id === id) || null; }

  initNew() {
    this._states = {};
    for (const outpost of this.getAllOutposts()) {
      this._states[outpost.id] = this._makeInitialState(outpost);
    }
    this._notify();
  }

  _makeInitialState(outpost) {
    const relation = Number(outpost.initialRelation) || 0;
    return { relation, status: this._deriveStatus(relation), discovered: false, interactions: 0 };
  }

  _deriveStatus(relation) {
    if (relation >= 60) return 'allied';
    if (relation >= 30) return 'friendly';
    if (relation >= 0) return 'neutral';
    if (relation >= -40) return 'wary';
    return 'hostile';
  }

  getOutpostState(id) {
    const outpost = this.getOutpost(id);
    if (!outpost) return null;
    if (!this._states[id]) this._states[id] = this._makeInitialState(outpost);
    return { ...this._states[id] };
  }

  discoverOutpost(id) {
    const state = this.getOutpostState(id);
    if (!state) return false;
    this._states[id] = { ...state, discovered: true };
    this._notify();
    return true;
  }

  _cultureUnlocks() {
    return new Set(this._cultureSystem?.getUnlockedDiplomacyActions?.() || []);
  }

  getAvailableActions(id) {
    const outpost = this.getOutpost(id);
    const state = this.getOutpostState(id);
    if (!outpost || !state || state.status === 'defeated') return [];
    const unlocked = this._cultureUnlocks();
    return (outpost.actions || []).filter(actionId => BASIC_ACTIONS.has(actionId) || unlocked.has(actionId));
  }

  performAction(outpostId, actionId) {
    const outpost = this.getOutpost(outpostId);
    const state = this.getOutpostState(outpostId);
    const action = this._config.actions[actionId];
    if (!outpost || !state || !action) return { ok: false, reason: '据点或行动不存在' };
    if (state.status === 'defeated') return { ok: false, reason: '据点已经被征服' };
    if (!this.getAvailableActions(outpostId).includes(actionId)) return { ok: false, reason: '文化树尚未解锁该外交行动' };
    if (state.relation < (action.minimumRelation ?? -100)) return { ok: false, reason: `关系不足，需要 ${action.minimumRelation}` };
    if (action.cost?.length && (!this._resourceSystem || !this._resourceSystem.canAfford(action.cost))) {
      return { ok: false, reason: '资源不足' };
    }
    if (action.cost?.length) this._resourceSystem.consumeAll(action.cost);
    for (const reward of action.rewards || []) this._resourceSystem?.add(reward.resourceId, reward.amount);
    const heroBonus = Number(this._heroSystem?.getBonuses?.().diplomacyRelationBonus) || 0;
    const relation = Math.max(-100, Math.min(100, state.relation + (action.relationDelta || 0) + heroBonus));
    this._states[outpostId] = {
      ...state,
      relation,
      status: action.forceStatus || this._deriveStatus(relation),
      discovered: true,
      interactions: (state.interactions || 0) + 1,
      lastAction: actionId
    };
    this._notify();
    eventBus.emit('combatBroadcast', { message: `🤝 ${outpost.name}：${action.name}成功，关系 ${relation}` });
    eventBus.emit('diplomacyAction', { outpostId, actionId, relation });
    return { ok: true, relation, status: this._states[outpostId].status };
  }

  adjustRelation(outpostId, amount, reason = '事件') {
    const state = this.getOutpostState(outpostId);
    const outpost = this.getOutpost(outpostId);
    if (!state || !outpost || state.status === 'defeated') return false;
    const relation = Math.max(-100, Math.min(100, state.relation + (Number(amount) || 0)));
    this._states[outpostId] = { ...state, relation, status: this._deriveStatus(relation), discovered: true };
    this._notify();
    eventBus.emit('combatBroadcast', { message: `🤝 ${outpost.name}关系因${reason}变为 ${relation}` });
    return true;
  }

  attackOutpost(outpostId, force = {}) {
    const outpost = this.getOutpost(outpostId);
    const state = this.getOutpostState(outpostId);
    if (!outpost || !state) return { ok: false, reason: '据点不存在' };
    if (state.status === 'defeated') return { ok: false, reason: '据点已经被征服' };
    const power = Math.max(0, Number(force.power) || 0);
    const defense = Number(outpost.militaryStrength) || 0;
    const victory = power > defense;
    if (victory) {
      this._states[outpostId] = {
        ...state,
        relation: -100,
        status: 'defeated',
        discovered: true,
        conqueredDay: store.getState('timeDay') || 1,
        conqueredByArmyId: force.armyId || null
      };
      eventBus.emit('combatBroadcast', { message: `⚔️ 已攻克 ${outpost.name}；固定据点仍保留在地图上。` });
    } else {
      this._states[outpostId] = { ...state, relation: Math.max(-100, state.relation - 20), status: 'hostile', discovered: true };
      eventBus.emit('combatBroadcast', { message: `💥 进攻 ${outpost.name} 失败（${power}/${defense}）` });
    }
    this._notify();
    eventBus.emit('outpostBattleResolved', { outpostId, victory, power, defense });
    return { ok: true, victory, power, defense };
  }

  _notify() {
    store.setState({
      outpostStates: structuredClone(this._states),
      outpostVersion: (store.getState('outpostVersion') || 0) + 1
    });
  }

  getState() { return { states: structuredClone(this._states) }; }

  restoreState(saved) {
    this._states = {};
    for (const outpost of this.getAllOutposts()) {
      this._states[outpost.id] = saved?.states?.[outpost.id]
        ? { ...saved.states[outpost.id] }
        : this._makeInitialState(outpost);
    }
    this._notify();
  }
}
