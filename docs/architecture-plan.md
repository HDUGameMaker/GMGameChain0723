# GMGameChain 代码架构方案

## 一、技术栈

| 用途 | 库 | 说明 |
|------|-----|------|
| 2D渲染引擎 | **PixiJS v8** | WebGL/Canvas 2D渲染器，俯视角地图渲染、精灵管理、虚影预览、时段色调 |
| 动画/补间 | **GSAP (GreenSock)** | UI弹窗弹性动画、资源飞入效果、时段过渡 |

其余功能均手动实现，不引入额外库：

| 功能 | 实现方式 |
|------|---------|
| 弹窗/UI | PopupManager + 原生 DOM（详见 `popup-system-design.md`） |
| 状态管理 | EventBus + 简易 store（subscribe 驱动 UI 刷新） |
| 音效 | 对 `Audio` 对象的简易封装 |
| 存档 | 原生 IndexedDB（详见 `docs/save-system-design.md`） |
| 配置编辑器 | 独立 HTML 页面，原生表单控件 |

---

## 二、代码架构总览

```
┌─────────────────────────────────────────────┐
│                  Application                 │
│  (入口、初始化、主循环 requestAnimationFrame)  │
├─────────────────────────────────────────────┤
│  Layer 1: UI Layer (Plain DOM)                │
│  ├── HUD (资源栏、人口、时间、快捷按钮)           │
│  ├── PopupManager (弹窗栈管理)                 │
│  │   └── panels/ (各面板渲染函数，独立文件)      │
├─────────────────────────────────────────────┤
│  Layer 2: Game Systems (Pure Logic)           │
│  ├── TimeSystem     ├── BuildingSystem        │
│  ├── ResourceSystem ├── ExpeditionSystem      │
│  ├── EventSystem    ├── ItemSystem            │
│  ├── PopulationSystem  ├── SaveLoadSystem     │
├─────────────────────────────────────────────┤
│  Layer 3: Render Layer (PixiJS)               │
│  ├── MapRenderer (基地 2D 俯视角地图)          │
│  ├── ExpeditionMapRenderer (探险地图)          │
│  ├── SpriteManager (图片/精灵表管理)           │
│  ├── AnimationManager (动画编排)               │
│  └── EffectManager (粒子/过渡效果)             │
├─────────────────────────────────────────────┤
│  Layer 4: Data Layer                          │
│  ├── ConfigRegistry (所有配置的注册中心)        │
│  ├── SaveManager (存档读写)                    │
│  └── EventBus (跨系统通信)                     │
├─────────────────────────────────────────────┤
│  Layer 5: Config Editors (独立 HTML)           │
│  ├── 策划编辑器 (数值、事件、建筑属性)          │
│  └── 美术编辑器 (图片、动画、坐标、色调)        │
└─────────────────────────────────────────────┘
```

---

## 三、主游戏界面 (HUD)

HUD 是 DOM 浮层，通过 `position: fixed` 叠在 PixiJS canvas 之上，不占用地图空间。分为三个区域：

```
┌─────────────────────────────────────────────────────────┐
│ 💰500 🪵150 ⛏️80  ← 拖动滑动 →      👥8/12/15 ☀️上午 Day3│  ← 顶部：资源栏 + 人口 + 时间
├─────────────────────────────────────────────────────────┤
│                                                         │
│                   PixiJS Canvas (100vw × 100vh)          │
│                                                         │
│         🏠🏠🌲        🏭                              │
│            🏠          🚪 ← 探险出发口（地图固定位置）     │
│         🌾🌾🌾                                          │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  [🏗️建设] [⛶全屏] [⚙️设置] [⏩加速] [⏸暂停]                │  ← 底部：操作按钮
└─────────────────────────────────────────────────────────┘
```

### 顶部资源栏

| 行为 | 说明 |
|------|------|
| 显示内容 | 仅显示 `showInHUD === true` 的资源（关键资源），不是所有非稀有资源都显示 |
| 默认展示 | 图标 + 当前数量（如 `💰500`），**不显示上限**，保持简洁 |
| 满仓提示 | 当前数量 == 上限时，数字变**红色**，提醒玩家存储即将溢出 |
| 查看上限 | **点击**资源图标或数字，弹出 tiny popover 显示 `当前值 / 上限`（如 `500 / 500`）；再次点击或点其他地方关闭。替代 hover tooltip，桌面端和移动端统一体验 |
| 横向滑动 | 资源列表容器 `overflow-x: auto`，当资源种类超出屏幕宽度时可左右滑动，不换行 |
| 数值动画 | 资源变化时数字弹跳/飞入动画（GSAP），吸引玩家注意到变化 |

