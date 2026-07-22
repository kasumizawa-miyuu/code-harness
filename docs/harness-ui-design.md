# code-harness WebUI 设计文档

## 产品概述

code-harness 是一个轻量级 Coding Agent Harness，让 AI 自主执行编码任务。核心流程：接收任务 → 调用 LLM → 执行动作（读/写文件、运行命令）→ 验证结果 → 自适应重试。

## 设计目标

- 清晰展示 agent 的实时推理过程（思维链）
- 简化 LLM 配置管理（Provider/Model/Key）
- 提供任务执行历史回溯
- 支持工作目录文件浏览
- 暗色/亮色自适应

## 布局方案：三栏式 Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  ┌───────┐  ┌────────────────────────────────┐  ┌────────┐ │
│  │ 侧边栏 │  │           主面板                │  │右侧面板│ │
│  │       │  │                                │  │        │ │
│  │LLM配置 │  │    ┌── 任务输入 ──────────┐    │  │执行历史│ │
│  │Provider│  │    │ textarea (居中720px)  │    │  │列表    │ │
│  │Model   │  │    │ [Run Task] 按钮       │    │  │        │ │
│  │API Key │  │    └───────────────────────┘    │  │Agent   │ │
│  │Base URL│  │                                │  │推理链  │ │
│  │Max Ret │  │    ┌── 输出/结果 ──────────┐    │  │(思维链)│ │
│  │        │  │    │ 状态标签 · 重试计数    │    │  │        │ │
│  │文件浏览│  │    │ stdout 展示            │    │  │        │ │
│  │工作目录│  │    │ 可折叠 verbose 日志    │    │  │        │ │
│  │文件列表│  │    └───────────────────────┘    │  │        │ │
│  │        │  │                                │  │        │ │
│  └───────┘  └────────────────────────────────┘  └────────┘ │
│                                                        │
│  [<] 独立浮动按钮（折叠/展开侧边栏）        [>] 独立浮动按钮 │
│                                                        │
│  [🌙 顶部导航栏右侧 · 暗色/亮色切换]                     │
│  [❓ 顶部导航栏 · 用户指南]                              │
└─────────────────────────────────────────────────────────────┘
```

## 组件分解

### 1. 任务输入（主面板顶部居中）
- 多行 textarea，placeholder 含示例提示，初始高度 160px 完整展示提示
- 垂直可拖拽调整大小（resize: vertical），max-width 720px 居中布局
- 最大高度根据当前浏览器视口动态计算：主面板可用高度 - Run 按钮行 - 上下各 32px 对称间隙
- 最小高度 160px，窗口 resize 时自动重算
- Run Task 按钮（紫色 #533afd），带 loading 状态
- 快捷键 Ctrl+Enter 提交
- 无标题栏，输入区直接展示

### 2. LLM 配置面板（左侧边栏）
- Provider 下拉：OpenAI / DeepSeek / Groq / Together AI / OpenRouter / Ollama / Custom
- Base URL 输入（自动填充默认值）
- Model 输入
- Max Retries 数字输入
- API Key 管理（浏览器 localStorage 存储）
- 状态指示灯（已配置/未配置，绿色圆点）

### 3. 执行输出（主面板，任务输入下方）
- 状态标签：success / fail / running（绿色/红色/灰色）
- 重试计数
- stdout 输出
- 可折叠的 verbose 交换日志（agent 完整推理过程，点击展开）

### 4. Agent 思维链（右侧面板）
- 实时展示 agent 的思考过程
- 每步类型：read_file / write_file / patch_file / run_command / run_test
- 显示参数和结果
- 可滚动长列表，自动滚动至最新条目

### 5. 执行历史（右侧面板顶部）
- 过往任务列表（localStorage 持久化）
- 显示状态、时间、任务摘要
- 点击可回看结果
- 支持清除全部历史

### 6. 文件浏览器（左侧边栏底部）
- 工作目录树形结构
- 文件/文件夹图标
- 当前路径显示（通过 /api/cwd 获取）

### 7. 侧边栏切换
- 两个独立浮动按钮，分别位于主面板左右边缘（left: 8px / right: 8px）
- 不依附于侧边栏，始终可见，z-index 高于侧边栏
- 尺寸 28×40px，带阴影，圆角 6px，白色背景
- 按钮图标：展开时箭头朝内，折叠时箭头朝外
- 状态持久化到 localStorage
- 折叠时侧边栏宽度变为 0，主面板自动扩展

### 8. 用户指南
- 首次打开自动弹出使用说明弹窗（基于 localStorage 判断）
- 可通过顶部导航栏 ❓ 按钮随时重新打开
- 弹窗包含九个步骤的引导说明
- 关闭后不再自动弹出（localStorage 标记）

### 9. 暗色/亮色模式
- 跟随系统偏好（`prefers-color-scheme` 媒体查询 + 事件监听）
- 支持手动切换，覆盖系统偏好
- 手动切换后存储到 localStorage，清除手动设置后恢复跟随系统
- 切换按钮在顶部导航栏右侧（月亮图标）
- 暗色主题使用 GitHub 风格深色（#0d1117 背景，#161b22 表面，#e6edf3 前景）
- accent 色切换为蓝色调（#6bb0ff）适配深色背景

### 10. Toast 通知
- 右上角弹出，3 秒自动消失
- 用于操作反馈（如"历史已清除"）

## 设计系统

使用 Stripe 设计系统：

- **字体**: sohne-var weight 300 标题，SF Pro Display 正文，SourceCodePro 代码
- **浅色主题**: 白色画布 #ffffff，深蓝海军标题 #061b31，紫色 accent #533afd
- **深色主题**: 深色背景 #0d1117，浅色文字 #e6edf3，蓝色 accent #6bb0ff
- **阴影**: 蓝色调多层阴影 rgba(50,50,93,0.25) + rgba(0,0,0,0.1)
- **圆角**: 4-8px 保守范围
- **边框**: #e5edf5（浅色）/ #30363d（深色）

## API 对接

| 端点 | 方法 | 参数 | 返回 |
|------|------|------|------|
| /api/run | POST | task, verbose, apiKey, llmProvider, baseUrl, model, maxRetries | { success, status, retries, output, exchanges } |
| /api/cwd | GET | 无 | { cwd, homedir } |

## 交互流程

1. 用户配置 LLM Provider + API Key（左侧面板，localStorage 持久化）
2. 输入任务描述（居中 textarea，Ctrl+Enter 快捷提交）
3. 点击 Run Task（或 Ctrl+Enter）
4. 按钮变为 loading 状态，显示 "Running..."
5. API 返回结果后展示：
   - 状态标签（success/fail）
   - stdout 输出
   - 如 verbose 开启，展示可折叠的交换日志
6. 任务自动记录到执行历史（localStorage，最多 50 条）
7. 点击历史条目可回看结果
8. 左侧/右侧面板可随时折叠，状态持久化

## 技术约束

- 纯同步 HTTP API（无 WebSocket/SSE）
- 长时间任务会阻塞请求 → UI 需 loading 状态
- 无服务端任务历史持久化 → 浏览器 localStorage 暂存
- 跨域需服务端 CORS 支持
- 主题/面板状态/配置/历史均使用 localStorage 持久化