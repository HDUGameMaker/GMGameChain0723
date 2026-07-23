# 资源系统与物品系统 API 设计方案

## 设计原则

- 两个系统对全局状态拥有**独占写入权**，外部代码只能通过开放的函数来修改资源或物品状态
- 所有合法性校验在系统内部完成，调用方根据返回值判断操作是否成功
- 查询函数与修改函数分离，查询不产生副作用

---

## 一、资源系统 (ResourceSystem)

### 配置结构 (`config/resources.json`)

```json
{
  "id": "wood",
  "name": "木材",
  "icon": "resource_wood.png",
  "initial": 50,
  "max": 200,
  "rare": false,
  "showInHUD": true
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一标识（如 `wood`、`iron`、`gold`） |
| `name` | `string` | 显示名称 |
| `icon` | `string` | 图标路径 |
| `initial` | `number` | 新游戏初始数量 |
| `max` | `number` | 存储上限 |
| `rare` | `boolean` | 是否稀有资源（`true` 时仅在仓库面板显示，不在仓库概览中突出） |
| `showInHUD` | `boolean` | 是否在主界面 HUD 资源栏显示。只有标记为 `true` 的关键资源才上 HUD，控制显示的整洁度 |

运行时额外维护 `current`（当前数量），初始值 = `initial`。

### 开放函数

#### 修改类（有副作用，有返回值）

| 函数 | 参数 | 返回值 | 校验逻辑 | 使用场景 |
|------|------|--------|---------|---------|
| `add(id, amount)` | 资源ID，数量 | `true` / `false` | 新增后不超过 `max`；`amount` 必须为正数 | 建筑产出、事件奖励 |
| `tryConsume(id, amount)` | 资源ID，数量 | `true` / `false` | 当前数量 >= `amount`；`amount` 必须为正数 | 建筑建造/升级消耗、锻造消耗、冒险出发 |
| `setMax(id, newMax)` | 资源ID，新上限 | `true` / `false` | `newMax` >= 当前数量；`newMax` > 0 | 仓库升级、法典效果 |

#### 查询类（无副作用）

| 函数 | 参数 | 返回值 | 使用场景 |
|------|------|--------|---------|
| `getAmount(id)` | 资源ID | `number` | 单个资源查询 |
| `getAll()` | 无 | `[{id, name, icon, current, max, rare}, ...]` | 仓库面板显示全部资源 |
| `getHUDResources()` | 无 | `[{id, name, icon, current, max}, ...]` | HUD 显示（仅 `showInHUD === true` 的资源） |
| `hasEnough(id, amount)` | 资源ID，数量 | `true` / `false` | UI 按钮灰显判断、建造前置校验 |

### 校验流程

```
调用 add(id, amount)
  → amount <= 0?                                          → false（参数非法）
  → current + amount > getMaxResourceCapacity(id)?        → false（达到上限）
  → current += amount                                     → true

调用 tryConsume(id, amount)
  → amount <= 0?                                          → false（参数非法）
  → current < amount?                                     → false（资源不足）
  → current -= amount                                     → true

调用 setMax(id, newMax)
  → newMax < current?                                     → false（当前持有超过新上限）
  → max = newMax                                          → true
