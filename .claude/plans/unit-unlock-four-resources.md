# 兵种解锁改用四物资（解锁 + 训练）实现计划

## 背景与现状

玩法重设计已把资源砍到 4 种（wood/stone/food/gold），建筑树/炼金树均用四物资解锁节点。但**兵种体系仍是旧的灵感+科技树机制，且三重死锁**：

1. **研发用灵感**（`TechSystem.researchUnit` 扣 `store.inspiration`），但产出灵感的酒馆建筑已不在 9 建筑清单内 → 灵感实际无来源。
2. **研发依赖 `prerequisiteTechs`**（smelting/firearm/aeronautics…），这些科技来自已休眠的科技树（UI 已隐藏，永远研究不到）→ 依赖它们的兵种永远研发不了。
3. **训练 `cost` 全是已砍资源**（iron_ingot/gear/steel/machine_part/electronic_part/plank/fur/coal），只有 warrior（wood+food）能训练。

结果：**目前仅 warrior 可用**，其余 14 个兵种全是死锁。

## 目标

把兵种解锁（研发）与训练都改为四物资，彻底打通兵种体系，与建筑树/炼金树的四物资模式一致。

## 关键决策（已与用户确认）

1. **解锁 + 训练都改四物资**（只改解锁则研发出来的兵种仍训练不了）。
2. **沿用现有 `unit-research-panel`**（按兵种分支分组，仅成本显示从「💡灵感N」换成四物资），不新建 SVG 树。
3. **移除科技前置**：研发只检查兵种链（`prerequisiteUnits`）+ 四物资；`prerequisiteTechs` 配置保留休眠，逻辑跳过。

## 数据模型（`config/enemies.json` 改 `units`）

每个非 warrior 兵种：
- **新增 `unlockCost`**：四物资数组 `[{resourceId,amount}]`（一次性解锁成本）。旧 `researchCost`（灵感数值）**保留不动**（休眠），逻辑不再读它。
- **改写 `cost`**（训练成本）：从已砍资源改为四物资数组。
- `prerequisiteTechs`：保留字段不动（休眠），逻辑跳过。
- `prerequisiteUnits`：保留（兵种链树形递进）。
- `unlocked`：仅 warrior 保持 `true`（自动解锁）。

### 数值初值表（config 化，待游玩微调）

按 tier 递增 + branch 资源偏好（步兵/骑兵偏 food，炮兵偏 stone+gold，海军偏 wood）。格式：解锁(木/石/食/金) | 训练(木/石/食/金)。

| id | tier | branch | unlockCost | 训练 cost |
|---|---|---|---|---|
| warrior | 0 | infantry | 自动解锁 | 10/0/10/0（不动） |
| swordsman | 1 | infantry | 25/15/20/10 | 15/5/20/0 |
| musketeer | 2 | infantry | 40/30/35/25 | 20/10/30/10 |
| modern_infantry | 3 | infantry | 60/50/55/45 | 30/20/45/20 |
| knight | 1 | cavalry | 25/15/20/10 | 10/10/25/0 |
| armored_cavalry | 2 | cavalry | 40/30/35/25 | 15/20/35/10 |
| biplane | 3 | cavalry | 60/50/55/45 | 25/25/45/25 |
| jet_fighter | 4 | cavalry | 90/80/80/70 | 40/40/60/40 |
| cannon | 1 | artillery | 25/15/20/10 | 5/25/15/10 |
| tank | 2 | artillery | 40/30/35/25 | 15/35/30/20 |
| rocket_artillery | 3 | artillery | 60/50/55/45 | 25/50/40/35 |
| raft | 1 | navy | 25/15/20/10 | 20/0/10/0 |
| sailing_ship | 2 | navy | 40/30/35/25 | 30/5/25/10 |
| battleship | 3 | navy | 60/50/55/45 | 30/40/40/30 |
| missile_destroyer | 4 | navy | 90/80/80/70 | 40/55/55/50 |

## TechSystem.js 改动（`src/systems/TechSystem.js`）

### `canResearchUnit(unitId)`
- 移除 `prerequisiteTechs` 检查（删 142-145 行那段循环）。
- 移除灵感检查（删 150-152 行 `inspiration < cost`），改为：
  ```js
  const unlockCost = Array.isArray(unit.unlockCost) ? unit.unlockCost : [];
  if (unlockCost.length && this._resourceSystem && !this._resourceSystem.canAfford(unlockCost)) {
    return { valid: false, reason: '资源不足' };
  }
  ```
- 保留：未研发检查、`prerequisiteUnits` 兵种链检查。

### `researchUnit(unitId)`
- 消耗从扣灵感改为扣四物资：
  ```js
  const unlockCost = Array.isArray(unit?.unlockCost) ? unit.unlockCost : [];
  if (unlockCost.length && this._resourceSystem) this._resourceSystem.consumeAll(unlockCost);
  this._unitResearch.add(unitId);
  ```
- 删除 `store.setState({ inspiration: ... })` 那行。
- emit `unitResearched` / `combatBroadcast` 不变。

### `_ensureBaseUnitResearch()`
- 改为只认 `unlocked === true`（去掉 `|| unit.researchCost === 0`，因 `researchCost` 现休眠为数组/数值，避免误判）：
  ```js
  if (unit.unlocked === true) this._unitResearch.add(unit.id);
  ```

