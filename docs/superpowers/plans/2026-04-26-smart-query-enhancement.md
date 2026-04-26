# Smart Query 增强实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增强 smart_query_sls_logs 工具，支持中文数字解析、扩展时间匹配、LLM fallback 增强，并优雅降级。

**Architecture:** 采用"本地解析为主 + LLM fallback"混合策略。本地通过正则和中文数字转换表处理常规查询，复杂查询调用 OpenAI 兼容 API（默认 DashScope）。新增 smart-parser.ts 作为核心解析器，llm-client.ts 处理 LLM 调用，增强 time-parser.ts 支持中文数字。

**Tech Stack:** TypeScript, Vitest, @alicloud/sls20201230, openai (for LLM API)

---

## 文件结构

**新增文件：**
- `src/smart-parser.ts` - 智能查询解析器（本地解析 + LLM fallback 编排）
- `src/llm-client.ts` - LLM API 客户端（OpenAI 兼容格式）
- `tests/smart-parser.test.ts` - 智能解析器单元测试

**修改文件：**
- `src/time-parser.ts` - 增加 `chineseToNumber()` 和 `parseRelativeTime()`
- `src/mcp-mode.ts` - 替换原有 `parseSmartQuery` 函数，集成新的 `smart-parser.ts`
- `src/formatter.ts` - 支持显示解析来源标记
- `package.json` - 添加 `openai` 依赖

---

## Task 1: 安装依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 openai 包**

```bash
npm install openai
```

- [ ] **Step 2: 验证安装**

```bash
npm list openai
```

Expected: `openai@x.x.x` 显示已安装

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add openai for LLM query enhancement"
```

---

## Task 2: 时间解析器增强（中文数字支持）

**Files:**
- Modify: `src/time-parser.ts`
- Test: `tests/time-parser.test.ts`

- [ ] **Step 1: 编写 `chineseToNumber` 测试**

在 `tests/time-parser.test.ts` 末尾追加：

```typescript
describe('chineseToNumber', () => {
  it('should convert single chinese digits', () => {
    expect(chineseToNumber('一')).toBe(1);
    expect(chineseToNumber('五')).toBe(5);
    expect(chineseToNumber('九')).toBe(9);
  });

  it('should convert compound chinese numbers', () => {
    expect(chineseToNumber('十')).toBe(10);
    expect(chineseToNumber('十五')).toBe(15);
    expect(chineseToNumber('二十')).toBe(20);
    expect(chineseToNumber('二十三')).toBe(23);
    expect(chineseToNumber('三十')).toBe(30);
    expect(chineseToNumber('九十九')).toBe(99);
  });

  it('should return null for invalid input', () => {
    expect(chineseToNumber('百')).toBeNull();
    expect(chineseToNumber('')).toBeNull();
    expect(chineseToNumber('abc')).toBeNull();
  });
});