### 顶部时间显示

| 行为 | 说明 |
|------|------|
| 显示内容 | 时段图标 + 时段名称 + Day N（如 `☀️ 上午 Day 3`） |
| 时段过渡 | 时段切换时图标和名称做淡入淡出过渡（GSAP） |
| 进度指示 | 可选：时段名旁边显示进度条（当前 tick / 总 tick），辅助玩家感知时间流逝 |

### 顶部人口显示

时间显示的左侧固定展示人口状态，格式为 `👥当前/住宅`：

| 行为 | 说明 |
|------|------|
| 显示内容 | `👥 8 / 12` = 当前人口 8、住宅上限 12 |
| 颜色变化 | 当前人口 == 住宅上限 → 住宅数字变**橙色**（住宅瓶颈） |
| 人口变化 | 人口增长/减少时数字带弹跳动画（GSAP），提醒玩家注意人口流动 |
| 查看详情 | **点击**人口数字 → 弹出 tiny popover 显示完整信息：「当前人口 8」「住宅上限 12」「可用工人 X」「已分配 Y」「食物储备 Z」；再次点击关闭 |
| 瓶颈提示 | 当前人口达到住宅上限时，住宅数字变橙色。当目标人口 < 当前人口（即将衰减）时计划增加黄色闪烁警告和倒数天数显示 `[计划中]` |

食物现在作为实际资源显示在资源栏中（🍞），每天结算一次：食物建筑产出食物 → 人口消耗食物（1人/天）→ 不足时触发饥饿死亡。点击食物图标可查看每日净变化。

### 底部操作栏

底部操作栏随游戏状态动态变化：

**正常状态：**

| 按钮 | 图标 | 行为 | 备注 |
|------|:--:|------|------|
| 建设 | 🏗️ | 打开建筑选择弹窗 → 进入放置模式 | — |
| 全屏 | ⛶ | 进入/退出全屏 | 不支持时隐藏 |
| 设置 | ⚙️ | 打开设置弹窗（音量/存档状态/重置） | — |
| 加速 | ⏩ | 时间速度循环切换：1× → 2× → 4× → 1× | 按钮图标随当前速度变化 |
| 暂停 | ⏸/▶ | 暂停/恢复时间推进 | 暂停时图标切换为 ▶ |

**放置模式（PLACING）状态下：**

| 按钮 | 图标 | 行为 |
|------|:--:|------|
| 取消放置 | ✕ | 退出放置模式，回到 IDLE，不消耗资源 |
| 全屏 | ⛶ | 灰显禁用 |
| 设置 | ⚙️ | 灰显禁用（放置期间不允许打开设置） |
| 加速 | ⏩ | 灰显禁用 |
| 暂停 | ⏸ | 灰显禁用 |

放置模式下建设按钮隐藏，替换为取消放置按钮。取消放置同样可以通过 Esc 键触发（键盘作为桌面端的快捷操作，移动端仅靠按钮）。

### 地图交互

所有地图交互使用 **pointer events**（`pointerdown`/`pointermove`/`pointerup`），桌面鼠标和移动端触摸统一处理。

| 行为 | 操作 | 说明 |
|------|:--:|------|
| 视口平移 | 按下左键/手指按住空白区域拖动 | 桌面端和移动端统一；使用 PixiJS pointer events，需在 canvas 上设置 `touch-action: none` 防止浏览器默认滚动 |
| 点击建筑 | 点击地图上的建筑精灵 | 弹出建筑详情弹窗 |
| 点击探险出发口 | 点击地图上的固定探险出发口精灵 | 切换到探险准备界面（独立视图，非弹窗） |
| 取消放置 | Esc 键（桌面端快捷）/ 点击底部[✕取消放置]按钮 | 两种方式等效，移动端仅靠按钮 |

### 探险出发口（地图固定位置）

探险出发口是地图上的一个**固定位置**，由 `config/maps/base_map.json` 定义其网格坐标和精灵。它不是建筑，不可移动、不可拆除、不可选中进入详情——它只有一个行为：点击后切换到探险准备界面。

