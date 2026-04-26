import { describe, it, expect } from 'vitest';
import { expandKeywords } from '../src/query-expander';

describe('smart query parsing', () => {
  it('should parse "查询15分钟内 ERROR 日志"', () => {
    const desc = '查询15分钟内 ERROR 日志';
    
    // Simulate parsing logic
    const timeMatch = desc.match(/(?:最近)?\s*(\d+)\s*(分钟内|分钟|小时|个小时|天|天前|h|m|d)\s*(?:ago)?|(?:最近)?\s*(昨天|今天|yesterday|today)/i);
    expect(timeMatch).toBeTruthy();
    const timeDesc = timeMatch![0].trim();
    expect(timeDesc).toBe('15分钟内');
    
    let cleanedDesc = desc.replace(timeDesc, '').trim();
    const stopWords = ['查询', '的', '日志', '查', '一下', '内', '最近'];
    for (const word of stopWords) {
      cleanedDesc = cleanedDesc.split(word).join(' ');
    }
    cleanedDesc = cleanedDesc.trim();
    
    const keywords = cleanedDesc
      .split(/[\s,，]+/)
      .filter(w => w.length > 0);
    
    expect(keywords).toContain('ERROR');
    
    const expanded = expandKeywords('ERROR');
    expect(expanded).toBe('error OR ERROR OR 错误 OR 异常 OR exception OR fatal');
  });

  it('should parse "最近4小时的短信日志"', () => {
    const desc = '最近4小时的短信日志';
    
    const timeMatch = desc.match(/(?:最近)?\s*(\d+)\s*(分钟内|分钟|小时|个小时|天|天前|h|m|d)\s*(?:ago)?|(?:最近)?\s*(昨天|今天|yesterday|today)/i);
    expect(timeMatch).toBeTruthy();
    const timeDesc = timeMatch![0].trim();
    expect(timeDesc).toBe('最近4小时');
    
    let cleanedDesc = desc.replace(timeDesc, '').trim();
    const stopWords = ['查询', '的', '日志', '查', '一下', '内', '最近'];
    for (const word of stopWords) {
      cleanedDesc = cleanedDesc.split(word).join(' ');
    }
    cleanedDesc = cleanedDesc.trim();
    
    const keywords = cleanedDesc
      .split(/[\s,，]+/)
      .filter(w => w.length > 0);
    
    expect(keywords).toContain('短信');
    
    const expanded = expandKeywords('短信');
    expect(expanded).toBe('sms OR 短信 OR message OR 验证码');
  });
});