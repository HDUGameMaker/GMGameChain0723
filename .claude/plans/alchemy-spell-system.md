# 炼金法术系统（消耗品法术 + 成长树）实现计划

## 目标与范围

把"炼金"从休眠的酿造/药水系统，重定位为**生产消耗品法术的子菜单 + 一棵炼金成长树**。

- 炼金子菜单（`alchemy_lab` 面板）= 法术工坊：用四种基础资源生产法术消耗品。
- 炼金树（SVG，沿用 [科技树画法](src/ui/panels/tech-tree-panel.js)）= 解锁/强化法术，节点用四资源解锁。
- 法术是**消耗品**：使用时在地图上**区域施法**（点格+半径，沿用 [占术施法 UX](src/systems/TerritorySystem.js)），有范围+持续+次数。
- 效果：**增益**=区域内生产建筑效率（产出/周期）×N；**减益**=区域内敌人强度↓ / 扩张倒计时冻结。
- "乘法"= 法术持续期间，区域内建筑效率 ×N，叠在现有 `base × 邻接 × 文化 × alchemy` 链上（多轴连乘）。

**本计划范围**：只做炼金法术系统。**建筑成长树留作下一阶段**（可复用同一 tree-panel 模式，形态待另讨论）。

## 关键架构决策

1. **新建 `SpellSystem`**（不塞进 AlchemySystem）：法术施法是空间/地图关注点，与 AlchemySystem 的全局药水效果不同；AlchemySystem 已 900+ 行且多为休眠代码。SpellSystem 即"炼金法术引擎"，通过炼金子菜单呈现。
2. **法术配置放进 `config/alchemy.json`**（新增 `spellTree` + `spellDefs` 两段），ConfigRegistry 加 getter。复用现有 `effects.modifiers` 的 schema 思路。
3. **法术消耗品用 SpellSystem 自有库存**（`_spellInventory`），不复用 ItemSystem（避免耦合休眠物品系统）。
4. **amp（黄金全域直线）休眠**：从 alchemy-panel 移除 amp 投入栏；AlchemySystem 的 amp 代码保留不动（ampLevel=0 → productionMul=1.0，无干扰）。其职能由树上"全域催化"法术继承。
5. **旧酿造/药水/Magnum Opus/五盐继续休眠**（代码与配置不删），alchemy-panel 不再调用其 UI。
6. **法术生产成本走四种基础资源**（wood/stone/food/gold），不走休眠材料库存（材料来源 gather/mine/expedition 全已砍，断供）。
7. **存档 version 3→4**，旧存档强制 initNewGame（沿用既有迁移策略）。

## 数据模型（config/alchemy.json 新增两段）

