# 弹窗系统设计方案

## 设计原则

**统一外壳 + 注册式面板渲染函数**。不使用 UI 框架（如 Preact/Vue/React），采用原生 DOM API 实现，保持零概念负债。

选择手写而非框架的原因：
- 弹窗内容区域的 DOM 节点量很小（几十个节点），无需虚拟 DOM diff
- 弹窗打开时游戏时间阻塞，不存在高频自动刷新
- 每次用户交互（点击物品、选择选项、返回）都是明确的一次性动作，直接在事件回调中更新 DOM 即可
- 新增面板的开发门槛降到最低：只需要会 `document.createElement` + `innerHTML` + `onclick`

---

## 核心模型

### 弹窗结构

```
┌─────────────────────────────────┐
│  [← 返回]    标题栏         [✕]  │  ← 固定外壳（chrome），由 PopupManager 统一管理
├─────────────────────────────────┤
│                                 │
│      动态内容区域（body）         │  ← 按面板类型切换，各渲染函数独立维护
│                                 │
├─────────────────────────────────┤
│         底部操作区（可选）         │
└─────────────────────────────────┘
```

### 导航栈

所有面板通过一个**导航栈（stack）**管理，支持前进和返回：

```
栈示例：仓库 → 物品详情

[{type: "warehouse"}]                           ← 初始状态，显示物品列表
[{type: "warehouse"}, {type: "item_detail", id: 3}]  ← 点击某物品，push 进详情
                                                    ← 点返回，pop 回 warehouse
```

```
栈示例：冒险出发点

[{type: "expedition_prep"}]                          ← 三时段区域选择 + 物品装备
[{type: "expedition_prep"}, {type: "item_detail", id: 5}]  ← 点击道具 push 详情
                                                           ← 返回 pop
```

```
栈示例：建筑 + 事件（同一套外壳，内容渲染不同）

[{type: "building_detail", buildingId: "forge"}]    ← 建筑详情（升级 / 合成 / 拆除）
[{type: "event", eventId: "flood"}]                 ← 事件面板（图片 + 文本 + 选项）
```

### 面板与类型的对应关系

| 类型标识 | 面板名称 | 导航方式 | 说明 |
|---------|---------|:--------:|------|
| `building_select` | 建筑选择 | 打开 | ✅ 已实现：已解锁建筑列表 + 资源消耗 + 占地面积 |
| `building_detail` | 建筑详情 | 打开 | ✅ 已实现：升级/合成/拆除、工人分配、建造进度 |
| `event` | 事件弹窗 | 打开 | ✅ 已实现：描述文本 + 选项按钮，由事件队列系统驱动 |
| `settings` | 设置 | 打开 | ✅ 已实现：存档状态、快捷操作说明、重置存档 |
| `expedition_prep` | 探险准备 | 打开 | ✅ 已实现：三时段区域选择 + 物品装备 + 出发 |
| `expedition_detail` | 探险详情 | 打开 | ✅ 已实现：当前产出预览、进度条、容量信息 |
| `warehouse` | 仓库 | 打开 | `[计划中]` 显示各资源/物品当前总量 |
| `item_detail` | 物品详情 | push | `[计划中]` 从仓库或冒险面板点击道具进入，可返回 |
| *(后续扩展)* | 新面板 | 按需 | 遵循同一模式注册即可 |

---

## 开发者指南：新增一个面板

### 需要做的事（共 4 步）

1. **创建面板渲染函数文件** — 放在约定目录下（如 `src/ui/panels/`）
2. **注册面板类型** — 1 行代码，将类型标识符与渲染函数绑定
3. **实现渲染逻辑** — 接收数据、往 body 容器填充 DOM、绑定交互事件
4. **在入口处调用** — 从建筑点击/菜单/事件系统调用 `open()` 或 `push()`

### 渲染函数规范

所有面板渲染函数遵循统一签名：

```
(data, bodyElement, popupManager) => void
```

| 参数 | 说明 |
|------|------|
| `data` | 外部传入的数据对象，由调用方定义结构（如 `{ buildingId: "forge" }`） |
| `bodyElement` | 干净的空白容器 DOM 元素，渲染函数往其中填充内容 |
| `popupManager` | PopupManager 实例引用，用于在面板内进行导航操作 |

