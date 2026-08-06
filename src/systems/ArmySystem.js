/**
 * ArmySystem - 战略军团的唯一状态所有者。
 * 管理军团上限、预备队、编成、阵型、统帅以及后续地图行动状态。
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';
import { findDeploymentTile, getDeploymentCandidates } from '../domain/MilitaryDeployment.js';
import { getArmyCombatPower } from '../utils/FormationUtils.js';
import { calculateCombatStrength } from '../domain/CombatStrength.js';
import { previewStrategicBattle, resolveStrategicBattle } from './CombatResolver.js';
import { evaluateTrainingEligibility } from './TrainingRules.js';

export class ArmySystem {
  constructor() {
    this._armies = [];
    this._availableUnits = {};
    this._nextId = 1;
    this._battleHistory = [];
    this._nextBattleId = 1;
    this._resolvedBattleIds = new Set();
    this._building = null;
    this._hero = null;
    this._culture = null;
    this._era = null;
    this._resource = null;
    this._population = null;
    this._tech = null;
    this._movementSpeedMultiplier = 1;
    this._cityStateSystem = null;
    eventBus.on('tick', () => { this.restoreArmyCp(); this._tickHeroSkillCooldowns(); this._healArmiesPerTick(); this._applyBlackMistDamage(); this._advanceMovement(); });
    eventBus.on('dayStart', () => this._resupplyGarrisons());
  }

  setSystems({ building, hero, culture, era, resource, population, tech, enemyExpansion, ruins, luxury, combat } = {}) {
    this._building = building || null;
    this._hero = hero || null;
    this._culture = culture || null;
    this._era = era || null;
    this._resource = resource || null;
    this._population = population || null;
    this._tech = tech || null;
    this._enemyExpansion = enemyExpansion || null;
    this._ruinSystem = ruins || null;
    this._luxury = luxury || null;
    this._combat = combat || null;
  }

  initNew() {
    this._armies = [];
    this._availableUnits = {};
    this._nextId = 1;
    this._battleHistory = [];
    this._nextBattleId = 1;
    this._resolvedBattleIds = new Set();
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

  _defaultPosition() {
    const building = this._activeBuildings().find(item => Number.isFinite(item.gridX) && Number.isFinite(item.gridY));
    return { x: building?.gridX || 0, y: building?.gridY || 0 };
  }

  getArmyUnitCapacity() {
    const techBonus = Math.max(0, Number(this._tech?.getEffects?.().armyUnitCapacityBonus) || 0);
    const cultureBonus = Math.max(0, Number(this._culture?.getEffects?.().armyUnitCapacityBonus) || 0);
    return Math.min(10, 5 + Math.floor(techBonus + cultureBonus));
  }

  _isArmyTileOccupied(x, y, exceptId = null) {
    return this._armies.some(army => army.id !== exceptId && army.garrisonBuildingIndex == null && army.gridX === x && army.gridY === y)
      || (this._cityStateSystem?.getGarrisonArmies?.() || []).some(army => army.id !== exceptId && army.gridX === x && army.gridY === y)
      || Boolean(this._enemyExpansion?.getCellAt?.(x, y))
      || (this._ruinSystem?.getGuards?.() || []).some(guard => guard.gridX === x && guard.gridY === y)
      || (this._ruinSystem?.getRuins?.() || []).some(ruin => ruin.gridX === x && ruin.gridY === y);
  }

  _findOpenArmyTile(start, exceptId = null) {
    const map = this._getMap();
    for (let radius = 0; radius <= 12; radius += 1) for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const x = Math.floor(start.x) + dx, y = Math.floor(start.y) + dy;
      if (map && (x < 0 || y < 0 || x >= map.gridWidth || y >= map.gridHeight)) continue;
      if (!this._isArmyTileOccupied(x, y, exceptId)) return { x, y };
    }
    return null;
  }

  createArmy(name, position = null) {
    if (this._armies.length >= this.getArmyCapacity()) return { ok: false, reason: 'army_capacity_full' };
    const start = position && Number.isFinite(position.x) && Number.isFinite(position.y) ? position : this._defaultPosition();
    const openTile = this._findOpenArmyTile(start);
    if (!openTile) return { ok: false, reason: 'no_deployment_tile' };
    const army = {
      id: `army_${this._nextId++}`,
      ownerId: 'player',
      name: String(name || `第${this._armies.length + 1}军团`),
      unitIds: [],
      formationId: null,
      tacticId: null,
      heroId: null,
      gridX: openTile.x,
      gridY: openTile.y,
      supply: 1,
      embarked: false,
      garrisonBuildingIndex: null,
      movePath: [],
      order: { type: 'hold' },
      revision: 0,
      hpDamage: 0,
      movementProgress: 0
    };
    this._armies.push(army);
    this._notify('create');
    return { ok: true, army: this._decorateArmy(army) };
  }

  spawnCheatHestiaArmyNearHeadquarters() {
    const headquarters = this._activeBuildings().find(building =>
      configRegistry.getBuilding(building.buildingId)?.isHeadquarters
    );
    const start = headquarters || this._defaultPosition();
    const origin = { x: start.gridX ?? start.x, y: start.gridY ?? start.y };
    const map = this._getMap();
    let openTile = null;
    for (let radius = 1; radius <= 10 && !openTile; radius += 1) {
      for (let dy = -radius; dy <= radius && !openTile; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = origin.x + dx, y = origin.y + dy;
        if (map && (x < 0 || y < 0 || x >= map.gridWidth || y >= map.gridHeight)) continue;
        if (this._isArmyTileOccupied(x, y)) continue;
        const blockedByBuilding = this._activeBuildings().some(building => {
          const footprint = configRegistry.getBuilding(building.buildingId)?.footprint || { width: 1, height: 1 };
          return x >= building.gridX && x < building.gridX + footprint.width
            && y >= building.gridY && y < building.gridY + footprint.height;
        });
        if (!blockedByBuilding) openTile = { x, y };
      }
    }
    if (!openTile) return { ok: false, reason: 'no_deployment_tile' };
    const army = {
      id: `army_${this._nextId++}`, ownerId: 'player', name: '赫斯提亚测试军团',
      unitIds: ['primitive_healer'], formationId: null, tacticId: null, heroId: 'Hestia',
      gridX: openTile.x, gridY: openTile.y, supply: 1, embarked: false,
      garrisonBuildingIndex: null, movePath: [], order: { type: 'hold' },
      revision: 0, hpDamage: 0, movementProgress: 0, currentCp: 1,
      cheatStats: { hp: 50, maxHp: 50, attack: 20, attackRange: 1, speed: 6, cp: 1, healingAfterBattle: 10 }
    };
    this._armies.push(army);
    this._notify('cheat_spawn');
    eventBus.emit('armyDeployed', { armyId: army.id, unitCount: 0, cheat: true });
    return { ok: true, army: this._decorateArmy(army) };
  }

  spawnCheatSuperArmyNearHeadquarters() {
    const result = this.spawnCheatHestiaArmyNearHeadquarters();
    if (!result.ok) return result;
    const army = this._findArmy(result.army.id);
    army.name = '超级测试军团';
    army.heroId = null;
    army.unitIds = ['primitive_infantry_1'];
    army.currentCp = 10;
    army.cheatStats = { hp: 10000, maxHp: 10000, attack: 10000, attackRange: 1, speed: 10, cp: 10 };
    this._touch(army);
    this._notify('cheat_spawn_super_army');
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
    return this.addReserveUnits({ [unitId]: count });
  }

  addReserveUnits(units = {}, reason = 'reserve') {
    const entries = Object.entries(units || {});
    if (entries.length === 0 || entries.some(([unitId, count]) => (
      !this._unitConfig(unitId) || !Number.isInteger(count) || count <= 0
    ))) return false;
    for (const [unitId, count] of entries) {
      this._availableUnits[unitId] = (this._availableUnits[unitId] || 0) + count;
    }
    this._notify(reason);
    return true;
  }

  consumeReserveUnits(units = {}, reason = 'reserve') {
    const entries = Object.entries(units || {});
    if (entries.length === 0 || entries.some(([unitId, count]) => (
      !this._unitConfig(unitId)
      || !Number.isInteger(count)
      || count <= 0
      || (this._availableUnits[unitId] || 0) < count
    ))) return false;
    for (const [unitId, count] of entries) {
      this._availableUnits[unitId] -= count;
      if (this._availableUnits[unitId] <= 0) delete this._availableUnits[unitId];
    }
    this._notify(reason);
    return true;
  }

  getAvailableUnits() { return { ...this._availableUnits }; }

  _assemblyBuildingAt(buildingIndex) {
    if (!Number.isInteger(buildingIndex)) return null;
    const building = this._building?.buildings?.[buildingIndex];
    if (!building || building.status !== 'active' || building._invalid) return null;
    const config = configRegistry.getBuilding?.(building.buildingId);
    const domains = config?.uniqueFunction?.armyAssemblyDomains;
    if (!config || !Array.isArray(domains) || domains.length === 0) return null;
    return { building, config, domains };
  }

  deployArmyFromBuilding({ buildingIndex, name, unitCounts, fixedTargets = [] } = {}) {
    const assembly = this._assemblyBuildingAt(buildingIndex);
    if (!assembly) return { ok: false, reason: 'invalid_assembly_building' };

    const entries = Object.entries(unitCounts || {});
    if (entries.length === 0) return { ok: false, reason: 'empty_unit_selection' };
    if (entries.some(([, count]) => !Number.isInteger(count) || count <= 0)) {
      return { ok: false, reason: 'invalid_unit_count' };
    }

    const requestedUnits = entries.map(([unitId, count]) => ({
      unitId,
      count,
      config: this._unitConfig(unitId)
    }));
    if (requestedUnits.some(item => !item.config)) return { ok: false, reason: 'unknown_unit' };
    if (requestedUnits.some(item => (this._availableUnits[item.unitId] || 0) < item.count)) {
      return { ok: false, reason: 'insufficient_reserve' };
    }
    if (requestedUnits.reduce((sum, item) => sum + item.count, 0) > this.getArmyUnitCapacity()) {
      return { ok: false, reason: 'army_unit_capacity_full', capacity: this.getArmyUnitCapacity() };
    }

    const domains = new Set(requestedUnits.map(item => item.config.domain === 'naval' ? 'naval' : 'land'));
    if (domains.size !== 1) return { ok: false, reason: 'mixed_unit_domains' };
    const [domain] = domains;
    if (!assembly.domains.includes(domain)) return { ok: false, reason: 'assembly_domain_not_supported' };

    if (this._armies.length >= this.getArmyCapacity()) return { ok: false, reason: 'army_capacity_full' };

    const map = this._getMap();
    const manifestTargets = [
      ...(map?.spawnManifest?.cityStates || []),
      ...(map?.spawnManifest?.wildSites || [])
    ];
    const activeBuildings = this._activeBuildings().map(building => ({
      ...building,
      footprint: configRegistry.getBuilding?.(building.buildingId)?.footprint || { width: 1, height: 1 }
    }));
    const deploymentTile = findDeploymentTile({
      building: assembly.building,
      buildingConfig: assembly.config,
      map,
      domain,
      activeBuildings,
      armies: this._armies,
      fixedTargets: [...manifestTargets, ...fixedTargets]
    });
    if (!deploymentTile) return { ok: false, reason: 'no_deployment_tile' };

    const unitIds = requestedUnits.flatMap(item => Array(item.count).fill(item.unitId));
    const army = {
      id: `army_${this._nextId}`,
      ownerId: 'player',
      name: String(name || `第${this._armies.length + 1}军团`),
      unitIds,
      formationId: null,
      tacticId: null,
      heroId: null,
      gridX: deploymentTile.x,
      gridY: deploymentTile.y,
      supply: 1,
      embarked: false,
      garrisonBuildingIndex: null,
      movePath: [],
      order: { type: 'hold' },
      revision: 0,
      hpDamage: 0,
      movementProgress: 0
    };

    for (const item of requestedUnits) {
      this._availableUnits[item.unitId] -= item.count;
      if (this._availableUnits[item.unitId] <= 0) delete this._availableUnits[item.unitId];
    }
    this._nextId += 1;
    this._armies.push(army);
    this._notify('deploy');
    eventBus.emit('armyDeployed', { armyId: army.id, unitCount: unitIds.length, buildingIndex });
    return { ok: true, army: this._decorateArmy(army), direction: deploymentTile.direction };
  }

  _unitConfig(unitId) {
    return (configRegistry.get('enemies')?.units || []).find(unit => unit.id === unitId) || null;
  }

  _trainingBuildingAt(buildingIndex) {
    if (!Number.isInteger(buildingIndex)) return null;
    const building = this._building?.buildings?.[buildingIndex];
    if (!building || building.status !== 'active' || building._invalid) return null;
    const config = configRegistry.getBuilding?.(building.buildingId);
    const branches = config?.uniqueFunction?.trainsBranches;
    if (!config || !Array.isArray(branches) || branches.length === 0) return null;
    return { building, config, branches };
  }

  getTrainableUnitsAt(buildingIndex) {
    const trainingBuilding = this._trainingBuildingAt(buildingIndex);
    if (!trainingBuilding) return [];
    return (configRegistry.get('enemies')?.units || []).filter(unit => trainingBuilding.branches.includes(unit.branch));
  }

  _hasActiveNavalTrainingFacility() {
    return this._activeBuildings().some(building => {
      const config = configRegistry.getBuilding?.(building.buildingId);
      return config?.uniqueFunction?.trainsBranches?.includes('navy')
        || config?.tags?.some(tag => ['naval_facility', 'naval'].includes(tag));
    });
  }

  canTrainUnitAt(buildingIndex, unitId) {
    const trainingBuilding = this._trainingBuildingAt(buildingIndex);
    if (!trainingBuilding) return { ok: false, reason: 'invalid_training_building' };
    const unit = this._unitConfig(unitId);
    if (!unit) return { ok: false, reason: 'unknown_unit' };
    if (!trainingBuilding.branches.includes(unit.branch)) {
      return { ok: false, reason: 'branch_not_supported', unit };
    }

    const eras = configRegistry.getHistoricalContent?.().eras || [];
    const currentEra = this._era?.getCurrentEra?.() || null;
    const unitEra = unit.eraId ? eras.find(era => era.id === unit.eraId) : null;
    const costs = unit.cost || [];
    const eligibility = evaluateTrainingEligibility({
      unit,
      canAfford: costs.length === 0 || this._resource?.canAfford?.(costs) === true,
      soldierCount: this._building?.getTotalSoldierCount?.() || 0,
      soldierCap: this._building?.getTotalSoldierCapacity?.() || 0,
      isUnlocked: unit.unlocked !== false || this._tech?.isUnitUnlockedByTech?.(unit.id) === true,
      hasNavalFacility: this._hasActiveNavalTrainingFacility(),
      currentEraOrder: currentEra?.order ?? null,
      unitEraOrder: unitEra?.order ?? null,
      selectedCivilizationId: this._era?.getSelectedCivilization?.()?.id || null,
      availablePopulation: this._population?.getAvailableWorkers?.() ?? null
    });
    if (!eligibility.ok) {
      return {
        ok: false,
        reason: eligibility.reasonCodes[0] || 'training_requirements_not_met',
        reasons: eligibility.reasons,
        unit
      };
    }
    return { ok: true, unit };
  }

  trainUnitAt(buildingIndex, unitId) {
    const check = this.canTrainUnitAt(buildingIndex, unitId);
    if (!check.ok) return check;
    if (!this._resource?.consumeAll?.(check.unit.cost || [])) {
      return { ok: false, reason: 'insufficient_resources', unit: check.unit };
    }
    this.addReserveUnit(unitId, 1);
    eventBus.emit('unitTrained', { unitId, amount: 1, buildingIndex });
    return { ok: true, reserve: this._availableUnits[unitId] };
  }

  /**
   * 军团攻击距离 = 所有兵种攻击距离按数量加权平均后向下取整。
   * unitIds 中每一项代表一名兵，因此天然包含数量权重。
   */
  getArmyAttackRange(armyId) {
    const army = this._findArmy(armyId);
    if (!army) return 0;
    if (army.cheatStats) return Math.max(0, Math.floor(Number(army.cheatStats.attackRange) || 0));
    const ranges = army.unitIds.map(unitId => {
      const configured = Number(this._unitConfig(unitId)?.attackRange);
      return Number.isFinite(configured) && configured >= 0 ? configured : 1;
    });
    const heroStats = this._heroStats(army);
    if (heroStats) ranges.push(Math.max(0, Number(heroStats.attackRange) || 0));
    return ranges.length ? Math.floor(ranges.reduce((sum, value) => sum + value, 0) / ranges.length) : 0;
  }

  _calculateArmyCp(army) {
    if (army?.cheatStats) return Math.max(1, Math.floor(Number(army.cheatStats.cp) || 1));
    const values = (army?.unitIds || []).map(unitId => Math.max(1, Number(this._unitConfig(unitId)?.cp) || 1));
    if (army?.heroId) values.push(Math.max(1, Number(this._heroStats(army)?.cp) || 1));
    return values.length ? Math.max(1, Math.floor(values.reduce((sum, value) => sum + value, 0) / values.length)) : 1;
  }

  getArmyCpMax(armyId) { return this._calculateArmyCp(this._findArmy(armyId)); }

  getArmyCp(armyId) {
    const army = this._findArmy(armyId);
    return army ? Math.max(0, Math.min(this._calculateArmyCp(army), Number.isFinite(army.currentCp) ? army.currentCp : this._calculateArmyCp(army))) : 0;
  }

  consumeAttackCp(armyId) {
    const army = this._findArmy(armyId);
    if (!army) return { ok: false, reason: 'unknown_army' };
    const current = this.getArmyCp(armyId);
    if (current < 1) return { ok: false, reason: 'insufficient_cp', currentCp: current, maxCp: this.getArmyCpMax(armyId) };
    army.currentCp = current - 1;
    this._touch(army);
    this._notify('cp_spent');
    return { ok: true, currentCp: army.currentCp, maxCp: this.getArmyCpMax(armyId) };
  }

  restoreArmyCp() {
    let changed = false;
    for (const army of this._armies) {
      const maxCp = this._calculateArmyCp(army);
      if (army.currentCp === maxCp) continue;
      army.currentCp = maxCp;
      changed = true;
    }
    if (changed) this._notify('cp_restored');
    return changed;
  }

  setMovementSpeedMultiplier(multiplier = 1) {
    this._movementSpeedMultiplier = Math.max(1, Number(multiplier) || 1);
  }

  setCityStateSystem(system) { this._cityStateSystem = system || null; }
  setPathfindingSystem(system) { this._pathfindingSystem = system || null; }
  setBlackMistSystem(system) { this._blackMistSystem = system || null; }

  _healArmiesPerTick() {
    let changed = false;
    for (const army of this._armies) {
      const amount = this.getArmyPostBattleHealing(army.id) / 2;
      if (amount <= 0 || !(army.hpDamage > 0)) continue;
      const healed = Math.min(army.hpDamage, amount); army.hpDamage -= healed; changed = true;
      eventBus.emit('armyHealed', { armyId: army.id, healed, source: 'healer_tick' });
    }
    if (changed) this._notify('healer_tick');
  }

  _applyBlackMistDamage() {
    for (const army of [...this._armies]) if (this._blackMistSystem?.isCovered?.(army.gridX, army.gridY)) this.applyDamage(army.id, 30);
  }

  _tickHeroSkillCooldowns() {
    let changed = false;
    for (const army of this._armies) if ((army.heroSkillCooldown || 0) > 0) { army.heroSkillCooldown -= 1; changed = true; }
    if (changed) this._notify('hero_skill_cooldown');
  }

  useHeroActiveSkill(armyId, direction) {
    const army = this._findArmy(armyId);
    if (!army || army.heroId !== 'Hestia') return { ok: false, reason: '需要赫斯提亚担任领队' };
    if ((army.heroSkillCooldown || 0) > 0) return { ok: false, reason: '技能尚在冷却', cooldown: army.heroSkillCooldown };
    if (this.getArmyCp(armyId) < 1) return { ok: false, reason: 'CP不足' };
    const vector = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[direction];
    if (!vector) return { ok: false, reason: '方向无效' };
    const [dx, dy] = vector, endX = army.gridX + dx * 4, endY = army.gridY + dy * 4;
    if (!this.isLandPassableAt(endX, endY) || this._isArmyTileOccupied(endX, endY, army.id)) return { ok: false, reason: '突刺终点受到阻挡' };
    const activeSkill = this._hero?.getHeroAbilityProfile?.('Hestia')?.activeSkill || {};
    const damage = this.getArmyStats(armyId).attack * Math.max(0, Number(activeSkill.damageMultiplier) || 2);
    const hitIds = [];
    let totalDamageDealt = 0;
    for (let step = 1; step <= 4; step += 1) {
      const x = army.gridX + dx * step, y = army.gridY + dy * step;
      const target = this._armies.find(candidate => candidate.ownerId !== 'player' && candidate.gridX === x && candidate.gridY === y);
      if (target) { hitIds.push(target.id); this.applyDamage(target.id, damage); totalDamageDealt += damage; }
      const combatHit = this._combat?.damageEnemyAt?.(x, y, damage);
      if (combatHit?.ok) { hitIds.push(combatHit.enemyId); totalDamageDealt += damage; }
      const expansionHit = this._enemyExpansion?.damageCellAt?.(x, y, damage);
      if (expansionHit?.ok) { hitIds.push(`expansion:${x},${y}`); totalDamageDealt += damage; }
    }
    const healed = this._applyHeroActiveAttackLifesteal(armyId, totalDamageDealt);
    this.consumeAttackCp(armyId);
    const cooldown = Math.max(1, Math.floor(Number(this._hero?.getHero?.('Hestia')?.activeSkill?.cooldownTicks) || 12));
    army.gridX = endX; army.gridY = endY; army.heroSkillCooldown = cooldown; army.movePath = [];
    this._touch(army); this._notify('hero_active_skill');
    eventBus.emit('heroActiveSkillUsed', { heroId: 'Hestia', armyId, skillId: 'hestia_moonlight', direction, damage, hitIds, healed, endX, endY });
    return { ok: true, damage, hitIds, healed, endX, endY, cooldown };
  }

  _heroProfile(army) {
    if (!army?.heroId) return null;
    const recruited = (this._hero?.getRecruitedHeroes?.() || []).find(entry => (entry.heroId || entry.id) === army.heroId);
    const ability = this._hero?.getHeroAbilityProfile?.(army.heroId);
    if (recruited) return { ...recruited, ability };
    if (army.cheatStats) {
      const configured = this._hero?.getHero?.(army.heroId);
      return configured ? { ...configured, heroId: configured.id, ability: { stats: army.cheatStats } } : null;
    }
    return null;
  }

  _heroStats(army) { return this._heroProfile(army)?.ability?.stats || null; }

  getArmyStats(armyId) {
    const army = this._findArmy(armyId);
    if (!army) return { attack: 0, maxHp: 0, hp: 0, attackRange: 0, speed: 0 };
    if (army.cheatStats) {
      const maxHp = Math.max(1, Number(army.cheatStats.maxHp ?? army.cheatStats.hp) || 1);
      return {
        attack: Math.max(0, Number(army.cheatStats.attack) || 0), maxHp,
        hp: Math.max(0, maxHp - Math.max(0, Number(army.hpDamage) || 0)),
        attackRange: Math.max(0, Math.floor(Number(army.cheatStats.attackRange) || 0)),
        speed: Math.max(0, Number(army.cheatStats.speed) || 0)
      };
    }
    const configs = army.unitIds.map(unitId => this._unitConfig(unitId)).filter(Boolean);
    const heroStats = this._heroStats(army);
    if (heroStats) configs.push(heroStats);
    const multipliers = this.getArmyStatMultipliers();
    const attack = configs.reduce((sum, unit) => sum + Math.max(0, Number(unit.attack) || Number(unit.combatPower) || 1), 0) * multipliers.attack;
    const maxHp = configs.reduce((sum, unit) => sum + Math.max(1, Number(unit.hp) || Number(unit.combatPower) || 1), 0) * multipliers.hp;
    let speed = configs.length
      ? configs.reduce((sum, unit) => sum + Math.max(0, Number(unit.speed) || 1), 0) / configs.length
      : 0;
    if (army.heroId === 'Hestia') speed += 1;
    return {
      attack: Math.round(attack * 100) / 100,
      maxHp: Math.round(maxHp * 100) / 100,
      hp: Math.round(Math.max(0, maxHp - Math.max(0, Number(army.hpDamage) || 0)) * 100) / 100,
      attackRange: this.getArmyAttackRange(armyId),
      speed: Math.round(speed * 100) / 100
    };
  }

  /**
   * 玩家军团平均综合强度(含英雄/建筑/时代加成)。
   * 0 个军团时返回 0,由调用方配合时代保底使用。
   * 供 R3b 敌人强度锚定(城邦派兵/守军基准)。
   */
  getAverageArmyPower() {
    const armies = this.getArmies()
      .filter(army => (!army.ownerId || army.ownerId === 'player') && (army.unitIds?.length || army.heroId));
    const strengths = armies.map(army => {
      const stats = this.getArmyStats(army.id) || army;
      const cp = this.getArmyCpMax(army.id) || army.maxCp || army.cp || 1;
      return calculateCombatStrength({ ...stats, cp });
    }).filter(value => Number.isFinite(value) && value > 0);
    if (strengths.length === 0) return 0;
    return strengths.reduce((sum, value) => sum + value, 0) / strengths.length;
  }

  getArmyStatMultipliers() {
    const culture = this._culture?.getEffects?.() || {};
    const tech = this._tech?.getEffects?.() || {};
    const era = this._era?.getBonuses?.() || {};
    const hero = this._hero?.getBonuses?.() || {};
    const luxury = this._luxury?.getBonuses?.() || {};
    let buildingAttackBonus = 0;
    let buildingHpBonus = 0;
    for (const building of this._building?.buildings || []) {
      if (building.status !== 'active' || building._invalid) continue;
      const effect = this._buildingConfig?.(building.buildingId)?.uniqueFunction
        || configRegistry.getBuilding(building.buildingId)?.uniqueFunction || {};
      buildingAttackBonus += (effect.armyAttackMul || effect.meleePowerMul || 1) - 1;
      buildingHpBonus += (effect.armyHpMul || 1) - 1;
    }
    const buildingAttack = 1 + buildingAttackBonus;
    const buildingHp = 1 + buildingHpBonus;
    const legacyArmyPower = era.armyPowerMul || 1;
    return {
      attack: (culture.meleeDamageMul || 1) * (tech.armyAttackMul || 1) * (era.armyAttackMul || 1) * legacyArmyPower * (hero.armyAttackMul || hero.meleeDamageMul || 1) * (luxury.armyAttackMul || 1) * buildingAttack,
      hp: (culture.unitHpMul || 1) * (tech.armyHpMul || tech.unitHpMul || 1) * (era.armyHpMul || 1) * legacyArmyPower * (hero.armyHpMul || hero.unitHpMul || 1) * (luxury.armyHpMul || 1) * buildingHp,
      speed: luxury.armySpeedMul || 1
    };
  }

  applyDamage(armyId, amount) {
    const army = this._findArmy(armyId);
    if (!army) return { ok: false, reason: 'unknown_army' };
    army.hpDamage = Math.max(0, (Number(army.hpDamage) || 0) + Math.max(0, Number(amount) || 0));
    const stats = this.getArmyStats(armyId);
    if (stats.hp <= 0) {
      if (army.heroId) this._hero?.injureHero?.(army.heroId);
      this._armies = this._armies.filter(item => item.id !== armyId);
      eventBus.emit('armyDestroyed', { armyId, ownerId: army.ownerId || 'player', gridX: army.gridX, gridY: army.gridY });
    } else {
      this._touch(army);
    }
    this._notify('damage');
    return { ok: true, destroyed: stats.hp <= 0, damage: Math.max(0, Number(amount) || 0), hp: stats.hp };
  }

  canAttackTarget(armyId, targetX, targetY) {
    const army = this._findArmy(armyId);
    if (!army) return { ok: false, reason: 'unknown_army' };
    if (!army.unitIds.length && !army.heroId) return { ok: false, reason: 'empty_army' };
    if (this.getArmyCp(armyId) < 1) return { ok: false, reason: 'insufficient_cp', currentCp: 0, maxCp: this.getArmyCpMax(armyId) };
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return { ok: false, reason: 'invalid_target' };
    const distance = Math.abs(army.gridX - targetX) + Math.abs(army.gridY - targetY);
    const attackRange = this.getArmyAttackRange(armyId);
    return distance <= attackRange
      ? { ok: true, distance, attackRange }
      : { ok: false, reason: 'target_out_of_range', distance, attackRange };
  }

  addUnit(armyId, unitId, count = 1) {
    const army = this._findArmy(armyId);
    const config = this._unitConfig(unitId);
    if (!army || !config) return { ok: false, reason: 'unknown_unit_or_army' };
    if (!Number.isInteger(count) || count <= 0) return { ok: false, reason: 'invalid_count' };
    if ((this._availableUnits[unitId] || 0) < count) return { ok: false, reason: 'insufficient_reserve' };
    if (army.unitIds.length + count > this.getArmyUnitCapacity()) {
      return { ok: false, reason: 'army_unit_capacity_full', capacity: this.getArmyUnitCapacity() };
    }
    for (let index = 0; index < count; index += 1) army.unitIds.push(unitId);
    this._availableUnits[unitId] -= count;
    this._touch(army);
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
    this._touch(army);
    this._notify('tactic');
    return { ok: true };
  }

  getArmyPostBattleHealing(armyId) {
    const army = this._findArmy(armyId);
    if (!army) return 0;
    if (army.cheatStats) return Math.max(0, Number(army.cheatStats.healingAfterBattle) || 0);
    return army.unitIds.reduce((sum, unitId) => {
      const unit = this._unitConfig(unitId);
      return sum + (unit?.roleTags?.includes('healer') ? Math.max(0, Number(unit.healingAfterBattle) || Number(unit.attack) || 0) : 0);
    }, 0);
  }

  healArmyAfterBattle(armyId) {
    const army = this._findArmy(armyId);
    const amount = this.getArmyPostBattleHealing(armyId);
    if (!army || amount <= 0 || !(army.hpDamage > 0)) return { healed: 0 };
    const healed = Math.min(army.hpDamage, amount);
    army.hpDamage -= healed;
    this._touch(army);
    this._notify('post_battle_healing');
    eventBus.emit('armyHealedAfterBattle', { armyId, healed });
    return { healed };
  }

  _applyHeroActiveAttackLifesteal(armyId, damageDealt) {
    const army = this._findArmy(armyId);
    if (!army?.heroId || !(army.hpDamage > 0) || !(damageDealt > 0)) return 0;
    const ability = this._hero?.getHeroAbilityProfile?.(army.heroId)?.activeSkill || {};
    const ratio = Math.max(0, Number(ability.activeAttackLifeSteal ?? ability.lifeSteal) || 0);
    const healed = Math.min(army.hpDamage, damageDealt * ratio);
    if (healed <= 0) return 0;
    army.hpDamage -= healed;
    this._touch(army);
    eventBus.emit('armyHealed', { armyId, healed, source: 'hero_active_attack_lifesteal' });
    return healed;
  }

  getHeroChangeStatus(armyId) {
    const army = this._findArmy(armyId);
    if (!army) return { ok: false, reason: '军团不存在' };
    const stats = this.getArmyStats(armyId);
    if (stats.hp < stats.maxHp) return { ok: false, reason: '军团生命值未满，无法设置或更换英雄' };
    const currentCp = this.getArmyCp(armyId), maxCp = this.getArmyCpMax(armyId);
    if (currentCp < maxCp) return { ok: false, reason: '军团CP未满，无法设置或更换英雄' };
    return { ok: true };
  }

  canAssignHero(armyId, heroId) {
    const targetStatus = this.getHeroChangeStatus(armyId);
    if (!targetStatus.ok) return targetStatus;
    const source = this._armies.find(item => item.id !== armyId && item.heroId === heroId);
    if (source) {
      const sourceStatus = this.getHeroChangeStatus(source.id);
      if (!sourceStatus.ok) return { ok: false, reason: '该英雄当前率领的军团生命值或CP未满，无法切换部队' };
      return { ok: false, reason: '该英雄已经率领其他军团' };
    }
    return { ok: true };
  }

  assignHero(armyId, heroId) {
    const army = this._findArmy(armyId);
    if (!army) return { ok: false, reason: 'unknown_army' };
    const changeStatus = this.canAssignHero(armyId, heroId);
    if (!changeStatus.ok) return changeStatus;
    const hero = (this._hero?.getRecruitedHeroes?.() || []).find(entry => (entry.heroId || entry.id) === heroId);
    if (!hero || hero.status === 'injured') return { ok: false, reason: 'hero_unavailable' };
    if (hero.role !== 'commander' && hero.heroClass !== 'military') return { ok: false, reason: 'hero_not_military' };
    if (this._armies.some(item => item.id !== armyId && item.heroId === heroId)) return { ok: false, reason: 'hero_already_assigned' };
    const result = this._hero?.assignHero?.(heroId, { type: 'army', armyId }) || { ok: true };
    if (!result.ok) return result;
    if (army.heroId && army.heroId !== heroId) this._hero?.assignHero?.(army.heroId, null);
    army.heroId = heroId;
    army.hpDamage = Math.min(army.hpDamage || 0, Math.max(0, this.getArmyStats(armyId).maxHp - 1));
    this._notify('hero');
    return { ok: true };
  }

  unassignHero(armyId) {
    const army = this._findArmy(armyId);
    if (!army) return false;
    if (!this.getHeroChangeStatus(armyId).ok) return false;
    if (army.heroId) this._hero?.assignHero?.(army.heroId, null);
    army.heroId = null;
    this._notify('hero');
    return true;
  }

  _getMap() { return configRegistry.get('map') || null; }

  _groundAt(x, y) { return this._getMap()?.grid?.[y]?.[x] || null; }

  _hasPassableBridge(x, y) {
    return (this._building?.buildings || []).some(building => {
      const config = configRegistry.getBuilding?.(building.buildingId);
      return config?.passable === true && building.gridX === x && building.gridY === y;
    });
  }

  _isWater(x, y) { return ['S', 'W'].includes(this._groundAt(x, y)) && !this._hasPassableBridge(x, y); }

  isLandPassableAt(x, y) {
    return Boolean(this._groundAt(x, y)) && !this._isWater(x, y) && !this.isTileOccupiedByBuilding(x, y);
  }

  _armyIsNaval(army) {
    return army.unitIds.length > 0 && army.unitIds.every(unitId => (this._unitConfig(unitId)?.domain || 'land') === 'naval');
  }

  _armyHasOnlyLandUnits(army) {
    return army.unitIds.length > 0 && army.unitIds.every(unitId => (this._unitConfig(unitId)?.domain || 'land') !== 'naval');
  }

  isTileOccupiedByBuilding(x, y, { allowGarrisonIndex = null } = {}) {
    if (this._cityStateSystem?.isHostileBuildingAt?.(x, y)) return true;
    return (this._building?.buildings || []).some((building, buildingIndex) => {
      if (buildingIndex === allowGarrisonIndex) return false;
      const config = configRegistry.getBuilding?.(building.buildingId);
      if (config?.passable === true) return false;
      const width = Math.max(1, Math.floor(Number(config?.footprint?.width) || 1));
      const height = Math.max(1, Math.floor(Number(config?.footprint?.height) || 1));
      return x >= building.gridX && x < building.gridX + width
        && y >= building.gridY && y < building.gridY + height;
    });
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
    if (this.isTileOccupiedByBuilding(x, y)) return false;
    if (army.embarked) return this._isWater(x, y) || (x === start.x && y === start.y);
    if (this._armyIsNaval(army)) return this._isWater(x, y);
    return !this._isWater(x, y);
  }

  _findPath(army, targetX, targetY) {
    // 共享 BFS 寻路系统(PathfindingSystem),规则按军团形态选择;
    // 避开其他军团由 avoidUnits 传入(不做缓存,命令下达时新鲜计算)
    if (this._pathfindingSystem) {
      const rule = army.embarked ? 'embarked' : (this._armyIsNaval(army) ? 'naval' : 'land');
      return this._pathfindingSystem.findPath(army.gridX, army.gridY, targetX, targetY, {
        rule,
        avoidUnits: this._armies.filter(other => other.id !== army.id && other.garrisonBuildingIndex == null)
      });
    }
    // 回退:PathfindingSystem 未注入时的本地 BFS(与共享实现同规则)
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
    if (this.isTileOccupiedByBuilding(targetX, targetY)) return { ok: false, reason: 'tile_occupied_by_building' };
    const targetIsWater = this._isWater(targetX, targetY);
    if ((army.embarked || this._armyIsNaval(army)) !== targetIsWater) return { ok: false, reason: 'incompatible_terrain' };
    const path = this._findPath(army, targetX, targetY);
    if (!path.length && (army.gridX !== targetX || army.gridY !== targetY)) return { ok: false, reason: 'no_path' };
    army.movePath = path;
    army.order = path.length ? { type: 'move', target: { x: targetX, y: targetY } } : { type: 'hold' };
    this._touch(army);
    this._notify('move_order');
    return { ok: true, path: structuredClone(path) };
  }

  teleportArmyNear(armyId, targetX, targetY) {
    const army = this._findArmy(armyId);
    if (!army) return { ok: false, reason: 'unknown_army' };
    if (army.garrisonBuildingIndex != null) return { ok: false, reason: 'army_garrisoned' };
    if (army.embarked || this._armyIsNaval(army)) return { ok: false, reason: 'land_army_required' };
    const destinations = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
    const destination = destinations.map(([dx, dy]) => ({ x: targetX + dx, y: targetY + dy })).find(point => (
      this._groundAt(point.x, point.y)
      && !this._isWater(point.x, point.y)
      && !this.isTileOccupiedByBuilding(point.x, point.y)
      && !this._isArmyTileOccupied(point.x, point.y, army.id)
    ));
    if (!destination) return { ok: false, reason: 'teleport_destination_blocked' };
    army.gridX = destination.x;
    army.gridY = destination.y;
    army.movePath = [];
    army.order = { type: 'hold' };
    army.movementProgress = 0;
    this._touch(army);
    this._notify('teleport');
    eventBus.emit('armyTeleported', { armyId, gridX: army.gridX, gridY: army.gridY });
    return { ok: true, gridX: army.gridX, gridY: army.gridY };
  }

  _advanceMovement() {
    let changed = false;
    for (const army of this._armies) {
      if (army.garrisonBuildingIndex != null || !army.movePath?.length) continue;
      const speed = (this.getArmyStats(army.id).speed || 1) * this._movementSpeedMultiplier * (this._luxury?.getBonuses?.().armySpeedMul || 1);
      army.movementProgress = (Number(army.movementProgress) || 0) + speed;
      let steps = Math.floor(army.movementProgress);
      if (steps <= 0) continue;
      army.movementProgress -= steps;
      while (steps-- > 0 && army.movePath.length) {
        const next = army.movePath[0];
        if (this._isArmyTileOccupied(next.x, next.y, army.id)) {
          army.movementProgress = 0;
          break;
        }
        army.movePath.shift();
        army.gridX = next.x;
        army.gridY = next.y;
      }
      if (!army.movePath.length) army.order = { type: 'hold' };
      this._touch(army);
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
    const building = this._building?.buildings?.[army.garrisonBuildingIndex];
    const config = building ? configRegistry.getBuilding?.(building.buildingId) : null;
    if (!building || !config || !this._getMap()) return { ok: false, reason: 'no_ungarrison_tile' };
    const exit = getDeploymentCandidates(building, config).find(candidate => {
      if (!this._canOccupyForMovement(army, candidate.x, candidate.y, { x: army.gridX, y: army.gridY })) return false;
      return !this._armies.some(other => (
        other.id !== army.id
        && other.garrisonBuildingIndex == null
        && other.gridX === candidate.x
        && other.gridY === candidate.y
      ));
    });
    if (!exit) return { ok: false, reason: 'no_ungarrison_tile' };
    army.gridX = exit.x;
    army.gridY = exit.y;
    army.garrisonBuildingIndex = null;
    army.movePath = [];
    army.order = { type: 'hold' };
    this._touch(army);
    this._notify('ungarrison');
    return { ok: true, army: this._decorateArmy(army), direction: exit.direction };
  }

  hasGarrisonAtBuilding(buildingIndex) {
    return this._armies.some(army => army.garrisonBuildingIndex === buildingIndex);
  }

  getArmyDefenseMultiplier(armyId) {
    const army = this._findArmy(armyId);
    if (!army || army.garrisonBuildingIndex == null) return 1;
    const building = this._building?.buildings?.[army.garrisonBuildingIndex];
    const config = building ? configRegistry.getBuilding?.(building.buildingId) : null;
    return config?.uniqueFunction?.garrisonDefenseMul || 1.25;
  }

  getFortificationEffects(armyId) {
    const army = this._findArmy(armyId);
    if (!army || army.garrisonBuildingIndex == null) {
      return { defenseMultiplier: 1, supplyRecovery: 0, moraleRecovery: 0, visionRadius: 0 };
    }
    const building = this._building?.buildings?.[army.garrisonBuildingIndex];
    const config = building ? configRegistry.getBuilding?.(building.buildingId) : null;
    const fn = config?.uniqueFunction || {};
    return {
      defenseMultiplier: fn.garrisonDefenseMul || 1.25,
      supplyRecovery: fn.garrisonSupplyRecovery || 0,
      moraleRecovery: fn.garrisonMoraleRecovery || 0,
      visionRadius: fn.visionRadius || 0
    };
  }

  _resupplyGarrisons() {
    let changed = false;
    for (const army of this._armies) {
      if (army.garrisonBuildingIndex == null) continue;
      const effects = this.getFortificationEffects(army.id);
      const supply = Math.min(1, army.supply + effects.supplyRecovery);
      if (supply !== army.supply) changed = true;
      army.supply = Math.round(supply * 1000) / 1000;
    }
    if (changed) this._notify('garrison_resupply');
  }

  previewEngagement(attackerId, defenderId, context = {}) {
    const attacker = this._findArmy(attackerId);
    const defender = this._findArmy(defenderId);
    if (!attacker || !defender) return { ok: false, reason: 'unknown_army' };
    if (!attacker.unitIds.length || !defender.unitIds.length) return { ok: false, reason: 'empty_army' };
    const rangeCheck = this.canAttackTarget(attackerId, defender.gridX, defender.gridY);
    if (!rangeCheck.ok) return rangeCheck;
    const battleId = `battle_${this._nextBattleId}`;
    const battleContext = {
      ...structuredClone(context),
      battleId,
      campaignSeed: context.campaignSeed || 'campaign_default',
      attackerDefenseMultiplier: this.getArmyDefenseMultiplier(attackerId),
      defenderDefenseMultiplier: this.getArmyDefenseMultiplier(defenderId)
    };
    const preview = previewStrategicBattle(
      attacker,
      defender,
      configRegistry.get('enemies')?.units || [],
      this.getTactics(),
      battleContext
    );
    return {
      ok: true,
      battleId,
      attackerId,
      defenderId,
      expectedRevisions: { attacker: attacker.revision, defender: defender.revision },
      context: battleContext,
      preview
    };
  }

  commitEngagement(prepared) {
    if (!prepared?.ok || !prepared.battleId) return { ok: false, reason: 'invalid_battle_preview' };
    if (this._resolvedBattleIds.has(prepared.battleId)) return { ok: false, reason: 'battle_already_resolved' };
    const attacker = this._findArmy(prepared.attackerId);
    const defender = this._findArmy(prepared.defenderId);
    if (!attacker || !defender) return { ok: false, reason: 'unknown_army' };
    if (attacker.revision !== prepared.expectedRevisions?.attacker || defender.revision !== prepared.expectedRevisions?.defender) {
      return { ok: false, reason: 'stale_army_revision' };
    }
    const result = resolveStrategicBattle(
      structuredClone(attacker),
      structuredClone(defender),
      configRegistry.get('enemies')?.units || [],
      this.getTactics(),
      prepared.context
    );
    this._applyCasualties(attacker, result.casualties.attacker);
    this._applyCasualties(defender, result.casualties.defender);
    attacker.supply = Math.max(0.25, Math.min(1.25, attacker.supply + result.supplyDelta.attacker));
    defender.supply = Math.max(0.25, Math.min(1.25, defender.supply + result.supplyDelta.defender));
    attacker.order = result.retreat.attacker ? { type: 'return' } : { type: 'hold' };
    defender.order = result.retreat.defender ? { type: 'return' } : { type: 'hold' };
    this._touch(attacker);
    this._touch(defender);
    if (!attacker.unitIds.length && attacker.heroId) this._hero?.injureHero?.(attacker.heroId);
    if (!defender.unitIds.length && defender.heroId) this._hero?.injureHero?.(defender.heroId);
    const record = { id: prepared.battleId, attackerId: attacker.id, defenderId: defender.id, ...result };
    this._battleHistory.push(record);
    this._battleHistory = this._battleHistory.slice(-20);
    this._resolvedBattleIds.add(prepared.battleId);
    this._nextBattleId += 1;
    this._notify('battle');
    eventBus.emit('armyBattleResolved', structuredClone(record));
    eventBus.emit('combatBroadcast', { message: `⚔️ ${attacker.name}与${defender.name}交战：${result.winner === 'attacker' ? attacker.name + '获胜' : result.winner === 'defender' ? defender.name + '获胜' : '双方战平'}` });
    return { ok: true, ...structuredClone(record) };
  }

  resolveEngagement(attackerId, defenderId, context = {}) {
    const attacker = this._findArmy(attackerId);
    const defender = this._findArmy(defenderId);
    if (!attacker || !defender) return { ok: false, reason: 'unknown_army' };
    const rangeCheck = this.canAttackTarget(attackerId, defender.gridX, defender.gridY);
    if (!rangeCheck.ok) return rangeCheck;
    const distance = rangeCheck.distance;
    const attackerStats = this.getArmyStats(attackerId);
    const defenderStats = this.getArmyStats(defenderId);
    const defenderCanAttack = distance <= defenderStats.attackRange;
    const order = defenderCanAttack && defenderStats.speed > attackerStats.speed
      ? [{ id: defenderId, targetId: attackerId, stats: defenderStats }, { id: attackerId, targetId: defenderId, stats: attackerStats }]
      : [{ id: attackerId, targetId: defenderId, stats: attackerStats }, ...(defenderCanAttack ? [{ id: defenderId, targetId: attackerId, stats: defenderStats }] : [])];
    const attacks = [];
    for (const turn of order) {
      if (!this._findArmy(turn.id)?.unitIds.length || !this._findArmy(turn.targetId)?.unitIds.length) continue;
      if (!this.consumeAttackCp(turn.id).ok) continue;
      const targetHpBefore = this.getArmyStats(turn.targetId).hp;
      const damage = this.applyDamage(turn.targetId, turn.stats.attack);
      attacks.push({ attackerId: turn.id, defenderId: turn.targetId, damage: turn.stats.attack, destroyed: damage.destroyed });
      if (turn.id === attackerId) this._applyHeroActiveAttackLifesteal(turn.id, Math.min(targetHpBefore, turn.stats.attack));
      if (damage.destroyed) break;
    }
    const defenderRetaliated = attacks.some(attack => attack.attackerId === defenderId && attack.defenderId === attackerId);
    if (this._findArmy(attackerId) && this._findArmy(defenderId) && defenderRetaliated && attackerStats.speed - defenderStats.speed >= 2) {
      const targetHpBefore = this.getArmyStats(defenderId).hp;
      const bonus = this.applyDamage(defenderId, attackerStats.attack);
      attacks.push({ attackerId, defenderId, damage: attackerStats.attack, destroyed: bonus.destroyed, bonusStrike: true });
      this._applyHeroActiveAttackLifesteal(attackerId, Math.min(targetHpBefore, attackerStats.attack));
    }
    const attackerRetaliated = attacks.some(attack => attack.attackerId === attackerId && attack.defenderId === defenderId);
    if (this._findArmy(attackerId) && this._findArmy(defenderId) && attackerRetaliated && defenderStats.speed - attackerStats.speed >= 2) {
      const bonus = this.applyDamage(attackerId, defenderStats.attack);
      attacks.push({ attackerId: defenderId, defenderId: attackerId, damage: defenderStats.attack, destroyed: bonus.destroyed, bonusStrike: true });
    }
    const healing = {
      attacker: this.healArmyAfterBattle(attackerId).healed,
      defender: this.healArmyAfterBattle(defenderId).healed
    };
    eventBus.emit('combatBroadcast', { message: `⚔️ ${attacker.name}向${defender.name}发动攻击${defenderCanAttack ? '，双方完成交锋' : '，敌军射程不足无法反击'}` });
    return { ok: true, attackerId, defenderId, distance, attacks, healing };
  }

  _applyCasualties(army, count) {
    if (count <= 0) return;
    const unitMap = new Map((configRegistry.get('enemies')?.units || []).map(unit => [unit.id, unit]));
    army.unitIds.sort((left, right) => (unitMap.get(left)?.combatPower || 1) - (unitMap.get(right)?.combatPower || 1));
    army.unitIds.splice(0, Math.min(count, army.unitIds.length));
  }

  getBattleHistory() { return structuredClone(this._battleHistory); }

  applyAttrition(armyId, { casualtyRate = 0, moraleDelta = 0, supplyDelta = 0 } = {}) {
    const army = this._findArmy(armyId);
    if (!army) return { ok: false, reason: 'unknown_army' };
    const casualties = army.unitIds.length ? Math.min(army.unitIds.length, Math.max(0, Math.round(army.unitIds.length * casualtyRate))) : 0;
    this._applyCasualties(army, casualties);
    army.supply = Math.max(0.25, Math.min(1.25, army.supply + supplyDelta));
    if (!army.unitIds.length && army.heroId) this._hero?.injureHero?.(army.heroId);
    this._notify('attrition');
    return { ok: true, casualties };
  }

  getArmyPower(armyId) {
    const army = this._findArmy(armyId);
    if (!army) return 0;
    let power = getArmyCombatPower(army);
    if (army.heroId) {
      const hero = (this._hero?.getRecruitedHeroes?.() || []).find(entry => (entry.heroId || entry.id) === army.heroId);
      power *= hero?.bonuses?.commanderPowerMul || hero?.bonuses?.combatPowerMul || 1;
    }
    const civilizationBonuses = this._era?.getBonuses?.() || {};
    power *= (civilizationBonuses.armyPowerMul || 1) * (civilizationBonuses.civilizationYieldMul || 1);
    return Math.round(power * 100) / 100;
  }

  _findArmy(armyId) { return this._armies.find(army => army.id === armyId) || null; }

  _decorateArmy(army) {
    const hero = this._heroProfile(army);
    return {
      ...structuredClone(army),
      heroName: hero?.name || null,
      heroIcon: hero?.icon || hero?.portrait || '',
      heroPortrait: hero?.portrait || hero?.icon || '',
      cp: this.getArmyCp(army.id),
      maxCp: this.getArmyCpMax(army.id),
      healingAfterBattle: this.getArmyPostBattleHealing(army.id),
      healingPerTick: this.getArmyPostBattleHealing(army.id) / 2,
      unitCapacity: this.getArmyUnitCapacity(),
      ...this.getArmyStats(army.id)
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
      battleHistory: structuredClone(this._battleHistory),
      nextBattleId: this._nextBattleId
    };
  }

  restoreState(state) {
    const validUnits = new Set((configRegistry.get('enemies')?.units || []).map(unit => unit.id));
    this._armies = (state?.armies || []).map((army, index) => ({
      id: String(army.id || `army_${index + 1}`),
      ownerId: String(army.ownerId || 'player'),
      name: String(army.name || `第${index + 1}军团`),
      unitIds: (army.unitIds || []).filter(id => validUnits.has(id)),
      formationId: army.formationId || null,
      tacticId: army.tacticId || null,
      heroId: army.heroId || null,
      gridX: Math.floor(Number(army.gridX) || 0),
      gridY: Math.floor(Number(army.gridY) || 0),
      supply: Math.max(0, Math.min(1.25, Number(army.supply) || 1)),
      embarked: army.embarked === true,
      garrisonBuildingIndex: Number.isInteger(army.garrisonBuildingIndex) ? army.garrisonBuildingIndex : null,
      movePath: Array.isArray(army.movePath) ? structuredClone(army.movePath) : [],
      order: army.order && typeof army.order === 'object' ? structuredClone(army.order) : { type: 'hold' },
      revision: Math.max(0, Math.floor(Number(army.revision) || 0)),
      hpDamage: Math.max(0, Number(army.hpDamage) || 0),
      movementProgress: Math.max(0, Number(army.movementProgress) || 0) % 1,
      currentCp: Math.max(0, Math.floor(Number.isFinite(army.currentCp) ? army.currentCp : 1)),
      heroSkillCooldown: Math.max(0, Math.floor(Number(army.heroSkillCooldown) || 0)),
      cheatStats: army.cheatStats && typeof army.cheatStats === 'object' ? structuredClone(army.cheatStats) : null
    }));
    this._availableUnits = Object.fromEntries(Object.entries(state?.availableUnits || {}).filter(([id]) => validUnits.has(id)).map(([id, count]) => [id, Math.max(0, Math.floor(Number(count) || 0))]));
    this._nextId = Math.max(1, Math.floor(state?.nextId || this._armies.length + 1));
    this._battleHistory = Array.isArray(state?.battleHistory) ? structuredClone(state.battleHistory).slice(-20) : [];
    this._nextBattleId = Math.max(1, Math.floor(Number(state?.nextBattleId) || this._battleHistory.length + 1));
    this._resolvedBattleIds = new Set(this._battleHistory.map(record => record.id));
    this._notify('restore');
  }

  _touch(army) {
    army.revision = Math.max(0, Math.floor(Number(army.revision) || 0)) + 1;
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
