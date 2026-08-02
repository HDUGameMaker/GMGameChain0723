/**
 * HUD - 主界面抬头显示
 * 资源栏、人口、时间、底部操作按钮
 */
import { store } from '../core/Store.js';
import { eventBus } from '../core/EventBus.js';
import { configRegistry } from '../core/ConfigRegistry.js';
import { progressManager } from '../utils/ProgressManager.js';

const PRIMARY_RESOURCE_IDS = ['wood', 'stone', 'food', 'gold'];
const SECONDARY_RESOURCE_IDS = ['icon_inspiration'];

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
    this._bindKeyboard();
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
    this.btnObjective = document.getElementById('btn-objective');
    this.btnBuildingTree = document.getElementById('btn-building-tree');
    this.btnSpellTree = document.getElementById('btn-spell-tree');
    this.btnTech = document.getElementById('btn-tech');
    this.btnCulture = document.getElementById('btn-culture');
    this.btnAlchemy = document.getElementById('btn-alchemy');
    this.btnTame = document.getElementById('btn-tame');
    this.btnRoad = document.getElementById('btn-road');
    this.btnQuest = document.getElementById('btn-quest');
    this.btnCancelPlace = document.getElementById('btn-cancel-place');
    this.btnFullscreen = document.getElementById('btn-fullscreen');
    this.btnSettings = document.getElementById('btn-settings');
    this.btnSpeed = document.getElementById('btn-speed');
    this.btnPause = document.getElementById('btn-pause');
    this.btnMoveMode = document.getElementById('btn-move-mode');
    this.btnArmy = document.getElementById('btn-army');
    this.btnTraining = document.getElementById('btn-training');
    this.weatherDisplay = document.getElementById('weather-display');
    this.expeditionStatus = document.getElementById('expedition-status');
    this.deferredEventTray = document.getElementById('deferred-event-tray');
    this.techStatus = document.getElementById('tech-status');
    if (this.weatherDisplay) {
      this.weatherDisplay.style.display = 'none';
    }
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
      this.popupManager.open('doctrine_panel', {});
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
    this.btnRoad.addEventListener('click', () => this._toggleRoadEditMode());

    // 任务面板
    this.btnQuest.addEventListener('click', () => {
      const qs = window.__game?.systems?.quest;
      const quest = qs ? qs.getActiveQuest() : null;
      this.popupManager.open('quest_panel', { quest });
    });
    this.btnArmy.addEventListener('click', () => {
      this.popupManager.open('army_panel', {});
    });
    this.btnTraining.addEventListener('click', () => {
      this.popupManager.open('training_panel', {});
    });
    this.btnBuild.addEventListener('click', () => {
      this.systems.territory?.exitCastingMode();
      this.popupManager.open('building_select', {});
    });

    // 战役目标（随时查看胜利/失败条件与实时进度）
    if (this.btnObjective) {
      this.btnObjective.addEventListener('click', () => {
        this.popupManager.open('objective', {});
      });
    }

    // 建筑科技树 / 炼金法术树：与建设按钮平级的直达入口（免去先开子菜单再进树的二级跳转）
    if (this.btnBuildingTree) {
      this.btnBuildingTree.addEventListener('click', () => {
        this.popupManager.open('building_tree', {});
      });
    }
    if (this.btnSpellTree) {
      this.btnSpellTree.addEventListener('click', () => {
        this.popupManager.open('spell_tree', {});
      });
    }

    // 占有术施法按钮（动态创建，避免改 index.html）
    this.btnPossession = document.createElement('button');
    this.btnPossession.className = 'hud-btn';
    this.btnPossession.innerHTML = '<span class="hud-btn-icon">✦</span><span class="hud-btn-label">占术</span>';
    this.btnPossession.title = '占有术：消耗黄金标记格子，铺满地图通关';
    if (this.btnBuild && this.btnBuild.parentNode) {
      this.btnBuild.parentNode.insertBefore(this.btnPossession, this.btnBuild);
    }
    this.btnPossession.addEventListener('click', () => this._togglePossessionMode());

    // 领地进度 / 建筑上限 状态条
    this.territoryStatus = document.createElement('div');
    this.territoryStatus.className = 'territory-status';
    this.territoryStatus.style.cssText = 'position:fixed;top:54px;left:50%;transform:translateX(-50%);z-index:50;background:rgba(20,20,40,0.72);padding:4px 14px;border-radius:8px;font-size:12px;color:#ccc;pointer-events:none;backdrop-filter:blur(4px);white-space:nowrap;';
    document.body.appendChild(this.territoryStatus);

    eventBus.on('territoryCastingModeChanged', () => this._updatePossessionButton());
    eventBus.on('territoryChanged', () => this._updateTerritoryStatus());
    store.subscribe('territoryVersion', () => this._updateTerritoryStatus());
    this._updatePossessionButton();
    this._updateTerritoryStatus();

    // 顶部游戏进度条（我方 vs 敌方占领拉锯，中线为 50% 胜负线）
    this.gameProgressBar = document.createElement('div');
    this.gameProgressBar.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:8px;z-index:10000;pointer-events:none;';
    const gpTrack = document.createElement('div');
    gpTrack.style.cssText = 'position:relative;width:100%;height:100%;background:rgba(255,255,255,0.08);';
    this._gpMyFill = document.createElement('div');
    this._gpMyFill.style.cssText = 'position:absolute;left:0;top:0;bottom:0;width:0%;background:linear-gradient(90deg,#7c3aed,#cc88ff);transition:width 0.3s ease;';
    this._gpEnemyFill = document.createElement('div');
    this._gpEnemyFill.style.cssText = 'position:absolute;right:0;top:0;bottom:0;width:0%;background:linear-gradient(270deg,#b91c1c,#ff6b6b);transition:width 0.3s ease;';
    const gpMark = document.createElement('div');
    gpMark.style.cssText = 'position:absolute;left:50%;top:0;bottom:0;width:2px;background:rgba(255,255,255,0.65);transform:translateX(-50%);';
    gpTrack.appendChild(this._gpMyFill);
    gpTrack.appendChild(this._gpEnemyFill);
    gpTrack.appendChild(gpMark);
    this.gameProgressBar.appendChild(gpTrack);
    document.body.appendChild(this.gameProgressBar);
    this._updateGameProgress();

    // 敌人压力 / 军队战力 状态条
    this.enemyStatus = document.createElement('div');
    this.enemyStatus.className = 'enemy-status';
    this.enemyStatus.style.cssText = 'position:fixed;top:84px;left:50%;transform:translateX(-50%);z-index:50;background:rgba(40,16,16,0.72);padding:4px 14px;border-radius:8px;font-size:12px;color:#ccc;pointer-events:none;backdrop-filter:blur(4px);white-space:nowrap;';
    document.body.appendChild(this.enemyStatus);
    eventBus.on('enemyExpansionChanged', () => this._updateEnemyStatus());
    eventBus.on('armyChanged', () => this._updateEnemyStatus());
    store.subscribe('enemyExpansionVersion', () => this._updateEnemyStatus());
    store.subscribe('availableUnits', () => this._updateEnemyStatus());
    this._updateEnemyStatus();

    // 炼金法术施法状态条
    this.spellStatus = document.createElement('div');
    this.spellStatus.className = 'spell-status';
    this.spellStatus.style.cssText = 'position:fixed;top:114px;left:50%;transform:translateX(-50%);z-index:50;background:rgba(20,16,40,0.78);padding:4px 14px;border-radius:8px;font-size:12px;color:#ccc;pointer-events:none;backdrop-filter:blur(4px);white-space:nowrap;display:none;border:1px solid rgba(51,224,255,0.4);';
    document.body.appendChild(this.spellStatus);
    eventBus.on('spellCastingModeChanged', () => this._updateSpellStatus());
    eventBus.on('spellZonesChanged', () => this._updateSpellStatus());
    store.subscribe('spellVersion', () => this._updateSpellStatus());
    this._updateSpellStatus();

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
      this._updatePauseIndicator(paused);
      window.__game?.systems?.quest?.onPlayerAction('toggle_pause');
    });

    // 挪动模式切换
    this.btnMoveMode.addEventListener('click', () => {
      const mr = window.__game?.mapRenderer;
      if (mr) mr.toggleMoveMode();
    });

    // 全屏不支持时隐藏
    if (!document.fullscreenEnabled) {
      this.btnFullscreen.style.display = 'none';
    }

    // 重设计：隐藏已砍系统的入口按钮（代码保留，仅 UI 不可达）
    ['btn-tech', 'btn-culture', 'btn-tame', 'btn-road', 'btn-quest'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    document.addEventListener('fullscreenchange', () => {
      this.btnFullscreen.textContent = document.fullscreenElement ? '⛶' : '⛶';
      eventBus.emit('fullscreenToggled');
    });
  }

  _togglePossessionMode() {
    const ts = this.systems.territory;
    if (!ts) return;
    if (ts.isCastingMode()) {
      ts.exitCastingMode();
    } else {
      this.systems.road?.exitEditMode?.();
      ts.enterCastingMode();
    }
  }

  _updatePossessionButton() {
    if (!this.btnPossession) return;
    const ts = this.systems.territory;
    const active = ts && ts.isCastingMode();
    this.btnPossession.style.background = active ? 'rgba(170,85,255,0.35)' : '';
    this.btnPossession.style.borderColor = active ? '#aa55ff' : '';
    this.btnPossession.innerHTML = active
      ? '<span class="hud-btn-icon">✕</span><span class="hud-btn-label">退出占术</span>'
      : '<span class="hud-btn-icon">✦</span><span class="hud-btn-label">占术</span>';
  }

  _updateEnemyStatus() {
    if (!this.enemyStatus) return;
    const ee = this.systems.enemyExpansion;
    if (!ee) { this.enemyStatus.style.display = 'none'; return; }
    const power = ee.getArmyPower();
    const count = ee.getCellCount();
    const total = store.getState('enemyClaimableTotal') || 0;
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
    const failRatioPct = (store.getState('enemyFailRatio') ?? 0.5) * 100;
    const strength = ee.getStrengthForDay(store.getState('timeDay') || 1);
    this.enemyStatus.style.display = 'block';
    const danger = parseFloat(pct) >= failRatioPct * 0.6;
    const pctColor = danger ? '#ff4444' : '#ff6b6b';
    this.enemyStatus.innerHTML =
      `👾 敌占 <b style="color:${pctColor}">${pct}%</b> (${count}格/危${failRatioPct.toFixed(0)}%) &nbsp; ⚔️ 战力 <b style="color:#4ecb71">${power}</b> · 强度 ${strength}`;
    this._updateGameProgress();
  }

  _updateSpellStatus() {
    if (!this.spellStatus) return;
    const ss = this.systems.spell;
    if (!ss || !ss.isCastingMode()) { this.spellStatus.style.display = 'none'; return; }
    const active = ss.getActiveSpell();
    this.spellStatus.style.display = 'block';
    const name = active?.def?.name || '法术';
    const radius = active?.def?.areaRadius || 0;
    const rangeText = radius > 0 ? `${radius}格半径` : '全域';
    this.spellStatus.innerHTML =
      `🜂 <b style="color:#33e0ff">${name}</b> 施法中（${rangeText}）· 点击地图释放 · <b style="color:#aaa">Esc 取消</b>`;
  }

  _updateTerritoryStatus() {
    if (!this.territoryStatus) return;
    const ts = this.systems.territory;
    if (!ts) { this.territoryStatus.style.display = 'none'; return; }
    const owned = ts.getOwnedClaimableCount();
    const total = ts.getClaimableCount();
    const pct = total > 0 ? Math.round((owned / total) * 100) : 0;
    const cap = ts.getBuildingCap();
    const bCount = this.systems.building ? this.systems.building.buildings.length : 0;
    const cost = ts.getCastCost();
    this.territoryStatus.style.display = 'block';
    this.territoryStatus.innerHTML =
      `🜂 占领 <b style="color:#cc88ff">${pct}%</b> (${owned}/${total}) · 目标50% &nbsp; 💰占术${cost} 🏠${bCount}/${cap}`;
    this._updateGameProgress();
  }

  /** 顶部进度条：我方占领%（紫，自左）vs 敌方占领%（红，自右），中线 50% 为胜负线 */
  _updateGameProgress() {
    if (!this.gameProgressBar) return;
    const ts = this.systems.territory;
    const ee = this.systems.enemyExpansion;
    const total = ts ? ts.getClaimableCount() : 0;
    const owned = ts ? ts.getOwnedClaimableCount() : 0;
    const enemyCount = ee ? ee.getCellCount() : 0;
    const myPct = total > 0 ? (owned / total) * 100 : 0;
    const enemyPct = total > 0 ? (enemyCount / total) * 100 : 0;
    if (this._gpMyFill) this._gpMyFill.style.width = Math.min(100, myPct).toFixed(2) + '%';
    if (this._gpEnemyFill) this._gpEnemyFill.style.width = Math.min(100, enemyPct).toFixed(2) + '%';
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      // 3.禁用Tab/Alt浏览器默认行为
      if (e.key === 'Tab' || e.key === 'Alt') {
        e.preventDefault();
      }
      // 空格键暂停/继续（3.空格键快捷键）
      if ((e.key === ' ' || e.code === 'Space') && e.target === document.body) {
        e.preventDefault();
        const paused = this.systems.time.togglePause();
        this._updatePauseIndicator(paused);
        window.__game?.systems?.quest?.onPlayerAction('toggle_pause');
      }
      if ((e.key === 'e' || e.key === 'E') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (this._shouldIgnoreShortcut(e)) return;
        e.preventDefault();
        this._toggleRoadEditMode();
      }
    });
  }

  _toggleRoadEditMode() {
    if (!this.systems.road) return;
    const mr = window.__game?.mapRenderer;
    if (mr && mr._moveMode) mr.exitMoveMode();
    this.systems.road.toggleEditMode();
  }

  _shouldIgnoreShortcut(e) {
    const target = e.target;
    if (target && target !== document.body) {
      const tag = target.tagName;
      if (target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return true;
      }
    }
    return this.popupManager?._isOpen === true;
  }

  _updatePauseIndicator(paused) {
    let el = document.getElementById('pause-indicator');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pause-indicator';
      document.body.appendChild(el);
    }
    if (paused) {
      el.className = 'visible';
      el.textContent = '⏸ 已暂停';
      this.btnPause.textContent = '▶';
    } else {
      el.className = '';
      this.btnPause.textContent = '⏸';
    }
  }

  _subscribeStore() {
    store.subscribe('resourceVersion', () => this._refreshResources());
    store.subscribe('inspiration', () => this._refreshResources());
    store.subscribe('populationCurrent', () => this._refreshPopulation());
    store.subscribe('populationAvailable', () => this._refreshPopulation());
    store.subscribe('populationWork', () => this._refreshPopulation());
    store.subscribe('populationMilitary', () => this._refreshPopulation());
    store.subscribe('populationExpeditionWorkers', () => this._refreshPopulation());
    store.subscribe('populationConstructionWorkers', () => this._refreshPopulation());
    store.subscribe('timePeriod', () => this._refreshTime());
    store.subscribe('timeDay', () => this._refreshTime());
    store.subscribe('timeSpeed', () => this._refreshSpeedBtn());
    store.subscribe('armies', () => this._refreshPopulation());
    store.subscribe('availableUnits', () => this._refreshPopulation());
    store.subscribe('armyVersion', () => this._refreshPopulation());
    store.subscribe('timeUserPaused', () => this._refreshPauseBtn());
    store.subscribe('placingState', (state) => this._refreshPlacingMode(state));
    store.subscribe('deployTamedMode', (mode) => this._refreshDeployTamedMode(mode));
    store.subscribe('roadEditMode', (enabled) => this._refreshRoadEditMode(enabled));
    store.subscribe('expeditionState', (state) => this._refreshExpeditionStatus(state));
    store.subscribe('expeditionStates', (states) => this._refreshExpeditionStatus(states));
    store.subscribe('deferredEvents', (events) => this._refreshDeferredEvents(events));
    store.subscribe('techCurrent', (current) => this._refreshTechStatus(current));
    store.subscribe('roadVersion', () => this._refreshPopulation());
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
    this._refreshTime();
  }

  _subscribeEvents() {
    eventBus.on('resourceChanged', () => this._refreshResources());
    eventBus.on('populationChanged', () => this._refreshPopulation());
    eventBus.on('tick', () => this._refreshPopulation());
    eventBus.on('expeditionComplete', (result) => {
      this._showExpeditionResult(result);
    });
    eventBus.on('moveModeChanged', ({ enabled }) => {
      this.btnMoveMode.textContent = enabled ? '🖐️ 挪动模式' : '✋ 常时模式';
      if (enabled) {
        this.btnMoveMode.classList.add('active');
      } else {
        this.btnMoveMode.classList.remove('active');
      }
    });
    eventBus.on('questUpdated', ({ quest }) => this._updateQuestWidget(quest));
    store.subscribe('buildingVersion', () => this._checkAdvancedUnlocks());
  }

  _checkAdvancedUnlocks() {
    const hasAlchemyLab = this.systems.building?.hasBuilding('alchemy_lab');
    this.btnAlchemy.style.display = hasAlchemyLab ? 'flex' : 'none';
    // 炼金法术树入口随炼金实验室解锁出现（与炼金工坊按钮同步）
    if (this.btnSpellTree) {
      this.btnSpellTree.style.display = hasAlchemyLab ? 'flex' : 'none';
    }
  }

  _updateQuestWidget(quest) {
    const widget = document.getElementById('quest-widget');
    const icon = document.getElementById('quest-widget-icon');
    const text = document.getElementById('quest-widget-text');
    if (!widget || !icon || !text) return;

    if (!quest) {
      widget.classList.add('hidden');
      return;
    }

    widget.classList.remove('hidden');
    icon.textContent = quest.icon || '📋';
    const p = quest.progress || { current: 0, target: 1 };
    const done = p.current >= p.target;
    text.innerHTML = `<div class="qw-name">${quest.name}</div><div class="qw-progress">${done ? '✓ 完成' : `${p.current}/${p.target}`}</div>`;

    // 红点：新任务或未完成
    if (!done && !widget.querySelector('.qw-dot')) {
      const dot = document.createElement('div');
      dot.className = 'qw-dot';
      widget.appendChild(dot);
    } else if (done) {
      const dot = widget.querySelector('.qw-dot');
      if (dot) dot.remove();
    }

    widget.onclick = () => {
      const qs = window.__game?.systems?.quest;
      const q = qs ? qs.getActiveQuest() : null;
      window.__game?.popupManager?.open('quest_panel', { quest: q });
    };
  }

  refresh() {
    this._refreshResources();
    this._refreshPopulation();
    this._refreshTime();
    this._refreshSpeedBtn();
    this._refreshPauseBtn();
    this._refreshWeather();
    this._checkAdvancedUnlocks();
    this._refreshDeferredEvents(store.getState('deferredEvents') || []);
    this._refreshTechStatus(store.getState('techCurrent'));
  }

  _refreshResources() {
    const resources = this.systems.resource.getHUDResources();
    const byId = {};
    for (const res of resources) {
      byId[res.id] = res;
    }

    this.resourceBar.innerHTML = '';

    /* 灵感显示 */
    const inspiration = store.getState('inspiration') || 0;
    const inspPerPerson = this.systems.population.inspirationPerPerson || 1;

    const specialResources = {
      icon_inspiration: {
        id: 'icon_inspiration',
        name: '灵感',
        icon: byId.icon_inspiration?.icon || '',
        current: inspiration,
        max: byId.icon_inspiration?.max || 100000,
        flowId: 'inspiration',
        popoverExtra: '每人每日: +' + inspPerPerson
      }
    };

    const groups = [
      { className: 'primary', title: '建筑和采集直接获得的基础资源', ids: PRIMARY_RESOURCE_IDS },
      { className: 'secondary', title: '依赖基础资源加工转化的生产资源', ids: SECONDARY_RESOURCE_IDS }
    ];

    for (const group of groups) {
      const cluster = document.createElement('div');
      cluster.className = `resource-cluster ${group.className}`;
      cluster.title = group.title;

      const items = document.createElement('div');
      items.className = 'resource-cluster-items';
      for (const id of group.ids) {
        const res = specialResources[id] || byId[id];
        if (!res) continue;
        const item = this._createResourceItem(res);
        items.appendChild(item);
      }
      cluster.appendChild(items);
      this.resourceBar.appendChild(cluster);
    }
  }

  _refreshDeferredEvents(events) {
    if (!this.deferredEventTray) return;
    const pending = Array.isArray(events) ? events : [];
    if (pending.length === 0) {
      this.deferredEventTray.style.display = 'none';
      this.deferredEventTray.innerHTML = '';
      return;
    }

    this.deferredEventTray.style.display = 'flex';
    this.deferredEventTray.innerHTML = pending.map(evt => `
      <button class="deferred-event-card" data-event-id="${evt.id}">
        <span class="deferred-event-icon">📜</span>
        <span class="deferred-event-text">
          <span class="deferred-event-name">${evt.name || evt.id}</span>
          <span class="deferred-event-meta">待处理 · 当天结束自动默认</span>
        </span>
      </button>
    `).join('');

    this.deferredEventTray.querySelectorAll('.deferred-event-card').forEach(btn => {
      btn.addEventListener('click', () => {
        this.systems.event?.openDeferredEvent?.(btn.dataset.eventId);
      });
    });
  }

  _refreshTechStatus(current) {
    if (!this.techStatus) return;
    if (!current || !current.techId) {
      this.techStatus.style.display = 'none';
      this.techStatus.innerHTML = '';
      this.techStatus.onclick = null;
      return;
    }

    const tech = this.systems.tech?.getTech?.(current.techId);
    const total = Math.max(1, tech?.researchTime || 1);
    const progress = Math.max(0, current.progressTicks || 0);
    const pct = Math.min(100, Math.round((progress / total) * 100));
    const progressText = `${Math.floor(progress)}/${total} tick`;

    this.techStatus.style.display = 'flex';
    this.techStatus.innerHTML = `
      <div class="tech-status-head">
        <span class="tech-status-name">🔬 ${tech ? tech.name : current.techId}</span>
        <span class="tech-status-pct">${pct}%</span>
      </div>
      <div class="tech-status-meta">科技研发中 · ${progressText}</div>
      <div class="progress-bar" style="height:4px;">
        <div class="progress-fill blue" style="width:${pct}%"></div>
      </div>
    `;
    this.techStatus.onclick = () => this.popupManager.open('tech_tree', {});
  }

  _getDailyResourceFlow() {
    const flow = this.systems.building.getDailyResourceFlow ? this.systems.building.getDailyResourceFlow() : {};
    const clone = {};
    for (const [id, entry] of Object.entries(flow)) {
      clone[id] = {
        produced: Math.round(entry.produced || 0),
        consumed: Math.round(entry.consumed || 0),
        net: Math.round(entry.net || 0)
      };
    }

    const add = (id, produced, consumed) => {
      if (!clone[id]) clone[id] = { produced: 0, consumed: 0, net: 0 };
      clone[id].produced += produced || 0;
      clone[id].consumed += consumed || 0;
      clone[id].net = clone[id].produced - clone[id].consumed;
    };

    // 食物每日产出和消耗来自人口系统的日结算口径；覆盖建筑通用 flow 中的 food，避免重复累加。
    const foodProduction = this.systems.population.getDailyFoodProductionPreview
      ? this.systems.population.getDailyFoodProductionPreview()
      : (this.systems.building.getTotalFoodProduction ? this.systems.building.getTotalFoodProduction({ cycle: 'day' }) : 0);
    const foodConsumption = this.systems.population.getFoodConsumptionAmount
      ? this.systems.population.getFoodConsumptionAmount(this.systems.population.current)
      : Math.ceil(this.systems.population.current || 0);
    clone.food = {
      produced: Math.round(foodProduction || 0),
      consumed: Math.round(foodConsumption || 0),
      net: Math.round((foodProduction || 0) - (foodConsumption || 0))
    };

    // 人口每日灵感。
    const inspPerPerson = this.systems.population.inspirationPerPerson || 1;
    add('inspiration', Math.round(this.systems.population.current * inspPerPerson), 0);

    // 殖民地每日资源收益。
    const colonies = store.getState('colonies') || [];
    for (const colony of colonies) {
      for (const r of colony.dailyIncome?.resources || []) {
        add(r.resourceId, r.amount || 0, 0);
      }
    }

    return clone;
  }

  _createResourceItem(res) {
    const isFull = res.current >= res.max;
    const item = document.createElement('div');
    item.className = 'resource-item' + (isFull ? ' full' : '');
    item.setAttribute('data-res-id', res.id);
    const iconHtml = res.icon
      ? `<img src="${res.icon}" alt="${res.name}" class="res-icon" onerror="this.replaceWith(document.createTextNode('${this._getResourceEmoji(res.id)}'))" />`
      : this._getResourceEmoji(res.id);

    // 重设计：顶部资源栏不再常驻显示"余"结余，产出改由建筑上的产出进度条呈现；
    // 点击资源仍可查看每日产出/消耗/结余明细（按需计算，避免每次刷新都算）。
    const innerHTML =
      `<span class="res-main"><span class="res-icon-wrap">${iconHtml}</span><span class="res-value">${res.current}</span></span>`;
    item.innerHTML = innerHTML;

    item.addEventListener('click', (e) => {
      const flow = (this._getDailyResourceFlow()[res.flowId || res.id]) || { produced: 0, consumed: 0, net: 0 };
      const netText = flow.net > 0 ? '+' + flow.net : String(flow.net);
      const text = `${res.name}: ${res.current} / ${res.max}` +
        `\n每日产出: ${flow.produced}` +
        `\n每日消耗: ${flow.consumed}` +
        `\n每日结余: ${netText}` +
        (res.popoverExtra ? '\n' + res.popoverExtra : '');
      this._showPopover(e.currentTarget, text);
    });

    const prevVal = this._prevResourceValues[res.id];
    if (prevVal !== undefined && prevVal !== res.current && window.gsap) {
      const valueEl = item.querySelector('.res-value');
      gsap.fromTo(valueEl,
        { scale: 1.4, color: res.current > prevVal ? '#88ff88' : '#ff8888' },
        { scale: 1, color: '#ffffff', duration: 0.4, ease: 'back.out(2)' }
      );
    }
    this._prevResourceValues[res.id] = res.current;
    return item;
  }

  _getResourceEmoji(id) {
    const emojis = {
      wood: '🪵',
      plank: '📐',
      stone: '🪨',
      hematite: '⛏️',
      coal: '⚫',
      iron_ingot: '🔩',
      steel: '▰',
      brick: '🧱',
      machine_part: '⚙️',
      electronic_part: '🔌',
      food: '🍞',
      gear: '⚙️',
      fur: '🧶',
      gold: '💰',
      icon_inspiration: '💡'
    };
    return emojis[id] || '📦';
  }

  _refreshPopulation() {
    const bs = this.systems.building;
    const soldierCount = bs ? bs.getTotalSoldierCount() : 0;
    const soldierCap = bs ? bs.getTotalSoldierCapacity() : 0;
    const armies = store.getState('armies') || [];
    const availUnits = store.getState('availableUnits') || {};
    const reserve = Object.values(availUnits).reduce((s, v) => s + (v || 0), 0);
    const atCap = soldierCount >= soldierCap && soldierCap > 0;
    const capColor = atCap ? '#ff6b6b' : '#4ecb71';
    const capClass = atCap ? ' class="bottleneck"' : '';

    this.populationDisplay.innerHTML =
      `<div class="population-line">` +
        `<span class="hud-info-main">⚔️ 士兵 <span style="color:${capColor}">${soldierCount}</span>/<span${capClass}>${soldierCap}</span></span>` +
        `<span class="hud-info-sub">储备 ${reserve} · 军团 ${armies.length}</span>` +
      `</div>`;

    // 士兵变化弹跳动画
    if (this._prevPopulation !== 0 && this._prevPopulation !== soldierCount && window.gsap) {
      gsap.fromTo(this.populationDisplay,
        { scale: 1.2 },
        { scale: 1, duration: 0.4, ease: 'back.out(3)' }
      );
    }
    this._prevPopulation = soldierCount;

    this.populationDisplay.onclick = (e) => {
      window.__game?.systems?.quest?.onPlayerAction('click_population');
      const foodAmount = this.systems.resource ? this.systems.resource.getAmount('food') : 0;
      const armyUnitTotal = armies.reduce((s, a) => s + (a.unitIds || []).length, 0);
      const armyDetail = armies.map(a => a.name + ':' + (a.unitIds || []).length + '单位').join(' · ');
      const warn = soldierCap <= 0
        ? '\n⚠️ 尚无军营，无法训练士兵'
        : (atCap ? '\n⚠️ 已达士兵上限，建造/升级军营' : '');
      this._showPopover(e.target,
        `士兵: ${soldierCount} / 上限 ${soldierCap}\n训练储备: ${reserve} 单位\n军团编制: ${armies.length}支 · ${armyUnitTotal}单位\n${armyDetail || ''}\n食物储备: ${foodAmount}${warn}`
      );
    };
  }

  _countMilitaryUnitsByDomain(domain) {
    const units = configRegistry.get('enemies')?.units || [];
    const unitMap = {};
    units.forEach(u => { unitMap[u.id] = u; });
    let count = 0;

    const availableUnits = store.getState('availableUnits') || {};
    for (const [unitId, amount] of Object.entries(availableUnits)) {
      if ((unitMap[unitId]?.domain || 'land') === domain) count += amount || 0;
    }

    const armies = store.getState('armies') || [];
    for (const army of armies) {
      for (const unitId of army.unitIds || []) {
        if ((unitMap[unitId]?.domain || 'land') === domain) count++;
      }
    }

    const deployedUnits = this.systems.combat ? this.systems.combat.getAllUnits() : [];
    for (const unit of deployedUnits) {
      if (unit.source === 'tamed') continue;
      if ((unitMap[unit.type]?.domain || 'land') === domain) count++;
    }
    return count;
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

    const weatherLabel = store.getState('weatherLabel') || '☀️ 晴天';
    const seasonLabel = store.getState('seasonLabel') || '🌸 春';
    const strength = store.getState('weatherStrength') ?? 0;
    const weatherClass = strength >= 5 ? 'danger' : (strength >= 3 ? 'warning' : '');

    // 渲染时间文字 + 进度条容器（仅首次创建）
    if (!this._tickProgressFill) {
      this.timeDisplay.innerHTML = `
        <span class="time-weather-line"><span class="${weatherClass}">${seasonLabel} · ${weatherLabel}</span><span>${icon} ${label} Day ${time.day}</span></span>
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
      const line = this.timeDisplay.querySelector('.time-weather-line');
      if (line) {
        line.innerHTML = `<span class="${weatherClass}">${seasonLabel} · ${weatherLabel}</span><span>${icon} ${label} Day ${time.day}</span>`;
      }
    }
    this.timeDisplay.title = `天气强度: ${strength >= 0 ? '+' : ''}${strength} 级`;
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
    this._updatePauseIndicator(paused);
  }

  _refreshPlacingMode(state) {
    if (state === 'PLACING') {
      this.btnBuild.style.display = 'none';
      this.btnCancelPlace.style.display = 'flex';
      this.btnFullscreen.classList.add('disabled');
      this.btnSettings.classList.add('disabled');
      this.btnSpeed.classList.add('disabled');
      this.btnPause.classList.add('disabled');
    } else {
      this.btnBuild.style.display = 'flex';
      this.btnCancelPlace.style.display = 'none';
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

  _refreshRoadEditMode(enabled) {
    if (enabled) {
      this.btnRoad.style.background = 'rgba(91, 141, 239, 0.3)';
      this.btnRoad.style.borderColor = 'var(--accent-blue)';
      this.btnRoad.innerHTML = '<span class="hud-btn-icon" style="font-size:22px">✕</span><span class="hud-btn-label">退出</span>';
    } else {
      this.btnRoad.style.background = '';
      this.btnRoad.style.borderColor = '';
      this.btnRoad.innerHTML = '<span class="hud-btn-icon">🛤️</span><span class="hud-btn-label">铺路</span>';
    }
  }

  _refreshExpeditionStatus(state) {
    const states = Array.isArray(state)
      ? state
      : (state && state.status === 'active' ? [state] : (this.systems.expedition?.getExpeditions?.() || []));
    const activeStates = states.filter(exp => exp && exp.status === 'active');

    if (activeStates.length === 0) {
      this.expeditionStatus.style.display = 'none';
      this._expeditionProgressFill = null;
      this.expeditionStatus.onclick = null;
      return;
    }

    this.expeditionStatus.style.display = 'flex';
    this.expeditionStatus.innerHTML = activeStates.map((exp, index) => {
      const ticksPerPeriod = this.systems.expedition?.getTicksPerPeriod?.() || 3;
      const totalPeriods = exp.regions.length;
      const totalTicks = Math.max(1, totalPeriods * ticksPerPeriod);
      const completedTicks = exp.currentPeriodIndex * ticksPerPeriod + (exp.ticksInCurrentPeriod || 0);
      const pct = Math.min(100, Math.round((completedTicks / totalTicks) * 100));
      const regionNames = exp.regions.map(rId => {
        const r = configRegistry.getRegion(rId);
        return r ? r.name : rId;
      });
      const currentPeriod = Math.min(totalPeriods, exp.currentPeriodIndex + 1);
      const occupiedWorkers = exp.occupiedWorkers || 0;
      const workerInfo = occupiedWorkers > 0 ? `👥 ${occupiedWorkers}人` : '👥 0人';
      const loopInfo = exp.cyclesCompleted ? ` · ${exp.cyclesCompleted}轮` : '';
      return `
        <div class="expedition-card" data-expedition-id="${exp.id || ''}">
          <div class="expedition-head">
            <span class="expedition-label">🔍 探索${activeStates.length > 1 ? index + 1 : '中'}</span>
            <span class="expedition-pct">${pct}%</span>
          </div>
          <div class="expedition-meta">${regionNames.join(' → ')} · ${currentPeriod}/${totalPeriods} 时段 · ${workerInfo}${loopInfo}</div>
          <div class="progress-bar" style="height:4px;">
            <div class="progress-fill blue expedition-hud-fill" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');

    this.expeditionStatus.onclick = (ev) => {
      const card = ev.target.closest('.expedition-card');
      if (!card) return;
      this.popupManager.open('expedition_detail', { expeditionId: card.dataset.expeditionId });
    };
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

    const isLoopCycle = result.autoLoop && !result.returned;
    let msg = `${isLoopCycle ? '本轮探索完成，队伍继续循环。' : '探险归来！'}\n获得: ${yields || '无'}`;
    if (discarded) msg += `\n因容量不足损失: ${discarded}`;

    if (isLoopCycle) {
      eventBus.emit('combatBroadcast', { message: msg.replace(/\n/g, ' ') });
      return;
    }

    this.popupManager.open('event', {
      event: {
        name: isLoopCycle ? '探索循环结算' : '探险归来',
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
