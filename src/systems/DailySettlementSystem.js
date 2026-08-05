import { eventBus } from '../core/EventBus.js';

export class DailySettlementSystem {
  constructor({ resource, territory, event, popupManager } = {}) {
    this._resource = resource;
    this._territory = territory;
    this._event = event;
    this._popupManager = popupManager;
    this._resourceBaseline = {};
    this._territoryBaseline = 0;
    this._defeatedEnemies = 0;
    this._lastSummary = null;
    this._settlementOpen = false;
    eventBus.on('enemyDefeated', () => { this._defeatedEnemies += 1; });
    eventBus.on('dayEnd', ({ day } = {}) => this._settle(day || 1));
    eventBus.on('popupClosed', () => {
      if (!this._settlementOpen) return;
      for (const evt of this._event?.getSettlementEvents?.() || []) this._event.skipSettlementEvent?.(evt.id);
      // 结算事件造成的资源和领土变化属于刚结束的一日，不带入下一日统计。
      this._resourceBaseline = this._resourceSnapshot();
      this._territoryBaseline = this._territory?.getOwnedClaimableCount?.() || 0;
      this._settlementOpen = false;
      eventBus.emit('dailySettlementClosed', { day: this._lastSummary?.day || 1 });
    });
  }

  init() {
    this._resourceBaseline = this._resourceSnapshot();
    this._territoryBaseline = this._territory?.getOwnedClaimableCount?.() || 0;
    this._defeatedEnemies = 0;
    this._settlementOpen = false;
  }

  _resourceSnapshot() {
    return Object.fromEntries((this._resource?.getAll?.() || []).map(item => [item.id, { name: item.name, icon: item.icon, amount: item.current }]));
  }

  _settle(day) {
    const current = this._resourceSnapshot();
    const resourceChanges = Object.entries(current).map(([id, item]) => ({
      id, name: item.name, icon: item.icon, amount: Math.round(((item.amount || 0) - (this._resourceBaseline[id]?.amount || 0)) * 100) / 100
    })).filter(item => item.amount !== 0);
    const owned = this._territory?.getOwnedClaimableCount?.() || 0;
    this._lastSummary = {
      day,
      resourceChanges,
      territoryGained: Math.max(0, owned - this._territoryBaseline),
      enemiesDefeated: this._defeatedEnemies
    };
    this._resourceBaseline = current;
    this._territoryBaseline = owned;
    this._defeatedEnemies = 0;
    this._settlementOpen = true;
    this._popupManager?.open?.('daily_settlement', structuredClone(this._lastSummary));
    eventBus.emit('dailySettlementOpened', structuredClone(this._lastSummary));
  }

  getLastSummary() { return this._lastSummary ? structuredClone(this._lastSummary) : null; }

  getState() {
    return { resourceBaseline: structuredClone(this._resourceBaseline), territoryBaseline: this._territoryBaseline, defeatedEnemies: this._defeatedEnemies, lastSummary: this.getLastSummary() };
  }

  restoreState(state) {
    if (!state) return this.init();
    this._resourceBaseline = structuredClone(state.resourceBaseline || this._resourceSnapshot());
    this._territoryBaseline = Math.max(0, Number(state.territoryBaseline) || 0);
    this._defeatedEnemies = Math.max(0, Math.floor(Number(state.defeatedEnemies) || 0));
    this._lastSummary = state.lastSummary ? structuredClone(state.lastSummary) : null;
  }
}
