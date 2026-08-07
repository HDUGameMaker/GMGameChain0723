/**
 * CombatSystem - 战斗系统
 * 管理敌人 + 友方地图部署单位
 * 敌人HP=5，攻击力=1，建筑生命=(长+1)*(宽+1)，人生命=2，点击攻击力=1
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';
import { scaleCombatStatsToStrength } from '../domain/CombatStrength.js';
import { getMatchupMultiplier, isDomainCompatible, resolveBattleLines } from './CombatResolver.js';

export class CombatSystem {
  constructor() {
    this.enemies = [];
    /** @type {Array<{id: string, type: string, gridX: number, gridY: number, hp: number, maxHp: number, attack: number, attackRange: number}>} */
    this.units = [];
    /** @type {Array<{id: string, enemyId: string, name: string, icon: string, hp: number, maxHp: number, attack: number, attackRange: number, attackCooldown: number}>} */
    this.tamed = [];
    this._deployMode = null;
    this._buildingSystem = null;
    this._populationSystem = null;
    this._resourceSystem = null;
    this._cultureSystem = null;
    this._mapConfig = null;
    this._editMode = null;
    this._armySystem = null;

    eventBus.on('tick', (data) => this._onTick(data));
    eventBus.on('dayStart', (data) => this._onDayStart(data));
    eventBus.on('periodChange', (data) => this._onPeriodChange(data));
  }

  // 配置读取
  get _enemyConfigs() { return configRegistry.get('enemies')?.enemies || []; }
  get _unitConfigs() { return configRegistry.get('enemies')?.units || []; }
  get _globalConfig() { return configRegistry.get('enemies')?.global || { humanHp: 2, clickAttack: 1 }; }
  get _humanHp() { return this._globalConfig.humanHp; }

  setBuildingSystem(bs) { this._buildingSystem = bs; }
  setPopulationSystem(ps) { this._populationSystem = ps; }
  setResourceSystem(rs) { this._resourceSystem = rs; }
  setCultureSystem(cs) { this._cultureSystem = cs; }
  setHeroSystem(hs) { this._heroSystem = hs; }
  setArmySystem(system) { this._armySystem = system || null; }
  setLuxurySystem(system) { this._luxurySystem = system || null; }

  damageEnemyAt(gridX, gridY, amount) {
    const enemy = this.getEnemyAt(gridX, gridY);
    if (!enemy || enemy.enemyId === 'eastern_ruin_guardian' && enemy.neutral && !enemy.hostile) return { ok: false };
    enemy.hp = Math.max(0, enemy.hp - Math.max(0, Number(amount) || 0));
    if (enemy.hp <= 0) {
      this.enemies = this.enemies.filter(item => item.id !== enemy.id);
      eventBus.emit('enemyKilled', { enemyId: enemy.id, enemyType: enemy.enemyId, cause: 'hero_skill' });
      if (enemy.boss || enemy.enemyId === 'eastern_ruin_guardian') {
        eventBus.emit('easternRuinBossDefeated', { cause: 'hero_skill' });
        eventBus.emit('gameOver', { win: true, reason: 'easternBossDefeated' });
      }
    }
    this._notify?.();
    return { ok: true, enemyId: enemy.id, destroyed: enemy.hp <= 0 };
  }

  /**
   * 友方单位被移除（阵亡/解散）时，归还其占用的建造工人池名额。
   * 仅训练营单位（occupiesWorker=true）占用 _constructionWorkers；
   * 驯化单位不占用工人，无需释放。
   */
  _releaseUnitWorker(unit) {
    if (!unit || !unit.occupiesWorker || !this._populationSystem) return;
    this._populationSystem.releaseFromConstruction(1);
  }

  init() {
    this._mapConfig = configRegistry.get('map');
    this._ensureEasternRuinBoss();
  }

  enterPlaceEnemyMode(enemyId) { this._editMode = enemyId; this._deployMode = null; store.setState({ combatPlaceMode: enemyId, deployTamedMode: false }); eventBus.emit('combatPlaceModeChanged', { enabled: true, enemyId }); }
  exitPlaceEnemyMode() { this._editMode = null; store.setState({ combatPlaceMode: false }); eventBus.emit('combatPlaceModeChanged', { enabled: false }); }
  isPlaceEnemyMode() { return this._editMode !== null; }
  getPlaceEnemyId() { return this._editMode; }

  // ===== 驯化单位部署模式 =====
  enterDeployTamedMode(tamedId) { this._deployMode = tamedId; this._editMode = null; store.setState({ deployTamedMode: tamedId, combatPlaceMode: false }); eventBus.emit('deployTamedModeChanged', { enabled: true, tamedId }); }
  exitDeployTamedMode() { this._deployMode = null; store.setState({ deployTamedMode: false }); eventBus.emit('deployTamedModeChanged', { enabled: false }); }
  isDeployTamedMode() { return this._deployMode !== null; }
  getDeployTamedId() { return this._deployMode; }
  getTamedPool() { return [...this.tamed]; }

  /** 检查某格是否可以部署驯化单位 */
  canDeployTamedAt(gridX, gridY) {
    if (!this._mapConfig) return false;
    if (gridX < 0 || gridY < 0 || gridX >= this._mapConfig.gridWidth || gridY >= this._mapConfig.gridHeight) return false;
    if (this.getEnemyAt(gridX, gridY) || this.getUnitAt(gridX, gridY)) return false;
    if (this._isBlocked(gridX, gridY)) return false;
    const ts = this._buildingSystem?._torchSystem;
    if (ts) {
      const visible = ts.getVisibilityMatrix();
      if (visible && !visible[gridY]?.[gridX]) return false;
    }
    return true;
  }

  /** 部署驯化单位到地图上 */
  deployTamed(gridX, gridY) {
    if (!this._deployMode) return false;
    const idx = this.tamed.findIndex(t => t.id === this._deployMode);
    if (idx === -1) return false;

    if (!this.canDeployTamedAt(gridX, gridY)) {
      this._broadcast('⛔ 只能在营地范围内部署驯化单位');
      return false;
    }

    const creature = this.tamed[idx];
    this.tamed.splice(idx, 1);

    // 作为友方单位加入地图
    this.units.push({
      id: 'tamed_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      type: 'tamed',
      gridX, gridY,
      hp: creature.hp,
      maxHp: creature.maxHp,
      attack: creature.attack,
      attackRange: creature.attackRange,
      attackCooldown: creature.attackCooldown || 2,
      _cooldownTicks: 0,
      source: 'tamed',
      tamedInfo: { enemyId: creature.enemyId, name: creature.name, icon: creature.icon }
    });

    this._broadcast(`🐾 部署 ${creature.name}！`);
    this._notify();
    eventBus.emit('unitSpawned', { type: 'tamed', gridX, gridY });
    return true;
  }

  getEnemyConfig(enemyId) { return this._enemyConfigs.find(e => e.id === enemyId) || null; }
  _getUnitConfig(type) { return this._unitConfigs.find(u => u.id === type) || null; }
  getAllEnemies() {
    return this.enemies.map(enemy => {
      const config = this.getEnemyConfig(enemy.enemyId) || {};
      return {
        ...enemy,
        name: config.name || enemy.name || '敌方单位',
        icon: config.icon || enemy.icon || '',
        faction: config.faction || enemy.faction || '敌对势力',
        attack: enemy.attack ?? config.attack ?? 1,
        attackRange: enemy.attackRange ?? config.attackRange ?? 1,
        speed: enemy.speed ?? config.speed ?? 1
      };
    });
  }
  getAllUnits() { return [...this.units]; }
  getEnemyAt(gridX, gridY) {
    return this.enemies.find(enemy => {
      const width = Math.max(1, Number(enemy.footprint?.width) || 1);
      const height = Math.max(1, Number(enemy.footprint?.height) || 1);
      return gridX >= enemy.gridX && gridX < enemy.gridX + width && gridY >= enemy.gridY && gridY < enemy.gridY + height;
    }) || null;
  }
  getUnitAt(gridX, gridY) { return this.units.find(u => u.gridX === gridX && u.gridY === gridY) || null; }

  previewBattleLines(attackerIds, defenderIds, context = {}) {
    const units = configRegistry.get('enemies')?.units || [];
    return resolveBattleLines(attackerIds, defenderIds, units, context);
  }

  /** 建筑生命值 = (长+1)*(宽+1) */
  _getBuildingHp(buildingId) {
    const cfg = configRegistry.getBuilding(buildingId);
    if (!cfg) return 1;
    return (cfg.footprint.width + 1) * (cfg.footprint.height + 1);
  }

  /** 生成友方单位 */
  spawnUnit(type, nearGridX, nearGridY) {
    if (!this._mapConfig) return false;
    const unitConfig = this._getUnitConfig(type);
    if (!unitConfig) return false;

    // 人文政策：单位属性乘性修饰
    const eff = this._cultureSystem ? this._cultureSystem.getEffects() : null;
    const isRanged = (unitConfig.attackRange || 1) > 1;
    const cultureDmgMul = isRanged
      ? (eff?.rangedDamageMul || eff?.archerDamageMul || 1)
      : (eff?.meleeDamageMul || eff?.warriorDamageMul || 1);
    const heroBonuses = this._heroSystem?.getBonuses?.() || {};
    const domainMul = unitConfig.domain === 'naval' ? (heroBonuses.navalPowerMul || 1) : 1;
    const siegeMul = unitConfig.roleTags?.includes('siege') ? (heroBonuses.siegePowerMul || 1) : 1;
    const dmgMul = cultureDmgMul * (heroBonuses.combatPowerMul || 1) * domainMul * siegeMul;
    // HP 乘性：unitHpMul 为生命加成（正面），unitDamageTakenMul 不应进 HP（它是"受到伤害放大"负面效果，
    // 应在敌人攻击单位时应用，见 _onTick 敌人攻击单位处）
    const hpMul = (eff?.unitHpMul || 1) * (heroBonuses.unitHpMul || 1);

    // 在建筑附近找空地
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const x = nearGridX + dx;
        const y = nearGridY + dy;
        if (x < 0 || y < 0 || x >= this._mapConfig.gridWidth || y >= this._mapConfig.gridHeight) continue;
        if (!isDomainCompatible(unitConfig.domain || 'land', this._mapConfig.grid[y]?.[x])) continue;
        if (this.getEnemyAt(x, y) || this.getUnitAt(x, y)) continue;
        let blocked = false;
        for (const b of this._buildingSystem.buildings) {
          const c = configRegistry.getBuilding(b.buildingId);
          if (!c) continue;
          if (x >= b.gridX && x < b.gridX + c.footprint.width && y >= b.gridY && y < b.gridY + c.footprint.height) { blocked = true; break; }
        }
        if (blocked) continue;
        this.units.push({
          id: 'unit_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          type, gridX: x, gridY: y,
          hp: Math.round(unitConfig.hp * hpMul),
          maxHp: Math.round(unitConfig.hp * hpMul),
          attack: Math.round(unitConfig.attack * dmgMul),
          attackRange: unitConfig.attackRange,
          attackCooldown: unitConfig.attackCooldown || 1,
          _cooldownTicks: 0,
          // 主版本人口已退役，地图部署不再占用工人
          occupiesWorker: false
        });
        this._notify();
        eventBus.emit('unitSpawned', { type, gridX: x, gridY: y });
        return true;
      }
    }
    return false;
  }

  // ===== 自然生成敌方 =====
  _onDayStart(data) {
    for (const cfg of this._enemyConfigs) {
      if (cfg.strategicOnly) continue;
      if (data.day < (cfg.spawnConditions?.minDay || 1)) continue;
      if (Math.random() > 0.15) continue;
      const pos = this._findSpawnPosition(cfg);
      if (pos) this._spawnEnemyAt(cfg.id, pos.x, pos.y);
    }
  }

  _spawnEnemyAt(enemyId, gridX, gridY) {
    const cfg = this.getEnemyConfig(enemyId);
    if (!cfg) return false;
    if (!isDomainCompatible(cfg.domain || 'land', this._mapConfig?.grid[gridY]?.[gridX])) return false;
    if (this.getEnemyAt(gridX, gridY)) return false;
    for (const b of this._buildingSystem.buildings) {
      const c = configRegistry.getBuilding(b.buildingId);
      if (!c) continue;
      if (gridX >= b.gridX && gridX < b.gridX + c.footprint.width && gridY >= b.gridY && gridY < b.gridY + c.footprint.height) return false;
    }
    this.enemies.push({
      id: 'enemy_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      enemyId, gridX, gridY,
      hp: cfg.maxHp || 5, maxHp: cfg.maxHp || 5,
      attack: cfg.attack || 1,
      attackRange: cfg.attackRange || 1,
      speed: cfg.speed || 1,
      spawnDay: store.getState('timeDay') || 1
    });
    this._notify();
    eventBus.emit('enemySpawned', { enemyId, gridX, gridY, name: cfg.name });
    this._broadcast(`⚠️ 发现 ${cfg.name}！`);
    return true;
  }

  spawnCheatEnemyNearHeadquarters() {
    const headquarters = this._buildingSystem?.buildings?.find(building =>
      configRegistry.getBuilding(building.buildingId)?.isHeadquarters
    );
    const origin = headquarters || this._mapConfig?.initialBuildings?.[0];
    if (!origin || !this._mapConfig) return { ok: false, reason: 'headquarters_not_found' };
    for (let radius = 1; radius <= 10; radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const gridX = origin.gridX + dx, gridY = origin.gridY + dy;
        if (gridX < 0 || gridY < 0 || gridX >= this._mapConfig.gridWidth || gridY >= this._mapConfig.gridHeight) continue;
        if (!isDomainCompatible('land', this._mapConfig.grid?.[gridY]?.[gridX])) continue;
        if (this.getEnemyAt(gridX, gridY) || (this._armySystem?.getArmies?.() || []).some(army => army.gridX === gridX && army.gridY === gridY)) continue;
        if (this._buildingSystem.buildings.some(building => {
          const footprint = configRegistry.getBuilding(building.buildingId)?.footprint || { width: 1, height: 1 };
          return gridX >= building.gridX && gridX < building.gridX + footprint.width
            && gridY >= building.gridY && gridY < building.gridY + footprint.height;
        })) continue;
        const enemy = {
          id: `cheat_enemy_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          enemyId: 'enemy_expansion_force', gridX, gridY,
          name: '金手指测试敌人', faction: '敌对势力',
          hp: 50, maxHp: 50, attack: 20, attackRange: 1,
          cp: 1, currentCp: 1, speed: 1, spawnDay: store.getState('timeDay') || 1,
          cheatSpawned: true
        };
        this.enemies.push(enemy);
        this._notify();
        eventBus.emit('enemySpawned', { enemyId: enemy.enemyId, gridX, gridY, name: enemy.name });
        return { ok: true, enemy };
      }
    }
    return { ok: false, reason: 'no_spawn_tile' };
  }

  _ensureEasternRuinBoss() {
    const config = this.getEnemyConfig('eastern_ruin_guardian');
    if (!config || this.enemies.some(enemy => enemy.enemyId === config.id) || !this._mapConfig) return;
    const position = this._findEasternRuinPosition(config.footprint || { width: 2, height: 2 });
    if (!position) return;
    this.enemies.push({
      id: 'boss_eastern_ruin', enemyId: config.id,
      gridX: position.x, gridY: position.y,
      originX: position.x, originY: position.y,
      hp: config.maxHp, maxHp: config.maxHp,
      attack: config.attack, attackRange: config.attackRange, speed: config.speed,
      footprint: structuredClone(config.footprint),
      alertRange: config.alertRange, homeHealPerTick: config.homeHealPerTick,
      neutral: true, hostile: false, boss: true, ruinRadius: 4
    });
    this._notify();
  }

  _findEasternRuinPosition(footprint) {
    const width = Math.max(2, Number(footprint.width) || 2);
    const height = Math.max(2, Number(footprint.height) || 2);
    const mapWidth = this._mapConfig.gridWidth;
    const mapHeight = this._mapConfig.gridHeight;
    const centerY = Math.floor(mapHeight / 2);
    for (let x = mapWidth - width - 4; x >= Math.floor(mapWidth * 0.68); x -= 1) {
      for (let offset = 0; offset < mapHeight / 2; offset += 1) {
        for (const y of [centerY + offset, centerY - offset]) {
          if (y < 3 || y + height >= mapHeight - 3) continue;
          let valid = true;
          for (let dy = 0; dy < height && valid; dy += 1) for (let dx = 0; dx < width; dx += 1) {
            if (!isDomainCompatible('land', this._mapConfig.grid[y + dy]?.[x + dx])) valid = false;
          }
          if (valid) return { x, y };
        }
      }
    }
    return null;
  }

  _distanceToEnemyFootprint(x, y, enemy) {
    const width = Math.max(1, Number(enemy.footprint?.width) || 1);
    const height = Math.max(1, Number(enemy.footprint?.height) || 1);
    const dx = Math.max(0, enemy.gridX - x, x - (enemy.gridX + width - 1));
    const dy = Math.max(0, enemy.gridY - y, y - (enemy.gridY + height - 1));
    return dx + dy;
  }

  /** 供 ArmySystem 自动开火做射程判断的 public 距离计算 */
  getEnemyDistanceFrom(x, y, enemy) {
    return this._distanceToEnemyFootprint(x, y, enemy);
  }

  /** 军团连续渲染坐标(旧存档无 renderX 时回落格点),距离判定用 */
  _armyX(army) { return Number.isFinite(army?.renderX) ? army.renderX : (army?.gridX ?? 0); }
  _armyY(army) { return Number.isFinite(army?.renderY) ? army.renderY : (army?.gridY ?? 0); }

  attackBossWithArmy(enemyId, armyId, { auto = false, skipCp = false } = {}) {
    const boss = this.enemies.find(enemy => enemy.id === enemyId || enemy.enemyId === enemyId);
    const army = this._armySystem?.getArmy?.(armyId);
    if (!boss?.boss || !army) return { ok: false, reason: 'enemy_unavailable' };
    const distance = this._distanceToEnemyFootprint(this._armyX(army), this._armyY(army), boss);
    if (distance > army.attackRange) return { ok: false, reason: 'target_out_of_range', distance, attackRange: army.attackRange };
    if (!skipCp) {
      const cp = this._armySystem.consumeAttackCp?.(armyId);
      if (cp && !cp.ok) return cp;
    }
    boss.neutral = false;
    boss.hostile = true;
    const attacks = [];
    const playerFirst = army.speed >= boss.speed;
    const playerAttack = () => {
      if (!this.enemies.includes(boss)) return;
      const damage = Math.min(boss.hp, army.attack);
      boss.hp = Math.max(0, boss.hp - army.attack);
      attacks.push({ side: 'player', damage, hp: boss.hp });
      this._armySystem._applyHeroActiveAttackLifesteal?.(armyId, damage);
      if (boss.hp <= 0) {
        this.enemies = this.enemies.filter(enemy => enemy !== boss);
        eventBus.emit('easternRuinBossDefeated', { armyId });
        eventBus.emit('gameOver', { win: true, reason: 'easternBossDefeated', armyId });
      }
    };
    const bossAttack = () => {
      if (!this.enemies.includes(boss) || distance > boss.attackRange) return;
      const damage = this._armySystem.applyDamage?.(armyId, boss.attack);
      attacks.push({ side: 'boss', damage: boss.attack, destroyed: damage?.destroyed === true });
    };
    if (playerFirst) {
      playerAttack();
      if (this.enemies.includes(boss)) bossAttack();
      if (this.enemies.includes(boss) && this._armySystem.getArmy?.(armyId) && army.speed - boss.speed >= 2) playerAttack();
    } else {
      bossAttack();
      if (this._armySystem.getArmy?.(armyId)) playerAttack();
      if (this.enemies.includes(boss) && this._armySystem.getArmy?.(armyId) && boss.speed - army.speed >= 2 && distance <= boss.attackRange) bossAttack();
    }
    const healed = this._armySystem.healArmyAfterBattle?.(armyId)?.healed || 0;
    this._notify();
    eventBus.emit('bossBattleResolved', { bossId: boss.id, armyId, attacks, healed, bossHp: boss.hp });
    return { ok: true, bossId: boss.id, armyId, attacks, healed, bossHp: boss.hp, hostile: boss.hostile };
  }

  attackEnemyWithArmy(enemyId, armyId, { auto = false, skipCp = false } = {}) {
    const enemy = this.enemies.find(candidate => candidate.id === enemyId || candidate.enemyId === enemyId);
    if (!enemy) return { ok: false, reason: 'enemy_unavailable' };
    if (enemy.boss) return this.attackBossWithArmy(enemy.id, armyId, { auto, skipCp });
    const army = this._armySystem?.getArmy?.(armyId);
    if (!army) return { ok: false, reason: 'unknown_army' };
    const distance = this._distanceToEnemyFootprint(this._armyX(army), this._armyY(army), enemy);
    if (distance > army.attackRange) return { ok: false, reason: 'target_out_of_range', distance, attackRange: army.attackRange };
    if (!skipCp) {
      const cp = this._armySystem.consumeAttackCp?.(armyId);
      if (cp && !cp.ok) return cp;
    }
    const attacks = [];
    const rewards = [];
    let luxuryDrop = null;
    const playerAttack = (bonusStrike = false) => {
      if (!this.enemies.includes(enemy) || !this._armySystem.getArmy?.(armyId)) return false;
      const damage = Math.min(enemy.hp, army.attack);
      enemy.hp = Math.max(0, enemy.hp - army.attack);
      attacks.push({ side: 'player', damage, hp: enemy.hp, bonusStrike });
      this._armySystem._applyHeroActiveAttackLifesteal?.(armyId, damage);
      if (enemy.hp <= 0) {
        this.enemies = this.enemies.filter(candidate => candidate !== enemy);
        eventBus.emit('enemyKilled', { enemyId: enemy.id, enemyType: enemy.enemyId, armyId });
        const configuredRewards = Array.isArray(enemy.rewards) && enemy.rewards.length
          ? enemy.rewards
          : [{ resourceId: 'food', amount: Math.max(2, Math.round((enemy.maxHp + enemy.attack * 1.2) * 0.08)) }];
        for (const reward of configuredRewards) {
          const amount = this._resourceSystem?.addClamped?.(reward.resourceId, Math.max(0, Number(reward.amount) || 0)) || 0;
          if (amount > 0) rewards.push({ resourceId: reward.resourceId, amount });
        }
        const luxuries = configRegistry.getHistoricalContent?.().luxuries || [];
        const seed = [...String(enemy.id)].reduce((sum, char) => sum + char.charCodeAt(0), 0) + (store.getState('timeDay') || 1) * 17;
        if (luxuries.length && (seed % 100) < 3) {
          const luxury = luxuries[seed % luxuries.length];
          this._luxurySystem?.addLuxury?.(luxury.id, 1);
          luxuryDrop = luxury.id;
        }
        return true;
      }
      return false;
    };
    const enemyAttack = () => {
      if (!this.enemies.includes(enemy) || distance > (enemy.attackRange || 1)) return false;
      const result = this._armySystem.applyDamage?.(armyId, enemy.attack || 1);
      attacks.push({ side: 'enemy', damage: enemy.attack || 1, destroyed: result?.destroyed === true });
      return result?.destroyed === true;
    };
    const playerFirst = army.speed >= (enemy.speed || 1);
    if (playerFirst) {
      if (!playerAttack() && !enemyAttack() && army.speed - (enemy.speed || 1) >= 2) playerAttack(true);
    } else if (!enemyAttack()) {
      const enemySurvived = !playerAttack();
      if (enemySurvived && this._armySystem.getArmy?.(armyId) && (enemy.speed || 1) - army.speed >= 2 && distance <= (enemy.attackRange || 1)) enemyAttack();
    }
    const healed = this._armySystem.getArmy?.(armyId) ? (this._armySystem.healArmyAfterBattle?.(armyId)?.healed || 0) : 0;
    this._notify();
    eventBus.emit('enemyBattleResolved', { enemyId: enemy.id, armyId, attacks, healed, enemyHp: Math.max(0, enemy.hp) });
    return { ok: true, enemyId: enemy.id, armyId, attacks, healed, enemyHp: Math.max(0, enemy.hp), destroyed: enemy.hp <= 0, victory: enemy.hp <= 0, rewards, luxuryDrop };
  }

  _findSpawnPosition(config = {}) {
    if (!this._mapConfig) return null;
    // 在光源边缘6~13格环带内刷新
    const ringPos = this._findSpawnOnVisibilityRing();
    if (ringPos && isDomainCompatible(config.domain || 'land', this._mapConfig.grid[ringPos.y]?.[ringPos.x])) return ringPos;
    // 回退：全图随机（仅排除建筑/已占格/光照区域内）
    const visible = this._getVisibilityMatrix();
    for (let i = 0; i < 100; i++) {
      const x = Math.floor(Math.random() * this._mapConfig.gridWidth);
      const y = Math.floor(Math.random() * this._mapConfig.gridHeight);
      if (!this._mapConfig.grid[y]?.[x]) continue;
      if (!isDomainCompatible(config.domain || 'land', this._mapConfig.grid[y][x])) continue;
      if (this._isBlocked(x, y)) continue;
      if (this.getEnemyAt(x, y) || this.getUnitAt(x, y)) continue;
      // 不在光照区域内
      if (visible && visible[y]?.[x]) continue;
      return { x, y };
    }
    return null;
  }

  _getVisibilityMatrix() {
    const ts = this._buildingSystem?._torchSystem;
    return ts ? ts.getVisibilityMatrix() : null;
  }

  /** 在已照明区外缘向外 3~8 格的环带里找可刷新空地 */
  _findSpawnOnVisibilityRing() {
    if (!this._mapConfig) return null;
    const gh = this._mapConfig.gridHeight;
    const gw = this._mapConfig.gridWidth;
    const visible = this._getVisibilityMatrix();
    if (!visible || visible.length === 0) return null;

    // 9.怪物只能在光源边缘6格以外生成
    // 收集光源边缘
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    const edge = [];
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (!visible[y][x]) continue;
        for (const [dx, dy] of dirs) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          if (!visible[ny][nx]) { edge.push({ x, y }); break; }
        }
      }
    }
    if (edge.length === 0) return null;

    // 从边界向外 6+ 格尝试
    for (let attempt = 0; attempt < 80; attempt++) {
      const e = edge[Math.floor(Math.random() * edge.length)];
      const dist = 6 + Math.floor(Math.random() * 8); // 6~13
      const ang = Math.random() * Math.PI * 2;
      const x = Math.round(e.x + Math.cos(ang) * dist);
      const y = Math.round(e.y + Math.sin(ang) * dist);
      if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
      if (!this._mapConfig.grid[y]?.[x]) continue;
      if (this._isBlocked(x, y)) continue;
      if (this.getEnemyAt(x, y) || this.getUnitAt(x, y)) continue;
      return { x, y };
    }
    return null;
  }

  /** 某格是否被建筑占用 */
  _isBlocked(x, y) {
    if (!this._buildingSystem) return false;
    for (const b of this._buildingSystem.buildings) {
      const c = configRegistry.getBuilding(b.buildingId);
      if (!c) continue;
      if (x >= b.gridX && x < b.gridX + c.footprint.width &&
          y >= b.gridY && y < b.gridY + c.footprint.height) return true;
    }
    return false;
  }

  // ===== 每tick AI：敌人+友方 =====
  _onTick(data) {
    let changed = false;

    // 友方单位：不自动移动，只攻击攻击范围内的敌人（由玩家拖动控制位置），有攻击间隔
    for (const unit of this.units) {
      if (unit._cooldownTicks > 0) {
        unit._cooldownTicks--;
        continue;
      }
      const nearestEnemy = this._findNearestEnemy(unit.gridX, unit.gridY);
      if (!nearestEnemy) continue;

      const dist = Math.abs(unit.gridX - nearestEnemy.gridX) + Math.abs(unit.gridY - nearestEnemy.gridY);

      if (dist <= unit.attackRange) {
        const unitConfig = this._getUnitConfig(unit.type);
        const enemyConfig = this.getEnemyConfig(nearestEnemy.enemyId);
        const attackMul = unit.source === 'tamed' ? 1 : getMatchupMultiplier(unitConfig, enemyConfig);
        nearestEnemy.hp -= Math.max(1, Math.round(unit.attack * attackMul));
        const unitLabel = unit.source === 'tamed' ? (unit.tamedInfo?.name || '驯化单位') : (unitConfig?.name || unit.type || '战斗单位');
        this._broadcast(`⚔️ ${unitLabel} 攻击！${nearestEnemy.hp <= 0 ? '击杀敌人' : `敌人HP ${nearestEnemy.hp}`}`);
        if (nearestEnemy.hp <= 0) {
          const idx = this.enemies.indexOf(nearestEnemy);
          if (idx >= 0) this.enemies.splice(idx, 1);
          this._broadcast(`⚔️ 敌人被击杀！`);
        }
        unit._cooldownTicks = unit.attackCooldown;
        changed = true;
      }
    }

    // 敌方单位：优先攻击友方单位，其次建筑
    for (const enemy of this.enemies) {
      const cfg = this.getEnemyConfig(enemy.enemyId);
      if (!cfg) continue;
      if (enemy.boss) {
        if (this._updateEasternRuinBoss(enemy, cfg)) changed = true;
        continue;
      }

      // 先找最近的友方单位
      let nearestUnit = null, nearDist = Infinity;
      for (const unit of this.units) {
        const d = Math.abs(enemy.gridX - unit.gridX) + Math.abs(enemy.gridY - unit.gridY);
        if (d < nearDist) { nearDist = d; nearestUnit = unit; }
      }

      if (nearestUnit && nearDist <= 1) {
        // 攻击友方单位
        const unitConfig = this._getUnitConfig(nearestUnit.type);
        const counterMul = nearestUnit.source === 'tamed' ? 1 : getMatchupMultiplier(cfg, unitConfig);
        nearestUnit.hp -= Math.max(1, Math.round((cfg.attack || 1) * counterMul));
        const unitLabel = nearestUnit.source === 'tamed' ? (nearestUnit.tamedInfo?.name || '驯化单位') : (unitConfig?.name || nearestUnit.type || '战斗单位');
        this._broadcast(`💥 ${cfg.name} 攻击${unitLabel}！`);
        if (nearestUnit.hp <= 0) {
          const idx = this.units.indexOf(nearestUnit);
          if (idx >= 0) {
            this.units.splice(idx, 1);
            // 训练营单位阵亡：归还占用的建造工人池名额
            this._releaseUnitWorker(nearestUnit);
          }
          this._broadcast(`💀 单位阵亡！`);
        }
        changed = true;
      } else if (nearestUnit && nearDist > 1) {
        // 向友方单位移动
        if (this._moveGeneric(enemy, nearestUnit.gridX, nearestUnit.gridY)) changed = true;
      } else {
        // 没有友方单位 → 攻击建筑
        const target = this._findNearestTarget(enemy, cfg);
        if (!target) {
          if (this._moveGeneric(enemy, Math.floor(this._mapConfig.gridWidth/2), Math.floor(this._mapConfig.gridHeight/2))) changed = true;
          continue;
        }
        const dist = this._distToBuilding(enemy.gridX, enemy.gridY, target);
        if (dist <= 1) {
          this._doAttack(enemy, cfg, target);
        } else {
          const tCfg = configRegistry.getBuilding(target.buildingId);
          if (tCfg) {
            if (this._moveGeneric(enemy, target.gridX + Math.floor(tCfg.footprint.width/2), target.gridY + Math.floor(tCfg.footprint.height/2))) changed = true;
          }
        }
      }
    }

    // ===== 医疗站治疗 =====
    if (this._buildingSystem) {
      for (const b of this._buildingSystem.buildings) {
        if (b.buildingId !== 'medical_station' || b.status !== 'active') continue;
        const workers = b.currentWorkers || 0;
        if (workers <= 0) continue;

        // 找附近1格内的受伤单位
        const healTargets = [];
        for (const unit of this.units) {
          if (unit.hp >= unit.maxHp) continue;
          const dist = Math.abs(unit.gridX - b.gridX) + Math.abs(unit.gridY - b.gridY);
          if (dist <= 1) {
            healTargets.push(unit);
          }
        }

        // 最多治疗 workers 个
        const healCount = Math.min(healTargets.length, workers);
        for (let i = 0; i < healCount; i++) {
          healTargets[i].hp = Math.min(healTargets[i].hp + 1, healTargets[i].maxHp);
          changed = true;
        }
        if (healCount > 0) {
          this._broadcast(`💚 医疗站治疗了 ${healCount} 名士兵`);
        }
      }

      // ===== 维修站修复建筑 =====
      for (const b of this._buildingSystem.buildings) {
        if (b.buildingId !== 'repair_station' || b.status !== 'active') continue;
        const workers = b.currentWorkers || 0;
        if (workers <= 0) continue;

        // 找附近1格内受损伤的建筑
        const repairTargets = [];
        for (const building of this._buildingSystem.buildings) {
          if (building === b) continue; // 维修站自己
          if (!building._damage || building._damage <= 0) continue;
          const dist = Math.abs(building.gridX - b.gridX) + Math.abs(building.gridY - b.gridY);
          if (dist <= 1) {
            repairTargets.push(building);
          }
        }

        // 最多修复 workers 个
        const repairCount = Math.min(repairTargets.length, workers);
        for (let i = 0; i < repairCount; i++) {
          repairTargets[i]._damage = Math.max(0, repairTargets[i]._damage - 1);
          changed = true;
        }
        if (repairCount > 0) {
          this._broadcast(`🔧 维修站修复了 ${repairCount} 个建筑`);
        }
      }
    }

    if (changed) this._notify();
  }

  _updateEasternRuinBoss(boss, config) {
    if (!boss.hostile || !this._armySystem) return false;
    const armies = this._armySystem.getArmies?.() || [];
    let target = null;
    let targetDistance = Infinity;
    for (const army of armies) {
      const distance = this._distanceToEnemyFootprint(army.gridX, army.gridY, boss);
      if (distance <= (boss.alertRange || 4) && distance < targetDistance) {
        target = army;
        targetDistance = distance;
      }
    }
    if (target) {
      if (targetDistance <= (boss.attackRange || 3)) {
        this._armySystem.applyDamage?.(target.id, boss.attack || config.attack || 1500);
        return true;
      }
      return this._moveBossToward(boss, target.gridX, target.gridY, boss.speed || 3);
    }
    const atHome = boss.gridX === boss.originX && boss.gridY === boss.originY;
    if (!atHome) return this._moveBossToward(boss, boss.originX, boss.originY, boss.speed || 3);
    const previousHp = boss.hp;
    boss.hp = Math.min(boss.maxHp, boss.hp + (boss.homeHealPerTick || 200));
    return boss.hp !== previousHp;
  }

  _moveBossToward(boss, targetX, targetY, steps) {
    let moved = false;
    for (let step = 0; step < Math.max(1, Math.floor(steps)); step += 1) {
      const dx = Math.sign(targetX - boss.gridX);
      const dy = Math.sign(targetY - boss.gridY);
      const candidates = Math.abs(targetX - boss.gridX) >= Math.abs(targetY - boss.gridY)
        ? [{ x: boss.gridX + dx, y: boss.gridY }, { x: boss.gridX, y: boss.gridY + dy }]
        : [{ x: boss.gridX, y: boss.gridY + dy }, { x: boss.gridX + dx, y: boss.gridY }];
      const next = candidates.find(position => this._canBossOccupy(position.x, position.y, boss));
      if (!next) break;
      boss.gridX = next.x;
      boss.gridY = next.y;
      moved = true;
    }
    return moved;
  }

  _canBossOccupy(x, y, boss) {
    const width = Math.max(2, Number(boss.footprint?.width) || 2);
    const height = Math.max(2, Number(boss.footprint?.height) || 2);
    for (let dy = 0; dy < height; dy += 1) for (let dx = 0; dx < width; dx += 1) {
      if (!isDomainCompatible('land', this._mapConfig?.grid[y + dy]?.[x + dx])) return false;
    }
    return x >= 0 && y >= 0 && x + width <= this._mapConfig.gridWidth && y + height <= this._mapConfig.gridHeight;
  }

  _findNearestEnemy(ex, ey) {
    let best = null, bestDist = Infinity;
    for (const e of this.enemies) {
      if (e.neutral === true && e.hostile !== true) continue;
      const d = Math.abs(ex - e.gridX) + Math.abs(ey - e.gridY);
      if (d < bestDist) { bestDist = d; best = e; }
    }
    return best;
  }

  _findNearestTarget(enemy, cfg) {
    if (!this._buildingSystem) return null;
    const isWild = !enemy.enemyId.startsWith('robot');
    let best = null, bestDist = Infinity;
    for (const b of this._buildingSystem.buildings) {
      if (b.status !== 'active') continue;
      const bCfg = configRegistry.getBuilding(b.buildingId);
      if (!bCfg) continue;
      if (isWild && !bCfg.tags?.includes('dorm') && best) continue;
      const d = this._distToBuilding(enemy.gridX, enemy.gridY, b);
      if (d < bestDist) { bestDist = d; best = b; }
    }
    return best;
  }

  _distToBuilding(ex, ey, building) {
    const cfg = configRegistry.getBuilding(building.buildingId);
    if (!cfg) return Infinity;
    const dx = Math.max(0, building.gridX - ex, ex - (building.gridX + cfg.footprint.width - 1));
    const dy = Math.max(0, building.gridY - ey, ey - (building.gridY + cfg.footprint.height - 1));
    return dx + dy;
  }

  /** 通用的移动函数（避开建筑、敌人、友方单位） */
  _moveGeneric(entity, tx, ty) {
    const dx = Math.sign(tx - entity.gridX);
    const dy = Math.sign(ty - entity.gridY);
    const choices = [];
    if (dx !== 0) choices.push({ gridX: entity.gridX + dx, gridY: entity.gridY });
    if (dy !== 0) choices.push({ gridX: entity.gridX, gridY: entity.gridY + dy });
    if (dx !== 0) choices.push({ gridX: entity.gridX + dx, gridY: entity.gridY + (dy || 1) });
    if (dy !== 0) choices.push({ gridX: entity.gridX + (dx || 1), gridY: entity.gridY + dy });
    choices.push({ gridX: entity.gridX + 1, gridY: entity.gridY }, { gridX: entity.gridX - 1, gridY: entity.gridY });
    choices.push({ gridX: entity.gridX, gridY: entity.gridY + 1 }, { gridX: entity.gridX, gridY: entity.gridY - 1 });

    for (const pos of choices) {
      if (pos.gridX < 0 || pos.gridY < 0) continue;
      if (!this._mapConfig) continue;
      if (pos.gridX >= this._mapConfig.gridWidth || pos.gridY >= this._mapConfig.gridHeight) continue;
      if (this.getEnemyAt(pos.gridX, pos.gridY) || this.getUnitAt(pos.gridX, pos.gridY)) continue;
      let blocked = false;
      for (const b of this._buildingSystem.buildings) {
        const c = configRegistry.getBuilding(b.buildingId);
        if (!c) continue;
        if (pos.gridX >= b.gridX && pos.gridX < b.gridX + c.footprint.width && pos.gridY >= b.gridY && pos.gridY < b.gridY + c.footprint.height) { blocked = true; break; }
      }
      if (blocked) continue;
      entity.gridX = pos.gridX;
      entity.gridY = pos.gridY;
      return true;
    }
    return false;
  }

  // ===== 攻击（敌人打建筑） =====
  _doAttack(enemy, cfg, targetBuilding) {
    const isRobot = enemy.enemyId.startsWith('robot');
    if (isRobot) {
      const hp = this._getBuildingHp(targetBuilding.buildingId);
      if (!targetBuilding._damage) targetBuilding._damage = 0;
      targetBuilding._damage += cfg.attack || 1;
      this._broadcast(`💥 ${cfg.name} 攻击建筑！(${targetBuilding._damage}/${hp})`);
      if (targetBuilding._damage >= hp) {
        const bCfg = configRegistry.getBuilding(targetBuilding.buildingId);
        const idx = this._buildingSystem.buildings.indexOf(targetBuilding);
        if (idx >= 0) {
          this._buildingSystem.demolishBuilding(idx, true);
          this._broadcast(`💥 ${cfg.name} 摧毁了 ${bCfg?.name || targetBuilding.buildingId}！`);
          eventBus.emit('populationChanged', { current: this._populationSystem.current, direction: 'enemy' });
        }
        targetBuilding._damage = 0;
      }
      if (targetBuilding.currentWorkers > 0) {
        targetBuilding.currentWorkers -= 1;
        this._broadcast(`💀 ${cfg.name} 袭击了建筑！1 名工人遇害`);
      }
      this._notify();
    } else {
      if (!targetBuilding._humanDamage) targetBuilding._humanDamage = 0;
      targetBuilding._humanDamage += cfg.attack || 1;
      if (targetBuilding._humanDamage >= 2) {
        targetBuilding._humanDamage = 0;
        this._populationSystem.current = Math.max(0, this._populationSystem.current - 1);
        this._populationSystem.refresh();
        this._broadcast(`💀 ${cfg.name} 袭击！损失 1 人口`);
      }
    }
    eventBus.emit('populationChanged', { current: this._populationSystem.current, direction: 'enemy' });
  }

  // ===== 广播 =====
  _broadcast(msg) { eventBus.emit('combatBroadcast', { message: msg }); console.log('[Combat] ' + msg); }
  _notify() { if (!this._version) this._version = 0; store.setState({ combatVersion: ++this._version }); }
  _onPeriodChange(data) {}

  // ===== 存档 =====
  getState() { return { combatBalanceVersion: 2, enemies: this.enemies.map(e => ({ ...e })), units: this.units.map(u => ({ ...u })), tamed: this.tamed.map(t => ({ ...t })) }; }
  restoreState(state) {
    const validEnemyIds = new Set((configRegistry.get('enemies')?.enemies || []).map(enemy => enemy.id));
    const migrateCombatBalance = Number(state?.combatBalanceVersion) < 2;
    this.enemies = (state?.enemies || []).filter(enemy => validEnemyIds.has(enemy.enemyId)).map(enemy => (
      migrateCombatBalance && enemy.enemyId !== 'eastern_ruin_guardian' && enemy.boss !== true && enemy.cheatSpawned !== true
        ? scaleCombatStatsToStrength(enemy, 2)
        : { ...enemy }
    ));
    if (!state?.units) { this.units = []; } else { this.units = state.units.map(u => ({ ...u })); }
    if (!state?.tamed) { this.tamed = []; } else { this.tamed = state.tamed.map(t => ({ ...t })); }
    this._ensureEasternRuinBoss();
    this._notify();
  }
}
