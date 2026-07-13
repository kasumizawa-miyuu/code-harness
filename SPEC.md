# SPEC: code-harness — 反馈闭环驱动

> 项目：AI4SE 期末项目 · A · Coding Agent Harness
> 日期：2026-07-13
> 状态：设计定稿

---

## 1. 问题陈述

### 1.1 要解决什么问题

LLM 在编码场景中会产生不可靠的输出：生成的代码可能有编译错误、测试失败、lint 警告，或执行危险操作。现有 agent 框架要么将"检查"交给 LLM 自身（提示词级别的自我检查），要么缺乏结构化的反馈闭环让 agent 从失败中学习。

本项目构建一个轻量级 Coding Agent Harness，核心命题是：**当 LLM 产生错误时，工程代码能否检测到、分类它、并驱动 LLM 自我修正？**

### 1.2 目标用户

使用 AI 辅助编码的开发者，需要一个可编程、可预测、可离线测试的 agent 框架来执行自动化编码任务（修复 bug、实现功能、重构代码）。

### 1.3 为什么值得做

现有方案（直接使用 Claude Code / Copilot 等）是"黑盒"——用户无法控制 agent 的行为边界、无法插桩检测反馈、无法在 CI 中以确定性方式验证 agent 逻辑。本 harness 将这些机制开源、可编程、可测试，让开发者对 agent 行为有完整的可见性与控制力。

---

## 2. 用户故事

1. **修复测试失败**：作为开发者，我让 agent 修复一个有 bug 的测试文件，agent 修改代码、运行测试，根据反馈循环修正直到测试通过，然后自动停机。
2. **添加功能**：作为开发者，我使用 `harness run"添加错误处理"` 让 agent 自动实现功能，过程中 agent 会编译、运行测试、检查 lint，根据反馈逐步修正。
3. **安全配置 Key**：作为开发者，首次运行时 harness 引导我安全录入 API Key（隐藏输入），后续从操作系统钥匙串自动读取，且不会在任何日志或终端历史中暴露明文。
4. **安全边界**：作为开发者，我在配置文件中设定 agent 允许操作的工作目录，agent 尝试写入目录外的文件会被拦截并报告。
5. **CI 集成**：作为 CI 维护者，我在 GitHub Actions 中使用 mock LLM 模式运行 harness 测试，确保每一次提交都验证 harness 自身逻辑的正确性。

---

## 3. 功能规约

### 3.1 Agent 主循环（AgentLoop）

| 项目 | 说明 |
|------|------|
| 输入 | 用户任务描述（字符串） |
| 行为 | 按顺序执行：buildContext → llmCall → parseAction → guardrail → execute → verify → (feedback / done) |
| 输出 | 任务结果（成功/失败、执行记录、重试次数） |
| 边界条件 | LLM 调用失败（重试 3 次后停机）；解析失败（回灌要求重试）；同一错误重复出现（自适应停机） |
| 错误处理 | 每个阶段都有 try-catch，异常时记录错误并决定是否重试 |

### 3.2 LLMProvider

| 项目 | 说明 |
|------|------|
| 输入 | Context（系统提示 + 任务 + 历史 + 反馈） |
| 行为 | 调用 LLM 补全 API，返回文本响应 |
| 输出 | `LLMResponse { content: string }` |
| 边界条件 | 网络超时 → 重试 3 次；API key 无效 → 提示用户重新配置 |
| 错误处理 | 网络错误回退到重试逻辑；认证错误直接停机 |

可替换为 mock LLM：返回预定义的响应序列，用于确定性测试。

### 3.3 ActionParser

| 项目 | 说明 |
|------|------|
| 输入 | LLM 输出的原始文本 |
| 行为 | 用正则匹配提取动作（`read_file` / `write_file` / `patch_file` / `run_command` / `run_test`） |
| 输出 | `Action { type: ActionType, params: Record<string, string> }` 或解析失败 |
| 边界条件 | 无法匹配任何动作 → 返回解析失败，AgentLoop 回灌错误信息 |
| 错误处理 | 解析失败时注入反馈，要求 LLM 按格式输出 |

### 3.4 ToolExecutor

| 项目 | 说明 |
|------|------|
| 输入 | Action |
| 行为 | 根据 type 执行对应操作：读文件、写文件、patch 文件、执行 shell 命令 |
| 输出 | `ActionResult { success: boolean, stdout: string, stderr: string, exitCode: number }` |
| 边界条件 | 文件不存在 → 返回错误信息；命令超时（默认 30s）→ kill 进程并返回超时 |
| 错误处理 | 执行失败不抛异常，而是将错误信息放在 ActionResult 中返回 |