```jsonc
"spellTree": [
  { "id":"st_catalyst", "name":"催化基础", "tier":0, "pos":{"x":0}, "prerequisites":[],
    "cost":[{"resourceId":"wood","amount":20},{"resourceId":"stone","amount":20}],
    "description":"解锁「催化之泽」", "unlocksSpell":"catalyst_mire" },
  { "id":"st_corrosion", "name":"腐蚀研究", "tier":0, "pos":{"x":2}, "prerequisites":[],
    "cost":[{"resourceId":"food","amount":20},{"resourceId":"gold","amount":10}],
    "description":"解锁「腐蚀之雾」", "unlocksSpell":"corrosive_mist" },
  { "id":"st_harvest", "name":"丰收祈灵", "tier":1, "pos":{"x":0}, "prerequisites":["st_catalyst"],
    "cost":[{"resourceId":"wood","amount":40},{"resourceId":"food","amount":30},{"resourceId":"gold","amount":10}],
    "description":"解锁「丰收祈灵」", "unlocksSpell":"harvest_rite" },
  { "id":"st_stasis", "name":"凝滞结界", "tier":1, "pos":{"x":2}, "prerequisites":["st_corrosion"],
    "cost":[{"resourceId":"stone","amount":40},{"resourceId":"gold","amount":15}],
    "description":"解锁「凝滞结界」", "unlocksSpell":"stasis_field" },
  { "id":"st_global", "name":"全域催化", "tier":2, "pos":{"x":1}, "prerequisites":["st_harvest","st_stasis"],
    "cost":[{"resourceId":"wood","amount":60},{"resourceId":"stone","amount":60},{"resourceId":"food","amount":60},{"resourceId":"gold","amount":40}],
    "description":"解锁「全域催化」（amp 继承者）", "unlocksSpell":"global_catalyst" }
],
"spellDefs": [
  { "id":"catalyst_mire", "name":"催化之泽", "type":"buff",
    "description":"区域内生产建筑效率×1.5，持续12tick", "areaRadius":1, "durationTicks":12, "chargesPerCraft":3,
    "craftCost":[{"resourceId":"wood","amount":15},{"resourceId":"food","amount":10}],
    "effect":{"efficiencyMul":1.5}, "requiredTreeNode":"st_catalyst" },
  { "id":"corrosive_mist", "name":"腐蚀之雾", "type":"debuff",
    "description":"区域内敌人强度-3，持续10tick", "areaRadius":1, "durationTicks":10, "chargesPerCraft":3,
    "craftCost":[{"resourceId":"stone","amount":15},{"resourceId":"gold","amount":5}],
    "effect":{"strengthPenalty":3}, "requiredTreeNode":"st_corrosion" },
  { "id":"harvest_rite", "name":"丰收祈灵", "type":"buff",
    "areaRadius":2, "durationTicks":16, "chargesPerCraft":2,
    "craftCost":[{"resourceId":"wood","amount":30},{"resourceId":"food","amount":25},{"resourceId":"gold","amount":10}],
    "effect":{"efficiencyMul":2.0}, "requiredTreeNode":"st_harvest" },
  { "id":"stasis_field", "name":"凝滞结界", "type":"debuff",
    "areaRadius":2, "durationTicks":12, "chargesPerCraft":2,
    "craftCost":[{"resourceId":"stone","amount":30},{"resourceId":"gold","amount":15}],
    "effect":{"freezeCountdown":true,"strengthPenalty":1}, "requiredTreeNode":"st_stasis" },
  { "id":"global_catalyst", "name":"全域催化", "type":"buff",
    "description":"全场生产建筑效率×1.5，持续20tick（amp 继承者）", "areaRadius":0, "durationTicks":20, "chargesPerCraft":1,
    "craftCost":[{"resourceId":"wood","amount":50},{"resourceId":"stone","amount":50},{"resourceId":"food","amount":50},{"resourceId":"gold","amount":30}],
    "effect":{"globalEfficiencyMul":1.5}, "requiredTreeNode":"st_global" }
]
```

## SpellSystem 设计（新文件 `src/systems/SpellSystem.js`）

**状态**
- `_unlockedNodes: Set<string>` — 已解锁树节点
- `_inventory: Array<{instanceId, spellId, charges}>` — 法术消耗品库存
- `_casting: {instanceId, spellId} | null` — 当前施法模式
- `_activeZones: Array<{id, spellId, type, cx, cy, radius, ticksRemaining, effect}>` — 活跃法术区域
- `_nextInstanceId` / `_nextZoneId` 计数器

**树 API**
- `getSpellTree()` / `getSpellDef(id)`（读 ConfigRegistry）
- `isNodeUnlocked(id)` / `canUnlockNode(id)`（前置满足 + 资源够 + 未解锁）
- `unlockNode(id)` — 消耗四资源 cost，加入 `_unlockedNodes`，emit `spellTreeChanged`

**生产 API**
- `getCraftableSpells()` — `spellDefs` 中 `requiredTreeNode` 已解锁者
- `craftSpell(spellId)` — 校验 `craftCost`，`consumeAll`，push `{instanceId, spellId, charges: chargesPerCraft}`，emit `spellInventoryChanged`

**施法 API**（沿用占术范式）
- `enterCastingMode(instanceId)` / `exitCastingMode()` / `isCastingMode()` / `getActiveSpell()`
- `castAt(x, y)` — 校验（inBounds）；创建活跃区域（buff/debuff）；消耗 1 充能（charges→0 则移除实例并退出施法模式，否则保持施法模式便于连发）；emit `spellZonesChanged`

