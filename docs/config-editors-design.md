# 配置编辑器设计文档

## 概述

为策划和美术提供两个独立的可视化配置编辑器，替代直接编辑 JSON 文件。打开网页即可编辑，修改自动写回 `config/` 源文件，零手动操作。

**策划编辑器**：HTML 壳 + 8 个独立 JS 文件（`planner-config-*.js`），按功能模块拆分以减少维护时 token 消耗。
**美术编辑器**：独立单文件（`artist-config.html`）。

## 核心设计原则

1. **零手动导入导出** — 页面自动加载 JSON，修改自动写回源文件
2. **所见即所得** — 所有配置项用表单控件编辑，实时预览效果
3. **防呆校验** — 引用完整性、必填字段、数值范围，写入前自动检查
4. **零依赖零构建** — 纯 HTML/CSS/JS，与项目技术栈一致

## 数据读写机制

### 读（自动）
```
页面打开 → fetch('config/xxx.json') → 自动加载，无需任何操作
```

### 写（自动）
使用浏览器 **File System Access API**（Chrome/Edge 支持）：

```
首次使用 → 用户点击"选择 config 文件夹"（仅一次授权）
         → 浏览器获得该目录写入权限
         → 权限持久化（同一浏览器下次打开无需重新授权）
此后每次 → 编辑即自动保存，无需任何操作
```

### 保存策略
- **默认：修改即保存** — 表单字段变更后 debounce 1 秒自动写入文件
- 顶部状态指示：`已保存 ✓` / `保存中...` / `保存失败 ✗`
- 写入前自动校验，校验失败阻止写入并标红错误字段
- 可切换为手动保存模式

---

## 文件清单

```
项目根目录/
  planner-config.html          ← 策划配置编辑器 HTML 壳（CSS + 布局）
  planner/
    planner-config-core.js       ← 基础设施：State、File System Access API、数据加载/保存
    planner-config-render.js     ← 6 个 Tab 的表单渲染函数
    planner-config-map-draw.js   ← Canvas 地图绘制管线（地形/网格/建筑/预览）
    planner-config-map-edit.js   ← 地图交互工具（笔刷/填充/矩形/选区/撤销/建筑放置）
    planner-config-forms.js      ← 表单事件绑定、字段变更处理
    planner-config-actions.js    ← CRUD 增删改 + Tab 切换
    planner-config-analysis.js   ← 数值分析面板 + SVG 图表
    planner-config-main.js       ← DOM 事件监听 + 键盘快捷键（最后加载）
  artist-config.html           ← 美术配置编辑器（独立单文件）
```

### 依赖与加载顺序

```
planner-config.html
  ├─ planner/planner-config-core.js        ← 最先加载（含自执行 init IIFE）
  ├─ planner/planner-config-render.js      ← 依赖 core
  ├─ planner/planner-config-map-draw.js    ← 依赖 core
  ├─ planner/planner-config-map-edit.js    ← 依赖 core + map-draw
  ├─ planner/planner-config-forms.js       ← 依赖 core + render + map-edit
  ├─ planner/planner-config-actions.js     ← 依赖 core + render
  ├─ planner/planner-config-analysis.js    ← 依赖 core
  └─ planner/planner-config-main.js        ← 最后加载（依赖所有上述文件）
```

所有函数为全局函数（`<script src>` 而非 ES modules），保持向后兼容。修改某个功能区域时只需读取对应的 JS 文件。

## 通用 UI 布局（Dashboard 基底）

```
┌──────────────────────────────────────────────────────────┐
│  顶栏: 标题 | 保存状态 | [选择目录] [自动/手动保存]        │
├────────────┬─────────────────────────────────────────────┤
│ Tab 导航   │  编辑区                                      │
│ (竖排)     │                                             │
│            │  ┌─ 工具栏 ─────────────────────────────┐   │
│            │  │ [+新增] [复制] [删除] [搜索...]        │   │
│            │  └──────────────────────────────────────┘   │
│            │                                             │
│            │  ┌─ 左侧列表 ────┬─ 右侧表单详情 ─────────┐  │
│            │  │              │                        │  │
│            │  │              │                        │  │
│            │  └──────────────┴────────────────────────┘  │
├────────────┴─────────────────────────────────────────────┤
│  底部: 文件状态 | 错误/警告计数                            │
└──────────────────────────────────────────────────────────┘
```

---

## 一、策划配置编辑器（planner-config.html + 8 JS 文件）

### 目标用户
游戏策划（数值策划、系统策划）— 负责游戏数据配置，不直接写 JSON。

### Tab 模块

