import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

const BASIC_ACTIONS = new Set(['talk', 'gift', 'aid']);
const TREATY_ACTIONS = new Set(['ceasefire', 'trade', 'open_borders', 'non_aggression', 'joint_patrol', 'alliance']);
const EXPANDING_STATUSES = new Set(['hostile', 'wary']);

/**
 * 固定城邦外交。城邦不使用玩家的科技、人口与建筑循环，仅保留驻军、关系、条约和有限领地扩张。
 */
export class DiplomacySystem {
  constructor() {
    this._states = {};
    this._resourceSystem = null;
    this._cultureSystem = null;
    this._heroSystem = null;
    this._luxurySystem = null;
    this._lastProcessedDay = 0;
    eventBus.on('dayStart', ({ day } = {}) => this.advanceDay(day || 1));
  }

  setSystems(systems = {}) {
    if (systems.resource) this._resourceSystem = systems.resource;
    if (systems.culture) this._cultureSystem = systems.culture;
    if (systems.hero) this._heroSystem = systems.hero;
    if (systems.luxury) this._luxurySystem = systems.luxury;
  }

  get _config() {
    const integration = configRegistry.get('eaIntegration') || {};
    return { actions: integration.outpostActions || {}, outposts: integration.outposts || [] };
  }

  getAllOutposts() { return this._config.outposts; }
  getVisibleOutposts() { return this.getAllOutposts().filter(outpost => this._states[outpost.id]?.active); }
  getOutpost(id) { return this.getAllOutposts().find(outpost => outpost.id === id) || null; }

  initNew() {
    this._states = {};
    this._lastProcessedDay = 0;
    for (const outpost of this.getAllOutposts()) this._states[outpost.id] = this._makeInitialState(outpost);
    this._notify();
  }

  _makeInitialState(outpost) {
    const relation = Number(outpost.initialRelation) || 0;
    return {
      relation,
      status: this._deriveStatus(relation),
      discovered: false,
      interactions: 0,
      active: false,
      activatedDay: null,
      lastExpansionDay: null,
      controlledCells: [],
      treaties: []
    };
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
    return structuredClone(this._states[id]);
  }

  discoverOutpost(id) {
    const state = this.getOutpostState(id);
    const outpost = this.getOutpost(id);
    if (!state || !outpost) return false;
    this._states[id] = {
      ...state,
      active: true,
      activatedDay: state.activatedDay || store.getState('timeDay') || 1,
      controlledCells: state.controlledCells.length ? state.controlledCells : [{ x: outpost.gridX, y: outpost.gridY }],
      discovered: true
    };
    this._notify();
    return true;
  }

  advanceDay(day) {
    if (!Number.isFinite(day) || day < 1 || day <= this._lastProcessedDay) return false;
    this._lastProcessedDay = day;
    let changed = false;
    if (day >= 10) {
      for (const outpost of this.getAllOutposts()) {
        const state = this._states[outpost.id] || this._makeInitialState(outpost);
        if (!state.active) {
          this._states[outpost.id] = {
            ...state,
            active: true,
            activatedDay: day,
            controlledCells: [{ x: outpost.gridX, y: outpost.gridY }]
          };
          changed = true;
        }
      }
    }
    if (day >= 13 && (day - 10) % 3 === 0) {
      for (const outpost of this.getAllOutposts()) changed = this._expandOutpost(outpost, day) || changed;
    }
    if (changed) {
      this._notify();
      eventBus.emit('cityStatesChanged', { day });
    }
    return changed;
  }

  _expandOutpost(outpost, day) {
    const state = this._states[outpost.id];
    if (!state?.active || state.status === 'defeated' || !EXPANDING_STATUSES.has(state.status)) return false;
    const maxCells = 12;
    if (state.controlledCells.length >= maxCells) return false;
    const occupied = new Set(Object.values(this._states).flatMap(item => item.controlledCells || []).map(cell => `${cell.x},${cell.y}`));
    const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    for (const cell of state.controlledCells) {
      for (const [dx, dy] of directions) {
        const target = { x: cell.x + dx, y: cell.y + dy };
        if (target.x < 0 || target.y < 0 || target.x >= 200 || target.y >= 200) continue;
        if (Math.abs(target.x - outpost.gridX) + Math.abs(target.y - outpost.gridY) > 5) continue;
        if (occupied.has(`${target.x},${target.y}`)) continue;
        state.controlledCells.push(target);
        state.lastExpansionDay = day;
        return true;
      }
    }
    return false;
  }

  _cultureUnlocks() { return new Set(this._cultureSystem?.getUnlockedDiplomacyActions?.() || []); }

  getAvailableActions(id) {
    const outpost = this.getOutpost(id);
    const state = this.getOutpostState(id);
    if (!outpost || !state || state.status === 'defeated') return [];
    const unlocked = this._cultureUnlocks();
    return (outpost.actions || []).filter(actionId => BASIC_ACTIONS.has(actionId) || unlocked.has(actionId));
  }

