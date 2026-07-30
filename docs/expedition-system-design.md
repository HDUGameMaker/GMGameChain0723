# 探险系统设计方案

## 设计原则

1. **简单容量制** — 背包管携带物品，资源容量管采集上限，不搞网格
2. **灵活时段选择** — 出发前为 1-3 个时段各选一个区域，可重复
3. **区域基准产出 × 物品加成** — 产出由区域配置决定，物品提供倍率/固定加成/容量加成
4. **探险事件仅用于剧情** — 不干预产出数值，只在满足条件时弹出叙事
5. **区域解锁 OR 逻辑** — 物品条件或建筑条件满足其一即可
6. **多入口分区分流** — 地图上可放置多个探索入口，每个入口绑定不同区域，点击不同入口进入不同场地
7. **按区域消耗人力** — 每个区域配置所需工人数，出发时从可用工人池扣减，探险期间锁定，归来后归还

---

## 一、核心数据模型

### 区域配置 (RegionConfig)

```json
{
  "id": "dark_forest",
  "name": "暗黑森林",
  "description": "光线昏暗的原始森林，夜晚采集稀有草药效率最高。",
  "image": "region_dark_forest.png",
  "unlockConditions": [],
  "workerCost": 2,
  "baseYields": {
    "morning":    { "wood": 120, "food": 60,  "herb": 0 },
    "afternoon":  { "wood": 100, "food": 80,  "herb": 2 },
    "evening":    { "wood": 50,  "food": 40,  "herb": 6 },
    "night":      { "wood": 20,  "food": 10,  "herb": 12 }
  }
}
```

| 字段 | 说明 |
|------|------|
| `baseYields` | 四个时段的基准产出，key 为时段名，value 为 `{ 资源ID: 数量 }` |
| `unlockConditions` | 解锁条件数组，OR 关系，空数组 = 默认解锁 |
| `workerCost` | 探索该区域所需工人数，0 或不填 = 不需要工人 |
| `image` | 区域方框内展示的缩略图 |

### 解锁条件

```json
"unlockConditions": [
  { "type": "item",     "itemId": "relic_compass" },
  { "type": "building", "buildingId": "lighthouse" }
]
```

| type | 参数 | 说明 |
|------|------|------|
| `item` | `itemId` | 携带指定物品即可解锁（背包中） |
| `building` | `buildingId` | 基地存在指定建筑即可解锁 |

数组内 OR 关系：满足任意一项即解锁。空数组表示初始即可进入。

典型使用场景：

> 古代遗迹：前期玩家通过事件获得罗盘遗物，携带即可进入；后期建造灯塔后建筑解锁，不再需要罗盘。

### 物品探险效果

物品配置中的 `expeditionEffects` 字段（数组，详见 `docs/resource-item-system-api.md`）：

