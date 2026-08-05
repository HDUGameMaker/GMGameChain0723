/**
 * InvasionSystem - 入侵系统
 * 入侵时间、强度、贡品、惩罚和复归规则均由 enemies.invasion 配置驱动
 */
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';
import { configRegistry } from '../core/ConfigRegistry.js';
import { getArmyCombatPower, getFormationStatusText } from '../utils/FormationUtils.js';
import { calculateCombatStrength } from '../domain/CombatStrength.js';

export class InvasionSystem {
 constructor() {
    this._activeInvasion = null;   // { combatPower, dayCreated, tributeFoodCost, tributeMultiplier }
    this._lastPunishDay = 0;       // 上次惩罚在哪天
    this._nextDay = 0;             // 下次入侵在哪天
    this._invasionHistory = [];    // 历史记录
    this._pendingRevives = [];     // { unitIds, reviveDay }
    this._armySystem = null;
    this._enemyExpansionSystem = null;
    this._buildingSystem = null;
    this._eraSystem = null;
    this._techSystem = null;
    this._cultureSystem = null;
    this._ancientRuinWave = 0;

    eventBus.on('dayStart', (data) => this._onDayStart(data));
  }

  /* ===== 配置 ===== */
  get _invasionConfig() {
    const ec = configRegistry.get('enemies');
    return ec?.invasion || {};
  }

  get _unitConfigs() { return configRegistry.get('enemies')?.units || []; }

  setArmySystem(armySystem) { this._armySystem = armySystem; }
  setSystems({ enemyExpansion, building, era, tech, culture } = {}) {
    this._enemyExpansionSystem = enemyExpansion || null;
    this._buildingSystem = building || null;
    this._eraSystem = era || null;
    this._techSystem = tech || null;
    this._cultureSystem = culture || null;
  }

  _notifyArmyChanged(reason) {
    const version = (store.getState('armyVersion') || 0) + 1;
    store.setState({ armyVersion: version });
    eventBus.emit('armyChanged', { reason, version });
  }

  _commitArmies(armies, reason) {
    store.setState({ armies: [...armies] });
    this._notifyArmyChanged(reason);
  }