  getDiplomaticSummary(id) {
    const outpost = this.getOutpost(id);
    const state = this.getOutpostState(id);
    if (!outpost || !state) return null;
    return {
      relation: state.relation,
      status: state.status,
      activeTreaties: [...(state.treaties || [])],
      availableTreaties: (outpost.actions || []).filter(actionId => TREATY_ACTIONS.has(actionId)),
      controlledCellCount: state.controlledCells.length,
      defense: this.getOutpostDefense(id),
      expansionState: EXPANDING_STATUSES.has(state.status) ? 'expanding' : 'contained'
    };
  }

  performAction(outpostId, actionId) {
    const outpost = this.getOutpost(outpostId);
    const state = this.getOutpostState(outpostId);
    const action = this._config.actions[actionId];
    if (!outpost || !state || !action) return { ok: false, reason: '城邦或外交行动不存在' };
    if (state.status === 'defeated') return { ok: false, reason: '该城邦已经被征服' };
    if (!this.getAvailableActions(outpostId).includes(actionId)) return { ok: false, reason: '人文树尚未解锁该外交行动' };
    if (state.relation < (action.minimumRelation ?? -100)) return { ok: false, reason: `关系不足，需要 ${action.minimumRelation}` };
    if (action.cost?.length && (!this._resourceSystem || !this._resourceSystem.canAfford(action.cost))) return { ok: false, reason: '资源不足' };
    if (action.cost?.length) this._resourceSystem.consumeAll(action.cost);
    for (const reward of action.rewards || []) this._resourceSystem?.add(reward.resourceId, reward.amount);
    const heroBonus = Number(this._heroSystem?.getBonuses?.().diplomacyRelationBonus) || 0;
    const luxuryBonus = Number(this._luxurySystem?.getBonuses?.().outpostRelationGainBonus) || 0;
    const relation = Math.max(-100, Math.min(100, state.relation + (action.relationDelta || 0) + heroBonus + luxuryBonus));
    const treaties = new Set(state.treaties || []);
    if (TREATY_ACTIONS.has(actionId)) treaties.add(actionId);
    this._states[outpostId] = {
      ...state,
      relation,
      status: action.forceStatus || this._deriveStatus(relation),
      active: true,
      discovered: true,
      interactions: (state.interactions || 0) + 1,
      lastAction: actionId,
      treaties: [...treaties]
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
    this._states[outpostId] = { ...state, active: true, relation, status: this._deriveStatus(relation), discovered: true };
    this._notify();
    eventBus.emit('combatBroadcast', { message: `🤝 ${outpost.name}关系因${reason}变为 ${relation}` });
    return true;
  }

  getOutpostDefense(outpostId) {
    const outpost = this.getOutpost(outpostId);
    const state = this.getOutpostState(outpostId);
    if (!outpost || !state) return 0;
    const day = store.getState('timeDay') || this._lastProcessedDay || 1;
    return Math.round((Number(outpost.militaryStrength) || 0) + Math.max(0, state.controlledCells.length - 1) * 2 + Math.max(0, day - 10) * 0.2);
  }

  attackOutpost(outpostId, force = {}) {
    const outpost = this.getOutpost(outpostId);
    const state = this.getOutpostState(outpostId);
    if (!outpost || !state) return { ok: false, reason: '城邦不存在' };
    if (state.status === 'defeated') return { ok: false, reason: '该城邦已经被征服' };
    const power = Math.max(0, Number(force.power) || 0);
    const defense = this.getOutpostDefense(outpostId);
    const victory = power > defense;
    if (victory) {
      this._states[outpostId] = {
        ...state,
        relation: -100,
        status: 'defeated',
        active: true,
        discovered: true,
        treaties: [],
        conqueredDay: store.getState('timeDay') || this._lastProcessedDay || 1,
        conqueredByArmyId: force.armyId || null
      };
      eventBus.emit('combatBroadcast', { message: `⚔️ 已攻克 ${outpost.name}；据点将作为附属领地保留。` });
    } else {
      this._states[outpostId] = { ...state, active: true, relation: Math.max(-100, state.relation - 20), status: 'hostile', treaties: [] };
      eventBus.emit('combatBroadcast', { message: `⚔️ 进攻 ${outpost.name} 失败（${power}/${defense}）。` });
    }
    this._notify();
    eventBus.emit('outpostBattleResolved', { outpostId, victory, power, defense });
    return { ok: true, victory, power, defense };
  }

  _notify() {
    store.setState({
      outpostStates: structuredClone(this._states),
      activeCityStateCount: this.getVisibleOutposts().length,
      outpostVersion: (store.getState('outpostVersion') || 0) + 1
    });
  }

  getState() { return { states: structuredClone(this._states), lastProcessedDay: this._lastProcessedDay }; }

  restoreState(saved) {
    this._states = {};
    this._lastProcessedDay = saved?.lastProcessedDay || 0;
    for (const outpost of this.getAllOutposts()) {
      const base = this._makeInitialState(outpost);
      const previous = saved?.states?.[outpost.id] || {};
      this._states[outpost.id] = {
        ...base,
        ...previous,
        controlledCells: structuredClone(previous.controlledCells || base.controlledCells),
        treaties: [...(previous.treaties || [])]
      };
    }
    this._notify();
  }
}
