/**
 * ConfigRegistry - 所有配置的注册中心
 * 负责加载和缓存所有 JSON 配置文件
 */
class ConfigRegistry {
  constructor() {
    this._configs = {};
  }

  /**
   * 加载所有配置文件
   */
  async loadAll() {
    const configFiles = {
      'global': 'config/global.json',
      'initial': 'config/initial.json',
      'ui_main_menu': 'config/ui_main_menu.json',
      'buildings': 'config/buildings.json',
      'resources': 'config/resources.json',
      'items': 'config/items.json',
      'map': 'config/maps/base_map.json',
      'regions': 'config/expeditions/regions.json',
      'expeditionGlobal': 'config/expeditions/expedition_global.json',
      'eventsBase': 'config/events/events_base.json',
      'eventsExpedition': 'config/events/events_expedition.json',
      'eventsMap': 'config/events/events_map.json',
      'eventsHistorical': 'config/events/events_historical.json',
      'sound': 'config/sound.json',
      'adjacency_bonuses': 'config/adjacency-bonuses.json',
      'roads': 'config/roads.json',
      'techs': 'config/techs.json',
      'enemies': 'config/enemies.json',
      'culture': 'config/culture.json',
      'quests': 'config/quests.json',
      'colonies': 'config/colonies.json',
      'doctrines': 'config/doctrines.json',
      'territory': 'config/territory.json',
      'enemyExpansion': 'config/enemy_expansion.json',
      'buildingTech': 'config/building_tech.json',
      'economicOrders': 'config/economic-orders.json',
      'commerce': 'config/commerce.json',
      'militaryTactics': 'config/military-tactics.json',
      'eaIntegration': 'config/ea_integration.json',
      'historicalContent': 'config/historical_content.json'
    };

    const loadPromises = Object.entries(configFiles).map(async ([key, path]) => {
      try {
        const response = await fetch(path);
        if (!response.ok) {
          console.warn(`[ConfigRegistry] Failed to load ${path}: ${response.status}`);
          this._configs[key] = key.startsWith('events') ? [] : null;
          return;
        }
        this._configs[key] = await response.json();
      } catch (e) {
        console.warn(`[ConfigRegistry] Error loading ${path}:`, e.message);
        this._configs[key] = key.startsWith('events') ? [] : null;
      }
    });

    await Promise.all(loadPromises);

    this._applyEaIntegration();
    this._applyHistoricalContent();
    this._ensureContentIcons();

    // 合成配方继承：高级建筑自动继承低级建筑的合成配方
    this._inheritSynthesisRecipes();

    console.log('[ConfigRegistry] All configs loaded:', Object.keys(this._configs));
  }

  /**
   * 将 Early Assess 的兼容内容按 ID 追加到主版本。
   * 主版本同 ID 配置永远优先，扩展只能补充标签或新增内容。
   */
  _applyEaIntegration() {
    const content = this._configs.eaIntegration;
    const enemies = this._configs.enemies;
    if (!content || !enemies) return;
    const mergeUnique = (base = [], additions = []) => {
      const ids = new Set(base.map(item => item.id));
      return [...base, ...additions.filter(item => !ids.has(item.id))];
    };
    enemies.unitBranches = mergeUnique(enemies.unitBranches, content.unitBranches);
    enemies.units = (enemies.units || []).map(unit => ({ ...unit, ...(content.unitProfiles?.[unit.id] || {}) }));
    enemies.units = mergeUnique(enemies.units, content.units);
    enemies.enemies = mergeUnique(enemies.enemies, content.enemies);
    this._configs.buildings = mergeUnique(this._configs.buildings, content.buildings);

    for (const building of content.buildings || []) {
      for (const condition of building.unlockConditions || []) {
        if (condition.type !== 'tech') continue;
        const tech = (this._configs.techs || []).find(node => node.id === condition.techId);
        if (!tech) continue;
        if (!tech.unlocks) tech.unlocks = {};
        if (!Array.isArray(tech.unlocks.buildings)) tech.unlocks.buildings = [];
        if (!tech.unlocks.buildings.includes(building.id)) tech.unlocks.buildings.push(building.id);
      }
    }
  }

