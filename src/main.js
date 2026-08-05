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
import { ResourceNodeSystem } from './systems/ResourceNodeSystem.js';
import { PopulationSystem } from './systems/PopulationSystem.js';
import { BuildingSystem } from './systems/BuildingSystem.js';
import { ItemSystem } from './systems/ItemSystem.js';
import { EventSystem } from './systems/EventSystem.js';
import { DailySettlementSystem } from './systems/DailySettlementSystem.js';
import { ExpeditionSystem } from './systems/ExpeditionSystem.js';
import { TorchSystem } from './systems/TorchSystem.js';
import { AudioSystem } from './systems/AudioSystem.js';
import { TechSystem } from './systems/TechSystem.js';
import { CultureSystem } from './systems/CultureSystem.js';
import { CombatSystem } from './systems/CombatSystem.js';
import { WeatherSystem } from './systems/WeatherSystem.js';
import { QuestSystem } from './systems/QuestSystem.js';
import { InvasionSystem } from './systems/InvasionSystem.js';
import { ColonySystem } from './systems/ColonySystem.js';
import { TerritorySystem } from './systems/TerritorySystem.js';
import { EnemyExpansionSystem } from './systems/EnemyExpansionSystem.js';
import { BuildingTechSystem } from './systems/BuildingTechSystem.js';
import { DiplomacySystem } from './systems/DiplomacySystem.js';
import { HeroSystem } from './systems/HeroSystem.js';
import { EraSystem } from './systems/EraSystem.js';
import { LuxurySystem } from './systems/LuxurySystem.js';
import { EconomyOrderSystem } from './systems/EconomyOrderSystem.js';
import { CommerceSystem } from './systems/CommerceSystem.js';
import { CommercialBuildingSystem } from './systems/CommercialBuildingSystem.js';
import { ArmySystem } from './systems/ArmySystem.js';
import { ArmyInteractionSystem } from './systems/ArmyInteractionSystem.js';
import { WildSiteSystem } from './systems/WildSiteSystem.js';
import { RuinSystem } from './systems/RuinSystem.js';
import { BlackMistSystem } from './systems/BlackMistSystem.js';
import { MapRenderer } from './rendering/MapRenderer.js';
import { createNewWorldState } from './world/WorldMapState.js';
import { FogOfWarState } from './world/FogOfWarState.js';
import { HUD } from './ui/HUD.js';
import { PopupManager } from './ui/PopupManager.js';
import { InvasionUI } from './ui/InvasionUI.js';
import { MainMenu } from './ui/MainMenu.js';
import { SaveManager } from './core/SaveManager.js';
import { cheatManager } from './utils/CheatManager.js';
import { messageLog } from './ui/MessageLog.js';
import { DebugPanel } from './ui/panels/debug-panel.js';
import { migrateLegacyBuildingResearch } from './domain/BuildingResearchMigration.js';

function omitUndefinedSaveProperties(value) {
  if (Array.isArray(value)) {
    return Array.from(value)
      .filter(item => item !== undefined)
      .map(omitUndefinedSaveProperties);
  }
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, omitUndefinedSaveProperties(item)])
  );
}

