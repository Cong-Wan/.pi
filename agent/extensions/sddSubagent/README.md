# SDD Subagent Runner 文档

## 这个东西是什么

这是一个 Pi 扩展（extension），给主 Agent 提供一个叫 `sdd_subagent` 的工具。

主 Agent 用这个工具可以启动一个**独立的 Pi 子进程**去执行任务。子进程有自己的模型、自己的工具权限、自己的上下文，**不会污染主会话**。

子 Agent 完成后，会把结果解析成结构化状态（比如 `DONE`、`CHANGES_REQUESTED`）返回给主 Agent，让主 Agent 可以继续做后续动作。

这就是 Subagent-Driven Development（SDD）里那个“subagent 节点”的真正可执行版。

---

## 文件总览

这个目录有 6 个 TypeScript 文件。每个文件只负责一件事，像积木一样组合起来。

```text
index.ts          # 接待员：注册工具、收参数、组织流程
sddConfig.ts      # 规则手册：每个角色能用什么模型/工具/写权限
promptBuilder.ts  # 翻译官：把工具参数翻译成给子 Agent 的指令
subagentRunner.ts # 工人：实际启动子进程、收子进程输出
resultParser.ts   # 会计：把子进程乱糟糟的输出整理成结构化结果
subagentRender.ts # 化妆师：在主 Pi 界面上画出好看的工具卡片
```

下面是每个文件的详细解释，**完全不要求你懂 TypeScript**——我会用通俗类比说明每个文件在做什么、关键函数是什么。

---

## 1. `index.ts` — 接待员

**这个文件做什么**

这是整个扩展的“入口”。Pi 启动时会调用这个文件。它只干三件事：

1. 告诉 Pi：“我注册了一个叫 `sdd_subagent` 的工具。”
2. 当主 Agent 调用这个工具时，**组织整个流程**。
3. 把最终结果整理好返回给主 Agent。

**关键函数和概念**

| 名字 | 它做了什么 |
|---|---|
| `default function(pi)` | Pi 启动时调用一次。在这里面 `pi.registerTool(...)` 注册工具。 |
| `params` 校验 | 用 TypeBox 写了一份“参数清单”，告诉 Pi：这个工具必须传 `role`、`taskText`，可以选传 `model`、`cwd` 等等。 |
| `activeWriteLocks` | 一个内存里的集合。记录“现在哪个工作目录正在被写”。同一时间一个 cwd 只能跑一个写任务。 |
| `getGitHead(pi, cwd)` | 跑 `git rev-parse HEAD`，拿到任务开始前的 commit SHA。 |
| `getGitChangedFiles(pi, cwd)` | 跑 `git status --short`，拿到子 Agent 修改了哪些文件。 |
| `summarizeResult(...)` | 把结果（status/decision、commit、改动文件、最终文本）拼成一段人类可读的总结。 |
| `execute(...)` | **核心**。这是工具被调用时实际执行的函数。完整流程在下面“完整调用流程”里有。 |

**它用什么外部 API**

- `ExtensionAPI` 是 Pi 给扩展的接口，可以注册工具、读 git、读 cwd、监听事件。
- `StringEnum`、`Type` 用来声明参数结构（哪些字段是必填、类型是什么）。
- 它会调用下面 4 个文件里的函数来完成工作。

---

## 2. `sddConfig.ts` — 规则手册

**这个文件做什么**

定义“每个角色能干什么”。不写任何业务逻辑，**只查表和判断**。

Pi 一共 5 个角色：

| 角色 | 能写吗 | 默认模型 | 默认 thinking | 默认工具 |
|---|---|---|---|---|
| `implementer` | ✅ | 继承 Pi 默认 | medium | read, grep, find, ls, bash, edit, write |
| `fixer` | ✅ | 继承 Pi 默认 | medium | read, grep, find, ls, bash, edit, write |
| `specReviewer` | ❌ | 继承 Pi 默认 | medium | read, grep, find, ls, bash |
| `codeQualityReviewer` | ❌ | 继承 Pi 默认 | high | read, grep, find, ls, bash |
| `finalReviewer` | ❌ | 继承 Pi 默认 | high | read, grep, find, ls, bash |