  /**
   * 合并历史文明大内容包。与 EA 兼容层使用同一规则：主版本和已加载扩展的
   * 同 ID 项优先，历史内容只追加新 ID，避免平衡配置被静默覆盖。
   */
  _applyHistoricalContent() {
    const content = this._configs.historicalContent;
    if (!content) return;
    const mergeUnique = (base = [], additions = []) => {
      const ids = new Set(base.map(item => item.id));
      return [...base, ...additions.filter(item => !ids.has(item.id))];
    };

    this._configs.buildings = mergeUnique(this._configs.buildings, content.buildings);
    for (const building of this._configs.buildings || []) {
      if ((building.tags || []).includes('naval_facility')) building.allowedGrounds = ['S', 'W'];
    }
    this._configs.techs = mergeUnique(this._configs.techs, content.techs);
    this._configs.culture = mergeUnique(this._configs.culture, content.civics);

    if (!this._configs.enemies) this._configs.enemies = { units: [] };
    this._configs.enemies.units = mergeUnique(this._configs.enemies.units, content.units);

    // 旧主版本与 EA 单位没有时代字段。这里仅补充分类元数据，不覆盖其既有数值，
    // 使它们能够进入正确的时代分页并服从时代训练限制。
    const legacyUnitMetadata = {
      warrior: ['ancient', 'infantry'], raft: ['ancient', 'navy'],
      spearman: ['ancient', 'anti_cavalry'], archer: ['ancient', 'ranged'],
      swordsman: ['classical', 'infantry'], catapult: ['classical', 'siege'], galley: ['classical', 'navy'],
      knight: ['medieval', 'cavalry'], armored_cavalry: ['medieval', 'cavalry'], pikeman: ['medieval', 'anti_cavalry'],
      crossbowman: ['medieval', 'ranged'], longbowman: ['medieval', 'ranged'], trebuchet: ['medieval', 'siege'], siege_tower: ['medieval', 'siege'],
      musketeer: ['exploration', 'ranged'], sailing_ship: ['exploration', 'navy'], fire_ship: ['exploration', 'navy'],
      cannon: ['industrial', 'siege'], biplane: ['industrial', 'special'], tank: ['industrial', 'special'],
      modern_infantry: ['modern', 'infantry'], jet_fighter: ['modern', 'special'],
      rocket_artillery: ['modern', 'siege'], battleship: ['modern', 'navy'], missile_destroyer: ['information', 'navy']
    };
    this._configs.enemies.units = this._configs.enemies.units.map(unit => {
      const metadata = legacyUnitMetadata[unit.id];
      if (!metadata) return unit;
      return { ...unit, eraId: unit.eraId || metadata[0], branch: metadata[1] };
    });
  }

  getHistoricalContent() {
    return this._configs.historicalContent || {
      eras: [], civilizations: [], luxuries: [], buildings: [], techs: [],
      civics: [], units: [], heroes: [], strategies: []
    };
  }

  _ensureContentIcons() {
    const apply = (items, type) => {
      for (const item of items || []) {
        if (!item?.id) continue;
        const path = `assets/historical-icons/${type}/${item.id}.svg`;
        if (!item.icon || !String(item.icon).includes('/')) item.icon = path;
        if (!item.iconAsset) item.iconAsset = path;
      }
    };
    apply(this._configs.buildings, 'buildings');
    apply(this._configs.techs, 'techs');
    apply(this._configs.culture, 'civics');
    apply(this._configs.enemies?.units, 'units');
    apply(this._configs.eventsHistorical, 'events');
    apply(this._configs.eaIntegration?.heroes, 'heroes');
    apply(this._configs.eaIntegration?.outposts, 'outposts');
  }

  /**
   * 获取配置
   * @param {string} key - 配置键名
   * @returns {*} 配置数据
   */
  get(key) {
    return this._configs[key];
  }

  /**
   * 获取所有事件配置（合并所有事件文件）
   * @returns {Array} 所有事件配置
   */
  getAllEvents() {
    const events = [];
    if (Array.isArray(this._configs['eventsBase'])) {
      events.push(...this._configs['eventsBase']);
    }
    if (Array.isArray(this._configs['eventsExpedition'])) {
      events.push(...this._configs['eventsExpedition']);
    }
    if (Array.isArray(this._configs['eventsMap'])) {
      events.push(...this._configs['eventsMap']);
    }
    if (Array.isArray(this._configs.eventsHistorical)) {
      const ids = new Set(events.map(event => event.id));
      events.push(...this._configs.eventsHistorical.filter(event => !ids.has(event.id)));
    }
    if (Array.isArray(this._configs.eaIntegration?.events)) {
      const ids = new Set(events.map(event => event.id));
      events.push(...this._configs.eaIntegration.events.filter(event => !ids.has(event.id) && event.category !== 'alchemy'));
    }
    return events;
  }

  /**
   * 根据ID获取建筑配置
   * @param {string} id - 建筑ID
   * @returns {object|null}
   */
  getBuilding(id) {
    const buildings = this._configs['buildings'] || [];
    return buildings.find(b => b.id === id) || null;
  }

