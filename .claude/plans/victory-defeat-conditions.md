# 胜利 / 失败条件正式化 + 全图化改造计划

## 背景与用户决策

用户要求把胜负条件做成正式呈现，并重新定义胜负：

- **胜利** = 我方（建筑 + 占术）占领 **≥ 50%** 的全图可占领地形。
- **失败** = 敌方占据 **≥ 50%** 的全图可占领地形。
- 范围 = 全图所有可占领格（地形 `buildable !== false`，即 G/D/F/R/W，排除山脉 M / 屏障 B）。统计：可建 26989 + 受限 4724 = **31713 格**。50% ≈ **15857 格**。
- 敌人刷新 / 扩张 / 失败计数同步全图。

地图 200×200=40000 格，加载 `config/maps/base_map.json`。原 claimArea 100 格方案废弃（配置保留不删）。胜负变成争夺半数地盘的对称拉锯。

---

## A. 胜负逻辑全图化 + 比例阈值（核心）

### A1. TerritorySystem（`src/systems/TerritorySystem.js`）
- **新增 `_claimableCells` 缓存**：`init()` 遍历 `map.grid`，收集所有 `groundTypes[char].buildable !== false` 的格子坐标（~31713）。地图不变 -> 缓存一次。
- **`getTotalClaimableCount()`** -> `_claimableCells.length`（O(1)）。
- **`getOwnedClaimableCount()`** -> 遍历 `_claimableCells` 用 `isOwned(x,y)` 计数。
  - 必须用 `isOwned`：`BuildingSystem.canPlaceAt` 不检查占术格，建筑可放在占术格上，`possessions.size + buildingCells.size` 会重复算重叠格。
  - ~0.5ms/次，每次 territoryChanged 触发，可接受。
- **`_checkWin()`** 改比例：`getOwnedClaimableCount() / total >= winThreshold`（默认 0.5）-> `emit('gameOver',{win:true,reason:'territory'})`。
- **`canCastAt(x,y)`**：移除 claimArea 检查，改 `_isClaimableTerrain(x,y)`。占术可施于全图任意可占领空格（含水/石 R/W，排除 M/B）。
- **新增 `_isClaimableTerrain(x,y)`**：查 `map.grid[y][x]` 的 `buildable !== false`。`isClaimable(x,y)` 改为等价方法（供 MapRenderer 调用）。
- `claimArea` 配置保留不删（休眠），不再用于限制。
- 存档：`_claimableCells` 运行时缓存不持久化；**不 bump version**，旧存档继续游戏，分母自动变全图、阈值变比例。

### A2. EnemyExpansionSystem（`src/systems/EnemyExpansionSystem.js`）
- **`_emptyCellsForSpawn()`** 改「优先玩家领地边界」：收集所有 `isOwned` 格的 4 邻接可占领空格（非已占、非敌人），随机刷；不足回退全图 `_claimableCells`。
  - 全图随机刷会分散到角落、压力消失；优先边界让敌人压在玩家前线，符合「扩张优先吃玩家领地」设计。
  - 需 TerritorySystem 暴露 `getClaimableCells()`。
- **`_expandCell()`** 不变（4 邻接、优先吃玩家领地）。
- **`_checkFail()`** 改比例：`getCellCount() / getTotalClaimableCount() >= failThresholdRatio`（默认 0.5）-> `emit('gameOver',{win:false,reason:'overwhelmed'})`。
  - 需访问 total：`this._territorySystem.getTotalClaimableCount()`（已有 `_territorySystem` 引用）。
- **累计清敌计数**：新增 `this._totalCleared`，`clearEnemyCell` 成功 +1，`getState/restoreState` 持久化（`?? 0` 兜底）。供 gameover 统计。

