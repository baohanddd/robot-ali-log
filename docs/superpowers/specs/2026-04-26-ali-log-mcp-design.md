# 阿里云 SLS MCP Server 设计文档

**日期**: 2026-04-26
**状态**: 已更新

## 概述

构建一个支持**双模式**运行的阿里云 SLS 日志查询工具：
1. **MCP 模式**: 作为 MCP Server，通过 stdio 协议与 OpenCode 等 Client 通信，按需查询日志
2. **脚本模式**: 本地长时间运行，定时轮询获取 error 日志（默认 5 分钟间隔）

## 目标

- 支持 MCP 协议按需查询阿里云 SLS 日志
- 支持定时轮询自动获取 error 日志
- 支持基础查询、条件过滤和统计分析
- 使用环境变量进行阿里云认证
- 单一日志库查询场景

## 非目标

- 多日志库管理
- 日志写入/删除操作
- 复杂的权限管理
- Web UI 界面

## 双模式架构

### MCP 模式

```
┌─────────────┐      stdio      ┌─────────────────────┐      HTTP      ┌──────────────┐
│  MCP Client │ ◄─────────────► │  Ali Log MCP Server │ ◄─────────────► │ 阿里云 SLS   │
│  (OpenCode) │                 │  (mode: mcp)        │                │              │
└─────────────┘                 └─────────────────────┘                └──────────────┘
```

### 脚本模式

```
┌─────────────────────┐      HTTP      ┌──────────────┐
│  Ali Log Daemon     │ ◄─────────────► │ 阿里云 SLS   │
│  (mode: daemon)     │                │              │
│  - 定时轮询         │                │              │
│  - 过滤 error       │                │              │
│  - 输出到 console   │                │              │
└─────────────────────┘                └──────────────┘
```

## 模式切换

通过环境变量 `RUN_MODE` 控制运行模式：

- `mcp` (默认): MCP Server 模式，等待 Client 调用
- `daemon`: 脚本/守护进程模式，定时轮询

## 组件

### 1. 认证模块 (auth.ts)

从环境变量读取阿里云凭证：

- `ALICLOUD_ACCESS_KEY_ID` - AccessKey ID
- `ALICLOUD_ACCESS_KEY_SECRET` - AccessKey Secret
- `ALICLOUD_REGION` (可选) - 区域，默认 `cn-hangzhou`

启动时检查环境变量是否存在，缺失则报错退出。

### 2. SLS Client 封装 (sls-client.ts)

使用 `@alicloud/sls20201230` SDK 封装 SLS 操作：

- 初始化 Client，配置 endpoint 和凭证
- 提供 `queryLogs` 方法，接收查询参数
- 处理请求签名和重试
- 支持幂等查询（记录查询状态）

### 3. MCP Server 模式 (mcp-mode.ts)

使用 `@modelcontextprotocol/sdk` 创建 server：

**工具注册**: `query_sls_logs`

**参数定义**:

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| project | string | 是 | - | SLS 项目名 |
| logstore | string | 是 | - | 日志库名 |
| query | string | 是 | - | 查询语句 (SLS 查询语法或 SQL) |
| from | string | 是 | - | 开始时间 (Unix 时间戳或相对时间如 "1h ago") |
| to | string | 是 | - | 结束时间 |
| limit | number | 否 | 100 | 返回条数限制 (最大 1000) |

**响应格式**:

```json
{
  "logs": [
    {"time": 1714118400, "content": "..."},
    ...
  ],
  "count": 100,
  "has_more": false
}
```

### 4. 脚本/守护进程模式 (daemon-mode.ts)

定时轮询获取 error 日志：

**配置（环境变量）**:

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| SLS_PROJECT | 是 | - | SLS 项目名 |
| SLS_LOGSTORE | 是 | - | 日志库名 |
| POLL_INTERVAL | 否 | 300 | 轮询间隔（秒），默认 5 分钟 |
| ERROR_QUERY | 否 | `level: ERROR` | 过滤 error 日志的查询语句 |
| DAEMON_OUTPUT | 否 | `console` | 输出方式: `console`, `file` |
| LOG_FILE_PATH | 否 | `./logs/error.log` | 文件输出路径 |

**轮询逻辑**:

1. 启动时立即执行一次查询（查询最近 interval 时间段）
2. 记录最后查询时间戳 `last_query_time`
3. 按 `POLL_INTERVAL` 间隔执行定时任务
4. 每次查询范围: `[last_query_time, now]`
5. 更新 `last_query_time = now`
6. 输出查询结果（console 或写入文件）

