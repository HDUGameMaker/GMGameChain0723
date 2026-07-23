# AGENT.md - AI Agent 开发指南

本文档为 AI Agent 提供项目技术上下文，帮助 Agent 快速理解代码库并正确修改代码。

## 项目概述

这是一个纯前端模拟经营网页游戏，使用 PixiJS v8 渲染 + GSAP 动画 + 原生 DOM UI，无构建工具，ES Module 直接运行。

## 关键约束

1. **不使用任何框架**（无 React/Vue/Angular），UI 全部手写 DOM
2. **不使用构建工具**（无 webpack/vite），所有 JS 为原生 ES Module
3. **PixiJS v8 API**（非 v7），全局变量 `PIXI`，初始化方式为 `new Application()` + `await app.init()`
4. **GSAP 全局变量** `gsap`，通过 script 标签加载
5. **配置驱动**：所有游戏数值在 `config/*.json` 中定义，代码不硬编码数值
6. **系统独占写入**：每个 System 对自己的状态有独占写入权，外部只能通过 System API 修改
7. **渲染只读**：MapRenderer 只读取状态绘制，不修改任何游戏数据

## 运行方式

```bash
npx http-server -p 8080 -c-1 --cors
# 访问 http://127.0.0.1:8080
```

必须通过 HTTP 服务器运行（fetch 加载 JSON 配置），不支持 file:// 协议。

## 架构分层

```
Layer 1: UI (DOM)          → src/ui/HUD.js, PopupManager.js, panels/
Layer 2: Game Systems      → src/systems/*.js（纯逻辑，不操作 DOM）
Layer 3: Render (PixiJS)   → src/rendering/MapRenderer.js
Layer 4: Data              → src/core/（EventBus, ConfigRegistry, Store, SaveManager）
```

## 核心通信机制

### EventBus 事件列表

| 事件名 | 触发时机 | 数据 |
|--------|---------|------|
| `tick` | 每 40s 结算一次 | `{tick, period, day, isWorkPeriod}` |
| `periodChange` | 时段切换 | `{period, prevPeriod, day, icon, label}` |
| `periodEnd` | 时段结束 | `{period, day}` |
| `dayStart` | 新一天开始 | `{day}` |
| `resourceChanged` | 资源数量变化 | `{id}` |
| `populationChanged` | 人口变化 | `{current, direction}` |
| `buildingPlaced` | 建筑放置 | `{building}` |
| `buildingComplete` | 建造完成 | `{building}` |
| `buildingClicked` | 点击建筑 | `{buildingIndex}` |
| `expeditionEntranceClicked` | 点击探险口 | `{}` |
| `expeditionStarted` | 探险出发 | `{expedition}` |
| `expeditionComplete` | 探险归来 | `ExpeditionResult` |
| `itemsChanged` | 物品变化 | 无 |
| `synthesisComplete` | 合成完成 | `{itemId, count}` |
| `gamePaused` / `gameResumed` | 游戏暂停/恢复 | 无 |

### Store 状态键

| 键名 | 类型 | 说明 |
|------|------|------|
| `timePeriod` | string | 当前时段名 |
| `timeDay` | number | 当前天数 |
| `timeSpeed` | number | 速度倍率 |
| `timeUserPaused` | boolean | 用户暂停 |
| `timeProgress` | number | 当前 tick 进度 0~1 |
| `resourceVersion` | number | 资源变化时间戳（触发刷新） |
| `buildingVersion` | number | 建筑变化时间戳 |
| `itemVersion` | number | 物品变化时间戳 |
| `populationCurrent` | number | 当前人口 |
| `placingState` | string | 'IDLE' 或 'PLACING' |
| `placingBuildingId` | string | 正在放置的建筑ID |
| `expeditionState` | object/null | 当前探险状态 |

## 系统 API 速查

### ResourceSystem
```js
add(id, amount) → boolean        // 增加（不超上限）
addClamped(id, amount) → number  // 增加（截断到上限，返回实际增量）
tryConsume(id, amount) → boolean // 消耗（不足则失败）
canAfford(costs) → boolean       // 检查 [{resourceId, amount}] 是否都够
consumeAll(costs) → boolean      // 消耗一组资源
getAmount(id) → number
getHUDResources() → [{id, name, icon, current, max}]
hasEnough(id, amount) → boolean
```

### BuildingSystem
```js
enterPlacingMode(buildingId)     // 进入放置模式
exitPlacingMode()                // 退出放置模式
canPlaceAt(gridX, gridY, id) → {valid, reason}
placeBuilding(gridX, gridY, id) → boolean
assignWorker(buildingIndex) → boolean
removeWorker(buildingIndex) → boolean
canUpgrade(buildingIndex) → {valid, reason, targetId, cost}
upgradeBuilding(buildingIndex) → boolean
startSynthesis(buildingIndex, recipeId) → boolean
demolishBuilding(buildingIndex) → boolean
hasBuilding(buildingId) → boolean
```

