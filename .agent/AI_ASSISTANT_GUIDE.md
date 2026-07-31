# AI Assistant Development Guide

本文件是 `AGENT.md`、`AGENTS.md`、`CLAUDE.md` 的合并入口，用于减少重复说明。原始文件已移动到 `.agent/` 目录中保留，便于追溯历史细节。

## 接力棒工作流

- 首次进入本仓库时，先判断根目录是否存在 `第N棒开发者身份信息.md`。
- 若不存在，必须先阅读项目文档、交接文档和代码结构，判断当前棒次并创建对应身份文件。
- 身份文件只作本地参考，需要加入 `.gitignore`。
- 当前棒次由交接文档决定：存在 `update-log/给第九棒的.md` 时，当前接棒者是第九棒。
- 只有用户明确要求生成下一棒交接文档，并且 `给第N+1棒的.md` 已创建，才视为本棒结束。

## 运行方式

```bash
node scripts/generate-asset-manifest.js
npx http-server -p 8080 -c-1 --cors
# http://127.0.0.1:8080
```

必须使用 HTTP 服务运行，不能直接用 `file://`，因为配置文件通过 `fetch()` 加载。

## 技术栈

- PixiJS v8，全局 `PIXI`
- GSAP，全局 `gsap`
- 原生 DOM UI，无 React/Vue/Angular
- 原生 ES Modules，无构建工具
- IndexedDB 主存档，localStorage 紧急备份
- 所有游戏数值优先由 `config/*.json` 驱动

## 架构分层

```text
DOM UI          -> src/ui/
Game Systems    -> src/systems/
PixiJS Render   -> src/rendering/MapRenderer.js
Data/Infra      -> src/core/
Config          -> config/
```

数据流保持单向：

```text
用户交互 -> PopupManager/HUD -> System API -> Store/EventBus -> UI/Renderer
GameLoop -> TimeSystem.update() -> tick/period/day events -> Systems -> Store
```

## 架构规则

- 每个 System 独占写入自己的状态域。
- 外部代码只调用 System API，不直接改系统内部状态。
- `MapRenderer` 只读状态并绘制，不修改游戏数据。
- System 之间通过 EventBus 和 Store 协作，避免直接交叉引用。
- 新建筑、资源、事件、炼金配方等优先通过配置新增。

## PixiJS v8 注意事项

```js
const app = new PIXI.Application();
await app.init(options);
```

```js
graphics.rect(x, y, w, h).fill({ color, alpha });
graphics.rect(x, y, w, h).stroke({ color, width, alpha });
```

```js
new PIXI.Text({
  text: '...',
  style: { fontSize, fill }
});
```

## 常用修改入口

| 任务 | 入口 |
|------|------|
| 新建筑/资源 | `config/buildings.json`、`config/resources.json` |
| 新道路参数 | `config/roads.json`、`src/systems/RoadSystem.js` |
| 新事件 | `config/events/`、`src/systems/EventSystem.js` |
| 新弹窗 | `src/ui/panels/`、`src/ui/PopupManager.js` |
| 地图渲染 | `src/rendering/MapRenderer.js` |
| 存档 | `src/core/SaveManager.js` |
| 任务 | `config/quests.json`、`src/systems/QuestSystem.js` |
| 战斗/入侵 | `src/systems/CombatSystem.js`、`src/systems/InvasionSystem.js` |
| 音频 | `config/sound.json`、`src/systems/AudioSystem.js` |
| 炼金 | `config/alchemy.json`、`src/systems/AlchemySystem.js` |
| 人文/教义 | `config/culture.json`、`config/doctrines.json` |

## 设计文档索引

- `docs/architecture-plan.md`：总体架构与路线图
- `docs/map-and-building-revision.md`：地图、建筑、放置规则
- `docs/resource-item-system-api.md`：资源与物品 API
- `docs/event-system-design.md`：事件触发、条件、效果
- `docs/expedition-system-design.md`：探险流程与产出
- `docs/popup-system-design.md`：弹窗注册与阻塞规则
- `docs/save-system-design.md`：存档结构与迁移
- `docs/progress-bar-system-design.md`：进度条机制
- `docs/config-editors-design.md`：配置编辑器
- `docs/人文树设计文档.md`：人文系统
- `docs/炼金的三重镜像——翠玉录·Noita·药剂工艺完全整理.md`：炼金设计来源

## 交接与日志位置

- 棒次交接文档：`update-log/给第X棒的.md`
- 运行日志：`log/`
- AI 协作说明：`.agent/`

## 当前第九棒重点

- 继续整理根目录与开发协作文档结构
- 确认第八棒新增的战斗、兵种、阵型、入侵配置是否闭环
- 复核重做人文政策系统后的配置、UI、存档兼容性
- 检查相邻加成算法简化后的产出与显示一致性
- 继续关注道路刷新、建筑进度条闪烁、数值膨胀等历史问题
