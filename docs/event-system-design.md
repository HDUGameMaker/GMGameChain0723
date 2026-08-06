> ⚠️ **部分内容已过时**(2026-08-06 审计):文中数值/结构可能已与当前 `config/` 和 `src/` 不符,引用前请对照代码验证。

# 事件系统设计方案

## 设计原则

1. **策划零代码配置** — 触发条件固定为若干维度（基地事件三字段，探险事件五字段），不需要写表达式或脚本
2. **全局概率控制** — 每 tick 掷一次全局骰子，通过后从所有满足条件的事件中加权随机选一个触发，避免事件越多触发越频繁
3. **链式专用事件** — 触发条件全空且 `probability: 1` 的事件为"链式专用"，不参与 tick 随机抽取，只能通过 `trigger_event` 或 `schedule_event` 触发
4. **延迟触发** — `schedule_event` 效果支持将事件延迟 N 天后触发，适用于"旅人离开→2天后回归"等时间跨度叙事
5. **无资源阈值条件** — 游戏没有"资源耗尽即失败"的设计，不需要资源数值判断
6. **效果以物品/资源/事件为主** — 消耗物品、获得物品、增减资源，以及**触发另一个事件**，组合使用覆盖所有需求
7. **失效条件和触发条件同构** — 使用同样的三个维度，降低认知负担
8. **选项可分支** — 选项的效果中可以 `trigger_event` 或 `schedule_event`，不同选项导向不同后续事件，实现分支叙事

---

## 一、触发条件模型

### 三个条件字段

| 字段 | 类型 | 语义 | 不启用时的值 |
|------|------|------|-------------|
| `timePeriods` | `string[]` | 事件仅在指定时段可触发 | `[]` 或 `null`（任意时段） |
| `requiredItems` | `string[]` | 玩家必须持有**全部**指定物品 | `[]` 或 `null`（不检查物品） |
| `requiredBuildings` | `string[]` | 基地必须存在**全部**指定建筑 | `[]` 或 `null`（不检查建筑） |

### 组合逻辑

```
触发条件 = timePeriods检查 OR (为空) 
         AND requiredItems检查 OR (为空)
         AND requiredBuildings检查 OR (为空)
```

- 三个字段之间是 **AND** 关系
- 单个字段内部：`timePeriods` 是 **OR**（满足任一即通过），`requiredItems` 和 `requiredBuildings` 是 **AND**（必须全部满足）
- 字段为空数组或 `null` 表示该维度「不影响触发」，即该维度始终通过

### 失效条件模型

失效条件与触发条件结构完全一致，同样使用 `timePeriods` / `requiredItems` / `requiredBuildings` 三个字段：

| 字段 | 语义 | 示例 |
|------|------|------|
| `timePeriods` | 指定时段内事件永不触发 | 通常不设，留给特殊需求 |
| `requiredItems` | 玩家持有**任一**指定物品时失效 | 事件 A 奖励物品 X，事件 A 失效条件设为持有 X |
| `requiredBuildings` | 基地存在**任一**指定建筑时失效 | 建造了「避难所」后，野兽袭击事件不再触发 |

失效条件的内部逻辑：

```
失效 = timePeriods检查 OR (为空 → 不失效)
      OR requiredItems检查 OR (为空 → 不失效)  
      OR requiredBuildings检查 OR (为空 → 不失效)
```

注意：失效条件各字段之间是 **OR** 关系——任一维度命中即失效。这与触发条件的 AND 不同，因为失效是"只要有一项不满足就禁止触发"。

### 对比总结

| | 触发条件 | 失效条件 |
|------|---------|---------|
| 字段间关系 | **AND**（全部满足才触发） | **OR**（任一命中即失效） |
| timePeriods 内部 | OR（满足任一即通过） | OR（处于任一时段即失效） |
| requiredItems 内部 | AND（必须全部持有） | OR（持有任一即失效） |
| requiredBuildings 内部 | AND（必须全部存在） | OR（存在任一即失效） |

### 探险事件扩展条件

探险事件在基地事件的三字段基础上，额外增加两个条件字段：