| 属性 | 说明 |
|------|------|
| 位置来源 | `base_map.json` 中预定义网格坐标（如 `{ gridX: 10, gridY: 5 }`） |
| 渲染方式 | PixiJS 精灵，始终显示在地图固定位置，随地图平移而移动 |
| 点击行为 | 切换到探险准备界面（独立视图，替换主游戏画面） |
| 视觉识别 | 始终可见的固定图标/动画（如 🚪 或营地入口），与建筑精灵区分 |
| 可交互条件 | 无前置条件，游戏开始即可点击进入探险准备 |

> 探险出发口不是建筑，不在建筑列表中，不参与建造/升级/拆除逻辑。它是地图上的一个永久固定设施。

### 交互规则

1. **地图全屏铺满，UI 浮于其上** — 地图 PixiJS canvas 占满整个视口，所有 HUD 元素是 DOM 浮层，不参与 PixiJS 渲染
2. **固定缩放，大地块** — 视口缩放级别固定（不实现滚轮缩放），`tileSize` 设计为足够大（建议 ≥ 64px），确保移动端手指能精准点击建筑
3. **所有信息展示统一为点击触发** — 不使用 hover/tooltip 模式，桌面端和移动端交互一致：想看详情就点击
4. **放置模式下仅可操作取消** — 放置时底部栏切换为取消按钮，防止误操作；地图可正常平移
5. **不阻塞弹窗** — 建筑详情弹窗、建筑选择弹窗、设置弹窗打开时，时间继续推进，地图继续渲染，HUD 继续更新
6. **阻塞弹窗** — 事件弹窗和探险准备界面打开时暂停全局时间

### 移动端与全屏

**全屏按钮**

在底部操作栏（正常状态）固定放置 `⛶` 全屏切换按钮，点击触发 Web Fullscreen API：

```js
// 进入全屏
document.documentElement.requestFullscreen();
// 退出全屏
document.exitFullscreen();
```

| 规则 | 说明 |
|------|------|
| 触发方式 | 必须由用户手势触发（点击按钮），不能自动全屏，这是浏览器的安全限制 |
| 图标切换 | 非全屏时显示 `⛶`（进入全屏），全屏时显示 `⛶` 变体（退出全屏） |
| 退出方式 | 点击按钮 / 浏览器返回键 / 手势从边缘划出浏览器 UI |
| 不支持时 | 检测 `document.fullscreenEnabled`，不支持则隐藏此按钮 |
| 退出监听 | 监听 `fullscreenchange` 事件，同步按钮图标状态 |

**平台兼容性**

| 平台 | 支持 | 备注 |
|------|:--:|------|
| Android Chrome | ✅ | 地址栏隐藏，游戏占满屏幕 |
| iOS Safari | ✅ iOS 12+ | 地址栏和底部工具栏隐藏 |
| 桌面 Chrome/Edge/Firefox | ✅ | F11 或按钮均可 |
| 微信内置浏览器 | ⚠️ | 部分版本不支持，降级为忽略 |

**移动端适配要点**

| 要点 | 说明 |
|------|------|
| `touch-action: none` | canvas 元素设置此 CSS 属性，防止浏览器将手指拖动识别为页面滚动 |
| 最小触摸目标 | 所有可点击元素（建筑精灵、按钮、资源图标）不小于 44×44px（Apple HIG 标准）；`tileSize ≥ 64px` 天然满足 |
| 无 hover 依赖 | 所有信息展示均为点击触发，不使用 hover/tooltip |
| 无右键依赖 | 取消操作提供专用按钮，不依赖右键菜单 |
| 无拖拽依赖 | 探险准备的区域选择和物品装备全部使用点击模式 |
| pointer events | 统一使用 `pointerdown`/`pointermove`/`pointerup`，同时兼容鼠标和触摸 |

**窗口尺寸变化**

桌面端浏览器窗口缩放：PixiJS canvas 监听 `window.resize` → `app.renderer.resize(width, height)` → 重新计算可视网格范围。HUD 浮层使用 `position: fixed` + `vw` 单位，自动适配。弹窗使用 `max-width: 90vw; max-height: 90vh` 防止溢出。

---

## 四、各系统设计

