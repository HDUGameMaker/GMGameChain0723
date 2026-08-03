import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

/** 普通野外敌人与资源守军。它们没有外交、科技树或城市发展。 */
export class WildSiteSystem {
  constructor() {
    this._states = {};
    this._resource = null;
    this._era = null;
    this._army = null;
    eventBus.on('dayStart', ({ day } = {}) => this._onDayStart(day || 1));
  }

  setSystems({ resource, era, army } = {}) {
    this._resource = resource || null;
    this._era = era || null;
    this._army = army || null;
  }

  getSites() {
    const positions = new Map((configRegistry.get('map')?.spawnManifest?.wildSites || []).map(item => [item.id, item]));
    return (configRegistry.get('worldFactions')?.wildSites || []).map(site => ({ ...site, ...(positions.get(site.id) || {}) }));
  }
  getSite(id) { return this.getSites().find(site => site.id === id) || null; }

  initNew() {
    this._states = Object.fromEntries(this.getSites().map(site => [site.id, { active: true, defeatedDay: null, defeatedByArmyId: null, victories: 0 }]));
    this._notify();
  }

  getSiteState(id) {
    const site = this.getSite(id);
    if (!site) return null;
    return structuredClone(this._states[id] || { active: true, defeatedDay: null, defeatedByArmyId: null, victories: 0 });
  }

  getVisibleSites() { return this.getSites().filter(site => this.getSiteState(site.id)?.active); }

  getSiteStrength(id) {
    const site = this.getSite(id);
    const eraOrder = this._era?.getCurrentEra?.()?.order || 0;
    return site ? Math.round(site.baseStrength * (1 + eraOrder * 0.18)) : 0;
  }

  attackSite(id, armyPower, armyId = null) {
    const site = this.getSite(id);
    const state = this.getSiteState(id);
    if (!site || !state) return { ok: false, reason: 'unknown_site' };
    if (!state.active) return { ok: false, reason: 'site_inactive' };
    const strength = this.getSiteStrength(id);
    const victory = Math.max(0, Number(armyPower) || 0) > strength;
    if (victory) {
      for (const reward of site.rewards || []) this._resource?.addClamped?.(reward.resourceId, reward.amount);
      this._states[id] = {
        ...state,
        active: false,
        defeatedDay: store.getState('timeDay') || 1,
        defeatedByArmyId: armyId,
        victories: (state.victories || 0) + 1
      };
    }
    this._notify();
    eventBus.emit('wildSiteBattleResolved', { siteId: id, armyId, victory, strength, power: armyPower });
    eventBus.emit('combatBroadcast', { message: victory ? `⚔️ 已清剿${site.name}并取得战利品。` : `⚔️ 进攻${site.name}失败（${armyPower}/${strength}）。` });
    return { ok: true, victory, strength, rewards: victory ? structuredClone(site.rewards || []) : [] };
  }

  attackWithArmy(siteId, armyId) {
    const army = this._army?.getArmy?.(armyId);
    if (!army || !army.unitIds?.length) return { ok: false, reason: 'army_unavailable' };
    const result = this.attackSite(siteId, this._army.getArmyPower(armyId), armyId);
    if (result.ok) {
      const attrition = this._army.applyAttrition(armyId, result.victory
        ? { casualtyRate: 0.1, moraleDelta: -4, supplyDelta: -0.1 }
        : { casualtyRate: 0.35, moraleDelta: -18, supplyDelta: -0.2 });
      result.casualties = attrition.casualties || 0;
    }
    return result;
  }

  _onDayStart(day) {
    let changed = false;
    for (const site of this.getSites()) {
      const state = this._states[site.id];
      if (!state || state.active || state.defeatedDay == null) continue;
      if (day - state.defeatedDay >= (site.respawnDays || 5)) {
        state.active = true;
        state.defeatedDay = null;
        state.defeatedByArmyId = null;
        changed = true;
      }
    }
    if (changed) this._notify();
  }

  getState() { return { states: structuredClone(this._states) }; }

  restoreState(saved) {
    this._states = {};
    for (const site of this.getSites()) {
      this._states[site.id] = { active: true, defeatedDay: null, defeatedByArmyId: null, victories: 0, ...(saved?.states?.[site.id] || {}) };
    }
    this._notify();
  }

  _notify() {
    store.setState({ wildSites: structuredClone(this._states), wildSiteVersion: (store.getState('wildSiteVersion') || 0) + 1 });
    eventBus.emit('wildSitesChanged', { sites: this.getVisibleSites() });
  }
}
