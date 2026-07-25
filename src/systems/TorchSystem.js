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
    this._mapConfig = null;
    /** @type {Map<string, object>} torchId → config cache */
    this._torchConfigMap = new Map();

    // 监听 tick 和 periodEnd 事件
    eventBus.on('tick', (data) => this.onTick(data));
    eventBus.on('periodEnd', (data) => this.onPeriodEnd(data));
  }

  /**
   * 注入资源系统引用
   * @param {object} rs - ResourceSystem 实例
   */
  setResourceSystem(rs) {
    this._resourceSystem = rs;
  }

  /**
   * 初始化：加载 map config 和 torch config
   */
  init() {
    this._mapConfig = configRegistry.get('map');
    // 缓存火把配置到 Map
    const torchConfigs = configRegistry.get('torches') || [];
    for (const cfg of torchConfigs) {
      this._torchConfigMap.set(cfg.id, cfg);
    }
  }

  /**
   * 从 map config 初始化火把（新游戏）
   */
  initFromConfig() {
    const mapConfig = this._mapConfig || configRegistry.get('map');
    const initialTorches = mapConfig?.initialTorches || [];
    this.torches = initialTorches.map((t, i) => {
      const cfg = this._torchConfigMap.get(t.torchId);
      const isEternal = cfg?.type === 'eternal';
      return {
        id: i,
        torchId: t.torchId,
        gridX: t.gridX,
        gridY: t.gridY,
        lit: isEternal,                // eternal 初始即点燃
        fuel: isEternal ? Infinity : 0, // eternal 无限燃料
        upgrading: false,
        upgradeProgress: null
      };
    });
    this._notifyChange();
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
    for (let r = gridY; r < gridY + h; r++) {
      for (let c = gridX; c < gridX + w; c++) {
        if (!this.canInteract(c, r)) return false;
      }
    }
    return true;
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
    if (cfg.type === 'eternal') return { valid: false, reason: '永恒火把无需点燃' };

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
   * 检查是否可以升级火把
   */
  canUpgradeTorch(index) {
    const torch = this.torches[index];
    if (!torch) return { valid: false, reason: '火把不存在' };
    if (torch.upgrading) return { valid: false, reason: '正在升级中' };

    const cfg = this._torchConfigMap.get(torch.torchId);
    if (!cfg) return { valid: false, reason: '火把配置不存在' };
    if (!cfg.upgradesTo) return { valid: false, reason: '已是最高等级' };

    const upgradeCost = cfg.upgradeCost || [];
    if (upgradeCost.length > 0 && !this._resourceSystem.canAfford(upgradeCost)) {
      return { valid: false, reason: '资源不足' };
    }

    return { valid: true, targetId: cfg.upgradesTo, cost: upgradeCost };
  }

  /**
   * 开始升级火把
   */
  upgradeTorch(index) {
    const check = this.canUpgradeTorch(index);
    if (!check.valid) return false;

    const torch = this.torches[index];
    const cfg = this._torchConfigMap.get(torch.torchId);

    // 消耗升级资源
    if (cfg.upgradeCost && cfg.upgradeCost.length > 0) {
      this._resourceSystem.consumeAll(cfg.upgradeCost);
    }

    torch.upgrading = true;
    torch.upgradeProgress = 0;

    this._notifyChange();
    eventBus.emit('torchUpgradeStarted', { torchIndex: index, torch });
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
    if (!cfg || cfg.type === 'eternal') return false;

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
   * 每个 tick：处理升级进度
   */
  onTick(data) {
    let changed = false;
    for (const torch of this.torches) {
      if (!torch.upgrading) continue;

      torch.upgradeProgress++;
      const cfg = this._torchConfigMap.get(torch.torchId);
      const upgradeTime = cfg?.upgradeTime || 3;

      if (torch.upgradeProgress >= upgradeTime) {
        // 升级完成：切换到目标火把类型
        const targetId = cfg?.upgradesTo;
        if (targetId) {
          const targetCfg = this._torchConfigMap.get(targetId);
          torch.torchId = targetId;
          // 如果是 eternal → 设置无限燃料
          if (targetCfg?.type === 'eternal') {
            torch.fuel = Infinity;
          }
        }
        torch.upgrading = false;
        torch.upgradeProgress = null;
        changed = true;
        eventBus.emit('torchUpgraded', { torchIndex: this.torches.indexOf(torch), torch });
      }
    }

    if (changed) this._notifyChange();
  }

  /**
   * 每个 period 结束：处理燃料消耗
   */
  onPeriodEnd(data) {
    let visibilityChanged = false;

    for (const torch of this.torches) {
      // 永恒火把 → 永远亮着，不消耗
      if (!torch.lit) continue;
      if (torch.upgrading) continue;

      const cfg = this._torchConfigMap.get(torch.torchId);
      if (!cfg) continue;
      if (cfg.type === 'eternal') continue;

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