**去重处理**:
- 使用时间戳 + 日志内容哈希作为唯一标识
- 维护最近 1000 条已输出日志的哈希集合
- 避免重复输出相同日志

### 5. 时间解析器 (time-parser.ts)

支持相对时间解析：

- `"1h ago"` → 当前时间前 1 小时
- `"30m ago"` → 当前时间前 30 分钟
- `"1d ago"` → 当前时间前 1 天
- 纯数字字符串视为 Unix 时间戳（秒级）

### 6. 响应格式化 (formatter.ts)

- **MCP 模式**: 将 SLS 返回的日志数据格式化为 Markdown 表格或 JSON
- **脚本模式**: 格式化为带时间戳的单行文本，便于阅读

## 数据流

### MCP 模式
1. MCP Client 调用 `query_sls_logs` 工具
2. Server 解析并验证参数
3. 时间解析器转换相对时间为 Unix 时间戳
4. SLS Client 调用阿里云 API
5. 格式化器处理响应数据
6. 返回格式化后的结果给 Client

### 脚本模式
1. 定时器触发（或启动时立即执行）
2. 计算查询时间范围 `[last_query_time, now]`
3. SLS Client 查询 error 日志
4. 去重过滤器排除已输出日志
5. 格式化器输出到新日志
6. 更新 `last_query_time`

## 错误处理

| 错误场景 | 处理方式 |
|----------|----------|
| 环境变量缺失 | 启动时检查，输出明确错误信息并退出 |
| 阿里云 API 错误 | 捕获 SDK 异常，记录错误日志，脚本模式下继续轮询 |
| 参数验证失败 | 返回参数错误提示（MCP 模式） |
| 请求超时 | 设置 30s 超时，超时记录错误并继续（脚本模式） |
| 查询结果过大 | 按 limit 截断，标记 has_more（MCP 模式） |
| 文件写入失败 | 回退到 console 输出（脚本模式） |

## 项目结构

```
ali-log/
├── src/
│   ├── index.ts          # 入口，根据 RUN_MODE 启动对应模式
│   ├── auth.ts           # 认证与环境变量处理
│   ├── sls-client.ts     # SLS SDK 封装
│   ├── mcp-mode.ts       # MCP Server 模式实现
│   ├── daemon-mode.ts    # 脚本/守护进程模式实现
│   ├── time-parser.ts    # 时间解析
│   ├── formatter.ts      # 响应格式化
│   └── types.ts          # 类型定义
├── logs/                 # 脚本模式日志输出目录（gitignore）
├── package.json
├── tsconfig.json
└── README.md
```

## 依赖

- `@modelcontextprotocol/sdk` - MCP 协议实现
- `@alicloud/sls20201230` - 阿里云 SLS SDK
- `typescript` - TypeScript 编译
- `tsx` - 开发运行（替代 ts-node，更快）

## 安全考虑

- 绝不将 AccessKey 硬编码到代码中
- 不记录或输出敏感凭证
- 最小权限原则：仅需要 SLS 读权限
- 脚本模式下日志文件注意权限控制

## 测试策略

- 单元测试：时间解析器、格式化器、参数验证、去重逻辑
- 集成测试：使用 mock 测试 SLS Client 交互
- 手动测试：
  - MCP 模式：配置 OpenCode 调用工具
  - 脚本模式：启动后观察定时查询和输出

## 使用示例

### MCP 模式

```bash
export ALICLOUD_ACCESS_KEY_ID=xxx
export ALICLOUD_ACCESS_KEY_SECRET=xxx
export RUN_MODE=mcp
npx tsx src/index.ts
```

OpenCode 配置：
```json
{
  "mcpServers": {
    "ali-log": {
      "command": "npx",
      "args": ["tsx", "/path/to/ali-log/src/index.ts"],
      "env": {
        "ALICLOUD_ACCESS_KEY_ID": "xxx",
        "ALICLOUD_ACCESS_KEY_SECRET": "xxx"
      }
    }
  }
}
```

### 脚本模式

```bash
export ALICLOUD_ACCESS_KEY_ID=xxx
export ALICLOUD_ACCESS_KEY_SECRET=xxx
export RUN_MODE=daemon
export SLS_PROJECT=my-project
export SLS_LOGSTORE=my-logstore
export POLL_INTERVAL=300
npx tsx src/index.ts
```
