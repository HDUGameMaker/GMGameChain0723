> ⚠️ **部分内容已过时**(2026-08-06 审计):文中数值/结构可能已与当前 `config/` 和 `src/` 不符,引用前请对照代码验证。

# 存档系统设计方案

## 设计原则

1. **单存档位** — 一个玩家一份存档，自动保存，无手动存档选择
2. **全玩法状态持久化** — 建筑、资源、物品、探险、事件进度全部保存
3. **时段结算后保存** — 每个 tick 可能导致数据变化，但只在每个时段结束后写一次盘，避免高频 I/O
4. **重置即删除** — 设置界面提供重置按钮，清除存档后回到初始状态

---

## 一、存档时机

```
每个时间段结束（第 3 次 tick 结算完成后）
  │
  └─ → SaveManager.save(currentState)
```

| 条件 | 是否保存 |
|------|:--:|
| 每个 tick 结算后 | ❌ 不保存（太频繁，40s 一次会卡） |
| 每个时段结束后（120s） | ✅ 自动保存 |
| 弹窗关闭后 | ❌ 不单独保存（时段保存已覆盖） |
| 玩家关闭浏览器/标签页 | 浏览器 `beforeunload` 事件触发一次紧急保存 |

如果在时段中间关闭浏览器，最多丢失当前时段的数据（上一个时段结束时的存档完好）。

---

## 二、存储方案

使用浏览器 IndexedDB，通过 `SaveManager` 封装。对外暴露简单的 async 接口：

```js
// 保存
await SaveManager.save(gameState);

// 读取
const state = await SaveManager.load();
// 返回 null 表示没有存档（首次游戏）

// 删除（重置）
await SaveManager.reset();
```

内部实现：单条记录，key 固定为 `"currentSave"`，每次 save 覆盖写入。

---

## 三、存档数据结构

```json
{
  "version": 1,
  "timestamp": 1751558400000,
  "time": {
    "currentTick": 42,
    "tickInPeriod": 0,
    "periodIndex": 1,
    "day": 3,
    "elapsedInTick": 0.5
  },
  "population": {
    "current": 8,
    "declineCountdown": 0,
    "expeditionWorkers": 0
  },
  "resources": {
    "wood":       { "current": 150, "max": 5000 },
    "plank":      { "current": 30,  "max": 1000 },
    "stone":      { "current": 80,  "max": 5000 },
    "iron_ore":   { "current": 40,  "max": 1000 },
    "coal":       { "current": 20,  "max": 1000 },
    "iron_ingot": { "current": 10,  "max": 5000 }
  },
  "items": {
    "transporter":   { "instances": [{ "instanceId": "transporter_1",   "equipped": false, "inExpedition": false }] },
    "marking_torch": { "instances": [
      { "instanceId": "marking_torch_1", "equipped": false, "inExpedition": false },
      { "instanceId": "marking_torch_2", "equipped": true,  "inExpedition": false }
    ]}
  },
  "buildings": [
    {
      "buildingId": "work_shed",
      "gridX": 1,
      "gridY": 1,
      "status": "active",
      "currentWorkers": 0,
      "buildProgress": null
    },
    {
      "buildingId": "lumber_mill",
      "gridX": 3,
      "gridY": 1,
      "status": "constructing",
      "currentWorkers": 0,
      "buildProgress": 2
    }
  ],
  "expedition": null,
  "events": {
    "triggerCounts": {
      "story_stranger_arrives": 1,
      "shortage_wood": 2
    },
    "cooldowns": {
      "shortage_wood": 3
    }
  }
}
```

### 各字段说明

| 字段 | 来源 System | 说明 |
|------|-----------|------|
| `version` | SaveManager | 存档格式版本号，用于后续兼容迁移 |
| `timestamp` | SaveManager | 存档时间戳 |
| `time` | TimeSystem | 当前 tick、时段、天数 |
| `population` | PopulationSystem | `current` = 当前人口数；`declineCountdown` = 人口减少倒计时天数（0 = 未进入倒计时）；`expeditionWorkers` = 探险占用的工人数（从可用工人池扣减，探险结束后归还） |
| `resources` | ResourceSystem | 所有资源的 current 和 max（只存动态值，静态属性从配置读） |
| `items` | ItemSystem | 使用实例模型：每个物品 key 下存储 `instances` 数组，每个实例带 `instanceId` / `equipped` / `inExpedition` |
| `buildings` | BuildingSystem | 已放置建筑列表。`buildingId` 始终为最终形态，`status` 为 `constructing` 时 `buildProgress` 记录已过 tick 数 |
| `expedition` | ExpeditionSystem | `null` 表示无探险进行中；只在 `status === 'active'` 时保存 |
| `events` | EventSystem | 事件触发次数和冷却剩余 tick |

