> ⚠️ **部分内容已过时**(2026-08-06 审计):文中数值/结构可能已与当前 `config/` 和 `src/` 不符,引用前请对照代码验证。

# 序列帧动画配置指南

## 概述

游戏支持建筑在地图上播放序列帧动画（sprite sheet animation）。通过纯 JSON 配置即可为任意建筑启用动画，无需修改渲染代码。

动画系统基于 PixiJS v8 的 `AnimatedSprite`，从水平排布的精灵图中切分子纹理并循环播放。

## 快速上手

### 1. 准备精灵图

精灵图是一张水平排列的 PNG 图片，每一帧等宽排列：

```
┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐
│ 帧0  │ 帧1  │ 帧2  │ 帧3  │ 帧4  │ 帧5  │ 帧6  │ 帧7  │
│256px │256px │256px │256px │256px │256px │256px │256px │
└──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘
└──────────────── 2048px (8 × 256) ────────────────┘  高度: 256px
```

**要求：**
- 必须使用 **PNG 格式**（支持 RGBA 透明通道）
- 帧从左到右等宽排列
- 背景应为透明（推荐在生成时使用绿幕背景，然后用 `scripts/extract_sprite_frames.py` 自动抠除）
- 放置到 `assets/buildings/` 目录下

### 2. 生成精灵图（通过千问百炼 AI）

项目提供了 Python 脚本用于从 AI 生成的视频中提取帧并制作精灵图：

```bash
# 步骤1：用千问百炼生成短视频（3-4秒，绿幕背景）
bailian video generate \
  --model "happyhorse-1.1-t2v" \
  --prompt "建筑动画描述..." \
  --duration 4 \
  --ratio "1:1" \
  --download "assets/buildings/anim_xxx_raw.mp4" \
  --async

# 步骤2：轮询直到完成
bailian video task get --task-id <task_id>

# 步骤3：下载视频
bailian video download --task-id <task_id> --out "assets/buildings/anim_xxx_raw.mp4"

# 步骤4：提取帧、抠绿幕、生成精灵图
python scripts/extract_sprite_frames.py \
  "assets/buildings/anim_xxx_raw.mp4" \
  "building_id" \
  --frames 8 \
  --layout horizontal
```

### 3. 配置 buildings.json

在目标建筑的 JSON 对象中添加以下字段：

```json
{
  "id": "lumber_mill",
  "mapIcon": "assets/buildings/anim_lumber_mill.png",
  "animation": {
    "spriteSheet": "assets/buildings/anim_lumber_mill.png",
    "frameCount": 8,
    "fps": 8,
    "frameWidth": 256,
    "frameHeight": 256,
    "pingpong": true
  },
  "mapIconLayout": {
    "scaleX": 1.0,
    "scaleY": 1.0,
    "offsetX": 0,
    "offsetY": 0
  }
}
```

### 4. 刷新资源清单

```bash
node scripts/generate-asset-manifest.js
```

---

## 配置字段参考

### `animation` 对象

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `spriteSheet` | string | **是** | — | 精灵图文件路径，相对于项目根目录 |
| `frameCount` | number | 否 | 8 | 精灵图中的帧数（水平均分） |
| `fps` | number | 否 | 8 | 播放帧率（帧/秒） |
| `frameWidth` | number | 否 | 自动计算 | 单帧像素宽度。**用于缩放计算**，不用于切分精灵图 |
| `frameHeight` | number | 否 | 自动计算 | 单帧像素高度。同上 |
| `pingpong` | boolean | 否 | false | 是否使用乒乓循环模式 |

### `mapIconLayout` 对象

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `scaleX` | number | 1.0 | 水平缩放倍率。美术微调用，最终缩放 = `(建筑占地像素 / 帧像素) × scaleX` |
| `scaleY` | number | 1.0 | 垂直缩放倍率 |
| `offsetX` | number | 0 | 水平像素偏移，正值为右移 |
| `offsetY` | number | 0 | 垂直像素偏移，正值为下移 |

---

## 循环模式详解

### 正向循环（默认 `pingpong: false`）

```
帧序列：[0, 1, 2, 3, 4, 5, 6, 7]
播放：  0→1→2→3→4→5→6→7→0→1→...
                         ↑___↑
                    此处 N-1→0 可能产生视觉跳跃
```

**适用场景：** 帧数多（16+）且首尾帧自然衔接的动画，或本身就是完整单次动作（如建造完成特效）。

### 乒乓循环（`pingpong: true`）

```
帧序列：[0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1]
播放：  0→1→2→3→4→5→6→7→6→5→4→3→2→1→0→1→...
                                             ↑___↑
                                    1→0 单步相邻过渡，无跳跃
```

**原理：** 内部将纹理数组构建为 `[0,1,...,N-1, N-2,...,1]`（14帧），利用 `AnimatedSprite` 的原生正向循环实现往复效果。首尾帧永远只差一帧，过渡天然平滑。