### 3.5 Guardrail

| 项目 | 说明 |
|------|------|
| 输入 | Action |
| 行为 | 检查 action 是否在允许范围内：黑名单命令（`rm -rf /` 等）、白名单路径（只允许 `workDir` 下的操作） |
| 输出 | `GuardResult { allowed: boolean, reason?: string }` |
| 边界条件 | 危险命令 → 拦截并返回 blocked 信息；路径越界 → 拦截并报告 |
| 错误处理 | Guardrail 本身不抛异常，始终返回明确的 allow/deny |

### 3.6 Verifier（反馈闭环核心）

| 项目 | 说明 |
|------|------|
| 输入 | ActionResult |
| 行为 | 根据 action 类型执行对应校验：run_test → 解析测试输出；run_command → 检查 exitCode；write_file → 可选 lint/tsc 校验 |
| 输出 | `VerificationResult { passed, category, severity, details, summary }` |
| 分类 | `success` / `test_fail` / `compile_error` / `lint_warn` / `timeout` |
| 严重度 | `fatal`（compile_error） / `error`（test_fail, timeout） / `warning`（lint_warn） |
| 边界条件 | 校验工具不存在（如 tsc 未安装）→ 降级为仅检查 exitCode |
| 错误处理 | 校验器本身出错 → 降级为"无法校验，按 success 处理" |

### 3.7 FeedbackInjector

| 项目 | 说明 |
|------|------|
| 输入 | VerificationResult, Context |
| 行为 | 将校验结果的结构化反馈注入到 Context 中，追加到 LLM 的输入 |
| 输出 | 更新后的 Context |
| 边界条件 | 连续注入相同反馈 → 由自适应重试逻辑决定是否继续 |
| 错误处理 | 无——纯数据转换 |

### 3.8 Memory

| 项目 | 说明 |
|------|------|
| 输入 | key (string), value (unknown) |
| 行为 | KV 存储，滑动窗口（最近 20 轮对话），持久化到 JSON 文件 |
| 输出 | 读取时返回 value |
| 边界条件 | key 不存在 → 返回 undefined；文件损坏 → 重置为空 |
| 错误处理 | 读写文件失败 → 回退到内存模式，记录警告 |

### 3.9 Config

| 项目 | 说明 |
|------|------|
| 输入 | 配置文件路径（默认 `harness.config.json`）+ 环境变量 |
| 行为 | 加载 JSON 配置，环境变量覆盖同名配置项 |
| 输出 | `Config { llmProvider, apiKey, maxRetries, workDir, dangerousCommands, ... }` |
| 边界条件 | 配置文件不存在 → 使用默认值；环境变量非法 → 报错提示 |
| 错误处理 | 配置校验失败 → 提示用户修正并退出 |

---

## 4. 非功能性需求

### 4.1 性能

- 单次 LLM 调用超时 60s，单个工具执行超时 30s
- 记忆文件大小不超过 1MB（滑动窗口确保）

### 4.2 安全（含凭据威胁模型）

| 威胁 | 对策 |
|------|------|
| API Key 硬编码在源码中 | 禁止——key 从 keytar 钥匙串或 `.env` 文件加载 |
| Key 泄露到日志 | Logger 对所有 key 字段做脱敏处理（`mask("sk-...", 4)` → `sk-...xxxx`） |
| Key 泄露到终端历史 | 录入 key 使用隐藏输入（`read -s` 等价），不支持命令行参数传 key |
| Key 泄露到进程环境 | `.env` 文件在文档中标注其明文风险；推荐使用钥匙串 |
| Agent 执行危险命令 | Guardrail 代码级拦截，黑名单 + 白名单双重检查 |
| Agent 访问非授权文件 | 路径白名单限制操作范围 |

### 4.3 可用性

- 首次运行引导用户录入 API Key
- 提供 `harness key status` / `update` / `clear` 子命令
- 错误信息清晰区分"用户错误"与"系统错误"

### 4.4 可观测性

- 每次循环迭代输出日志：当前阶段、LLM 响应、Action、校验结果
- 支持 `--verbose` 模式输出 LLM 的完整输入/输出
- 支持 `--dry-run` 模式模拟执行（不实际调 LLM 和写文件）

---