```json
{
  "id": "relic_axe",
  "name": "伐木斧遗物",
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

每个效果可带 `resourceId`（不填 = 所有资源）和 `regions`（不填 = 所有区域），两者都填时 AND 关系。`[注]` 当前实现中 `regions` 过滤尚未生效，所有物品效果全局应用。

| 效果类型 | 参数 | 说明 |
|---------|------|------|
| `yield_multiplier` | `resourceId?`, `value`, `regions?` | 指定资源产出倍率 |
| `yield_flat_bonus` | `resourceId?`, `value`, `regions?` | 指定资源固定加成 |
| `resource_capacity_bonus` | `value` | 资源携带上限增加 |
| `backpack_capacity_bonus` | `value` | 背包容量增加（可带更多物品） |
| （`expeditionEffects: []`） | — | 不影响产出，仅用于触发事件或剧情 |

---

## 二、探险准备界面

### 定位

独立视图（非弹窗），从主界面点击地图上的「探险出发口」后，整个画面切换到探险准备界面。

### 布局

```
┌─────────────────────────────────────────────────────────┐
│  ← 返回                      探险准备                   │
│                                                         │
│  ────────────────  时段区域选择  ────────────────        │
│                                                         │
│   当前选择: 第 1 / 2 时段  —  ☀️ 上午                    │
│   可选 1-3 个时段，至少选 1 个即可出发                    │
│                                                         │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐           │
│   │  时段 1   │   │  时段 2   │   │  时段 3   │          │
│   │  ☀️ 上午  │   │  🌤 下午  │   │  🌅 傍晚  │          │
│   │  🌲暗黑   │   │  (可跳过)  │   │  (可跳过)  │          │
│   │   森林   │   │          │   │          │          │
│   │  [点击修改]│   │          │   │          │          │
│   └──────────┘   └──────────┘   └──────────┘           │
│                                                         │
│   ──────────────  可选区域（点击选择）────────────       │
│                                                         │
│   ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐       │
│   │  🌲    │  │  🌾    │  │  ⛰️    │  │  🔒    │       │
│   │ 暗黑   │  │ 东部   │  │ 山脉   │  │ 古代   │       │
│   │ 森林   │  │ 平原   │  │ 隘口   │  │ 遗迹   │       │
│   │        │  │        │  │        │  │需:罗盘  │       │
│   └────────┘  └────────┘  └────────┘  └────────┘       │
│                                                         │
│   产出预览:  🪵 330   🍞 140   🌿 34                     │
│                                                         │
│  ────────────────  携带物品  ────────────────            │
│  背包容量: 6 / 10                                       │
│                                                         │
│   ☑ 🪓 伐木斧        容量 2  |  木材 ×1.5               │
│   ☑ 📦 补给箱        容量 2  |  背包容量 +2              │
│   ☑ 📿 护符          容量 1  |  草药 ×2.0               │
│   ☐ 🧭 罗盘          容量 3  |  解锁古代遗迹             │
│   ☐ 🗡️ 短剑          容量 2  |  战斗事件判定 +1          │
│   ☐ 🛡️ 护甲          容量 4  |  容量不足，无法勾选       │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  资源容量: 100            [清空全部]  [确认出发]  │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### 交互逻辑

所有操作为**点击**模式，桌面端和移动端统一。

---

**区域选择（顺序填充，支持 1-3 个时段）：**

```
初始状态: 三个时段栏位均为空，当前焦点在第 1 时段

1. 玩家点击可选区域卡片（如「暗黑森林」）
   → 填入第 1 时段栏位
   → 焦点自动推进到第 2 时段
   → 顶部提示更新: "当前选择: 第 1 / 2 时段 — ☀️ 上午"
   → 确认出发按钮亮起（至少 1 个时段即可出发）

2. 玩家可随时点击「确认出发」跳过剩余时段（仅带 1 个时段出发），
   或继续点击区域卡片填充第 2 时段……

3. 玩家再次点击可选区域卡片
   → 填入第 2 时段栏位
   → 焦点自动推进到第 3 时段
   → 顶部提示更新: "当前选择: 第 2 / 3 时段 — 🌤 下午"

4. 玩家可再次点击「确认出发」（仅带 2 个时段出发），
   或继续填充第 3 时段……

5. 玩家第三次点击可选区域卡片
   → 填入第 3 时段栏位
   → 三个时段全部填满，焦点解除
   → 顶部提示更新: "✓ 三个时段已选完"

6. 想修改某个时段？
   → 点击已填入的时段栏位（如时段 1）
   → 焦点切回该栏位，栏位高亮
   → 点击新的区域卡片 → 替换该栏位的选择
   → 焦点不变（不会自动推进，因为这是修改而非填充）

7. 三个栏位可以选同一个区域（如三天都选暗黑森林）

8. 已选时段必须连续（不允许时段 1 和 3 已选但时段 2 空着），
   内部自动 compact 存储时去除尾部空时段。
```

| 规则 | 说明 |
|------|------|
| 自动推进 | 只有从"空→填满"时才自动跳下一个空栏位；修改已有选择时不自动推进 |
| 已解锁判断 | 可选区域卡片根据当前已勾选的物品动态判定解锁状态 |
| 未解锁区域 | 卡片灰显 + 显示解锁条件文字（如"需携带: 罗盘"），点击无响应 |
| 产出预览 | 每次区域选择变化时实时更新，显示当前已选时段合计产出（不计容量截断） |
| 可选数量 | 支持 1-3 个时段，任意 ≥1 即可出发；存储时自动 compact（去除尾部空时段） |

