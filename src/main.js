/**
 * main.js - 游戏入口
 * 初始化 PixiJS、加载配置、启动各系统和主循环
 */
import { configRegistry } from './core/ConfigRegistry.js';
import { eventBus } from './core/EventBus.js';
import { store } from './core/Store.js';
import { gameLoop } from './GameLoop.js';
import { TimeSystem } from './systems/TimeSystem.js';
import { ResourceSystem } from './systems/ResourceSystem.js';
import { PopulationSystem } from './systems/PopulationSystem.js';
import { BuildingSystem } from './systems/BuildingSystem.js';
import { ItemSystem } from './systems/ItemSystem.js';
import { EventSystem } from './systems/EventSystem.js';
import { ExpeditionSystem } from './systems/ExpeditionSystem.js';
import { TorchSystem } from './systems/TorchSystem.js';
import { RoadSystem } from './systems/RoadSystem.js';
import { AudioSystem } from './systems/AudioSystem.js';
import { TechSystem } from './systems/TechSystem.js';
import { CultureSystem } from './systems/CultureSystem.js';
import { AlchemySystem } from './systems/AlchemySystem.js';
import { CombatSystem } from './systems/CombatSystem.js';
import { WeatherSystem } from './systems/WeatherSystem.js';
import { QuestSystem } from './systems/QuestSystem.js';
import { InvasionSystem } from './systems/InvasionSystem.js';
import { MapRenderer } from './rendering/MapRenderer.js';
import { HUD } from './ui/HUD.js';
import { PopupManager } from './ui/PopupManager.js';
import { InvasionUI } from './ui/InvasionUI.js';
import { MainMenu } from './ui/MainMenu.js';
import { SaveManager } from './core/SaveManager.js';
import { cheatManager } from './utils/CheatManager.js';
import { messageLog } from './ui/MessageLog.js';
import { DebugPanel } from './ui/panels/debug-panel.js';

class Game {
  constructor() {
    this.app = null;
    this.systems = {};
    this.mainMenu = null;
    this._started = false;
    this._resetting = false; // 重置标记，防止 beforeunload 重新保存
  }

  async boot() {
    console.log('[Game] Booting...');
    await configRegistry.loadAll();

    const menuConfig = configRegistry.get('ui_main_menu');
    if (menuConfig && menuConfig.enabled !== false) {
      this.mainMenu = new MainMenu();
      this.mainMenu.init({
        onNewGame: () => this.startNewGame(),
        onContinueGame: () => this.startContinueGame(),
        onSettings: () => alert('进入游戏后可在右上角设置中调整选项。'),
        onExit: () => window.close()
      });
      console.log('[Game] Main menu shown');
      return;
    }

    await this.init();
  }

  async startNewGame() {
    if (this._started) return;
    this._resetting = true;
    await SaveManager.reset();
    this._resetting = false;
    this.mainMenu?.hide();
    await this.init({ forceNew: true });
  }

  async startContinueGame() {
    if (this._started) return;
    this.mainMenu?.hide();
    await this.init();
  }

