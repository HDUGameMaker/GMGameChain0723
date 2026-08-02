/**
 * ArmySystem - 战略军团的唯一状态所有者。
 * 管理军团上限、预备队、编成、阵型、统帅以及后续地图行动状态。
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';
import { getArmyCombatPower } from '../utils/FormationUtils.js';
import { resolvePhasedArmyBattle } from './CombatResolver.js';

export class ArmySystem {
  constructor() {
    this._armies = [];
    this._availableUnits = {};
    this._nextId = 1;
    this._battleHistory = [];
    this._building = null;
    this._hero = null;
    this._culture = null;
    eventBus.on('tick', () => this._advanceMovement());
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
    this._battleHistory = [];
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

  getTactics() { return configRegistry.get('militaryTactics')?.tactics || []; }

  setTactic(armyId, tacticId) {
    const army = this._findArmy(armyId);
    if (!army) return { ok: false, reason: 'unknown_army' };
    if (tacticId && !this.getTactics().some(tactic => tactic.id === tacticId)) return { ok: false, reason: 'unknown_tactic' };
    army.tacticId = tacticId || null;
    this._notify('tactic');
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

  _getMap() { return configRegistry.get('map') || null; }

  _groundAt(x, y) { return this._getMap()?.grid?.[y]?.[x] || null; }

  _isWater(x, y) { return ['S', 'W'].includes(this._groundAt(x, y)); }

  _armyIsNaval(army) {
    return army.unitIds.length > 0 && army.unitIds.every(unitId => (this._unitConfig(unitId)?.domain || 'land') === 'naval');
  }

  _armyHasOnlyLandUnits(army) {
    return army.unitIds.length > 0 && army.unitIds.every(unitId => (this._unitConfig(unitId)?.domain || 'land') !== 'naval');
  }

  _buildingDistance(army, building, config) {
    const width = config?.footprint?.width || 1;
    const height = config?.footprint?.height || 1;
    const right = building.gridX + width - 1;
    const bottom = building.gridY + height - 1;
    const dx = Math.max(0, building.gridX - army.gridX, army.gridX - right);
    const dy = Math.max(0, building.gridY - army.gridY, army.gridY - bottom);
    return Math.max(dx, dy);
  }

  _nearbyHarbor(army) {
    return this._activeBuildings().find(building => {
      const config = configRegistry.getBuilding?.(building.buildingId);
      const isHarbor = building.buildingId === 'harbor' || (config?.tags || []).some(tag => ['naval_facility', 'naval'].includes(tag));
      return isHarbor && this._buildingDistance(army, building, config) <= 1;
    }) || null;
  }

  embarkArmy(armyId) {
    const army = this._findArmy(armyId);
    if (!army) return { ok: false, reason: 'unknown_army' };
    if (army.embarked) return { ok: false, reason: 'already_embarked' };
    if (army.garrisonBuildingIndex != null) return { ok: false, reason: 'army_garrisoned' };
    if (!this._armyHasOnlyLandUnits(army)) return { ok: false, reason: 'land_units_required' };
    const harbor = this._nearbyHarbor(army);
    if (!harbor) return { ok: false, reason: 'harbor_required' };
    const config = configRegistry.getBuilding?.(harbor.buildingId);
    const capacity = config?.uniqueFunction?.transportCapacity || config?.uniqueFunction?.navalSupply || 10;
    if (army.unitIds.length > capacity) return { ok: false, reason: 'transport_capacity_full' };
    army.embarked = true;
    army.movePath = [];
    this._notify('embark');
    return { ok: true };
  }

  disembarkArmy(armyId, targetX, targetY) {
    const army = this._findArmy(armyId);
    if (!army) return { ok: false, reason: 'unknown_army' };
    if (!army.embarked) return { ok: false, reason: 'not_embarked' };
    if (Math.abs(army.gridX - targetX) + Math.abs(army.gridY - targetY) !== 1) return { ok: false, reason: 'landing_not_adjacent' };
    if (!this._groundAt(targetX, targetY) || this._isWater(targetX, targetY)) return { ok: false, reason: 'invalid_landing' };
    army.gridX = targetX;
    army.gridY = targetY;
    army.embarked = false;
    army.movePath = [];
    this._notify('disembark');
    return { ok: true };
  }

  _canOccupyForMovement(army, x, y, start) {
    const ground = this._groundAt(x, y);
    if (!ground) return false;
    if (army.embarked) return this._isWater(x, y) || (x === start.x && y === start.y);
    if (this._armyIsNaval(army)) return this._isWater(x, y);
    return !this._isWater(x, y);
  }

  _findPath(army, targetX, targetY) {
    const map = this._getMap();
    if (!map) return [];
    const start = { x: army.gridX, y: army.gridY };
    const targetKey = `${targetX},${targetY}`;
    const queue = [start];
    let cursor = 0;
    const previous = new Map([[`${start.x},${start.y}`, null]]);
    const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    while (cursor < queue.length) {
      const current = queue[cursor++];
      if (`${current.x},${current.y}` === targetKey) break;
      for (const [dx, dy] of directions) {
        const next = { x: current.x + dx, y: current.y + dy };
        if (next.x < 0 || next.y < 0 || next.x >= map.gridWidth || next.y >= map.gridHeight) continue;
        const key = `${next.x},${next.y}`;
        if (previous.has(key) || !this._canOccupyForMovement(army, next.x, next.y, start)) continue;
        if (this._armies.some(other => other.id !== army.id && other.gridX === next.x && other.gridY === next.y && other.garrisonBuildingIndex == null)) continue;
        previous.set(key, current);
        queue.push(next);
      }
    }
    if (!previous.has(targetKey)) return [];
    const path = [];
    let current = { x: targetX, y: targetY };
    while (current && (current.x !== start.x || current.y !== start.y)) {
      path.unshift(current);
      current = previous.get(`${current.x},${current.y}`);
    }
    return path;
  }

  issueMoveOrder(armyId, targetX, targetY) {
    const army = this._findArmy(armyId);
    if (!army) return { ok: false, reason: 'unknown_army' };
    if (army.garrisonBuildingIndex != null) return { ok: false, reason: 'army_garrisoned' };
    if (!Number.isInteger(targetX) || !Number.isInteger(targetY) || !this._groundAt(targetX, targetY)) return { ok: false, reason: 'invalid_target' };
    const targetIsWater = this._isWater(targetX, targetY);
    if ((army.embarked || this._armyIsNaval(army)) !== targetIsWater) return { ok: false, reason: 'incompatible_terrain' };
    const path = this._findPath(army, targetX, targetY);
    if (!path.length && (army.gridX !== targetX || army.gridY !== targetY)) return { ok: false, reason: 'no_path' };
    army.movePath = path;
    this._notify('move_order');
    return { ok: true, path: structuredClone(path) };
  }

  _advanceMovement() {
    let changed = false;
    for (const army of this._armies) {
      if (army.garrisonBuildingIndex != null || !army.movePath?.length) continue;
      const next = army.movePath.shift();
      army.gridX = next.x;
      army.gridY = next.y;
      changed = true;
      eventBus.emit('armyMoved', { armyId: army.id, gridX: army.gridX, gridY: army.gridY, remaining: army.movePath.length });
    }
    if (changed) this._notify('movement');
  }

  garrisonArmy(armyId, buildingIndex) {
    const army = this._findArmy(armyId);
    const building = this._building?.buildings?.[buildingIndex];
    const config = building ? configRegistry.getBuilding?.(building.buildingId) : null;
    if (!army || !building || building.status !== 'active' || !config) return { ok: false, reason: 'invalid_garrison' };
    if (army.embarked || this._armyIsNaval(army)) return { ok: false, reason: 'land_army_required' };
    const capacity = config.uniqueFunction?.garrisonCapacity || (['castle', 'fort', 'citadel'].includes(building.buildingId) ? 1 : 0);
    if (capacity <= 0) return { ok: false, reason: 'not_a_fortification' };
    if (this._buildingDistance(army, building, config) > 1) return { ok: false, reason: 'garrison_too_far' };
    if (this._armies.filter(item => item.garrisonBuildingIndex === buildingIndex && item.id !== armyId).length >= capacity) return { ok: false, reason: 'garrison_full' };
    army.garrisonBuildingIndex = buildingIndex;
    army.gridX = building.gridX;
    army.gridY = building.gridY;
    army.movePath = [];
    this._notify('garrison');
    return { ok: true };
  }

  ungarrisonArmy(armyId) {
    const army = this._findArmy(armyId);
    if (!army || army.garrisonBuildingIndex == null) return { ok: false, reason: 'not_garrisoned' };
    army.garrisonBuildingIndex = null;
    this._notify('ungarrison');
    return { ok: true };
  }

  getArmyDefenseMultiplier(armyId) {
    const army = this._findArmy(armyId);
    if (!army || army.garrisonBuildingIndex == null) return 1;
    const building = this._building?.buildings?.[army.garrisonBuildingIndex];
    const config = building ? configRegistry.getBuilding?.(building.buildingId) : null;
    return config?.uniqueFunction?.garrisonDefenseMul || 1.25;
  }

  resolveEngagement(attackerId, defenderId, context = {}) {
    const attacker = this._findArmy(attackerId);
    const defender = this._findArmy(defenderId);
    if (!attacker || !defender) return { ok: false, reason: 'unknown_army' };
    if (!attacker.unitIds.length || !defender.unitIds.length) return { ok: false, reason: 'empty_army' };
    const result = resolvePhasedArmyBattle(
      attacker,
      defender,
      configRegistry.get('enemies')?.units || [],
      this.getTactics(),
      {
        ...context,
        attackerDefenseMultiplier: this.getArmyDefenseMultiplier(attackerId),
        defenderDefenseMultiplier: this.getArmyDefenseMultiplier(defenderId)
      }
    );
    this._applyCasualties(attacker, result.casualties.attacker);
    this._applyCasualties(defender, result.casualties.defender);
    attacker.supply = Math.max(0.25, attacker.supply - 0.15);
    defender.supply = Math.max(0.25, defender.supply - 0.15);
    if (result.winner === 'attacker') {
      attacker.morale = Math.min(100, attacker.morale + 4);
      defender.morale = Math.max(0, defender.morale - 20);
    } else if (result.winner === 'defender') {
      defender.morale = Math.min(100, defender.morale + 4);
      attacker.morale = Math.max(0, attacker.morale - 20);
    } else {
      attacker.morale = Math.max(0, attacker.morale - 10);
      defender.morale = Math.max(0, defender.morale - 10);
    }
    if (!attacker.unitIds.length && attacker.heroId) this._hero?.injureHero?.(attacker.heroId);
    if (!defender.unitIds.length && defender.heroId) this._hero?.injureHero?.(defender.heroId);
    const record = { id: `battle_${Date.now()}_${this._battleHistory.length}`, attackerId, defenderId, ...result };
    this._battleHistory.push(record);
    this._battleHistory = this._battleHistory.slice(-20);
    this._notify('battle');
    eventBus.emit('armyBattleResolved', structuredClone(record));
    eventBus.emit('combatBroadcast', { message: `⚔️ ${attacker.name}与${defender.name}交战：${result.winner === 'attacker' ? attacker.name + '获胜' : result.winner === 'defender' ? defender.name + '获胜' : '双方战平'}` });
    return { ok: true, ...structuredClone(record) };
  }

  _applyCasualties(army, count) {
    if (count <= 0) return;
    const unitMap = new Map((configRegistry.get('enemies')?.units || []).map(unit => [unit.id, unit]));
    army.unitIds.sort((left, right) => (unitMap.get(left)?.combatPower || 1) - (unitMap.get(right)?.combatPower || 1));
    army.unitIds.splice(0, Math.min(count, army.unitIds.length));
  }

  getBattleHistory() { return structuredClone(this._battleHistory); }

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
      availableUnits: { ...this._availableUnits },
      battleHistory: structuredClone(this._battleHistory)
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
    this._battleHistory = Array.isArray(state?.battleHistory) ? structuredClone(state.battleHistory).slice(-20) : [];
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