| Tab | 数据源 | 编辑内容 | 关键控件 |
|-----|--------|---------|---------|
| **建筑** | `config/buildings.json` | 增删建筑、编辑属性（名称/占地/消耗/产出/工人数/升级链/合成配方）、修改 labelLayout | 文本框、数字输入、下拉选择（引用资源ID）、嵌套数组编辑器（消耗/产出/配方）、开关 |
| **资源** | `config/resources.json` | 增删资源、名称、初始值、上限、HUD显示、稀有标记 | 文本框、数字、开关 |
| **物品** | `config/items.json` | 增删物品、唯一性/消耗品标记、容量消耗、expeditionEffects 配置 | 文本框、数字、开关、效果类型下拉 + 动态参数表单 |
| **事件** | `config/events/*.json` | 增删事件、触发条件（时段/建筑/物品/互斥组）、选项编辑、效果链编辑、trigger_event/schedule_event 引用 | 多选（时段）、引用选择（建筑/物品/事件ID）、效果类型下拉、事件节点连线图（SVG） |
| **探险** | `config/expeditions/*.json` | 区域产出矩阵（4时段 × N资源）、解锁条件、全局参数（周期数/容量） | 数字矩阵、条件编辑器（item OR building） |
| **地图** | `config/maps/base_map.json` | Canvas 交互式地图编辑器：笔刷绘制地形、点击放置/拖拽建筑、探险入口拖拽调整、缩放平移、视口裁剪 + 拖拽调整 | 地形调色板（点击选择笔刷颜色）、建筑下拉选择 + footprint 预览（绿/红）、探险入口拖拽手柄、滚轮缩放、中键平移、右下角拖拽调整视口（含角标提示）、键盘快捷键 B/V/E/R/F/X/S/Delete/Ctrl+0 |

### 地图编辑器（Canvas 笔刷模式）

地图 Tab 使用 **HTML5 Canvas 2D** 实现了交互式可视化地图编辑器，完全替代了旧版的 textarea 文本编辑方式。

**编辑模式（工具栏切换或键盘快捷键）：**

| 模式 | 快捷键 | 操作 |
|------|--------|------|
| 🖌️ 地形笔刷 | `B` | 左侧调色板选择地形颜色，点击/拖拽绘制地面格子 |
| 🏠 建筑放置 | `V` | 下拉选择建筑类型，点击放置（footprint 绿/红预览），拖拽移动，右键/Del 删除 |
| 🚪 探险入口 | `E` | 拖拽入口矩形移动/调整大小，四角手柄精确调整 |
| ◻ 矩形绘制 | `R` | 拖拽绘制矩形区域，批量设置地形 |
| ▦ 填充 | `F` | 点击区域，自动填充相同地形类型的连通区域 |
| 🧹 橡皮擦 | `X` | 擦除地形（还原为默认地形） |
| 🔲 选区移动 | `S` | 框选矩形区域剪切/移动，支持撤销 |

**视角控制：**
- 滚轮缩放（0.25× ~ 4×，以鼠标为中心）
- 中键拖拽平移
- `Ctrl+0` 重置缩放
- 画布右下角拖拽调整视口大小（格数对齐，双向同步左侧"视口列数/行数"输入框）
- 💡 右下角有 `↕↔` 角标 + 画布下方文字提示：**"地图区域右下角可拖拽调整视口大小"**
- 视口裁剪渲染：只绘制可见格子，支持 500×500+ 大地图

**数据同步：**
- Canvas 操作原地修改 `state.data.base_map` → `markDirty()` → 自动保存
- 探险入口数字输入框与 Canvas 双向同步
- 初始建筑子列表与 Canvas 双向同步

**渲染层（从底到顶）：**
1. 地形底色（含视口裁剪）
2. 网格线（半透明白色）
3. 建筑 footprint（普通建筑绿色 / 火把建筑带色辉光）
4. 探险入口（虚线矩形 + 拖拽手柄）
5. 光标悬停预览（笔刷高亮 / 建筑 footprint 绿红预览）

### 校验规则

| 规则 | 说明 |
|------|------|
| 引用完整性 | buildCost/resourceCost 中的 resourceId 必须在 resources.json 中存在；trigger_event/schedule_event 的 eventId 必须存在；synthesisRecipes 的 itemId 必须在 items.json 中存在 |
| 升级链闭环 | 检测 upgradesTo/upgradesFrom 形成环（A→B, B→A） |
| ID 唯一性 | 同一数组中 id 不可重复 |
| 必填字段 | id、name 不可为空 |
| 数值范围 | 占地 > 0、消耗/产出 amount > 0、概率 0-1 |
| 时段合法性 | triggerConditions.timePeriods 必须在 [morning, afternoon, evening, night] 内 |

---

## 二、美术配置编辑器（artist-config.html）