class Game {
  constructor() {
    this.app = null;
    this.systems = {};
    this.mainMenu = null;
    this._started = false;
    this._resetting = false;
    this._gameOver = false;
    this._worldState = null;
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
        onSettings: () => this.mainMenu?.showMessage('设置', '进入游戏后可在右上角设置中调整选项。'),
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
    const recovery = options.forceNew
      ? { source: null, envelope: null, payload: null, warnings: [] }
      : await SaveManager.loadRecoverable();
    const rawSave = recovery.payload;
    const saveData = (rawSave && rawSave.version === SaveManager.CURRENT_VERSION) ? rawSave : null;
    configRegistry.selectFixedMap(saveData?.world?.mapId || 'grand_map_v2');

    // 2. 初始化 PixiJS
    await this.initPixi();

    // 3. 初始化各系统
    this.systems.time = new TimeSystem();
    this.systems.resource = new ResourceSystem();
    this.systems.resourceNodes = new ResourceNodeSystem();
    const selectedMap = configRegistry.get('map');
    this.systems.fogOfWar = new FogOfWarState(selectedMap.gridWidth, selectedMap.gridHeight);
    this.systems.building = new BuildingSystem();
    // 天气需要先于人口注册 dayStart，人口日结会读取当天粮食修正。
    this.systems.weather = new WeatherSystem();
    this.systems.population = new PopulationSystem();
    this.systems.item = new ItemSystem();
    this.systems.expedition = new ExpeditionSystem();

    // 火把系统（光照）
    this.systems.torch = new TorchSystem();

    // 科技树系统
    this.systems.tech = new TechSystem();

    // 人文政策树系统
    this.systems.culture = new CultureSystem();
    this.systems.era = new EraSystem();
    this.systems.luxury = new LuxurySystem();
    this.systems.economyOrders = new EconomyOrderSystem();
    this.systems.commerce = new CommerceSystem();
    this.systems.commercialBuildings = new CommercialBuildingSystem();
    this.systems.army = new ArmySystem();
    this.systems.wildSites = new WildSiteSystem();
    this.systems.ruins = new RuinSystem();
    this.systems.blackMist = new BlackMistSystem();

    // 建筑科技树（永久被动加成 + T2 建筑解锁）
    this.systems.buildingTech = new BuildingTechSystem();

    // 战斗系统
    this.systems.combat = new CombatSystem();
    // 入侵系统
    this.systems.invasion = new InvasionSystem();
    // 殖民地系统
    this.systems.colony = new ColonySystem();

    // 领土占领与边境拓展系统
    this.systems.territory = new TerritorySystem();

    // 敌对势力扩张系统
    this.systems.enemyExpansion = new EnemyExpansionSystem();

    // 固定 NPC 据点外交（不参与玩家式发展）
    this.systems.diplomacy = new DiplomacySystem();
    this.systems.hero = new HeroSystem();

    // 音效系统
    this.systems.audio = new AudioSystem();

    // 任务系统
    this.systems.quest = new QuestSystem();

    // 3.05 初始化弹窗管理器（需要先有科技、人文与战斗系统）
    this.popupManager = new PopupManager(gameLoop, this.systems.tech, this.systems.culture, this.systems.combat);
    this.systems.armyInteraction = new ArmyInteractionSystem({
      army: this.systems.army,
      building: this.systems.building,
      wildSites: this.systems.wildSites,
      diplomacy: this.systems.diplomacy,
      combat: this.systems.combat,
      enemyExpansion: this.systems.enemyExpansion,
      ruins: this.systems.ruins,
      popupManager: this.popupManager
    });

    // 3.1 事件系统需要 popupManager
    this.systems.event = new EventSystem();
    this.systems.event._popupManager = this.popupManager;
    this.systems.dailySettlement = new DailySettlementSystem({
      resource: this.systems.resource,
      territory: this.systems.territory,
      event: this.systems.event,
      popupManager: this.popupManager
    });

    // 连接系统间交叉引用
    this.systems.building.setResourceSystem(this.systems.resource);
    this.systems.building.setResourceNodeSystem(this.systems.resourceNodes);
    this.systems.building.setPopulationSystem(this.systems.population);
    this.systems.building.setItemSystem(this.systems.item);
    this.systems.building.setTorchSystem(this.systems.torch);
    this.systems.building.setTechSystem(this.systems.tech);
    this.systems.building.setWeatherSystem(this.systems.weather);
    this.systems.building.setCultureSystem(this.systems.culture);
    this.systems.building.setTerritorySystem(this.systems.territory);
    this.systems.building.setHeroSystem(this.systems.hero);
    this.systems.building.init();
    this.systems.territory.setBuildingSystem(this.systems.building);
    this.systems.territory.setResourceSystem(this.systems.resource);
    this.systems.territory.init();
    this.systems.enemyExpansion.setTerritorySystem(this.systems.territory);
    this.systems.enemyExpansion.setBuildingSystem(this.systems.building);
    this.systems.enemyExpansion.setHeroSystem(this.systems.hero);
    this.systems.enemyExpansion.init();
    // 历史策略接线：影响资源、建筑产出与敌军状态
    this.systems.torch.setResourceSystem(this.systems.resource);
    this.systems.torch.setBuildingSystem(this.systems.building);
    this.systems.torch.init();
    this.systems.quest.setBuildingSystem(this.systems.building);
    this.systems.quest.init();
    this.systems.tech.setResourceSystem(this.systems.resource);
    this.systems.tech.setBuildingSystem(this.systems.building);
    this.systems.tech.setItemSystem(this.systems.item);
    this.systems.tech.setCultureSystem(this.systems.culture);
    this.systems.tech.setHeroSystem(this.systems.hero);
    this.systems.tech.init();
    this.systems.culture.setResourceSystem(this.systems.resource);
    this.systems.culture.setBuildingSystem(this.systems.building);
    this.systems.culture.setPopulationSystem(this.systems.population);
    this.systems.culture.setTimeSystem(this.systems.time);
    this.systems.culture.setTechSystem(this.systems.tech);
    this.systems.culture.setHeroSystem(this.systems.hero);
    this.systems.tech.setEraSystem(this.systems.era);
    this.systems.culture.setEraSystem(this.systems.era);
    this.systems.building.setEraSystem(this.systems.era);
    this.systems.culture.init();
    this.systems.era.setTechSystem(this.systems.tech);
    this.systems.era.setCultureSystem(this.systems.culture);
    this.systems.era.setBuildingSystem(this.systems.building);
    this.systems.luxury.setSystems({ resource: this.systems.resource, building: this.systems.building, diplomacy: this.systems.diplomacy, hero: this.systems.hero });
    this.systems.economyOrders.setSystems({
      population: this.systems.population,
      resource: this.systems.resource,
      luxury: this.systems.luxury
    });
    this.systems.commerce.setSystems({
      resource: this.systems.resource,
      building: this.systems.building,
      diplomacy: this.systems.diplomacy,
      era: this.systems.era,
      commercial: this.systems.commercialBuildings
    });
    this.systems.commercialBuildings.setSystems({
      resource: this.systems.resource,
      building: this.systems.building
    });
    this.systems.army.setSystems({
      building: this.systems.building,
      hero: this.systems.hero,
      culture: this.systems.culture,
      era: this.systems.era,
      resource: this.systems.resource,
      population: this.systems.population,
      tech: this.systems.tech,
      luxury: this.systems.luxury,
      enemyExpansion: this.systems.enemyExpansion,
      ruins: this.systems.ruins
      , combat: this.systems.combat
    });
    this.systems.building.setArmySystem(this.systems.army);
    this.systems.invasion.setArmySystem(this.systems.army);
    this.systems.invasion.setSystems({
      enemyExpansion: this.systems.enemyExpansion,
      building: this.systems.building,
      era: this.systems.era,
      tech: this.systems.tech,
      culture: this.systems.culture
    });
    this.systems.enemyExpansion.setArmySystem(this.systems.army);
    this.systems.wildSites.setSystems({ resource: this.systems.resource, era: this.systems.era, army: this.systems.army, luxury: this.systems.luxury });
    this.systems.enemyExpansion.setLuxurySystem(this.systems.luxury);
    this.systems.enemyExpansion.setBattlePreviewHandler(data => this.popupManager.previewBattle(data));
    this.systems.diplomacy.setBattlePreviewHandler(data => this.popupManager.previewBattle(data));
    this.systems.building.setLuxurySystem(this.systems.luxury);
    this.systems.population.setLuxurySystem(this.systems.luxury);
    this.systems.diplomacy.setSystems({ luxury: this.systems.luxury });
    this.systems.diplomacy.setSystems({
      resource: this.systems.resource,
      culture: this.systems.culture,
      hero: this.systems.hero,
      era: this.systems.era,
      resourceNodes: this.systems.resourceNodes,
      army: this.systems.army,
      enemyExpansion: this.systems.enemyExpansion
    });
    this.systems.ruins.setSystems({ army: this.systems.army });
    this.systems.tech.setRuinSystem(this.systems.ruins);
    this.systems.culture.setRuinSystem(this.systems.ruins);
    this.systems.army.setCityStateSystem(this.systems.diplomacy);
    this.systems.hero.setSystems({
      building: this.systems.building,
      resource: this.systems.resource,
      culture: this.systems.culture,
      era: this.systems.era
    });
    this.systems.combat.setBuildingSystem(this.systems.building);
    this.systems.combat.setPopulationSystem(this.systems.population);
    this.systems.combat.setResourceSystem(this.systems.resource);
    this.systems.combat.setCultureSystem(this.systems.culture);
    this.systems.combat.setHeroSystem(this.systems.hero);
    this.systems.combat.setArmySystem(this.systems.army);
    this.systems.combat.setLuxurySystem(this.systems.luxury);
    this.systems.combat.init();
    this.systems.blackMist.setSystems({ combat: this.systems.combat, resourceNodes: this.systems.resourceNodes, wildSites: this.systems.wildSites, diplomacy: this.systems.diplomacy, enemyExpansion: this.systems.enemyExpansion });
    this.systems.building.setBlackMistSystem(this.systems.blackMist);
    this.systems.army.setBlackMistSystem(this.systems.blackMist);

    // 天气系统引用
    this.systems.weather.setPopulationSystem(this.systems.population);
    this.systems.weather.setBuildingSystem(this.systems.building);
    this.systems.weather.initNew();

    this.systems.audio.init();
    this.systems.population.setBuildingSystem(this.systems.building);
    this.systems.population.setResourceSystem(this.systems.resource);
    this.systems.population.setWeatherSystem(this.systems.weather);
    this.systems.population.setCultureSystem(this.systems.culture);
    this.systems.event.setSystems({
      resource: this.systems.resource,
      item: this.systems.item,
      building: this.systems.building,
      time: this.systems.time,
      gameLoop: gameLoop,
      diplomacy: this.systems.diplomacy,
      luxury: this.systems.luxury,
      era: this.systems.era
    });
    this.systems.expedition.setSystems({
      resource: this.systems.resource,
      item: this.systems.item,
      building: this.systems.building,
      population: this.systems.population,
      culture: this.systems.culture,
      time: this.systems.time,
      hero: this.systems.hero
    });
    this.systems.colony.setSystems({
      popupManager: this.popupManager,
      population: this.systems.population,
      resource: this.systems.resource,
      diplomacy: this.systems.diplomacy
    });

    // 游戏结束事件
    eventBus.on('gameOver', (data) => {
      this.handleGameOver(data);
    });
    eventBus.on('ancientRuinWaveWarning', ({ arrivalDay }) => {
      this.popupManager.alert(`侦察兵发现东部远古遗迹正在聚集军队。\n第 ${arrivalDay} 日将从地图东侧发动袭击，请提前部署军队并加固建筑。`, {
        title: '远古遗迹袭击预警',
        okText: '准备防御'
      });
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

    eventBus.on('outpostClicked', (outpost) => {
      this.systems.diplomacy.discoverOutpost(outpost.id);
      eventBus.emit('combatBroadcast', { message: `⚔️ ${outpost.name}是敌对城邦，必须派遣军队摧毁其大本营。` });
    });

    eventBus.on('armyDetailRequested', ({ armyId }) => {
      this.popupManager.openArmyDetail(armyId);
    });

    eventBus.on('enemyDetailRequested', data => {
      this.popupManager.open('enemy_detail', data);
    });

    eventBus.on('armyInteractionRequested', request => {
      void this.systems.armyInteraction.request(request);
    });


    // 注册探险出发口点击事件
    eventBus.on('expeditionEntranceClicked', (entrance) => {
      const access = this.systems.building.getExpeditionAccessStatus(entrance);
      if (!access.ok) {
        eventBus.emit('combatBroadcast', {
          message: '⛺ 请先打开建造菜单，在洞穴入口格上建造探索营地；营地落成后点击这里即可探索，不需要铺路。'
        });
        return;
      }
      const active = this.systems.expedition.getActiveCount();
      const limit = this.systems.expedition.getQueueLimit();
      if (active >= limit) {
        this.popupManager.alert(`探索队列已满（${active}/${limit}）`);
        return;
      }
      this.popupManager.open('expedition_prep', { entrance });
    });

    // 任务完成后自动弹出下一个任务面板
    eventBus.on('questNewActive', ({ quest }) => {
      if (quest) {
        setTimeout(() => this.popupManager.open('quest_panel', { quest, blocking: true }), 500);
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
    // 重设计后存档结构不兼容，旧存档(version<5)强制开新局
    if (rawSave && !saveData) console.log('[Game] 旧存档不兼容重设计，开始新游戏');
    if (saveData) {
      this.restoreFromSave(saveData);
      console.log('[Game] Save data restored');
    } else {
      this.initNewGame();
      console.log('[Game] New game initialized');
    }
    this.systems.fogOfWar.setRevealAll(configRegistry.get('initial')?.cheats?.clearAllFog === true);
    const configuredCheats = configRegistry.get('initial')?.cheats || {};
    if (configuredCheats.unlimitedBasicResources === true) this.systems.resource.fillBasicResourcesToCapacity();
    this.systems.army.setMovementSpeedMultiplier(configuredCheats.extremeArmyMovementSpeed === true ? 10 : 1);
    if (configuredCheats.cityStatesAttackImmediately === true) this.systems.diplomacy.launchImmediateRaids();
    if (configuredCheats.grantAllLuxuries === true) {
      for (const luxury of this.systems.luxury.getLuxuries()) this.systems.luxury.addLuxury(luxury.id, 1);
    }
    if (configuredCheats.completeCurrentEraResearchHotkey === true && !this._eraResearchCheatHandler) {
      this._eraResearchCheatHandler = event => {
        const target = event.target;
        if (event.repeat || event.key !== '1' || target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return;
        const era = this.systems.era.getCurrentEra?.();
        if (!era?.id) return;
        const techCount = this.systems.tech.completeEraResearch?.(era.id) || 0;
        const cultureCount = this.systems.culture.completeEraResearch?.(era.id) || 0;
        eventBus.emit('combatBroadcast', { message: `🛠️ 金手指：已完成${era.name || era.id}的科技 ${techCount} 项、人文 ${cultureCount} 项。` });
      };
      window.addEventListener('keydown', this._eraResearchCheatHandler);
    }
    if (configuredCheats.increaseCurrentHeroAffinityHotkey === true && !this._heroAffinityCheatHandler) {
      this._heroAffinityCheatHandler = event => {
        const target = event.target;
        if (event.repeat || event.key !== '2' || target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return;
        const current = this.popupManager?._stack?.at(-1);
        if (current?.type !== 'hero_interaction' || !current.data?.heroId) return;
        const result = this.systems.hero.increaseAffinityLevel(current.data.heroId);
        if (!result.ok) return;
        delete current.data._dialogue;
        delete current.data._dialogueSession;
        this.popupManager.refresh(current.data);
        eventBus.emit('combatBroadcast', { message: `🛠️ 金手指：当前英雄好感提升至 ${result.level} 级。` });
      };
      window.addEventListener('keydown', this._heroAffinityCheatHandler);
    }
    if (configuredCheats.fillEraMaterialsHotkey === true && !this._eraMaterialsCheatHandler) {
      this._eraMaterialsCheatHandler = event => {
        const target = event.target;
        if (event.repeat || event.key !== '3' || target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return;
        const era = this.systems.era.getCurrentEra?.();
        if (!era?.id) return;
        const materialIds = this.systems.resource.fillEraMaterialsToCapacity(era.id);
        const names = materialIds.map(id => configRegistry.getResource(id)?.name || id);
        eventBus.emit('combatBroadcast', { message: `🛠️ 金手指：已补满${era.name || era.id}及以前时代材料：${names.join('、')}` });
      };
      window.addEventListener('keydown', this._eraMaterialsCheatHandler);
    }
    if (configuredCheats.spawnTestEnemyHotkey === true && !this._spawnTestEnemyCheatHandler) {
      this._spawnTestEnemyCheatHandler = event => {
        const target = event.target;
        if (event.repeat || event.key !== '4' || target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return;
        const result = this.systems.combat.spawnCheatEnemyNearHeadquarters?.();
        eventBus.emit('combatBroadcast', { message: result?.ok ? '🛠️ 金手指：已在大本营附近生成测试敌人。' : '⚠️ 大本营附近没有可用的敌人生成位置。' });
      };
      window.addEventListener('keydown', this._spawnTestEnemyCheatHandler);
    }
    if (configuredCheats.spawnHestiaArmyHotkey === true && !this._spawnHestiaArmyCheatHandler) {
      this._spawnHestiaArmyCheatHandler = event => {
        const target = event.target;
        if (event.repeat || event.key !== '5' || target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return;
        const result = this.systems.army.spawnCheatHestiaArmyNearHeadquarters?.();
        eventBus.emit('combatBroadcast', { message: result?.ok ? '🛠️ 金手指：已在大本营附近生成赫斯提亚测试军团。' : '⚠️ 无法生成赫斯提亚测试军团。' });
      };
      window.addEventListener('keydown', this._spawnHestiaArmyCheatHandler);
    }
    if (configuredCheats.spawnSuperArmyHotkey === true && !this._spawnSuperArmyCheatHandler) {
      this._spawnSuperArmyCheatHandler = event => {
        const target = event.target;
        if (event.repeat || event.key !== '6' || target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return;
        const result = this.systems.army.spawnCheatSuperArmyNearHeadquarters?.();
        eventBus.emit('combatBroadcast', { message: result?.ok ? '🛠️ 金手指：已在大本营附近生成超级测试军团。' : '⚠️ 无法生成超级测试军团。' });
      };
      window.addEventListener('keydown', this._spawnSuperArmyCheatHandler);
    }

    // 6. 初始化渲染器（先构造，再异步预加载纹理后绘制）
    this.mapRenderer = new MapRenderer(this.app, this.systems.building, this.systems.torch, null, this.systems.combat, this.systems.territory);
    this.mapRenderer.setEnemyExpansion(this.systems.enemyExpansion);
    this.mapRenderer.setDiplomacySystem(this.systems.diplomacy);
    this.mapRenderer.setArmySystem(this.systems.army);
    this.mapRenderer.setWildSiteSystem(this.systems.wildSites);
    this.mapRenderer.setRuinSystem(this.systems.ruins);
    this.mapRenderer.setResourceNodeSystem(this.systems.resourceNodes);
    this.mapRenderer.setBlackMistSystem(this.systems.blackMist);
    this.mapRenderer.setFogOfWarState(this.systems.fogOfWar, { hero: this.systems.hero });
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

    if (recovery.source || recovery.warnings.length > 0) {
      this.popupManager.open('save_recovery', {
        source: recovery.source,
        warnings: recovery.warnings,
        blocking: false
      });
    }

    // 7.03 有存档时恢复任务悬浮窗显示
    if (saveData) {
      const q = this.systems.quest.getActiveQuest();
      if (q) eventBus.emit('questUpdated', { quest: q });
    }

    // 7.05-7.06 开局目标关闭后再显示新手教程，避免阻塞弹窗重复暂停。
    if (!saveData) {
      setTimeout(() => {
        eventBus.once('popupClosed', () => {
          setTimeout(() => {
            eventBus.once('popupClosed', () => {
              setTimeout(() => this.popupManager.open('tutorial_prompt', { questSystem: this.systems.quest }), 0);
            });
            this.popupManager.open('objective', { briefing: true, blocking: true });
          }, 0);
        });
        this.popupManager.open('era_civilization', { eraSystem: this.systems.era, briefing: true, blocking: true });
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
    this._worldState = createNewWorldState(configRegistry.get('map'));
    // 初始化资源为配置初始值
    this.systems.resource.initFromConfig();
    this.systems.resourceNodes.initNew();

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
    // 初始化殖民地系统
    this.systems.colony.initNew();

    // 初始化占领系统（边境拓土 + 建筑上限；在初始建筑放置后重建覆盖）
    this.systems.territory.initNew();
    // 初始化敌人扩张系统
    this.systems.enemyExpansion.initNew();
    // 初始化建筑科技树
    this.systems.buildingTech.initNew();
    // 初始化固定 NPC 据点关系
    this.systems.diplomacy.initNew();
    // 初始化酒馆英雄轮换
    this.systems.hero.initNew();
    // 初始化时代与文明选择
    this.systems.era.initNew();
    // 初始化奢侈品库存与产地发现
    this.systems.luxury.initNew();
    this.systems.economyOrders.initNew();
    this.systems.commerce.initNew();
    this.systems.army.initNew();
    this.systems.wildSites.initNew();
    this.systems.ruins.initNew();
    this.systems.blackMist.initNew();
    this.systems.dailySettlement.init();
    this.systems.quest.enable();

    // 初始化事件标记状态（新游戏 = 无已移除标记）
    store.setState({ removedEventMarkers: [] });
    /* 初始化文化系统 */
    store.setState({ doctrineResearched: [], doctrineResearchLevels: {}, inspiration: 0, formationResearch: [] });
    store.setState({
      factions: { states: {}, relations: {}, lastSyncDay: 0 },
      eraMusic: { currentEraId: 'primitive', currentTrackId: null }
    });
  }

  restoreFromSave(saveData) {
    saveData = migrateLegacyBuildingResearch(saveData);
    this._worldState = structuredClone(saveData.world);
    this.systems.time.restoreState(saveData.time);
    this.systems.resource.restoreState(saveData.resources);
    if (saveData.resourceNodes) this.systems.resourceNodes.restoreState(saveData.resourceNodes);
    else this.systems.resourceNodes.initNew();
    if (saveData.fogOfWar) this.systems.fogOfWar.restoreState(saveData.fogOfWar);
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
    if (saveData.tech) {
      this.systems.tech.restoreState(saveData.tech);
    }
    if (saveData.culture) {
      this.systems.culture.restoreState(saveData.culture);
    }
    if (saveData.combat) {
      this.systems.combat.restoreState(saveData.combat);
    }
    if (saveData.territory) {
      this.systems.territory.restoreState(saveData.territory);
    } else {
      this.systems.territory.initNew();
    }
    if (saveData.enemyExpansion) {
      this.systems.enemyExpansion.restoreState(saveData.enemyExpansion);
    } else {
      this.systems.enemyExpansion.initNew();
    }
    this.systems.dailySettlement.restoreState(saveData.dailySettlement);
    if (saveData.buildingTech) {
      this.systems.buildingTech.restoreState(saveData.buildingTech);
    } else {
      this.systems.buildingTech.initNew();
    }
    if (saveData.diplomacy) {
      this.systems.diplomacy.restoreState(saveData.diplomacy);
    } else {
      this.systems.diplomacy.initNew();
    }
    // 英雄好感等级上限依赖当前时代，必须先恢复时代再恢复英雄。
    if (saveData.era) this.systems.era.restoreState(saveData.era);
    else this.systems.era.initNew();
    if (saveData.heroes) {
      this.systems.hero.restoreState(saveData.heroes);
    } else {
      this.systems.hero.initNew();
    }
    if (saveData.luxuries) this.systems.luxury.restoreState(saveData.luxuries);
    else this.systems.luxury.initNew();
    if (saveData.economicOrders) this.systems.economyOrders.restoreState(saveData.economicOrders);
    else this.systems.economyOrders.initNew();
    if (saveData.commerce) this.systems.commerce.restoreState(saveData.commerce);
    else this.systems.commerce.initNew();
    if (saveData.weather) {
      this.systems.weather.restoreState(saveData.weather);
    }
    if (saveData.invasion) {
      this.systems.invasion.restoreState(saveData.invasion);
    }
    if (saveData.colony) {
      this.systems.colony.restoreState(saveData.colony);
    } else {
      this.systems.colony.initNew();
    }
    if (saveData.quest) {
      this.systems.quest.restoreState(saveData.quest);
    } else {
      this.systems.quest.enable();
    }
    this.systems.army.restoreState(saveData.armyState);
    if (saveData.wildSites) this.systems.wildSites.restoreState(saveData.wildSites);
    else this.systems.wildSites.initNew();
    if (saveData.ruins) this.systems.ruins.restoreState(saveData.ruins);
    else this.systems.ruins.initNew();
    if (saveData.blackMist) this.systems.blackMist.restoreState(saveData.blackMist);
    else this.systems.blackMist.initNew();
    store.setState({
      factions: saveData.commerce?.factions || { states: {}, relations: {}, lastSyncDay: 0 },
      eraMusic: saveData.eraMusic || { currentEraId: saveData.era?.currentEraId || 'primitive', currentTrackId: null }
    });
    store.setState({
      doctrineResearched: saveData.doctrineResearched || [],
      doctrineResearchLevels: saveData.doctrineResearchLevels || {},
      inspiration: saveData.inspiration || 0
    });
    // 恢复相机位置（后续 MapRenderer 初始化后应用）
    this._savedCamera = saveData.camera || null;
    this._savedRemovedEventMarkers = saveData.removedEventMarkers || null;
  }

  update(delta) {
    if (this._gameOver) return;
    // 时间系统更新（内部处理速度倍率）
    this.systems.time.update(delta);
    // 建造进度按各自开始时间推进，避免同一 tick 内新建对象共享全局进度
    this.systems.building.updateConstructionProgress();
  }

  registerAutoSave() {
    // 每天结束后的存档点：第二天开始时保存上一天结算后的状态
    eventBus.on('dayAutosaveTick', (data) => {
      if ((data?.day || 1) <= 1) return;
      void this.saveGame('day_start');
    });
    eventBus.on('dailySettlementClosed', () => { void this.saveGame('daily_settlement'); });
    this._initialAutosaveTimer ||= window.setTimeout(() => { void this.saveGame('initial'); }, 5000);
    this._autosaveTimer ||= window.setInterval(() => { void this.saveGame('periodic'); }, 60000);
    this._visibilitySaveHandler ||= () => {
      if (document.visibilityState === 'hidden') void this.saveGame('background');
    };
    document.addEventListener('visibilitychange', this._visibilitySaveHandler);
    this._pageHideSaveHandler ||= () => { void this.saveGame('pagehide'); };
    window.addEventListener('pagehide', this._pageHideSaveHandler);
  }

  async saveGame(reason = 'manual') {
    if (this._resetting || this._gameOver) return false;
    try {
      const armyState = this.systems.army.getState();
      armyState.armies = armyState.armies.map(army => ({ ownerId: 'player', ...army }));
      const state = {
      version: SaveManager.CURRENT_VERSION,
      timestamp: Date.now(),
      world: structuredClone(this._worldState),
      time: this.systems.time.getState(),
      population: this.systems.population.getState(),
      resources: this.systems.resource.getSaveState(),
      resourceNodes: this.systems.resourceNodes.getState(),
      fogOfWar: this.systems.fogOfWar.getState(),
      items: this.systems.item.getAllStates(),
      buildings: this.systems.building.getAllStates(),
      expedition: this.systems.expedition.getState(),
      events: this.systems.event.getSaveState(),
      dailySettlement: this.systems.dailySettlement.getState(),
      torches: this.systems.torch.getAllStates(),
      roads: [],
      tech: this.systems.tech.getState(),
      culture: this.systems.culture.getState(),
      combat: this.systems.combat.getState(),
      quest: this.systems.quest.getState(),
      weather: this.systems.weather.getState(),
      invasion: this.systems.invasion.getState(),
      colony: this.systems.colony.getState(),
      territory: this.systems.territory.getState(),
      enemyExpansion: this.systems.enemyExpansion.getState(),
      buildingTech: this.systems.buildingTech.getState(),
      diplomacy: this.systems.diplomacy.getState(),
      heroes: this.systems.hero.getState(),
      era: this.systems.era.getState(),
      luxuries: this.systems.luxury.getState(),
      audio: this.systems.audio.getAllStates(),
      camera: this.mapRenderer ? this.mapRenderer.getCameraState() : null,
      armyState,
      wildSites: this.systems.wildSites.getState(),
      ruins: this.systems.ruins.getState(),
      blackMist: this.systems.blackMist.getState(),
      economicOrders: this.systems.economyOrders.getState(),
      commerce: {
        ...this.systems.commerce.getState(),
        factions: store.getState('factions') || { states: {}, relations: {}, lastSyncDay: 0 }
      },
      eraMusic: store.getState('eraMusic'),
      doctrineResearched: store.getState('doctrineResearched') || [],
      doctrineResearchLevels: store.getState('doctrineResearchLevels') || {},
      inspiration: store.getState('inspiration') || 0,
      removedEventMarkers: this.mapRenderer ? this.mapRenderer.getMarkerState() : []
      };
      const saved = await SaveManager.save(omitUndefinedSaveProperties(state));
      if (!saved) {
        const diagnostic = SaveManager.getLastSaveDiagnostic();
        console.error(`[Game] Save rejected or failed (${reason})`);
        eventBus.emit('combatBroadcast', { message: `❌ 自动存档失败：${diagnostic?.detail || diagnostic?.stage || '未知错误'}` });
        return false;
      }
      console.log(`[Game] Saved (${reason})`);
      store.setState({ lastSaveTimestamp: state.timestamp, lastSaveReason: reason });
      eventBus.emit('combatBroadcast', { message: '💾 自动存档成功' });
      return true;
    } catch (error) {
      console.error(`[Game] Save snapshot failed (${reason}):`, error);
      eventBus.emit('combatBroadcast', { message: `❌ 自动存档失败：${error?.name || error?.message || 'unknown_error'}` });
      return false;
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

  async handleGameOver(data = {}) {
    if (this._gameOver) return;
    this._gameOver = true;
    this._resetting = true;
    gameLoop.stop();
    await SaveManager.reset();
    this.popupManager.open('game_over', { ...data, saveCleared: true });
  }

  returnToMainMenu() {
    this._resetting = true;
    location.reload();
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