  /* ===== 调度 ===== */
  _randomBetween(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  _cfgNumber(key, fallback) {
    const value = this._invasionConfig?.[key];
    return Number.isFinite(value) ? value : fallback;
  }

  _cfgString(key, fallback) {
    const value = this._invasionConfig?.[key];
    return typeof value === 'string' && value ? value : fallback;
  }

  _scheduleNext() {
    const min = this._cfgNumber('nextDelayMinDays', 2);
    const max = this._cfgNumber('nextDelayMaxDays', 5);
    const delay = this._randomBetween(Math.min(min, max), Math.max(min, max));
    const day = store.getState('timeDay') || 1;
    this._nextDay = day + delay;
    this._updateUI();
  }

  _scheduleFirst() {
    const day = store.getState('timeDay') || 1;
    this._nextDay = Math.max(day, this._cfgNumber('firstDay', 30));
    this._updateUI();
  }

  _delayNextInvasion(days, reason) {
    const day = store.getState('timeDay') || 1;
    this._nextDay = Math.max(this._nextDay || 0, day + days);
    this._updateUI();
    eventBus.emit('combatBroadcast', { message: `🛡️ ${reason}，未来${days}日内不会触发入侵` });
  }

  _rollTributeCost(combatPower) {
    const min = this._cfgNumber('tributeMultiplierMin', 1);
    const max = this._cfgNumber('tributeMultiplierMax', 10);
    const multiplier = this._randomBetween(Math.min(min, max), Math.max(min, max));
    return {
      multiplier,
      foodCost: Math.max(1, Math.round(Math.max(1, combatPower || 1) * multiplier))
    };
  }

  /* ===== 生成入侵 ===== */
  _generateInvasion(forcePower) {
    const day = store.getState('timeDay') || 1;
    const baseA = this._cfgNumber('baseA', 2);
    const dayMulB = this._cfgNumber('dayMulB', 0.8);
    const daySqMulC = this._cfgNumber('daySqMulC', 0.03);
    const base = forcePower ?? Math.round(baseA + day * dayMulB + day * day * daySqMulC);
    const tribute = this._rollTributeCost(base);
    this._activeInvasion = {
      combatPower: base,
      tributeFoodCost: tribute.foodCost,
      tributeMultiplier: tribute.multiplier,
      dayCreated: day,
      lastPunishDay: this._lastPunishDay || day,
    };
    this._updateUI();
    eventBus.emit('combatBroadcast', { message: `⚠️ 入侵警报！战斗力 ${base} 的敌人正在逼近！` });
  }

  /* ===== 每日触发 ===== */
  _onDayStart(data) {
    const day = data?.day || store.getState('timeDay') || 1;
    this._processPendingRevives(day);
    if (day % 7 === 6) {
      eventBus.emit('combatBroadcast', { message: '⚠️ 远古遗迹警报：侦察到东部异常活动，明日将有敌军来袭！' });
      eventBus.emit('ancientRuinWaveWarning', { day, arrivalDay: day + 1 });
    }
    if (day % 7 === 0) this._spawnAncientRuinWave(day);
    this._nextDay = day + (7 - (day % 7) || 7);
    this._updateUI();
  }

  _spawnAncientRuinWave(day) {
    if (!this._enemyExpansionSystem || !this._buildingSystem) return false;
    const headquarters = this._buildingSystem.buildings.find(building => configRegistry.getBuilding(building.buildingId)?.isHeadquarters);
    const map = configRegistry.get('map');
    if (!headquarters || !map) return false;
    this._ancientRuinWave += 1;
    const playerArmies = (this._armySystem?.getArmies?.() || [])
      .filter(army => (!army.ownerId || army.ownerId === 'player') && (army.unitIds?.length || army.heroId));
    const count = Math.min(10, playerArmies.length * 2);
    const strengths = playerArmies.map(army => {
      const stats = this._armySystem?.getArmyStats?.(army.id) || army;
      const cp = this._armySystem?.getArmyCpMax?.(army.id) || army.maxCp || army.cp || 1;
      return calculateCombatStrength({ ...stats, cp });
    }).filter(value => Number.isFinite(value) && value > 0);
    const averagePlayerStrength = strengths.length
      ? strengths.reduce((sum, value) => sum + value, 0) / strengths.length
      : 1;
    const targetStrength = Math.min(5000, Math.max(1, Math.round(averagePlayerStrength * 1.5)));
    const types = [
      { id: 'ancient_ruin_berserker', hp: 260, attack: 70, attackRange: 1, speed: 2, cp: 1 },
      { id: 'ancient_ruin_archer', hp: 170, attack: 48, attackRange: 3, speed: 3, cp: 1 },
      { id: 'ancient_ruin_overseer', hp: 210, attack: 42, attackRange: 2, speed: 2, cp: 3 }
    ];
    const occupied = new Set([
      ...(this._enemyExpansionSystem.getAllCells?.() || []).map(enemy => `${enemy.x},${enemy.y}`),
      ...playerArmies.map(army => `${army.gridX},${army.gridY}`),
      ...(this._buildingSystem.buildings || []).flatMap(building => {
        const footprint = configRegistry.getBuilding(building.buildingId)?.footprint || { width: 1, height: 1 };
        const cells = [];
        for (let y = 0; y < (footprint.height || 1); y += 1) for (let x = 0; x < (footprint.width || 1); x += 1) cells.push(`${building.gridX + x},${building.gridY + y}`);
        return cells;
      })
    ]);
    const preferredX = Math.min(map.gridWidth - 1, headquarters.gridX + 20);
    const preferredY = Math.max(0, Math.min(map.gridHeight - 1, headquarters.gridY + Math.floor((configRegistry.getBuilding(headquarters.buildingId)?.footprint?.height || 1) / 2)));
    const spawnCells = [];
    const radiusLimit = Math.max(map.gridWidth, map.gridHeight);
    for (let radius = 0; radius <= radiusLimit && spawnCells.length < count; radius += 1) {
      for (let dy = -radius; dy <= radius && spawnCells.length < count; dy += 1) {
        for (let dx = -radius; dx <= radius && spawnCells.length < count; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const x = preferredX + dx, y = preferredY + dy;
          if (x < 0 || y < 0 || x >= map.gridWidth || y >= map.gridHeight) continue;
          if (x <= headquarters.gridX || ['S', 'W'].includes(map.grid?.[y]?.[x]) || occupied.has(`${x},${y}`)) continue;
          occupied.add(`${x},${y}`);
          spawnCells.push({ x, y });
        }
      }
    }
    let spawned = 0;
    const actualStrengths = [];
    for (let index = 0; index < spawnCells.length; index += 1) {
      const type = types[index % types.length];
      const fixedPower = (type.speed - 1) * 30 + (type.attackRange - 1) * 50;
      const targetCore = targetStrength / (Math.max(1, type.cp) * 1.3);
      const scale = Math.max(0.05, (targetCore - fixedPower) / Math.max(1, type.hp + type.attack * 1.2));
      let hp = Math.max(1, Math.round(type.hp * scale));
      let attack = Math.max(1, Math.round(type.attack * scale));
      let actualStrength = calculateCombatStrength({ hp, attack, attackRange: type.attackRange, speed: type.speed, cp: type.cp });
      if (actualStrength > 5000) {
        const maxCore = 5000 / (Math.max(1, type.cp) * 1.3) - fixedPower;
        attack = Math.max(1, Math.floor((maxCore - hp) / 1.2));
        if (hp + attack * 1.2 > maxCore) hp = Math.max(1, Math.floor(maxCore - attack * 1.2));
        actualStrength = calculateCombatStrength({ hp, attack, attackRange: type.attackRange, speed: type.speed, cp: type.cp });
      }
      const cell = spawnCells[index];
      const placed = this._enemyExpansionSystem.spawnCityStateRaid({
        outpostId: 'ancient_ruin', gridX: cell.x, gridY: cell.y,
        targetX: headquarters.gridX, targetY: headquarters.gridY,
        strength: actualStrength, enemyId: type.id,
        combatStats: {
          hp, maxHp: hp, attack, attackRange: type.attackRange,
          speed: type.speed, cp: type.cp, ancientRuinWave: this._ancientRuinWave,
          raidKind: 'seven_day_wave'
        }
      });
      if (placed) { spawned += 1; actualStrengths.push(actualStrength); }
    }
    eventBus.emit('ancientRuinWaveSpawned', { day, wave: this._ancientRuinWave, count: spawned, requestedCount: count, targetStrength, averagePlayerStrength });
    eventBus.emit('combatBroadcast', { message: spawned > 0
      ? `⚔️ 第${this._ancientRuinWave}波远古遗迹军队从大本营东侧出现：${spawned}支敌军，单体综合强度约${Math.round(actualStrengths.reduce((sum, value) => sum + value, 0) / actualStrengths.length)}！`
      : `⚠️ 第${this._ancientRuinWave}波来袭未生成敌军：当前没有可作为强度基准的玩家军队或东侧缺少合法地格。` });
    return spawned > 0;
  }

  /* ===== 超时惩罚 ===== */
  _punishPlayer() {
    const resourceSys = window.__game?.systems?.resource;
    const popSys = window.__game?.systems?.population;
    const buildingSys = window.__game?.systems?.building;
    const resourceLossRate = this._cfgNumber('punishResourceLossRate', 0.5);
    const populationLossRate = this._cfgNumber('punishPopulationLossRate', 0.3);
    const minimumPopulation = this._cfgNumber('minimumPopulationAfterPunish', 2);

    if (resourceSys) {
      const allRes = configRegistry.get('resources') || [];
      allRes.forEach(r => {
        const cur = resourceSys.getAmount(r.id);
        if (cur > 0) resourceSys.tryConsume(r.id, Math.ceil(cur * resourceLossRate));
      });
    }

    if (popSys) {
      const totalToLose = Math.ceil(popSys.current * populationLossRate);
      let remaining = totalToLose;

      // 优先从建筑中随机移除工人
      if (buildingSys) {
        const buildingsWithWorkers = buildingSys.buildings
          .map((b, i) => ({ index: i, workers: b.currentWorkers || 0 }))
          .filter(b => b.workers > 0);
        // 打乱顺序
        for (let i = buildingsWithWorkers.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [buildingsWithWorkers[i], buildingsWithWorkers[j]] = [buildingsWithWorkers[j], buildingsWithWorkers[i]];
        }
        for (const bw of buildingsWithWorkers) {
          if (remaining <= 0) break;
          const removeCount = Math.min(bw.workers, remaining);
          for (let r = 0; r < removeCount; r++) {
            buildingSys.removeWorker(bw.index);
          }
          remaining -= removeCount;
        }
      }

      // 剩余从总人口扣除
      if (remaining > 0) {
        popSys.current = Math.max(minimumPopulation, popSys.current - remaining);
      }
      popSys._updateStore();
    }
    eventBus.emit('populationChanged', { current: popSys?.current || 0, direction: 'invasion' });
    eventBus.emit('resourceChanged');
    eventBus.emit('combatBroadcast', { message: `💀 入侵持续！损失${Math.round(resourceLossRate * 100)}%资源、${Math.round(populationLossRate * 100)}%人口（部分建筑工人被抽离）！` });
  }

  /* ===== 派出军团 ===== */
  sendArmy(army) {
    if (!this._activeInvasion) return { ok: false, msg: '没有活跃的入侵' };
    if (!army || !army.unitIds || army.unitIds.length === 0) return { ok: false, msg: '该军团没有单位' };

    const armies = store.getState('armies') || [];
    const unitMap = {};
    this._unitConfigs.forEach(u => unitMap[u.id] = u);
    const defenseDomain = this._cfgString('landDefenseDomain', 'land');

    // 计算军团总战斗力（含阵型按完整组数触发的加成）
    const landUnitIds = army.unitIds.filter(uid => {
      const cfg = this._unitConfigs.find(u => u.id === uid);
      return (cfg?.domain || defenseDomain) === defenseDomain;
    });
    if (landUnitIds.length === 0) return { ok: false, msg: '陆地入侵无法使用海军单位防御' };

    const combatArmy = { ...army, unitIds: landUnitIds };
    const armyPower = getArmyCombatPower(combatArmy, { domain: defenseDomain });
    const formationStatus = army.formationId ? getFormationStatusText(army.formationId, army) : '';

    const invPower = this._activeInvasion.combatPower;

    if (armyPower > invPower) {
      /* ===== 胜利 ===== */
      const sorted = this._sortUnitIdsForCasualty(landUnitIds, unitMap);
      const powerRatio = armyPower / Math.max(1, invPower);
      const lossRatio = powerRatio >= 2 ? 0 : (armyPower - invPower) / Math.max(1, invPower);
      const toRemoveCount = Math.min(Math.floor(landUnitIds.length * lossRatio), Math.max(0, landUnitIds.length - 1));
      const lostUnitIds = sorted.slice(0, toRemoveCount);
      const survivedLand = sorted.slice(toRemoveCount);
      const survived = army.unitIds.filter(uid => (unitMap[uid]?.domain || defenseDomain) !== defenseDomain);
      survived.push(...survivedLand);

      // 更新军团
      const armyIdx = armies.findIndex(a => a.id === army.id);
      if (armyIdx >= 0) {
        armies[armyIdx].unitIds = survived;
        this._commitArmies(armies, 'invasionVictory');
      }
      this._applyUnitDeaths(lostUnitIds);

      this._activeInvasion = null;
      this._delayNextInvasion(this._cfgNumber('victoryProtectionDays', 14), '已击退入侵');
      this._updateUI();
      eventBus.emit('combatBroadcast', { message: `🎉 击退入侵！军团损失 ${toRemoveCount} 单位，剩余 ${survived.length} 单位` + (formationStatus ? ' · ' + formationStatus : '') });
      return { ok: true, victory: true, survived: survived.length, lost: toRemoveCount };
    } else if (armyPower === invPower) {
      /* ===== 平局：按失败处理单位，但清除入侵，不触发后续资源惩罚 ===== */
      const lostUnitIds = [...landUnitIds];
      const reviveCount = this._scheduleRevive(lostUnitIds);
      const armyIdx = armies.findIndex(a => a.id === army.id);
      if (armyIdx >= 0) {
        armies[armyIdx].unitIds = army.unitIds.filter(uid => (unitMap[uid]?.domain || defenseDomain) !== defenseDomain);
        this._commitArmies(armies, 'invasionDraw');
      }
      this._applyUnitDeaths(lostUnitIds);

      this._activeInvasion = null;
      this._delayNextInvasion(this._cfgNumber('drawProtectionDays', 14), '已阻止入侵');
      this._updateUI();
      eventBus.emit('combatBroadcast', { message: `⚔️ 惨烈平局！军团全员倒下，${reviveCount} 单位将在${this._cfgNumber('reviveDelayDays', 3)}日后复归；入侵已被阻止` + (formationStatus ? ' · ' + formationStatus : '') });
      return { ok: true, draw: true, lost: lostUnitIds.length, reviveCount };
    } else {
      /* ===== 失败 ===== */
      const winnerPower = invPower;
      const loserPower = armyPower;
      const remainingPower = Math.sqrt(winnerPower * winnerPower - loserPower * loserPower);
      const lostUnitIds = [...landUnitIds];
      const reviveCount = this._scheduleRevive(lostUnitIds);

      // 军团全灭
      const armyIdx = armies.findIndex(a => a.id === army.id);
      if (armyIdx >= 0) {
        armies[armyIdx].unitIds = army.unitIds.filter(uid => (unitMap[uid]?.domain || defenseDomain) !== defenseDomain);
        this._commitArmies(armies, 'invasionDefeat');
      }
      this._applyUnitDeaths(lostUnitIds);

      // 入侵战斗力削弱
      this._activeInvasion.combatPower = Math.round(remainingPower);
      this._updateUI();
      eventBus.emit('combatBroadcast', { message: `💥 军团被击溃！全员倒下，${reviveCount} 单位将在${this._cfgNumber('reviveDelayDays', 3)}日后复归；入侵残余战斗力 ${Math.round(remainingPower)}` + (formationStatus ? ' · ' + formationStatus : '') });
      return { ok: true, victory: false, remainingInvasionPower: Math.round(remainingPower), lost: lostUnitIds.length, reviveCount };
    }
  }

  _sortUnitIdsForCasualty(unitIds, unitMap) {
    return [...unitIds].sort((a, b) => {
      const ca = unitMap[a], cb = unitMap[b];
      return (ca ? (ca.weight || 100) : 100) - (cb ? (cb.weight || 100) : 100);
    });
  }

  _getUnitPopulationRequired(unitId) {
    const cfg = this._unitConfigs.find(u => u.id === unitId);
    return cfg ? (cfg.populationRequired || 1) : 1;
  }

  _applyUnitDeaths(unitIds) {
    if (!unitIds || unitIds.length === 0) return;
    const popSys = window.__game?.systems?.population;
    if (!popSys) return;
    const loss = unitIds.reduce((s, uid) => s + this._getUnitPopulationRequired(uid), 0);
    popSys.refresh();
    eventBus.emit('populationChanged', { current: popSys.current, direction: 'combat_loss', lost: loss });
  }

  _scheduleRevive(unitIds) {
    if (!unitIds || unitIds.length === 0) return 0;
    const reviveRate = this._cfgNumber('reviveUnitRate', 0.5);
    const reviveCount = Math.ceil(unitIds.length * reviveRate);
    const reviveUnitIds = unitIds.slice(0, reviveCount);
    const day = store.getState('timeDay') || 1;
    this._pendingRevives.push({
      unitIds: reviveUnitIds,
      reviveDay: day + this._cfgNumber('reviveDelayDays', 3)
    });
    return reviveUnitIds.length;
  }

  _processPendingRevives(day) {
    if (this._pendingRevives.length === 0 || !this._armySystem) return;
    const due = [];
    this._pendingRevives = this._pendingRevives.filter(item => {
      if (day >= item.reviveDay) {
        due.push(item);
        return false;
      }
      return true;
    });
    if (due.length === 0) return;

    const popSys = window.__game?.systems?.population;
    const revivedReserves = {};
    let revivedPeople = 0;
    let revivedUnits = 0;
    for (const item of due) {
      for (const uid of item.unitIds || []) {
        revivedReserves[uid] = (revivedReserves[uid] || 0) + 1;
        revivedPeople += this._getUnitPopulationRequired(uid);
        revivedUnits++;
      }
    }
    if (revivedUnits > 0 && !this._armySystem.addReserveUnits(revivedReserves, 'unitRevive')) {
      this._pendingRevives.push(...due);
      return;
    }
    if (popSys && revivedPeople > 0) {
      popSys.refresh();
      eventBus.emit('populationChanged', { current: popSys.current, direction: 'combat_revive', revived: revivedPeople });
    }
    if (revivedUnits > 0) {
      eventBus.emit('combatBroadcast', { message: `🕯️ ${revivedUnits} 名倒下的战斗单位复归，可重新编入军团` });
    }
  }

  /* ===== 控制台指令：invasion:x ===== */
  spawnInvasion(combatPower) {
    this._generateInvasion(combatPower);
  }

  /* ===== 状态查询 ===== */
  getActiveInvasion() { return this._activeInvasion ? { ...this._activeInvasion } : null; }

  payTribute() {
    if (!this._activeInvasion) return { ok: false, msg: '没有活跃的入侵' };
    const resourceSys = window.__game?.systems?.resource;
    if (!resourceSys) return { ok: false, msg: '资源系统未加载' };
    const tributeResourceId = this._cfgString('tributeResourceId', 'food');
    const resourceConfig = configRegistry.getResource(tributeResourceId);
    const resourceName = resourceConfig?.name || tributeResourceId;
    const cost = Math.max(1, this._activeInvasion.tributeFoodCost || this._activeInvasion.combatPower || 1);
    if (!resourceSys.hasEnough(tributeResourceId, cost)) {
      return { ok: false, msg: `${resourceName}不足（需要 ${cost}）`, cost };
    }
    if (!resourceSys.tryConsume(tributeResourceId, cost)) {
      return { ok: false, msg: `${resourceName}不足（需要 ${cost}）`, cost };
    }
    const paid = {
      cost,
      multiplier: this._activeInvasion.tributeMultiplier || null,
      combatPower: this._activeInvasion.combatPower
    };
    this._activeInvasion = null;
    const protectedDays = this._cfgNumber('tributeProtectionDays', 7);
    this._delayNextInvasion(protectedDays, `已上交${resourceName}换取免战`);
    this._updateUI();
    eventBus.emit('combatBroadcast', { message: `🌾 上交 ${paid.cost} ${resourceName}，入侵者暂时撤退` });
    return { ok: true, ...paid, resourceId: tributeResourceId, protectedDays };
  }

  /* ===== UI 更新 ===== */
  _updateUI() {
    store.setState({
      activeInvasion: this._activeInvasion ? { ...this._activeInvasion, lastPunishDay: this._lastPunishDay } : null,
      invasionNextDay: this._nextDay || 0
    });
  }

  /* ===== 存档接口 ===== */
  getState() {
    return {
      lastPunishDay: this._lastPunishDay,
      nextDay: this._nextDay,
      activeInvasion: this._activeInvasion ? { ...this._activeInvasion } : null,
      history: this._invasionHistory,
      pendingRevives: this._pendingRevives.map(r => ({ ...r, unitIds: [...(r.unitIds || [])] })),
      ancientRuinWave: this._ancientRuinWave,
    };
  }

  restoreState(state) {
    if (!state) return;
    this._nextDay = state.nextDay || 0;
    this._lastPunishDay = state.lastPunishDay || 0;
    this._activeInvasion = null;
    this._invasionHistory = state.history || [];
    this._pendingRevives = (state.pendingRevives || []).map(r => ({ ...r, unitIds: [...(r.unitIds || [])] }));
    this._ancientRuinWave = Math.max(0, Number(state.ancientRuinWave) || 0);
    const day = store.getState('timeDay') || 1;
    const firstDay = this._cfgNumber('firstDay', 30);
    if (!this._activeInvasion && day < firstDay && this._nextDay < firstDay) {
      this._nextDay = firstDay;
    }
    this._updateUI();
  }

  initNew() {
    this._nextDay = 7;
    this._activeInvasion = null;
    this._pendingRevives = [];
    this._ancientRuinWave = 0;
    this._updateUI();
  }
}
