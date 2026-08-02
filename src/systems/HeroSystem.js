import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class HeroSystem {
  constructor() {
    this._availableIds = [];
    this._recruited = {};
    this._lastRefreshDay = 0;
    this._buildingSystem = null;
    this._resourceSystem = null;
    this._cultureSystem = null;
    eventBus.on('dayStart', ({ day }) => this._onDayStart(day));
  }

  setSystems(systems = {}) {
    if (systems.building) this._buildingSystem = systems.building;
    if (systems.resource) this._resourceSystem = systems.resource;
    if (systems.culture) this._cultureSystem = systems.culture;
  }

  get _config() {
    const integration = configRegistry.get('eaIntegration') || {};
    return { ...(integration.heroSettings || {}), heroes: integration.heroes || [] };
  }

  getHero(id) { return this._config.heroes.find(hero => hero.id === id) || null; }

  initNew() {
    this._availableIds = [];
    this._recruited = {};
    this._refreshOffers(store.getState('timeDay') || 1);
    this._notify();
  }

  _refreshOffers(day) {
    const pool = this._config.heroes.filter(hero => !this._recruited[hero.id]);
    const count = Math.min(this._config.offerCount || 4, pool.length);
    const offset = pool.length ? ((day * 3) % pool.length) : 0;
    this._availableIds = Array.from({ length: count }, (_, index) => pool[(offset + index) % pool.length].id);
    this._lastRefreshDay = day;
  }

  _onDayStart(day) {
    if (day - this._lastRefreshDay < (this._config.refreshDays || 3)) return;
    this._refreshOffers(day);
    this._notify();
    eventBus.emit('combatBroadcast', { message: '🍺 酒馆来了一批新的访客。' });
  }

  hasActiveTavern() {
    return (this._buildingSystem?.buildings || []).some(building => building.buildingId === 'tavern' && building.status === 'active');
  }

  getAvailableHeroes() { return this._availableIds.map(id => this.getHero(id)).filter(Boolean); }
  getRecruitedHeroes() { return Object.values(this._recruited).map(entry => ({ ...this.getHero(entry.heroId), ...entry })); }

  recruitHero(id) {
    const hero = this.getHero(id);
    if (!hero || !this._availableIds.includes(id)) return { ok: false, reason: '英雄当前不在酒馆' };
    if (!this.hasActiveTavern()) return { ok: false, reason: '需要先建造并启用酒馆' };
    if ((store.getState('inspiration') || 0) < (hero.inspirationCost || 0)) return { ok: false, reason: '灵感不足' };
    if (hero.cost?.length && (!this._resourceSystem || !this._resourceSystem.canAfford(hero.cost))) return { ok: false, reason: '招募资源不足' };
    if (hero.cost?.length) this._resourceSystem.consumeAll(hero.cost);
    store.setState({ inspiration: Math.max(0, (store.getState('inspiration') || 0) - (hero.inspirationCost || 0)) });
    this._recruited[id] = { heroId: id, recruitedDay: store.getState('timeDay') || 1, assignment: null };
    this._availableIds = this._availableIds.filter(heroId => heroId !== id);
    this._notify();
    eventBus.emit('heroRecruited', { heroId: id, name: hero.name });
    eventBus.emit('combatBroadcast', { message: `${hero.icon} ${hero.name} 已加入聚落！` });
    return { ok: true };
  }

  getAssignmentLimit() { return (this._config.baseAssignmentSlots || 2) + (this._cultureSystem?.getHeroSlotsBonus?.() || 0); }

  assignHero(id, assignment) {
    const entry = this._recruited[id];
    if (!entry) return { ok: false, reason: '英雄尚未招募' };
    const activeCount = Object.values(this._recruited).filter(hero => hero.assignment && hero.heroId !== id).length;
    if (assignment && activeCount >= this.getAssignmentLimit()) return { ok: false, reason: '英雄任命席位已满' };
    entry.assignment = assignment || null;
    this._notify();
    return { ok: true };
  }

  getBonuses() {
    const result = {};
    for (const entry of Object.values(this._recruited)) {
      if (!entry.assignment) continue;
      const bonuses = this.getHero(entry.heroId)?.bonuses || {};
      for (const [key, value] of Object.entries(bonuses)) {
        if (key.endsWith('Mul')) result[key] = (result[key] || 1) * value;
        else result[key] = (result[key] || 0) + value;
      }
    }
    return result;
  }

  _notify() {
    store.setState({
      heroAvailable: [...this._availableIds],
      heroes: structuredClone(this._recruited),
      heroVersion: (store.getState('heroVersion') || 0) + 1
    });
  }

  getState() {
    return { availableIds: [...this._availableIds], recruited: structuredClone(this._recruited), lastRefreshDay: this._lastRefreshDay };
  }

  restoreState(state) {
    this._availableIds = (state?.availableIds || []).filter(id => this.getHero(id));
    this._recruited = structuredClone(state?.recruited || {});
    this._lastRefreshDay = state?.lastRefreshDay || 0;
    if (this._availableIds.length === 0) this._refreshOffers(store.getState('timeDay') || 1);
    this._notify();
  }
}