### 导航 API

| 方法 | 用途 | 使用场景 |
|------|------|---------|
| `pm.open(type, data)` | 打开面板（清空栈，替换为新面板） | 从外部入口打开（建筑点击、菜单、事件触发） |
| `pm.push(type, data)` | 压入子面板（保留当前层，可返回） | 从面板内进入子详情页（如物品详情） |
| `pm.pop()` | 返回上一层 | 点击返回按钮，栈空则关闭弹窗 |
| `pm.close()` | 彻底关闭弹窗 | 事件选项执行后、Esc 键关闭 |

### 面板内局部刷新

面板内部如有动态变化（如点击锻造物品后在面板内显示所需材料），直接更新 body 内对应节点即可，无需通过导航栈：

```
// 在渲染函数内，通过闭包或 bodyElement.querySelector 找到目标节点
bodyElement.querySelector('#detail-area').innerHTML = '新的内容';
```

### 注意事项

1. **body 内的 class 命名建议加面板前缀**，避免不同面板间的样式冲突。如 `forge-list`、`forge-requirement`、`expedition-left`、`expedition-right`
2. **渲染函数是纯函数风格**，每次调用时 body 是干净的，不要依赖上一次渲染的残余 DOM
3. **数据从全局 store 读取**，渲染函数内部通过统一的游戏状态接口获取数据（如 `ResourceSystem.getAll()`），而不是通过 data 参数传递大量冗余数据
4. **交互回调中的导航**：面板内的按钮通过 `pm.push()` / `pm.pop()` / `pm.close()` 控制导航，不要在渲染函数外部直接操作弹窗 DOM
5. **关闭弹窗时游戏恢复运行**，`pm.close()` 内部会通知游戏主循环取消阻塞

### 新增面板检查清单

- [ ] 创建 `src/ui/panels/[panel-name]-panel.js`
- [ ] 在注册文件中添加 `popupManager.register('[type]', render[PanelName]Panel)`
- [ ] 渲染函数实现：body 填充、事件绑定、必要时调用 pm 导航
- [ ] 在对应入口（建筑点击/事件系统）调用 `pm.open()` 或 `pm.push()`
- [ ] 面板关闭后游戏状态是否正确恢复

---

## 与其他系统的关系

### 与游戏主循环

弹窗是否暂停全局时间，按面板类型区分：

| 弹窗类型 | 阻塞全局时间 | 说明 |
|---------|:--:|------|
| 基地事件弹窗 | ✅ | 事件选项执行前暂停 |
| 探险事件弹窗 | ✅ | 同上 |
| 探险准备弹窗 | ✅ | 出发前配置期间暂停 |
| 建筑选择弹窗 | ❌ | 不暂停，玩家可等待资源 |
| 建筑详情弹窗 | ❌ | 不暂停，调整人力/升级/合成期间基地继续运行 |
| 物品详情弹窗 | ❌ | 不暂停 |
| 仓库弹窗 | ❌ | 不暂停 |
| 探险详情弹窗 | ❌ | 不暂停 |

弹窗关闭时，若当前无其他阻塞弹窗，主循环恢复。PopupManager 通过 `pause()` / `resume()` 控制主循环。

`PopupManager.close()` 在调用 `resume()` 之前会通过 `eventBus.emit('popupClosed')` 发送关闭事件。`EventSystem` 监听此事件以驱动其事件队列继续处理——每次弹窗关闭后，事件队列推送下一条待处理事件。

`_isBlocking()` 方法的判定逻辑：优先检查导航栈栈顶面板的 `type`（`_stack[last].type`），若栈为空则回退到 `_currentType`。回退逻辑用于兼容 `_render()` 中通过 `push()` 打开子面板的场景——此时 `_show()` 先于 `_render()` 执行，而 `_render()` 才会设置 `_currentType`。此前该方法仅使用 `_currentType` 判断，在 `_show()` 执行时 `_currentType` 尚未更新，导致首次渲染时阻塞状态判断出错。修复后优先以栈顶 `type` 为准，`_currentType` 作为 fallback。阻塞类型列表（`BLOCKING_TYPES`）包含 `event` 和 `expedition_prep`。

