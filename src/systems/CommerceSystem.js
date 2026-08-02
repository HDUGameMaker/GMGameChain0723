/**
 * CommerceSystem - 商业中心、自动资源转换与友好城邦贸易路线。
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

const FRIENDLY_STATUSES = new Set(['friendly', 'allied']);

export class CommerceSystem {
  constructor() {
    this._resource = null;
    this._building = null;
    this._diplomacy = null;
    this._routes = [];
    this._conversions = [];
    this._nextId = 1;
    this._lastProcessedDay = 0;
    eventBus.on('workTick', () => this._onWorkTick());
    eventBus.on('dayStart', ({ day } = {}) => this._onDayStart(day || 1));
  }

  setSystems({ resource, building, diplomacy } = {}) {
    this._resource = resource || null;
    this._building = building || null;
    this._diplomacy = diplomacy || null;
  }

  initNew() {
    this._routes = [];
    this._conversions = [];
    this._nextId = 1;
    this._lastProcessedDay = 0;
    this._notify();
  }

  getDefinitions() {
    const config = configRegistry.get('commerce') || {};
    return {
      tradeRoutes: Array.isArray(config.tradeRoutes) ? config.tradeRoutes : [],
      conversionOrders: Array.isArray(config.conversionOrders) ? config.conversionOrders : []
    };
  }

  _activeBuildings(buildingId) {
    return (this._building?.buildings || []).filter(building => building.status === 'active' && !building._invalid && building.buildingId === buildingId);
  }

  getRouteCapacity() {
    const markets = this._activeBuildings('market_square').length;
    let depotCapacity = 0;
    for (const depot of this._activeBuildings('trade_depot')) {
      const config = configRegistry.getBuilding?.(depot.buildingId);
      depotCapacity += config?.uniqueFunction?.routeCapacity || 1;
    }
    return markets + depotCapacity;
  }

  getConversionCapacity() {
    return this._activeBuildings('luxury_workshop').length;
  }

  getTradeRoutes() {
    return this._routes.map(route => ({ ...route, definition: this.getDefinitions().tradeRoutes.find(item => item.id === route.recipeId) || null }));
  }

  getConversionOrders() {
    return this._conversions.map(order => ({ ...order, definition: this.getDefinitions().conversionOrders.find(item => item.id === order.recipeId) || null }));
  }

  createTradeRoute(outpostId, recipeId) {
    const definition = this.getDefinitions().tradeRoutes.find(item => item.id === recipeId);
    const outpost = this._diplomacy?.getOutpost?.(outpostId);
    const state = this._diplomacy?.getOutpostState?.(outpostId);
    if (!definition || !outpost || !state) return { ok: false, reason: 'unknown_route' };
    if (!FRIENDLY_STATUSES.has(state.status)) return { ok: false, reason: 'relation_too_low' };
    if (this._routes.length >= this.getRouteCapacity()) return { ok: false, reason: 'route_capacity_full' };
    const route = {
      id: `trade_route_${this._nextId++}`,
      outpostId,
      recipeId,
      enabled: true,
      completedCycles: 0,
      stalledDays: 0
    };
    this._routes.push(route);
    this._notify();
    return { ok: true, route: { ...route } };
  }

  removeTradeRoute(id) {
    const before = this._routes.length;
    this._routes = this._routes.filter(route => route.id !== id);
    if (before === this._routes.length) return false;
    this._notify();
    return true;
  }

  createConversionOrder(recipeId) {
    const definition = this.getDefinitions().conversionOrders.find(item => item.id === recipeId);
    if (!definition) return { ok: false, reason: 'unknown_conversion' };
    if (this._conversions.length >= this.getConversionCapacity()) return { ok: false, reason: 'conversion_capacity_full' };
    const order = {
      id: `conversion_order_${this._nextId++}`,
      recipeId,
      enabled: true,
      completedCycles: 0,
      stalledDays: 0
    };
    this._conversions.push(order);
    this._notify();
    return { ok: true, order: { ...order } };
  }

  removeConversionOrder(id) {
    const before = this._conversions.length;
    this._conversions = this._conversions.filter(order => order.id !== id);
    if (before === this._conversions.length) return false;
    this._notify();
    return true;
  }

  _onWorkTick() {
    const gold = Math.max(0, Number(this._building?.getWorkforceOutputs?.().gold) || 0);
    if (gold > 0) this._resource?.addClamped?.('gold', gold);
  }

  _onDayStart(day) {
    if (!Number.isFinite(day) || day <= this._lastProcessedDay) return;
    this._lastProcessedDay = day;
    let changed = false;
    for (const route of this._routes) {
      const state = this._diplomacy?.getOutpostState?.(route.outpostId);
      const definition = this.getDefinitions().tradeRoutes.find(item => item.id === route.recipeId);
      if (!route.enabled || !definition || !FRIENDLY_STATUSES.has(state?.status)) {
        route.stalledDays += 1;
        changed = true;
        continue;
      }
      changed = this._runRecipe(route, definition, this._getTradeValueMultiplier()) || changed;
    }
    for (const order of this._conversions) {
      const definition = this.getDefinitions().conversionOrders.find(item => item.id === order.recipeId);
      if (!order.enabled || !definition) continue;
      changed = this._runRecipe(order, definition, 1) || changed;
    }
    if (changed) this._notify();
  }

  _getTradeValueMultiplier() {
    let multiplier = 1;
    for (const depot of this._activeBuildings('trade_depot')) {
      const config = configRegistry.getBuilding?.(depot.buildingId);
      multiplier *= config?.uniqueFunction?.tradeValueMul || 1.12;
    }
    return multiplier;
  }

  _runRecipe(record, definition, outputMultiplier) {
    if (!this._resource?.canAfford?.(definition.input || [])) {
      record.stalledDays += 1;
      return true;
    }
    this._resource.consumeAll(definition.input || []);
    for (const output of definition.output || []) {
      this._resource.addClamped(output.resourceId, Math.round(output.amount * outputMultiplier));
    }
    record.completedCycles += 1;
    record.stalledDays = 0;
    return true;
  }

  getState() {
    return {
      nextId: this._nextId,
      lastProcessedDay: this._lastProcessedDay,
      routes: this._routes.map(route => ({ ...route })),
      conversions: this._conversions.map(order => ({ ...order }))
    };
  }

  restoreState(state) {
    const routeIds = new Set(this.getDefinitions().tradeRoutes.map(item => item.id));
    const conversionIds = new Set(this.getDefinitions().conversionOrders.map(item => item.id));
    this._routes = (state?.routes || []).filter(route => routeIds.has(route.recipeId)).map(route => ({ ...route }));
    this._conversions = (state?.conversions || []).filter(order => conversionIds.has(order.recipeId)).map(order => ({ ...order }));
    this._nextId = Math.max(1, Math.floor(state?.nextId || 1));
    this._lastProcessedDay = Math.max(0, Math.floor(state?.lastProcessedDay || 0));
    this._notify();
  }

  _notify() {
    const state = this.getState();
    store.setState({ tradeRoutes: state, commerceVersion: Date.now() });
    eventBus.emit('commerceChanged', state);
  }
}
