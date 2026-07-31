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
  constructor(app, buildingSystem, torchSystem, roadSystem, combatSystem) {
    this.app = app;
    this.buildingSystem = buildingSystem;
    this._torchSystem = torchSystem || null;
    this._roadSystem = roadSystem || null;
    this._combatSystem = combatSystem || null;
    this.mapConfig = configRegistry.get('map');
    this.tileSize = this.mapConfig.tileSize;

    // 屏幕尺寸缓存
    this.screenW = window.innerWidth;
    this.screenH = window.innerHeight;

    // 相机位置：屏幕左上角对应的世界像素坐标
    this.camX = 0;
    this.camY = 0;

    // 缩放级别（1.0 = 默认，滚轮缩放以鼠标为中心）
    this.zoom = 1.0;
    this.MIN_ZOOM = 0.5;
    this.MAX_ZOOM = 3.0;

    // 游戏视图容器（包裹所有地图层，统一缩放）
    this.gameView = new PIXI.Container();
    this.app.stage.addChild(this.gameView);

    // 容器层级（三层分离，参考 planner-config.html 的固定视口方案）
    // 1. 固定地形层（永远在 0,0，地形以视口本地坐标绘制 → 始终铺满屏幕）
    this.terrainContainer = new PIXI.Container();
    this.gameView.addChild(this.terrainContainer);

    // 2. 移动世界层（建筑/虚影，世界坐标，容器位移 = -cam）
    this.worldContainer = new PIXI.Container();
    this.buildingLayer = new PIXI.Container();
    this.ghostLayer = new PIXI.Container();
    // Alt 光源边界描边层
    this.lightOverlay = new PIXI.Container();
    this.lightOverlay.visible = false;
    this.gameView.addChild(this.worldContainer);
    this.worldContainer.addChild(this.buildingLayer);
    this.roadLayer = new PIXI.Container();
    this.worldContainer.addChild(this.roadLayer);
    this.worldContainer.addChild(this.ghostLayer);
    this.worldContainer.addChild(this.lightOverlay);

    // 3. 固定迷雾层（永远在 0,0，迷雾以视口本地坐标绘制 → 始终铺满屏幕）
    this.fogContainer = new PIXI.Container();
    this.gameView.addChild(this.fogContainer);

    // 拖拽状态
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragStartCamX = 0;
    this.dragStartCamY = 0;
    this.hasMoved = false;

    // 虚影状态
    this.ghostGraphic = null;
    this.ghostValid = false;
    this._dragGhostGraphic = null;

    // 相邻加成提示（放置/拖动时显示）
    this._adjacencyHighlights = [];   // 高亮边框
    this._adjacencyLines = [];        // 连接线
    this._adjacencyTexts = [];        // 浮动文字

    // 建筑精灵缓存
    this._buildingSprites = [];

    // 纹理缓存（避免重复加载）
    this._textureCache = new Map();
    this._terrainSprites = [];
    // 变体瓦片缓存：key="col,row" → true/false，保证同格决策一致 + 无相邻
    this._tileVariants = new Map();

    // 地图上建造进度条的 PIXI 填充对象引用
    this._mapBuildFills = [];
    this._roadBuildFills = [];
    this._unregisterMapBars = null;

    // 地图上合成进度条的 PIXI 填充对象引用
    this._mapSynthFills = [];
    this._unregisterSynthBars = null;

    // 时段色调
    this._colorFilter = null;
    // 色调过渡动画状态
    this._tintTransition = null;       // { startMatrix, targetMatrix, elapsed, duration, ticker }

    // 调试地块标注层（作弊/调试模式下显示每格地形代码）
    this._terrainLabelLayer = new PIXI.Container();
    this._terrainLabelLayer.visible = false;
    this.worldContainer.addChild(this._terrainLabelLayer);
    this._terrainLabels = [];          // PIXI.Text 缓存
    this._terrainLabelTileSize = 0;    // 上次绘制时的 tileSize（用于判断是否需重建）

    // CSS 3D 透视参数（需与 index.html 中 #game-canvas 的 transform 保持一致）
    this._perspectivePx = 1200;        // perspective 距离
    this._perspectiveAngleDeg = 50;    // rotateX 角度
    this._perspectiveEnabled = false;  // 当前是否开启 3D 透视（默认关闭）

    // 注册地图建造进度回调（统一由 ProgressManager 驱动，tick 间平滑）
    this._unregisterMapBars = progressManager.registerCallback(
      () => 0,
      () => 1,
      () => {
        this._updateMapBuildBars();
        this._updateRoadBuildBars();
      }
    );

    // 注册地图合成进度回调
    this._unregisterSynthBars = progressManager.registerCallback(
      () => 0,
      () => 1,
      () => this._updateMapSynthBars()
    );

    this._setupInteraction();
    this._subscribeEvents();
  }

  async init() {
    await this._preloadTerrainTextures();
    this._centerView();
    this._drawTerrainChunk();
    this._drawExpeditionEntrances();
    this._drawEventMarkers();
    this._drawEnemies();
    this._drawRoads();
    this._createFogCanvas();
    this.refreshBuildings();
  }

  async _preloadTerrainTextures() {
    const { groundTypes } = this.mapConfig;
    const loadOne = (path) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this._textureCache.set(path, PIXI.Texture.from(img));
        resolve();
      };
      img.onerror = () => reject(new Error(`Failed to load: ${path}`));
      img.src = path;
    });

    const tasks = [];
    for (const key of Object.keys(groundTypes)) {
      const gt = groundTypes[key];
      if (gt.texture) tasks.push(loadOne(gt.texture));
      if (gt.variants) {
        for (const v of gt.variants) {
          if (v.texture) tasks.push(loadOne(v.texture));
        }
      }
      if (gt.neighborOverrides) {
        for (const o of gt.neighborOverrides) {
          if (o.texture) tasks.push(loadOne(o.texture));
        }
      }
      if (gt.proximityOverrides) {
        for (const o of gt.proximityOverrides) {
          if (o.texture) tasks.push(loadOne(o.texture));
        }
      }
      if (gt.rowPatterns) {
        for (const p of gt.rowPatterns) {
          if (p.texture) tasks.push(loadOne(p.texture));
        }
      }
    }
    if (tasks.length === 0) return;

    try {
      await Promise.all(tasks);
      console.log('[MapRenderer] 地形纹理预加载完成');
    } catch (e) {
      console.error('[MapRenderer] 地形纹理预加载失败:', e);
    }
  }

  /**
   * 绘制地图上的所有探险出发口
   */
  _drawExpeditionEntrances() {
    // 兼容旧格式：单个 expeditionEntrance
    let entrances = this.mapConfig.expeditionEntrances;
    if (!entrances && this.mapConfig.expeditionEntrance) {
      const old = this.mapConfig.expeditionEntrance;
      entrances = [{
        id: 'default_entrance',
        name: '探险出发口',
        gridX: old.gridX,
        gridY: old.gridY,
        regionIds: []
      }];
    }
    if (!entrances || entrances.length === 0) return;

    this._expeditionEntrances = entrances;
    const ts = this.tileSize;

    for (const entrance of entrances) {
      const { gridX, gridY } = entrance;
      const x = gridX * ts;
      const y = gridY * ts;
      const w = ts;  // 1x1
      const h = ts;

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
        style: { fontSize: 24 }
      });
      iconText.anchor.set(0.5);
      iconText.x = x + w / 2;
      iconText.y = y + h / 2 - 8;

      // 名称标签（放在格子下方）
      const labelText = new PIXI.Text({
        text: entrance.name || '入口',
        style: { fontSize: 10, fill: 0x88ccff, align: 'center' }
      });
      labelText.anchor.set(0.5);
      labelText.x = x + w / 2;
      labelText.y = y + h + 6;

      const entranceContainer = new PIXI.Container();
      entranceContainer.addChild(graphics);
      entranceContainer.addChild(iconText);
      entranceContainer.addChild(labelText);

      this.worldContainer.addChild(entranceContainer);
    }
  }

  // ===== 地图事件标记渲染 =====

  // ===== 道路渲染 =====

  _drawRoads() {
    this.roadLayer.removeChildren();
    this._roadBuildFills = [];
    if (!this._roadSystem) return;
    const ts = this.tileSize;
    const roads = this._roadSystem.getAllStates();
    if (!roads || roads.length === 0) return;
    const roadConfig = this._roadSystem.getDefaultRoadConfig();
    const baseColor = roadConfig ? parseInt(roadConfig.color.replace('#', ''), 16) : 0x8B7355;

    for (const r of roads) {
      const x = r.gridX * ts;
      const y = r.gridY * ts;
      const constructing = r.buildProgress !== null;

      const g = new PIXI.Graphics();
      g.rect(x + 4, y + 4, ts - 8, ts - 8);
      g.fill({ color: constructing ? 0x666666 : baseColor, alpha: constructing ? 0.4 : 0.8 });
      this.roadLayer.addChild(g);

      // 建造进度条
      if (constructing) {
        const barW = ts - 12;
        const barH = 6;
        const barX = x + 6;
        const barY = y + ts / 2 - 5;

        const bg = new PIXI.Graphics();
        bg.rect(barX, barY, barW, barH);
        bg.fill({ color: 0x333333, alpha: 0.6 });
        this.roadLayer.addChild(bg);

        const fill = new PIXI.Graphics();
        fill.rect(barX, barY, 0, barH);
        fill.fill({ color: 0xffaa00, alpha: 0.9 });
        this.roadLayer.addChild(fill);

        const total = r.buildTime || 1;
        const cur = r.buildProgress ?? 0;
        const ratio = this._getConstructionRatio(r, total);
        fill.clear();
        fill.rect(barX, barY, barW * ratio, barH);
        fill.fill({ color: 0xffaa00, alpha: 0.9 });

        const displayCur = this._getConstructionDisplayProgress(r, total);
        const progressText = new PIXI.Text({
          text: `${displayCur}/${total}`,
          style: { fontSize: 9, fill: 0xffffff }
        });
        progressText.anchor.set(0.5);
        progressText.x = x + ts / 2;
        progressText.y = barY + barH + 6;
        this.roadLayer.addChild(progressText);

        this._roadBuildFills.push({
          fill,
          label: progressText,
          gridX: r.gridX,
          gridY: r.gridY,
          barX,
          barY,
          barWidth: barW,
          barHeight: barH
        });
      }
    }
  }

  // ===== 地图事件标记渲染 =====

  /**
   * 绘制地图上的事件标记（"?"）
   * 从 base_map.json 的 eventMarkers 数组读取
   * 已移除的标记（通过 Store 的 removedEventMarkers 记录）不渲染
   */
  _drawEventMarkers() {
    this._eventMarkerSprites = [];
    this._eventMarkerData = [];
    const markers = this.mapConfig.eventMarkers;
    if (!markers || markers.length === 0) return;

    const removedIds = store.getState('removedEventMarkers') || [];
    const removedSet = new Set(removedIds);
    const ts = this.tileSize;

    for (const marker of markers) {
      if (removedSet.has(marker.id)) continue;

      const { gridX, gridY } = marker;
      const x = gridX * ts;
      const y = gridY * ts;
      const w = ts;
      const h = ts;

      const container = new PIXI.Container();

      // 底色
      const bg = new PIXI.Graphics();
      bg.rect(x, y, w, h);
      bg.fill({ color: 0x8B6914, alpha: 0.7 });
      bg.rect(x, y, w, h);
      bg.stroke({ color: 0xFFD700, alpha: 0.9, width: 2 });
      container.addChild(bg);

      // "?" 图标
      const iconText = new PIXI.Text({
        text: '?',
        style: { fontSize: 28, fontWeight: 'bold', fill: 0xFFD700, align: 'center' }
      });
      iconText.anchor.set(0.5);
      iconText.x = x + w / 2;
      iconText.y = y + h / 2;
      container.addChild(iconText);

      // 添加到世界容器
      this.worldContainer.addChild(container);

      this._eventMarkerSprites.push(container);
      this._eventMarkerData.push(marker);
    }
  }

  /**
   * 移除指定的事件标记（点击后调用）
   */
  _removeEventMarkerSprite(markerId) {
    const idx = this._eventMarkerData.findIndex(m => m.id === markerId);
    if (idx < 0) return;

    // 从世界容器移除
    if (this._eventMarkerSprites[idx]) {
      this.worldContainer.removeChild(this._eventMarkerSprites[idx]);
      this._eventMarkerSprites[idx].destroy({ children: true });
    }

    this._eventMarkerSprites.splice(idx, 1);
    this._eventMarkerData.splice(idx, 1);

    // 更新 Store，持久化已移除标记
    const removed = store.getState('removedEventMarkers') || [];
    if (!removed.includes(markerId)) {
      store.setState({ removedEventMarkers: [...removed, markerId] });
    }
  }

  /**
   * 刷新事件标记（当 Store 中 removedEventMarkers 变化时调用）
   */
  _refreshEventMarkers() {
    // 清理旧标记
    for (const sprite of this._eventMarkerSprites) {
      this.worldContainer.removeChild(sprite);
      sprite.destroy({ children: true });
    }
    this._eventMarkerSprites = [];
    this._eventMarkerData = [];
    // 重新绘制
    this._drawEventMarkers();
  }

  // ===== 敌人渲染 =====

  _drawEnemies() {
    if (!this._combatSystem) return;
    const ts = this.tileSize;
    const enemies = this._combatSystem.getAllEnemies();
    // 清理旧敌人精灵
    if (this._enemyContainer) {
      this.worldContainer.removeChild(this._enemyContainer);
      this._enemyContainer.destroy({ children: true });
    }
    this._enemyContainer = new PIXI.Container();
    this.worldContainer.addChild(this._enemyContainer);

    for (const enemy of enemies) {
      const cfg = this._combatSystem.getEnemyConfig(enemy.enemyId);
      if (!cfg) continue;

      const x = enemy.gridX * ts;
      const y = enemy.gridY * ts;

      const container = new PIXI.Container();

      // 敌人底色（红色/灰色）
      const bg = new PIXI.Graphics();
      const isRobot = enemy.enemyId.startsWith('robot');
      const color = isRobot ? 0xcc4444 : 0xcc8844;
      bg.rect(x + 2, y + 2, ts - 4, ts - 4);
      bg.fill({ color, alpha: 0.7 });
      bg.rect(x + 2, y + 2, ts - 4, ts - 4);
      bg.stroke({ color: 0xff0000, alpha: 0.6, width: 2 });
      container.addChild(bg);

      // 敌人图标
      const icon = new PIXI.Text({
        text: isRobot ? '🤖' : '🐺',
        style: { fontSize: 24 }
      });
      icon.anchor.set(0.5);
      icon.x = x + ts / 2;
      icon.y = y + ts / 2;
      container.addChild(icon);

      // 血量条
      const hpPct = enemy.hp / enemy.maxHp;
      const barW = ts - 8;
      const barH = 4;
      const barX = x + 4;
      const barY = y + ts - 8;

      // 背景
      const barBg = new PIXI.Graphics();
      barBg.rect(barX, barY, barW, barH);
      barBg.fill({ color: 0x333333, alpha: 0.8 });
      container.addChild(barBg);

      // 填充
      const barFill = new PIXI.Graphics();
      const hpColor = hpPct > 0.5 ? 0x4ecb71 : (hpPct > 0.25 ? 0xf0a040 : 0xff4444);
      barFill.rect(barX, barY, barW * hpPct, barH);
      barFill.fill({ color: hpColor, alpha: 0.9 });
      container.addChild(barFill);

      this._enemyContainer.addChild(container);
    }

    // 渲染友方单位
    const units = this._combatSystem.getAllUnits();
    for (const unit of units) {
      const x = unit.gridX * ts;
      const y = unit.gridY * ts;
      const container = new PIXI.Container();

      const isTamed = unit.source === 'tamed';
      const unitCfg = window.__game?.configRegistry?.get('enemies')?.units?.find(u => u.id === unit.type);
      const isRanged = (unitCfg?.attackRange || unit.attackRange || 1) > 1;

      // 底色：驯化单位紫色，近战绿色，远程蓝色
      const bg = new PIXI.Graphics();
      const color = isTamed ? 0xcc88cc : (isRanged ? 0x4488cc : 0x44cc88);
      const strokeColor = isTamed ? 0xff88ff : 0x44ffaa;
      bg.rect(x + 2, y + 2, ts - 4, ts - 4);
      bg.fill({ color, alpha: 0.8 });
      bg.rect(x + 2, y + 2, ts - 4, ts - 4);
      bg.stroke({ color: strokeColor, alpha: 0.5, width: 2 });
      container.addChild(bg);

      // 图标
      let iconText;
      if (isTamed) {
        iconText = unit.tamedInfo?.icon || '🐾';
      } else {
        iconText = isArcher ? '🏹' : '⚔️';
      }
      const icon = new PIXI.Text({
        text: iconText,
        style: { fontSize: 22 }
      });
      icon.anchor.set(0.5);
      icon.x = x + ts / 2;
      icon.y = y + ts / 2;
      container.addChild(icon);

      // 驯化单位显示名称标签
      if (isTamed && unit.tamedInfo?.name) {
        const label = new PIXI.Text({
          text: unit.tamedInfo.name,
          style: { fontSize: 9, fill: 0xddccff }
        });
        label.anchor.set(0.5, 0);
        label.x = x + ts / 2;
        label.y = y + ts / 2 + 10;
        container.addChild(label);
      }

      // 血量条
      const hpPct = unit.hp / unit.maxHp;
      const barW = ts - 8;
      const barH = 4;
      const barX = x + 4;
      const barY = y + ts - 8;

      const barBg = new PIXI.Graphics();
      barBg.rect(barX, barY, barW, barH);
      barBg.fill({ color: 0x333333, alpha: 0.8 });
      container.addChild(barBg);

      const barFill = new PIXI.Graphics();
      const hpColor = hpPct > 0.5 ? 0x4ecb71 : (hpPct > 0.25 ? 0xf0a040 : 0xff4444);
      barFill.rect(barX, barY, barW * hpPct, barH);
      barFill.fill({ color: hpColor, alpha: 0.9 });
      container.addChild(barFill);

      this._enemyContainer.addChild(container);
    }
  }

  // ===== 迷雾渲染（Canvas 2D 离屏纹理）=====

  /**
   * 创建离屏 Canvas 用于渲染迷雾纹理（覆盖整个屏幕，固定视口）
   */
  _createFogCanvas() {
    // 迷雾画布覆盖视口范围（缩放越大，画布越小 → 靠 gameView 缩放撑满屏幕）
    const viewW = Math.ceil(this.screenW / this.zoom);
    const viewH = Math.ceil(this.screenH / this.zoom);

    this._fogCanvas = document.createElement('canvas');
    this._fogCanvas.width = viewW;
    this._fogCanvas.height = viewH;

    this._fogTexture = PIXI.Texture.from(this._fogCanvas);
    this._fogSprite = new PIXI.Sprite(this._fogTexture);
    // 迷雾精灵固定在视口原点（fogContainer 是固定的）
    this._fogSprite.x = 0;
    this._fogSprite.y = 0;
    this.fogContainer.addChild(this._fogSprite);

    this._updateFogTexture();
  }

  /**
   * 根据当前时段返回迷雾底色的不透明度（0=完全透明=白天，1=全黑=深夜）
   */
  _getFogBaseAlpha() {
    const period = store.getState('timePeriod') || 'morning';
    switch (period) {
      case 'morning':   return 0.05;  // 清晨：基本无暗化
      case 'afternoon': return 0.00;  // 下午：完全明亮
      case 'evening':   return 0.45;  // 傍晚：明显变暗
      case 'night':     return 0.82;  // 深夜：接近全黑（建筑/道路光照范围除外）
      default:          return 0.05;
    }
  }

  /**
   * 收集所有光源矩形（网格坐标）
   * n×n建筑：(n+2)×(n+2) 居中于建筑占地
   */
  _computeLightRects() {
    const rects = [];
    if (this.buildingSystem) {
      for (const b of this.buildingSystem.buildings) {
        if (b.status !== 'active') continue;
        const cfg = configRegistry.getBuilding(b.buildingId);
        if (!cfg) continue;
        const bw = cfg.footprint.width;
        const bh = cfg.footprint.height;
        rects.push({ gx: b.gridX - 1, gy: b.gridY - 1, gw: bw + 2, gh: bh + 2 });
      }
    }
    if (this._roadSystem) {
      for (const road of this._roadSystem.roads) {
        if (road.buildProgress !== null) continue;
        rects.push({ gx: road.gridX - 1, gy: road.gridY - 1, gw: 3, gh: 3 });
      }
    }
    return rects;
  }

  /**
   * 在 Canvas 2D 上重新绘制迷雾纹理
   * 建筑+道路提供矩形光照，其余区域按时段暗化
   */
  _updateFogTexture() {
    if (!this._fogCanvas) return;

    const ctx = this._fogCanvas.getContext('2d');
    const ts = this.tileSize;
    const w = this._fogCanvas.width;
    const h = this._fogCanvas.height;

    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    const baseAlpha = this._getFogBaseAlpha();
    if (baseAlpha > 0) {
      ctx.fillStyle = `rgba(8, 8, 26, ${baseAlpha})`;
      ctx.fillRect(0, 0, w, h);
    }

    const rects = this._computeLightRects();

    // 可见性矩阵：每格中心是否在光照范围内
    const { gridWidth: gw, gridHeight: gh } = this.mapConfig;
    const visible = Array.from({ length: gh }, () => Array(gw).fill(false));
    for (const r of rects) {
      const c1 = Math.max(0, Math.ceil(r.gx));
      const c2 = Math.min(gw - 1, Math.floor(r.gx + r.gw - 0.001));
      const r1 = Math.max(0, Math.ceil(r.gy));
      const r2 = Math.min(gh - 1, Math.floor(r.gy + r.gh - 0.001));
      for (let row = r1; row <= r2; row++) {
        for (let col = c1; col <= c2; col++) {
          visible[row][col] = true;
        }
      }
    }
    this._visibleGrid = visible;

    if (rects.length > 0) {
      ctx.globalCompositeOperation = 'destination-out';
      for (const r of rects) {
        const sx = r.gx * ts - this.camX;
        const sy = r.gy * ts - this.camY;
        const sw = r.gw * ts;
        const sh = r.gh * ts;

        if (sx + sw < -ts * 3 || sx > w + ts * 3 || sy + sh < -ts * 3 || sy > h + ts * 3) continue;

        // 以光源矩形中心为圆心，绘制大范围径向渐变自然光
        const cwx = sx + sw / 2;
        const cwy = sy + sh / 2;
        const coreR = Math.min(sw, sh) * 0.45;
        const glowR = Math.max(sw, sh) * 1.5 + ts * 1.5;

        const grad = ctx.createRadialGradient(cwx, cwy, coreR, cwx, cwy, glowR);
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(0.15, 'rgba(0,0,0,1)');
        grad.addColorStop(0.3, 'rgba(0,0,0,0.85)');
        grad.addColorStop(0.5, 'rgba(0,0,0,0.5)');
        grad.addColorStop(0.7, 'rgba(0,0,0,0.15)');
        grad.addColorStop(0.85, 'rgba(0,0,0,0.03)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = grad;
        ctx.fillRect(cwx - glowR, cwy - glowR, glowR * 2, glowR * 2);
      }
    }

    ctx.globalCompositeOperation = 'source-over';

    if (this._fogTexture.source) {
      this._fogTexture.source.update();
    }

    if (this._fogSprite) {
      this._fogSprite.x = 0;
      this._fogSprite.y = 0;
    }
  }

  _isTileRevealed(col, row) {
    return true;
  }

  /**
   * 进入挪动模式（右下角按钮切换）
   */
  enterMoveMode() {
    this._moveMode = true;
    eventBus.emit('moveModeChanged', { enabled: true });
  }

  /**
   * 退出挪动模式
   */
  exitMoveMode() {
    this._moveMode = false;
    if (this._dragBuildingIndex !== null) {
      this._clearBuildingDragGhost();
      this._dragBuildingIndex = null;
      this._dragBuildingConfig = null;
    }
    eventBus.emit('moveModeChanged', { enabled: false });
  }

  /**
   * 切换挪动模式（放置建筑时禁止）
   */
  toggleMoveMode() {
    if (this._roadSystem && this._roadSystem.isEditMode()) return;
    if (this.buildingSystem.placingState === 'PLACING') return;
    if (this._moveMode) {
      this.exitMoveMode();
    } else {
      this.enterMoveMode();
    }
  }

  /** 是否处于挪动模式 */
  isMoveMode() { return this._moveMode; }

  /**
   * 从建筑详情面板搬迁建筑（蓝色指示框+点击放置）
   */
  startBuildingMove(buildingIndex) {
    const building = this.buildingSystem.buildings[buildingIndex];
    if (!building) return false;
    const config = configRegistry.getBuilding(building.buildingId);
    if (!config || config.draggable === false) return false;
    this._relocateIndex = buildingIndex;
    this._relocateConfig = config;
    return true;
  }

  /**
   * 绘制光源最大边缘描边（Alt 键按下时显示）
   */
  _drawLightOutline() {
    this.lightOverlay.removeChildren();
    const g = new PIXI.Graphics();
    const ts = this.tileSize;
    const { gridWidth: gw, gridHeight: gh } = this.mapConfig;

    const rects = this._computeLightRects();
    const visible = Array.from({ length: gh }, () => Array(gw).fill(false));
    for (const r of rects) {
      const c1 = Math.max(0, Math.ceil(r.gx));
      const c2 = Math.min(gw - 1, Math.floor(r.gx + r.gw - 0.001));
      const r1 = Math.max(0, Math.ceil(r.gy));
      const r2 = Math.min(gh - 1, Math.floor(r.gy + r.gh - 0.001));
      for (let row = r1; row <= r2; row++) {
        for (let col = c1; col <= c2; col++) {
          visible[row][col] = true;
        }
      }
    }

    // 填充所有光照格子（黄色半透明），并描边最外层边缘
    for (let row = 0; row < gh; row++) {
      for (let col = 0; col < gw; col++) {
        if (!visible[row][col]) continue;
        g.rect(col * ts, row * ts, ts, ts);
      }
    }
    g.fill({ color: 0xffcc00, alpha: 0.2 });
    g.stroke({ color: 0xffcc00, width: 1.5, alpha: 0.7 });
    this.lightOverlay.addChild(g);
  }

  /**
   * 更新视口中心坐标显示
   */
  _updateViewportCenter() {
    const ts = this.tileSize;
    const screenCX = this.screenW / 2;
    const screenCY = this.screenH / 2;
    const worldX = this.camX + screenCX / this.zoom;
    const worldY = this.camY + screenCY / this.zoom;
    const cx = Math.round(worldX / ts);
    const cy = Math.round(worldY / ts);
    const el = document.getElementById('viewport-center-display');
    if (el) {
      el.innerHTML = `<div class="vc-row"><span class="vc-label">X</span><span class="vc-coord">${cx}</span></div><div class="vc-row"><span class="vc-label">Y</span><span class="vc-coord">${cy}</span></div>`;
    }
  }

  /**
   * 绘制当前屏幕范围内的地形（视口裁剪 + 视口本地坐标）
   * 参考 planner-config.html 的 drawTerrainTiles 方案：
   * terrainContainer 固定在 (0,0)，地形以本地坐标绘制 → 始终铺满屏幕
   * 分层：纹理 Sprite（顶层）→ 纯色 Graphics（底层）
   */
  _drawTerrainChunk() {
    this._clearTerrainGraphics();
    this._clearTerrainSprites();

    const { gridWidth, gridHeight, tileSize, grid, groundTypes } = this.mapConfig;
    const ts = tileSize;
    const viewW = this.screenW / this.zoom;
    const viewH = this.screenH / this.zoom;

    const startCol = Math.max(0, Math.floor(this.camX / ts));
    const endCol = Math.min(gridWidth - 1, Math.ceil((this.camX + viewW) / ts));
    const startRow = Math.max(0, Math.floor(this.camY / ts));
    const endRow = Math.min(gridHeight - 1, Math.ceil((this.camY + viewH) / ts));

    const mapW = gridWidth * ts;
    const mapH = gridHeight * ts;

    // --- 1. 纹理 Sprite（预加载保证纹理已就绪，排在子列表末尾=最顶层） ---
    this._terrainSprites = [];

    // 先确定可见范围内哪些格用变体纹理（两遍扫描 + 防相邻）
    const variantSet = this._tileVariants;
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const key = `${col},${row}`;
        if (variantSet.has(key)) continue;

        const gt = groundTypes[grid[row][col]];
        if (!gt || !gt.variants || gt.variants.length === 0) {
          variantSet.set(key, false); continue;
        }
        // 总变体概率 = 各变体概率之和
        const totalChance = gt.variants.reduce((s, v) => s + v.chance, 0);
        if (!this._isVariantCandidate(col, row, totalChance)) {
          variantSet.set(key, false); continue;
        }
        variantSet.set(key, 'candidate');
      }
    }
    // 清除相邻候选
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const key = `${col},${row}`;
        if (variantSet.get(key) !== 'candidate') continue;
        let blocked = false;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nv = variantSet.get(`${col + dc},${row + dr}`);
            if (nv === 'candidate' || (typeof nv === 'number' && nv >= 0)) { blocked = true; break; }
          }
          if (blocked) break;
        }
        if (blocked) { variantSet.set(key, false); continue; }
        // 轮盘选择：根据各变体权重随机选一个
        const gt = groundTypes[grid[row][col]];
        let roll = Math.random() * gt.variants.reduce((s, v) => s + v.chance, 0);
        let pick = 0;
        for (let vi = 0; vi < gt.variants.length; vi++) {
          roll -= gt.variants[vi].chance;
          if (roll <= 0) { pick = vi; break; }
        }
        variantSet.set(key, pick);
      }
    }
    // 兜底
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const key = `${col},${row}`;
        if (variantSet.get(key) === 'candidate') variantSet.set(key, false);
      }
    }

    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const gt = groundTypes[grid[row][col]];
        // 无纹理且无变体/行纹 → 纯色回退
        if (!gt || (!gt.texture && !gt.variants && !gt.rowPatterns && !gt.neighborOverrides)) continue;

        // neighborOverrides 优先于 rowPatterns
        let texPath = gt.texture;
        if (gt.neighborOverrides) {
          for (const o of gt.neighborOverrides) {
            const nr = row + o.dy;
            const nc = col + o.dx;
            if (nr >= 0 && nr < gridHeight && nc >= 0 && nc < gridWidth) {
              if (grid[nr][nc] === o.match) { texPath = o.texture; break; }
            }
          }
        }
        // rowPatterns 次优先
        if (texPath === gt.texture && gt.rowPatterns) {
          for (const p of gt.rowPatterns) {
            const r = p.fromBottom ? (gridHeight - 1 - row) : row;
            if (r % p.interval === 0) { texPath = p.texture; break; }
          }
        }
        if (texPath === gt.texture) {
          const vi = variantSet.get(`${col},${row}`);
          if (typeof vi === 'number' && vi >= 0 && gt.variants) {
            texPath = gt.variants[vi].texture;
          }
        }
        // proximityOverrides: 靠近特定坐标时替换纹理（如矿洞入口）
        if (gt.proximityOverrides) {
          for (const o of gt.proximityOverrides) {
            if (o.match && texPath !== o.match) continue;
            const dx = col - o.center.gridX;
            const dy = row - o.center.gridY;
            if (Math.abs(dx) <= o.radius && Math.abs(dy) <= o.radius) {
              texPath = o.texture; break;
            }
          }
        }
        // 无可用纹理 → 纯色回退（Graphics 层已绘制）
        if (!texPath) continue;

        const tex = this._getTexture(texPath);
        if (!tex || tex.width <= 0) continue;

        const sprite = new PIXI.Sprite(tex);
        sprite.x = col * ts - this.camX;
        sprite.y = row * ts - this.camY;
        sprite.width = ts;
        sprite.height = ts;
        this.terrainContainer.addChild(sprite);
        this._terrainSprites.push(sprite);
      }
    }

    // --- 2. 纯色底 + 网格线（Graphics，insert at index 0 = 最底层） ---
    const graphics = new PIXI.Graphics();

    graphics.rect(-this.camX, -this.camY, mapW, mapH);
    graphics.fill({ color: 0x0a0a18, alpha: 1 });

    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const char = grid[row][col];
        const groundType = groundTypes[char];
        const color = groundType ? parseInt(groundType.colorHint.replace('#', ''), 16) : 0x333333;
        const lx = col * ts - this.camX;
        const ly = row * ts - this.camY;

        graphics.rect(lx, ly, ts, ts);
        graphics.fill({ color, alpha: 1 });

        graphics.rect(lx, ly, ts, ts);
        graphics.stroke({ color: 0x000000, alpha: 0.15, width: 1 });
      }
    }

    // 地图边界线
    graphics.rect(-this.camX, -this.camY, mapW, mapH);
    graphics.stroke({ color: 0x886633, alpha: 0.9, width: 4 });
    graphics.rect(2 - this.camX, 2 - this.camY, mapW - 4, mapH - 4);
    graphics.stroke({ color: 0xffaa44, alpha: 0.3, width: 1 });

    this.terrainContainer.addChildAt(graphics, 0);
    this._terrainGraphics = graphics;

    // 调试地块标注
    if (this._terrainLabelLayer.visible) {
      this._drawTerrainLabels();
    }
  }

  _clearTerrainSprites() {
    if (!this._terrainSprites) return;
    for (const s of this._terrainSprites) {
      this.terrainContainer.removeChild(s);
      s.destroy();
    }
    this._terrainSprites = [];
  }

  _clearTerrainGraphics() {
    if (this._terrainGraphics) {
      this.terrainContainer.removeChild(this._terrainGraphics);
      this._terrainGraphics.destroy();
      this._terrainGraphics = null;
    }
  }

  /**
   * 基于坐标的确定性哈希：判断该格是否为变体候选（不负责相邻检查）
   */
  _isVariantCandidate(col, row, chance) {
    // 多层混合哈希，避免同列/同行聚集
    let h = ((col * 374761393 + row * 668265263) ^ 0x5bd1e995) >>> 0;
    h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return (h % 100000) / 100000 < chance;
  }

  /**
   * 绘制当前视口范围内每格的地形代码标注（调试用）
   * 仅在 _terrainLabelLayer.visible 时调用
   */
  _drawTerrainLabels() {
    // 清理旧文本
    for (const t of this._terrainLabels) {
      this._terrainLabelLayer.removeChild(t);
      t.destroy();
    }
    this._terrainLabels = [];

    const { gridWidth, gridHeight, tileSize, grid, groundTypes } = this.mapConfig;
    const ts = tileSize;
    const viewW = this.screenW / this.zoom;
    const viewH = this.screenH / this.zoom;
    const startCol = Math.max(0, Math.floor(this.camX / ts));
    const endCol = Math.min(gridWidth - 1, Math.ceil((this.camX + viewW) / ts));
    const startRow = Math.max(0, Math.floor(this.camY / ts));
    const endRow = Math.min(gridHeight - 1, Math.ceil((this.camY + viewH) / ts));

    // 字号随缩放调整，保证缩放后视觉大小稳定（worldContainer 整体被 zoom 缩放）
    const fontSize = Math.max(8, Math.round(14 / this.zoom));

    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const char = grid[row][col];
        const gt = groundTypes[char];
        // 屏障/边界等不标注，避免噪声
        if (!gt) continue;

        const label = new PIXI.Text({
          text: char,
          style: { fontSize, fill: 0xffffff, align: 'center', fontWeight: 'bold' }
        });
        label.anchor.set(0.5);
        label.x = col * ts + ts / 2;
        label.y = row * ts + ts / 2;
        // 半透明黑底提高对比度
        label.alpha = 0.85;
        this._terrainLabelLayer.addChild(label);
        this._terrainLabels.push(label);
      }
    }
  }

  /**
   * 开关地块标注（调试用）
   * 开启时在每格中央绘制地形代码（R/G/D/F/M/W/B），便于排查建造/地形问题
   */
  setTerrainLabelsEnabled(enabled) {
    const next = !!enabled;
    if (next === this._terrainLabelLayer.visible) return;
    this._terrainLabelLayer.visible = next;
    if (next) {
      this._drawTerrainLabels();
    }
  }

  isTerrainLabelsEnabled() {
    return this._terrainLabelLayer.visible;
  }

  /**
   * 更新世界层容器位置（建筑/火把/虚影跟随相机平移）
   */
  _updateWorldContainerPosition() {
    this.worldContainer.x = -this.camX;
    this.worldContainer.y = -this.camY;
    this._updateViewportCenter();
  }

  /**
   * 钳制相机到地图边界
   * 地图大于屏幕时不许拖出边界；地图小于屏幕时居中
   */
  _clampCamera() {
    const { gridWidth, gridHeight, tileSize } = this.mapConfig;
    const mapW = gridWidth * tileSize;
    const mapH = gridHeight * tileSize;

    if (mapW <= this.screenW) {
      this.camX = (mapW - this.screenW) / 2;
    } else {
      this.camX = Math.max(0, Math.min(this.camX, mapW - this.screenW));
    }
    if (mapH <= this.screenH) {
      this.camY = (mapH - this.screenH) / 2;
    } else {
      this.camY = Math.max(0, Math.min(this.camY, mapH - this.screenH));
    }
  }

  _centerView() {
    const ts = this.tileSize;
    // 优先级1：配置的初始相机位置（以网格坐标指定，新游戏开局居中于永恒火把等关键建筑）
    const initCam = this.mapConfig.initialCamera;
    if (initCam && initCam.gridX != null && initCam.gridY != null) {
      // 将网格坐标居中到屏幕中心
      this.camX = (initCam.gridX + 0.5) * ts - this.screenW / 2;
      this.camY = (initCam.gridY + 0.5) * ts - this.screenH / 2;
      if (initCam.zoom != null) {
        this.zoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, initCam.zoom));
        this.gameView.scale.set(this.zoom);
      }
    } else if (this.mapConfig.viewportCenter &&
               this.mapConfig.viewportCenter.defaultGridX != null &&
               this.mapConfig.viewportCenter.defaultGridY != null) {
      // 优先级2：viewportCenter.defaultGridX/Y（配置中标记的"世界中心"，通常对应永恒火把）
      const vc = this.mapConfig.viewportCenter;
      this.camX = (vc.defaultGridX + 0.5) * ts - this.screenW / 2;
      this.camY = (vc.defaultGridY + 0.5) * ts - this.screenH / 2;
      if (vc.defaultZoom != null) {
        this.zoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, vc.defaultZoom));
        this.gameView.scale.set(this.zoom);
      }
    } else {
      // 优先级3：回退到地图几何中心
      const { gridWidth, gridHeight, tileSize } = this.mapConfig;
      const mapW = gridWidth * tileSize;
      const mapH = gridHeight * tileSize;
      this.camX = (mapW - this.screenW) / 2;
      this.camY = (mapH - this.screenH) / 2;
    }
    this._clampCamera();
    this._updateWorldContainerPosition();
  }

  _setupInteraction() {
    const canvas = this.app.canvas;

    // 建筑拖动状态
    this._dragBuildingIndex = null;
    this._dragBuildingConfig = null;

    // 挪动模式（右下角开关控制）
    this._moveMode = false;

    // 搬迁模式（从详情面板发起）
    this._relocateIndex = null;
    this._relocateConfig = null;

    canvas.addEventListener('pointerdown', (e) => {
      const gridPos = this._clientToGrid(e.clientX, e.clientY);

      // 道路编辑模式
      if (this._roadSystem && this._roadSystem.isEditMode() && gridPos) {
        const existing = this._roadSystem.getRoadAt(gridPos.col, gridPos.row);
        if (existing && existing.buildProgress === null) {
          this._roadSystem.removeRoad(gridPos.col, gridPos.row);
        } else if (!existing) {
          this._roadSystem.buildRoad(gridPos.col, gridPos.row);
        }
        this._drawRoads();
        this._updateFogTexture();
        return;
      }

      // 放置建筑模式：禁止切换挪动模式，保持常时行为
      if (this.buildingSystem.placingState === 'PLACING') {
        this.isDragging = true;
        this.hasMoved = false;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.dragStartCamX = this.camX;
        this.dragStartCamY = this.camY;
        return;
      }

      // 搬迁模式：点击放置建筑
      if (this._relocateIndex !== null && gridPos) {
        const moved = this.buildingSystem.moveBuilding(this._relocateIndex, gridPos.col, gridPos.row);
        if (moved) {
          this.refreshBuildings();
          this._updateFogTexture();
        }
        this._clearRelocateGhost();
        this._relocateIndex = null;
        this._relocateConfig = null;
        return;
      }

      // 挪动模式：仅允许拖动建筑，不拖动地图不点击建筑
      if (this._moveMode && gridPos) {
        const buildingIndex = this._getBuildingAt(gridPos.col, gridPos.row);
        if (buildingIndex >= 0) {
          const building = this.buildingSystem.buildings[buildingIndex];
          const bldgConfig = configRegistry.getBuilding(building.buildingId);
          if (building && building.status === 'active' && bldgConfig?.draggable !== false) {
            this._dragBuildingIndex = buildingIndex;
            this._dragBuildingConfig = bldgConfig;
            this._dragStartGridX = building.gridX;
            this._dragStartGridY = building.gridY;
            this.hasMoved = false;
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
            return;
          }
        }
        return; // 挪动模式下点击空白无操作
      }

      // 常时模式：检查单位拖动
      if (gridPos && this._combatSystem) {
        const unitIdx = this._combatSystem.units.findIndex(u => u.gridX === gridPos.col && u.gridY === gridPos.row);
        if (unitIdx >= 0) {
          this._dragUnitIndex = unitIdx;
          this.hasMoved = false;
          this.dragStartX = e.clientX;
          this.dragStartY = e.clientY;
          return;
        }
      }

      // 常时模式：地图平移
      this.isDragging = true;
      this.hasMoved = false;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.dragStartCamX = this.camX;
      this.dragStartCamY = this.camY;
    });

    canvas.addEventListener('pointermove', (e) => {
      // 道路编辑模式
      if (this._roadSystem && this._roadSystem.isEditMode()) {
        this._updateRoadGhost(e.clientX, e.clientY);
        return;
      }

      // 单位拖动
      if (this._dragUnitIndex !== null) {
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) this.hasMoved = true;
        this._updateUnitDragGhost(e.clientX, e.clientY);
        return;
      }

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
        // 固定视口方案：拖拽更新相机位置 → 重绘地形和迷雾（参考 planner 每帧 drawMapCanvas）
        // 屏幕像素 → 世界像素：除以 zoom
        this.camX = this.dragStartCamX - dx / this.zoom;
        this.camY = this.dragStartCamY - dy / this.zoom;
        this._clampCamera();
        this._updateWorldContainerPosition();
        this._drawTerrainChunk();
        this._updateFogTexture();
      }

      // 放置模式下更新虚影
      if (this.buildingSystem.placingState === 'PLACING') {
        this._updateGhost(e.clientX, e.clientY);
      }

      // 搬迁模式下更新蓝色虚影
      if (this._relocateIndex !== null) {
        this._updateRelocateGhost(e.clientX, e.clientY);
      }

      // 驯化单位部署模式下更新虚影
      if (this._combatSystem && this._combatSystem.isDeployTamedMode()) {
        this._updateDeployGhost(e.clientX, e.clientY);
      }
    });

    canvas.addEventListener('pointerup', (e) => {
      // 单位拖动结束
      if (this._dragUnitIndex !== null) {
        const unitIdx = this._dragUnitIndex;
        this._dragUnitIndex = null;
        this._clearUnitDragGhost();

        if (this.hasMoved) {
          const gridPos = this._clientToGrid(e.clientX, e.clientY);
          if (gridPos && this._combatSystem) {
            const unit = this._combatSystem.units[unitIdx];
            if (unit) {
              unit.gridX = gridPos.col;
              unit.gridY = gridPos.row;
              this._drawEnemies();
            }
          }
        }
        this.isDragging = false;
        this.hasMoved = false;
        return;
      }

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
          // 挪动模式下点击不放查看详情
          if (!this._moveMode) {
            eventBus.emit('buildingClicked', { buildingIndex });
          }
        }
        return;
      }

      if (this.isDragging && !this.hasMoved) {
        this._onClick(e);
      }
      // 地形和迷雾已在 pointermove 中实时更新，无需在 pointerup 重复处理
      this.isDragging = false;
    });

    canvas.addEventListener('pointerleave', () => {
      // 清理单位拖动
      if (this._dragUnitIndex !== null) {
        this._clearUnitDragGhost();
        this._dragUnitIndex = null;
      }
      // 清理建筑拖动
      if (this._dragBuildingIndex !== null) {
        this._clearBuildingDragGhost();
        this._dragBuildingIndex = null;
        this._dragBuildingConfig = null;
      }
      // 拖拽中离开画布 → 地形和迷雾已在 pointermove 中实时更新
      this.isDragging = false;
    });

    // Esc 取消放置
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._roadSystem && this._roadSystem.isEditMode()) {
        this._roadSystem.exitEditMode();
        this._clearRoadGhost();
      }
      if (e.key === 'Escape' && this.buildingSystem.placingState === 'PLACING') {
        this.buildingSystem.exitPlacingMode();
        this._clearGhost();
      }
      if (e.key === 'Escape' && this._combatSystem && this._combatSystem.isPlaceEnemyMode()) {
        this._combatSystem.exitPlaceEnemyMode();
      }
      if (e.key === 'Escape' && this._combatSystem && this._combatSystem.isDeployTamedMode()) {
        this._combatSystem.exitDeployTamedMode();
        this._clearGhost();
      }
      // Esc 退出搬迁模式
      if (e.key === 'Escape' && this._relocateIndex !== null) {
        this._clearRelocateGhost();
        this._relocateIndex = null;
        this._relocateConfig = null;
      }
      // 6.F键切换挪动模式
      if (e.key === 'f' || e.key === 'F') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          this.toggleMoveMode();
        }
      }
      if (e.key === 'Alt' && !e.repeat) {
        e.preventDefault();
        this._drawLightOutline();
        this.lightOverlay.visible = true;
        window.__game?.systems?.quest?.onPlayerAction('view_light');
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'Alt') {
        this.lightOverlay.visible = false;
        this.lightOverlay.removeChildren();
      }
    });

    // 滚轮缩放（以鼠标为中心，参考 planner 的 zoom-toward-cursor）
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const oldZoom = this.zoom;
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, oldZoom * zoomFactor));

      if (newZoom === oldZoom) return;

      // 缩放以鼠标位置为中心：保持鼠标下的世界点不变
      // wp = cx / oldZoom + oldCamX = cx / newZoom + newCamX
      // newCamX = oldCamX + cx * (1/oldZoom - 1/newZoom)
      this.camX = this.camX + e.clientX * (1 / oldZoom - 1 / newZoom);
      this.camY = this.camY + e.clientY * (1 / oldZoom - 1 / newZoom);
      this.zoom = newZoom;

      // 应用缩放到游戏视图
      this.gameView.scale.set(this.zoom);

      // 缩放改变后重新钳制相机、重绘地形和迷雾
      this._clampCamera();
      this._updateWorldContainerPosition();
      this._recreateFogCanvas();
      this._drawTerrainChunk();
    }, { passive: false });
  }

  _onClick(e) {
    const clientX = e.clientX;
    const clientY = e.clientY;
    const gridPos = this._clientToGrid(clientX, clientY);
    if (!gridPos) return;

    // 放置敌人模式
    if (this._combatSystem && this._combatSystem.isPlaceEnemyMode()) {
      if (!this._isTileRevealed(gridPos.col, gridPos.row)) return;
      const enemyId = this._combatSystem.getPlaceEnemyId();
      if (enemyId) {
        this._combatSystem._spawnEnemyAt(enemyId, gridPos.col, gridPos.row);
        this._drawEnemies();
      }
      return;
    }

    // 驯化单位部署模式
    if (this._combatSystem && this._combatSystem.isDeployTamedMode()) {
      if (this._isTileRevealed(gridPos.col, gridPos.row)) {
        const success = this._combatSystem.deployTamed(gridPos.col, gridPos.row);
        if (success) {
          this._combatSystem.exitDeployTamedMode();
          this._clearGhost();
        }
        this._drawEnemies();
      }
      return;
    }

    if (this.buildingSystem.placingState === 'PLACING') {

      const buildingId = this.buildingSystem.placingBuildingId;
      const config = configRegistry.getBuilding(buildingId);
      if (!config) return;

      // 以点击位置为左上角
      const keepPlacing = e.ctrlKey || e.metaKey;
      const success = this.buildingSystem.placeBuilding(gridPos.col, gridPos.row, buildingId, { keepPlacing });
      if (success) {
        if (keepPlacing) {
          this._updateGhost(clientX, clientY);
        } else {
          this._clearGhost();
        }
        this.refreshBuildings();
      }
    } else {
      // 检查迷雾门控
      if (!this._isTileRevealed(gridPos.col, gridPos.row)) return;

      // 检查是否点击了事件标记（"?"）
      const clickedMarker = this._isClickOnEventMarker(gridPos.col, gridPos.row);
      if (clickedMarker) {
        eventBus.emit('eventMarkerClicked', clickedMarker);
        return;
      }

      // 检查是否点击了探险出发口
      const clickedEntrance = this._isClickOnExpeditionEntrance(gridPos.col, gridPos.row);
      if (clickedEntrance) {
        eventBus.emit('expeditionEntranceClicked', clickedEntrance);
        return;
      }

      // 检查是否点击了建筑
      const buildingIndex = this._getBuildingAt(gridPos.col, gridPos.row);
      if (buildingIndex >= 0) {
        eventBus.emit('buildingClicked', { buildingIndex });
        return;
      }

      // 检查是否点击了敌人（反击）
      if (this._combatSystem) {
        const enemy = this._combatSystem.getEnemyAt(gridPos.col, gridPos.row);
        if (enemy) {
          this._combatSystem.playerAttack(gridPos.col, gridPos.row);
          this._drawEnemies();
          return;
        }
      }

      // 检查是否点击了友方单位（查看血量）
      if (this._combatSystem) {
        const unit = this._combatSystem.getUnitAt(gridPos.col, gridPos.row);
        if (unit) {
          const unitCfg = window.__game?.configRegistry?.get('enemies')?.units?.find(u => u.id === unit.type);
          const unitName = unit.source === 'tamed' ? (unit.tamedInfo?.name || '驯化单位') : (unitCfg?.name || unit.type || '战斗单位');
          const hpText = `💙 ${unitName} HP ${unit.hp}/${unit.maxHp}`;
          eventBus.emit('combatBroadcast', { message: hpText });
          return;
        }
      }
    }
  }

  /**
   * 检查点击是否在某个探险出发口范围内，返回入口对象或 null
   */
  _isClickOnExpeditionEntrance(col, row) {
    const entrances = this._expeditionEntrances;
    if (!entrances || entrances.length === 0) return null;
    for (const entrance of entrances) {
      if (col === entrance.gridX && row === entrance.gridY) {
        return entrance;
      }
    }
    return null;
  }

  /**
   * 检查点击是否在某个事件标记范围内，返回标记对象或 null
   */
  _isClickOnEventMarker(col, row) {
    const data = this._eventMarkerData;
    if (!data || data.length === 0) return null;
    const removedSet = new Set(store.getState('removedEventMarkers') || []);
    for (const marker of data) {
      if (removedSet.has(marker.id)) continue;
      if (col === marker.gridX && row === marker.gridY) {
        return marker;
      }
    }
    return null;
  }

  /**
   * 获取已移除标记 ID 列表（用于存档）
   */
  getMarkerState() {
    return store.getState('removedEventMarkers') || [];
  }

  /**
   * 从存档恢复已移除标记状态
   */
  restoreMarkerState(removedIds) {
    store.setState({ removedEventMarkers: removedIds || [] });
    this._refreshEventMarkers();
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

    const zoom = this.zoom || 1;
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

      // 3D 下也需要除以 zoom：pixi 坐标是 gameView 本地坐标
      worldX = pixiX / zoom + this.camX;
      worldY = pixiY / zoom + this.camY;
    } else {
      // 2D 平面模式：gameView 在 (0,0) 且 scale=zoom
      // 屏幕坐标 → gameView 本地坐标：除以 zoom
      // worldX = localX + camX = screenX / zoom + camX
      worldX = clientX / zoom + this.camX;
      worldY = clientY / zoom + this.camY;
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

    // 显示相邻加成提示（即使位置无效也显示交互信息）
    this._updateAdjacencyHints(gridPos.col, gridPos.row, buildingId, this.ghostValid);
  }

  // ===== 驯化单位部署虚影 =====

  _updateDeployGhost(clientX, clientY) {
    const gridPos = this._clientToGrid(clientX, clientY);
    if (!gridPos || !this._combatSystem) {
      this._clearGhost();
      return;
    }

    const valid = this._combatSystem.canDeployTamedAt(gridPos.col, gridPos.row);
    this.ghostValid = valid;

    this._clearGhost();

    const ts = this.tileSize;
    const graphics = new PIXI.Graphics();
    const x = gridPos.col * ts;
    const y = gridPos.row * ts;
    const color = valid ? 0x44ff44 : 0xff4444;

    graphics.rect(x + 2, y + 2, ts - 4, ts - 4);
    graphics.fill({ color, alpha: 0.35 });
    graphics.rect(x + 2, y + 2, ts - 4, ts - 4);
    graphics.stroke({ color, alpha: 0.8, width: 2 });

    // 显示生物图标预览
    const tamedId = this._combatSystem.getDeployTamedId();
    if (tamedId) {
      const pool = this._combatSystem.getTamedPool();
      const creature = pool.find(t => t.id === tamedId);
      if (creature) {
        const icon = new PIXI.Text({
          text: creature.icon || '🐾',
          style: { fontSize: 22 }
        });
        icon.anchor.set(0.5);
        icon.x = x + ts / 2;
        icon.y = y + ts / 2;
        icon.alpha = 0.6;
        this.ghostLayer.addChild(icon);
        // Store separately for cleanup
        if (!this._ghostExtras) this._ghostExtras = [];
        this._ghostExtras.push(icon);
      }
    }

    this.ghostLayer.addChild(graphics);
    this.ghostGraphic = graphics;
  }

  _clearGhost() {
    if (this.ghostGraphic) {
      this.ghostLayer.removeChild(this.ghostGraphic);
      this.ghostGraphic.destroy();
      this.ghostGraphic = null;
    }
    if (this._ghostExtras) {
      for (const extra of this._ghostExtras) {
        this.ghostLayer.removeChild(extra);
        extra.destroy();
      }
      this._ghostExtras = [];
    }
    this._clearAdjacencyHints();
  }

  _updateRoadGhost(clientX, clientY) {
    const gridPos = this._clientToGrid(clientX, clientY);
    this._clearRoadGhost();
    if (!gridPos) return;
    let valid = false;
    if (this._roadSystem) {
      const check = this._roadSystem.canBuildRoad(gridPos.col, gridPos.row);
      valid = check.valid;
    }
    const x = gridPos.col * this.tileSize;
    const y = gridPos.row * this.tileSize;
    const ts = this.tileSize;
    const g = new PIXI.Graphics();
    g.rect(x, y, ts, ts);
    g.fill({ color: valid ? 0x44ff44 : 0xff4444, alpha: 0.25 });
    g.rect(x, y, ts, ts);
    g.stroke({ color: valid ? 0x44ff44 : 0xff4444, alpha: 0.9, width: 2 });
    this.ghostLayer.addChild(g);
    this._roadGhost = g;
  }

  _clearRoadGhost() {
    if (this._roadGhost) {
      this.ghostLayer.removeChild(this._roadGhost);
      this._roadGhost.destroy();
      this._roadGhost = null;
    }
  }

  // ===== 建筑拖动虚影 =====

  /**
   * 更新建筑拖动时的目标位置虚影
   */
  _updateUnitDragGhost(clientX, clientY) {
    const gridPos = this._clientToGrid(clientX, clientY);
    this._clearUnitDragGhost();
    if (!gridPos) return;

    const ts = this.tileSize;
    const x = gridPos.col * ts;
    const y = gridPos.row * ts;

    const graphics = new PIXI.Graphics();
    graphics.rect(x + 2, y + 2, ts - 4, ts - 4);
    graphics.fill({ color: 0x44ffaa, alpha: 0.25 });
    graphics.rect(x + 2, y + 2, ts - 4, ts - 4);
    graphics.stroke({ color: 0x44ffaa, alpha: 0.5, width: 2 });

    this.ghostLayer.addChild(graphics);
    this._dragGhostGraphic = graphics;
  }

  _clearUnitDragGhost() {
    if (this._dragGhostGraphic) {
      this.ghostLayer.removeChild(this._dragGhostGraphic);
      this._dragGhostGraphic.destroy();
      this._dragGhostGraphic = null;
    }
  }

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

    // 显示相邻加成提示（即使位置无效也显示交互信息）
    this._updateAdjacencyHints(gridPos.col, gridPos.row, this._dragBuildingConfig.id, valid);
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
    this._clearAdjacencyHints();
  }

  // ===== 搬迁模式（蓝色虚影 + 点击放置）=====

  _updateRelocateGhost(clientX, clientY) {
    const gridPos = this._clientToGrid(clientX, clientY);
    this._clearRelocateGhost();
    if (!gridPos) return;

    const cfg = this._relocateConfig;
    const w = cfg.footprint.width;
    const h = cfg.footprint.height;
    const x = gridPos.col * this.tileSize;
    const y = gridPos.row * this.tileSize;

    const check = this.buildingSystem.canMoveTo(this._relocateIndex, gridPos.col, gridPos.row);
    const valid = check.valid;

    const g = new PIXI.Graphics();
    g.rect(x, y, w * this.tileSize, h * this.tileSize);
    g.fill({ color: valid ? 0x4488ff : 0xff4444, alpha: 0.3 });
    g.rect(x, y, w * this.tileSize, h * this.tileSize);
    g.stroke({ color: valid ? 0x4488ff : 0xff4444, alpha: 0.8, width: 2 });

    this.ghostLayer.addChild(g);
    this._relocateGhost = g;
    this._updateAdjacencyHints(gridPos.col, gridPos.row, this._relocateConfig.id, valid);
  }

  _clearRelocateGhost() {
    if (this._relocateGhost) {
      this.ghostLayer.removeChild(this._relocateGhost);
      this._relocateGhost.destroy();
      this._relocateGhost = null;
    }
    this._clearAdjacencyHints();
  }

  // ===== 事件触发通知 =====

  _showEventNotification(name) {
    this._clearEventNotifications();
    const cx = this.screenW / 2 / this.zoom + this.camX;
    const cy = this.screenH / 3 / this.zoom + this.camY;
    const notif = new PIXI.Text({
      text: '❗',
      style: { fontSize: 28, fill: 0xffaa00, fontWeight: 'bold',
        stroke: { color: 0x000000, width: 3 } }
    });
    notif.anchor.set(0.5);
    notif.x = cx;
    notif.y = cy;
    this.worldContainer.addChild(notif);
    this._eventNotifs = this._eventNotifs || [];
    this._eventNotifs.push(notif);
  }

  _clearEventNotifications() {
    if (!this._eventNotifs) return;
    for (const n of this._eventNotifs) {
      this.worldContainer.removeChild(n);
      n.destroy();
    }
    this._eventNotifs = [];
  }

  // ===== 相邻加成可视化提示 =====

  /**
   * 更新相邻加成提示（放置模式或拖动模式）
   * 显示所有可能的相邻交互（双向），箭头永远指向被影响者
   * @param {number} col 虚影所在列
   * @param {number} row 虚影所在行
   * @param {string} buildingId 建筑配置ID
   */
  _updateAdjacencyHints(col, row, buildingId, valid) {
    this._clearAdjacencyHints();

    const interactions = this.buildingSystem.getAllAdjacencyInteractionsAt(buildingId, col, row);
    if (!interactions || interactions.length === 0) return;

    const bldConfig = configRegistry.getBuilding(buildingId);
    if (!bldConfig) return;

    const ts = this.tileSize;
    const ghostCenterX = (col + bldConfig.footprint.width / 2) * ts;
    const ghostCenterY = (row + bldConfig.footprint.height / 2) * ts;

    // Track which buildings have been highlighted
    const highlightedBuildings = new Map(); // buildingIndex -> { inRange, isPositive }
    const inRangeInteractions = interactions.filter(i => i.inRange);
    const outOfRangeInteractions = interactions.filter(i => !i.inRange);

    // Combine: show in-range first, then show up to N out-of-range
    const displayInteractions = [
      ...inRangeInteractions,
      ...outOfRangeInteractions.slice(0, 4) // cap out-of-range to avoid clutter
    ];

    for (const interaction of displayInteractions) {
      const otherBld = interaction.otherBuilding;
      const otherConfig = configRegistry.getBuilding(otherBld.buildingId);
      if (!otherConfig) continue;

      const bIndex = this.buildingSystem.buildings.indexOf(otherBld);
      const existing = highlightedBuildings.get(bIndex);

      // If already highlighted with inRange, don't downgrade; prefer positive
      if (existing) {
        if (existing.inRange && !interaction.inRange) continue;
        if (existing.isPositive && !interaction.isPositive) continue;
      }
      highlightedBuildings.set(bIndex, {
        inRange: interaction.inRange,
        isPositive: interaction.isPositive
      });

      const hx = otherBld.gridX * ts;
      const hy = otherBld.gridY * ts;
      const hw = otherConfig.footprint.width * ts;
      const hh = otherConfig.footprint.height * ts;
      const otherCenterX = hx + hw / 2;
      const otherCenterY = hy + hh / 2;

      // Colors: in-range = bright, out-of-range = dim
      const baseColor = interaction.isPositive ? 0x44ff44 : 0xff4444;
      const borderAlpha = interaction.inRange ? 0.9 : 0.4;
      const borderWidth = interaction.inRange ? 3 : 1.5;

      // 1. Highlight border on affected building
      const highlight = new PIXI.Graphics();
      highlight.rect(hx - 2, hy - 2, hw + 4, hh + 4);
      highlight.stroke({ color: baseColor, alpha: borderAlpha * 0.5, width: borderWidth + 2 });
      highlight.rect(hx - 1, hy - 1, hw + 2, hh + 2);
      highlight.stroke({ color: baseColor, alpha: borderAlpha, width: borderWidth });
      this.ghostLayer.addChild(highlight);
      this._adjacencyHighlights.push({ graphic: highlight });

      // 2. Arrow: always from provider → receiver (affected)
      // receiving: ghost receives → arrow from other to ghost
      // providing: ghost provides → arrow from ghost to other
      const fromProvider = interaction.direction === 'receiving';
      const arrowFromX = fromProvider ? otherCenterX : ghostCenterX;
      const arrowFromY = fromProvider ? otherCenterY : ghostCenterY;
      const arrowToX = fromProvider ? ghostCenterX : otherCenterX;
      const arrowToY = fromProvider ? ghostCenterY : otherCenterY;

      // Determine which building is the "affected" one (the receiver)
      const affectedCenterX = fromProvider ? ghostCenterX : otherCenterX;
      const affectedCenterY = fromProvider ? ghostCenterY : otherCenterY;

      const dx = arrowToX - arrowFromX;
      const dy = arrowToY - arrowFromY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue;
      const nx = dx / dist;
      const ny = dy / dist;

      // Shorten line to stop at building bounds
      const nodeR = Math.max(hw, hh) * 0.6;
      const ghostR = Math.max(bldConfig.footprint.width, bldConfig.footprint.height) * ts * 0.6;
      const fromR = fromProvider ? nodeR : ghostR;
      const toR = fromProvider ? ghostR : nodeR;

      const lineX1 = arrowFromX + nx * fromR;
      const lineY1 = arrowFromY + ny * fromR;
      const lineX2 = arrowToX - nx * toR;
      const lineY2 = arrowToY - ny * toR;

      const lineAlpha = interaction.inRange ? 0.8 : 0.3;
      const lineWidth = interaction.inRange ? 3 : 1.5;

      const line = new PIXI.Graphics();
      if (interaction.inRange) {
        // Solid line
        line.moveTo(lineX1, lineY1);
        line.lineTo(lineX2, lineY2);
        line.stroke({ color: baseColor, alpha: lineAlpha, width: lineWidth });
      } else {
        // Dashed line for out-of-range
        const lineLen = Math.sqrt((lineX2 - lineX1) ** 2 + (lineY2 - lineY1) ** 2);
        const dashLen = 8;
        const gapLen = 6;
        const totalSeg = dashLen + gapLen;
        const numDashes = Math.floor(lineLen / totalSeg);
        for (let i = 0; i < numDashes; i++) {
          const t0 = i * totalSeg / lineLen;
          const t1 = (i * totalSeg + dashLen) / lineLen;
          line.moveTo(lineX1 + (lineX2 - lineX1) * t0, lineY1 + (lineY2 - lineY1) * t0);
          line.lineTo(lineX1 + (lineX2 - lineX1) * t1, lineY1 + (lineY2 - lineY1) * t1);
          line.stroke({ color: baseColor, alpha: lineAlpha, width: lineWidth });
        }
      }

      // 3. Arrowhead (triangle) at the affected end
      const arrowSize = interaction.inRange ? 10 : 7;
      const perpX = -ny;
      const perpY = nx;
      const tipX = lineX2;
      const tipY = lineY2;
      const baseX = tipX - nx * arrowSize;
      const baseY = tipY - ny * arrowSize;

      line.moveTo(tipX, tipY);
      line.lineTo(baseX + perpX * arrowSize * 0.5, baseY + perpY * arrowSize * 0.5);
      line.lineTo(baseX - perpX * arrowSize * 0.5, baseY - perpY * arrowSize * 0.5);
      line.fill({ color: baseColor, alpha: lineAlpha });

      this.ghostLayer.addChild(line);
      this._adjacencyLines.push(line);

      // 4. Label near the arrow midpoint
      const midX = (lineX1 + lineX2) / 2;
      const midY = (lineY1 + lineY2) / 2;
      const labelText = interaction.inRange
        ? `${interaction.effectDesc}`
        : `(d${interaction.distance}>${interaction.rule.maxDistance})`;

      const text = new PIXI.Text({
        text: labelText,
        style: {
          fontSize: interaction.inRange ? 13 : 10,
          fill: interaction.inRange ? (interaction.isPositive ? 0x44ff44 : 0xff6666) : 0x888888,
          fontWeight: 'bold',
          fontFamily: 'Arial, Microsoft YaHei, sans-serif',
          stroke: { color: 0x000000, width: 2 }
        }
      });
      text.anchor.set(0.5);
      text.x = midX;
      text.y = midY - 14;
      this.ghostLayer.addChild(text);
      this._adjacencyTexts.push(text);

      // 5. Floating icon above the affected building
      const iconText = new PIXI.Text({
        text: interaction.isPositive ? '↑' : '↓',
        style: {
          fontSize: 18,
          fill: interaction.isPositive ? 0x44ff44 : 0xff4444,
          fontWeight: 'bold',
          fontFamily: 'Arial',
          stroke: { color: 0x000000, width: 3 }
        }
      });
      iconText.anchor.set(0.5);
      iconText.x = affectedCenterX;
      iconText.y = (fromProvider ? (row * ts) : hy) - 18;
      this.ghostLayer.addChild(iconText);
      this._adjacencyTexts.push(iconText);
    }

    // 6. Summary label near ghost
    const positiveCount = inRangeInteractions.filter(i => i.isPositive).length;
    const negativeCount = inRangeInteractions.filter(i => !i.isPositive).length;
    const outCount = outOfRangeInteractions.length;

    let summaryText = '';
    if (positiveCount > 0 || negativeCount > 0) {
      const parts = [];
      if (positiveCount > 0) parts.push(`${positiveCount}加成`);
      if (negativeCount > 0) parts.push(`${negativeCount}减益`);
      summaryText = '🔗 ' + parts.join(' ');
    }
    if (outCount > 0) {
      summaryText += (summaryText ? ' ' : '') + `⚡${outCount}潜在`;
    }

    if (summaryText) {
      const ghostX = col * ts;
      const ghostY = row * ts;
      const summary = new PIXI.Text({
        text: summaryText,
        style: {
          fontSize: 13,
          fill: positiveCount > 0 ? 0x44ff44 : (negativeCount > 0 ? 0xffaa44 : 0x888888),
          fontWeight: 'bold',
          fontFamily: 'Arial, Microsoft YaHei, sans-serif',
          stroke: { color: 0x000000, width: 3 }
        }
      });
      summary.x = ghostX + (bldConfig.footprint.width * ts - summary.width) / 2;
      summary.y = ghostY - 24;
      this.ghostLayer.addChild(summary);
      this._adjacencyTexts.push(summary);
    }
  }

  /**
   * 清除所有相邻加成提示
   */
  _clearAdjacencyHints() {
    for (const h of this._adjacencyHighlights) {
      if (h.graphic) {
        this.ghostLayer.removeChild(h.graphic);
        h.graphic.destroy();
      }
    }
    this._adjacencyHighlights = [];

    for (const line of this._adjacencyLines) {
      this.ghostLayer.removeChild(line);
      line.destroy();
    }
    this._adjacencyLines = [];

    for (const text of this._adjacencyTexts) {
      this.ghostLayer.removeChild(text);
      text.destroy();
    }
    this._adjacencyTexts = [];
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

      } else {
        // ===== 文字回退模式（纯色矩形 + 名称）=====
        const graphics = new PIXI.Graphics();
        const color = this._getBuildingColor(building.buildingId);

        graphics.rect(x + 2, y + 2, w * this.tileSize - 4, h * this.tileSize - 4);
        graphics.fill({ color, alpha: 0.9 });
        graphics.rect(x + 2, y + 2, w * this.tileSize - 4, h * this.tileSize - 4);
        graphics.stroke({ color: 0xffffff, alpha: 0.3, width: 1 });
        container.addChild(graphics);
      }

      // ===== 建造状态（所有建筑共用）：本体贴图/矩形 → 遮罩 → 进度条 =====
      if (isConstructing) {
        this._addConstructionOverlay(container, x, y, w, h);
        this._addBuildProgressBar(container, building, config, x, w, progressBaseY, layout, centerX);
      }

      // ===== 建筑名称（所有渲染模式共用）=====
      this._addBuildingName(container, config.name, w, centerX, nameBaseY + (layout.nameOffsetY || 0));

      // ===== 合成进度条（所有模式共用，琥珀色以区别于建造进度）=====
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

      // ===== 建筑血量条（受战斗系统影响）=====
      if (this._combatSystem && building._damage && building._damage > 0) {
        const maxHp = this._combatSystem._getBuildingHp(building.buildingId);
        const hpPct = Math.max(0, 1 - building._damage / maxHp);
        const bw = w * this.tileSize - 8;
        const bh = 4;
        const bxx = x + 4;
        const byy = y + h * this.tileSize - 4;

        const barBg = new PIXI.Graphics();
        barBg.rect(bxx, byy, bw, bh);
        barBg.fill({ color: 0x333333, alpha: 0.8 });
        container.addChild(barBg);

        const barFill = new PIXI.Graphics();
        const hpColor = hpPct > 0.5 ? 0x4ecb71 : (hpPct > 0.25 ? 0xf0a040 : 0xff4444);
        barFill.rect(bxx, byy, bw * hpPct, bh);
        barFill.fill({ color: hpColor, alpha: 0.9 });
        container.addChild(barFill);
      }

      // 无效建筑标记（如道路被拆除后不邻接道路的建筑）
      if (building._invalid) {
        const invalidIcon = new PIXI.Text({
          text: '❌',
          style: { fontSize: 14, fill: 0xff4444, fontWeight: 'bold' }
        });
        invalidIcon.anchor.set(0.5);
        invalidIcon.x = centerX;
        invalidIcon.y = centerY;
        container.addChild(invalidIcon);
      }

      this.buildingLayer.addChild(container);
      this._buildingSprites.push(container);
    }
  }

  /**
   * 添加建造遮罩。各建筑类型只负责画本体，建造态统一走这里。
   */
  _addConstructionOverlay(container, x, y, w, h) {
    const overlay = new PIXI.Graphics();
    overlay.rect(x, y, w * this.tileSize, h * this.tileSize);
    overlay.fill({ color: 0x888888, alpha: 0.55 });
    container.addChild(overlay);
  }

  /**
   * 添加建筑名称（动画、静态贴图、文字回退共用）
   */
  _addBuildingName(container, name, w, centerX, y) {
    const nameFontSize = Math.min(14, this.tileSize * 0.22);
    const nameMaxWidth = w * this.tileSize - 6;
    const text = new PIXI.Text({
      text: name,
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
    text.y = y;
    container.addChild(text);
  }

  /**
   * 添加地图建造进度条（所有建筑渲染模式共用）
   */
  _addBuildProgressBar(container, building, config, x, w, progressBaseY, layout, centerX) {
    const barWidth = w * this.tileSize - 8;
    const barHeight = 6;
    const barX = x + 4;
    const barY = progressBaseY + (layout.progressBarOffsetY || 0);
    const total = config.buildTime ?? 1;
    const pct = this._getConstructionRatio(building, total);

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

    // 进度文字
    const cur = this._getConstructionDisplayProgress(building, total);
    const progressText = new PIXI.Text({
      text: `${cur}/${total}`,
      style: { fontSize: 9, fill: 0xffffff }
    });
    progressText.anchor.set(0.5);
    progressText.x = centerX;
    progressText.y = barY + barHeight + 5;
    container.addChild(progressText);

    // 存储引用，供 ProgressManager 每帧重绘
    const buildingIndex = this.buildingSystem.buildings.indexOf(building);
    this._mapBuildFills.push({
      fill: barFill,
      label: progressText,
      buildingIndex,
      barX, barY, barWidth, barHeight
    });
  }

  _getConstructionElapsed(entity) {
    if (entity.startTick === undefined || entity.startTimeProgress === undefined) {
      return Math.max(0, entity.buildProgress ?? 0);
    }
    const state = store.getState();
    const now = (state.timeTick ?? 0) + (state.timeProgress ?? 0);
    const start = (entity.startTick ?? 0) + (entity.startTimeProgress ?? 0);
    return Math.max(0, now - start);
  }

  _getConstructionRatio(entity, total) {
    const safeTotal = Math.max(1, total || 1);
    return Math.max(0, Math.min(1, this._getConstructionElapsed(entity) / safeTotal));
  }

  _getConstructionDisplayProgress(entity, total) {
    const safeTotal = Math.max(0, total || 0);
    return Math.max(0, Math.min(safeTotal, Math.floor(this._getConstructionElapsed(entity))));
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
    for (const ref of this._mapBuildFills) {
      const b = this.buildingSystem.buildings[ref.buildingIndex];
      if (!b || b.status !== 'constructing') continue;
      const config = configRegistry.getBuilding(b.buildingId);
      if (!config) continue;
      const bt = config.buildTime || 1;
      const smooth = this._getConstructionRatio(b, bt);
      ref.fill.clear();
      ref.fill.rect(ref.barX, ref.barY, ref.barWidth * smooth, ref.barHeight);
      ref.fill.fill({ color: 0xffaa00, alpha: 0.9 });
      if (ref.label) {
        ref.label.text = `${this._getConstructionDisplayProgress(b, bt)}/${bt}`;
      }
    }
  }

  _updateRoadBuildBars() {
    for (const ref of this._roadBuildFills) {
      const road = this._roadSystem.getRoadAt(ref.gridX, ref.gridY);
      if (!road || road.buildProgress === null) continue;
      const bt = road.buildTime || 1;
      const smooth = this._getConstructionRatio(road, bt);
      ref.fill.clear();
      ref.fill.rect(ref.barX, ref.barY, ref.barWidth * smooth, ref.barHeight);
      ref.fill.fill({ color: 0xffaa00, alpha: 0.9 });
      if (ref.label) {
        ref.label.text = `${this._getConstructionDisplayProgress(road, bt)}/${bt}`;
      }
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
      const total = sp.total || 1;
      const base = (sp.progress || 0) / total;

      let smooth;
      if (sp.progress <= 0 && total > 1) {
        // 刚放入合成（第0个tick内）：从0开始
        smooth = Math.min(t * (1 / total), 1 / total);
      } else {
        // 非工作时段合成不推进，next 保持与 base 一致，避免进度条"回退"
        const next = isWorkPeriod
          ? ((sp.progress || 0) + 1) / total
          : base;
        smooth = Math.min(base + (next - base) * t, 1);
      }

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
      this.app.stage.filters = [this._colorFilter];
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
   * 获取相机状态（用于存档）
   */
  getCameraState() {
    return {
      camX: this.camX,
      camY: this.camY,
      zoom: this.zoom
    };
  }

  /**
   * 设置相机状态（从存档恢复，或从配置初始化）
   * @param {number} camX
   * @param {number} camY
   * @param {number} [zoom=1.0]
   */
  setCameraState(camX, camY, zoom = 1.0) {
    this.camX = camX;
    this.camY = camY;
    this.zoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, zoom));
    this.gameView.scale.set(this.zoom);
    this._clampCamera();
    this._updateWorldContainerPosition();
    this._recreateFogCanvas();
    this._drawTerrainChunk();
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
      // 时段变化 → 昼夜亮暗变化，刷新迷雾底色
      this._updateFogTexture();
    });

    // 建筑/道路状态变化：重绘迷雾
    eventBus.on('buildingPlaced', () => { this.refreshBuildings(); this._updateFogTexture(); });
    eventBus.on('buildingComplete', () => { this.refreshBuildings(); this._updateFogTexture(); });
    eventBus.on('buildingDemolished', () => { this.refreshBuildings(); this._updateFogTexture(); });
    eventBus.on('buildingMoved', () => { this.refreshBuildings(); this._updateFogTexture(); });
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
    eventBus.on('tick', () => {
      this.refreshBuildings();
      this._clearEventNotifications();
    });

    // 事件触发通知
    eventBus.on('eventTriggered', ({ name }) => {
      this._showEventNotification(name);
    });

    // 敌人重绘
    eventBus.on('enemySpawned', () => this._drawEnemies());
    eventBus.on('enemyKilled', () => this._drawEnemies());
    eventBus.on('unitSpawned', () => this._drawEnemies());
    eventBus.on('tamedCreatureGained', () => this._drawEnemies());
    store.subscribe('combatVersion', () => this._drawEnemies());

    // 光照状态变化：重绘迷雾
    eventBus.on('torchStateChanged', () => {
      this._updateFogTexture();
    });

    // 道路状态变化：重绘道路和迷雾
    eventBus.on('roadBuilt', () => { this._drawRoads(); this._updateFogTexture(); });
    eventBus.on('roadRemoved', () => { this._drawRoads(); this._updateFogTexture(); });
    eventBus.on('roadEditModeChanged', ({ enabled }) => {
      if (!enabled) this._clearRoadGhost();
    });

    // 监听已移除事件标记的变化（来自存档恢复等）
    store.subscribe('removedEventMarkers', () => {
      this._refreshEventMarkers();
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
    this.screenW = window.innerWidth;
    this.screenH = window.innerHeight;

    // 确保 gameView 缩放正确
    this.gameView.scale.set(this.zoom);

    // 重钳制相机（屏幕尺寸变了）
    this._clampCamera();
    this._updateWorldContainerPosition();

    // 重建迷雾 Canvas（尺寸取决于 screenW/H 和 zoom）
    this._recreateFogCanvas();

    // 重绘地形（铺满新视口）
    this._drawTerrainChunk();
  }

  /**
   * 重建迷雾离屏Canvas（屏幕尺寸变化时调用）
   */
  _recreateFogCanvas() {
    if (this._fogSprite) {
      this.fogContainer.removeChild(this._fogSprite);
      this._fogSprite.destroy();
      this._fogSprite = null;
    }
    if (this._fogTexture) {
      this._fogTexture.destroy();
      this._fogTexture = null;
    }
    this._fogCanvas = null;
    this._createFogCanvas();
  }
}
