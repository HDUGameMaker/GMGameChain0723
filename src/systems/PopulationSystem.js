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
    this._expeditionWorkers = 0; // 探险占用工人数
    this._constructionWorkers = 0; // 建造占用工人数
    this._buildingSystem = null; // 延迟注入
    this._resourceSystem = null; // 延迟注入
    this._weatherSystem = null; // 天气系统引用
  }

  setBuildingSystem(buildingSystem) {
    this._buildingSystem = buildingSystem;
  }

  setResourceSystem(resourceSystem) {
    this._resourceSystem = resourceSystem;
  }

  setWeatherSystem(weatherSystem) {
    this._weatherSystem = weatherSystem;
  }

  setCultureSystem(cultureSystem) {
    this._cultureSystem = cultureSystem;
  }

  setAlchemySystem(alchemySystem) {
    this._alchemySystem = alchemySystem;
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
    // 人文政策最大人口加成
    const aEffPop = this._alchemySystem ? (this._alchemySystem.getEffects().population || {}) : {};
    const popBonus = (this._cultureSystem ? (this._cultureSystem.getEffects().maxPopBonus || 0) : 0) + (aEffPop.maxPopBonus || 0);
    return this._buildingSystem.getTotalHousingCapacity() + popBonus;
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
   * 获取可用工人池（扣除建筑分配 + 建造占用 + 探险占用）
   */
  getAvailableWorkers() {
    return Math.max(0, this.current - this.getAssignedWorkers() - this._constructionWorkers - this._expeditionWorkers);
  }

  /**
   * 建造/修路时占用工人
   */
  occupyForConstruction(count) {
    this._constructionWorkers += count;
    this._updateStore();
  }

  /**
   * 建造/修路完成后释放工人
   */
  releaseFromConstruction(count) {
    this._constructionWorkers = Math.max(0, this._constructionWorkers - count);
    this._updateStore();
  }

  /**
   * 获取建造工人数
   */
  getConstructionWorkers() {
    return this._constructionWorkers;
  }

  /**
   * 探险出发时占用工人
   */
  occupyForExpedition(count) {
    this._expeditionWorkers += count;
    this._updateStore();
  }

  /**
   * 探险归来时归还工人
   */
  releaseFromExpedition(count) {
    this._expeditionWorkers = Math.max(0, this._expeditionWorkers - count);
    this._updateStore();
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

    // ===== 1. 食物产出（受天气/季节影响） =====
    let foodProduction = this._buildingSystem.getTotalFoodProduction();
    if (foodProduction > 0 && this._weatherSystem) {
      // 天气对基础产出的修饰
      foodProduction = Math.round(foodProduction * this._weatherSystem.getFoodModifier());
      // 雨后晴增产（每人额外）
      const rainBonus = this._weatherSystem.getRainBonus();
      if (rainBonus > 0) {
        foodProduction += rainBonus * Math.max(1, this.current);
      }
    }
    if (foodProduction > 0) {
      this._resourceSystem.addClamped('food', foodProduction);
    }

    // ===== 2. 食物消耗（受人文政策影响） =====
    const aEffPop = this._alchemySystem ? (this._alchemySystem.getEffects().population || {}) : {};
    const foodConsumeMul = (this._cultureSystem ? (this._cultureSystem.getEffects().foodConsumeMul || 1) : 1) * (aEffPop.foodConsumeMul || 1);
    const foodAvailable = this._resourceSystem.getAmount('food');
    const consumeAmount = Math.min(foodAvailable, Math.ceil(this.current * foodConsumeMul));
    if (consumeAmount > 0) {
      this._resourceSystem.tryConsume('food', consumeAmount);
    }

    // ===== 3. 饥饿死亡 =====
    const deficit = Math.ceil(this.current * foodConsumeMul) - consumeAmount;
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
      // 增长（受人文政策影响）
      this.declineCountdown = 0;
      const aEffPop = this._alchemySystem ? (this._alchemySystem.getEffects().population || {}) : {};
      const growthMul = (this._cultureSystem ? (this._cultureSystem.getEffects().growthMul || 1) : 1) * (aEffPop.growthMul || 1);
      const growth = Math.max(1, Math.round(this._randomInt(this.popConfig.growthPerDay.min, this.popConfig.growthPerDay.max) * growthMul));
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
      populationExpeditionWorkers: this._expeditionWorkers,
      populationConstructionWorkers: this._constructionWorkers,
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
      declineCountdown: this.declineCountdown,
      expeditionWorkers: this._expeditionWorkers,
      constructionWorkers: this._constructionWorkers
    };
  }

  restoreState(state) {
    if (!state) return;
    this.current = state.current || 0;
    this.declineCountdown = state.declineCountdown || 0;
    this._expeditionWorkers = state.expeditionWorkers || 0;
    this._constructionWorkers = state.constructionWorkers || 0;
    this._updateStore();
  }
}