| 字段 | 类型 | 语义 | 不启用时的值 |
|------|------|------|-------------|
| `regions` | `string[]` | 当前探险所在区域必须在列表中 | `[]` 或 `null`（任意区域） |
| `requiredCarriedItems` | `string[]` | 探险背包中必须携带**全部**指定物品 | `[]` 或 `null`（不检查） |

**组合逻辑**（五个字段全部 AND）：

```
探险触发条件 = 基地三字段检查
             AND regions检查 OR (为空)
             AND requiredCarriedItems检查 OR (为空)
```

- `regions` 内部是 **OR**（当前区域在列表中任一即通过）
- `requiredCarriedItems` 内部是 **AND**（必须全部携带）
- 注意：`regions` 检查的是探险进行时当前时段所在的区域，不是基地建筑
- 注意：`requiredCarriedItems` 检查的是探险背包中携带的物品，不是全局拥有的物品

**探险事件的阻塞行为**：

探险事件弹窗打开时**阻塞全局时间**（与基地事件相同），基地和探险同步暂停。玩家处理完事件弹窗后，全局恢复。

**探险事件中 `add_resource` 的特殊行为**：

探险事件中执行 `add_resource` 效果时，资源**直接加入基地仓库**，不受探险资源容量限制，不走探险资源池。

**失效条件**：

探险事件的失效条件与基地事件完全相同（三字段，OR 关系），不额外增加字段。

**配置位置**：

探险事件存放在 `config/events/events_expedition.json`，与基地事件共用同一套效果处理器注册表，所有效果类型（包括 `trigger_event`）均可使用。

**探险事件生命周期** `[计划中]`：

当前实现中，基地事件 tick 检查（`EventSystem.onTick()`）已完整运行，但探险 tick 尚未接入事件检查。下方为计划中的探险事件生命周期：

```
探险 tick（计划中）
  │
  ├─ 收集候选事件
  │   条件检查 = 基地三字段 AND regions AND requiredCarriedItems
  │   regions 检查: 当前时段玩家所在区域是否在事件 regions 列表中？
  │
  ├─ 优先级排序 + 概率掷骰（与基地事件相同）
  │
  ├─ 命中 → _triggerEvent() → _enqueueEvent()
  │           ├─ 入队到全局 _eventQueue（与基地事件同一队列）
  │           ├─ _processNextEvent() 出队
  │           ├─ 执行 effects
  │           ├─ PopupManager.open('event', ...)
  │           │   └─ _isBlocking() 暂停全局时间
  │           ├─ 玩家选择选项（支持 trigger_event 链式入队）
  │           └─ 弹窗关闭 → _onPopupClosed() → 队列空则恢复时间
  │
  └─ 未命中 → 无事发生
```

### 事件类型对比

| | 基地事件 | 探险事件 |
|------|---------|---------|
| 触发条件字段 | `timePeriods` / `requiredItems` / `requiredBuildings` | + `regions` / `requiredCarriedItems` |
| 条件字段关系 | 三字段 AND | 五字段 AND |
| 阻塞范围 | 全局暂停 | 全局暂停 |
| 效果系统 | ✅ | ✅ 完全复用 |
| `trigger_event` | ✅ | ✅ 支持分支 |
| `add_resource` 去向 | 基地仓库 | 基地仓库（绕过探险资源池） |
| 配置位置 | `events_base.json` 等 | `events_expedition.json` |

---

### 链式专用事件

当事件的三项触发条件字段（`timePeriods` / `requiredItems` / `requiredBuildings`）**全部为空数组**，且 `probability` 为 `1` 时，该事件被系统识别为**链式专用事件**：

- **不参与** tick 随机抽取（`_collectCandidates` 会跳过）
- **只能**通过以下方式触发：
  - `trigger_event` — 其他事件的选项立即触发
  - `schedule_event` — 延迟 N 天后触发
- 用于故事链的中间节点或结局节点

---

## 二、全局概率系统

### 设计动机

旧版本中每个事件拥有独立的 `probability`，每 tick 对所有候选事件逐一掷骰。这导致：事件配置越多，单位时间内触发的事件总量越大。当策划扩充事件库时，玩家会被事件淹没。

新版本改为**全局单次掷骰**：每 tick 只掷一次全局骰子，通过后才从当前可用事件中选一个触发。事件数量增加不会导致触发频率失控。

### 全局配置