**接线**：`main.js:196` 已有 `tech.setResourceSystem`，`_resourceSystem` 可用，无需新接线。

## unit-research-panel.js 改动（`src/ui/panels/unit-research-panel.js`）

### 资源系统获取
- 顶部加 `_resource() { return window.__game?.systems?.resource; }`（与 `training-panel` 同款，零接线改动）。

### 顶部灵感栏
- `<div>💡 灵感: N</div>` → 改为「已解锁 X / 总数 Y」计数（X=`researched.length`，Y=`units.length`）。去掉 `_inspiration()` 用法。

### `_renderCost(cost)` 重写
- 从 `'💡 ' + cost` 改为四物资显示（参照 `building-tree-panel` 的 `costStr`）：
  ```js
  function _renderCost(unlockCost) {
    return (unlockCost || []).map(c => {
      const r = configRegistry.getResource(c.resourceId);
      return (r ? r.name : c.resourceId) + ' ' + c.amount;
    }).join(' · ');
  }
  ```

### 卡片
- **去掉「前置科技」行**（`prereq` div，显示 `prerequisiteTechs`）：整段删除。兵种链行（`unitPrereq`）保留。
- **成本行**：`cost.textContent = _renderCost(unit.unlockCost)`，颜色按 `canAfford` 判断（够=`#4ecb71` 绿，不够=`#f0a040` 橙）。
- **按钮文案逻辑**：
  ```js
  const canAfford = _resource()?.canAfford(unit.unlockCost || []) ?? false;
  btn.textContent = done ? '已完成'
    : (missingUnits.length ? '前置兵种未研发'
       : (canAfford ? '研发' : '资源不足'));
  ```
- `canClick` 判定改用 `!done && check.valid`（`check` 已含资源判定）。
- 点击失败提示：`pm.alert(check.reason || '暂不可研发')`（reason 现为「资源不足」等）。

## training-panel.js / army-panel.js / building-detail-panel.js

**零改动**：
- `training-panel` 读 `u.cost`（训练成本），config 改了自动显示新四物资成本；`_isUnitUnlocked` 逻辑不变。
- `army-panel` 的 `_isUnitUnlocked` 用 `isUnitUnlockedByTech`（bool，签名不变）。
- `building-detail-panel` 仅查询 `isUnitUnlockedByTech('warrior'/'swordsman')`（bool，不变）。

## main.js

- **无接线改动**（`tech.setResourceSystem` 已在 :196）。
- **存档**：`inspiration` 字段保留（休眠，doctrine/军理系统仍引用，不在本计划范围）。`_unitResearch` 仍是 `Set<id>`，结构未变 → **不 bump 存档 version**（沿用「取消建造时间」先例：结构未变不 bump）。旧存档读档：已研发兵种仍标记已研发，未研发者走新 `unlockCost`，安全。

## 文件清单

| 文件 | 操作 |
|---|---|
| `config/enemies.json` | 14 个兵种新增 `unlockCost`（四物资）+ 改写 `cost`（四物资）；`prerequisiteTechs`/`researchCost` 保留休眠 |
| `src/systems/TechSystem.js` | `canResearchUnit`/`researchUnit`/`_ensureBaseUnitResearch` 去灵感去科技前置、改四物资 |
| `src/ui/panels/unit-research-panel.js` | 顶部灵感栏→计数、`_renderCost` 改四物资、去前置科技行、按钮文案 |
| `src/ui/panels/training-panel.js` | 零改动（自动生效） |
| `src/main.js` | 零改动（接线已就绪，不 bump version） |

## 验证

1. 新局：`unit-research-panel` 顶部显示「已解锁 1 / 15」，warrior 已解锁，其余 14 个显示四物资 unlockCost + 兵种链前置。
2. 解锁一个 T1 兵种（如 swordsman，前置 warrior 已自动解锁）：扣四物资、节点变「已完成」、`unitResearched` 事件触发。
3. 资源不足时按钮显示「资源不足」、点击弹 alert。
4. 兵种链前置：解锁 musketeer 前需先解锁 swordsman（missingUnits 提示）。
5. 训练面板：已解锁兵种显示新四物资训练 cost，能训练（扣四物资、占士兵名额）；未解锁兵种灰显「需在兵种研发中完成专项研发」。
6. 存读档：已解锁兵种正确恢复；旧存档（无 `unlockCost` 字段）不崩、走新成本。
7. 灵感字段不影响（doctrine 面板仍可打开，本计划不动其逻辑）。

## 风险 / 待定

- **数值均为初值**，需游玩微调（解锁成本 vs 训练成本 vs 产出节奏 vs 敌人强度曲线）——全部 config 化。
- doctrine/军理系统仍用灵感（无来源），属另一套休眠死锁，**本计划不处理**（用户只要求兵种解锁）。如后续要救活 doctrine，需另开酒馆/灵感来源，不在本范围。
- `prerequisiteTechs` 字段保留休眠不读，若将来重启科技树需重新接入前置检查。

## 收尾

实现完成后更新 memory `gameplay-redesign-execution.md`：追加「兵种解锁改四物资」段落（解锁 unlockCost + 训练 cost 四物资 + 移除科技前置 + 灵感/doctrine 仍休眠 + 不 bump version）。
