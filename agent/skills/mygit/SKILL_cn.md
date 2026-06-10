---
name: git
description: 按照用户个人风格提交 Git commit。每当用户说"帮我提交"、"commit 一下"、"生成 commit message"、"提交代码"、"写 commit"、"准备提交"，或者提到 git commit 相关操作时，必须使用此 skill。即使用户只是说"我改完了"或"可以提交了"，也应触发此 skill。
---

# Git

按照用户的个人风格，自动分析差异、更新版本号、补全文件头注释，并生成规范的 commit message。

---

## 工作流程

### Step 1：分析差异

运行以下命令，获取本次改动的完整信息：

```bash
git diff HEAD          # 查看未暂存的改动
git diff --cached      # 查看已暂存的改动
git status             # 查看新增/删除的文件列表
git log -1 --oneline   # 查看上次 commit 标题（用于对比语境）
```

### Step 2：归类文件变更

将变更文件分为三类：
- **修改文件（M）**：已存在、内容有改动 → 需要更新 version + description
- **新增文件（A）**：首次加入仓库 → 需要添加 version `1.0` + description
- **删除文件（D）**：已从仓库移除 → 仅在 commit message 中提及，无需修改文件

### Step 3：生成 Commit Message

格式如下：

```
<中文标题>
 
变更摘要
- 中文说明
- 中文说明
...（最多 5 条）
 
文件变更 / Files Changed:
- M path/to/file.py (v1.0 → v1.1)
- A path/to/new_file.py (v1.0)
- D path/to/deleted_file.py
```

**标题规则：**
- 用中文，简短有力，不超过 30 字
- 无需前缀（不用 feat:/fix: 等）
- 例：`优化用户认证流程`、`新增数据导出功能`、`修复登录页样式问题`

**摘要规则：**
- 最多 5 条，优先写最重要的改动
- 聚焦"做了什么"，不写"为什么"（除非用户特别说明）
- 删除文件也要在摘要中提及

### Step 4：执行提交

生成 commit message 后，询问用户是否直接执行 `git add` + `git commit`+`git push`，或者由用户自行决定。

若用户同意，执行：
```bash
git add <修改过的文件列表>
git commit -m "<commit message>"
git push <默认当前所属的分支，除非有另外说明>
```

**注意：** 禁止在 commit message 中添加 `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`。

---

## 边缘情况处理

| 情况 | 处理方式 |
|------|----------|
| 文件是二进制（图片、字体等） | 跳过文件头更新，仅在 commit message 中记录 |
| 文件没有明确的"顶部"（如 JSON、纯数据文件） | 跳过文件头更新，仅在 commit message 中记录 |
| 改动超过 5 处值得摘要的内容 | 保留最重要的 5 条，其余合并或省略 |
| 用户说"这是大版本" | 主版本 +1，小版本归零（如 `1.4 → 2.0`） |
| 仓库没有任何历史 commit | `git log` 会报错，跳过此步，直接分析 `git status` |

---

## 示例输出

```
优化数据处理模块与新增导出功能
 
变更摘要:
- 重构数据清洗逻辑，提升处理效率
- 新增 CSV 导出功能
- 修复空值处理时的边界错误
- 更新配置文件，增加超时参数
 
文件变更:
- M src/data_processor.py (v1.1 → v1.2)
- M config/settings.toml (v1.0 → v1.1)
- A src/exporter.py (v1.0)
- D src/old_parser.py
```
