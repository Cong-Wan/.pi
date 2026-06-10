# 代码质量复审者提示模板

在分派代码质量复审者子代理时使用此模板。

**目的：** 验证实现是否构建良好（干净、经过测试、可维护）

**仅在规范合规性复审通过后分派。**

```
Task tool (superpowers:code-reviewer):
  Use template at requesting-code-review/code-reviewer.md

  WHAT_WAS_IMPLEMENTED: [来自实现者的报告]
  PLAN_OR_REQUIREMENTS: Task N from [plan-file]
  BASE_SHA: [任务之前的提交]
  HEAD_SHA: [当前提交]
  DESCRIPTION: [任务摘要]
```

**除标准代码质量关注点外，复审者还应检查：**
- 每个文件是否有一个明确的职责和明确定义的接口？
- 单元是否被分解以便可以独立理解和测试？
- 实现是否遵循计划中的文件结构？
- 此实现是否创建了已经很大的新文件，或显著增长了现有文件？（不要标记预先存在的文件大小 —— 专注于此更改所贡献的内容。）

**代码复审者返回：** 优点、问题（关键/重要/次要）、评估
