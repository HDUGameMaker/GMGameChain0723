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
    const initConfig = configRegistry.get('initial') || {};
    const historicalSettings = configRegistry.getHistoricalContent?.().populationSettings || {};
    this.growthConfig = initConfig.populationGrowth || this.popConfig.growthPerDay;
    this.inspirationPerPerson = initConfig.inspirationPerPerson ?? 1;
    this.foodPerPerson = historicalSettings.foodPerPerson ?? initConfig.foodPerPerson ?? 1;
    this.baseSatisfaction = historicalSettings.baseSatisfaction ?? 60;
    this.starvationEmigrationThreshold = historicalSettings.starvationEmigrationThreshold ?? 35;
    this.current = 0;
    this.satisfaction = this.baseSatisfaction;
    this.starvationDays = 0;
    this.declineCountdown = 0;
    this._expeditionWorkers = 0;
    this._constructionWorkers = 0;
    this._buildingSystem = null;
    this._resourceSystem = null;
    this._weatherSystem = null;
    // 流民系统：超过住宅的人口每3tick离开
    this._overflowTicks = 0;
    this._overflowLeaving = 0;

    eventBus.on('tick', () => this._onOverflowTick());
    eventBus.on('dayStart', (data) => this.onDayStart(data));
  }

  _onOverflowTick() {
    const housing = this.getHousingCapacity();
    const overflow = Math.max(0, this.current - housing);
    if (overflow <= 0) {
      this._overflowTicks = 0;
      return;
    }
    this._overflowTicks++;
    if (this._overflowTicks >= 3) {
      this._overflowTicks = 0;
      this.current = Math.max(0, this.current - 1);
      this._updateStore();
      eventBus.emit('populationChanged', { current: this.current, direction: 'overflow' });
      eventBus.emit('combatBroadcast', { message: `🚶 1名流民离开了营地（超出住宅上限）` });
    }
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
    const initConfig = configRegistry.get('initial') || {};
    const historicalSettings = configRegistry.getHistoricalContent?.().populationSettings || {};
    this.current = Math.max(1, historicalSettings.initial ?? initConfig.population?.initial ?? 12);
    this.satisfaction = this.baseSatisfaction;
    this.starvationDays = 0;
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

  _getUnitPopulationRequired(unitId) {
    const units = configRegistry.get('enemies')?.units || [];
    const cfg = units.find(u => u.id === unitId);
    return cfg ? (cfg.populationRequired || 1) : 1;
  }

  getMilitaryPopulation(combatSystem = null) {
    const availableUnits = store.getState('availableUnits') || {};
    const reservePop = Object.entries(availableUnits).reduce((sum, [unitId, count]) => {
      return sum + Math.max(0, count || 0) * this._getUnitPopulationRequired(unitId);
    }, 0);

    const armies = store.getState('armies') || [];
    const armyPop = armies.reduce((sum, army) => {
      return sum + (army.unitIds || []).reduce((s, unitId) => s + this._getUnitPopulationRequired(unitId), 0);
    }, 0);

    const deployedUnits = combatSystem?.getAllUnits ? combatSystem.getAllUnits() : [];
    const deployedPop = deployedUnits
      .filter(unit => unit.source !== 'tamed')
      .reduce((sum, unit) => sum + this._getUnitPopulationRequired(unit.type), 0);

    return reservePop + armyPop + deployedPop;
  }

  getPopulationStats(combatSystem = null) {
    const total = Math.max(0, this.current || 0);
    const assigned = this.getAssignedWorkers();
    const expedition = Math.max(0, this._expeditionWorkers || 0);
    const constructionTotal = Math.max(0, this._constructionWorkers || 0);
    const military = Math.min(this.getMilitaryPopulation(combatSystem), constructionTotal);
    const construction = Math.max(0, constructionTotal - military);
    const work = assigned + expedition + construction;
    const idle = Math.max(0, total - work - military);

    const jobs = this._buildingSystem?.getAssignedWorkersByJob?.() || {};
    return {
      idle,
      work,
      military,
      total,
      housing: this.getHousingCapacity(),
      assigned,
      expedition,
      construction,
      constructionTotal,
      jobs,
      satisfaction: this.satisfaction
    };
  }

  /**
   * 获取可用工人池（扣除建筑分配 + 建造占用 + 探险占用）
   */
  getAvailableWorkers() {
    return Math.max(0, this.current - this.getAssignedWorkers() - this._constructionWorkers - this._expeditionWorkers);
  }

  /**
   * 获取人口增长倍率。人文与炼金按加算规则叠加：
   * 基础 100% + 各来源相对 100% 的增量。
   */
  getGrowthMultiplier() {
    const aEffPop = this._alchemySystem ? (this._alchemySystem.getEffects().population || {}) : {};
    let growthMul = 1;
    if (this._cultureSystem) {
      const cEff = this._cultureSystem.getEffects();
      growthMul += (cEff.growthMul || 1) - 1;
    }
    if (aEffPop.growthMul) growthMul += aEffPop.growthMul - 1;
    return Math.max(0, growthMul);
  }

  /**
   * 预览下一次日结算最多能新增的人口范围。
   * 实际增长仍会被住宅上限截断，且会先经过食物不足导致的死亡检查。
   */
  getDailyGrowthPreview() {
    const housing = this.getHousingCapacity();
    const room = Math.max(0, housing - this.current);
    const minBase = this.growthConfig?.min ?? 0;
    const maxBase = this.growthConfig?.max ?? minBase;
    const multiplier = this.getGrowthMultiplier();
    const foodNet = this.getDailyFoodNetPreview();
    if (room <= 0 || foodNet <= 0 || maxBase <= 0 || multiplier <= 0) {
      return { min: 0, max: 0, room, multiplier, foodNet };
    }
    const min = Math.min(room, Math.max(1, Math.round(minBase * multiplier)));
    const max = Math.min(room, Math.max(min, Math.round(maxBase * multiplier)));
    return { min, max, room, multiplier, foodNet };
  }

  getFoodConsumptionAmount(population = this.current) {
    const aEffPop = this._alchemySystem ? (this._alchemySystem.getEffects().population || {}) : {};
    const foodConsumeMul = (this._cultureSystem ? (this._cultureSystem.getEffects().foodConsumeMul || 1) : 1) * (aEffPop.foodConsumeMul || 1);
    return Math.ceil(Math.max(0, population || 0) * this.foodPerPerson * foodConsumeMul);
  }

  getDailyFoodProductionPreview() {
    let foodProduction = this._buildingSystem?.getTotalFoodProduction
      ? this._buildingSystem.getTotalFoodProduction({ cycle: 'day' })
      : 0;
    if (foodProduction > 0 && this._weatherSystem) {
      foodProduction = Math.round(foodProduction * this._weatherSystem.getFoodModifier());
      const rainBonus = this._weatherSystem.getRainBonus();
      if (rainBonus > 0) {
        foodProduction += rainBonus * Math.max(1, this.current);
      }
    }
    return foodProduction;
  }

  getDailyFoodNetPreview() {
    return this.getDailyFoodProductionPreview() - this.getFoodConsumptionAmount(this.current);
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
   * 1. 消耗食物 = 当前人口数
   * 2. 食物不够 → 饥饿死亡
   * 3. 人口 < 2 → 游戏结束
   * 4. 有空余住宅且粮食日净增为正时增长，否则只处理住房不足衰减
   */
  onDayStart() {
    const requiredFood = this.getFoodConsumptionAmount(this.current);
    const availableFood = this._resourceSystem?.getAmount?.('food') || 0;
    const consumed = Math.min(requiredFood, availableFood);
    if (consumed > 0) this._resourceSystem.tryConsume('food', consumed);

    if (consumed < requiredFood) {
      const deficit = requiredFood - consumed;
      const shortageRatio = requiredFood > 0 ? deficit / requiredFood : 0;
      this.starvationDays += 1;
      this.satisfaction = Math.max(0, this.satisfaction - Math.ceil(10 + shortageRatio * 20));

      if (this.satisfaction <= this.starvationEmigrationThreshold) {
        const emigrants = Math.min(this.current, Math.max(1, Math.ceil(deficit / Math.max(1, this.foodPerPerson) * 0.5)));
        this.current -= emigrants;
        eventBus.emit('combatBroadcast', { message: `🚶 粮食短缺，${emigrants}名居民离开了聚落` });
      }

      if (this.starvationDays >= 3 && this.current > 0) {
        const deaths = Math.min(this.current, Math.max(1, Math.ceil(deficit / Math.max(1, this.foodPerPerson) * 0.25)));
        this.current -= deaths;
        eventBus.emit('combatBroadcast', { message: `⚠️ 连续饥荒造成${deaths}人死亡` });
      }
    } else {
      this.starvationDays = 0;
      this.satisfaction = Math.min(100, this.satisfaction + 2);
      const housingRoom = Math.max(0, this.getHousingCapacity() - this.current);
      const minBase = this.growthConfig?.min ?? 0;
      const maxBase = this.growthConfig?.max ?? minBase;
      if (housingRoom > 0 && maxBase > 0 && this.getDailyFoodNetPreview() >= 0 && this.satisfaction >= 50) {
        const multiplier = this.getGrowthMultiplier();
        const growth = Math.min(housingRoom, Math.max(0, Math.round(this._randomInt(minBase, maxBase) * multiplier)));
        this.current += growth;
      }
    }

    if (this.current > 0 && this.inspirationPerPerson > 0) {
      store.setState({ inspiration: (store.getState('inspiration') || 0) + this.current * this.inspirationPerPerson });
    }
    if (this.current <= 0) eventBus.emit('gameOver', { reason: 'population_zero' });
    this._updateStore();
  }

  _getDay() {
    return store.getState('timeDay') || 1;
  }

  _randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  _updateStore() {
    const combatSystem = typeof window !== 'undefined' ? window.__game?.systems?.combat : null;
    const stats = this.getPopulationStats(combatSystem);
    store.setState({
      populationCurrent: this.current,
      populationHousing: this.getHousingCapacity(),
      populationAvailable: this.getAvailableWorkers(),
      populationExpeditionWorkers: this._expeditionWorkers,
      populationConstructionWorkers: this._constructionWorkers,
      populationWork: stats.work,
      populationMilitary: stats.military,
      populationJobs: stats.jobs,
      populationSatisfaction: this.satisfaction,
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
      constructionWorkers: this._constructionWorkers,
      satisfaction: this.satisfaction,
      starvationDays: this.starvationDays
    };
  }

  restoreState(state) {
    if (!state) return;
    this.current = state.current || 0;
    this.declineCountdown = state.declineCountdown || 0;
    this._expeditionWorkers = state.expeditionWorkers || 0;
    this._constructionWorkers = state.constructionWorkers || 0;
    this.satisfaction = Number.isFinite(state.satisfaction) ? state.satisfaction : this.baseSatisfaction;
    this.starvationDays = state.starvationDays || 0;
    this._updateStore();
  }
}
