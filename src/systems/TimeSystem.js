/**
 * TimeSystem - 时间系统
 * 管理游戏内时间流逝、时段切换、速度控制
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class TimeSystem {
  constructor() {
    const config = configRegistry.get('global');
    this.PERIOD_DURATION = config.PERIOD_DURATION; // 每时段秒数 (120)
    this.TICK_INTERVAL = config.TICK_INTERVAL;   // 结算间隔秒数 (40)
    this.PERIOD_NAMES = config.PERIOD_NAMES;     // ['morning','afternoon','evening','night']
    this.WORK_PERIODS = config.WORK_PERIODS;     // ['morning','afternoon']
    this.TICKS_PER_PERIOD = Math.floor(this.PERIOD_DURATION / this.TICK_INTERVAL); // 3

    this.currentTick = 0;         // 全局 tick 计数
    this.tickInPeriod = 0;        // 当前时段内第几个 tick
    this.periodIndex = 0;         // 当前时段索引
    this.day = 1;                 // 当前天数
    this.elapsedInTick = 0;       // 当前 tick 内已过秒数

    this.speed = 1;               // 速度倍率: 1, 2, 4
    this.userPaused = false;      // 用户手动暂停

    // 时段显示信息
    this.PERIOD_ICONS = { morning: '☀️', afternoon: '🌤️', evening: '🌅', night: '🌙' };
    this.PERIOD_LABELS = { morning: '上午', afternoon: '下午', evening: '傍晚', night: '深夜' };
  }

  initNew() {
    this.currentTick = 0;
    this.tickInPeriod = 0;
    this.periodIndex = 0;
    this.day = 1;
    this.elapsedInTick = 0;
    this.speed = 1;
    this.userPaused = false;
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

    // 更新进度到 store（用于 HUD 进度条）
    const progress = this.elapsedInTick / this.TICK_INTERVAL;
    store.setState({ timeProgress: progress });
  }

  _onTick() {
    this.currentTick++;
    this.tickInPeriod++;

    // 触发 tick 事件（所有系统订阅此事件）
    eventBus.emit('tick', {
      tick: this.currentTick,
      period: this.currentPeriod,
      day: this.day,
      isWorkPeriod: this.isWorkPeriod
    });

    // 检查时段是否结束
    if (this.tickInPeriod >= this.TICKS_PER_PERIOD) {
      this._onPeriodEnd();
    }

    this._updateStore();
  }

  _onPeriodEnd() {
    const prevPeriod = this.currentPeriod;
    eventBus.emit('periodEnd', { period: prevPeriod, day: this.day });

    this.tickInPeriod = 0;
    this.periodIndex++;

    // 一天结束
    if (this.periodIndex >= this.PERIOD_NAMES.length) {
      this.periodIndex = 0;
      this.day++;
      eventBus.emit('dayStart', { day: this.day });
    }

    eventBus.emit('periodChange', {
      period: this.currentPeriod,
      prevPeriod,
      day: this.day,
      icon: this.PERIOD_ICONS[this.currentPeriod],
      label: this.PERIOD_LABELS[this.currentPeriod]
    });
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
    const speeds = [1, 2, 4];
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
    this._updateStore();
  }
}
