# Cloud Workspace: 云端工作区上传与隔离

> 日期：2026-07-24
> 状态：设计定稿
> 关联：SPEC §3.1 AgentLoop, SPEC §3.4 ToolExecutor, SPEC §3.5 Guardrail, 通用要求 §3.2 分发, 通用要求 §4.11 云部署

---

## 1. 问题陈述

### 1.1 当前问题

code-harness 部署到云端（如 Render）后，`process.cwd()` 返回服务器的应用目录（如 `/app`），Agent 的 `workDir` 和 `allowedPaths` 均指向该目录。这导致两个问题：

- **无用**：用户的工作目录不在服务器上，Agent 读/写的文件与用户无关
- **危险**：Agent 可能意外修改服务器自身文件（如 `server.ts`、`public/index.html`）

### 1.2 目标

为云端部署提供安全的、可操作的工作区机制：

1. **环境检测**：自动识别是否在云端环境（非本地/Docker），若是则进入"云端模式"
2. **工作区上传**：用户上传 zip 压缩包作为工作区，解压到服务端临时目录
3. **文件操作**：Agent 在临时目录中正常读写和执行命令
4. **结果下载**：用户可下载修改后的工作区（zip 格式）
5. **安全清理**：会话结束后自动清理临时文件

---

## 2. 设计

### 2.1 环境检测

在 `server.ts` 启动时检测运行环境：

| 条件 | 判断逻辑 | 模式 |
|------|----------|------|
| `process.cwd()` 包含 `/app` 或 `/var/task` 等已知云端路径 | 检查路径前缀 | 云端模式 |
| 环境变量 `RENDER`、`RAILWAY`、`FLY_APP_NAME` 等存在 | 检查平台特定环境变量 | 云端模式 |
| 以上都不满足 | 默认 | 本地/Docker 模式 |

云端模式下：
- 前端显示"上传工作区"界面
- 拒绝执行任务直到上传工作区
- `POST /api/run` 检查 `workDir` 是否为临时目录，若不是则返回错误

### 2.2 新增 API 端点

#### `POST /api/workspace/upload`

接收 zip 文件，解压到服务端临时目录。

```
请求: multipart/form-data
  - file: <zip 文件>
响应: { sessionId, rootDir, files: string[] }
```

**处理流程：**
1. 生成唯一 session ID (UUID)
2. 创建临时目录 `/tmp/workspace-<sessionId>/`
3. 解压 zip 到该目录（保留目录结构）
4. 扫描文件树，返回文件列表
5. 设置 `workDir` 为该目录
6. 更新 `allowedPaths` 为 `[rootDir]`

#### `GET /api/workspace/download`

下载当前工作区（zip 格式）。

```
响应: application/zip
文件名: workspace-<sessionId>.zip
```

**处理流程：**
1. 获取当前 session 的临时目录
2. 递归压缩该目录所有文件
3. 返回 zip 流

#### `GET /api/workspace/status`

获取当前工作区状态。

```
响应: { hasWorkspace, rootDir, sessionId, fileCount, fileTree }
```

### 2.3 前端 UI 变化

**云端模式下（无工作区）：**
- 主输入区域显示"上传工作区"界面
- 拖拽/点击上传 zip 文件
- 提示："请上传包含项目文件的 zip 压缩包"
- 上传后显示文件树和当前工作目录路径

**云端模式下（有工作区）：**
- 正常显示任务输入和运行界面
- 侧边栏"工作目录"区域显示上传后的根目录及其文件树
- 新增"下载工作区"按钮
- 新增"切换工作区"按钮（重新上传）

**写操作提示：**
- 当 Agent 执行写操作时，在 UI 中显示提示："修改已保存到临时工作区，请下载以保留更改"
- 不对写操作做拦截，因为临时目录是安全的

### 2.4 后端实现

#### WorkspaceManager

