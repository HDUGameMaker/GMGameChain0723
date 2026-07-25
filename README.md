# GMGameChain — 末世生存模拟经营网页游戏

一款基于 PixiJS v8 + GSAP 的 2D 俯视角末世生存模拟经营网页游戏，纯前端实现，零后端依赖。

---

## 快速开始

```bash
# 1. 生成资源清单（首次或资源有变动时执行）
node scripts/generate-asset-manifest.js

# 2. 启动本地 HTTP 服务（必须，fetch 加载 JSON 配置不支持 file://）
npx http-server -p 8080 -c-1 --cors

# 3. 浏览器打开
# http://127.0.0.1:8080
```

或者直接双击 **`启动游戏.bat`**（自动完成以上步骤）。

---

## 游戏系统

### 🏗️ 建造与升级

在 20×15 网格地图上放置建筑，部分建筑受地形限制：

| 建筑 | 占地 | 说明 |
|------|:---:|------|
| 工棚 → 木板房 | 1×1 | 基础/升级住宅（2/5 人口容量） |
| 瓦房 | 2×2 | 高级住宅（12 人口容量） |
| 狩猎小屋 | 1×1 | 食物来源，每屋支撑 5 人口粮 |
| 农田 | 3×3 | 仅草地，每工人支撑 7 人口粮（最多 5 工人） |
| 仓库 → 工业仓储中心 | 3×3 | 唯一，存储倍率 1× → 2×，不可拆除 |
| 伐木集散点 | 1×1 | 仅林地，产出原木 |
| 采石场 | 2×2 | 仅裸露岩石，产出石头 |
| 木材处理厂 | 2×2 | 原木 → 木板加工 |
| 熔炉 | 2×2 | 铁矿+煤炭 → 铁锭冶炼 |
| 矿洞支撑结构 | 2×2 | 唯一，解锁矿洞深处探险（无需头灯） |
| 基础工作站 → 进阶工作站 | 1×1 | 唯一，合成探险装备 |

- 建筑有 **建造时间**（1~6 tick），施工期间显示进度条
- 生产建筑支持 **多工人并行**，每个工人独立消耗/产出
- 部分建筑可 **原地升级**（保留工人分配），升级期间原功能持续运作
- 放置时 **虚影预览** + 合法性高亮（绿/红）

### 📦 资源与经济

6 种资源，两级加工链：

```
原木 ──→ 木板
石头
铁矿 ──→ 铁锭（需煤炭）
煤炭
```

- 所有资源有存储上限 = 配置 max × 仓库 storageMultiplier
- HUD 实时显示资源栏、人口、时间进度
- `ResourceSystem` 提供 `add` / `tryConsume` / `canAfford` / `consumeAll` 完整 API

### 👥 人口系统

- 每日自动增长 4~8 人
- **食物产出**：食物建筑（狩猎小屋、农田）的工人每天产出食物（`foodCapacity × workers`）
- **食物消耗**：每人每天消耗 1 食物，在每天开始时结算
- **饥饿死亡**：食物不够时，差额人数立即死亡
- **游戏结束**：人口 < 2 时弹出游戏结束画面
- **住房容量**：所有住宅的总容量，决定人口增长上限
- 空闲人口 = 总人口 - 已分配工人（用于建造和分配）

### 🗺️ 探险系统

点击地图右侧探险出发口，进入三阶段探险流程：

1. **选择区域**（最多 3 个，顺序结算）：
   - 森林 — 原木 + 石头
   - 矿洞外围 — 石头 + 煤炭 + 少量铁矿
   - 矿洞深处 — 大量煤炭 + 铁矿（需头灯或矿洞支撑结构解锁）
2. **选择携带物品**（受背包容量限制）
3. **出发** — 探险与基地生产并行进行，持续 N 个时段后自动归来

- 产出 = 区域基础产量 × 物品倍率 + 物品固定加成，截断到资源池容量
- 物品效果支持：倍率加成、固定产量加成、资源池扩容
- 解锁条件为 OR 逻辑（物品 或 建筑 任一满足即可）

### 📜 事件叙事