```

---

## 二、物品系统 (ItemSystem)

### 配置结构 (`config/items.json`)

```json
{
  "id": "relic_axe",
  "name": "伐木斧遗物",
  "icon": "item_relic_axe.png",
  "description": "古代伐木工具，提升木材采集效率",
  "unique": true,
  "consumable": false,
  "capacityCost": 2,
  "expeditionEffects": [
    {
      "type": "yield_multiplier",
      "resourceId": "wood",
      "value": 1.5
    }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一标识 |
| `name` | `string` | 显示名称 |
| `icon` | `string` | 图标路径 |
| `description` | `string` | 描述文本 |
| `unique` | `boolean` | 是否全局唯一。`true` = 最多持有 1 个实例，重复 `obtain` 直接拒绝；`false` = 可反复获得，每次产生一个新实例 |
| `consumable` | `boolean` | 是否消耗品。`true` = 探险归来后自动消失（`returnFromExpedition` 内部调用 `lose`） |
| `capacityCost` | `number` | 探险背包中占用的容量（整数，如 1、2、4） |
| `expeditionEffects` | `object[]` | 探险效果数组，空数组 `[]` 表示纯剧情/解锁物品 |

> **unique 与 consumable 独立**：`unique: false` + `consumable: true` = 可合成多根标记火把，每根选入探险后消耗；`unique: true` + `consumable: false` = 全局唯一永久物品（如头灯）；两者通常不同时为 true。

### expeditionEffects 条目类型

每个效果对象包含以下字段。`resourceId` 和 `regions` 为可选筛选条件：都不填 = 全局生效；填一个 = 按该维度筛选；两个都填 = AND 关系（只在指定区域对指定资源生效）。

| 类型 | 参数 | 说明 |
|------|------|------|
| `yield_multiplier` | `resourceId?`, `value`, `regions?` | 指定资源产出倍率。不填 `resourceId` 时对**所有资源**生效 |
| `yield_flat_bonus` | `resourceId?`, `value`, `regions?` | 指定资源固定加成。不填 `resourceId` 时对所有资源生效 |
| `resource_capacity_bonus` | `value` | 资源携带上限增加 |
| `backpack_capacity_bonus` | `value` | 背包容量增加 |
| （`expeditionEffects: []`） | — | 不影响产出，仅用于触发事件或解锁区域 |

`regions` 字段为区域 ID 数组（如 `["forest", "mine_interior"]`），效果仅在指定区域内生效。不填 = 所有区域生效。

### 运行时状态（内部维护）

所有物品统一使用**实例（instance）**模型追踪。每个实例有唯一 `instanceId`（格式 `"{itemId}_{序号}"`，如 `"marking_torch_1"`）。`unique: true` 的物品实例数上限为 1。

```
内部数据结构示例:
{
  "relic_axe": {
    instances: [
      { instanceId: "relic_axe_1", equipped: false, inExpedition: false }
    ]
  },
  "marking_torch": {
    instances: [
      { instanceId: "marking_torch_1", equipped: false, inExpedition: false },
      { instanceId: "marking_torch_2", equipped: true,  inExpedition: false },
      { instanceId: "marking_torch_3", equipped: false, inExpedition: false }
    ]
  }
}
```

| 实例字段 | 说明 |
|------|------|
| `instanceId` | 实例唯一标识，格式 `"{itemId}_{序号}"` |
| `equipped` | 是否已勾选入探险背包 |
| `inExpedition` | 是否正在探险中使用（出发后标记，返回后清除或消耗） |

### 开放函数

#### 修改类

| 函数 | 参数 | 返回值 | 校验逻辑 | 使用场景 |
|------|------|--------|---------|---------|
| `obtain(id)` | 物品ID | `instanceId` / `false` | `unique` 且已有实例 → false | 事件获得、合成获得 |
| `lose(instanceId)` | 实例ID | `true` / `false` | 实例存在；实例 `inExpedition` → false | 事件失去、合成消耗、消耗品归来 |
| `equip(instanceId)` | 实例ID | `true` / `false` | 实例存在且未 `equipped` 且未 `inExpedition` | 冒险出发前勾选物品 |
| `unequip(instanceId)` | 实例ID | `true` / `false` | 实例存在且已 `equipped` 且未 `inExpedition` | 冒险出发前取消勾选 |
| `markExpedition(instanceIds)` | 实例ID数组 | `true` / `false` | 所有实例都已 `equipped` 且未 `inExpedition` | 确认出发时，标记为探险中 |
| `returnFromExpedition(instanceIds)` | 实例ID数组 | `void` | 无前置条件 | 探险归来：消耗品 → `lose()`；非消耗品 → 清除 `inExpedition` + `equipped` |

#### 查询类

| 函数 | 参数 | 返回值 | 使用场景 |
|------|------|--------|---------|
| `isOwned(id)` | 物品ID | `true` / `false` | 是否持有至少 1 个实例（unique 物品的拥有判断） |
| `getOwnedInstances()` | 无 | `[{instanceId, itemId, name, icon, equipped, inExpedition, capacityCost, ...}, ...]` | 仓库面板、冒险面板物品列表。非 unique 物品每个实例一行 |
| `getEquippedInstances()` | 无 | `[{instanceId, ...}, ...]` | 冒险面板「已勾选」计数 |
| `getExpeditionInstances()` | 无 | `[{instanceId, ...}, ...]` | 探险中物品查询 |

### 校验流程

```
调用 obtain(id)
  → itemConfig 存在?                                      → false
  → unique && getOwnedInstances中该id的实例数 >= 1?        → false（全局唯一且已持有）
  → 创建新实例，instanceId = "{id}_{自增序号}"               → instanceId

调用 equip(instanceId)
  → 实例存在?                                              → false
  → 实例.equipped?                                        → false（已勾选）
  → 实例.inExpedition?                                    → false（物品在外）
  → equipped = true                                       → true

调用 markExpedition(instanceIds)
  → 每个实例: equipped && !inExpedition?                    → 任一不满足 → false
  → 每个实例: inExpedition = true; equipped = false         → true

调用 returnFromExpedition(instanceIds)
  → 对每个实例:
      config.consumable? → lose(instanceId)（消耗品消失）
      否则               → inExpedition = false; equipped = false（归还仓库）
```

---

## 三、两个系统的内部角色

### 需要触发的通知

每次状态变更后，系统内部通过 EventBus 发出通知，驱动 UI/HUD 刷新：

| 变更事件 | 需刷新的 UI |
|---------|------------|
| 资源数量变化（add/tryConsume） | HUD 资源栏、仓库面板（如果打开） |
| 资源上限变化（setMax） | HUD 最大显示、仓库面板 |
| 物品获得/失去 | 仓库面板、探险准备面板（如果打开） |
| 物品勾选/取消（equip/unequip） | 探险准备面板物品列表 |
| 探险出发/归来 | 探险准备面板、仓库面板 |

### 与事件系统的配合

事件系统的效果执行时（如「获得 50 木材」、「失去随机物品」、「获得稀有道具X」），通过调用上述 API 来完成状态变更。事件系统本身不直接操作资源/物品数据。

### 与配置的关系

- 资源和物品的静态属性（名称、图标、上限初始值、是否稀有、容量消耗、探险效果等）由 `config/resources.json` 和 `config/items.json` 定义
- ResourceSystem 和 ItemSystem 启动时从配置初始化运行时状态
- 运行时只有 `current`、`owned`、`equipped` 等动态字段会变化，静态属性始终读配置
