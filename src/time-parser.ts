const CHINESE_NUMBERS: Record<string, number> = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
};

export function chineseToNumber(input: string): number | null {
  if (!input) return null;

  for (const char of input) {
    if (!(char in CHINESE_NUMBERS)) return null;
  }

  if (input.length === 1) {
    return CHINESE_NUMBERS[input] ?? null;
  }

  if (input.includes('十')) {
    const parts = input.split('十');

    if (input === '十') return 10;

    if (parts.length === 2 && parts[1] === '') {
      const tens = CHINESE_NUMBERS[parts[0]];
      if (tens && tens < 10) return tens * 10;
    }

    if (parts.length === 2 && parts[0] === '') {
      const units = CHINESE_NUMBERS[parts[1]];
      if (units && units < 10) return 10 + units;
    }

    if (parts.length === 2 && parts[0] !== '' && parts[1] !== '') {
      const tens = CHINESE_NUMBERS[parts[0]];
      const units = CHINESE_NUMBERS[parts[1]];
      if (tens && tens < 10 && units && units < 10) return tens * 10 + units;
    }
  }

  return null;
}

export function parseTime(input: string): number {
  const trimmed = input.trim().toLowerCase().replace(/\s+/g, ' ');

  // Try parsing as unix timestamp first
  const timestamp = parseInt(trimmed, 10);
  if (!isNaN(timestamp) && trimmed === String(timestamp)) {
    return timestamp;
  }

  const now = Math.floor(Date.now() / 1000);

  // Special keywords
  if (trimmed === '前天') {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    d.setHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }

  if (trimmed === '昨天' || trimmed === 'yesterday') {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }

  if (trimmed === '今天' || trimmed === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }

  // Chinese relative time with Chinese numerals: "七天", "十五分钟", "三小时"
  const chineseNumMatch = trimmed.match(/^([一二三四五六七八九十]+)(小时|分钟|天|个小时|分钟前|小时前|天前)$/);
  if (chineseNumMatch) {
    const value = chineseToNumber(chineseNumMatch[1]);
    if (value !== null) {
      const unit = chineseNumMatch[2];
      const multipliers: Record<string, number> = {
        '小时': 3600, '个小时': 3600, '小时前': 3600,
        '分钟': 60, '分钟前': 60,
        '天': 86400, '天前': 86400,
      };
      return now - (value * multipliers[unit]);
    }
  }

  // Chinese relative time: "4小时", "30分钟", "1天"
  const chineseMatch = trimmed.match(/^(\d+)(小时|分钟|天|个小时|分钟前|小时前|天前)$/);
  if (chineseMatch) {
    const value = parseInt(chineseMatch[1], 10);
    const unit = chineseMatch[2];
    const multipliers: Record<string, number> = {
      '小时': 3600, '个小时': 3600, '小时前': 3600,
      '分钟': 60, '分钟前': 60,
      '天': 86400, '天前': 86400,
    };
    return now - (value * multipliers[unit]);
  }

  // English relative time: "4h ago", "30m", "1d"
  const englishMatch = trimmed.match(/^(\d+)([hmd])(?:\s*ago)?$/);
  if (englishMatch) {
    const value = parseInt(englishMatch[1], 10);
    const unit = englishMatch[2].toLowerCase();
    const multipliers: Record<string, number> = {
      m: 60,
      h: 3600,
      d: 86400,
    };
    return now - (value * multipliers[unit]);
  }

  // Absolute time: "昨天10点30分", "今天12点45分", "2026-04-26 10:30:00"
  const absoluteResult = parseAbsoluteTime(input);
  if (absoluteResult !== null) {
    return absoluteResult;
  }

  throw new Error(
    `Invalid time format: "${input}". Expected unix timestamp, relative time like "1h ago", "4小时", "30分钟", "前天", "昨天", or "今天"`
  );
}

function parseAbsoluteTime(input: string): number | null {
  const trimmed = input.trim();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDate = now.getDate();

  // Pattern: "前天10点30分", "前天10:30", "前天10点"
  const dayBeforeYesterdayMatch = trimmed.match(/^前天\s*(?:(\d{1,2})\s*[:点]\s*(?:(\d{1,2})\s*分?)?)?$/);
  if (dayBeforeYesterdayMatch) {
    const hour = parseInt(dayBeforeYesterdayMatch[1] || '0', 10);
    const minute = parseInt(dayBeforeYesterdayMatch[2] || '0', 10);
    const d = new Date(currentYear, currentMonth, currentDate - 2, hour, minute, 0);
    return Math.floor(d.getTime() / 1000);
  }

  // Pattern: "昨天10点30分", "昨天10:30", "昨天10点", "昨天10时30分"
  const yesterdayMatch = trimmed.match(/^昨天\s*(?:(\d{1,2})\s*[:点]\s*(?:(\d{1,2})\s*分?)?)?$/);
  if (yesterdayMatch) {
    const hour = parseInt(yesterdayMatch[1] || '0', 10);
    const minute = parseInt(yesterdayMatch[2] || '0', 10);
    const d = new Date(currentYear, currentMonth, currentDate - 1, hour, minute, 0);
    return Math.floor(d.getTime() / 1000);
  }

  // Pattern: "今天10点30分", "今天10:30"
  const todayMatch = trimmed.match(/^今天\s*(?:(\d{1,2})\s*[:点]\s*(?:(\d{1,2})\s*分?)?)?$/);
  if (todayMatch) {
    const hour = parseInt(todayMatch[1] || '0', 10);
    const minute = parseInt(todayMatch[2] || '0', 10);
    const d = new Date(currentYear, currentMonth, currentDate, hour, minute, 0);
    return Math.floor(d.getTime() / 1000);
  }

  // Pattern: "2026-04-26 10:30:00", "2026-04-26 10:30", "2026/04/26 10:30"
  const dateTimeMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (dateTimeMatch) {
    const year = parseInt(dateTimeMatch[1], 10);
    const month = parseInt(dateTimeMatch[2], 10) - 1;
    const date = parseInt(dateTimeMatch[3], 10);
    const hour = parseInt(dateTimeMatch[4], 10);
    const minute = parseInt(dateTimeMatch[5], 10);
    const second = parseInt(dateTimeMatch[6] || '0', 10);
    const d = new Date(year, month, date, hour, minute, second);
    return Math.floor(d.getTime() / 1000);
  }

  return null;
}