### 不存档的内容

以下内容在加载时从配置文件重新生成，不写入存档：

| 内容 | 原因 |
|------|------|
| 建筑/物品/资源/事件的静态属性 | 配置 JSON 已定义，存档只存动态值 |
| 地图网格和地面类型 | 不会因游戏进程改变 |
| 事件的条件和效果定义 | 配置 JSON 已定义 |
| 区域配置 | 配置 JSON 已定义 |

---

## 四、存档流程

### 保存

```
SaveManager.save(gameState)
  │
  ├─ 1. 从各 System 收集当前运行时状态
  │     TimeSystem.getState()
  │     ResourceSystem.getAll()
  │     ItemSystem.getAllStates()
  │     BuildingSystem.getAllStates()
  │     ExpeditionSystem.getCurrentExpedition()
  │     EventSystem.getSaveState()
  │
  ├─ 2. 组装存档对象，写入 version + timestamp
  │
  └─ 3. 写入 IndexedDB（覆盖旧存档）
```

### 加载

```
游戏启动（main.js）
  │
  ├─ 1. ConfigRegistry 加载所有配置 JSON
  │
  ├─ 2. SaveManager.load()
  │     ├─ 有存档 → 返回 gameState
  │     └─ 无存档 → 返回 null
  │
  ├─ 3. 有存档：
  │     ├─ 从存档初始化各 System（恢复 resources / items / buildings / time / events / expedition）
  │     └─ 进入主游戏界面
  │
  └─ 4. 无存档（首次游戏）：
        ├─ 读取 base_map.json 的 initialBuildings 放置初始建筑
        ├─ 初始化 resources 为配置中的初始值
        ├─ items 全部为未获得
        ├─ time 从第 0 tick、第 1 天 morning 开始
        └─ 进入主游戏界面
```

### 重置

```
玩家点击设置界面「重置存档」按钮
  │
  ├─ 弹出确认对话框：「确定要重置所有进度吗？此操作不可撤销。」
  │
  ├─ 确认：
  │     ├─ SaveManager.reset() — 删除 IndexedDB 中的存档
  │     ├─ 重新加载页面（或调用初始化流程回到首次游戏状态）
  │     └─ 弹窗关闭
  │
  └─ 取消：关闭确认对话框
```

---

## 五、版本兼容

当后续游戏更新导致存档结构变化时，通过 `version` 字段处理迁移：

```js
async function loadWithMigration() {
  const raw = await readFromIndexedDB();
  if (!raw) return null;

  let data = raw;
  if (data.version < 2) {
    data = migrateV1toV2(data);
  }
  // 后续版本迁移...
  return data;
}
```

初始版本 `version: 1`，后续每次破坏性变更递增版本号并添加迁移函数。

---

## 六、存档界面

设置弹窗中增加存档相关区域：

```
┌─────────────────────────┐
│  设置                    │
│                         │
│  存档状态：✅ 正常       │
│  上次保存：第 3 天 下午  │
│                         │
│  [重置存档]  (红色按钮)  │
│                         │
│  [关闭]                 │
└─────────────────────────┘
```

---

## 七、与各系统的接口

各 System 需实现以下方法供 SaveManager 调用：

| System | 需实现的方法 |
|------|------|
| TimeSystem | `getState()` → `{ currentTick, currentPeriod, day }` |
| | `restoreState(state)` — 从存档恢复 |
| PopulationSystem | `getState()` → `{ current, declineCountdown, expeditionWorkers }` |
| | `restoreState(state)` — 从存档恢复 |
| ResourceSystem | `getAll()` — 已有，返回所有资源的 current/max |
| | `restoreState(resources)` — 覆盖当前值 |
| ItemSystem | `getAllStates()` → 按物品 ID 分组的实例数组 |
| | `restoreState(items)` — 重建所有实例状态 |
| BuildingSystem | `getAllStates()` → `[{ buildingId, gridX, gridY, status, currentWorkers, ... }]` |
| | `restoreState(buildings)` — 重建建筑列表（可用工人从 population - 已分配工人推算） |
| ExpeditionSystem | `getCurrentExpedition()` → `ExpeditionState \| null` |
| | `restoreState(state)` — 从存档恢复探险进度 |
| EventSystem | `getSaveState()` → `{ triggerCounts, cooldowns }` |
| | `restoreState(state)` — 恢复触发记录和冷却 |
