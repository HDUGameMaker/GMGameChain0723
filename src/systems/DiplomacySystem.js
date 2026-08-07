import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';
import { createCityStateDevelopment } from '../domain/CityStateGeneration.js';
import { makePowerScaleBuff, applyEnemyBuffs } from '../domain/EnemyBuffs.js';
import { getTickInterval } from '../utils/gameTime.js';

const BASIC_ACTIONS = new Set(['talk', 'gift', 'aid']);
const TREATY_ACTIONS = new Set(['ceasefire', 'trade', 'open_borders', 'non_aggression', 'joint_patrol', 'alliance']);
const EXPANDING_STATUSES = new Set(['hostile', 'wary']);

/**
 * 固定城邦外交。城邦不使用玩家的科技、人口与建筑循环，仅保留驻军、关系、条约和有限领地扩张。
 */
export class DiplomacySystem {
  constructor() {
    this._states = {};
    this._resourceSystem = null;
    this._cultureSystem = null;
    this._heroSystem = null;
    this._luxurySystem = null;
    this._eraSystem = null;
    this._resourceNodeSystem = null;
    this._armySystem = null;
    this._enemyExpansionSystem = null;
    this._factionRelations = {};
    this._lastProcessedDay = 0;
    this._battleLog = null;
    // 帧级驻军推进侧表(内存,不持久化):armyId -> { moveProgress, attackCooldown }
    this._garrisonMotion = new Map();
    eventBus.on('dayStart', ({ day } = {}) => this.advanceDay(day || 1));
    eventBus.on('eraAdvanced', () => this._syncEraDevelopment());
  }

  setSystems(systems = {}) {
    if (systems.resource) this._resourceSystem = systems.resource;
    if (systems.culture) this._cultureSystem = systems.culture;
    if (systems.hero) this._heroSystem = systems.hero;
    if (systems.luxury) this._luxurySystem = systems.luxury;
    if (systems.era) this._eraSystem = systems.era;
    if (systems.resourceNodes) this._resourceNodeSystem = systems.resourceNodes;
    if (systems.army) this._armySystem = systems.army;
    if (systems.enemyExpansion) this._enemyExpansionSystem = systems.enemyExpansion;
  }

  setBattleLogSystem(bl) { this._battleLog = bl || null; }

  /** 军团连续渲染坐标(旧存档无 renderX 时回落格点),距离判定用 */
  _armyX(army) { return Number.isFinite(army?.renderX) ? army.renderX : (army?.gridX ?? 0); }
  _armyY(army) { return Number.isFinite(army?.renderY) ? army.renderY : (army?.gridY ?? 0); }

  get _config() {
    const integration = configRegistry.get('eaIntegration') || {};
    const world = configRegistry.get('worldFactions') || {};
    const positions = new Map((configRegistry.get('map')?.spawnManifest?.cityStates || []).map(item => [item.id, item]));
    const map = configRegistry.get('map') || {};
    const cacheKey = `${map.mapId || ''}:${map.gridWidth || 0}x${map.gridHeight || 0}:${map.generationChecksum || ''}:${JSON.stringify(world.cityStateGeneration || {})}`;
    if (this._configCache?.key === cacheKey) return this._configCache.value;
    const templates = [...(integration.outposts || []), ...(world.cityStates || [])].map(outpost => ({
      ...outpost,
      ...(positions.get(outpost.id) || {})
    }));
    const candidates = templates.filter(outpost => !map.grid?.length || [
      map.grid?.[outpost.gridY]?.[outpost.gridX], map.grid?.[outpost.gridY]?.[outpost.gridX + 1],
      map.grid?.[outpost.gridY + 1]?.[outpost.gridX], map.grid?.[outpost.gridY + 1]?.[outpost.gridX + 1]
    ].every(cell => cell && !['S', 'W'].includes(cell)));
    const landCount = (map.grid || []).reduce((sum, row) => sum + [...row].filter(cell => !['S', 'W'].includes(cell)).length, 0);
    const settings = world.cityStateGeneration || {};
    if (landCount <= 0) {
      const value = { actions: integration.outpostActions || {}, outposts: candidates, settings };
      this._configCache = { key: cacheKey, value };
      return value;
    }
    const requestedCount = Math.max(1, Math.round(landCount * (Number(settings.spawnDensity) || 0.0006)));
    const count = Math.min(Math.max(1, Math.floor(Number(settings.maxCityStates) || 256)), requestedCount);
    const result = [];
    if (map.grid?.length) {
      const occupied = [];
      const spawn = map.initialBuildings?.[0] || { gridX: -100, gridY: -100 };
      const width = Number(map.gridWidth) || map.grid[0]?.length || 0;
      const height = Number(map.gridHeight) || map.grid.length;
      const columns = Math.max(1, Math.ceil(Math.sqrt(count * width / Math.max(1, height))));
      const rows = Math.max(1, Math.ceil(count / columns));
      for (let slot = 0; slot < columns * rows && result.length < count; slot += 1) {
        const column = slot % columns, row = Math.floor(slot / columns);
        const cx = Math.floor((column + 0.5) * width / columns), cy = Math.floor((row + 0.5) * height / rows);
        const template = templates[result.length % Math.max(1, templates.length)] || {};
        const number = result.length + 1;
        const id = number <= templates.length ? template.id : `generated_city_state_${number}`;
        // R3b: 生成城邦可被 spawnManifest 固定位置(用于把城邦挪到指定地点,如河/山地形改造后)。
        // 只对生成城邦生效,模板城邦仍走网格搜索;pinned 位置无效则跳过该槽位(不回落搜索)。
        const pinned = /^generated_city_state_/.test(id) ? positions.get(id) : null;
        let target = null;
        if (pinned && Number.isFinite(pinned.gridX) && Number.isFinite(pinned.gridY)) {
          const px = pinned.gridX, py = pinned.gridY;
          const isLand4 = [map.grid[py]?.[px], map.grid[py]?.[px + 1], map.grid[py + 1]?.[px], map.grid[py + 1]?.[px + 1]]
            .every(cell => cell && !['S', 'W'].includes(cell));
          // 人工固定位置只做最小 4 格防重叠检查(网格密度阈值对人工选址过严)
          const spaced = !occupied.some(cell => Math.max(Math.abs(cell.x - px), Math.abs(cell.y - py)) < 4);
          if (px >= 0 && py >= 0 && px + 1 < width && py + 1 < height && isLand4 && spaced) target = { x: px, y: py };
        }
        if (!target) {
          const radiusLimit = Math.ceil(Math.max(width / columns, height / rows) * 4);
          for (let radius = 0; radius <= radiusLimit && !target; radius += 1) for (let dy = -radius; dy <= radius && !target; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
            const x = cx + dx, y = cy + dy;
            if (x < 0 || y < 0 || x + 1 >= width || y + 1 >= height) continue;
            if (Math.abs(x - spawn.gridX) + Math.abs(y - spawn.gridY) < 10) continue;
            if (![map.grid[y]?.[x], map.grid[y]?.[x + 1], map.grid[y + 1]?.[x], map.grid[y + 1]?.[x + 1]].every(cell => cell && !['S', 'W'].includes(cell))) continue;
            if (occupied.some(cell => Math.max(Math.abs(cell.x - x), Math.abs(cell.y - y)) < Math.max(4, Math.floor(Math.min(width / columns, height / rows) * 0.45)))) continue;
            target = { x, y };
          }
        }
        if (!target) continue;
        result.push({ ...template, id, name: number <= templates.length ? template.name : `${template.name || '敌对城邦'} ${number}`, gridX: target.x, gridY: target.y });
        occupied.push(target);
      }
    }
    const value = { actions: integration.outpostActions || {}, outposts: result, settings };
    this._configCache = { key: cacheKey, value };
    return value;
  }

