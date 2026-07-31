/**
 * InvasionSystem - 入侵系统
 * 每2-5天随机一波入侵，玩家派出军团战斗
 */
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';
import { configRegistry } from '../core/ConfigRegistry.js';
import { getArmyCombatPower, getFormationStatusText } from '../utils/FormationUtils.js';

export class InvasionSystem {
 constructor() {
    this._activeInvasion = null;   // { combatPower, dayCreated }
    this._lastPunishDay = 0;       // 上次惩罚在哪天
    this._nextDay = 0;             // 下次入侵在哪天
    this._invasionHistory = [];    // 历史记录

    eventBus.on('dayStart', (data) => this._onDayStart(data));
  }

  /* ===== 配置 ===== */
  get _invasionConfig() {
    const ec = configRegistry.get('enemies');
    return ec?.invasion || { baseA: 5, dayMulB: 1, daySqMulC: 0 };
  }

  get _unitConfigs() { return configRegistry.get('enemies')?.units || []; }

  /* ===== 调度 ===== */
  _randomBetween(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  _scheduleNext() {
    const delay = this._randomBetween(2, 5);
    const day = store.getState('timeDay') || 1;
    this._nextDay = day + delay;
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
    const avail = store.getState('availableUnits') || {};
    const unitMap = {};
    this._unitConfigs.forEach(u => unitMap[u.id] = u);

    // 计算军团总战斗力（含阵型按完整组数触发的加成）
    const armyPower = getArmyCombatPower(army);
    const formationStatus = army.formationId ? getFormationStatusText(army.formationId, army) : '';

    const invPower = this._activeInvasion.combatPower;

    if (armyPower >= invPower) {
      /* ===== 胜利 ===== */
      const winnerPower = armyPower;
      const loserPower = invPower;
      const remainingPower = Math.sqrt(winnerPower * winnerPower - loserPower * loserPower);
      const lossRatio = 1 - remainingPower / winnerPower;

      // 按权重（低优先）排序，移除单位
      const sorted = [...army.unitIds].sort((a, b) => {
        const ca = unitMap[a], cb = unitMap[b];
        return (ca ? (ca.weight || 100) : 100) - (cb ? (cb.weight || 100) : 100);
      });

      const toRemoveCount = Math.floor(army.unitIds.length * lossRatio);
      const survived = sorted.slice(toRemoveCount);

      // 移除的归还到可用池
      const newAvail = { ...avail };
      for (let i = 0; i < toRemoveCount; i++) {
        const uid = sorted[i];
        // 不归还（阵亡）
      }

      // 更新军团
      const armyIdx = armies.findIndex(a => a.id === army.id);
      if (armyIdx >= 0) {
        armies[armyIdx].unitIds = survived;
        store.setState({ armies });
      }

      this._activeInvasion = null;
      this._updateUI();
      eventBus.emit('combatBroadcast', { message: `🎉 击退入侵！军团损失 ${toRemoveCount} 单位，剩余 ${survived.length} 单位` + (formationStatus ? ' · ' + formationStatus : '') });
      return { ok: true, victory: true, survived: survived.length, lost: toRemoveCount };
    } else {
      /* ===== 失败 ===== */
      const winnerPower = invPower;
      const loserPower = armyPower;
      const remainingPower = Math.sqrt(winnerPower * winnerPower - loserPower * loserPower);
      const lossRatio = 1 - remainingPower / winnerPower;

      // 军团全灭
      const armyIdx = armies.findIndex(a => a.id === army.id);
      if (armyIdx >= 0) {
        armies[armyIdx].unitIds = [];
        store.setState({ armies });
      }

      // 入侵战斗力削弱
      this._activeInvasion.combatPower = Math.round(remainingPower);
      this._updateUI();
      eventBus.emit('combatBroadcast', { message: `💥 军团被击溃！入侵残余战斗力 ${Math.round(remainingPower)}` + (formationStatus ? ' · ' + formationStatus : '') });
      return { ok: true, victory: false, remainingInvasionPower: Math.round(remainingPower) };
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
    };
  }

  restoreState(state) {
    if (!state) return;
    this._nextDay = state.nextDay || 0;
    this._lastPunishDay = state.lastPunishDay || 0;
    this._activeInvasion = state.activeInvasion || null;
    this._invasionHistory = state.history || [];
    this._updateUI();
  }

  initNew() {
    this._scheduleNext();
    this._activeInvasion = null;
    this._updateUI();
  }
}
