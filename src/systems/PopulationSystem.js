/**
 * PopulationSystem - 人口系统
 * 管理人口增长/减少、工人池、住宅/食物上限
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class PopulationSystem {
  constructor() {
    const globalConfig = configRegistry.get('global');
    this.popConfig = globalConfig.population;
    // { growthPerDay: {min, max}, foodFloor, declineDelayDays }

    this.current = 0;
    this.declineCountdown = 0; // 人口减少倒计时天数
    this._buildingSystem = null; // 延迟注入
  }

  setBuildingSystem(buildingSystem) {
    this._buildingSystem = buildingSystem;
  }

  initNew() {
    this.current = 2; // 初始人口
    this.declineCountdown = 0;
    this._updateStore();
  }

  /**
   * 获取居住人口上限
   */
  getHousingCapacity() {
    if (!this._buildingSystem) return 0;
    return this._buildingSystem.getTotalHousingCapacity();
  }

  /**
   * 获取食物人口上限
   */
  getFoodCapacity() {
    if (!this._buildingSystem) return this.popConfig.foodFloor;
    const foodFromBuildings = this._buildingSystem.getTotalFoodCapacity();
    return Math.max(this.popConfig.foodFloor, foodFromBuildings);
  }

  /**
   * 获取目标人口
   */
  getTargetPopulation() {
    return Math.min(this.getHousingCapacity(), this.getFoodCapacity());
  }

  /**
   * 获取已分配工人总数
   */
  getAssignedWorkers() {
    if (!this._buildingSystem) return 0;
    return this._buildingSystem.getTotalAssignedWorkers();
  }

  /**
   * 获取可用工人池
   */
  getAvailableWorkers() {
    return Math.max(0, this.current - this.getAssignedWorkers());
  }

  /**
   * 每天结算人口变化（由 dayStart 事件触发）
   */
  onDayStart() {
    const target = this.getTargetPopulation();

    if (this.current < target) {
      // 增长
      this.declineCountdown = 0;
      const growth = this._randomInt(this.popConfig.growthPerDay.min, this.popConfig.growthPerDay.max);
      this.current = Math.min(this.current + growth, target);
      eventBus.emit('populationChanged', { current: this.current, direction: 'grow' });
    } else if (this.current > target) {
      // 需要减少
      if (this.declineCountdown > 0) {
        this.declineCountdown--;
      } else if (this.declineCountdown === 0) {
        // 开始倒计时
        this.declineCountdown = this.popConfig.declineDelayDays;
      }
      // 倒计时结束后开始减少
      if (this.declineCountdown === 0) {
        const decline = this._randomInt(this.popConfig.growthPerDay.min, this.popConfig.growthPerDay.max);
        this.current = Math.max(this.current - decline, target);
        eventBus.emit('populationChanged', { current: this.current, direction: 'decline' });
      }
    } else {
      this.declineCountdown = 0;
    }

    this._updateStore();
  }

  _randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  _updateStore() {
    store.setState({
      populationCurrent: this.current,
      populationHousing: this.getHousingCapacity(),
      populationFood: this.getFoodCapacity(),
      populationTarget: this.getTargetPopulation(),
      populationAvailable: this.getAvailableWorkers(),
      populationDeclineCountdown: this.declineCountdown
    });
  }

  /**
   * 强制刷新 store（工人分配变化时调用）
   */
  refresh() {
    this._updateStore();
  }

  // ===== 存档接口 =====

  getState() {
    return {
      current: this.current,
      declineCountdown: this.declineCountdown
    };
  }

  restoreState(state) {
    if (!state) return;
    this.current = state.current || 0;
    this.declineCountdown = state.declineCountdown || 0;
    this._updateStore();
  }
}