### A3. MapRenderer（`src/rendering/MapRenderer.js`）`_drawTerritory`
- **移除 claimArea 金框**（全图化后无意义）。
- **占术紫覆盖保留**（遍历 `_possessions`，全图）。
- **施法模式标记改视口剔除**：用现有 `startCol/endCol/startRow/endRow`（[L832-835](src/rendering/MapRenderer.js#L832-L835)）只遍历视口内可占领空格画淡绿底色（原遍历 claimArea 100 格 -> 视口 ~1378 格，避免全图 3 万格重绘）。相机移动时需重绘视口标记（实现时确认触发点，必要时纳入主渲染循环）。
- `_onClick` 占术分支不变（`castPossession` 已支持全图）。

---

## B. 正式化呈现（三触点，文案适配 50% 阈值）

### B1. 开局战役目标简报（auto-popup）
- `main.js` `init()` 末尾（原禁用教程注释处）：`if (!saveData) setTimeout(() => popupManager.open('objective', {briefing:true, blocking:true}), 600)`。`blocking:true` 暂停 gameLoop。读档不弹。

### B2. 目标面板 `objective`（新建 `src/ui/panels/objective-panel.js`）
- HUD 底部栏新增 `#btn-objective`（🎯，始终可见），点击 `open('objective')`。
- 卡片式：
  - **胜利条件**：文案「占领超过半数的土地」+ 进度条 `owned/total`（紫）+ 百分比，标 50% 目标线。
  - **失败条件**：文案「敌人占据超过半数的土地」+ 威胁条 `enemyCount/total`（红）+ 百分比，标 50% 危险线 + 当日敌人强度 + 我方战力。
  - **玩法脉络**：基建产金 -> 占术占地 / 招兵清敌 -> 占领半数胜利；两棵树入口提示。
- `data.briefing:true` 时加「战役开始」副标题 + 「开始征服」按钮。
- 实时数据打开时现取 `systems.territory` / `enemyExpansion`。

### B3. gameover 弹窗升级（重写 `src/ui/panels/gameover-panel.js`）
- **评级 / 称号**：
  - 胜利（存活天数）：≤15「⚡ 极速征服者」/ ≤30「👑 征服之王」/ else「🛡️ 坚韧征服者」。
  - 失败（我方占领度 %）：≥40「💔 功亏一篑」/ ≥20「⚔️ 顽强抵抗」/ else「🌑 初尝败绩」。
- **统计**：存活天数、我方占领度（`owned/total + %`）、敌方占领度（`enemy/total + %`）、累计清敌数、活跃建筑、士兵、剩余黄金/食物。
- **按钮**：胜利「再次征服」/ 失败「卷土重来」（`location.reload()`）+「返回主菜单」。
- 保持 `game_over` 不可关闭。

### B4. 接线
- `PopupManager.js`：`_getTitle` 加 `'objective':'战役目标'`；`_registerBuiltinPanels` 动态 import 注册 `objective`。
- `HUD.js`：`_cacheDOM` 缓存 `btn-objective`；`_bindButtons` 绑定 `open('objective')`。
- `index.html`：`#hud-bottom` 加 `<button class="hud-btn" id="btn-objective" title="战役目标">🎯</button>`。

---

## C. 数值适配（config 初始值，待游玩调）

50% ≈ 15857 格，原数值下不可行，需同步调：

- **`config/territory.json`**：
  - 新增 `winThreshold: 0.5`。
  - `possession.inflationRate`：0.1 -> **0.0**（扁平成本；原曲线铺 1.5 万格末格成本过万 gold 不可行。扁平 baseCost×格数，长期可达成。待调 baseCost）。
  - `buildingCap.initial`：10 -> **100**（建筑是占领+产出主力，上限需大幅提高；待调）。
- **`config/enemy_expansion.json`**：
  - 新增 `failThresholdRatio: 0.5`（替代 `failThresholdCells` 40；旧字段保留休眠）。
  - `expansionMaxNewCells`：50 -> 适当提高（50% 阈值下敌人需长到 1.5 万格，每日 50 格太慢；提议 200，待调）。
  - 强度曲线 / 首敌日暂不动（待调）。

数值均为初始提议，明确「待游玩验证」，全部 config 化可随时调。

---

## 文件改动清单

| 文件 | 改动 |
|---|---|
| `src/systems/TerritorySystem.js` | `_claimableCells` 缓存、`canCastAt` 改地形、胜利改比例阈值、新增 `_isClaimableTerrain`/`getClaimableCells` |
| `src/systems/EnemyExpansionSystem.js` | `_emptyCellsForSpawn` 优先边界+全图回退、失败改比例阈值、`_totalCleared` 计数 |
| `src/rendering/MapRenderer.js` | `_drawTerritory` 移除金框、施法模式视口剔除 |
| `src/ui/panels/objective-panel.js` | 新建：目标面板 + 开局简报 |
| `src/ui/panels/gameover-panel.js` | 重写：评级 + 丰富统计 + 双按钮 |
| `src/ui/PopupManager.js` | 注册 `objective` + 标题 |
| `src/ui/HUD.js` | `btn-objective` 绑定 |
| `index.html` | 加 `#btn-objective` |
| `src/main.js` | 开局简报触发 |
| `config/territory.json` | `winThreshold:0.5`、`inflationRate:0.0`、`buildingCap.initial:100` |
| `config/enemy_expansion.json` | `failThresholdRatio:0.5`、`expansionMaxNewCells:200` |

## 存档影响
不 bump version（结构兼容）。`_claimableCells` 运行时缓存不持久化；`_totalCleared` 新字段 `?? 0` 兜底。旧存档继续游戏，分母变全图、阈值变比例。

## 风险 / 待办
- **数值平衡**是最大风险：50% 阈值（~1.5 万格）下游戏时长 / 占术成本 / 建筑上限 / 敌人扩张速率需大量游玩调，本方案仅给初始值。
- **渲染性能**：施法模式视口剔除需确认相机移动触发重绘；敌人全图渲染受比例阈值控制（敌人数可达上万，`_drawEnemyExpansion` 遍历可能需优化，先按现状测）。
- **烟雾测试**：新游戏弹简报；目标面板双进度条（我方/敌方占比）；占术可施全图可占领格（含水/石，不可施山/屏）；敌人优先边界刷新；我方占≥50%触发胜利；敌方占≥50%触发失败；评级统计；读档不弹简报；旧存档继续。