`config/global.json` 中新增两个参数：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `eventTriggerChance` | `number` (0~1) | 0.25 | 每 tick 触发事件的全局概率 |
| `eventMinInterval` | `number` | 4 | 两次事件之间的最小 tick 间隔 |

### 触发流程

```
每 tick
  │
  ├─ 队列处理中？ → 跳过
  ├─ 检查延迟事件（schedule_event 到期的事件直接入队）
  ├─ 全局冷却中？(_globalEventCooldown > 0) → 跳过
  │
  ├─ 全局掷骰: Math.random() < eventTriggerChance ?
  │   └─ 未通过 → 跳过
  │
  ├─ 收集候选事件（排除链式专用事件）
  │   └─ 候选数 = 0 → 跳过
  │
  ├─ 加权随机选择（事件的 probability 作为权重）
  │
  └─ 触发选中事件 → 设置全局冷却 eventMinInterval
```

### 事件 probability 字段的新语义

在全局概率系统下，事件的 `probability` 字段从"独立触发概率"变为**候选池中的权重**：

- `probability: 1`（默认）→ 标准权重，与其他事件等概率被选中
- `probability: 2` → 权重翻倍，被选中的概率是普通事件的 2 倍
- `probability: 0.5` → 权重减半，更稀有
- `probability: 1` + 空条件 → **链式专用**（不参与随机抽取）

---

## 三、事件配置结构

### 完整 JSON Schema

```json
{
  "id": "mysterious_letter",
  "name": "神秘来信",
  "description": "清晨，一封没有署名的信件出现在你的营地门口。信封上印着陌生的纹章。",
  "image": "event_mysterious_letter.png",
  "priority": 5,
  "mutexGroup": null,
  "cooldownTicks": 0,
  "maxTriggers": 1,

  "triggerConditions": {
    "timePeriods": ["morning"],
    "requiredItems": ["item_scroll_fragment"],
    "requiredBuildings": []
  },

  "invalidationConditions": {
    "timePeriods": [],
    "requiredItems": ["item_mysterious_key"],
    "requiredBuildings": []
  },

  "probability": 0.3,

  "effects": [
    { "type": "consume_item",   "itemId": "item_scroll_fragment" },
    { "type": "add_resource",   "resourceId": "gold", "amount": 50 }
  ],

  "options": [
    {
      "text": "打开信封",
      "effects": [
        { "type": "obtain_item", "itemId": "item_mysterious_key" }
      ]
    },
    {
      "text": "先收起来",
      "effects": []
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|:--:|------|
| `id` | `string` | ✅ | 唯一标识，编辑器自动生成或策划手动填写 |
| `name` | `string` | ✅ | 事件标题，显示在弹窗标题栏 |
| `description` | `string` | ✅ | 事件描述文本，显示在弹窗内容区 |
| `image` | `string` | | 事件配图路径，为空则无图 |
| `priority` | `number` | ✅ | 优先级，数字越大越优先触发 |
| `mutexGroup` | `string` | | 互斥组名，同一 tick 同组最多触发一个 |
| `cooldownTicks` | `number` | ✅ | 触发后冷却 tick 数，0 表示无冷却 |
| `maxTriggers` | `number` | | 全游戏最大触发次数，不设表示无限制 |
| `triggerConditions` | `object` | ✅ | 触发条件（基地事件三字段，探险事件在此基础上加 `regions` / `requiredCarriedItems`） |
| `invalidationConditions` | `object` | ✅ | 失效条件（三字段，探险事件同） |
| `probability` | `number` | ✅ | 候选池中的权重（默认为 1）。注意：若三个触发条件全空且 probability=1，该事件被视为链式专用，不参与 tick 随机抽取 |
| `effects` | `array` | | 事件弹出时立即执行的效果（在玩家做出选项之前） |
| `options` | `array` | ✅ | 玩家可选的选项列表，至少 1 个 |

### 选项结构

| 字段 | 类型 | 说明 |
|------|------|------|
| `text` | `string` | 按钮上显示的文字 |
| `effects` | `array` | 选择此选项后执行的效果列表 |

---

## 四、事件生命周期

```
每 tick
  │
  ├─ 0. 守卫检查
  │     队列处理中？→ 跳过本 tick
  │     全局冷却中？→ 跳过随机触发（但仍检查延迟事件）
  │
  ├─ 0.5 检查延迟事件（schedule_event）
  │     遍历 _pendingEvents，到期的事件调用 _triggerEventDirect() 入队
  │
  ├─ 1. 全局掷骰
  │     roll = Math.random()
  │     roll >= eventTriggerChance？→ 跳过（本 tick 无事件）
  │
  ├─ 2. 收集候选事件
  │     遍历所有事件配置：
  │       ├─ 链式专用事件（空条件 + probability=1）？→ 跳过
  │       ├─ 已达 maxTriggers？            → 跳过
  │       ├─ 处于 cooldown？               → 跳过
  │       ├─ invalidationConditions 命中？ → 跳过
  │       └─ triggerConditions 满足？      → 加入候选列表
  │
  ├─ 3. 加权随机选择
  │     以每个事件的 probability 为权重，从候选列表中随机选一个
  │
  ├─ 4. 入队（_enqueueEvent）
  │     _triggerEvent() 调用 _enqueueEvent(event)
  │     检测队列中是否已有相同 event.id → 有则跳过（防重复）
  │     将事件加入 _eventQueue 尾部
  │     若 _isProcessing === false → 立即调用 _processNextEvent()
  │
  ├─ 5. _processNextEvent() 出队
  │     从队列头部 shift() 取出事件
  │     设置 _isProcessing = true
  │     执行 effects（事件弹出时效果，如 consume_item）
  │     调用 PopupManager.open('event', ...) 打开弹窗
  │     弹窗 _show() 通过 _isBlocking() 自动暂停全局时间
  │
  └─ 6. 玩家选择选项
        执行选项的 effects
        若效果中包含 trigger_event：
          → _triggerEventDirect() 调用 _enqueueEvent() 将目标事件入队
          → 关闭当前弹窗（触发 popupClosed 事件）
          → _onPopupClosed() 检测队列仍有事件 → 调用 _processNextEvent()
          → 从队列取出目标事件（跳过 triggerConditions / probability 检查）
          → 执行 effects → 打开弹窗 → 等待选择（可继续链式 trigger_event）
        记录当前事件的 cooldown 和 triggerCount
        （若无 trigger_event）_onPopupClosed() 检测队列为空
          → 设置 _isProcessing = false，游戏时间自然恢复
