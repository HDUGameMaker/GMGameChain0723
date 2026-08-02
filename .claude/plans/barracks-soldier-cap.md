# 工棚→军营：士兵上限机制 + 退役人口/工人

## 目标
- 工棚(work_shed) → 军营，木板房(plank_house) → 营房（高级军营）。提供 **士兵上限** 而非人口上限。
- 训练菜单产出的士兵参与上限计算；训练不再消耗工人，改为受士兵上限约束。
- 彻底退役人口/工人：注释掉 PopulationSystem 日结算（不再按人口吃食物/饥饿死亡/Pop<2 失败/增长）。食物只用于训练与铸币。
- **保留建筑 id `work_shed`/`plank_house` 不重命名**，避免波及 techs/sound/quests/base_map 等休眠配置的级联改名（这些按 id 查表，改名会静默失效）。仅改 name/描述/字段。

## 设计要点
- `soldierCapacity`：work_shed=3，plank_house=8（可后续调参）。
- 士兵上限 = Σ 活跃军营的 soldierCapacity（失效建筑不算）。
- 士兵总数 = store.availableUnits 计数 + store.armies.unitIds 计数（+ 战斗部署单位，但战斗系统已砍，实际为 0）。1 个单位 = 1 名士兵（忽略 populationRequired）。
- 训练门槛 = 资源足够 **且** 士兵总数 < 上限。
- 失败条件不变：胜利(铺满)/被淹没(敌人≥阈值)。移除饥饿失败。

## 改动文件（9 个）

### 1. config/buildings.json — 改造两栋建筑
- `work_shed`：name→"军营"，description 改为军事文案，删 `housingCapacity:3`，加 `soldierCapacity:3`，tags `["dorm"]`→`["barracks"]`。其余(id/footprint/buildCost/upgradesTo/图标/initialBuilding)不动。
- `plank_house`：name→"营房"，description 改为高级军事文案，删 `housingCapacity:6`，加 `soldierCapacity:8`，tags→`["barracks"]`。其余不动。

### 2. src/systems/BuildingSystem.js — 加士兵上限查询
- 新增 `getTotalSoldierCapacity()`：遍历活跃且非 `_invalid` 建筑，累加 `config.soldierCapacity`。
- 新增 `getTotalSoldierCount()`：`store.getState('availableUnits')` 各值求和 + `store.getState('armies')` 各 army.unitIds 长度求和。
- 保留 `getTotalHousingCapacity()`（现在返回 0，休眠调用方不崩）。
- `demolishBuilding`：宿舍死亡分支以 `housingCapacity>0` 为门，军营无此字段自动跳过——不动。拆军营会降低上限，存量士兵超额则训练被锁，无需自动遣散。

### 3. src/systems/PopulationSystem.js — 中立化日结算
- `onDayStart()`：注释掉灵感产出、食物消耗、饥饿死亡、Pop<2 game over、住房增长/衰减。改为仅 `_updateStore()`（或空）。保留方法体不删，便于回溯。
- `initNew()`：`current=0`（人口不再有意义）。
- 保留 `getAvailableWorkers/occupyForConstruction/releaseFromConstruction/getMilitaryPopulation/getPopulationStats` 等方法签名（休眠系统 combat/colony/invasion/expedition/culture 仍调用，做成无害空转：current=0 → getAvailableWorkers 返回 0）。
- `_onOverflowTick`：current=0、housing=0 → overflow=0 自动空转，不动。

### 4. src/ui/panels/training-panel.js — 工人门槛→士兵上限门槛
- 删 `availWorkers/hasWorkers/_releaseUnitWorker` 及对 `popSys.occupyForConstruction/releaseFromConstruction` 的调用。
- 顶部"可用工人"栏 → "⚔️ 士兵 count/cap"栏（读 buildingSystem.getTotalSoldierCount/Capacity）。
- `canTrain = canAfford && (count < cap)`；满额时训练按钮置灰，失败提示"士兵已达上限 X，建造或升级军营"。
- 单位属性行去掉 `👷需求N`（保留 ⚔️/CP）。
- 遣散按钮 title "返还工人"→"释放士兵名额"；遣散仅从 availableUnits 减 1（不再 release worker）。

### 5. src/ui/panels/army-panel.js — 遣散不再返还工人
- `dismissFromArmy`：删 `popSys.releaseFromConstruction(required)`。
- 遣散按钮 title "遣散一个，返还工人"→"遣散一个，释放名额"。
- 不加士兵上限门（avail↔army 转移不改变总数）。

### 6. src/ui/HUD.js — 人口栏→士兵栏
- 重写 `_refreshPopulation()`：显示 `⚔️ 士兵 count/cap` + `📦 军团 N` 等；去掉 idle/work/military/housing/日增。
- 简化 popover：士兵总数/上限、可用储备、军团编制、食物储备。
- 保留有效订阅：availableUnits/armies/armyVersion/buildingVersion（population* 订阅保留无害，会触发新逻辑重绘）。
- `_getDailyResourceFlow` 中食物消耗改用 0（人口退役）；或保留调用但 PopulationSystem 返回 0。倾向前者：food consumed=0。

### 7. src/ui/panels/building-select-panel.js — 标签
- 标签行：`if (b.housingCapacity)` → `if (b.soldierCapacity) tags.push('⚔️ +N 士兵')`。

### 8. src/ui/panels/gameover-panel.js — 文案与统计
- 统计项 "最终人口 N 人" → "士兵 N"（取 buildingSystem.getTotalSoldierCount()）。
- 删/改人口相关失败原因文案（保留 win / overwhelmed 两条主分支）。

### 9. src/main.js — 存档版本 2→3
- `version: 2`→`3`；加载判定 `rawSave.version >= 3`，旧存档强制 initNewGame（建筑语义变更，稳妥起见重开）。

## 不改（休眠/安全）
- building-detail-panel.js：工人分配区以 `maxWorkers>0` 为门（所有活跃建筑 maxWorkers=0），不渲染；training_ground 段为已砍 id，休眠。
- MapRenderer.js：工人数文本以 `currentWorkers>0` 为门，恒不渲染；颜色表保留 work_shed id。
- config/techs.json / sound.json / quests.json / maps/base_map.json：保留 work_shed id，无需改。
- CombatSystem/ColonySystem/InvasionSystem/ExpeditionSystem/RoadSystem/CultureSystem：休眠引用 population 方法仍存在（空转），不崩。
- config/enemies.json：`populationRequired` 字段保留但不再用于门槛。

## 验证
- 开新局：初始 1 座军营(上限 3)；训练面板显示 士兵 0/3；训练 1 战士→1/3；训到 3 后按钮置灰。
- 造第 2 座军营→上限 6；升级军营为营房→上限 +5。
- 遣散士兵→名额释放可再训。
- 清敌消耗 availableUnits→士兵总数下降。
- HUD 显示士兵 x/cap；无人口/工人字样。
- 旧存档加载→强制开新局(v3)。
- 不出现 populationChanged/gameOver(starve) 触发。
