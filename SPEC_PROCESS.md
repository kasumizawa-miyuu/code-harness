# SPEC_PROCESS.md — Spec & Plan Generation Process

## Brainstorming Key Nodes

### Node 1: Project Type Selection

AI 给出了三个选项：
- **A) 反馈闭环驱动的 Coding Agent Harness** — 核心等式 Agent = LLM + Harness，聚焦"当 LLM 犯错时，工程代码能否检测、分类、驱动修正"
- **B) 多 Agent 编排系统** — 多个 agent 协作完成复杂任务
- **C) 上下文工程系统** — 专注记忆、检索、上下文窗口管理

**决策：** 选择 A。理由：反馈闭环的代码密度最高，确定性测试最清晰，最符合课程"机制必须是代码"的要求。

### Node 2: 深入维度选择

AI 建议在六个维度（决策/工具/记忆/治理/反馈/配置）中选一个深入。
- 建议：反馈闭环（Verifier + FeedbackInjector + 自适应重试）
- 原因：天然由代码构成，移除 LLM 后仍可用单测验证

**决策：** 采纳。反馈闭环作为主要贡献维度。

### Node 3: 技术选型

| 维度 | AI 建议 | 决策 |
|------|---------|------|
| 语言 | TypeScript | 采纳 |
| 测试框架 | Vitest | 采纳 |
| LLM 供应商 | OpenAI | 采纳 |
| 钥匙串 | keytar (跨平台) | 采纳 |
| 分发 | npm + Docker | 采纳 |

### Node 4: 架构模式

AI 提出 Clean Loop 架构 vs 事件驱动架构
- Clean Loop: 单线程顺序执行，每个阶段可插拔
- 事件驱动: 各组件通过事件总线通信

**决策：** Clean Loop。更简单、更可测试、更符合 harness 场景。

## 关键迭代记录

### 迭代 1: 从"实现一个 Coding Agent"到"Harness 的六个维度"

**AI 追问：** "你想要的究竟是一个能帮你写代码的 agent，还是一个能让你构建 agent 的框架？"

**修正：** 原设想是做一个"直接可用的编码 agent"，但课程要求是"构建一个 harness 内核"。AI 帮我澄清了这层区别，Spec 从"功能列表"转向了"机制设计"。

### 迭代 2: "移除 LLM 后还能测试吗"判据

**AI 追问：** "如果移除真实 LLM，你的反馈闭环还剩什么？"

**修正：** 这一问暴露了最初设计的薄弱点——原方案中 Verifier 的部分逻辑依赖 LLM 判断。改为纯代码实现：Verifier 用正则+规则匹配，Guardrail 用字符串匹配，自适应停机用循环计数器。

### 迭代 3: 凭据威胁模型细化

**AI 追问：** "API Key 可能通过哪些途径泄露？"

**修正：** 原设计只考虑了"不硬编码"。AI 给出了完整的威胁模型：源码提交、日志输出、终端历史、进程环境变量、.env 明文文件。据此补充了 KeyManager 的脱敏日志、隐藏输入录入、keytar 钥匙串存储。

## 用户故事的 INVEST 检查

AI 将 3 个 user story 扩充到 5 个，覆盖了：
1. 修复测试失败（核心功能）
2. 添加功能（扩展用例）
3. 安全配置 Key（凭据流程）
4. 安全边界（治理需求）
5. CI 集成（非功能需求）

**修正：** 采纳了 AI 建议的 5 个 user story，并补充了验收标准。

## 反思：brainstorming 技能的表现

**做得好的地方：**
- 追问质量高：每个关键决策点都给出了多个选项和理由
- 凭据威胁模型的分析非常全面，远超我最初的设想
- "移除 LLM 后还能测试吗"这一判据从根本上改变了架构设计方向

**不满的地方：**
- 部分设计细节过于冗长（如配置文件的每个字段说明）
- 对分发方案的讨论不够深入（Docker 多阶段构建的最佳实践需要手动补充）
- 没有自动检测技术栈的兼容性问题（如 keytar 在 Windows 上的原生模块依赖）

## 两阶段评审记录

### 第一阶段：Spec 合规检查

在实现完成后，对每个模块的产出物对照 SPEC 进行了合规性检查。检查内容包括：
- 接口定义是否与 SPEC §3 功能规约一致
- 边界条件处理是否覆盖 SPEC 中列出的所有情况
- 错误处理逻辑是否符合 SPEC 中的描述

**结果：** 所有模块的接口定义与 SPEC 一致，未发现规约级别的偏差。

### 第二阶段：代码质量检查

