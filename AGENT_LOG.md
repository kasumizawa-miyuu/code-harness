# AGENT_LOG.md — Code Harness Development Log

## 2026-07-13

### 00: Brainstorming — Skill: `brainstorming`

**Prompt context:** "AI4SE 期末项目，选择 Coding Agent Harness 方向"

**Key interactions:**
- AI 追问了三个设计方案：A) 反馈闭环驱动，B) 多 Agent 编排，C) 上下文工程
- 选择了 A（反馈闭环驱动），原因：代码密度最高、确定性测试最清晰、最符合"机制必须是代码"的要求
- 决定了 TypeScript + Vitest + OpenAI API 的技术栈
- 决定以"反馈闭环"作为深入维度

**Human decisions:**
- 选择 A 方案而非 B/C
- 采用 Clean Loop 架构而非事件驱动
- 决定 npm + Docker 双分发形态

### 01: Writing Plans — Skill: `writing-plans`

**Output:** `PLAN.md` with 17 tasks, each with test-first TDD steps, file paths, and verification commands.

**Key decisions:**
- Task 1-17: 从脚手架到 README，颗粒度为每个模块 2-5 分钟
- 每个 task 包含"先写失败测试 → 实现 → 验证通过"的完整 TDD 循环
- 依赖关系标注：Task 2-10 可并行，Task 11 依赖 2-10，Task 14-17 依赖 11

### 02: Worktree Creation — Skill: `using-git-worktrees`

**Created 12 worktree branches:**
```
task/2-config    task/3-logger    task/4-llm
task/5-parser    task/6-executor  task/7-guardrail
task/8-verifier  task/9-injector  task/10-memory
task/11-agentloop task/12-keymanager task/13-cli
task/14-adaptiveretry task/15-demos task/16-docker
task/17-readme
```

### 03-14: Subagent-Driven Development — Skill: `subagent-driven-development`

Each task implemented by a fresh subagent in its own worktree, following TDD.

| Task | Branch | Files | Test Count | Commit |
|------|--------|-------|------------|--------|
| 2: Config | `task/2-config` | `src/Config.ts` | 3 tests | `4b0997a` |
| 3: Logger | `task/3-logger` | `src/Logger.ts` | 3 tests | `596ed2c` |
| 4: LLMProvider | `task/4-llm` | `src/LLMProvider.ts`, `src/MockLLMProvider.ts` | 3 tests | `3c99902` |
| 5: ActionParser | `task/5-parser` | `src/ActionParser.ts` | 6 tests | `4bccc07` |
| 6: ToolExecutor | `task/6-executor` | `src/ToolExecutor.ts` | 4 tests | `d7ba108` |
| 7: Guardrail | `task/7-guardrail` | `src/Guardrail.ts` | 4 tests | `eb2b7b8` |
| 8: Verifier | `task/8-verifier` | `src/Verifier.ts` | 5 tests | `2db97ac` |
| 9: FeedbackInjector | `task/9-injector` | `src/FeedbackInjector.ts` | 3 tests | `eaf6f13` |
| 10: Memory | `task/10-memory` | `src/Memory.ts` | 4 tests | `7ef0037` |
| 11: AgentLoop | `task/11-agentloop` | `src/AgentLoop.ts` | 3 integration tests | `027dce2` |
| 12: KeyManager | `task/12-keymanager` | `src/KeyManager.ts` | 2 tests | `0df379a` |
| 13: CLI | `task/13-cli` | `src/index.ts` | 1 test | `63c739a` |
| 14: AdaptiveRetry | `task/14-adaptiveretry` | Integration tests | 3 tests | `b6123c0` |
| 15: Demos | `task/15-demos` | 3 demo scripts | — | `22388d7` |
| 16: Docker+CI | `task/16-docker` | `Dockerfile`, `ci.yml` | — | `7ef0037` |
| 17: README | `task/17-readme` | `README.md` | — | `027dce2` |

**Total: 44 tests across 13 test files, all passing with mock LLM (no real API calls).**

### 15: Code Review — Skill: `requesting-code-review`

**Review findings:**
1. AgentLoop provider used `createMockLLMProvider` directly instead of config-based selection
2. `readline` import used wrong API (`question` vs `createInterface`)
3. Help text formatting issue
4. Missing `harness.config.json` default config

**Fixes applied:** Commit `2bc040f` — addressed all 4 findings.

### 16: Post-Review

**Actions taken:**
- All 12 worktree branches merged into `main`
- Pushed `main` to GitHub
- Pushed all 12 worktree branches to GitHub
- Verified: 44/44 tests pass, CI configured with `unit-test` job

### Notes on PR Workflow

Due to the workflow sequence (branches merged locally before pushing to GitHub), the 12 worktree branches cannot have standalone PRs on GitHub — their commits are already in `main`. The branches exist on GitHub for reference. In a future project, worktree branches should be pushed to GitHub and PRs created **before** merging to main.