```

---

## 五、事件处理队列

### 设计动机

在引入队列之前，事件触发后直接打开弹窗，`trigger_event` 效果则关闭当前弹窗并立即打开新弹窗。当短时间内多个事件满足触发条件时，可能出现弹窗覆盖或状态不同步的问题。事件处理队列将所有事件的弹窗操作串行化，保证同一时间最多只有一个事件弹窗可见。

### 核心字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `_eventQueue` | `Array<EventConfig>` | 事件队列，先进先出 |
| `_isProcessing` | `boolean` | 队列是否正在处理中 |

### 入队 _enqueueEvent(event)

此方法被以下两个入口调用：
- `_triggerEvent()` — tick 触发的普通事件
- `_triggerEventDirect()` — 选项效果中 `trigger_event` 触发的链式事件

流程：
1. **查重** — 遍历 `_eventQueue`，如果已存在相同 `event.id` 的事件，直接跳过（防止重复入队）
2. **入队** — 将事件 `push` 到 `_eventQueue` 尾部
3. **启动处理** — 如果 `_isProcessing === false`，立即调用 `_processNextEvent()` 开始处理

### 出队处理 _processNextEvent()

1. 检查 `_eventQueue.length === 0` → 设置 `_isProcessing = false` 并返回
2. 设置 `_isProcessing = true`
3. 从队列头部 `shift()` 取出下一个事件
4. 执行该事件的 `effects`（弹出时效果，如 `consume_item`、`add_resource` 等）
5. 调用 `PopupManager.open('event', ...)` 打开事件弹窗
6. 弹窗的 `_show()` 方法通过 `_isBlocking()` 返回 `true` 自动暂停全局时间（替代原有的手动暂停逻辑）

### 弹窗关闭回调 _onPopupClosed()

- 在 `EventSystem` 初始化时通过 `EventBus.subscribe('popupClosed', ...)` 订阅弹窗关闭事件
- 每次弹窗关闭时触发回调：
  - 如果 `_eventQueue.length > 0` → 调用 `_processNextEvent()` 处理下一个事件
  - 如果 `_eventQueue.length === 0` → 设置 `_isProcessing = false`，游戏时间自然恢复

### onTick 守卫

```
onTick() {
  if (this._isProcessing || this._eventQueue.length > 0) {
    return;  // 队列正在处理中，禁止 tick 触发新事件
  }
  // ... 正常的事件收集与触发逻辑
}
```

确保队列处理期间不会从 tick 中产生新的事件入队，避免并发问题。

### trigger_event 走队列

选项效果中 `trigger_event` 的执行流程已更新：

1. `executeOptionEffects()` 检测到 `trigger_event` 效果时：
   - 调用 `_triggerEventDirect(eventId)` → 内部调用 `_enqueueEvent(event)` 将目标事件入队
   - 关闭当前弹窗（触发 `popupClosed` 事件）
2. `_onPopupClosed()` 检测队列非空 → 调用 `_processNextEvent()`
3. 队列处理目标事件时仍然跳过 `triggerConditions` 和 `probability` 检查（因为是由选项触发的链式事件，不是自然 tick 触发）

### 探险事件

探险事件与基地事件共用同一套队列机制。探险 tick 中触发的候选事件也通过 `_triggerEvent()` → `_enqueueEvent()` 入队，队列处理时不区分事件来源。

### 状态流转图

```
   onTick 触发          trigger_event 选项效果
     │                         │
     ▼                         ▼
