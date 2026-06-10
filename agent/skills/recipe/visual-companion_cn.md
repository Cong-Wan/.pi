# 可视化伴侣指南

基于浏览器的可视化头脑风暴伴侣，用于显示模型图、图表和选项。

## 何时使用

逐问题决策，而非逐会话。测试是：**用户是否通过看到比通过阅读更能理解这一点？**

**当内容本身就是可视化时使用浏览器：**

- **UI 模型图** —— 线框图、布局、导航结构、组件设计
- **架构图** —— 系统组件、数据流、关系图
- **并排可视化比较** —— 比较两种布局、两种配色方案、两种设计方向
- **设计润色** —— 当问题关乎外观与感觉、间距、视觉层次时
- **空间关系** —— 渲染为图表的状态机、流程图、实体关系

**当内容是文本或表格时使用终端：**

- **需求和范围问题** —— "X 是什么意思？"、"哪些功能在范围内？"
- **概念性 A/B/C 选择** —— 用文字描述的方法之间挑选
- **权衡列表** —— 优/缺点、比较表
- **技术决策** —— API 设计、数据建模、架构方法选择
- **澄清问题** —— 任何答案是文字而非可视化偏好的问题

一个"关于"UI 主题的问题不会自动成为可视化问题。"你想要哪种向导？"是概念性的 —— 使用终端。"这些向导布局中哪个感觉更好？"是可视化的 —— 使用浏览器。

## 工作原理

服务器监视目录中的 HTML 文件并将最新文件提供给浏览器。你将 HTML 内容写入 `screen_dir`，用户在浏览器中看到它并可以点击选择选项。选择被记录到你下一回合读取的 `state_dir/events` 中。

**内容片段与完整文档：** 如果你的 HTML 文件以 `<!DOCTYPE` 或 `<html` 开头，服务器按原样提供它（仅注入辅助脚本）。否则，服务器自动将你的内容包装在框架模板中 —— 添加头部、CSS 主题、选择指示器和所有交互式基础设施。**默认写入内容片段。** 仅当你需要完全控制页面时才编写完整文档。

## 启动会话

```bash
# 启动服务器并持久化（模型图保存到项目）
scripts/start-server.sh --project-dir /path/to/project

# 返回：{"type":"server-started","port":52341,"url":"http://localhost:52341",
#           "screen_dir":"/path/to/project/docs/recipe/layout/12345-1706000000/content",
#           "state_dir":"/path/to/project/docs/recipe/layou/12345-1706000000/state"}
```

从响应中保存 `screen_dir` 和 `state_dir`。告诉用户打开 URL。

**查找连接信息：** 服务器将其启动 JSON 写入 `$STATE_DIR/server-info`。如果你在后台启动了服务器但未捕获 stdout，则读取该文件以获取 URL 和端口。使用 `--project-dir` 时，检查 `<project>/docs/recipe/layout/` 中的会话目录。

**注意：** 将项目根作为 `--project-dir` 传递，以便模型图在 `docs/recipe/layout/` 中持久化并在服务器重启后存活。否则，文件将转到 `/tmp` 并被清理。

**启动服务器：** 服务器必须在整个对话回合中保持在后台运行。如果你的环境会收割分离的进程，请使用 `--foreground` 并使用你所在平台的后台执行机制启动命令。

如果 URL 从你的浏览器无法访问（在远程/容器化设置中常见），请绑定非环回主机：

```bash
scripts/start-server.sh \
  --project-dir /path/to/project \
  --host 0.0.0.0 \
  --url-host localhost
```

使用 `--url-host` 控制返回的 URL JSON 中打印的主机名。

## 循环

1. **检查服务器是否存活**，然后**将 HTML 写入** `screen_dir` 中的新文件：
   - 在每次写入之前，检查 `$STATE_DIR/server-info` 是否存在。如果不存在（或存在 `$STATE_DIR/server-stopped`），则服务器已关闭 —— 在继续之前使用 `start-server.sh` 重启它。服务器在 30 分钟不活动后自动退出。
   - 使用语义化文件名：`platform.html`、`visual-style.html`、`layout.html`
   - **永远不要重用文件名** —— 每个屏幕都获得一个新文件
   - 使用 Write 工具 —— **永远不要使用 cat/heredoc**（向终端转储噪声）
   - 服务器自动提供最新文件

2. **告诉用户期待什么并结束你的回合：**
   - 提醒他们 URL（每一步，而不仅仅是第一次）
   - 给出一段关于屏幕上内容的简短文本摘要（例如"显示主页的 3 个布局选项"）
   - 要求他们在终端中回复："看看并让我知道你的想法。如果愿意，点击选择一个选项。"

3. **在你的下一回合** —— 在用户在终端中回复后：
   - 读取 `$STATE_DIR/events`（如果存在）—— 这包含用户的浏览器交互（点击、选择），每行一个 JSON
   - 与用户的终端文本合并以获得全貌
   - 终端消息是主要反馈；`state_dir/events` 提供结构化交互数据

4. **迭代或前进** —— 如果反馈改变了当前屏幕，编写新文件（例如 `layout-v2.html`）。仅当当前步骤被验证后才移到下一个问题。

