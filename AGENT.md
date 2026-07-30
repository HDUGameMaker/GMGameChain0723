# AGENT.md - AI Agent 开发指南

本文档为 AI Agent 提供项目技术上下文，帮助 Agent 快速理解代码库并正确修改代码。

> ⚠️ **接力棒开发工作流**：本项目采用多人"接龙"式协作，每位开发者为一"棒"。
> 在 AI 集成 IDE 中开启本项目的**首次对话**时，必须先完成"接棒初始化"流程
> （分析项目 → 梳理前几棒成果 → 确定本棒任务 → 生成 `第N棒开发者身份信息.md` → 加入 `.gitignore`），
> **之后再执行用户请求**。完整流程见 `CLAUDE.md` 与 `AGENTS.md` 顶部的「🔰 接力棒开发工作流」章节。
> ⚡ **初始化判定**：若项目根目录已存在 `第N棒开发者身份信息.md`，表明初始化已完成，后续对话无需重复此流程，直接响应请求即可。
> 🏁 **当前棒次 / 开发结束判定**：当前棒次 = 已存在的最高棒次身份信息文件 N。只有当当前开发者明确要求"为下一位（第 N+1 棒）生成交接文档"且 `给第N+1棒的.md` 已生成，才视为第 N 棒结束、推进到第 N+1 棒。仅有身份信息而无交接文档 → 仍属当前棒次（如只有第五棒身份信息、无 `给第六棒的.md` → 当前仍在第5棒）。

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
| `periodEnd` | 时段结束（自动存档触发点） | `{period, day}` |
| `dayStart` | 新一天开始 | `{day}` |
| `resourceChanged` | 资源数量变化 | `{id}` |
| `populationChanged` | 人口数量变化 | `{current, direction}` |
| `buildingPlaced` | 建筑放置完成 | `{building}` |
| `buildingComplete` | 建筑建造完成 | `{building}` |
| `buildingUpgraded` | 建筑升级完成 | `{building}` |
| `buildingClicked` | 点击建筑 | `{buildingIndex}` |
| `buildingMoved` | 建筑被移动 | `{buildingIndex, fromX, fromY, toX, toY}` |
| `buildingDemolished` | 建筑被拆除 | `{building}` |
| `workerChanged` | 工人分配变更 | `{buildingIndex, currentWorkers}` |
| `torchClicked` | 点击火把 | `{torchIndex}` |
| `torchStateChanged` | 火把状态变化（点燃/熄灭/升级/燃料） | `{}` |
| `torchLit` | 火把点燃 | `{torchIndex, torch}` |
| `torchExtinguished` | 火把熄灭 | `{torchIndex, torch}` |
| `torchUpgraded` | 火把升级完成 | `{torchIndex, torch}` |
| `torchUpgradeStarted` | 火把开始升级 | `{torchIndex, torch}` |
| `torchFuelAdded` | 火把添加燃料 | `{torchIndex, torch}` |
| `expeditionEntranceClicked` | 点击探险入口 | `{entrance}` — entrance 含 `id`, `name`, `regionIds[]` |
| `expeditionStarted` | 探险出发 | `{expedition}` |
| `expeditionComplete` | 探险归来 | `ExpeditionResult` |
| `itemObtained` | 获得物品 | `{itemId, instanceId}` |
| `itemLost` | 失去物品 | `{itemId, instanceId}` |
| `itemsChanged` | 物品列表变化 | 无 |
| `synthesisStarted` | 合成开始 | `{buildingIndex, recipeId}` |
| `synthesisComplete` | 合成完成 | `{itemId, count}` |
| `gamePaused` / `gameResumed` | 游戏暂停/恢复 | 无 |
| `pageVisibilityChange` | 页面可见性变化（切换标签页） | `{hidden: boolean}` |
| `popupClosed` | 弹窗关闭 | `{type}` |
| `audioSettingsChanged` | 音频设置变更 | `{ musicVolume, sfxVolume, muted }` |
| `alchemyBrewStarted` | 炼金酿造开始 | `{ recipeId?, baseId, materialIds, processType }` |
| `alchemyBrewComplete` | 炼金酿造成功 | `{ recipeId, effectId, quality, itemInstanceId }` |
| `alchemyBrewFailed` | 炼金酿造失败 | `{ reason, wastedMaterials }` |
| `alchemyRecipeDiscovered` | 实验发现新配方 | `{ recipeId, recipeName }` |
| `alchemyLevelUp` | 炼金等级提升 | `{ oldLevel, newLevel, unlockedRecipes[], unlockedBases[] }` |
| `alchemyMagnumOpusProgress` | 伟大工作阶段推进 | `{ stage, outputItemId }` |
| `potionUsed` | 药剂被使用 | `{ instanceId, itemId, effectId, quality }` |
| `potionEffectExpired` | 药剂效果过期 | `{ effectId, quality }` |

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
| `torchVersion` | number | 火把状态变化时间戳（触发迷雾重绘） |
| `audioVersion` | number | 音频设置变化时间戳 |
| `alchemyVersion` | number | 炼金状态变化时间戳（触发UI刷新） |
| `alchemyBrewing` | object/null | 当前酿造状态 `{ recipeId?, baseId, materialIds, processType, ticksRemaining, successChance, qualityTier }` |
| `alchemyLevel` | number | 炼金等级（1-10） |
| `alchemyXP` | number | 炼金经验值 |
| `alchemyBrewStartTime` | number | 酿造开始现实时间戳（供ProgressManager使用） |
| `alchemyActiveEffects` | array | 当前激活的药效 `[{ effectId, quality, ticksRemaining }]` |

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

