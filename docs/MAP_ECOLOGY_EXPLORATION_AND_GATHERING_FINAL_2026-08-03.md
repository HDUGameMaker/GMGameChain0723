# 大地图生态、探索与采集建筑收尾报告（2026-08-03）

## 1. 本轮结论

本轮已完成大地图资源可达性、山体表现、食物提示、奢侈品采集、山洞探索入口和缺失采集建筑的收尾。

最终视觉规则已经统一：大地图地貌是纯方格地图。山脉不使用写实图片或跨格精灵，只由山麓、坡面和内部高地的连续方格色带表示；建筑、资源点、洞穴等格内对象才使用图标。此前试制的写实山体图片已从运行时和项目资源中移除。

## 2. 地图生成规则

- 固定地图尺寸：384×384。
- 地图生成版本：v4，校验值 `319ae7ec`。
- 宏观水系掩码保持不变，水域比例与连通性继续沿用已批准方案。
- 陆地微观地貌重新打散：森林、土壤、山脉同时支持小型、中型和大型不规则地块，不再只有单一尺寸和十字形。
- 25×25 本地保障仍然生效：有意义的陆地区域内必须具备森林与矿区访问条件。
- 山体使用相邻格距离计算分层色带，所有画面严格落在各自方格内，不会越格覆盖。
- 山脉外围生成山麓；大山体保留多格内部区域，不再形成一格宽的黑墙。

关键实现：

- `scripts/lib/FixedWorldBuilder.js`
- `scripts/build-fixed-grand-map.mjs`
- `src/rendering/MapPresentation.js`
- `src/rendering/MapRenderer.js`
- `config/maps/base_map.json`

## 3. 资源点结果

固定地图当前共有 1,856 个资源点：

| 类型 | 数量 | 地图与建筑规则 |
|---|---:|---|
| 木材 | 596 | 每个森林连通块都有木材访问点；伐木类建筑必须覆盖木材点 |
| 石料 | 400 | 每个山体连通块附近配置石料点；采石建筑必须覆盖石料点 |
| 食物 | 400 | 分布在适合采集的陆地；采集小屋、狩猎小屋等必须覆盖食物点 |
| 黄金 | 400 | 每个山体连通块附近配置金矿点；金矿建筑必须覆盖黄金点 |
| 奢侈品 | 60 | 20 类奢侈品各 3 个稀疏产地；贸易站必须覆盖奢侈品点 |

食物点带有稳定的视觉提示字段，当前包括鹿、野猪、野羊、浆果灌木和野生谷物。资源节点的 `visualCue` 与奢侈品节点的 `luxuryId` 都会进入存档恢复流程。

## 4. 奢侈品与贸易站

- 20 类奢侈品已经成为真实地图节点，不再只是菜单数据。
- 每种奢侈品在地图上生成 3 个低密度产地，共 60 个。
- 新增 `贸易站`：1×1，3 个岗位，只能覆盖奢侈品产地。
- 配置工人后按较慢周期采集该地块绑定的奢侈品，不会随机产出其他品种。
- 首份奢侈品激活帝国效果，重复份继续进入既有贸易逻辑。
- 贸易站的奢侈品采集进度和节点绑定可存档。

关键实现：

- `config/resource-nodes.json`
- `src/systems/ResourceNodeSystem.js`
- `src/systems/BuildingSystem.js`
- `assets/resource-nodes/luxury.svg`
- `assets/resource-nodes/luxury.png`

## 5. 补回的采集建筑

### 狩猎小屋

- 1×1，最多 5 名工人。
- 只能建在食物资源点上。
- 面向鹿、野猪、野羊等野生动物食物点，前期食物产量高于普通采集小屋。

### 采集小屋

- 1×1，最多 4 名工人。
- 只能建在食物资源点上。
- 面向浆果、灌木和野粮，产量较低但成本更便宜。

### 贸易站

- 1×1，最多 3 名工人。
- 只能建在奢侈品资源点上。
- 缓慢获取该地块指定奢侈品。

三座建筑均已加入真实建造菜单，并配备独立 SVG 地图图标和 512×512 建筑详情图。浏览器实测菜单中可见名称、说明、成本和岗位数量。

关键文件：

- `config/buildings.json`
- `assets/historical-icons/buildings/hunting_lodge.svg`
- `assets/historical-icons/buildings/forager_hut.svg`
- `assets/historical-icons/buildings/trade_post.svg`
- `assets/buildings/historical-details/hunting_lodge.png`
- `assets/buildings/historical-details/forager_hut.png`
- `assets/buildings/historical-details/trade_post.png`

## 6. 探索功能

- 大型山体重新生成可点击洞穴入口，当前固定地图共有 12 个。
- 入口包括岩穴入口、矿洞入口、山麓洞口和古道洞口等显示名称。
- 点击入口会进入既有道路连接检查：未连接道路时明确提示无法进入；连接后继续进入探险队准备和区域探索流程。
- 洞穴复用既有矿山、山顶、遗迹、煤层与铁脊等探索区域，不是纯装饰标记。

## 7. 已完成验证

- `npm.cmd run verify`：252/252 个测试通过。
- JavaScript 语法检查：382 个文件通过。
- `npm.cmd run test:browser`：1/1 个真实浏览器冒烟测试通过。
- 手工浏览器检查：新游戏可启动；地图可移动；建造菜单可打开；新增三座建筑可见；洞穴可点击；控制台 0 错误、0 警告。
- 固定地图离线重建校验通过，重新生成不会改写已提交结果。
- 水系掩码回归测试通过。
- 四种基础资源建筑的节点绑定与占用释放测试通过。
- 贸易站的奢侈品慢速产出和存档恢复测试通过。

截图证据（测试输出，不纳入运行时资源）：

- `output/playwright/mountain-grid-final.png`

## 8. 本轮使用的 Skills

本轮使用并遵循了以下本地 skill：

- 图标与透明资源处理：`E:\SKILLS\游戏图标\assetify\SKILL.md`
- 浏览器自动化检查：`C:\Users\10656\.codex\skills\playwright\SKILL.md`
- 前端渲染调试：`C:\Users\10656\.codex\plugins\cache\openai-curated-remote\build-web-apps\0.1.2\skills\frontend-testing-debugging\SKILL.md`
- 测试驱动开发：`C:\Users\10656\.codex\plugins\cache\openai-curated-remote\superpowers\6.2.0\skills\test-driven-development\SKILL.md`
- 系统化调试：`C:\Users\10656\.codex\plugins\cache\openai-curated-remote\superpowers\6.2.0\skills\systematic-debugging\SKILL.md`

美术 skill 只用于新增建筑与资源节点图标。山脉作为地貌明确不使用图像生成结果。

## 9. 后续可选优化

当前需求已完成。下一阶段如果继续精修，建议只做不改变核心规则的表现优化：

1. 为五类食物提示分别补充与当前地图风格一致的小型图标，替换临时 emoji。
2. 在地图缩放较小时合并密集资源标记，减少视觉拥挤；放大后再显示每个节点。
3. 增加洞穴探索后的已完成、危险、冷却中三种格内状态图标。
4. 增加开局出生点资源可达性的自动平衡报告，记录最近木材、食物、石料和黄金距离。