## 5. 系统架构

### 5.1 组件图

```
┌──────────────────────────────────────────────────────────────┐
│                      AgentLoop (主循环)                       │
│                                                              │
│  ┌──────────┐   ┌──────────┐   ┌───────────┐   ┌──────────┐│
│  │  Context  │ → │   LLM    │ → │  Action   │ → │  Tool    ││
│  │  Builder  │   │ Provider  │   │  Parser   │   │ Executor ││
│  └──────────┘   └──────────┘   └───────────┘   └────┬─────┘│
│                                                     │       │
│                                              ┌──────▼──────┐│
│                                              │  Guardrail  ││
│                                              └──────┬──────┘│
│                                                     │       │
│                                              ┌──────▼──────┐│
│                                              │  Verifier   ││
│                                              └──┬──────┬───┘│
│                                   ┌──────────────┘      │   │
│                                   ▼                      ▼   │
│                             ┌──────────┐           ┌────────┐│
│                             │ Feedback │           │  Done  ││
│                             │ Injector │           │ (停机)  ││
│                             └──────────┘           └────────┘│
│                                                              │
│   横切组件: Memory ── Config ── Logger ── KeyManager         │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 数据流

```
1. User 输入任务 → AgentLoop
2. AgentLoop → ContextBuilder → 组装上下文（系统提示 + 任务描述 + 历史 + 上次反馈）
3. Context → LLMProvider → LLM 返回文本响应
4. 文本响应 → ActionParser → 结构化 Action
5. Action → Guardrail → 检查通过/拒绝
6. 通过的 Action → ToolExecutor → 实际执行
7. 执行结果 → Verifier → 校验通过/失败
8a. 校验通过 → AgentLoop 停机，返回结果
8b. 校验失败 → FeedbackInjector → 更新 Context → 回到步骤 2（带重试计数）
```

### 5.3 外部依赖

| 依赖 | 用途 | 可选/必选 |
|------|------|-----------|
| OpenAI API / Anthropic API | LLM 调用 | 必选（但可替换为 mock） |
| keytar | 操作系统钥匙串读写 | 必选（凭据安全） |
| Node.js 内置 fs/child_process | 文件操作、命令执行 | 必选 |
| Vitest | 单元测试与集成测试 | 开发依赖 |

---

## 6. 数据模型

### 6.1 核心实体

```
Context {
  systemPrompt: string
  task: string
  history: Exchange[]      // 最近 20 轮
  lastFeedback: VerificationResult | null
  retryCount: number
}