_triggerEvent()          _triggerEventDirect()
     │                         │
     └─────────┬───────────────┘
               ▼
       _enqueueEvent(event)
               │
               ├─ 重复 event.id？ → 跳过，返回
               │
               └─ push(_eventQueue)
               │
               ▼
      _isProcessing? ──true──→ 等待 _processNextEvent 被调用
               │
              false
               ▼
       _processNextEvent()
               │
               ├─ 队列空？ → _isProcessing = false，返回
               │
               ├─ shift() 取出事件
               ├─ 执行 effects
               ├─ PopupManager.open('event', ...)
               │   └─ _isBlocking() 返回 true → 暂停全局时间
               │
               └─ 玩家选择选项
                    ├─ 选项含 trigger_event
                    │   → _triggerEventDirect() → _enqueueEvent()
                    │   → 关闭弹窗 → popupClosed → _onPopupClosed()
                    │   → 队列非空 → _processNextEvent() 处理下一个
                    │
                    └─ 无 trigger_event
                        → 关闭弹窗 → popupClosed → _onPopupClosed()
                        → 队列空 → _isProcessing = false
                                   → 全局时间恢复
```

### 与旧流程对比

| 阶段 | 旧流程 | 新流程 |
|------|--------|--------|
| 事件触发 | `_triggerEvent()` 直接打开弹窗 | `_triggerEvent()` → `_enqueueEvent()` → `_processNextEvent()` |
| trigger_event | 关闭弹窗 → 直接打开新弹窗 | `_enqueueEvent()` → 关闭弹窗 → `_onPopupClosed()` → `_processNextEvent()` |
| 弹窗关闭 | `pm.close()` 直接恢复时间 | `_onPopupClosed()` 判断队列状态后决定是否恢复时间 |
| 多事件并发 | 可能弹窗覆盖/状态冲突 | 队列串行处理，保证有序 |
| onTick 保护 | 无 | `_isProcessing` / `_eventQueue.length` 守卫 |

---

## 六、效果类型

### 内置效果

| type | 参数 | 说明 |
|------|------|------|
| `add_resource` | `resourceId`, `amount` | 增加资源 |
| `consume_resource` | `resourceId`, `amount` | 消耗资源 |
| `obtain_item` | `itemId` | 获得物品 |
| `consume_item` | `itemId` | 失去/消耗物品 |
| `unlock_building` | `buildingId` | 解锁建筑 |
| `trigger_event` | `eventId` | 触发另一个事件 — 通过 `_triggerEventDirect()` → `_enqueueEvent()` 入队，由队列按序弹出处理 |
| `schedule_event` | `eventId`, `delayDays` | 延迟触发事件 — 将目标事件加入延迟队列，N 天后自动触发。适用于「旅人离开→2天后回归」等时间跨度叙事 |
| `log` | `message` | 调试用，控制台输出，无游戏效果 |

### 新增效果的步骤

策略模式注册，新增效果类型不需要改 EventSystem 核心逻辑：

```
// src/events/effects/index.js
effectHandlers.register('add_resource', (params) => {
  ResourceSystem.add(params.resourceId, params.amount);
});