- 权重随机触发系统：每 tick 单次掷骰 → 按优先级+权重筛选候选事件
- 支持 7 种效果类型：`add_resource` / `consume_resource` / `obtain_item` / `consume_item` / `unlock_building` / `trigger_event` / `schedule_event`
- 分支叙事：通过 `trigger_event` 链式触发 + `schedule_event` 延时触发实现剧情树
- 条件系统：触发条件（AND 逻辑）+ 失效条件（OR 逻辑），支持时段/物品/建筑筛选
- 互斥组、冷却、最大触发次数、链式专属事件

### 🎒 物品与合成

4 种探险物品，在工作站合成：

| 物品 | 类型 | 效果 |
|------|------|------|
| 运载车 | 唯一/永久 | 资源池 +50 |
| 铁质工具组 | 唯一/永久 | 森林+矿洞深处 采集 ×2.0 |
| 矿工头灯 | 唯一/永久 | 解锁矿洞深处 |
| 标记火把 | 可多个/消耗品 | 矿洞外围 煤炭+15 铁矿+10 |

- 物品实例化管理：每个物品有独立 `instanceId`，追踪 `equipped` / `inExpedition` 状态
- 合成在工作站进行，消耗资源和 tick 时间

### 💾 存档系统

- 主存档：IndexedDB（单槽位）
- 紧急备份：`beforeunload` 时写入 localStorage
- 自动保存：每个时段结束时触发
- 版本化迁移路径，支持存档结构升级

---

## 配置编辑器

项目提供两个 **零依赖可视化配置编辑器**（独立 HTML 文件），双击即用：

### 🎨 美术配置编辑器 (`artist-config.html`)
- 建筑图标/详情图/地图图标的图像管理和预览
- 地图图标布局（缩放/偏移）可视化调整
- 详情面板图标布局可视化调整

### ⚙️ 策划配置编辑器 (`planner-config.html`)
- 建筑全字段编辑（产出/成本/升级/合成配方/地形限制/标签布局）
- 资源定义编辑
- 物品定义编辑（探险效果/容量消耗/唯一性）
- 探险区域编辑（基础产量 × 4 时段）
- **自动写回** `config/` 源 JSON 文件（使用 File System Access API）
- **防呆校验**：引用完整性、必填字段、数值范围

> 双击 **`打开配置编辑器.bat`** 选择编辑器，或直接打开对应的 HTML 文件。

---

## 操作说明

| 操作 | 方式 |
|------|------|
| 移动地图 | 按住空白区域拖拽 |
| 建造建筑 | 底部 🏗️ 按钮 → 选择建筑 → 地图点击放置 |
| 查看建筑 | 点击地图上的建筑 |
| 分配/移除工人 | 建筑详情面板中操作 |
| 升级建筑 | 建筑详情面板中点击升级 |
| 合成物品 | 工作站详情面板中选择配方 |
| 拆除建筑 | 建筑详情面板中点击拆除 |
| 进入探险 | 点击地图右侧「探险出发口」 |
| 加速/暂停 | 底部 ⏩ / ⏸ 按钮 |
| 取消放置 | `Esc` 键或底部 ✕ 按钮 |

---

## 技术栈

| 用途 | 技术 |
|------|------|
| 2D 渲染 | PixiJS **v8.19**（WebGL/Canvas） |
| 动画 | GSAP (GreenSock) |
| UI | 原生 DOM（零框架） |
| 状态管理 | 自研 EventBus 发布/订阅 + Store 响应式容器 |
| 存档 | IndexedDB + localStorage 紧急备份 |
| 配置 | JSON 文件，`fetch()` 加载 |
| 构建 | 无 — 原生 ES Modules，浏览器直接运行 |
| 进度条 | 自研 ProgressManager（rAF 驱动平滑插值） |

---

## 项目结构