  /**
   * 根据ID获取资源配置
   * @param {string} id - 资源ID
   * @returns {object|null}
   */
  getResource(id) {
    const resources = this._configs['resources'] || [];
    return resources.find(r => r.id === id) || null;
  }

  /**
   * 根据ID获取物品配置
   * @param {string} id - 物品ID
   * @returns {object|null}
   */
  getItem(id) {
    const items = this._configs['items'] || [];
    return items.find(i => i.id === id) || null;
  }

  /**
   * 根据ID获取区域配置
   * @param {string} id - 区域ID
   * @returns {object|null}
   */
  getRegion(id) {
    const regions = this._configs['regions'] || [];
    return regions.find(r => r.id === id) || null;
  }

  /**
   * 根据ID获取火把配置（合并到 buildings.json，通过 isTorch 标记识别）
   * @param {string} id - 火把ID
   * @returns {object|null}
   */
  getTorch(id) {
    const buildings = this._configs['buildings'] || [];
    return buildings.find(b => b.isTorch && b.id === id) || null;
  }

  /**
   * 获取完整炼金配置
   * @returns {object}
   */
  getAlchemy() { return this._configs['alchemy'] || {}; }

  /**
   * 根据ID获取炼金材料配置
   * @param {string} id
   * @returns {object|null}
   */
  getAlchemyMaterial(id) {
    const alchemy = this.getAlchemy();
    return (alchemy.materials || []).find(m => m.id === id) || null;
  }

  /**
   * 根据ID获取炼金配方
   * @param {string} id
   * @returns {object|null}
   */
  getAlchemyRecipe(id) {
    const alchemy = this.getAlchemy();
    return (alchemy.recipes || []).find(r => r.id === id) || null;
  }

  /**
   * 根据ID获取药剂效果配置
   * @param {string} id
   * @returns {object|null}
   */
  getAlchemyEffect(id) {
    const alchemy = this.getAlchemy();
    return (alchemy.effects || []).find(e => e.id === id) || null;
  }

  /**
   * 获取炼金法术成长树节点列表
   * @returns {Array}
   */
  getSpellTree() {
    return this.getAlchemy().spellTree || [];
  }

  /**
   * 获取所有法术定义
   * @returns {Array}
   */
  getSpellDefs() {
    return this.getAlchemy().spellDefs || [];
  }

  /**
   * 根据ID获取法术定义
   * @param {string} id
   * @returns {object|null}
   */
  getSpellDef(id) {
    return this.getSpellDefs().find(s => s.id === id) || null;
  }

  /**
   * 获取建筑科技树节点列表
   * @returns {Array}
   */
  getBuildingTech() {
    const cfg = this._configs['buildingTech'];
    return (cfg && cfg.nodes) || [];
  }

  /**
   * 合成配方继承：沿 upgradesFrom 链向上收集所有祖先的合成配方，
   * 合并到升级后的建筑上。子建筑自己的配方优先（按 recipe.id 去重）。
   * 支持任意深度的升级链（基础→进阶→超级→...）。
   */
  _inheritSynthesisRecipes() {
    const buildings = this._configs['buildings'];
    if (!Array.isArray(buildings)) return;

    // 建立 id → 建筑配置 的快速查找表
    const buildingMap = {};
    for (const b of buildings) {
      buildingMap[b.id] = b;
    }

    let mergedCount = 0;
    for (const building of buildings) {
      if (!building.upgradesFrom) continue;

      // 已存在的配方 id（子建筑自己的配方优先）
      const seenIds = new Set((building.synthesisRecipes || []).map(r => r.id));
      const inherited = [];

      // 沿升级链向上遍历，收集所有祖先配方
      let current = buildingMap[building.upgradesFrom];
      while (current) {
        for (const recipe of (current.synthesisRecipes || [])) {
          if (!seenIds.has(recipe.id)) {
            inherited.push(recipe);
            seenIds.add(recipe.id);
          }
        }
        current = current.upgradesFrom ? buildingMap[current.upgradesFrom] : null;
      }

      if (inherited.length > 0) {
        building.synthesisRecipes = [...(building.synthesisRecipes || []), ...inherited];
        mergedCount += inherited.length;
      }
    }

    if (mergedCount > 0) {
      console.log(`[ConfigRegistry] 合成配方继承完成: ${mergedCount} 个配方已合并`);
    }
  }
}

// 全局单例
export const configRegistry = new ConfigRegistry();
export default ConfigRegistry;