### 与状态管理

- 面板渲染函数需要**读取**全局状态来展示数据（如 `ResourceSystem.getAll()` 渲染仓库列表）
- 面板内的用户操作**会触发全局状态修改**：
  - 事件面板选择选项 → 执行效果（资源增减、建筑解锁、物品获得等）
  - 建筑面板点击升级/生产 → 消耗资源、更新建筑状态
  - 冒险面板确认出发 → 锁定物品、扣减资源
- 状态修改统一通过各 System 的接口进行（如 `ResourceSystem.tryConsume()`、`BuildingSystem.upgrade()`），面板渲染函数不直接操作 Store 或原始数据对象
- 修改完成后，System 内部触发通知，相关面板和 HUD 自行刷新

### 与事件系统

- 事件触发时调用 `pm.open('event', eventData)`
- 事件面板渲染时，选项按钮的 onclick 直接执行该选项的 effects 列表：
  - 调用各效果处理器（add_resource / obtain_item / trigger_event 等）
  - 若含 trigger_event → 关闭当前弹窗 → 打开目标事件弹窗
  - 否则 → 记录冷却和触发次数 → pm.close()
- 事件弹窗与建筑弹窗共用同一个外壳和导航机制
- 事件队列系统（EventSystem）在外部触发事件时，将事件推入队列；监听 `popupClosed` 信号，在当前弹窗关闭后自动弹出队列中的下一个待处理事件

---

## UI 设计系统

### 设计令牌（CSS 变量）

所有弹窗及 UI 面板使用统一的 CSS 变量体系，定义在全局样式表中：

| CSS 变量 | 用途 | 示例值 |
|---------|------|--------|
| `--bg-deep` | 最深层背景（如 body） | `#0c0c1e` |
| `--bg-canvas` | 画布背景（如面板容器外层） | `#14142b` |
| `--bg-surface` | 表面背景（如面板容器） | `rgba(24, 24, 56, 0.85)` |
| `--bg-card` | 卡片背景（如选项卡片） | `rgba(32, 32, 64, 0.7)` |
| `--bg-card-hover` | 卡片悬停背景 | `rgba(40, 40, 78, 0.8)` |
| `--text-primary` | 主文字色 | `#ececf0` |
| `--text-secondary` | 次要文字色 | `#a0a0ba` |
| `--text-muted` | 弱化文字色 | `#6a6a82` |
| `--text-danger` | 危险/警示文字色 | `#ff6b6b` |
| `--text-warning` | 警告文字色 | `#ffb347` |
| `--accent-blue` | 蓝色强调色 | `#5b8def` |
| `--accent-amber` | 琥珀色强调色（警告/注意） | `#f0a040` |
| `--accent-green` | 绿色强调色（成功/确认） | `#4ecb71` |
| `--accent-cyan` | 青色强调色 | `#4ec9c1` |
| `--accent-purple` | 紫色强调色 | `#8b7cf0` |
| `--border-subtle` | 细微边框 | `rgba(255,255,255,0.06)` |
| `--border-normal` | 常规边框 | `rgba(255,255,255,0.1)` |
| `--border-glow` | 发光边框（交互反馈） | `rgba(91, 141, 239, 0.3)` |
| `--radius-sm` | 小圆角 | `8px` |
| `--radius-md` | 中圆角 | `12px` |
| `--radius-lg` | 大圆角 | `16px` |
| `--radius-xl` | 超大圆角 | `20px` |
| `--shadow-sm` | 小阴影 | `0 2px 8px rgba(0,0,0,0.3)` |
| `--shadow-md` | 中阴影 | `0 8px 32px rgba(0,0,0,0.4)` |
| `--shadow-lg` | 大阴影 | `0 20px 60px rgba(0,0,0,0.5)` |
| `--shadow-glow` | 发光阴影（交互反馈） | `0 0 20px rgba(91, 141, 239, 0.15)` |
| `--font-sans` | 无衬线字体栈 | `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif` |
| `--font-mono` | 等宽字体栈 | `'JetBrains Mono', 'SF Mono', 'Cascadia Code', 'Consolas', monospace` |