“继承 Pi 默认”意思是：你没指定 model 时，子进程会沿用你当前 Pi 设置里的默认 provider 和模型（比如你现在用的是 `sub2api/gpt-5.5`）。

**关键函数**

| 函数 | 它做了什么 |
|---|---|
| `isReviewerRole(role)` | 判断这个角色是不是“审稿人”（spec/codeQuality/final）。 |
| `normalizeTools(tools)` | 把工具列表里重复的、空格的清掉。 |
| `sanitizeToolsForRole(role, tools)` | **关键安全函数**。如果 role 是审稿人，把 `edit` 和 `write` 强行移除。哪怕主 Agent 传了也无效。 |
| `resolveRoleConfig(input)` | 把“主 Agent 想用什么”和“默认是什么”合并，算出最终配置。 |
| `getWriteLockKey(cwd)` | 给工作目录算一个锁 key。同一个 cwd 同时只能有一个写任务。 |

---

## 3. `promptBuilder.ts` — 翻译官

**这个文件做什么**

把主 Agent 给的“工具参数”（`role`, `taskText`, `context`, `implementerReport` 等等），翻译成一段**完整的 Markdown 提示词**，发给子 Agent。

子 Agent 看到的就是这段提示词，它会按要求完成任务并按格式汇报。

**关键函数**

| 函数 | 它做了什么 |
|---|---|
| `section(title, body)` | 小工具：把一段内容包成 `## 标题\n\n内容` 形式。如果 body 是空的，自动写 “Not provided.” |
| `taskHeading(input)` | 生成任务标题，比如 `Task 1: Add validation`。 |
| `buildImplementerPrompt(input, isFixer)` | 写 implementer 或 fixer 的指令。强调“必须按 Status: ... 格式汇报”。 |
| `buildSpecReviewerPrompt(input)` | 写 specReviewer 的指令。强调“只看代码，不信 implementer 的报告”。 |
| `buildQualityReviewerPrompt(input, finalReview)` | 写 codeQualityReviewer 或 finalReviewer 的指令。强调“按 diff 范围审查”。 |
| `buildPrompt(input)` | **入口**。根据 role 调用上面某个函数，返回 `{ systemPrompt, taskPrompt }`。 |

**输出长什么样**

`buildPrompt` 返回两段：

- `systemPrompt`：一句简短身份说明，发给子 Pi 当 system prompt。
- `taskPrompt`：完整的任务指令，包括角色说明、任务描述、上下文、工作目录、规则、汇报格式。

---

## 4. `subagentRunner.ts` — 工人

**这个文件做什么**

这个文件最“实操”。它**真的去启动一个子进程**：

1. 把 `systemPrompt` 写到临时文件；
2. 拼出 `pi ...` 命令行参数；
3. 用 `spawn` 启动子 Pi；
4. 监听子进程 stdout（JSON 流），每行解析一次；
5. 监听子进程 stderr（错误输出）；
6. 监听 abort 信号和 timeout；
7. 进程结束后清理临时文件；
8. 把所有事件交给 `resultParser` 整理。

**关键函数**

| 函数 | 它做了什么 |
|---|---|
| `buildPiArgs({ roleConfig, systemPromptPath, taskPrompt })` | 拼出子 Pi 命令行参数。关键参数：`--mode json -p --no-session --no-extensions`。如果指定了 model 就加 `--model`。 |
| `getPiInvocation(args)` | 决定“用什么程序、什么参数启动”。在 Pi 内运行时，会用当前 Node 进程 + 当前 Pi 脚本。 |
| `processJsonLine(state, line)` | 把一行 JSON 喂给 `resultParser.handleJsonEvent`。无效 JSON 直接忽略，不抛错。 |
| `writeTempPrompt(systemPrompt)` | 在系统 tmp 目录建一个临时目录，写 `systemPrompt.md`，返回路径。 |
| `removeTempPrompt(dir, filePath)` | 跑完清理临时文件和目录。 |
| `runSubagent(input)` | **核心**。完整流程：写临时文件 → spawn 子 Pi → 流式解析 → 处理 abort/timeout → 清理 → 返回结构化结果。 |

