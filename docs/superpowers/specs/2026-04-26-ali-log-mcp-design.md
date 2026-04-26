# 阿里云 SLS MCP Server 设计文档

**日期**: 2026-04-26
**状态**: 已批准

## 概述

构建一个基于 MCP (Model Context Protocol) 的 Server，用于查询阿里云 SLS (日志服务) 中的日志数据。通过 stdio 协议与 OpenCode 等 MCP Client 通信，暴露日志查询工具。

## 目标

- 支持通过 MCP 协议查询阿里云 SLS 日志
- 支持基础查询、条件过滤和统计分析
- 使用环境变量进行阿里云认证
- 单一日志库查询场景

## 非目标

- 多日志库管理
- 日志写入/删除操作
- 实时监控
- 复杂的权限管理

## 架构

基于 MCP SDK (`@modelcontextprotocol/sdk`) 构建 stdio 协议的 MCP Server。

```
┌─────────────┐      stdio      ┌─────────────────────┐      HTTP      ┌──────────────┐
│  MCP Client │ ◄─────────────► │  Ali Log MCP Server │ ◄─────────────► │ 阿里云 SLS   │
│  (OpenCode) │                 │  (@alicloud/sls)    │                │              │
└─────────────┘                 └─────────────────────┘                └──────────────┘
                                         │
                                         ▼
                                ┌─────────────────┐
                                │ 环境变量凭证     │
                                │ ALICLOUD_*      │
                                └─────────────────┘
```

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

### 3. MCP Server (index.ts)

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

### 4. 时间解析器 (time-parser.ts)

支持相对时间解析：

- `"1h ago"` → 当前时间前 1 小时
- `"30m ago"` → 当前时间前 30 分钟
- `"1d ago"` → 当前时间前 1 天
- 纯数字字符串视为 Unix 时间戳（秒级）

### 5. 响应格式化 (formatter.ts)

将 SLS 返回的原始日志格式化为易读的 Markdown 表格或结构化 JSON。

## 数据流

1. MCP Client 调用 `query_sls_logs` 工具
2. Server 解析并验证参数
3. 时间解析器转换相对时间为 Unix 时间戳
4. SLS Client 调用阿里云 API
5. 格式化器处理响应数据
6. 返回格式化后的结果给 Client

## 错误处理

| 错误场景 | 处理方式 |
|----------|----------|
| 环境变量缺失 | 启动时检查，输出明确错误信息并退出 |
| 阿里云 API 错误 | 捕获 SDK 异常，返回包含错误码和消息的结构化错误 |
| 参数验证失败 | 返回参数错误提示 |
| 请求超时 | 设置 30s 超时，超时返回友好提示 |
| 查询结果过大 | 按 limit 截断，标记 has_more |

## 项目结构

```
ali-log/
├── src/
│   ├── index.ts          # MCP Server 入口，工具注册
│   ├── auth.ts           # 认证与环境变量处理
│   ├── sls-client.ts     # SLS SDK 封装
│   ├── time-parser.ts    # 时间解析
│   ├── formatter.ts      # 响应格式化
│   └── types.ts          # 类型定义
├── package.json
├── tsconfig.json
└── README.md
```

## 依赖

- `@modelcontextprotocol/sdk` - MCP 协议实现
- `@alicloud/sls20201230` - 阿里云 SLS SDK
- `typescript` - TypeScript 编译
- `ts-node` / `tsx` - 开发运行

## 安全考虑

- 绝不将 AccessKey 硬编码到代码中
- 不记录或输出敏感凭证
- 最小权限原则：仅需要 SLS 读权限

## 测试策略

- 单元测试：时间解析器、格式化器、参数验证
- 集成测试：使用 mock 测试 SLS Client 交互
- 手动测试：配置真实环境变量，查询实际日志库