---

**物品选择（勾选模式，单一列表）：**

```
物品列表直接展示仓库中所有已拥有的物品（ItemSystem.getOwnedItems()），
每行一个物品，左侧复选框勾选/取消。

1. 点击物品行（或复选框）
   ├─ 当前未勾选 + 容量足够 → 勾选，扣减背包可用容量
   ├─ 当前未勾选 + 容量不足 → 行灰显，不勾选，底部提示"背包容量不足"
   └─ 当前已勾选 → 取消勾选，归还容量

2. 容量计算
   背包已用 = Σ(已勾选物品的 capacityCost)
   背包可用 = 总容量 - 已用
   当某个未勾选物品的 capacityCost > 背包可用时，该行灰显不可勾选

3. 点击「清空全部」
   → 弹出确认弹窗："确定清空所有区域选择和物品勾选？"
   → 确认后：三个栏位清空（焦点回到时段 1）+ 所有物品取消勾选
```

| 规则 | 说明 |
|------|------|
| 物品列表来源 | `ItemSystem.getOwnedItems()` — 仓库中所有已拥有的物品 |
| 排序 | 已勾选的排在最前面，然后按 capacityCost 升序 |
| 每行信息 | 复选框 + 图标 + 物品名 + 容量占用 + 探险效果简述（如 `木材 ×1.5`） |
| 容量不足 | 行灰显，复选框不可点击，不遮挡不隐藏 |
| 区域解锁联动 | 勾选/取消物品后，立即重新判断所有区域的解锁状态 |

---

**出发校验：**

```
点击「确认出发」
  ├─ 没有任何栏位填充？ → 提示"请至少选择一个区域"，焦点跳到时段 1
  ├─ canStartExpedition() 校验：
  │   ├─ _compactRegions() 去除尾部空时段
  │   ├─ _hasGaps() 检查中间空隙（如时段 1 和 3 选了但时段 2 空着）→ 提示"时段选择必须连续"
  │   └─ 校验通过
  ├─ 出发资源消耗不足？ → 提示缺少的具体资源及数量
  └─ 校验通过 → 扣出发资源 → startExpedition() 存储 compacted 区域数组 → ItemSystem.markExpedition(勾选的实例ID列表) → 回到主界面
```
> 注意：物品使用实例 ID（`instanceId`），非物品 ID。标记火把等非 unique 物品每个实例独立勾选、独立消耗。

### 美术需求

| 素材 | 说明 |
|------|------|
| 探险准备界面背景 | 一张整体背景图 |
| 区域方框缩略图 | 每个区域一张小图，复用区域配置的 `image` 字段 |
| 栏位框 | 三个时段栏位的外框样式（美术可自由设计） |

不需要做完整的 2D 探险地图渲染。

---

## 三、双重容量系统

### 背包容量（管物品）

```
背包总容量 = 基础容量 + 物品加成 (backpack_capacity_bonus)

携带物品检查 = Σ(已放物品的 capacityCost) ≤ 背包总容量
```

基础容量由探险出发建筑决定（初始值在配置中定义，如 10）。

### 资源容量（管采集物）

```
资源总容量 = 基础资源容量 + 物品加成 (resource_capacity_bonus)

资源采集检查（逐个时段结算）:
  for 每个时段:
    计算本时段产出 → 尝试塞入资源池
    if 资源池总量 + 本时段产出 > 资源总容量:
      按产出顺序依次塞入，哪个资源先满就停哪个
      剩余塞不下的直接丢弃
```

### 资源截断逻辑：先采集先塞满

```
示例：资源容量 200，已采集 180

时段3结算产出：{ wood: 30, food: 20, herb: 5 }

处理顺序（按 baseYields 中定义的 key 顺序）:

wood: 180 + 30 = 210 > 200 → 
  只取 200 - 180 = 20 个木材，丢弃 10 个
  资源池已满（200/200），后续 food 和 herb 全部丢弃
  
结算弹窗提示：「资源容量已满！损失了 10 木材, 20 食物, 5 草药」
```