// 新增自定义效果
effectHandlers.register('custom_type', (params) => {
  // 自定义逻辑
});
```

---

## 七、配置文件组织

### 分表策略

```
config/events/
├── events_base.json        # 基地随机事件（参与 tick 全局概率抽取）
└── events_expedition.json  # 探险途中的随机事件
```

当前实际配置：
- `events_base.json`：仅包含旅人事件链（1 个入口事件 + 3 个链式专用子事件）
- `events_expedition.json`：当前为空 `[]`

未来可按需扩展更多文件（如 `events_story.json`），分表的好处：
- 策划按场景分别维护，减少合并冲突
- 游戏加载时合并进 ConfigRegistry，运行时无差别
- 编辑器可按文件筛选和概览

### 分支叙事示例

一段"旅人到访"的分支故事，演示 `trigger_event`（立即链式触发）和 `schedule_event`（延迟触发）的组合使用：

```json
// ========== 入口事件：旅人到访 ==========
{
  "id": "story_stranger_arrives",
  "name": "营地来客",
  "description": "一位风尘仆仆的旅人出现在营地边缘，看起来疲惫不堪。",
  "triggerConditions": { "timePeriods": ["morning", "afternoon"], "requiredItems": [], "requiredBuildings": [] },
  "invalidationConditions": { "timePeriods": [], "requiredItems": [], "requiredBuildings": [] },
  "probability": 1,
  "maxTriggers": 1,
  "effects": [],
  "options": [
    {
      "text": "热情接待他",
      "effects": [
        { "type": "consume_resource", "resourceId": "wood", "amount": 50 },
        { "type": "trigger_event", "eventId": "story_stranger_accepted" }
      ]
    },
    {
      "text": "警惕地拒绝他",
      "effects": [
        { "type": "trigger_event", "eventId": "story_stranger_refused" }
      ]
    }
  ]
}

// ========== 分支 A：接受 → 旅人承诺归来（链式专用事件） ==========
{
  "id": "story_stranger_accepted",
  "name": "旅人离去",
  "description": "旅人感激地接过木材，在营地歇息片刻后重新上路。「感谢你的慷慨，我会记住这份恩情。两日后我必定归来报答。」",
  "triggerConditions": { "timePeriods": [], "requiredItems": [], "requiredBuildings": [] },
  "probability": 1,
  "maxTriggers": 1,
  "effects": [],
  "options": [
    {
      "text": "期待他的归来",
      "effects": [
        { "type": "schedule_event", "eventId": "story_stranger_return", "delayDays": 2 }
      ]
    }
  ]
}

// ========== 分支 B：拒绝 → 直接结束（链式专用事件） ==========
{
  "id": "story_stranger_refused",
  "name": "旅人远去",
  "description": "旅人叹了口气，没有多说一句话，转身消失在荒野之中。也许他只是一个普通的过路人。",
  "triggerConditions": { "timePeriods": [], "requiredItems": [], "requiredBuildings": [] },
  "probability": 1,
  "maxTriggers": 1,
  "effects": [],
  "options": [
    { "text": "继续手头的工作", "effects": [] }
  ]
}