### PopulationSystem
```js
getCurrent() → number                              // 当前总人口
getAssignedWorkers() → number                      // 建筑已分配工人数
getAvailableWorkers() → number                     // 可用工人 = 当前人口 - 建筑分配 - 探险占用
occupyForExpedition(count) → void                  // 探险出发时锁定工人
releaseFromExpedition(count) → void                // 探险归来时归还工人
getState() → {current, declineCountdown, expeditionWorkers}
restoreState(state) → void
```

### BuildingSystem
```js
enterPlacingMode(buildingId)     // 进入放置模式
exitPlacingMode()                // 退出放置模式
canPlaceAt(gridX, gridY, id) → {valid, reason}
placeBuilding(gridX, gridY, id) → boolean
canMoveTo(buildingIndex, newGridX, newGridY) → {valid, reason}
moveBuilding(buildingIndex, newGridX, newGridY) → boolean
assignWorker(buildingIndex) → boolean
removeWorker(buildingIndex) → boolean
canUpgrade(buildingIndex) → {valid, reason, targetId, cost}
upgradeBuilding(buildingIndex) → boolean
startSynthesis(buildingIndex, recipeId) → boolean
demolishBuilding(buildingIndex) → boolean
hasBuilding(buildingId) → boolean
// 相邻加成
getAdjacencyBonuses(buildingIndex) → [{rule, targetBuilding, distance, bonusDesc, isPositive}]
getAdjacencyBonusesAt(buildingId, gridX, gridY) → [...]     // 放置预览
getAllAdjacencyInteractionsAt(buildingId, gridX, gridY) → [...]  // 双向、全距离
applyAdjacencyToProduction(buildingId, resourceId, baseAmount, applyToField, bonuses) → number
getProductionRates() → {resourceId: netAmountPerTick}       // 含相邻加成
```

