# Historical Civilization Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有四资源营地游戏重构为拥有七时代、56 文明、人口岗位、奢侈品、双树、历史兵种、城邦外交、英雄和策略卡的无魔法历史文明游戏。

**Architecture:** 保留 EventBus/Store/ConfigRegistry/Systems/DOM UI/PixiJS 的单向数据流。大规模内容集中在数据配置，`EraSystem`、`LuxurySystem`、`StrategySystem` 独占新增状态；现有经济、战斗、外交、英雄系统只通过稳定接口读取其效果。

**Tech Stack:** 原生 ES Modules、PixiJS v8、GSAP、JSON 配置、Node 20 `node:test`、IndexedDB/localStorage 存档。

## Global Constraints

- 所有修改只发生在 `E:\G-Game Design\Game Design Projects\GM GameChain2026`。
- 基础资源必须且只能是 `wood`、`stone`、`food`、`gold`。
- 世界观严格历史向，玩家可见文案不得出现炼金、法术、药剂、驯养。
- 七时代、每时代八文明、每时代八科技和八人文节点。
- 所有运行时数值由配置提供，系统代码不得硬编码平衡表。
- 存档版本为 v7，必须接受 v6 存档并安全迁移。
- 新行为严格遵循测试先行；配置生成与纯美术资产属于机械生成例外，但必须由配置验证测试覆盖。

---

### Task 1: 历史内容目录与配置契约

**Files:**
- Create: `config/historical_content.json`
- Create: `scripts/generate-historical-content.mjs`
- Modify: `src/core/ConfigRegistry.js`
- Test: `test/node/historical-content-validation.test.mjs`

**Interfaces:**
- Consumes: `ConfigRegistry.get(key)` 和现有 ID 优先合并规则。
- Produces: `historicalContent.eras/civilizations/luxuries/buildings/techs/civics/units/heroes/strategies`；`ConfigRegistry.getHistoricalContent()`。

- [ ] **Step 1: 写失败测试**，断言七时代、每时代八文明、20 奢侈品、每时代八双树节点、建筑/单位/英雄/策略最低数量、唯一 ID、四资源成本和图标字段。
- [ ] **Step 2: 运行 `node --test test/node/historical-content-validation.test.mjs`**，确认因配置或接口缺失而失败。
- [ ] **Step 3: 用 `apply_patch` 创建生成器和配置契约**，由脚本确定性输出完整历史内容 JSON。
- [ ] **Step 4: 执行生成器并运行测试**，确认所有内容数量和引用完整性通过。
- [ ] **Step 5: 提交 `feat: add historical content catalog`**。

### Task 2: 恢复人口、住房、食物与建筑岗位

**Files:**
- Modify: `config/initial.json`
- Modify: `config/global.json`
- Modify: `src/systems/PopulationSystem.js`
- Modify: `src/systems/BuildingSystem.js`
- Modify: `src/ui/HUD.js`
- Modify: `src/ui/panels/building-detail-panel.js`
- Test: `test/node/population-workforce.test.mjs`

**Interfaces:**
- Consumes: `BuildingSystem.getTotalHousingCapacity()`、`getTotalAssignedWorkers()`、`ResourceSystem.tryConsume()`。
- Produces: `PopulationSystem.getPopulationStats()`、`getAvailableWorkers()`、`getScienceOutput()`、`getCivicOutput()`；建筑岗位增减 API。

- [ ] **Step 1: 写失败测试**，覆盖新游戏人口、空闲人口、岗位分配上限、零工人零点数、每日食物消耗、住房限制、缺粮迁出。
- [ ] **Step 2: 运行单测确认旧人口休眠逻辑失败**。
- [ ] **Step 3: 恢复人口初始化和日结算，建立满意度与岗位分类统计**。
- [ ] **Step 4: 让所有生产、研究、人文建筑按工人数结算，并在建筑详情中显示岗位与效率**。
- [ ] **Step 5: 运行人口测试和全量测试后提交 `feat: restore population workforce economy`**。

### Task 3: 时代、文明与时代星

**Files:**
- Create: `src/systems/EraSystem.js`
- Create: `src/ui/panels/era-civilization-panel.js`
- Modify: `src/core/ConfigRegistry.js`
- Modify: `src/ui/PopupManager.js`
- Modify: `src/ui/HUD.js`
- Modify: `src/main.js`
- Test: `test/node/era-civilization.test.mjs`

**Interfaces:**
- Produces: `getCurrentEra()`、`getAvailableCivilizations()`、`selectCivilization(id)`、`getBonuses()`、`getEraStars()`、`canAdvance()`、`advanceEra()`、`getState()/restoreState()`。