// ========== 延迟触发：2 天后旅人回归（链式专用事件） ==========
{
  "id": "story_stranger_return",
  "name": "旅人回归",
  "description": "旅人如约归来，马背上驮着沉甸甸的物资。「我说过会回来的。这些是从远处矿场带来的，希望能帮上忙。」",
  "triggerConditions": { "timePeriods": [], "requiredItems": [], "requiredBuildings": [] },
  "probability": 1,
  "maxTriggers": 1,
  "effects": [],
  "options": [
    {
      "text": "收下铁矿（+20）",
      "effects": [
        { "type": "add_resource", "resourceId": "iron_ore", "amount": 20 }
      ]
    },
    {
      "text": "收下煤炭（+30）",
      "effects": [
        { "type": "add_resource", "resourceId": "coal", "amount": 30 }
      ]
    }
  ]
}
```

**分支结构图**：

```
              story_stranger_arrives（营地来客）
                     │
        ┌────────────┼────────────┐
        ▼                         ▼
  "热情接待他"             "警惕地拒绝他"
  -50木材                  trigger_event
  trigger_event                 │
        │                      ▼
        ▼          story_stranger_refused（旅人远去）
 story_stranger_accepted        │
 （旅人离去）              "继续手头的工作"
        │                   （结束，无后续）
  "期待他的归来"
  schedule_event
  delayDays: 2
        │
        ▼  （2 天后自动触发）
 story_stranger_return（旅人回归）
        │
   ┌────┼────┐
   ▼         ▼
"收下铁矿" "收下煤炭"
 +20铁矿   +30煤炭
```

**关键机制**：

| 机制 | 说明 |
|------|------|
| **链式专用事件** | `story_stranger_accepted` / `story_stranger_refused` / `story_stranger_return` 的触发条件全空 + `probability: 1`，被系统自动识别为链式专用，不参与 tick 随机抽取 |
| `trigger_event` | 立即触发下一个事件，走队列处理。用于选项→子事件的即时跳转 |
| `schedule_event` | 延迟 N 天触发目标事件。事件加入 `_pendingEvents` 延迟队列，到期后自动调用 `_triggerEventDirect()` 入队 |
| `maxTriggers: 1` | 入口事件设为一次性，触发后不再出现在候选池中 |
| 全局概率 | 入口事件 `story_stranger_arrives` 参与 tick 随机抽取（因为有 `timePeriods` 条件），其 `probability: 1` 作为权重，与其他候选事件竞争 |

**策划的操作**：创建入口事件（设触发条件） → 在选项中添加 `trigger_event` / `schedule_event` → 创建子事件（条件留空，probability=1）→ 子事件自动成为链式专用。

---

## 八、编辑器 UI 设计

`editor_design.html` 中事件编辑页的建议布局：

```
┌──────────────────────────────────────────────────────┐
│  事件编辑器                                           │
├──────────────────────────────────────────────────────┤
│                                                      │
│  基本信息                                             │
│  ┌────────────┐  ┌────────────┐  ┌────────┐         │
│  │ ID         │  │ 事件名称    │  │ 配图   │  [...]  │
│  └────────────┘  └────────────┘  └────────┘         │
│  ┌──────────────────────────────────────────┐        │
│  │ 事件描述文本（多行）                        │        │
│  └──────────────────────────────────────────┘        │
│                                                      │
│  ── 触发条件 ──────────────────────────────────      │
│  时段：  ☑ 早晨  ☑ 下午  ☐ 傍晚  ☐ 深夜              │
│  前提物品：[碎片A ▼] [+添加]                          │
│  前提建筑：[酒馆 ▼]   [+添加]                          │
│                                                      │
│  ── 失效条件 ──────────────────────────────────      │
│  时段：  ☐ 早晨  ☐ 下午  ☐ 傍晚  ☐ 深夜              │
│  失效物品：[古代地图 ▼] [+添加]                        │
│  失效建筑：[______ ▼] [+添加]                          │
│                                                      │
│  ── 触发参数 ──────────────────────────────────      │
│  权重：    [===        ] 1.0                          │
│  优先级：  [5         ]                               │
│  互斥组：  [无 ▼     ]                                │
│  冷却tick：[0         ]                               │
│  最大次数：[1         ]  ☑ 限制                        │
│                                                      │
│  ── 弹出时效果 ────────────────────────────────      │
│  效果类型: [消耗物品 ▼] 目标: [碎片A ▼]  [✕]          │
│  效果类型: [触发事件 ▼] 目标: [子事件A ▼] [✕]          │
│  [+添加效果]                                          │
│                                                      │
│  ── 选项 ─────────────────────────────────────      │
│  ┌──────────────────────────────────────────┐        │
│  │ 选项1: [请他喝一杯        ]               │        │
│  │   效果: [消耗资源 ▼] [金币] [20]   [✕]    │        │
│  │   效果: [触发事件 ▼] [友好路线 ▼]  [✕]    │        │
│  │        [+添加效果]                        │        │
│  ├──────────────────────────────────────────┤        │
│  │ 选项2: [赶走他            ]               │        │
│  │   效果: [触发事件 ▼] [敌对路线 ▼]  [✕]    │        │
│  │        [+添加效果]                        │        │
│  └──────────────────────────────────────────┘        │
│  [+添加选项]                                          │
│                                                      │
│  ── 事件分支预览 ────────────────────────────        │
│  当前事件                                              │
│    ├─ [热情接待] → story_stranger_accepted               │
│    │   └─ [期待归来] → schedule_event(story_stranger_return, 2d) │
│    └─ [警惕拒绝] → story_stranger_refused                │
│                                                      │
├──────────────────────────────────────────────────────┤
│  [保存]  [另存为模板]  [校验]  [模拟触发]              │
└──────────────────────────────────────────────────────┘
```

### 编辑器功能要点

| 功能 | 说明 |
|------|------|
| **ID 自动补全** | 前提物品/建筑的下拉框读取已有配置，避免拼写错误 |
| **条件可视化** | 三行条件自动生成人类可读摘要：「早晨或下午 + 持有碎片A + 存在酒馆」 |
| **模拟触发** | 输入当前游戏状态，编辑器告诉你此事件当前能否触发 |
| **模板保存** | 结构相同的事件保存为模板，新建时选择模板只需填参数 |
| **校验** | 引用的 itemId/buildingId 必须存在；失效条件引用的事件链终产物必须能在某个选项中产出 |

---

## 九、运行时调试

EventSystem 内部维护调试日志，开发模式下可在控制台查看：

```js
// 浏览器控制台
EventSystem.printDebug()
// 输出：
// [tick 24] flood_disaster      → SKIP (cooldown: 5 remaining)
// [tick 24] visitor_arrives     → ROLL 0.12 >= 0.10 → SKIP
// [tick 24] story_ruins_02_map  → TRIGGER (roll 0.03 < 0.50)
//   → effects: consume_item(ancient_fragment) ✓
//   → option 1: obtain_item(ancient_map) ✓
```

调试信息包括：哪个 tick、事件 ID、跳过原因（冷却中/条件不满足/概率未中）、触发了什么效果。策划不需要打开代码也能理解事件为什么没有触发。

---

## 十、事件模板（后续实现，可选）

对于大量同构事件（如多个资源短缺事件），提供模板机制减少重复配置：

```json
// 模板定义
"templates": {
  "resource_shortage": {
    "triggerConditions": {
      "timePeriods": ["morning", "afternoon"],
      "requiredItems": [],
      "requiredBuildings": []
    },
    "probability": 0.2,
    "cooldownTicks": 6,
    "maxTriggers": null,
    "effects": [],
    "options": [
      { "text": "知道了", "effects": [] }
    ]
  }
}