### 目标用户
游戏美术（UI 美术、场景美术）— 负责视觉相关配置。

### Tab 模块

| Tab | 数据源 | 编辑内容 | 关键控件 |
|-----|--------|---------|---------|
| **地图色板** | `config/maps/base_map.json` → `groundTypes` | 6 种地形颜色值 + 可建造属性 | `input[type=color]` + 下拉（buildable 状态）+ **迷你地图实时预览**（根据 grid 数据用色块绘制缩略地图，改色值后即时变色） |
| **标签布局** | `config/buildings.json` → `labelLayout` | 每栋建筑的 3 个偏移值（nameOffsetY / progressBarOffsetY / workersOffsetY） | 滑块 `range` + 数字输入 + **实时预览**（Canvas 绘制建筑框 + 文字位置，拖滑块时文字实时移动） |
| **素材引用** | `config/buildings.json` / `items.json` / `resources.json` → 图片字段 | 所有 `icon`、`imageDetail`、`image` 字段的路径编辑 | 文本框 + 缺失检测标记（fetch HEAD 检查文件是否存在，404 标红） |

### 美术特色交互

- **色板预览**：用 base_map.json 的 grid 数组（24×18）绘制缩略迷你地图，修改 groundTypes 颜色值时迷你地图实时刷新
- **标签布局预览**：Canvas 画建筑框 + 3 行文字（名称、进度条、工人），3 个 range 滑块拖动时文字位置实时移动，所见即所得
- **素材缺失检测**：自动对比 JSON 引用的图片路径 vs 服务器上实际存在的文件，缺失项标红并计数

---

## 通用功能

### 工具栏
- **[+新增]** — 弹出空表单，填写后添加到列表
- **[复制]** — 基于选中项创建副本（自动生成新 ID）
- **[删除]** — 确认弹窗后删除
- **[搜索]** — 按名称/ID 实时过滤列表

### 撤销/重做
- 操作级 undo/redo 栈
- 记录每次字段变更，支持 Ctrl+Z / Ctrl+Y

### 修改追踪
- 底部状态栏显示：`已修改 3 项 — 已自动保存 ✓`
- 未保存时顶部状态指示变为黄色

### 校验系统
- 编辑时实时校验当前字段
- 写入前全量校验当前 Tab 数据
- 校验失败时：红色边框标记错误字段 + 底部错误面板列出详情 + 阻止保存

---

## 技术实现

| 要点 | 方案 |
|------|------|
| 数据加载 | `fetch('config/xxx.json')` 自动加载 |
| 数据写入 | File System Access API — `FileSystemFileHandle.createWritable()` |
| 权限持久化 | IndexedDB 存储 `FileSystemDirectoryHandle` |
| 状态管理 | 深拷贝原始数据，编辑操作在副本上进行 |
| 脏检测 | `JSON.stringify(original) !== JSON.stringify(current)` |
| 校验 | 编辑时实时校验 + 写入前全量校验 |
| 图表 | 无（纯编辑器，不需要图表） |
| 外部依赖 | **零** — 纯 vanilla HTML/CSS/JS |
| 兼容性 | Chrome 86+ / Edge 86+（File System Access API 要求） |

---

## 工作流示意

```
┌─────────────────────────────────────────────────────┐
│                     首次使用                          │
│                                                     │
│  1. 浏览器打开 planner-config.html                   │
│  2. 点击顶部"选择 config 文件夹"                      │
│  3. 在系统弹窗中选择项目的 config/ 目录                │
│  4. 页面自动加载所有 JSON，开始编辑                    │
│  5. 修改建筑属性 → 1秒后自动写入 buildings.json        │
│                                                     │
├─────────────────────────────────────────────────────┤
│                     后续使用                          │
│                                                     │
│  1. 浏览器打开 planner-config.html                   │
│  2. 自动恢复目录权限，自动加载 JSON                   │
│  3. 编辑即自动保存                                    │
│                                                     │
├─────────────────────────────────────────────────────┤
│              策划/美术同时使用                          │
│                                                     │
│  - 两人各自打开不同的 HTML                            │
│  - 修改不同的 JSON 文件，互不冲突                      │
│  - 修改同一个 JSON 时后者覆盖前者（建议沟通协调）        │
└─────────────────────────────────────────────────────┘
```

---

## 与现有 Skill 的对应关系

```
dashboard 布局  → 左侧 Tab 导航 + 顶栏 + 底栏（两个界面的骨架）
原型交互       → 标签布局的滑块拖拽 + 实时预览
文档页        → （不直接使用，仅作为字段说明参考）
数据报告      → （不直接使用，纯编辑不需要图表）
```

## 更新日期
2026-07-25
