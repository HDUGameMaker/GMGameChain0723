/**
 * SpellSystem - 炼金法术系统（消耗品法术 + 成长树）
 *
 * 设计要点（见 .claude/plans/alchemy-spell-system.md）：
 * - 炼金子菜单生产"消耗品法术"：花四基础资源 craft 一个法术实例（含 charges 次充能）。
 * - 法术是消耗品：进入施法模式 -> 点地图 -> 区域生效（范围+持续+扣 1 充能）。
 * - 增益法术：区域内生产建筑 efficiencyMul ×N，连乘进 BuildingSystem 产出链。
 * - 减益法术：区域内敌人强度↓ / 扩张倒计时冻结，注入 EnemyExpansionSystem。
 * - 炼金树（spellTree）解锁/强化法术，节点花四资源解锁。
 *
 * 旧 AlchemySystem 的酿造/药水/盐/Magnum Opus/amp 保留休眠（代码不删），本系统是其重定位。
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';

export class SpellSystem {
  constructor() {
    /** @type {Set<string>} 已解锁的树节点 id */
    this._unlockedNodes = new Set();
    /** @type {Array<{instanceId:string, spellId:string, charges:number}>} 法术消耗品库存 */
    this._inventory = [];
    /** @type {{instanceId:string, spellId:string}|null} 当前施法模式选中的实例 */
    this._casting = null;
    /** @type {Array<{id:string, spellId:string, type:string, name:string, cx:number, cy:number, radius:number, ticksRemaining:number, effect:Object}>} 活跃法术区域 */
    this._activeZones = [];

    this._nextInstanceId = 0;
    this._nextZoneId = 0;

    // 依赖
    this._resourceSystem = null;
    this._buildingSystem = null;
    this._enemyExpansionSystem = null;
    this._mapConfig = null;

    // tick 推进区域持续时间
    eventBus.on('tick', () => this._onTick());
  }

  setResourceSystem(rs) { this._resourceSystem = rs; }
  setBuildingSystem(bs) { this._buildingSystem = bs; }
  setEnemyExpansionSystem(es) { this._enemyExpansionSystem = es; }

  /** 装配阶段调用一次 */
  init() {
    this._mapConfig = configRegistry.get('map');
  }

  /** 新游戏：重置 */
  initNew() {
    if (!this._mapConfig) this.init();
    this._unlockedNodes = new Set();
    this._inventory = [];
    this._casting = null;
    this._activeZones = [];
    this._nextInstanceId = 0;
    this._nextZoneId = 0;
    store.setState({ spellCasting: false });
    this._updateStore();
  }

  // ===== 配置读取 =====
  getSpellTree() { return configRegistry.getSpellTree(); }
  getSpellDefs() { return configRegistry.getSpellDefs(); }
  getSpellDef(id) { return configRegistry.getSpellDef(id); }

  // ===== 树 =====
  getUnlockedNodes() { return [...this._unlockedNodes]; }
  isNodeUnlocked(id) { return this._unlockedNodes.has(id); }

  /** 节点是否可解锁（未解锁 + 前置全满足） */
  canUnlockNode(id) {
    const node = this.getSpellTree().find(n => n.id === id);
    if (!node) return { valid: false, reason: '节点不存在' };
    if (this._unlockedNodes.has(id)) return { valid: false, reason: '已解锁' };
    const prereqs = Array.isArray(node.prerequisites) ? node.prerequisites : [];
    for (const p of prereqs) {
      if (!this._unlockedNodes.has(p)) return { valid: false, reason: '前置未解锁' };
    }
    return { valid: true, node };
  }

  /** 节点资源是否足够 */
  canAffordNode(node) {
    if (!this._resourceSystem) return false;
    return this._resourceSystem.canAfford(node.cost || []);
  }

  /** 法术生产资源是否足够 */
  canAffordSpell(spell) {
    if (!this._resourceSystem) return false;
    return this._resourceSystem.canAfford(spell?.craftCost || []);
  }

  /** 解锁树节点（消耗四资源） */
  unlockNode(id) {
    const check = this.canUnlockNode(id);
    if (!check.valid) {
      eventBus.emit('combatBroadcast', { message: '⛔ ' + check.reason });
      return false;
    }
    const node = check.node;
    if (!this.canAffordNode(node)) {
      eventBus.emit('combatBroadcast', { message: '💰 资源不足' });
      return false;
    }
    this._resourceSystem.consumeAll(node.cost || []);
    this._unlockedNodes.add(id);
    this._updateStore();
    eventBus.emit('spellTreeChanged');
    eventBus.emit('combatBroadcast', { message: '🌳 解锁炼金节点：' + node.name });
    return true;
  }

  // ===== 生产（craft 消耗品） =====
  /** 当前可生产的法术（requiredTreeNode 已解锁） */
  getCraftableSpells() {
    return this.getSpellDefs().filter(s => this._unlockedNodes.has(s.requiredTreeNode));
  }

  /** 生产一个法术消耗品（消耗 craftCost） */
  craftSpell(spellId) {
    const def = this.getSpellDef(spellId);
    if (!def) return { valid: false, reason: '未知法术' };
    if (!this._unlockedNodes.has(def.requiredTreeNode)) {
      return { valid: false, reason: '未解锁' };
    }
    if (!this._resourceSystem || !this._resourceSystem.canAfford(def.craftCost || [])) {
      return { valid: false, reason: '资源不足' };
    }
    this._resourceSystem.consumeAll(def.craftCost || []);
    this._nextInstanceId++;
    this._inventory.push({
      instanceId: `spell_${spellId}_${this._nextInstanceId}`,
      spellId,
      charges: def.chargesPerCraft || 1
    });
    this._updateStore();
    eventBus.emit('spellInventoryChanged');
    eventBus.emit('combatBroadcast', { message: `🜂 炼成法术：${def.name} ×${def.chargesPerCraft || 1}` });
    return { valid: true };
  }

  // ===== 库存 =====
  getInventory() {
    return this._inventory.map(i => {
      const def = this.getSpellDef(i.spellId);
      return {
        instanceId: i.instanceId,
        spellId: i.spellId,
        name: def ? def.name : i.spellId,
        charges: i.charges,
        def
      };
    });
  }

  // ===== 施法模式（沿用占术范式） =====
  enterCastingMode(instanceId) {
    const inst = this._inventory.find(i => i.instanceId === instanceId);
    if (!inst || inst.charges <= 0) {
      eventBus.emit('combatBroadcast', { message: '⛔ 无可用充能' });
      return false;
    }
    // 退出其他互斥模式
    this._buildingSystem?.exitPlacingMode?.();
    this._casting = { instanceId: inst.instanceId, spellId: inst.spellId };
    store.setState({ spellCasting: true });
    eventBus.emit('spellCastingModeChanged', { enabled: true });
    return true;
  }

  exitCastingMode() {
    this._casting = null;
    store.setState({ spellCasting: false });
    eventBus.emit('spellCastingModeChanged', { enabled: false });
  }

  isCastingMode() { return this._casting !== null; }
  getActiveSpell() {
    if (!this._casting) return null;
    const def = this.getSpellDef(this._casting.spellId);
    return { ...this._casting, def };
  }

  _inBounds(x, y) {
    if (!this._mapConfig) return false;
    return x >= 0 && y >= 0 && x < this._mapConfig.gridWidth && y < this._mapConfig.gridHeight;
  }

  /** 在 (x,y) 施法：创建活跃区域 + 扣 1 充能 */
  castAt(x, y) {
    if (!this._casting) return false;
    if (!this._inBounds(x, y)) {
      eventBus.emit('combatBroadcast', { message: '⛔ 超出地图' });
      return false;
    }
    const def = this.getSpellDef(this._casting.spellId);
    if (!def) return false;

    // 创建活跃区域
    this._nextZoneId++;
    this._activeZones.push({
      id: `zone_${this._nextZoneId}`,
      spellId: def.id,
      type: def.type,
      name: def.name,
      cx: x,
      cy: y,
      radius: def.areaRadius || 0,
      ticksRemaining: def.durationTicks || 1,
      effect: { ...(def.effect || {}) }
    });

    // 扣 1 充能
    const inst = this._inventory.find(i => i.instanceId === this._casting.instanceId);
    if (inst) {
      inst.charges -= 1;
      if (inst.charges <= 0) {
        this._inventory = this._inventory.filter(i => i.instanceId !== inst.instanceId);
        this.exitCastingMode(); // 充能耗尽，退出施法模式
      }
    }

    this._updateStore();
    eventBus.emit('spellZonesChanged');
    eventBus.emit('spellInventoryChanged');
    eventBus.emit('combatBroadcast', {
      message: `✨ 施放 ${def.name}` + (def.areaRadius > 0 ? `（${def.areaRadius}格半径）` : '（全域）')
    });
    return true;
  }

  // ===== 活跃区域查询 =====
  getActiveZones() {
    return this._activeZones.map(z => ({ ...z, effect: { ...z.effect } }));
  }

  /** 建筑是否落在半径区域内（矩形 footprint 与扩张后的区域 bbox 相交） */
  _buildingInZone(building, zone) {
    if (zone.radius <= 0) return false; // radius<=0 表示全域，由 globalEfficiencyMul 单独处理
    const cfg = configRegistry.getBuilding(building.buildingId);
    if (!cfg) return false;
    const w = cfg.footprint.width;
    const h = cfg.footprint.height;
    const bx0 = building.gridX, bx1 = building.gridX + w - 1;
    const by0 = building.gridY, by1 = building.gridY + h - 1;
    const zx0 = zone.cx - zone.radius, zx1 = zone.cx + zone.radius;
    const zy0 = zone.cy - zone.radius, zy1 = zone.cy + zone.radius;
    return bx0 <= zx1 && bx1 >= zx0 && by0 <= zy1 && by1 >= zy0;
  }

  /**
   * 建筑当前的法术效率乘数（连乘所有覆盖它的 buff 区域）。
   * 被 BuildingSystem._getProductionMultiplier 调用，叠入产出链。
   */
  getBuildingEfficiencyMul(building) {
    if (!building || this._activeZones.length === 0) return 1;
    let mul = 1;
    for (const zone of this._activeZones) {
      if (zone.type !== 'buff') continue;
      const eff = zone.effect || {};
      if (eff.globalEfficiencyMul) {
        mul *= eff.globalEfficiencyMul; // 全域法术对所有建筑生效
      } else if (eff.efficiencyMul && this._buildingInZone(building, zone)) {
        mul *= eff.efficiencyMul;
      }
    }
    return mul;
  }

  /** 覆盖 (x,y) 的减益区域 strengthPenalty 之和 */
  getStrengthPenaltyAt(x, y) {
    if (this._activeZones.length === 0) return 0;
    let pen = 0;
    for (const zone of this._activeZones) {
      if (zone.type !== 'debuff') continue;
      if (!(zone.effect || {}).strengthPenalty) continue;
      const dist = Math.max(Math.abs(x - zone.cx), Math.abs(y - zone.cy));
      if (dist <= zone.radius) pen += zone.effect.strengthPenalty;
    }
    return pen;
  }

  /** 该格是否在任一 freezeCountdown 区域内 */
  isCountdownFrozen(x, y) {
    if (this._activeZones.length === 0) return false;
    for (const zone of this._activeZones) {
      if (zone.type !== 'debuff') continue;
      if (!(zone.effect || {}).freezeCountdown) continue;
      const dist = Math.max(Math.abs(x - zone.cx), Math.abs(y - zone.cy));
      if (dist <= zone.radius) return true;
    }
    return false;
  }

  // ===== Tick =====
  _onTick() {
    if (this._activeZones.length === 0) return;
    let changed = false;
    const expired = [];
    this._activeZones = this._activeZones.filter(z => {
      z.ticksRemaining -= 1;
      if (z.ticksRemaining <= 0) {
        changed = true;
        expired.push(z);
        return false;
      }
      return true;
    });
    if (changed) {
      for (const z of expired) {
        eventBus.emit('combatBroadcast', { message: `🌫️ ${z.name} 效果结束` });
      }
      this._updateStore();
      eventBus.emit('spellZonesChanged');
    }
  }

  // ===== Store =====
  _updateStore() {
    const casting = this.getActiveSpell();
    store.setState({
      spellUnlockedCount: this._unlockedNodes.size,
      spellInventoryCount: this._inventory.length,
      spellActiveZones: this._activeZones.length,
      spellCasting: this._casting !== null,
      spellCastingName: casting ? casting.def?.name : null,
      spellVersion: Date.now()
    });
  }

  // ===== 存档 =====
  getState() {
    return {
      unlockedNodes: [...this._unlockedNodes],
      inventory: this._inventory.map(i => ({ ...i })),
      activeZones: this._activeZones.map(z => ({ ...z, effect: { ...z.effect } })),
      nextInstanceId: this._nextInstanceId,
      nextZoneId: this._nextZoneId
    };
  }

  restoreState(state) {
    if (!this._mapConfig) this.init();
    if (!state) { this.initNew(); return; }
    this._unlockedNodes = new Set(state.unlockedNodes || []);
    this._inventory = (state.inventory || []).map(i => ({ ...i }));
    this._activeZones = (state.activeZones || []).map(z => ({ ...z, effect: { ...(z.effect || {}) } }));
    this._nextInstanceId = state.nextInstanceId || 0;
    this._nextZoneId = state.nextZoneId || 0;
    this._casting = null;
    store.setState({ spellCasting: false });
    this._updateStore();
  }
}
