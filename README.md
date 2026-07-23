# GMGameChain - 模拟经营网页游戏

一款基于 PixiJS v8 + GSAP 的 2D 俯视角模拟经营网页游戏，纯前端实现，无需后端服务。

## 快速开始

```bash
# 在项目根目录启动本地服务器（需要 HTTP 服务，不支持 file:// 直接打开）
npx http-server -p 8080 -c-1 --cors

# 浏览器访问
http://127.0.0.1:8080
```

## 游戏玩法

- **建造基地**：在网格地图上放置建筑（工棚、伐木场、熔炉、仓库等），分配工人进行生产
- **资源管理**：采集原木、石头、煤炭、铁矿，加工为木板、铁锭，管理存储上限
- **人口增长**：建造住宅和食物建筑提升人口上限，人口每日自动增长
- **探险采集**：点击地图上的探险出发口，选择区域和携带物品，自动结算采集产出
- **事件叙事**：随机事件弹窗，玩家选择影响后续剧情分支
- **建筑升级**：工棚→木板房、基础工作站→进阶工作站、仓库→工业仓储中心
- **物品合成**：在工作站中合成探险装备（运载车、标记火把、铁质工具组等）
- **自动存档**：每个时段结束自动保存，刷新页面恢复进度

## 操作说明

| 操作 | 方式 |
|------|------|
| 移动地图 | 按住空白区域拖拽 |
| 建造建筑 | 底部🏗️按钮 → 选择建筑 → 地图上点击放置 |
| 查看建筑 | 点击地图上的建筑色块 |
| 进入探险 | 点击地图右侧的「探险出发口」区域 |
| 加速/暂停 | 底部⏩/⏸按钮 |
| 取消放置 | Esc键 或 底部✕按钮 |

## 技术栈

| 用途 | 技术 |
|------|------|
| 2D渲染 | PixiJS v8.19（WebGL/Canvas） |
| 动画 | GSAP (GreenSock) |
| UI | 原生 DOM（无框架） |
| 状态管理 | 自研 EventBus + Store |
| 存档 | IndexedDB |
| 构建工具 | 无（ES Module 直接运行） |

## 项目结构

```
GMGameChain0723/
├── index.html                     # 主入口
├── config/                        # JSON 配置（策划数据）
│   ├── global.json                # 全局参数（时段、tick间隔、人口）
│   ├── buildings.json             # 建筑配置（13种）
│   ├── resources.json             # 资源配置（6种）
│   ├── items.json                 # 物品配置（4种）
│   ├── maps/base_map.json         # 地图网格 + 初始建筑 + 探险口
│   ├── expeditions/               # 探险配置
│   │   ├── regions.json           # 区域（3个）
│   │   └── expedition_global.json # 探险全局参数
│   └── events/                    # 事件配置
│       ├── events_base.json       # 基地事件（5个）
│       └── events_expedition.json # 探险事件
├── lib/                           # 第三方库
│   ├── pixi.min.js                # PixiJS v8.19
│   └── gsap.min.js                # GSAP
├── src/                           # 游戏源码
│   ├── main.js                    # 入口（初始化+系统连接）
│   ├── GameLoop.js                # 主循环（rAF驱动）
│   ├── core/                      # 基础设施
│   │   ├── EventBus.js            # 发布/订阅
│   │   ├── ConfigRegistry.js      # 配置加载中心
│   │   ├── Store.js               # 响应式状态容器
│   │   └── SaveManager.js         # IndexedDB 存档
│   ├── systems/                   # 游戏逻辑系统
│   │   ├── TimeSystem.js          # 时间（时段/tick/速度）
│   │   ├── ResourceSystem.js      # 资源增减/上限
│   │   ├── PopulationSystem.js    # 人口增长/工人池
│   │   ├── BuildingSystem.js      # 建筑放置/生产/升级/合成
│   │   ├── ItemSystem.js          # 物品实例管理
│   │   ├── EventSystem.js         # 事件触发/效果/分支
│   │   └── ExpeditionSystem.js    # 探险准备/进行/结算
│   ├── rendering/                 # PixiJS 渲染
│   │   └── MapRenderer.js         # 地图+建筑+虚影+探险口
│   ├── ui/                        # DOM UI
│   │   ├── HUD.js                 # 资源栏/人口/时间/按钮
│   │   ├── PopupManager.js        # 弹窗栈管理
│   │   └── panels/                # 各面板渲染函数
│   │       ├── building-select-panel.js
│   │       ├── building-detail-panel.js
│   │       ├── event-panel.js
│   │       ├── settings-panel.js
│   │       ├── expedition-prep-panel.js
│   │       └── expedition-detail-panel.js
│   └── utils/
│       └── gridUtils.js           # 网格坐标工具
└── docs/                          # 设计文档
```

## 核心架构

```
用户交互 → PopupManager/HUD → System API → Store/EventBus → UI刷新
                                              ↓
GameLoop(rAF) → TimeSystem.update() → tick事件 → 各System结算
                                              ↓
                                    MapRenderer 渲染（只读状态）
```

- **数据单向流动**：配置 → ConfigRegistry → Systems → Store → UI
- **系统间通信**：通过 EventBus 事件（tick、periodChange、resourceChanged 等）
- **渲染与逻辑分离**：MapRenderer 只读取状态绘制，不修改游戏数据

## 设计文档

详细设计见 `docs/` 目录：

- `architecture-plan.md` — 总体架构与开发路径
- `map-and-building-revision.md` — 地图与建筑交互设计
- `resource-item-system-api.md` — 资源/物品系统 API
- `event-system-design.md` — 事件系统设计
- `expedition-system-design.md` — 探险系统设计
- `popup-system-design.md` — 弹窗系统设计
- `save-system-design.md` — 存档系统设计

## 浏览器兼容

- Chrome/Edge 90+
- Firefox 90+
- Safari 15+
- 移动端（Android Chrome / iOS Safari 12+）
