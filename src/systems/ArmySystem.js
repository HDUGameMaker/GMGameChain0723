/**
 * ArmySystem - 战略军团的唯一状态所有者。
 * 管理军团上限、预备队、编成、阵型、统帅以及后续地图行动状态。
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';
import { getArmyCombatPower } from '../utils/FormationUtils.js';

export class ArmySystem {
  constructor() {
    this._armies = [];
    this._availableUnits = {};
    this._nextId = 1;
    this._building = null;
    this._hero = null;
    this._culture = null;
  }

  setSystems({ building, hero, culture } = {}) {
    this._building = building || null;
    this._hero = hero || null;
    this._culture = culture || null;
  }

  initNew() {
    this._armies = [];
    this._availableUnits = {};
    this._nextId = 1;
    this._notify('init');
  }

  _activeBuildings() {
    return (this._building?.buildings || []).filter(building => building.status === 'active' && !building._invalid);
  }

  getArmyCapacity() {
    let capacity = 2;
    for (const building of this._activeBuildings()) {
      const config = configRegistry.getBuilding?.(building.buildingId);
      capacity += Math.max(0, config?.uniqueFunction?.armyCapacityBonus || 0);
    }
    return capacity;
  }

  getCommandPointLimit() {
    let limit = 20 + Math.max(0, this._culture?.getCommandPointsBonus?.() || 0);
    for (const building of this._activeBuildings()) {
      const config = configRegistry.getBuilding?.(building.buildingId);
      limit += Math.max(0, config?.uniqueFunction?.commandPointsBonus || 0);
    }
    return limit;
  }

  _defaultPosition() {
    const building = this._activeBuildings().find(item => Number.isFinite(item.gridX) && Number.isFinite(item.gridY));
    return { x: building?.gridX || 0, y: building?.gridY || 0 };
  }

  createArmy(name, position = null) {
    if (this._armies.length >= this.getArmyCapacity()) return { ok: false, reason: 'army_capacity_full' };
    const start = position && Number.isFinite(position.x) && Number.isFinite(position.y) ? position : this._defaultPosition();
    const army = {
      id: `army_${this._nextId++}`,
      name: String(name || `第${this._armies.length + 1}军团`),
      unitIds: [],
      formationId: null,
      tacticId: null,
      heroId: null,
      gridX: Math.floor(start.x),
      gridY: Math.floor(start.y),
      morale: 100,
      supply: 1,
      embarked: false,
      garrisonBuildingIndex: null,
      movePath: []
    };
    this._armies.push(army);
    this._notify('create');
    return { ok: true, army: this._decorateArmy(army) };
  }

  renameArmy(armyId, name) {
    const army = this._findArmy(armyId);
    if (!army) return false;
    army.name = String(name || '未命名军团');
    this._notify('rename');
    return true;
  }

  disbandArmy(armyId) {
    const army = this._findArmy(armyId);
    if (!army) return false;
    for (const unitId of army.unitIds) this._availableUnits[unitId] = (this._availableUnits[unitId] || 0) + 1;
    if (army.heroId) this._hero?.assignHero?.(army.heroId, null);
    this._armies = this._armies.filter(item => item.id !== armyId);
    this._notify('disband');
    return true;
  }

  setAvailableUnits(units = {}) {
    this._availableUnits = Object.fromEntries(Object.entries(units || {}).map(([id, count]) => [id, Math.max(0, Math.floor(Number(count) || 0))]));
    this._notify('reserve');
  }

  addReserveUnit(unitId, count = 1) {
    if (!this._unitConfig(unitId) || !Number.isInteger(count) || count <= 0) return false;
    this._availableUnits[unitId] = (this._availableUnits[unitId] || 0) + count;
    this._notify('reserve');
    return true;
  }

  getAvailableUnits() { return { ...this._availableUnits }; }

  _unitConfig(unitId) {
    return (configRegistry.get('enemies')?.units || []).find(unit => unit.id === unitId) || null;
  }

  _unitCommandPoints(unitId) { return this._unitConfig(unitId)?.commandPoints || 1; }

  _usedCommandPoints(army) {
    return (army?.unitIds || []).reduce((sum, unitId) => sum + this._unitCommandPoints(unitId), 0);
  }

  addUnit(armyId, unitId, count = 1) {
    const army = this._findArmy(armyId);
    const config = this._unitConfig(unitId);
    if (!army || !config) return { ok: false, reason: 'unknown_unit_or_army' };
    if (!Number.isInteger(count) || count <= 0) return { ok: false, reason: 'invalid_count' };
    if ((this._availableUnits[unitId] || 0) < count) return { ok: false, reason: 'insufficient_reserve' };
    if (this._usedCommandPoints(army) + this._unitCommandPoints(unitId) * count > this.getCommandPointLimit()) {
      return { ok: false, reason: 'command_points_full' };
    }
    for (let index = 0; index < count; index += 1) army.unitIds.push(unitId);
    this._availableUnits[unitId] -= count;
    this._notify('composition');
    return { ok: true, army: this._decorateArmy(army) };
  }

  removeUnit(armyId, unitId, count = 1) {
    const army = this._findArmy(armyId);
    if (!army || !Number.isInteger(count) || count <= 0) return { ok: false, reason: 'invalid_request' };
    const available = army.unitIds.filter(id => id === unitId).length;
    if (available < count) return { ok: false, reason: 'unit_not_in_army' };
    for (let index = 0; index < count; index += 1) {
      army.unitIds.splice(army.unitIds.lastIndexOf(unitId), 1);
    }
    this._availableUnits[unitId] = (this._availableUnits[unitId] || 0) + count;
    this._notify('composition');
    return { ok: true, army: this._decorateArmy(army) };
  }

  dismissUnit(armyId, unitId, count = 1) {
    const army = this._findArmy(armyId);
    if (!army || !Number.isInteger(count) || count <= 0) return { ok: false, reason: 'invalid_request' };
    if (army.unitIds.filter(id => id === unitId).length < count) return { ok: false, reason: 'unit_not_in_army' };
    for (let index = 0; index < count; index += 1) army.unitIds.splice(army.unitIds.lastIndexOf(unitId), 1);
    this._notify('dismiss');
    return { ok: true, army: this._decorateArmy(army) };
  }

  clearArmy(armyId, returnToReserve = true) {
    const army = this._findArmy(armyId);
    if (!army) return false;
    if (returnToReserve) {
      for (const unitId of army.unitIds) this._availableUnits[unitId] = (this._availableUnits[unitId] || 0) + 1;
    }
    army.unitIds = [];
    this._notify(returnToReserve ? 'clear' : 'dismiss');
    return true;
  }

  setFormation(armyId, formationId) {
    const army = this._findArmy(armyId);
    if (!army) return { ok: false, reason: 'unknown_army' };
    if (formationId && !(configRegistry.get('enemies')?.formations || []).some(formation => formation.id === formationId)) {
      return { ok: false, reason: 'unknown_formation' };
    }
    army.formationId = formationId || null;
    this._notify('formation');
    return { ok: true };
  }

  assignHero(armyId, heroId) {
    const army = this._findArmy(armyId);
    if (!army) return { ok: false, reason: 'unknown_army' };
    const hero = (this._hero?.getRecruitedHeroes?.() || []).find(entry => (entry.heroId || entry.id) === heroId);
    if (!hero || hero.status === 'injured') return { ok: false, reason: 'hero_unavailable' };
    if (hero.role !== 'commander' && hero.heroClass !== 'military') return { ok: false, reason: 'hero_not_military' };
    if (this._armies.some(item => item.id !== armyId && item.heroId === heroId)) return { ok: false, reason: 'hero_already_assigned' };
    const result = this._hero?.assignHero?.(heroId, { type: 'army', armyId }) || { ok: true };
    if (!result.ok) return result;
    if (army.heroId && army.heroId !== heroId) this._hero?.assignHero?.(army.heroId, null);
    army.heroId = heroId;
    this._notify('hero');
    return { ok: true };
  }

  unassignHero(armyId) {
    const army = this._findArmy(armyId);
    if (!army) return false;
    if (army.heroId) this._hero?.assignHero?.(army.heroId, null);
    army.heroId = null;
    this._notify('hero');
    return true;
  }

  getArmyPower(armyId) {
    const army = this._findArmy(armyId);
    if (!army) return 0;
    let power = getArmyCombatPower(army);
    if (army.heroId) {
      const hero = (this._hero?.getRecruitedHeroes?.() || []).find(entry => (entry.heroId || entry.id) === army.heroId);
      power *= hero?.bonuses?.commanderPowerMul || hero?.bonuses?.combatPowerMul || 1;
    }
    return Math.round(power * 100) / 100;
  }

  _findArmy(armyId) { return this._armies.find(army => army.id === armyId) || null; }

  _decorateArmy(army) {
    return {
      ...structuredClone(army),
      usedCommandPoints: this._usedCommandPoints(army),
      commandPointLimit: this.getCommandPointLimit(),
      power: this.getArmyPower(army.id)
    };
  }

  getArmy(armyId) {
    const army = this._findArmy(armyId);
    return army ? this._decorateArmy(army) : null;
  }

  getArmies() { return this._armies.map(army => this._decorateArmy(army)); }

  getState() {
    return {
      nextId: this._nextId,
      armies: structuredClone(this._armies),
      availableUnits: { ...this._availableUnits }
    };
  }

  restoreState(state) {
    const validUnits = new Set((configRegistry.get('enemies')?.units || []).map(unit => unit.id));
    this._armies = (state?.armies || []).map((army, index) => ({
      id: String(army.id || `army_${index + 1}`),
      name: String(army.name || `第${index + 1}军团`),
      unitIds: (army.unitIds || []).filter(id => validUnits.has(id)),
      formationId: army.formationId || null,
      tacticId: army.tacticId || null,
      heroId: army.heroId || null,
      gridX: Math.floor(Number(army.gridX) || 0),
      gridY: Math.floor(Number(army.gridY) || 0),
      morale: Math.max(0, Math.min(100, Number(army.morale) || 100)),
      supply: Math.max(0, Math.min(1.25, Number(army.supply) || 1)),
      embarked: army.embarked === true,
      garrisonBuildingIndex: Number.isInteger(army.garrisonBuildingIndex) ? army.garrisonBuildingIndex : null,
      movePath: Array.isArray(army.movePath) ? structuredClone(army.movePath) : []
    }));
    this._availableUnits = Object.fromEntries(Object.entries(state?.availableUnits || {}).filter(([id]) => validUnits.has(id)).map(([id, count]) => [id, Math.max(0, Math.floor(Number(count) || 0))]));
    this._nextId = Math.max(1, Math.floor(state?.nextId || this._armies.length + 1));
    this._notify('restore');
  }

  _notify(reason) {
    store.setState({
      armies: structuredClone(this._armies),
      availableUnits: { ...this._availableUnits },
      armyCapacity: this.getArmyCapacity(),
      armyVersion: (store.getState('armyVersion') || 0) + 1
    });
    eventBus.emit('armyChanged', { reason, armies: this.getArmies() });
  }
}
