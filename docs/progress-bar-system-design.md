# 进度条系统设计

## 概述
统一的进度条管理系统，覆盖游戏内所有进度显示场景。由单一 `requestAnimationFrame` 循环驱动，利用 `TimeSystem` 的 `timeProgress`（0→1 连续值）在 tick 之间做平滑插值，确保所有进度条匀速移动。

## 架构

```
TimeSystem.elapsedInTick  ──→  store.timeProgress (0→1, 每帧更新)
                                      │
                                      ▼
ProgressManager._loop()  ←── 单一 rAF 循环，读取 timeProgress
        │
        ├── DOM 模式: element.style.width = smooth × 100%
        │      用于 HUD、弹窗面板
        │
        └── 回调模式: redraw(smooth)
               用于 PIXI.Graphics（地图上的进度条）
```

## 文件

| 文件 | 职责 |
|------|------|
| `src/utils/ProgressManager.js` | 核心管理器，单例 |
| `src/ui/HUD.js` | HUD tick 进度条、探险状态栏进度条 |
| `src/ui/panels/building-detail-panel.js` | 建造进度条、合成进度条 |
| `src/ui/panels/expedition-detail-panel.js` | 探险总进度、时段tick进度 |
| `src/rendering/MapRenderer.js` | 地图上 PIXI 建造进度条 |
| `index.html` | 进度条 CSS 样式 |

## API

### ProgressManager（单例）

```js
import { progressManager } from '../utils/ProgressManager.js';
```

#### `progressManager.registerDiscrete(element, getCurrent, getTotal, opts?)`
注册一个 DOM 进度条，自动在 tick 间平滑插值。

| 参数 | 类型 | 说明 |
|------|------|------|
| `element` | `HTMLElement` | 进度条填充元素（如 `div.progress-fill`） |
| `getCurrent` | `() => number` | 返回当前离散进度值（如当前tick数） |
| `getTotal` | `() => number` | 返回总进度值 |
| `opts.labelEl` | `HTMLElement` | 可选，文字标签元素 |
| `opts.formatLabel` | `(smooth: 0-1) => string` | 可选，标签格式化函数 |

返回：取消注册函数 `() => void`

#### `progressManager.registerCallback(getCurrent, getTotal, redraw, opts?)`
注册一个回调驱动的进度条（用于 PIXI/Canvas 等非 DOM 场景）。

| 参数 | 类型 | 说明 |
|------|------|------|
| `getCurrent` | `() => number` | 返回当前离散进度值 |
| `getTotal` | `() => number` | 返回总进度值 |
| `redraw` | `(smooth: 0-1) => void` | 每帧调用的重绘函数 |
| `opts.labelEl` | `HTMLElement` | 可选 |
| `opts.formatLabel` | `(smooth: 0-1) => string` | 可选 |

返回：取消注册函数；返回对象可设 `._removed = true` 标记移除

#### `progressManager.stop()`
停止循环（游戏重置时调用）。

### 注册的进度条一览

| 位置 | 模式 | 离散值 |
|------|------|--------|
| HUD 时间区 | DOM | `0 → 1`（timeProgress 直接映射） |
| HUD 探险栏 | DOM | `completedTicks / totalTicks` |
| 建筑详情-建造 | DOM | `buildProgress / buildTime` |
| 建筑详情-合成 | DOM | `synthProgress / synthTotal` |
| 探险详情-总进度 | DOM | `completedTicks / totalTicks` |
| 探险详情-时段 | DOM | `ticksInPeriod / 3` |
| 地图建造进度 | 回调 | `buildProgress / buildTime`（每帧重绘 PIXI.Graphics） |

## 插值公式

```
smooth = baseProgress + (nextProgress - baseProgress) × timeProgress

其中:
  baseProgress = currentTicks / totalTicks      (当前tick时刻的进度)
  nextProgress = (currentTicks + 1) / totalTicks (下一tick时刻的进度)
  timeProgress  = elapsedInTick / TICK_INTERVAL  (0→1, TimeSystem提供)
```

当 tick 刚触发时 `timeProgress ≈ 0`，进度条显示 `baseProgress`；
tick 即将结束时 `timeProgress ≈ 1`，进度条接近 `nextProgress`。

## CSS 样式

```css
.progress-bar       /* 容器: 圆角、半透明背景、h=6px */
.progress-fill      /* 填充: 渐变、圆角、transition */
  .green            /* 建造进度 */
  .blue             /* 探险进度 */
  .amber            /* 合成进度 */
  .cyan             /* tick进度 */
.tick-progress      /* HUD紧凑型 */
.build-progress     /* 建造面板型 */
```

## 地图进度条布局

地图上每个建筑有3个标签元素，默认位置：

```
┌──────────────┐
│              │
│   建筑名称    │  centerY - 10
│   ═══════    │  centerY + 4  (进度条)
│    3/5       │  进度条下方5px
│              │
│   👷2       │  bottom - 12
└──────────────┘
```

可通过建筑配置的 `labelLayout` 字段微调（见 `label-layout-config.md`）。