### Glassmorphism（毛玻璃效果）

弹窗遮罩层使用半透明深色背景（不使用 blur，保证顶部资源栏可读）；容器使用毛玻璃效果，通过 `backdrop-filter: blur()` 配合半透明深色背景实现：

```css
/* 遮罩层 — #popup-overlay（纯色半透明，无模糊，保证 HUD 资源栏可见） */
#popup-overlay {
  background: rgba(0, 0, 0, 0.65);
}

/* 弹窗容器 — #popup-container */
#popup-container {
  background: rgba(20, 20, 43, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-subtle);
}
```

遮罩层使用纯色半透明背景，确保顶部资源栏透过遮罩仍可读；容器模糊度较大（20px），产生强烈的毛玻璃质感，凸显前景内容。

### 字体栈

UI 文字优先使用 Inter 字体，同时对中日韩（CJK）字符做了针对性优化，保证中文字符在 Windows 和 macOS 上均有良好显示：

完整定义如下：

```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
```

- `Inter` — 西文数字、英文、UI 标签的主字体，几何感强、可读性好
- `-apple-system` / `BlinkMacSystemFont` — macOS/iOS 系统标准字体（San Francisco）
- `Segoe UI` — Windows 系统现代标准西文字体
- `PingFang SC` — macOS/iOS 系统苹方，中文字符渲染细腻
- `Microsoft YaHei` — Windows 系统微软雅黑，中文字符清晰

### 弹窗入场动画

弹窗打开时分为遮罩层和容器两层动画，使用 GSAP 库实现（`lib/gsap.min.js`）：

| 层级 | 属性 | 时长 | 缓动 |
|------|------|:----:|------|
| 遮罩层（overlay） | `opacity` 0 → 1 | 0.2s | `power2.out` |
| 容器（container） | `opacity` 0 → 1 + `scale` 0.92→1.0 + `y` 8→0 | 0.3s | `back.out(1.4)` |

```js
// PopupManager._show() 中的 GSAP 动画
gsap.fromTo(this.overlay,
  { opacity: 0 },
  { opacity: 1, duration: 0.2, ease: 'power2.out' }
);

gsap.fromTo(this.container,
  { scale: 0.92, opacity: 0, y: 8 },
  { scale: 1, opacity: 1, y: 0, duration: 0.3, ease: 'back.out(1.4)' }
);
```

- 遮罩层：`power2.out` 缓出，快速淡入后逐渐减速
- 容器：`back.out(1.4)` 缓动，缩放伴随轻微弹性回弹效果（overshoot），增强手感反馈
- 关闭动画：当前为瞬时关闭，无 GSAP 出场动画

### 事件面板 CSS 类

事件面板专属样式类，定义在全局样式表中，用于统一事件呈现的视觉风格：

| 类名 | 用途 |
|------|------|
| `.event-panel-header` | 顶部标题区域容器，居中布局 |
| `.event-panel-name` | 事件标题文字，粗体大号 |
| `.event-panel-divider` | 渐变分隔线（蓝→紫渐变） |
| `.event-description` | 事件描述文本块，`white-space: pre-line` 保留换行 |
| `.event-option-btn` | 选项按钮，预设 hover 发光效果和 `scale(0.98)` 按下反馈 |

```
┌──────────────────────────────────┐
│       .event-panel-header        │
│        .event-panel-name         │  ← 事件标题
│       .event-panel-divider       │  ← 渐变分隔线
├──────────────────────────────────┤
│       .event-description         │  ← 描述文本（白底半透明衬底）
├──────────────────────────────────┤
│    [.event-option-btn  选项 A]   │  ← 全宽按钮，hover 发光
│    [.event-option-btn  选项 B]   │
└──────────────────────────────────┘
```

按钮样式细节：全宽显示（`width: 100%`）、左对齐文字、`border-radius: var(--radius-md)`、悬停时 `border-color` 切换为 `--border-glow` 并增加 `--shadow-glow` 阴影，按下时 `transform: scale(0.98)` 微缩反馈。
