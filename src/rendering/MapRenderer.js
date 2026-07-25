/**
 * MapRenderer - 俯视角地图渲染器
 * 使用 PixiJS 渲染网格地图、建筑精灵、虚影放置
 */
import { configRegistry } from '../core/ConfigRegistry.js';
import { eventBus } from '../core/EventBus.js';
import { store } from '../core/Store.js';
import { progressManager } from '../utils/ProgressManager.js';
import { gridToScreenTopLeft, screenToGrid } from '../utils/gridUtils.js';
import { AnimatedSpriteHelper } from './AnimatedSpriteHelper.js';

export class MapRenderer {
  constructor(app, buildingSystem, torchSystem) {
    this.app = app;
    this.buildingSystem = buildingSystem;
    this._torchSystem = torchSystem || null;
    this.mapConfig = configRegistry.get('map');
    this.tileSize = this.mapConfig.tileSize;

    // 容器
    this.mapContainer = new PIXI.Container();
    this.torchLayer = new PIXI.Container();
    this.buildingLayer = new PIXI.Container();
    this.ghostLayer = new PIXI.Container();
    this.fogContainer = new PIXI.Container();
    this.app.stage.addChild(this.mapContainer);
    this.mapContainer.addChild(this.torchLayer);
    this.mapContainer.addChild(this.buildingLayer);
    this.mapContainer.addChild(this.ghostLayer);
    this.mapContainer.addChild(this.fogContainer);

    // 视口状态
    this.offsetX = 0;
    this.offsetY = 0;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.hasMoved = false;

    // 虚影状态
    this.ghostGraphic = null;
    this.ghostValid = false;
    this._dragGhostGraphic = null;

    // 建筑精灵缓存
    this._buildingSprites = [];

    // 纹理缓存（避免重复加载）
    this._textureCache = new Map();

    // 地图上建造进度条的 PIXI 填充对象引用
    this._mapBuildFills = [];
    this._unregisterMapBars = null;

    // 地图上合成进度条的 PIXI 填充对象引用
    this._mapSynthFills = [];
    this._unregisterSynthBars = null;

    // 时段色调
    this._colorFilter = null;
    // 色调过渡动画状态
    this._tintTransition = null;       // { startMatrix, targetMatrix, elapsed, duration, ticker }

    // CSS 3D 透视参数（需与 index.html 中 #game-canvas 的 transform 保持一致）
    this._perspectivePx = 1200;        // perspective 距离
    this._perspectiveAngleDeg = 50;    // rotateX 角度
    this._perspectiveEnabled = false;  // 当前是否开启 3D 透视（默认关闭）

    // 注册地图建造进度回调（统一由 ProgressManager 驱动，tick 间平滑）
    this._unregisterMapBars = progressManager.registerCallback(
      () => 0,
      () => 1,
      () => this._updateMapBuildBars()
    );

    // 注册地图合成进度回调
    this._unregisterSynthBars = progressManager.registerCallback(
      () => 0,
      () => 1,
      () => this._updateMapSynthBars()
    );

    this._drawMap();
    this._drawExpeditionEntrance();
    this._drawTorches();
    this._createFogCanvas();
    this._setupInteraction();
    this._centerView();
    this._subscribeEvents();
    this.refreshBuildings(); // 立即渲染初始建筑
  }

  /**
   * 绘制地图上的探险出发口
   */
  _drawExpeditionEntrance() {
    const entrance = this.mapConfig.expeditionEntrance;
    if (!entrance) return;

    const { gridX, gridY, width, height } = entrance;
    const ts = this.tileSize;
    const x = gridX * ts;
    const y = gridY * ts;
    const w = width * ts;
    const h = height * ts;

    const graphics = new PIXI.Graphics();

    // 底色
    graphics.rect(x, y, w, h);
    graphics.fill({ color: 0x2a4a6a, alpha: 0.8 });

    // 边框
    graphics.rect(x, y, w, h);
    graphics.stroke({ color: 0x66ccff, alpha: 0.8, width: 2 });

    // 内部图标
    const iconText = new PIXI.Text({
      text: '🧭',
      style: { fontSize: 28 }
    });
    iconText.anchor.set(0.5);
    iconText.x = x + w / 2;
    iconText.y = y + h / 2 - 10;

    const labelText = new PIXI.Text({
      text: '探险出发口',
      style: { fontSize: 11, fill: 0x88ccff, align: 'center' }
    });
    labelText.anchor.set(0.5);
    labelText.x = x + w / 2;
    labelText.y = y + h / 2 + 18;

    // 存储入口区域供点击检测
    this._expeditionEntrance = entrance;

    const entranceContainer = new PIXI.Container();
    entranceContainer.addChild(graphics);
    entranceContainer.addChild(iconText);
    entranceContainer.addChild(labelText);

    // 插入到地图层和建筑层之间
    this.mapContainer.addChildAt(entranceContainer, 1);
  }

  // ===== 火把渲染 =====

