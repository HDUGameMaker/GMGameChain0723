/**
 * PopulationSystem - 人口系统
 * 管理人口增长/减少、工人池、住房上限、食物消耗
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class PopulationSystem {
  constructor() {
    const globalConfig = configRegistry.get('global');
    this.popConfig = globalConfig.population;
    // { growthPerDay: {min, max}, declineDelayDays }

    this.current = 0;
    this.declineCountdown = 0; // 人口减少倒计时天数
    this._buildingSystem = null; // 延迟注入
    this._resourceSystem = null; // 延迟注入
  }

  setBuildingSystem(buildingSystem) {
    this._buildingSystem = buildingSystem;
  }

  setResourceSystem(resourceSystem) {
    this._resourceSystem = resourceSystem;
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
   * 获取目标人口（仅由住房限制）
   */
  getTargetPopulation() {
    return this.getHousingCapacity();
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
   * 每天结算（由 dayStart 事件触发）
   * 1. 食物建筑产出食物
   * 2. 消耗食物 = 当前人口数
   * 3. 食物不够 → 饥饿死亡
   * 4. 人口 < 2 → 游戏结束
   * 5. 住房驱动的增长/衰减
   */
  onDayStart() {
    if (!this._buildingSystem || !this._resourceSystem) return;

    // ===== 1. 食物产出 =====
    const foodProduction = this._buildingSystem.getTotalFoodProduction();
    if (foodProduction > 0) {
      this._resourceSystem.addClamped('food', foodProduction);
    }

    // ===== 2. 食物消耗 =====
    const foodAvailable = this._resourceSystem.getAmount('food');
    const consumeAmount = Math.min(foodAvailable, this.current);
    if (consumeAmount > 0) {
      this._resourceSystem.tryConsume('food', consumeAmount);
    }

    // ===== 3. 饥饿死亡 =====
    const deficit = this.current - consumeAmount;
    if (deficit > 0) {
      const starvedBefore = this.current;
      this.current -= deficit;
      eventBus.emit('populationChanged', {
        current: this.current,
        direction: 'starve',
        starved: deficit,
        starvedBefore
      });
    }

    // ===== 4. 游戏结束检查 =====
    if (this.current < 2) {
      this._updateStore();
      eventBus.emit('gameOver', {
        day: store.getState('timeDay') || this._getDay(),
        population: this.current
      });
      return; // 游戏结束，不再处理增长/衰减
    }

    // ===== 5. 住房增长/衰减 =====
    const housing = this.getHousingCapacity();

    if (this.current < housing) {
      // 增长
      this.declineCountdown = 0;
      const growth = this._randomInt(this.popConfig.growthPerDay.min, this.popConfig.growthPerDay.max);
      this.current = Math.min(this.current + growth, housing);
      eventBus.emit('populationChanged', { current: this.current, direction: 'grow' });
    } else if (this.current > housing) {
      // 需要减少（住房不足）
      if (this.declineCountdown > 0) {
        this.declineCountdown--;
      } else if (this.declineCountdown === 0) {
        // 开始倒计时
        this.declineCountdown = this.popConfig.declineDelayDays;
      }
      // 倒计时结束后开始减少
      if (this.declineCountdown === 0) {
        const decline = this._randomInt(this.popConfig.growthPerDay.min, this.popConfig.growthPerDay.max);
        this.current = Math.max(this.current - decline, housing);
        eventBus.emit('populationChanged', { current: this.current, direction: 'decline' });
      }
    } else {
      this.declineCountdown = 0;
    }

    this._updateStore();
  }

  _getDay() {
    return store.getState('timeDay') || 1;
  }

  _randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  _updateStore() {
    store.setState({
      populationCurrent: this.current,
      populationHousing: this.getHousingCapacity(),
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