### ItemSystem
```js
obtain(id) → instanceId | false
lose(instanceId) → boolean
equip(instanceId) → boolean
unequip(instanceId) → boolean
markExpedition(instanceIds) → boolean
returnFromExpedition(instanceIds) → void
isOwned(id) → boolean
getOwnedInstances() → [{instanceId, itemId, name, equipped, inExpedition, ...}]
```

### ExpeditionSystem
```js
getAvailableRegions() → [{region, unlocked, unlockHint}]
startExpedition(regionIds, instanceIds) → boolean
getCurrentExpedition() → ExpeditionState | null
getExpectedYields(regionIds, instanceIds) → {resourceId: amount}
completeExpedition() → ExpeditionResult
```

### EventSystem
```js
executeOptionEffects(effects) → boolean  // 返回是否含 trigger_event
registerEffect(type, handler)            // 注册新效果类型
```

## 添加新功能的模式

### 添加新面板
1. 创建 `src/ui/panels/xxx-panel.js`，导出 `renderXxxPanel(data, body, pm)`
2. 在 `PopupManager._registerBuiltinPanels()` 中添加动态 import
3. 在需要处调用 `pm.open('xxx', data)`

### 添加新建筑
只需在 `config/buildings.json` 中添加配置对象，无需改代码。

### 添加新事件
在 `config/events/events_base.json` 中添加事件对象，遵循现有 schema。

### 添加新效果类型
在 `EventSystem._registerBuiltinEffects()` 中调用 `this.registerEffect('type', handler)`。

### 添加新资源
在 `config/resources.json` 中添加，ResourceSystem 自动识别。

## 地图坐标系

- 原点 (0,0) 在左上角
- gridX = 列（向右增加），gridY = 行（向下增加）
- 屏幕坐标：`screenX = gridX * tileSize`, `screenY = gridY * tileSize`
- tileSize = 64px
- 地图大小：20列 × 15行

## 时间系统参数

```
PERIOD_DURATION = 120s（每时段现实秒数）
TICK_INTERVAL = 40s（结算间隔）
TICKS_PER_PERIOD = 3（每时段结算次数）
PERIOD_NAMES = [morning, afternoon, evening, night]
WORK_PERIODS = [morning, afternoon]（仅此时段建筑生产）
```

## 弹窗阻塞规则

| 面板类型 | 阻塞时间 |
|---------|:--------:|
| event | 是 |
| expedition_prep | 是 |
| building_select | 否 |
| building_detail | 否 |
| settings | 否 |
| expedition_detail | 否 |

## 存档结构

```json
{
  "version": 1,
  "timestamp": 1751558400000,
  "time": { "currentTick", "tickInPeriod", "periodIndex", "day", "elapsedInTick" },
  "population": { "current", "declineCountdown" },
  "resources": { "wood": {"current", "max"}, ... },
  "items": { "itemId": {"instances": [{instanceId, equipped, inExpedition}]} },
  "buildings": [{ "buildingId", "gridX", "gridY", "status", "currentWorkers", "buildProgress" }],
  "expedition": null | ExpeditionState,
  "events": { "triggerCounts": {}, "cooldowns": {} }
}
```

## 常见修改注意事项

1. **修改建筑产出**：改 `config/buildings.json` 的 `production` 字段，不要改代码
2. **修改资源上限逻辑**：在 `ResourceSystem.getMaxResourceCapacity()` 中，上限 = 配置max × 仓库storageMultiplier
3. **修改人口逻辑**：在 `PopulationSystem.onDayStart()` 中，每天结算一次
4. **添加地图元素**：在 `MapRenderer` 中添加绘制方法，在 `_onClick` 中添加点击检测
5. **PixiJS v8 Graphics API**：`graphics.rect(x,y,w,h).fill({color, alpha})` 和 `.stroke({color, width, alpha})`，不能链式同时 fill+stroke，需画两次
6. **PixiJS v8 Text API**：`new PIXI.Text({ text: '...', style: { fontSize, fill } })`

## 设计文档位置

所有游戏设计细节在 `docs/` 目录中，修改游戏逻辑前应先阅读对应文档：
- 建筑/地图交互 → `docs/map-and-building-revision.md`
- 资源/物品 API → `docs/resource-item-system-api.md`
- 事件系统 → `docs/event-system-design.md`
- 探险系统 → `docs/expedition-system-design.md`
- 弹窗系统 → `docs/popup-system-design.md`
- 存档系统 → `docs/save-system-design.md`
