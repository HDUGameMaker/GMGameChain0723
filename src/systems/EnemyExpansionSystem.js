/**
 * EnemyExpansionSystem - 敌人 x2 扩张系统（空间轴）+ 战斗清敌（数值轴）
 *
 * 设计要点（见 docs/玩法重设计-改造计划.md Phase C）：
 * - 敌人作为格子实体刷在空白格（非建筑/占术），随日推进数量增多。
 * - 每个敌人格有可见倒计时；到 0 未清 -> 向四周扩张一格（覆盖占术/整栋毁建筑）。
 * - x2：多个格同步到 0 时一起扩张，格子数翻倍。
 * - 扩张优先吃玩家领地（约束 6：可预测）。
 * - 数值轴：单格强度 = 按日期曲线 a+b*day+c*day^2（难度主旋钮）。
 * - 清敌：玩家军队总战力 vs 格强度，胜则清掉（消耗部分军队，制造数值张力）。
 * - 失败：敌人格数 >= 阈值 -> gameOver。
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';
import { getCounterAdjustedArmyPower } from './CombatResolver.js';

export class EnemyExpansionSystem {
  constructor() {
    this._cells = new Map();   // "x,y" -> { strength, countdown }
    this._config = null;
    this._mapConfig = null;
    this._territorySystem = null;
    this._buildingSystem = null;
    this._armySystem = null;
    this._spellSystem = null; // 炼金法术系统（减益：强度削减 / 倒计时冻结）
    this._totalCleared = 0;   // 累计清敌数（gameover 统计用）
    this._pendingBattles = new Set();

    eventBus.on('dayStart', (data) => this._onDayStart(data));
    eventBus.on('tick', () => this._advanceCityStateRaids());
  }

  setTerritorySystem(ts) { this._territorySystem = ts; }
  setBuildingSystem(bs) { this._buildingSystem = bs; }
  setArmySystem(as) { this._armySystem = as; }
  setSpellSystem(ss) { this._spellSystem = ss; }
  setHeroSystem(hs) { this._heroSystem = hs; }
  setLuxurySystem(ls) { this._luxurySystem = ls; }
  setBattlePreviewHandler(handler) { this._battlePreviewHandler = typeof handler === 'function' ? handler : null; }

  init() {
    this._config = configRegistry.get('enemyExpansion') || {};
    this._mapConfig = configRegistry.get('map');
  }

  initNew() {
    if (!this._config) this.init();
    this._cells = new Map();
    this._totalCleared = 0;
    this._updateStore();
  }

  _key(x, y) { return x + ',' + y; }

  _enemyProfile(cell = null) {
    const profiles = configRegistry.get('enemies')?.enemies || [];
    return profiles.find(profile => profile.id === cell?.enemyId) || profiles.find(profile => profile.strategicOnly) || profiles[0] || null;
  }

  _newEnemyCell(strength, countdown) {
    const profile = this._enemyProfile();
    return {
      strength,
      countdown,
      enemyId: profile?.id || null,
      hp: Math.max(1, Number(profile?.maxHp) || strength)
    };
  }

  spawnCityStateRaid({ outpostId, gridX, gridY, targetX, targetY, strength, enemyId = null, combatStats = null } = {}) {
    if (!this._inBounds(gridX, gridY) || !this._inBounds(targetX, targetY)) return false;
    const key = this._key(gridX, gridY);
    if (this._cells.has(key) || (this._armySystem?.getArmies?.() || []).some(army => army.gridX === gridX && army.gridY === gridY)) return false;
    const profile = this._enemyProfile({ enemyId });
    this._cells.set(key, {
      ...this._newEnemyCell(Math.max(1, Number(strength) || 1), this._config?.countdownStart ?? 2),
      enemyId: enemyId || profile?.id || null,
      raidOutpostId: outpostId || null,
      raidTargetX: targetX,
      raidTargetY: targetY,
      nonExpanding: true,
      ...(combatStats || {})
    });
    this._updateStore();
    eventBus.emit('enemyExpansionChanged');
    return true;
  }

  _advanceCityStateRaids() {
    if (this._attackArmiesInRange()) return true;
    const moves = [];
    for (const [key, cell] of this._cells) {
      if (!Number.isFinite(cell.raidTargetX) || !Number.isFinite(cell.raidTargetY)) continue;
      const [x, y] = key.split(',').map(Number);
      if (Math.abs(x - cell.raidTargetX) + Math.abs(y - cell.raidTargetY) <= 1) continue;
      const candidates = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([dx, dy]) => [x + dx, y + dy])
        .sort((left, right) => (
          Math.abs(left[0] - cell.raidTargetX) + Math.abs(left[1] - cell.raidTargetY)
        ) - (
          Math.abs(right[0] - cell.raidTargetX) + Math.abs(right[1] - cell.raidTargetY)
        ));
      const next = candidates.find(([nx, ny]) => this._inBounds(nx, ny)
        && (this._armySystem?.isLandPassableAt?.(nx, ny) ?? !['S', 'W'].includes(this._mapConfig?.grid?.[ny]?.[nx]))
        && !this._cells.has(this._key(nx, ny))
        && !(this._armySystem?.getArmies?.() || []).some(army => army.gridX === nx && army.gridY === ny));
      if (next) moves.push({ key, next, cell });
    }
    if (!moves.length) return false;
    for (const move of moves) {
      if (!this._cells.has(move.key) || this._cells.has(this._key(...move.next))) continue;
      this._cells.delete(move.key);
      this._cells.set(this._key(...move.next), move.cell);
    }
    this._attackArmiesInRange();
    this._updateStore();
    eventBus.emit('enemyExpansionChanged');
    return true;
  }

  _inBounds(x, y) {
    if (!this._mapConfig) return false;
    return x >= 0 && y >= 0 && x < this._mapConfig.gridWidth && y < this._mapConfig.gridHeight;
  }

  // ===== 数值轴：单格强度曲线 =====
  getStrengthForDay(day) {
    const c = this._config?.strengthCurve || { a: 2, b: 0.5, c: 0.02 };
    return Math.max(1, Math.round((c.a || 2) + (c.b || 0.5) * day + (c.c || 0.02) * day * day));
  }

  // ===== 军队战力（来自 availableUnits，可按敌方标签应用兵种克制） =====
  getArmyPower(opponents = []) {
    const avail = this._armySystem?.getAvailableUnits?.() || {};
    const units = configRegistry.get('enemies')?.units || [];
    const unitIds = Object.entries(avail)
      .flatMap(([id, count]) => Array(Math.max(0, count || 0)).fill(id));
    const base = getCounterAdjustedArmyPower(unitIds, units, opponents).adjustedPower;
    return Math.round(base * (this._heroSystem?.getBonuses?.().combatPowerMul || 1));
  }

  /** 从 availableUnits 移除总价 >= amount 的单位（便宜优先） */
  _consumeArmyPower(amount) {
    if (amount <= 0) return true;
    if (!this._armySystem) return false;
    const avail = this._armySystem.getAvailableUnits();
    const units = configRegistry.get('enemies')?.units || [];
    const unitMap = {};
    for (const u of units) unitMap[u.id] = u;
    const ids = Object.keys(avail).filter(id => avail[id] > 0)
      .sort((a, b) => (unitMap[a]?.combatPower || 1) - (unitMap[b]?.combatPower || 1));
    let remaining = amount;
    const consumed = {};
    for (const id of ids) {
      if (remaining <= 0) break;
      const cp = unitMap[id]?.combatPower || 1;
      const remove = Math.min(Math.ceil(remaining / cp), avail[id]);
      consumed[id] = remove;
      remaining -= remove * cp;
    }
    if (Object.keys(consumed).length > 0 && !this._armySystem.consumeReserveUnits(consumed, 'clearEnemy')) return false;
    return remaining <= 0;
  }

  // Random hostile spawning/territory expansion has been removed. This class
  // now only hosts directed raid armies dispatched by settlements and waves.
  _onDayStart() {
    this._attackArmiesInRange();
    this._updateStore();
  }

  _maybeSpawn(day) {
    const first = this._config?.firstSpawnDay ?? 3;
    if (day < first) return false;
    const interval = this._config?.spawnIntervalDays ?? 1;
    if (((day - first) % interval + interval) % interval !== 0) return false;
    const base = this._config?.spawnCountBase ?? 1;
    const perDay = this._config?.spawnCountPerDay ?? 0.5;
    const count = Math.max(1, Math.floor(base + perDay * (day - first)));
    // 每日只算一次可刷新空格列表，多次刷新复用并移除已选
    let empties = this._emptyCellsForSpawn();
    if (empties.length === 0) return false;
    let any = false;
    for (let i = 0; i < count; i++) {
      if (empties.length === 0) break;
      const idx = Math.floor(Math.random() * empties.length);
      const [x, y] = empties.splice(idx, 1)[0];
      this._cells.set(this._key(x, y), this._newEnemyCell(this.getStrengthForDay(day), this._config?.countdownStart ?? 2));
      any = true;
    }
    return any;
  }

  /**
   * 可刷新空格：全图可占领空格中未被占据的（敌人从地图随机空位生成）。
   * 不再优先玩家领地边界，让敌人散布在全图各处。
   */
  _emptyCellsForSpawn() {
    if (!this._territorySystem) return [];
    const ts = this._territorySystem;
    const empties = [];
    for (const c of ts.getClaimableCells()) {
      if (ts.isOwned(c.x, c.y)) continue;
      if (this._cells.has(this._key(c.x, c.y))) continue;
      empties.push([c.x, c.y]);
    }
    return empties;
  }

  _spawnOne(day) {
    const empties = this._emptyCellsForSpawn();
    if (empties.length === 0) return false;
    const [x, y] = empties[Math.floor(Math.random() * empties.length)];
    this._cells.set(this._key(x, y), this._newEnemyCell(this.getStrengthForDay(day), this._config?.countdownStart ?? 2));
    return true;
  }

  _expandStep(day) {
    const countdownStart = this._config?.countdownStart ?? 2;
    const strength = this.getStrengthForDay(day);
    const expanding = [];
    for (const [key, cell] of this._cells) {
      // 炼金凝滞法术：区域内敌人扩张倒计时冻结
      cell.countdown -= 1;
      if (cell.countdown <= 0) expanding.push(key);
    }
    let newCells = 0;
    const maxNew = this._config?.expansionMaxNewCells ?? 50;
    for (const key of expanding) {
      if (newCells >= maxNew) break;
      const parts = key.split(',');
      const x = parseInt(parts[0], 10);
      const y = parseInt(parts[1], 10);
      if (this._expandCell(x, y, strength)) newCells++;
      const c = this._cells.get(key);
      if (c) c.countdown = countdownStart;
    }
    return newCells > 0;
  }

  /** 一个敌人格向四周扩张一格；优先吃玩家领地，其次空格 */
  _expandCell(x, y, strength) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const candidates = [];
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (!this._inBounds(nx, ny)) continue;
      if (this._cells.has(this._key(nx, ny))) continue;
      const isPlayer = this._territorySystem ? this._territorySystem.isOwned(nx, ny) : false;
      candidates.push({ x: nx, y: ny, isPlayer });
    }
    if (candidates.length === 0) return false;
    candidates.sort((a, b) => (b.isPlayer ? 1 : 0) - (a.isPlayer ? 1 : 0));
    const target = candidates[0];

    // 覆盖：抹占术 / 整栋毁建筑
    if (this._territorySystem) {
      if (this._territorySystem.isPossession(target.x, target.y)) {
        this._territorySystem.removePossession(target.x, target.y);
      } else if (this._territorySystem.isBuildingCell(target.x, target.y) && this._buildingSystem) {
        const idx = this._buildingSystem.getBuildingIndexAt(target.x, target.y);
        if (idx >= 0) {
          const bCfg = configRegistry.getBuilding(this._buildingSystem.buildings[idx]?.buildingId);
          this._buildingSystem.demolishBuilding(idx, true);
          // 大本营被敌人占领 -> 失败
          if (bCfg?.isHeadquarters) {
            eventBus.emit('gameOver', { win: false, reason: 'hqLost' });
          }
        }
      }
    }
    this._cells.set(this._key(target.x, target.y), this._newEnemyCell(strength, this._config?.countdownStart ?? 2));
    return true;
  }

  // ===== 战斗清敌 =====
  clearEnemyCell(x, y) {
    const cell = this._cells.get(this._key(x, y));
    if (!cell) return false;
    // 炼金减益法术：区域内敌人强度被削减
    const effStrength = Math.max(1, cell.strength);
    const opponents = cell.roleTags ? [{ domain: cell.domain || 'land', roleTags: cell.roleTags }] : [];
    const power = this.getArmyPower(opponents);
    if (power < effStrength) {
      eventBus.emit('combatBroadcast', { message: `⚔️ 军队战力不足（${power} < ${effStrength}），需训练更多士兵` });
      return false;
    }
    const loss = effStrength * (this._config?.clearLossRate ?? 0.5);
    this._consumeArmyPower(loss);
    this._cells.delete(this._key(x, y));
    this._totalCleared++;
    this._updateStore();
    eventBus.emit('enemyExpansionChanged');
    eventBus.emit('combatBroadcast', { message: `⚔️ 清除敌人（损耗约 ${Math.round(loss)} 战力）` });
    return true;
  }

  clearEnemyCellWithArmy(x, y, armyId) {
    const cell = this._cells.get(this._key(x, y));
    if (!cell) return { ok: false, reason: 'enemy_unavailable' };
    const army = this._armySystem?.getArmy?.(armyId);
    if (!army) return { ok: false, reason: 'unknown_army' };
    const cp = this._armySystem?.consumeAttackCp?.(armyId);
    if (cp && !cp.ok) return cp;
    return this._resolveCellBattle(x, y, armyId, false);
  }

  _resolveCellBattle(x, y, armyId, enemyInitiated) {
    const cell = this._cells.get(this._key(x, y));
    const army = this._armySystem?.getArmy?.(armyId);
    if (!cell) return { ok: false, reason: 'enemy_unavailable' };
    if (!army?.unitIds?.length) return { ok: false, reason: 'unknown_army' };
    const profile = this._enemyProfile(cell) || {};
    const armyStats = this._armySystem.getArmyStats?.(armyId) || army;
    const enemyStats = {
      attack: Math.max(0, Number(cell.attack) || Number(profile.attack) || cell.strength || 1),
      attackRange: Math.max(0, Math.floor(Number(cell.attackRange) || Number(profile.attackRange) || 1)),
      speed: Math.max(0, Number(cell.speed) || Number(profile.speed) || 1),
      cp: Math.max(1, Math.floor(Number(cell.cp) || Number(profile.cp) || 1))
    };
    const distance = Math.abs(army.gridX - x) + Math.abs(army.gridY - y);
    const playerCanAttack = distance <= (armyStats.attackRange || 0);
    const enemyCanAttack = distance <= enemyStats.attackRange;
    if ((!enemyInitiated && !playerCanAttack) || (enemyInitiated && !enemyCanAttack)) {
      return { ok: false, reason: 'target_out_of_range', distance, attackRange: enemyInitiated ? enemyStats.attackRange : armyStats.attackRange };
    }
    const turns = playerCanAttack && enemyCanAttack
      ? (enemyStats.speed > armyStats.speed ? ['enemy', 'player'] : ['player', 'enemy'])
      : (playerCanAttack ? ['player'] : ['enemy']);
    const attacks = [];
    for (const side of turns) {
      if (side === 'player') {
        if (!this._armySystem.getArmy?.(armyId)?.unitIds?.length || cell.hp <= 0) continue;
        const damage = Math.min(cell.hp, Math.max(0, Number(armyStats.attack) || 0));
        cell.hp -= damage;
        attacks.push({ side, damage });
        this._armySystem._applyHeroActiveAttackLifesteal?.(armyId, damage);
        if (cell.hp <= 0) break;
      } else {
        if (cell.hp <= 0 || !this._armySystem.getArmy?.(armyId)?.unitIds?.length) continue;
        const damage = this._armySystem.applyDamage?.(armyId, enemyStats.attack);
        attacks.push({ side, damage: enemyStats.attack });
        if (damage?.destroyed) break;
      }
    }
    if (playerCanAttack && enemyCanAttack && cell.hp > 0 && this._armySystem.getArmy?.(armyId)?.unitIds?.length) {
      if (armyStats.speed - enemyStats.speed >= 2) {
        const damage = Math.min(cell.hp, Math.max(0, Number(armyStats.attack) || 0));
        cell.hp -= damage;
        attacks.push({ side: 'player', damage, bonusStrike: true });
        this._armySystem._applyHeroActiveAttackLifesteal?.(armyId, damage);
      } else if (enemyStats.speed - armyStats.speed >= 2) {
        const damage = this._armySystem.applyDamage?.(armyId, enemyStats.attack);
        attacks.push({ side: 'enemy', damage: enemyStats.attack, bonusStrike: true });
        if (damage?.destroyed) cell.hp = Math.max(0, cell.hp);
      }
    }
    const enemyDefeated = cell.hp <= 0;
    if (enemyDefeated) {
      this._cells.delete(this._key(x, y));
      this._totalCleared += 1;
      eventBus.emit('enemyDefeated', { x, y, enemyId: cell.enemyId || cell.profileId || null });
      const luxuries = configRegistry.getHistoricalContent?.().luxuries || [];
      const roll = ((x * 31 + y * 17 + this._totalCleared * 13) % 100) / 100;
      const luxury = roll < 0.05 ? luxuries[(x * 7 + y * 11) % Math.max(1, luxuries.length)] : null;
      if (luxury) this._luxurySystem?.addLuxury?.(luxury.id, 1);
      if (luxury) eventBus.emit('combatBroadcast', { message: `战利品：获得 ${luxury.name || luxury.id} ×1` });
    }
    const healed = this._armySystem.getArmy?.(armyId) ? (this._armySystem.healArmyAfterBattle?.(armyId)?.healed || 0) : 0;
    this._updateStore();
    eventBus.emit('enemyExpansionChanged');
    eventBus.emit('combatBroadcast', { message: enemyDefeated ? `⚔️ ${army.name || '军团'}击败${profile.name || '敌军'}` : `⚔️ ${army.name || '军团'}与${profile.name || '敌军'}交锋` });
    return { ok: true, enemyDefeated, enemyHp: Math.max(0, cell.hp), attacks, healed, distance };
  }

  _attackArmiesInRange() {
    const armies = (this._armySystem?.getArmies?.() || []).filter(army => army.ownerId === 'player' && army.unitIds?.length);
    for (const enemy of this.getAllCells()) {
      const range = Math.max(0, Math.floor(Number(enemy.attackRange) || 1));
      const target = armies
        .map(army => ({ army, distance: Math.abs(army.gridX - enemy.x) + Math.abs(army.gridY - enemy.y) }))
        .filter(entry => entry.distance <= range)
        .sort((left, right) => left.distance - right.distance)[0];
      if (target) {
        const key = `${enemy.x},${enemy.y}:${target.army.id}`;
        if (this._pendingBattles.has(key)) continue;
        if (!this._battlePreviewHandler) this._resolveCellBattle(enemy.x, enemy.y, target.army.id, true);
        else {
          this._pendingBattles.add(key);
          const playerStats = this._armySystem.getArmyStats?.(target.army.id) || {};
          Promise.resolve(this._battlePreviewHandler({
            enemy,
            player: { ...target.army, ...playerStats, portrait: target.army.heroPortrait || target.army.heroIcon || target.army.icon },
            distance: target.distance,
            resolveBattle: () => this._resolveCellBattle(enemy.x, enemy.y, target.army.id, true)
          })).finally(() => this._pendingBattles.delete(key));
          return true;
        }
        return true;
      }

      const buildingTargets = (this._buildingSystem?.buildings || []).map((building, buildingIndex) => {
        const config = configRegistry.getBuilding(building.buildingId);
        const right = building.gridX + (config?.footprint?.width || 1) - 1;
        const bottom = building.gridY + (config?.footprint?.height || 1) - 1;
        const dx = Math.max(0, building.gridX - enemy.x, enemy.x - right);
        const dy = Math.max(0, building.gridY - enemy.y, enemy.y - bottom);
        return { building, buildingIndex, distance: dx + dy };
      }).filter(entry => entry.building.status === 'active' && entry.distance <= range)
        .sort((left, right) => left.distance - right.distance);
      const targetBuilding = buildingTargets[0];
      if (!targetBuilding) continue;
      const key = `${enemy.x},${enemy.y}:building:${targetBuilding.building.instanceId}`;
      if (this._pendingBattles.has(key)) continue;
      const playerModel = this._buildingSystem.getBuildingCombatModel?.(targetBuilding.buildingIndex);
      const resolveBattle = () => {
        const currentIndex = this._buildingSystem.buildings.findIndex(item => item.instanceId === targetBuilding.building.instanceId);
        if (currentIndex < 0) return { ok: false, reason: 'building_unavailable' };
        return this._buildingSystem.damageBuilding(currentIndex, Math.max(0, Number(enemy.attack) || 0));
      };
      if (!this._battlePreviewHandler) resolveBattle();
      else {
        this._pendingBattles.add(key);
        Promise.resolve(this._battlePreviewHandler({ enemy, player: playerModel, distance: targetBuilding.distance, buildingDefense: true, resolveBattle }))
          .finally(() => this._pendingBattles.delete(key));
      }
      return true;
    }
    return false;
  }

  // ===== 查询 =====
  getCellAt(x, y) { return this._cells.get(this._key(x, y)) || null; }
  damageCellAt(x, y, amount) {
    const key = this._key(x, y), cell = this._cells.get(key);
    if (!cell) return { ok: false };
    cell.hp = Math.max(0, (cell.hp ?? cell.strength) - Math.max(0, Number(amount) || 0));
    if (cell.hp <= 0) this._cells.delete(key);
    this._updateStore(); eventBus.emit('enemyExpansionChanged');
    return { ok: true, destroyed: cell.hp <= 0, hp: cell.hp };
  }
  getCellCount() { return this._cells.size; }
  getTotalCleared() { return this._totalCleared; }
  removeRaidsByOutpost(outpostId) {
    let removed = 0;
    for (const [key, cell] of [...this._cells.entries()]) {
      if (cell.raidOutpostId !== outpostId) continue;
      this._cells.delete(key);
      removed += 1;
    }
    if (removed > 0) {
      this._updateStore();
      eventBus.emit('enemyExpansionChanged');
    }
    return removed;
  }
  getAllCells() {
    return Array.from(this._cells.entries()).map(([k, v]) => {
      const parts = k.split(',');
      const profile = this._enemyProfile(v) || {};
      return {
        x: parseInt(parts[0], 10), y: parseInt(parts[1], 10), ...v,
        name: profile.name || '敌方部队', icon: profile.icon || '', faction: profile.faction || '敌对势力',
        maxHp: Math.max(1, Number(v.maxHp) || Number(profile.maxHp) || v.strength || 1),
        hp: Math.max(0, Number.isFinite(Number(v.hp)) ? Number(v.hp) : (Number(v.maxHp) || Number(profile.maxHp) || v.strength || 1)),
        attack: Math.max(0, Number(v.attack) || Number(profile.attack) || v.strength || 1),
        attackRange: Math.max(0, Math.floor(Number(v.attackRange) || Number(profile.attackRange) || 1)),
        speed: Math.max(0, Number(v.speed) || Number(profile.speed) || 1), cp: Math.max(1, Math.floor(Number(v.cp) || Number(profile.cp) || 1))
      };
    });
  }

  corruptCovered(predicate) {
    let changed = false;
    for (const key of [...this._cells.keys()]) {
      const [x, y] = key.split(',').map(Number);
      if (!predicate(x, y)) continue;
      this._cells.delete(key); changed = true;
    }
    if (changed) { this._updateStore(); eventBus.emit('enemyExpansionChanged'); }
  }

  _checkFail() {
    const total = this._territorySystem ? this._territorySystem.getClaimableCount() : 0;
    if (total <= 0) return;
    const ratio = this._config?.failThresholdRatio ?? 0.5;
    if (this._cells.size / total >= ratio) {
      eventBus.emit('gameOver', { win: false, reason: 'overwhelmed' });
    }
  }

  _updateStore() {
    const total = this._territorySystem ? this._territorySystem.getClaimableCount() : 0;
    store.setState({
      enemyCellCount: this._cells.size,
      enemyClaimableTotal: total,
      enemyFailRatio: this._config?.failThresholdRatio ?? 0.5,
      enemyFailThreshold: this._config?.failThresholdCells ?? 40, // 休眠保留（旧字段）
      enemyStrengthToday: this.getStrengthForDay(store.getState('timeDay') || 1),
      enemyExpansionVersion: Date.now()
    });
  }

  // ===== 存档 =====
  getState() {
    const cells = this.getAllCells();
    return { cells, totalCleared: this._totalCleared };
  }

  restoreState(state) {
    if (!this._config) this.init();
    if (!state) { this.initNew(); return; }
    this._cells = new Map();
    this._totalCleared = state.totalCleared ?? 0;
    for (const c of (state.cells || [])) {
      if (!Number.isFinite(c.raidTargetX) || !Number.isFinite(c.raidTargetY)) continue;
      const { x, y, name: _name, icon: _icon, faction: _faction, ...cell } = c;
      this._cells.set(this._key(x, y), { ...cell, enemyId: c.enemyId || null, hp: c.hp ?? c.maxHp ?? c.strength });
    }
    this._updateStore();
  }
}