  getAllOutposts() { return this._config.outposts; }
  getVisibleOutposts() { return this.getAllOutposts().filter(outpost => this._states[outpost.id]?.active).map(outpost => ({ ...outpost, width: 2, height: 2 })); }
  getOutpost(id) { return this.getAllOutposts().find(outpost => outpost.id === id) || null; }

  isHostileBuildingAt(x, y) {
    return Object.values(this._states).some(state => !['defeated', 'corrupted'].includes(state.status) && ((state.armies || []).some(army => army.x === x && army.y === y) || (state.buildings || []).some(building => {
      if (!Number.isFinite(building.x) || !Number.isFinite(building.y)) return false;
      const width = Math.max(1, building.width || 1), height = Math.max(1, building.height || 1);
      return x >= building.x && x < building.x + width && y >= building.y && y < building.y + height;
    })));
  }

  getCityStateAt(x, y) {
    for (const outpost of this.getAllOutposts()) {
      const state = this._states[outpost.id];
      if (!state?.active) continue;
      const building = (state.buildings || []).find(item => {
        const width = Math.max(1, item.width || 1), height = Math.max(1, item.height || 1);
        return Number.isFinite(item.x) && Number.isFinite(item.y)
          && x >= item.x && x < item.x + width && y >= item.y && y < item.y + height;
      });
      if (building) return { outpost, state: structuredClone(state), building: structuredClone(building) };
      const army = (state.armies || []).find(item => item.x === x && item.y === y);
      if (army) return { outpost, state: structuredClone(state), army: structuredClone(army) };
    }
    return null;
  }

  initNew() {
    this._states = {};
    this._factionRelations = {};
    this._lastProcessedDay = 0;
    this._garrisonMotion.clear();
    for (const outpost of this.getAllOutposts()) this._states[outpost.id] = this._makeInitialState(outpost);
    this._syncEraDevelopment(false);
    this._syncLuxuryResourceNodes();
    this._notify();
  }

  _makeInitialState(outpost) {
    const relation = -100;
    const development = this._buildDevelopment(outpost);
    const controlledCells = this._claimLandArea(outpost, development.area);
    this._placeDevelopment(development, controlledCells, outpost);
    return {
      relation,
      status: 'hostile',
      discovered: false,
      interactions: 0,
      active: true,
      activatedDay: 1,
      lastExpansionDay: null,
      controlledCells,
      treaties: [],
      currentEraId: this._eraSystem?.getCurrentEra?.()?.id || 'primitive',
      developmentLevel: (this._eraSystem?.getCurrentEra?.()?.order || 0) + 1,
      garrisonTier: development.level,
      generationSignature: this._generationSignature(),
      ...development
    };
  }