**效果查询 API**（被 BuildingSystem / EnemyExpansionSystem 调用）
- `getBuildingEfficiencyMul(building)` — 遍历活跃 buff 区域：若 `globalEfficiencyMul` 则全局生效；否则检查建筑 footprint 是否与区域（Chebyshev 距离 ≤ radius）相交，连乘 `efficiencyMul`。返回乘数（默认 1）
- `getStrengthPenaltyAt(x, y)` — 覆盖该格的 debuff 区域 `strengthPenalty` 之和
- `isCountdownFrozen(x, y)` — 该格是否在任一 `freezeCountdown` 区域内

**Tick**
- `eventBus.on('tick')`：递减各区域 `ticksRemaining`，到期移除，emit `spellZonesChanged`

**存档** `getState()` / `restoreState()`：unlockedNodes、inventory、activeZones（可选持久化，建议持久化以支持存读档中途效果）

## 集成点

### BuildingSystem（注入效率乘法）
- `setSpellSystem(ss)`
- `_getProductionMultiplier(resourceId, building)` 增加可选 `building` 形参，末尾 `× (this._spellSystem?.getBuildingEfficiencyMul(building) ?? 1)`。所有调用点（`_processProduction` / `getDailyResourceFlow` / `getBuildingDailyProductionPreview` / `getTotalFoodProduction`）都持有 `building`，传入即可。
- 效果：`产出 = base × 邻接 × 文化 × alchemy × 法术效率`，全连乘。

### EnemyExpansionSystem（注入减益）
- `setSpellSystem(ss)`
- `clearEnemyCell`：`effStrength = max(1, cell.strength − spellSystem.getStrengthPenaltyAt(x,y))`，用 effStrength 判定战力与损耗
- `_expandStep`：递减 countdown 前判断 `spellSystem?.isCountdownFrozen(x,y)`，命中则跳过递减