Exchange {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

Action {
  type: 'read_file' | 'write_file' | 'patch_file' | 'run_command' | 'run_test'
  params: Record<string, string>
  id: string                // UUID
}

ActionResult {
  success: boolean
  stdout: string
  stderr: string
  exitCode: number
  duration: number          // 执行耗时 ms
}

VerificationResult {
  passed: boolean
  category: 'success' | 'test_fail' | 'compile_error' | 'lint_warn' | 'timeout'
  severity: 'fatal' | 'error' | 'warning'
  details: string           // 原始输出
  summary: string           // 给 LLM 的精炼反馈
}

Config {
  llmProvider: 'openai' | 'anthropic' | 'mock'
  apiKey: string            // 从钥匙串加载，不持久化到配置
  model: string             // 默认 'gpt-4o'
  maxRetries: number        // 默认 3
  workDir: string           // 默认当前目录
  dangerousCommands: string[]
  allowedPaths: string[]
  toolTimeout: number       // 默认 30000ms
  llmTimeout: number        // 默认 60000ms
  memoryFile: string        // 默认 '.harness-memory.json'
  verbose: boolean
}
```

---

## 7. 领域与机制设计（A 项目额外要求）

### 7.1 领域分析：Coding

| 机制 | 在 Coding 领域的具体形态 |
|------|--------------------------|
| 反馈信号 | 测试运行结果、编译输出、lint 报告、类型检查、exit code |
| 危险动作 | `rm -rf`、`DROP TABLE`、超出项目目录的写操作、安装未经验证的包 |
| 所需工具 | 读文件、写文件、patch 文件、执行 shell 命令、运行测试 |
| 记忆需求 | 项目约定（代码风格、测试框架）、历史决策、之前失败的根因 |

### 7.2 重点维度：反馈闭环

选择**反馈闭环**作为深入维度，原因：

- 它是 harness "让 LLM 可靠" 最核心的工程机制——没有反馈闭环，agent 只是"生成 + 祈祷"模式
- 其代码密度高：涉及 Verifier 分类器、FeedbackInjector 结构化注入、自适应重试逻辑
- 确定性测试清晰：mock LLM + mock Verifier 可覆盖所有失败场景
- 移除真实 LLM 后，整个机制仍可用单测验证——符合 §A.4-C 的硬标准

### 7.3 反馈闭环的编码实现

**Verifier（代码实现，非提示词）：**

- 对 `run_test` 动作：解析测试框架输出（Jest/Vitest 的 stdout），提取失败用例数、失败详情
- 对 `run_command` 动作：检查 exitCode，解析 stderr 匹配常见错误模式
- 对 `write_file` 动作：可选在写入后触发 tsc / lint 检查
- 分类逻辑使用正则 + 规则匹配，不依赖 LLM 判断

**自适应重试（代码实现，非提示词）：**

- 比较当前 VerificationResult 与上一次的 summary
- 如果完全相同 → 判定为"重复错误" → 直接停机
- 如果连续 3 次同一 category → 判定为"方向错误" → 停机
- 重试计数器和停机条件完全在 AgentLoop 代码中，LLM 不参与决策

---

## 8. 凭据与分发设计

### 8.1 凭据存储方案

```
录入流程：
  1. 用户运行 `harness configure` 或首次运行
  2. 终端提示 "请输入 API Key:"，输入隐藏（不回显）
  3. 写入系统钥匙串（keytar）
  4. 确认写入成功

读取流程：
  1. AgentLoop 启动时从钥匙串读取 key
  2. 加载到内存中的 Config 对象
  3. 进程结束时释放

管理命令：
  harness key status     → 显示"已配置 / 未配置"
  harness key update     → 重新录入并覆盖
  harness key clear      → 从钥匙串删除

备选方案：
  .env 文件（HARNESS_API_KEY=sk-...）
  → 文档中标注：.env 为明文存储，进程环境变量可见
```

### 8.2 分发方案

**npm 包（主分发形态）：**

```
npm install -g @student/coding-harness
harness run "为所有函数添加错误处理"
```

**Docker 镜像（辅助分发）：**

```dockerfile
FROM node:20-slim
RUN npm install -g @student/coding-harness
ENTRYPOINT ["harness"]
```

```
docker build -t coding-harness .
docker run -v $(pwd):/workspace -w /workspace coding-harness run "修复测试"
```

**CI 配置：**

GitHub Actions：每次 push 运行 `npm test` + 构建 Docker 镜像。

---

## 9. 技术选型与理由

| 维度 | 选择 | 理由 |
|------|------|------|
| 语言 | TypeScript | 类型安全、生态成熟、与 OpenCode 开发环境一致 |
| 测试框架 | Vitest | 快速、原生 TS 支持、兼容 Jest API |
| LLM 供应商 | OpenAI API（可插拔接口） | 最通用的 LLM API，mock 实现简单 |
| 钥匙串 | keytar | 跨平台（Win/Mac/Linux），课程推荐 |
| 分发 | npm + Docker | npm 覆盖本地开发者，Docker 覆盖 CI/服务端 |
| CI | GitHub Actions | 与 GitHub 仓库集成，免费额度充足 |

---

## 10. 验收标准

### 10.1 每个模块的完成标准

| 模块 | 验收标准 |
|------|----------|
| AgentLoop | 给定 mock LLM 返回预定义动作序列，循环能正确执行完整流程并停机 |
| LLMProvider | mock 模式返回预设响应；真实模式可调用 OpenAI API |
| ActionParser | 能正确解析 5 种动作类型；非法输入返回解析失败 |
| ToolExecutor | 4 种工具正确执行；超时和错误路径返回正确 ActionResult |
| Guardrail | 黑名单命令被拦截；白名单外路径被拦截；合法操作放行 |
| Verifier | 正确分类 5 种结果；severity 判定正确 |
| FeedbackInjector | 反馈正确注入 Context；不破坏已有上下文 |
| Memory | 写入可读取；滑动窗口正确裁剪；文件持久化正确 |
| Config | 配置文件加载正确；环境变量覆盖正确；默认值生效 |

### 10.2 反馈闭环深度验收

| 验收项 | 标准 |
|--------|------|
| 自适应重试 | 同一错误重复出现时提前停机，而非无限循环 |
| 反馈分类 | 正确区分 test_fail / compile_error / lint_warn / timeout |
| 反馈注入 | 结构化反馈（非纯文本）注入 LLM 上下文 |
| 确定性测试 | 移除真实 LLM 后，所有反馈闭环逻辑可用单测验证 |

### 10.3 机制演示（A 项目额外要求）

三个确定性场景（mock LLM 下运行）：

1. **护栏拦截**：构造一个 `rm -rf /` 动作，Guardrail 拦截，AgentLoop 报告 blocked
2. **反馈闭环修正**：第一次执行返回测试失败，Verifier 检出，反馈注入后第二次执行返回测试通过
3. **自适应停机**：连续注入相同错误 3 次，AgentLoop 检测到重复错误并提前停机

---

## 11. 测试策略

### 11.1 单元测试

每个组件独立测试，mock 外部依赖：

| 测试 | 内容 |
|------|------|
| LLMProvider.test.ts | mock 模式返回预设响应；真实模式 stub |
| ActionParser.test.ts | 各种格式的 LLM 输出 → 正确解析 / 解析失败 |
| Guardrail.test.ts | 危险命令 → 拦截；安全命令 → 放行 |
| Verifier.test.ts | 各种 exitCode + stdout → 正确分类 |
| FeedbackInjector.test.ts | 注入后 Context 内容正确 |
| Memory.test.ts | 读写、滑动窗口、持久化 |
| Config.test.ts | 文件加载、环境变量覆盖、默认值 |

### 11.2 集成测试

| 测试 | 内容 |
|------|------|
| AgentLoop.test.ts | mock LLM + mock Verifier，验证完整流程和停机条件 |
| 自适应重试.test.ts | 重复错误 → 提前停机；不同错误 → 正常重试 |

### 11.3 机制演示（可运行脚本）

```
# 场景 1: 护栏拦截
npm run demo:guardrail

# 场景 2: 反馈闭环修正
npm run demo:feedback-loop

# 场景 3: 自适应停机
npm run demo:adaptive-retry
```

---

## 12. 风险与未决问题

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| LLM 频繁输出无法解析的格式 | 循环在解析阶段反复失败 | 解析失败时注入明确格式要求；累计 3 次解析失败直接停机 |
| Agent 执行的操作产生不可逆影响（如覆盖文件） | 用户数据丢失 | Guardrail 检查 + 写操作前备份原文件 |
| Windows 上 keytar 依赖的系统库未安装 | 凭据功能不可用 | 备选 `.env` 方案；安装文档说明前置依赖 |
| 测试框架输出格式多样（Jest / Vitest / Mocha 差异） | Verifier 分类不准 | 初始支持 Jest/Vitest 输出格式，可扩展 |
| 自适应重试的"相同错误"判定标准过于严格 | 本应重试的 case 被误停 | 使用 Levenshtein 距离而非精确匹配，允许微小差异 |

---

## 13. 项目结构

```
code-harness/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── harness.config.json          # 默认配置
├── Dockerfile
├── .github/workflows/ci.yml
├── src/
│   ├── index.ts                 # CLI 入口
│   ├── types.ts                 # 所有接口与类型定义
│   ├── AgentLoop.ts             # 主循环
│   ├── LLMProvider.ts           # LLM 调用封装
│   ├── MockLLMProvider.ts       # mock 实现
│   ├── ActionParser.ts          # 动作解析
│   ├── ToolExecutor.ts          # 工具执行
│   ├── Guardrail.ts             # 治理护栏
│   ├── Verifier.ts              # 校验器（反馈闭环核心）
│   ├── FeedbackInjector.ts      # 反馈注入
│   ├── Memory.ts                # 记忆存储
│   ├── Config.ts                # 配置加载
│   ├── KeyManager.ts            # 凭据管理
│   └── Logger.ts                # 日志
├── tests/
│   ├── unit/
│   │   ├── LLMProvider.test.ts
│   │   ├── ActionParser.test.ts
│   │   ├── Guardrail.test.ts
│   │   ├── Verifier.test.ts
│   │   ├── FeedbackInjector.test.ts
│   │   ├── Memory.test.ts
│   │   └── Config.test.ts
│   ├── integration/
│   │   ├── AgentLoop.test.ts
│   │   └── AdaptiveRetry.test.ts
│   └── demo/
│       ├── guardrail-demo.ts
│       ├── feedback-loop-demo.ts
│       └── adaptive-retry-demo.ts
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-07-13-coding-harness-design.md
└── README.md
```