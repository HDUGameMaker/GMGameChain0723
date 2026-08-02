/**
 * EconomyOrderSystem - 农业与地图采集作业
 * 所有作业使用人口系统的共享工人池，按 tick 产出四种基础资源与少量奢侈品。
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class EconomyOrderSystem {
  constructor() {
    this._orders = [];
    this._nextId = 1;
    this._population = null;
    this._resource = null;
    this._luxury = null;
    eventBus.on('tick', () => this._onTick());
  }

  setSystems({ population, resource, luxury } = {}) {
    this._population = population || null;
    this._resource = resource || null;
    this._luxury = luxury || null;
    this._population?.registerWorkerProvider?.('economicOrders', this);
  }

  initNew() {
    this._orders = [];
    this._nextId = 1;
    this._notify();
  }

  getDefinitions() {
    const config = configRegistry.get('economicOrders') || {};
    return {
      crops: Array.isArray(config.crops) ? config.crops : [],
      gathering: Array.isArray(config.gathering) ? config.gathering : []
    };
  }

  _getDefinition(type, targetId) {
    const key = type === 'crop' ? 'crops' : type === 'gathering' ? 'gathering' : null;
    if (!key) return null;
    return this.getDefinitions()[key].find(item => item.id === targetId) || null;
  }

  createOrder({ type, targetId, workers = 0 } = {}) {
    const definition = this._getDefinition(type, targetId);
    if (!definition) return { ok: false, reason: 'unknown_order' };
    const order = {
      id: `economic_order_${this._nextId++}`,
      type,
      targetId,
      workers: 0,
      luxuryProgress: 0
    };
    this._orders.push(order);
    const assignment = this.assignWorkers(order.id, workers);
    if (!assignment.ok) {
      this._orders = this._orders.filter(item => item.id !== order.id);
      return assignment;
    }
    this._notify();
    return { ok: true, order: { ...order } };
  }

  removeOrder(orderId) {
    const before = this._orders.length;
    this._orders = this._orders.filter(order => order.id !== orderId);
    if (this._orders.length === before) return false;
    this._notify();
    return true;
  }

  assignWorkers(orderId, requestedWorkers) {
    const order = this._orders.find(item => item.id === orderId);
    if (!order) return { ok: false, reason: 'unknown_order' };
    const count = Number(requestedWorkers);
    const definition = this._getDefinition(order.type, order.targetId);
    if (!Number.isInteger(count) || count < 0 || count > (definition?.maxWorkers || 0)) {
      return { ok: false, reason: 'invalid_worker_count' };
    }
    const additional = count - order.workers;
    if (additional > 0 && additional > (this._population?.getAvailableWorkers?.() || 0)) {
      return { ok: false, reason: 'insufficient_workers' };
    }
    order.workers = count;
    this._notify();
    return { ok: true, order: { ...order } };
  }

  getAssignedWorkers() {
    return this._orders.reduce((sum, order) => sum + Math.max(0, order.workers || 0), 0);
  }

  getJobs() {
    return this._orders.reduce((jobs, order) => {
      const job = order.type === 'crop' ? 'agriculture' : 'gathering';
      jobs[job] = (jobs[job] || 0) + Math.max(0, order.workers || 0);
      return jobs;
    }, {});
  }

  getOrders() {
    return this._orders.map(order => ({ ...order, definition: this._getDefinition(order.type, order.targetId) }));
  }

  getTickOutputs() {
    const totals = {};
    for (const order of this._orders) {
      const definition = this._getDefinition(order.type, order.targetId);
      for (const output of definition?.outputs || []) {
        totals[output.resourceId] = (totals[output.resourceId] || 0) + output.amount * order.workers;
      }
    }
    return totals;
  }

  _onTick() {
    if (!this._resource) return;
    for (const [resourceId, amount] of Object.entries(this.getTickOutputs())) {
      this._resource.addClamped(resourceId, amount);
    }
    let luxuryChanged = false;
    for (const order of this._orders) {
      const definition = this._getDefinition(order.type, order.targetId);
      const luxury = definition?.luxury;
      if (!luxury || order.workers <= 0) continue;
      order.luxuryProgress += order.workers;
      while (order.luxuryProgress >= luxury.intervalWorkerTicks) {
        order.luxuryProgress -= luxury.intervalWorkerTicks;
        this._luxury?.addLuxury?.(luxury.id, 1);
        luxuryChanged = true;
      }
    }
    if (luxuryChanged || this.getAssignedWorkers() > 0) this._notify(false);
  }

  getState() {
    return {
      nextId: this._nextId,
      orders: this._orders.map(order => ({ ...order }))
    };
  }

  restoreState(state) {
    const source = Array.isArray(state?.orders) ? state.orders : [];
    this._orders = source
      .filter(order => this._getDefinition(order.type, order.targetId))
      .map(order => {
        const definition = this._getDefinition(order.type, order.targetId);
        return {
          id: String(order.id),
          type: order.type,
          targetId: order.targetId,
          workers: Math.max(0, Math.min(definition.maxWorkers, Math.floor(order.workers || 0))),
          luxuryProgress: Math.max(0, Number(order.luxuryProgress) || 0)
        };
      });
    this._nextId = Math.max(1, Math.floor(state?.nextId || 1));
    this._notify();
  }

  _notify(refreshPopulation = true) {
    store.setState({
      economicOrders: this.getOrders(),
      economicOrderVersion: Date.now()
    });
    if (refreshPopulation) this._population?.refresh?.();
    eventBus.emit('economicOrdersChanged', { orders: this.getOrders() });
  }
}
