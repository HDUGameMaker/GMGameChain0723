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
      'buildings': 'config/buildings.json',
      'resources': 'config/resources.json',
      'items': 'config/items.json',
      'map': 'config/maps/base_map.json',
      'regions': 'config/expeditions/regions.json',
      'expeditionGlobal': 'config/expeditions/expedition_global.json',
      'eventsBase': 'config/events/events_base.json',
      'eventsExpedition': 'config/events/events_expedition.json',
      'eventsMap': 'config/events/events_map.json',
      'sound': 'config/sound.json',
      'adjacency_bonuses': 'config/adjacency-bonuses.json',
      'roads': 'config/roads.json',
      'techs': 'config/techs.json',
      'enemies': 'config/enemies.json',
      'culture': 'config/culture.json',
      'alchemy': 'config/alchemy.json',
      'quests': 'config/quests.json',
      'doctrines': 'config/doctrines.json'
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

    // 合成配方继承：高级建筑自动继承低级建筑的合成配方
    this._inheritSynthesisRecipes();

    console.log('[ConfigRegistry] All configs loaded:', Object.keys(this._configs));
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
