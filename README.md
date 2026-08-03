# 文明纪元（GMGameChain 2026）

《文明纪元》是一款纯前端、无缝大地图的历史文明经营与扩张游戏。玩家从原始聚落起步，在木头、石头、食物、黄金四种基础资源约束下分配人口、建设城市、研究科技与人文制度、选择时代文明、组建陆海军，并与固定城邦进行外交或战争，最终通过领土与文明发展达成胜利。

当前版本：`0.8.0`，存档结构：`v9`。

## 快速开始

Windows 下直接运行 `启动游戏.bat`。脚本会在 `http://127.0.0.1:18763` 启动本地服务并打开浏览器。

也可以手动启动：

```powershell
npx --yes http-server . -p 18763 -c-1 --cors
```

项目使用原生 ES Modules 与 `fetch()` 加载 JSON，不能通过 `file://` 直接运行。

## 当前内容规模

| 内容 | 数量 |
|---|---:|
| 基础资源 | 4 |
| 奢侈品 | 20 |
| 时代 | 7 |
| 文明 | 57（1 / 6 / 8 / 10 / 10 / 10 / 12） |
| 正式时代科技节点 | 56（每时代 8 个，另有 39 个兼容前置节点） |
| 人文节点 | 56（每时代 8 个） |
| 建筑 | 111（全部有独立运行时详情/地图美术） |
| 玩家单位 | 138（全部有独立 2.5D 招募立绘） |
| 历史英雄 | 72（全部有独立头像） |
| 策略卡 | 24 |
| 固定城邦/据点 | 24 |
| 野外营地/海盗目标 | 96 |
| 常用资源点 | 1,280（木头、石头、食物、黄金各 320） |
| 新增时代事件 | 42 |
| 历史内容图标 | 756 个独立 SVG |
| 时代原声 | 7 首原创循环 BGM |
| 战略音效 | 12 类独立玩法提示音 |
| 运行时美术审计 | 253/253 通过 |

## 核心系统

- 四资源经济：木头和石头支撑建设，食物维持人口并训练军队，黄金用于高级建设、训练、贸易和外交。
- 人口与岗位：建筑不会自动满负荷工作；学院、人文机构、农场、工坊等都需要玩家配置工人，零工人时只保留解锁功能。农田的作物与人口只能在该座农田的建筑详情中调整。
- 农业、商业、贸易分离：农业总览只负责汇总和定位；商业建筑按工人产出黄金并启用一种唯一 Buff；贸易只处理友好城邦路线和本地资源加工。
- 时代文明：原始、上古、古典、中世纪、探索、近代、现代七个时代；原始时代只有原始文明，后续时代分别提供 6、8、10、10、10、12 种文明选择，时代特色临时生效，文明遗产永久保留。
- 对称双树：每时代各八项科技和八项人文制度，分页结构、研究成本和推进要求保持对称。
- 丰富建筑：住宅、生产、仓储、贸易、科技、人文、军营、马厩、靶场、攻城工坊、酒馆、码头、造船厂、防御工事等均有独立用途。
- 陆海战争：步兵、远程、反骑、骑兵、攻城、特殊、海军七个分支，具有前线、后排、侧翼、攻城和海战阵线及兵种克制。
- 城邦外交：第 10 天激活固定 NPC 城邦。可交谈、赠礼、援助、互市、停战、开放边界、互不侵犯、联合巡逻、结盟、宣战和征服。
- 英雄系统：酒馆招募当前及过去时代的历史英雄；武将进入军团，文臣进入城市、研究、工程或外交岗位，人物可受伤、恢复并永久保留。
- 历史策略：任务、事件、英雄和时代星可授予策略卡，用于增产、动员、行军、外交、侦察、海上封锁与防御等，无魔法设定。
- 无缝地图：固定 384×384 大地图，水域占 18.24%，浅水与深水连通；陆地采用多大陆、海湾、山脉带、森林带与岛链布局，出生点固定在 `(270, 180)`，陆海单位受地形域限制。
- 资源与战争迷雾：四类常用资源点均匀预放置，采集建筑必须覆盖匹配节点；白天基础视野 10 格、夜晚 6 格，未探索与已记忆区域始终保留战争迷雾。
- 胜负主线：玩家通过拓土和城市建设扩大控制区；敌对势力同步形成压力，占领率进入胜负判定。

