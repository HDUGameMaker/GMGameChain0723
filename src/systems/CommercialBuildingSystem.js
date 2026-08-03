import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class CommercialBuildingSystem {
  constructor() {
    this._building = null;
    this._resource = null;
    eventBus.on('workTick', () => this._onWorkTick());
    eventBus.on('workerChanged', () => this._notify());
    eventBus.on('buildingPlaced', () => this._notify());
    eventBus.on('buildingUpgraded', () => this._notify());
  }

  setSystems({ building, resource } = {}) {
    this._building = building || null;
    this._resource = resource || null;
    this._notify();
  }

  getDefinitions() {
    const config = configRegistry.get('commercialBuildings') || {};
    return Array.isArray(config.buildings) ? config.buildings : [];
  }

  _getDefinition(buildingId) {
    return this.getDefinitions().find(definition => definition.buildingId === buildingId) || null;
  }

  getBuildingState(buildingIndex) {
    const building = this._building?.buildings?.[buildingIndex];
    const definition = building ? this._getDefinition(building.buildingId) : null;
    if (!building || !definition) return null;
    const workers = Math.max(0, Math.floor(Number(building.currentWorkers) || 0));
    const active = building.status === 'active' && !building._invalid && workers >= 1;
    return {
      buildingIndex,
      active,
      workers,
      goldPerTick: active ? Number((workers * definition.goldPerWorker).toFixed(4)) : 0,
      buff: definition.buff ? structuredClone(definition.buff) : null
    };
  }

  getBuildingStates() {
    return (this._building?.buildings || [])
      .map((_, buildingIndex) => this.getBuildingState(buildingIndex))
      .filter(Boolean);
  }

  getActiveBuffs() {
    const buffs = new Map();
    for (const state of this.getBuildingStates()) {
      if (state.active && state.buff?.id && !buffs.has(state.buff.id)) buffs.set(state.buff.id, state.buff);
    }
    return [...buffs.values()].map(buff => structuredClone(buff));
  }

  getEffects() {
    const effects = {};
    for (const buff of this.getActiveBuffs()) {
      for (const [key, value] of Object.entries(buff.effect || {})) {
        if (!Number.isFinite(value)) continue;
        if (key.endsWith('Mul')) effects[key] = (effects[key] ?? 1) + (value - 1);
        else effects[key] = (effects[key] || 0) + value;
      }
    }
    return effects;
  }

  _onWorkTick() {
    if (!this._resource) return;
    const baseGold = this.getBuildingStates().reduce((sum, state) => sum + state.goldPerTick, 0);
    const effects = this.getEffects();
    const gold = Number((baseGold * (effects.commercialGoldMul || 1) + (effects.commercialGoldFlat || 0)).toFixed(4));
    if (gold > 0) this._resource.addClamped('gold', gold);
    this._notify();
  }

  _notify() {
    store.setState({
      commercialBuildingStates: this.getBuildingStates(),
      commercialBuffs: this.getActiveBuffs(),
      commercialVersion: Date.now()
    });
    eventBus.emit('commercialBuildingsChanged', { states: this.getBuildingStates() });
  }
}
