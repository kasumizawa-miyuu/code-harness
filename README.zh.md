# code-harness

> [English](README.md) · **中文**

一个轻量级、反馈闭环驱动的 Coding Agent Harness。为 AI4SE 期末项目构建。

**核心等式：** Agent = LLM + Harness。本项目实现的是 harness 层——将 LLM 的"下一步决策"转化为可靠、可测试的自动化系统的工程层。

## 快速开始

### 方式 1：CLI（直接访问本地文件）

```bash
git clone https://github.com/kasumizawa-miyuu/code-harness.git
cd code-harness
npm install
npm run build
npm link

# 配置
harness configure
harness key update

# 运行任务
cd your/work/place
harness run "fix the failing test"
```

### 方式 2：Docker（WebUI + 本地文件访问）

```bash
docker build -t code-harness .
docker run -v $(pwd):/workspace -w /workspace -p 3000:3000 code-harness
```

打开 http://localhost:3000

`-v $(pwd):/workspace` 挂载将当前目录映射到容器内供 Agent 访问。

### 方式 3：云端 WebUI

访问 https://code-harness.onrender.com — 无需安装。上传项目 zip 文件，Agent 在隔离的云端工作区中操作。

## 命令

| 命令 | 说明 |
|------|------|
| `harness configure` | 交互式配置（LLM 供应商、Base URL、模型） |
| `harness run "<task>"` | 运行编码任务 |
| `harness serve` | 启动 WebUI 服务（http://localhost:3000） |
| `harness key status` | 查看 API Key 状态 |
| `harness key update` | 设置/更新 API Key（隐藏输入） |
| `harness key clear` | 删除已存储的 API Key |

## API Key 安全

- API Key 通过 `keytar` 存储在操作系统钥匙串中（Windows Credential Manager / macOS Keychain / Linux Secret Service）
- 支持 `HARNESS_API_KEY` 环境变量作为备选方案（注意：`.env` 文件为明文存储，进程环境变量对同一台机器的其他进程可见）
- Key 绝不硬编码、不记录日志、不提交到 Git
- Key 状态显示从不泄露完整 Key

## 分发

### npm

```bash
npm install -g @student/code-harness
```

### Docker

```bash
docker build -t code-harness .
docker run -v $(pwd):/workspace -w /workspace -p 3000:3000 code-harness
```

## 项目结构

```
code-harness/
├── src/           # 源代码（harness 内核）
│   ├── AgentLoop.ts          # 主循环编排器
│   ├── LLMProvider.ts        # LLM 调用封装（可替换为 mock）
│   ├── MockLLMProvider.ts    # Mock 实现，用于确定性测试
│   ├── ActionParser.ts       # 基于正则的动作解析
│   ├── ToolExecutor.ts       # 文件操作 + shell 执行 + 路径沙箱
│   ├── Guardrail.ts          # 危险命令拦截 + 路径白名单
│   ├── Verifier.ts           # 5 分类反馈校验器
│   ├── FeedbackInjector.ts   # 结构化反馈注入
│   ├── Memory.ts             # KV 存储（滑动窗口）
│   ├── WorkspaceManager.ts   # 云端工作区生命周期管理
│   ├── Config.ts             # 配置加载（JSON + 环境变量覆盖）
│   ├── KeyManager.ts         # 凭据管理（keytar）
│   ├── Logger.ts             # 日志工具
│   ├── server.ts             # Express 服务器（WebUI 后端）
│   └── types.ts              # 所有接口和类型定义
├── tests/         # 测试（单元 + 集成 + 演示）
│   ├── unit/       # 11 个测试文件，44+ 个测试用例
│   ├── integration/# 4 个测试文件
│   └── demo/       # 3 个机制演示脚本
├── public/        # WebUI 静态文件
├── docs/          # 设计文档
├── SPEC.md        # 设计规约
├── PLAN.md        # 实现计划
├── AGENT_LOG.md   # 开发日志
├── SPEC_PROCESS.md# 规约生成过程
├── REFLECTION.md  # 项目反思报告（1500-2500 字）
├── Dockerfile
└── render.yaml    # Render 部署配置
```

## 机制演示

以下演示使用 mock LLM 运行，无需真实 API Key：

```bash
npm run demo:guardrail       # 护栏拦截危险命令
npm run demo:feedback-loop   # Agent 失败 → 反馈 → 重试 → 成功
npm run demo:adaptive-retry  # 重复错误 → 提前停机
```

## 测试

```bash
npm test            # 运行全部测试（63 个，全部使用 mock LLM）
npm run test:watch  # 监听模式
```

所有测试使用 mock LLM — 无需网络，无需真实 API 调用。每次 push 自动运行 CI。

## 架构

**6 个组件 + 1 个循环：**

```
AgentLoop.run():
  buildContext → LLMProvider.call → ActionParser.parse
  → Guardrail.check → ToolExecutor.execute
  → Verifier.verify → (FeedbackInjector.inject | done)
```

**关键设计决策：**
- **反馈闭环**是深入维度（Verifier + FeedbackInjector + 自适应重试）
- **防御纵深工作区隔离**：系统提示词 → Guardrail（路径归一化）→ ToolExecutor（硬编码路径沙箱）
- 所有机制可用 mock LLM 测试；移除真实 LLM 后仍有可验证的工程

## 部署

**云端：** 部署在 Render 免费版，地址 https://code-harness.onrender.com
- 15 分钟无活动后休眠，首次请求唤醒
- 云端模式：上传 zip → 隔离工作区 → Agent 操作 → 下载结果
- 工作区隔离由三层防御保障（提示词 + guardrail + executor）

**CI/CD：** GitHub Actions 每次 push 自动运行 `npm test` + `tsc --noEmit`，然后构建 Docker 镜像。

## 已知限制

- Windows：`keytar` 需要原生模块——如果安装失败，请使用 `HARNESS_API_KEY` 环境变量
- 仅支持 OpenAI 兼容 API
- Verifier 正则表达式针对 Vitest 优化；其他测试框架可能无法正确分类
- **边界说明：** code-harness 是一个代码执行与修改工具——它读文件、写文件、运行命令。它不是一个聊天或代码解释工具。要求它"解释这段代码在做什么"不会产生有用结果；请用它执行具体的编码任务，如"修复这个 bug"或"添加一个功能"

## 许可证

MIT