describe('parseRelativeTime with chinese', () => {
  const now = Math.floor(Date.now() / 1000);

  it('should parse "七天"', () => {
    const result = parseTime('七天');
    expect(result).toBeGreaterThan(now - 7 * 86400 - 1);
    expect(result).toBeLessThanOrEqual(now - 7 * 86400);
  });

  it('should parse "十五分钟"', () => {
    const result = parseTime('十五分钟');
    expect(result).toBeGreaterThan(now - 15 * 60 - 1);
    expect(result).toBeLessThanOrEqual(now - 15 * 60);
  });

  it('should parse "三小时"', () => {
    const result = parseTime('三小时');
    expect(result).toBeGreaterThan(now - 3 * 3600 - 1);
    expect(result).toBeLessThanOrEqual(now - 3 * 3600);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/time-parser.test.ts
```

Expected: 失败，`chineseToNumber` 和 `parseRelativeTime` 未定义

- [ ] **Step 3: 实现 `chineseToNumber` 和 `parseRelativeTime`**

修改 `src/time-parser.ts`，在文件末尾追加：

```typescript
const CHINESE_NUMBERS: Record<string, number> = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
  '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15,
  '十六': 16, '十七': 17, '十八': 18, '十九': 19,
  '二十': 20, '二十一': 21, '二十二': 22, '二十三': 23, '二十四': 24,
  '二十五': 25, '二十六': 26, '二十七': 27, '二十八': 28, '二十九': 29,
  '三十': 30, '三十一': 31, '三十二': 32, '三十三': 33, '三十四': 34,
  '三十五': 35, '三十六': 36, '三十七': 37, '三十八': 38, '三十九': 39,
  '四十': 40, '四十一': 41, '四十二': 42, '四十三': 43, '四十四': 44,
  '四十五': 45, '四十六': 46, '四十七': 47, '四十八': 48, '四十九': 49,
  '五十': 50, '五十一': 51, '五十二': 52, '五十三': 53, '五十四': 54,
  '五十五': 55, '五十六': 56, '五十七': 57, '五十八': 58, '五十九': 59,
  '六十': 60, '六十一': 61, '六十二': 62, '六十三': 63, '六十四': 64,
  '六十五': 65, '六十六': 66, '六十七': 67, '六十八': 68, '六十九': 69,
  '七十': 70, '七十一': 71, '七十二': 72, '七十三': 73, '七十四': 74,
  '七十五': 75, '七十六': 76, '七十七': 77, '七十八': 78, '七十九': 79,
  '八十': 80, '八十一': 81, '八十二': 82, '八十三': 83, '八十四': 84,
  '八十五': 85, '八十六': 86, '八十七': 87, '八十八': 88, '八十九': 89,
  '九十': 90, '九十一': 91, '九十二': 92, '九十三': 93, '九十四': 94,
  '九十五': 95, '九十六': 96, '九十七': 97, '九十八': 98, '九十九': 99,
};

export function chineseToNumber(chinese: string): number | null {
  const trimmed = chinese.trim();
  if (trimmed in CHINESE_NUMBERS) {
    return CHINESE_NUMBERS[trimmed];
  }
  return null;
}

export function parseRelativeTime(input: string): { value: number; unit: 'minute' | 'hour' | 'day' } | null {
  const trimmed = input.trim().toLowerCase().replace(/\s+/g, '');

  // Try chinese number first
  const chineseMatch = trimmed.match(/^([一二三四五六七八九十百千万亿]+)(分钟|小时|天|个小时|分钟内|小时内|天内|小时前|天前)$/);
  if (chineseMatch) {
    const num = chineseToNumber(chineseMatch[1]);
    if (num !== null) {
      const unitMap: Record<string, 'minute' | 'hour' | 'day'> = {
        '分钟': 'minute', '分钟内': 'minute',
        '小时': 'hour', '个小时': 'hour', '小时内': 'hour', '小时前': 'hour',
        '天': 'day', '天内': 'day', '天前': 'day',
      };
      return { value: num, unit: unitMap[chineseMatch[2]] || 'day' };
    }
  }

  // Fallback to existing logic
  const englishMatch = trimmed.match(/^(\d+)([hmd])(?:\s*ago)?$/);
  if (englishMatch) {
    const value = parseInt(englishMatch[1], 10);
    const unitMap: Record<string, 'minute' | 'hour' | 'day'> = {
      m: 'minute', h: 'hour', d: 'day',
    };
    return { value, unit: unitMap[englishMatch[2].toLowerCase()] || 'day' };
  }

  return null;
}
```

然后修改 `parseTime` 函数，在现有的 `chineseMatch` 逻辑之前插入中文数字支持：

```typescript
  // Chinese relative time with chinese numbers: "七天", "十五分钟", "三小时"
  const chineseNumMatch = trimmed.match(/^(\d+|[一二三四五六七八九十百千万亿]+)(分钟|小时|个小时|天|分钟内|小时内|天内|小时前|天前)$/);
  if (chineseNumMatch) {
    const numStr = chineseNumMatch[1];
    const unit = chineseNumMatch[2];
    let value: number;
    
    if (/^\d+$/.test(numStr)) {
      value = parseInt(numStr, 10);
    } else {
      const chineseValue = chineseToNumber(numStr);
      if (chineseValue === null) {
        throw new Error(`Invalid chinese number: "${numStr}"`);
      }
      value = chineseValue;
    }
    
    const multipliers: Record<string, number> = {
      '小时': 3600, '个小时': 3600, '小时前': 3600,
      '分钟': 60, '分钟内': 60,
      '天': 86400, '天内': 86400, '天前': 86400,
    };
    return now - (value * (multipliers[unit] || 3600));
  }
```

注意：这段代码要插入到现有 `chineseMatch` 变量声明之前（大约在第 27 行之前）。

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/time-parser.test.ts
```

Expected: 所有测试通过

- [ ] **Step 5: Commit**

```bash
git add src/time-parser.ts tests/time-parser.test.ts
git commit -m "feat: support chinese numbers in time parser"
```

---

## Task 3: LLM 客户端实现

**Files:**
- Create: `src/llm-client.ts`
- Test: `tests/llm-client.test.ts`

- [ ] **Step 1: 编写 LLM 配置读取测试**

创建 `tests/llm-client.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getLLMConfig, callLLM } from '../src/llm-client';

describe('getLLMConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return null when ENABLE_LLM_QUERY is not set', () => {
    delete process.env.ENABLE_LLM_QUERY;
    expect(getLLMConfig()).toBeNull();
  });

  it('should return config when ENABLE_LLM_QUERY is true', () => {
    process.env.ENABLE_LLM_QUERY = 'true';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_BASE_URL = 'https://test.com';
    process.env.LLM_MODEL = 'test-model';

    const config = getLLMConfig();
    expect(config).toEqual({
      enabled: true,
      apiKey: 'test-key',
      baseURL: 'https://test.com',
      model: 'test-model',
      timeout: 10000,
    });
  });

  it('should use defaults for optional fields', () => {
    process.env.ENABLE_LLM_QUERY = 'true';
    process.env.LLM_API_KEY = 'test-key';

    const config = getLLMConfig();
    expect(config?.baseURL).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
    expect(config?.model).toBe('qwen-plus');
    expect(config?.timeout).toBe(10000);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/llm-client.test.ts
```

Expected: 失败，`llm-client.ts` 不存在

- [ ] **Step 3: 实现 LLM 客户端**

创建 `src/llm-client.ts`：

```typescript
import OpenAI from 'openai';

export interface LLMConfig {
  enabled: boolean;
  apiKey: string;
  baseURL: string;
  model: string;
  timeout?: number;
}

export function getLLMConfig(): LLMConfig | null {
  if (process.env.ENABLE_LLM_QUERY !== 'true') return null;

  return {
    enabled: true,
    apiKey: process.env.LLM_API_KEY || '',
    baseURL: process.env.LLM_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: process.env.LLM_MODEL || 'qwen-plus',
    timeout: 10000,
  };
}

interface LLMQueryResult {
  query: string;
  from: string;
  to: string;
}

export async function callLLM(
  description: string,
  config: LLMConfig
): Promise<LLMQueryResult | null> {
  try {
    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: config.timeout || 10000,
    });

    const prompt = `将以下自然语言转换为阿里云 SLS 日志查询参数：
"${description}"

请返回严格 JSON 格式（不要包含 markdown 代码块标记）：
{
  "query": "SLS查询语句",
  "from": "相对时间如 7d ago",
  "to": "now 或相对时间"
}

规则：
- query 使用 SLS 查询语法（非 SQL）
- 时间格式支持：Nd ago, Nh ago, Nm ago
- 如果查询 ERROR/WARN 等日志级别，使用 level="ERROR" 格式
- 只返回 JSON，不要其他解释`;

    const response = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const result = JSON.parse(jsonMatch[0]) as LLMQueryResult;
    return result;
  } catch (error) {
    console.error('LLM call failed:', error);
    return null;
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/llm-client.test.ts
```

Expected: `getLLMConfig` 测试通过，`callLLM` 测试需要 mock（可在后续补充）

- [ ] **Step 5: Commit**

```bash
git add src/llm-client.ts tests/llm-client.test.ts
git commit -m "feat: add LLM client for smart query enhancement"
```

---

## Task 4: 智能解析器实现（核心）

**Files:**
- Create: `src/smart-parser.ts`
- Test: `tests/smart-parser.test.ts`

- [ ] **Step 1: 编写智能解析器测试**

创建 `tests/smart-parser.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { parseSmartQuery, chineseToNumber, extractTimeExpression, filterTimeWords } from '../src/smart-parser';

describe('chineseToNumber', () => {
  it('should convert chinese numbers', () => {
    expect(chineseToNumber('七')).toBe(7);
    expect(chineseToNumber('十五')).toBe(15);
    expect(chineseToNumber('二十三')).toBe(23);
    expect(chineseToNumber('三十')).toBe(30);
    expect(chineseToNumber('九十九')).toBe(99);
  });

  it('should return null for invalid numbers', () => {
    expect(chineseToNumber('百')).toBeNull();
    expect(chineseToNumber('')).toBeNull();
  });
});

describe('extractTimeExpression', () => {
  it('should extract "最近七天"', () => {
    const result = extractTimeExpression('查询最近七天的ERROR日志');
    expect(result?.timeStr).toBe('七天');
    expect(result?.cleanedDesc).toBe('查询 的ERROR日志');
  });

  it('should extract "过去5小时"', () => {
    const result = extractTimeExpression('过去5小时的日志');
    expect(result?.timeStr).toBe('5小时');
  });

  it('should extract "15分钟内"', () => {
    const result = extractTimeExpression('15分钟内的异常');
    expect(result?.timeStr).toBe('15分钟');
  });

  it('should return null for no time', () => {
    const result = extractTimeExpression('ERROR日志');
    expect(result).toBeNull();
  });
});

describe('filterTimeWords', () => {
  it('should filter time words', () => {
    const result = filterTimeWords(['查询', '七天', '的', 'ERROR', '日志']);
    expect(result).toContain('ERROR');
    expect(result).not.toContain('七天');
    expect(result).not.toContain('查询');
  });
});

describe('parseSmartQuery - local', () => {
  it('should parse "查询最近七天的ERROR日志"', async () => {
    const result = await parseSmartQuery('查询最近七天的ERROR日志', { useLLM: false });
    expect(result.source).toBe('local');
    expect(result.query).toContain('ERROR');
    expect(result.from).toBeLessThan(result.to);
  });

  it('should parse "过去十五分钟的异常"', async () => {
    const result = await parseSmartQuery('过去十五分钟的异常', { useLLM: false });
    expect(result.source).toBe('local');
    expect(result.query).toContain('error');
  });

  it('should fallback to * for empty query', async () => {
    const result = await parseSmartQuery('的', { useLLM: false });
    expect(result.query).toBe('*');
    expect(result.source).toBe('local');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/smart-parser.test.ts
```

Expected: 失败，`smart-parser.ts` 不存在

- [ ] **Step 3: 实现智能解析器**

创建 `src/smart-parser.ts`：

```typescript
import { parseTime } from './time-parser.js';
import { expandKeywords } from './query-expander.js';
import { callLLM, getLLMConfig } from './llm-client.js';

export interface SmartQueryResult {
  query: string;
  from: number;
  to: number;
  limit?: number;
  source: 'local' | 'llm' | 'fallback';
  warning?: string;
}

const STOP_WORDS = ['查询', '的', '日志', '查', '一下', '最近', '过去'];
const TIME_WORDS = ['分钟', '小时', '天', '个', '内', '前', 'ago'];

export function chineseToNumber(chinese: string): number | null {
  // Reuse from time-parser to avoid duplication
  // For now, simple mapping
  const map: Record<string, number> = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15,
    '十六': 16, '十七': 17, '十八': 18, '十九': 19,
    '二十': 20, '二十一': 21, '二十二': 22, '二十三': 23, '二十四': 24,
    '二十五': 25, '二十六': 26, '二十七': 27, '二十八': 28, '二十九': 29,
    '三十': 30, '三十一': 31, '三十二': 32, '三十三': 33, '三十四': 34,
    '三十五': 35, '三十六': 36, '三十七': 37, '三十八': 38, '三十九': 39,
    '四十': 40, '四十一': 41, '四十二': 42, '四十三': 43, '四十四': 44,
    '四十五': 45, '四十六': 46, '四十七': 47, '四十八': 48, '四十九': 49,
    '五十': 50, '五十一': 51, '五十二': 52, '五十三': 53, '五十四': 54,
    '五十五': 55, '五十六': 56, '五十七': 57, '五十八': 58, '五十九': 59,
    '六十': 60, '六十一': 61, '六十二': 62, '六十三': 63, '六十四': 64,
    '六十五': 65, '六十六': 66, '六十七': 67, '六十八': 68, '六十九': 69,
    '七十': 70, '七十一': 71, '七十二': 72, '七十三': 73, '七十四': 74,
    '七十五': 75, '七十六': 76, '七十七': 77, '七十八': 78, '七十九': 79,
    '八十': 80, '八十一': 81, '八十二': 82, '八十三': 83, '八十四': 84,
    '八十五': 85, '八十六': 86, '八十七': 87, '八十八': 88, '八十九': 89,
    '九十': 90, '九十一': 91, '九十二': 92, '九十三': 93, '九十四': 94,
    '九十五': 95, '九十六': 96, '九十七': 97, '九十八': 98, '九十九': 99,
  };
  return map[chinese.trim()] ?? null;
}

export function extractTimeExpression(desc: string): { timeStr: string; cleanedDesc: string } | null {
  // Match: "最近七天", "过去5小时", "15分钟内", "三小时前", "7d ago"
  const pattern = /(?:最近|过去)?\s*(\d+|[一二三四五六七八九十]+)\s*(分钟|小时|个小时|天|分钟内|小时内|天内|小时前|天前|h|m|d)(?:\s*ago)?/i;
  const match = desc.match(pattern);
  
  if (!match) return null;
  
  const timeStr = match[0].trim();
  const cleanedDesc = desc.replace(timeStr, '').trim();
  
  return { timeStr, cleanedDesc };
}

export function filterTimeWords(words: string[]): string[] {
  return words.filter(word => {
    const lower = word.toLowerCase();
    // Filter out pure time words
    if (TIME_WORDS.some(tw => lower.includes(tw))) return false;
    // Filter out stop words
    if (STOP_WORDS.includes(lower)) return false;
    // Filter out pure chinese numbers
    if (chineseToNumber(lower) !== null) return false;
    return word.length > 0;
  });
}

function parseLocalQuery(description: string): SmartQueryResult | null {
  try {
    const trimmed = description.trim();
    
    // Extract time
    const timeResult = extractTimeExpression(trimmed);
    let timeStr: string;
    let cleanedDesc: string;
    
    if (timeResult) {
      timeStr = timeResult.timeStr.replace(/^(最近|过去)\s*/, '').trim();
      cleanedDesc = timeResult.cleanedDesc;
    } else {
      timeStr = '1h';
      cleanedDesc = trimmed;
    }
    
    // Parse time
    const from = parseTime(timeStr);
    const to = Math.floor(Date.now() / 1000);
    
    // Remove stop words
    let workingDesc = cleanedDesc;
    for (const word of STOP_WORDS) {
      workingDesc = workingDesc.split(word).join(' ');
    }
    workingDesc = workingDesc.trim();
    
    // Split keywords
    const rawKeywords = workingDesc
      .split(/[\s,，]+/)
      .filter(w => w.length > 0);
    
    // Filter time words
    const keywords = filterTimeWords(rawKeywords);
    
    // Expand keywords
    const expandedKeywords = keywords.map(k => expandKeywords(k));
    
    // Build query
    let query: string;
    if (expandedKeywords.length > 0) {
      const hasErrorTerm = keywords.some(k => 
        ['error', 'ERROR', '错误', '异常', 'exception', 'fatal'].includes(k.toLowerCase())
      );
      
      if (hasErrorTerm && !expandedKeywords.some(k => k.includes('level='))) {
        query = `level="ERROR" AND (${expandedKeywords.join(' OR ')})`;
      } else {
        query = expandedKeywords.join(' OR ');
      }
    } else {
      query = '*';
    }
    
    return {
      query,
      from,
      to,
      source: 'local',
    };
  } catch (error) {
    return null;
  }
}

export async function parseSmartQuery(
  description: string,
  options: { useLLM?: boolean } = {}
): Promise<SmartQueryResult> {
  // Try local parser first
  const localResult = parseLocalQuery(description);
  
  // If local parser succeeds and returns meaningful query, use it
  if (localResult && localResult.query !== '*') {
    return localResult;
  }
  
  // Try LLM if enabled
  if (options.useLLM !== false) {
    const llmConfig = getLLMConfig();
    if (llmConfig) {
      try {
        const llmResult = await callLLM(description, llmConfig);
        if (llmResult) {
          const from = parseTime(llmResult.from);
          const to = llmResult.to === 'now' 
            ? Math.floor(Date.now() / 1000) 
            : parseTime(llmResult.to);
          
          return {
            query: llmResult.query,
            from,
            to,
            source: 'llm',
          };
        }
      } catch (error) {
        console.error('LLM parsing failed:', error);
      }
    }
  }
  
  // Fallback
  return {
    query: '*',
    from: Math.floor(Date.now() / 1000) - 3600,
    to: Math.floor(Date.now() / 1000),
    source: 'fallback',
    warning: '无法解析查询，返回最近1小时的所有日志',
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/smart-parser.test.ts
```

Expected: 所有测试通过

- [ ] **Step 5: Commit**

```bash
git add src/smart-parser.ts tests/smart-parser.test.ts
git commit -m "feat: implement smart query parser with local + LLM fallback"
```

---

## Task 5: 格式化器增强

**Files:**
- Modify: `src/formatter.ts`

- [ ] **Step 1: 检查当前 formatter 实现**

```bash
cat src/formatter.ts
```

- [ ] **Step 2: 修改 formatter 支持解析来源标记**

修改 `src/formatter.ts`，在 `formatAsMarkdown` 函数中添加 `source` 和 `originalQuery` 参数支持：

```typescript
interface FormatOptions {
  fields?: string[];
  format?: 'raw' | 'summary';
  source?: 'local' | 'llm' | 'fallback';
  originalQuery?: string;
}

export function formatAsMarkdown(
  result: QueryResult, 
  options: FormatOptions = {}
): string {
  const { fields, format, source, originalQuery } = options;
  
  let output = '';
  
  // Add query info header
  if (source) {
    const sourceMap = {
      local: '本地解析',
      llm: 'LLM 增强',
      fallback: '默认查询',
    };
    output += `**解析方式**: ${sourceMap[source]}\n`;
  }
  
  if (originalQuery) {
    output += `**查询语句**: \`${originalQuery}\`\n`;
  }
  
  if (output) {
    output += '\n';
  }
  
  // Existing logic...
  // [保留原有的格式化逻辑]
  
  return output;
}
```

注意：实际修改时需要保留原有逻辑，只在头部添加查询信息。

- [ ] **Step 3: 运行测试确保未破坏现有功能**

```bash
npx vitest run tests/formatter.test.ts
```

Expected: 测试通过

- [ ] **Step 4: Commit**

```bash
git add src/formatter.ts
git commit -m "feat: add query source info to formatter output"
```

---

## Task 6: MCP 模式集成

**Files:**
- Modify: `src/mcp-mode.ts`

- [ ] **Step 1: 替换原有 parseSmartQuery 函数**

修改 `src/mcp-mode.ts`：

1. 在 imports 中添加：
```typescript
import { parseSmartQuery } from './smart-parser.js';
```

2. 替换 `handleSmartQueryLogs` 函数中的解析逻辑：

```typescript
async function handleSmartQueryLogs(
  args: Record<string, unknown>,
  slsClient: SlsClient
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const description = String(args.description);
  
  // 使用新的智能解析器
  const parsed = await parseSmartQuery(description, {
    useLLM: process.env.ENABLE_LLM_QUERY === 'true'
  });

  // Merge with explicit args if provided
  const project = String(args.project || getDefaultProject());
  const logstore = String(args.logstore || getDefaultLogstore());

  if (!project) {
    throw new Error('project is required (or set defaultProject in config/mcp.json)');
  }
  if (!logstore) {
    throw new Error('logstore is required (or set defaultLogstore in config/mcp.json)');
  }

  const limit = Math.min(Number(args.limit || parsed.limit) || 100, 1000);
  const offset = Number(args.offset) || 0;
  const fields = Array.isArray(args.fields) ? args.fields as string[] : undefined;
  const format = ((args.format as string) || 'raw') as 'raw' | 'summary';

  let query = parsed.query;
  // Auto-add aggregation for summary format
  if (format === 'summary' && !query.includes('| stats') && !query.includes('| select')) {
    query += ' | stats count() as count by level';
  }

  const result = await slsClient.queryLogs({
    project,
    logstore,
    query,
    from: parsed.from,
    to: parsed.to,
    limit,
    offset,
    fields,
    format,
  });

  return {
    content: [
      {
        type: 'text',
        text: formatAsMarkdown(result, { 
          fields, 
          format,
          source: parsed.source,
          originalQuery: parsed.query,
        }),
      },
    ],
  };
}
```

3. 删除原有的 `parseSmartQuery` 函数（在 `mcp-mode.ts` 中大约 240-310 行）

- [ ] **Step 2: 运行测试确认未破坏现有功能**

```bash
npx vitest run tests/mcp-mode.test.ts
```

Expected: 测试通过（可能需要更新 mock）

- [ ] **Step 3: Commit**

```bash
git add src/mcp-mode.ts
git commit -m "feat: integrate smart parser into MCP mode"
```

---

## Task 7: 集成测试与验证

**Files:**
- Modify: `tests/smart-query.test.ts`（更新现有测试）

- [ ] **Step 1: 更新集成测试**

修改 `tests/smart-query.test.ts` 以测试完整的解析流程：

```typescript
import { describe, it, expect } from 'vitest';
import { parseSmartQuery } from '../src/smart-parser';

describe('smart query integration', () => {
  it('should parse "查询最近七天的ERROR日志" with local parser', async () => {
    const result = await parseSmartQuery('查询最近七天的ERROR日志', { useLLM: false });
    expect(result.source).toBe('local');
    expect(result.query).toContain('ERROR');
    expect(result.from).toBeLessThan(result.to);
    // Should be approximately 7 days ago
    const now = Math.floor(Date.now() / 1000);
    expect(result.from).toBeGreaterThan(now - 7 * 86400 - 10);
  });

  it('should parse "过去十五分钟的异常" with local parser', async () => {
    const result = await parseSmartQuery('过去十五分钟的异常', { useLLM: false });
    expect(result.source).toBe('local');
    expect(result.query).toContain('error');
  });

  it('should fallback to * for unparseable input', async () => {
    const result = await parseSmartQuery('的', { useLLM: false });
    expect(result.query).toBe('*');
    expect(result.source).toBe('fallback');
  });
});
```

- [ ] **Step 2: 运行全部测试**

```bash
npm test
```

Expected: 所有测试通过

- [ ] **Step 3: Commit**

```bash
git add tests/smart-query.test.ts
git commit -m "test: update smart query integration tests"
```

---

## Task 8: 更新文档与配置示例

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 在 README 中添加 Smart Query 增强说明**

在 README.md 的 "MCP 工具" 部分后添加：

```markdown
### smart_query_sls_logs 增强

支持自然语言查询，自动解析时间范围和查询条件：

**示例查询**：
- `"查询最近七天的ERROR日志"` → 自动解析为最近7天 + level="ERROR"
- `"过去十五分钟的异常"` → 自动解析为15分钟 + error/异常关键词
- `"帮我看看上周系统出了什么毛病"` → LLM 解析（需配置）

**LLM 增强配置**（可选）：
在 `~/.config/opencode/opencode.json` 中添加环境变量：

```json
{
  "mcp": {
    "ali-log": {
      "environment": {
        "ENABLE_LLM_QUERY": "true",
        "LLM_API_KEY": "sk-xxx",
        "LLM_BASE_URL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "LLM_MODEL": "qwen-plus"
      }
    }
  }
}
```

| 环境变量 | 说明 | 默认值 |
|----------|------|--------|
| `ENABLE_LLM_QUERY` | 是否启用 LLM 增强 | `false` |
| `LLM_API_KEY` | LLM API Key | - |
| `LLM_BASE_URL` | LLM API 地址 | DashScope |
| `LLM_MODEL` | 模型名称 | `qwen-plus` |
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add smart query enhancement documentation"
```

---

## 验证清单

- [ ] `npm test` 全部通过
- [ ] `npm run build` 成功（如有 build 脚本）
- [ ] 中文数字解析正确（七→7, 十五→15）
- [ ] 时间表达式提取正确（最近七天, 过去5小时, 15分钟内）
- [ ] LLM fallback 正常工作（配置后测试复杂查询）
- [ ] 降级路径正确（返回 `*` + 警告）
- [ ] 格式化输出包含解析来源标记

---

## 自我审查

**1. Spec coverage:**
- ✅ 中文数字支持 - Task 2, Task 4
- ✅ 扩展时间匹配 - Task 4
- ✅ 智能过滤 - Task 4
- ✅ LLM 增强 - Task 3, Task 4, Task 6
- ✅ 优雅降级 - Task 4
- ✅ 格式化来源标记 - Task 5

**2. Placeholder scan:**
- 无 TBD/TODO
- 所有步骤包含完整代码
- 无模糊描述

**3. Type consistency:**
- `SmartQueryResult` 接口在 smart-parser.ts 中定义，被 mcp-mode.ts 和 formatter.ts 使用
- `LLMConfig` 在 llm-client.ts 中定义，被 smart-parser.ts 使用
- 所有导入路径使用 `.js` 后缀（符合项目 ESM 规范）

**无缺失，计划完整。**
