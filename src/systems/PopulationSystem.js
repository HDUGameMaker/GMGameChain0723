/**
 * PopulationSystem - 人口系统
 * 管理人口增长/减少、工人池、住房上限、食物消耗
 * 
 * 工人数公式: F(x) = ROUND(x * (1.11 - 0.47 * ATAN(0.144 * x)))
 * 食物消耗: 人均食量 * 现有人口数（人均食量默认为5，可配置）
 * 意外死亡: 1%概率，工人:非工人死亡率 = 2:3
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';
import { npcNameGenerator } from '../utils/NpcNameGenerator.js';

export class PopulationSystem {
  constructor() {
    const globalConfig = configRegistry.get('global');
    this.popConfig = globalConfig.population;
    // { growthPerDay: {min, max}, declineDelayDays }
    
    // 读取初始配置
    const initialConfig = configRegistry.get('initial') || {};
    this.initialConfig = initialConfig.population || {};
    
    // 人均食量配置（默认5）
    this.foodPerPerson = initialConfig.foodPerPerson !== undefined 
      ? initialConfig.foodPerPerson 
      : 5;

    this.current = 0;
    this.declineCountdown = 0; // 人口减少倒计时天数
    this._expeditionWorkers = 0; // 探险占用工人数
    this._buildingSystem = null; // 延迟注入
    this._resourceSystem = null; // 延迟注入
    
    // 居民名字列表（用于追踪死亡）
    this.residents = [];
    this.workers = []; // { buildingIndex, name }
  }

  setBuildingSystem(buildingSystem) {
    this._buildingSystem = buildingSystem;
  }

  setResourceSystem(resourceSystem) {
    this._resourceSystem = resourceSystem;
  }

  initNew() {
    this.current = this.initialConfig.initial || 2; // 从配置读取初始人口，默认2
    this.declineCountdown = 0;
    
    // 初始化居民名字
    this._initResidentNames();
    
    this._updateStore();
  }

  /**
   * 初始化居民名字列表
   */
  _initResidentNames() {
    this.residents = [];
    for (let i = 0; i < this.current; i++) {
      this.residents.push(npcNameGenerator.getRandomName());
    }
    this.workers = [];
  }

  /**
   * 获取工人数公式结果
   * F(x) = ROUND(x * (1.11 - 0.47 * ATAN(0.144 * x)))
   * @param {number} x - 现有人口
   * @returns {number} - 工人数
   */
  calculateMaxWorkers(x) {
    if (x <= 0) return 0;
    const result = x * (1.11 - 0.47 * Math.atan(0.144 * x));
    return Math.round(result);
  }

  /**
   * 获取最大可用工人数（根据公式计算）
   */
  getMaxWorkerCapacity() {
    return this.calculateMaxWorkers(this.current);
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
   * 获取可用工人池（扣除建筑分配 + 探险占用）
   * 受工人数公式限制
   */
  getAvailableWorkers() {
    const maxWorkers = this.getMaxWorkerCapacity();
    const assigned = this.getAssignedWorkers();
    const available = maxWorkers - assigned - this._expeditionWorkers;
    return Math.max(0, available);
  }

  /**
   * 获取当前总人口
   */
  getTotal() {
    return this.current;
  }

  /**
   * 获取人口上限（住房容量）
   */
  getMax() {
    return this.getHousingCapacity();
  }

  /**
   * 获取人均食量配置
   */
  getFoodPerPerson() {
    return this.foodPerPerson;
  }

  /**
   * 添加人口（作弊用）
   */
  addPopulation(count) {
    const max = this.getHousingCapacity();
    const newCount = Math.min(this.current + count, max);
    const actualAdded = newCount - this.current;
    
    // 添加新居民名字
    for (let i = 0; i < actualAdded; i++) {
      this.residents.push(npcNameGenerator.getRandomName());
    }
    
    this.current = newCount;
    this._updateStore();
  }

  /**
   * 减少人口（作弊用，不低于2）
   */
  removePopulation(count) {
    const newCount = Math.max(this.current - count, 2);
    const actualRemoved = this.current - newCount;
    
    // 随机移除居民名字
    for (let i = 0; i < actualRemoved; i++) {
      if (this.residents.length > 0) {
        const idx = Math.floor(Math.random() * this.residents.length);
        this.residents.splice(idx, 1);
      }
    }
    
    this.current = newCount;
    this._updateStore();
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
   * 分配工人到建筑（记录工人名字）
   */
  assignWorkerToBuilding(buildingIndex) {
    if (!this._buildingSystem) return false;
    
    const building = this._buildingSystem.buildings[buildingIndex];
    if (!building || building.status !== 'active') return false;
    
    const config = configRegistry.getBuilding(building.buildingId);
    if (!config || !config.maxWorkers) return false;
    if (building.currentWorkers >= config.maxWorkers) return false;
    if (this.getAvailableWorkers() <= 0) return false;
    
    // 从未分配的居民中选择一个作为工人
    const availableResidents = this.residents.filter(name => 
      !this.workers.some(w => w.name === name)
    );
    
    let workerName;
    if (availableResidents.length > 0) {
      const idx = Math.floor(Math.random() * availableResidents.length);
      workerName = availableResidents[idx];
    } else {
      workerName = npcNameGenerator.getRandomName();
    }
    
    this.workers.push({
      buildingIndex,
      name: workerName,
      buildingId: building.buildingId
    });
    
    return true;
  }

  /**
   * 从建筑移除工人
   */
  removeWorkerFromBuilding(buildingIndex) {
    const idx = this.workers.findIndex(w => w.buildingIndex === buildingIndex);
    if (idx >= 0) {
      this.workers.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * 获取建筑中的工人名字
   */
  getWorkerNamesForBuilding(buildingIndex) {
    return this.workers
      .filter(w => w.buildingIndex === buildingIndex)
      .map(w => w.name);
  }

  /**
   * 获取工人总数
   */
  getWorkerCount() {
    return this.workers.length;
  }

  /**
   * 获取非工人居民名字列表
   */
  getNonWorkerResidents() {
    const workerNames = new Set(this.workers.map(w => w.name));
    return this.residents.filter(name => !workerNames.has(name));
  }

  /**
   * 处理意外死亡
   * 1%概率，工人:非工人死亡率 = 2:3
   */
  _handleAccidentalDeath() {
    if (this.current < 2) return; // 至少保留2人
    
    // 1%概率触发意外死亡
    if (Math.random() > 0.01) return;
    
    const totalWorkers = this.workers.length;
    const totalNonWorkers = this.residents.length - totalWorkers;
    
    if (totalWorkers === 0 && totalNonWorkers === 0) return;
    
    // 工人:非工人死亡率 = 2:3
    let isWorkerDeath;
    if (totalWorkers === 0) {
      isWorkerDeath = false; // 没有工人，只能是非工人
    } else if (totalNonWorkers === 0) {
      isWorkerDeath = true; // 没有非工人，只能是工人
    } else {
      // 2/5 概率选择工人死亡，3/5 概率选择非工人死亡
      isWorkerDeath = Math.random() < 2 / 5;
    }
    
    let victimName;
    let deathMessage;
    
    if (isWorkerDeath && totalWorkers > 0) {
      // 工人死亡
      const idx = Math.floor(Math.random() * this.workers.length);
      const worker = this.workers[idx];
      victimName = worker.name;
      
      // 根据建筑类型确定死亡方式
      deathMessage = this._generateWorkerDeathMessage(victimName, worker.buildingId);
      
      // 从工人列表中移除
      this.workers.splice(idx, 1);
      
      // 对应建筑减少一个工人
      if (this._buildingSystem && this._buildingSystem.buildings[worker.buildingIndex]) {
        this._buildingSystem.removeWorker(worker.buildingIndex);
      }
    } else if (totalNonWorkers > 0) {
      // 非工人死亡
      const nonWorkers = this.getNonWorkerResidents();
      if (nonWorkers.length > 0) {
        const idx = Math.floor(Math.random() * nonWorkers.length);
        victimName = nonWorkers[idx];
        deathMessage = this._generateNonWorkerDeathMessage(victimName);
      }
    }
    
    if (victimName && deathMessage) {
      // 从居民列表中移除
      const residentIdx = this.residents.indexOf(victimName);
      if (residentIdx >= 0) {
        this.residents.splice(residentIdx, 1);
      }
      
      this.current--;
      eventBus.emit('populationChanged', {
        current: this.current,
        direction: 'accident',
        message: deathMessage
      });
      
      // 游戏结束检查
      if (this.current < 2) {
        this._updateStore();
        eventBus.emit('gameOver', {
          day: store.getState('timeDay') || this._getDay(),
          population: this.current
        });
      }
    }
  }

  /**
   * 根据建筑类型生成工人死亡消息
   */
  _generateWorkerDeathMessage(name, buildingId) {
    const config = configRegistry.getBuilding(buildingId);
    const buildingName = config?.name || buildingId;
    const nameSurname = npcNameGenerator.toNameSurname(name);
    
    const deathMessages = {
      // 伐木相关
      'logging_camp': `工人  ${nameSurname} 在伐木时被倒下的树木砸中死亡`,
      'enhanced_logging_camp': `工人  ${nameSurname} 在伐木时被倒下的树木砸中死亡`,
      'advanced_logging_camp': `工人  ${nameSurname} 在伐木时被倒下的树木砸中死亡`,
      'lumber_distribution_point': `工人  ${nameSurname} 在搬运木材时被压伤致死`,
      'enhanced_lumber_distribution': `工人  ${nameSurname} 在搬运木材时被压伤致死`,
      'advanced_lumber_distribution': `工人  ${nameSurname} 在搬运木材时被压伤致死`,
      'wood_processing_plant': `工人  ${nameSurname} 在木材加工厂操作机器时发生意外`,
      'enhanced_wood_processing': `工人  ${nameSurname} 在木材加工厂操作机器时发生意外`,
      'advanced_wood_processing': `工人  ${nameSurname} 在木材加工厂操作机器时发生意外`,
      
      // 采矿相关
      'stope': `工人  ${nameSurname} 在采矿时发生塌方被掩埋`,
      'enhanced_stope': `工人  ${nameSurname} 在采矿时发生塌方被掩埋`,
      'advanced_stope': `工人  ${nameSurname} 在采矿时发生塌方被掩埋`,
      'quarry': `工人  ${nameSurname} 在采石场被滚落的石头击中`,
      
      // 锻造相关
      'forge': `工人  ${nameSurname} 在锻造时被飞溅的火花灼伤`,
      'enhanced_forge': `工人  ${nameSurname} 在锻造时被飞溅的火花灼伤`,
      'advanced_forge': `工人  ${nameSurname} 在锻造时被飞溅的火花灼伤`,
      
      // 渔场相关
      'fishing_ground': `工人  ${nameSurname} 在捕鱼时不慎落水溺亡`,
      'enhanced_fishing_ground': `工人  ${nameSurname} 在捕鱼时不慎落水溺亡`,
      'advanced_fishing_ground': `工人  ${nameSurname} 在捕鱼时不慎落水溺亡`,
      
      // 狩猎相关
      'hunting_post': `工人  ${nameSurname} 在狩猎时被野兽袭击`,
      'enhanced_hunting_post': `工人  ${nameSurname} 在狩猎时被野兽袭击`,
      'advanced_hunting_post': `工人  ${nameSurname} 在狩猎时被野兽袭击`,
      
      // 火把相关
      'torch': `工人  ${nameSurname} 在维护火把时被烧伤`,
      'enhanced_torch': `工人  ${nameSurname} 在维护火把时被烧伤`,
      'advanced_torch': `工人  ${nameSurname} 在维护火把时被烧伤`,
      'eternal_torch': `工人  ${nameSurname} 在维护永恒之火时发生意外`,
      
      // 仓库相关
      'warehouse': `工人  ${nameSurname} 在仓库搬运货物时受伤`,
      'enhanced_warehouse': `工人  ${nameSurname} 在仓库搬运货物时受伤`,
      'advanced_warehouse': `工人  ${nameSurname} 在仓库搬运货物时受伤`,
      
      // 其他建筑
      'work_shed': `工人  ${nameSurname} 在工棚工作时发生意外`,
      'enhanced_work_shed': `工人  ${nameSurname} 在工棚工作时发生意外`,
      'advanced_work_shed': `工人  ${nameSurname} 在工棚工作时发生意外`,
      'watchtower': `工人  ${nameSurname} 在瞭望塔上失足坠落`,
      'basic_workstation': `工人  ${nameSurname} 在工作站操作时发生意外`,
      'enhanced_workstation': `工人  ${nameSurname} 在工作站操作时发生意外`,
      'advanced_workstation': `工人  ${nameSurname} 在工作站操作时发生意外`,
      'farming_plot': `工人  ${nameSurname} 在农田劳作时遭遇不幸`,
      'enhanced_farming_plot': `工人  ${nameSurname} 在农田劳作时遭遇不幸`,
    };
    
    return deathMessages[buildingId] || `${buildingName}工人  ${nameSurname} 因为施工不当导致死亡`;
  }

  /**
   * 生成非工人死亡消息
   */
  _generateNonWorkerDeathMessage(name) {
    const nameSurname = npcNameGenerator.toNameSurname(name);
    const messages = [
      `居民  ${nameSurname} 因为驾驶不当而坠机身亡`,
      `居民  ${nameSurname} 在外出时遭遇意外`,
      `居民  ${nameSurname} 突发疾病不幸去世`,
      `居民  ${nameSurname} 在探索周边区域时失踪`,
      `居民  ${nameSurname} 误食有毒食物死亡`,
      `居民  ${nameSurname} 被不明生物袭击`,
      `居民  ${nameSurname} 在夜间外出时迷路`,
      `居民  ${nameSurname} 因意外事故受伤过重`
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  /**
   * 每天结算（由 dayStart 事件触发）
   * 1. 食物建筑产出食物
   * 2. 消耗食物 = 人均食量 * 当前人口数
   * 3. 食物不够 → 饥饿死亡
   * 4. 人口 < 2 → 游戏结束
   * 5. 住房驱动的增长/衰减
   * 6. 意外死亡检查
   */
  onDayStart() {
    if (!this._buildingSystem || !this._resourceSystem) return;

    // ===== 1. 食物产出 =====
    const foodProduction = this._buildingSystem.getTotalFoodProduction();
    if (foodProduction > 0) {
      this._resourceSystem.addClamped('food', foodProduction);
    }

    // ===== 2. 食物消耗 =====
    let foodAvailable = this._resourceSystem.getAmount('food');
    const totalNeeded = this.current * this.foodPerPerson;
    
    // 先消耗HUD中的食物
    const hudConsume = Math.min(foodAvailable, totalNeeded);
    if (hudConsume > 0) {
      this._resourceSystem.tryConsume('food', hudConsume);
      foodAvailable -= hudConsume;
    }
    
    // 如果HUD食物不够，尝试从粮仓取出
    const remainingNeeded = totalNeeded - hudConsume;
    if (remainingNeeded > 0 && this._buildingSystem) {
      // 获取所有粮仓
      const granaries = this._buildingSystem.buildings.filter(b => {
        if (b.status !== 'active') return false;
        const config = configRegistry.getBuilding(b.buildingId);
        return config && config.foodStorage;
      });
      
      // 从粮仓取出食物
      let remainingToTake = remainingNeeded;
      for (const granary of granaries) {
        if (remainingToTake <= 0) break;
        const index = this._buildingSystem.buildings.indexOf(granary);
        const taken = this._buildingSystem.withdrawFoodFromGranary(index, remainingToTake);
        remainingToTake -= taken;
      }
    }

    // ===== 3. 饥饿死亡 =====
    // 当HUD显示的食物量或粮仓贮粮量均不为0时则不触发断粮
    const granaryFood = this._buildingSystem ? this._buildingSystem.getTotalGranaryFood() : 0;
    const currentHudFood = this._resourceSystem.getAmount('food');
    
    // 只有当HUD食物和粮仓食物都为0时才触发断粮
    if (currentHudFood === 0 && granaryFood === 0) {
      const deficit = this.current * this.foodPerPerson;
      const starvedCount = Math.min(Math.floor(deficit / this.foodPerPerson), this.current - 1);
      const starvedBefore = this.current;
      
      // 随机选择饿死的居民
      const starvedNames = [];
      for (let i = 0; i < starvedCount && this.residents.length > 1; i++) {
        const idx = Math.floor(Math.random() * this.residents.length);
        const name = this.residents[idx];
        this.residents.splice(idx, 1);
        
        // 判断是否是工人
        const isWorker = this.workers.some(w => w.name === name);
        
        // 如果是工人，从工人列表和建筑中移除
        if (isWorker) {
          const workerIdx = this.workers.findIndex(w => w.name === name);
          if (workerIdx >= 0) {
            const worker = this.workers[workerIdx];
            this.workers.splice(workerIdx, 1);
            if (this._buildingSystem && this._buildingSystem.buildings[worker.buildingIndex]) {
              this._buildingSystem.removeWorker(worker.buildingIndex);
            }
          }
          // 使用名·姓格式，并标记为工人
          starvedNames.push(`工人  ${npcNameGenerator.toNameSurname(name)} `);
        } else {
          // 使用名·姓格式，并标记为居民
          starvedNames.push(`居民  ${npcNameGenerator.toNameSurname(name)} `);
        }
      }
      
      this.current -= starvedCount;
      eventBus.emit('populationChanged', {
        current: this.current,
        direction: 'starve',
        starved: starvedCount,
        starvedBefore,
        names: starvedNames
      });
    }

    // ===== 4. 游戏结束检查 =====
    if (this.current < 2) {
      this._updateStore();
      eventBus.emit('gameOver', {
        day: store.getState('timeDay') || this._getDay(),
        population: this.current
      });
      return; // 游戏结束，不再处理增长/衰减和意外死亡
    }

    // ===== 5. 住房增长/衰减 =====
    const housing = this.getHousingCapacity();

    if (this.current < housing) {
      // 增长
      this.declineCountdown = 0;
      const growth = this._randomInt(this.popConfig.growthPerDay.min, this.popConfig.growthPerDay.max);
      const newPopulation = Math.min(this.current + growth, housing);
      const actualGrowth = newPopulation - this.current;
      
      // 添加新居民名字
      const newNames = [];
      for (let i = 0; i < actualGrowth; i++) {
        const name = npcNameGenerator.getRandomName();
        this.residents.push(name);
        // 使用名·姓格式，并标记为居民
        newNames.push(`居民  ${npcNameGenerator.toNameSurname(name)} `);
      }
      
      this.current = newPopulation;
      eventBus.emit('populationChanged', { 
        current: this.current, 
        direction: 'grow',
        names: newNames
      });
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
        const newPopulation = Math.max(this.current - decline, housing);
        const actualDecline = this.current - newPopulation;
        
        // 随机移除居民名字
        const removedNames = [];
        for (let i = 0; i < actualDecline && this.residents.length > 1; i++) {
          const idx = Math.floor(Math.random() * this.residents.length);
          removedNames.push(this.residents[idx]);
          this.residents.splice(idx, 1);
        }
        
        this.current = newPopulation;
        eventBus.emit('populationChanged', { 
          current: this.current, 
          direction: 'decline',
          names: removedNames
        });
      }
    } else {
      this.declineCountdown = 0;
    }

    // ===== 6. 意外死亡检查 =====
    this._handleAccidentalDeath();

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
      populationDeclineCountdown: this.declineCountdown,
      populationMaxWorkers: this.getMaxWorkerCapacity(),
      populationFoodPerPerson: this.foodPerPerson
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
      foodPerPerson: this.foodPerPerson,
      residents: this.residents,
      workers: this.workers
    };
  }

  restoreState(state) {
    if (!state) return;
    this.current = state.current || 0;
    this.declineCountdown = state.declineCountdown || 0;
    this._expeditionWorkers = state.expeditionWorkers || 0;
    this.foodPerPerson = state.foodPerPerson !== undefined ? state.foodPerPerson : 5;
    this.residents = state.residents || [];
    this.workers = state.workers || [];
    this._updateStore();
  }
}