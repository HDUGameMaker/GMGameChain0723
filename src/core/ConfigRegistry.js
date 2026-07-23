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
      'buildings': 'config/buildings.json',
      'resources': 'config/resources.json',
      'items': 'config/items.json',
      'map': 'config/maps/base_map.json',
      'regions': 'config/expeditions/regions.json',
      'expeditionGlobal': 'config/expeditions/expedition_global.json',
      'eventsBase': 'config/events/events_base.json',
      'eventsExpedition': 'config/events/events_expedition.json'
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
}

// 全局单例
export const configRegistry = new ConfigRegistry();
export default ConfigRegistry;
