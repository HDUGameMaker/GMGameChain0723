# 英雄多对话文档格式

策划编辑器中的“对话文档（JSON）”支持多个独立对话。推荐使用 `version: 2`：

```json
{
  "version": 2,
  "daily": [
    {
      "id": "daily_01",
      "start": "line_1",
      "nodes": [
        { "id": "line_1", "speaker": "hero", "text": "今天很安静。", "next": "choice_1" },
        {
          "id": "choice_1",
          "speaker": "hero",
          "text": "你要留下吗？",
          "choices": [
            { "text": "留下。", "next": "answer_a" },
            { "text": "稍后再来。", "next": "answer_b" }
          ]
        },
        { "id": "answer_a", "speaker": "hero", "text": "……嗯。", "end": true },
        { "id": "answer_b", "speaker": "hero", "text": "我会等。", "end": true }
      ]
    }
  ],
  "affinityDaily": {
    "1": [
      { "id": "level_1_daily_01", "start": "start", "nodes": [] },
      { "id": "level_1_daily_02", "start": "start", "nodes": [] }
    ]
  },
  "affinitySpecial": {
    "1": { "id": "level_1_special", "start": "start", "nodes": [] },
    "10": { "id": "level_10_special", "start": "start", "nodes": [] }
  }
}
```

规则：

- `daily`：基础日常对话池，正式配置建议提供 10 种。
- `affinityDaily[level]`：该好感等级专属日常对话，每级建议配置 2 种。进入该等级后，会优先触发尚未看过的专属对话；两种都触发后才从基础日常池选择。
- `affinitySpecial[level]`：升到该等级后仅触发一次的特殊对话。特殊对话优先于日常对话，不占每日次数，也不增加好感度。
- 日常对话每天只能完成一次。每个日常对话应配置一次二选一；无论选择哪项，系统固定增加 30 好感度，不读取选项中的好感数值。
- 每个对话必须有唯一 `id`、入口 `start` 和 `nodes`。
- 节点字段：`id`、`speaker`、`text`、`next`、`choices`、`end`。
- `choices` 最多显示两个选项；每个选项使用 `text` 和 `next`。
- 旧的单对话 `{ start, nodes }` 文档仍可读取，但会被视为只有一种基础日常对话。

已触发的等级专属对话、特殊对话、每日对话日期都会保存在英雄存档中。
