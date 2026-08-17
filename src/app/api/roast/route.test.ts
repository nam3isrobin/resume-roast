// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockCreate, parserState } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  parserState: {
    text: 'John Doe\nSoftware Engineer',
    error: null as string | null,
  },
}));

vi.mock('groq-sdk', () => ({
  default: class MockGroq {
    chat = { completions: { create: mockCreate } };
  },
}));

vi.mock('pdf2json', () => {
  class MockPDFParser {
    private handlers: Record<string, (arg?: unknown) => void> = {};

    on(event: string, cb: (arg?: unknown) => void) {
      this.handlers[event] = cb;
    }

    parseBuffer() {
      if (parserState.error) {
        this.handlers['pdfParser_dataError']?.({ parserError: parserState.error });
      } else {
        this.handlers['pdfParser_dataReady']?.({});
      }
    }

    getRawTextContent() {
      return parserState.text;
    }
  }
  return { default: MockPDFParser };
});

import { POST } from './route';

function groqStream(chunks: string[]) {
  return (async function* () {
    for (const content of chunks) {
      yield { choices: [{ delta: { content } }] };
    }
  })();
}

function makeRequest(options: { pdf?: File; jobDescription?: string } = {}) {
  const formData = new FormData();
  if (options.pdf) {
    formData.append('pdf', options.pdf);
  }
  if (options.jobDescription) {
    formData.append('jobDescription', options.jobDescription);
  }
  return new Request('http://localhost/api/roast', {
    method: 'POST',
    body: formData,
  });
}

const pdfFile = () =>
  new File(['%PDF-1.4 fake pdf bytes'], 'resume.pdf', { type: 'application/pdf' });

describe('POST /api/roast', () => {
  beforeEach(() => {
    parserState.text = 'John Doe\nSoftware Engineer';
    parserState.error = null;
    mockCreate.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 when no PDF file is provided', async () => {
    const res = await POST(makeRequest());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'PDF file is required.' });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('streams the Groq completion back as plain text', async () => {
    mockCreate.mockResolvedValue(groqStream(['**The Brutal', ' Truth**', ': weak resume']));

    const res = await POST(makeRequest({ pdf: pdfFile() }));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('Cache-Control')).toBe('no-cache, no-transform');
    expect(await res.text()).toBe('**The Brutal Truth**: weak resume');
  });

  it('skips empty chunks in the stream', async () => {
    mockCreate.mockResolvedValue(
      groqStream(['Hello', '', ' world'])
    );

    const res = await POST(makeRequest({ pdf: pdfFile() }));

    expect(await res.text()).toBe('Hello world');
  });

  it('includes the extracted resume text in the user prompt', async () => {
    parserState.text = 'Jane Smith - Staff Engineer';
    mockCreate.mockResolvedValue(groqStream(['ok']));

    await POST(makeRequest({ pdf: pdfFile() }));

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const args = mockCreate.mock.calls[0][0];
    expect(args.model).toBe('qwen/qwen3.6-27b');
    expect(args.stream).toBe(true);
    expect(args.messages[0].role).toBe('system');
    expect(args.messages[1].role).toBe('user');
    expect(args.messages[1].content).toContain('Jane Smith - Staff Engineer');
    expect(args.messages[1].content).not.toContain('Job Description:');
  });

  it('includes the job description in the user prompt when provided', async () => {
    mockCreate.mockResolvedValue(groqStream(['ok']));

    await POST(makeRequest({ pdf: pdfFile(), jobDescription: 'Senior React Developer' }));

    const args = mockCreate.mock.calls[0][0];
    expect(args.messages[1].content).toContain('Job Description:\nSenior React Developer');
  });

  it('returns 500 when PDF parsing fails', async () => {
    parserState.error = 'Invalid PDF structure';

    const res = await POST(makeRequest({ pdf: pdfFile() }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error.' });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns 500 when the Groq request fails', async () => {
    mockCreate.mockRejectedValue(new Error('Groq unavailable'));

    const res = await POST(makeRequest({ pdf: pdfFile() }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error.' });
  });

  it('propagates mid-stream errors to the response stream', async () => {
    mockCreate.mockResolvedValue(
      (async function* () {
        yield { choices: [{ delta: { content: 'partial' } }] };
        throw new Error('stream interrupted');
      })()
    );

    const res = await POST(makeRequest({ pdf: pdfFile() }));

    expect(res.status).toBe(200);
    await expect(res.text()).rejects.toThrow('stream interrupted');
  });
});
