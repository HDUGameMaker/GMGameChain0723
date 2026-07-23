# 建筑地图标签布局配置

## 概述
地图上每个建筑的名称、进度条、工人数显示位置，可通过 `config/buildings.json` 中每个建筑的 `labelLayout` 字段调整。不配置则使用默认值（均为 0，即默认位置）。

## 配置字段

```json
{
  "id": "work_shed",
  "name": "工棚",
  ...
  "labelLayout": {
    "nameOffsetY": 0,
    "progressBarOffsetY": 0,
    "workersOffsetY": 0
  }
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `nameOffsetY` | number | `0` | 建筑名称垂直偏移（px），正值下移，负值上移 |
| `progressBarOffsetY` | number | `0` | 进度条+进度文字垂直偏移（px） |
| `workersOffsetY` | number | `0` | 工人数垂直偏移（px） |

## 默认布局

```
           ┌─────────────────┐
           │                 │
nameOffsetY →  │   建筑名称      │  ← 默认: centerY - 10
           │                 │
progressBarOffsetY → │   ═══════════    │  ← 默认: centerY + 4
           │     3/5         │  ← 进度文字 在进度条下方5px
           │                 │
workersOffsetY → │     👷2        │  ← 默认: bottomY - 12
           │                 │
           └─────────────────┘
```

## 适用场景

- **建筑名称被色块遮挡**：设置 `nameOffsetY: -15` 将名字进一步上移
- **进度条与名称重叠**：设置 `progressBarOffsetY: 10` 将进度条下移
- **大型建筑**（多格占地）：可能需要更大的偏移值
- **小型建筑**（1×1）：默认值通常适用，一般不调

## 示例

工棚（1×1，无需调整）：
```json
{ "id": "work_shed", ... }
```

大型工厂（2×2，名字下移避让）：
```json
{
  "id": "furnace",
  ...
  "labelLayout": { "nameOffsetY": -8, "progressBarOffsetY": 6 }
}
```

## 实现位置
- 解析逻辑：`src/rendering/MapRenderer.js` 的 `refreshBuildings()` 方法
- 配置定义：`config/buildings.json` 中各建筑对象的可选字段