5. **返回终端时卸载** —— 当下一步不需要浏览器时（例如，澄清问题、权衡讨论），推送一个等待屏幕以清除过时内容：

   ```html
   <!-- filename: waiting.html (或 waiting-2.html 等) -->
   <div style="display:flex;align-items:center;justify-content:center;min-height:60vh">
     <p class="subtitle">继续在终端中...</p>
   </div>
   ```

   这可以防止用户在对话已前进时盯着已解决的选项。当下一个可视化问题出现时，像往常一样推送新内容文件。

6. 重复直到完成。

## 编写内容片段

仅编写页面内显示的内容。服务器自动将其包装在框架模板中（头部、主题 CSS、选择指示器和所有交互式基础设施）。

**最小示例：**

```html
<h2>哪种布局效果更好？</h2>
<p class="subtitle">考虑可读性和视觉层次</p>

<div class="options">
  <div class="option" data-choice="a" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content">
      <h3>单列</h3>
      <p>干净、专注的阅读体验</p>
    </div>
  </div>
  <div class="option" data-choice="b" onclick="toggleSelect(this)">
    <div class="letter">B</div>
    <div class="content">
      <h3>两列</h3>
      <p>侧边栏导航与主要内容</p>
    </div>
  </div>
</div>
```

就这样。不需要 `<html>`、CSS 或 `<script>` 标签。服务器提供所有这些。

## 可用的 CSS 类

框架模板为你的内容提供以下 CSS 类：

### 选项（A/B/C 选择）

```html
<div class="options">
  <div class="option" data-choice="a" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content">
      <h3>标题</h3>
      <p>描述</p>
    </div>
  </div>
</div>
```

**多选：** 在容器上添加 `data-multiselect` 以允许用户选择多个选项。每次点击切换项目。指示器栏显示计数。

```html
<div class="options" data-multiselect>
  <!-- 相同的选项标记 —— 用户可以选择/取消选择多个 -->
</div>
```

### 卡片（可视化设计）

```html
<div class="cards">
  <div class="card" data-choice="design1" onclick="toggleSelect(this)">
    <div class="card-image"><!-- 模型图内容 --></div>
    <div class="card-body">
      <h3>名称</h3>
      <p>描述</p>
    </div>
  </div>
</div>
```

### 模型图容器

```html
<div class="mockup">
  <div class="mockup-header">预览：仪表板布局</div>
  <div class="mockup-body"><!-- 你的模型图 HTML --></div>
</div>
```

### 分屏视图（并排）

```html
<div class="split">
  <div class="mockup"><!-- 左侧 --></div>
  <div class="mockup"><!-- 右侧 --></div>
</div>
```

### 优/缺点

```html
<div class="pros-cons">
  <div class="pros"><h4>优点</h4><ul><li>好处</li></ul></div>
  <div class="cons"><h4>缺点</h4><ul><li>不足</li></ul></div>
</div>
```

### 模拟元素（线框图构建块）

```html
<div class="mock-nav">Logo | 首页 | 关于 | 联系我们</div>
<div style="display: flex;">
  <div class="mock-sidebar">导航</div>
  <div class="mock-content">主要内容区</div>
</div>
<button class="mock-button">操作按钮</button>
<input class="mock-input" placeholder="输入框">
<div class="placeholder">占位区域</div>
```

### 排版和章节

- `h2` —— 页面标题
- `h3` —— 章节标题
- `.subtitle` —— 标题下方的次要文字
- `.section` —— 具有底部外边距的内容块
- `.label` —— 小号大写标签文字

## 浏览器事件格式

当用户点击浏览器中的选项时，他们的交互被记录到 `$STATE_DIR/events`（每行一个 JSON 对象）。当你推送新屏幕时，文件会自动清除。

```jsonl
{"type":"click","choice":"a","text":"选项 A - 简单布局","timestamp":1706000101}
{"type":"click","choice":"c","text":"选项 C - 复杂网格","timestamp":1706000108}
{"type":"click","choice":"b","text":"选项 B - 混合","timestamp":1706000115}
```

完整的事件流显示用户的探索路径 —— 他们可能在确定之前点击多个选项。最后一个 `choice` 事件通常是最终选择，但点击模式可能揭示犹豫或值得询问的偏好。

如果 `$STATE_DIR/events` 不存在，则用户未与浏览器交互 —— 仅使用他们的终端文本。

## 设计技巧

- **将保真度与问题相匹配** —— 布局用线框图，润色用润色
- **在每个页面上解释问题** —— "哪种布局感觉更专业？" 而不仅仅是"选一个"
- **推进之前先迭代** —— 如果反馈改变了当前屏幕，编写新版本
- **每个屏幕最多 2-4 个选项**
- **在重要时使用真实内容** —— 对于摄影作品集，使用真实图片（Unsplash）。占位内容会掩盖设计问题。
- **保持模型图简单** —— 专注于布局和结构，而非像素完美的设计

## 文件命名

- 使用语义化名称：`platform.html`、`visual-style.html`、`layout.html`
- 永远不要重用文件名 —— 每个屏幕必须是一个新文件
- 对于迭代：附加版本后缀，如 `layout-v2.html`、`layout-v3.html`
- 服务器按修改时间提供最新文件

## 清理

```bash
scripts/stop-server.sh $SESSION_DIR
```

如果会话使用了 `--project-dir`，模型图文件会在 `docs/recipe/layout` 中保留以供日后参考。只有 `/tmp` 会话在停止时被删除。

## 参考

- 框架模板（CSS 参考）：`scripts/frame-template.html`
- 辅助脚本（客户端）：`scripts/helper.js`