### 1. 主循环 (Game Loop)
- requestAnimationFrame 驱动
- 每帧调用 TimeSystem.update(delta)，累积时间并触发结算点
- 结算点触发 EventBus.emit('tick')
- 所有 System 订阅 tick 事件处理逻辑
- 渲染层独立于逻辑层，只读取状态并绘制
- **阻塞弹窗**（事件、探险准备）打开时暂停时间推进；**非阻塞弹窗**（仓库、建筑详情、设置）打开时时间继续运行。详见 `popup-system-design.md` 阻塞规则表

### 2. 时间系统 (TimeSystem)

`config/global.json`：

```json
{
  "PERIOD_DURATION": 120,
  "TICK_INTERVAL": 40,
  "PERIOD_NAMES": ["morning", "afternoon", "evening", "night"],
  "WORK_PERIODS": ["morning", "afternoon"],
  "population": {
    "growthPerDay": { "min": 4, "max": 8 },
    "declineDelayDays": 2
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `PERIOD_DURATION` | `number` | 每个时间段的现实秒数 |
| `TICK_INTERVAL` | `number` | 结算间隔秒数（`PERIOD_DURATION / TICK_INTERVAL` = 每时段结算次数） |
| `PERIOD_NAMES` | `string[]` | 四个时段名称，顺序固定 |
| `WORK_PERIODS` | `string[]` | 哪些时段建筑会工作（`PERIOD_NAMES` 的子集） |
| `population.growthPerDay` | `{min, max}` | 每天人口增长的随机范围 |
| `population.declineDelayDays` | `number` | 人口超出上限后延迟多少天开始减少 |

### 3. 俯视角地图系统 (Top-Down Map)
- 完全 2D 俯视角正交网格
- 屏幕坐标与网格坐标线性映射：`screenX = col * tileW`, `screenY = row * tileH`
- 建筑占地 n*m 正方形网格，不涉及遮挡排序
- 建筑精灵锚点在格子中心
- 时段色调通过 ColorMatrixFilter + overlay 实现
- 地图网格配置：每格标注地面类型（水泥地/石板路/泥土地/草地/水域等），控制可否建造，预留后续扩展
- 初始建筑（小棚子、仓库）配置在 `config/maps/base_map.json` 的 `initialBuildings` 中
- 详见 `docs/map-and-building-revision.md`

### 4. 建筑系统 (BuildingSystem)

#### 建筑配置 (`config/buildings.json`)

每项建筑的完整字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一标识 |
| `name` | `string` | 显示名称 |
| `footprint` | `{width, height}` | 占地面积（网格单位） |
| `maxCount` | `number \| null` | 最大放置数量。`1` = 全局只能建一个；`null` = 不限数量 |
| `initialBuilding` | `boolean` | 是否由 `base_map.json` 预置在初始地图上 |
| `buildCost` | `[{resourceId, amount}]` | 新建消耗 |
| `buildTime` | `number` | 建造所需 tick 数 |
| `housingCapacity` | `number?` | 提供的居住人口上限（住宅类） |
| `foodCapacity` | `number?` | 每工人每天食物产出量（食物类建筑，如农场/狩猎小屋） |
| `maxWorkers` | `number?` | 可分配的最大工人数（0 = 不需工人） |
| `storageMultiplier` | `number?` | 仓库类：资源上限倍率（1 = 基础，2 = 翻倍） |
| `upgradesTo` | `string?` | 可升级到的目标建筑 ID |
| `upgradesFrom` | `string?` | 此建筑由哪个建筑升级而来 |
| `upgradeCost` | `[{resourceId, amount}]?` | 升级消耗（配置在升级**目标**建筑上） |
| `production` | `object?` | 产出配置，`null` = 无产出 |
| `synthesisRecipes` | `object[]` | 合成配方列表（工作站类建筑） |

**production 子结构：**

```json
{
  "perWorker": true,
  "input":  [{ "resourceId": "coal", "amount": 1 }],
  "output": [{ "resourceId": "iron_ingot", "amount": 4 }]
}
```

- `perWorker: true` → output 为每个工人的产出，总产出 = output × currentWorkers（如熔炉 1 工人 = 1煤+8铁矿→4铁锭，2 工人 = 2煤+16铁矿→8铁锭）
- `perWorker: false` → output 为建筑整体产出，不受工人数影响（如木材处理厂固定 4原木→2木板）

#### 多建筑放置 (`maxCount`)

| maxCount | 行为 |
|:--:|------|
| `null` | 无数量限制，可重复建造（如工棚、农田、伐木集散点） |
| `1` | 全局唯一，建造后从可选列表中移除（如仓库、工作站、矿洞支撑结构） |

#### 升级机制

```
工棚 ──(15木板)──→ 木板房
基础工作站 ──(30木板)──→ 进阶工作站
仓库 ──(150木板+100铁锭+100石头)──→ 工业仓储中心
```

- 升级 = 消耗旧建筑 + 配方资源，原地建造目标建筑
- 建造时间复用目标建筑的 `buildTime`
- **仓库特殊规则** `[计划中]`：升级期间，低等级仓库的存储功能计划继续生效。当前实现中仓库升级时存储倍率跟随目标建筑配置

#### 放置与交互

- 状态机：`IDLE → SELECTING → PLACING → PLACED(建造中) → ACTIVE`
- 放置合法性校验：边界、与已有建筑重叠、`maxCount` 限制、地形限制、资源足够
- 交互流程（详见 `docs/map-and-building-revision.md`）：
  - HUD 建设按钮 → 建筑选择窗口 → 选择建筑 → 虚影跟随至地图 → 点击放置
- 点击已建建筑 → 建筑详情弹窗（人力分配 / 升级 / 合成 / 拆除）
- 产出在每次 tick 结算（产出量受相邻加成影响，见下方）

#### 相邻加成系统

建筑之间根据距离产生**正加成或负加成**，影响产出、食物产出或住宅容量。配置在 `config/adjacency-bonuses.json` 中，由 BuildingSystem 在运行时计算并应用。

**核心机制：**

| 概念 | 说明 |
|------|------|
| Chebyshev 距离 | 两建筑 footprint 矩形之间的最小间隙（0 = 相邻紧挨，1 = 隔一格） |
| 加成方向 | `sourceBuildingId`（受益方/接收方）靠近 `targetBuildingId`（提供方）时触发 |
| 效果类型 | `multiplier`（乘算 ×value）或 `flat`（加算 +value） |
| 应用于字段 | `production`（生产产出）、`foodCapacity`（食物产出）、`housingCapacity`（住宅容量） |
| 应用于资源 | `all`（全部产出）或指定 `resourceId` |

**配置结构** (`config/adjacency-bonuses.json`)：

```json
{
  "id": "lumber_mill_near_logging_camp",
  "name": "木材处理厂·伐木协同",
  "sourceBuildingId": "lumber_mill",
  "targetBuildingId": "logging_camp",
  "maxDistance": 1,
  "effectType": "multiplier",
  "effectValue": 1.5,
  "applyToField": "production",
  "applyTo": "all"
}
```

**运行时行为：**
- 每次 tick 生产结算时，BuildingSystem 自动查询当前建筑的相邻加成并应用到产出
- `getProductionRates()` 返回值已包含加成影响
- 放置/拖动建筑时，MapRenderer 显示相邻加成提示：绿色边框+实线=范围内正加成，红色边框+实线=范围内负加成，灰色虚线=规则中但超出距离
- 箭头永远从提供方 → 受益方（被影响者）
- 建筑详情面板显示当前生效的所有相邻加成

**策划配置：** 在 `planner-config.html` 的「🔗 相邻加成」Tab 中可视化编辑，含 SVG 可拖拽节点关系图。

---

### 4.5. 人口系统 (PopulationSystem)

人口由「住宅」上限约束，朝住宅上限增长或减少。食物是**实际资源**——食物建筑每天产出食物，人口每天消耗食物，食物不足时触发饥饿死亡。

```
居住人口上限 = Σ 所有住宅类建筑的 housingCapacity

