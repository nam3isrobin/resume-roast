import { beforeEach, describe, expect, it } from 'vitest';
import {
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
  checkRateLimit,
  getClientIp,
  resetRateLimits,
} from '@/lib/rate-limit';

beforeEach(() => {
  resetRateLimits();
});

describe('getClientIp', () => {
  it('uses the first x-forwarded-for entry', () => {
    const req = new Request('http://localhost/api/roast', {
      headers: { 'x-forwarded-for': '198.51.100.7, 10.0.0.1' },
    });

    expect(getClientIp(req)).toBe('198.51.100.7');
  });

  it('falls back to x-real-ip, then "unknown"', () => {
    expect(
      getClientIp(new Request('http://localhost', { headers: { 'x-real-ip': '198.51.100.8' } }))
    ).toBe('198.51.100.8');
    expect(getClientIp(new Request('http://localhost'))).toBe('unknown');
  });
});

describe('checkRateLimit', () => {
  it('allows requests up to the limit and blocks the next one', () => {
    const now = 1_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
      expect(checkRateLimit('ip', now).allowed).toBe(true);
    }

    const blocked = checkRateLimit('ip', now);

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('allows requests again once the window has elapsed', () => {
    const now = 1_000_000;
    for (let i = 0; i <= RATE_LIMIT_MAX_REQUESTS; i++) {
      checkRateLimit('ip', now);
    }

    expect(checkRateLimit('ip', now + RATE_LIMIT_WINDOW_MS + 1).allowed).toBe(true);
  });

  it('keeps separate counters per key', () => {
    const now = 1_000_000;
    for (let i = 0; i <= RATE_LIMIT_MAX_REQUESTS; i++) {
      checkRateLimit('a', now);
    }

    expect(checkRateLimit('b', now).allowed).toBe(true);
  });
});
