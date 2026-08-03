# 人口、探索、时代指引与山体视觉验收报告（2026-08-04）

## 交付结论

本轮修复消除了前期缺粮导致人口永久流失的死循环，并补齐了可重复建造的大本营、基于探索营地的洞穴入口、完整的时代晋升条件面板，以及由独立梯形岩块组成的新山体视觉。所有改动均位于当前主项目目录，没有写入 Early Assess 或文档交付目录。

## 已完成内容

### 1. 食物短缺不再删除人口

- 连续缺粮不再触发工人逃离、饿死或人口归零失败。
- 已招募人口会保留；食物仍会被消耗至零。
- 缺粮仍降低满意度、累计饥饿天数并停止自然增长，因此食物依然重要，但不会造成无法恢复的前期崩盘。
- 战斗、事件等与缺粮无关的直接伤亡逻辑不在本次删除范围内。

### 2. 大本营可以重复建造

- `warehouse` 继续作为初始大本营，同时取消单建筑数量上限。
- 第二座及后续大本营仍需满足资源、占地和全局建筑上限等通用规则。
- 为避开并行进程正在修改的建筑总表，本轮使用独立运行时覆盖配置合并该规则。

### 3. 洞穴改为探索营地入口

- 新增行政建筑“探索营地”，只能精确建造在洞穴入口格上。
- 洞穴探索不再要求道路相邻或提前铺路。
- 裸洞穴不能直接探索；探索营地建成后，点击入口格或建筑详情中的“开始探索洞穴”即可进入探险准备。
- 教程任务已明确写出“建造菜单 → 探索营地 → 覆盖洞穴入口 → 点击营地探索”，并明确说明不需要道路。
- 新增探索营地地图图像与 64×64 矢量图标。

### 4. 时代晋升条件完整可见

- 时代与文明面板固定显示进入下一时代所需的文明选择、科技完成率、人文完成率和时代星。
- 每项同时显示当前值、目标值和完成状态。
- 面板列出六类时代星来源及具体奖励，不再只把单一失败原因放在禁用按钮提示中。

### 5. 山体改为独立岩块堆

- 删除山体由边缘到中心渐变的等高线式色带计算。
- 山麓每格绘制 1–2 块岩石，山脊每格绘制 2–3 块岩石；大型山群由相邻方格中的数十块独立岩石组成。
- 岩石由梯形顶面、倾斜正面、深色侧面及可选风化裂纹构成，不使用放大写实山贴图。
- 提供多种灰、褐、砂岩颜色和 `slab`、`block`、`wedge`、`weathered` 四类轮廓。
- 岩块布局由地图坐标确定，同一存档重载后外观稳定，不会每帧或每次打开随机跳变。

## 自动化与视觉验收

- Node 完整测试：264/264 通过。
- JavaScript 语法检查：387 个文件通过。
- Chromium 新游戏冒烟：1/1 通过，覆盖时代条件、探索营地、洞穴入口、建筑详情、经济、军队与地图山体渲染。
- 山体模型测试覆盖：非山地零岩块、山麓/山脊密度、坐标确定性、格内边界、轮廓与颜色差异。
- 视觉证据：`test-results/qa-mountain-rock-piles.png`、`test-results/qa-era-advancement-guidance.png`、`test-results/qa-exploration-camp.png`（测试输出目录，不纳入版本控制）。

## 关键文件

- `src/systems/PopulationSystem.js`
- `config/building-runtime-overrides.json`
- `config/exploration-buildings.json`
- `src/systems/BuildingSystem.js`
- `src/systems/EraSystem.js`
- `src/rendering/MapPresentation.js`
- `src/rendering/MapRenderer.js`
- `src/ui/panels/building-detail-panel.js`
- `src/ui/panels/era-civilization-panel.js`
- `assets/buildings/exploration_camp.png`
- `assets/historical-icons/buildings/exploration_camp.svg`

## 美术工具与处理

探索营地图像按 `assetify` 技能规范生成与透明化，技能位置为 `E:\SKILLS\游戏图标\assetify\SKILL.md`。山体没有使用生成式大图，而采用运行时矢量多边形绘制，以满足大地图纯方格和独立岩块组合的要求。

## 并行工作保护

本轮没有改写或纳入并行进程负责的 `config/historical_content.json`、`assets/map/generated/`、`tmp/`，也不会提交其他未归属于本轮的脏配置。探索营地和大本营规则使用独立配置文件，避免覆盖并行修改中的 `config/buildings.json`。
