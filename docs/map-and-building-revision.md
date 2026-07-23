# 地图与建筑系统修订方案

## 修订概述

在原 `architecture-plan.md` 的基础上，对**等距地图系统**和**建筑系统**的交互流程做以下两个方向的简化/优化。

---

## 一、地图系统：2.5D 等距 → 完全 2D 俯视角

### 变更原因

- 等距投影带来 Painter's Algorithm 遮挡排序、高程管理、坐标双向转换等工程复杂度
- 对于以网格为基础的建筑放置玩法，俯视角天然匹配，开发效率更高
- 地图上追求简洁清晰的功能性表现，建筑的"美感展示"转移到弹窗中

### 具体变化

| 项目 | 原方案 (架构规划) | 修订方案 |
|------|------------------|---------|
| 投影方式 | 2.5D 等距 (2:1 菱形瓦片) | 完全 2D 俯视角（正交网格） |
| 坐标转换 | `isoToScreen` / `screenToIso` 双向转换 | 简单的 `(row, col) → (x, y)` 线性映射 |
| 遮挡排序 | Painter's Algorithm (`sortKey = gridY*1000 + gridX*10 + elevation`) | 不需要，俯视角无遮挡问题 |
| 建筑精灵 | 等距视角精灵，锚点在底部中心 | 俯视角图标/色块，锚点在格子中心 |
| 地图底图 | 等距地形瓦片拼接 | 俯视角网格地图（可用简单色块+边框表示地形） |
| 建筑内部视觉 | 地图上直接显示等距建筑 | 地图上显示简洁俯视图标；点开建筑弹窗后用**美术提供的偏 3D 精美大图**展示 |

### 保留的内容

- 网格坐标系统（建筑占地 `n × m` 格）
- 时段色调系统（ColorMatrixFilter + overlay，通过 PixiJS 实现）
- 配置驱动的地图数据（`config/maps/base_map.json`）

### 删除/简化的模块

- `src/utils/isometric.js` — 可删除或精简为网格坐标辅助函数
- `MapRenderer` — 遮挡排序逻辑全部移除

---

## 二、建筑系统：交互流程重新设计

### 新交互流程

```
玩家视角（地图界面）
  │
  ├─ 点击 HUD 上的「建筑」按钮
  │     │
  │     ▼
  │  弹出建筑选择窗口（PopupManager 面板）
  │     │
  │     ├─ 展示内容：
  │     │   ├─ 已解锁的建筑列表（图标 + 名称 + 描述）
  │     │   ├─ 每个建筑标注所需资源及数量
  │     │   ├─ 每个建筑标注占地面积（如 2×2、3×3 格）
  │     │   └─ 资源不足的建筑按钮灰显
  │     │
  │     ├─ 玩家点击一个可建造的建筑
  │     │     │
  │     │     ▼
  │     │  关闭弹窗，进入「放置模式」
  │     │     │
  │     │     ├─ 地图上出现该建筑的俯视角虚影（半透明跟随鼠标）
  │     │     ├─ 虚影颜色随合法性变化：
  │     │     │   ├─ 绿色/正常 — 位置合法（空位、不超出边界）
  │     │     │   └─ 红色 — 位置非法（与已有建筑重叠、超出地图）
  │     │     │
  │     │     ├─ 玩家移动鼠标选择位置
  │     │     │
  │     │     ├─ 左键点击合法位置 → 确认放置
  │     │     │     │
  │     │     │     ▼
  │     │     │  扣减资源 → 建筑进入建造倒计时 → 虚影变实
  │     │     │
  │     │     └─ 右键 / Esc → 取消放置，回到地图界面
  │     │
  │     └─ 点击窗口关闭按钮 → 回到地图界面
  │
  └─ 点击已放置的建筑
        │
        ▼
     弹出建筑详情弹窗（使用偏 3D 精美大图 + 升级/生产/拆除选项）
```

### 建筑系统状态机

```
                    ┌──────────┐
                    │   IDLE   │  地图自由视角
                    └────┬─────┘
                         │ HUD 建筑按钮点击
                         ▼
                  ┌──────────────┐
                  │  SELECTING   │  建筑选择窗口打开（PopupManager 阻塞）
                  └──────┬───────┘
                         │ 玩家选定建筑
                         ▼
                  ┌──────────────┐
                  │   PLACING    │  虚影跟随鼠标，地图可移动
                  └──────┬───────┘
                         │
              ┌──────────┼──────────┐
              │ 左键合法  │ 右键/Esc │
              ▼          ▼          │
        ┌─────────┐  ┌──────────┐   │
        │ PLACED  │  │  IDLE    │◄──┘
        └────┬────┘  └──────────┘
             │ 建造倒计时结束
             ▼
        ┌─────────┐
        │ ACTIVE  │  建筑正常运行
        └─────────┘
```

