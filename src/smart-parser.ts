import { parseTime, chineseToNumber as timeParserChineseToNumber } from './time-parser.js';
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
  return timeParserChineseToNumber(chinese);
}

export function extractTimeExpression(desc: string): { timeStr: string; cleanedDesc: string } | null {
  const pattern = /(?:最近|过去)?\s*(\d+|[一二三四五六七八九十]+)\s*(分钟内|小时内|天内|分钟|小时|个小时|天|小时前|天前|h|m|d)(?:\s*ago)?/i;
  const match = desc.match(pattern);
  
  if (!match) return null;
  
  const timeStr = match[0].trim();
  const cleanedDesc = desc.replace(timeStr, '').trim();
  
  return { timeStr, cleanedDesc };
}

export function filterTimeWords(words: string[]): string[] {
  return words.filter(word => {
    const lower = word.toLowerCase();
    if (TIME_WORDS.some(tw => lower.includes(tw))) return false;
    if (STOP_WORDS.includes(lower)) return false;
    if (chineseToNumber(lower) !== null) return false;
    return word.length > 0;
  });
}

function parseLocalQuery(description: string): SmartQueryResult | null {
  try {
    const trimmed = description.trim();
    
    const timeResult = extractTimeExpression(trimmed);
    let timeStr: string;
    let cleanedDesc: string;
    
    if (timeResult) {
      timeStr = timeResult.timeStr.replace(/^(最近|过去)\s*/, '').trim();
      // Convert "15分钟内" -> "15分钟", "1小时内" -> "1小时", etc.
      timeStr = timeStr.replace(/内$/, '');
      cleanedDesc = timeResult.cleanedDesc;
    } else {
      timeStr = '1h';
      cleanedDesc = trimmed;
    }
    
    const from = parseTime(timeStr);
    const to = Math.floor(Date.now() / 1000);
    
    let workingDesc = cleanedDesc;
    for (const word of STOP_WORDS) {
      workingDesc = workingDesc.split(word).join(' ');
    }
    workingDesc = workingDesc.trim();
    
    const rawKeywords = workingDesc
      .split(/[\s,，]+/)
      .filter(w => w.length > 0);
    
    const keywords = filterTimeWords(rawKeywords);
    const expandedKeywords = keywords.map(k => expandKeywords(k));
    
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
    
    return { query, from, to, source: 'local' };
  } catch (error) {
    return null;
  }
}

export async function parseSmartQuery(
  description: string,
  options: { useLLM?: boolean } = {}
): Promise<SmartQueryResult> {
  const localResult = parseLocalQuery(description);
  
  if (localResult && localResult.query !== '*') {
    return localResult;
  }
  
  // If local parsing succeeded but query is '*', still return it when LLM is disabled
  if (localResult && options.useLLM === false) {
    return localResult;
  }
  
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
          
          return { query: llmResult.query, from, to, source: 'llm' };
        }
      } catch (error) {
        console.error('LLM parsing failed:', error);
      }
    }
  }
  
  return {
    query: '*',
    from: Math.floor(Date.now() / 1000) - 3600,
    to: Math.floor(Date.now() / 1000),
    source: 'fallback',
    warning: '无法解析查询，返回最近1小时的所有日志',
  };
}
