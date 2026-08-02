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
    this._spellSystem = null; // 炼金法术系统（减益：强度削减 / 倒计时冻结）
    this._totalCleared = 0;   // 累计清敌数（gameover 统计用）

    this._strategySystem = null;
    eventBus.on('dayStart', (data) => this._onDayStart(data));
  }

  setTerritorySystem(ts) { this._territorySystem = ts; }
  setBuildingSystem(bs) { this._buildingSystem = bs; }
  setSpellSystem(ss) { this._spellSystem = ss; }
  setStrategySystem(ss) { this._strategySystem = ss; }
  setHeroSystem(hs) { this._heroSystem = hs; }

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
    const avail = store.getState('availableUnits') || {};
    const units = configRegistry.get('enemies')?.units || [];
    const unitIds = Object.entries(avail)
      .flatMap(([id, count]) => Array(Math.max(0, count || 0)).fill(id));
    const base = getCounterAdjustedArmyPower(unitIds, units, opponents).adjustedPower;
    return Math.round(base * (this._heroSystem?.getBonuses?.().combatPowerMul || 1));
  }

  /** 从 availableUnits 移除总价 >= amount 的单位（便宜优先） */
  _consumeArmyPower(amount) {
    if (amount <= 0) return true;
    const avail = { ...(store.getState('availableUnits') || {}) };
    const units = configRegistry.get('enemies')?.units || [];
    const unitMap = {};
    for (const u of units) unitMap[u.id] = u;
    const ids = Object.keys(avail).filter(id => avail[id] > 0)
      .sort((a, b) => (unitMap[a]?.combatPower || 1) - (unitMap[b]?.combatPower || 1));
    let remaining = amount;
    for (const id of ids) {
      if (remaining <= 0) break;
      const cp = unitMap[id]?.combatPower || 1;
      const remove = Math.min(Math.ceil(remaining / cp), avail[id]);
      avail[id] -= remove;
      remaining -= remove * cp;
      if (avail[id] <= 0) delete avail[id];
    }
    store.setState({ availableUnits: avail, armyVersion: Date.now() });
    eventBus.emit('armyChanged', { reason: 'clearEnemy' });
    return remaining <= 0;
  }

  // ===== 日结：刷新 + 扩张 + 失败检查 =====
  _onDayStart(data) {
    const day = data?.day || store.getState('timeDay') || 1;
    const spawned = this._maybeSpawn(day);
    const expanded = this._expandStep(day);
    if (spawned || expanded) {
      eventBus.emit('enemyExpansionChanged');
      eventBus.emit('combatBroadcast', {
        message: expanded ? `👾 敌人扩张！当前 ${this._cells.size} 格` : `👾 敌人刷新（${this._cells.size} 格）`
      });
    }
    this._updateStore();
    this._checkFail();
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
      this._cells.set(this._key(x, y), {
        strength: this.getStrengthForDay(day),
        countdown: this._config?.countdownStart ?? 2
      });
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
    this._cells.set(this._key(x, y), {
      strength: this.getStrengthForDay(day),
      countdown: this._config?.countdownStart ?? 2
    });
    return true;
  }

  _expandStep(day) {
    const countdownStart = this._config?.countdownStart ?? 2;
    const strength = this.getStrengthForDay(day);
    const expanding = [];
    for (const [key, cell] of this._cells) {
      // 炼金凝滞法术：区域内敌人扩张倒计时冻结
      if (this._strategySystem) {
        const parts = key.split(',');
        const cx = parseInt(parts[0], 10);
        const cy = parseInt(parts[1], 10);
        if (this._strategySystem.isCountdownFrozen(cx, cy)) continue;
      }
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
    this._cells.set(this._key(target.x, target.y), {
      strength,
      countdown: this._config?.countdownStart ?? 2
    });
    return true;
  }

  // ===== 战斗清敌 =====
  clearEnemyCell(x, y) {
    const cell = this._cells.get(this._key(x, y));
    if (!cell) return false;
    // 炼金减益法术：区域内敌人强度被削减
    const penalty = this._strategySystem ? this._strategySystem.getStrengthPenaltyAt(x, y, cell.strength) : 0;
    const effStrength = Math.max(1, cell.strength - penalty);
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

  // ===== 查询 =====
  getCellAt(x, y) { return this._cells.get(this._key(x, y)) || null; }
  getCellCount() { return this._cells.size; }
  getTotalCleared() { return this._totalCleared; }
  getAllCells() {
    return Array.from(this._cells.entries()).map(([k, v]) => {
      const parts = k.split(',');
      return { x: parseInt(parts[0], 10), y: parseInt(parts[1], 10), ...v };
    });
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
      this._cells.set(this._key(c.x, c.y), { strength: c.strength, countdown: c.countdown });
    }
    this._updateStore();
  }
}
