import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class BlackMistSystem {
  constructor() {
    this.radius = 5;
    this.originX = 0;
    this.originY = 0;
    this._lastDay = 1;
    this._systems = {};
    eventBus.on('dayStart', ({ day } = {}) => this.onDayStart(day || 1));
  }

  setSystems(systems = {}) { this._systems = systems; }

  initNew() {
    const map = configRegistry.get('map') || {};
    const boss = this._systems.combat?.enemies?.find(enemy => enemy.enemyId === 'eastern_ruin_guardian');
    this.originX = Math.floor(boss?.originX ?? map.gridWidth - 5);
    this.originY = Math.floor(boss?.originY ?? map.gridHeight / 2);
    this.radius = 5;
    this._lastDay = store.getState('timeDay') || 1;
    this._applyCorruption();
    this._notify();
  }

  isCovered(x, y) {
    const dx = Number(x) - this.originX, dy = Number(y) - this.originY;
    return this.radius > 0 && dx * dx + dy * dy <= this.radius * this.radius;
  }

  getTileEffect(x, y) { return this.isCovered(x, y) ? { hpPerTick: -30, label: '黑雾：玩家军团每时段损失30生命值' } : null; }

  onDayStart(day) {
    day = Math.max(1, Math.floor(Number(day) || 1));
    if (day <= this._lastDay) return;
    this.radius += day - this._lastDay;
    this._lastDay = day;
    this._applyCorruption();
    this._notify();
  }

  _applyCorruption() {
    this._systems.resourceNodes?.corruptCovered?.((x, y) => this.isCovered(x, y));
    this._systems.wildSites?.corruptCovered?.((x, y) => this.isCovered(x, y));
    this._systems.diplomacy?.corruptCovered?.((x, y) => this.isCovered(x, y));
    this._systems.enemyExpansion?.corruptCovered?.((x, y) => this.isCovered(x, y));
  }

  _notify() {
    store.setState({ blackMist: { originX: this.originX, originY: this.originY, radius: this.radius }, blackMistVersion: Date.now() });
    eventBus.emit('blackMistChanged', this.getState());
  }

  getState() { return { originX: this.originX, originY: this.originY, radius: this.radius, lastDay: this._lastDay }; }
  restoreState(state) {
    if (!state) return this.initNew();
    this.originX = Math.floor(Number(state.originX) || 0);
    this.originY = Math.floor(Number(state.originY) || 0);
    this.radius = Math.max(5, Math.floor(Number(state.radius) || 0));
    this._lastDay = Math.max(1, Math.floor(Number(state.lastDay) || 1));
    this._applyCorruption();
    this._notify();
  }
}
