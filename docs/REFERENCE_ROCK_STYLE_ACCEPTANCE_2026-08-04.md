# 山体与采矿石块统一美术验收（2026-08-04）

## 结果

山体、裸露矿岩与石料采集点已经统一为用户参考图的暖灰褐色岩柱风格。游戏不再显示原有白色矿石、白色裸岩方格、卡片边框式石料节点或程序绘制的几何小石头。

## 美术资产

根据参考图生成一张 3×3 紧凑道具包：

- 六种高岩柱：宽阔岩顶、纵向岩面、浅色裂纹、深色轮廓、基部碎石。
- 三种低石堆：3–6 块同材质岩石和碎石构成，无白色切割方石、工具或标牌。
- 统一使用左上柔光、暖灰褐色调和 2.5D 俯视角。

原始生成图保存在 Codex 生成目录，项目只接收透明切格后的成品。最终处理参数为 3×3、384 单格、`fit-scale=0.88`、居中对齐、共享缩放、`threshold=205`、`edge-threshold=170`、`edge-clean-depth=6`；九格 `edge_touch_frames` 均为空。

## 运行时替换

- `assets/map/mountains/mountain_01.png` 至 `mountain_06.png`：山体 Sprite 变体。
- `assets/map/mountains/stone_cluster_01.png` 至 `stone_cluster_03.png`：采矿石堆变体。
- `assets/map/rock.png`、`rock1.png`、`stone.png`、`stone1.png`：保持固定地图旧路径兼容，但内容已经换成新石堆。
- `assets/resource-nodes/stone.png`：换成透明新石堆，不再包含蓝黑卡片背景和白色方石。
- 裸岩地形 `R` 的运行时底色由白色改为暖灰褐 `#756b5e`。

`getMountainRockSpriteModel()` 根据格子坐标稳定选择六个岩柱之一。山脊以完整格尺寸显示，山麓略缩小；重载或重绘不会随机跳变，所有 Sprite 均限定在所属格内。

## 验收证据

- 模型测试验证非山地不生成 Sprite、六种路径全部可选、坐标选择稳定、山麓/山脊尺寸区分且不越格。
- 裸岩测试验证即使配置仍写 `#dedede`，运行时也使用暖灰褐底色。
- Chromium 验收确认六张山体图、四张旧路径兼容图和石料资源节点图全部成功预加载。
- 视觉截图：`test-results/qa-mountain-rock-piles.png`，同时展示岩柱山群与低矮采矿石堆。
- Node 全量测试：265/265 通过。
- JavaScript 语法检查：387/387 个文件通过。
- Chromium 新游戏冒烟：1/1 通过。

## 工具与并行保护

素材使用 `E:\SKILLS\游戏图标\generate2dsprite\SKILL.md` 规定的图像生成和后处理流程。未修改或暂存并行进程负责的 `config/historical_content.json`、`assets/map/generated/`、`tmp/` 和其他脏配置。
