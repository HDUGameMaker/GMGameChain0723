/**
 * HUD - 主界面抬头显示
 * 资源栏、人口、时间、底部操作按钮
 */
import { store } from '../core/Store.js';
import { eventBus } from '../core/EventBus.js';
import { configRegistry } from '../core/ConfigRegistry.js';
import { progressManager } from '../utils/ProgressManager.js';

export class HUD {
  constructor(systems, popupManager) {
    this.systems = systems;
    this.popupManager = popupManager;
    this._popover = null;
    this._prevResourceValues = {}; // 追踪资源变化
    this._prevPopulation = 0; // 追踪人口变化
    this._prevPeriod = ''; // 追踪时段变化

    this._cacheDOM();
    this._bindButtons();
    this._subscribeStore();
    this._subscribeEvents();
    this._subscribeWeather();
    this.refresh();
  }

  _cacheDOM() {
    this.resourceBar = document.getElementById('resource-bar');
    this.populationDisplay = document.getElementById('population-display');
    this.timeDisplay = document.getElementById('time-display');
    this.btnBuild = document.getElementById('btn-build');
    this.btnTech = document.getElementById('btn-tech');
    this.btnCulture = document.getElementById('btn-culture');
    this.btnAlchemy = document.getElementById('btn-alchemy');
    this.btnTame = document.getElementById('btn-tame');
    this.btnRoad = document.getElementById('btn-road');
    this.btnCancelPlace = document.getElementById('btn-cancel-place');
    this.btnFullscreen = document.getElementById('btn-fullscreen');
    this.btnSettings = document.getElementById('btn-settings');
    this.btnSpeed = document.getElementById('btn-speed');
    this.btnPause = document.getElementById('btn-pause');
    this.weatherDisplay = document.getElementById('weather-display');
    this.expeditionStatus = document.getElementById('expedition-status');
    // 进度条元素（懒初始化）
    this._tickProgressFill = null;
    this._expeditionProgressFill = null;
  }

  _bindButtons() {
    // 科技树
    this.btnTech.addEventListener('click', () => {
      this.popupManager.open('tech_tree', {});
    });

    // 人文树
    this.btnCulture.addEventListener('click', () => {
      this.popupManager.open('culture_tree', {});
    });

    // 炼金
    this.btnAlchemy.addEventListener('click', () => {
      this.popupManager.open('alchemy_lab', {});
    });

    // 驯养
    this.btnTame.addEventListener('click', () => {
      this.popupManager.open('tamed_pool', {});
    });

    // 道路编辑
    this.btnRoad.addEventListener('click', () => {
      if (this.systems.road) {
        this.systems.road.toggleEditMode();
      }
    });

    // 建设按钮
    this.btnBuild.addEventListener('click', () => {
      this.popupManager.open('building_select', {});
    });

    // 取消放置
    this.btnCancelPlace.addEventListener('click', () => {
      if (this.systems.combat?.isDeployTamedMode()) {
        this.systems.combat.exitDeployTamedMode();
      } else if (this.systems.combat?.isPlaceEnemyMode()) {
        this.systems.combat.exitPlaceEnemyMode();
      } else {
        this.systems.building.exitPlacingMode();
      }
    });

    // 全屏
    this.btnFullscreen.addEventListener('click', () => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else if (document.fullscreenEnabled) {
        document.documentElement.requestFullscreen();
      }
    });

    // 设置
    this.btnSettings.addEventListener('click', () => {
      this.popupManager.open('settings', {});
    });

    // 加速
    this.btnSpeed.addEventListener('click', () => {
      const speed = this.systems.time.cycleSpeed();
      this.btnSpeed.textContent = speed === 1 ? '⏩' : `${speed}×`;
    });

    // 暂停
    this.btnPause.addEventListener('click', () => {
      const paused = this.systems.time.togglePause();
      this.btnPause.textContent = paused ? '▶' : '⏸';
    });

    // 全屏不支持时隐藏
    if (!document.fullscreenEnabled) {
      this.btnFullscreen.style.display = 'none';
    }