  async init(options = {}) {
    if (this._started) return;
    this._started = true;
    console.log('[Game] Initializing...');

    // 1. 加载配置
    await configRegistry.loadAll();

    // 2. 初始化 PixiJS
    await this.initPixi();

    // 3. 初始化各系统
    this.systems.time = new TimeSystem();
    this.systems.resource = new ResourceSystem();
    this.systems.building = new BuildingSystem();
    this.systems.population = new PopulationSystem();
    this.systems.item = new ItemSystem();
    this.systems.expedition = new ExpeditionSystem();

    // 火把系统（光照）
    this.systems.torch = new TorchSystem();

    // 道路系统
    this.systems.road = new RoadSystem();

    // 科技树系统
    this.systems.tech = new TechSystem();

    // 人文政策树系统
    this.systems.culture = new CultureSystem();

    // 炼金系统
    this.systems.alchemy = new AlchemySystem();

    // 战斗系统
    this.systems.combat = new CombatSystem();
    // 入侵系统
    this.systems.invasion = new InvasionSystem();

    // 天气与季节系统
    this.systems.weather = new WeatherSystem();

    // 音效系统
    this.systems.audio = new AudioSystem();

    // 任务系统
    this.systems.quest = new QuestSystem();

    // 3.05 初始化弹窗管理器（需要先有 tech / culture / alchemy 系统）
    this.popupManager = new PopupManager(gameLoop, this.systems.tech, this.systems.culture, this.systems.alchemy, this.systems.combat);

    // 3.1 事件系统需要 popupManager
    this.systems.event = new EventSystem();
    this.systems.event._popupManager = this.popupManager;

    // 连接系统间交叉引用
    this.systems.building.setResourceSystem(this.systems.resource);
    this.systems.building.setPopulationSystem(this.systems.population);
    this.systems.building.setItemSystem(this.systems.item);
    this.systems.building.setTorchSystem(this.systems.torch);
    this.systems.building.setRoadSystem(this.systems.road);
    this.systems.building.setTechSystem(this.systems.tech);
    this.systems.building.setWeatherSystem(this.systems.weather);
    this.systems.building.setCultureSystem(this.systems.culture);
    this.systems.building.setAlchemySystem(this.systems.alchemy);
    this.systems.building.init();
    this.systems.torch.setResourceSystem(this.systems.resource);
    this.systems.torch.setBuildingSystem(this.systems.building);
    this.systems.torch.setRoadSystem(this.systems.road);
    this.systems.torch.init();
    this.systems.road.setBuildingSystem(this.systems.building);
    this.systems.road.setResourceSystem(this.systems.resource);
    this.systems.road.setPopulationSystem(this.systems.population);
    this.systems.road.init();
    this.systems.quest.setBuildingSystem(this.systems.building);
    this.systems.quest.setRoadSystem(this.systems.road);
    this.systems.quest.init();
    this.systems.tech.setResourceSystem(this.systems.resource);
    this.systems.tech.setBuildingSystem(this.systems.building);
    this.systems.tech.setItemSystem(this.systems.item);
    this.systems.tech.setCultureSystem(this.systems.culture);
    this.systems.tech.init();
    this.systems.culture.setResourceSystem(this.systems.resource);
    this.systems.culture.setBuildingSystem(this.systems.building);
    this.systems.culture.setPopulationSystem(this.systems.population);
    this.systems.culture.setTimeSystem(this.systems.time);
    this.systems.culture.init();
    this.systems.alchemy.setResourceSystem(this.systems.resource);
    this.systems.alchemy.setItemSystem(this.systems.item);
    this.systems.alchemy.setBuildingSystem(this.systems.building);
    this.systems.alchemy.setTimeSystem(this.systems.time);
    this.systems.alchemy.init();
    this.systems.combat.setBuildingSystem(this.systems.building);
    this.systems.combat.setPopulationSystem(this.systems.population);
    this.systems.combat.setResourceSystem(this.systems.resource);
    this.systems.combat.setCultureSystem(this.systems.culture);
    this.systems.combat.setAlchemySystem(this.systems.alchemy);
    this.systems.combat.init();

    // 天气系统引用
    this.systems.weather.setPopulationSystem(this.systems.population);
    this.systems.weather.setBuildingSystem(this.systems.building);
    this.systems.weather.initNew();

    this.systems.audio.init();
    this.systems.population.setBuildingSystem(this.systems.building);
    this.systems.population.setResourceSystem(this.systems.resource);
    this.systems.population.setWeatherSystem(this.systems.weather);
    this.systems.population.setCultureSystem(this.systems.culture);
    this.systems.population.setAlchemySystem(this.systems.alchemy);
    this.systems.event.setSystems({
      resource: this.systems.resource,
      item: this.systems.item,
      building: this.systems.building,
      time: this.systems.time,
      gameLoop: gameLoop,
      alchemy: this.systems.alchemy
    });
    this.systems.expedition.setSystems({
      resource: this.systems.resource,
      item: this.systems.item,
      building: this.systems.building,
      population: this.systems.population,
      alchemy: this.systems.alchemy
    });

    // 注册人口每日结算
    eventBus.on('dayStart', () => {
      this.systems.population.onDayStart();
    });

    // 游戏结束事件
    eventBus.on('gameOver', (data) => {
      this.popupManager.open('game_over', data);
    });

    // 作弊状态变化
    eventBus.on('cheatToggled', ({ enabled }) => {
      if (!enabled) {
        const currentSpeed = this.systems.time.speed;
        if (currentSpeed > 4) {
          this.systems.time.setSpeed(1);
        }
      }
    });

    // 注册建筑点击事件
    eventBus.on('buildingClicked', ({ buildingIndex }) => {
      this.popupManager.open('building_detail', { buildingIndex });
    });

    // 道路编辑模式切换时，退出建筑放置模式
    eventBus.on('roadEditModeChanged', ({ enabled }) => {
      if (enabled && this.systems.building.placingState === 'PLACING') {
        this.systems.building.exitPlacingMode();
      }
    });

    // 注册探险出发口点击事件
    eventBus.on('expeditionEntranceClicked', (entrance) => {
      if (this.systems.expedition.getCurrentExpedition()) return;
      // 入口必须与道路相连
      if (this.systems.road && !this.systems.road.hasAdjacentRoad(entrance.gridX, entrance.gridY, 1, 1)) {
        eventBus.emit('combatBroadcast', { message: '🛑 该入口还未与道路相连，无法进入！' });
        return;
      }
      this.popupManager.open('expedition_prep', { entrance });
    });

    // 任务完成后自动弹出下一个任务面板
    eventBus.on('questNewActive', ({ quest }) => {
      if (quest) {
        setTimeout(() => this.popupManager.open('quest_panel', { quest }), 500);
      }
    });

    // 注册事件标记点击事件
    let _pendingMarkerId = null;
    eventBus.on('eventMarkerClicked', (marker) => {
      // 触发引用的地图事件
      this.systems.event.triggerEventById(marker.eventId);
      _pendingMarkerId = marker.id;
    });

    // 事件弹窗关闭后移除标记
    eventBus.on('popupClosed', () => {
      if (_pendingMarkerId) {
        const removed = store.getState('removedEventMarkers') || [];
        if (!removed.includes(_pendingMarkerId)) {
          store.setState({ removedEventMarkers: [...removed, _pendingMarkerId] });
        }
        _pendingMarkerId = null;
      }
    });

    // 5. 尝试加载存档
    const saveData = options.forceNew ? null : await SaveManager.load();
    if (saveData) {
      this.restoreFromSave(saveData);
      console.log('[Game] Save data restored');
    } else {
      this.initNewGame();
      console.log('[Game] New game initialized');
    }

    // 6. 初始化渲染器（先构造，再异步预加载纹理后绘制）
    this.mapRenderer = new MapRenderer(this.app, this.systems.building, this.systems.torch, this.systems.road, this.systems.combat);
    await this.mapRenderer.init();

    // 6.05 加载存档后恢复相机位置（覆盖 _centerView 的默认/配置位置）
    if (this._savedCamera) {
      this.mapRenderer.setCameraState(
        this._savedCamera.camX,
        this._savedCamera.camY,
        this._savedCamera.zoom || 1.0
      );
      this._savedCamera = null;
    }

    // 6.05 恢复已移除事件标记
    if (this._savedRemovedEventMarkers) {
      this.mapRenderer.restoreMarkerState(this._savedRemovedEventMarkers);
      this._savedRemovedEventMarkers = null;
    }

    // 6.1 从 localStorage 恢复 3D 透视偏好
    try {
      const saved = localStorage.getItem('gmgc_perspective_3d');
      if (saved === '0') {
        this.mapRenderer.setPerspective(false);
      }
    } catch (e) { /* ignore */ }

    // 7. 初始化 HUD
    this.hud = new HUD(this.systems, this.popupManager);
    // 7.01 初始化入侵 UI
    this.invasionUI = new InvasionUI(this.systems.invasion);

    // 7.03 有存档时恢复任务悬浮窗显示
    if (saveData) {
      const q = this.systems.quest.getActiveQuest();
      if (q) eventBus.emit('questUpdated', { quest: q });
    }

    // 7.05 新存档询问是否开启新手教程
    if (!saveData) {
      setTimeout(() => {
        if (confirm('您是否第一次游玩本游戏？\n\n选择"确定"开启新手教程，选择"取消"跳过。\n\n之后可在设置中"启动"新手教程。')) {
          this.systems.quest.enable();
          const q = this.systems.quest.getActiveQuest();
          if (q) setTimeout(() => this.popupManager.open('quest_panel', { quest: q }), 300);
        }
      }, 600);
    }

    // 7.05 初始化调试面板（按 ~ 键切换）
    this.debugPanel = new DebugPanel(this.systems, gameLoop);

    // 7.1 初始化消息播报系统（监听 combatBroadcast / 资源 / 建造 / 人口事件）
    messageLog.init();

    // 8. 设置主循环更新函数
    gameLoop.setUpdateFunction((delta) => this.update(delta));

    // 9. 启动主循环
    gameLoop.start();

    // 10. 注册自动保存
    this.registerAutoSave();

    // 11. 窗口大小变化
    window.addEventListener('resize', () => this.onResize());

    console.log('[Game] Initialization complete!');
  }

