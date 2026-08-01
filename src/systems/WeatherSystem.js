/**
 * WeatherSystem - 天气与季节系统
 * 管理天气变化、季节轮换、强度级别、对食物产出和人口的影响
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class WeatherSystem {
  constructor() {
    this.seasonNames = ['spring', 'summer', 'autumn', 'winter'];
    this.seasonLabels = { spring: '🌸 春', summer: '☀️ 夏', autumn: '🍂 秋', winter: '❄️ 冬' };
    this.weatherLabels = {
      clear: '☀️ 晴天', rainy: '🌧️ 雨天', cloudy: '☁️ 阴天',
      windy: '🌬️ 风天', thunder: '⛈️ 雷雨', storm: '🌀 风暴',
      snowy: '🌨️ 雪天'
    };

    // 状态
    this.currentWeather = 'clear';
    this.currentSeason = 'spring';
    this.weatherStrength = 0;
    this.lastWeather = null;
    this.dayInSeason = 1;
    this.seasonDay = 1;
    this._foodModifier = 1;
    this._rainBonus = 0;
    this._foodAdjustmentDay = 0;

    // 系统引用
    this._populationSystem = null;
    this._resourceSystem = null;
    this._buildingSystem = null;

    // 天气概率（归一化）
    this.WEATHER_WEIGHTS = [
      { id: 'clear',   weight: 57 },
      { id: 'rainy',   weight: 19 },
      { id: 'cloudy',  weight: 10 },
      { id: 'windy',   weight: 10 },
      { id: 'thunder', weight: 3 },
      { id: 'storm',   weight: 1 }
    ];
    this.TOTAL_WEIGHT = this.WEATHER_WEIGHTS.reduce((s, w) => s + w.weight, 0);

    // 每季节天数
    this.SEASON_DAYS = 15;

    eventBus.on('tick', (data) => this._onTick(data));
    eventBus.on('dayStart', (data) => this._onDayStart(data));
  }

  setPopulationSystem(ps) { this._populationSystem = ps; }
  setResourceSystem(rs) { this._resourceSystem = rs; }
  setBuildingSystem(bs) { this._buildingSystem = bs; }

  // ===== 初始化 =====

  initNew() {
    this.currentSeason = 'spring';
    this.currentWeather = 'clear';
    this.weatherStrength = 0;
    this.lastWeather = null;
    this.dayInSeason = 1;
    this._foodModifier = 1;
    this._rainBonus = 0;
    this._foodAdjustmentDay = 0;
    this._updateStore();
  }

  // ===== 天气概率滚动 =====

  _rollWeather() {
    const r = Math.random() * this.TOTAL_WEIGHT;
    let cum = 0;
    for (const w of this.WEATHER_WEIGHTS) {
      cum += w.weight;
      if (r <= cum) return w.id;
    }
    return 'clear';
  }

  /** 强度分布：大部分0~1级，极端情况少见 */
  _rollStrength() {
    const roll = Math.random();
    if (roll < 0.05) return -2;
    if (roll < 0.15) return -1;
    if (roll < 0.55) return 0;
    if (roll < 0.80) return 1;
    if (roll < 0.92) return 2;
    if (roll < 0.96) return 3;
    if (roll < 0.98) return 4;
    if (roll < 0.99) return 5;
    return 5 + Math.floor(Math.random() * 6); // 5~10
  }

  // ===== 季节计算 =====

  /** 根据天数计算季节 */
  _calcSeason(day) {
    const idx = Math.floor((day - 1) / this.SEASON_DAYS) % this.seasonNames.length;
    this.dayInSeason = ((day - 1) % this.SEASON_DAYS) + 1;
    return this.seasonNames[idx];
  }

  // ===== 事件处理 =====

  /** 每天开始：滚动天气、切换季节 */
  _onDayStart(data) {
    const prevSeason = this.currentSeason;
    this.currentSeason = this._calcSeason(data.day);

    this.lastWeather = this.currentWeather;
    const newWeather = this._rollWeather();

    // 冬天 20% 雨天变雪天
    if (this.currentSeason === 'winter' && newWeather === 'rainy' && Math.random() < 0.2) {
      this.currentWeather = 'snowy';
    } else {
      this.currentWeather = newWeather;
    }

    this.weatherStrength = this._rollStrength();
    this._rollDailyFoodAdjustment(data.day);

    // 触发事件
    if (prevSeason !== this.currentSeason) {
      eventBus.emit('seasonChanged', {
        prevSeason, newSeason: this.currentSeason,
        day: data.day, dayInSeason: this.dayInSeason
      });
    }
    eventBus.emit('weatherChanged', {
      weather: this.currentWeather, strength: this.weatherStrength, season: this.currentSeason,
      day: data.day
    });

    this._updateStore();
  }

  /** 每tick：20%中途变天 + 死亡判定 + 建筑损伤 */
  _onTick(data) {
    let changed = false;

    // 20% 中途变天
    if (Math.random() < 0.20) {
      this.lastWeather = this.currentWeather;
      const newWeather = this._rollWeather();
      if (this.currentSeason === 'winter' && newWeather === 'rainy' && Math.random() < 0.2) {
        this.currentWeather = 'snowy';
      } else {
        this.currentWeather = newWeather;
      }
      this.weatherStrength = this._rollStrength();
      changed = true;
    }

    this._checkWeatherDeaths();
    this._checkBuildingDamage();

    if (changed) {
      eventBus.emit('weatherChanged', {
        weather: this.currentWeather, strength: this.weatherStrength, season: this.currentSeason
      });
      this._updateStore();
    }
  }

  // ===== 死亡判定 =====

  _checkWeatherDeaths() {
    if (!this._populationSystem) return;
    const pop = this._populationSystem;
    if (pop.current <= 0) return;

    // 基础死亡概率之和
    let deathChance = 0;

    // 雷雨 0.175%
    if (this.currentWeather === 'thunder') deathChance += 0.00175;
    // 风暴 0.1%
    if (this.currentWeather === 'storm') deathChance += 0.001;

    // 强度 >= 5：每多一级 +0.025%
    if (this.weatherStrength >= 5) {
      deathChance += (this.weatherStrength - 4) * 0.00025;
    }

    // 夏 +1% 中暑
    if (this.currentSeason === 'summer') deathChance += 0.01;
    // 冬 +1% 失温
    if (this.currentSeason === 'winter') deathChance += 0.01;

    if (Math.random() < deathChance) {
      pop.current = Math.max(0, pop.current - 1);
      pop.refresh();
      eventBus.emit('populationChanged', { current: pop.current, direction: 'weather' });
      eventBus.emit('combatBroadcast', { message: `💀 极端天气导致 1 人死亡` });
    }
  }

  // ===== 建筑损伤 =====

  _checkBuildingDamage() {
    if (!this._buildingSystem || this.weatherStrength < 5) return;
    const strengthBonus = this.weatherStrength - 4;
    const damageChance = strengthBonus * 0.12;

    if (Math.random() >= damageChance) return;

    // 随机选一个活跃建筑施加 1 点损伤
    const actives = this._buildingSystem.buildings.filter(b => b.status === 'active');
    if (actives.length === 0) return;
    const target = actives[Math.floor(Math.random() * actives.length)];
    if (!target._damage) target._damage = 0;
    target._damage += 1;

    const cfg = configRegistry.getBuilding(target.buildingId);
    eventBus.emit('combatBroadcast', {
      message: `🌪️ 暴风损坏了 ${cfg ? cfg.name : target.buildingId}！`
    });
    eventBus.emit('buildingDamaged', { buildingIndex: this._buildingSystem.buildings.indexOf(target) });
  }

  // ===== 水力/风力装置效率 =====

  /**
   * 获取天气对装置的效率倍率和损坏概率
   * @returns {{ efficiency: number, damageChance: number }}
   */
  getAttachmentModifier() {
    let extra = 0;
    if (this.currentWeather === 'rainy' || this.currentWeather === 'thunder' || this.currentWeather === 'windy') {
      if (this.weatherStrength <= 0) extra = 0.05;
      else if (this.weatherStrength <= 2) extra = 0.10;
      else if (this.weatherStrength <= 4) extra = 0.20;
      else if (this.weatherStrength >= 6) extra = 0.30;
    }
    if (this.currentWeather === 'storm') extra = 0.35;

    let damageChance = 0;
    if (this.weatherStrength >= 6) {
      damageChance = (this.weatherStrength - 5) * 0.20;
    }
    return { efficiency: 1 + extra, damageChance };
  }

  // ===== 食物产出修饰器 =====

  /**
   * 获取当前天气/季节对食物产出的倍率
   * 在 getTotalFoodProduction 中应用
   */
  getFoodModifier() {
    return this._foodModifier || 1;
  }

  _rollFoodModifier() {
    let mod = 1.0;

    // 天气影响
    switch (this.currentWeather) {
      case 'rainy':
        // 25%概率减少1~2份
        if (Math.random() < 0.25) mod *= 0.85;
        break;
      case 'thunder':
        // 35%概率减少1~3份
        if (Math.random() < 0.35) mod *= 0.80;
        break;
      case 'storm':
        // 35%概率减少2~3份
        if (Math.random() < 0.35) mod *= 0.70;
        break;
      case 'snowy':
        mod *= 0.85;
        break;
    }

    // 季节影响
    switch (this.currentSeason) {
      case 'spring':
        if (Math.random() < 0.25) mod *= 1.25;
        break;
      case 'autumn':
        if (Math.random() < 0.20) mod *= 1.20;
        break;
    }

    return mod;
  }

  /**
   * 雨后晴增产：当天如果是晴天且昨天是雨天/雷雨，额外增加食物
   * @returns {number} 每人额外获得食物份数
   */
  getRainBonus() {
    return this._rainBonus || 0;
  }

  _rollRainBonus() {
    if (this.currentWeather !== 'clear') return 0;
    if (!this.lastWeather) return 0;

    let bonus = 0;
    if (this.lastWeather === 'rainy') {
      // 35% 增加 1~2 份
      if (Math.random() < 0.35) {
        bonus = 1 + Math.floor(Math.random() * 2);
        // 夏 +15% 概率
        if (this.currentSeason === 'summer') bonus += Math.random() < 0.15 ? 1 : 0;
      }
    } else if (this.lastWeather === 'thunder') {
      // 50% 增加 1~3 份
      if (Math.random() < 0.50) {
        bonus = 1 + Math.floor(Math.random() * 3);
        if (this.currentSeason === 'summer') bonus += Math.random() < 0.15 ? 1 : 0;
      }
    }
    return bonus;
  }

  _rollDailyFoodAdjustment(day) {
    this._foodAdjustmentDay = day || store.getState('timeDay') || 1;
    this._foodModifier = this._rollFoodModifier();
    this._rainBonus = this._rollRainBonus();
    store.setState({
      weatherFoodModifier: this._foodModifier,
      weatherRainBonus: this._rainBonus,
      weatherFoodAdjustmentDay: this._foodAdjustmentDay
    });
  }

  // ===== 存档 =====

  getState() {
    return {
      currentWeather: this.currentWeather,
      currentSeason: this.currentSeason,
      weatherStrength: this.weatherStrength,
      lastWeather: this.lastWeather,
      dayInSeason: this.dayInSeason,
      foodModifier: this._foodModifier,
      rainBonus: this._rainBonus,
      foodAdjustmentDay: this._foodAdjustmentDay
    };
  }

  restoreState(state) {
    if (!state) return;
    this.currentWeather = state.currentWeather || 'clear';
    this.currentSeason = state.currentSeason || 'spring';
    this.weatherStrength = state.weatherStrength ?? 0;
    this.lastWeather = state.lastWeather || null;
    this.dayInSeason = state.dayInSeason || 1;
    this._foodModifier = state.foodModifier ?? 1;
    this._rainBonus = state.rainBonus ?? 0;
    this._foodAdjustmentDay = state.foodAdjustmentDay ?? 0;
    this._updateStore();
  }

  _updateStore() {
    store.setState({
      weatherCurrent: this.currentWeather,
      weatherSeason: this.currentSeason,
      weatherStrength: this.weatherStrength,
      weatherFoodModifier: this._foodModifier,
      weatherRainBonus: this._rainBonus,
      weatherFoodAdjustmentDay: this._foodAdjustmentDay,
      weatherLabel: this.weatherLabels[this.currentWeather] || '☀️ 晴天',
      seasonLabel: this.seasonLabels[this.currentSeason] || '🌸 春'
    });
  }
}
