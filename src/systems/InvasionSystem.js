/**
 * InvasionSystem - 入侵系统
 * 第30天开始入侵，之后每2-5天随机一波，玩家派出军团战斗
 */
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';
import { configRegistry } from '../core/ConfigRegistry.js';
import { getArmyCombatPower, getFormationStatusText } from '../utils/FormationUtils.js';

const FIRST_INVASION_DAY = 30;

export class InvasionSystem {
 constructor() {
    this._activeInvasion = null;   // { combatPower, dayCreated }
    this._lastPunishDay = 0;       // 上次惩罚在哪天
    this._nextDay = 0;             // 下次入侵在哪天
    this._invasionHistory = [];    // 历史记录
    this._pendingRevives = [];     // { unitIds, reviveDay }

    eventBus.on('dayStart', (data) => this._onDayStart(data));
  }

  /* ===== 配置 ===== */
  get _invasionConfig() {
    const ec = configRegistry.get('enemies');
    return ec?.invasion || { baseA: 2, dayMulB: 1, daySqMulC: 0.1 };
  }

  get _unitConfigs() { return configRegistry.get('enemies')?.units || []; }

  /* ===== 调度 ===== */
  _randomBetween(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  _scheduleNext() {
    const delay = this._randomBetween(2, 5);
    const day = store.getState('timeDay') || 1;
    this._nextDay = day + delay;
  }

  _scheduleFirst() {
    const day = store.getState('timeDay') || 1;
    this._nextDay = Math.max(day, FIRST_INVASION_DAY);
  }

  /* ===== 生成入侵 ===== */
  _generateInvasion(forcePower) {
    const day = store.getState('timeDay') || 1;
    const cfg = this._invasionConfig;
    const base = forcePower ?? Math.round(cfg.baseA + day * cfg.dayMulB + day * day * cfg.daySqMulC);
    this._activeInvasion = {
      combatPower: base,
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

    // 入侵持续中 → 每24小时循环惩罚
    if (this._activeInvasion && day > this._lastPunishDay) {
      this._punishPlayer();
      this._lastPunishDay = day;
      this._updateUI();
    }

    // 如果已有活跃入侵，不生成新的
    if (this._activeInvasion) return;

    // 检查是否到达预定入侵日
    if (day >= this._nextDay) {
      this._generateInvasion(null);
      this._scheduleNext();
    }
  }

  /* ===== 超时惩罚：损失50%人口和资源 ===== */
  _punishPlayer() {
    const resourceSys = window.__game?.systems?.resource;
    const popSys = window.__game?.systems?.population;
    const buildingSys = window.__game?.systems?.building;

    // 损失50%资源
    if (resourceSys) {
      const allRes = configRegistry.get('resources') || [];
      allRes.forEach(r => {
        const cur = resourceSys.getAmount(r.id);
        if (cur > 0) resourceSys.tryConsume(r.id, Math.ceil(cur * 0.5));
      });
    }

    // 损失30%人口（含已分配工人），随机移除建筑工人
    if (popSys) {
      const totalToLose = Math.ceil(popSys.current * 0.3);
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
        popSys.current = Math.max(2, popSys.current - remaining);
      }
      popSys._updateStore();
    }
    eventBus.emit('populationChanged', { current: popSys?.current || 0, direction: 'invasion' });
    eventBus.emit('resourceChanged');
    eventBus.emit('combatBroadcast', { message: '💀 入侵持续！损失50%资源、30%人口（部分建筑工人被抽离）！' });
  }

  /* ===== 派出军团 ===== */
  sendArmy(army) {
    if (!this._activeInvasion) return { ok: false, msg: '没有活跃的入侵' };
    if (!army || !army.unitIds || army.unitIds.length === 0) return { ok: false, msg: '该军团没有单位' };

    const armies = store.getState('armies') || [];
    const unitMap = {};
    this._unitConfigs.forEach(u => unitMap[u.id] = u);

    // 计算军团总战斗力（含阵型按完整组数触发的加成）
    const landUnitIds = army.unitIds.filter(uid => {
      const cfg = this._unitConfigs.find(u => u.id === uid);
      return (cfg?.domain || 'land') === 'land';
    });
    if (landUnitIds.length === 0) return { ok: false, msg: '陆地入侵无法使用海军单位防御' };

    const combatArmy = { ...army, unitIds: landUnitIds };
    const armyPower = getArmyCombatPower(combatArmy, { domain: 'land' });
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
      const survived = army.unitIds.filter(uid => (unitMap[uid]?.domain || 'land') !== 'land');
      survived.push(...survivedLand);

      // 更新军团
      const armyIdx = armies.findIndex(a => a.id === army.id);
      if (armyIdx >= 0) {
        armies[armyIdx].unitIds = survived;
        store.setState({ armies });
      }
      this._applyUnitDeaths(lostUnitIds);

      this._activeInvasion = null;
      this._updateUI();
      eventBus.emit('combatBroadcast', { message: `🎉 击退入侵！军团损失 ${toRemoveCount} 单位，剩余 ${survived.length} 单位` + (formationStatus ? ' · ' + formationStatus : '') });
      return { ok: true, victory: true, survived: survived.length, lost: toRemoveCount };
    } else if (armyPower === invPower) {
      /* ===== 平局：按失败处理单位，但清除入侵，不触发后续资源惩罚 ===== */
      const lostUnitIds = [...landUnitIds];
      const reviveCount = this._scheduleRevive(lostUnitIds);
      const armyIdx = armies.findIndex(a => a.id === army.id);
      if (armyIdx >= 0) {
        armies[armyIdx].unitIds = army.unitIds.filter(uid => (unitMap[uid]?.domain || 'land') !== 'land');
        store.setState({ armies });
      }
      this._applyUnitDeaths(lostUnitIds);

      this._activeInvasion = null;
      this._updateUI();
      eventBus.emit('combatBroadcast', { message: `⚔️ 惨烈平局！军团全员倒下，${reviveCount} 单位将在72小时后复归；入侵已被阻止` + (formationStatus ? ' · ' + formationStatus : '') });
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
        armies[armyIdx].unitIds = army.unitIds.filter(uid => (unitMap[uid]?.domain || 'land') !== 'land');
        store.setState({ armies });
      }
      this._applyUnitDeaths(lostUnitIds);

      // 入侵战斗力削弱
      this._activeInvasion.combatPower = Math.round(remainingPower);
      this._updateUI();
      eventBus.emit('combatBroadcast', { message: `💥 军团被击溃！全员倒下，${reviveCount} 单位将在72小时后复归；入侵残余战斗力 ${Math.round(remainingPower)}` + (formationStatus ? ' · ' + formationStatus : '') });
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
    popSys.releaseFromConstruction(loss);
    popSys.current = Math.max(0, popSys.current - loss);
    popSys.refresh();
    eventBus.emit('populationChanged', { current: popSys.current, direction: 'combat_loss', lost: loss });
  }