// 实例（仅需声明模板 + 区别参数）
{
  "id": "shortage_wood",
  "template": "resource_shortage",
  "name": "木材短缺",
  "description": "伐木场报告木材储备严重不足。",
  "image": "event_wood_shortage.png",
  "params": {
    "priorityOverride": 3
  }
}
```

实例继承模板的所有字段，`params` 中声明的字段覆盖模板对应值。模板不是必须的——如果团队规模小、事件数量不多，不用模板也不会增加多少工作量。

---

## 十一、与原架构方案的衔接

| 原架构描述 | 修订 |
|-----------|------|
| "条件与效果采用策略模式，每种 type 注册处理器" | ✅ 保留，效果类型通过 `effectHandlers.register()` 注册 |
| "tick 时收集满足条件的事件，按概率触发，弹窗阻塞时间" | ✅ 保留，事件生命周期未变 |
| "事件效果通过调用 ResourceSystem / ItemSystem 的 API 修改状态" | ✅ 保留，效果执行统一走 System API |
| EventConfig 字段未详细定义 | → 本文档补充完整字段和逻辑 |
| 编辑器仅提了一句 | → 本文档给出编辑器 UI 方案 |

---

*本文档是对 `architecture-plan.md` 第 7 节（事件系统）的详细展开，配置结构和交互逻辑以本文档为准。*