目标人口 = 居住人口上限
```

> 注意：食物**不再**限制人口增长。人口增长只看住宅。但食物不够时人口会因饥饿直接死亡。

#### 每日结算流程（`dayStart` 触发）

每天开始时按以下顺序结算：

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1. 食物产出 | `resourceSystem.addClamped('food', buildingSystem.getTotalFoodProduction())` | 所有食物建筑的 `foodCapacity × workers` 之和 |
| 2. 食物消耗 | `resourceSystem.tryConsume('food', min(储量, 当前人口))` | 每人每天消耗 1 食物 |
| 3. 饥饿死亡 | `deficit = 当前人口 - 实际消耗量` | 食物不够时，差额人数立即死亡 |
| 4. 游戏结束 | `if 当前人口 < 2 → emit('gameOver')` | 人口不足 2 人时触发游戏结束画面 |
| 5. 住房增长 | 若 `当前人口 < 住宅上限` → 每天增长 `growthPerDay` 人 | 朝住宅上限自然增长 |

#### 增长与减少

| 条件 | 行为 |
|------|------|
| 当前人口 < 住宅上限 | 每天随机增长 `growthPerDay` 人（如 4~8 人） |
| 当前人口 > 住宅上限 | 等待 `declineDelayDays` 天（默认 2 天），之后以相同随机速率减少，直到等于住宅上限 |
| 当前人口 = 住宅上限 | 不变 |

#### 饥饿死亡

每天食物消耗时，如果食物储备不足以覆盖全部人口：
- 实际消耗量 = `min(食物储量, 当前人口)`
- 死亡人数 = `当前人口 - 实际消耗量`
- 死亡直接减少 `current`，不做延迟

#### 配置（`global.json → population`）

```json
"population": {
  "growthPerDay": { "min": 4, "max": 8 },
  "declineDelayDays": 2
}
```

#### 探险期间

探险出发时**不减少当前可用工人**。探险队员视为「额外离岗」，不计入工人消耗。探险归来后恢复。

#### 工人分配

- 全局可用工人池 = `当前人口 - Σ 所有工作中的建筑的 currentWorkers`
- 玩家在建筑详情弹窗中分配/调整工人
- 建筑产出 = `production × currentWorkers`（`perWorker: true` 时）

### 5. 资源系统 (ResourceSystem)
- 详见 `resource-item-system-api.md`
- ResourceConfig: ID/名称/图标/是否稀有/上限/初始值
- 稀有资源仅仓库面板可见；只有 `showInHUD: true` 的关键资源才在主界面 HUD 资源栏显示
- 对外暴露修改函数（add/tryConsume/setMax），内部校验合法性并返回 bool
- **存储上限**：每种资源在 `resources.json` 中定义独立 `max`。仓库建筑的 `storageMultiplier` 全局叠加到所有资源上 — 最终 `max = 配置max × 仓库storageMultiplier`（仓库=×1，工业仓储中心=×2）

### 6. 探险系统 (ExpeditionSystem)
- 详见 `docs/expedition-system-design.md`
- 三时段三区域：出发前为每个时段选择一个探险区域，可重复选择
- 双重容量：背包容量管物品携带（物品占不同容量），资源容量管采集上限
- 产出公式：区域基准产出 × 物品倍率加成 + 固定加成，按容量顺序截断
- 区域解锁：OR 逻辑，满足物品条件（背包携带）或建筑条件其一即可
- 探险事件：结构复用基地事件，额外增加 `regions` / `requiredCarriedItems` 字段
- 物品合成绑定工作站建筑，配方配置在 BuildingConfig 中

### 7. 事件系统 (EventSystem)
- 详见 `docs/event-system-design.md`
- 触发条件三字段：`timePeriods` / `requiredItems` / `requiredBuildings`，AND 关系
- 失效条件与触发条件同构（三字段），OR 关系
- 效果采用策略模式注册，内置 add_resource / consume_resource / obtain_item / consume_item / unlock_building / trigger_event
- tick 时收集满足条件的事件，按优先级排序、互斥组过滤、概率掷骰触发
- 故事链通过「事件 A 奖励物品 X → 事件 B 前提物品 X」实现
- 探险事件额外增加 `regions` / `requiredCarriedItems` 条件字段，阻塞规则与基地事件相同（全局暂停）

### 8. 物品系统 (ItemSystem)
- 详见 `resource-item-system-api.md` §二
- **实例模型**：所有物品以实例（instance）追踪，每个实例有唯一 `instanceId`（如 `"marking_torch_1"`）。`unique: true` 的物品实例数上限为 1
- 物品状态：`equipped`（探险准备中勾选）→ `inExpedition`（出发后锁定）
- `consumable: true` 的物品在探险归来时自动 `lose()`（标记火把）
- 对外暴露修改函数（obtain/lose/equip/unequip/markExpedition/returnFromExpedition），均以 `instanceId` 操作

### 9. 弹窗系统 (PopupManager)
- 详见 `popup-system-design.md`
- 统一外壳 + 导航栈 + 注册式面板渲染函数
- 所有面板（仓库、冒险、建筑、事件）共用同一套弹窗外壳
- 新增面板 = 创建渲染函数文件 + 注册一行代码

### 10. 存档系统 (SaveLoadSystem)
- 详见 `docs/save-system-design.md`
- 单存档位，每个时段结束后自动保存（120s 一次）
- IndexedDB 存储，SaveManager 封装为 async 接口
- 保存全部玩法状态：时间/人口/资源/物品(实例)/建筑(含工人分配)/探险/事件进度
- 设置界面提供重置存档按钮（确认后清除并回到初始状态）
- 加载时：配置 JSON → ConfigRegistry → 读存档覆盖动态值 → 无存档则初始化

---

## 五、文件目录结构

```
GMGameChain0723/
├── index.html                    # 主游戏入口
├── editor_art.html               # 美术编辑器
├── editor_design.html            # 策划编辑器
├── docs/                         # 设计文档
├── assets/
│   ├── images/                   # 按用途分子目录（buildings/items/resources/maps/ui）
│   ├── audio/                    # bgm/ sfx/
│   └── fonts/
├── config/                       # JSON配置，加载时由 ConfigRegistry 统一读取
│   ├── global.json               # 全局参数（时间段、结算间隔等）
│   ├── buildings.json            # 建筑配置
│   ├── adjacency-bonuses.json    # 建筑相邻加成规则
│   ├── items.json                # 物品配置
│   ├── resources.json            # 资源配置
│   ├── events/                   # 事件配置（按场景分文件）
│   ├── expeditions/              # 探险配置（区域 + 全局参数）
│   ├── maps/                     # 地图配置
│   └── art.json                  # 美术参数（占位，供美术编辑器使用，目前不定义结构）
├── src/
│   ├── main.js                   # 入口
│   ├── GameLoop.js
│   ├── core/                     # 基础设施（EventBus, ConfigRegistry, SaveManager, Store）
│   ├── systems/                  # 游戏逻辑系统（Time/Population/Resource/Building/Expedition/Event/Item）
│   ├── events/                   # 事件效果处理器注册 + 条件校验
│   ├── rendering/                # PixiJS 渲染（MapRenderer, SpriteManager 等）
│   ├── ui/                       # DOM UI（PopupManager, HUD, panels/）
│   ├── audio/                    # 音效封装
│   └── utils/                    # 工具函数
```

---

## 六、数据流

```
策划/美术编辑器 ──(JSON)──→ config/ ──(读取)──→ ConfigRegistry
                                                     │
                                           ┌─────────┼─────────┐
                                           ↓         ↓         ↓
                                      TimeSystem  BuildSys  EventSys ...
                                           │         │         │
                                           └─────────┼─────────┘
                                                     ↓
                                              Store / EventBus
                                                     │
                                           ┌─────────┼─────────┐
                                           ↓         ↓         ↓
                                      MapRenderer  PopupManager  AudioManager
                                      (PixiJS)     (Plain DOM)   (Audio)