**适用场景：**
- **帧数少（4-12帧）的循环动画**——最佳选择
- AI 生成视频的首尾帧不衔接时
- 往复运动（锯片旋转、钟摆、活塞等）
- 大部分建筑的 idle 动画

**注意事项：**
- 帧 0 和帧 N-1 各出现一次（不重复），中间帧各出现两次
- 完整乒乓周期 = `(2N - 2) / fps` 秒（8帧@8fps → 14/8 ≈ 1.75秒）
- `frameCount` 仍然填原始帧数 N，不要填 2N-2

---

## 缩放计算逻辑

动画精灵的最终显示尺寸由以下公式决定：

```
显示宽度 = 建筑占地 × tileSize
         = footprint.width × 64px

精灵缩放 = (显示宽度 / 帧宽度) × mapIconLayout.scaleX

例如 lumber_mill（2×2）：
  scaleX = (2 × 64 / 256) × 1.0 = 0.5
  scaleY = (2 × 64 / 256) × 1.0 = 0.5
```

**关键：** `frameWidth/frameHeight` 必须是**单帧**的尺寸，而不是整张精灵图的尺寸。如果用整张精灵图宽度（如 2048px）计算，动画会缩到看不见。

如果未配置 `frameWidth`，系统回退到 `texture.width / frameCount` 自动推算，但这依赖于精灵图纹理加载状态，不推荐。

---

## 渲染决策树

`MapRenderer.refreshBuildings()` 对每个建筑执行以下判断：

```
config.mapIcon 存在？
├─ NO  → 文字回退（纯色矩形 + 名称）
└─ YES → 纹理已加载？
          ├─ NO  → 文字回退（异步纹理下次重试）
          └─ YES → config.animation 存在？
                    ├─ NO  → 静态精灵模式（PIXI.Sprite）
                    └─ YES → AnimatedSpriteHelper.createFromConfig()
                              ├─ 成功 → 动画模式 ✨
                              └─ null → 降级为静态精灵
```

**三级降级保证建筑始终可见。**

---

## 性能考虑

- 所有动画帧共享同一张 GPU 纹理（`TextureSource` 共享），不产生额外显存开销
- 乒乓模式会创建 `2N-2` 个 `Texture` 对象（每个只记录裁剪矩形，极小）
- `refreshBuildings()` 是全量重建，当前对于 <50 个建筑的场景足够；若扩展至 100+ 建筑可优化为增量更新
- `AnimatedSprite` 默认由 PixiJS 全局 Ticker 驱动，不占用 JS 主线程

---

## 故障排查

| 现象 | 可能原因 | 检查方法 |
|---|---|---|
| 建筑不显示动画，只有文字 | 纹理未加载完成 | 等一秒再看，或检查图片路径 |
| 动画太小/太大 | `frameWidth/frameHeight` 配错 | 检查是否为单帧尺寸而非整张精灵图尺寸 |
| 动画循环时有跳跃 | 使用了正向循环且首尾不衔接 | 启用 `"pingpong": true` |
| 建筑有绿色边缘 | 绿幕抠图不彻底 | 调整 `extract_sprite_frames.py` 中的 tolerance 参数 |
| 控制台报错 `AnimatedSprite is not defined` | PixiJS 版本不兼容 | 确认使用 PixiJS v8，`PIXI.AnimatedSprite` 包含在标准构建中 |
| 动画不播放 | `mapIcon` 路径错误或图片损坏 | 浏览器 DevTools → Network 检查 404 |

---

## 架构参考

```
buildings.json          MapRenderer.js          AnimatedSpriteHelper.js     PixiJS v8
┌────────────────┐     ┌─────────────────┐     ┌──────────────────────┐   ┌──────────────────┐
│ animation: {   │────▶│ animConfig =    │────▶│ createFromConfig()   │──▶│ PIXI.AnimatedSprite│
│   spriteSheet  │     │ config.animation│     │   ↓                  │   │   .play()         │
│   frameCount   │     │                 │     │ createFromHorizontal │   │   .loop = true    │
│   fps          │     │ if (animSprite) │     │ Sheet()              │   │   .animationSpeed │
│   frameWidth   │     │   → 动画模式    │     │   ↓                  │   │                    │
│   frameHeight  │     │ else if(texture)│     │ 切分子纹理           │   │ textures[]:        │
│   pingpong     │     │   → 静态精灵    │     │ 乒乓→双倍数组        │   │   正向: [0..7]     │
│ }              │     │ else            │     │   ↓                  │   │   乒乓: [0..7,6..1]│
│                │     │   → 文字回退    │     │ new AnimatedSprite() │   │                    │
│ mapIcon        │     │                 │     │                       │   │                    │
│ mapIconLayout  │     │ 缩放：          │     │                       │   │                    │
└────────────────┘     │ w*tileSize/     │     └──────────────────────┘   └──────────────────┘
                       │ frameW*scaleX   │
                       └─────────────────┘
```
