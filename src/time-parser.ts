export function parseTime(input: string): number {
  // Try parsing as unix timestamp first
  const timestamp = parseInt(input, 10);
  if (!isNaN(timestamp) && input.trim() === String(timestamp)) {
    return timestamp;
  }

  // Parse relative time format: "<number><unit> ago"
  const match = input.trim().match(/^(\d+)([hmd])\s*ago$/i);
  if (!match) {
    throw new Error(`Invalid time format: "${input}". Expected unix timestamp or relative time like "1h ago", "30m ago", "1d ago"`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const now = Math.floor(Date.now() / 1000);

  const multipliers: Record<string, number> = {
    m: 60,
    h: 3600,
    d: 86400,
  };

  return now - (value * multipliers[unit]);
}