  async initPixi() {
    const { Application } = PIXI;
    this.app = new Application();
    await this.app.init({
      resizeTo: window,
      backgroundColor: 0x1a1a2e,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1
    });
    document.getElementById('game-canvas').appendChild(this.app.canvas);
    this.app.canvas.style.touchAction = 'none';
  }

  initNewGame() {
    // 初始化资源为配置初始值
    this.systems.resource.initFromConfig();

    // 初始化时间
    this.systems.time.initNew();

    // 放置初始建筑
    const mapConfig = configRegistry.get('map');
    if (mapConfig && mapConfig.initialBuildings) {
      for (const b of mapConfig.initialBuildings) {
        this.systems.building.placeInitialBuilding(b.buildingId, b.gridX, b.gridY);
      }
    }

    // 初始化人口
    this.systems.population.initNew();

    // 初始化物品系统
    this.systems.item.initNew();

    // 初始化事件系统
    this.systems.event.initNew();

    // 初始化火把
    this.systems.torch.initFromConfig();

    // 初始化道路
    // 初始化天气
    this.systems.weather.initNew();
    // 初始化入侵系统
    this.systems.invasion.initNew();

    // 初始化炼金系统
    this.systems.alchemy.init();

    // 初始化事件标记状态（新游戏 = 无已移除标记）
    store.setState({ removedEventMarkers: [] });
    /* 初始化文化系统 */
    store.setState({ doctrineResearched: [], inspiration: 0 });
  }

