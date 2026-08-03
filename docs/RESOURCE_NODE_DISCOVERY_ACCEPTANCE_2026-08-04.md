# 资源点与军事入口收尾验收（2026-08-04）

## 本轮完成内容

### 1. 单格采石点与采石场

- 固定大地图已包含 400 个 `stone` 采石资源点，继续保持稀疏但可探索的分布。
- 采石点使用单格方形底框与石堆图形，视觉逻辑与金矿点一致，不再依赖整片山体作为模糊建造区域。
- `stope` 与历史内容中的 `stone_quarry` 均通过运行时覆盖改为 `1×1`。
- 采石场只能放在未开发的 `stone` 节点正上方；放在相邻普通岩地会被拒绝。
- 建造成功后资源点与建筑绑定，拆除建筑会释放节点。

### 2. 山体碎石填缝

- 山体仍使用黄色泥土地基、立体大岩柱与碎石组合，不使用整张山体贴图覆盖地图。
- 每一条纵向相邻缝加入上、中、下三组稳定碎石。
- 每一条横向相邻缝加入左、右两组稳定碎石。
- 碎石跨越共享格线，减少岩柱之间露出规则方格空隙的问题。
- 前后景仍按地图行深度排序，靠近镜头的树木、建筑和单位能够遮挡后方山体。

### 3. 二十种奢侈品地图标志

固定地图保留 60 个奢侈品点，即每种 3 个；密度明显低于木材、石材、食物和黄金。

| 图标 ID | 地图 PNG | 图标 ID | 地图 PNG |
|---|---|---|---|
| silk | `assets/resource-nodes/luxuries/silk.png` | jade | `assets/resource-nodes/luxuries/jade.png` |
| tea | `assets/resource-nodes/luxuries/tea.png` | spices | `assets/resource-nodes/luxuries/spices.png` |
| ivory | `assets/resource-nodes/luxuries/ivory.png` | wine | `assets/resource-nodes/luxuries/wine.png` |
| incense | `assets/resource-nodes/luxuries/incense.png` | gems | `assets/resource-nodes/luxuries/gems.png` |
| pearls | `assets/resource-nodes/luxuries/pearls.png` | amber | `assets/resource-nodes/luxuries/amber.png` |
| fur | `assets/resource-nodes/luxuries/fur.png` | dyes | `assets/resource-nodes/luxuries/dyes.png` |
| cocoa | `assets/resource-nodes/luxuries/cocoa.png` | coffee | `assets/resource-nodes/luxuries/coffee.png` |
| porcelain | `assets/resource-nodes/luxuries/porcelain.png` | perfume | `assets/resource-nodes/luxuries/perfume.png` |
| silverware | `assets/resource-nodes/luxuries/silverware.png` | horses | `assets/resource-nodes/luxuries/horses.png` |
| salt | `assets/resource-nodes/luxuries/salt.png` | cotton | `assets/resource-nodes/luxuries/cotton.png` |

- 每张图均为独立、透明、正方形 PNG，并使用统一的历史策略游戏 2.5D 风格。
- 地图渲染器按 `luxuryId` 自动解析专属 PNG，不再把 20 种资源显示为同一个通用符号。
- 贸易站继续保持 `1×1`，只能覆盖 `luxury` 节点；配置工人后按慢速周期产出该节点绑定的具体奢侈品。

图标生成与切分遵循：`E:\SKILLS\游戏图标\assetify\SKILL.md`。

### 4. 兵种研发与英雄入口

- 底部 HUD 新增高亮的“兵种研发”按钮，直接打开完整兵种研发页。
- 底部 HUD 新增高亮的“英雄”按钮，直接打开历史英雄酒馆与已招募名册。
- 未建造并启用酒馆时，英雄页明确显示“建设酒馆后即可招募英雄”，所有招募按钮锁定为“需要酒馆”。
- 已招募人物名册在同一页面持续可见，方便查看等级、经验、技能与任命状态。

## 自动验收证据

- 资源、地图表现和资产测试：24 项通过。
- 浏览器新游戏全流程冒烟测试通过，无控制台错误。
- 浏览器验证两个采石建筑的最终运行时占地均为 `1×1`。
- 浏览器验证 20 张奢侈品地图纹理全部成功加载。
- QA 截图：
  - `test-results/qa-mountain-rock-piles.png`
  - `test-results/qa-luxury-resource-marker.png`
  - `test-results/qa-unit-research-entry.png`
  - `test-results/qa-hero-entry-and-tavern-guidance.png`

## 并行工作隔离

本轮没有修改或覆盖另一个进程负责的 `config/buildings.json`、`config/commercial-buildings.json`、`config/culture.json`、`config/ea_integration.json`、`config/enemies.json`、`config/events/events_base.json`、`config/historical_content.json`、`config/techs.json`、`config/world-factions.json` 与 `tmp/`。采石场尺寸改动放在独立的 `config/building-runtime-overrides.json` 中。