### MapRenderer（施法 UX + 区域绘制）
- `setSpellSystem(ss)`
- `_onClick`：在占术分支后插入 `if (this._spellSystem?.isCastingMode()) { this._spellSystem.castAt(col,row); this._drawSpellZones(); return; }`
- Esc 处理：插入 `if (e.key==='Escape' && this._spellSystem?.isCastingMode()) this._spellSystem.exitCastingMode()`
- 新增 `_drawSpellZones()`：活跃 buff 区域（青色半透明圆/方）+ debuff 区域（红色）+ 施法模式下的 AoE 半径预览（hover 格周围 radius 范围高亮）
- 订阅 `spellZonesChanged` / `spellCastingModeChanged` 事件重绘
- `render()` 主循环里 `_drawSpellZones()` 与 `_drawTerritory()` 并列（[MapRenderer.js:149](src/rendering/MapRenderer.js#L149) 附近）

### HUD
- `btn-alchemy` 已开 `alchemy_lab`，保留；标签可改为"🜂 炼金"
- 施法模式时显示状态条（读 `store.spellCasting`），提示"点击地图施法 / Esc 取消"（与占术状态条同构）

### main.js（接线 + 存档）
- `import { SpellSystem }`
- `this.systems.spell = new SpellSystem()`
- 装配：`setResourceSystem` / `setBuildingSystem` / `setEnemyExpansionSystem` / `setTerritorySystem`；`building.setSpellSystem(spell)` / `enemyExpansion.setSpellSystem(spell)` / `mapRenderer.setSpellSystem(spell)`
- `popupManager` 注册 `alchemy_lab` 时把 `spellSystem` 一并传入 panel data（[PopupManager.js:413-416](src/ui/PopupManager.js#L413-L416)）
- `spell.init()`；存档 `spell: spell.getState()`；读档 `spell.restoreState(saveData.spell)`
- 存档 `version: 3 → 4`，旧存档（version<4）强制 initNewGame（[main.js:303-304](src/main.js#L303-L304)）

### ConfigRegistry
- 新增 `getSpellTree()` / `getSpellDefs()` / `getSpellDef(id)`（读 `alchemy.spellTree` / `alchemy.spellDefs`）

## UI 改造

### `alchemy-panel.js`（重聚焦）
移除：amp 投入栏、酿造区（基底/材料/加工/配方）、盐栏、元素精华提炼、药剂库存按钮。
新增：
- 顶部：炼金树概览（已解锁节点数 / 总数）+ "🌳 查看炼金树" 按钮 → `pm.push('spell_tree')`
- 法术生产列表：每个可生产法术（`getCraftableSpells()`）一张卡——名称、效果描述、`craftCost`（四资源）、`chargesPerCraft`、"生产"按钮（`craftSpell`）
- 法术库存：每个消耗品实例——名称、剩余充能、"施法"按钮（`enterCastingMode` + `pm.close()` 回地图施法）

### `spell-tree-panel.js`（新文件）
SVG 树，复制 [tech-tree-panel.js](src/ui/panels/tech-tree-panel.js) 结构：`tier` 纵排 + `pos.x` 横排 + `prerequisites` 连线（`<line>` + `<foreignObject>` 节点）。
- 节点状态：已解锁（绿）/ 可解锁（淡绿，资源够）/ 锁定（灰）
- 显示 cost（四资源）+ 解锁的法术名
- 点击可解锁节点 → `spellSystem.unlockNode(id)` → 刷新
- 在 PopupManager 注册 `'spell_tree'`（标题"炼金树"）

## 文件清单

| 文件 | 操作 |
|---|---|
| `config/alchemy.json` | 新增 `spellTree` + `spellDefs` 两段（保留旧字段） |
| `src/core/ConfigRegistry.js` | 新增 `getSpellTree` / `getSpellDefs` / `getSpellDef` |
| `src/systems/SpellSystem.js` | **新建** |
| `src/systems/BuildingSystem.js` | `setSpellSystem` + `_getProductionMultiplier` 加 building 形参并注入法术效率 |
| `src/systems/EnemyExpansionSystem.js` | `setSpellSystem` + `clearEnemyCell`/`_expandStep` 注入减益 |
| `src/rendering/MapRenderer.js` | `setSpellSystem` + 施法点击/Esc/`_drawSpellZones`/事件订阅 |
| `src/ui/HUD.js` | 施法状态条（可选） |
| `src/ui/panels/alchemy-panel.js` | 重聚焦为法术工坊 |
| `src/ui/panels/spell-tree-panel.js` | **新建** |
| `src/ui/PopupManager.js` | 注册 `spell_tree`；`alchemy_lab` 传入 spellSystem |
| `src/main.js` | 接线 + 存档 version 3→4 |

## 不在范围 / 休眠
- AlchemySystem 的酿造/药水/Magnum Opus/五盐/amp：代码与配置保留，仅 UI 不可达，不主动触发。
- `potion-inventory-panel`：保留注册，新 alchemy-panel 不再链接（休眠）。
- 建筑成长树：下一阶段，复用 `spell-tree-panel` 模式。

## 验证
1. 浏览器开新局：炼金子菜单能生产法术消耗品（扣四资源）。
2. 点消耗品"施法"→进施法模式→点地图→区域生效、扣 1 充能、活跃区域绘制。
3. 增益法术覆盖采集建筑时，产出数值在 HUD/建筑详情面板可见提升（×efficiency）。
4. 减益法术覆盖敌人格时，清敌所需战力下降、扩张倒计时停滞。
5. 炼金树节点解锁消费四资源、前置正确、SVG 连线与状态正确。
6. 存读档：法术库存/已解锁节点/活跃区域正确恢复；旧存档（v3）被强制开新局不崩。

## 风险 / 待定数值
- 法术效果数值（efficiencyMul/duration/charges/cost）均为初值，需游玩微调——全部 config 化。
- `_getProductionMultiplier` 加 building 形参：需确认所有调用点都已传入 building，否则该路径不享受法术加成（不影响正确性，仅漏加成）。
- 活跃区域持久化：若不持久化，读档时进行中法术会丢失（可接受；建议持久化）。

## 收尾
- 实现完成后更新 memory `gameplay-redesign-execution.md`：追加"炼金法术系统"段落（SpellSystem / 树 / amp 休眠 / version 4）。