```
GMGameChain0723/
├── index.html                          # 游戏主入口
├── artist-config.html                  # 美术配置编辑器
├── planner-config.html                 # 策划配置编辑器
├── 接龙活动_末世小木屋.html             # 社区接龙活动页
│
├── config/                             # JSON 配置（所有游戏数值）
│   ├── global.json                     # 全局参数（时段/速度/人口/事件概率）
│   ├── buildings.json                  # 建筑配置（14 种）
│   ├── resources.json                  # 资源配置（6 种）
│   ├── items.json                      # 物品配置（4 种）
│   ├── maps/base_map.json              # 地图网格 + 初始建筑 + 探险口位置
│   ├── expeditions/
│   │   ├── regions.json                # 探险区域（3 个，4 时段产量）
│   │   └── expedition_global.json      # 探险全局参数
│   └── events/
│       ├── events_base.json            # 基地事件
│       └── events_expedition.json      # 探险事件
│
├── assets/                             # 静态资源
│   ├── manifest.json                   # 资源清单（脚本自动生成）
│   └── buildings/                      # 建筑图标/图片
│
├── lib/                                # 第三方库
│   ├── pixi.min.js                     # PixiJS v8.19
│   └── gsap.min.js                     # GSAP
│
├── src/                                # 游戏源码（~4100 行）
│   ├── main.js                         # 入口：初始化 → 加载配置 → 连接系统 → 启动循环
│   ├── GameLoop.js                     # rAF 主循环 + 多层暂停支持
│   ├── core/                           # 基础设施层
│   │   ├── EventBus.js                 # 发布/订阅事件总线
│   │   ├── ConfigRegistry.js           # 配置加载与注册中心
│   │   ├── Store.js                    # 响应式状态容器
│   │   └── SaveManager.js              # IndexedDB 存档管理
│   ├── systems/                        # 游戏逻辑层（纯逻辑，不操作 DOM）
│   │   ├── TimeSystem.js               # 时间推进（时段/tick/速度控制）
│   │   ├── ResourceSystem.js           # 资源增减/上限/校验
│   │   ├── PopulationSystem.js         # 人口增长/食物与住房容量
│   │   ├── BuildingSystem.js           # 放置/生产/升级/合成/拆除
│   │   ├── ItemSystem.js               # 物品实例管理
│   │   ├── EventSystem.js              # 事件触发/条件评估/效果执行
│   │   └── ExpeditionSystem.js         # 探险准备/进行/结算
│   ├── rendering/                      # PixiJS 渲染层（只读状态）
│   │   └── MapRenderer.js              # 网格/建筑/虚影/探险口/标签绘制
│   ├── ui/                             # DOM UI 层
│   │   ├── HUD.js                      # 资源栏/人口/时间/底部按钮
│   │   ├── PopupManager.js             # 弹窗栈管理 + GSAP 动画
│   │   └── panels/                     # 弹窗面板（6 个）
│   │       ├── building-select-panel.js   # 建筑选择列表
│   │       ├── building-detail-panel.js   # 建筑详情/升级/合成/拆除
│   │       ├── event-panel.js             # 事件叙事 + 选项
│   │       ├── settings-panel.js          # 设置面板
│   │       ├── expedition-prep-panel.js   # 探险准备（选区域/选物品）
│   │       └── expedition-detail-panel.js # 探险进行状态
│   └── utils/
│       ├── gridUtils.js                # 网格坐标转换工具
│       └── ProgressManager.js          # rAF 驱动的平滑进度插值
│
├── scripts/                            # 工具脚本
│   ├── generate-asset-manifest.js      # 自动生成资源清单
│   ├── generate_building_images.py     # 批量生成建筑图片
│   ├── update_buildings_json.py        # 批量更新建筑配置
│   └── fix_green_background.py         # 修复图片绿色背景
│
├── docs/                               # 设计文档（10 篇）
│   ├── architecture-plan.md            # 总体架构蓝图 + 开发路线
│   ├── map-and-building-revision.md    # 地图与建筑交互设计
│   ├── resource-item-system-api.md     # 资源/物品系统 API
│   ├── event-system-design.md          # 事件系统设计
│   ├── expedition-system-design.md     # 探险系统设计
│   ├── popup-system-design.md          # 弹窗系统设计
│   ├── save-system-design.md           # 存档系统设计
│   ├── progress-bar-system-design.md   # 进度条系统设计
│   ├── label-layout-config.md          # 建筑标签布局配置
│   └── config-editors-design.md        # 配置编辑器设计
│
├── 启动游戏.bat                         # 一键启动脚本
├── 打开配置编辑器.bat                    # 配置编辑器启动器
├── 诊断.bat                             # 环境诊断脚本
└── test_basic.bat                       # 基础测试脚本
```

---

## 核心架构

