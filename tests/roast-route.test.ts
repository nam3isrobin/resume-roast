import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_PDF_BYTES } from '@/lib/upload';
import { RATE_LIMIT_MAX_REQUESTS, resetRateLimits } from '@/lib/rate-limit';

type RoastRoute = typeof import('@/app/api/roast/route');

let POST: RoastRoute['POST'];

const pdf = (bytes: number, type = 'application/pdf') =>
  new File([new Uint8Array(bytes)], 'resume.pdf', { type });

const request = (body: FormData, ip = '203.0.113.1') =>
  new Request('http://localhost/api/roast', {
    method: 'POST',
    body,
    headers: { 'x-forwarded-for': ip },
  });

const formWith = (file?: File) => {
  const form = new FormData();
  if (file) {
    form.set('pdf', file);
  }
  return form;
};

beforeAll(async () => {
  process.env.GROQ_API_KEY ??= 'test-key';
  ({ POST } = await import('@/app/api/roast/route'));
});

beforeEach(() => {
  resetRateLimits();
});

describe('POST /api/roast input validation', () => {
  it('rejects a request without a PDF', async () => {
    const res = await POST(request(formWith(), '203.0.113.10'));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'PDF file is required.' });
  });

  it('rejects a non-PDF MIME type', async () => {
    const res = await POST(request(formWith(pdf(1024, 'text/plain')), '203.0.113.11'));

    expect(res.status).toBe(415);
  });

  it('rejects an empty file', async () => {
    const res = await POST(request(formWith(pdf(0)), '203.0.113.12'));

    expect(res.status).toBe(400);
  });

  it('rejects a PDF larger than the size limit', async () => {
    const res = await POST(request(formWith(pdf(MAX_PDF_BYTES + 1)), '203.0.113.13'));

    expect(res.status).toBe(413);
  });
});

describe('POST /api/roast rate limiting', () => {
  it('returns 429 with a Retry-After header once the limit is exceeded', async () => {
    const ip = '203.0.113.20';
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
      const res = await POST(request(formWith(), ip));
      expect(res.status).toBe(400);
    }

    const limited = await POST(request(formWith(), ip));

    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBeTruthy();
  });

  it('tracks limits per client IP', async () => {
    const ip = '203.0.113.21';
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS + 1; i++) {
      await POST(request(formWith(), ip));
    }

    const other = await POST(request(formWith(), '203.0.113.22'));

    expect(other.status).toBe(400);
  });
});