  _drawTorches() {
    if (!this._torchSystem) return;
    this.torchLayer.removeChildren();
    this._torchSprites = [];

    const ts = this.tileSize;

    for (let i = 0; i < this._torchSystem.torches.length; i++) {
      const torch = this._torchSystem.torches[i];
      const cfg = this._torchSystem.getTorchConfig(torch.torchId);
      if (!cfg) continue;

      const container = new PIXI.Container();
      const cx = (torch.gridX + 0.5) * ts;
      const cy = (torch.gridY + 0.5) * ts;

      // 微弱光晕（点燃时）
      if (torch.lit) {
        const glow = new PIXI.Graphics();
        glow.circle(cx, cy, cfg.radius * ts);
        glow.fill({ color: 0xffaa00, alpha: 0.04 });
        container.addChild(glow);
      }

      // 火把图标
      const icon = new PIXI.Text({
        text: torch.lit ? '🔥' : '🕯️',
        style: { fontSize: Math.min(20, ts * 0.35) }
      });
      icon.anchor.set(0.5);
      icon.x = cx;
      icon.y = cy;
      container.addChild(icon);

      // 升级进度条
      if (torch.upgrading) {
        const barW = ts * 0.7;
        const barH = 4;
        const barX = cx - barW / 2;
        const barY = cy + ts * 0.35;
        const pct = Math.min((torch.upgradeProgress || 0) / (cfg.upgradeTime || 1), 1);

        const barBg = new PIXI.Graphics();
        barBg.rect(barX, barY, barW, barH);
        barBg.fill({ color: 0x000000, alpha: 0.5 });
        container.addChild(barBg);

        const barFill = new PIXI.Graphics();
        barFill.rect(barX, barY, barW * pct, barH);
        barFill.fill({ color: 0xf0a040, alpha: 0.9 });
        container.addChild(barFill);
      }

      // 存储索引
      container.__torchIndex = i;

      this.torchLayer.addChild(container);
      this._torchSprites.push(container);
    }
  }

  // ===== 迷雾渲染（Canvas 2D 离屏纹理）=====

  /**
   * 创建离屏 Canvas 用于渲染迷雾纹理
   */
  _createFogCanvas() {
    const mapW = this.mapConfig.gridWidth * this.tileSize;
    const mapH = this.mapConfig.gridHeight * this.tileSize;

    // 创建离屏 Canvas
    this._fogCanvas = document.createElement('canvas');
    this._fogCanvas.width = mapW;
    this._fogCanvas.height = mapH;

    // 从 Canvas 创建 PIXI 纹理和精灵
    this._fogTexture = PIXI.Texture.from(this._fogCanvas);
    this._fogSprite = new PIXI.Sprite(this._fogTexture);
    this.fogContainer.addChild(this._fogSprite);

    this._updateFogTexture();
  }

  /**
   * 在 Canvas 2D 上重新绘制迷雾纹理
   * 使用 radialGradient + destination-out 清除火把照亮区域
   */
  _updateFogTexture() {
    if (!this._fogCanvas) return;

    const ctx = this._fogCanvas.getContext('2d');
    const mapW = this.mapConfig.gridWidth * this.tileSize;
    const mapH = this.mapConfig.gridHeight * this.tileSize;

    // 1. 全图填充迷雾色（完全不透明）
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#08081a';
    ctx.fillRect(0, 0, mapW, mapH);

    // 2. 用 destination-out 清除每个点燃火把的照亮区域
    if (this._torchSystem) {
      ctx.globalCompositeOperation = 'destination-out';

      const ts = this.tileSize;
      const litTorches = this._torchSystem.getLitTorches();
      for (const t of litTorches) {
        const cfg = this._torchSystem.getTorchConfig(t.torchId);
        if (!cfg) continue;

        const cx = (t.gridX + 0.5) * ts;
        const cy = (t.gridY + 0.5) * ts;
        const maxR = cfg.radius * ts;

        // 径向渐变：中心完全清除 → 边缘保留迷雾（柔边过渡）
        const gradient = ctx.createRadialGradient(cx, cy, maxR * 0.2, cx, cy, maxR);
        gradient.addColorStop(0, 'rgba(0,0,0,1)');     // 完全清除
        gradient.addColorStop(0.4, 'rgba(0,0,0,0.95)'); // 几乎完全清除
        gradient.addColorStop(0.65, 'rgba(0,0,0,0.7)'); // 大部分清除
        gradient.addColorStop(0.85, 'rgba(0,0,0,0.2)'); // 少量清除
        gradient.addColorStop(1, 'rgba(0,0,0,0)');     // 不清除

        ctx.fillStyle = gradient;
        ctx.fillRect(cx - maxR, cy - maxR, maxR * 2, maxR * 2);
      }
    }

    // 恢复默认混合模式
    ctx.globalCompositeOperation = 'source-over';

    // 3. 上传到 PIXI 纹理
    this._fogTexture.update();

    // 缓存可见性格子，供 _isTileRevealed 快速查询
    if (this._torchSystem) {
      this._visibleGrid = this._torchSystem.getVisibilityMatrix();
    }
  }

  /**
   * 检查指定格子是否可见（迷雾已驱散）
   */
  _isTileRevealed(col, row) {
    if (!this._torchSystem || !this._visibleGrid) return true; // 无火把系统时全可见
    if (row < 0 || row >= this._visibleGrid.length) return false;
    if (col < 0 || col >= this._visibleGrid[0].length) return false;
    return this._visibleGrid[row][col];
  }

  _drawMap() {
    const { gridWidth, gridHeight, tileSize, grid, groundTypes } = this.mapConfig;
    const graphics = new PIXI.Graphics();

    for (let row = 0; row < gridHeight; row++) {
      for (let col = 0; col < gridWidth; col++) {
        const char = grid[row][col];
        const groundType = groundTypes[char];
        const color = groundType ? parseInt(groundType.colorHint.replace('#', ''), 16) : 0x333333;

        const x = col * tileSize;
        const y = row * tileSize;

        graphics.rect(x, y, tileSize, tileSize);
        graphics.fill({ color, alpha: 1 });

        // 网格线
        graphics.rect(x, y, tileSize, tileSize);
        graphics.stroke({ color: 0x000000, alpha: 0.15, width: 1 });
      }
    }

    this.mapContainer.addChildAt(graphics, 0);
  }

