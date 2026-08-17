import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from './page';

const pdfFile = (name = 'resume.pdf') =>
  new File(['%PDF-1.4'], name, { type: 'application/pdf' });

const textFile = () => new File(['hello'], 'notes.txt', { type: 'text/plain' });

function streamingResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () =>
          i < chunks.length
            ? { value: encoder.encode(chunks[i++]), done: false }
            : { value: undefined, done: true },
      }),
    },
  };
}

function getFileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!input) throw new Error('file input not found');
  return input as HTMLInputElement;
}

describe('Home page', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the header and disabled submit button', () => {
    render(<Home />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ResumeRoast');
    expect(screen.getByText('Drag & Drop your resume here')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Roast My Resume' })).toBeDisabled();
  });

  it('accepts a PDF selected via the file input', async () => {
    render(<Home />);

    await userEvent.upload(getFileInput(), pdfFile('my-cv.pdf'));

    expect(screen.getByText('my-cv.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Roast My Resume' })).toBeEnabled();
  });

  it('rejects non-PDF files selected via the file input', async () => {
    render(<Home />);

    fireEvent.change(getFileInput(), { target: { files: [textFile()] } });

    expect(screen.getByText('Please upload a PDF file.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Roast My Resume' })).toBeDisabled();
  });

  it('accepts a PDF via drag and drop', () => {
    render(<Home />);

    const dropzone = screen.getByText('Drag & Drop your resume here').parentElement!;
    fireEvent.drop(dropzone, { dataTransfer: { files: [pdfFile('dropped.pdf')] } });

    expect(screen.getByText('dropped.pdf')).toBeInTheDocument();
  });

  it('rejects non-PDF files dropped on the dropzone', () => {
    render(<Home />);

    const dropzone = screen.getByText('Drag & Drop your resume here').parentElement!;
    fireEvent.drop(dropzone, { dataTransfer: { files: [textFile()] } });

    expect(screen.getByText('Please upload a PDF file.')).toBeInTheDocument();
  });

  it('toggles the active style on drag over and drag leave', () => {
    render(<Home />);

    const dropzone = screen.getByText('Drag & Drop your resume here').parentElement!;

    fireEvent.dragOver(dropzone);
    expect(dropzone.className).toContain('dropzoneActive');

    fireEvent.dragLeave(dropzone);
    expect(dropzone.className).not.toContain('dropzoneActive');
  });

  it('removes the selected file when the remove button is clicked', async () => {
    render(<Home />);

    await userEvent.upload(getFileInput(), pdfFile());
    expect(screen.getByText('resume.pdf')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove file' }));

    expect(screen.queryByText('resume.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('Drag & Drop your resume here')).toBeInTheDocument();
  });

  it('submits the resume and renders the streamed roast', async () => {
    vi.mocked(fetch).mockResolvedValue(
      streamingResponse(['Your resume ', 'needs work.']) as unknown as Response
    );

    render(<Home />);

    await userEvent.upload(getFileInput(), pdfFile());
    await userEvent.type(
      screen.getByLabelText('Job Description (Optional)'),
      'Senior Engineer'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Roast My Resume' }));

    await waitFor(() => {
      expect(screen.getByText('Your resume needs work.')).toBeInTheDocument();
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/api/roast');
    const body = (init as RequestInit).body as FormData;
    expect((body.get('pdf') as File).name).toBe('resume.pdf');
    expect(body.get('jobDescription')).toBe('Senior Engineer');
  });

  it('omits the job description from the form data when empty', async () => {
    vi.mocked(fetch).mockResolvedValue(
      streamingResponse(['ok']) as unknown as Response
    );

    render(<Home />);

    await userEvent.upload(getFileInput(), pdfFile());
    await userEvent.click(screen.getByRole('button', { name: 'Roast My Resume' }));

    await waitFor(() => {
      expect(screen.getByText('ok')).toBeInTheDocument();
    });

    const body = (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as FormData;
    expect(body.get('jobDescription')).toBeNull();
  });

  it('shows an error when the API responds with a failure status', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    render(<Home />);

    await userEvent.upload(getFileInput(), pdfFile());
    await userEvent.click(screen.getByRole('button', { name: 'Roast My Resume' }));

    await waitFor(() => {
      expect(
        screen.getByText('Error: 500 Internal Server Error')
      ).toBeInTheDocument();
    });
  });

  it('shows an error when the fetch itself rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fetch).mockRejectedValue(new Error('Network down'));

    render(<Home />);

    await userEvent.upload(getFileInput(), pdfFile());
    await userEvent.click(screen.getByRole('button', { name: 'Roast My Resume' }));

    await waitFor(() => {
      expect(screen.getByText('Network down')).toBeInTheDocument();
    });
  });

  it('shows a loading state while the roast is streaming', async () => {
    let resolveFetch: (value: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      })
    );

    render(<Home />);

    await userEvent.upload(getFileInput(), pdfFile());
    await userEvent.click(screen.getByRole('button', { name: 'Roast My Resume' }));

    expect(screen.getByRole('button', { name: 'Roasting...' })).toBeDisabled();
    expect(screen.getByText('Analyzing your resume...')).toBeInTheDocument();

    resolveFetch!(streamingResponse(['Done.']) as unknown as Response);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Roast My Resume' })).toBeEnabled();
    });
    expect(screen.getByText('Done.')).toBeInTheDocument();
  });
});
