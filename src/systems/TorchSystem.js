/**
 * TorchSystem - 火把系统
 * 管理火把的运行时状态、燃料消耗、升级、可见性计算
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';
import { euclideanDistance } from '../utils/gridUtils.js';

export class TorchSystem {
  constructor() {
    /** @type {Array<{id: number, torchId: string, gridX: number, gridY: number, lit: boolean, fuel: number, upgrading: boolean, upgradeProgress: number|null}>} */
    this.torches = [];
    this._resourceSystem = null;
    this._buildingSystem = null;
    this._mapConfig = null;
    /** @type {Map<string, object>} torchId → config cache */
    this._torchConfigMap = new Map();

    // 永夜迷雾模式：开启后建筑放置/移动必须在火把可见范围内（localStorage 持久化）
    this._darknessMode = false;
    try {
      this._darknessMode = localStorage.getItem('gmgc_darkness_mode') === '1';
    } catch (e) { /* ignore */ }

    // 监听 tick 和 periodEnd 事件
    eventBus.on('tick', (data) => this.onTick(data));
    eventBus.on('periodEnd', (data) => this.onPeriodEnd(data));

    // 监听 BuildingSystem 升级事件（火把升级统一走 BuildingSystem）
    eventBus.on('buildingUpgraded', (data) => this.onBuildingUpgraded(data));
    eventBus.on('buildingComplete', (data) => this.onBuildingComplete(data));
  }

  /**
   * 注入资源系统引用
   * @param {object} rs - ResourceSystem 实例
   */
  setResourceSystem(rs) {
    this._resourceSystem = rs;
  }

  /**
   * 注入建筑系统引用
   * @param {object} bs - BuildingSystem 实例
   */
  setBuildingSystem(bs) {
    this._buildingSystem = bs;
  }

  /**
   * 初始化：加载 map config 和 torch config（从 buildings.json 中筛选 isTorch 条目）
   */
  init() {
    this._mapConfig = configRegistry.get('map');
    // 从 buildings.json 中筛选火把类型配置
    const buildings = configRegistry.get('buildings') || [];
    this._torchConfigMap.clear();
    for (const cfg of buildings) {
      if (cfg.isTorch) {
        this._torchConfigMap.set(cfg.id, cfg);
      }
    }
    console.log('[TorchSystem] Loaded torch configs from buildings.json:', [...this._torchConfigMap.keys()]);
  }

  /**
   * 从 BuildingSystem 中扫描火把建筑，创建运行时火把条目（新游戏 + 旧存档回退）
   */
  initFromConfig() {
    if (!this._buildingSystem) {
      console.warn('[TorchSystem] BuildingSystem not set, skipping initFromConfig');
      this.torches = [];
      this._notifyChange();
      return;
    }
    const buildings = this._buildingSystem.buildings;
    this.torches = [];
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      const cfg = this._torchConfigMap.get(b.buildingId);
      if (!cfg || !cfg.isTorch) continue;
      const isEternal = cfg.torchType === 'eternal';
      this.torches.push({
        id: this.torches.length,
        torchId: b.buildingId,
        gridX: b.gridX,
        gridY: b.gridY,
        lit: isEternal,                // eternal 初始即点燃
        fuel: isEternal ? Infinity : 0,
        upgrading: false,
        upgradeProgress: null
      });
    }
    this._notifyChange();
    console.log('[TorchSystem] Initialized', this.torches.length, 'torches from buildings');
  }

  /**
   * 建筑建造完成回调：处理火把新建（创建运行时条目）和升级完成（清理 upgrading 标记）
   * 支持两种调用方式：
   *   - EventBus: onBuildingComplete({ building })
   *   - main.js 直接调用: onBuildingComplete(buildingIndex, building) [兼容保留]
   */
  onBuildingComplete(buildingIndexOrEvent, buildingArg) {
    // 兼容两种调用签名
    const building = buildingArg !== undefined ? buildingArg : buildingIndexOrEvent?.building;
    if (!building) return;

    const cfg = this._torchConfigMap.get(building.buildingId);
    if (!cfg || !cfg.isTorch) return;

    // 检查是否已存在该位置的 torch
    const existingIdx = this.getTorchAt(building.gridX, building.gridY);
    if (existingIdx >= 0) {
      // 升级完成：清理 upgrading 标记
      const torch = this.torches[existingIdx];
      const wasUpgrading = torch.upgrading;
      torch.upgrading = false;
      torch.upgradeProgress = null;
      // 确保 torchId 与 building 同步
      if (torch.torchId !== building.buildingId) {
        torch.torchId = building.buildingId;
      }
      if (cfg.torchType === 'eternal') {
        torch.fuel = Infinity;
        torch.lit = true;
      }
      if (wasUpgrading) {
        eventBus.emit('torchUpgraded', { torchIndex: existingIdx, torch });
      }
      this._notifyChange();
      return;
    }

    // 新建火把：创建运行时条目
    const isEternal = cfg.torchType === 'eternal';
    this.torches.push({
      id: this.torches.length,
      torchId: building.buildingId,
      gridX: building.gridX,
      gridY: building.gridY,
      lit: isEternal,
      fuel: isEternal ? Infinity : 0,
      upgrading: false,
      upgradeProgress: null
    });
    this._notifyChange();
    console.log('[TorchSystem] Torch created for building', building.buildingId, 'at', building.gridX, building.gridY);
  }

  /**
   * 同步火把条目：移除所有在 BuildingSystem 中没有对应建筑的火把
   * 在建筑被拆除后调用，清理孤儿火把条目
   */
  syncFromBuildings() {
    if (!this._buildingSystem) return;
    const buildings = this._buildingSystem.buildings;
    let removed = false;
    for (let i = this.torches.length - 1; i >= 0; i--) {
      const t = this.torches[i];
      const found = buildings.some(
        b => b.gridX === t.gridX && b.gridY === t.gridY && b.buildingId === t.torchId
      );
      if (!found) {
        this.torches.splice(i, 1);
        removed = true;
      }
    }
    if (removed) {
      // 重新分配 id
      for (let i = 0; i < this.torches.length; i++) {
        this.torches[i].id = i;
      }
      this._notifyChange();
      console.log('[TorchSystem] Synced - removed orphaned torches');
    }
  }

  /**
   * 建筑移动回调：更新火把位置
   */
  onBuildingMoved(buildingIndex, newGridX, newGridY) {
    const building = this._buildingSystem?.buildings[buildingIndex];
    if (!building) return;
    const cfg = this._torchConfigMap.get(building.buildingId);
    if (!cfg || !cfg.isTorch) return;
    // 通过旧位置找到 torch 并更新
    // （buildingMoved 在位置更新后发出，所以需要反向查找）
    for (const torch of this.torches) {
      if (torch.torchId === building.buildingId
          && torch.gridX === newGridX && torch.gridY === newGridY) {
        // 已更新，无需操作
        return;
      }
    }
    // 没有找到匹配的，尝试通过 buildingIndex 匹配（需要在 torch 中存储 buildingIndex）
    // 简化方案：遍历所有 torch，找位置不匹配的
    for (const torch of this.torches) {
      // 如果这个 torch 的 buildingId 匹配但位置不匹配
      const bldg = this._buildingSystem.buildings.find(b =>
        b.gridX === torch.gridX && b.gridY === torch.gridY && b.buildingId === torch.torchId
      );
      if (!bldg) {
        // 该 torch 对应的建筑已不在原位，更新到新位置
        torch.gridX = newGridX;
        torch.gridY = newGridY;
        this._notifyChange();
        console.log('[TorchSystem] Torch moved to', newGridX, newGridY);
        return;
      }
    }
  }

  // ===== 查询 API =====

  /**
   * 获取所有火把运行时状态
   */
  getAll() {
    return this.torches;
  }

  /**
   * 获取已点燃的火把列表
   */
  getLitTorches() {
    return this.torches.filter(t => t.lit);
  }

  /**
   * 获取指定格子的火把索引
   * @returns {number} 火把索引，-1 表示没有
   */
  getTorchAt(col, row) {
    for (let i = 0; i < this.torches.length; i++) {
      const t = this.torches[i];
      if (t.gridX === col && t.gridY === row) return i;
    }
    return -1;
  }

  /**
   * 获取火把的配置数据
   */
  getTorchConfig(torchId) {
    return this._torchConfigMap.get(torchId) || null;
  }

  /**
   * 计算可见性矩阵
   * @returns {boolean[][]} [row][col] 是否可见
   */
  getVisibilityMatrix() {
    const { gridWidth, gridHeight } = this._mapConfig;
    const visible = Array.from({ length: gridHeight }, () => Array(gridWidth).fill(false));

    for (const torch of this.torches) {
      if (!torch.lit) continue;
      const cfg = this._torchConfigMap.get(torch.torchId);
      if (!cfg) continue;
      const radius = cfg.radius;

      // 火把占有 1 格，照明中心在 (gridX + 0.5, gridY + 0.5)
      const tcx = torch.gridX + 0.5;
      const tcy = torch.gridY + 0.5;

      for (let row = 0; row < gridHeight; row++) {
        for (let col = 0; col < gridWidth; col++) {
          if (visible[row][col]) continue; // 已被其他火把照亮
          const dx = (col + 0.5) - tcx;
          const dy = (row + 0.5) - tcy;
          if (Math.sqrt(dx * dx + dy * dy) <= radius) {
            visible[row][col] = true;
          }
        }
      }
    }

    return visible;
  }

  /**
   * 格子是否可交互（是否可见）
   */
  canInteract(col, row) {
    const matrix = this.getVisibilityMatrix();
    if (row < 0 || row >= matrix.length) return false;
    if (col < 0 || col >= matrix[0].length) return false;
    return matrix[row][col];
  }

  /**
   * 建筑区域是否全部可见
   * @param {number} gridX - 建筑左上角 X
   * @param {number} gridY - 建筑左上角 Y
   * @param {number} w - 建筑宽度（格子数）
   * @param {number} h - 建筑高度（格子数）
   * @returns {boolean}
   */
  canBuild(gridX, gridY, w, h) {
    // 非永夜迷雾模式下，火把系统不限制建造（全图可建）
    if (!this._darknessMode) return true;
    for (let r = gridY; r < gridY + h; r++) {
      for (let c = gridX; c < gridX + w; c++) {
        if (!this.canInteract(c, r)) return false;
      }
    }
    return true;
  }

  // ===== 永夜迷雾模式 =====

  /** 是否开启永夜迷雾模式 */
  isDarknessMode() {
    return this._darknessMode;
  }

  /** 设置永夜迷雾模式（开启后建筑放置/移动必须在火把可见范围内） */
  setDarknessMode(enabled) {
    const next = !!enabled;
    if (next === this._darknessMode) return;
    this._darknessMode = next;
    try { localStorage.setItem('gmgc_darkness_mode', next ? '1' : '0'); } catch (e) { /* ignore */ }
    eventBus.emit('darknessModeToggled', { enabled: next });
  }

  // ===== 与 BuildingSystem 升级桥接 =====

  /**
   * BuildingSystem 升级事件：火把建筑的 buildingId 已被 BuildingSystem 改为目标 ID，
   * 此处同步更新 TorchSystem 中的 torchId 并标记升级中
   */
  onBuildingUpgraded({ building }) {
    const cfg = this._torchConfigMap.get(building.buildingId);
    if (!cfg || !cfg.isTorch) return;

    // 通过位置找到对应的火把运行时条目，更新 torchId
    for (const torch of this.torches) {
      if (torch.gridX === building.gridX && torch.gridY === building.gridY) {
        torch.torchId = building.buildingId;
        torch.upgrading = true;
        torch.upgradeProgress = null; // 进度由 BuildingSystem.buildProgress 管理
        this._notifyChange();
        return;
      }
    }
  }

  // ===== 操作 API =====

  /**
   * 检查是否可以点燃火把
   */
  canLightTorch(index) {
    const torch = this.torches[index];
    if (!torch) return { valid: false, reason: '火把不存在' };
    if (torch.lit) return { valid: false, reason: '火把已点燃' };
    if (torch.upgrading) return { valid: false, reason: '火把正在升级中' };

    const cfg = this._torchConfigMap.get(torch.torchId);
    if (!cfg) return { valid: false, reason: '火把配置不存在' };
    if (cfg.torchType === 'eternal') return { valid: false, reason: '永恒火把无需点燃' };

    const lightCost = cfg.lightCost || [];
    if (lightCost.length > 0 && !this._resourceSystem.canAfford(lightCost)) {
      return { valid: false, reason: '煤炭不足' };
    }

    return { valid: true, cost: lightCost };
  }

  /**
   * 点燃火把
   */
  lightTorch(index) {
    const check = this.canLightTorch(index);
    if (!check.valid) return false;

    const torch = this.torches[index];
    const cfg = this._torchConfigMap.get(torch.torchId);

    // 消耗点燃资源
    const lightCost = cfg.lightCost || [];
    if (lightCost.length > 0) {
      if (!this._resourceSystem.consumeAll(lightCost)) return false;
    }

    torch.lit = true;
    torch.fuel = cfg.coalBuffer; // 填充初始燃料

    this._notifyChange();
    eventBus.emit('torchLit', { torchIndex: index, torch });
    return true;
  }

  /**
   * 添加燃料到已点燃的火把
   * @param {number} index - 火把索引
   * @param {number} [amount] - 添加的煤炭量，默认从配置读取 lightCost
   */
  addFuel(index, amount) {
    const torch = this.torches[index];
    if (!torch) return false;
    if (!torch.lit) return false;
    if (torch.upgrading) return false;

    const cfg = this._torchConfigMap.get(torch.torchId);
    if (!cfg || cfg.torchType === 'eternal') return false;

    const addAmount = amount || (cfg.lightCost?.[0]?.amount || 5);
    if (!this._resourceSystem.tryConsume('coal', addAmount)) return false;

    torch.fuel += addAmount;
    this._notifyChange();
    eventBus.emit('torchFuelAdded', { torchIndex: index, torch });
    return true;
  }

  /**
   * 熄灭指定火把（内部调用或手动熄灭）
   */
  _extinguishTorch(index) {
    const torch = this.torches[index];
    if (!torch || !torch.lit) return;
    torch.lit = false;
    torch.fuel = 0;
    this._notifyChange();
    eventBus.emit('torchExtinguished', { torchIndex: index, torch });
  }

  // ===== Tick / Period 处理 =====

  /**
   * 每个 tick：火把升级进度由 BuildingSystem 统一管理，此处不再处理
   */
  onTick(data) {
    // 升级进度已移交 BuildingSystem.upgradeBuilding() 统一处理
  }

  /**
   * 每个 period 结束：处理燃料消耗
   */
  onPeriodEnd(data) {
    let visibilityChanged = false;

    for (const torch of this.torches) {
      // 永恒火把 → 永远亮着，不消耗
      if (!torch.lit) continue;

      const cfg = this._torchConfigMap.get(torch.torchId);
      if (!cfg) continue;
      if (cfg.torchType === 'eternal') continue;

      // 消耗燃料
      const consumption = cfg.coalPerPeriod || 0;
      torch.fuel -= consumption;

      if (torch.fuel <= 0) {
        torch.lit = false;
        torch.fuel = 0;
        visibilityChanged = true;
        eventBus.emit('torchExtinguished', { torchIndex: this.torches.indexOf(torch), torch });
      }
    }

    if (visibilityChanged) {
      this._notifyChange();
    }
  }

  // ===== 内部方法 =====

  /**
   * 通知状态变化（Store + EventBus）
   */
  _notifyChange() {
    store.setState({ torchVersion: Date.now() });
    eventBus.emit('torchStateChanged', {});
  }

  // ===== 存档接口 =====

  /**
   * 序列化所有火把状态
   */
  getAllStates() {
    return this.torches.map(t => ({
      torchId: t.torchId,
      gridX: t.gridX,
      gridY: t.gridY,
      lit: t.lit,
      fuel: t.fuel === Infinity ? -1 : t.fuel, // Infinity 不可序列化，用 -1 标记
      upgrading: t.upgrading,
      upgradeProgress: t.upgradeProgress
    }));
  }

  /**
   * 从存档恢复火把状态
   */
  restoreState(states) {
    if (!states || !Array.isArray(states)) {
      // 旧存档没有火把数据 → 从 map config 初始化
      this.initFromConfig();
      return;
    }

    this.torches = states.map((s, i) => ({
      id: i,
      torchId: s.torchId,
      gridX: s.gridX,
      gridY: s.gridY,
      lit: s.lit,
      fuel: s.fuel === -1 ? Infinity : (s.fuel || 0), // -1 → Infinity
      upgrading: s.upgrading || false,
      upgradeProgress: s.upgradeProgress || null
    }));

    this._notifyChange();
  }
}