  _placeDevelopment(development, cells, outpost) {
    const allowed = new Set(cells.map(cell => `${cell.x},${cell.y}`));
    const occupied = new Set();
    const occupy = (x, y, width, height) => {
      for (let dy = 0; dy < height; dy += 1) for (let dx = 0; dx < width; dx += 1) occupied.add(`${x + dx},${y + dy}`);
    };
    const fits = (x, y, width, height) => {
      for (let dy = 0; dy < height; dy += 1) for (let dx = 0; dx < width; dx += 1) {
        const key = `${x + dx},${y + dy}`;
        if (!allowed.has(key) || occupied.has(key)) return false;
      }
      return true;
    };
    const headquarters = development.buildings?.[0];
    if (headquarters) {
      Object.assign(headquarters, { x: outpost.gridX, y: outpost.gridY, width: 2, height: 2, headquarters: true });
      occupy(outpost.gridX, outpost.gridY, 2, 2);
    }
    // South side keeps a two-cell gate so melee armies can reach the headquarters.
    const ring = [[-1,-1],[0,-1],[1,-1],[2,-1],[-1,0],[2,0],[-1,1],[2,1],[-1,2],[2,2]];
    (development.buildings || []).filter(building => building.defensive).forEach((wall, index) => {
      const [dx, dy] = ring[index];
      const x = outpost.gridX + dx, y = outpost.gridY + dy;
      if (fits(x, y, 1, 1)) { Object.assign(wall, { x, y, width: 1, height: 1 }); occupy(x, y, 1, 1); }
    });
    for (const building of (development.buildings || []).filter(item => !item.headquarters && !item.defensive)) {
      const config = configRegistry.getBuilding?.(building.buildingId) || {};
      const width = Math.max(1, Math.floor(Number(config.footprint?.width) || 1));
      const height = Math.max(1, Math.floor(Number(config.footprint?.height) || 1));
      const target = cells.find(cell => fits(cell.x, cell.y, width, height));
      if (!target) continue;
      Object.assign(building, { x: target.x, y: target.y, width, height });
      occupy(target.x, target.y, width, height);
    }
    const freeCells = cells.filter(cell => !occupied.has(`${cell.x},${cell.y}`));
    // Reserve resource tiles before placing armies. Previously armies could use
    // every free tile, leaving luxury deposits without x/y coordinates; those
    // missing coordinates became NaN and prevented every subsequent autosave.
    const requestedDeposits = development.luxuryDeposits || [];
    const luxuryCells = freeCells.slice(-Math.min(requestedDeposits.length, freeCells.length));
    const reservedLuxuryCells = new Set(luxuryCells.map(cell => `${cell.x},${cell.y}`));
    const armyCandidates = freeCells.filter(cell => !reservedLuxuryCells.has(`${cell.x},${cell.y}`));
    const distanceToBuilding = cell => Math.min(...[...occupied].map(key => {
      const [x, y] = key.split(',').map(Number);
      return Math.abs(cell.x - x) + Math.abs(cell.y - y);
    }));
    const armyCells = [...armyCandidates].sort((a, b) => distanceToBuilding(a) - distanceToBuilding(b));
    development.armies = (development.armies || []).map((army, index) => {
      const positioned = { ...army, ...(armyCells[index] || {}), homeX: armyCells[index]?.x, homeY: armyCells[index]?.y };
      const stats = this._garrisonStats(positioned);
      return { ...positioned, ...stats, hp: stats.maxHp };
    }).filter(army => Number.isFinite(army.x) && Number.isFinite(army.y));
    development.luxuryDeposits = requestedDeposits
      .slice(0, luxuryCells.length)
      .map((deposit, index) => ({ ...deposit, x: luxuryCells[index].x, y: luxuryCells[index].y }));
    return development;
  }

  _generationSignature() {
    const settings = this._config.settings || {};
    return JSON.stringify(['spawnDensity', 'maxLevel', 'minEnemyStrength', 'maxEnemyStrength', 'minArea', 'maxArea', 'eraStrengthMultiplier']
      .map(key => [key, Number(settings[key]) || 0]));
  }

  _buildDevelopment(outpost, levelBonus = 0) {
    const historical = configRegistry.getHistoricalContent?.() || {};
    return createCityStateDevelopment({
      outpost,
      map: configRegistry.get('map') || {},
      eras: historical.eras || [],
      buildings: configRegistry.getAllBuildings?.() || [],
      units: configRegistry.get('enemies')?.units || [],
      luxuries: historical.luxuries || [],
      playerEraOrder: this._eraSystem?.getCurrentEra?.()?.order || 0,
      settings: { ...this._config.settings, levelBonus },
      playerPowerBase: this._playerPowerBase()
    });
  }

  /**
   * 玩家战力基准:军团平均综合强度与时代保底取高。
   * 敌人(城邦派兵/守军)强度锚定此值,时代保底保证玩家不练兵时也有基本挑战。
   */
  _playerPowerBase() {
    const average = Number(this._armySystem?.getAverageArmyPower?.() || 0);
    const eraOrder = this._eraSystem?.getCurrentEra?.()?.order || 0;
    const floors = this._config.settings?.powerBaseFloor || [200, 400, 800, 1500, 2500];
    const floor = Number(floors[eraOrder]) || 200;
    return Math.max(average, floor);
  }

