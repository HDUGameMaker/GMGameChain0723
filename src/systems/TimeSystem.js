/**
 * TimeSystem - 时间系统
 * 管理游戏内时间流逝、时段切换、速度控制
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class TimeSystem {
  constructor() {
    const config = configRegistry.get('global') || {};
    this.PERIOD_DURATION = config.PERIOD_DURATION || 30;
    this.TICK_INTERVAL = config.TICK_INTERVAL || 10;
    this.PERIOD_NAMES = Array.isArray(config.PERIOD_NAMES) && config.PERIOD_NAMES.length > 0
      ? config.PERIOD_NAMES
      : ['morning', 'afternoon', 'evening', 'night'];
    this.WORK_PERIODS = Array.isArray(config.WORK_PERIODS) ? config.WORK_PERIODS : [];
    this.TICKS_PER_PERIOD = Math.max(1, Math.floor(this.PERIOD_DURATION / this.TICK_INTERVAL));
    this.TICKS_PER_DAY = this.TICKS_PER_PERIOD * this.PERIOD_NAMES.length;

    this.currentTick = 0;         // 全局 tick 计数
    this.tickInPeriod = 0;        // 当前时段内第几个 tick
    this.periodIndex = 0;         // 当前时段索引
    this.day = 1;                 // 当前天数
    this.elapsedInTick = 0;       // 当前 tick 内已过秒数

    this.speed = 1;               // 速度倍率: 1, 2, 4
    this.userPaused = false;      // 用户手动暂停
    this._lastStartedDay = 0;

    this.PERIOD_ICONS = config.PERIOD_ICONS || {};
    this.PERIOD_LABELS = config.PERIOD_LABELS || {};
  }

  initNew() {
    this.currentTick = 0;
    this.tickInPeriod = 0;
    this.periodIndex = 0;
    this.day = 1;
    this.elapsedInTick = 0;
    this.speed = 1;
    this.userPaused = false;
    this._lastStartedDay = 0;
    this._updateStore();
  }

  /**
   * 每帧更新
   * @param {number} delta - 帧间隔秒数
   */
  update(delta) {
    if (this.userPaused) return;

    this.elapsedInTick += delta * this.speed;

    // 检查是否到达 tick 结算点
    while (this.elapsedInTick >= this.TICK_INTERVAL) {
      this.elapsedInTick -= this.TICK_INTERVAL;
      this._onTick();
    }

    // 同步更新 timeTick 和 timeProgress，避免渲染回调读到不一致的值
    const progress = this.elapsedInTick / this.TICK_INTERVAL;
    store.setState({ timeTick: this.currentTick, timeProgress: progress });
  }

  _onTick() {
    this.currentTick++;
    this.tickInPeriod++;
    this._updateStore();

    const tickData = this._buildTickData();
    this._emitTickEvents(tickData);

    // 检查时段是否结束
    if (this.tickInPeriod >= this.TICKS_PER_PERIOD) {
      this._onPeriodEnd();
    }

    this._updateStore();
  }

  _buildTickData() {
    const tickInDay = this._getTickInDay();
    return {
      tick: this.currentTick,
      period: this.currentPeriod,
      day: this.day,
      periodIndex: this.periodIndex,
      tickInPeriod: this.tickInPeriod,
      tickInDay,
      ticksPerPeriod: this.TICKS_PER_PERIOD,
      ticksPerDay: this.TICKS_PER_DAY,
      isWorkPeriod: this.isWorkPeriod,
      isFirstTickOfDay: tickInDay === 1,
      isFirstWorkTickOfDay: this._isFirstWorkTickOfDay()
    };
  }

  _emitTickEvents(tickData) {
    if (tickData.isFirstTickOfDay && this._lastStartedDay !== this.day) {
      this._lastStartedDay = this.day;
      eventBus.emit('dayStart', tickData);
      eventBus.emit('dayProductionTick', tickData);
      eventBus.emit('dayAutosaveTick', tickData);
    }
    eventBus.emit('tick', tickData);
    eventBus.emit('periodTick', tickData);
    eventBus.emit(`${tickData.period}Tick`, tickData);
    eventBus.emit(tickData.isWorkPeriod ? 'workTick' : 'nonWorkTick', tickData);
    if (tickData.isFirstTickOfDay) eventBus.emit('dayFirstTick', tickData);
    if (tickData.isFirstWorkTickOfDay) eventBus.emit('dayFirstWorkTick', tickData);
  }

  _getTickInDay() {
    return this.periodIndex * this.TICKS_PER_PERIOD + this.tickInPeriod;
  }

  _isFirstWorkTickOfDay() {
    if (!this.isWorkPeriod || this.tickInPeriod !== 1) return false;
    const earlierPeriods = this.PERIOD_NAMES.slice(0, this.periodIndex);
    return !earlierPeriods.some(period => this.WORK_PERIODS.includes(period));
  }

  _onPeriodEnd() {
    const prevPeriod = this.currentPeriod;
    const prevDay = this.day;
    eventBus.emit('periodEnd', { period: prevPeriod, day: prevDay });

    this.tickInPeriod = 0;
    this.periodIndex++;
    let dayChanged = false;

    // 一天结束
    if (this.periodIndex >= this.PERIOD_NAMES.length) {
      this.periodIndex = 0;
      this.day++;
      dayChanged = true;
    }

    // 先把唯一时间源写入 Store，再通知监听者，避免监听者读到旧时段。
    this._updateStore();

    const periodChangeData = {
      period: this.currentPeriod,
      prevPeriod,
      prevDay,
      day: this.day,
      icon: this.PERIOD_ICONS[this.currentPeriod],
      label: this.PERIOD_LABELS[this.currentPeriod],
      periodIndex: this.periodIndex,
      tickInPeriod: this.tickInPeriod,
      isWorkPeriod: this.isWorkPeriod
    };
    eventBus.emit('periodChange', periodChangeData);

    if (dayChanged) this._lastStartedDay = prevDay;
  }

  get currentPeriod() {
    return this.PERIOD_NAMES[this.periodIndex];
  }

  get isWorkPeriod() {
    return this.WORK_PERIODS.includes(this.currentPeriod);
  }

  // 速度控制
  setSpeed(speed) {
    this.speed = speed;
    store.setState({ timeSpeed: speed });
  }

  cycleSpeed() {
    const cheatEnabled = window.__cheatManager?.isEnabled();
    const speeds = cheatEnabled ? [1, 2, 4, 8, 16] : [1, 2, 4];
    const idx = speeds.indexOf(this.speed);
    this.speed = speeds[(idx + 1) % speeds.length];
    store.setState({ timeSpeed: this.speed });
    return this.speed;
  }

  setUserPaused(paused) {
    this.userPaused = paused;
    store.setState({ timeUserPaused: paused });
  }

  togglePause() {
    this.userPaused = !this.userPaused;
    store.setState({ timeUserPaused: this.userPaused });
    return this.userPaused;
  }

  _updateStore() {
    store.setState({
      timeTick: this.currentTick,
      timePeriod: this.currentPeriod,
      timeDay: this.day,
      timePeriodIndex: this.periodIndex,
      timeTickInPeriod: this.tickInPeriod,
      timeTickInDay: this._getTickInDay(),
      timeSpeed: this.speed,
      timeUserPaused: this.userPaused
    });
  }

  // 存档接口
  getState() {
    return {
      currentTick: this.currentTick,
      tickInPeriod: this.tickInPeriod,
      periodIndex: this.periodIndex,
      day: this.day,
      elapsedInTick: this.elapsedInTick
    };
  }

  restoreState(state) {
    if (!state) return;
    this.currentTick = state.currentTick || 0;
    this.tickInPeriod = state.tickInPeriod || 0;
    this.periodIndex = state.periodIndex || 0;
    this.day = state.day || 1;
    this.elapsedInTick = state.elapsedInTick || 0;
    this._lastStartedDay = this._getTickInDay() > 0 ? this.day : this.day - 1;
    this._updateStore();
  }
}