### TorchSystem
```js
// 火把系统：管理迷雾可见性、燃料消耗、升级
getAll() → [{id, torchId, gridX, gridY, lit, fuel, upgrading, upgradeProgress}]
getLitTorches() → [{...}]                         // 返回所有已点燃的火把
getTorchAt(col, row) → number                     // 返回指定格子的火把索引，-1 表示无
getTorchConfig(torchId) → object | null            // 获取火把类型配置（来自 buildings.json，筛选 isTorch 条目）
getVisibilityMatrix() → boolean[][]                // 返回 [row][col] 可见性矩阵
canInteract(col, row) → boolean                   // 格子是否可交互/可见
canBuild(gridX, gridY, w, h) → boolean             // 建筑区域是否全部可见
canLightTorch(index) → {valid, reason, cost}       // 检查是否可点燃
lightTorch(index) → boolean                        // 点燃（消耗点燃资源 + 填充燃料）
canUpgradeTorch(index) → {valid, reason, targetId} // 检查是否可升级
upgradeTorch(index) → boolean                      // 开始升级（消耗升级资源）
addFuel(index, amount?) → boolean                  // 添加燃料到已点燃火把
onTick(data)                                       // Tick 处理：升级进度推进
onPeriodEnd(data)                                  // PeriodEnd 处理：燃料消耗 → 自动熄灭
getAllStates() → [{torchId, gridX, gridY, lit, fuel(-1=Infinity), upgrading, upgradeProgress}]
restoreState(states) → void                        // 从存档恢复
```
- 火把类型 `torchId` 对应 `config/buildings.json` 中 `isTorch: true` 的条目
- `fuel: Infinity` 在序列化时存为 `-1`（JSON 不可序列化 Infinity）
- eternal 火把始终保持 lit=true 且不消耗燃料
- 点击门控：`_isTileRevealed()` 在 `MapRenderer` 中检查，内部调用 `_visibleGrid[row][col]`

### AudioSystem
```js
init() → void                                // 加载配置、创建 AudioContext、预解码 SFX
playBGM(id) → void                           // 播放/切换 BGM（带淡入淡出 crossfade）
stopBGM() → void                             // 停止 BGM（淡出）
playSFX(id) → void                           // 播放一次性音效（支持重叠，buffer pool 上限 8）
setMasterVolume(v: 0-1) → void               // 设置主音量
setBGMVolume(v: 0-1) → void                  // 设置背景音乐音量
setSFXVolume(v: 0-1) → void                  // 设置音效音量
getMasterVolume() → number
getBGMVolume() → number
getSFXVolume() → number
toggleMute() → void                          // 切换静音
isMuted() → boolean
getAllStates() → { musicVolume, sfxVolume, muted }
restoreState(state) → void                   // 从存档恢复
```
- BGM 使用 `HTMLAudioElement`（流式播放，支持循环）
- SFX 使用 `AudioContext` + buffer pool（低延迟、可重叠）
- 事件→音效绑定基于 `config/sound.json` 的 `eventBindings` 数组（SFX）
- 事件→BGM 切换基于 `config/sound.json` 的 `bgmBindings` 数组，支持 `periods` 时段过滤
- 游戏暂停/恢复时自动暂停/恢复音频
- tab 隐藏时自动静音 BGM
- 首次用户交互（click/keydown/touchstart）自动解锁 AudioContext 并启动 BGM

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
getAvailableRegions(entranceRegionIds?) → [{region, unlocked, unlockHint}]  // 可选参数按入口过滤区域
isRegionUnlocked(regionId) → boolean
canStartExpedition(regionIds, instanceIds) → {valid, reason}   // 含工人数校验
getTotalWorkerCost(regionIds) → number                         // 计算所选区域总工人消耗
startExpedition(regionIds, instanceIds) → boolean              // 扣减工人，锁定物品
getCurrentExpedition() → ExpeditionState | null
getExpectedYields(regionIds, instanceIds) → {resourceId: amount}
completeExpedition() → ExpeditionResult
```

### EventSystem
```js
executeOptionEffects(effects) → boolean  // 返回是否含 trigger_event
registerEffect(type, handler)            // 注册新效果类型
```

### AlchemySystem
```js
// 核心酿造
experiment(baseId, materialIds, processType?, grindLevels?) → {valid, reason} | {success, recipeId?, effectId, quality, discovered?} | {failed, reason}
craftRecipe(recipeId) → {valid, reason?} | {started}                                  // 按已知配方酿造
cancelBrewing() → {valid, reason?} | {cancelled}

