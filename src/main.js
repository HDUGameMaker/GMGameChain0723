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
import { MainMenu } from './ui/MainMenu.js';
import { MessageLog, messageLog } from './ui/MessageLog.js';
import { SaveManager } from './core/SaveManager.js';
import { cheatManager } from './utils/CheatManager.js';
import { npcNameGenerator } from './utils/NpcNameGenerator.js';

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

    // 3.5 设置全局引用（供设置面板等使用，在主菜单阶段也可访问）
    window.__game = this;

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
      building: this.systems.building,
      population: this.systems.population
    });

    // 初始化NPC名字生成器（必须在游戏开始前完成）
    await npcNameGenerator.init();

    // 注册人口每日结算
    eventBus.on('dayStart', () => {
      this.systems.population.onDayStart();
    });

    // 深夜时段播报日消耗
    eventBus.on('periodChange', ({ period }) => {
      if (period === 'night') {
        const pop = this.systems.population;
        const foodConsumption = pop.current * pop.foodPerPerson;
        const foodProduction = this.systems.building.getTotalFoodProduction();
        const netChange = foodProduction - foodConsumption;
        messageLog.addLeft(`今日消耗食物 ${foodConsumption}，产出 ${foodProduction}，${netChange >= 0 ? '结余' : '缺口'} ${Math.abs(netChange)}`);
      }
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

    // 注册探险出发口点击事件
    eventBus.on('expeditionEntranceClicked', (entrance) => {
      // 探险进行中不可进入准备界面
      if (this.systems.expedition.getCurrentExpedition()) return;
      this.popupManager.open('expedition_prep', { entrance });
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

    // 5. 创建主菜单
    const menuConfig = configRegistry.get('ui_main_menu') || {};
    if (menuConfig.enabled === false) {
      // 标题菜单被禁用，直接进入游戏（有存档则继续，否则新游戏）
      this.mainMenu = null;
      const hasSave = await SaveManager.hasSave();
      if (hasSave) {
        await this.continueGame();
      } else {
        await this.startNewGame();
      }
      return;
    }

    this.mainMenu = new MainMenu();
    this.mainMenu.init({
      onNewGame: () => this.startNewGame(),
      onContinueGame: () => this.continueGame(),
      onSettings: () => this.showSettings(),
      onExit: () => this.exitGame()
    });

    // 暂时不自动进入游戏，等待用户选择
    return;
  }

  /**
   * 设置音效配置热更新监听
   * 当 sound-config.html 保存配置时，通过 localStorage 通知游戏重载配置
   */
  _setupSoundHotReload() {
    let lastReloadTime = 0;
    
    // 定时检查热更新信号
    setInterval(() => {
      try {
        const reloadSignal = localStorage.getItem('gmgame_sound_reload');
        if (reloadSignal) {
          const signalTime = parseInt(reloadSignal, 10);
          if (signalTime > lastReloadTime) {
            lastReloadTime = signalTime;
            console.log('[Game] Sound config reload triggered');
            
            // 重新加载配置
            configRegistry.loadConfig('sound').then(() => {
              // 通知 AudioSystem 重新加载配置
              this.systems.audio.reloadConfig();
              console.log('[Game] Sound config reloaded successfully');
            }).catch(err => {
              console.warn('[Game] Failed to reload sound config:', err);
            });
          }
        }
      } catch (e) {
        // localStorage 不可用或其他错误，忽略
      }
    }, 1000);
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

  /**
   * 开始新游戏
   */
  async startNewGame() {
    // 隐藏主菜单（标题菜单可能被禁用）
    if (this.mainMenu) {
      this.mainMenu.hide();
    }
    
    // 清除旧存档
    await SaveManager.reset();
    
    // 初始化新游戏数据
    this.initNewGame();
    
    // 完成游戏初始化
    await this.completeInit();
  }

  /**
   * 继续游戏
   */
  async continueGame() {
    // 隐藏主菜单（标题菜单可能被禁用）
    if (this.mainMenu) {
      this.mainMenu.hide();
    }
    
    // 加载存档
    const saveData = await SaveManager.load();
    if (saveData) {
      this.restoreFromSave(saveData);
      console.log('[Game] Save data restored');
    } else {
      this.initNewGame();
      console.log('[Game] New game initialized (no save found)');
    }
    
    // 完成游戏初始化
    await this.completeInit();
  }

  /**
   * 显示设置
   */
  showSettings() {
    this.popupManager.open('settings');
  }

  /**
   * 退出游戏
   */
  exitGame() {
    if (confirm('确定要退出游戏吗？')) {
      window.close();
    }
  }

  /**
   * 返回标题菜单（从游戏内）
   */
  returnToMainMenu() {
    // 停止主循环
    gameLoop.stop();

    // 保存当前进度
    this.saveGameState();

    // 隐藏 HUD
    if (this.hud) {
      document.getElementById('hud').style.display = 'none';
    }

    // 如果标题菜单被禁用，直接刷新页面
    if (!this.mainMenu) {
      location.reload();
      return;
    }

    // 显示主菜单
    this.mainMenu.show();
  }

  /**
   * 保存当前游戏状态
   */
  saveGameState() {
    const state = {
      timestamp: Date.now(),
      time: this.systems.time.serializeState(),
      resources: this.systems.resource.serializeState(),
      buildings: this.systems.building.serializeState(),
      population: this.systems.population.serializeState(),
      items: this.systems.item.serializeState(),
      events: this.systems.event.serializeState(),
    };

    if (this.systems.expedition.getCurrentExpedition()) {
      state.expedition = this.systems.expedition.serializeState();
    }

    if (this.systems.torch) {
      state.torches = this.systems.torch.serializeState();
    }

    if (this.systems.audio) {
      state.audio = this.systems.audio.serializeState();
    }

    if (this.mapRenderer) {
      state.camera = this.mapRenderer.getCameraState();
    }

    SaveManager.save(state);
  }

  /**
   * 完成游戏初始化（在用户选择后执行）
   */
  async completeInit() {
    // 6. 初始化渲染器
    this.mapRenderer = new MapRenderer(this.app, this.systems.building, this.systems.torch);

    // 6.05 加载存档后恢复相机位置（覆盖 _centerView 的默认/配置位置）
    //     根据 viewportCenter.useLastSavedPosition 决定是否使用存档相机：
    //     - true（默认）：恢复存档相机位置，保留玩家上次视角
    //     - false：忽略存档相机，使用配置中的默认视角中心
    const vcConfig = configRegistry.get('map')?.viewportCenter || {};
    const useSaved = vcConfig.useLastSavedPosition !== false;
    if (this._savedCamera && useSaved) {
      this.mapRenderer.setCameraState(
        this._savedCamera.camX,
        this._savedCamera.camY,
        this._savedCamera.zoom || 1.0
      );
    }
    this._savedCamera = null;

    // 6.1 从 localStorage 恢复 3D 透视偏好（初始化时不播放过渡动画）
    try {
      const saved = localStorage.getItem('gmgc_perspective_3d');
      if (saved === '0') {
        this.mapRenderer.setPerspective(false, false);
      } else if (saved === '1') {
        this.mapRenderer.setPerspective(true, false);
      }
    } catch (e) { /* ignore */ }

    // 6.2 从 localStorage 恢复游戏速度偏好
    try {
      const savedSpeed = localStorage.getItem('gmgc_game_speed');
      if (savedSpeed) {
        this.systems.time.setSpeed(parseInt(savedSpeed, 10));
      }
    } catch (e) { /* ignore */ }

    // 6.3 从 localStorage 恢复音频设置
    try {
      const audioSys = this.systems.audio;
      if (audioSys && audioSys._initialized) {
        const muted = localStorage.getItem('gmgc_audio_muted');
        if (muted === '1' && !audioSys.isMuted()) audioSys.toggleMute();
        const volMaster = localStorage.getItem('gmgc_vol_master');
        if (volMaster) audioSys.setMasterVolume(parseFloat(volMaster));
        const volBgm = localStorage.getItem('gmgc_vol_bgm');
        if (volBgm) audioSys.setBGMVolume(parseFloat(volBgm));
        const volSfx = localStorage.getItem('gmgc_vol_sfx');
        if (volSfx) audioSys.setSFXVolume(parseFloat(volSfx));
        // 进入游戏后主动启动 BGM（用户手势已发生，浏览器允许播放）
        if (!audioSys.isMuted() && !audioSys._currentBGM) {
          audioSys.playBGM('bgm_main');
        }
      }
    } catch (e) { /* ignore */ }

    // 7. 初始化 HUD
    this.hud = new HUD(this.systems, this.popupManager);

    // 7.5 初始化消息播报系统
    this.messageLog = new MessageLog();
    this.messageLog.init();

    // 8. 设置主循环更新函数
    gameLoop.setUpdateFunction((delta) => this.update(delta));

    // 9. 启动主循环
    gameLoop.start();

    // 10. 注册自动保存
    this.registerAutoSave();

    // 11. 窗口大小变化
    window.addEventListener('resize', () => this.onResize());

    // 12. 监听音效配置热更新（从 sound-config.html 保存后触发）
    this._setupSoundHotReload();

    console.log('[Game] Initialization complete!');
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
window.__cheatManager = cheatManager;
