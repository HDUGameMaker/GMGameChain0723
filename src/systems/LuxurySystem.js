import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class LuxurySystem {
  constructor() {
    this._inventory = {};
    this._discoveredDeposits = [];
    this._resourceSystem = null;
    this._buildingSystem = null;
    this._diplomacySystem = null;
  }

  setSystems(systems = {}) {
    if (systems.resource) this._resourceSystem = systems.resource;
    if (systems.building) this._buildingSystem = systems.building;
    if (systems.diplomacy) this._diplomacySystem = systems.diplomacy;
  }

  getLuxuries() { return configRegistry.getHistoricalContent().luxuries || []; }
  getLuxury(id) { return this.getLuxuries().find(luxury => luxury.id === id) || null; }

  initNew() {
    this._inventory = {};
    this._discoveredDeposits = [];
    this._notify();
  }

  addLuxury(id, amount = 1) {
    if (!this.getLuxury(id) || !Number.isFinite(amount) || amount <= 0) return false;
    this._inventory[id] = (this._inventory[id] || 0) + Math.floor(amount);
    this._notify();
    eventBus.emit('luxuryChanged', { luxuryId: id, amount: this._inventory[id] });
    return true;
  }

  getInventory() { return { ...this._inventory }; }

  getBonuses() {
    const result = {};
    for (const luxury of this.getLuxuries()) {
      if ((this._inventory[luxury.id] || 0) <= 0) continue;
      for (const [key, value] of Object.entries(luxury.effects || {})) {
        if (typeof value !== 'number') continue;
        if (key.endsWith('Mul')) result[key] = (result[key] ?? 1) + (value - 1);
        else result[key] = (result[key] || 0) + value;
      }
      result.satisfactionBonus = (result.satisfactionBonus || 0) + (luxury.satisfaction || 0);
    }
    return result;
  }

  discoverDeposit(deposit) {
    if (!deposit?.id || !this.getLuxury(deposit.luxuryId)) return false;
    if (this._discoveredDeposits.some(entry => entry.id === deposit.id)) return false;
    this._discoveredDeposits.push({
      id: deposit.id,
      luxuryId: deposit.luxuryId,
      gridX: Number(deposit.gridX) || 0,
      gridY: Number(deposit.gridY) || 0,
      developed: Boolean(deposit.developed)
    });
    this._notify();
    return true;
  }

  getDiscoveredDeposits() { return this._discoveredDeposits.map(deposit => ({ ...deposit })); }

  _hasMarket() {
    return (this._buildingSystem?.buildings || []).some(building => {
      if (building.status !== 'active') return false;
      const config = configRegistry.getBuilding(building.buildingId);
      return ['market_square', 'trade_depot'].includes(building.buildingId) || config?.uniqueFunction?.unlockSystem === 'luxury_trade';
    });
  }

  canTrade(luxuryId, amount = 1, outpostId = null) {
    const luxury = this.getLuxury(luxuryId);
    if (!luxury) return { ok: false, reason: '奢侈品不存在' };
    if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: '贸易数量无效' };
    if ((this._inventory[luxuryId] || 0) - amount < 1) return { ok: false, reason: '首份奢侈品必须保留，只有重复份可以贸易' };
    if (!this._hasMarket()) return { ok: false, reason: '需要启用市场或商栈' };
    if (outpostId) {
      const state = this._diplomacySystem?.getOutpostState?.(outpostId);
      if (!state || state.status === 'defeated') return { ok: false, reason: '目标城邦不可贸易' };
    }
    return { ok: true };
  }

  tradeWithOutpost(luxuryId, outpostId, amount = 1) {
    const check = this.canTrade(luxuryId, amount, outpostId);
    if (!check.ok) return check;
    const luxury = this.getLuxury(luxuryId);
    this._inventory[luxuryId] -= amount;
    const tradeMultiplier = this.getBonuses().tradeValueMul || 1;
    const gold = Math.max(1, Math.round(luxury.baseTradeValue * amount * tradeMultiplier));
    this._resourceSystem?.addClamped?.('gold', gold);
    this._diplomacySystem?.adjustRelation?.(outpostId, 3 * amount, `${luxury.name}贸易`);
    this._notify();
    eventBus.emit('luxuryTraded', { luxuryId, outpostId, amount, gold });
    return { ok: true, gold, remaining: this._inventory[luxuryId] };
  }

  _notify() {
    store.setState({
      luxuryInventory: { ...this._inventory },
      luxuryDeposits: this.getDiscoveredDeposits(),
      luxuryBonuses: this.getBonuses(),
      luxuryVersion: (store.getState('luxuryVersion') || 0) + 1
    });
  }

  getState() {
    return { inventory: { ...this._inventory }, discoveredDeposits: this.getDiscoveredDeposits() };
  }

  restoreState(state) {
    const validIds = new Set(this.getLuxuries().map(luxury => luxury.id));
    this._inventory = Object.fromEntries(Object.entries(state?.inventory || {}).filter(([id, amount]) => validIds.has(id) && Number.isFinite(amount) && amount > 0));
    this._discoveredDeposits = (state?.discoveredDeposits || []).filter(deposit => deposit?.id && validIds.has(deposit.luxuryId)).map(deposit => ({ ...deposit }));
    this._notify();
  }
}
