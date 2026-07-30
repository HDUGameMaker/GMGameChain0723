/**
 * AlchemySystem - 炼金系统
 * 管理炼金材料库存、酿造进度、配方发现、等级经验、伟大工作与药剂效果
 * 框架参照 CultureSystem/TechSystem，新增：实验发现引擎 + 五盐 + Magnum Opus
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class AlchemySystem {
  constructor() {
    /** @type {number} 炼金等级 1-10 */
    this._level = 1;
    /** @type {number} 炼金经验值 */
    this._xp = 0;
    /** @type {Object.<string, number>} 材料库存 { materialId: count } */
    this._materialStock = {};
    /** @type {Set<string>} 已发现的配方ID（实验得来） */
    this._discoveredRecipes = new Set();
    /** @type {{ recipeId: string, baseId: string, materialIds: string[], processType: string, ticksElapsed: number, totalTicks: number, successChance: number, qualityTier: string, grindLevels: Object.<string, number> } | null} */
    this._brewingState = null;
    /** @type {{ void: number, moon: number, sun: number, life: number, philosopher: number }} */
    this._salts = { void: 0, moon: 0, sun: 0, life: 0, philosopher: 0 };
    /** @type {string} 伟大工作当前阶段 */
    this._magnumOpusStage = 'none';
    /** @type {Array.<{effectId: string, quality: string, ticksRemaining: number, modifiers: Object}>} */
    this._activeEffects = [];

    // 交叉引用
    this._resourceSystem = null;
    this._itemSystem = null;
    this._buildingSystem = null;
    this._timeSystem = null;

    // 监听 tick 推进酿造进度
    eventBus.on('tick', (data) => this._onTick(data));
  }

  // ===== 依赖注入 =====
  setResourceSystem(rs) { this._resourceSystem = rs; }
  setItemSystem(is) { this._itemSystem = is; }
  setBuildingSystem(bs) { this._buildingSystem = bs; }
  setTimeSystem(ts) { this._timeSystem = ts; }

  // ===== 初始化 =====
  init() {
    const alchemy = configRegistry.getAlchemy();
    // 初始化材料库存（common 材料给一些初始数量）
    for (const mat of (alchemy.materials || [])) {
      if (mat.rarity === 'common') {
        this._materialStock[mat.id] = 3;
      } else {
        this._materialStock[mat.id] = 0;
      }
    }
    this._updateStore();
  }

  // ===== 配置读取 =====
  _getAlchemy() { return configRegistry.getAlchemy() || {}; }
  _getGlobal() { return this._getAlchemy().global || {}; }
  _getBases() { return this._getAlchemy().bases || []; }
  _getMaterials() { return this._getAlchemy().materials || []; }
  _getRecipes() { return this._getAlchemy().recipes || []; }
  _getEffects() { return this._getAlchemy().effects || []; }
  _getMagnumOpus() { return this._getAlchemy().magnumOpus || []; }
  _getSalts() { return this._getAlchemy().salts || []; }
  _getProcessingTypes() { return this._getAlchemy().processingTypes || {}; }

  // ===== 查询 API =====
  getLevel() { return this._level; }
  getXP() { return this._xp; }
  getXPToNext() {
    const global = this._getGlobal();
    const maxLevel = global.maxLevel || 10;
    if (this._level >= maxLevel) return 0; // 已满级
    const table = global.levelXPTable || [];
    return table[this._level] || 9999;
  }
  getMagnumOpusStage() { return this._magnumOpusStage; }
  getBrewingState() { return this._brewingState ? { ...this._brewingState } : null; }
  getSalts() { return { ...this._salts }; }
  getDiscoveredRecipes() { return [...this._discoveredRecipes]; }
  getActiveEffects() { return this._activeEffects.map(e => ({ ...e })); }

  /** 获取材料库存（含配置信息） */
  getMaterialStock() {
    const materials = this._getMaterials();
    return materials.map(m => ({
      ...m,
      stock: this._materialStock[m.id] || 0
    }));
  }

  /** 获取当前等级可用的基底 */
  getAvailableBases() {
    return this._getBases().filter(b => b.unlockLevel <= this._level);
  }

  /** 获取所有可用配方（等级解锁 + 实验发现的） */
  getAvailableRecipes() {
    const recipes = this._getRecipes();
    return recipes.filter(r => this._isRecipeAvailable(r));
  }

  /** 配方是否可用 */
  _isRecipeAvailable(recipe) {
    if (this._discoveredRecipes.has(recipe.id)) return true;
    if (recipe.requiredLevel <= this._level) return true;
    return false;
  }

  /** 获取可用的伟大工作阶段 */
  getAvailableMagnumOpusStages() {
    const stages = this._getMagnumOpus();
    return stages.filter(s => this._canPerformMagnumOpus(s));
  }

  // ===== 材料管理 =====
  addMaterial(materialId, count) {
    const mat = configRegistry.getAlchemyMaterial(materialId);
    if (!mat) return false;
    if (!this._materialStock[materialId]) this._materialStock[materialId] = 0;
    this._materialStock[materialId] += count;
    this._updateStore();
    return true;
  }

  consumeMaterial(materialId, count) {
    if (!this._materialStock[materialId] || this._materialStock[materialId] < count) return false;
    this._materialStock[materialId] -= count;
    this._updateStore();
    return true;
  }

  canAffordMaterials(materialIds) {
    const needed = {};
    for (const id of materialIds) {
      needed[id] = (needed[id] || 0) + 1;
    }
    for (const [id, count] of Object.entries(needed)) {
      if ((this._materialStock[id] || 0) < count) return false;
    }
    return true;
  }

  // ===== 元素精华提炼 =====

  /** 元素→精华ID映射（硬编码元数据） */
  static ELEMENT_TO_ESSENCE = {
    fire: 'fire_essence',
    water: 'water_essence',
    earth: 'earth_essence',
    wind: 'wind_essence',
    void: 'void_essence'
  };

  /**
   * 用同元素材料提炼元素精华
   * @param {string} element - 元素名 (fire/water/earth/wind/void)
   * @returns {{ success: boolean, reason?: string, essenceId?: string, cost?: number, sourceMaterialId?: string }}
   */
  refineToEssence(element) {
    const essenceId = AlchemySystem.ELEMENT_TO_ESSENCE[element];
    if (!essenceId) return { success: false, reason: '未知元素: ' + element };

    const global = this._getGlobal();
    const cost = global.essenceRefineCost || 5;

    // 找到库存最多的同元素材料（优先 common/uncommon，排除 essence 和 special 类别）
    const materials = this._getMaterials();
    const candidates = materials.filter(m =>
      m.element === element &&
      m.category !== 'essence' &&
      m.category !== 'special' &&
      (this._materialStock[m.id] || 0) >= cost
    );
    if (candidates.length === 0) {
      return { success: false, reason: `没有足够的${element}元素材料（需要${cost}个）` };
    }
    // 选库存最少的先消耗（保留稀有材料），优先非 legendary
    candidates.sort((a, b) => {
      const aIsLegend = a.rarity === 'legendary';
      const bIsLegend = b.rarity === 'legendary';
      if (aIsLegend !== bIsLegend) return aIsLegend ? 1 : -1;
      return (this._materialStock[a.id] || 0) - (this._materialStock[b.id] || 0);
    });
    const sourceMat = candidates[0];

    // 消耗材料 → 产出精华
    if (!this.consumeMaterial(sourceMat.id, cost)) {
      return { success: false, reason: '库存不足（内部错误）' };
    }
    this.addMaterial(essenceId, 1);
    return { success: true, essenceId, cost, sourceMaterialId: sourceMat.id };
  }

  /** 查询某元素是否可提炼 */
  canRefineEssence(element) {
    const essenceId = AlchemySystem.ELEMENT_TO_ESSENCE[element];
    if (!essenceId) return false;
    const global = this._getGlobal();
    const cost = global.essenceRefineCost || 5;
    const materials = this._getMaterials();
    return materials.some(m =>
      m.element === element &&
      m.category !== 'essence' &&
      m.category !== 'special' &&
      (this._materialStock[m.id] || 0) >= cost
    );
  }

  // ===== 酿造流程 =====

  /**
   * 开始酿造（自由实验模式）
   * @param {string} baseId - 基底ID
   * @param {string[]} materialIds - 材料ID数组（最多 maxMaterialsPerBrew 个）
   * @param {string} processType - 加工方式 (heat/stir/rest)
   * @param {Object.<string, number>} grindLevels - 材料研磨程度 { materialId: 0.0~1.0 }
   * @returns {{ valid: boolean, reason?: string }}
   */
  experiment(baseId, materialIds, processType, grindLevels) {
    // 研磨度归一化：UI 传入 0~100，系统内统一按 0~1 处理
    grindLevels = this._normalizeGrindLevels(grindLevels);

    // 验证基底
    const base = this._getBases().find(b => b.id === baseId);
    if (!base) return { valid: false, reason: '未知基底' };
    if (base.unlockLevel > this._level) return { valid: false, reason: '基底未解锁（需炼金等级' + base.unlockLevel + '）' };

    // 验证材料数量
    const global = this._getGlobal();
    if (materialIds.length < 2) return { valid: false, reason: '至少需要2种材料' };
    if (materialIds.length > (global.maxMaterialsPerBrew || 5)) {
      return { valid: false, reason: '最多' + (global.maxMaterialsPerBrew || 5) + '种材料' };
    }

    // 验证加工方式（配置字段为 processTypes）
    const baseProcessTypes = base.compatibleProcessTypes || base.processTypes;
    if (!baseProcessTypes || !baseProcessTypes.includes(processType)) {
      return { valid: false, reason: '该基底不支持此加工方式' };
    }

    // 验证材料存在且库存充足
    for (const id of materialIds) {
      const mat = configRegistry.getAlchemyMaterial(id);
      if (!mat) return { valid: false, reason: '未知材料: ' + id };
    }
    if (!this.canAffordMaterials(materialIds)) {
      return { valid: false, reason: '材料库存不足' };
    }

    // 消耗基底资源
    if (base.cost && base.cost.length > 0 && this._resourceSystem) {
      if (!this._resourceSystem.canAfford(base.cost)) {
        return { valid: false, reason: '基底资源不足' };
      }
      this._resourceSystem.consumeAll(base.cost);
    }

    // 消耗材料
    for (const id of materialIds) {
      this.consumeMaterial(id, 1);
    }

    // 计算实验结果
    const result = this._calculateExperimentResult(base, materialIds, processType, grindLevels || {});

    // 开始酿造
    const processingType = this._getProcessingTypes()[processType] || {};
    const ticksMod = processingType.baseTicksMod || 1.0;
    const grindExtraTicks = Object.values(grindLevels || {}).reduce((sum, g) => sum + (g || 0), 0) * (global.grindExtraTicks || 1);

    const totalTicks = Math.max(2, Math.round(result.baseTicks * ticksMod + grindExtraTicks));

    this._brewingState = {
      recipeId: result.matchedRecipeId || null,
      baseId,
      materialIds,
      processType,
      ticksElapsed: 0,
      totalTicks,
      successChance: result.successChance,
      qualityTier: 'I',
      grindLevels: grindLevels || {},
      matchedEffectId: result.effectId,
      isExperiment: true
    };

    this._updateStore();
    eventBus.emit('alchemyBrewStarted', { baseId, materialIds, processType });
    return { valid: true };
  }

  /**
   * 按已知配方酿造
   * @param {string} recipeId
   * @param {Object.<string, number>} grindLevels
   * @returns {{ valid: boolean, reason?: string }}
   */
  craftRecipe(recipeId, grindLevels) {
    // 研磨度归一化：UI 传入 0~100，系统内统一按 0~1 处理
    grindLevels = this._normalizeGrindLevels(grindLevels);

    const recipe = configRegistry.getAlchemyRecipe(recipeId);
    if (!recipe) return { valid: false, reason: '未知配方' };
    if (!this._isRecipeAvailable(recipe)) return { valid: false, reason: '配方未解锁' };

    const base = this._getBases().find(b => b.id === recipe.base);
    if (!base) return { valid: false, reason: '配方基底无效' };

    // 验证材料库存
    if (!this.canAffordMaterials(recipe.materials)) {
      return { valid: false, reason: '材料库存不足' };
    }

    // 消耗基底资源
    if (base.cost && base.cost.length > 0 && this._resourceSystem) {
      if (!this._resourceSystem.canAfford(base.cost)) {
        return { valid: false, reason: '基底资源不足' };
      }
      this._resourceSystem.consumeAll(base.cost);
    }

    // 消耗材料
    for (const id of recipe.materials) {
      this.consumeMaterial(id, 1);
    }

    // 计算品质
    const global = this._getGlobal();
    const processType = this._getProcessingTypes()[recipe.processType] || {};
    const grindBonus = Object.values(grindLevels || {}).reduce((sum, g) => sum + (g || 0), 0) * (global.grindExtraPotency || 0);
    const successChance = Math.min(0.98, (recipe.baseSuccessChance || 0.5) + (processType.successMod || 0) + grindBonus);

    const ticksMod = processType.baseTicksMod || 1.0;
    const grindExtraTicks = Object.values(grindLevels || {}).reduce((sum, g) => sum + (g || 0), 0) * (global.grindExtraTicks || 1);
    const totalTicks = Math.max(2, Math.round((recipe.baseTicks || 3) * ticksMod + grindExtraTicks));

    this._brewingState = {
      recipeId,
      baseId: recipe.base,
      materialIds: recipe.materials,
      processType: recipe.processType,
      ticksElapsed: 0,
      totalTicks,
      successChance,
      qualityTier: 'I',
      grindLevels: grindLevels || {},
      isExperiment: false
    };

    this._updateStore();
    eventBus.emit('alchemyBrewStarted', { recipeId, baseId: recipe.base });
    return { valid: true };
  }

  /** 取消正在进行的酿造 */
  cancelBrewing() {
    if (!this._brewingState) return { valid: false, reason: '没有正在进行的酿造' };

    const state = this._brewingState;

    // 虚空盐：拥有时返还 80% 材料（无盐时 50%），并消耗 100 粒
    const refundRate = this._salts.void > 0 ? 0.8 : 0.5;
    if (this._salts.void > 0) {
      this._salts.void = Math.max(0, this._salts.void - 100);
    }

    // 返还材料
    for (const id of state.materialIds) {
      this.addMaterial(id, Math.ceil(1 * refundRate));
    }

    // 返还基底资源（按相同返还率）
    if (state.baseId && this._resourceSystem) {
      const base = this._getBases().find(b => b.id === state.baseId);
      if (base && base.cost && base.cost.length > 0) {
        for (const c of base.cost) {
          this._resourceSystem.addClamped(c.resourceId, Math.ceil(c.amount * refundRate));
        }
      }
    }

    this._brewingState = null;
    this._updateStore();
    return { valid: true };
  }

  // ===== 实验计算引擎 =====

  /**
   * 研磨度归一化：UI 滑块传入 0~100 整数，系统内统一按 0~1 小数处理。
   * 对超过 1 的值视为百分比并除以 100；非数值或缺省视为 0。
   */
  _normalizeGrindLevels(grindLevels) {
    const normalized = {};
    if (!grindLevels || typeof grindLevels !== 'object') return normalized;
    for (const [id, val] of Object.entries(grindLevels)) {
      let v = Number(val);
      if (!isFinite(v) || v < 0) v = 0;
      if (v > 1) v = v / 100; // 0~100 → 0~1
      normalized[id] = v;
    }
    return normalized;
  }

  _calculateExperimentResult(base, materialIds, processType, grindLevels) {
    const materials = materialIds.map(id => configRegistry.getAlchemyMaterial(id)).filter(Boolean);
    const global = this._getGlobal();

    // 收集所有可能的效果
    const effectScores = {};
    for (const mat of materials) {
      const grindBonus = (grindLevels[mat.id] || 0) * (global.grindExtraPotency || 0);
      const effectivePotency = mat.potency + grindBonus;

      for (const effectId of (mat.effects || [])) {
        // 检查基底兼容性
        if (base.compatibleEffects && !base.compatibleEffects.includes(effectId)) continue;

        if (!effectScores[effectId]) effectScores[effectId] = 0;
        // 元素匹配加分
        const elementMatch = mat.element === base.elementBias ? 1.5 : 1.0;
        effectScores[effectId] += effectivePotency * elementMatch;
      }
    }

    // 选出得分最高的效果
    const sorted = Object.entries(effectScores).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) {
      return { successChance: 0, baseTicks: 5, effectId: null, matchedRecipeId: null };
    }

    // 取前3个候选，随机选一个
    const topN = sorted.slice(0, Math.min(3, sorted.length));
    const totalScore = topN.reduce((sum, e) => sum + e[1], 0);
    let roll = Math.random() * totalScore;
    let selectedEffect = topN[0][0];
    for (const [id, score] of topN) {
      roll -= score;
      if (roll <= 0) { selectedEffect = id; break; }
    }

    const selectedScore = effectScores[selectedEffect] || 1;
    const avgPotency = materials.reduce((s, m) => s + m.potency, 0) / materials.length;
    const baseSuccess = (global.baseSuccessChance || 0.45) * (1 + selectedScore / 20);
    const successChance = Math.min(0.98, baseSuccess);

    // 匹配已存在的配方
    const recipes = this._getRecipes();
    const matchedRecipe = recipes.find(r =>
      r.base === base.id &&
      r.materials.length === materialIds.length &&
      r.materials.every(m => materialIds.includes(m))
    );

    // 基础 tick 数
    const baseTicks = 3 + Math.floor(materials.length / 2);

    return {
      successChance,
      baseTicks,
      effectId: selectedEffect,
      matchedRecipeId: matchedRecipe ? matchedRecipe.id : null
    };
  }

  /**
   * 为实验产物按 effectId 匹配输出物品。
   * 同一 effectId 可能对应多个配方（普通/强效），按材料最高稀有度选择：
   * - 若材料含 legendary/rare 且存在强效配方（minQuality=III），优先强效
   * - 否则取第一个产出该 effectId 的普通配方
   * @returns {{ itemId: string, effectId: string } | null}
   */
  _findExperimentOutput(effectId, materialIds) {
    const recipes = this._getRecipes();
    const candidates = recipes.filter(r => r.output.effectId === effectId);
    if (candidates.length === 0) return null;

    // 评估材料最高稀有度
    const rarityOrder = { common: 0, uncommon: 1, rare: 2, legendary: 3 };
    let maxRarity = 0;
    for (const mid of materialIds) {
      const mat = configRegistry.getAlchemyMaterial(mid);
      if (mat) maxRarity = Math.max(maxRarity, rarityOrder[mat.rarity] || 0);
    }

    // 高稀有度材料 + 存在强效配方 → 产出强效药剂
    if (maxRarity >= 2) {
      const advanced = candidates.find(r => r.output.minQuality === 'III');
      if (advanced) {
        return { itemId: advanced.output.itemId, effectId: advanced.output.effectId };
      }
    }

    // 否则取第一个普通配方
    const normal = candidates.find(r => !r.output.minQuality) || candidates[0];
    return { itemId: normal.output.itemId, effectId: normal.output.effectId };
  }

  // ===== Tick 处理 =====
  _onTick(data) {
    // 推进酿造进度
    if (this._brewingState) {
      this._brewingState.ticksElapsed++;

      // 应用贤者之盐加速：每 tick 多抵扣 1 tick（约提速 50%），保持整数累计
      if (this._salts.philosopher > 0) {
        this._brewingState.ticksElapsed += 1;
      }

      if (this._brewingState.ticksElapsed >= this._brewingState.totalTicks) {
        this._completeBrewing();
      } else {
        this._updateStore();
      }
    }

    // 推进药效持续时间
    this._tickActiveEffects();
  }

  _completeBrewing() {
    const state = this._brewingState;
    this._brewingState = null;
    const global = this._getGlobal();

    // 判定成功/失败
    const qualityThresholds = global.qualityThresholds || { I: 0.45, II: 0.70, III: 0.90 };
    const roll = Math.random();

    // 生命之盐：boost_success —— 成功率 +0.15
    const lifeSaltBonus = this._salts.life > 0 ? 0.15 : 0;
    const effectiveSuccessChance = Math.min(0.99, state.successChance + lifeSaltBonus);

    if (roll > effectiveSuccessChance) {
      // 酿造失败
      this._addXP(Math.floor((global.xpPerBrew || 10) * 0.3));
      this._updateStore();
      eventBus.emit('alchemyBrewFailed', {
        recipeId: state.recipeId,
        reason: '酿造失败——材料未能充分融合'
      });
      return;
    }

    // 确定品质：roll 越小品质越高。
    // 配置中 qualityThresholds 为 0~1 小数（I/II/III），直接比较，不再除以 100。
    // III 门槛最低（roll < III 阈值即最高品质），II 次之，否则 I。
    let quality = 'I';
    if (roll < (qualityThresholds['III'] || 0.90)) quality = 'III';
    else if (roll < (qualityThresholds['II'] || 0.70)) quality = 'II';

    // 应用盐加成
    if (this._salts.moon > 0) {
      quality = this._upgradeQuality(quality);
      this._salts.moon = Math.max(0, this._salts.moon - 100);
    }
    if (this._salts.sun > 0) {
      quality = this._upgradeQuality(quality);
      this._salts.sun = Math.max(0, this._salts.sun - 100);
    }
    // 生命之盐：boost_success —— 提升 15% 成功率（对本次 roll 补偿判定）
    if (this._salts.life > 0) {
      // life 盐已在成败判定阶段提供额外成功区间，这里仅消耗
      this._salts.life = Math.max(0, this._salts.life - 100);
    }

    // 找到输出物品
    let outputItemId = null;
    let effectId = null;
    let minQuality = null;

    if (state.recipeId) {
      const recipe = configRegistry.getAlchemyRecipe(state.recipeId);
      if (recipe) {
        outputItemId = recipe.output.itemId;
        effectId = recipe.output.effectId;
        minQuality = recipe.output.minQuality || null;
      }
    }

    if (!outputItemId && state.matchedEffectId) {
      // 实验产物 —— 按材料最高稀有度匹配对应品质的药剂
      const matchResult = this._findExperimentOutput(state.matchedEffectId, state.materialIds);
      if (matchResult) {
        outputItemId = matchResult.itemId;
        effectId = matchResult.effectId;
      }
    }

    if (!outputItemId) {
      // 找不到匹配产物，给一个随机基础药剂
      outputItemId = 'potion_healing';
      effectId = 'healing';
    }

    // 强效配方（minQuality=III）固定产出 III 级；否则使用酿造判定的 quality
    if (minQuality === 'III') quality = 'III';

    // 产出药剂（携带品质元数据）
    if (this._itemSystem) {
      this._itemSystem.obtain(outputItemId, { quality });
    }

    // 如果是实验且发现了新配方（仅可发现配方 discoverable:true 才计入发现）
    const discoveredRecipe = state.isExperiment && state.recipeId
      ? configRegistry.getAlchemyRecipe(state.recipeId)
      : null;
    if (discoveredRecipe && discoveredRecipe.discoverable !== false
        && !this._discoveredRecipes.has(state.recipeId)) {
      this._discoveredRecipes.add(state.recipeId);
      this._addXP(global.xpPerDiscover || 25);
      eventBus.emit('alchemyRecipeDiscovered', { recipeId: state.recipeId });
    } else {
      this._addXP(global.xpPerBrew || 10);
    }

    this._updateStore();
    eventBus.emit('alchemyBrewComplete', {
      recipeId: state.recipeId,
      itemId: outputItemId,
      effectId,
      quality
    });
  }

  _upgradeQuality(current) {
    if (current === 'I') return 'II';
    if (current === 'II') return 'III';
    return 'III';
  }

  // ===== 经验与等级 =====
  _addXP(amount) {
    this._xp += amount;
    const global = this._getGlobal();
    const table = global.levelXPTable || [];
    const maxLevel = global.maxLevel || 10;

    while (this._level < maxLevel && this._xp >= (table[this._level] || 9999)) {
      this._level++;
      this._updateStore();
      eventBus.emit('alchemyLevelUp', { level: this._level });

      // 检查是否解锁新基底/配方
      const bases = this._getBases().filter(b => b.unlockLevel === this._level);
      if (bases.length > 0) {
        eventBus.emit('combatBroadcast', {
          message: '🧪 炼金等级提升至 ' + this._level + '！解锁基底：' + bases.map(b => b.name).join('、')
        });
      }
    }
  }

  // ===== 药剂使用 =====
  usePotion(instanceId) {
    if (!this._itemSystem) return { valid: false, reason: '物品系统未就绪' };
    const instances = this._itemSystem.getOwnedInstances();
    const inst = instances.find(i => i.instanceId === instanceId);
    if (!inst) return { valid: false, reason: '药剂不存在' };
    if (!inst.consumable) return { valid: false, reason: '该物品不可使用' };

    const itemConfig = configRegistry.getItem(inst.itemId);
    if (!itemConfig || !itemConfig.potionEffect) return { valid: false, reason: '非药剂物品' };

    const effectId = itemConfig.potionEffect.id;
    const effectConfig = configRegistry.getAlchemyEffect(effectId);
    if (!effectConfig) return { valid: false, reason: '效果配置缺失' };

    // 消耗药剂
    this._itemSystem.lose(instanceId);

    // 激活效果：实例品质优先，其次物品模板品质，默认 I
    const instanceQuality = inst.metadata && inst.metadata.quality;
    const quality = instanceQuality || itemConfig.potionEffect.quality || 'I';
    const durationTicks = effectConfig.durationTicks || 8;

    // 品质加成
    const durationMul = quality === 'III' ? 1.5 : quality === 'II' ? 1.25 : 1.0;
    const modifierMul = quality === 'III' ? 1.5 : quality === 'II' ? 1.25 : 1.0;

    // 应用修饰符到效果
    const modifiers = {};
    if (effectConfig.modifiers) {
      for (const [category, mods] of Object.entries(effectConfig.modifiers)) {
        modifiers[category] = {};
        for (const [key, value] of Object.entries(mods)) {
          modifiers[category][key] = typeof value === 'boolean' ? value : value * modifierMul;
        }
      }
    }

    // 不可叠加：移除同类型旧效果
    if (!effectConfig.stackable) {
      this._activeEffects = this._activeEffects.filter(e => e.effectId !== effectId);
    }

    // 瞬时效果（durationTicks=1）：立即生效并过期，不进入持续激活表。
    // 通过 _tickActiveEffects 下一 tick 自然清除（ticksRemaining=1 → 递减为 0 → 过期）。
    this._activeEffects.push({
      effectId,
      quality,
      ticksRemaining: Math.max(1, Math.round(durationTicks * durationMul)),
      modifiers
    });

    this._updateStore();
    eventBus.emit('potionUsed', { instanceId, itemId: inst.itemId, effectId, quality });
    eventBus.emit('combatBroadcast', {
      message: '🧪 使用了 ' + itemConfig.name + (quality !== 'I' ? ' [' + quality + '级]' : '')
    });

    return { valid: true };
  }

  _tickActiveEffects() {
    let changed = false;
    const expired = [];
    this._activeEffects = this._activeEffects.filter(e => {
      e.ticksRemaining--;
      if (e.ticksRemaining <= 0) {
        changed = true;
        expired.push({ effectId: e.effectId, quality: e.quality });
        return false;
      }
      return true;
    });
    // 通知过期（与 AGENT.md 中 potionEffectExpired 事件契约一致）
    for (const e of expired) {
      eventBus.emit('potionEffectExpired', { effectId: e.effectId, quality: e.quality });
    }
    if (changed) this._updateStore();
  }

  /**
   * 聚合所有当前激活的药效修饰符
   * @returns {Object} 效果修饰符聚合
   */
  getEffects() {
    const result = {};
    for (const active of this._activeEffects) {
      for (const [category, mods] of Object.entries(active.modifiers)) {
        if (!result[category]) result[category] = {};
        for (const [key, value] of Object.entries(mods)) {
          if (typeof value === 'boolean') {
            result[category][key] = value;
          } else {
            result[category][key] = (result[category][key] || 1) * value;
          }
        }
      }
    }
    return result;
  }

  // ===== 盐管理 =====
  addSalt(type, amount) {
    if (!this._salts.hasOwnProperty(type)) return false;
    this._salts[type] += amount;
    this._updateStore();
    return true;
  }

  useSalt(type, amount) {
    if (!this._salts.hasOwnProperty(type)) return { valid: false, reason: '未知盐类型' };
    if (this._salts[type] < amount) return { valid: false, reason: '盐不足' };
    this._salts[type] -= amount;
    this._updateStore();
    return { valid: true };
  }

  // ===== 伟大工作 =====
  _canPerformMagnumOpus(stage) {
    if (stage.order === 1 && this._magnumOpusStage !== 'none') return false;
    if (stage.order > 1) {
      const prevStage = this._getMagnumOpus().find(s => s.order === stage.order - 1);
      if (!prevStage || this._magnumOpusStage !== prevStage.stage) return false;
    }
    if (this._level < stage.requiredLevel) return false;
    if (stage.requiredRecipes) {
      const availableIds = this.getAvailableRecipes().map(r => r.id);
      if (!stage.requiredRecipes.every(id => availableIds.includes(id) || this._discoveredRecipes.has(id))) return false;
    }
    if (stage.requirePreviousStage && stage.inputItemId && this._itemSystem) {
      if (!this._itemSystem.isOwned(stage.inputItemId)) return false;
    }
    if (stage.consumeMaterials) {
      if (!this.canAffordMaterials(stage.consumeMaterials)) return false;
    }
    return true;
  }

  performMagnumOpus(stageName) {
    const stage = this._getMagnumOpus().find(s => s.stage === stageName);
    if (!stage) return { valid: false, reason: '未知阶段' };
    if (!this._canPerformMagnumOpus(stage)) return { valid: false, reason: '条件不满足' };

    // 消耗材料
    for (const id of (stage.consumeMaterials || [])) {
      this.consumeMaterial(id, 1);
    }

    // 消耗上一阶段产物
    if (stage.requirePreviousStage && stage.inputItemId && this._itemSystem) {
      const instances = this._itemSystem.getOwnedInstances();
      const target = instances.find(i => i.itemId === stage.inputItemId);
      if (target) this._itemSystem.lose(target.instanceId);
    }

    // 产出
    if (stage.outputItemId && this._itemSystem) {
      this._itemSystem.obtain(stage.outputItemId);
    }

    // 推进
    this._magnumOpusStage = stage.stage;
    const global = this._getGlobal();
    this._addXP(stage.xpReward || (global.xpPerMagnumOpus || 100));

    // 完成伟大工作阶段时奖励对应炼金盐
    this._rewardSaltForStage(stage);

    this._updateStore();
    eventBus.emit('alchemyMagnumOpusProgress', { stage: stage.stage, name: stage.name });
    eventBus.emit('combatBroadcast', {
      message: '🔮 伟大工作推进：' + stage.name + ' —— ' + stage.description
    });

    return { valid: true };
  }

  /**
   * 完成伟大工作阶段时奖励对应解锁的炼金盐。
   * 盐配置 unlockStage 与阶段 stage 对应；奖励量按配置描述（每瓶含 500/1000 粒）。
   */
  _rewardSaltForStage(stage) {
    const saltConfigs = this._getSalts();
    for (const sc of saltConfigs) {
      if (sc.unlockStage === stage.stage) {
        const key = sc.id.replace('_salt', '');
        const amount = (sc.id === 'void_salt' || sc.id === 'philosopher_salt') ? 500 : 1000;
        this.addSalt(key, amount);
      }
    }
  }

  // ===== Store 更新 =====
  _updateStore() {
    store.setState({
      alchemyLevel: this._level,
      alchemyXP: this._xp,
      alchemyBrewing: this._brewingState ? { ...this._brewingState } : null,
      alchemyMagnumOpus: this._magnumOpusStage,
      alchemyActiveEffects: this._activeEffects.length,
      alchemyVersion: Date.now()
    });
  }

  // ===== 存档接口 =====
  getState() {
    return {
      level: this._level,
      xp: this._xp,
      materialStock: { ...this._materialStock },
      discoveredRecipes: [...this._discoveredRecipes],
      brewingState: this._brewingState ? { ...this._brewingState } : null,
      salts: { ...this._salts },
      magnumOpusStage: this._magnumOpusStage,
      activeEffects: this._activeEffects.map(e => ({ ...e }))
    };
  }

  restoreState(state) {
    if (!state) return;
    this._level = state.level || 1;
    this._xp = state.xp || 0;
    this._materialStock = state.materialStock || {};
    this._discoveredRecipes = new Set(state.discoveredRecipes || []);
    this._brewingState = state.brewingState || null;
    this._salts = state.salts || { void: 0, moon: 0, sun: 0, life: 0, philosopher: 0 };
    this._magnumOpusStage = state.magnumOpusStage || 'none';
    this._activeEffects = state.activeEffects || [];
    this._updateStore();
  }
}
