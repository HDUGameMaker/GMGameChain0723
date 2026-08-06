/**
 * PathfindingSystem - 共享 BFS 寻路系统
 *
 * 玩家军团与敌人统一从这里获取路径。路径只受"地形 + 建筑"影响,
 * 单位占格在移动时实时校验(等待/绕行由调用方处理),不参与缓存。
 *
 * 缓存失效规则(2026-08-06 与策划确认):
 * - 新建普通建筑:检查其占地格,仅重算被挡住(路径经过该格)的缓存路径
 * - 新建桥梁(passable 建筑):桥梁会"打开"新路线,重算全部缓存路径
 * - 拆除建筑:同样会打开新路线,重算全部
 * - 其他情况(单位移动、敌人增删、时间流逝)不重算
 *
 * 目标格允许不可通行(如敌人突袭目标是玩家大本营建筑格):
 * BFS 中目标格始终可进入,路径走到"贴脸"为止由调用方决定停步。
 */
import { eventBus } from '../core/EventBus.js';

const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // 右/下/左/上

export class PathfindingSystem {
  constructor() {
    this._map = null;
    this._buildingSystem = null;
    this._configRegistry = null;
    this._hostileBuildingProvider = null; // (x, y) => boolean,由主程序注入(城邦敌对建筑)
    this._version = 0;
    this._pathCache = new Map(); // "sx,sy->tx,ty" -> { cells, version }
  }

  setMap(map) {
    this._map = map;
    this.invalidateAll();
  }

  setContext({ buildingSystem, configRegistry }) {
    this._buildingSystem = buildingSystem || null;
    this._configRegistry = configRegistry || null;
  }

  /** 敌对建筑判定提供者(城邦系统);未注入则忽略敌对建筑 */
  setHostileBuildingProvider(provider) {
    this._hostileBuildingProvider = typeof provider === 'function' ? provider : null;
  }

  getVersion() { return this._version; }

  /* ===== 地形与建筑判定 ===== */

  _groundAt(x, y) { return this._map?.grid?.[y]?.[x] || null; }

  _hasBridgeAt(x, y) {
    if (!this._buildingSystem) return false;
    return (this._buildingSystem.buildings || []).some(building => {
      const config = this._configRegistry?.getBuilding?.(building.buildingId);
      return config?.passable === true && building.gridX === x && building.gridY === y;
    });
  }

  _isWaterCell(x, y) {
    return ['S', 'W'].includes(this._groundAt(x, y)) && !this._hasBridgeAt(x, y);
  }

  _isBuildingBlocked(x, y) {
    if (this._hostileBuildingProvider?.(x, y)) return true;
    if (!this._buildingSystem) return false;
    return (this._buildingSystem.buildings || []).some(building => {
      const config = this._configRegistry?.getBuilding?.(building.buildingId);
      if (config?.passable === true) return false;
      const width = Math.max(1, Math.floor(Number(config?.footprint?.width) || 1));
      const height = Math.max(1, Math.floor(Number(config?.footprint?.height) || 1));
      return x >= building.gridX && x < building.gridX + width
        && y >= building.gridY && y < building.gridY + height;
    });
  }

  _isPassableLand(x, y) {
    return Boolean(this._groundAt(x, y)) && !this._isWaterCell(x, y) && !this._isBuildingBlocked(x, y);
  }

  _isPassableNaval(x, y) { return this._isWaterCell(x, y); }

  _isPassableForRule(rule, x, y, startX, startY) {
    if (rule === 'land') return this._isPassableLand(x, y);
    if (rule === 'naval') return this._isPassableNaval(x, y);
    if (rule === 'embarked') return this._isWaterCell(x, y) || (x === startX && y === startY);
    return this._isPassableLand(x, y);
  }

  /* ===== 寻路 ===== */