  _claimLandArea(outpost, area) {
    const map = configRegistry.get('map') || {};
    const cells = [];
    const queue = [{ x: outpost.gridX, y: outpost.gridY }];
    const seen = new Set();
    while (queue.length && cells.length < area) {
      const cell = queue.shift();
      const key = `${cell.x},${cell.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (cell.x < 0 || cell.y < 0 || cell.x >= (map.gridWidth || 0) || cell.y >= (map.gridHeight || 0)) continue;
      if (['S', 'W'].includes(map.grid?.[cell.y]?.[cell.x])) continue;
      cells.push(cell);
      queue.push({ x: cell.x + 1, y: cell.y }, { x: cell.x - 1, y: cell.y }, { x: cell.x, y: cell.y + 1 }, { x: cell.x, y: cell.y - 1 });
    }
    return cells;
  }

  _deriveStatus(relation) {
    if (relation >= 60) return 'allied';
    if (relation >= 30) return 'friendly';
    if (relation >= 0) return 'neutral';
    if (relation >= -40) return 'wary';
    return 'hostile';
  }

  getOutpostState(id) {
    const outpost = this.getOutpost(id);
    if (!outpost) return null;
    if (!this._states[id]) this._states[id] = this._makeInitialState(outpost);
    return structuredClone(this._states[id]);
  }

  discoverOutpost(id) {
    const state = this.getOutpostState(id);
    const outpost = this.getOutpost(id);
    if (!state || !outpost) return false;
    this._states[id] = {
      ...state,
      active: true,
      activatedDay: state.activatedDay || store.getState('timeDay') || 1,
      controlledCells: state.controlledCells.length ? state.controlledCells : this._claimLandArea(outpost, state.area || 9),
      discovered: true
    };
    this._notify();
    return true;
  }

  advanceDay(day) {
    if (!Number.isFinite(day) || day < 1 || day <= this._lastProcessedDay) return false;
    this._lastProcessedDay = day;
    this._syncEraDevelopment(false);
    let changed = false;
    if (day >= 10) {
      for (const outpost of this.getAllOutposts()) {
        const state = this._states[outpost.id] || this._makeInitialState(outpost);
        if (!state.active && !['defeated', 'corrupted'].includes(state.status)) {
          this._states[outpost.id] = {
            ...state,
            active: true,
            activatedDay: day,
            controlledCells: state.controlledCells.length ? state.controlledCells : this._claimLandArea(outpost, state.area || 9)
          };
          changed = true;
        }
      }
    }
    // Diplomacy was removed; do not maintain an O(n²) relation graph between
    // hundreds of hostile city-states.
    changed = this._launchRaids(day) || changed;
    if (changed) {
      this._notify();
      eventBus.emit('cityStatesChanged', { day });
    }
    return changed;
  }

  launchImmediateRaids(day = store.getState('timeDay') || 1) { return this._launchRaids(day, true); }

  getGarrisonArmies() {
    return Object.entries(this._states).flatMap(([outpostId, state]) => !state.active || state.status === 'defeated' ? [] : (state.armies || []).map(army => ({ ...army, id: army.id, enemyId: army.id, outpostId, gridX: army.x, gridY: army.y, source: 'city_state_garrison' })));
  }

  attackGarrison(garrisonId, playerArmyId, { auto = false, skipCp = false } = {}) {
    const playerStats = this._armySystem?.getArmyStats?.(playerArmyId);
    if (!playerStats) return { ok: false, reason: 'army_unavailable' };
    if (!skipCp) {
      const cp = this._armySystem?.consumeAttackCp?.(playerArmyId);
      if (cp && !cp.ok) return cp;
    }
    for (const state of Object.values(this._states)) {
      const index = (state.armies || []).findIndex(army => army.id === garrisonId);
      if (index < 0) continue;
      const army = state.armies[index];
      const enemyStats = this._garrisonStats(army);
      const playerArmy = this._armySystem?.getArmy?.(playerArmyId);
      const distance = playerArmy ? Math.abs(this._armyX(playerArmy) - army.x) + Math.abs(this._armyY(playerArmy) - army.y) : 1;
      const enemyCanAttack = distance <= enemyStats.attackRange;
      const enemyFirst = enemyCanAttack && enemyStats.speed > playerStats.speed;
      if (enemyFirst) this._armySystem?.applyDamage?.(playerArmyId, enemyStats.attack);
      if (this._armySystem?.getArmy?.(playerArmyId)) {
        const damage = Math.min(army.hp || army.maxHp || 1, Math.max(0, playerStats.attack || 0));
        army.hp = Math.max(0, (army.hp || army.maxHp || 1) - damage);
        this._armySystem?._applyHeroActiveAttackLifesteal?.(playerArmyId, damage);
      }
      if (!enemyFirst && army.hp > 0 && enemyCanAttack) this._armySystem?.applyDamage?.(playerArmyId, enemyStats.attack);
      if (army.hp > 0 && this._armySystem?.getArmy?.(playerArmyId) && enemyCanAttack) {
        if (playerStats.speed - enemyStats.speed >= 2) {
          const damage = Math.min(army.hp, Math.max(0, playerStats.attack || 0));
          army.hp = Math.max(0, army.hp - damage);
          this._armySystem?._applyHeroActiveAttackLifesteal?.(playerArmyId, damage);
        }
        else if (enemyStats.speed - playerStats.speed >= 2) this._armySystem?.applyDamage?.(playerArmyId, enemyStats.attack);
      }
      if (army.hp <= 0) state.armies.splice(index, 1);
      const healed = this._armySystem?.getArmy?.(playerArmyId) ? (this._armySystem?.healArmyAfterBattle?.(playerArmyId)?.healed || 0) : 0;
      const playerAfter = this._armySystem?.getArmy?.(playerArmyId);
      this._battleLog?.record({
        attacker: { name: playerArmy?.name || '军团', type: 'player_army', summary: `${playerArmy?.unitIds?.length || 0} 队` },
        defender: { name: army.name || '城邦驻军', type: 'garrison', summary: '' },
        initiator: 'player',
        auto,
        distance,
        firstStrike: enemyFirst ? 'defender' : 'attacker',
        turns: [],
        result: army.hp <= 0 ? 'victory' : (!playerAfter ? 'defeat' : 'draw'),
        casualties: null,
        rewards: [],
        luxuryDrop: null,
        hpRemaining: playerAfter?.hp ?? null
      });
      this._notify();
      return { ok: true, enemyDefeated: army.hp <= 0, enemyHp: army.hp, healed };
    }
    return { ok: false, reason: 'enemy_unavailable' };
  }

  _garrisonStats(army) {
    const units = configRegistry.get('enemies')?.units || [];
    const members = (army.unitIds || []).map(id => units.find(unit => unit.id === id)).filter(Boolean);
    const count = Math.max(1, members.length);
    // R3b: 优先取 army 自身字段 —— 实例化时已叠加 power_scale buff(hp/maxHp/attack),
    // 不再回退到配置表基础值,否则加成会失效。
    const ownAttack = Number.isFinite(Number(army.attack)) ? Number(army.attack) : NaN;
    const ownMaxHp = Number.isFinite(Number(army.maxHp)) ? Number(army.maxHp) : NaN;
    const ownHp = Number.isFinite(Number(army.hp)) ? Number(army.hp) : NaN;
    return {
      name: army.name || '城邦驻军', faction: '敌对城邦',
      attack: ownAttack >= 0
        ? ownAttack
        : Math.max(1, Math.round(members.reduce((sum, unit) => sum + (Number(unit.attack) || 0), 0) || army.compositeStrength * 0.3 || 1)),
      maxHp: ownMaxHp > 0
        ? ownMaxHp
        : Math.max(1, Math.round(members.reduce((sum, unit) => sum + (Number(unit.hp) || Number(unit.maxHp) || 0), 0) || army.compositeStrength * 0.7 || 1)),
      hp: ownHp > 0 ? ownHp : ownMaxHp > 0 ? ownMaxHp : null,
      speed: Number.isFinite(Number(army.speed)) && Number(army.speed) > 0
        ? Number(army.speed)
        : members.reduce((sum, unit) => sum + (Number(unit.speed) || 1), 0) / count,
      attackRange: Number.isFinite(Number(army.attackRange)) && Number(army.attackRange) > 0
        ? Number(army.attackRange)
        : Math.max(1, Math.floor(members.reduce((sum, unit) => sum + (Number(unit.attackRange) || 1), 0) / count))
    };
  }

  /**
   * 帧级驻军推进(由 main.update 每帧调用,替代原 tick 驱动的 _advanceGarrisons):
   * 每个驻军独立 10 秒攻击冷却 + 1 格/10 秒移动;进入射程直接结算(不再弹预览确认框)。
   */
  update(delta, timeScale = 1) {
    if (!Number.isFinite(delta) || delta <= 0) return;
    const tickInterval = getTickInterval();
    const players = (this._armySystem?.getArmies?.() || []).filter(army => (!army.ownerId || army.ownerId === 'player') && army.unitIds?.length);
    const occupied = new Set([
      ...players.map(army => `${army.gridX},${army.gridY}`),
      ...Object.values(this._states).flatMap(state => (state.armies || []).map(army => `${army.x},${army.y}`)),
      ...(this._enemyExpansionSystem?.getAllCells?.() || []).map(enemy => `${enemy.x},${enemy.y}`)
    ]);
    let changed = false;
    for (const state of Object.values(this._states)) {
      if (state.status === 'defeated') continue;
      for (const army of state.armies || []) {
        if (!Number.isFinite(army.x) || !Number.isFinite(army.y)) continue;
        const stats = this._garrisonStats(army);
        Object.assign(army, stats, { hp: Math.max(1, Number(army.hp) || stats.maxHp) });
        const motion = this._garrisonMotion.get(army.id) || (this._garrisonMotion.set(army.id, {}), this._garrisonMotion.get(army.id));
        motion.attackCooldown = Math.max(0, (motion.attackCooldown || 0) - delta * timeScale);
        const target = players.map(player => ({ player, distance: Math.abs(this._armyX(player) - army.x) + Math.abs(this._armyY(player) - army.y) }))
          .filter(entry => entry.distance <= 8).sort((a, b) => a.distance - b.distance)[0];
        const destination = target ? { x: target.player.gridX, y: target.player.gridY } : { x: army.homeX, y: army.homeY };
        if (!Number.isFinite(destination.x) || !Number.isFinite(destination.y)) continue;
        if (target && target.distance <= stats.attackRange) {
          if (motion.attackCooldown <= 0) {
            const result = this._resolveGarrisonBattle(army, state, target, stats);
            if (result?.ok) motion.attackCooldown = tickInterval;
            changed = true;
          }
          continue; // 攻击周期内不移动(与原每 tick 一次攻击的节奏一致)
        }
        if (army.x === destination.x && army.y === destination.y) continue;
        motion.moveProgress = (motion.moveProgress || 0) + delta * timeScale / tickInterval;
        let steps = Math.floor(motion.moveProgress);
        if (steps <= 0) continue;
        motion.moveProgress -= steps;
        let moved = false;
        while (steps-- > 0) {
          const dx = Math.sign(destination.x - army.x), dy = Math.sign(destination.y - army.y);
          const next = Math.abs(destination.x - army.x) >= Math.abs(destination.y - army.y)
            ? { x: army.x + dx, y: army.y } : { x: army.x, y: army.y + dy };
          if (occupied.has(`${next.x},${next.y}`)) { motion.moveProgress = 0; break; }
          occupied.delete(`${army.x},${army.y}`);
          army.x = next.x;
          army.y = next.y;
          occupied.add(`${army.x},${army.y}`);
          moved = true;
        }
        if (moved) changed = true;
      }
    }
    if (changed) this._notify();
    return changed;
  }

  /** 驻军自动攻击结算(原 _advanceGarrisons 内联 resolveBattle,同步直结 + 战报) */
  _resolveGarrisonBattle(army, state, target, stats) {
    const playerStats = this._armySystem?.getArmyStats?.(target.player.id) || {};
    const playerFirst = playerStats.speed > stats.speed && target.distance <= (playerStats.attackRange || 0);
    const attacks = [];
    if (playerFirst) {
      army.hp = Math.max(0, army.hp - (playerStats.attack || 0));
      attacks.push({ side: 'defender', damage: playerStats.attack || 0, hpAfter: army.hp });
    }
    if (army.hp > 0) {
      this._armySystem?.applyDamage?.(target.player.id, stats.attack);
      attacks.push({ side: 'attacker', damage: stats.attack, hpAfter: null });
    }
    if (!playerFirst && this._armySystem?.getArmy?.(target.player.id) && target.distance <= (playerStats.attackRange || 0)) {
      army.hp = Math.max(0, army.hp - (playerStats.attack || 0));
      attacks.push({ side: 'defender', damage: playerStats.attack || 0, hpAfter: army.hp });
    }
    const enemyDefeated = army.hp <= 0;
    if (enemyDefeated) state.armies = state.armies.filter(item => item.id !== army.id);
    const playerAlive = !!this._armySystem?.getArmy?.(target.player.id);
    const playerAfter = playerAlive ? this._armySystem.getArmy(target.player.id) : null;
    this._battleLog?.record({
      attacker: { name: army.name || '城邦驻军', type: 'garrison', summary: '' },
      defender: { name: target.player.name || '军团', type: 'player_army', summary: `${target.player.unitIds?.length || 0} 队` },
      initiator: 'enemy',
      auto: true,
      distance: target.distance,
      firstStrike: playerFirst ? 'defender' : 'attacker',
      turns: attacks.map(attack => ({ side: attack.side, damage: attack.damage, hpAfter: attack.hpAfter ?? null, bonusStrike: false })),
      result: enemyDefeated ? 'defeat' : (!playerAlive ? 'victory' : 'draw'),
      casualties: null,
      rewards: [],
      luxuryDrop: null,
      hpRemaining: playerAfter?.hp ?? null
    });
    this._notify();
    return { ok: true, enemyDefeated, enemyHp: army.hp };
  }

  _launchRaids(day, force = false) {
    let changed = false;
    const settings = this._config.settings || {};
    const startDay = Number(settings.raidStartDay) || 5;
    const midDay = Number(settings.raidMidDay) || 10;
    const allDay = Number(settings.raidAllDay) || 20;
    const nearRaidCount = Number(settings.nearRaidCount) || 3;
    const midRaidCount = Number(settings.midRaidCount) || 10;
    const units = configRegistry.get('enemies')?.units || [];
    const playerSpawn = configRegistry.get('map')?.initialBuildings?.[0] || { gridX: 0, gridY: 0 };
    // 距离排名(rank 1 = 离玩家最近的城邦)。不用 level 做闸门:
    // level 会随玩家时代推进而增长(_syncEraDevelopment levelBonus),会被污染。
    const ranked = this.getAllOutposts()
      .map(outpost => ({
        outpost,
        rank: Math.abs(outpost.gridX - playerSpawn.gridX) + Math.abs(outpost.gridY - playerSpawn.gridY)
      }))
      .sort((a, b) => a.rank - b.rank)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
    // R3b: 按时间线分档出"出兵池 + 每日随机出兵数量",从池中随机抽取城邦派兵。
    // 取代旧的"每个城邦独立 roll aggression"—— 让每天到达玩家家的波次数量均匀,
    // 而不是几十个城邦独立概率叠加出的剧烈波动。
    let pool = [];
    let minRaids = 0;
    let maxRaids = 0;
    if (day >= allDay) {
      pool = ranked;
      minRaids = Number(settings.raidCountMinAll) || 1;
      maxRaids = Number(settings.raidCountMaxAll) || 3;
    } else if (day >= midDay) {
      pool = ranked.filter(entry => entry.rank <= midRaidCount);
      minRaids = Number(settings.raidCountMinMid) || 1;
      maxRaids = Number(settings.raidCountMaxMid) || 2;
    } else if (day >= startDay) {
      pool = ranked.filter(entry => entry.rank <= nearRaidCount);
      minRaids = Number(settings.raidCountMinNear) || 0;
      maxRaids = Number(settings.raidCountMaxNear) || 1;
    } else {
      return false; // 前 startDay 天不派兵
    }
    const eligible = pool.filter(entry => {
      const state = this._states[entry.outpost.id];
      return state?.active && state.status !== 'defeated' && (state.armies || []).length > 0;
    });
    if (eligible.length === 0) return false;
    const targetCount = force
      ? eligible.length
      : this._randomBetween(Math.min(minRaids, maxRaids), Math.max(minRaids, maxRaids));
    // 随机抽取(不重复)
    const chosen = [...eligible].sort(() => Math.random() - 0.5).slice(0, Math.min(targetCount, eligible.length));
    for (const { outpost } of chosen) {
      const state = this._states[outpost.id];
      const dispatchedArmy = state.armies?.[0] || null;
      if (!dispatchedArmy) continue;
      const level = Math.max(1, Number(state.level) || 1);
      const stats = this._garrisonStats(dispatchedArmy);
      // 派兵强度按"当天"玩家基准现算(守军实例的 buff 可能已过期),加成可 < 1
      const raidTarget = this._playerPowerBase()
        * ((Number(settings.raidPowerBase) || 0.6) + level * (Number(settings.raidPowerPerLevel) || 0.2));
      const unit = units.find(item => item.id === dispatchedArmy.unitIds?.[0]) || {};
      const baseMaxHp = Math.max(1, Number(unit.maxHp ?? unit.hp) || 1);
      const baseAttack = Math.max(0, Number(unit.attack) || 0);
      const buffs = [makePowerScaleBuff(raidTarget, unit, settings.powerScaleMin)];
      const applied = applyEnemyBuffs({ maxHp: baseMaxHp, hp: baseMaxHp, attack: baseAttack }, buffs);
      const candidates = [
        { x: dispatchedArmy.x, y: dispatchedArmy.y },
        ...(state.controlledCells || []),
        { x: outpost.gridX + 2, y: outpost.gridY + 1 },
        { x: outpost.gridX - 1, y: outpost.gridY + 1 }
      ].filter(cell => Number.isFinite(cell.x) && Number.isFinite(cell.y));
      let spawned = false;
      for (const cell of candidates) {
        spawned = this._enemyExpansionSystem?.spawnCityStateRaid?.({
          outpostId: outpost.id,
          gridX: cell.x,
          gridY: cell.y,
          targetX: playerSpawn.gridX,
          targetY: playerSpawn.gridY,
          strength: Math.max(1, Math.round(raidTarget)),
          enemyId: dispatchedArmy.enemyId || null,
          combatStats: {
            ...stats, hp: applied.hp, maxHp: applied.maxHp, attack: applied.attack,
            buffs, cp: dispatchedArmy.cp || 1, raidKind: 'city_state'
          }
        }) === true;
        if (spawned) break;
      }
      state.raidsLaunched = (state.raidsLaunched || 0) + (spawned ? 1 : 0);
      state.lastRaid = { day, armyId: dispatchedArmy.id, targetX: playerSpawn.gridX, targetY: playerSpawn.gridY };
      if (spawned) state.armies = state.armies.filter(army => army.id !== dispatchedArmy.id);
      state.lastRaid.spawned = spawned;
      eventBus.emit('cityStateRaidLaunched', { outpostId: outpost.id, ...state.lastRaid, aggression: state.aggression, forced: force });
      eventBus.emit('combatBroadcast', { message: spawned ? `⚠️ ${outpost.name}派出军队向玩家领地进军。` : `⚠️ ${outpost.name}派军失败：出生位置无效。` });
      changed = true;
    }
    if (changed && force) this._notify();
    return changed;
  }

  _randomBetween(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  getUsableLuxuryDeposits(outpostId) {
    const state = this.getOutpostState(outpostId);
    return state?.headquartersDestroyed ? (state.luxuryDeposits || []).filter(deposit => !deposit.locked) : [];
  }

  _syncLuxuryResourceNodes() {
    const records = [];
    for (const [cityStateId, state] of Object.entries(this._states)) {
      for (const deposit of state.luxuryDeposits || []) records.push({
        ...deposit,
        type: 'luxury',
        rarity: 'common',
        gridX: deposit.x,
        gridY: deposit.y,
        lockedByCityStateId: cityStateId,
        cityStateGenerated: true
      });
    }
    this._resourceNodeSystem?.setCityStateNodes?.(records);
  }

  _expandOutpost(outpost, day) {
    const state = this._states[outpost.id];
    if (!state?.active || state.status === 'defeated' || !EXPANDING_STATUSES.has(state.status)) return false;
    const maxCells = 12;
    if (state.controlledCells.length >= maxCells) return false;
    const occupied = new Set(Object.values(this._states).flatMap(item => item.controlledCells || []).map(cell => `${cell.x},${cell.y}`));
    const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    for (const cell of state.controlledCells) {
      for (const [dx, dy] of directions) {
        const target = { x: cell.x + dx, y: cell.y + dy };
        if (target.x < 0 || target.y < 0 || target.x >= 200 || target.y >= 200) continue;
        if (Math.abs(target.x - outpost.gridX) + Math.abs(target.y - outpost.gridY) > 5) continue;
        if (occupied.has(`${target.x},${target.y}`)) continue;
        state.controlledCells.push(target);
        state.lastExpansionDay = day;
        return true;
      }
    }
    return false;
  }

  _cultureUnlocks() { return new Set(this._cultureSystem?.getUnlockedDiplomacyActions?.() || []); }

  getAvailableActions(id) {
    return [];
  }

  getDiplomaticSummary(id) {
    const outpost = this.getOutpost(id);
    const state = this.getOutpostState(id);
    if (!outpost || !state) return null;
    return {
      relation: state.relation,
      status: state.status,
      activeTreaties: [...(state.treaties || [])],
      availableTreaties: [],
      controlledCellCount: state.controlledCells.length,
      defense: this.getOutpostDefense(id),
      expansionState: EXPANDING_STATUSES.has(state.status) ? 'expanding' : 'contained'
    };
  }

  performAction(outpostId, actionId) {
    return { ok: false, reason: '敌对城邦不接受外交' };
    /* istanbul ignore next -- legacy implementation retained for old save compatibility */
    const outpost = this.getOutpost(outpostId);
    const state = this.getOutpostState(outpostId);
    const action = this._config.actions[actionId];
    if (!outpost || !state || !action) return { ok: false, reason: '城邦或外交行动不存在' };
    if (state.status === 'defeated') return { ok: false, reason: '该城邦已经被征服' };
    if (!this.getAvailableActions(outpostId).includes(actionId)) return { ok: false, reason: '人文树尚未解锁该外交行动' };
    if (state.relation < (action.minimumRelation ?? -100)) return { ok: false, reason: `关系不足，需要 ${action.minimumRelation}` };
    if (action.cost?.length && (!this._resourceSystem || !this._resourceSystem.canAfford(action.cost))) return { ok: false, reason: '资源不足' };
    if (action.cost?.length) this._resourceSystem.consumeAll(action.cost);
    for (const reward of action.rewards || []) this._resourceSystem?.add(reward.resourceId, reward.amount);
    const heroBonus = Number(this._heroSystem?.getBonuses?.().diplomacyRelationBonus) || 0;
    const luxuryBonus = Number(this._luxurySystem?.getBonuses?.().outpostRelationGainBonus) || 0;
    const diplomacyMul = this._cultureSystem?.getEffects?.().diplomacyMul || 1;
    const culturalDelta = Math.round((action.relationDelta || 0) * diplomacyMul);
    const relation = Math.max(-100, Math.min(100, state.relation + culturalDelta + heroBonus + luxuryBonus));
    const treaties = new Set(state.treaties || []);
    if (TREATY_ACTIONS.has(actionId)) treaties.add(actionId);
    this._states[outpostId] = {
      ...state,
      relation,
      status: action.forceStatus || this._deriveStatus(relation),
      active: true,
      discovered: true,
      interactions: (state.interactions || 0) + 1,
      lastAction: actionId,
      treaties: [...treaties]
    };
    this._notify();
    eventBus.emit('combatBroadcast', { message: `🤝 ${outpost.name}：${action.name}成功，关系 ${relation}` });
    eventBus.emit('diplomacyAction', { outpostId, actionId, relation });
    return { ok: true, relation, status: this._states[outpostId].status };
  }

  adjustRelation(outpostId, amount, reason = '事件') {
    return false;
  }

  getOutpostDefense(outpostId) {
    const outpost = this.getOutpost(outpostId);
    const state = this.getOutpostState(outpostId);
    if (!outpost || !state) return 0;
    const day = store.getState('timeDay') || this._lastProcessedDay || 1;
    return Math.round(Number(state.compositeStrength) || Number(outpost.militaryStrength) || 0);
  }

  _initializeFactionRelations() {
    const outposts = this.getAllOutposts();
    for (let left = 0; left < outposts.length; left += 1) {
      for (let right = left + 1; right < outposts.length; right += 1) {
        const key = `${outposts[left].id}|${outposts[right].id}`;
        const sameFaction = outposts[left].faction === outposts[right].faction;
        this._factionRelations[key] = sameFaction ? 35 : ((left * 17 + right * 11) % 41) - 20;
      }
    }
  }

  _advanceInterFactionRelations(day) {
    let changed = false;
    for (const [key, value] of Object.entries(this._factionRelations)) {
      const drift = ((key.length + day) % 3) - 1;
      if (drift === 0) continue;
      this._factionRelations[key] = Math.max(-100, Math.min(100, value + drift));
      changed = true;
    }
    return changed;
  }

  getInterFactionRelations() { return { ...this._factionRelations }; }

  _syncEraDevelopment(notify = true) {
    const era = this._eraSystem?.getCurrentEra?.();
    if (!era) return false;
    let changed = false;
    for (const outpost of this.getAllOutposts()) {
      const state = this._states[outpost.id] || this._makeInitialState(outpost);
      if (state.currentEraId === era.id && state.generationSignature === this._generationSignature()) continue;
      if (state.status === 'defeated' || state.status === 'conquered') continue;
      const distanceBase = this._buildDevelopment(outpost, 0).level;
      const levelBonus = Math.max(1, (state.level || distanceBase) + 1 - distanceBase);
      const development = this._buildDevelopment(outpost, levelBonus);
      const controlledCells = this._claimLandArea(outpost, development.area);
      this._placeDevelopment(development, controlledCells, outpost);
      this._states[outpost.id] = {
        ...state,
        ...development,
        controlledCells,
        currentEraId: era.id,
        developmentLevel: era.order + 1,
        garrisonTier: development.level
        ,generationSignature: this._generationSignature()
      };
      changed = true;
    }
    if (changed) this._syncLuxuryResourceNodes();
    if (changed && notify) this._notify();
    return changed;
  }

  attackOutpost(outpostId, force = {}) {
    const outpost = this.getOutpost(outpostId);
    const state = this.getOutpostState(outpostId);
    if (!outpost || !state) return { ok: false, reason: '城邦不存在' };
    if (state.status === 'defeated') return { ok: false, reason: '该城邦已经被征服' };
    if (force.armyId) {
      const cp = this._armySystem?.consumeAttackCp?.(force.armyId);
      if (cp && !cp.ok) return cp;
    }
    const power = Math.max(0, Number(force.power) || 0);
    const defense = Math.max(1, Number(state.hp) || this.getOutpostDefense(outpostId));
    const victory = power >= defense;
    let luxuryDrop = null;
    const materialDrops = [];
    if (victory) {
      const luxuries = configRegistry.getHistoricalContent?.().luxuries || [];
      const seed = [...outpost.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) + (store.getState('timeDay') || 1) * 19;
      const luxuryRoll = (seed % 100) / 100;
      const luxuryChance = Math.min(0.9, 0.12 + Math.max(1, Number(state.level) || 1) * 0.14);
      luxuryDrop = luxuryRoll < luxuryChance ? luxuries[seed % Math.max(1, luxuries.length)] : null;
      const eraId = this._eraSystem?.getCurrentEra?.()?.id || 'primitive';
      const resourceConfigs = configRegistry.get('resources') || [];
      const materialIds = eraId === 'primitive' ? ['wood', 'stone']
        : resourceConfigs.filter(resource => resource.processed === true && resource.unlockEraId === eraId).map(resource => resource.id);
      const materialAmount = 6 + Math.max(1, Number(state.level) || 1) * 4;
      for (const resourceId of materialIds) {
        const amount = this._resourceSystem?.addClamped?.(resourceId, materialAmount) || 0;
        if (amount > 0) materialDrops.push({ resourceId, amount });
      }
      this._states[outpostId] = {
        ...state,
        relation: -100,
        status: 'defeated',
        active: false,
        discovered: true,
        treaties: [],
        conqueredDay: store.getState('timeDay') || this._lastProcessedDay || 1,
        conqueredByArmyId: force.armyId || null
        ,headquartersDestroyed: true,
        hp: 0,
        buildings: [],
        armies: [],
        controlledCells: [],
        luxuryDeposits: (state.luxuryDeposits || []).map(deposit => ({ ...deposit, locked: false }))
      };
      this._enemyExpansionSystem?.removeRaidsByOutpost?.(outpostId);
      this._resourceNodeSystem?.unlockCityStateNodes?.(outpostId);
      for (const deposit of this._states[outpostId].luxuryDeposits || []) {
        this._luxurySystem?.discoverDeposit?.({ ...deposit, gridX: deposit.x, gridY: deposit.y });
      }
      if (luxuryDrop) this._luxurySystem?.addLuxury?.(luxuryDrop.id, 1);
      const materialText = materialDrops.map(drop => `${configRegistry.getResource?.(drop.resourceId)?.name || drop.resourceId}×${drop.amount}`).join('、');
      const luxuryText = luxuryDrop ? `，奢侈品：${luxuryDrop.name || luxuryDrop.id}×1` : '';
      eventBus.emit('combatBroadcast', { message: `⚔️ 已攻克${outpost.name}。战利品：${materialText || '时代材料仓储已满'}${luxuryText}` });
    } else {
      this._states[outpostId] = { ...state, hp: Math.max(1, defense - power), active: true, relation: -100, status: 'hostile', treaties: [] };
      eventBus.emit('combatBroadcast', { message: `⚔️ 进攻 ${outpost.name} 失败（${power}/${defense}）。` });
    }
    this._notify();
    eventBus.emit('outpostBattleResolved', { outpostId, victory, power, defense, hp: this._states[outpostId].hp });
    return { ok: true, victory, power, defense, hp: this._states[outpostId].hp, materialDrops, luxuryDrop: victory ? (luxuryDrop?.id || null) : null };
  }

  _notify() {
    store.setState({
      outpostStates: structuredClone(this._states),
      activeCityStateCount: this.getVisibleOutposts().length,
      factions: { states: structuredClone(this._states), relations: { ...this._factionRelations }, lastSyncDay: this._lastProcessedDay },
      outpostVersion: (store.getState('outpostVersion') || 0) + 1
    });
  }

  getState() { return { states: structuredClone(this._states), factionRelations: { ...this._factionRelations }, lastProcessedDay: this._lastProcessedDay }; }

  corruptCovered(predicate) {
    let changed = false;
    for (const outpost of this.getAllOutposts()) {
      const state = this._states[outpost.id];
      if (!state || ['defeated', 'conquered', 'corrupted'].includes(state.status) || !predicate(outpost.gridX, outpost.gridY)) continue;
      this._states[outpost.id] = { ...state, active: true, hp: 0, status: 'corrupted', relation: -100, armies: [], luxuryDeposits: [], buildings: (state.buildings || []).map(building => ({ ...building, ruined: true, hp: 0 })), ruins: true, corruptedByBlackMist: true };
      changed = true;
    }
    if (changed) { this._syncLuxuryResourceNodes(); this._notify(); eventBus.emit('cityStatesChanged', { cause: 'black_mist' }); }
  }

  restoreState(saved) {
    this._states = {};
    this._factionRelations = { ...(saved?.factionRelations || {}) };
    this._lastProcessedDay = saved?.lastProcessedDay || 0;
    for (const outpost of this.getAllOutposts()) {
      const base = this._makeInitialState(outpost);
      const previous = saved?.states?.[outpost.id] || {};
      const configChanged = previous.generationSignature !== base.generationSignature;
      const retained = ['defeated', 'conquered', 'corrupted'].includes(previous.status) || !configChanged ? previous : {};
      this._states[outpost.id] = {
        ...base,
        ...retained,
        relation: -100,
        status: ['defeated', 'corrupted'].includes(retained.status) ? retained.status : 'hostile',
        controlledCells: structuredClone(retained.controlledCells || base.controlledCells),
        treaties: []
      };
    }
    this._factionRelations = {};
    this._garrisonMotion.clear();
    this._syncEraDevelopment(false);
    this._syncLuxuryResourceNodes();
    this._notify();
  }
}