```typescript
class WorkspaceManager {
  private sessions: Map<string, WorkspaceSession>

  createSession(): WorkspaceSession
  uploadZip(sessionId: string, zipBuffer: Buffer): Promise<void>
  getFileTree(sessionId: string): FileNode[]
  downloadZip(sessionId: string): Promise<Buffer>
  cleanup(sessionId: string): void
  cleanupAll(): void
}
```

#### 依赖

- `adm-zip` 或 `archiver` + `unzipper`：处理 zip 压缩/解压
- `node:crypto`：生成 UUID

#### 安全措施

- 临时目录限制在 `/tmp/` 下，不超出系统临时目录
- 解压时做路径穿越防护（拒绝 `../` 路径）
- 最大文件大小限制（如 100MB）
- 自动清理：服务端定时任务每小时清理过期会话（>1小时无活动）
- 写操作在临时目录内进行，不影响服务器文件

### 2.5 数据流

```
用户上传 zip → POST /api/workspace/upload
                   → 解压到 /tmp/workspace-<sessionId>/
                   → 返回文件树
                   → 前端显示工作区

用户点击 Run Task → POST /api/run
                   → workDir = /tmp/workspace-<sessionId>/
                   → Agent 正常执行（读/写/执行命令）
                   → 返回结果

用户下载结果 → GET /api/workspace/download
                   → 压缩临时目录
                   → 返回 zip
```

---

## 3. 文件变更

### 新增文件

| 文件 | 用途 |
|------|------|
| `src/WorkspaceManager.ts` | 工作区管理（上传、解压、文件树、压缩、清理） |
| `tests/unit/WorkspaceManager.test.ts` | WorkspaceManager 单元测试 |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/server.ts` | 添加环境检测、新增 3 个 API 端点、注入 WorkspaceManager |
| `public/index.html` | 添加上传界面、文件树显示、下载按钮 |
| `package.json` | 添加 `adm-zip` 依赖 |

### 更新文档

| 文档 | 更新内容 |
|------|----------|
| `SPEC.md` | 新增 §3.10 云端工作区，更新 §8 分发设计 |
| `PLAN.md` | 新增云工作区实现 task |
| `SPEC_PROCESS.md` | 记录本次 brainstorming 过程 |
| `AGENT_LOG.md` | 记录本次 session |
| `docs/superpowers/specs/2026-07-24-cloud-workspace-design.md` | 本设计文档 |

---

## 4. 测试策略

### 单元测试

| 测试 | 内容 |
|------|------|
| WorkspaceManager.test.ts | 创建 session、上传 zip、文件树、下载 zip、清理 |

### 手动测试

| 场景 | 步骤 |
|------|------|
| 云端模式检测 | 启动时设置 `RENDER=true`，验证进入云端模式 |
| 上传工作区 | 在 UI 上传 zip，验证文件树显示正确 |
| 运行任务 | 上传后运行任务，验证 Agent 能读取工作区文件 |
| 下载工作区 | 运行任务后下载，验证 zip 包含修改后的文件 |
| 无工作区运行 | 未上传时点击 Run Task，验证被拒绝 |

---

## 5. 验收标准

| 验收项 | 标准 |
|--------|------|
| 环境检测 | 云端环境正确识别为云端模式，本地环境不受影响 |
| 文件上传 | zip 上传后目录结构保留，文件树显示正确 |
| Agent 操作 | 上传后 Agent 能正常读/写工作区文件并执行命令 |
| 结果下载 | 下载的 zip 包含修改后的文件，目录结构完整 |
| 路径安全 | 解压时拒绝 `../` 路径穿越，临时文件不污染服务器 |
| 自动清理 | 服务器不会无限积累临时文件 |

---

## 6. 未决问题/风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| 大文件上传超时 | 用户无法上传大型项目 | 设置 100MB 上限，前端显示进度条 |
| 多个用户共享服务器 | 文件互相干扰 | 每个 session 独立临时目录，UUID 隔离 |
| 临时文件堆积 | 磁盘空间不足 | 定时清理 + 最大会话数限制 |
| Render 无状态文件系统 | 临时文件在重启后丢失 | 设计上接受此限制，提示用户下载结果 |