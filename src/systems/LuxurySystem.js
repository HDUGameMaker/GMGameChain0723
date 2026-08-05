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
    this._heroSystem = null;
    this._lastGiftDay = 0;
    this._systemUnlocked = false;
  }

  setSystems(systems = {}) {
    if (systems.resource) this._resourceSystem = systems.resource;
    if (systems.building) this._buildingSystem = systems.building;
    if (systems.diplomacy) this._diplomacySystem = systems.diplomacy;
    if (systems.hero) this._heroSystem = systems.hero;
  }

  getLuxuries() {
    return (configRegistry.getHistoricalContent().luxuries || []).map(luxury => ({
      ...luxury,
      effects: {
        ...(luxury.effects || {}),
        armyAttackMul: Number((((luxury.effects?.armyAttackMul) || 1) + 0.03).toFixed(4)),
        armyHpMul: Number((((luxury.effects?.armyHpMul) || 1) + 0.03).toFixed(4))
      }
    }));
  }
  getLuxury(id) { return this.getLuxuries().find(luxury => luxury.id === id) || null; }

  initNew() {
    this._inventory = {};
    this._discoveredDeposits = [];
    this._lastGiftDay = 0;
    this._systemUnlocked = false;
    this._notify();
  }

  addLuxury(id, amount = 1) {
    if (!this.getLuxury(id) || !Number.isFinite(amount) || amount <= 0) return false;
    this._inventory[id] = (this._inventory[id] || 0) + Math.floor(amount);
    const firstUnlock = !this._systemUnlocked;
    this._systemUnlocked = true;
    this._notify();
    eventBus.emit('luxuryChanged', { luxuryId: id, amount: this._inventory[id] });
    if (firstUnlock) eventBus.emit('luxurySystemUnlocked');
    return true;
  }

  getInventory() { return { ...this._inventory }; }
  isSystemUnlocked() { return this._systemUnlocked; }

  canGiftToHero(luxuryId, heroId, day = store.getState('timeDay') || 1) {
    const luxury = this.getLuxury(luxuryId);
    if (!luxury || luxury.giftable === false) return { ok: false, reason: '该奢侈品不能赠送' };
    if ((this._inventory[luxuryId] || 0) < 2) return { ok: false, reason: '需要保留首份，仅重复获得的奢侈品可赠送' };
    if (this._lastGiftDay === day) return { ok: false, reason: '今日已经赠送过礼物' };
    const hero = this._heroSystem?.getRecruitedHeroes?.().find(entry => (entry.heroId || entry.id) === heroId);
    if (!hero) return { ok: false, reason: '英雄尚未加入' };
    return { ok: true };
  }

  giftToHero(luxuryId, heroId, day = store.getState('timeDay') || 1) {
    const check = this.canGiftToHero(luxuryId, heroId, day);
    if (!check.ok) return check;
    this._inventory[luxuryId] -= 1;
    const affinity = this._heroSystem.adjustAffinity(heroId, 50);
    if (!affinity?.ok) { this._inventory[luxuryId] += 1; return affinity || { ok: false }; }
    this._lastGiftDay = day;
    this._notify();
    eventBus.emit('luxuryGifted', { luxuryId, heroId, day, affinity: 50 });
    return { ok: true, affinity: 50, remaining: this._inventory[luxuryId] };
  }

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
    for (const key of Object.keys(result)) result[key] = Number(result[key].toFixed(4));
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
    return { ok: false, reason: '奢侈品已不可贸易，重复份只能赠送给英雄' };
  }

  tradeWithOutpost(luxuryId, outpostId, amount = 1) {
    return this.canTrade(luxuryId, amount, outpostId);
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
    return { inventory: { ...this._inventory }, discoveredDeposits: this.getDiscoveredDeposits(), lastGiftDay: this._lastGiftDay, systemUnlocked: this._systemUnlocked };
  }

  restoreState(state) {
    const validIds = new Set(this.getLuxuries().map(luxury => luxury.id));
    this._inventory = Object.fromEntries(Object.entries(state?.inventory || {}).filter(([id, amount]) => validIds.has(id) && Number.isFinite(amount) && amount > 0));
    this._discoveredDeposits = (state?.discoveredDeposits || []).filter(deposit => deposit?.id && validIds.has(deposit.luxuryId)).map(deposit => ({ ...deposit }));
    this._lastGiftDay = Math.max(0, Math.floor(Number(state?.lastGiftDay) || 0));
    this._systemUnlocked = Boolean(state?.systemUnlocked) || Object.keys(this._inventory).length > 0;
    this._notify();
  }
}