  _centerView() {
    const { gridWidth, gridHeight, tileSize } = this.mapConfig;
    const mapW = gridWidth * tileSize;
    const mapH = gridHeight * tileSize;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    this.offsetX = (screenW - mapW) / 2;
    this.offsetY = (screenH - mapH) / 2;
    this._updatePosition();
  }

  _updatePosition() {
    this.mapContainer.x = this.offsetX;
    this.mapContainer.y = this.offsetY;
  }

  _setupInteraction() {
    const canvas = this.app.canvas;

    // 建筑拖动状态
    this._dragBuildingIndex = null;
    this._dragBuildingConfig = null;

    canvas.addEventListener('pointerdown', (e) => {
      // 放置模式下使用原有逻辑（地图拖动放置虚影）
      if (this.buildingSystem.placingState === 'PLACING') {
        this.isDragging = true;
        this.hasMoved = false;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.dragOffsetX = this.offsetX;
        this.dragOffsetY = this.offsetY;
        return;
      }

      const gridPos = this._clientToGrid(e.clientX, e.clientY);

      // 检查是否点击了建筑 → 启动建筑拖动（迷雾门控）
      if (gridPos && this._isTileRevealed(gridPos.col, gridPos.row)) {
        const buildingIndex = this._getBuildingAt(gridPos.col, gridPos.row);
        if (buildingIndex >= 0) {
          const building = this.buildingSystem.buildings[buildingIndex];
          if (building && building.status === 'active') {
            this._dragBuildingIndex = buildingIndex;
            this._dragBuildingConfig = configRegistry.getBuilding(building.buildingId);
            this._dragStartGridX = building.gridX;
            this._dragStartGridY = building.gridY;
            this.isDragging = false;
            this.hasMoved = false;
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
            return;
          }
        }
      }

      // 否则启动地图平移
      this.isDragging = true;
      this.hasMoved = false;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.dragOffsetX = this.offsetX;
      this.dragOffsetY = this.offsetY;
    });

    canvas.addEventListener('pointermove', (e) => {
      // 建筑拖动模式
      if (this._dragBuildingIndex !== null) {
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) this.hasMoved = true;
        this._updateBuildingDragGhost(e.clientX, e.clientY);
        return;
      }

      if (this.isDragging) {
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) this.hasMoved = true;
        this.offsetX = this.dragOffsetX + dx;
        this.offsetY = this.dragOffsetY + dy;
        this._updatePosition();
      }

      // 放置模式下更新虚影
      if (this.buildingSystem.placingState === 'PLACING') {
        this._updateGhost(e.clientX, e.clientY);
      }
    });

    canvas.addEventListener('pointerup', (e) => {
      // 建筑拖动结束
      if (this._dragBuildingIndex !== null) {
        const buildingIndex = this._dragBuildingIndex;
        this._clearBuildingDragGhost();
        this._dragBuildingIndex = null;
        this._dragBuildingConfig = null;

        if (this.hasMoved) {
          // 尝试移动建筑到新位置
          const gridPos = this._clientToGrid(e.clientX, e.clientY);
          if (gridPos) {
            const moved = this.buildingSystem.moveBuilding(buildingIndex, gridPos.col, gridPos.row);
            if (moved) {
              this.refreshBuildings();
            }
          }
        } else {
          // 没有拖动，触发点击事件
          eventBus.emit('buildingClicked', { buildingIndex });
        }
        return;
      }

      if (this.isDragging && !this.hasMoved) {
        this._onClick(e.clientX, e.clientY);
      }
      this.isDragging = false;
    });

    canvas.addEventListener('pointerleave', () => {
      // 清理建筑拖动
      if (this._dragBuildingIndex !== null) {
        this._clearBuildingDragGhost();
        this._dragBuildingIndex = null;
        this._dragBuildingConfig = null;
      }
      this.isDragging = false;
    });

    // Esc 取消放置
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.buildingSystem.placingState === 'PLACING') {
        this.buildingSystem.exitPlacingMode();
        this._clearGhost();
      }
    });
  }

  _onClick(clientX, clientY) {
    const gridPos = this._clientToGrid(clientX, clientY);
    if (!gridPos) return;

    if (this.buildingSystem.placingState === 'PLACING') {
      // 放置模式：先检查迷雾
      if (!this._isTileRevealed(gridPos.col, gridPos.row)) return;

      const buildingId = this.buildingSystem.placingBuildingId;
      const config = configRegistry.getBuilding(buildingId);
      if (!config) return;

      // 以点击位置为左上角
      const success = this.buildingSystem.placeBuilding(gridPos.col, gridPos.row, buildingId);
      if (success) {
        this._clearGhost();
        this.refreshBuildings();
      }
    } else {
      // 检查迷雾门控
      if (!this._isTileRevealed(gridPos.col, gridPos.row)) return;

      // 检查是否点击了探险出发口
      if (this._isClickOnExpeditionEntrance(gridPos.col, gridPos.row)) {
        eventBus.emit('expeditionEntranceClicked', {});
        return;
      }

      // 检查是否点击了火把
      if (this._torchSystem) {
        const torchIndex = this._torchSystem.getTorchAt(gridPos.col, gridPos.row);
        if (torchIndex >= 0) {
          eventBus.emit('torchClicked', { torchIndex });
          return;
        }
      }

      // 再检查是否点击了建筑
      const buildingIndex = this._getBuildingAt(gridPos.col, gridPos.row);
      if (buildingIndex >= 0) {
        eventBus.emit('buildingClicked', { buildingIndex });
      }
    }
  }

  /**
   * 检查点击是否在探险出发口范围内
   */
  _isClickOnExpeditionEntrance(col, row) {
    const entrance = this._expeditionEntrance;
    if (!entrance) return false;
    return col >= entrance.gridX &&
           col < entrance.gridX + entrance.width &&
           row >= entrance.gridY &&
           row < entrance.gridY + entrance.height;
  }

  /**
   * 屏幕坐标 → 网格坐标（含 CSS 3D 透视逆映射）
   *
   * CSS transform: perspective(P) rotateX(θ) 会让 canvas 产生非线性透视变形。
   * 此方法将屏幕像素逆映射回 canvas 本地坐标（PIXI 坐标系），再转换为网格坐标。
   *
   * 逆映射公式（推导：canvas 中心为原点，rotateX 绕 X 轴，透视距离 P）：
   *   cy = sy * P / (P * cosθ + sy * sinθ)     ← 先求 Y（只依赖 sy）
   *   cx = sx * (P - cy * sinθ) / P             ← 再求 X（依赖 cy 修正深度缩放）
   * 其中 (sx, sy) = 屏幕坐标相对于 canvas CSS 中心的偏移量。
   */
  _clientToGrid(clientX, clientY) {
    const canvas = this.app.canvas;
    const canvasCSSW = parseFloat(canvas.style.width) || window.innerWidth;
    const canvasCSSH = parseFloat(canvas.style.height) || window.innerHeight;

    let worldX, worldY;

    if (this._perspectiveEnabled) {
      // 3D 透视模式：屏幕坐标先逆映射到 canvas 本地坐标
      const sx = clientX - canvasCSSW / 2;
      const sy = clientY - canvasCSSH / 2;

      const angleRad = this._perspectiveAngleDeg * Math.PI / 180;
      const P = this._perspectivePx;
      const cosA = Math.cos(angleRad);
      const sinA = Math.sin(angleRad);

      const denom = P * cosA + sy * sinA;
      const cy = Math.abs(denom) > 0.001 ? sy * P / denom : sy;
      const cx = sx * (P - cy * sinA) / P;

      const pixiX = cx + canvasCSSW / 2;
      const pixiY = cy + canvasCSSH / 2;

      worldX = pixiX - this.offsetX;
      worldY = pixiY - this.offsetY;
    } else {
      // 2D 平面模式：屏幕像素直接映射
      worldX = clientX - this.offsetX;
      worldY = clientY - this.offsetY;
    }

    const { col, row } = screenToGrid(worldX, worldY, this.tileSize);
    const { gridWidth, gridHeight } = this.mapConfig;
    if (col < 0 || col >= gridWidth || row < 0 || row >= gridHeight) return null;
    return { col, row };
  }

  _getBuildingAt(col, row) {
    for (let i = 0; i < this.buildingSystem.buildings.length; i++) {
      const b = this.buildingSystem.buildings[i];
      const config = configRegistry.getBuilding(b.buildingId);
      if (!config) continue;
      const w = config.footprint.width;
      const h = config.footprint.height;
      if (col >= b.gridX && col < b.gridX + w && row >= b.gridY && row < b.gridY + h) {
        return i;
      }
    }
    return -1;
  }

  // ===== 虚影放置 =====

  _updateGhost(clientX, clientY) {
    const gridPos = this._clientToGrid(clientX, clientY);
    const buildingId = this.buildingSystem.placingBuildingId;
    const config = configRegistry.getBuilding(buildingId);
    if (!config || !gridPos) {
      this._clearGhost();
      return;
    }

    const w = config.footprint.width;
    const h = config.footprint.height;
    const check = this.buildingSystem.canPlaceAt(gridPos.col, gridPos.row, buildingId);
    this.ghostValid = check.valid;

    this._clearGhost();

    const graphics = new PIXI.Graphics();
    const x = gridPos.col * this.tileSize;
    const y = gridPos.row * this.tileSize;
    const color = this.ghostValid ? 0x44ff44 : 0xff4444;

    graphics.rect(x, y, w * this.tileSize, h * this.tileSize);
    graphics.fill({ color, alpha: 0.35 });
    graphics.rect(x, y, w * this.tileSize, h * this.tileSize);
    graphics.stroke({ color, alpha: 0.8, width: 2 });

    this.ghostLayer.addChild(graphics);
    this.ghostGraphic = graphics;
  }

  _clearGhost() {
    if (this.ghostGraphic) {
      this.ghostLayer.removeChild(this.ghostGraphic);
      this.ghostGraphic.destroy();
      this.ghostGraphic = null;
    }
  }

  // ===== 建筑拖动虚影 =====

  /**
   * 更新建筑拖动时的目标位置虚影
   */
  _updateBuildingDragGhost(clientX, clientY) {
    const gridPos = this._clientToGrid(clientX, clientY);
    const config = this._dragBuildingConfig;

    this._clearBuildingDragGhost();

    if (!config || !gridPos) return;

    const w = config.footprint.width;
    const h = config.footprint.height;
    const x = gridPos.col * this.tileSize;
    const y = gridPos.row * this.tileSize;

    // 检查新位置是否合法
    const check = this.buildingSystem.canMoveTo(this._dragBuildingIndex, gridPos.col, gridPos.row);
    const valid = check.valid;

    const graphics = new PIXI.Graphics();

    // 填充
    graphics.rect(x, y, w * this.tileSize, h * this.tileSize);
    graphics.fill({ color: valid ? 0x44aaff : 0xff4444, alpha: 0.3 });

    // 边框
    graphics.rect(x, y, w * this.tileSize, h * this.tileSize);
    graphics.stroke({ color: valid ? 0x4488ff : 0xff4444, alpha: 0.8, width: 2 });

    this.ghostLayer.addChild(graphics);
    this._dragGhostGraphic = graphics;
  }

  /**
   * 清除建筑拖动虚影
   */
  _clearBuildingDragGhost() {
    if (this._dragGhostGraphic) {
      this.ghostLayer.removeChild(this._dragGhostGraphic);
      this._dragGhostGraphic.destroy();
      this._dragGhostGraphic = null;
    }
  }

  // ===== 建筑渲染 =====

  refreshBuildings() {
    // 清除旧精灵（包括停止序列帧动画）
    for (const sprite of this._buildingSprites) {
      // 停止 AnimatedSprite（如果有）
      if (sprite.__animSprite) {
        sprite.__animSprite.stop();
        sprite.__animSprite = null;
      }
      this.buildingLayer.removeChild(sprite);
      sprite.destroy();
    }
    this._buildingSprites = [];
    this._mapBuildFills = []; // 重建进度条引用列表
    this._mapSynthFills = []; // 重建合成进度条引用列表

    // 绘制所有建筑
    for (const building of this.buildingSystem.buildings) {
      const config = configRegistry.getBuilding(building.buildingId);
      if (!config) continue;

      const w = config.footprint.width;
      const h = config.footprint.height;
      const x = building.gridX * this.tileSize;
      const y = building.gridY * this.tileSize;

      const container = new PIXI.Container();
      const isConstructing = building.status === 'constructing';

      // 标签布局：从配置读取偏移量，支持策划/美术按建筑微调
      const layout = config.labelLayout || {};
      const centerX = x + (w * this.tileSize) / 2;
      const centerY = y + (h * this.tileSize) / 2;
      const nameBaseY = centerY - 10;
      const progressBaseY = centerY + 4;
      const workersBaseY = y + h * this.tileSize - 12;

      // 判断渲染模式：
      // 1) 有 animation 配置 → 序列帧动画精灵
      // 2) 有 mapIcon 且纹理加载成功 → 静态精灵图
      // 3) 否则 → 文字回退
      const texture = config.mapIcon ? this._getTexture(config.mapIcon) : null;

      // 检查是否有序列帧动画配置
      const animConfig = config.animation;
      const animSprite = (texture && animConfig)
        ? AnimatedSpriteHelper.createFromConfig(animConfig)
        : null;

      if (animSprite) {
        // ===== 序列帧动画模式 =====
        const iconLayout = config.mapIconLayout || {};
        const iconScaleX = iconLayout.scaleX != null ? iconLayout.scaleX : 1;
        const iconScaleY = iconLayout.scaleY != null ? iconLayout.scaleY : 1;
        const iconOffsetX = iconLayout.offsetX || 0;
        const iconOffsetY = iconLayout.offsetY || 0;

        animSprite.x = x + iconOffsetX;
        animSprite.y = y + iconOffsetY;

        // 使用动画配置中的帧尺寸（而非精灵图整体尺寸）来计算缩放
        const frameW = animConfig.frameWidth || texture.width || 0;
        const frameH = animConfig.frameHeight || texture.height || 0;
        if (frameW > 0 && frameH > 0) {
          animSprite.scale.x = (w * this.tileSize / frameW) * iconScaleX;
          animSprite.scale.y = (h * this.tileSize / frameH) * iconScaleY;
        }

        container.addChild(animSprite);

        // 存储引用便于后续清理
        container.__animSprite = animSprite;

        if (isConstructing) {
          // 灰色半透明遮罩（覆盖整个建筑精灵图）
          const overlay = new PIXI.Graphics();
          overlay.rect(x, y, w * this.tileSize, h * this.tileSize);
          overlay.fill({ color: 0x888888, alpha: 0.55 });
          container.addChild(overlay);

          // 建造进度条（遮罩上方）
          this._addBuildProgressBar(container, building, config, x, w, progressBaseY, layout, centerX);
        }

        // 建筑名称（精灵图上方，带阴影以提升可读性）
        const nameFontSize = Math.min(14, this.tileSize * 0.22);
        const nameMaxWidth = w * this.tileSize - 6;
        const text = new PIXI.Text({
          text: config.name,
          style: {
            fontSize: nameFontSize,
            fill: 0xffffff,
            align: 'center',
            wordWrap: true,
            wordWrapWidth: nameMaxWidth,
            breakWords: true,
            dropShadow: {
              color: 0x000000,
              alpha: 0.75,
              blur: 3,
              distance: 1
            }
          }
        });
        text.anchor.set(0.5);
        text.x = centerX;
        text.y = nameBaseY + (layout.nameOffsetY || 0);
        container.addChild(text);

      } else if (texture) {
        // ===== 静态精灵图模式 =====
        const sprite = new PIXI.Sprite(texture);

        // 读取 mapIconLayout 配置（艺术家配置工具可调节 scaleX/Y 和 offsetX/Y）
        const iconLayout = config.mapIconLayout || {};
        const iconScaleX = iconLayout.scaleX != null ? iconLayout.scaleX : 1;
        const iconScaleY = iconLayout.scaleY != null ? iconLayout.scaleY : 1;
        const iconOffsetX = iconLayout.offsetX || 0;
        const iconOffsetY = iconLayout.offsetY || 0;

        sprite.x = x + iconOffsetX;
        sprite.y = y + iconOffsetY;

        // 安全设置缩放：PixiJS v8 Texture.from() 异步加载，纹理可能 0×0
        // 直接设 sprite.width 会除以 0 → scale 变成 Infinity，永久不显示
        const texW = texture.width || 0;
        const texH = texture.height || 0;
        if (texW > 0 && texH > 0) {
          sprite.scale.x = (w * this.tileSize / texW) * iconScaleX;
          sprite.scale.y = (h * this.tileSize / texH) * iconScaleY;
        }
        // 注意：纹理异步加载完成后 scale 会自动生效——下次 refreshBuildings 时纹理已缓存，
        // texture.width 即为实际尺寸，scale 计算正确

        container.addChild(sprite);

        if (isConstructing) {
          // 灰色半透明遮罩（覆盖整个建筑精灵图）
          const overlay = new PIXI.Graphics();
          overlay.rect(x, y, w * this.tileSize, h * this.tileSize);
          overlay.fill({ color: 0x888888, alpha: 0.55 });
          container.addChild(overlay);

          // 建造进度条（遮罩上方）
          this._addBuildProgressBar(container, building, config, x, w, progressBaseY, layout, centerX);
        }

        // 建筑名称（精灵图上方，带阴影以提升可读性）
        const nameFontSize = Math.min(14, this.tileSize * 0.22);
        const nameMaxWidth = w * this.tileSize - 6;
        const text = new PIXI.Text({
          text: config.name,
          style: {
            fontSize: nameFontSize,
            fill: 0xffffff,
            align: 'center',
            wordWrap: true,
            wordWrapWidth: nameMaxWidth,
            breakWords: true,
            dropShadow: {
              color: 0x000000,
              alpha: 0.75,
              blur: 3,
              distance: 1
            }
          }
        });
        text.anchor.set(0.5);
        text.x = centerX;
        text.y = nameBaseY + (layout.nameOffsetY || 0);
        container.addChild(text);

      } else {
        // ===== 文字回退模式（纯色矩形 + 名称）=====
        const graphics = new PIXI.Graphics();
        const color = this._getBuildingColor(building.buildingId);
        const alpha = isConstructing ? 0.5 : 0.9;

        graphics.rect(x + 2, y + 2, w * this.tileSize - 4, h * this.tileSize - 4);
        graphics.fill({ color, alpha });
        graphics.rect(x + 2, y + 2, w * this.tileSize - 4, h * this.tileSize - 4);
        graphics.stroke({ color: 0xffffff, alpha: 0.3, width: 1 });
        container.addChild(graphics);

        // 建筑名称
        const nameFontSize = Math.min(14, this.tileSize * 0.22);
        const nameMaxWidth = w * this.tileSize - 6;
        const text = new PIXI.Text({
          text: config.name,
          style: {
            fontSize: nameFontSize,
            fill: 0xffffff,
            align: 'center',
            wordWrap: true,
            wordWrapWidth: nameMaxWidth,
            breakWords: true
          }
        });
        text.anchor.set(0.5);
        text.x = centerX;
        text.y = nameBaseY + (layout.nameOffsetY || 0);
        container.addChild(text);

        // 建造进度条
        if (isConstructing) {
          this._addBuildProgressBar(container, building, config, x, w, progressBaseY, layout, centerX);
        }
      }

      // ===== 合成进度条（两种模式共用，琥珀色以区别于建造进度）=====
      if (building.status === 'active' && building.synthesisProgress) {
        this._addSynthProgressBar(container, building, x, w, progressBaseY, layout, centerX);
      }

      // ===== 工人数（两种模式共用）=====
      if (building.status === 'active' && building.currentWorkers > 0) {
        const workerText = new PIXI.Text({
          text: `👷${building.currentWorkers}`,
          style: { fontSize: 11, fill: 0x88ccff }
        });
        workerText.anchor.set(0.5);
        workerText.x = centerX;
        workerText.y = workersBaseY + (layout.workersOffsetY || 0);
        container.addChild(workerText);
      }

      this.buildingLayer.addChild(container);
      this._buildingSprites.push(container);
    }
  }

  /**
   * 添加地图建造进度条（精灵图模式和文字回退模式共用）
   */
  _addBuildProgressBar(container, building, config, x, w, progressBaseY, layout, centerX) {
    const barWidth = w * this.tileSize - 8;
    const barHeight = 6;
    const barX = x + 4;
    const barY = progressBaseY + (layout.progressBarOffsetY || 0);
    const pct = Math.min((building.buildProgress || 0) / (config.buildTime || 1), 1);

    // 背景条
    const barBg = new PIXI.Graphics();
    barBg.rect(barX, barY, barWidth, barHeight);
    barBg.fill({ color: 0x000000, alpha: 0.5 });
    container.addChild(barBg);

    // 填充条
    const barFill = new PIXI.Graphics();
    barFill.rect(barX, barY, barWidth * pct, barHeight);
    barFill.fill({ color: 0xffaa00, alpha: 0.9 });
    container.addChild(barFill);

    // 存储引用，供 ProgressManager 每帧重绘
    const buildingIndex = this.buildingSystem.buildings.indexOf(building);
    this._mapBuildFills.push({
      fill: barFill,
      buildingIndex,
      barX, barY, barWidth, barHeight
    });

    // 进度文字
    const cur = building.buildProgress ?? 0;
    const total = config.buildTime ?? 1;
    const progressText = new PIXI.Text({
      text: `${cur}/${total}`,
      style: { fontSize: 9, fill: 0xffffff }
    });
    progressText.anchor.set(0.5);
    progressText.x = centerX;
    progressText.y = barY + barHeight + 5;
    container.addChild(progressText);
  }

  /**
   * 添加地图合成进度条（与建造进度条样式区分，琥珀色）
   */
  _addSynthProgressBar(container, building, x, w, progressBaseY, layout, centerX) {
    const synthBarWidth = w * this.tileSize - 8;
    const synthBarHeight = 5;
    const synthBarX = x + 4;
    const synthBarY = progressBaseY + (layout.progressBarOffsetY || 0);
    const sp = building.synthesisProgress;
    const synthPct = Math.min((sp.progress || 0) / sp.total, 1);

    // 背景条
    const synthBg = new PIXI.Graphics();
    synthBg.rect(synthBarX, synthBarY, synthBarWidth, synthBarHeight);
    synthBg.fill({ color: 0x000000, alpha: 0.5 });
    container.addChild(synthBg);

    // 填充条（琥珀色）
    const synthFill = new PIXI.Graphics();
    synthFill.rect(synthBarX, synthBarY, synthBarWidth * synthPct, synthBarHeight);
    synthFill.fill({ color: 0xf0a040, alpha: 0.9 });
    container.addChild(synthFill);

    // 存储引用，供 ProgressManager 每帧重绘
    const synthBuildingIndex = this.buildingSystem.buildings.indexOf(building);
    this._mapSynthFills.push({
      fill: synthFill,
      buildingIndex: synthBuildingIndex,
      barX: synthBarX, barY: synthBarY, barWidth: synthBarWidth, barHeight: synthBarHeight
    });

    // 合成进度文字
    const synthCur = sp.progress ?? 0;
    const synthTotal = sp.total;
    const synthText = new PIXI.Text({
      text: `🔨${synthCur}/${synthTotal}`,
      style: { fontSize: 9, fill: 0xf0a040 }
    });
    synthText.anchor.set(0.5);
    synthText.x = centerX;
    synthText.y = synthBarY + synthBarHeight + 5;
    container.addChild(synthText);
  }

  /**
   * 获取纹理（带缓存），PixiJS v8 Texture.from() 异步加载，创建 Sprite 后自动更新
   */
  _getTexture(path) {
    if (!this._textureCache.has(path)) {
      this._textureCache.set(path, PIXI.Texture.from(path));
    }
    return this._textureCache.get(path);
  }

  _getBuildingColor(buildingId) {
    const colors = {
      'work_shed': 0x8B4513,
      'plank_house': 0xA0522D,
      'tile_house': 0xCD853F,
      'hunting_hut': 0x556B2F,
      'farm': 0x6B8E23,
      'warehouse': 0x4682B4,
      'industrial_warehouse': 0x2F4F8F,
      'lumber_mill': 0x8B6914,
      'quarry': 0x696969,
      'logging_camp': 0x228B22,
      'furnace': 0xB22222,
      'mine_support': 0x4A4A4A,
      'basic_workshop': 0x9370DB,
      'advanced_workshop': 0x7B2FBE
    };
    return colors[buildingId] || 0x666666;
  }

  // ===== 地图建造进度条（PIXI，由 ProgressManager 驱动） =====

  /**
   * 由 ProgressManager 每帧回调，重绘所有建造中的地图进度条
   */
  _updateMapBuildBars() {
    const t = store.getState('timeProgress') || 0;
    for (const ref of this._mapBuildFills) {
      const b = this.buildingSystem.buildings[ref.buildingIndex];
      if (!b || b.status !== 'constructing') continue;
      const config = configRegistry.getBuilding(b.buildingId);
      if (!config) continue;
      const base = (b.buildProgress || 0) / (config.buildTime || 1);
      const next = ((b.buildProgress || 0) + 1) / (config.buildTime || 1);
      const smooth = Math.min(base + (next - base) * t, 1);
      ref.fill.clear();
      ref.fill.rect(ref.barX, ref.barY, ref.barWidth * smooth, ref.barHeight);
      ref.fill.fill({ color: 0xffaa00, alpha: 0.9 });
    }
  }

  /**
   * 由 ProgressManager 每帧回调，重绘所有合成中的地图进度条（琥珀色）
   */
  _updateMapSynthBars() {
    const t = store.getState('timeProgress') || 0;
    const period = store.getState('timePeriod') || '';
    const isWorkPeriod = period === 'morning' || period === 'afternoon';
    for (const ref of this._mapSynthFills) {
      const b = this.buildingSystem.buildings[ref.buildingIndex];
      if (!b || !b.synthesisProgress) continue;
      const sp = b.synthesisProgress;
      const base = (sp.progress || 0) / (sp.total || 1);
      // 非工作时段合成不推进，next 保持与 base 一致，避免进度条"回退"
      const next = isWorkPeriod
        ? ((sp.progress || 0) + 1) / (sp.total || 1)
        : base;
      const smooth = Math.min(base + (next - base) * t, 1);
      ref.fill.clear();
      ref.fill.rect(ref.barX, ref.barY, ref.barWidth * smooth, ref.barHeight);
      ref.fill.fill({ color: 0xf0a040, alpha: 0.9 });
    }
  }

  // ===== 时段色调 =====

  /**
   * 应用时段色调，支持平滑过渡
   * @param {string} period - 'morning' | 'afternoon' | 'evening' | 'night'
   * @param {number} [duration=1.5] - 过渡时长（秒）
   */
  applyPeriodTint(period, duration = 1.5) {
    // PixiJS v8 ColorMatrixFilter 使用 5×4 矩阵（20个元素）
    // 格式: [R×R, R×G, R×B, R×A, R_offset,
    //         G×R, G×G, G×B, G×A, G_offset,
    //         B×R, B×G, B×B, B×A, B_offset,
    //         A×R, A×G, A×B, A×A, A_offset]
    const tints = {
      'morning': [
        1.1, 0, 0, 0, 0,
        0, 1.05, 0, 0, 0,
        0, 0, 0.9, 0, 0,
        0, 0, 0, 1, 0
      ],
      'afternoon': null, // 无滤镜 → 用单位矩阵表示
      'evening': [
        1.1, 0, 0, 0, 0,
        0, 0.9, 0, 0, 0,
        0, 0, 0.7, 0, 0,
        0, 0, 0, 1, 0
      ],
      'night': [
        0.6, 0, 0, 0, 0,
        0, 0.6, 0, 0, 0,
        0, 0, 0.9, 0, 0,
        0, 0, 0, 1, 0
      ]
    };

    // 单位矩阵（afternoon 无滤镜时使用）
    const IDENTITY = [
      1, 0, 0, 0, 0,
      0, 1, 0, 0, 0,
      0, 0, 1, 0, 0,
      0, 0, 0, 1, 0
    ];

    const targetMatrix = tints[period] || IDENTITY;

    // 确保滤镜实例存在
    if (!this._colorFilter) {
      this._colorFilter = new PIXI.ColorMatrixFilter();
      this._colorFilter.matrix = targetMatrix.slice();
      this.mapContainer.filters = [this._colorFilter];
    }

    // 如果已有进行中的过渡，从当前插值位置开始新过渡
    let startMatrix;
    if (this._tintTransition) {
      startMatrix = this._getCurrentInterpolatedMatrix();
      this._stopTintTransition();
    } else {
      startMatrix = this._colorFilter.matrix.slice();
    }

    // 如果起始与目标完全相同，跳过过渡
    if (startMatrix.every((v, i) => Math.abs(v - targetMatrix[i]) < 0.001)) {
      return;
    }

    // 启动平滑过渡
    this._tintTransition = {
      startMatrix,
      targetMatrix: targetMatrix.slice(),
      elapsed: 0,
      duration
    };

    this._tintTransition.ticker = (ticker) => {
      this._animateTintTransition(ticker.deltaMS / 1000);
    };
    this.app.ticker.add(this._tintTransition.ticker);
  }

  /**
   * 获取当前插值中的矩阵（用于中断过渡时作为新起点）
   */
  _getCurrentInterpolatedMatrix() {
    if (!this._tintTransition) return this._colorFilter.matrix.slice();
    const t = this._tintTransition.elapsed / this._tintTransition.duration;
    return this._tintTransition.startMatrix.map(
      (v, i) => v + (this._tintTransition.targetMatrix[i] - v) * t
    );
  }

  /**
   * 停止当前的色调过渡动画
   */
  _stopTintTransition() {
    if (!this._tintTransition) return;
    if (this._tintTransition.ticker) {
      this.app.ticker.remove(this._tintTransition.ticker);
    }
    this._tintTransition = null;
  }

  /**
   * 每帧调用：执行色调矩阵的线性插值
   * @param {number} dt - 帧间隔时间（秒）
   */
  _animateTintTransition(dt) {
    const trans = this._tintTransition;
    if (!trans) return;

    trans.elapsed += dt;

    // 使用 easeInOutCubic 让过渡更自然
    const raw = Math.min(trans.elapsed / trans.duration, 1.0);
    const t = raw < 0.5
      ? 4 * raw * raw * raw
      : 1 - Math.pow(-2 * raw + 2, 3) / 2;

    // 逐元素线性插值
    const m = trans.startMatrix.map(
      (v, i) => v + (trans.targetMatrix[i] - v) * t
    );
    this._colorFilter.matrix = m;

    // 过渡完成
    if (trans.elapsed >= trans.duration) {
      this._colorFilter.matrix = trans.targetMatrix.slice();
      this._stopTintTransition();
    }
  }

  /**
   * 销毁时清理过渡
   */
  destroy() {
    this._stopTintTransition();
    // ... existing destroy logic would be here
  }

  // ===== 事件订阅 =====

  _subscribeEvents() {
    eventBus.on('periodChange', (data) => {
      this.applyPeriodTint(data.period);
    });

    eventBus.on('buildingPlaced', () => this.refreshBuildings());
    eventBus.on('buildingComplete', () => this.refreshBuildings());
    eventBus.on('buildingUpgraded', () => this.refreshBuildings());
    eventBus.on('buildingDemolished', () => this.refreshBuildings());
    eventBus.on('buildingMoved', () => this.refreshBuildings());
    eventBus.on('workerChanged', () => this.refreshBuildings());
    eventBus.on('synthesisStarted', () => this.refreshBuildings());
    eventBus.on('synthesisComplete', () => this.refreshBuildings());

    // 监听放置模式变化
    store.subscribe('placingState', (state) => {
      if (state !== 'PLACING') {
        this._clearGhost();
      }
    });

    // tick 时刷新建筑（建造进度）
    eventBus.on('tick', () => this.refreshBuildings());

    // 火把状态变化：重绘火把和迷雾
    eventBus.on('torchStateChanged', () => {
      this._drawTorches();
      this._updateFogTexture();
    });
  }

  /**
   * 切换 3D 透视模式
   * @param {boolean} enabled
   */
  setPerspective(enabled) {
    this._perspectiveEnabled = enabled;
    const canvasDiv = document.getElementById('game-canvas');
    if (canvasDiv) {
      if (enabled) {
        canvasDiv.classList.add('perspective-3d');
      } else {
        canvasDiv.classList.remove('perspective-3d');
      }
    }
    // 持久化偏好
    try { localStorage.setItem('gmgc_perspective_3d', enabled ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  /** 获取当前透视模式状态 */
  isPerspectiveEnabled() {
    return this._perspectiveEnabled;
  }

  onResize() {
    // 保持地图居中（可选）
  }
}
