> ⚠️ **部分内容已过时**(2026-08-06 审计):文中数值/结构可能已与当前 `config/` 和 `src/` 不符,引用前请对照代码验证。

# 地图资源、山体与水岸收尾报告（2026-08-03）

## 完成范围

- 保留 384×384 固定大地图的宏观海陆轮廓、浅水/深水分布及连通水系。
- 将陆地微观地貌改为 25×25 微区分布：草地基底上分散小型森林、普通土壤、矿脉与山系。
- 资源点由 96 格宏区配额改为 25 格微区优先覆盖，再补足全图密度。
- 山体由黑色屏障改为山麓、山腰、山脊/高峰的俯视等高色带。
- 浅水不再使用 `grasswater.png` 横截面贴图；浅水和深水统一使用俯视水面纹理，浅水以色调区分，水格内侧绘制细岸线。
- 20 种奢侈品全部补充建筑、兵种或英雄的明确应用说明，奢侈品面板显示实际用途。
- 木材、食物、石料、黄金均有可覆盖并绑定对应资源点的专属采集建筑。

## 固定验收指标

| 指标 | 结果 |
|---|---:|
| 有效陆地 25×25 微区 | 249 |
| 同时具备森林、矿脉及四类资源点的微区 | 249 / 249 |
| 木材资源点 | 320 |
| 食物资源点 | 320 |
| 石料资源点 | 320 |
| 黄金资源点 | 320 |
| 水系掩码 SHA-256 | `763a3760a6f936e2828c7f1341e1a0856d722e831b9668a85ff3e47128ffc1b9` |
| Node 单元测试 | 245 / 245 通过 |
| JavaScript 语法检查 | 382 文件通过 |
| 浏览器完整冒烟流程 | 1 / 1 通过，控制台 0 错误 |

## 四种采集建筑绑定

| 资源点 | 建筑 | 占地 | 地形要求 | 验收 |
|---|---|---:|---|---|
| 木材 | 伐木集散点 `logging_camp` | 1×1 | 林地 `F` | 可放置、可绑定 |
| 食物 | 粮食农场 `grain_farm` | 1×1 | 草地/土地 `G/D` | 可放置、可绑定 |
| 石料 | 采石场 `stope` | 2×2 | 连续矿脉 `R` | 320 个石料点均存在合法覆盖位置 |
| 黄金 | 金矿 `gold_mine` | 1×1 | 矿脉 `R` | 可放置、可绑定 |

石料点生成时只会选择至少属于一个完整 2×2 矿脉区的格子，避免出现资源图标存在、采石场却无法覆盖的情况。食物点只生成在粮食农场允许的 `G/D` 地形；黄金点只生成在金矿允许的 `R` 地形。

## 关键实现文件

- `scripts/lib/FixedWorldBuilder.js`：25×25 微地貌、山体宽度和水系保持逻辑。
- `scripts/build-fixed-grand-map.mjs`：四资源微区覆盖、采集建筑可放置约束与固定地图重建。
- `config/maps/base_map.json`：generationVersion 3 固定地图成品。
- `src/rendering/MapPresentation.js`：山体等高色带和俯视岸线判定。
- `src/rendering/MapRenderer.js`：浅水色调、山体色带和水格内侧岸线绘制。
- `config/historical_content.json`：粮食农场资源点绑定及 20 种奢侈品用途。
- `test/node/fixed-grand-map.test.mjs`、`test/node/resource-nodes.test.mjs`：地图密度与四采集建筑契约。

## 视觉验收产物

- `output/playwright/map-micro-distribution-final.png`
- `output/playwright/mountain-contours-final.png`
- `output/playwright/top-down-shoreline-final.png`

视觉回归使用 `C:/Users/10656/.codex/skills/playwright/SKILL.md` 所定义的 Playwright CLI 流程；截图属于本地 QA 产物并已从 Git 跟踪中排除。
