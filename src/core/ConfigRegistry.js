import { scaleCombatStatsToStrength } from '../domain/CombatStrength.js';

const POINT_YIELD_BALANCED = Symbol('pointYieldBalanced');
const ENEMY_STRENGTH_BALANCED = Symbol('enemyStrengthBalanced');

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
      'resourceNodes': 'config/resource-nodes.json',
      'items': 'config/items.json',
      'map': 'config/maps/base_map.json',
      'mapV1': 'config/maps/grand_map_v1.json',
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
      'strategicQuests': 'config/strategic_quests.json',
      'colonies': 'config/colonies.json',
      'doctrines': 'config/doctrines.json',
      'territory': 'config/territory.json',
      'enemyExpansion': 'config/enemy_expansion.json',
      'buildingTech': 'config/building_tech.json',
      'economicOrders': 'config/economic-orders.json',
      'commerce': 'config/commerce.json',
      'commercialBuildings': 'config/commercial-buildings.json',
      'militaryTactics': 'config/military-tactics.json',
      'worldFactions': 'config/world-factions.json',
      'eaIntegration': 'config/ea_integration.json',
      'historicalContent': 'config/historical_content.json',
      'civilizationBuildingOverrides': 'config/civilization-building-overrides.json',
      'campaignProgression': 'config/campaign-progression.json',
      'explorationBuildings': 'config/exploration-buildings.json',
      'buildingRuntimeOverrides': 'config/building-runtime-overrides.json'
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
    this._configs.map = this._cropMapAroundPlayer(this._configs.map);
    this._configs.mapV2 = this._configs.map;

    this._applyEaIntegration();
    this._applyHistoricalContent();
    this._applyExplorationBuildings();
    this._applyBuildingRuntimeOverrides();
    this._applyCivilizationBuildingOverrides();
    this._applyGameplayBalanceOverrides();
    this._removeRoadDependencies();
    this._ensureContentIcons();

    // 合成配方继承：高级建筑自动继承低级建筑的合成配方
    this._inheritSynthesisRecipes();

    console.log('[ConfigRegistry] All configs loaded:', Object.keys(this._configs));
  }

  _cropMapAroundPlayer(map) {
    if (!map?.grid?.length || map._playerCenteredHalfArea) return map;
    const oldHeight = map.grid.length;
    const oldWidth = map.gridWidth || map.grid[0]?.length || 0;
    const spawn = map.initialBuildings?.[0] || { gridX: Math.floor(oldWidth / 2), gridY: Math.floor(oldHeight / 2) };
    // 优先使用地图数据里显式声明的裁剪窗口(playerCenteredCrop,如 grand_map_v2 的
    // "玩家左侧主河以西全删 + 高度以玩家行为中心减半");没有声明的地图回退旧的 √½ 比例裁剪。
    const configured = map.playerCenteredCrop;
    const width = Number.isFinite(configured?.width) ? Math.max(32, Math.floor(configured.width))
      : Math.max(32, Math.floor(oldWidth * Math.SQRT1_2));
    const height = Number.isFinite(configured?.height) ? Math.max(32, Math.floor(configured.height))
      : Math.max(32, Math.floor(oldHeight * Math.SQRT1_2));
    const left = Number.isFinite(configured?.left)
      ? Math.max(0, Math.min(oldWidth - width, Math.floor(configured.left)))
      : Math.max(0, Math.min(oldWidth - width, Math.floor(spawn.gridX - width / 2)));
    const top = Number.isFinite(configured?.top)
      ? Math.max(0, Math.min(oldHeight - height, Math.floor(configured.top)))
      : Math.max(0, Math.min(oldHeight - height, Math.floor(spawn.gridY - height / 2)));
    const translate = item => ({ ...item, gridX: item.gridX - left, gridY: item.gridY - top });
    const inside = item => item.gridX >= left && item.gridX < left + width && item.gridY >= top && item.gridY < top + height;
    const manifest = Object.fromEntries(Object.entries(map.spawnManifest || {}).map(([key, items]) => {
      if (Array.isArray(items)) return [key, items.filter(inside).map(translate)];
      // 单对象条目(如 playerSpawn)也平移,避免出生点引用停留在裁剪区外。
      if (items && Number.isFinite(items.gridX) && Number.isFinite(items.gridY)) return [key, inside(items) ? translate(items) : items];
      return [key, items];
    }));
    return {
      ...map, _playerCenteredHalfArea: true, gridWidth: width, gridHeight: height,
      grid: map.grid.slice(top, top + height).map(row => Array.isArray(row) ? row.slice(left, left + width) : row.slice(left, left + width)),
      initialBuildings: (map.initialBuildings || []).filter(inside).map(translate),
      spawnManifest: manifest,
      expeditionEntrances: (map.expeditionEntrances || []).filter(inside).map(translate),
      initialCamera: map.initialCamera ? { ...map.initialCamera, gridX: map.initialCamera.gridX - left, gridY: map.initialCamera.gridY - top } : map.initialCamera,
      viewportCenter: map.viewportCenter ? { ...map.viewportCenter, defaultGridX: spawn.gridX - left, defaultGridY: spawn.gridY - top } : map.viewportCenter
    };
  }

  selectFixedMap(mapId = 'grand_map_v2') {
    const candidate = mapId === 'grand_map_v1' ? this._configs.mapV1 : this._configs.mapV2;
    if (!candidate || candidate.mapId !== mapId) return false;
    this._configs.map = candidate;
    return true;
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
    // Legacy click-to-damage map enemies were removed. Strategic hostile sites,
    // enemy expansion cells and hostile armies remain the supported opponents.
    // 敌人定义现在作为战略敌军模板使用，不再生成旧式点击伤害单位。
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
      warrior: ['primitive', 'infantry'],
      spearman: ['primitive', 'anti_cavalry'], archer: ['primitive', 'ranged'],
      swordsman: ['classical', 'infantry'],
      knight: ['medieval', 'cavalry'], armored_cavalry: ['medieval', 'cavalry'], pikeman: ['medieval', 'anti_cavalry'],
      crossbowman: ['medieval', 'ranged'], longbowman: ['medieval', 'ranged'],
      musketeer: ['exploration', 'ranged'],
      modern_infantry: ['modern', 'infantry'], jet_fighter: ['modern', 'special']
    };
    this._configs.enemies.units = this._configs.enemies.units.map(unit => {
      const metadata = legacyUnitMetadata[unit.id];
      if (!metadata) return unit;
      return { ...unit, eraId: unit.eraId || metadata[0], branch: metadata[1] };
    });
  }

  /**
   * Apply civilization-specific building roles after the generated historical
   * content is merged. Keeping this as a small overlay means generated content
   * can be refreshed without collapsing every unique building back into an
   * academy or civic hall.
   */
  _applyCivilizationBuildingOverrides() {
    const content = this._configs.historicalContent;
    const config = this._configs.civilizationBuildingOverrides;
    if (!content || !config?.civilizations || !config?.archetypes) return;

    const civilizationsById = new Map((content.civilizations || []).map(item => [item.id, item]));
    const patchesByBuildingId = new Map();

    content.buildings = (content.buildings || []).map(building => {
      if (!building.civilizationId) return building;
      const assignment = config.civilizations[building.civilizationId];
      const archetype = config.archetypes[assignment?.archetype];
      if (!assignment || !archetype) return building;

      const { archetype: _archetypeId, ...specific } = assignment;
      const patched = {
        ...building,
        ...archetype,
        ...specific,
        uniqueFunction: {
          ...(building.uniqueFunction || {}),
          ...(archetype.uniqueFunction || {}),
          ...(specific.uniqueFunction || {})
        },
        tags: [...new Set([...(building.tags || []), 'civilization_unique', archetype.category])]
      };
      patchesByBuildingId.set(patched.id, patched);

      const civilization = civilizationsById.get(building.civilizationId);
      if (civilization) {
        civilization.uniqueBuilding = {
          ...civilization.uniqueBuilding,
          id: patched.id,
          name: patched.name,
          description: patched.description,
          category: patched.category,
          replaces: patched.replaces
        };
      }
      return patched;
    });

    this._configs.buildings = (this._configs.buildings || []).map(building => (
      patchesByBuildingId.get(building.id) || building
    ));
  }

  _applyExplorationBuildings() {
    const additions = this._configs.explorationBuildings;
    if (!Array.isArray(additions)) return;
    const ids = new Set((this._configs.buildings || []).map(building => building.id));
    this._configs.buildings = [
      ...(this._configs.buildings || []),
      ...additions.filter(building => !ids.has(building.id))
    ];
  }

  _applyBuildingRuntimeOverrides() {
    const overrides = this._configs.buildingRuntimeOverrides?.buildings;
    if (!overrides || typeof overrides !== 'object') return;
    this._configs.buildings = (this._configs.buildings || []).map(building => {
      const patch = overrides[building.id];
      if (!patch) return building;
      return {
        ...building,
        ...patch,
        uniqueFunction: {
          ...(building.uniqueFunction || {}),
          ...(patch.uniqueFunction || {})
        }
      };
    });
  }

  _applyGameplayBalanceOverrides() {
    const content = this._configs.historicalContent || {};
    const buildingCollections = [this._configs.buildings || [], content.buildings || []];
    for (const buildings of buildingCollections) {
      for (const building of buildings) {
        if (!building) continue;
        if (building.isHeadquarters === true) building.maxCount = 1;
        const producesGold = building.uniqueFunction?.goldPerWorker > 0
          || (building.production?.output || []).some(output => output.resourceId === 'gold' && Number(output.amount) > 0);
        if (producesGold && !building.requiredResourceNode) {
          building.maxCount = Math.min(Number.isFinite(building.maxCount) ? building.maxCount : 2, 2);
        }
        if (!building[POINT_YIELD_BALANCED]) {
          const fn = building.uniqueFunction;
          if (fn && Number(fn.sciencePerWorker) > 0) fn.sciencePerWorker = Number((Number(fn.sciencePerWorker) * 0.2).toFixed(4));
          if (fn && Number(fn.civicPerWorker) > 0) fn.civicPerWorker = Number((Number(fn.civicPerWorker) * 0.2).toFixed(4));
          Object.defineProperty(building, POINT_YIELD_BALANCED, { value: true });
        }
      }
    }

    for (const enemy of this._configs.enemies?.enemies || []) {
      if (!enemy || enemy.id === 'eastern_ruin_guardian' || enemy.boss === true || enemy[ENEMY_STRENGTH_BALANCED]) continue;
      Object.assign(enemy, scaleCombatStatsToStrength({ ...enemy, hp: enemy.maxHp }, 2));
      delete enemy.hp;
      Object.defineProperty(enemy, ENEMY_STRENGTH_BALANCED, { value: true });
    }

    const eraOrders = new Map((content.eras || []).map(era => [era.id, Number(era.order) || 0]));
    const applyResearchFoodCosts = collections => {
      const visited = new Set();
      for (const nodes of collections) for (const node of nodes || []) {
        if (!node || visited.has(node)) continue;
        visited.add(node);
        if (!node.eraId || !(Number(node.pointCost) > 0)) continue;
        const eraOrder = eraOrders.get(node.eraId) || 0;
        const foodAmount = Math.max(25, Math.round(Number(node.pointCost) * 1.35 + eraOrder * 20));
        const costs = Array.isArray(node.cost) ? node.cost.map(cost => ({ ...cost })) : [];
        const existing = costs.find(cost => cost.resourceId === 'food');
        if (existing) existing.amount = Math.max(Number(existing.amount) || 0, foodAmount);
        else costs.push({ resourceId: 'food', amount: foodAmount });
        node.cost = costs;
      }
    };
    applyResearchFoodCosts([
      this._configs.techs || [], content.techs || [],
      this._configs.culture || [], content.civics || []
    ]);
  }

  _removeRoadDependencies() {
    this._configs.buildings = (this._configs.buildings || []).map(building => {
      const groups = (building.adjacentRequirementGroups || []).map(group => {
        const conditions = (Array.isArray(group) ? group : group?.conditions || []).filter(condition => condition?.type !== 'road');
        return Array.isArray(group) ? conditions : { ...group, conditions };
      }).filter(group => (Array.isArray(group) ? group : group.conditions).length > 0);
      const cleaned = { ...building, roadRequired: false, adjacentRequirementGroups: groups };
      delete cleaned.adjacentRequirements;
      return cleaned;
    });
    this._configs.roads = [];
  }

  getHistoricalContent() {
    return this._configs.historicalContent || {
      eras: [], civilizations: [], luxuries: [], buildings: [], techs: [],
      civics: [], units: [], heroes: []
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

    for (const unit of this._configs.enemies?.units || []) {
      if (!unit?.id) continue;
      unit.cardArt ||= `assets/unit-cards/${unit.id}.png`;
    }
    for (const hero of [
      ...(this._configs.eaIntegration?.heroes || []),
      ...(this._configs.historicalContent?.heroes || [])
    ]) {
      if (!hero?.id) continue;
      hero.portrait ||= `assets/hero-portraits/${hero.id}.png`;
    }
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