```

- 配置数据从 JSON 文件单向流入 ConfigRegistry
- 游戏系统通过 EventBus 通信，状态变更写入 Store
- 渲染层和 UI 层通过 subscribe 监听 Store 变化，只读取不写入
- 用户交互通过 PopupManager 的面板回调 → 调用 System API → 修改 Store → 触发 UI 刷新

---

## 七、开发路径

| Phase | 内容 | 产出 |
|------|------|------|
| 0 | 项目骨架、ConfigRegistry、EventBus、Store | 可运行的空项目 |
| 1 | 俯视角地图渲染 + 配置加载 + 建筑精灵显示 | 2D地图和建筑 |
| 2 | 时间系统 + 资源系统 + 人口系统 + HUD（资源栏/人口/时间/操作按钮） | 时间流逝 + 资源 + 人口增长 + HUD |
| 3 | 建筑交互（选择窗口/虚影放置/建造倒计时/详情弹窗/工人分配）+ 生产逻辑 + maxCount 限制 | 核心玩法闭环 |
| 4 | 事件系统（三字段条件/效果策略模式/trigger_event 分支叙事/弹窗阻塞）| 事件驱动 |
| 5 | 探险系统（三时段区域选择/双重容量/产出计算/探险事件/物品合成/消耗品）| 外出探索 |
| 6 | 音效 + 动画 + 时段视觉效果 | 体验提升 |
| 7 | 策划编辑器 + 美术编辑器 | 配置工具 |
| 8 | 存档系统（单存档位/时段保存/IndexedDB/重置功能）+ 平衡调整 | 可玩版本 |