  _scheduleRevive(unitIds) {
    if (!unitIds || unitIds.length === 0) return 0;
    const reviveCount = Math.ceil(unitIds.length / 2);
    const reviveUnitIds = unitIds.slice(0, reviveCount);
    const day = store.getState('timeDay') || 1;
    this._pendingRevives.push({
      unitIds: reviveUnitIds,
      reviveDay: day + 3
    });
    return reviveUnitIds.length;
  }

  _processPendingRevives(day) {
    if (this._pendingRevives.length === 0) return;
    const due = [];
    this._pendingRevives = this._pendingRevives.filter(item => {
      if (day >= item.reviveDay) {
        due.push(item);
        return false;
      }
      return true;
    });
    if (due.length === 0) return;

    const avail = { ...(store.getState('availableUnits') || {}) };
    const popSys = window.__game?.systems?.population;
    let revivedPeople = 0;
    let revivedUnits = 0;
    for (const item of due) {
      for (const uid of item.unitIds || []) {
        avail[uid] = (avail[uid] || 0) + 1;
        revivedPeople += this._getUnitPopulationRequired(uid);
        revivedUnits++;
      }
    }
    store.setState({ availableUnits: avail });
    if (popSys && revivedPeople > 0) {
      popSys.current += revivedPeople;
      popSys.occupyForConstruction(revivedPeople);
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

  /* ===== UI 更新 ===== */
  _updateUI() {
    store.setState({ activeInvasion: this._activeInvasion ? { ...this._activeInvasion, lastPunishDay: this._lastPunishDay } : null });
  }

  /* ===== 存档接口 ===== */
  getState() {
    return {
      lastPunishDay: this._lastPunishDay,
      nextDay: this._nextDay,
      activeInvasion: this._activeInvasion ? { ...this._activeInvasion } : null,
      history: this._invasionHistory,
      pendingRevives: this._pendingRevives.map(r => ({ ...r, unitIds: [...(r.unitIds || [])] })),
    };
  }

  restoreState(state) {
    if (!state) return;
    this._nextDay = state.nextDay || 0;
    this._lastPunishDay = state.lastPunishDay || 0;
    this._activeInvasion = state.activeInvasion || null;
    this._invasionHistory = state.history || [];
    this._pendingRevives = (state.pendingRevives || []).map(r => ({ ...r, unitIds: [...(r.unitIds || [])] }));
    const day = store.getState('timeDay') || 1;
    if (!this._activeInvasion && day < FIRST_INVASION_DAY && this._nextDay < FIRST_INVASION_DAY) {
      this._nextDay = FIRST_INVASION_DAY;
    }
    this._updateUI();
  }

  initNew() {
    this._scheduleFirst();
    this._activeInvasion = null;
    this._pendingRevives = [];
    this._updateUI();
  }
}