不是按比例截断，而是顺序填充——先采集的先进资源池，池子满了后面的全部丢弃。产出顺序按区域 `baseYields` 中资源 key 的 JSON 定义顺序。

---

## 四、产出计算

### 公式

```
总产出 = 空资源池

for 每个时段:
  区域 = 玩家为该时段选择的区域
  baseYield = 区域.baseYields[该时段名称]
  
  for 每个资源 in baseYield:
    实际产量 = baseYield[资源] × (1 + Σ物品的 yield_multiplier[该资源]) + Σ物品的 yield_flat_bonus[该资源]
    尝试放入资源池（按容量截断规则）

产出预览（出发前）:
  HUD 显示已选时段合计的预期产出（假设不超容量）
  getExpectedYields() 自动跳过 null 时段（未选择的时段），只对 compacted 区域数组计算
```

### 示例

```
选择:
  时段1 上午 → 暗黑森林  { wood: 120, food: 60, herb: 0 }
  时段2 下午 → 暗黑森林  { wood: 100, food: 80, herb: 2 }
  时段3 傍晚 → 古代遗迹  { wood:  0,  food:  0, herb: 15 }

携带物品:
  🪓 伐木斧: wood ×1.5
  📿 护符:   herb ×2.0

计算:
  wood: (120+100+0) × 1.5 = 330
  food: (60+80+0)   × 1.0 = 140
  herb: (0+2+15)    × 2.0 = 34

  总计: 330 + 140 + 34 = 504

  若资源容量 = 200:
    按顺序填充 → wood 330 只能取一部分，塞满 200 后 food 和 herb 全部丢弃
```

---

## 五、探险生命周期

探险的结算间隔复用全局 `TICK_INTERVAL`（与基地相同，40s），持续时段数由实际选择的时段数（`exp.regions.length`）决定：

```
global.json 中相关配置:
  TICK_INTERVAL   = 40         // 结算间隔秒数（探险和基地共用）
  PERIOD_NAMES = ['morning', 'afternoon', 'evening', 'night']

expedition_global.json:
  expeditionPeriods = 3        // 最大可选时段数（1-3），不直接用于完成检查
```

`onTick()` 使用 `exp.regions.length` 判断探险是否完成，而非 config 的 `expeditionPeriods`。

```
出发前
  │
  ▼
┌──────────────────────────────────────────────────────────┐
│              探险进行中（持续 exp.regions.length 个时段）   │
│                                                          │
│  每 TICK_INTERVAL(40s) 触发一次探险 tick：                  │
│                                                          │
│  ┌─ 时段 1 ───────────────────────────────────┐          │
│  │  tick 1 (40s)  → (探险事件检查 `[计划中]`)    │          │
│  │  tick 2 (80s)  → (探险事件检查 `[计划中]`)    │          │
│  │  tick 3 (120s) → 产出结算（时段末）           │          │
│  └────────────────────────────────────────────┘          │
│  ┌─ 时段 2 ───────────────────────────────────┐          │
│  │  tick 4 → tick 5 → tick 6 → 结算                     │
│  └────────────────────────────────────────────┘          │
│  ┌─ 时段 3 ───────────────────────────────────┐          │
│  │  （仅当 regions.length === 3 时存在）        │          │
│  │  tick 7 → tick 8 → tick 9 → 结算                     │
│  └────────────────────────────────────────────┘          │
│                                                          │
│  基地同时正常运行（时间不暂停）                              │
└──────────────────────────────────────────────────────────┘
  │
  ▼
队伍归来 → 总结算弹窗 → 资源写入 → 物品归还 → 完成
```

### 探险中的 HUD

基地 HUD 上方增加一条状态条：

```
🔍 队伍探索中  |  暗黑森林 → 暗黑森林  |  ████████░░░░  第 2/2 时段  |  下次结算: 32s
```

点击状态条 → 弹出探险详情面板（当前产出预览、已触发事件记录）。

HUD 的 `_refreshExpeditionStatus()` 使用 `state.regions.length`（而非 `expeditionPeriods`）计算进度。例如 2 个时段时显示 "第 2/2 时段"。

---

## 六、探险事件