```
                    ┌──────────────────────────┐
                    │      DOM UI 层             │
                    │  HUD / PopupManager /      │
                    │  panels (6 弹窗面板)        │
                    └──────────┬───────────────┘
                               │ 用户交互
                               ▼
┌──────────────────────────────────────────────────────┐
│                    Game Systems 层                    │
│  TimeSystem → ResourceSystem → BuildingSystem        │
│  → PopulationSystem → ItemSystem → EventSystem       │
│  → ExpeditionSystem                                  │
│                                                      │
│  每个 System 独占写入其数据域                           │
│  通过 EventBus 事件 + Store 订阅通信                    │
└──────────────┬──────────────────┬───────────────────┘
               │ 读取状态          │ 事件驱动
               ▼                   ▼
┌──────────────────────┐  ┌──────────────────────┐
│   PixiJS 渲染层       │  │   数据/基础设施层      │
│   MapRenderer         │  │   EventBus            │
│   （只读，不修改数据）  │  │   ConfigRegistry      │
│                       │  │   Store               │
│                       │  │   SaveManager         │
└──────────────────────┘  └──────────────────────┘
```

**数据流是单向的：**
```
用户交互 → PopupManager/HUD → System API → Store 状态变更 → UI 重绘
GameLoop(rAF) → TimeSystem.update() → tick 事件 → 各 System 结算 → Store → UI
```

**关键架构规则：**
- 每个 System 对自身数据域有 **独占写入权**，所有修改必须通过 System API
- `MapRenderer` **只读** — 读取状态绘制，绝不修改游戏数据
- System 间通过 `EventBus` 事件和 `Store` 状态订阅通信，无直接交叉引用
- 所有游戏数值在 `config/*.json` 中定义，代码零硬编码

---

## 时间系统

```
PERIOD_NAMES  = [morning, afternoon, evening, night]   (每天 4 个时段)
WORK_PERIODS  = [morning, afternoon]                    (仅此时段建筑生产)
PERIOD_DURATION = 30s                                  (每时段现实秒数)
TICK_INTERVAL   = 10s                                  (结算间隔)
```

`requestAnimationFrame` → `TimeSystem.update(delta)` 累积真实时间 → tick 间隔到则触发 `tick` 事件 → 各 System 响应结算。时段切换时依次触发 `periodEnd`（自动存档）→ `periodChange` → 可能 `dayStart`。

---

## 弹窗规则

| 面板 | 阻塞游戏循环 |
|------|:---:|
| 事件叙事 (`event`) | ✅ 阻塞 |
| 探险准备 (`expedition_prep`) | ✅ 阻塞 |
| 建筑选择 (`building_select`) | ❌ 不阻塞 |
| 建筑详情 (`building_detail`) | ❌ 不阻塞 |
| 探险详情 (`expedition_detail`) | ❌ 不阻塞 |
| 设置 (`settings`) | ❌ 不阻塞 |

GameLoop 使用多层暂停计数器 — 每个阻塞弹窗 +1，关闭 -1，归零后恢复推进。

---

## 设计文档索引

| 文档 | 内容 |
|------|------|
| `architecture-plan.md` | 总体蓝图、5 层架构、数据流、HUD 布局、开发路线图 |
| `map-and-building-revision.md` | 网格坐标、放置状态机、虚影预览、地形类型与限制 |
| `resource-item-system-api.md` | ResourceSystem/ItemSystem 完整 API 与验证流程 |
| `event-system-design.md` | 触发/失效条件、权重随机、效果类型、分支叙事 |
| `expedition-system-design.md` | 三阶段流程、资源池/背包双容量、产出公式、解锁逻辑 |
| `popup-system-design.md` | 弹窗 chrome、导航栈、面板注册、GSAP 动画、设计令牌 |
| `save-system-design.md` | IndexedDB 单槽、auto-save/lifecycle、版本迁移 |
| `progress-bar-system-design.md` | ProgressManager 平滑插值、DOM/回调双模式 |
| `label-layout-config.md` | 建筑名称/进度条/工人数的标签偏移配置 |
| `config-editors-design.md` | 策划+美术编辑器、File System Access API、防呆校验 |

---

## 浏览器兼容

- Chrome / Edge 90+
- Firefox 90+
- Safari 15+
- 移动端：Android Chrome / iOS Safari 12+
