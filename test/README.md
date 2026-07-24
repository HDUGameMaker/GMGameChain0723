# 🧪 GMGameChain 测试文档

## 目录结构

```
test/
├── README.md                           ← 本文件
├── scripts/                            ← 脚本测试（自动化）
│   ├── test-runner.html                ← 浏览器测试运行器（可视化界面）
│   ├── test-gridUtils.js               ← 网格坐标工具测试（7 个纯函数）
│   ├── test-eventBus.js                ← 事件总线测试（发布/订阅）
│   ├── test-store.js                   ← 状态容器测试（响应式 Store）
│   └── test-config-validation.js       ← Config JSON 结构校验（需 HTTP 服务器）
└── manual/                             ← 人工手动测试清单
    ├── checklist-ui.md                 ← UI 交互测试（HUD、弹窗、按钮）
    ├── checklist-gameplay.md           ← 游戏玩法测试（资源、建筑、探险、事件）
    ├── checklist-save.md               ← 存档系统测试（IndexedDB、localStorage）
    └── checklist-regression.md         ← 回归测试核心场景（每次发版必测）
```

## 快速开始

### 脚本测试（推荐）

1. 启动 HTTP 服务器：
   ```bash
   node scripts/generate-asset-manifest.js && npx http-server -p 8080 -c-1 --cors
   ```

2. 打开 `http://127.0.0.1:8080/test/scripts/test-runner.html`

3. 点击「▶ 运行全部测试」查看结果

### 控制台手动测试

也可以在浏览器控制台中单独运行某个测试模块：

```js
// 打开游戏页面后，在 DevTools Console 中：
const m = await import('./test/scripts/test-gridUtils.js');
const result = m.run();
console.table(result.results);
console.log(`通过: ${result.passed}/${result.total}`);

// EventBus 测试
const e = await import('./test/scripts/test-eventBus.js');
console.table(e.run().results);

// Store 测试
const s = await import('./test/scripts/test-store.js');
console.table(s.run().results);
```

### 人工测试

打开 `test/manual/` 下的 Markdown 文件，按照 checklist 逐项手动验证。每项包含：
- **测试步骤** — 具体操作说明
- **预期结果** — 应该看到什么
- **实际结果/状态** — 留空填写

推荐测试顺序：
1. 先过一遍 `checklist-regression.md`（核心场景，8 个场景约 20 分钟）
2. 再按需测试 `checklist-ui.md`、`checklist-gameplay.md`、`checklist-save.md`

## 测试覆盖范围

| 模块 | 脚本测试 | 人工测试 | 说明 |
|------|:---:|:---:|------|
| gridUtils | ✅ 7 项 | — | 纯函数，全覆盖 |
| EventBus | ✅ 15 项 | — | 完整生命周期测试 |
| Store | ✅ 16 项 | — | 响应式状态测试 |
| Config JSON | ✅ 自动扫描 | — | 字段存在性与类型校验 |
| UI (HUD/弹窗/面板) | — | ✅ 30+ 项 | 需要视觉验证 |
| 游戏玩法 | — | ✅ 50+ 项 | 需要交互操作 |
| 存档系统 | — | ✅ 15 项 | 需要跨会话验证 |
| 回归核心 | — | ✅ 8 场景 | 端到端关键路径 |

## 添加新测试

### 添加脚本测试

1. 在 `test/scripts/` 下创建 `test-xxx.js`
2. 导出 `run()` 函数，返回 `{ name, passed, failed, total, results[] }`
3. 在 `test-runner.html` 中 import 并注册

测试结果格式：
```js
{
  name: '模块名',
  passed: 10,
  failed: 2,
  total: 12,
  results: [
    { description: '测试描述', pass: true, expected: '期望值', actual: '实际值' },
    { description: '失败的测试', pass: false, expected: '42', actual: '0' },
    // ...
  ]
}
```

### 添加人工测试项

在对应的 checklist Markdown 文件中新增行：
```markdown
| X.X | 测试项名称 | 操作步骤 | 预期行为 | | ⬜ 通过 ⬜ 失败 |
```

## 注意事项

1. **脚本测试不依赖游戏运行状态** — `test-gridUtils`、`test-eventBus`、`test-store` 都是独立实例，不污染全局单例
2. **Config 测试需要 HTTP 服务器** — 因为使用了 `fetch()`，不支持 `file://` 协议
3. **人工测试建议定期执行** — 建议每次大改动后至少完成回归测试（checklist-regression.md）
4. **测试文件不影响游戏代码** — 所有测试文件独立在 `test/` 目录中，不修改任何 `src/` 下的文件