在 spec 合规检查通过后，进行了代码质量审查（`requesting-code-review` skill），发现以下问题：

| 问题 | 影响 | 修复 |
|------|------|------|
| AgentLoop 直接使用 MockLLMProvider 而非 config 选择 | 扩展性差，无法切换真实 LLM | 改为接受可选 `llmProvider` 参数 |
| `readline` 导入使用了错误的 API | 功能不可用 | 修复为 `createInterface` + `question` |
| 帮助文本格式问题 | 用户体验差 | 修正格式化 |
| 缺少默认 `harness.config.json` | 首次运行需要手动创建 | 添加默认配置文件 |

**Critical issue 修复：** 所有 4 个问题在进入下一阶段前全部修复（commit `2bc040f`）。

## 冷启动验证

### 验证信息

| 项目 | 内容 |
|------|------|
| 主开发 agent | OpenCode（当前 session） |
| 冷启动 agent | Claude Code v2.1.207 |
| 冷启动模型 | deepseek-v4-flash（与主开发相同） |
| 选择的任务 | Task 1（项目脚手架 + types.ts）+ Task 5（ActionParser） |
| 验证日期 | 2026-07-13 |
| 产出目录 | `cold-start-test/code-harness/` |

### 验证过程

1. 在全新终端中启动 Claude Code，进入 `cold-start-test/` 目录
2. 仅提供 `SPEC.md` 和 `PLAN.md` 两个文件
3. 指令："请阅读 SPEC.md 和 PLAN.md，从 PLAN.md 中选择 1-2 个 task 独立实现。遇到不确定之处请暂停询问我。"
4. Claude Code 自主选择了 Task 1 和 Task 5，完成后报告成功

### 产出分析

**Task 1 产出物：**
- `package.json` — 与 PLAN.md 完全一致，无偏差
- `tsconfig.json` — 与 PLAN.md 完全一致，无偏差
- `vitest.config.ts` — 与 PLAN.md 完全一致，无偏差
- `.gitignore` — 与 PLAN.md 完全一致，无偏差
- `src/types.ts` — 116 行，定义了全部 13 个核心接口，与 SPEC §6 数据模型完全一致

**Task 5 产出物：**
- `src/ActionParser.ts` — 34 行，实现 5 种动作的正则解析，与 SPEC §3.3 完全一致
- `tests/unit/ActionParser.test.ts` — 6 个测试用例，覆盖全部动作类型和边界条件

### 偏差分析

**未发现偏差。** Claude Code 的实现与 SPEC 和 PLAN.md 完全一致，未做任何额外假设或偏离。

### 对 SPEC 质量的反馈

冷启动 agent 在整个过程中没有遇到不确定之处，没有暂停询问。这说明 SPEC.md 和 PLAN.md 的清晰度足够高——一个没有任何项目背景知识的 agent 可以仅凭文档独立完成任务。

### 与主开发实现的对比

主开发（OpenCode）和冷启动（Claude Code）在 Task 1 和 Task 5 上的产出物内容完全一致，代码风格和接口定义无差异。这验证了 SPEC 和 PLAN.md 的明确性——两个不同的 agent 读同一份文档，产出了相同的代码。

---

## 2026-07-24: 云端工作区设计

### 背景

WebUI 部署到 Render 后，`process.cwd()` 返回 `/app`，Agent 无法操作用户本地文件，且可能误修改服务器文件。

### 探索过程

**已经确定的需求：**
1. 检测云端环境，拒绝运行任务直到上传工作区
2. 上传 zip 到临时目录，Agent 完整操作
3. 可下载修改后的工作区
4. 上传时提示 zip 格式，保留目录结构

**AI 提出的方案：**
- A) 纯浏览器端虚拟文件系统（IndexedDB）— 安全但功能受限
- B) 服务端临时工作区 — 功能完整但需清理
- C) Git 集成 — 适合代码项目但复杂度高

**决策：** A+B 混合方案。上传 zip 到服务端临时目录，Agent 完整操作，可下载结果。

### 对 SPEC 的更新

在 SPEC 中新增 §3.10 云端工作区，定义了云端工作区的输入/行为/输出/边界条件/错误处理。创建了 `docs/superpowers/specs/2026-07-24-cloud-workspace-design.md` 详细设计文档。

### 对 PLAN 的更新

新增 3 个 task：
- Task 18: WorkspaceManager 核心模块（创建 session、zip 解压、文件树、压缩下载、清理）
- Task 19: 服务端集成（环境检测、API 端点、前端 UI）
- Task 20: 文档更新