**为什么用子进程而不是直接调用 SDK**

- 隔离性更强：子进程崩了不影响主 Pi；
- 子进程默认不加载其他 extension；
- 子进程不污染主会话；
- 未来想升级到 RPC 也方便。

---

## 5. `resultParser.ts` — 会计

**这个文件做什么**

子 Pi 跑的时候会输出一大堆 JSON 事件流（`message_start`、`message_end`、`tool_execution_start` 等等）。这个文件做三件事：

1. **收集**：把每一行 JSON 解析成结构化数据；
2. **累加**：把 token、cost、turn 数加到 `usage` 里；
3. **提炼**：从子 Agent 的最终文本里提取“Status: ...”或“Decision: ...”。

**关键函数**

| 函数 | 它做了什么 |
|---|---|
| `createParserState()` | 建一个空的状态对象：消息列表、工具调用、usage、stderr。 |
| `handleJsonEvent(state, event)` | 处理单个 JSON 事件。如果是 `message_end`，保存消息并累加 usage；如果是 `tool_execution_start`，记录工具调用。 |
| `getFinalAssistantText(messages)` | **关键**。从最后一条 assistant 消息里提取纯文本。 |
| `parseImplementerStatus(text)` | 用正则匹配 `Status: DONE \| DONE_WITH_CONCERNS \| BLOCKED \| NEEDS_CONTEXT`。没匹配上返回 `UNKNOWN`。 |
| `parseReviewerDecision(text)` | 用正则匹配 `Decision: APPROVED \| CHANGES_REQUESTED`。 |
| `parseFilesChanged(text)` | 从最终文本里解析 `## Files Changed` 段。 |
| `buildParsedResult(role, state, exitCode)` | **入口**。把所有状态打包成最终结构化结果。writer 角色多一个 `status` 字段；reviewer 角色多一个 `decision` 字段。 |

**Usage 怎么算**

每当收到一条 `assistant` 角色的 `message_end` 事件：

- `turns` +1；
- `input/output/cacheRead/cacheWrite` 累加；
- `cost` 累加；
- `model` 取最新一次。

---

## 6. `subagentRender.ts` — 化妆师

**这个文件做什么**

在主 Pi 的 TUI 界面里，主 Agent 调工具时，Pi 会显示一个“工具卡片”。这个文件负责画这张卡片的样式。

它画两件事：

1. **工具被调用时**（call）：显示“sdd_subagent implementer · Task 1: Login validation · default model”；
2. **工具返回时**（result）：显示“✓ implementer DONE / ◐ specReviewer CHANGES_REQUESTED / 3 turns ↑100 ↓25 $0.0123”。

**关键函数**

| 函数 | 它做了什么 |
|---|---|
| `renderSddCall(args, theme)` | 画工具调用卡片。提取 role、model、taskTitle/taskId 拼成两行。 |
| `renderSddResult(result, theme)` | 画工具返回卡片。如果有 `details`，画一个三行小卡片：role+状态、模型、usage。如果没有 `details`，fallback 到 content 文本。 |

**`theme` 是什么**

Pi 给你一组颜色/样式函数：

- `theme.fg("success", "✓")` 把 ✓ 涂成成功色（绿）；
- `theme.bold("...")` 加粗；
- `theme.fg("dim", "...")` 灰色（次要信息）。

---

## 完整调用流程

主 Agent 调用 `sdd_subagent` 时，代码会按这个顺序跑：