- [ ] **Step 1: 写失败测试**，覆盖每时代只能选择当代文明、遗产永久累计、70% 双树门槛、时代星门槛和推进。
- [ ] **Step 2: 运行测试确认 `EraSystem` 缺失失败**。
- [ ] **Step 3: 实现纯逻辑 EraSystem 和可序列化状态**。
- [ ] **Step 4: 接入主循环、HUD 时代入口和文明选择面板**。
- [ ] **Step 5: 运行测试后提交 `feat: add eras and civilization legacies`**。

### Task 4: 对称分时代科技树与人文树

**Files:**
- Modify: `src/systems/TechSystem.js`
- Modify: `src/systems/CultureSystem.js`
- Modify: `src/ui/panels/tech-tree-panel.js`
- Modify: `src/ui/panels/culture-tree-panel.js`
- Test: `test/node/era-research-trees.test.mjs`

**Interfaces:**
- Consumes: `EraSystem.getCurrentEra()`、建筑岗位点数。
- Produces: `sciencePoints`、`civicPoints` Store 状态；`getEraProgress(eraId)`；按时代分页节点。

- [ ] **Step 1: 写失败测试**，断言零学院工人不产科技点、零人文工人不产人文点、未到时代不能研究、节点完成计入时代进度。
- [ ] **Step 2: 运行测试观察时代门槛和点数缺失失败**。
- [ ] **Step 3: 将科技/人文推进改为岗位点数驱动，并保留旧已研究 ID**。
- [ ] **Step 4: 重写两个面板为对称的时代分页双行节点布局**。
- [ ] **Step 5: 运行测试后提交 `feat: add era based research trees`**。

### Task 5: 独特建筑、兵种训练与克制战斗

**Files:**
- Modify: `src/core/ConfigRegistry.js`
- Modify: `src/systems/TrainingRules.js`
- Modify: `src/systems/CombatResolver.js`
- Modify: `src/systems/CombatSystem.js`
- Modify: `src/ui/panels/building-select-panel.js`
- Modify: `src/ui/panels/training-panel.js`
- Test: `test/node/historical-buildings-units.test.mjs`

**Interfaces:**
- Consumes: 历史建筑/单位、EraSystem 文明选择、TechSystem 解锁、PopulationSystem 军役人口。
- Produces: 分建筑训练门槛、分时代单位页、特色替代单位、三线与海战克制倍率。

- [ ] **Step 1: 写失败测试**，覆盖建筑独特功能字段、训练建筑/时代/科技/文明门槛、人口和四资源成本、陆海领域和克制环。
- [ ] **Step 2: 运行测试确认现有训练仅检查容量而失败**。
- [ ] **Step 3: 合并历史建筑/单位并扩展 TrainingRules**。
- [ ] **Step 4: 扩展 CombatResolver 的前线/后线/侧翼/攻城/海战标签解析，更新训练与建造面板**。
- [ ] **Step 5: 运行测试后提交 `feat: expand historical buildings and warfare`**。

### Task 6: 奢侈品、贸易与城邦经济

**Files:**
- Create: `src/systems/LuxurySystem.js`
- Create: `src/ui/panels/luxury-trade-panel.js`
- Modify: `src/systems/DiplomacySystem.js`
- Modify: `src/ui/panels/outpost-diplomacy-panel.js`
- Modify: `src/ui/PopupManager.js`
- Modify: `src/main.js`
- Test: `test/node/luxury-trade.test.mjs`

**Interfaces:**
- Produces: `discoverDeposit()`、`addLuxury()`、`getInventory()`、`getBonuses()`、`tradeWithOutpost()`、存档接口。

- [ ] **Step 1: 写失败测试**，覆盖首份效果、重复份贸易、20 种实际效果、关系/市场门槛和四资源回报。
- [ ] **Step 2: 运行测试确认系统缺失失败**。
- [ ] **Step 3: 实现 LuxurySystem 并接入生产、研究、人口、外交和战斗的聚合接口**。
- [ ] **Step 4: 实现奢侈品总览与城邦贸易交互**。
- [ ] **Step 5: 运行测试后提交 `feat: add luxury economy and trade`**。

### Task 7: 无魔法策略卡与英雄时代池

**Files:**
- Create: `src/systems/StrategySystem.js`
- Create: `src/ui/panels/strategy-panel.js`
- Modify: `src/systems/HeroSystem.js`
- Modify: `src/ui/panels/tavern-heroes-panel.js`
- Modify: `src/ui/PopupManager.js`
- Modify: `src/main.js`
- Modify: `index.html`
- Test: `test/node/strategies-era-heroes.test.mjs`

