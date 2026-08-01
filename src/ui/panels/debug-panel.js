/**
 * DebugPanel — 调试面板
 * 按 ` 键（反引号/backtick）切换显示，或自动随作弊模式显示
 * 显示 FPS、游戏状态、资源调试、系统开关等
 */
import { store } from '../../core/Store.js';
import { eventBus } from '../../core/EventBus.js';
import { configRegistry } from '../../core/ConfigRegistry.js';
import { cheatManager } from '../../utils/CheatManager.js';

const TOGGLE_KEY = '`'; // backtick 反引号
const TOGGLE_KEY_ALT = '~'; // Shift+` 产生的字符

export class DebugPanel {
  /**
   * @param {object} systems — { time, resource, building, population, item, expedition, torch, road, tech, culture, combat, weather, audio }
   * @param {object} gameLoop — GameLoop 实例
   */
  constructor(systems, gameLoop) {
    this._systems = systems;
    this._gameLoop = gameLoop;
    this._visible = false;
    this._container = null;
    this._fpsEl = null;
    this._statsEl = null;
    this._resourcesEl = null;
    this._systemsEl = null;

    // FPS 计算
    this._frameCount = 0;
    this._fpsAccum = 0;
    this._currentFPS = 0;
    this._lastFPSTs = performance.now();

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onRender = this._onRender.bind(this);

    this._initDOM();
    this._bindEvents();
  }

  // ==================== DOM 构建 ====================