  restoreFromSave(saveData) {
    this.systems.time.restoreState(saveData.time);
    this.systems.resource.restoreState(saveData.resources);
    this.systems.building.restoreState(saveData.buildings);
    this.systems.population.restoreState(saveData.population);
    this.systems.item.restoreState(saveData.items);
    this.systems.event.restoreState(saveData.events);
    if (saveData.expedition) {
      this.systems.expedition.restoreState(saveData.expedition);
    }
    if (saveData.torches) {
      this.systems.torch.restoreState(saveData.torches);
    }
    if (saveData.roads) {
      this.systems.road.restoreState(saveData.roads);
    }
    if (saveData.audio) {
      this.systems.audio.restoreState(saveData.audio);
    }
    if (saveData.tech) {
      this.systems.tech.restoreState(saveData.tech);
    }
    if (saveData.culture) {
      this.systems.culture.restoreState(saveData.culture);
    }
    if (saveData.alchemy) {
      this.systems.alchemy.restoreState(saveData.alchemy);
    }
    if (saveData.combat) {
      this.systems.combat.restoreState(saveData.combat);
    }
    if (saveData.weather) {
      this.systems.weather.restoreState(saveData.weather);
    }
    if (saveData.invasion) {
      this.systems.invasion.restoreState(saveData.invasion);
    }
    if (saveData.quest) {
      this.systems.quest.restoreState(saveData.quest);
    }
    if (saveData.armies) {
      store.setState({ armies: saveData.armies });
    }
    if (saveData.availableUnits) {
      store.setState({ availableUnits: saveData.availableUnits });
    }
    store.setState({
      doctrineResearched: saveData.doctrineResearched || [],
      inspiration: saveData.inspiration || 0
    });
    // 恢复相机位置（后续 MapRenderer 初始化后应用）
    this._savedCamera = saveData.camera || null;
    this._savedRemovedEventMarkers = saveData.removedEventMarkers || null;
  }