**Interfaces:**
- Produces: `gainCard()`、`canPlay()`、`play()`、`getActiveEffects()`；英雄时代筛选、受伤倒计时和复归。

- [ ] **Step 1: 写失败测试**，覆盖策略来源、消耗/冷却、区域增产、敌人减益、冻结推进、英雄时代池和受伤复归。
- [ ] **Step 2: 运行测试确认策略系统和英雄规则缺失失败**。
- [ ] **Step 3: 实现 StrategySystem 与英雄时代规则**。
- [ ] **Step 4: 从主初始化、存档和 UI 移除炼金/法术入口，新增策略入口**。
- [ ] **Step 5: 运行可见文案扫描和测试后提交 `feat: replace magic with historical strategies`**。

### Task 8: 城邦生成、领地与胜负主线

**Files:**
- Modify: `src/systems/DiplomacySystem.js`
- Modify: `src/systems/EnemyExpansionSystem.js`
- Create: `src/systems/VictorySystem.js`
- Modify: `src/ui/panels/objective-panel.js`
- Modify: `src/main.js`
- Test: `test/node/citystates-victory.test.mjs`

**Interfaces:**
- Produces: 第 10 天城邦生成、有限建筑/单位模板、六档关系、附庸状态；`VictorySystem.evaluate()` 和存档接口。

- [ ] **Step 1: 写失败测试**，覆盖第 10 天生成、城邦不运行玩家双树、特殊建筑/兵种、外交状态转换、征服保留、四类胜利与两类失败。
- [ ] **Step 2: 运行测试确认固定据点缺少生成和胜负聚合失败**。
- [ ] **Step 3: 扩展据点状态与敌人有限扩张，新增 VictorySystem**。
- [ ] **Step 4: 更新目标面板显示各胜利路线进度**。
- [ ] **Step 5: 运行测试后提交 `feat: add city states and victory paths`**。

### Task 9: 22% 连通水系、浅深水与资源点

**Files:**
- Create: `scripts/generate-historical-map.mjs`
- Modify: `config/maps/base_map.json`
- Modify: `src/rendering/MapRenderer.js`
- Modify: `src/systems/BuildingSystem.js`
- Modify: `src/systems/CombatSystem.js`
- Test: `test/node/historical-map.test.mjs`

**Interfaces:**
- Produces: `S` 浅水、`W` 深水、连通水域、四基础资源点与二十奢侈品产地；临水建造和舰船通行检查。

- [ ] **Step 1: 写失败测试**，计算水面比例、浅深水数量、主水系连通率、初始建筑合法性、码头邻水、陆海单位地形限制。
- [ ] **Step 2: 运行测试确认当前 4.89% 水面失败**。
- [ ] **Step 3: 用确定性生成器在保留地图尺寸与关键坐标的前提下生成约 22% 连通水系和资源点**。
- [ ] **Step 4: 更新渲染、建造和战斗的浅深水规则**。
- [ ] **Step 5: 运行测试后提交 `feat: rebuild connected historical waterways`**。

### Task 10: 图标、美术清单、v7 存档与完整回归

**Files:**
- Create: `assets/historical-icons/`
- Create: `assets/historical-icons/manifest.json`
- Create: `scripts/generate-icon-fallbacks.mjs`
- Modify: `src/main.js`
- Modify: `README.md`
- Modify: `docs/EA_SAFE_MERGE_REPORT_2026-08-02.md`
- Test: `test/node/v7-save-and-assets.test.mjs`

**Interfaces:**
- Produces: 每个可见内容的有效图标；v7 保存字段 `era/luxuries/strategies/victory/sciencePoints/civicPoints` 和 v6 迁移。

- [ ] **Step 1: 写失败测试**，检查全部图标存在且非空、v7 字段完整、v6 人口与新增系统迁移默认值。
- [ ] **Step 2: 运行测试确认图标与 v7 缺失失败**。
- [ ] **Step 3: 按 RogueCreativity 的历史大战略风格生成分类图集，使用脚本产生类别 SVG 兜底并写清单，将全部配置指向有效资产**。
- [ ] **Step 4: 升级保存/读档逻辑和 README，运行 `npm.cmd run check`、`node scripts/verify_bonus_interfaces.js` 与全部内容验证**。
- [ ] **Step 5: 启动 HTTP 服务，用真实浏览器回归新游戏、人口分配、双树分页、时代文明、建造训练、海军、城邦外交、英雄、策略、保存读档，确认控制台无错误后提交 `feat: complete historical civilization overhaul`**。