// 酿造状态
getBrewingState() → { active: boolean, recipeId?, baseId, processType, ticksRemaining, totalTicks, successChance, qualityTier } | null
isBrewing() → boolean

// 药剂使用
usePotion(instanceId) → {valid, reason?}    // 使用药剂，激活效果
getActiveEffects() → [{effectId, quality, ticksRemaining}]
getEffects() → {combat: {...}, building: {...}, population: {...}}  // 聚合修饰符，供其他系统读取

// 伟大工作
canPerformMagnumOpus(stage) → {valid, reason?}
performMagnumOpus(stage) → {valid, reason?} | {success, stage, outputItemId}
getMagnumOpusStage() → 'none'|'nigredo'|'albedo'|'citrinitas'|'rubedo'|'stone'

// 盐系统
getSalts() → {void, moon, sun, life, philosopher}                 // 返回各盐数量
addSalt(saltType, amount) → void
useSalt(saltType) → {valid, reason?} | {success}

// 信息查询
getLevel() → number
getXP() → number
getXPToNextLevel() → number | null (满级)
getDiscoveredRecipes() → string[]
getAvailableRecipes() → [{id, name, baseId, materials, effects, requiredLevel}]  // 已解锁+已发现
getMaterials() → [{id, name, element, potency, rarity, category, stock}]