探险事件**仅用于剧情叙事**，不修改产出数值。结构复用基地事件框架，`triggerConditions` 在基地三字段基础上额外增加 `regions` 和 `requiredCarriedItems` 两个字段。完整的事件触发条件模型、失效逻辑、效果系统、生命周期和与基地事件的差异对比，详见 `docs/event-system-design.md` 第一节。

`[注]` 当前实现中，探险事件的条件校验方法（`_checkExpeditionTriggerConditions`）已在 EventSystem 中定义，但 ExpeditionSystem.onTick() 尚未接入事件检查调用，探险事件实际不会在探险过程中触发。此功能计划在后续版本中启用。

### 配置示例

```json
{
  "id": "exp_story_lost_ruins",
  "name": "遗迹入口",
  "description": "罗盘剧烈震动，指向一座被藤蔓覆盖的石门。",
  "image": "event_ruins_entrance.png",
  "priority": 10,
  "cooldownTicks": 0,
  "maxTriggers": 1,

  "triggerConditions": {
    "timePeriods": ["night"],
    "requiredItems": [],
    "requiredBuildings": [],
    "regions": ["ancient_ruins"],
    "requiredCarriedItems": ["relic_compass"]
  },

  "probability": 1.0,
  "effects": [],
  "options": [
    {
      "text": "推开石门",
      "effects": [
        { "type": "obtain_item", "itemId": "item_ancient_key" },
        { "type": "add_resource", "resourceId": "gold", "amount": 300 }
      ]
    },
    {
      "text": "标记位置后离开",
      "effects": []
    }
  ]
}
```

事件中 `add_resource` 效果**不受资源容量限制**——事件获得的资源直接加入基地仓库，不走探险资源池。

---

## 七、区域解锁判断

### 判断时机

每次打开探险准备界面时动态判断：

```js
function isRegionUnlocked(regionConfig, playerState) {
  const conditions = regionConfig.unlockConditions;
  if (!conditions || conditions.length === 0) return true;  // 无条件 = 初始解锁
  
  return conditions.some(cond => {
    switch (cond.type) {
      case 'item':
        // 检查玩家背包中当前携带的物品
        return playerState.backpackItems.includes(cond.itemId);
      case 'building':
        // 检查基地中是否存在该建筑
        return playerState.buildings.includes(cond.buildingId);
      default:
        return false;
    }
  });
}
```

注意：`item` 条件检查的是**当前探险背包中携带的物品**，不是全局拥有。玩家必须把罗盘带在背包里（消耗容量）才能解锁区域——这是有代价的选择，罗盘占用了物品位，就不能带其他加成物品。

---

## 八、物品合成

合成绑定在工作站建筑上，不是独立系统。

### 建筑配置扩展

```json
{
  "id": "forge",
  "name": "锻造台",
  "footprint": { "width": 2, "height": 2 },
  "buildCost": [{ "resourceId": "iron", "amount": 100 }],
  "buildTime": 3,
  "synthesisRecipes": [
    {
      "id": "craft_relic_axe",
      "name": "锻造伐木斧",
      "inputs": [
        { "type": "item", "itemId": "relic_axe_blade", "count": 1 },
        { "type": "item", "itemId": "relic_handle", "count": 1 }
      ],
      "output": { "type": "item", "itemId": "relic_axe", "count": 1 },
      "resourceCost": [{ "resourceId": "iron", "amount": 50 }],
      "workTicks": 2
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `inputs` | 消耗的原料（物品），全部必须持有 |
| `output` | 产出物 |
| `resourceCost` | 额外消耗的资源 |
| `workTicks` | 合成所需 tick 数 |

### 交互

```
点击建筑 → 建筑详情弹窗 → 合成标签页
  ├─ 显示该建筑的所有配方列表
  ├─ 材料不足的配方灰显
  ├─ 点击可合成的配方 → 确认 → 扣材料 → 倒计时 → 完成
  └─ 配方逻辑在建筑弹出面板的渲染函数中，每个工作站独立