    // 全屏状态监听
    document.addEventListener('fullscreenchange', () => {
      this.btnFullscreen.textContent = document.fullscreenElement ? '⛶' : '⛶';
    });
  }

  _subscribeStore() {
    store.subscribe('resourceVersion', () => this._refreshResources());
    store.subscribe('populationCurrent', () => this._refreshPopulation());
    store.subscribe('timePeriod', () => this._refreshTime());
    store.subscribe('timeDay', () => this._refreshTime());
    store.subscribe('timeSpeed', () => this._refreshSpeedBtn());
    store.subscribe('timeUserPaused', () => this._refreshPauseBtn());
    store.subscribe('placingState', (state) => this._refreshPlacingMode(state));
    store.subscribe('roadEditMode', (enabled) => this._refreshRoadEditMode(enabled));
    store.subscribe('deployTamedMode', (mode) => this._refreshDeployTamedMode(mode));
    store.subscribe('expeditionState', (state) => this._refreshExpeditionStatus(state));
    store.subscribe('buildingVersion', () => {
      this._refreshPopulation();
      this._refreshResources();
    });
  }

  _subscribeWeather() {
    store.subscribe('weatherLabel', () => this._refreshWeather());
    store.subscribe('seasonLabel', () => this._refreshWeather());
    store.subscribe('weatherStrength', () => this._refreshWeather());
  }

  _refreshWeather() {
    if (!this.weatherDisplay) return;
    const weatherLabel = store.getState('weatherLabel') || '☀️ 晴天';
    const seasonLabel = store.getState('seasonLabel') || '🌸 春';
    const strength = store.getState('weatherStrength') ?? 0;
    // 强度 >= 5 显示警告色
    let color = '';
    if (strength >= 5) color = 'color:#ff6b6b;';
    else if (strength >= 3) color = 'color:#f0a040;';
    this.weatherDisplay.innerHTML = `<span style="${color}">${seasonLabel} · ${weatherLabel}</span>`;
    this.weatherDisplay.title = `强度: ${strength >= 0 ? '+' : ''}${strength} 级`;
  }

  _subscribeEvents() {
    eventBus.on('resourceChanged', () => this._refreshResources());
    eventBus.on('populationChanged', () => this._refreshPopulation());
    eventBus.on('expeditionComplete', (result) => {
      this._showExpeditionResult(result);
    });
  }

  refresh() {
    this._refreshResources();
    this._refreshPopulation();
    this._refreshTime();
    this._refreshSpeedBtn();
    this._refreshPauseBtn();
    this._refreshWeather();
  }

  _refreshResources() {
    const resources = this.systems.resource.getHUDResources();
    const rates = this.systems.building.getProductionRates();

    // 计算食物每日净变化（产出 - 消耗）
    const foodProduction = this.systems.building.getTotalFoodProduction();
    const foodConsumption = this.systems.population.current;
    const foodDailyRate = foodProduction - foodConsumption;

    this.resourceBar.innerHTML = '';

    for (const res of resources) {
      // 食物使用每日速率，其他资源使用 per-tick 速率
      const isFood = res.id === 'food';
      let rate = isFood ? foodDailyRate : (rates[res.id] || 0);
      const rateUnit = isFood ? '天' : 'Tick';

      const isFull = res.current >= res.max;
      const item = document.createElement('div');
      item.className = 'resource-item' + (isFull ? ' full' : '');
      const iconHtml = res.icon
        ? `<img src="${res.icon}" alt="${res.name}" class="res-icon" style="width:22px;height:22px;object-fit:contain;vertical-align:middle" onerror="this.replaceWith(document.createTextNode('${this._getResourceEmoji(res.id)}'))" />`
        : this._getResourceEmoji(res.id);

      // 构建 HTML：图标 + 数值 + 产量速率标记
      let innerHTML = `<span>${iconHtml}</span><span class="res-value">${res.current}</span>`;
      if (rate !== 0) {
        const sign = rate > 0 ? '+' : '';
        const rateClass = rate > 0 ? 'positive' : 'negative';
        innerHTML += `<span class="res-rate ${rateClass}">${sign}${rate}</span>`;
      }
      item.innerHTML = innerHTML;

      // 点击弹窗：含产量速率信息
      const rateText = rate !== 0
        ? `\n每${rateUnit}: ${rate > 0 ? '+' : ''}${rate}`
        : '';
      item.addEventListener('click', (e) => {
        this._showPopover(e.target, `${res.name}: ${res.current} / ${res.max}${rateText}`);
      });
      this.resourceBar.appendChild(item);

      // 资源变化弹跳动画
      const prevVal = this._prevResourceValues[res.id];
      if (prevVal !== undefined && prevVal !== res.current && window.gsap) {
        const valueEl = item.querySelector('.res-value');
        gsap.fromTo(valueEl,
          { scale: 1.4, color: res.current > prevVal ? '#88ff88' : '#ff8888' },
          { scale: 1, color: '#ffffff', duration: 0.4, ease: 'back.out(2)' }
        );
      }
      this._prevResourceValues[res.id] = res.current;
    }
  }

  _getResourceEmoji(id) {
    const emojis = { wood: '🪵', plank: '📐', stone: '🪨', iron_ore: '⛏️', coal: '⚫', iron_ingot: '🔩', food: '🍞', gear: '⚙️', fur: '🧶' };
    return emojis[id] || '📦';
  }

  _refreshPopulation() {
    const current = this.systems.population.current;
    const housing = this.systems.population.getHousingCapacity();

    const housingClass = current >= housing ? ' class="bottleneck"' : '';

    this.populationDisplay.innerHTML =
      `👥 ${current} / <span${housingClass}>${housing}</span>`;

    // 人口变化弹跳动画
    if (this._prevPopulation !== 0 && this._prevPopulation !== current && window.gsap) {
      gsap.fromTo(this.populationDisplay,
        { scale: 1.2 },
        { scale: 1, duration: 0.4, ease: 'back.out(3)' }
      );
    }
    this._prevPopulation = current;

    this.populationDisplay.onclick = (e) => {
      const available = this.systems.population.getAvailableWorkers();
      const assigned = this.systems.population.getAssignedWorkers();
      const foodAmount = this.systems.resource ? this.systems.resource.getAmount('food') : 0;
      // 获取战士/弓箭手数量
      let warriorCount = 0, archerCount = 0;
      if (this.systems.combat) {
        const units = this.systems.combat.getAllUnits();
        warriorCount = units.filter(u => u.type === 'warrior').length;
        archerCount = units.filter(u => u.type === 'archer').length;
      }
      this._showPopover(e.target,
        `当前人口: ${current}\n住宅上限: ${housing}\n可用工人: ${available}\n已分配: ${assigned}\n战士: ${warriorCount}\n弓箭手: ${archerCount}\n食物储备: ${foodAmount}`
      );
    };
  }

  _refreshTime() {
    const time = this.systems.time;
    const icon = time.PERIOD_ICONS[time.currentPeriod] || '☀️';
    const label = time.PERIOD_LABELS[time.currentPeriod] || '';
    const newPeriod = time.currentPeriod;

    // 时段切换淡入淡出动画
    if (this._prevPeriod && this._prevPeriod !== newPeriod && window.gsap) {
      gsap.fromTo(this.timeDisplay,
        { opacity: 0, y: -5 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }
      );
    }
    this._prevPeriod = newPeriod;

    // 渲染时间文字 + 进度条容器（仅首次创建）
    if (!this._tickProgressFill) {
      this.timeDisplay.innerHTML = `
        <span>${icon} ${label} Day ${time.day}</span>
        <div class="tick-progress"><div class="tick-progress-fill" style="width:0%"></div></div>
      `;
      this._tickProgressFill = this.timeDisplay.querySelector('.tick-progress-fill');
      // 注册到统一进度管理器（tick 进度 = timeProgress 连续值）
      progressManager.registerDiscrete(
        this._tickProgressFill,
        () => 0,
        () => 1
      );
    } else {
      this.timeDisplay.querySelector('span').textContent = `${icon} ${label} Day ${time.day}`;
    }
  }

  _refreshSpeedBtn() {
    const speed = store.getState('timeSpeed') || 1;
    const label = speed === 1 ? '⏩' : `${speed}×`;
    this.btnSpeed.textContent = label;
    // 高倍速红色警告
    this.btnSpeed.style.color = speed >= 8 ? '#ff6b6b' : '';
  }

  _refreshPauseBtn() {
    const paused = store.getState('timeUserPaused');
    this.btnPause.textContent = paused ? '▶' : '⏸';
  }

  _refreshPlacingMode(state) {
    if (state === 'PLACING') {
      this.btnBuild.style.display = 'none';
      this.btnCancelPlace.style.display = 'flex';
      this.btnRoad.classList.add('disabled');
      this.btnFullscreen.classList.add('disabled');
      this.btnSettings.classList.add('disabled');
      this.btnSpeed.classList.add('disabled');
      this.btnPause.classList.add('disabled');
    } else {
      this.btnBuild.style.display = 'flex';
      this.btnCancelPlace.style.display = 'none';
      if (!store.getState('roadEditMode')) {
        this.btnRoad.classList.remove('disabled');
        this.btnFullscreen.classList.remove('disabled');
        this.btnSettings.classList.remove('disabled');
        this.btnSpeed.classList.remove('disabled');
        this.btnPause.classList.remove('disabled');
      }
    }
  }

  _refreshRoadEditMode(enabled) {
    if (enabled) {
      this.btnRoad.style.background = 'rgba(91, 141, 239, 0.3)';
      this.btnRoad.style.borderColor = 'var(--accent-blue)';
      this.btnBuild.classList.add('disabled');
      this.btnFullscreen.classList.add('disabled');
      this.btnSettings.classList.add('disabled');
      this.btnSpeed.classList.add('disabled');
      this.btnPause.classList.add('disabled');
    } else {
      this.btnRoad.style.background = '';
      this.btnRoad.style.borderColor = '';
      this.btnBuild.classList.remove('disabled');
      this.btnFullscreen.classList.remove('disabled');
      this.btnSettings.classList.remove('disabled');
      this.btnSpeed.classList.remove('disabled');
      this.btnPause.classList.remove('disabled');
    }
  }

  _refreshDeployTamedMode(mode) {
    if (mode) {
      this.btnCancelPlace.style.display = 'inline-block';
      this.btnTame.classList.add('active');
      this.btnBuild.classList.add('disabled');
      this.btnFullscreen.classList.add('disabled');
      this.btnSettings.classList.add('disabled');
    } else {
      this.btnCancelPlace.style.display = 'none';
      this.btnTame.classList.remove('active');
      this.btnBuild.classList.remove('disabled');
      this.btnFullscreen.classList.remove('disabled');
      this.btnSettings.classList.remove('disabled');
    }
  }

  _refreshExpeditionStatus(state) {
    if (state && state.status === 'active') {
      const expSystem = this.systems.expedition;
      const totalPeriods = state.regions.length; // 实际选择的阶段数
      const totalTicks = totalPeriods * 3;
      const regionNames = state.regions.map(rId => {
        const r = configRegistry.getRegion(rId);
        return r ? r.name : rId;
      });
      const currentPeriod = state.currentPeriodIndex + 1;
      const occupiedWorkers = state.occupiedWorkers || 0;
      const workerInfo = occupiedWorkers > 0 ? ` | 👥 ${occupiedWorkers}人` : '';
      this.expeditionStatus.style.display = 'block';

      if (!this._expeditionProgressFill) {
        // 首次渲染：创建 DOM 并注册到统一进度管理器
        this.expeditionStatus.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;width:100%;margin-bottom:4px;">
            <span class="expedition-label">🔍 探索中 | ${regionNames.join(' → ')} | 第 ${currentPeriod}/${totalPeriods} 时段${workerInfo}</span>
            <span class="expedition-pct" style="font-size:11px;opacity:0.8;flex-shrink:0;margin-left:8px;">0%</span>
          </div>
          <div class="progress-bar" style="height:5px;">
            <div class="progress-fill blue expedition-hud-fill" style="width:0%"></div>
          </div>
        `;
        this._expeditionProgressFill = this.expeditionStatus.querySelector('.expedition-hud-fill');
        const pctLabel = this.expeditionStatus.querySelector('.expedition-pct');

        // 注册进度条：自动在 tick 间平滑插值
        progressManager.registerDiscrete(
          this._expeditionProgressFill,
          () => {
            const exp = expSystem.getCurrentExpedition();
            return exp ? exp.currentPeriodIndex * 3 + (exp.ticksInCurrentPeriod || 0) : 0;
          },
          () => totalTicks,
          {
            labelEl: pctLabel,
            formatLabel: (v) => `${Math.round(v * 100)}%`
          }
        );
      } else {
        // 后续调用：仅更新文本标签
        const labelEl = this.expeditionStatus.querySelector('.expedition-label');
        if (labelEl) {
          labelEl.textContent = `🔍 探索中 | ${regionNames.join(' → ')} | 第 ${currentPeriod}/${totalPeriods} 时段${workerInfo}`;
        }
      }

      this.expeditionStatus.onclick = () => {
        this.popupManager.open('expedition_detail', {});
      };
    } else {
      this.expeditionStatus.style.display = 'none';
      this._expeditionProgressFill = null;
    }
  }

  _showExpeditionResult(result) {
    const yields = Object.entries(result.totalYielded)
      .map(([id, amt]) => {
        const cfg = configRegistry.getResource(id);
        return `${cfg ? cfg.name : id} +${amt}`;
      }).join(', ');
    const discarded = Object.entries(result.totalDiscarded)
      .map(([id, amt]) => {
        const cfg = configRegistry.getResource(id);
        return `${cfg ? cfg.name : id} -${amt}`;
      }).join(', ');

    let msg = `探险归来！\n获得: ${yields || '无'}`;
    if (discarded) msg += `\n因容量不足损失: ${discarded}`;

    this.popupManager.open('event', {
      event: {
        name: '探险归来',
        description: msg,
        image: '',
        options: [{ text: '好的', effects: [] }]
      }
    });
  }

  _showPopover(target, text) {
    this._hidePopover();
    const popover = document.createElement('div');
    popover.className = 'popover';
    popover.textContent = text;
    popover.style.whiteSpace = 'pre-line';
    document.body.appendChild(popover);

    const rect = target.getBoundingClientRect();
    popover.style.left = rect.left + 'px';
    popover.style.top = (rect.bottom + 8) + 'px';

    this._popover = popover;
    setTimeout(() => this._hidePopover(), 3000);
  }

  _hidePopover() {
    if (this._popover) {
      this._popover.remove();
      this._popover = null;
    }
  }
}