// 存档
getState() → {level, xp, discoveredRecipes, materialStock, brewing, salts, magnumOpusStage, activeEffects}
restoreState(state) → void
```
- 酿造基于tick推进：每tick `ticksRemaining--`，归零时结算成功/失败/品质
- 实验引擎：材料元素×效力×基底偏向→加权评分→取top-3→加权随机选一效果→成功率判定品质(I:>0.45, II:>0.70, III:>0.90)
- 品质受研磨加成（grindLevel越接近材料optimalGrind，成功率越高）和加工方式（加热/搅拌/静置）影响
- 药剂效果激活后持续固定tick数，过期自动清理
- 五盐：void盐取消酿造、moon盐提升治疗/水品质、sun盐提升嬗变/火品质、life盐提升成功率、philosopher盐减少酿造tick
- 伟大工作五阶段（Nigredo→Albedo→Citrinitas→Rubedo→Philosopher's Stone）每阶段消耗前一阶段产物作为输入

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

### 添加新炼金材料/配方/效果
在 `config/alchemy.json` 中添加 materials/recipes/effects，无需改代码。炼金系统通过 ConfigRegistry 自动读取。

### 添加新炼金面板
1. 创建 `src/ui/panels/xxx-alchemy-panel.js`，导出渲染函数
2. 在 `PopupManager._registerBuiltinPanels()` 中注册
3. 面板渲染数据中需传入 `alchemySystem` 引用

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
| torch_detail | 否 |
| settings | 否 |
| expedition_detail | 否 |
| alchemy_lab | 否 |
| potion_inventory | 否 |

## 存档结构

```json
{
  "version": 1,
  "timestamp": 1751558400000,
  "time": { "currentTick", "tickInPeriod", "periodIndex", "day", "elapsedInTick" },
  "population": { "current", "declineCountdown", "expeditionWorkers" },
  "resources": { "wood": {"current", "max"}, ... },
  "items": { "itemId": {"instances": [{instanceId, equipped, inExpedition}]} },
  "buildings": [{ "buildingId", "gridX", "gridY", "status", "currentWorkers", "buildProgress" }],
  "expedition": null | ExpeditionState,
  "events": { "triggerCounts": {}, "cooldowns": {} },
  "torches": [{ "torchId", "gridX", "gridY", "lit", "fuel", "upgrading", "upgradeProgress" }],
  "audio": { "musicVolume": 0.7, "sfxVolume": 0.8, "muted": false },
  "alchemy": {
    "level": 1,
    "xp": 0,
    "discoveredRecipes": ["healing_potion_I"],
    "materialStock": { "blood_thorn": 5, "frost_leaf": 3 },
    "brewing": null,
    "salts": { "void": 0, "moon": 0, "sun": 0, "life": 0, "philosopher": 0 },
    "magnumOpusStage": "none",
    "activeEffects": [{ "effectId": "healing", "quality": "II", "ticksRemaining": 45 }]
  }
}
```

## 常见修改注意事项

1. **修改建筑产出**：改 `config/buildings.json` 的 `production` 字段，不要改代码
2. **修改资源上限逻辑**：在 `ResourceSystem.getMaxResourceCapacity()` 中，上限 = 配置max × 仓库storageMultiplier
3. **修改人口逻辑**：在 `PopulationSystem.onDayStart()` 中，每天结算一次
4. **添加地图元素**：在 `MapRenderer` 中添加绘制方法，在 `_onClick` 中添加点击检测
5. **PixiJS v8 Graphics API**：`graphics.rect(x,y,w,h).fill({color, alpha})` 和 `.stroke({color, width, alpha})`，不能链式同时 fill+stroke，需画两次
6. **PixiJS v8 Text API**：`new PIXI.Text({ text: '...', style: { fontSize, fill } })`
7. **修改火把参数**：改 `config/buildings.json` 中 `isTorch: true` 的条目，`radius`（照亮半径/格）、`coalPerPeriod`（每时段煤炭消耗）、`coalBuffer`（点燃后初始燃料）、`lightCost`（点燃一次性消耗）、`upgradeCost`/`upgradeTime`（升级资源/时间）
8. **修改迷雾视觉效果**：在 `MapRenderer._updateFogTexture()` 中，迷雾使用 Canvas 2D 离屏渲染 —— `fillRect` 全黑 → `destination-out` + `createRadialGradient` 清除火把区域 → `_fogTexture.update()` 上传 GPU。不要用 PixiJS mask/stencil 方案（v8 兼容性差）
9. **迷雾门控**：所有交互入口需调用 `_isTileRevealed(col, row)` 检查，BuildingSystem 通过 `canBuild()` 检查建造合法性。`_visibleGrid` 在 `_updateFogTexture()` 中同步更新
10. **火把存档**：`fuel` 字段中 `Infinity`（永恒火把）序列化时存为 `-1`，读档时还原。旧存档无 `torches` 字段则调用 `initFromConfig()` 重新初始化
11. **音频系统初始化**：AudioSystem 构造时注册暂停/恢复/可见性事件，init() 中加载 sound.json 配置并预解码 SFX buffer。BGM 用 HTMLAudioElement（流式循环），SFX 用 AudioContext + buffer pool（低延迟重叠）。音量默认值 → 存档覆盖 → 用户滑块调整。
12. **音频文件缺失**：SFX 加载失败时静默降级（不崩溃），BGM 播放被浏览器阻止时 catch 处理。AudioContext 首次需用户手势解锁，已通过 click/keydown/touchstart 自动 resume。
13. **炼金材料来源**：炼金材料通过建筑生产（alchemy_lab 产出 water_pure/essence_oil/spirit_distilled）或事件/探险获取（alchemy_herb/alchemy_mineral），不由 ResourceSystem 直接初始化。
14. **炼金效果分发**：AlchemySystem.getEffects() 返回聚合修饰符对象，CombatSystem（单位伤害/血量倍率）、BuildingSystem（建造成本/产出倍率）、PopulationSystem（人口上限/食物消耗/增长倍率）分别读取对应子对象。模式与 CultureSystem 效果分发一致。
15. **炼金药剂物品**：药剂在 `config/items.json` 中以 `potionEffect: { id: "effectId" }` 字段标记，consumable: true。使用时 AlchemySystem.usePotion() → ItemSystem.lose()，效果写入内部激活表。
16. **炼金存档兼容**：旧存档无 `alchemy` 字段时，restoreState 会跳过（不崩溃），新游戏调用 `alchemy.init()` 初始化等级1。新增 alchemy 字段不影响旧存档加载。

## 配置编辑器文件结构

`planner-config.html` 已拆分为 1 个 HTML 壳 + `planner/` 目录下的 8 个 JS 文件（`<script src>` 加载，全局函数）：

| 文件 | 内容 | 何时读取 |
|------|------|---------|
| `planner-config.html` | HTML 骨架 + CSS + 8 个 script 标签 | 修改布局/样式 |
| `planner/planner-config-core.js` | State、File System Access API、数据加载/保存、Toast | 修改数据流/存储 |
| `planner/planner-config-render.js` | 6 个 Tab 的表单渲染（renderDetail/field/subListEditor） | 增删表单字段 |
| `planner/planner-config-map-draw.js` | Canvas 绘制管线（drawMapCanvas 及其子函数） | 修改地图渲染 |
| `planner/planner-config-map-edit.js` | 地图交互/工具/撤销/建筑放置/选区/随机生成 | 修改地图编辑行为 |
| `planner/planner-config-forms.js` | 表单事件绑定、字段变更处理 | 修改表单交互 |
| `planner/planner-config-actions.js` | CRUD 增删改 + Tab 切换 | 修改列表/Tab |
| `planner/planner-config-analysis.js` | 数值分析面板 + SVG 图表 | 修改分析功能 |
| `planner/planner-config-adjacency.js` | 相邻加成编辑器（表单 + SVG 节点图 + 拖拽） | 修改相邻加成功能 |
| `planner/planner-config-main.js` | DOM 事件监听 + 键盘快捷键 | 修改快捷键/事件 |

**加载顺序严格**：core → render → map-draw → map-edit → forms → actions → analysis → adjacency → main。所有函数为全局函数，与 `artist-config.html`（独立单文件）共享相同的 File System Access API 模式。

`sound-config.html` 同样拆分为 1 个 HTML 壳 + `sound-editor/` 目录下的 4 个 JS 文件：

| 文件 | 内容 | 何时读取 |
|------|------|---------|
| `sound-config.html` | HTML 骨架 + CSS + 4 个 script 标签 | 修改布局/样式 |
| `sound-editor/sound-editor-core.js` | State、File System Access API、数据加载/保存、音频预览 | 修改数据流/存储 |
| `sound-editor/sound-editor-render.js` | 4 个 Tab 的表单渲染（BGM/SFX/事件绑定/全局设置） | 增删表单字段 |
| `sound-editor/sound-editor-actions.js` | CRUD 增删改 + Tab 切换 + 表单事件绑定 | 修改交互逻辑 |
| `sound-editor/sound-editor-main.js` | DOM 事件监听 + 键盘快捷键 | 修改快捷键/事件 |

**加载顺序严格**：core → render → actions → main。所有函数为全局函数。

## 设计文档位置

所有游戏设计细节在 `docs/` 目录中，修改游戏逻辑前应先阅读对应文档：
- 建筑/地图交互 → `docs/map-and-building-revision.md`
- 资源/物品 API → `docs/resource-item-system-api.md`
- 事件系统 → `docs/event-system-design.md`
- 探险系统 → `docs/expedition-system-design.md`
- 弹窗系统 → `docs/popup-system-design.md`
- 存档系统 → `docs/save-system-design.md`
- 相邻加成系统 → `config/adjacency-bonuses.json` + `docs/map-and-building-revision.md` §相邻加成
- 火把/迷雾系统 → `config/buildings.json`（火把参数配置，`isTorch: true` 条目） + `src/systems/TorchSystem.js`（火把逻辑） + `src/rendering/MapRenderer.js`（迷雾渲染，搜索 `_createFogCanvas`/`_updateFogTexture`）
- 炼金系统 → `docs/炼金的三重镜像——翠玉录·Noita·药剂工艺完全整理.md`（设计研究） + `config/alchemy.json`（配置参考） + `src/systems/AlchemySystem.js`（核心逻辑） + `src/ui/panels/alchemy-panel.js`（主面板） + `src/ui/panels/potion-inventory-panel.js`（库存面板）
