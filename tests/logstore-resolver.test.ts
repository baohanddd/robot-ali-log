import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs before importing query-expander
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    readFileSync: vi.fn(),
  };
});

import {
  resolveLogstore,
  extractLogstoreFromDescription,
  clearCache
} from '../src/query-expander.js';
import * as fs from 'fs';

describe('resolveLogstore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCache();
  });

  it('should match logstore by alias', () => {
    const mockConfig = {
      logstores: [
        {
          name: 'sms',
          project: 'test-project',
          aliases: ['sms', 'message']
        }
      ]
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

    const result = resolveLogstore('sms');
    expect(result).toEqual({ project: 'test-project', logstore: 'sms', matchedAlias: 'sms', matchIndex: 0 });
  });

  it('should prefer longer alias (pro-match over pro)', () => {
    const mockConfig = {
      logstores: [
        {
          name: 'pro',
          project: 'pro-project',
          aliases: ['pro']
        },
        {
          name: 'pro-match',
          project: 'pro-match-project',
          aliases: ['pro-match']
        }
      ]
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

    const result = resolveLogstore('pro-match');
    expect(result).toEqual({ project: 'pro-match-project', logstore: 'pro-match', matchedAlias: 'pro-match', matchIndex: 0 });
  });

  it('should match alias within a longer description', () => {
    const mockConfig = {
      logstores: [
        {
          name: 'sms',
          project: 'test-project',
          aliases: ['sms']
        }
      ]
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

    const result = resolveLogstore('帮我查 sms 的日志');
    expect(result).toEqual({ project: 'test-project', logstore: 'sms', matchedAlias: 'sms', matchIndex: 4 });
  });

  it('should return null if no match', () => {
    const mockConfig = {
      logstores: [
        {
          name: 'sms',
          project: 'test-project',
          aliases: ['sms']
        }
      ]
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

    const result = resolveLogstore('unknown');
    expect(result).toBeNull();
  });

  it('should be case insensitive', () => {
    const mockConfig = {
      logstores: [
        {
          name: 'sms',
          project: 'test-project',
          aliases: ['SMS', 'Message']
        }
      ]
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

    const result = resolveLogstore('sms');
    expect(result).toEqual({ project: 'test-project', logstore: 'sms', matchedAlias: 'SMS', matchIndex: 0 });
  });
});

describe('extractLogstoreFromDescription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCache();
  });

  it('should extract logstore and clean description (remove matched alias)', () => {
    const mockConfig = {
      logstores: [
        {
          name: 'sms',
          project: 'test-project',
          aliases: ['sms']
        }
      ]
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

    const result = extractLogstoreFromDescription('sms errors today');
    expect(result).toEqual({
      project: 'test-project',
      logstore: 'sms',
      cleanedDesc: 'errors today'
    });
  });

  it('should return original desc if no match', () => {
    const mockConfig = {
      logstores: [
        {
          name: 'sms',
          project: 'test-project',
          aliases: ['sms']
        }
      ]
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

    const result = extractLogstoreFromDescription('errors today');
    expect(result).toEqual({ cleanedDesc: 'errors today' });
  });

  it('should handle punctuation attached to alias', () => {
    const mockConfig = {
      logstores: [
        {
          name: 'pro-match',
          project: 'pro-match-project',
          aliases: ['pro-match']
        }
      ]
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

    const result = extractLogstoreFromDescription('errors in pro-match, today');
    expect(result).toEqual({
      project: 'pro-match-project',
      logstore: 'pro-match',
      cleanedDesc: 'errors in , today'
    });
  });

  it('should remove only the first standalone match of alias', () => {
    const mockConfig = {
      logstores: [
        {
          name: 'pro-match',
          project: 'pro-match-project',
          aliases: ['pro-match']
        }
      ]
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

    const result = extractLogstoreFromDescription('pro-match and pro-match errors');
    expect(result).toEqual({
      project: 'pro-match-project',
      logstore: 'pro-match',
      cleanedDesc: 'and pro-match errors'
    });
  });

  it('should not match alias inside a larger word', () => {
    const mockConfig = {
      logstores: [
        {
          name: 'pro',
          project: 'fu-project',
          aliases: ['pro']
        }
      ]
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

    const result = resolveLogstore('professional errors');
    expect(result).toBeNull();
  });

  it('should not extract alias from inside a larger word', () => {
    const mockConfig = {
      logstores: [
        {
          name: 'pro',
          project: 'fu-project',
          aliases: ['pro']
        }
      ]
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

    const result = extractLogstoreFromDescription('professional errors today');
    expect(result.project).toBeUndefined();
    expect(result.cleanedDesc).toBe('professional errors today');
  });
});
