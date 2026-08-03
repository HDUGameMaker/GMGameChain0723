# P0 军团与存档可靠性设计

**日期：** 2026-08-03  
**状态：** 已确认执行  
**范围：** 仅 `GM GameChain2026\GM GameChain2026` 主仓

## 1. 目标

先消除会破坏长局与旧存档的军团状态分叉，再为后续 500 天压力测试建立可信基线。

本批完成后必须保证：

- v7 旧军团的单位编制和预备队迁移到 v8 后不丢失。
- `ArmySystem` 是军团与预备队的唯一写入者，Store 只保留 UI 订阅镜像。
- 入侵、殖民占领、敌对据点清剿与单位复归都通过 `ArmySystem` 公共 API 结算。
- “迁移 → 恢复 → 战损/复归 → 保存 → 再恢复”的状态保持一致。
- 不改变既有数值规则、战斗公式、人口损失规则或 UI 表现。

## 2. 方案选择

### 方案 A：先修状态所有权与迁移，再建长局压力测试（采用）

优点是先修复已证实的数据丢失路径，后续 500 天模拟不会把错误状态当成正确基线。改动集中在军团边界和存档规范化，容易用测试封闭验证。

### 方案 B：先做通用 500 天模拟器

能较快发现更多异常，但当前军团双写会让压力测试产生噪声，甚至在错误模型上建立断言，因此不采用为第一步。

### 方案 C：先做图片懒加载与格式压缩

能改善首次加载，但不解决存档丢兵和战损被覆盖这一发布阻断风险；作为独立的下一项 P0，不与本批混合。

## 3. 架构与组件

### 3.1 ArmySystem 公共写入接口

在现有编成、预备队和 `applyAttrition()` 基础上增加小而明确的原子接口：

- `replaceArmyUnits(armyId, unitIds, reason)`：校验军团和单位 ID 后替换编制并统一通知。
- `removeArmyUnits(armyId, unitIds, reason)`：按多重集合精确移除指定单位，返回实际移除列表。
- `consumeReservePower(amount, context)`：按既有“低战力单位优先”规则从预备队消耗，返回消耗单位与实际战力。
- `addReserveUnits(unitIds, reason)`：批量复归单位到预备队。

所有接口只修改 ArmySystem 内部状态，并由 `_notify()` 一次性更新 Store 镜像和 `armyChanged` 事件。调用方不得再写 `store.armies`、`store.availableUnits` 或自行递增 `armyVersion`。

### 3.2 旧系统接线

- `InvasionSystem.setSystems()` 注入 `army` 与 `population`，读取军团使用 `army.getArmy/getArmies`，战损和复归使用公共写入接口。
- `ColonySystem.setSystems()` 增加 `army`，预览读取装饰后的军团快照，占领损失通过 `removeArmyUnits()`。
- `EnemyExpansionSystem` 增加 ArmySystem 引用；总预备队战力和清剿消耗从 ArmySystem 获取/提交。
- `main.js` 只负责注入依赖，不承载军团规则。

人口死亡与复归仍由现有 PopulationSystem 规则处理，本批不重写人口模型；但调用优先使用已注入引用，移除新增路径对 `window.__game` 的依赖。

### 3.3 v7→v8 规范化

`SaveManager` 在 v8 默认处理阶段生成唯一的 `armyState`：

- 接受当前 `armyState`。
- 接受旧顶层 `armies` 与 `availableUnits`。
- 将旧 `armies[].units` 的 `{ unitId, count }` 展开为 `unitIds[]`。
- 保留已经是 `unitIds[]` 的编制。
- `availableUnits` 接受对象；若旧数据为数组条目，则按 `unitId/id + count` 归并。
- 计算安全的 `nextId`，保留 `battleHistory`；不修改输入对象。
- 同步输出兼容顶层 `armies/availableUnits`，但运行时恢复和新存档以 `armyState` 为权威。

未知或畸形条目被忽略；合法的零预备队计数保持为零。具体单位 ID 是否仍存在由 ArmySystem 恢复时根据当前配置过滤。

## 4. 数据流

```text
入侵 / 殖民 / 清剿
        ↓ 公共命令
    ArmySystem（唯一写入）
        ↓ _notify
Store 只读镜像 + armyChanged
        ↓
      UI / Renderer

v5/v6/v7/v8 原始存档
        ↓ SaveManager.migrate + normalizeArmyState
     v8 armyState
        ↓ ArmySystem.restoreState
     运行时权威状态
        ↓ Game.saveGame
     v8 armyState
```

## 5. 错误处理与不变量

- 未知军团、无效数量、未知单位或移除数量不足时，公共接口返回 `{ ok: false, reason }`，不做部分修改。
- 批量移除按重复 ID 计数，避免同兵种多单位时误删。
- 任何成功军团写入只发出一次版本更新。
- 军团编制与预备队不能因 Store 外部修改而变化。
- round-trip 后军团 ID、名称、单位顺序、士气、补给、阵型、英雄、位置、预备队和待复归单位保持一致。

## 6. 测试设计

先补失败测试，再写实现：

1. v7 `{ units: [{unitId,count}] }` 迁移后展开为完整 `unitIds`，对象形态预备队不被清空。
2. 迁移结果进入真实 `ArmySystem.restoreState()` 后再 `getState()`，编制仍一致。
3. Store 中伪造军团修改不能改变 ArmySystem 权威状态。
4. 入侵胜/平/负分别通过 ArmySystem 写回伤亡；后续 `getState()` 与 Store 镜像一致。
5. 殖民占领损失写回 ArmySystem，保存恢复后不会“复活”。
6. 敌对扩张消耗预备队后，ArmySystem 和保存状态一致。
7. 到期复归通过 `addReserveUnits()` 回到权威预备队并可保存。
8. 全量 `npm.cmd run verify` 回归通过。

Playwright 当前因本机缺少项目默认 Chromium 二进制而不能作为本批阻断门；不向主仓外安装浏览器。浏览器依赖策略放入后续验证门子项目。

## 7. 非目标

- 不实现完整 500 天模拟器；本批只建立它依赖的可靠状态基础。
- 不修改战斗数值、入侵概率、殖民收益或单位平衡。
- 不重构 MapRenderer 的全部历史耦合。
- 不改图片格式、加载策略或 UI 布局。
- 不清理或提交工作区中已有的 0.8 美术/音乐收尾改动。

## 8. 完成标准

- 新增测试能在旧实现上明确失败，并在修复后通过。
- 三个旧系统不再直接写 `armies` 或 `availableUnits` Store 键。
- v7 军团迁移经过真实 ArmySystem round-trip 后零丢失。
- 相关定向测试与全量 108+ 新增测试全部通过，语法检查通过。