  /**
   * 求 (startX, startY) -> (targetX, targetY) 的最短路径(含起终点)。
   * @param {{rule?: 'land'|'naval'|'embarked', avoidUnits?: Array}} [options]
   *   rule 默认 land;avoidUnits 提供时(如玩家军团避开友军)不做缓存,每格排除这些单位的占位。
   * @returns {Array<{x:number,y:number}>} 不可达返回 []
   */
  findPath(startX, startY, targetX, targetY, options = {}) {
    const rule = options.rule || 'land';
    const avoidUnits = options.avoidUnits || null;
    const map = this._map;
    if (!map?.grid) return [];
    if (startX === targetX && startY === targetY) return [];

    if (!avoidUnits && (rule === 'land' || rule === 'naval')) {
      const cacheKey = `${startX},${startY}->${targetX},${targetY}`;
      const cached = this._pathCache.get(cacheKey);
      if (cached && cached.version === this._version) return cached.cells;
      const cells = this._bfs(startX, startY, targetX, targetY, rule, null);
      this._pathCache.set(cacheKey, { cells, version: this._version });
      return cells;
    }

    return this._bfs(startX, startY, targetX, targetY, rule, avoidUnits);
  }

  _bfs(startX, startY, targetX, targetY, rule, avoidUnits) {
    const map = this._map;
    const startKey = `${startX},${startY}`;
    const targetKey = `${targetX},${targetY}`;
    const queue = [[startX, startY]];
    let cursor = 0;
    const previous = new Map([[startKey, null]]);
    const avoid = new Set((avoidUnits || []).map(unit => `${unit.gridX},${unit.gridY}`));

    while (cursor < queue.length) {
      const [x, y] = queue[cursor++];
      const key = `${x},${y}`;
      if (key === targetKey) break;
      for (const [dx, dy] of DIRECTIONS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= map.gridWidth || ny >= map.gridHeight) continue;
        const nKey = `${nx},${ny}`;
        if (previous.has(nKey)) continue;
        // 目标格始终可进入(可为建筑/水面);其余格按规则判定
        if (nKey !== targetKey) {
          if (avoid.has(nKey)) continue;
          if (!this._isPassableForRule(rule, nx, ny, startX, startY)) continue;
        }
        previous.set(nKey, [x, y]);
        queue.push([nx, ny]);
      }
    }
    if (!previous.has(targetKey)) return [];
    // 回溯重建路径:排除起点自身(调用方直接消费第一步即可移动)
    const path = [];
    let currentKey = targetKey;
    while (currentKey && currentKey !== startKey) {
      const [px, py] = currentKey.split(',').map(Number);
      path.unshift({ x: px, y: py });
      const prev = previous.get(currentKey);
      currentKey = prev ? `${prev[0]},${prev[1]}` : null;
    }
    return path;
  }

  /* ===== 缓存失效 ===== */

  /** 新建普通建筑:仅重算路径经过其占地格的缓存 */
  invalidateBlockingCells(cells) {
    if (!cells || cells.length === 0) return;
    this._version++;
    const blocked = new Set(cells.map(([x, y]) => `${x},${y}`));
    for (const [cacheKey, entry] of this._pathCache) {
      if (entry.cells.some(cell => blocked.has(`${cell.x},${cell.y}`))) {
        this._pathCache.delete(cacheKey);
      }
    }
  }

  /** 桥梁建成 / 建筑拆除:打开新路线,重算全部缓存 */
  invalidateAll() {
    this._version++;
    this._pathCache.clear();
  }

  /* ===== 事件接线 ===== */

  _onBuildingPlaced(building) {
    if (!building) return;
    const config = this._configRegistry?.getBuilding?.(building.buildingId);
    if (config?.passable === true) {
      this.invalidateAll(); // 桥梁:打开新路线
      return;
    }
    const width = Math.max(1, Math.floor(Number(config?.footprint?.width) || 1));
    const height = Math.max(1, Math.floor(Number(config?.footprint?.height) || 1));
    const cells = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        cells.push([building.gridX + x, building.gridY + y]);
      }
    }
    this.invalidateBlockingCells(cells); // 普通建筑:仅挡路的路径重算
  }

  _onBuildingDemolished() {
    this.invalidateAll(); // 拆除:打开新路线
  }

  bindEvents() {
    eventBus.on('buildingPlaced', (data) => this._onBuildingPlaced(data?.building));
    eventBus.on('buildingDemolished', () => this._onBuildingDemolished());
  }
}