  _initDOM() {
    // 主容器
    const panel = document.createElement('div');
    panel.id = 'debug-panel';
    panel.className = 'debug-panel';
    panel.innerHTML = `
      <div class="debug-panel-header">
        <span class="debug-panel-title">🐛 Debug Panel</span>
        <button class="debug-panel-close" id="debug-panel-close" title="关闭 (按 ~ 键切换)">✕</button>
      </div>
      <div class="debug-panel-body">
        <div class="debug-section">
          <div class="debug-section-title">📊 性能</div>
          <div class="debug-fps" id="debug-fps">FPS: --</div>
        </div>
        <div class="debug-section">
          <div class="debug-section-title">⏱️ 时间</div>
          <div class="debug-stats" id="debug-stats"></div>
        </div>
        <div class="debug-section">
          <div class="debug-section-title">📦 资源</div>
          <div class="debug-resources" id="debug-resources"></div>
        </div>
        <div class="debug-section">
          <div class="debug-section-title">⚙️ 系统状态</div>
          <div class="debug-systems" id="debug-systems"></div>
        </div>
        <div class="debug-section">
          <div class="debug-section-title">🎮 快捷操作</div>
          <div class="debug-actions" id="debug-actions">
            <button class="debug-btn" data-action="add-resources">💰 +100全部资源</button>
            <button class="debug-btn" data-action="add-food">🍞 +500食物</button>
            <button class="debug-btn" data-action="toggle-cheat">🎮 切换作弊模式</button>
            <button class="debug-btn" data-action="instant-build">🏗️ 立即完成所有建造</button>
            <button class="debug-btn" data-action="skip-day">⏭️ 跳过一天</button>
            <button class="debug-btn" data-action="toggle-pause">⏯️ 切换暂停</button>
    <button class="debug-btn" data-action="toggle-terrain-labels">🏷️ 标注地块地形</button>
            <button class="debug-btn" data-action="spawn-invasion">⚠️ 生成入侵</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
    this._container = panel;

    // 缓存常用子元素
    this._fpsEl = panel.querySelector('#debug-fps');
    this._statsEl = panel.querySelector('#debug-stats');
    this._resourcesEl = panel.querySelector('#debug-resources');
    this._systemsEl = panel.querySelector('#debug-systems');

    // 关闭按钮
    panel.querySelector('#debug-panel-close').addEventListener('click', () => this.hide());

    // 快捷操作按钮
    panel.querySelector('#debug-actions').addEventListener('click', (e) => {
      const btn = e.target.closest('.debug-btn');
      if (!btn) return;
      const action = btn.dataset.action;
      this._handleAction(action);
    });
  }

  _bindEvents() {
    // 键盘切换
    window.addEventListener('keydown', this._onKeyDown);

    // 作弊模式变化时自动显示/隐藏面板
    eventBus.on('cheatToggled', ({ enabled }) => {
      if (enabled) {
        this.show();
      } else {
        // 作弊模式关闭时也关闭调试面板
        this.hide();
      }
    });

    // 监听渲染事件更新 FPS
    eventBus.on('render', this._onRender);
  }

  // ==================== 显示/隐藏 ====================

  show() {
    if (this._visible) return;
    this._visible = true;
    this._container.classList.add('visible');
    this.refresh();
  }

  hide() {
    if (!this._visible) return;
    this._visible = false;
    this._container.classList.remove('visible');
  }

  toggle() {
    if (this._visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  isVisible() {
    return this._visible;
  }

  // ==================== 刷新数据 ====================

  /** 每帧/定期刷新面板内容 */
  refresh() {
    if (!this._visible) return;
    this._refreshFPS();
    this._refreshStats();
    this._refreshResources();
    this._refreshSystems();
  }

  _refreshFPS() {
    if (this._fpsEl) {
      this._fpsEl.textContent = `FPS: ${this._currentFPS}`;
      // FPS < 30 变红
      this._fpsEl.style.color = this._currentFPS < 30 ? '#ff6b6b' : '#4ecb71';
    }
  }

  _refreshStats() {
    if (!this._statsEl) return;
    const time = this._systems.time;
    const population = this._systems.population;

    const period = time.currentPeriod || 'morning';
    const day = time.day || 1;
    const speed = time.speed || 1;
    const paused = this._gameLoop.isPaused();
    const tickProgress = ((store.getState('timeProgress') || 0) * 100).toFixed(0);

    // 建筑统计
    const buildings = this._systems.building.buildings || [];
    const totalBuildings = buildings.length;
    const buildingCounts = {};
    for (const b of buildings) {
      const id = b.buildingId;
      buildingCounts[id] = (buildingCounts[id] || 0) + 1;
    }

    // 火把统计
    const torches = this._systems.torch.getLitTorches ? this._systems.torch.getLitTorches() : [];

    // 探险
    const expedition = this._systems.expedition.getCurrentExpedition ?
      this._systems.expedition.getCurrentExpedition() : null;

    this._statsEl.innerHTML = `
      <div class="debug-row"><span class="debug-label">时段:</span> ${period} | 第${day}天 | 速度:${speed}× ${paused ? '⏸' : '▶'} | Tick: ${tickProgress}%</div>
      <div class="debug-row"><span class="debug-label">人口:</span> ${population.current} / ${population.getHousingCapacity()} (可用工人: ${population.getAvailableWorkers()})</div>
      <div class="debug-row"><span class="debug-label">建筑:</span> ${totalBuildings} 座 (${Object.entries(buildingCounts).map(([id, cnt]) => `${id}×${cnt}`).join(', ') || '无'})</div>
      <div class="debug-row"><span class="debug-label">火把:</span> ${torches.length} 个点亮 (${torches.map(t => `${t.buildingId || t.id}`).join(', ') || '无'})</div>
      <div class="debug-row"><span class="debug-label">探险:</span> ${expedition ? `进行中 (阶段${expedition.currentPeriodIndex + 1})` : '无'}</div>
      <div class="debug-row"><span class="debug-label">天气:</span> ${store.getState('weatherLabel') || '--'} | ${store.getState('seasonLabel') || '--'} (强度:${store.getState('weatherStrength') ?? 0})</div>
    `;
  }

  _refreshResources() {
    if (!this._resourcesEl) return;
    const resources = this._systems.resource.getHUDResources ?
      this._systems.resource.getHUDResources() : [];

    let html = '';
    for (const res of resources) {
      const pct = res.max > 0 ? ((res.current / res.max) * 100).toFixed(0) : '--';
      const barColor = pct >= 90 ? '#ff6b6b' : pct >= 60 ? '#f0a040' : '#4ecb71';
      html += `
        <div class="debug-res-row">
          <span class="debug-res-name" title="${res.name}">${res.name || res.id}</span>
          <span class="debug-res-val">${res.current} / ${res.max}</span>
          <div class="debug-res-bar"><div class="debug-res-fill" style="width:${pct}%;background:${barColor}"></div></div>
        </div>
      `;
    }
    this._resourcesEl.innerHTML = html;
  }

  _refreshSystems() {
    if (!this._systemsEl) return;
    const sys = this._systems;

    // 科技已研究数
    let techResearched = '--';
    if (sys.tech && sys.tech.getResearched) {
      techResearched = sys.tech.getResearched().length;
    }

    // 人文政策：已研究 / 已启用
    let cultureResearched = '--', cultureActivated = '--';
    if (sys.culture) {
      if (sys.culture.getResearched) cultureResearched = sys.culture.getResearched().length;
      if (sys.culture.getActivatedPolicies) cultureActivated = sys.culture.getActivatedPolicies().length;
    }

    // 战斗单位
    let combatUnits = '--';
    if (sys.combat && sys.combat.getAllUnits) {
      const units = sys.combat.getAllUnits();
      combatUnits = `${units.length} 个`;
    }

    // 道路
    let roadCount = '--';
    if (sys.road) {
      const roads = sys.road.getAllStates ? sys.road.getAllStates() : [];
      roadCount = `${Array.isArray(roads) ? roads.length : '--'} 条`;
    }

    this._systemsEl.innerHTML = `
      <div class="debug-row"><span class="debug-label">科技树:</span> ${techResearched} 已研究</div>
      <div class="debug-row"><span class="debug-label">人文政策:</span> ${cultureResearched} 已研究 / ${cultureActivated} 已启用</div>
      <div class="debug-row"><span class="debug-label">战斗单位:</span> ${combatUnits}</div>
      <div class="debug-row"><span class="debug-label">道路:</span> ${roadCount}</div>
      <div class="debug-row"><span class="debug-label">作弊模式:</span> ${cheatManager.isEnabled() ? '✅ 开启' : '❌ 关闭'}</div>
      <div class="debug-row"><span class="debug-label">BGM:</span> ${sys.audio && sys.audio._currentBGM ? sys.audio._currentBGM.id : '无'}</div>
    `;
  }

  // ==================== FPS 计算 ====================

  _onRender() {
    this._frameCount++;
    const now = performance.now();
    const elapsed = now - this._lastFPSTs;
    if (elapsed >= 1000) {
      this._currentFPS = Math.round(this._frameCount / (elapsed / 1000));
      this._frameCount = 0;
      this._lastFPSTs = now;
    }
    // 每秒刷新 2 次面板数据（够用且不占用太多性能）
    if (this._visible && this._frameCount % 30 === 0) {
      this.refresh();
    }
  }

  // ==================== 键盘切换 ====================

  _onKeyDown(e) {
    // 在输入框中不触发
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
      return;
    }
    // 按 ` 或 ~ 切换（Shift+` 在某些键盘布局下产生 ~）
    if (e.key === TOGGLE_KEY || e.key === TOGGLE_KEY_ALT) {
      e.preventDefault();
      this.toggle();
    }
  }

  // ==================== 快捷操作 ====================

  async _handleAction(action) {
    switch (action) {
      case 'add-resources':
        this._cheatAddAllResources();
        break;
      case 'add-food':
        this._cheatAddFood();
        break;
      case 'toggle-cheat':
        cheatManager.toggle();
        break;
      case 'instant-build':
        this._cheatInstantBuild();
        break;
      case 'skip-day':
        this._cheatSkipDay();
        break;
      case 'toggle-pause':
        this._systems.time.togglePause();
        break;
      case 'spawn-invasion': {
        const power = await window.__game?.popupManager?.prompt('输入入侵战斗力:', '20', { title: '生成入侵' });
        if (power != null && this._systems.invasion) {
          this._systems.invasion.spawnInvasion(parseInt(power) || 20);
        }
        break;
      }
      case 'toggle-terrain-labels':
        this._toggleTerrainLabels();
        break;
    }
    // 操作完立即刷新面板
    setTimeout(() => this.refresh(), 100);
  }

  _cheatAddAllResources() {
    const res = this._systems.resource;
    const resources = configRegistry.get('resources');
    if (!Array.isArray(resources)) return;
    for (const r of resources) {
      res.add(r.id, 100);
    }
  }

  _cheatAddFood() {
    this._systems.resource.add('food', 500);
  }

  _cheatInstantBuild() {
    const buildingSystem = this._systems.building;
    const populationSystem = this._systems.population;
    const buildings = buildingSystem.buildings || [];
    for (const b of buildings) {
      if (b.status === 'constructing') {
        const config = configRegistry.getBuilding(b.buildingId);
        if (!config) continue;
        b.status = 'active';
        b.buildProgress = null;
        // 自动填充工人（模拟 onTick 中的完成逻辑）
        if (config.maxWorkers && config.maxWorkers > 0 && populationSystem) {
          const available = populationSystem.getAvailableWorkers();
          const toAssign = Math.min(config.maxWorkers, available);
          b.currentWorkers = toAssign;
        }
        eventBus.emit('buildingComplete', { building: b });
        buildingSystem._updateStorageMultiplier();
        buildingSystem._checkNewUnlocks(b.buildingId);
      }
    }
    eventBus.emit('buildingUpdated');
  }

  _cheatSkipDay() {
    const time = this._systems.time;
    // 调用 _onPeriodEnd() 4 次 = 跳过 1 天
    for (let i = 0; i < 4; i++) {
      time._onPeriodEnd();
    }
    time.elapsedInTick = 0;
    time._updateStore();
  }

  /**
   * 开关地块地形标注：在每格中央显示地形代码（R/G/D/F/M/W/B）
   * 用于排查"伐木集散点无法安放"等建造/地形问题
   */
  _toggleTerrainLabels() {
    const game = window.__game;
    if (!game || !game.mapRenderer) return;
    const mr = game.mapRenderer;
    const next = !mr.isTerrainLabelsEnabled();
    mr.setTerrainLabelsEnabled(next);
    // 同步按钮文案
    const btn = this._container.querySelector('.debug-btn[data-action="toggle-terrain-labels"]');
    if (btn) {
      btn.textContent = next ? '🏷️ 隐藏地块标注' : '🏷️ 标注地块地形';
      btn.style.background = next ? 'rgba(91, 141, 239, 0.25)' : '';
    }
  }
}
