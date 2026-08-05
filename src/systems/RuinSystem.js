import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { scaleCombatStatsToStrength } from '../domain/CombatStrength.js';

const RUIN_COUNT = 15;
const GUARD_OFFSETS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]];

function createRandom(seed) {
  let state = (Number(seed) || 1) >>> 0;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

export class RuinSystem {
  constructor() {
    this.ruins = [];
    this._army = null;
    this._seed = 0;
  }

  setSystems({ army } = {}) { this._army = army || null; }

  initNew(options = {}) {
    this._seed = Number(options.seed) || ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
    this.ruins = this._generateRuins(this._seed);
    this._notify('generated');
  }

  _generateRuins(seed) {
    const map = configRegistry.get('map');
    if (!map?.grid?.length) return [];
    const spawn = (Number.isFinite(map.viewportCenter?.defaultGridX) && Number.isFinite(map.viewportCenter?.defaultGridY))
      ? { gridX: map.viewportCenter.defaultGridX, gridY: map.viewportCenter.defaultGridY }
      : (map.initialBuildings?.[0] || map.spawnManifest?.playerSpawn || { gridX: Math.floor(map.gridWidth / 2), gridY: Math.floor(map.gridHeight / 2) });
    const player = { x: spawn.gridX, y: spawn.gridY };
    const reserved = [
      ...(map.spawnManifest?.cityStates || []),
      ...(map.spawnManifest?.wildSites || []),
      ...(map.initialBuildings || [])
    ].map(item => ({ x: item.gridX, y: item.gridY }));
    reserved.push({ x: map.gridWidth - 6, y: Math.floor(map.gridHeight / 2) });
    const random = createRandom(seed);
    const candidates = [];
    const maxDistance = Math.max(...[
      { x: 2, y: 2 }, { x: map.gridWidth - 3, y: 2 },
      { x: 2, y: map.gridHeight - 3 }, { x: map.gridWidth - 3, y: map.gridHeight - 3 }
    ].map(point => distance(point, player)), 1);
    const westRiver = this._findWestRiverRuin(map, player);
    if (westRiver) candidates.push({ ...westRiver, distance: distance(westRiver, player), maxDistance, forceLevel: 1, fixedWestRiver: true });

    // 5×3分区各放置一座，确保南北与东西方向都均匀覆盖。
    for (let row = 0; row < 3; row += 1) for (let col = 0; col < 5; col += 1) {
      const left = Math.max(3, Math.floor(col * map.gridWidth / 5) + 3);
      const right = Math.min(map.gridWidth - 4, Math.floor((col + 1) * map.gridWidth / 5) - 3);
      const top = Math.max(3, Math.floor(row * map.gridHeight / 3) + 3);
      const bottom = Math.min(map.gridHeight - 4, Math.floor((row + 1) * map.gridHeight / 3) - 3);
      if (candidates.some(point => point.x >= left && point.x <= right && point.y >= top && point.y <= bottom)) continue;
      for (let attempt = 0; attempt < 1800; attempt += 1) {
        const x = left + Math.floor(random() * Math.max(1, right - left + 1));
        const y = top + Math.floor(random() * Math.max(1, bottom - top + 1));
        const point = { x, y };
        if (!this._isRuinAreaLand(map, point)) continue;
        const minimumPlayerDistance = attempt < 900 ? 18 : 8;
        if (distance(point, player) < minimumPlayerDistance) continue;
        if (reserved.some(target => distance(point, target) < 8)) continue;
        const requiredSpacing = attempt < 900 ? 14 : 10;
        if (candidates.some(target => distance(point, target) < requiredSpacing)) continue;
        candidates.push({ x, y, distance: distance(point, player), maxDistance });
        break;
      }
    }
    // 极端地形分区没有合法陆地时，以最远点补齐，仍保持最小间距。
    for (let attempt = 0; candidates.length < RUIN_COUNT && attempt < 12000; attempt += 1) {
      const point = { x: 3 + Math.floor(random() * (map.gridWidth - 6)), y: 3 + Math.floor(random() * (map.gridHeight - 6)) };
      if (!this._isRuinAreaLand(map, point) || distance(point, player) < 18) continue;
      if (reserved.some(target => distance(point, target) < 8) || candidates.some(target => distance(point, target) < 14)) continue;
      candidates.push({ ...point, distance: distance(point, player), maxDistance });
    }
    return candidates.slice(0, RUIN_COUNT).map((point, index) => this._createRuin(point, index));
  }

  _isRuinAreaLand(map, point) {
    return [{ x: point.x, y: point.y }, ...GUARD_OFFSETS.map(([dx, dy]) => ({ x: point.x + dx, y: point.y + dy }))]
      .every(cell => ['G', 'F', 'D'].includes(map.grid[cell.y]?.[cell.x]));
  }

  _findWestRiverRuin(map, player) {
    let riverX = null;
    for (let x = player.x - 1; x >= Math.max(3, player.x - Math.floor(map.gridWidth * 0.35)); x -= 1) {
      if (['W', 'S'].includes(map.grid[player.y]?.[x])) { riverX = x; break; }
    }
    if (riverX == null) return null;
    for (let x = riverX - 2; x >= 3; x -= 1) {
      const point = { x, y: player.y };
      if (this._isRuinAreaLand(map, point)) return point;
    }
    return null;
  }

  _createRuin(point, index) {
    const normalized = Math.min(1, point.distance / point.maxDistance);
    const level = point.forceLevel || Math.max(1, Math.min(5, 1 + Math.floor(normalized * 5)));
    const guardCount = level;
    const guards = GUARD_OFFSETS.slice(0, guardCount).map(([dx, dy], guardIndex) => {
      const maxHp = Math.round(220 * level * (1 + level * 0.18));
      const attack = Math.round(38 * level * (1 + level * 0.13));
      return scaleCombatStatsToStrength({
        id: `ruin_${index + 1}_guard_${guardIndex + 1}`,
        ruinId: `ruin_${index + 1}`,
        name: `${level}级遗迹守卫`, faction: '远古遗迹', icon: '🛡️',
        gridX: point.x + dx, gridY: point.y + dy,
        hp: maxHp, maxHp, attack,
        attackRange: Math.min(3, 1 + Math.floor(level / 2)),
        speed: Math.min(3, 1 + Math.floor((level - 1) / 2)),
        level, source: 'ruin_guard'
      }, 2);
    });
    return {
      id: `ruin_${index + 1}`, name: `${level}级远古遗迹`, level,
      gridX: point.x, gridY: point.y, activated: false, guards,
      fixedWestRiver: point.fixedWestRiver === true,
      scienceMultiplierBonus: 0.35, cultureMultiplierBonus: 0.35
    };
  }

  getRuins() { return this.ruins.map(ruin => ({ ...ruin, guards: ruin.guards.map(guard => ({ ...guard })) })); }
  getGuards() { return this.ruins.flatMap(ruin => ruin.guards).filter(guard => guard.hp > 0).map(guard => ({ ...guard })); }
  getGuard(id) { return this.ruins.flatMap(ruin => ruin.guards).find(guard => guard.id === id && guard.hp > 0) || null; }
  getRuin(id) { return this.ruins.find(ruin => ruin.id === id) || null; }
  getActivatedCount() { return this.ruins.filter(ruin => ruin.activated).length; }
  getScienceMultiplier() { return Number((1 + this.ruins.filter(ruin => ruin.activated).reduce((sum, ruin) => sum + ruin.scienceMultiplierBonus, 0)).toFixed(4)); }
  getCultureMultiplier() { return Number((1 + this.ruins.filter(ruin => ruin.activated).reduce((sum, ruin) => sum + ruin.cultureMultiplierBonus, 0)).toFixed(4)); }

  attackGuardWithArmy(guardId, armyId) {
    const guard = this.getGuard(guardId);
    const army = this._army?.getArmy?.(armyId);
    if (!guard || !army) return { ok: false, reason: 'enemy_unavailable' };
    const distanceToGuard = Math.abs(army.gridX - guard.gridX) + Math.abs(army.gridY - guard.gridY);
    if (distanceToGuard > army.attackRange) return { ok: false, reason: 'target_out_of_range' };
    const cp = this._army.consumeAttackCp?.(armyId);
    if (cp && !cp.ok) return cp;
    const attacks = [];
    const playerAttack = () => {
      const damage = Math.min(guard.hp, army.attack);
      guard.hp = Math.max(0, guard.hp - army.attack);
      attacks.push({ side: 'player', damage, hp: guard.hp });
      this._army._applyHeroActiveAttackLifesteal?.(armyId, damage);
    };
    const guardAttack = () => {
      if (guard.hp <= 0 || distanceToGuard > guard.attackRange || !this._army.getArmy?.(armyId)) return;
      const result = this._army.applyDamage?.(armyId, guard.attack);
      attacks.push({ side: 'enemy', damage: guard.attack, destroyed: result?.destroyed === true });
    };
    if (army.speed >= guard.speed) {
      playerAttack(); guardAttack();
      if (guard.hp > 0 && this._army.getArmy?.(armyId) && army.speed - guard.speed >= 2) playerAttack();
    } else {
      guardAttack();
      if (this._army.getArmy?.(armyId)) playerAttack();
      if (guard.hp > 0 && this._army.getArmy?.(armyId) && guard.speed - army.speed >= 2 && distanceToGuard <= guard.attackRange) guardAttack();
    }
    const healed = this._army.healArmyAfterBattle?.(armyId)?.healed || 0;
    if (guard.hp <= 0) eventBus.emit('ruinGuardDefeated', { guardId, ruinId: guard.ruinId });
    this._notify('battle');
    return { ok: true, attacks, healed, enemyHp: guard.hp };
  }

  activateStele(ruinId, armyId) {
    const ruin = this.getRuin(ruinId);
    const army = this._army?.getArmy?.(armyId);
    if (!ruin || !army) return { ok: false, reason: 'unknown_ruin' };
    if (ruin.activated) {
      const source = this.ruins.find(candidate => candidate.activated && candidate.id !== ruin.id
        && Math.abs(army.gridX - candidate.gridX) + Math.abs(army.gridY - candidate.gridY) <= 1);
      if (!source) return { ok: false, reason: 'teleport_source_too_far' };
      const teleported = this._army.teleportArmyNear?.(armyId, ruin.gridX, ruin.gridY) || { ok: false, reason: 'teleport_destination_blocked' };
      if (!teleported.ok) return teleported;
      eventBus.emit('combatBroadcast', { message: `✦ 军团通过${source.name}传送至${ruin.name}。` });
      eventBus.emit('ruinTeleport', { armyId, sourceRuinId: source.id, targetRuinId: ruin.id, gridX: teleported.gridX, gridY: teleported.gridY });
      return { ...teleported, sourceRuinId: source.id, targetRuinId: ruin.id, teleported: true };
    }
    if (ruin.guards.some(guard => guard.hp > 0)) return { ok: false, reason: 'ruin_guards_remaining' };
    const distanceToStele = Math.abs(army.gridX - ruin.gridX) + Math.abs(army.gridY - ruin.gridY);
    if (distanceToStele > 1) return { ok: false, reason: 'stele_too_far' };
    ruin.activated = true;
    this._notify('activated');
    eventBus.emit('combatBroadcast', { message: `🗿 激活${ruin.name}石碑：科技点与人文点获取倍率各提高35%！` });
    eventBus.emit('ruinSteleActivated', { ruinId, level: ruin.level, scienceMultiplier: this.getScienceMultiplier(), cultureMultiplier: this.getCultureMultiplier() });
    return { ok: true, ruinId, scienceMultiplier: this.getScienceMultiplier(), cultureMultiplier: this.getCultureMultiplier() };
  }

  getState() { return { layoutVersion: 2, combatBalanceVersion: 2, seed: this._seed, ruins: this.getRuins() }; }
  restoreState(state) {
    if (!Array.isArray(state?.ruins) || state.ruins.length === 0) return this.initNew();
    this._seed = Number(state.seed) || 0;
    if (state.layoutVersion !== 2) {
      const previous = new Map(state.ruins.map(ruin => [ruin.id, ruin]));
      this.ruins = this._generateRuins(this._seed || 1).map(ruin => {
        const old = previous.get(ruin.id);
        if (!old) return ruin;
        return {
          ...ruin,
          activated: old.activated === true,
          guards: ruin.guards.map((guard, index) => {
            const previousGuard = old.guards?.[index];
            const hpRatio = previousGuard?.maxHp > 0 ? previousGuard.hp / previousGuard.maxHp : 1;
            return { ...guard, hp: Math.max(0, Math.min(guard.maxHp, Math.round(guard.maxHp * hpRatio))) };
          })
        };
      });
      this._notify('layout_migrated');
      return;
    }
    const migrateCombatBalance = Number(state.combatBalanceVersion) < 2;
    this.ruins = state.ruins.map(ruin => ({
      ...ruin,
      guards: (ruin.guards || []).map(guard => migrateCombatBalance ? scaleCombatStatsToStrength(guard, 2) : { ...guard })
    }));
    this._notify('restore');
  }

  _notify(reason) { eventBus.emit('ruinsChanged', { reason, activated: this.getActivatedCount() }); }
}