```

---

## 九、配置文件组织

```
config/
├── expeditions/
│   ├── regions.json               # 区域配置
│   └── expedition_global.json     # 探险全局参数
├── events/
│   ├── events_expedition.json     # 探险事件
│   └── ...
└── buildings.json                 # 建筑配置（含合成配方）
```

### 探险全局参数 (`expedition_global.json`)

```json
{
  "expeditionPeriods": 3,
  "baseBackpackCapacity": 10,
  "baseResourceCapacity": 100
}
```

| 参数 | 来源 | 说明 |
|------|------|------|
| `TICK_INTERVAL` | `global.json` | 结算间隔秒数（探险和基地共用） |
| `expeditionPeriods` | `expedition_global.json` | 最大可选时段数（1-3），决定 UI 栏位数量；实际持续时段数由 `exp.regions.length` 决定 |
| `baseBackpackCapacity` | `expedition_global.json` | 初始背包容量 |
| `baseResourceCapacity` | `expedition_global.json` | 初始资源容量 |

建筑升级或特定物品可增加两个基础容量。

### 地图入口配置 (`config/maps/base_map.json`)

探险入口不是建筑，而是地图上的固定设施。每个入口是一个 1×1 的格子，点击后打开探险准备面板，只显示该入口绑定的区域列表。

```json
"expeditionEntrances": [
  {
    "id": "forest_entrance",
    "name": "森林入口",
    "gridX": 20,
    "gridY": 18,
    "regionIds": ["forest", "dense_forest"]
  },
  {
    "id": "mine_entrance",
    "name": "矿洞入口",
    "gridX": 25,
    "gridY": 13,
    "regionIds": ["mine_periphery", "mine_interior", "coal_seam", "iron_ridge"]
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 入口唯一标识 |
| `name` | `string` | 入口显示名称 |
| `gridX` | `number` | 入口所在网格列 |
| `gridY` | `number` | 入口所在网格行 |
| `regionIds` | `string[]` | 该入口绑定的区域 ID 列表。空数组 = 显示全部已解锁区域 |

### 建筑配置补充 (`buildings.json`)

建筑配置除合成配方外，还包含以下关键字段：

#### 食物产出相关

`getTotalFoodProduction()` 计算：`config.foodCapacity * b.currentWorkers`（每个工人每天产出对应食物量）。食物在每天开始时（`dayStart`）统一结算，产出直接加入食物资源池。

```json
{
  "id": "farm",
  "name": "农场",
  "maxWorkers": 5,
  "foodCapacity": 7
}
```

```json
{
  "id": "hunting_hut",
  "name": "狩猎小屋",
  "maxWorkers": 1,
  "foodCapacity": 5
}
```

| 建筑 | foodCapacity | maxWorkers | 每日产出 |
|------|-------------|-----------|----------|
| 农场 | 7/工人/天 | 5 | 35 |
| 狩猎小屋 | 5/工人/天 | 1 | 5 |

> 食物每日消耗 = 当前人口数（每人 1/天）。若储量不足，差额人数因饥饿死亡。人口 < 2 时游戏结束。

#### 锯木厂工人配置

锯木厂现拥有工人，每个工人独立消耗资源生产木板：

```json
{
  "id": "lumber_mill",
  "name": "锯木厂",
  "maxWorkers": 2,
  "perWorker": true
}
```

每个工人每 tick 消耗 4 木材 → 生产 2 木板，独立计算。

#### 建筑地形限制

部分建筑有地形限制，使用 `allowedGrounds` 字段限定可建造的地面类型：

```json
{
  "id": "quarry",
  "name": "采石场",
  "allowedGrounds": ["R"]
}
```

```json
{
  "id": "farm",
  "name": "农场",
  "allowedGrounds": ["G"]
}
```

```json
{
  "id": "logging_camp",
  "name": "伐木营地",
  "allowedGrounds": ["F"]
}
```

| 建筑 | allowedGrounds | 含义 |
|------|---------------|------|
| 采石场 | `["R"]` | 仅限裸岩地格建造 |
| 农场 | `["G"]` | 仅限草场地格建造 |
| 伐木营地 | `["F"]` | 仅限森林边缘地格建造 |
| 其他建筑 | 不设置或无此字段 | 无地形限制 |

---

## 十、探险系统 API (ExpeditionSystem)

| 函数 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `getAvailableRegions(entranceRegionIds?)` | 区域ID数组(可选) | `[{region, unlocked, unlockHint}, ...]` | 所有区域及解锁状态；可选参数过滤为入口绑定的区域 |
| `isRegionUnlocked(regionId)` | 区域ID | `boolean` | 单个区域解锁判断 |
| `canStartExpedition(regions, instanceIds)` | 区域数组, 实例ID数组 | `{valid, reason}` | 出发前校验：含工人校验 |
| `getTotalWorkerCost(regionIds)` | 区域ID数组 | `number` | 计算所选区域的总工人消耗 |
| `startExpedition(regions, instanceIds)` | 区域数组, 实例ID数组 | `boolean` | 确认出发，扣减工人，锁定物品实例 |
| `getCurrentExpedition()` | — | `ExpeditionState \| null` | 当前探险状态 |
| `getExpectedYields(regions, instanceIds)` | 区域数组, 实例ID数组 | `{resourceId: amount}` | 预览预计产出（不计容量），自动跳过 null 条目 |
| `recallExpedition()` | — | `boolean` | 提前召回队伍 `[计划中]` |
| `completeExpedition()` | — | `ExpeditionResult` | 结算：消耗品自动 lose，非消耗品归还。tick 驱动 |

### ExpeditionState

```js
{
  status: 'preparing' | 'active' | 'returning' | 'completed',
  regions: ['dark_forest', 'dark_forest'],  // compacted 区域数组，长度 = 实际时段数（1-3）
  currentPeriodIndex: 1,       // 当前是第几个时段 (0-based)
  ticksInCurrentPeriod: 2,     // 当前时段内已经过几个 tick
  items: ['relic_axe_1', 'relic_charm_1'],  // 实例ID列表
  resourcePool: { wood: 150, food: 30, herb: 0 },  // 已采集资源
  totalDiscarded: { wood: 10, herb: 5 },            // 因容量不足丢弃的资源
  triggeredEvents: ['exp_story_01'],                 // 已触发事件记录
  yieldMultipliers: { wood: 1.5, herb: 2.0 },       // 累积倍率
  yieldFlatBonuses: {},                              // 固定加成
  occupiedWorkers: 5                                 // 探险占用的工人数
}
```

### ExpeditionResult

`completeExpedition()` 的返回值，供总结算弹窗使用：

```json
{
  "regions": ["dark_forest", "dark_forest"],
  "totalYielded": { "wood": 200, "food": 140 },
  "totalDiscarded": { "wood": 30 },
  "triggeredEvents": ["exp_story_01"],
  "returnedItems": ["relic_axe", "relic_charm"]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `regions` | `string[]` | compacted 区域数组，长度 = 实际时段数（1-3） |
| `totalYielded` | `object` | 实际获得的资源（已扣除容量截断） |
| `totalDiscarded` | `object` | 因容量不足丢弃的资源 |
| `triggeredEvents` | `string[]` | 途中触发的事件 ID 列表 |
| `returnedItems` | `string[]` | 带回来的物品 ID 列表 |

---

## 十一、与其它系统的关系

| 系统 | 交互方式 |
|------|---------|
| **ResourceSystem** | 出发时扣减消耗，归来时 add 采集资源 |
| **ItemSystem** | 出发时 `markExpedition(instanceIds)` 锁定物品（equipped → inExpedition），归来时 `returnFromExpedition(instanceIds)` — 消耗品自动 `lose()`，非消耗品清除标记；事件获得物品直接 `obtain` |
| **PopulationSystem** | 出发时 `occupyForExpedition(count)` 扣减可用工人，归来时 `releaseFromExpedition(count)` 归还；可用工人池 = 当前人口 - 建筑分配 - 探险占用 |
| **EventSystem** | 共用效果处理器注册表；探险事件走独立事件池 |
| **TimeSystem** | 订阅 tick 事件，推动探险进度 |
| **BuildingSystem** | 建筑等级影响基础容量；建筑解锁区域条件 |
| **PopupManager** | 探险准备面板、探险详情面板、探险事件弹窗 |

---

*本文档是对 `architecture-plan.md` 第 6 节（探险系统）的完整展开。*
