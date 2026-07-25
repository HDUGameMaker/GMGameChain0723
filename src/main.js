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
import { AudioSystem } from './systems/AudioSystem.js';
import { MapRenderer } from './rendering/MapRenderer.js';
import { HUD } from './ui/HUD.js';
import { PopupManager } from './ui/PopupManager.js';
import { SaveManager } from './core/SaveManager.js';

class Game {
  constructor() {
    this.app = null;
    this.systems = {};
    this._resetting = false; // 重置标记，防止 beforeunload 重新保存
  }

  async init() {
    console.log('[Game] Initializing...');

    // 1. 加载配置
    await configRegistry.loadAll();

    // 2. 初始化 PixiJS
    await this.initPixi();

    // 3. 初始化弹窗管理器
    this.popupManager = new PopupManager(gameLoop);

    // 4. 初始化各系统
    this.systems.time = new TimeSystem();
    this.systems.resource = new ResourceSystem();
    this.systems.building = new BuildingSystem();
    this.systems.population = new PopulationSystem();
    this.systems.item = new ItemSystem();
    this.systems.event = new EventSystem(this.popupManager);
    this.systems.expedition = new ExpeditionSystem();

    // 火把系统
    this.systems.torch = new TorchSystem();

    // 音效系统
    this.systems.audio = new AudioSystem();

    // 连接系统间交叉引用
    this.systems.building.setResourceSystem(this.systems.resource);
    this.systems.building.setPopulationSystem(this.systems.population);
    this.systems.building.setItemSystem(this.systems.item);
    this.systems.building.setTorchSystem(this.systems.torch);
    this.systems.building.init();
    this.systems.torch.setResourceSystem(this.systems.resource);
    this.systems.torch.setBuildingSystem(this.systems.building);
    this.systems.torch.init();
    this.systems.audio.init();
    this.systems.population.setBuildingSystem(this.systems.building);
    this.systems.population.setResourceSystem(this.systems.resource);
    this.systems.event.setSystems({
      resource: this.systems.resource,
      item: this.systems.item,
      building: this.systems.building,
      time: this.systems.time,
      gameLoop: gameLoop
    });
    this.systems.expedition.setSystems({
      resource: this.systems.resource,
      item: this.systems.item,
      building: this.systems.building
    });

    // 注册人口每日结算
    eventBus.on('dayStart', () => {
      this.systems.population.onDayStart();
    });

    // 游戏结束事件
    eventBus.on('gameOver', (data) => {
      this.popupManager.open('game_over', data);
    });

    // 注册建筑点击事件
    eventBus.on('buildingClicked', ({ buildingIndex }) => {
      this.popupManager.open('building_detail', { buildingIndex });
    });

    // 注册探险出发口点击事件
    eventBus.on('expeditionEntranceClicked', () => {
      // 探险进行中不可进入准备界面
      if (this.systems.expedition.getCurrentExpedition()) return;
      this.popupManager.open('expedition_prep', {});
    });

    // 注册火把点击事件
    eventBus.on('torchClicked', ({ torchIndex }) => {
      this.popupManager.open('torch_detail', { torchIndex });
    });

    // 建筑与火把系统桥接：拆除 → 同步火把运行时条目
    eventBus.on('buildingDemolished', ({ buildingId }) => {
      if (buildingId) {
        const cfg = configRegistry.getBuilding(buildingId);
        if (cfg && cfg.isTorch) {
          this.systems.torch.syncFromBuildings();
        }
      }
    });

    // 建筑与火把系统桥接：移动 → 更新火把位置
    eventBus.on('buildingMoved', ({ buildingIndex, building }) => {
      const cfg = configRegistry.getBuilding(building.buildingId);
      if (cfg && cfg.isTorch) {
        this.systems.torch.onBuildingMoved(buildingIndex, building.gridX, building.gridY);
      }
    });

    // 5. 尝试加载存档
    const saveData = await SaveManager.load();
    if (saveData) {
      this.restoreFromSave(saveData);
      console.log('[Game] Save data restored');
    } else {
      this.initNewGame();
      console.log('[Game] New game initialized');
    }

    // 6. 初始化渲染器
    this.mapRenderer = new MapRenderer(this.app, this.systems.building, this.systems.torch);

    // 6.05 加载存档后恢复相机位置（覆盖 _centerView 的默认/配置位置）
    if (this._savedCamera) {
      this.mapRenderer.setCameraState(
        this._savedCamera.camX,
        this._savedCamera.camY,
        this._savedCamera.zoom || 1.0
      );
      this._savedCamera = null;
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
    if (saveData.audio) {
      this.systems.audio.restoreState(saveData.audio);
    }
    // 恢复相机位置（后续 MapRenderer 初始化后应用）
    this._savedCamera = saveData.camera || null;
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
      audio: this.systems.audio.getAllStates(),
      camera: this.mapRenderer ? this.mapRenderer.getCameraState() : null
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
      audio: this.systems.audio.getAllStates(),
      camera: this.mapRenderer ? this.mapRenderer.getCameraState() : null
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
game.init().catch(err => {
  console.error('[Game] Fatal error during initialization:', err);
});

// 导出到全局（调试用）
window.__game = game;
