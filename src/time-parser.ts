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

  throw new Error(
    `Invalid time format: "${input}". Expected unix timestamp, relative time like "1h ago", "4小时", "30分钟", "昨天", or "today"`
  );
}