  update(delta) {
    // 时间系统更新（内部处理速度倍率）
    this.systems.time.update(delta);
  }

  registerAutoSave() {
    // 每个时段结束后自动保存
    eventBus.on('periodEnd', () => {
      this.saveGame();
    });

    // 浏览器关闭前紧急保存
    window.addEventListener('beforeunload', () => {
      this.saveGameSync();
    });
  }

  async saveGame() {
    const state = {
      version: 1,
      timestamp: Date.now(),
      time: this.systems.time.getState(),
      population: this.systems.population.getState(),
      resources: this.systems.resource.getSaveState(),
      items: this.systems.item.getAllStates(),
      buildings: this.systems.building.getAllStates(),
      expedition: this.systems.expedition.getCurrentExpedition(),
      events: this.systems.event.getSaveState(),
      torches: this.systems.torch.getAllStates(),
      roads: this.systems.road.getAllStates(),
      tech: this.systems.tech.getState(),
      culture: this.systems.culture.getState(),
      alchemy: this.systems.alchemy.getState(),
      combat: this.systems.combat.getState(),
      quest: this.systems.quest.getState(),
      weather: this.systems.weather.getState(),
      invasion: this.systems.invasion.getState(),
      audio: this.systems.audio.getAllStates(),
      camera: this.mapRenderer ? this.mapRenderer.getCameraState() : null,
      armies: store.getState('armies'),
      availableUnits: store.getState('availableUnits'),
      doctrineResearched: store.getState('doctrineResearched') || [],
      inspiration: store.getState('inspiration') || 0,
      removedEventMarkers: this.mapRenderer ? this.mapRenderer.getMarkerState() : []
    };
    await SaveManager.save(state);
    console.log('[Game] Auto-saved');
  }

  saveGameSync() {
    // 重置过程中不保存
    if (this._resetting) return;
    // beforeunload 中使用同步方式（localStorage 备份）
    const state = {
      version: 1,
      timestamp: Date.now(),
      time: this.systems.time.getState(),
      population: this.systems.population.getState(),
      resources: this.systems.resource.getSaveState(),
      items: this.systems.item.getAllStates(),
      buildings: this.systems.building.getAllStates(),
      expedition: this.systems.expedition.getCurrentExpedition(),
      events: this.systems.event.getSaveState(),
      torches: this.systems.torch.getAllStates(),
      roads: this.systems.road.getAllStates(),
      audio: this.systems.audio.getAllStates(),
      weather: this.systems.weather.getState(),
      invasion: this.systems.invasion.getState(),
      tech: this.systems.tech.getState(),
      culture: this.systems.culture.getState(),
      alchemy: this.systems.alchemy.getState(),
      combat: this.systems.combat.getState(),
      doctrineResearched: store.getState('doctrineResearched') || [],
      inspiration: store.getState('inspiration') || 0,
      quest: this.systems.quest.getState(),
      camera: this.mapRenderer ? this.mapRenderer.getCameraState() : null,
      armies: store.getState('armies'),
      availableUnits: store.getState('availableUnits'),
      removedEventMarkers: this.mapRenderer ? this.mapRenderer.getMarkerState() : []
    };
    try {
      localStorage.setItem('gmgc_emergency_save', JSON.stringify(state));
    } catch (e) {
      // ignore
    }
  }

  onResize() {
    if (this.app) {
      this.app.renderer.resize(window.innerWidth, window.innerHeight);
    }
    if (this.mapRenderer) {
      this.mapRenderer.onResize();
    }
  }
}

// 启动游戏
const game = new Game();
game.boot().catch(err => {
  console.error('[Game] Fatal error during initialization:', err);
});

// 导出到全局（调试用）
window.__game = game;
window.__game.store = store;
window.__game.configRegistry = configRegistry;
// 控制台指令: window.invasion(50) 或 invasion:50 自动解析
window.invasion = function(power) {
  const p = parseInt(power);
  if (!isNaN(p) && game.systems.invasion) game.systems.invasion.spawnInvasion(p);
};
window.__cheatManager = cheatManager;
// debugPanel 在 init() 完成后才可用，通过 getter 懒访问
Object.defineProperty(window, '__debugPanel', {
  get() { return game.debugPanel; },
  configurable: true
});