建筑运行时状态（`status` 字段）仅两个值：

| status | 含义 | 产出 | 工人 |
|--------|------|:--:|:--:|
| `constructing` | 建造中（含新建和升级），`buildProgress` 记录已过 tick 数 | ❌ | 0 |
| `active` | 正常运行 | ✅ | 可分配 |

升级流程：点击升级 → 扣资源 + 消耗旧建筑 → 同一坐标创建新建筑（`buildingId = targetBuildingId`，`status = constructing`，`buildProgress = 0`）→ `buildTime` 后自动切换 `active`。

### 放置模式详细规则

| 规则 | 说明 |
|------|------|
| 边界校验 | 建筑占地不能超出地图边界 |
| 重叠校验 | 建筑占地不能与已有建筑（含建造中的）重叠 |
| 地形校验 | （后续扩展）部分地形不可建造（如水域） |
| 资源校验 | 已在选择窗口完成，放置时不再重复校验（但扣减时可再次确认） |
| 视觉反馈 | 虚影始终跟随鼠标吸附到最近合法网格；非法位置时虚影变红并拒绝放置 |
| 取消操作 | 右键或 Esc 退出放置模式，不消耗资源 |

---

## 三、对现有架构的影响汇总

### 需要修改的文件

| 文件 | 变化 |
|------|------|
| `src/rendering/MapRenderer.js` | 从等距渲染改为俯视网格渲染；新增虚影渲染逻辑 |
| `src/utils/isometric.js` | 删除或精简为 `gridUtils.js`（网格坐标辅助函数） |
| `src/systems/BuildingSystem.js` | 新增放置模式状态机、位置合法性校验 |
| `src/ui/HUD.js` | 新增「建筑」按钮 |
| `src/ui/panels/building-panel.js` | 拆分为 `building-select-panel.js`（建造选择）和 `building-detail-panel.js`（已建造详情） |

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/ui/panels/building-select-panel.js` | 建筑选择窗口渲染函数 |
| `src/ui/panels/building-detail-panel.js` | 建筑详情窗口渲染函数（展示偏 3D 大图） |

### 不需要修改的文件

| 文件 | 原因 |
|------|------|
| `src/systems/TimeSystem.js` | 与地图渲染方式无关 |
| `src/systems/ResourceSystem.js` | 交互流程变化不影响资源API |
| `src/systems/EventSystem.js` | 无关 |
| `src/systems/ItemSystem.js` | 无关 |
| `src/systems/ExpeditionSystem.js` | 无关 |
| `src/ui/PopupManager.js` | 弹窗外壳不变，新增面板走注册机制即可 |
| `src/core/*` | EventBus / ConfigRegistry / SaveManager / Store 均不受影响 |

### 美术资源变化

| 用途 | 原需求 | 新需求 |
|------|--------|--------|
| 地图上建筑 | 等距精灵（2.5D 视角） | 俯视角图标（简洁功能性） |
| 弹窗内建筑 | 无特别要求 | **偏 3D 精美大图**（用于建筑详情弹窗） |
| 建筑选择窗口 | 无 | 缩略图/图标 + 资源消耗文本 |
| 建筑虚影 | 无 | 俯视角半透明轮廓（与占地格数匹配） |

---

## 四、与原架构方案的兼容性

本修订方案**不推翻**原架构规划的以下核心设计：

- 五层架构（UI / Game Systems / Render / Data / Config Editors）
- 弹窗系统（PopupManager 统一外壳 + 注册式面板）
- EventBus + Store 的数据流模式
- 配置驱动（`config/buildings.json` 扩展字段即可支持新交互）
- 开发路径（Phase 1 和 Phase 3 的内容调整,Phase 顺序不变）

本质上是**Phase 1（地图渲染）减负** + **Phase 3（建筑交互）细化**，不影响其他 Phase。

---

## 五、建筑配置结构

`config/buildings.json` 的完整结构（当前实现）：

```json
{
  "id": "lumber_mill",
  "name": "木材处理厂",
  "description": "将原木加工成木板",
  "icon": "building_lumber_mill.png",
  "imageDetail": "detail_lumber_mill.png",
  "footprint": { "width": 2, "height": 2 },
  "maxCount": null,
  "initialBuilding": false,
  "maxWorkers": 2,
  "buildCost": [
    { "resourceId": "stone", "amount": 50 },
    { "resourceId": "wood", "amount": 100 }
  ],
  "buildTime": 3,
  "upgradesTo": null,
  "upgradeCost": null,
  "production": {
    "perWorker": true,
    "input":  [{ "resourceId": "wood", "amount": 4 }],
    "output": [{ "resourceId": "plank", "amount": 2 }]
  },
  "synthesisRecipes": [],
  "housingCapacity": null,
  "foodCapacity": null,
  "storageMultiplier": null,
  "labelLayout": {}
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一标识 |
| `name` | `string` | 显示名称 |
| `icon` | `string` | 图标文件名 |
| `imageDetail` | `string` | 弹窗详情大图文件名 |
| `footprint` | `{width, height}` | 建筑占地格数 |
| `maxCount` | `number\|null` | 最大放置数量，null=不限 |
| `initialBuilding` | `boolean` | 是否为初始预置建筑 |
| `maxWorkers` | `number` | 最大可分配工人数（0=不需工人） |
| `buildCost` | `array` | 建造消耗的资源列表 `[{resourceId, amount}]` |
| `buildTime` | `number` | 建造所需 tick 数 |
| `upgradesTo` | `string\|null` | 可升级到的目标建筑 ID |
| `upgradesFrom` | `string\|null` | 此建筑由哪个建筑升级而来（标记在目标建筑上） |
| `upgradeCost` | `array\|null` | 升级消耗资源（标记在目标建筑上） |
| `production` | `object\|null` | 产出配置，含 `perWorker`/`input`/`output` |
| `synthesisRecipes` | `array` | 合成配方列表（工作站建筑） |
| `housingCapacity` | `number\|null` | 提供的居住人口上限（住宅类） |
| `foodCapacity` | `number\|null` | 提供的食物人口上限/每工人（食物类建筑） |
| `storageMultiplier` | `number\|null` | 仓库存储倍率（仓库类建筑） |
| `allowedGrounds` | `string[]\|null` | 可建造的地面类型字符，null=不限 |
| `labelLayout` | `object` | 地图标签偏移配置（可选） |
| `demolishable` | `boolean` | 是否可拆除，默认 true |

### 人力分配

- 全局**可用工人池** = 当前人口 - 已分配工人总数
- 每个生产建筑有 `maxWorkers`（最大容纳）和运行时字段 `currentWorkers`（当前已分配）
- 产出公式：**每 tick 产出 = production.output × currentWorkers**（`perWorker: true` 时）
- 未分配工人的建筑（`currentWorkers = 0`）不产出
- 玩家在建筑详情弹窗中拖动滑块调整工人分配，`currentWorkers` 总和不能超过可用工人池
- 建筑建造中、升级中期间工人自动遣返到可用池

### 升级配方 (upgradeRecipe)

每个建筑最多一个升级目标。升级本质是**以旧建筑为成本，原地开始建造新建筑**——消耗旧建筑和配方资源，在同一位置进入建造倒计时，建造时间复用目标建筑的 `buildTime`。

| 字段 | 类型 | 说明 |
|------|------|------|
| `targetBuildingId` | `string` | 升级目标建筑 ID |
| `resourceCost` | `array` | 升级消耗的资源 |
| `itemCost` | `array` | 升级消耗的物品（`{ itemId, count }`，可为空数组） |

约束：配置时保证 `targetBuildingId` 在 `buildings.json` 中存在，且不会形成升级循环。

### 合成配方 (synthesisRecipes)

绑定在工作站建筑上，详见 `docs/expedition-system-design.md` 第八节。

---

## 六、基地地图网格配置

`config/maps/base_map.json` 定义基地地图的网格结构、每格的属性和初始建筑。

### 设计原则

- **网格对齐**：所有建筑位置严格对齐网格，不会出现非网格位置
- **根据美术图划分**：策划加载美术提供的地图底图，在编辑器中用网格叠加层标记每格的属性
- **地面类型决定可建造性**：每格的 `groundType` 通过其 `buildable` 字段（三态）控制建造规则；建筑可通过 `allowedGrounds` 声明可放置的地面字符

### 配置结构

```json
{
  "gridWidth": 20,
  "gridHeight": 15,
  "tileSize": 64,

  "groundTypes": {
    "R": { "name": "裸露石头",  "colorHint": "#D5D0C8", "buildable": "restricted" },
    "G": { "name": "草地",      "colorHint": "#7BA05B", "buildable": true },
    "D": { "name": "普通土地",  "colorHint": "#B89B5A", "buildable": true },
    "F": { "name": "林地边缘",  "colorHint": "#2D5A1E", "buildable": true },
    "M": { "name": "山脉",      "colorHint": "#1A1A1A", "buildable": false },
    "W": { "name": "水源",      "colorHint": "#4682B4", "buildable": false }
  },

  "grid": [
    "RRRRGGGGGGGGGGGGGGGGGG",
    "RRRRGGGGGGGGGGGGGGGGGG",
    "RRRRDDDDDDDDDDDDDDDDDD",
    "RRRRDDDDDDDDDDDDDDDDDD",
    "RRDDDDDDDDDDDDDDDDDDDD",
    "RRDDDDDDDDDDDDDDDDDDDD",
    "FFDDDDDDDDDDDDDDDDDDDD",
    "FFFFDDDDDDDDDDDDDDDDDD",
    "FFFFFFDDDDDDDDDDDDDDDD",
    "FFFFFFFFDDDDDDDDDDDDDD",
    "FFFFFFFFFFDDDDDDDDDDDD",
    "FFFFFFFFFFMMDDDDDDDDDD",
    "FFFFFFFFFFMMFFDDDDDDDD",
    "FFFFFFFFFFMMFFFFDDDDWW",
    "FFFFFFFFFFFFFFFFDDWW"
  ],

  "initialBuildings": [
    { "buildingId": "small_shed",  "gridX": 5, "gridY": 3 },
    { "buildingId": "warehouse",   "gridX": 8, "gridY": 3 }
  ],

  "expeditionEntrance": { "gridX": 16, "gridY": 6 }
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `gridWidth` | `number` | 网格列数（X 方向） |
| `gridHeight` | `number` | 网格行数（Y 方向） |
| `tileSize` | `number` | 每格像素大小，用于像素坐标与网格坐标转换 |
| `groundTypes` | `object` | 地面类型字典，key 为单字符代码，value 为属性 |
| `grid` | `string[]` | 网格数据，每行一个字符串，每字符对应一格的地面类型 key |
| `initialBuildings` | `array` | 初始已放置的建筑列表 |
| `expeditionEntrance` | `object` | 远征入口网格坐标（`{gridX, gridY}`） |

### 地面类型属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 显示名称 |
| `colorHint` | `string` | 编辑器中的预览色（运行时由美术底图决定实际外观，不读取此颜色） |
| `buildable` | `boolean \| string` | 建造许可：`true`（所有建筑可建）、`false`（不可建）、`"restricted"`（仅 `allowedGrounds` 中声明匹配的建筑可建） |

### 六种地面类型一览

| 字符 | 名称 | 颜色 | `buildable` | 说明 |
|------|------|------|:-----------:|------|
| `R` | 裸露石头 (Bare Rock) | `#D5D0C8` | `"restricted"` | 仅采石场可建 |
| `G` | 草地 (Grassland) | `#7BA05B` | `true` | 农场 + 所有普通建筑可建 |
| `D` | 普通土地 (Normal Soil) | `#B89B5A` | `true` | 所有普通建筑可建 |
| `F` | 林地边缘 (Forest Edge) | `#2D5A1E` | `true` | 伐木营地 + 所有普通建筑可建 |
| `M` | 山脉 (Mountains) | `#1A1A1A` | `false` | 不可建造 |
| `W` | 水源 (Water) | `#4682B4` | `false` | 不可建造 |

### 建筑配置的 `allowedGrounds`

在 `config/buildings.json` 中，建筑可增加 `allowedGrounds` 字段来声明其可放置的地面类型：

```json
{
  "id": "quarry",
  "name": "采石场",
  "allowedGrounds": ["R"],
  "footprint": { "width": 2, "height": 2 },
  ...
}
```

| 建筑 | `allowedGrounds` | 说明 |
|------|:----------------:|------|
| 采石场 | `["R"]` | 只能放在裸露石头（R）上 |
| 农场 | `["G"]` | 只能放在草地（G）上 |
| 伐木营地 | `["F"]` | 只能放在林地边缘（F）上 |
| 普通建筑 | 不设置（默认 `null`） | 可放在任意 `buildable: true` 的地面上 |

- `allowedGrounds` 为 `null` 或未设置时，建筑可放在所有 `buildable: true` 的地面
- `allowedGrounds` 为数组时，建筑**只能**放在数组中列出的地面字符上

### 网格数据的坐标约定

- 原点 `(0, 0)` 在**左上角**
- `grid[0][0]` = 第 0 行第 0 列 = 坐标 `(0, 0)`
- `grid[row][col]` = 坐标 `(col, row)`
- `gridX` 沿 X 轴向右增加（列），`gridY` 沿 Y 轴向下增加（行）

### 放置合法性判断

建筑占地 `footprint: {width: w, height: h}`，放置在 `(gridX, gridY)` 时：

```
合法性 = 建筑完全在地图范围内
       AND 覆盖区域无已有建筑（含建造中的）
       AND 覆盖的每个格子 (gx, gy) 均通过 canPlaceAt(buildingId, gx, gy)
```

`canPlaceAt(buildingId, gridX, gridY)` 判断逻辑：

```
canPlaceAt(buildingId, gx, gy):
  terrain = groundTypes[ grid[gy][gx] ]

  1. 若 terrain.buildable === false  → 不可放置（山脉、水源）
  2. 若 terrain.buildable === true   → 再检查 allowedGrounds：
     a. 若 building.allowedGrounds 为 null/undefined → 允许放置（普通建筑）
     b. 若 building.allowedGrounds 包含 terrain 字符 → 允许放置（如农场所需）
     c. 否则 → 不可放置
  3. 若 terrain.buildable === "restricted" → 再检查 allowedGrounds：
     a. 若 building.allowedGrounds 包含 terrain 字符 → 允许放置（如采石场在 R 上）
     b. 否则 → 不可放置
```

#### 判断流程总结

| `terrain.buildable` | `building.allowedGrounds` | 结果 |
|:-------------------:|:-------------------------:|:----:|
| `false` | 任意 | 不可放置 |
| `true` | `null` / 未设置 | 可放置 |
| `true` | `[字符]` | 仅 terrain 字符在数组中时可放置 |
| `"restricted"` | `[字符]` | 仅 terrain 字符在数组中时可放置 |
| `"restricted"` | `null` / 未设置 | 不可放置（受限地面不接受普通建筑） |

#### 实际应用示例

| 建筑 | 可放置的地面 | 不可放置的地面 |
|------|-------------|---------------|
| 采石场 (allowedGrounds: `["R"]`) | R | G, D, F, M, W |
| 农场 (allowedGrounds: `["G"]`) | G | R, D, F, M, W |
| 伐木营地 (allowedGrounds: `["F"]`) | F | R, G, D, M, W |
| 小屋 (无 allowedGrounds) | G, D, F | R(受限), M(禁止), W(禁止) |
| 仓库 (无 allowedGrounds) | G, D, F | R(受限), M(禁止), W(禁止) |

### 美术编辑器中的操作

`editor_art.html` 中加载地图底图后，策划可以：

1. 设定 `gridWidth` / `gridHeight` / `tileSize`
2. 将半透明网格叠加在地图底图上
3. 拖拽网格使其与美术图的建筑空位对齐
4. 点击格子切换地面类型（循环切换或下拉选择）
5. 批量拖选区域统一设置地面类型
6. 在地图上拖放初始建筑

输出为 `config/maps/base_map.json`。

---

## 七、方案评价

**优点：**

1. **工程复杂度显著降低** — 删除等距投影全部逻辑，地图渲染代码量预计减少 40%+
2. **交互体验更好** — 虚影预览 + 合法性格子高亮是经过大量城市建造游戏验证的 UX 模式
3. **视觉分离合理** — 地图追求可读性和功能性，弹窗追求美感和沉浸感，各司其职
4. **与现有架构无缝兼容** — 弹窗系统、EventBus 数据流、配置驱动等核心设计全部复用

**注意事项：**

1. 俯视角地图可能显得"平"，需要通过配色/边框/装饰元素弥补视觉层次
2. 放置虚影需要 PixiJS 的交互层支持（pointermove 跟踪 + 网格吸附），这部分需要仔细实现
3. 建筑详情弹窗的偏 3D 大图尺寸和弹窗容器的适配需要和美术协同确定

---

*本文档是对 `architecture-plan.md` 的补充修订，阅读时请结合原架构方案。*