```text
1.  index.ts
    └─ pi.registerTool({ name: "sdd_subagent", execute: ... })
    └─ 主 Agent 调 execute(params)
        │
        ├─ sddConfig.resolveRoleConfig(params)  ← 算出 roleConfig
        ├─ sddConfig.sanitizeToolsForRole(...)   ← 强制只读（审稿人）
        ├─ activeWriteLocks.add(cwd)              ← 加写锁
        │
        ├─ getGitHead(pi, cwd)                    ← 拿 beforeSha
        │
        ├─ promptBuilder.buildPrompt(...)         ← 生成子 Agent 指令
        │
        ├─ subagentRunner.runSubagent(...)
        │     │
        │     ├─ writeTempPrompt(systemPrompt)   ← 写临时文件
        │     ├─ buildPiArgs(...)                 ← 拼命令行
        │     ├─ spawn(pi, args, cwd)             ← 启动子进程
        │     ├─ 监听 stdout：
        │     │     ├─ processJsonLine(state, line)
        │     │     │     └─ resultParser.handleJsonEvent
        │     │     └─ emitUpdate(...)            ← 流式返回给主 Pi
        │     ├─ 监听 stderr：累加到 state.stderr
        │     ├─ 监听 signal/timeout：SIGTERM/SIGKILL
        │     └─ removeTempPrompt(...)            ← 清理
        │
        ├─ resultParser.buildParsedResult(...)    ← 整理结构化结果
        ├─ getGitHead(pi, cwd)                    ← 拿 afterSha
        ├─ getGitChangedFiles(pi, cwd)            ← fallback 兜底获取改动文件
        ├─ summarizeResult(...)                   ← 生成人类可读总结
        │
        ├─ activeWriteLocks.delete(cwd)           ← 释放写锁
        │
        └─ 返回 { content, details, isError }     ← 给主 Agent
            │
            └─ subagentRender.renderSddResult(...) ← 在 TUI 画卡片
```

---

## 关键概念小词典

| 术语 | 解释 |
|---|---|
| **Pi** | 这个终端 AI 编程工具本身。 |
| **Extension** | Pi 的扩展机制。写 TS 就能挂载到 Pi 上，加新工具、加新命令、改行为。 |
| **Subagent** | Pi 主 Agent 派出去的子 Agent。跑在独立子进程里，有自己的 context。 |
| **`spawn`** | Node.js 启动子进程的方式。和 `exec` 相比更轻、更可控。 |
| **`AbortSignal`** | Node.js 的一种信号。可以监听它来中途取消长任务。 |
| **TypeBox** | 一种用纯 JS 对象声明类型的方式。Pi 拿它来校验工具参数。 |
| **JSON event stream** | 子 Pi 的输出是一行行 JSON，叫 `--mode json` 模式。 |
| **TUI** | Terminal User Interface，终端界面。Pi 跑的是 TUI，不是 GUI。 |

---

## 怎么读懂

如果你想自己改，最快路径是：

1. **先看 `sddConfig.ts`** — 5 个角色各自能干吗，看完就理解安全模型。
2. **再看 `promptBuilder.ts`** — 每个角色被给什么指令，看完就理解它们怎么工作。
3. **再看 `index.ts` 的 `execute` 函数** — 整条流水线就一气呵成了。
4. **最后看 `subagentRunner.ts` 的 `runSubagent`** — 子进程怎么被启动和监听的。

`resultParser.ts` 是“纯数据处理”，可以最后看；`subagentRender.ts` 只是画 UI，可改可不改。

---

## 已知限制（第一版）

- 每个 `sdd_subagent` 调用只跑一个子 Agent，**不做内部 implementer/reviewer 循环**。主 Agent 需要自己按 SDD skill 调度。
- 同时一个 cwd 只能跑一个写任务。第二个写调用会立刻失败（不是排队）。
- 子进程默认不加载其他 extension，避免互相干扰。
- 子进程默认沿用 Pi 当前默认 provider 和 model（除非主 Agent 显式传 `model`）。
- Reviewer 角色永远只读。即使主 Agent 故意传了 `edit`/`write`，也会被 `sanitizeToolsForRole` 移除。

<💃💃 DELICIOUS 💃💃>
