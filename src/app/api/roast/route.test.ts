import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const createMock = vi.hoisted(() => vi.fn());

vi.mock('groq-sdk', () => ({
  default: class {
    chat = { completions: { create: createMock } };
  },
}));

let parseBehavior: { error?: unknown; text?: string } = {};

vi.mock('pdf2json', () => ({
  default: class {
    private handlers: Record<string, (data?: unknown) => void> = {};
    on(event: string, handler: (data?: unknown) => void) {
      this.handlers[event] = handler;
    }
    parseBuffer() {
      if (parseBehavior.error !== undefined) {
        this.handlers['pdfParser_dataError']?.({ parserError: parseBehavior.error });
      } else {
        this.handlers['pdfParser_dataReady']?.({});
      }
    }
    getRawTextContent() {
      return parseBehavior.text ?? '';
    }
  },
}));

import { POST } from './route';

function groqStream(contents: (string | undefined)[]) {
  return (async function* () {
    for (const content of contents) {
      yield { choices: [{ delta: { content } }] };
    }
  })();
}

function buildRequest(options: { pdf?: boolean; jobDescription?: string } = {}) {
  const { pdf = true, jobDescription } = options;
  const formData = new FormData();
  if (pdf) {
    formData.append(
      'pdf',
      new File(['%PDF-1.4 fake'], 'resume.pdf', { type: 'application/pdf' })
    );
  }
  if (jobDescription) {
    formData.append('jobDescription', jobDescription);
  }
  return new Request('http://localhost/api/roast', { method: 'POST', body: formData });
}

describe('POST /api/roast', () => {
  beforeEach(() => {
    parseBehavior = { text: 'John Doe\nSenior Engineer at Acme' };
    createMock.mockReset();
    createMock.mockResolvedValue(groqStream(['The ', 'Roast']));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 when no PDF file is provided', async () => {
    const res = await POST(buildRequest({ pdf: false }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'PDF file is required.' });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('returns 500 when PDF parsing fails', async () => {
    parseBehavior = { error: new Error('corrupt pdf') };

    const res = await POST(buildRequest());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error.' });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('returns 500 when the Groq request fails', async () => {
    createMock.mockRejectedValue(new Error('groq unavailable'));

    const res = await POST(buildRequest());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error.' });
  });

  it('streams Groq output as plain text with no-cache headers', async () => {
    createMock.mockResolvedValue(groqStream(['Hello', '', ' world', undefined, '!']));

    const res = await POST(buildRequest());

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('Cache-Control')).toBe('no-cache, no-transform');
    expect(await res.text()).toBe('Hello world!');
  });

  it('sends the extracted resume text to Groq without a JD section by default', async () => {
    await (await POST(buildRequest())).text();

    expect(createMock).toHaveBeenCalledTimes(1);
    const { messages, model, stream, reasoning_format } = createMock.mock.calls[0][0];
    expect(model).toBe('qwen/qwen3.6-27b');
    expect(stream).toBe(true);
    expect(reasoning_format).toBe('hidden');
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain('John Doe\nSenior Engineer at Acme');
    expect(messages[1].content).not.toContain('Job Description:');
  });

  it('includes the job description in the prompt when provided', async () => {
    await (await POST(buildRequest({ jobDescription: 'Staff Engineer, Kubernetes' }))).text();

    const { messages } = createMock.mock.calls[0][0];
    expect(messages[1].content).toContain('Job Description:\nStaff Engineer, Kubernetes');
  });
});