## 基本操作

| 操作 | 方式 |
|---|---|
| 移动地图 | 按住地图拖动 |
| 建造 | 底部“建设”选择建筑，再点击合法地块 |
| 分配工人 | 点击建筑，在详情中增减岗位人口 |
| 农田改种 | 点击具体农田，在“农田作物”中选择；下一天生效 |
| 查看农业 | 底部“农业”，只读查看各农田并定位到详情 |
| 查看商业 | 底部“商业”，查看黄金产出和独特 Buff |
| 城邦贸易 | 底部“贸易”，建立友好城邦路线或安排本地加工 |
| 科技/人文 | 底部“科技”或“文化”，在当前时代页研究 |
| 选择文明/推进时代 | 底部“时代” |
| 训练军队 | 底部“训练”，可切换时代兵种页 |
| 查看军队 | 底部“军队” |
| 使用策略 | 底部“策略” |
| 领土扩张 | 底部“拓土”后点击边境合法地块 |
| 暂停/加速 | 底部 `⏸` / `⏩` |
| 取消放置 | `Esc` |

## 测试与验证

需要 Node.js 20 或更高版本。

```powershell
npm run check
```

该命令执行全部 Node 逻辑测试和 JavaScript 语法检查。浏览器端建议使用 Chrome 或 Edge；桌面为主要体验，窄屏提供双行顶部 HUD 与可横向滚动的操作栏。

## 技术栈

| 用途 | 技术 |
|---|---|
| 2D 地图渲染 | PixiJS 8 |
| 动画 | GSAP |
| UI | 原生 DOM/CSS |
| 逻辑 | 原生 JavaScript ES Modules |
| 状态通信 | EventBus + Store |
| 配置 | JSON 数据驱动 |
| 存档 | IndexedDB + localStorage 备份 |
| 构建 | 无打包步骤，本地 HTTP 服务直接运行 |

## 关键目录

```text
config/                         游戏数值与地图配置
  historical_content.json      时代、文明、奢侈品、建筑、双树、单位、英雄、策略
  events/events_historical.json 时代随机事件
assets/historical-icons/       科技、人文、建筑、事件等 SVG 图标库
assets/unit-cards/             138 张单位 2.5D 招募立绘
assets/hero-portraits/         72 张历史英雄头像
assets/buildings/              111 座建筑的运行时栅格美术与画板切片
assets/resource-nodes/         木头、石头、食物、黄金地图资源徽章
assets/audio/bgm/              七时代原创循环配乐
assets/audio/sfx/strategic/    十二类独立战略玩法音效
src/core/                      配置、事件总线、状态和存档
src/systems/                   经济、时代、战斗、外交、英雄、策略等纯逻辑
src/rendering/                 PixiJS 地图与对象渲染
src/ui/                        HUD、弹窗和面板
scripts/                       内容与图标生成、语法检查工具
test/node/                     自动化逻辑测试
docs/content/                  全量兵种、英雄、文明、建筑、双树与世界数据目录
docs/                          设计、审计与交付文档
```

完整改造说明、平衡基线与兼容说明见 [历史文明全面改造报告](docs/HISTORICAL_CIVILIZATION_OVERHAUL_2026-08-02.md)。

## Military logistics and strategic-map interaction

Military units are now trained from compatible building details into the reserve, assembled and deployed from domain-compatible headquarters/assembly buildings, and controlled directly on the strategic map. Deployment searches the eight neighboring tiles atomically; buildings block army occupation unless they are valid fortifications, whose garrison capacity and recovery effects are enforced. Army selection is transient UI state and is not saved.

Legacy `buildingTech.unlockedNodes` remains readable in v9 saves and is merged into the current technology/civics research records without a schema-version bump. Reserves, deployed armies, movement paths, orders, and garrisons remain part of authoritative `armyState`.

Acceptance scope, implementation details, and exact verification evidence are recorded in [Military Logistics and Map Interaction — 2026-08-03](docs/MILITARY_LOGISTICS_AND_MAP_INTERACTION_2026-08-03.md).

## 兼容说明

- `v5`、`v6` 存档会按迁移链升级到 `v7`。
- 迁移后基础资源严格收敛为木头、石头、食物、黄金。
- 旧炼金与法术字段在迁移中移除，相关旧源码和配置仅作为未加载的历史归档保留，不进入当前运行时。
